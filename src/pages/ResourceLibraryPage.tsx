import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { academicYearOptions, resourceCategories, resources, semesterOptions, type AcademicResource, type ResourceCategory } from '../data/resources';
import { ResourceSearchEntry } from '../components/ResourceSearchEntry';

const departments = ['EEE', 'CSE', 'CE'] as const;

export function ResourceLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [activeCategory, setActiveCategory] = useState<ResourceCategory | 'all'>('all');
  const [department, setDepartment] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [semester, setSemester] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [author, setAuthor] = useState('');
  const [selectedResource, setSelectedResource] = useState<AcademicResource | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (selectedResource && dialog && !dialog.open) dialog.showModal();
    if (!selectedResource && dialog?.open) dialog.close();
  }, [selectedResource]);

  const filteredResources = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const normalizedAuthor = author.trim().toLocaleLowerCase();
    return resources.filter((resource) => {
      const categoryLabel = resourceCategories.find((category) => category.id === resource.category)?.label ?? '';
      const searchable = [resource.title, resource.author, resource.courseCode, resource.subject, ...(resource.keywords ?? [])]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      return (!normalizedQuery || searchable.includes(normalizedQuery))
        && (activeCategory === 'all' || resource.category === activeCategory)
        && (!department || resource.department === department)
        && (!academicYear || resource.academicYear === academicYear)
        && (!semester || resource.semester === semester)
        && (!resourceType || resource.category === resourceType)
        && (!normalizedAuthor || (resource.author ?? '').toLocaleLowerCase().includes(normalizedAuthor))
        && Boolean(categoryLabel);
    });
  }, [query, activeCategory, department, academicYear, semester, resourceType, author]);

  const clearFilters = () => {
    setSearchParams({});
    setActiveCategory('all');
    setDepartment('');
    setAcademicYear('');
    setSemester('');
    setResourceType('');
    setAuthor('');
  };

  const selectResource = (resource: AcademicResource, preview = false) => {
    setPreviewLoading(preview);
    setPreviewError(false);
    setSelectedResource(resource);
  };

  const isPdf = (resource: AcademicResource) => resource.fileFormat?.toLocaleLowerCase() === 'pdf'
    || (resource.fileUrl?.split('?')[0].toLocaleLowerCase().endsWith('.pdf') ?? false);

  return (
    <main className="resource-page" id="top">
      <section className="resource-page-heading">
        <div className="section-kicker">RESOURCE LIBRARY</div>
        <h1>All your resources here<br /><em>Find what you need to learn.</em></h1>
        <p>Browse the academic materials shared with the Student Desk. Search by title, author, subject, course code, or keyword.</p>
        <ResourceSearchEntry
          label="Search resources"
          value={query}
          onQueryChange={(value) => setSearchParams(value ? { q: value } : {})}
          onSearch={(value) => setSearchParams(value ? { q: value } : {})}
          className="library-search"
        />
      </section>

      <section className="resource-catalogue" aria-labelledby="catalogue-title">
        <div className="catalogue-heading"><div><span className="catalogue-index">01 / CATALOGUE</span><h2 id="catalogue-title">Browse resources</h2></div><span className="result-count" aria-live="polite">{filteredResources.length} {filteredResources.length === 1 ? 'entry' : 'entries'}</span></div>
        <div className="category-tabs" role="group" aria-label="Resource categories">
          <button type="button" className={activeCategory === 'all' ? 'active' : ''} aria-pressed={activeCategory === 'all'} onClick={() => setActiveCategory('all')}>All materials</button>
          {resourceCategories.map((category) => <button type="button" key={category.id} className={activeCategory === category.id ? 'active' : ''} aria-pressed={activeCategory === category.id} onClick={() => setActiveCategory(category.id)}>{category.label}</button>)}
        </div>
        <div className="resource-workspace">
          <aside className="resource-filters" aria-label="Filter resources">
            <div className="filter-heading"><h3>Refine results</h3><button type="button" onClick={clearFilters}>Clear all</button></div>
            <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>Academic year<select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}><option value="">Any year</option>{academicYearOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>Semester<select value={semester} onChange={(event) => setSemester(event.target.value)}><option value="">Any semester</option>{semesterOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>Resource type<select value={resourceType} onChange={(event) => setResourceType(event.target.value)}><option value="">All resource types</option>{resourceCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>Author<input type="search" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Filter by author" /></label>
            <p className="filters-note">Academic years and semesters can be adjusted in the catalogue configuration.</p>
          </aside>
          <div className="resource-results" aria-live="polite">
            {filteredResources.length ? filteredResources.map((resource) => {
              const category = resourceCategories.find((item) => item.id === resource.category)?.label ?? '';
              return (
                <article className="resource-card" key={resource.id}>
                  <div className="resource-card-top"><span>{category}</span>{resource.demonstration && <span className="demo-label">DEMO</span>}</div>
                  <h3>{resource.title}</h3>
                  <p>{resource.description}</p>
                  <dl className="resource-meta">
                    {resource.author && <div><dt>Contributor</dt><dd>{resource.author}</dd></div>}
                    {resource.department && <div><dt>Department</dt><dd>{resource.department}</dd></div>}
                    {resource.academicYear && <div><dt>Year</dt><dd>{resource.academicYear}</dd></div>}
                    {resource.semester && <div><dt>Semester</dt><dd>{resource.semester}</dd></div>}
                    {resource.courseCode && <div><dt>Course</dt><dd>{resource.courseCode}</dd></div>}
                    {resource.subject && <div><dt>Subject</dt><dd>{resource.subject}</dd></div>}
                    {resource.fileFormat && <div><dt>File</dt><dd>{resource.fileFormat}{resource.fileSize ? ` · ${resource.fileSize}` : ''}</dd></div>}
                  </dl>
                  <div className="resource-actions">
                    <button type="button" className="details-action" onClick={() => selectResource(resource)}>View details <span aria-hidden="true">↗</span></button>
                    {resource.fileUrl && isPdf(resource)
                      ? <button type="button" className="preview-action" onClick={() => selectResource(resource, true)}>Preview PDF</button>
                      : <span className="unavailable-action">Preview unavailable</span>}
                    {resource.fileUrl
                      ? <a className="download-action" href={resource.fileUrl} download>Download</a>
                      : <span className="unavailable-action">No file attached</span>}
                  </div>
                </article>
              );
            }) : (
              <div className="catalogue-empty"><span className="empty-mark" aria-hidden="true">—</span><h3>No matching resources</h3><p>Try a different search or clear one or more filters. The entries currently listed are clearly marked demonstrations.</p><button type="button" onClick={clearFilters}>Clear search and filters</button></div>
            )}
          </div>
        </div>
      </section>

      <dialog ref={dialogRef} className="resource-dialog" onClose={() => setSelectedResource(null)}>
        {selectedResource && <>
          <div className="dialog-topline"><span>{resourceCategories.find((item) => item.id === selectedResource.category)?.label}</span><button type="button" aria-label="Close details" onClick={() => dialogRef.current?.close()}>×</button></div>
          <h2>{selectedResource.title}</h2>
          {selectedResource.demonstration && <p className="demo-notice">Demonstration entry — replace with verified MEC resource information.</p>}
          <p>{selectedResource.description}</p>
          <dl className="dialog-meta">
            {selectedResource.author && <div><dt>Contributor</dt><dd>{selectedResource.author}</dd></div>}
            {selectedResource.department && <div><dt>Department</dt><dd>{selectedResource.department}</dd></div>}
            {selectedResource.academicYear && <div><dt>Academic year</dt><dd>{selectedResource.academicYear}</dd></div>}
            {selectedResource.semester && <div><dt>Semester</dt><dd>{selectedResource.semester}</dd></div>}
            {selectedResource.courseCode && <div><dt>Course code</dt><dd>{selectedResource.courseCode}</dd></div>}
            {selectedResource.subject && <div><dt>Subject</dt><dd>{selectedResource.subject}</dd></div>}
            {selectedResource.fileFormat && <div><dt>File</dt><dd>{selectedResource.fileFormat}{selectedResource.fileSize ? ` · ${selectedResource.fileSize}` : ''}</dd></div>}
          </dl>
          {selectedResource.fileUrl && isPdf(selectedResource) && <div className="pdf-preview-area">
            <div className="pdf-preview-heading"><strong>PDF preview</strong><a href={selectedResource.fileUrl} target="_blank" rel="noopener noreferrer">Open PDF separately ↗</a></div>
            {previewLoading && <p className="preview-status">Loading preview…</p>}
            {previewError && <p className="preview-status">The preview could not be displayed. Open the PDF separately instead.</p>}
            <iframe title={`PDF preview: ${selectedResource.title}`} src={`${selectedResource.fileUrl}#toolbar=0`} onLoad={() => setPreviewLoading(false)} onError={() => { setPreviewLoading(false); setPreviewError(true); }} />
          </div>}
          <div className="dialog-actions">
            {selectedResource.fileUrl ? <a className="button button-dark" href={selectedResource.fileUrl} download>Download file</a> : <span className="unavailable-action">Download unavailable — no file is configured</span>}
            <button type="button" className="dialog-close" onClick={() => dialogRef.current?.close()}>Close details</button>
          </div>
        </>}
      </dialog>
    </main>
  );
}
