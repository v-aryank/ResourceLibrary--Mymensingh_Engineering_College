
import { supabase } from './supabase';
import type {
  AcademicPeriod,
  AcademicResource,
  ResourceCategory,
} from '../data/resources';

export type ResourceRow = {
  id: string;
  title: string;
  category: ResourceCategory;
  description: string | null;
  author: string | null;
  department: 'EEE' | 'CSE' | 'CE' | null;
  year: number | null;
  semester: number | null;
  course_code: string | null;
  subject: string | null;
  keywords: string[] | null;
  file_path: string | null;
  thumbnail_path: string | null;
  file_format: string | null;
  file_size_bytes: number | null;
  demonstration: boolean;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  academicPeriods?: AcademicPeriod[];
};

const RESOURCE_COLUMNS =
  'id, title, category, description, author, department, year, semester, course_code, subject, keywords, file_path, thumbnail_path, file_format, file_size_bytes, demonstration, is_published, created_at, updated_at';

let publishedResourcesRequest: Promise<ResourceRow[]> | null = null;

export function getPublishedResources(): Promise<ResourceRow[]> {
  if (!publishedResourcesRequest) {
    publishedResourcesRequest = loadPublishedResources().finally(() => {
      publishedResourcesRequest = null;
    });
  }

  return publishedResourcesRequest;
}

async function loadPublishedResources(): Promise<ResourceRow[]> {
  const { data, error } = await supabase
    .from('resources')
    .select(RESOURCE_COLUMNS)
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Could not load resources: ${error.message}`);
  }
  const rows = (data ?? []) as ResourceRow[];
  return rows.map((row) => ({
    ...row,
    academicPeriods:
      row.year != null && row.semester != null
        ? [{ year: row.year, semester: row.semester }]
        : [],
  }));
}

export async function getPublishedResourceAcademicPeriods(
  resources: Pick<ResourceRow, 'id' | 'year' | 'semester'>[],
): Promise<Record<string, AcademicPeriod[]>> {
  if (resources.length === 0) return {};

  const { data, error } = await supabase
    .from('resource_academic_periods')
    .select('resource_id, year, semester')
    .in('resource_id', [...new Set(resources.map((resource) => resource.id))]);

  if (error) {
    throw new Error(`Could not load academic periods: ${error.message}`);
  }

  const periodsByResource: Record<string, AcademicPeriod[]> = {};
  for (const period of data ?? []) {
    (periodsByResource[period.resource_id] ??= []).push({
      year: period.year,
      semester: period.semester,
    });
  }

  for (const resource of resources) {
    if (
      !periodsByResource[resource.id]?.length &&
      resource.year != null &&
      resource.semester != null
    ) {
      periodsByResource[resource.id] = [{
        year: resource.year,
        semester: resource.semester,
      }];
    }
  }

  return periodsByResource;
}

/** Load every resource visible to the signed-in administrator through RLS. */
export async function getAdminResources(): Promise<ResourceRow[]> {
  const { data, error } = await supabase
    .from('resources')
    .select(RESOURCE_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Could not load admin resources: ${error.message}`);
  }

  const rows = (data ?? []) as ResourceRow[];

  if (rows.length === 0) return [];

  const { data: periodRows, error: periodsError } = await supabase
    .from('resource_academic_periods')
    .select('resource_id, year, semester')
    .in('resource_id', rows.map((row) => row.id));

  if (periodsError) {
    throw new Error(
      `Could not load resource academic periods: ${periodsError.message}`,
    );
  }

  const periodsByResource = new Map<string, AcademicPeriod[]>();

  for (const period of periodRows ?? []) {
    const existing = periodsByResource.get(period.resource_id) ?? [];
    existing.push({ year: period.year, semester: period.semester });
    periodsByResource.set(period.resource_id, existing);
  }

  return rows.map((row) => ({
    ...row,
    academicPeriods: periodsByResource.get(row.id) ?? [],
  }));
}

