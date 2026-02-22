import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  Trophy,
  Activity,
  ChevronRight,
  Shield,
  Layers,
  ArrowRight,
  Plus,
  X,
  Zap,
  Waves
} from 'lucide-react';
import { missionApi } from '../services/api';
import { cn } from '../lib/utils';

const Objectives: React.FC = () => {
  const [objectives, setObjectives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedObjective, setSelectedObjective] = useState<any>(null);

  useEffect(() => {
    missionApi.getData().then(d => {
      setObjectives(d.objectives || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-8 md:p-12 space-y-16 relative">
      <header className="space-y-4 border-b border-white/5 pb-10">
        <div className="flex items-center gap-3 text-accent/60">
          <Target size={18} />
          <span className="text-[10px] uppercase tracking-[0.4em] font-black italic">Neural Vectoring</span>
        </div>
        <h1 className="text-6xl md:text-8xl font-display font-black uppercase tracking-tighter text-white leading-none">Objective<span className="text-accent biolume-glow">Grid</span> 🐚</h1>
      </header>

      {loading ? (
        <div className="py-20 text-center">
          <Waves className="h-10 w-10 text-accent/20 animate-pulse-slow mx-auto mb-4" />
          <span className="font-display text-lg font-black text-accent/20 uppercase tracking-[0.4em]">Resolving Vectors...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {objectives.map((obj, i) => (
            <motion.section
              layoutId={obj.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              key={obj.id}
              className="abyss-card p-10 group cursor-pointer notch-clip hover:bg-white/[0.03] transition-all"
              onClick={() => setSelectedObjective(obj)}
            >
              <div className="space-y-8">
                <div className="flex justify-between items-start">
                  <div className={cn(
                    "h-12 w-12 rounded-lg flex items-center justify-center border border-white/5 bg-white/[0.02] transition-colors group-hover:bg-accent/5 group-hover:border-accent/20",
                    obj.progress === 100 && "bg-accent/10 border-accent/40"
                  )}>
                    <Trophy size={18} className={obj.progress === 100 ? "text-accent" : "text-primary/20 group-hover:text-accent/60"} />
                  </div>
                  <div className="text-[9px] font-mono text-primary/10 uppercase tracking-widest font-black">
                    Stage: {obj.id}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-3xl font-display font-black uppercase tracking-tighter text-white group-hover:text-accent transition-colors leading-none">{obj.title}</h3>
                  <p className="text-sm font-sans font-medium text-primary/30 leading-relaxed max-w-sm italic">
                    {obj.description}
                  </p>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="flex justify-between items-end text-[9px] font-mono uppercase tracking-[0.2em] font-black">
                    <span className="text-primary/20">Vector Synchronization</span>
                    <span className="text-accent">{obj.progress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${obj.progress}%` }}
                      className="h-full bg-accent biolume-glow"
                    />
                  </div>
                </div>
              </div>
            </motion.section>
          ))}
        </div>
      )}

      {/* Details Modal */}
      <AnimatePresence>
        {selectedObjective && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedObjective(null)}
              className="absolute inset-0 bg-background/95 backdrop-blur-3xl"
            />
            <motion.div
              layoutId={selectedObjective.id}
              className="w-full max-w-4xl abyss-card p-12 md:p-16 space-y-12 relative z-[110] notch-clip overflow-hidden"
            >
              <div className="caustics-dynamic absolute inset-0 opacity-10" />
              <button onClick={() => setSelectedObjective(null)} className="absolute top-8 right-8 text-primary/20 hover:text-white transition-colors">
                <X size={24} />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-12 relative z-10">
                <div className="space-y-10">
                  <header className="space-y-4">
                    <div className="flex items-center gap-3 text-accent/60">
                      <Shield size={18} />
                      <span className="text-[10px] font-black uppercase tracking-[0.5em]">Primary Directive Analysis</span>
                    </div>
                    <h2 className="text-6xl font-display font-black uppercase tracking-tighter text-white italic leading-tight">{selectedObjective.title}</h2>
                  </header>

                  <div className="bg-black/40 border border-white/5 p-6 rounded-xl space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-accent/40">Mission Description</h3>
                    <p className="text-sm font-sans font-medium text-primary/60 leading-relaxed italic">
                      {selectedObjective.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-10 border-l border-white/5 pl-10">
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <span className="text-[10px] uppercase font-black tracking-widest text-primary/20">Completion Vector</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-6xl font-display font-black text-white">{selectedObjective.progress}</span>
                        <span className="text-xl font-display font-black text-accent/30">%</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <span className="text-[10px] uppercase font-black tracking-widest text-primary/20">Strategic Methodology</span>
                      <div className="p-5 bg-white/[0.02] border border-white/5 text-[10px] font-mono text-primary/30 uppercase tracking-widest leading-loose italic rounded-lg">
                        - Recursive Sub-agent Deployment<br />
                        - Real-time Depth Synchronization<br />
                        - Chitinous Encryption Handshake
                      </div>
                    </div>
                  </div>

                  <button className="w-full px-10 py-5 bg-accent text-[#020617] text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 transition-all notch-clip">
                    Recalibrate Objective
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Objectives;
