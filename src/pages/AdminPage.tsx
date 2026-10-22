import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { resourceCategories, type ResourceCategory } from '../data/resources';
import {
  getAdminResources,
  getResourceFileUrl,
  setResourcePublished,
  type ResourceRow,
} from '../lib/resources';

const MAX_FILE_SIZE = 300 * 1024 * 1024;
const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024;
const PART_SIZE = 8 * 1024 * 1024;

const ACADEMIC_YEARS = [
  { value: 1, label: '1st year' },
  { value: 2, label: '2nd year' },
  { value: 3, label: '3rd year' },
  { value: 4, label: '4th year' },
];

const SEMESTERS = [
  { value: 1, label: '1st semester' },
  { value: 2, label: '2nd semester' },
];

type UploadPart = {
  ETag: string;
  PartNumber: number;
};

type AcademicPeriod = {
  year: number;
  semester: number;
};

type UploadMetadata = {
  title: string;
  category: string;
  description: string;
  author: string;
  department: string;
  course_code: string;
  subject: string;
  keywords: string;
};

type UploadSession = {
  uploadId: string;
  key: string;
  partSize?: number;
};

type ApiResult<T> = T;

type PublicationFilter = 'all' | 'published' | 'unpublished';
type PendingThumbnailRetry = {
  resourceId: string;
  file: File;
  key?: string;
};

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

class ThumbnailUploadError extends Error {
  constructor(message: string, readonly key: string) {
    super(message);
    this.name = 'ThumbnailUploadError';
  }
}

function ordinal(value: number): string {
  const suffix = value % 100 >= 11 && value % 100 <= 13
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

function formatResourceSize(bytes: number | null): string {
  if (bytes == null || bytes < 0) return 'Not available';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatResourceDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function getResourceYears(resource: ResourceRow): string {
  const years = resource.academicPeriods?.length
    ? [...new Set(resource.academicPeriods.map((period) => period.year))]
    : resource.year == null
      ? []
      : [resource.year];
  return years.length ? years.map((year) => `${ordinal(year)} year`).join(', ') : 'Not specified';
}

function getResourceSemesters(resource: ResourceRow): string {
  const semesters = resource.academicPeriods?.length
    ? [...new Set(resource.academicPeriods.map((period) => period.semester))]
    : resource.semester == null
      ? []
      : [resource.semester];
  return semesters.length
    ? semesters.map((semester) => `${ordinal(semester)} semester`).join(', ')
    : 'Not specified';
}

async function authorizedPost<T>(
  path: string,
  token: string,
  body: unknown,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? ` (${cause.message})` : '';
    throw new Error(`Could not reach ${path}. Confirm the app is running with the Vercel development server.${detail}`);
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiRequestError(
      result.error || `Request failed (${response.status})`,
      response.status,
    );
  }

  return result as T;
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error('Please sign in to continue.');
  }

  return data.session.access_token;
}

function getImageContentType(file: File): string | null {
  const allowed: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  return allowed[file.type] ? file.type : null;
}

