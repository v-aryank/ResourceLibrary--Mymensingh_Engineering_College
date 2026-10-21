
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { requireAdmin } from './_lib/admin';
import { createB2Storage } from './_lib/storage';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');

    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  let storage: ReturnType<typeof createB2Storage>;
  try {
    storage = createB2Storage();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error
        ? error.message
        : 'Storage configuration is invalid',
    });
  }
  const { client, bucket } = storage;

  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: bucket,
      }),
    );

    return res.status(200).json({
      ok: true,
      message: 'Private storage connection successful',
    });
  } catch (error) {
    const details = error as {
      name?: string;
      message?: string;
      Code?: string;
      code?: string;
      $metadata?: {
        httpStatusCode?: number;
        requestId?: string;
      };
      $response?: {
        statusCode?: number;
      };
    };

    console.error('B2 diagnostic failed:', {
      name: details.name,
      code: details.Code ?? details.code,
      statusCode: details.$metadata?.httpStatusCode ?? details.$response?.statusCode,
      requestId: details.$metadata?.requestId,
    });

    return res.status(502).json({
      ok: false,
      error: 'Could not verify the storage connection',
    });
  } finally {
    client.destroy();
  }
}
