import { serviceLinks } from '../config/services';
import { ServiceAction } from './ServiceAction';

export function StudentServices() {
  return (
    <section className="student-services" id="student-tools" aria-labelledby="tools-title">
      <div className="service-copy">
        <div className="section-kicker">04 <span>—</span> STUDENT TOOLS</div>
        <h2 id="tools-title">A few useful<br /><em>shortcuts.</em></h2>
        <p>Student Desk connects to services that already exist. Each service keeps its own workflow and terms.</p>
        <ServiceAction service={serviceLinks.assignmentCover} className="button button-dark" />
      </div>
      <div className="printing-panel" id="printing">
        <div className="printing-topline"><span>05 / PRINTING SERVICE</span><span aria-hidden="true">P</span></div>
        <h3>Smart Printing</h3>
        <p>Use the existing Smart Printing service for document upload and payment through its own workflow. Printed documents are collected from the printer in the college library building.</p>
        <ServiceAction service={serviceLinks.smartPrinting} className="service-action" />
        <small>This page is a portal to the external service. It does not handle uploads, payments, orders, or printer status.</small>
      </div>
    </section>
  );
}
