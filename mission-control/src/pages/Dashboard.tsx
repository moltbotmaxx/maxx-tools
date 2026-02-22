import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Terminal,
  Activity,
  Cpu,
  ShieldAlert,
  Waves,
  Zap,
  ArrowUpRight,
  ChevronRight,
  X,
  FileText,
  MousePointer2
} from 'lucide-react';
import { missionApi } from '../services/api';
import { cn } from '../lib/utils';
import { useSwarmSocket } from '../hooks/useSwarmSocket';

const Dashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showLogDetail, setShowLogDetail] = useState(false);
  const navigate = useNavigate();

  const { connected, metrics, logs, abyssReport } = useSwarmSocket();

  useEffect(() => {
    missionApi.getData().then(d => {
      setData(d);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="h-full flex flex-col items-center justify-center gap-6">
      <div className="h-16 w-16 rounded-full border-t-2 border-accent animate-spin biolume-glow" />
      <div className="font-display text-lg font-black text-accent animate-pulse uppercase tracking-[0.5em]">Synchronizing Neural Link...</div>
    </div>
  );

  return (
    <div className="p-8 md:p-12 space-y-16 relative">

      {/* Abyss V3 Hero */}
      <section className="relative grid grid-cols-1 lg:grid-cols-12 gap-12 border-b border-white/5 pb-16">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center gap-3 text-accent/60">
            <span className="text-[10px] uppercase tracking-[0.4em] font-black">Submersible Command Unit</span>
            <div className="h-[1px] flex-1 bg-white/5" />
          </div>
          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-7xl md:text-[10rem] font-display font-black uppercase tracking-tighter leading-[0.85] text-white"
          >
            MOLT<span className="text-accent biolume-glow">.</span>🦀
          </motion.h1>
        </div>
        <div className="lg:col-span-4 flex flex-col justify-end gap-8 pb-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-chitin chitin-glow animate-pulse" />
              <p className="text-[9px] uppercase font-black tracking-widest text-chitin/60">Active Protocol</p>
            </div>
            <h2 className="text-2xl font-display font-bold uppercase tracking-tight text-white/90">
              {data.objectives.find((o: any) => o.kind === 'primary')?.title || 'ABYSSAL_SWARM'}
            </h2>
            <p className="text-sm font-sans font-medium text-primary/30 leading-relaxed max-w-sm italic">
              {data.objectives.find((o: any) => o.kind === 'primary')?.description || 'Autonomous deep-sea surveillance and orchestration.'}
            </p>
          </div>
        </div>
      </section>

      {/* Stats Matrix */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Neural Load" value={metrics ? `${metrics.cpuLoad}%` : "0%"} sub="Core Process" onClick={() => navigate('/swarm')} />
        <StatCard label="Krill Eaten" value={metrics ? `${(metrics.krillEaten / 1000).toFixed(1)}K` : "0K"} sub="Tokens Consumed" icon="🦐" />
        <StatCard label="Memory Depth" value={metrics ? `${(metrics.freemem / 1024 / 1024 / 1024).toFixed(1)}GB` : "0GB"} sub="Free Buffers" onClick={() => navigate('/tasks')} />
        <StatCard label="Sync State" value={connected ? "LOCKED" : "SYNC"} valueClass={connected ? "text-accent biolume-glow" : "text-chitin animate-pulse"} sub="Socket Bridge" onClick={() => navigate('/settings')} />
      </section>

      {/* Abyss Intelligence */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 abyss-card p-6 notch-clip">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[10px] uppercase tracking-[0.35em] font-black text-primary/30">Abyss Intelligence</h3>
            <span className="text-[10px] font-mono text-accent/60">{abyssReport?.generatedAt ? new Date(abyssReport.generatedAt).toLocaleTimeString() : 'No sync yet'}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Health" value={abyssReport ? `${abyssReport.healthScore}%` : '—'} sub="Abyss Score" valueClass={abyssReport && abyssReport.healthScore < 70 ? 'text-chitin' : 'text-accent'} />
            <StatCard label="Active Agents" value={abyssReport ? `${abyssReport.activeAgents}/${abyssReport.totalAgents}` : '—'} sub="Live Nodes" />
            <StatCard label="Avg Load" value={abyssReport ? `${abyssReport.avgLoad}%` : '—'} sub="Fleet Pressure" />
            <StatCard label="Token Delta" value={abyssReport ? `${abyssReport.tokenDelta >= 0 ? '+' : ''}${abyssReport.tokenDelta}` : '—'} sub="Last Sync" />
          </div>
        </div>

        <div className="lg:col-span-4 abyss-card p-6 notch-clip">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={14} className="text-chitin" />
            <h3 className="text-[10px] uppercase tracking-[0.35em] font-black text-primary/30">Abyss Alerts</h3>
          </div>
          <div className="space-y-2 text-xs">
            {abyssReport?.alerts?.length ? abyssReport.alerts.map((alert: string, idx: number) => (
              <div key={idx} className="border border-chitin/20 bg-chitin/5 px-3 py-2 rounded-lg text-chitin/90 font-mono">{alert}</div>
            )) : (
              <div className="border border-accent/20 bg-accent/5 px-3 py-2 rounded-lg text-accent/80 font-mono">No critical drift detected</div>
            )}
          </div>
        </div>
      </section>

      {/* Social Intel */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 abyss-card p-6 notch-clip">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] uppercase tracking-[0.35em] font-black text-primary/30">X / AI & Robotics</h3>
            <span className="text-[10px] font-mono text-accent/60">{data?.socialIntel?.x?.items?.length || 0} items</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {(data?.socialIntel?.x?.items || []).slice(0, 6).map((item: any, idx: number) => (
              <a key={idx} href={item.url} target="_blank" rel="noreferrer" className="block border border-white/10 hover:border-accent/40 transition-colors rounded-lg px-3 py-2">
                <div className="text-[11px] text-white/90 leading-snug">{item.title}</div>
                <div className="text-[10px] text-primary/30 mt-1 font-mono">@{item.author || item.account || 'unknown'}</div>
              </a>
            ))}
            {(!data?.socialIntel?.x?.items || data.socialIntel.x.items.length === 0) && (
              <div className="border border-chitin/20 bg-chitin/5 px-3 py-2 rounded-lg text-chitin/90 text-xs font-mono">No X intel yet</div>
            )}
          </div>
        </div>

        <div className="lg:col-span-6 abyss-card p-6 notch-clip">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] uppercase tracking-[0.35em] font-black text-primary/30">Reddit / AI Radar</h3>
            <span className="text-[10px] font-mono text-accent/60">{data?.socialIntel?.reddit?.items?.length || 0} items</span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {(data?.socialIntel?.reddit?.items || []).slice(0, 6).map((item: any, idx: number) => (
              <a key={idx} href={item.url} target="_blank" rel="noreferrer" className="block border border-white/10 hover:border-accent/40 transition-colors rounded-lg px-3 py-2">
                <div className="text-[11px] text-white/90 leading-snug">{item.title}</div>
                <div className="text-[10px] text-primary/30 mt-1 font-mono">r/{item.subreddit} · ▲{item.score || 0}</div>
              </a>
            ))}
            {(!data?.socialIntel?.reddit?.items || data.socialIntel.reddit.items.length === 0) && (
              <div className="border border-chitin/20 bg-chitin/5 px-3 py-2 rounded-lg text-chitin/90 text-xs font-mono">No Reddit intel yet</div>
            )}
          </div>
        </div>
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Objectives */}
        <div className="lg:col-span-7 space-y-8">
          <header className="flex justify-between items-center px-2">
            <h2 className="text-[10px] uppercase tracking-[0.3em] font-black text-primary/20 flex items-center gap-3">
              Milestones
            </h2>
            <button onClick={() => navigate('/objectives')} className="text-primary/20 hover:text-accent transition-colors flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
              View All <ArrowUpRight size={14} />
            </button>
          </header>

          <div className="grid grid-cols-1 gap-4">
            {data.objectives.map((obj: any) => (
              <div
                key={obj.id}
                onClick={() => navigate('/objectives')}
                className="abyss-card p-8 group cursor-pointer notch-clip hover:bg-white/[0.05] transition-all"
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-display font-black tracking-tight uppercase group-hover:text-accent transition-colors italic">{obj.title}</h3>
                  <span className="text-accent font-mono font-black text-sm biolume-glow">{obj.progress}%</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden relative border border-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${obj.progress}%` }}
                    className="h-full bg-accent biolume-glow"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Console */}
        <div className="lg:col-span-5 space-y-8">
          <header className="flex justify-between items-center px-2">
            <h2 className="text-[10px] uppercase tracking-[0.3em] font-black text-primary/20 flex items-center gap-3">
              Sonar Logs
            </h2>
            <button onClick={() => setShowLogDetail(true)} className="text-primary/20 hover:text-accent transition-colors">
              <ChevronRight size={16} />
            </button>
          </header>

          <div className="abyss-card p-6 font-mono text-[10px] h-[400px] overflow-y-auto custom-scrollbar flex flex-col gap-2 bg-black/20 notch-clip">
            {logs.map((log: string, idx: number) => {
              const isCrit = log.includes('ERR') || log.includes('crit') || log.includes('error');
              return (
                <div key={idx} className="flex gap-4 opacity-60 hover:opacity-100 transition-opacity">
                  <span className="text-primary/20 shrink-0 select-none">[{new Date().toISOString().split('T')[1].split('.')[0]}]</span>
                  <span className={cn(isCrit ? 'text-chitin' : 'text-accent/60')}>›</span>
                  <span className="text-primary/80 truncate leading-relaxed">{log}</span>
                </div>
              );
            })}
            <div className="flex gap-2 items-center text-accent/40 animate-pulse mt-auto">
              <span>_</span>
            </div>
          </div>
        </div>
      </div>

      {/* Log Modal */}
      <AnimatePresence>
        {showLogDetail && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLogDetail(false)}
              className="absolute inset-0 bg-background/90 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="w-full max-w-4xl abyss-card p-12 space-y-10 relative z-[110] notch-clip"
            >
              <button onClick={() => setShowLogDetail(false)} className="absolute top-8 right-8 text-primary/20 hover:text-white transition-colors">
                <X size={24} />
              </button>
              <header className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-accent/40">Neural Stream History</span>
                <h2 className="text-4xl font-display font-black uppercase tracking-tighter text-white">Console_Detailed</h2>
              </header>
              <div className="bg-black/40 border border-white/5 p-6 font-mono text-[11px] h-[450px] overflow-y-auto custom-scrollbar space-y-2 rounded-xl">
                {logs.map((log: string, idx: number) => (
                  <div key={idx} className="flex gap-4 border-b border-white/[0.03] pb-1 opacity-70">
                    <span className="text-primary/10">[{new Date().toISOString().split('T')[1].split('.')[0]}]</span>
                    <span className="text-primary/90">{log}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StatCard = ({ label, value, sub, onClick, valueClass }: any) => (
  <div
    onClick={onClick}
    className={cn(
      "abyss-card p-6 space-y-4 group transition-all hover:bg-white/[0.03] notch-clip",
      onClick && "cursor-pointer"
    )}
  >
    <div className="flex justify-between items-start">
      <span className="text-[9px] uppercase tracking-[0.3em] text-primary/20 font-black group-hover:text-accent/60 transition-colors uppercase">{label}</span>
      <div className="h-1.5 w-1.5 rounded-full bg-accent/20 group-hover:bg-accent group-hover:biolume-glow transition-all" />
    </div>
    <div className="space-y-1">
      <p className={cn("text-4xl font-display font-black tracking-tighter uppercase", valueClass || "text-white/90 group-hover:text-white transition-colors")}>{value}</p>
      <p className="text-[9px] font-mono text-primary/10 uppercase tracking-[0.2em]">{sub}</p>
    </div>
  </div>
);

export default Dashboard;
