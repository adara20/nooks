import React from 'react';
import { cn } from '../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-nook-orange text-white hover:bg-nook-orange/90 shadow-sm active:scale-95',
      secondary: 'bg-nook-sand text-nook-ink hover:bg-nook-sand/80 active:scale-95',
      ghost: 'bg-transparent text-nook-ink hover:bg-nook-sand/50 active:scale-95',
      danger: 'bg-red-500 text-white hover:bg-red-600 active:scale-95',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm rounded-lg',
      md: 'px-4 py-2 rounded-xl font-medium',
      lg: 'px-6 py-3 text-lg rounded-2xl font-semibold',
      icon: 'p-2 rounded-full',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