/** Verify the current role, then let Supabase RLS authorize the single-row update. */
export async function setResourcePublished(
  resourceId: string,
  isPublished: boolean,
): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Your administrator session is missing or expired.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Could not verify administrator access: ${profileError.message}`);
  }

  if (profile?.role !== 'admin') {
    throw new Error('Administrator access is required to change publication status.');
  }

  const { data, error } = await supabase
    .from('resources')
    .update({ is_published: isPublished })
    .eq('id', resourceId)
    .select('id, is_published')
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase rejected the publication update: ${error.message}`);
  }

  if (!data || data.is_published !== isPublished) {
    throw new Error(
      'The resource was not updated. Check the row-level security policy and try again.',
    );
  }
}

export type ResourceFileLink = {
  url: string;
  expiresAt: number;
};

export class ResourceUrlError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ResourceUrlError';
  }
}

const resourceUrlRequests = new Map<string, Promise<ResourceFileLink>>();
const thumbnailUrlCache = new Map<string, ResourceFileLink>();
const thumbnailBatchRequests = new Map<string, Promise<Record<string, ResourceFileLink>>>();

export async function getResourceThumbnailUrls(
  resourceIds: string[],
): Promise<Record<string, ResourceFileLink>> {
  const ids = [...new Set(resourceIds)];
  const result: Record<string, ResourceFileLink> = {};
  const now = Date.now();
  const uncached: string[] = [];
  for (const id of ids) {
    const cached = thumbnailUrlCache.get(id);
    if (cached && cached.expiresAt > now + 30_000) result[id] = cached;
    else uncached.push(id);
  }

  const batchPromises: Promise<Record<string, ResourceFileLink>>[] = [];
  for (let offset = 0; offset < uncached.length; offset += 40) {
    const batch = uncached.slice(offset, offset + 40);
    const requestKey = [...batch].sort().join(',');
    let request = thumbnailBatchRequests.get(requestKey);
    if (!request) {
      request = requestResourceThumbnailBatch(batch).finally(() => {
        if (thumbnailBatchRequests.get(requestKey) === request) {
          thumbnailBatchRequests.delete(requestKey);
        }
      });
      thumbnailBatchRequests.set(requestKey, request);
    }
    batchPromises.push(request);
  }
  const batches = await Promise.all(batchPromises);
  for (const batch of batches) Object.assign(result, batch);

  return result;
}

async function requestResourceThumbnailBatch(
  resourceIds: string[],
): Promise<Record<string, ResourceFileLink>> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch('/api/resource-thumbnails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ resourceIds }),
  });

  if (!response.ok) {
    const payload: { error?: unknown } = await response.json().catch(() => ({}));
    throw new ResourceUrlError(
      typeof payload.error === 'string' ? payload.error : `Could not prepare resource covers (HTTP ${response.status}).`,
      response.status,
    );
  }

  const payload: { links?: unknown; expiresIn?: unknown } = await response.json();
  if (!payload.links || typeof payload.links !== 'object' || Array.isArray(payload.links)) {
    throw new ResourceUrlError('The file service returned invalid cover data.', 502);
  }
  const expiresIn = typeof payload.expiresIn === 'number' && payload.expiresIn > 0
    ? payload.expiresIn
    : 300;
  const expiresAt = Date.now() + expiresIn * 1000;
  const result: Record<string, ResourceFileLink> = {};
  for (const [id, url] of Object.entries(payload.links)) {
    if (typeof url === 'string') {
      const link = { url, expiresAt };
      result[id] = link;
      thumbnailUrlCache.set(id, link);
    }
  }
  return result;
}

