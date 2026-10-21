
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireAdmin } from '../_lib/admin.js';
import { createB2Storage } from '../_lib/storage.js';
import { MAX_PDF_BYTES, PDF_PART_SIZE } from '../_lib/upload-validation.js';


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { key, uploadId, partNumber } = req.body ?? {};

  if (
    typeof key !== 'string' ||
    !key.startsWith(`resources/${admin.userId}/`) ||
    typeof uploadId !== 'string' ||
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > 40
  ) {
    return res.status(400).json({ error: 'Invalid upload part request' });
  }

  const { data: session, error: sessionError } = await admin.supabase
    .from('resource_upload_sessions')
    .select('upload_id, object_key, expected_size, upload_kind, user_id')
    .eq('upload_id', uploadId)
    .eq('object_key', key)
    .eq('user_id', admin.userId)
    .eq('upload_kind', 'pdf')
    .maybeSingle();

  if (sessionError) {
    console.error('Upload session lookup failed:', sessionError.message);
    return res.status(500).json({ error: 'Could not verify upload session' });
  }

  if (!session) {
    return res.status(404).json({ error: 'Upload session not found' });
  }

  const totalParts = Math.ceil(session.expected_size / PDF_PART_SIZE);

  if (partNumber > totalParts || session.expected_size > MAX_PDF_BYTES) {
    return res.status(400).json({ error: 'Invalid upload part number' });
  }

  let storage: ReturnType<typeof createB2Storage>;
  try {
    storage = createB2Storage();
  } catch (error) {
    console.error('Upload signing storage configuration is unavailable:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ error: 'Storage is not configured for uploads.' });
  }
  const { client, bucket } = storage;

  try {
    const url = await getSignedUrl(
      client,
      new UploadPartCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 300 },
    );

    return res.status(200).json({ url });
  } catch (error) {
    console.error('Could not sign upload part:', error);
    return res.status(502).json({ error: 'Could not prepare upload part' });
  } finally {
    client.destroy();
  }
}
