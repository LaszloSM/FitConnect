import { cn } from '@/lib/utils';
import type { ModuleKey } from '@/lib/module-accents';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Contexto corto sobre el título (sección, fecha, conteo). */
  eyebrow?: string;
  /** Se conserva por compatibilidad: Tiza ya no colorea por módulo. */
  module?: ModuleKey;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, eyebrow, icon, action, className }: PageHeaderProps) {
  return (
    // En móvil título y acciones se apilan: con `shrink-0` las acciones
    // aplastaban el título a una palabra por línea y desbordaban la pantalla.
    <div className={cn('mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-line bg-panel text-ink-muted [&_svg]:size-[18px]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-sm font-medium text-ink-muted">{eyebrow}</p>}
          <h1 className="text-[32px] font-bold leading-none text-ink md:text-[40px]">{title}</h1>
          {subtitle && <p className="mt-1 max-w-[65ch] text-sm text-ink-muted">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end [&>*]:flex-wrap">
          {action}
        </div>
      )}
    </div>
  );
}
