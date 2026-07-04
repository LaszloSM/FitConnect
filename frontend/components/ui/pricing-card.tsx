/**
 * 21st Magic — Pricing Card compound component
 * Adapted for FitConnect design system (CSS vars instead of shadcn tokens)
 */
import React from 'react';
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'relative w-full max-w-xs rounded-xl',
        'p-1.5 shadow-xl',
        'border border-[var(--border-base)]',
        'bg-[var(--bg-card)]',
        className,
      )}
      {...props}
    />
  );
}

function Header({
  className,
  children,
  glassEffect = true,
  ...props
}: React.ComponentProps<'div'> & { glassEffect?: boolean }) {
  return (
    <div
      className={cn(
        'relative mb-4 rounded-xl border border-[var(--border-base)] p-4',
        'bg-[var(--bg-muted)]',
        className,
      )}
      {...props}
    >
      {glassEffect && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-48 rounded-[inherit]"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 40%, rgba(0,0,0,0) 100%)',
          }}
        />
      )}
      {children}
    </div>
  );
}

function Plan({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('mb-6 flex items-center justify-between', className)} {...props} />
  );
}

function Description({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p className={cn('text-[var(--text-muted)] text-xs', className)} {...props} />
  );
}

function PlanName({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        "text-[var(--text-muted)] flex items-center gap-2 text-sm font-medium [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function Badge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'border border-[var(--color-primary)]/40 text-[var(--color-primary)] bg-[var(--color-primary-muted)] rounded-full px-2 py-0.5 text-[10px] font-semibold',
        className,
      )}
      {...props}
    />
  );
}

function Price({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('mb-3 flex items-end gap-1', className)} {...props} />
  );
}

function MainPrice({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('text-3xl font-extrabold tracking-tight text-[var(--text-base)]', className)}
      {...props}
    />
  );
}

function Period({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('text-[var(--text-muted)] pb-1 text-sm', className)}
      {...props}
    />
  );
}

function OriginalPrice({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('text-[var(--text-muted)] mr-1 ml-auto text-lg line-through', className)}
      {...props}
    />
  );
}

function Body({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('space-y-5 p-3', className)} {...props} />;
}

function List({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul className={cn('space-y-2.5', className)} {...props} />;
}

function ListItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      className={cn('text-[var(--text-muted)] flex items-start gap-2.5 text-sm', className)}
      {...props}
    />
  );
}

function Separator({
  children = 'Disponible con plan activo',
  className,
  ...props
}: React.ComponentProps<'div'> & { children?: string; className?: string }) {
  return (
    <div
      className={cn('text-[var(--text-muted)] flex items-center gap-3 text-xs', className)}
      {...props}
    >
      <span className="bg-[var(--border-base)] h-[1px] flex-1" />
      <span className="text-[var(--text-muted)] shrink-0">{children}</span>
      <span className="bg-[var(--border-base)] h-[1px] flex-1" />
    </div>
  );
}

export {
  Card,
  Header,
  Description,
  Plan,
  PlanName,
  Badge,
  Price,
  MainPrice,
  Period,
  OriginalPrice,
  Body,
  List,
  ListItem,
  Separator,
};
