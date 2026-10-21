
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createB2Storage } from './_lib/storage.js';

const MAX_URL_AGE_SECONDS = 300;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const bucket = process.env.B2_BUCKET_NAME;

  if (!supabaseUrl || !supabaseKey || !bucket) {
    return res.status(500).json({
      error: 'Resource storage is not configured.',
    });
  }

  const authorization = req.headers.authorization;
  const token =
    authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    ...(token
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      : {}),
  });

  try {
    if (token) {
      const { error: authError } = await supabase.auth.getUser(token);

      if (authError) {
        return res.status(401).json({
          error: 'Your session is invalid or expired. Please sign in again.',
        });
      }
    }

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body;

    const resourceId = body?.resourceId;
    const kind = body?.kind;
    const download = body?.download === true;

    if (
      typeof resourceId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        resourceId,
      ) ||
      (kind !== 'pdf' && kind !== 'thumbnail')
    ) {
      return res.status(400).json({
        error: 'A valid resource ID and file type are required.',
      });
    }

    if (
      (body?.download !== undefined && typeof body.download !== 'boolean') ||
      (kind === 'thumbnail' && download)
    ) {
      return res.status(400).json({
        error: 'Invalid resource file disposition.',
      });
    }

    // Supabase RLS determines which resources this caller can access.
    const { data: resource, error: resourceError } = await supabase
      .from('resources')
      .select('id, file_path, thumbnail_path')
      .eq('id', resourceId)
      .maybeSingle();

    if (resourceError) {
      console.error('Resource lookup failed:', resourceError.message);
      return res.status(500).json({
        error: 'Unable to look up this resource.',
      });
    }

    if (!resource) {
      return res.status(404).json({
        error: 'Resource not found or unavailable.',
      });
    }

    const objectKey =
      kind === 'pdf' ? resource.file_path : resource.thumbnail_path;

    if (
      typeof objectKey !== 'string' ||
      !objectKey.startsWith('resources/') ||
      objectKey.includes('..') ||
      objectKey.startsWith('/') ||
      objectKey.includes('\\')
    ) {
      return res.status(404).json({
        error: 'This resource does not have an available file.',
      });
    }

    const storage = createB2Storage();

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ...(kind === 'pdf'
          ? {
              ResponseContentType: 'application/pdf',
              ResponseContentDisposition: download ? 'attachment' : 'inline',
            }
          : {
              ResponseContentDisposition: 'inline',
            }),
      });

      try {
        await storage.client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
      } catch (error) {
        const details = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
        if (
          details.name === 'NotFound' ||
          details.Code === 'NoSuchKey' ||
          details.$metadata?.httpStatusCode === 404
        ) {
          return res.status(404).json({ error: 'The stored resource file is missing.' });
        }
        console.error('Storage object check failed:', details.name ?? 'Unknown storage error');
        return res.status(502).json({ error: 'Could not verify the resource file in storage.' });
      }

      const url = await getSignedUrl(storage.client, command, {
        expiresIn: MAX_URL_AGE_SECONDS,
      });

      return res.status(200).json({
        url,
        expiresIn: MAX_URL_AGE_SECONDS,
      });
    } finally {
      storage.client.destroy();
    }
  } catch (error) {
    console.error(
      'Resource URL generation failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );

    return res.status(500).json({
      error: 'Unable to generate a temporary file link.',
    });
  }
}