export function getResourceFileUrl(
  resourceId: string,
  kind: 'pdf' | 'thumbnail',
  options: { download?: boolean } = {},
): Promise<ResourceFileLink> {
  if (kind === 'thumbnail') {
    return getResourceThumbnailUrls([resourceId]).then((links) => {
      const link = links[resourceId];
      if (!link) throw new ResourceUrlError('This resource does not have an available cover.', 404);
      return link;
    });
  }
  const requestKey = `${resourceId}:${kind}:${Boolean(options.download)}`;
  const existing = resourceUrlRequests.get(requestKey);
  if (existing) return existing;

  const request = requestResourceFileUrl(resourceId, kind, options)
    .finally(() => {
      if (resourceUrlRequests.get(requestKey) === request) {
        resourceUrlRequests.delete(requestKey);
      }
    });
  resourceUrlRequests.set(requestKey, request);
  return request;
}

async function requestResourceFileUrl(
  resourceId: string,
  kind: 'pdf' | 'thumbnail',
  options: { download?: boolean },
): Promise<ResourceFileLink> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let response: Response;
  try {
    response = await fetch('/api/resource-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({ resourceId, kind, download: Boolean(options.download) }),
    });
  } catch {
    throw new ResourceUrlError(
      'Could not reach the resource file service. Confirm the local API server is running, then retry.',
      0,
    );
  }

  if (!response.ok) {
    const result: { error?: unknown } = await response.json().catch(() => ({}));
    const message = typeof result.error === 'string'
      ? result.error
      : `Could not prepare the resource file (HTTP ${response.status}).`;
    throw new ResourceUrlError(message, response.status);
  }

  const result: { url?: unknown; expiresIn?: unknown } = await response.json();

  if (typeof result.url !== 'string') {
    throw new ResourceUrlError('The file service did not return a temporary link.', 502);
  }

  const expiresIn = typeof result.expiresIn === 'number' && result.expiresIn > 0
    ? result.expiresIn
    : 300;

  return { url: result.url, expiresAt: Date.now() + expiresIn * 1000 };
}

function formatFileSize(bytes: number | null): string | undefined {
  if (bytes == null || bytes < 0) return undefined;

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ordinal(value: number): string {
  const suffix =
    value % 100 >= 11 && value % 100 <= 13
      ? 'th'
      : value % 10 === 1
        ? 'st'
        : value % 10 === 2
          ? 'nd'
          : value % 10 === 3
            ? 'rd'
            : 'th';

  return `${value}${suffix}`;
}

export function mapResourceToCard(
  row: ResourceRow,
  urls?: {
    fileUrl?: string;
    thumbnailUrl?: string;
    fileUrlExpiresAt?: number;
    thumbnailUrlExpiresAt?: number;
  },
): AcademicResource {
  const periods = row.academicPeriods ?? [];

  const academicYear =
    periods.length > 0
      ? [...new Set(periods.map((period) => period.year))]
          .sort((a, b) => a - b)
          .map((year) => `${ordinal(year)} year`)
          .join(', ')
      : row.year
        ? `${ordinal(row.year)} year`
        : undefined;

  const semester =
    periods.length > 0
      ? [...new Set(periods.map((period) => period.semester))]
          .sort((a, b) => a - b)
          .map((value) => `${ordinal(value)} semester`)
          .join(', ')
      : row.semester
        ? `${ordinal(row.semester)} semester`
        : undefined;

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description ?? '',
    author: row.author ?? undefined,
    department: row.department ?? undefined,
    academicYear,
    semester,
    academicPeriods: periods,
    courseCode: row.course_code ?? undefined,
    subject: row.subject ?? undefined,
    keywords: row.keywords ?? [],
    fileUrl: urls?.fileUrl,
    thumbnailUrl: urls?.thumbnailUrl,
    fileUrlExpiresAt: urls?.fileUrlExpiresAt,
    thumbnailUrlExpiresAt: urls?.thumbnailUrlExpiresAt,
    hasFile: Boolean(row.file_path),
    hasThumbnail: Boolean(row.thumbnail_path),
    thumbnailStatus: row.thumbnail_path ? 'loading' : 'none',
    fileFormat: row.file_format ?? undefined,
    fileSize: formatFileSize(row.file_size_bytes),
    demonstration: row.demonstration,
  };
}
