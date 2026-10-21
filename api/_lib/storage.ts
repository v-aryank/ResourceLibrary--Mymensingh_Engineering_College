import { S3Client } from '@aws-sdk/client-s3';

export type B2Storage = {
  client: S3Client;
  bucket: string;
};

export function createB2Storage(): B2Storage {
  const endpointValue = process.env.B2_ENDPOINT;
  const bucket = process.env.B2_BUCKET_NAME;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;

  if (!endpointValue || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Storage configuration is incomplete.');
  }

  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    throw new Error('Storage endpoint configuration is invalid.');
  }

  const match = endpoint.hostname.match(/^s3[.-]([a-z0-9-]+)\.backblazeb2\.com$/i);
  if (endpoint.protocol !== 'https:' || !match || endpoint.pathname !== '/') {
    throw new Error('Storage endpoint configuration is invalid.');
  }

  return {
    bucket,
    client: new S3Client({
      endpoint: endpoint.origin,
      region: match[1],
      forcePathStyle: true,
      // Backblaze B2 does not support the SDK's default flexible checksums.
      // Without this, presigned UploadPart URLs embed a CRC32 of an empty body.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

export function isMissingStorageObject(error: unknown): boolean {
  const value = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    value?.name === 'NotFound' ||
    value?.Code === 'NoSuchKey' ||
    value?.code === 'NoSuchKey' ||
    value?.$metadata?.httpStatusCode === 404
  );
}
