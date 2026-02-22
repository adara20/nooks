import { useState, useEffect } from 'react';
import { repository } from './services/repository';
import { BottomNav, type TabType } from './components/BottomNav';
import { HomeView } from './views/HomeView';
import { TasksView } from './views/TasksView';
import { CalendarView } from './views/CalendarView';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      await repository.seedIfEmpty();
      setIsInitialized(true);
    };
    init();
  }, []);

  const navigateToTasks = (filter: string | null) => {
    setStatusFilter(filter);
    setActiveTab('tasks');
  };

  if (!isInitialized) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-warm-bg">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-nook-orange rounded-2xl animate-bounce mx-auto flex items-center justify-center text-white text-3xl font-display font-bold">
            N
          </div>
          <p className="font-display font-bold text-nook-ink/40 animate-pulse">Finding your nooks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-md mx-auto bg-warm-bg relative overflow-x-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'home' && <HomeView onNavigateToTasks={navigateToTasks} />}
          {activeTab === 'tasks' && (
            <TasksView 
              initialStatusFilter={statusFilter} 
              onClearFilter={() => setStatusFilter(null)} 
              onFilterChange={setStatusFilter}
            />
          )}
          {activeTab === 'calendar' && <CalendarView />}
        </motion.div>
      </AnimatePresence>

      <BottomNav 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'tasks') setStatusFilter(null);
        }} 
      />
    </div>
  );
}
