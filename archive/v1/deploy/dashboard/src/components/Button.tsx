import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'text' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md',
  className = '', 
  ...props 
}: ButtonProps) {
  
  const baseStyles = "inline-flex items-center justify-center font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-dark shadow-sm",
    secondary: "bg-card text-primary border border-border hover:bg-subtle shadow-sm",
    outline: "bg-transparent text-primary border border-border hover:bg-subtle",
    text: "bg-transparent text-accent hover:text-accent-dark hover:underline p-0",
    ghost: "bg-transparent text-secondary hover:bg-subtle hover:text-primary",
  };

  const sizes = {
    sm: "text-xs px-3 py-1.5 rounded-lg",
    md: "text-sm px-5 py-2.5 rounded-xl",
    lg: "text-base px-6 py-3.5 rounded-xl",
  };

  // Text variant shouldn't have standard padding/radius
  if (variant === 'text') {
    return (
      <button
        className={`${baseStyles} ${variants[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
