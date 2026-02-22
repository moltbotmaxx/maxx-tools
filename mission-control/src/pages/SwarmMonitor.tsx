import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Cpu,
  Zap,
  Activity,
  ShieldCheck,
  Layers,
  Search,
  Code,
  X,
  AlertTriangle,
  RefreshCcw,
  Waves,
  Fingerprint,
  Box,
  Microscope,
  Database,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSwarmSocket } from '../hooks/useSwarmSocket';

const SwarmMonitor: React.FC = () => {
  const { connected, agents, metrics } = useSwarmSocket();
  const [selectedAgent, setSelectedAgent] = useState<any>(null);

  const error = !connected ? "Abyssal Sonar Lost. Attempting neural reconnection..." : null;
  const loading = connected && agents.length === 0;

  return (
    <div className="p-8 md:p-12 space-y-16 relative">
      <header className="flex justify-between items-end gap-12 border-b border-white/5 pb-10">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-accent/60">
            <Fingerprint size={18} />
            <span className="text-[10px] uppercase tracking-[0.4em] font-black">Neural Swarm Topology</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-display font-black uppercase tracking-tighter text-white leading-none italic">Swarm<span className="text-accent biolume-glow">Life</span> 🦑</h1>
        </div>
        <div
          className={cn(
            "px-5 py-3 notch-clip transition-all flex items-center gap-4",
            connected ? "bg-accent/5 border border-accent/20" : "bg-chitin/5 border border-chitin/20"
          )}
        >
          <div className={cn("h-2 w-2 rounded-full", connected ? "bg-accent biolume-glow" : "bg-chitin chitin-glow animate-pulse")} />
          <span className={cn("text-[10px] uppercase font-black tracking-[0.2em]", connected ? "text-accent" : "text-chitin")}>
            {connected ? 'LINK.ESTABLISHED' : 'LINK.RECONNECTING'}
          </span>
        </div>
      </header>

      {error ? (
        <div className="py-24 glass border-chitin/10 flex flex-col items-center gap-6 text-center notch-clip">
          <div className="h-16 w-16 rounded-full bg-chitin/5 border border-chitin/20 flex items-center justify-center">
            <AlertTriangle className="text-chitin" size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-display font-black uppercase tracking-tight text-white">Neural Drop-off</h2>
            <p className="text-primary/20 font-mono text-xs max-w-xs mx-auto">{error}</p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCcw size={12} className="text-accent/40 animate-spin" />
            <span className="text-[9px] font-mono text-accent/20 uppercase tracking-widest">Rescanning Abyss...</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full py-32 glass border-white/5 flex flex-col items-center gap-6 notch-clip">
              <RefreshCcw className="text-accent/20 animate-spin" size={48} />
              <div className="text-center space-y-2">
                <span className="text-sm uppercase tracking-[0.4em] text-accent/40 font-black block">Populating Ecosystem</span>
                <span className="text-[9px] font-mono text-primary/10 uppercase tracking-widest">Waiting for decentralized nodes to report...</span>
              </div>
            </div>
          ) : agents.map((agent, i) => (
            <motion.div
              layoutId={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={agent.id}
              className="abyss-card group cursor-pointer notch-clip hover:bg-white/[0.03] transition-all"
              onClick={() => setSelectedAgent(agent)}
            >
              <div className="p-8 space-y-8">
                <div className="flex justify-between items-start">
                  <div className={cn(
                    "h-12 w-12 rounded-lg flex items-center justify-center transition-all duration-500 bg-white/[0.03] border border-white/5",
                    agent.status === 'working' ? "border-accent/40 bg-accent/5 biolume-glow" : ""
                  )}>
                    <AgentIcon type={agent.type} name={agent.name} active={agent.status === 'working'} />
                  </div>
                  <div className="bg-white/5 px-3 py-1.5 notch-clip border border-white/5">
                    <span className={cn(
                      "text-[8px] font-black uppercase tracking-widest",
                      agent.status === 'working' ? "text-accent" : "text-primary/30"
                    )}>{agent.status}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-2xl font-display font-black uppercase tracking-tight text-white group-hover:text-accent transition-colors">{agent.name}</h3>
                  <div className="flex items-center gap-2">
                    <Box size={10} className="text-primary/10" />
                    <span className="text-[9px] font-mono text-primary/20 uppercase tracking-[0.4em] font-black">{agent.type}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-[8px] font-mono uppercase tracking-widest font-black text-primary/20">
                      <span>Neural Load</span>
                      <span className="text-accent">{agent.load}%</span>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${agent.load}%` }}
                        className={cn("h-full", agent.load > 85 ? "bg-chitin" : "bg-accent")}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-8 py-4 bg-white/[0.02] border-t border-white/5 flex justify-between items-center">
                <div className="flex gap-4">
                  <Activity size={14} className="text-primary/10 group-hover:text-accent/30 transition-colors" />
                  <Layers size={14} className="text-primary/10 group-hover:text-accent/30 transition-colors" />
                </div>
                <ChevronRight size={14} className="text-primary/10 group-hover:text-accent transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Stats Matrix */}
      <section className="relative pt-10">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <Metric label="Swarm Saturation" value={metrics ? `${metrics.cpuLoad}%` : "0%"} sub="Aggregate Neural Load" intensity={metrics && metrics.cpuLoad > 80 ? 'high' : 'normal'} />
          <Metric label="Active Nodes" value={agents.length} sub="Synchronized Units" />
          <Metric label="Buffer Capacity" value={metrics ? `${(metrics.freemem / 1024 / 1024 / 1024).toFixed(1)}GB` : "0GB"} sub="Free Neural Depth" />
          <Metric label="Krill Eaten" value={metrics ? `${(metrics.krillEaten / 1000).toFixed(0)}K` : "0K"} sub="Tokens Consumed" intensity="high" />
        </div>
      </section>

      {/* Modal Overlay */}
      <AnimatePresence>
        {selectedAgent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAgent(null)}
              className="absolute inset-0 bg-background/95 backdrop-blur-3xl"
            />
            <motion.div
              layoutId={selectedAgent.id}
              className="w-full max-w-4xl abyss-card p-12 md:p-16 space-y-12 relative z-[110] notch-clip overflow-hidden"
            >
              <div className="caustics-dynamic absolute inset-0 opacity-10" />
              <button
                onClick={() => setSelectedAgent(null)}
                className="absolute top-8 right-8 text-primary/20 hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <X size={24} />
              </button>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 relative z-10">
                <div className="lg:col-span-7 space-y-10">
                  <header className="space-y-4">
                    <div className="flex items-center gap-3 text-accent/60">
                      <AgentIcon type={selectedAgent.type} name={selectedAgent.name} size={18} active />
                      <span className="text-[10px] font-black uppercase tracking-[0.5em]">Node Identity Signature</span>
                    </div>
                    <h2 className="text-6xl font-display font-black uppercase tracking-tighter text-white italic">{selectedAgent.name}</h2>
                    <div className="flex gap-4">
                      <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-mono text-primary/40 uppercase tracking-widest">
                        {selectedAgent.type}
                      </div>
                      <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-mono text-primary/40 uppercase tracking-widest">
                        ID: {selectedAgent.id}
                      </div>
                    </div>
                  </header>

                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-primary/20 border-b border-white/5 pb-2">Active Logic Protocol</h3>
                    <p className="text-lg font-mono text-primary/80 italic leading-relaxed">
                      {selectedAgent.task || 'Awaiting command signals from centralized orchestrator...'}
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-10 border-l border-white/5 pl-10">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <span className="text-[10px] uppercase tracking-widest text-primary/20 font-black">Neural Heatrate</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-6xl font-display font-black text-accent">{selectedAgent.load}</span>
                        <span className="text-xl font-display font-black text-accent/20">%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${selectedAgent.load}%` }}
                          className="h-full bg-accent"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <span className="text-[10px] uppercase tracking-widest text-primary/20 font-black">Operational Buffer</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-display font-black text-white/40 italic">64.2</span>
                        <span className="text-sm font-display font-black text-white/10">MB/s</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-10 flex gap-4">
                    <button className="flex-1 px-8 py-4 bg-white/5 text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-white transition-all notch-clip">Deactivate</button>
                    <button className="flex-1 px-8 py-4 bg-accent text-[#020617] text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 transition-all notch-clip">Recalibrate</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AgentIcon = ({ type, name, size = 20, active = false }: any) => {
  if (type === 'orchestrator') return <Cpu size={size} className={active ? 'text-accent' : 'text-primary/20'} />;
  if (name?.includes('Research')) return <Microscope size={size} className={active ? 'text-accent' : 'text-primary/20'} />;
  if (name?.includes('Data')) return <Database size={size} className={active ? 'text-accent' : 'text-primary/20'} />;
  return <Code size={size} className={active ? 'text-accent' : 'text-primary/20'} />;
};

const Metric = ({ label, value, sub, intensity }: any) => (
  <div className="space-y-3 group">
    <div className="flex items-center gap-3">
      <span className={cn("text-[9px] uppercase tracking-[0.4em] font-black", intensity === 'high' ? "text-chitin" : "text-primary/20")}>{label}</span>
      <div className={cn("h-[1px] flex-1 bg-white/5 group-hover:bg-accent/20 transition-colors", intensity === 'high' && "bg-chitin/20")} />
    </div>
    <div className="space-y-1">
      <span className={cn("text-5xl font-display font-black tracking-tighter italic leading-none", intensity === 'high' ? 'text-chitin' : 'text-white/90')}>{value}</span>
      <p className="text-[8px] font-mono uppercase tracking-widest text-primary/10">{sub}</p>
    </div>
  </div>
);

export default SwarmMonitor;
