/**
 * Tarjeta de plan (compuesta). En Calor: tarjeta con sombra y sin bordes; el
 * precio va en Bricolage y manda por tamaño.
 */
import React from 'react';
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('card relative w-full', className)}
      {...props}
    />
  );
}

function Header({
  className,
  children,
  // Se conserva la prop por compatibilidad; ya no pinta nada.
  glassEffect: _glassEffect = true,
  ...props
}: React.ComponentProps<'div'> & { glassEffect?: boolean }) {
  return (
    <div className={cn('relative p-5', className)} {...props}>
      {children}
    </div>
  );
}

function Plan({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-4 flex items-center justify-between gap-3', className)} {...props} />;
}

function Description({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-ink-muted', className)} {...props} />;
}

function PlanName({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-base font-semibold text-ink [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-ink-muted",
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
        'inline-flex h-6 items-center rounded-full bg-[var(--signal-ok-bg)] px-2.5 text-xs font-semibold text-[var(--signal-ok)]',
        className,
      )}
      {...props}
    />
  );
}

function Price({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-2 flex items-baseline gap-1.5', className)} {...props} />;
}

function MainPrice({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn('num text-[34px] leading-none text-ink', className)}
      {...props}
    />
  );
}

function Period({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('text-sm text-ink-muted', className)} {...props} />;
}

function OriginalPrice({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span className={cn('ml-auto mr-1 font-mono text-lg text-ink-muted line-through tabular-nums', className)} {...props} />
  );
}

function Body({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('space-y-4 border-t border-line/60 p-5', className)} {...props} />;
}

function List({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul className={cn('space-y-2.5', className)} {...props} />;
}

function ListItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li className={cn('flex items-start gap-2.5 text-sm text-ink-muted', className)} {...props} />;
}

function Separator({
  children = 'Disponible con plan activo',
  className,
  ...props
}: React.ComponentProps<'div'> & { children?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 text-xs text-ink-muted', className)} {...props}>
      <span className="h-px flex-1 bg-line" />
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-line" />
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
