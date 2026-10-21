import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '../_lib/admin.js';
import { createB2Storage, isMissingStorageObject } from '../_lib/storage.js';
import { validateThumbnailUpload } from '../_lib/upload-validation.js';

const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { contentType, size, key: retryKey } = req.body ?? {};
  const validationError = validateThumbnailUpload({ contentType, size });
  if (validationError) return res.status(400).json({ error: validationError });

  const extension = IMAGE_TYPES[contentType as keyof typeof IMAGE_TYPES];
  const keyPattern = new RegExp(
    `^resources/${admin.userId}/thumbnails/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.${extension}$`,
    'i',
  );

  const key = typeof retryKey === 'string'
    ? retryKey
    : `resources/${admin.userId}/thumbnails/${randomUUID()}.${extension}`;

  if (!keyPattern.test(key) || key.includes('..') || key.includes('\\')) {
    return res.status(400).json({ error: 'Invalid thumbnail upload reference.' });
  }

  // A retry may reuse only an unreferenced key previously issued under this
  // administrator's private thumbnail prefix. It cannot replace a saved image.
  if (retryKey) {
    const { data: existingReference, error: referenceError } = await admin.supabase
      .from('resources')
      .select('id')
      .eq('thumbnail_path', key)
      .maybeSingle();

    if (referenceError) {
      console.error('Could not verify thumbnail retry key:', referenceError.message);
      return res.status(500).json({ error: 'Could not verify the thumbnail retry.' });
    }

    if (existingReference) {
      return res.status(409).json({ error: 'This thumbnail is already attached to a resource.' });
    }
  }

  let storage: ReturnType<typeof createB2Storage>;
  try {
    storage = createB2Storage();
  } catch (error) {
    console.error('Thumbnail storage configuration is unavailable:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ error: 'Storage is not configured for thumbnails.' });
  }

  const { client, bucket } = storage;
  try {
    if (retryKey) {
      try {
        const existingObject = await client.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (existingObject.ContentLength != null && existingObject.ContentLength > 0) {
          return res.status(200).json({ exists: true, key });
        }
      } catch (error) {
        if (!isMissingStorageObject(error)) throw error;
      }
    }

    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 300 },
    );

    return res.status(200).json({ url, key, exists: false });
  } catch (error) {
    console.error('Could not prepare thumbnail upload:', error instanceof Error ? error.name : 'Unknown error');
    return res.status(502).json({ error: 'Could not prepare the thumbnail upload.' });
  } finally {
    client.destroy();
  }
}
