import type { Organization } from '../data/organizations';

type OrganizationCardProps = { organization: Organization };

export function OrganizationCard({ organization }: OrganizationCardProps) {
  return (
    <article className="organization-card">
      {organization.imageUrl ? <img className="organization-image" src={organization.imageUrl} alt="" /> : <span className="organization-mark" aria-hidden="true">{organization.abbreviation ?? (organization.category === 'Laboratory' ? 'LAB' : 'MEC')}</span>}
      <div className="organization-meta"><span>{organization.category}</span>{organization.abbreviation && <span>{organization.abbreviation}</span>}</div>
      <h3>{organization.name}</h3>
      <p>{organization.description}</p>
      {organization.websiteUrl ? (
        <a className="service-action" href={organization.websiteUrl} target="_blank" rel="noopener noreferrer">Visit website <span aria-hidden="true">↗</span></a>
      ) : (
        <span className="service-action service-unconfigured" aria-disabled="true">Website not provided</span>
      )}
      {organization.socialLinks?.length ? <div className="organization-links">{organization.socialLinks.map((link) => <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div> : null}
      {organization.contact ? <span className="organization-contact">{organization.contact}</span> : null}
    </article>
  );
}
