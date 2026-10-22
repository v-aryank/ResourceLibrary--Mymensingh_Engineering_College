import { Link } from 'react-router-dom';
import { serviceLinks } from '../config/services';
import { ServiceAction } from './ServiceAction';

export function StudentEssentials() {
  return (
    <section className="essentials-section" aria-labelledby="essentials-title">
      <div className="section-kicker">02 <span>—</span> QUICK ACCESS</div>
      <div className="section-title-row">
        <h2 id="essentials-title">Student <em>essentials.</em></h2>
        <p>Useful starting points for the everyday work of student life.</p>
      </div>
      <div className="essentials-grid">
        <article className="essential-item">
          <span className="essential-number">01 / SERVICE</span><span className="essential-mark" aria-hidden="true">A</span>
          <h3>Assignment Cover Page</h3><p>Open the existing generator for assignment and lab-report covers.</p>
          <ServiceAction service={serviceLinks.assignmentCover} />
        </article>
        <article className="essential-item">
          <span className="essential-number">02 / SERVICE</span><span className="essential-mark" aria-hidden="true">P</span>
          <h3>Smart Printing</h3><p>Continue to the existing student-operated printing service.</p>
          <ServiceAction service={serviceLinks.smartPrinting} />
        </article>
        <article className="essential-item">
          <span className="essential-number">03 / LIBRARY</span><span className="essential-mark" aria-hidden="true">R</span>
          <h3>Resource Library</h3><p>Browse books, notes, lab guides, course outlines, and more.</p>
          <Link className="service-action" to="/resources">Explore resources <span aria-hidden="true">↗</span></Link>
        </article>
        <article className="essential-item">
          <span className="essential-number">04 / COMMUNITY</span><span className="essential-mark" aria-hidden="true">C</span>
          <h3>Clubs &amp; Labs</h3><p>Find the campus clubs and laboratories listed in the directory.</p>
          <Link className="service-action" to="/#clubs">Explore the directory <span aria-hidden="true">↓</span></Link>
        </article>
      </div>
    </section>
  );
}
