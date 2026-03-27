import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[rgb(var(--primary))] text-[rgb(var(--primary-foreground))]',
        secondary:
          'border-transparent bg-[rgb(var(--secondary))] text-[rgb(var(--secondary-foreground))]',
        destructive:
          'border-transparent bg-[rgb(var(--destructive))] text-[rgb(var(--destructive-foreground))]',
        outline: 'text-[rgb(var(--foreground))]',
        pending:   'border-transparent bg-[rgb(var(--color-waiting)/0.2)] text-[rgb(var(--color-waiting))]',
        spawned:   'border-transparent bg-[rgb(var(--color-working)/0.2)] text-[rgb(var(--color-working))]',
        coding:    'border-transparent bg-[rgb(var(--color-working)/0.2)] text-[rgb(var(--color-working))]',
        pr_open:   'border-transparent bg-[rgb(var(--color-review)/0.2)] text-[rgb(var(--color-review))]',
        ci_pending:'border-transparent bg-[rgb(var(--color-waiting)/0.2)] text-[rgb(var(--color-waiting))]',
        review:    'border-transparent bg-[rgb(var(--color-review)/0.2)] text-[rgb(var(--color-review))]',
        merged:    'border-transparent bg-[rgb(var(--color-done)/0.2)] text-[rgb(var(--color-done))]',
        failed:    'border-transparent bg-[rgb(var(--color-danger)/0.2)] text-[rgb(var(--color-danger))]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
