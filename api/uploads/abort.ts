
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { requireAdmin } from '../_lib/admin';
import { createB2Storage } from '../_lib/storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { key, uploadId } = req.body ?? {};

  if (
    typeof key !== 'string' ||
    !key.startsWith(`resources/${admin.userId}/`) ||
    typeof uploadId !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid cancellation request' });
  }

  const { data: session, error: sessionError } = await admin.supabase
    .from('resource_upload_sessions')
    .select('upload_id, object_key, upload_kind, user_id')
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

  let storage: ReturnType<typeof createB2Storage>;
  try {
    storage = createB2Storage();
  } catch {
    return res.status(500).json({ error: 'Storage configuration missing' });
  }
  const { client, bucket } = storage;

  try {
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );

    const { error: deleteError } = await admin.supabase
      .from('resource_upload_sessions')
      .delete()
      .eq('upload_id', uploadId)
      .eq('user_id', admin.userId);

    if (deleteError) {
      console.error('Could not remove aborted session:', deleteError.message);
      return res.status(502).json({
        error: 'The upload was canceled, but its session could not be cleaned up. Retry the cleanup.',
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Could not abort upload:', error);
    return res.status(502).json({ error: 'Could not cancel the upload' });
  } finally {
    client.destroy();
  }
}
