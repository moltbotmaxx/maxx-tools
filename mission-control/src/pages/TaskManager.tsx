import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  CheckCircle2,
  Filter,
  User,
  Tag,
  Waves,
  ChevronRight,
  ArrowRight,
  Play,
  Clock,
  Archive,
  Star,
  Move,
  Layout,
  Activity
} from 'lucide-react';
import { missionApi } from '../services/api';
import { cn } from '../lib/utils';

const TaskManager: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const fetchTasks = async () => {
    try {
      const data = await missionApi.getData();
      setTasks(data.tasks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, []);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask = {
      title: newTaskTitle,
      status: 'wait',
      owner: 'Maxx',
      priority: 'medium',
      approved: true,
      category: 'GENERAL'
    };

    await missionApi.addTask(newTask);
    setNewTaskTitle('');
    fetchTasks();
  };

  const updateTaskStatus = async (id: string, nextStatus: string) => {
    await missionApi.updateTask(id, { status: nextStatus });
    fetchTasks();
  };

  const deleteTask = async (id: string) => {
    await missionApi.deleteTask(id);
    fetchTasks();
  };

  const categories = {
    strategic: [
      { id: 'prio', label: '🦀 PRIORITY CLAW', icon: Star, color: 'text-accent' },
      { id: 'wait', label: '🦐 PENDING PRAWN', icon: Clock, color: 'text-primary/40' },
      { id: 'not_now', label: '🐚 SHELL ARCHIVE', icon: Archive, color: 'text-primary/20' },
    ],
    execution: [
      { id: 'in_progress', label: '🦞 LOBSTER SURGE', icon: Play, color: 'text-chitin' },
      { id: 'done', label: '🦑 INKED DONE', icon: CheckCircle2, color: 'text-accent/40' },
    ]
  };

  const allColumns = [...categories.strategic, ...categories.execution];

  return (
    <div className="p-8 md:p-12 space-y-16 relative">
      <header className="space-y-4 border-b border-white/5 pb-10">
        <div className="flex items-center gap-3 text-accent/60">
          <Layout size={18} />
          <span className="text-[10px] uppercase tracking-[0.4em] font-black italic">Mission Control Protocols</span>
        </div>
        <h1 className="text-6xl md:text-8xl font-display font-black uppercase tracking-tighter text-white leading-none">Task<span className="text-accent biolume-glow">Claw</span> 🦞</h1>
      </header>

      <form onSubmit={handleAddTask} className="relative group max-w-4xl mx-auto">
        <div className="absolute inset-0 bg-accent/5 blur-3xl group-focus-within:bg-accent/10 transition-colors" />
        <div className="relative flex gap-1 abyss-card p-1.5 notch-clip bg-white/[0.02]">
          <input
            className="flex-1 bg-transparent px-6 py-4 outline-none font-display text-xl md:text-2xl font-black uppercase tracking-tight text-white placeholder:text-primary/10 italic"
            placeholder="Log new mission directive..."
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
          />
          <button className="bg-white/10 px-8 py-4 font-black uppercase tracking-[0.3em] text-[10px] text-white hover:bg-white/20 transition-all notch-clip">
            Transmit
          </button>
        </div>
      </form>

      {loading ? (
        <div className="py-20 text-center">
          <RefreshCcw className="h-10 w-10 text-accent/20 animate-spin mx-auto mb-4" />
          <span className="font-display text-lg font-black text-accent/20 uppercase tracking-[0.4em]">Calibrating Spine...</span>
        </div>
      ) : (
        <div className="space-y-24">
          {/* USER QUEUE */}
          <section className="space-y-8">
            <header className="flex items-center gap-4">
              <div className="h-1.5 w-1.5 rounded-full bg-accent/40" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-primary/20">Strategic Protocol Queue</h2>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {categories.strategic.map(col => (
                <KanbanColumn
                  key={col.id}
                  {...col}
                  tasks={tasks.filter(t => t.status === col.id)}
                  onUpdateStatus={updateTaskStatus}
                  onDelete={deleteTask}
                  allColumns={allColumns}
                />
              ))}
            </div>
          </section>

          {/* AGENT LOG */}
          <section className="space-y-8">
            <header className="flex items-center gap-4 text-chitin/40">
              <div className="h-1.5 w-1.5 rounded-full bg-chitin/40" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.5em]">Agent Execution Spine</h2>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {categories.execution.map(col => (
                <KanbanColumn
                  key={col.id}
                  {...col}
                  tasks={tasks.filter(t => t.status === col.id)}
                  onUpdateStatus={updateTaskStatus}
                  onDelete={deleteTask}
                  allColumns={allColumns}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

