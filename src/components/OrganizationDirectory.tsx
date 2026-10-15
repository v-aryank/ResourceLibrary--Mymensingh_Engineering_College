import { organizations } from '../data/organizations';
import { OrganizationCard } from './OrganizationCard';

export function OrganizationDirectory() {
  return (
    <section className="organization-section" id="clubs" aria-labelledby="clubs-title">
      <div className="section-kicker">06 <span>—</span> CAMPUS COMMUNITIES</div>
      <div className="section-title-row">
        <h2 id="clubs-title">Clubs <em>&amp; labs.</em></h2>
        <p>An initial directory of student communities and specialized laboratories. More listings can be added as details are confirmed.</p>
      </div>
      <div className="organization-grid">
        {organizations.map((organization) => <OrganizationCard key={organization.name} organization={organization} />)}
      </div>
    </section>
  );
}
