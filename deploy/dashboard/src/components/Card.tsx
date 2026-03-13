import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  variant?: 'elevated' | 'flat';
  action?: React.ReactNode;
  noPadding?: boolean;
}

export function Card({ children, className = '', title, variant = 'elevated', action, noPadding = false }: CardProps) {
  const baseStyles = "bg-card overflow-hidden transition-all duration-200";
  
  const variants = {
    elevated: "rounded-2xl shadow-card border border-border",
    flat: "rounded-xl border border-border shadow-none"
  };

  return (
    <div className={`${baseStyles} ${variants[variant]} ${className}`}>
      {title && (
        <div className="px-6 py-5 border-b border-border flex justify-between items-center">
          <h2 className="text-lg font-serif font-medium text-primary">{title}</h2>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-6'}>
        {children}
      </div>
    </div>
  );
}
