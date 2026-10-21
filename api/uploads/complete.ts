import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { requireAdmin } from '../_lib/admin.js';
import { createB2Storage, isMissingStorageObject } from '../_lib/storage.js';
import { MAX_PDF_BYTES, PDF_PART_SIZE } from '../_lib/upload-validation.js';


const VALID_CATEGORIES = [
  'books',
  'lab-reports',
  'lab-guides',
  'lecture-notes',
  'course-outlines',
  'other',
] as const;

const VALID_DEPARTMENTS = ['EEE', 'CSE', 'CE'] as const;

type UploadedPart = {
  ETag: string;
  PartNumber: number;
};

type AcademicPeriod = {
  year: number;
  semester: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUploadedPart(value: unknown): value is UploadedPart {
  if (!isRecord(value)) return false;

  return (
    typeof value.ETag === 'string' &&
    value.ETag.trim().length > 0 &&
    Number.isInteger(value.PartNumber) &&
    Number(value.PartNumber) >= 1
  );
}

function isAcademicPeriod(value: unknown): value is AcademicPeriod {
  if (!isRecord(value)) return false;

  return (
    Number.isInteger(value.year) &&
    Number(value.year) >= 1 &&
    Number(value.year) <= 4 &&
    Number.isInteger(value.semester) &&
    Number(value.semester) >= 1 &&
    Number(value.semester) <= 2
  );
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

  if (!isRecord(req.body)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const {
    key,
    uploadId,
    parts,
    title,
    category,
    description,
    author,
    department,
    year,
    semester,
    course_code,
    subject,
    keywords,
    size,
    academicPeriods,
  } = req.body;

  if (
    typeof key !== 'string' ||
    !key.startsWith(`resources/${admin.userId}/`) ||
    typeof uploadId !== 'string' ||
    !uploadId.trim() ||
    typeof title !== 'string' ||
    !title.trim() ||
    title.trim().length > 300 ||
    typeof category !== 'string' ||
    !VALID_CATEGORIES.includes(
      category as (typeof VALID_CATEGORIES)[number],
    ) ||
    !Array.isArray(parts) ||
    !Number.isSafeInteger(size) ||
    Number(size) <= 0 ||
    Number(size) > MAX_PDF_BYTES
  ) {
    return res.status(400).json({ error: 'Invalid completion request' });
  }

  const fileSize = Number(size);

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
    return res.status(500).json({
      error: 'Could not verify upload session',
    });
  }

  if (!session) {
    return res.status(404).json({ error: 'Upload session not found' });
  }

  if (Number(session.expected_size) !== fileSize) {
    return res.status(400).json({
      error: 'Uploaded file size does not match the registered upload.',
    });
  }

  // A completed request may have reached the database before the browser
  // lost its response. Reuse its resource instead of inserting a duplicate.
  const { data: existingResource, error: existingResourceError } =
    await admin.supabase
      .from('resources')
      .select('id, title, is_published')
      .eq('file_path', key)
      .maybeSingle();

  if (existingResourceError) {
    console.error('Could not check for a completed resource:', existingResourceError.message);
    return res.status(500).json({ error: 'Could not verify upload completion' });
  }

  if (existingResource) {
    await admin.supabase
      .from('resource_upload_sessions')
      .delete()
      .eq('upload_id', uploadId)
      .eq('user_id', admin.userId);
    return res.status(200).json({ resource: existingResource });
  }

  const expectedPartCount = Math.ceil(fileSize / PDF_PART_SIZE);

  const validParts = parts.every(isUploadedPart);

  if (
    !validParts ||
    parts.length !== expectedPartCount ||
    parts.some(
      (part: UploadedPart) => part.PartNumber > expectedPartCount,
    ) ||
    new Set(
      parts.map((part: UploadedPart) => part.PartNumber),
    ).size !== parts.length ||
    !Array.from(
      { length: expectedPartCount },
      (_, index) => index + 1,
    ).every((number) =>
      parts.some(
        (part: UploadedPart) => part.PartNumber === number,
      ),
    )
  ) {
    return res.status(400).json({
      error: 'Invalid multipart parts list',
    });
  }

  if (
    department != null &&
    (typeof department !== 'string' ||
      !VALID_DEPARTMENTS.includes(
        department as (typeof VALID_DEPARTMENTS)[number],
      ))
  ) {
    return res.status(400).json({ error: 'Invalid department' });
  }

  let periods: AcademicPeriod[];

  if (Array.isArray(academicPeriods) && academicPeriods.length > 0) {
    if (!academicPeriods.every(isAcademicPeriod)) {
      return res.status(400).json({
        error: 'Invalid academic periods',
      });
    }

    periods = academicPeriods;
  } else if (
    Number.isInteger(year) &&
    Number.isInteger(semester)
  ) {
    periods = [{ year: Number(year), semester: Number(semester) }];
  } else {
    periods = [];
  }

  if (
    periods.length > 8 ||
    new Set(
      periods.map(
        (period) => `${period.year}-${period.semester}`,
      ),
    ).size !== periods.length
  ) {
    return res.status(400).json({
      error: 'Invalid academic periods',
    });
  }

  if (
    author != null &&
    (typeof author !== 'string' || author.length > 500)
  ) {
    return res.status(400).json({
      error: 'Invalid contributor information',
    });
  }

  if (
    description != null &&
    (typeof description !== 'string' || description.length > 10000)
  ) {
    return res.status(400).json({ error: 'Invalid description' });
  }

  if (
    course_code != null &&
    (typeof course_code !== 'string' || course_code.length > 100)
  ) {
    return res.status(400).json({ error: 'Invalid course code' });
  }

  if (
    subject != null &&
    (typeof subject !== 'string' || subject.length > 300)
  ) {
    return res.status(400).json({ error: 'Invalid subject' });
  }

  if (
    keywords != null &&
    (!Array.isArray(keywords) ||
      keywords.length > 100 ||
      !keywords.every(
        (keyword: unknown) =>
          typeof keyword === 'string' && keyword.length <= 100,
      ))
  ) {
    return res.status(400).json({ error: 'Invalid keywords' });
  }

  let storage: ReturnType<typeof createB2Storage>;
  try {
    storage = createB2Storage();
  } catch (error) {
    console.error('Upload completion storage configuration is unavailable:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({
      error: 'Storage is not configured for uploads.',
    });
  }
  const { client, bucket } = storage;

  let objectCompleted = false;

  try {
    let head;
    try {
      head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      objectCompleted = true;
    } catch (error) {
      if (!isMissingStorageObject(error)) {
        throw error;
      }
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: [...(parts as UploadedPart[])]
              .sort((a, b) => a.PartNumber - b.PartNumber)
              .map((part) => ({
                ETag: part.ETag,
                PartNumber: part.PartNumber,
              })),
          },
        }),
      );
      objectCompleted = true;
      head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
    }

    if (head.ContentLength !== fileSize) {
      return res.status(400).json({
        error: 'Uploaded file size verification failed',
      });
    }

    const { data: resource, error: insertError } = await admin.supabase
      .from('resources')
      .insert({
        title: title.trim(),
        category,
        description:
          typeof description === 'string'
            ? description.trim() || null
            : null,
        author:
          typeof author === 'string'
            ? author.trim() || null
            : null,
        department: department ?? null,
        year: periods[0]?.year ?? null,
        semester: periods[0]?.semester ?? null,
        course_code:
          typeof course_code === 'string'
            ? course_code.trim() || null
            : null,
        subject:
          typeof subject === 'string'
            ? subject.trim() || null
            : null,
        keywords: Array.isArray(keywords)
          ? keywords
              .map((item: string) => item.trim())
              .filter(Boolean)
          : [],
        file_path: key,
        file_format: 'PDF',
        file_size_bytes: fileSize,
        demonstration: false,
        is_published: false,
        created_by: admin.userId,
      })
      .select('id, title, is_published')
      .single();

    if (insertError || !resource) {
      console.error(
        'Resource metadata insert failed:',
        insertError?.message,
      );

      return res.status(502).json({
        error: 'The file uploaded, but its resource record could not be saved.',
      });
    }

    if (periods.length > 0) {
      const { error: periodsError } = await admin.supabase
        .from('resource_academic_periods')
        .insert(
          periods.map((period) => ({
            resource_id: resource.id,
            year: period.year,
            semester: period.semester,
          })),
        );

      if (periodsError) {
        console.error(
          'Academic-period insert failed:',
          periodsError.message,
        );

        const { error: resourceDeleteError } = await admin.supabase
          .from('resources')
          .delete()
          .eq('id', resource.id);

        if (resourceDeleteError) {
          console.error(
            'Could not roll back resource metadata:',
            resourceDeleteError.message,
          );
        }

        return res.status(502).json({
          error:
            'Resource metadata was saved incompletely. Please retry after checking the catalogue.',
        });
      }
    }

    const { error: sessionDeleteError } = await admin.supabase
      .from('resource_upload_sessions')
      .delete()
      .eq('upload_id', uploadId)
      .eq('user_id', admin.userId);

    if (sessionDeleteError) {
      console.error(
        'Could not remove completed upload session:',
        sessionDeleteError.message,
      );
    }

    return res.status(201).json({ resource });
  } catch (error) {
    console.error('Multipart upload completion failed:', error);

    // Keep the object if a database or network error leaves the final
    // persistence state uncertain. Avoid accidental loss of uploaded data.
    return res.status(502).json({
      error: objectCompleted
        ? 'The file was uploaded, but saving its metadata could not be confirmed. Check the catalogue before retrying.'
        : 'Could not complete the upload',
    });
  } finally {
    client.destroy();
  }
}
