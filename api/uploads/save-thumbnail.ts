import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { requireAdmin } from '../_lib/admin';
import type { AdminContext } from '../_lib/admin';
import { createB2Storage, isMissingStorageObject } from '../_lib/storage';
import {
  MAX_THUMBNAIL_BYTES,
  matchesThumbnailSignature,
  validateThumbnailUpload,
} from '../_lib/upload-validation';

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

async function removeIfUnreferenced(
  admin: AdminContext,
  client: ReturnType<typeof createB2Storage>['client'],
  bucket: string,
  key: string,
): Promise<boolean> {
  if (!admin) return false;
  const { data: reference, error } = await admin.supabase
    .from('resources')
    .select('id')
    .eq('thumbnail_path', key)
    .maybeSingle();

  if (error || reference) return false;

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (deleteError) {
    if (isMissingStorageObject(deleteError)) return true;
    console.error('Could not clean up unused thumbnail:', deleteError instanceof Error ? deleteError.name : 'Unknown error');
    return false;
  }
}

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

  const { resourceId, key, contentType, size } = req.body ?? {};
  const validationError = validateThumbnailUpload({ contentType, size });
  const extension = typeof key === 'string' ? key.split('.').pop()?.toLowerCase() : '';
  const expectedContentType = extension ? EXTENSION_TYPES[extension] : undefined;

  if (
    validationError ||
    typeof resourceId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resourceId) ||
    typeof key !== 'string' ||
    !new RegExp(`^resources/${admin.userId}/thumbnails/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(jpg|png|webp)$`, 'i').test(key) ||
    key.includes('..') ||
    key.includes('\\') ||
    !expectedContentType ||
    expectedContentType !== contentType
  ) {
    return res.status(400).json({
      error: validationError ?? 'Invalid resource or thumbnail reference.',
    });
  }

  const { data: resource, error: resourceError } = await admin.supabase
    .from('resources')
    .select('id, created_by, thumbnail_path')
    .eq('id', resourceId)
    .eq('created_by', admin.userId)
    .maybeSingle();

  if (resourceError) {
    console.error('Resource ownership check failed:', resourceError.message);
    return res.status(500).json({ error: 'Could not verify resource ownership.' });
  }

  if (!resource) {
    return res.status(404).json({ error: 'Resource not found or not owned by this administrator.' });
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
    let object;
    try {
      object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (error) {
      if (isMissingStorageObject(error)) {
        return res.status(404).json({ error: 'The uploaded thumbnail is missing from storage. Retry the upload.' });
      }
      throw error;
    }

    if (
      !Number.isSafeInteger(size) ||
      object.ContentLength !== Number(size) ||
      Number(object.ContentLength) <= 0 ||
      Number(object.ContentLength) > MAX_THUMBNAIL_BYTES ||
      object.ContentType !== contentType
    ) {
      await removeIfUnreferenced(admin, client, bucket, key);
      return res.status(400).json({ error: 'Thumbnail size or content type does not match the upload.' });
    }

    const downloaded = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await downloaded.Body?.transformToByteArray();
    if (!bytes || !matchesThumbnailSignature(contentType, bytes)) {
      await removeIfUnreferenced(admin, client, bucket, key);
      return res.status(400).json({ error: 'The uploaded file is not a valid JPEG, PNG, or WebP image.' });
    }

    if (resource.thumbnail_path === key) {
      return res.status(200).json({ success: true, alreadySaved: true });
    }

    const { data: updated, error: updateError } = await admin.supabase
      .from('resources')
      .update({ thumbnail_path: key })
      .eq('id', resourceId)
      .eq('created_by', admin.userId)
      .select('id, thumbnail_path')
      .maybeSingle();

    if (!updateError && updated?.thumbnail_path === key) {
      return res.status(200).json({ success: true });
    }

    if (updateError) {
      console.error('Could not save thumbnail path:', updateError.message);
    }

    // A network error can occur after Postgres committed. Re-read before any
    // compensating object delete so a referenced thumbnail is never removed.
    const { data: confirmed, error: confirmError } = await admin.supabase
      .from('resources')
      .select('thumbnail_path')
      .eq('id', resourceId)
      .eq('created_by', admin.userId)
      .maybeSingle();

    if (!confirmError && confirmed?.thumbnail_path === key) {
      return res.status(200).json({ success: true, alreadySaved: true });
    }

    if (!confirmError) {
      const cleaned = await removeIfUnreferenced(admin, client, bucket, key);
      return res.status(502).json({
        error: cleaned
          ? 'Thumbnail metadata could not be saved. The unused upload was cleaned up; retry the thumbnail.'
          : 'Thumbnail metadata could not be saved, and storage cleanup needs a retry.',
      });
    }

    return res.status(502).json({
      error: 'Thumbnail save could not be confirmed. Retry to safely verify the uploaded image.',
    });
  } catch (error) {
    console.error('Could not verify or save thumbnail:', error instanceof Error ? error.name : 'Unknown error');
    return res.status(502).json({ error: 'Could not verify or save the thumbnail. Retry the thumbnail operation.' });
  } finally {
    client.destroy();
  }
}
