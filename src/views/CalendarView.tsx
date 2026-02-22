import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { repository } from '../services/repository';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';

export const CalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const tasks = useLiveQuery(() => repository.getAllTasks());

  if (!tasks) return null;

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const tasksForSelectedDate = tasks.filter(t => 
    t.dueDate && isSameDay(new Date(t.dueDate), selectedDate) && t.status !== 'done'
  );

  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  return (
    <div className="p-6 pb-32 space-y-8 safe-top">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold text-nook-ink">
          {format(currentDate, 'MMMM yyyy')}
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="icon" onClick={prevMonth}><ChevronLeft size={20} /></Button>
          <Button variant="secondary" size="icon" onClick={nextMonth}><ChevronRight size={20} /></Button>
        </div>
      </header>

      <div className="grid grid-cols-7 gap-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
          <div key={day} className="text-center text-[10px] font-bold text-nook-ink/30 uppercase py-2">
            {day}
          </div>
        ))}
        {days.map(day => {
          const hasTasks = tasks.some(t => t.dueDate && isSameDay(new Date(t.dueDate), day) && t.status !== 'done');
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={day.toString()}
              onClick={() => setSelectedDate(day)}
              className={cn(
                "aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all relative",
                isSelected ? "bg-nook-orange text-white shadow-lg scale-105 z-10" : "bg-nook-sand/20 text-nook-ink",
                isToday && !isSelected && "border-2 border-nook-orange/30"
              )}
            >
              <span className="text-sm font-bold">{format(day, 'd')}</span>
              {hasTasks && (
                <div className={cn(
                  "w-1 h-1 rounded-full",
                  isSelected ? "bg-white" : "bg-nook-orange"
                )} />
              )}
            </button>
          );
        })}
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-nook-ink/40 px-1">
          Tasks for {format(selectedDate, 'MMM do')}
        </h2>
        <div className="space-y-3">
          {tasksForSelectedDate.length > 0 ? (
            tasksForSelectedDate.map(task => (
              <Card key={task.id} className="flex items-center gap-3 py-3">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  task.isUrgent ? "bg-red-500" : "bg-nook-orange"
                )} />
                <span className="font-bold text-nook-ink">{task.title}</span>
              </Card>
            ))
          ) : (
            <div className="py-10 text-center opacity-30 italic text-sm">
              No tasks due today. Relax!
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
