import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ListTodo,
  Target,
  Bot,
  Settings as SettingsIcon,
  Shield,
  Activity
} from 'lucide-react';
import { cn } from './lib/utils';
import Dashboard from './pages/Dashboard';
import TaskManager from './pages/TaskManager';
import Objectives from './pages/Objectives';
import SwarmMonitor from './pages/SwarmMonitor';
import Settings from './pages/Settings';
import BubbleOverlay from './components/BubbleOverlay';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="h-screen bg-background text-primary font-sans antialiased flex overflow-hidden relative">
        {/* Undersea Layers */}
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute inset-0 bg-[#020617]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,#082f49_0%,transparent_100%)] opacity-60" />
          <BubbleOverlay />
          <div className="caustics-dynamic absolute inset-0 opacity-20 scale-150" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.8\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E')] opacity-[0.03] mix-blend-overlay" />
        </div>

        {/* Sidebar Navigation: The Nerve Spine */}
        <aside className="w-20 md:w-64 border-r border-accent/10 flex flex-col items-center md:items-stretch bg-surface/20 backdrop-blur-3xl relative z-40">
          <div className="p-8 flex items-center gap-3">
            <div className="h-10 w-10 bg-accent/20 border border-accent/30 rounded-full flex items-center justify-center biolume-glow">
              <span className="text-lg">🦀</span>
            </div>
            <div className="hidden md:block">
              <span className="font-display font-black tracking-tighter uppercase text-xl block leading-none text-white">Abyss</span>
              <span className="text-[9px] uppercase tracking-[0.3em] text-accent/60 font-black">Crustacean Hub</span>
            </div>
          </div>

          <nav className="flex-1 px-4 py-8 space-y-4">
            <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Surface" />
            <NavItem to="/tasks" icon={<ListTodo size={20} />} label="Neural Web" />
            <NavItem to="/objectives" icon={<Target size={20} />} label="Deep Scan" />
            <NavItem to="/swarm" icon={<Bot size={20} />} label="Swarm Life" />
          </nav>

          <div className="p-4 border-t border-accent/10 space-y-4">
            <NavItem to="/settings" icon={<SettingsIcon size={20} />} label="Hatch" />
            <div className="px-4 py-3 bg-accent/5 border border-accent/10 rounded-xl relative overflow-hidden group">
              <div className="caustics opacity-20" />
              <div className="flex items-center gap-3 relative z-10">
                <Activity className="text-accent animate-pulse-slow" size={16} />
                <div className="hidden md:block">
                  <p className="text-[10px] uppercase font-black tracking-widest text-accent/60">Ecosystem</p>
                  <p className="text-[11px] font-mono text-cyan-200/80">SYMBIOTIC</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 relative overflow-y-auto custom-scrollbar z-10">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tasks" element={<TaskManager />} />
            <Route path="/objectives" element={<Objectives />} />
            <Route path="/swarm" element={<SwarmMonitor />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

const NavItem = ({ to, icon, label }: { to: string, icon: React.ReactNode, label: string }) => {
  const location = useLocation();
  const active = location.pathname === to;

  return (
    <NavLink
      to={to}
      className={cn(
        "flex items-center gap-4 px-4 py-4 rounded-2xl transition-all group relative overflow-hidden",
        active ? "text-white" : "text-primary/20 hover:text-accent hover:bg-accent/5"
      )}
    >
      <div className={cn("relative z-10 transition-transform group-hover:scale-110", active && "biolume-glow")}>{icon}</div>
      <span className="hidden md:block relative z-10 font-black uppercase tracking-widest text-[10px]">{label}</span>
      <AnimatePresence>
        {active && (
          <motion.div
            layoutId="nav-active"
            className="absolute inset-0 bg-accent/20 border border-accent/30 z-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
          >
            <div className="caustics opacity-10" />
          </motion.div>
        )}
      </AnimatePresence>
    </NavLink>
  );
};

export default App;
