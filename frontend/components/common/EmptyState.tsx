import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const DefaultEmptyStateIcon = () => (
  <svg width="64" height="64" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-ink-muted" aria-hidden="true">
    <rect x="8" y="36" width="64" height="8" rx="4" fill="currentColor" opacity="0.15" />
    <rect x="8" y="28" width="16" height="24" rx="6" fill="currentColor" opacity="0.2" />
    <rect x="56" y="28" width="16" height="24" rx="6" fill="currentColor" opacity="0.2" />
    <rect x="2" y="32" width="12" height="16" rx="4" fill="currentColor" opacity="0.3" />
    <rect x="66" y="32" width="12" height="16" rx="4" fill="currentColor" opacity="0.3" />
  </svg>
);

/** Estado vacío: qué falta, por qué importa y la acción para poblarlo. Visible
 *  desde el primer frame, sin entrada animada. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex min-h-[200px] flex-col items-center justify-center px-4 py-12 text-center', className)}>
      <div className="mb-4">{icon || <DefaultEmptyStateIcon />}</div>
      <p className="mb-1.5 text-base font-semibold text-ink">{title}</p>
      {description && <p className="mb-6 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
