
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import {
  AbortMultipartUploadCommand,
  CreateMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { requireAdmin } from '../_lib/admin';
import { createB2Storage } from '../_lib/storage';
import { PDF_PART_SIZE, validatePdfUpload } from '../_lib/upload-validation';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { filename, contentType, size } = req.body ?? {};
  const validationError = validatePdfUpload({ filename, contentType, size });
  if (validationError) {
    return res.status(400).json({
      error: validationError,
    });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `resources/${admin.userId}/${randomUUID()}/${safeName}`;

  let uploadId: string | undefined;
  let storage: ReturnType<typeof createB2Storage>;
  try {
    storage = createB2Storage();
  } catch (error) {
    console.error('Multipart storage configuration is unavailable:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ error: 'Storage is not configured for uploads.' });
  }
  const { bucket, client } = storage;

  try {
    const created = await client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: 'application/pdf',
        Metadata: { uploadedby: admin.userId },
      }),
    );

    uploadId = created.UploadId;

    if (!uploadId) {
      return res.status(502).json({ error: 'Could not start upload' });
    }

    const { error: sessionError } = await admin.supabase
      .from('resource_upload_sessions')
      .insert({
        upload_id: uploadId,
        object_key: key,
        user_id: admin.userId,
        expected_size: size,
        upload_kind: 'pdf',
      });

    if (sessionError) {
      console.error('Could not record upload session:', sessionError.message);

      try {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
          }),
        );
      } catch (abortError) {
        console.error('Could not clean up untracked upload:', abortError);
      }

      return res.status(502).json({
        error: 'Could not register the upload. Please try again.',
      });
    }

    return res.status(200).json({
      uploadId,
      key,
      bucket,
      partSize: PDF_PART_SIZE,
    });
  } catch (error) {
    console.error('Multipart upload initialization failed:', error);
    return res.status(502).json({ error: 'Could not start file upload' });
  } finally {
    client.destroy();
  }
}
