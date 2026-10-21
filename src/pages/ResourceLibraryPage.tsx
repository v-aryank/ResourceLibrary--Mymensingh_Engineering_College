
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  academicYearOptions,
  resourceCategories,
  semesterOptions,
  type AcademicResource,
  type ResourceCategory,
} from '../data/resources';
import { ResourceSearchEntry } from '../components/ResourceSearchEntry';
import {
  getPublishedResources,
  getPublishedResourceAcademicPeriods,
  getResourceFileUrl,
  getResourceThumbnailUrls,
  mapResourceToCard,
  ResourceUrlError,
} from '../lib/resources';

const departments = ['EEE', 'CSE', 'CE'] as const;

export function ResourceLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';

  const [activeCategory, setActiveCategory] =
    useState<ResourceCategory | 'all'>('all');
  const [department, setDepartment] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [semester, setSemester] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [courseSubject, setCourseSubject] = useState('');
  const [author, setAuthor] = useState('');

  const [selectedResource, setSelectedResource] =
    useState<AcademicResource | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const [databaseResources, setDatabaseResources] =
    useState<AcademicResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [resourceLoadError, setResourceLoadError] = useState('');
  const [resourcePeriodError, setResourcePeriodError] = useState('');
  const [resourceLoadAttempt, setResourceLoadAttempt] = useState(0);
  const [resourceActionError, setResourceActionError] = useState('');
  const [resourceActionBusy, setResourceActionBusy] = useState(false);
  const loadSequenceRef = useRef(0);

  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (selectedResource && dialog && !dialog.open) {
      dialog.showModal();
    }

    if (!selectedResource && dialog?.open) {
      dialog.close();
    }
  }, [selectedResource]);

  useEffect(() => {
    let cancelled = false;
    const sequence = ++loadSequenceRef.current;

    async function loadResources() {
      setLoadingResources(true);
      setResourceLoadError('');
      setResourcePeriodError('');

      try {
        const rows = await getPublishedResources();

        if (cancelled) return;

        const mappedResources = rows.map((row) => mapResourceToCard(row));
        setDatabaseResources(mappedResources);

        const rowsById = new Map(rows.map((row) => [row.id, row]));
        void getPublishedResourceAcademicPeriods(rows)
          .then((periodsByResource) => {
            if (cancelled || sequence !== loadSequenceRef.current) return;
            setDatabaseResources((current) => current.map((resource) => {
              const row = rowsById.get(resource.id);
              if (!row) return resource;

              const updated = mapResourceToCard({
                ...row,
                academicPeriods: periodsByResource[resource.id] ?? [],
              });

              return {
                ...resource,
                academicPeriods: updated.academicPeriods,
                academicYear: updated.academicYear,
                semester: updated.semester,
              };
            }));
          })
          .catch((cause) => {
            if (cancelled || sequence !== loadSequenceRef.current) return;
            setResourcePeriodError(
              cause instanceof Error
                ? cause.message
                : 'Could not load academic year and semester details.',
            );
          });

        // Thumbnails are optional and resolve independently of academic periods.
        const thumbnailRows = rows.filter((row) => row.thumbnail_path);
        if (thumbnailRows.length > 0) {
          const thumbnailIds = new Set(thumbnailRows.map((row) => row.id));
          void getResourceThumbnailUrls(thumbnailRows.map((row) => row.id))
            .then((links) => {
              if (cancelled || sequence !== loadSequenceRef.current) return;
              setDatabaseResources((current) => current.map((resource) => {
                const link = links[resource.id];
                if (link) {
                  return {
                    ...resource,
                    thumbnailUrl: link.url,
                    thumbnailUrlExpiresAt: link.expiresAt,
                    thumbnailStatus: 'loading',
                  };
                }
                return thumbnailIds.has(resource.id)
                  ? { ...resource, thumbnailStatus: 'missing' }
                  : resource;
              }));
            })
            .catch((cause) => {
              if (cancelled || sequence !== loadSequenceRef.current) return;
              const status = cause instanceof ResourceUrlError && cause.status === 404 ? 'missing' : 'error';
              setDatabaseResources((current) => current.map((resource) => thumbnailIds.has(resource.id)
                ? { ...resource, thumbnailUrl: undefined, thumbnailStatus: status }
                : resource));
            });
        }
      } catch (error) {
        if (cancelled || sequence !== loadSequenceRef.current) return;

        setResourceLoadError(
          error instanceof Error
            ? error.message
            : 'Unable to load resources. Please try again.',
        );
      } finally {
        if (!cancelled && sequence === loadSequenceRef.current) {
          setLoadingResources(false);
        }
      }
    }

    void loadResources();

    return () => {
      cancelled = true;
    };
  }, [resourceLoadAttempt]);

  const filteredResources = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const normalizedAuthor = author.trim().toLocaleLowerCase();

    // The option labels begin with the numeric year/semester, e.g.
    // "1st Year" and "2nd Semester".
    const selectedYear = academicYear
      ? Number.parseInt(academicYear, 10)
      : null;
    const selectedSemester = semester
      ? Number.parseInt(semester, 10)
      : null;

    return databaseResources.filter((resource) => {
      const categoryLabel =
        resourceCategories.find(
          (category) => category.id === resource.category,
        )?.label ?? '';

      const searchable = [
        resource.title,
        resource.author,
        resource.courseCode,
        resource.subject,
        ...(resource.keywords ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();

      // If year and semester are both selected, they must match the
      // same academic-period entry.
      const periods = resource.academicPeriods ?? [];

      const matchesAcademicPeriod =
        (!selectedYear && !selectedSemester) ||
        periods.some(
          (period) =>
            (!selectedYear || period.year === selectedYear) &&
            (!selectedSemester || period.semester === selectedSemester),
        );

      const matchesCourseSubject = !courseSubject ||
        (resource.subject ?? '').toLocaleLowerCase().includes(courseSubject.trim().toLocaleLowerCase());

      return (
        (!normalizedQuery || searchable.includes(normalizedQuery)) &&
        (activeCategory === 'all' ||
          resource.category === activeCategory) &&
        (!department || resource.department === department) &&
        matchesAcademicPeriod &&
        (!resourceType || resource.category === resourceType) &&
        matchesCourseSubject &&
        (!normalizedAuthor ||
          (resource.author ?? '')
            .toLocaleLowerCase()
            .includes(normalizedAuthor)) &&
        Boolean(categoryLabel)
      );
    });
  }, [
    databaseResources,
    query,
    activeCategory,
    department,
    academicYear,
    semester,
    resourceType,
    courseSubject,
    author,
  ]);

  const categorizedResources = useMemo(() => resourceCategories
    .map((category) => ({
      ...category,
      resources: filteredResources
        .filter((resource) => resource.category === category.id)
        .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
    }))
    .filter((category) => category.resources.length > 0), [filteredResources]);

  const clearFilters = () => {
    setSearchParams({});
    setActiveCategory('all');
    setDepartment('');
    setAcademicYear('');
    setSemester('');
    setResourceType('');
    setCourseSubject('');
    setAuthor('');
  };

  const selectResource = (
    resource: AcademicResource,
    preview = false,
  ) => {
    setPreviewLoading(preview);
    setPreviewError(false);
    setResourceActionError('');
    setSelectedResource(resource);

    if (resource.hasThumbnail && !resource.thumbnailUrl) {
      void getResourceThumbnailUrls([resource.id])
        .then((links) => {
          const link = links[resource.id];
          if (!link) throw new ResourceUrlError('This resource does not have an available cover.', 404);
          setSelectedResource((current) => current?.id === resource.id
            ? { ...current, thumbnailUrl: link.url, thumbnailUrlExpiresAt: link.expiresAt }
            : current);
        })
        .catch((cause) => {
          setSelectedResource((current) => current?.id === resource.id
            ? { ...current, thumbnailStatus: cause instanceof ResourceUrlError && cause.status === 404 ? 'missing' : 'error' }
            : current);
        });
    }

    if (preview) void loadPreview(resource);
  };

  async function loadPreview(resource: AcademicResource) {
    if (!resource.hasFile) {
      setPreviewLoading(false);
      setResourceActionError('No PDF is attached to this resource.');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(false);
    setResourceActionError('');
    setSelectedResource((current) => current?.id === resource.id
      ? { ...current, fileUrl: undefined, fileUrlExpiresAt: undefined }
      : current);

    try {
      const link = await getResourceFileUrl(resource.id, 'pdf');
      setSelectedResource((current) => current?.id === resource.id
        ? { ...current, fileUrl: link.url, fileUrlExpiresAt: link.expiresAt }
        : current);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not prepare this PDF.';
      setResourceActionError(message);
      setPreviewError(true);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function openResourceFile(resource: AcademicResource, download: boolean) {
    if (!resource.hasFile) {
      setResourceActionError('No PDF is attached to this resource.');
      return;
    }

    const pdfWindow = download ? null : window.open('about:blank', '_blank');
    setResourceActionBusy(true);
    setResourceActionError('');

    try {
      const link = await getResourceFileUrl(resource.id, 'pdf', { download });
      if (download) window.location.assign(link.url);
      else if (pdfWindow) pdfWindow.location.replace(link.url);
      else throw new Error('The browser blocked the PDF window. Allow pop-ups and retry.');
    } catch (cause) {
      pdfWindow?.close();
      setResourceActionError(cause instanceof Error ? cause.message : 'Could not open the PDF.');
    } finally {
      setResourceActionBusy(false);
    }
  }

  const isPdf = (resource: AcademicResource) =>
    resource.fileFormat?.toLocaleLowerCase() === 'pdf' || resource.hasFile === true;

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  return (
    <main className="resource-page" id="top">
      <section className="resource-page-heading">
        <div className="section-kicker">RESOURCE LIBRARY</div>

        <h1>
          All your resources here
          <br />
          <em>Find what you need to learn.</em>
        </h1>

        <p>
          Browse the academic materials shared with the Student Desk.
          Search by title, author, subject, course code, or keyword.
        </p>

        <ResourceSearchEntry
          label="Search resources"
          value={query}
          onQueryChange={(value) =>
            setSearchParams(value ? { q: value } : {})
          }
          onSearch={(value) =>
            setSearchParams(value ? { q: value } : {})
          }
          className="library-search"
        />
      </section>

      <section
        className="resource-catalogue"
        aria-labelledby="catalogue-title"
      >
        <div className="catalogue-heading">
          <div>
            <span className="catalogue-index">01 / CATALOGUE</span>
            <h2 id="catalogue-title">Browse resources</h2>
          </div>

          <span className="result-count" aria-live="polite">
            {loadingResources
              ? 'Loading…'
              : resourceLoadError
                ? 'Catalogue unavailable'
                : `${filteredResources.length} ${filteredResources.length === 1 ? 'entry' : 'entries'}`}
          </span>
        </div>

        <div
          className="category-tabs"
          role="group"
          aria-label="Resource categories"
        >
          <button
            type="button"
            className={activeCategory === 'all' ? 'active' : ''}
            aria-pressed={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          >
            All materials
          </button>

          {resourceCategories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={
                activeCategory === category.id ? 'active' : ''
              }
              aria-pressed={activeCategory === category.id}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="resource-workspace">
          <aside
            className="resource-filters"
            aria-label="Filter resources"
          >
            <div className="filter-heading">
              <h3>Refine results</h3>
              <button type="button" onClick={clearFilters}>
                Clear all
              </button>
            </div>

            <label>
              Department
              <select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                <option value="">All departments</option>
                {departments.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Academic year
              <select
                value={academicYear}
                onChange={(event) => setAcademicYear(event.target.value)}
              >
                <option value="">Any year</option>
                {academicYearOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Semester
              <select
                value={semester}
                onChange={(event) => setSemester(event.target.value)}
              >
                <option value="">Any semester</option>
                {semesterOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Resource type
              <select
                value={resourceType}
                onChange={(event) => setResourceType(event.target.value)}
              >
                <option value="">All resource types</option>
                {resourceCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Course / subject
              <input
                type="search"
                value={courseSubject}
                onChange={(event) => setCourseSubject(event.target.value)}
                placeholder="Filter by subject"
              />
            </label>

            <label>
              Author
              <input
                type="search"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Filter by author"
              />
            </label>

            <p className="filters-note">
              Resources can be associated with multiple academic
              periods. Select both year and semester to narrow results
              to that specific combination.
            </p>
          </aside>

          <div className="resource-results" aria-live="polite">
            {resourceActionError && !selectedResource && (
              <div className="catalogue-empty" role="alert">
                <p>{resourceActionError}</p>
                <button type="button" onClick={() => setResourceActionError('')}>Dismiss</button>
              </div>
            )}

            {resourcePeriodError && (
              <div className="catalogue-warning" role="alert">
                <span>{resourcePeriodError}</span>
                <button type="button" onClick={() => setResourcePeriodError('')}>Dismiss</button>
              </div>
            )}

            {loadingResources && (
              <div className="catalogue-empty" role="status">
                <h3>Loading resources…</h3>
                <p>Fetching published academic materials.</p>
              </div>
            )}

            {!loadingResources && resourceLoadError && (
              <div className="catalogue-empty" role="alert">
                <h3>Unable to load the catalogue</h3>
                <p>{resourceLoadError}</p>
                <button
                  type="button"
                  onClick={() => setResourceLoadAttempt((attempt) => attempt + 1)}
                  disabled={loadingResources}
                >
                  Try again
                </button>
              </div>
            )}

            {!loadingResources &&
              !resourceLoadError &&
              categorizedResources.length > 0 &&
              categorizedResources.map((section) => (
                <section className="resource-category-section" key={section.id} aria-labelledby={`category-${section.id}`}>
                  <h2 id={`category-${section.id}`}>{section.label}</h2>
                  <div className="resource-category-grid">
                  {section.resources.map((resource, index) => {
                return (
                  <article className="resource-card" key={resource.id}>
                    <div
                      className="resource-card-main"
                      role="button"
                      tabIndex={0}
                      aria-label={`View details for ${resource.title}`}
                      onClick={() => selectResource(resource)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectResource(resource);
                        }
                      }}
                    >
                      <div className="resource-card-copy">
                        <div className="resource-card-top">
                          <span>{section.label}</span>
                          {resource.demonstration && <span className="demo-label">DEMO</span>}
                        </div>

                        <h3 title={resource.title}>{resource.title}</h3>
                        <p className="resource-card-description">{resource.description}</p>

                        <dl className="resource-meta">
                      {resource.author && (
                        <div>
                          <dt>Contributor</dt>
                          <dd>{resource.author}</dd>
                        </div>
                      )}

                      {resource.department && (
                        <div>
                          <dt>Department</dt>
                          <dd>{resource.department}</dd>
                        </div>
                      )}

                      {resource.academicYear && (
                        <div>
                          <dt>Year</dt>
                          <dd>{resource.academicYear}</dd>
                        </div>
                      )}

                      {resource.semester && (
                        <div>
                          <dt>Semester</dt>
                          <dd>{resource.semester}</dd>
                        </div>
                      )}

                      {resource.courseCode && (
                        <div>
                          <dt>Course</dt>
                          <dd>{resource.courseCode}</dd>
                        </div>
                      )}

                      {resource.subject && (
                        <div>
                          <dt>Subject</dt>
                          <dd>{resource.subject}</dd>
                        </div>
                      )}

                      {resource.fileFormat && (
                        <div>
                          <dt>File</dt>
                          <dd>
                            {resource.fileFormat}
                            {resource.fileSize
                              ? ` · ${resource.fileSize}`
                              : ''}
                          </dd>
                        </div>
                      )}
                      {!resource.fileFormat && resource.hasFile && (
                        <div><dt>File</dt><dd>PDF</dd></div>
                      )}
                        </dl>
                      </div>

                      <div className={`resource-card-thumbnail${resource.thumbnailStatus === 'loading' ? ' is-loading' : ''}`}>
                        {resource.hasThumbnail && resource.thumbnailUrl ? (
                          <img
                            src={resource.thumbnailUrl}
                            alt={`Cover for ${resource.title}`}
                            loading={index < 4 ? 'eager' : 'lazy'}
                            fetchPriority={index < 4 ? 'high' : 'auto'}
                            onLoad={() => setDatabaseResources((current) => current.map((item) =>
                              item.id === resource.id ? { ...item, thumbnailStatus: 'ready' } : item))}
                            onError={() => setDatabaseResources((current) => current.map((item) =>
                              item.id === resource.id
                                ? { ...item, thumbnailUrl: undefined, thumbnailStatus: 'error' }
                                : item))}
                          />
                        ) : (
                          <span className="thumbnail-fallback" role={resource.hasThumbnail ? 'status' : undefined}>
                            {!resource.hasThumbnail ? 'No cover image' : resource.thumbnailStatus === 'loading' ? 'Loading cover…' : 'Cover unavailable'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="resource-actions">
                      <button
                        type="button"
                        className="details-action"
                        onClick={() => selectResource(resource)}
                      >
                        View details <span aria-hidden="true">↗</span>
                      </button>

                      {resource.hasFile && isPdf(resource) ? (
                        <button
                          type="button"
                          className="preview-action"
                          onClick={() => selectResource(resource, true)}
                          disabled={resourceActionBusy}
                        >
                          Preview PDF
                        </button>
                      ) : (
                        <span className="unavailable-action">
                          {resource.hasFile ? 'Preview unavailable' : 'No PDF attached'}
                        </span>
                      )}

                      {resource.hasFile ? (
                        <button
                          className="download-action"
                          type="button"
                          onClick={() => void openResourceFile(resource, true)}
                          disabled={resourceActionBusy}
                        >
                          Download
                        </button>
                      ) : (
                        <span className="unavailable-action">
                          No PDF attached
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
                  </div>
                </section>
              ))}

            {!loadingResources &&
              !resourceLoadError &&
              filteredResources.length === 0 && (
                <div className="catalogue-empty">
                  <span className="empty-mark" aria-hidden="true">
                    —
                  </span>
                  <h3>No matching resources</h3>
                  <p>
                    No published resources match your current search and
                    filters. Try changing your search or clearing some
                    filters.
                  </p>
                  <button type="button" onClick={clearFilters}>
                    Clear search and filters
                  </button>
                </div>
              )}
          </div>
        </div>
      </section>

      <dialog
        ref={dialogRef}
        className="resource-dialog"
        aria-labelledby="resource-details-heading"
        onClose={() => setSelectedResource(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
      >
        {selectedResource && (
          <div
            className="resource-dialog-content"
            data-lenis-prevent
            role="region"
            aria-label="Resource details"
            tabIndex={0}
          >
            <div className="dialog-topline">
              <span>
                {
                  resourceCategories.find(
                    (item) => item.id === selectedResource.category,
                  )?.label
                }
              </span>
              <button
                type="button"
                aria-label="Close details"
                onClick={closeDialog}
              >
                ×
              </button>
            </div>

            {selectedResource.hasThumbnail && (
              <div className="resource-dialog-thumbnail">
                {selectedResource.thumbnailUrl ? <img
                  src={selectedResource.thumbnailUrl}
                  alt={`Cover for ${selectedResource.title}`}
                  onError={() => setSelectedResource((current) => current?.id === selectedResource.id
                    ? { ...current, thumbnailUrl: undefined, thumbnailStatus: 'error' }
                    : current)}
                /> : <span className="thumbnail-fallback">{selectedResource.thumbnailStatus === 'loading' ? 'Loading cover…' : 'Cover unavailable'}</span>}
              </div>
            )}

            <h2 id="resource-details-heading">{selectedResource.title}</h2>

            {selectedResource.demonstration && (
              <p className="demo-notice">
                Demonstration entry — replace with verified MEC resource
                information.
              </p>
            )}

            <p>{selectedResource.description}</p>

            <dl className="dialog-meta">
              {selectedResource.author && (
                <div>
                  <dt>Contributor</dt>
                  <dd>{selectedResource.author}</dd>
                </div>
              )}

              {selectedResource.department && (
                <div>
                  <dt>Department</dt>
                  <dd>{selectedResource.department}</dd>
                </div>
              )}

              {selectedResource.academicYear && (
                <div>
                  <dt>Academic year</dt>
                  <dd>{selectedResource.academicYear}</dd>
                </div>
              )}

              {selectedResource.semester && (
                <div>
                  <dt>Semester</dt>
                  <dd>{selectedResource.semester}</dd>
                </div>
              )}

              {selectedResource.courseCode && (
                <div>
                  <dt>Course code</dt>
                  <dd>{selectedResource.courseCode}</dd>
                </div>
              )}

              {selectedResource.subject && (
                <div>
                  <dt>Subject</dt>
                  <dd>{selectedResource.subject}</dd>
                </div>
              )}

              {(selectedResource.fileFormat || selectedResource.hasFile) && (
                <div>
                  <dt>File</dt>
                  <dd>
                    {selectedResource.fileFormat ?? 'PDF'}
                    {selectedResource.fileSize
                      ? ` · ${selectedResource.fileSize}`
                      : ''}
                  </dd>
                </div>
              )}
            </dl>

            {previewLoading && <p className="preview-status" role="status">Preparing an authenticated PDF preview…</p>}
            {resourceActionError && <p className="preview-status" role="alert">{resourceActionError}</p>}

            {selectedResource.fileUrl && isPdf(selectedResource) && (
              <div className="pdf-preview-area">
                <div className="pdf-preview-heading">
                  <strong>PDF preview</strong>
                  <button type="button" onClick={() => void loadPreview(selectedResource)} disabled={resourceActionBusy || previewLoading}>Refresh preview</button>
                </div>

                {previewLoading && (
                  <p className="preview-status">Loading preview…</p>
                )}

                {previewError && (
                  <p className="preview-status">
                    The preview could not be displayed. Open the PDF
                    separately instead.
                  </p>
                )}

                <iframe
                  title={`PDF preview: ${selectedResource.title}`}
                  src={`${selectedResource.fileUrl}#toolbar=0`}
                  onLoad={() => setPreviewLoading(false)}
                  onError={() => {
                    setPreviewLoading(false);
                    setPreviewError(true);
                  }}
                />
              </div>
            )}

            <div className="dialog-actions">
              {selectedResource.hasFile ? (
                <>
                  <button type="button" className="button button-outline" onClick={() => void loadPreview(selectedResource)} disabled={previewLoading || resourceActionBusy}>Preview PDF</button>
                  <button type="button" className="button button-dark" onClick={() => void openResourceFile(selectedResource, false)} disabled={resourceActionBusy}>Open PDF</button>
                  <button type="button" className="button button-dark" onClick={() => void openResourceFile(selectedResource, true)} disabled={resourceActionBusy}>Download file</button>
                </>
              ) : (
                <span className="unavailable-action">No PDF is attached to this resource.</span>
              )}

              <button
                type="button"
                className="dialog-close"
                onClick={closeDialog}
              >
                Close details
              </button>
            </div>
          </div>
        )}
      </dialog>
    </main>
  );
}
