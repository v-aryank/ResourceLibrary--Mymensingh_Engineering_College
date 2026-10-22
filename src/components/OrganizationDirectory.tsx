import { useState } from 'react';
import { organizations } from '../data/organizations';
import { OrganizationCard } from './OrganizationCard';

const INITIAL_VISIBLE = 3;

export function OrganizationDirectory() {
  const [showAll, setShowAll] = useState(false);
  const visibleOrganizations = showAll ? organizations : organizations.slice(0, INITIAL_VISIBLE);
  const remainingCount = Math.max(0, organizations.length - INITIAL_VISIBLE);

  return (
    <section className="organization-section" id="clubs" aria-labelledby="clubs-title">
      <div className="section-kicker">04 <span>—</span> CAMPUS COMMUNITIES</div>
      <div className="section-title-row">
        <div>
          <h2 id="clubs-title">Clubs <em>&amp; labs.</em></h2>
          <p className="organization-count">{organizations.length} campus communities listed</p>
        </div>
        <p>An evolving directory of student communities and specialized laboratories. Open a listing to explore its details; more entries will appear as they are verified.</p>
      </div>
      <div className="organization-grid" aria-live="polite">
        {visibleOrganizations.map((organization) => <OrganizationCard key={organization.name} organization={organization} />)}
      </div>
      {remainingCount > 0 && (
        <div className="organization-more-wrap">
          <button
            className="organization-more-button"
            type="button"
            aria-expanded={showAll}
            aria-controls="clubs"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? 'Show fewer communities' : `View all ${organizations.length} communities`}
            <span aria-hidden="true">{showAll ? '↑' : '↓'}</span>
          </button>
          {!showAll && <span className="organization-more-note">+{remainingCount} more to explore</span>}
        </div>
      )}
    </section>
  );
}
