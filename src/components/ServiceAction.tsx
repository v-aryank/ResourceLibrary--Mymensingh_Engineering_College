import type { ExternalService } from '../config/services';

type ServiceActionProps = {
  service: ExternalService;
  className?: string;
};

export function ServiceAction({ service, className = 'service-action' }: ServiceActionProps) {
  if (!service.url.trim()) {
    return <span className={`${className} service-unconfigured`} aria-disabled="true">Service link not configured yet</span>;
  }

  return (
    <a className={className} href={service.url} target="_blank" rel="noopener noreferrer">
      Launch service <span aria-hidden="true">↗</span>
    </a>
  );
}
