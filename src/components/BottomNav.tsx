import React from 'react';
import { Home, ListTodo, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../utils/cn';

export type TabType = 'home' | 'tasks' | 'calendar';

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'tasks', label: 'Tasks', icon: ListTodo },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-warm-card border-t border-nook-sand/50 px-6 py-3 safe-bottom flex justify-around items-center z-40">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            'flex flex-col items-center gap-1 transition-all duration-200',
            activeTab === id ? 'text-nook-orange scale-110' : 'text-nook-ink/40'
          )}
        >
          <Icon size={24} strokeWidth={activeTab === id ? 2.5 : 2} />
          <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        </button>
      ))}
    </nav>
  );
};