export function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [adminCheck, setAdminCheck] = useState<{
    userId: string | null;
    status: 'loading' | 'authorized' | 'unauthorized';
  }>({ userId: null, status: 'loading' });
  const adminCheckLoading = Boolean(
    session?.user &&
      (adminCheck.userId !== session.user.id || adminCheck.status === 'loading'),
  );
  const isAdmin =
    adminCheck.userId === session?.user.id &&
    adminCheck.status === 'authorized';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [pendingThumbnailRetry, setPendingThumbnailRetry] = useState<PendingThumbnailRetry | null>(null);
  const [thumbnailRetryBusy, setThumbnailRetryBusy] = useState(false);
  const [academicPeriods, setAcademicPeriods] = useState<AcademicPeriod[]>([]);

  const [metadata, setMetadata] = useState<UploadMetadata>({
    title: '',
    category: 'books',
    description: '',
    author: '',
    department: '',
    course_code: '',
    subject: '',
    keywords: '',
  });

  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [adminResources, setAdminResources] = useState<ResourceRow[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [resourcesError, setResourcesError] = useState('');
  const [resourceRefreshKey, setResourceRefreshKey] = useState(0);
  const [resourceSearch, setResourceSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ResourceCategory>('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>('all');
  const [updatingResourceId, setUpdatingResourceId] = useState<string | null>(null);
  const [deletingResourceId, setDeletingResourceId] = useState<string | null>(null);
  const deletionLockRef = useRef(false);
  const [managementMessage, setManagementMessage] = useState('');
  const [managementError, setManagementError] = useState('');
  const [selectedResource, setSelectedResource] = useState<ResourceRow | null>(null);
  const [resourceFileUrl, setResourceFileUrl] = useState<string | undefined>();
  const [resourceFileExpiresAt, setResourceFileExpiresAt] = useState<number | undefined>();
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const detailsDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const { data, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        if (active) {
          setSession(data.session);
        }
      } catch {
        if (active) {
          setSession(null);
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    }

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAdminCheck({
        userId: nextSession?.user.id ?? null,
        status: nextSession ? 'loading' : 'unauthorized',
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function verifyAdmin() {
      if (!session?.user) {
        setAdminCheck({ userId: null, status: 'unauthorized' });
        return;
      }

      setAdminCheck({ userId: session.user.id, status: 'loading' });

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (active) {
        setAdminCheck({
          userId: session.user.id,
          status: !profileError && data?.role === 'admin'
            ? 'authorized'
            : 'unauthorized',
        });
      }
    }

    void verifyAdmin();

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminResources([]);
      setResourcesLoading(false);
      return;
    }

    let active = true;
    setResourcesLoading(true);
    setResourcesError('');

    void getAdminResources()
      .then((rows) => {
        if (active) setAdminResources(rows);
      })
      .catch((cause) => {
        if (active) {
          setResourcesError(
            cause instanceof Error
              ? cause.message
              : 'Could not load resources. Please try again.',
          );
        }
      })
      .finally(() => {
        if (active) setResourcesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAdmin, session?.user.id, resourceRefreshKey]);

  useEffect(() => {
    const dialog = detailsDialogRef.current;
    if (selectedResource && dialog && !dialog.open) dialog.showModal();
    if (!selectedResource && dialog?.open) dialog.close();
  }, [selectedResource]);

  const visibleAdminResources = useMemo(() => {
    const search = resourceSearch.trim().toLocaleLowerCase();

    return adminResources.filter((resource) => {
      const searchable = [
        resource.title,
        resource.author,
        resource.subject,
        resource.course_code,
        resource.description,
        ...(resource.keywords ?? []),
        resourceCategories.find((category) => category.id === resource.category)?.label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();

      return (
        (!search || searchable.includes(search)) &&
        (categoryFilter === 'all' || resource.category === categoryFilter) &&
        (departmentFilter === 'all' || resource.department === departmentFilter) &&
        (publicationFilter === 'all' ||
          (publicationFilter === 'published' && resource.is_published) ||
          (publicationFilter === 'unpublished' && !resource.is_published))
      );
    });
  }, [adminResources, resourceSearch, categoryFilter, departmentFilter, publicationFilter]);

  function update(
    field: keyof UploadMetadata,
    value: string,
  ) {
    setMetadata((current) => ({ ...current, [field]: value }));
  }

  function togglePeriod(period: AcademicPeriod) {
    setAcademicPeriods((current) => {
      const exists = current.some(
        (item) =>
          item.year === period.year &&
          item.semester === period.semester,
      );

      if (exists) {
        return current.filter(
          (item) =>
            item.year !== period.year ||
            item.semester !== period.semester,
        );
      }

      return [...current, period].sort(
        (a, b) =>
          a.year - b.year || a.semester - b.semester,
      );
    });
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setAuthBusy(true);

    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (signInError) throw signInError;

      if (!data.user) {
        throw new Error('Sign-in did not return a user.');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError || profile?.role !== 'admin') {
        await supabase.auth.signOut();
        throw new Error(
          'This account does not have administrator access.',
        );
      }

      setMessage('Signed in successfully.');
      setPassword('');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not sign in.',
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setError('');
    setMessage('');
    setAuthBusy(true);

    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;

      setSession(null);
      setAdminCheck({ userId: null, status: 'unauthorized' });
      setMessage('You have signed out.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not sign out.',
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function uploadThumbnail(
    token: string,
    resourceId: string,
    image: File,
    retryKey?: string,
  ): Promise<string> {
    const contentType = getImageContentType(image);

    if (!contentType) {
      throw new Error('Thumbnail must be a JPG, PNG, or WebP image.');
    }

    if (image.size <= 0 || image.size > MAX_THUMBNAIL_SIZE) {
      throw new Error('Thumbnail must be no larger than 5 MB.');
    }

    const signed = await authorizedPost<{
      url?: string;
      key: string;
      exists: boolean;
    }>('/api/uploads/thumbnail-url', token, {
      contentType,
      size: image.size,
      ...(retryKey ? { key: retryKey } : {}),
    });

    if (!signed.exists) {
      let response: Response;
      try {
        if (!signed.url) throw new Error('Storage did not return an upload link.');
        response = await fetch(signed.url, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: image,
        });
      } catch (cause) {
        const detail = cause instanceof Error ? ` (${cause.message})` : '';
        throw new ThumbnailUploadError(
          `Could not reach Backblaze to upload the thumbnail. Check the bucket CORS policy.${detail}`,
          signed.key,
        );
      }

      if (!response.ok) {
        throw new ThumbnailUploadError(
          `Backblaze rejected the thumbnail upload (HTTP ${response.status}).`,
          signed.key,
        );
      }
    }

    try {
      await authorizedPost<{ success: boolean }>(
        '/api/uploads/save-thumbnail',
        token,
        {
        resourceId,
        key: signed.key,
        contentType,
        size: image.size,
        },
      );
    } catch (cause) {
      throw new ThumbnailUploadError(
        cause instanceof Error ? cause.message : 'The thumbnail could not be saved.',
        signed.key,
      );
    }

    return signed.key;
  }

  async function retryThumbnailUpload() {
    if (!pendingThumbnailRetry || !session || !isAdmin || thumbnailRetryBusy) return;
    setThumbnailRetryBusy(true);
    setError('');

    try {
      const token = await getAccessToken();
      const { resourceId, file: image, key } = pendingThumbnailRetry;

      if (key) {
        try {
          const contentType = getImageContentType(image);
          if (!contentType) throw new Error('Choose a JPG, PNG, or WebP image.');
          await authorizedPost('/api/uploads/save-thumbnail', token, {
            resourceId,
            key,
            contentType,
            size: image.size,
          });
        } catch (cause) {
          if (!(cause instanceof ApiRequestError) || cause.status !== 404) throw cause;
          await uploadThumbnail(token, resourceId, image, key);
        }
      } else {
        await uploadThumbnail(token, resourceId, image);
      }

      setPendingThumbnailRetry(null);
      setThumbnail(null);
      setMessage('Thumbnail uploaded and saved.');
      const input = document.getElementById('resource-thumbnail') as HTMLInputElement | null;
      if (input) input.value = '';
      setResourceRefreshKey((current) => current + 1);
    } catch (cause) {
      if (cause instanceof ThumbnailUploadError) {
        setPendingThumbnailRetry((current) => current
          ? { ...current, key: cause.key }
          : current);
      }
      setError(cause instanceof Error ? cause.message : 'The thumbnail retry failed.');
    } finally {
      setThumbnailRetryBusy(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setProgress(0);

    if (!session || !isAdmin) {
      setError('Sign in with an administrator account first.');
      return;
    }

    if (!file) {
      setError('Choose a PDF file first.');
      return;
    }

    if (
      !file.name.toLowerCase().endsWith('.pdf') ||
      (file.type && file.type !== 'application/pdf') ||
      file.size <= 0 ||
      file.size > MAX_FILE_SIZE
    ) {
      setError('Choose a valid PDF file no larger than 300 MB.');
      return;
    }

    if (!metadata.title.trim()) {
      setError('Enter a resource title.');
      return;
    }

    if (academicPeriods.length > 8) {
      setError('Choose no more than eight academic periods.');
      return;
    }

    if (thumbnail) {
      if (!getImageContentType(thumbnail)) {
        setError('Choose a JPG, PNG, or WebP thumbnail.');
        return;
      }

      if (
        thumbnail.size <= 0 ||
        thumbnail.size > MAX_THUMBNAIL_SIZE
      ) {
        setError('Thumbnail must be no larger than 5 MB.');
        return;
      }
    }

    setBusy(true);

    let upload: UploadSession | null = null;
    let completed = false;

    try {
      const token = await getAccessToken();

      upload = await authorizedPost<UploadSession>(
        '/api/uploads/create',
        token,
        {
          filename: file.name,
          contentType: 'application/pdf',
          size: file.size,
        },
      );

      const partSize = upload.partSize || PART_SIZE;
      const partCount = Math.ceil(file.size / partSize);
      const parts: UploadPart[] = [];

      for (let index = 0; index < partCount; index++) {
        const partNumber = index + 1;
        const chunk = file.slice(
          index * partSize,
          Math.min((index + 1) * partSize, file.size),
        );

        const signed = await authorizedPost<{ url: string }>(
          '/api/uploads/sign-part',
          token,
          {
            key: upload.key,
            uploadId: upload.uploadId,
            partNumber,
          },
        );

        let putResponse: Response;
        try {
          putResponse = await fetch(signed.url, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            body: chunk,
          });
        } catch (cause) {
          const detail = cause instanceof Error ? ` (${cause.message})` : '';
          throw new Error(`Could not reach Backblaze while uploading PDF part ${partNumber}. Check the storage endpoint and bucket CORS policy.${detail}`);
        }

        if (!putResponse.ok) {
          throw new Error(`Upload failed on part ${partNumber}.`);
        }

        const etag = putResponse.headers.get('ETag');

        if (!etag) {
          throw new Error(
            'Backblaze did not expose the part ETag. Check bucket CORS settings.',
          );
        }

        parts.push({
          ETag: etag,
          PartNumber: partNumber,
        });

        setProgress(
          Math.round(((partNumber / partCount) * 90)),
        );
      }

      const result = await authorizedPost<{
        resource: {
          id: string;
          title: string;
          is_published: boolean;
        };
      }>('/api/uploads/complete', token, {
        ...metadata,
        title: metadata.title.trim(),
        department: metadata.department || null,
        year: academicPeriods[0]?.year ?? null,
        semester: academicPeriods[0]?.semester ?? null,
        academicPeriods,
        keywords: metadata.keywords
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        size: file.size,
        key: upload.key,
        uploadId: upload.uploadId,
        parts,
      });

      completed = true;
      setProgress(95);

      let thumbnailWarning = '';
      let thumbnailSaved = !thumbnail;

      if (thumbnail) {
        try {
          await uploadThumbnail(
            token,
            result.resource.id,
            thumbnail,
          );
          thumbnailSaved = true;
          setPendingThumbnailRetry(null);
        } catch (cause) {
          const pendingKey = cause instanceof ThumbnailUploadError
            ? cause.key
            : undefined;
          setPendingThumbnailRetry({
            resourceId: result.resource.id,
            file: thumbnail,
            ...(pendingKey ? { key: pendingKey } : {}),
          });
          thumbnailWarning =
            cause instanceof Error
              ? ` PDF saved, but thumbnail upload failed: ${cause.message} Use the thumbnail retry action below.`
              : ' PDF saved, but thumbnail upload failed. Use the thumbnail retry action below.';
        }
      }

      setProgress(100);
      setMessage(
        `Uploaded "${result.resource.title}". It is saved as unpublished.${thumbnailWarning}`,
      );
      setResourceRefreshKey((current) => current + 1);

      setFile(null);
      if (thumbnailSaved) setThumbnail(null);
      setAcademicPeriods([]);
      setMetadata({
        title: '',
        category: 'books',
        description: '',
        author: '',
        department: '',
        course_code: '',
        subject: '',
        keywords: '',
      });

      const pdfInput = document.getElementById(
        'resource-pdf',
      ) as HTMLInputElement | null;
      if (pdfInput) pdfInput.value = '';

      const thumbnailInput = document.getElementById(
        'resource-thumbnail',
      ) as HTMLInputElement | null;
      if (thumbnailSaved && thumbnailInput) thumbnailInput.value = '';
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The upload failed.',
      );
    } finally {
      if (upload && !completed) {
        try {
          const token = await getAccessToken();

          await authorizedPost(
            '/api/uploads/abort',
            token,
            upload,
          );
        } catch {
          setError((current) =>
            `${current} Automatic cleanup of the incomplete upload failed. Ask an administrator to check for a pending upload before retrying.`,
          );
        }
      }

      setBusy(false);
    }
  }

  async function openResourceDetails(resource: ResourceRow) {
    setSelectedResource(resource);
    setResourceFileUrl(undefined);
    setResourceFileExpiresAt(undefined);
    setDetailsError('');
    setPreviewError(false);
    setDetailsLoading(Boolean(resource.file_path));

    if (!resource.file_path) {
      setDetailsError('No PDF file is recorded for this resource.');
      return;
    }

    try {
      const link = await getResourceFileUrl(resource.id, 'pdf');
      setResourceFileUrl(link.url);
      setResourceFileExpiresAt(link.expiresAt);
    } catch (cause) {
      setDetailsError(cause instanceof Error ? cause.message : 'Could not load this resource file.');
    } finally {
      setDetailsLoading(false);
    }
  }

  function closeResourceDetails() {
    setSelectedResource(null);
    setResourceFileUrl(undefined);
    setResourceFileExpiresAt(undefined);
    setDetailsError('');
    setPreviewError(false);
  }

  async function openSelectedPdf(download: boolean) {
    if (!selectedResource) return;

    const pdfWindow = download ? null : window.open('about:blank', '_blank');
    setDetailsError('');

    try {
      const link = await getResourceFileUrl(selectedResource.id, 'pdf', { download });
      setResourceFileUrl(link.url);
      setResourceFileExpiresAt(link.expiresAt);

      if (download) {
        window.location.assign(link.url);
      } else if (pdfWindow) {
        pdfWindow.location.replace(link.url);
      } else {
        throw new Error('The browser blocked the PDF window. Allow pop-ups and retry.');
      }
    } catch (cause) {
      pdfWindow?.close();
      setDetailsError(cause instanceof Error ? cause.message : 'Could not open the PDF.');
    }
  }

  async function changePublication(resource: ResourceRow) {
    const nextPublished = !resource.is_published;
    const action = nextPublished ? 'publish' : 'unpublish';
    const confirmation = nextPublished
      ? `Publish “${resource.title}”? Students will be able to find and access it.`
      : `Unpublish “${resource.title}”? Students will no longer be able to find or access it.`;

    if (!window.confirm(confirmation)) return;

    setUpdatingResourceId(resource.id);
    setManagementError('');
    setManagementMessage('');

    try {
      await setResourcePublished(resource.id, nextPublished);
      setManagementMessage(`“${resource.title}” was ${action}ed.`);
      setSelectedResource((current) => current?.id === resource.id
        ? { ...current, is_published: nextPublished }
        : current);
      setAdminResources((current) => current.map((item) => item.id === resource.id
        ? { ...item, is_published: nextPublished }
        : item));
      setResourceRefreshKey((current) => current + 1);
    } catch (cause) {
      setManagementError(cause instanceof Error
        ? cause.message
        : 'The publication status could not be changed.');
    } finally {
      setUpdatingResourceId(null);
    }
  }

  async function deleteResource(resource: ResourceRow) {
    if (deletionLockRef.current || updatingResourceId) return;
    const confirmation = window.confirm(
      `Permanently delete “${resource.title}”? Its PDF, thumbnail, and resource metadata will be removed. This cannot be undone.`,
    );
    if (!confirmation) return;

    deletionLockRef.current = true;
    setDeletingResourceId(resource.id);
    setManagementError('');
    setManagementMessage('');
    try {
      const token = await getAccessToken();
      const result = await authorizedPost<{ success: boolean; cleanupPending?: boolean }>(
        '/api/resources/delete', token, { resourceId: resource.id },
      );
      if (!result.success) throw new Error('The deletion could not be confirmed.');
      setAdminResources((current) => current.filter((item) => item.id !== resource.id));
      if (selectedResource?.id === resource.id) closeResourceDetails();
      setResourceRefreshKey((current) => current + 1);
      setManagementMessage(result.cleanupPending
        ? `“${resource.title}” is deleted. The completed workflow record needs administrator cleanup.`
        : `“${resource.title}” was deleted.`);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status >= 500) {
        // A storage/database failure may have advanced the durable deletion
        // state. Reload to show the current publication and file references.
        setResourceRefreshKey((current) => current + 1);
      }
      setManagementError(cause instanceof Error ? cause.message : 'The resource could not be deleted.');
    } finally {
      deletionLockRef.current = false;
      setDeletingResourceId(null);
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-page-inner">
        <p className="section-kicker">
          MEC Student Desk — Administration
        </p>

        <h1>
          Resource <em>upload</em>
        </h1>

        <p className="admin-intro">
          Add academic resources to the private library. New uploads
          remain unpublished until reviewed.
        </p>

        {authLoading ? (
          <p className="admin-message">Checking your session…</p>
        ) : !session ? (
          <section className="admin-auth-section">
            <h2>Administrator sign in</h2>
            <p className="admin-intro">
              Sign in using an existing MEC Student Desk administrator
              account. This page does not create accounts or grant roles.
            </p>

            <form
              className="admin-upload-form"
              onSubmit={handleSignIn}
            >
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={authBusy}
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={authBusy}
                />
              </label>

              {error && (
                <p className="admin-message admin-error">{error}</p>
              )}

              {message && (
                <p className="admin-message admin-success">
                  {message}
                </p>
              )}

              <button
                className="button button-dark"
                type="submit"
                disabled={authBusy}
              >
                {authBusy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </section>
        ) : adminCheckLoading ? (
          <p className="admin-message">Checking administrator access…</p>
        ) : !isAdmin ? (
          <section>
            <p className="admin-message admin-error">
              This account is signed in but does not have administrator
              permissions.
            </p>
            <button
              className="button button-dark"
              type="button"
              onClick={handleSignOut}
              disabled={authBusy}
            >
              {authBusy ? 'Signing out…' : 'Sign out'}
            </button>
          </section>
        ) : (
          <>
            <div className="admin-auth-status">
              <p>
                Signed in as <strong>{session.user.email}</strong>
              </p>
              <button
                className="button button-dark"
                type="button"
                onClick={handleSignOut}
                disabled={authBusy || busy}
              >
                {authBusy ? 'Signing out…' : 'Sign out'}
              </button>
            </div>

            <form
              className="admin-upload-form"
              onSubmit={handleUpload}
            >
              <label>
                Resource title *
                <input
                  required
                  value={metadata.title}
                  onChange={(event) =>
                    update('title', event.target.value)
                  }
                  maxLength={300}
                  disabled={busy}
                />
              </label>

              <div className="admin-form-grid">
                <label>
                  Category *
                  <select
                    value={metadata.category}
                    onChange={(event) =>
                      update('category', event.target.value)
                    }
                    disabled={busy}
                  >
                    {resourceCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Department
                  <select
                    value={metadata.department}
                    onChange={(event) =>
                      update('department', event.target.value)
                    }
                    disabled={busy}
                  >
                    <option value="">Not specified</option>
                    <option value="EEE">EEE</option>
                    <option value="CSE">CSE</option>
                    <option value="CE">CE</option>
                  </select>
                </label>
              </div>

              <fieldset className="admin-period-fieldset" disabled={busy}>
                <legend>Academic year and semester</legend>
                <p className="admin-intro">
                  Select every period that applies to this resource.
                  Leave all unchecked if it is not tied to a specific
                  period.
                </p>

                {ACADEMIC_YEARS.map((academicYear) => (
                  <div
                    className="admin-period-year"
                    key={academicYear.value}
                  >
                    <strong>{academicYear.label}</strong>

                    <div className="admin-period-options">
                      {SEMESTERS.map((semesterOption) => {
                        const period = {
                          year: academicYear.value,
                          semester: semesterOption.value,
                        };

                        const checked = academicPeriods.some(
                          (item) =>
                            item.year === period.year &&
                            item.semester === period.semester,
                        );

                        const id =
                          `period-${period.year}-${period.semester}`;

                        return (
                          <label key={id} htmlFor={id}>
                            <input
                              id={id}
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePeriod(period)}
                            />
                            {semesterOption.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <p className="admin-file-info">
                  {academicPeriods.length} period
                  {academicPeriods.length === 1 ? '' : 's'} selected
                </p>
              </fieldset>

              <div className="admin-form-grid">
                <label>
                  Author / contributor
                  <input
                    value={metadata.author}
                    onChange={(event) =>
                      update('author', event.target.value)
                    }
                    maxLength={500}
                    disabled={busy}
                  />
                </label>

                <label>
                  Course code
                  <input
                    value={metadata.course_code}
                    onChange={(event) =>
                      update('course_code', event.target.value)
                    }
                    maxLength={100}
                    disabled={busy}
                  />
                </label>

                <label>
                  Subject
                  <input
                    value={metadata.subject}
                    onChange={(event) =>
                      update('subject', event.target.value)
                    }
                    maxLength={300}
                    disabled={busy}
                  />
                </label>

                <label>
                  Keywords
                  <input
                    value={metadata.keywords}
                    onChange={(event) =>
                      update('keywords', event.target.value)
                    }
                    placeholder="circuits, electronics, lab"
                    disabled={busy}
                  />
                </label>
              </div>

              <label>
                Description
                <textarea
                  rows={4}
                  value={metadata.description}
                  onChange={(event) =>
                    update('description', event.target.value)
                  }
                  maxLength={10000}
                  disabled={busy}
                />
              </label>

              <label>
                PDF file * (maximum 300 MB)
                <input
                  id="resource-pdf"
                  type="file"
                  accept=".pdf,application/pdf"
                  required
                  disabled={busy}
                  onChange={(event) =>
                    setFile(event.target.files?.[0] ?? null)
                  }
                />
              </label>

              {file && (
                <p className="admin-file-info">
                  {file.name} ·{' '}
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              )}

              <label>
                Optional cover thumbnail (JPG, PNG, or WebP; maximum 5 MB)
                <input
                  id="resource-thumbnail"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={(event) =>
                    setThumbnail(event.target.files?.[0] ?? null)
                  }
                />
              </label>

              {thumbnail && (
                <p className="admin-file-info">
                  {thumbnail.name} ·{' '}
                  {(thumbnail.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              )}

              {pendingThumbnailRetry && (
                <div className="admin-message admin-error" role="alert">
                  <p>
                    The PDF is saved, but the thumbnail for “{pendingThumbnailRetry.file.name}” is still pending.
                    Retry verifies the existing upload first, then safely reuses its unique key if needed.
                  </p>
                  <button
                    className="button button-dark"
                    type="button"
                    onClick={() => void retryThumbnailUpload()}
                    disabled={thumbnailRetryBusy || busy}
                  >
                    {thumbnailRetryBusy ? 'Retrying thumbnail…' : 'Retry thumbnail upload'}
                  </button>
                </div>
              )}

              {busy && (
                <div
                  className="admin-progress"
                  role="status"
                  aria-live="polite"
                >
                  <div
                    className="admin-progress-bar"
                    style={{ width: `${progress}%` }}
                  />
                  <p>Uploading and saving… {progress}%</p>
                </div>
              )}

              {error && (
                <p className="admin-message admin-error">{error}</p>
              )}

              {message && (
                <p className="admin-message admin-success">{message}</p>
              )}

              <button
                className="button button-dark"
                type="submit"
                disabled={busy || authBusy}
              >
                {busy ? 'Uploading…' : 'Upload resource'}
              </button>
            </form>

            <section className="admin-resource-manager" aria-labelledby="admin-resources-heading">
              <div className="admin-manager-heading">
                <div>
                  <p className="section-kicker">Library administration</p>
                  <h2 id="admin-resources-heading">Manage resources</h2>
                  <p>Review resource details and control student visibility.</p>
                </div>
                <button
                  className="button button-dark admin-refresh-button"
                  type="button"
                  onClick={() => setResourceRefreshKey((current) => current + 1)}
                  disabled={resourcesLoading}
                >
                  {resourcesLoading ? 'Refreshing…' : 'Refresh list'}
                </button>
              </div>

              <div className="admin-resource-filters" aria-label="Resource filters">
                <label>
                  Search resources
                  <input
                    type="search"
                    value={resourceSearch}
                    onChange={(event) => setResourceSearch(event.target.value)}
                    placeholder="Title, author, subject, course…"
                  />
                </label>
                <label>
                  Category
                  <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as 'all' | ResourceCategory)}>
                    <option value="all">All categories</option>
                    {resourceCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                  </select>
                </label>
                <label>
                  Department
                  <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                    <option value="all">All departments</option>
                    <option value="EEE">EEE</option>
                    <option value="CSE">CSE</option>
                    <option value="CE">CE</option>
                  </select>
                </label>
                <label>
                  Publication
                  <select value={publicationFilter} onChange={(event) => setPublicationFilter(event.target.value as PublicationFilter)}>
                    <option value="all">All statuses</option>
                    <option value="published">Published</option>
                    <option value="unpublished">Unpublished</option>
                  </select>
                </label>
              </div>

              {managementError && <p className="admin-message admin-error" role="alert">{managementError}</p>}
              {managementMessage && <p className="admin-message admin-success" role="status">{managementMessage}</p>}
              {resourcesLoading && <p className="admin-message" role="status">Loading resources…</p>}
              {!resourcesLoading && resourcesError && (
                <div className="admin-message admin-error" role="alert">
                  <p>{resourcesError}</p>
                  <button className="button button-dark" type="button" onClick={() => setResourceRefreshKey((current) => current + 1)}>Try again</button>
                </div>
              )}
              {!resourcesLoading && !resourcesError && adminResources.length === 0 && (
                <p className="admin-message">No resources are available to manage yet.</p>
              )}
              {!resourcesLoading && !resourcesError && adminResources.length > 0 && visibleAdminResources.length === 0 && (
                <p className="admin-message">No resources match these search and filter settings.</p>
              )}

              {!resourcesLoading && !resourcesError && visibleAdminResources.length > 0 && (
                <>
                  <p className="admin-resource-count" aria-live="polite">
                    Showing {visibleAdminResources.length} of {adminResources.length} resources
                  </p>
                  <div className="admin-resource-list">
                    {visibleAdminResources.map((resource) => (
                      <article className="admin-resource-card" key={resource.id}>
                        <div className="admin-resource-card-heading">
                          <div>
                            <p className="admin-resource-category">
                              {resourceCategories.find((category) => category.id === resource.category)?.label ?? resource.category}
                            </p>
                            <h3>{resource.title}</h3>
                          </div>
                          <span className={`admin-status-badge ${resource.is_published ? 'is-published' : 'is-unpublished'}`}>
                            {resource.is_published ? 'Published' : 'Unpublished'}
                          </span>
                        </div>
                        <dl className="admin-resource-metadata">
                          <div><dt>Author</dt><dd>{resource.author || 'Not specified'}</dd></div>
                          <div><dt>Department</dt><dd>{resource.department || 'Not specified'}</dd></div>
                          <div><dt>Academic year</dt><dd>{getResourceYears(resource)}</dd></div>
                          <div><dt>Semester</dt><dd>{getResourceSemesters(resource)}</dd></div>
                          <div><dt>Format</dt><dd>{resource.file_format || 'Not specified'}</dd></div>
                          <div><dt>File size</dt><dd>{formatResourceSize(resource.file_size_bytes)}</dd></div>
                          <div><dt>Created</dt><dd>{formatResourceDate(resource.created_at)}</dd></div>
                        </dl>
                        <div className="admin-resource-actions">
                          <button className="button button-dark" type="button" onClick={() => void openResourceDetails(resource)}>View details</button>
                          <button
                            className="button button-outline"
                            type="button"
                            onClick={() => void changePublication(resource)}
                            disabled={updatingResourceId === resource.id}
                          >
                            {updatingResourceId === resource.id
                              ? 'Updating…'
                              : resource.is_published ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            className="button button-outline admin-delete-button"
                            type="button"
                            onClick={() => void deleteResource(resource)}
                            disabled={deletingResourceId !== null || updatingResourceId !== null}
                          >
                            {deletingResourceId === resource.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>

            <dialog
              ref={detailsDialogRef}
              className="admin-resource-dialog"
              aria-labelledby="resource-details-heading"
              onClose={closeResourceDetails}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeResourceDetails();
                }
              }}
              onCancel={(event) => {
                event.preventDefault();
                closeResourceDetails();
              }}
              onClick={(event) => {
                if (event.target === detailsDialogRef.current) closeResourceDetails();
              }}
            >
              {selectedResource && (
                <div
                  className="admin-resource-dialog-content"
                  data-lenis-prevent
                  role="region"
                  aria-label="Resource details"
                  tabIndex={0}
                >
                  <div className="admin-resource-dialog-heading">
                    <div>
                      <p className="admin-resource-category">
                        {resourceCategories.find((category) => category.id === selectedResource.category)?.label ?? selectedResource.category}
                      </p>
                      <h2 id="resource-details-heading">{selectedResource.title}</h2>
                    </div>
                    <button className="admin-dialog-close" type="button" onClick={closeResourceDetails} aria-label="Close resource details">×</button>
                  </div>
                  <p><span className={`admin-status-badge ${selectedResource.is_published ? 'is-published' : 'is-unpublished'}`}>{selectedResource.is_published ? 'Published' : 'Unpublished'}</span></p>
                  <dl className="admin-resource-metadata admin-detail-metadata">
                    <div><dt>Author</dt><dd>{selectedResource.author || 'Not specified'}</dd></div>
                    <div><dt>Department</dt><dd>{selectedResource.department || 'Not specified'}</dd></div>
                    <div><dt>Academic year</dt><dd>{getResourceYears(selectedResource)}</dd></div>
                    <div><dt>Semester</dt><dd>{getResourceSemesters(selectedResource)}</dd></div>
                    <div><dt>Course code</dt><dd>{selectedResource.course_code || 'Not specified'}</dd></div>
                    <div><dt>Subject</dt><dd>{selectedResource.subject || 'Not specified'}</dd></div>
                    <div><dt>Format</dt><dd>{selectedResource.file_format || 'Not specified'}</dd></div>
                    <div><dt>File size</dt><dd>{formatResourceSize(selectedResource.file_size_bytes)}</dd></div>
                    <div><dt>Created</dt><dd>{formatResourceDate(selectedResource.created_at)}</dd></div>
                    <div><dt>Keywords</dt><dd>{selectedResource.keywords?.join(', ') || 'None'}</dd></div>
                    <div><dt>Demonstration resource</dt><dd>{selectedResource.demonstration ? 'Yes' : 'No'}</dd></div>
                  </dl>
                  {selectedResource.description && <p className="admin-resource-description">{selectedResource.description}</p>}
                  {detailsLoading && <p className="admin-message" role="status">Preparing authenticated PDF access…</p>}
                  {detailsError && <p className="admin-message admin-error" role="alert">{detailsError}</p>}
                  {resourceFileUrl && (
                    <>
                      {resourceFileExpiresAt && <p className="admin-file-info">Temporary PDF access expires at {new Date(resourceFileExpiresAt).toLocaleTimeString()}.</p>}
                      <div className="admin-resource-actions">
                        <button className="button button-dark" type="button" onClick={() => void openSelectedPdf(false)}>Open PDF</button>
                        <button className="button button-outline" type="button" onClick={() => void openSelectedPdf(true)}>Download PDF</button>
                      </div>
                      {previewError
                        ? <p className="admin-message admin-error">The PDF preview could not be displayed. Open or download the PDF, or reopen details to refresh its temporary access.</p>
                        : <iframe className="admin-pdf-preview" title={`PDF preview: ${selectedResource.title}`} src={resourceFileUrl} onError={() => setPreviewError(true)} />}
                    </>
                  )}
                </div>
              )}
            </dialog>
          </>
        )}

        <Link className="admin-back-link" to="/resources">
          ← Return to resource library
        </Link>
      </div>
    </main>
  );
}
