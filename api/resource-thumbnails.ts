import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createB2Storage } from './_lib/storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const URL_AGE_SECONDS = 300;
const MAX_BATCH_SIZE = 40;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Resource access is not configured.' });
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const resourceIds = body?.resourceIds;
  if (!Array.isArray(resourceIds) || resourceIds.length < 1 || resourceIds.length > MAX_BATCH_SIZE ||
      !resourceIds.every((id) => typeof id === 'string' && UUID.test(id))) {
    return res.status(400).json({ error: `Provide between 1 and ${MAX_BATCH_SIZE} valid resource IDs.` });
  }

  const authorization = req.headers.authorization;
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });

  if (token) {
    const { error } = await supabase.auth.getUser(token);
    if (error) return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
  }

  const { data: resources, error } = await supabase
    .from('resources')
    .select('id, thumbnail_path')
    .in('id', [...new Set(resourceIds as string[])])
    .eq('is_published', true);
  if (error) {
    console.error('Thumbnail batch lookup failed:', error.message);
    return res.status(500).json({ error: 'Could not prepare resource covers.' });
  }

  const available = (resources ?? []).filter((resource) =>
    typeof resource.thumbnail_path === 'string' &&
    resource.thumbnail_path.startsWith('resources/') &&
    !resource.thumbnail_path.includes('..') &&
    !resource.thumbnail_path.includes('\\') &&
    !resource.thumbnail_path.startsWith('/'));
  if (available.length === 0) return res.status(200).json({ links: {} });

  let storage: ReturnType<typeof createB2Storage>;
  try {
    storage = createB2Storage();
  } catch {
    return res.status(500).json({ error: 'Storage is not configured for resource covers.' });
  }

  try {
    const entries = await Promise.all(available.map(async (resource) => {
      const url = await getSignedUrl(
        storage.client,
        new GetObjectCommand({
          Bucket: storage.bucket,
          Key: resource.thumbnail_path,
          ResponseContentDisposition: 'inline',
        }),
        { expiresIn: URL_AGE_SECONDS },
      );
      return [resource.id, url] as const;
    }));
    return res.status(200).json({ links: Object.fromEntries(entries), expiresIn: URL_AGE_SECONDS });
  } catch (cause) {
    console.error('Thumbnail batch signing failed:', cause instanceof Error ? cause.name : 'Unknown error');
    return res.status(502).json({ error: 'Could not prepare resource covers.' });
  } finally {
    storage.client.destroy();
  }
}
