import React from 'react';
import { cn } from '../utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className, onClick, ...rest }) => {
  return (
    <div
      onClick={onClick}
      {...rest}
      className={cn(
        'bg-warm-card rounded-2xl p-4 shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-nook-sand/30 transition-all duration-200',
        onClick && 'cursor-pointer active:scale-[0.98] hover:shadow-md',
        className
      )}
    >
      {children}
    </div>
  );
};
