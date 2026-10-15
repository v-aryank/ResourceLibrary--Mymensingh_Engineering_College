
import type { ExternalService } from '../config/services';

type ServiceActionProps = {
  service: ExternalService;
  className?: string;
  actionLabel?: string;
};

export function ServiceAction({
  service,
  className = 'service-action',
  actionLabel = 'Open service',
}: ServiceActionProps) {
  if (!service.url.trim()) {
    return (
      <span
        className={`${className} service-unconfigured`}
        aria-disabled="true"
      >
        Service link not configured yet
      </span>
    );
  }

  return (
    <a
      className={className}
      href={service.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${actionLabel}: ${service.label} (opens in a new tab)`}
    >
      <span>{actionLabel}</span>
      <span className="service-action-arrow" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}
