import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { requireAdmin } from '../_lib/admin';
import { createB2Storage, isMissingStorageObject } from '../_lib/storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validStoredKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('resources/') &&
    !value.startsWith('/') && !value.includes('..') && !value.includes('\\');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;
  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    return res.status(400).json({ error: 'Invalid request body.' });
  }
  const resourceId = body?.resourceId;
  if (typeof resourceId !== 'string' || !UUID.test(resourceId)) {
    return res.status(400).json({ error: 'A valid resource ID is required.' });
  }

  let { data: job, error: jobReadError } = await admin.supabase
    .from('resource_deletion_jobs')
    .select('resource_id, requested_by, pdf_path, thumbnail_path, stage')
    .eq('resource_id', resourceId)
    .maybeSingle();
  if (jobReadError) {
    console.error('Deletion job lookup failed:', jobReadError.message);
    const errorCode = (jobReadError as { code?: string }).code;
    if (errorCode === '42P01' || errorCode === 'PGRST205' || errorCode === 'PGRST204') {
      return res.status(503).json({ error: 'The deletion workflow table is unavailable. Apply the resource deletion migration in Supabase, then retry.' });
    }
    return res.status(503).json({ error: 'Could not read the deletion workflow. Check Supabase availability and this administrator’s table permissions, then retry.' });
  }

  if (!job) {
    const { data: resource, error } = await admin.supabase
      .from('resources')
      .select('id, title, file_path, thumbnail_path')
      .eq('id', resourceId)
      .maybeSingle();
    if (error) {
      console.error('Resource delete lookup failed:', error.message);
      return res.status(500).json({ error: 'Could not verify the resource.' });
    }
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });
    if ((resource.file_path != null && !validStoredKey(resource.file_path)) ||
        (resource.thumbnail_path != null && !validStoredKey(resource.thumbnail_path))) {
      return res.status(409).json({ error: 'The resource contains an invalid storage reference; deletion was stopped for safety.' });
    }

    const { data: created, error: insertError } = await admin.supabase
      .from('resource_deletion_jobs')
      .insert({
        resource_id: resourceId,
        requested_by: admin.userId,
        pdf_path: resource.file_path,
        thumbnail_path: resource.thumbnail_path,
        stage: 'requested',
      })
      .select('resource_id, requested_by, pdf_path, thumbnail_path, stage')
      .maybeSingle();
    if (insertError || !created) {
      console.error('Deletion job creation failed:', insertError?.message ?? 'No row returned');
      return res.status(503).json({ error: 'Could not start the safe deletion workflow. Retry the request.' });
    }
    job = created;
  }

  if (job.requested_by !== admin.userId) {
    return res.status(403).json({ error: 'Only the administrator who started this deletion can retry it.' });
  }
  if ((job.pdf_path != null && !validStoredKey(job.pdf_path)) ||
      (job.thumbnail_path != null && !validStoredKey(job.thumbnail_path))) {
    return res.status(409).json({ error: 'The saved deletion request contains an invalid storage reference.' });
  }

  if (job.stage === 'requested') {
    const { data: cleared, error } = await admin.supabase
      .from('resources')
      .update({ is_published: false, file_path: null, thumbnail_path: null })
      .eq('id', resourceId)
      .select('id')
      .maybeSingle();
    if (error || !cleared) {
      console.error('Could not clear resource references before deletion:', error?.message ?? 'No row updated');
      return res.status(409).json({ error: 'Resource references could not be safely cleared. No storage objects were deleted; retry after checking database permissions.' });
    }

    const { error: stageError } = await admin.supabase
      .from('resource_deletion_jobs')
      .update({ stage: 'references_cleared', updated_at: new Date().toISOString() })
      .eq('resource_id', resourceId);
    if (stageError) {
      console.error('Could not advance deletion state:', stageError.message);
      return res.status(502).json({ error: 'Resource is unpublished and its file references were cleared. Retry deletion to continue safely.' });
    }
    job.stage = 'references_cleared';
  }

  if (job.stage === 'references_cleared') {
    let storage: ReturnType<typeof createB2Storage>;
    try {
      storage = createB2Storage();
    } catch {
      return res.status(500).json({ error: 'Storage is not configured; the resource is unpublished and the deletion can be retried.' });
    }
    try {
      for (const key of [job.thumbnail_path, job.pdf_path]) {
        if (!key) continue;
        try {
          await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }));
        } catch (error) {
          if (!isMissingStorageObject(error)) throw error;
        }
      }
    } catch (error) {
      console.error('Storage deletion needs retry:', error instanceof Error ? error.name : 'Unknown error');
      return res.status(502).json({ error: 'Some storage deletion work may remain. The resource is unpublished and unreferenced; retry to finish safely.' });
    } finally {
      storage.client.destroy();
    }

    const { error: stageError } = await admin.supabase
      .from('resource_deletion_jobs')
      .update({ stage: 'storage_deleted', updated_at: new Date().toISOString() })
      .eq('resource_id', resourceId);
    if (stageError) {
      console.error('Could not record completed storage deletion:', stageError.message);
      return res.status(502).json({ error: 'Storage objects were removed, but deletion state could not be saved. Retry to complete the database cleanup.' });
    }
    job.stage = 'storage_deleted';
  }

  if (job.stage === 'storage_deleted') {
    const { error: periodsError } = await admin.supabase
      .from('resource_academic_periods')
      .delete()
      .eq('resource_id', resourceId);
    if (periodsError) {
      console.error('Could not remove academic periods:', periodsError.message);
      return res.status(502).json({ error: 'Files were removed. Resource metadata cleanup remains; retry deletion to finish.' });
    }

    const { data: deleted, error: resourceError } = await admin.supabase
      .from('resources')
      .delete()
      .eq('id', resourceId);
    if (resourceError) {
      console.error('Could not remove resource metadata:', resourceError.message);
      return res.status(502).json({ error: 'Files were removed. Resource metadata cleanup remains; retry deletion to finish.' });
    }

    if (!deleted) {
      // A successful REST response without selected rows does not prove that
      // RLS allowed a delete. Confirm absence before removing the retry record.
      const { data: remaining, error: verifyError } = await admin.supabase
        .from('resources')
        .select('id')
        .eq('id', resourceId)
        .maybeSingle();
      if (verifyError || remaining) {
        console.error('Resource delete could not be confirmed:', verifyError?.message ?? 'Resource still exists');
        return res.status(502).json({ error: 'Files were removed, but database deletion could not be confirmed. Retry after checking row-level security.' });
      }
    }

    const { error: jobError } = await admin.supabase
      .from('resource_deletion_jobs')
      .delete()
      .eq('resource_id', resourceId);
    if (jobError) {
      console.error('Could not remove completed deletion state:', jobError.message);
      return res.status(200).json({ success: true, cleanupPending: true });
    }
  }

  return res.status(200).json({ success: true });
}
