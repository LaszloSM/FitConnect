'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface EmptyStateActionProps {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateActionProps | React.ReactNode;
  className?: string;
}

const DefaultEmptyStateIcon = () => (
  <svg
    width="80"
    height="80"
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="text-[oklch(0.75_0.08_264)]"
  >
    <rect x="8" y="36" width="64" height="8" rx="4" fill="currentColor" opacity="0.15" />
    <rect x="8" y="28" width="16" height="24" rx="6" fill="currentColor" opacity="0.2" />
    <rect x="56" y="28" width="16" height="24" rx="6" fill="currentColor" opacity="0.2" />
    <rect x="2" y="32" width="12" height="16" rx="4" fill="currentColor" opacity="0.3" />
    <rect x="66" y="32" width="12" height="16" rx="4" fill="currentColor" opacity="0.3" />
  </svg>
);

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  const isActionObject = action && typeof action === 'object' && 'label' in action;

  return (
    <motion.div
      className={`flex flex-col items-center justify-center min-h-[200px] py-12 ${className}`}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="mb-4">
        {icon || <DefaultEmptyStateIcon />}
      </div>
      <h2 className="text-base font-semibold text-[var(--text-base)] mb-2">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-[var(--text-muted)] text-center max-w-xs mb-6">
          {description}
        </p>
      )}
      {action && (
        <div>
          {isActionObject ? (
            <Button
              onClick={(action as EmptyStateActionProps).onClick}
              variant="default"
            >
              {(action as EmptyStateActionProps).label}
            </Button>
          ) : (
            action
          )}
        </div>
      )}
    </motion.div>
  );
}