const KanbanColumn = ({ id, label, icon: Icon, color, tasks, onUpdateStatus, onDelete, allColumns }: any) => {
  return (
    <div className="space-y-6 flex flex-col">
      <header className="flex items-center justify-between px-2 pb-2 border-b border-white/5">
        <div className="flex items-center gap-3">
          <Icon className={cn(color)} size={14} />
          <h3 className={cn("text-[9px] font-black uppercase tracking-[0.4em]", color)}>{label}</h3>
        </div>
        <span className="text-[9px] font-mono text-primary/10 font-black italic">[{tasks.length}]</span>
      </header>

      <div className="space-y-3 flex-1">
        <AnimatePresence mode="popLayout">
          {tasks.map((task: any) => (
            <motion.div
              layoutId={task.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              key={task.id}
              className="abyss-card p-6 group border-white/5 hover:border-white/10 transition-all cursor-default notch-clip"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <h4 className={cn(
                    "text-xl font-display font-black uppercase tracking-tight italic transition-colors leading-[1.1]",
                    task.status === 'done' ? "text-primary/10" : "text-white/80"
                  )}>
                    {task.title}
                  </h4>
                  <div className="flex gap-1 shrink-0">
                    <StatusMenu task={task} onUpdate={onUpdateStatus} columns={allColumns} />
                  </div>
                </div>

                <div className="flex justify-between items-center text-[8px] font-mono uppercase tracking-widest text-primary/20">
                  <div className="flex items-center gap-2">
                    <User size={10} className="text-accent/40" />
                    <span className="font-black">{task.owner}</span>
                  </div>
                  <button
                    onClick={() => onDelete(task.id)}
                    className="p-1 hover:text-chitin transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {tasks.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center opacity-[0.03] border-2 border-dashed border-white/10 notch-clip gap-2">
            <Waves size={24} />
            <span className="text-[8px] font-black uppercase tracking-widest">Zone Idle</span>
          </div>
        )}
      </div>
    </div>
  );
};

const StatusMenu = ({ task, onUpdate, columns }: any) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 hover:text-accent transition-colors bg-white/[0.03] rounded-md hover:bg-white/[0.08]"
      >
        <Move size={12} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60]"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 top-full mt-2 w-44 bg-[#080c1d] border border-white/10 p-1.5 z-[70] notch-clip shadow-2xl"
            >
              <div className="text-[7px] font-black uppercase tracking-[0.4em] text-primary/20 px-2 py-1.5 mb-1 select-none">Route Subprocess</div>
              {columns.map((col: any) => (
                <button
                  key={col.id}
                  disabled={task.status === col.id}
                  onClick={() => {
                    onUpdate(task.id, col.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-[9px] uppercase font-black tracking-widest transition-colors flex items-center gap-3",
                    task.status === col.id ? "opacity-20 cursor-not-allowed" : "hover:bg-white/5 text-primary/60 hover:text-accent"
                  )}
                >
                  <col.icon size={10} />
                  {col.label}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const RefreshCcw = ({ className, size = 16 }: any) => <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} className={className}><Activity size={size} /></motion.div>;

export default TaskManager;
