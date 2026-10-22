
import { serviceLinks } from '../config/services';
import { ServiceAction } from './ServiceAction';

export function StudentServices() {
  return (
    <section
      className="student-services"
      id="student-tools"
      aria-labelledby="tools-title"
    >
      <div className="service-copy">
        <div className="section-kicker">
          03 <span>—</span> STUDENT TOOLS
        </div>

        <h2 id="tools-title">
          A few useful
          <br />
          <em>shortcuts.</em>
        </h2>

        <p>
          Student Desk connects you to useful campus services.
          Choose a service below to get started.
        </p>
      </div>

      <div className="services-grid">
        <article className="service-card">
          <div className="service-card-topline">
            <span>01 / ACADEMIC TOOL</span>
            <span className="service-card-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 3.75h7l4.25 4.5v12H7z" />
                <path d="M14 3.75v4.5h4.25M10 12h5M10 15.5h5" />
              </svg>
            </span>
          </div>

          <h3>{serviceLinks.assignmentCover.label}</h3>

          <p>{serviceLinks.assignmentCover.description}</p>

          <ServiceAction
            service={serviceLinks.assignmentCover}
            actionLabel="Create cover page"
            className="service-action"
          />
        </article>

        <article className="service-card" id="printing">
          <div className="service-card-topline">
            <span>02 / PRINTING SERVICE</span>
            <span className="service-card-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 8V3.75h10V8M7 17H4.5V9.5h15V17H17" />
                <path d="M7 14h10v6.25H7zM17 11.75h.01" />
              </svg>
            </span>
          </div>

          <h3>{serviceLinks.smartPrinting.label}</h3>

          <p>{serviceLinks.smartPrinting.description}</p>

          <ServiceAction
            service={serviceLinks.smartPrinting}
            actionLabel="Open printing service"
            className="service-action"
          />

          <small className="service-note">
            Uploads, payments, and printing orders are handled by the
            external service.
          </small>
        </article>
      </div>
    </section>
  );
}
