import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'outline' | 'solid';
  className?: string;
}

export function Badge({ children, variant = 'solid', className = '' }: BadgeProps) {
  const baseStyles = "inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors";
  
  const variants = {
    solid: "bg-accent text-white shadow-sm",
    outline: "bg-transparent text-secondary border border-border"
  };

  return (
    <span className={`${baseStyles} ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
