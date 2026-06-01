'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MODULE_ACCENTS, type ModuleKey } from '@/lib/module-accents';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Small uppercase context label above the title (date, count, section). */
  eyebrow?: string;
  /** Module accent — tints the eyebrow and the accent rule. */
  module?: ModuleKey;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  module,
  icon,
  action,
  className,
}: PageHeaderProps) {
  const accentVar = module ? `var(${MODULE_ACCENTS[module].cssVar})` : 'var(--color-primary)';

  return (
    <motion.div
      className={cn('mb-6', className)}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{ ['--accent' as string]: accentVar }}
    >
      <div className="flex justify-between items-end gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {icon && (
            <div
              className="mt-0.5 h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'color-mix(in oklch, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.14em] mb-0.5"
                style={{ color: 'var(--accent)' }}
              >
                {eyebrow}
              </p>
            )}
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text-base)] leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-[var(--text-muted)] mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </motion.div>
  );
}
