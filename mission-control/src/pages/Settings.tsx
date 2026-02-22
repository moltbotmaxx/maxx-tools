import React from 'react';
import {
   Settings as SettingsIcon,
   Shield,
   Database,
   Zap,
   Wifi,
   Lock,
   Fingerprint,
   Cpu,
   Layers,
   ChevronRight,
   MousePointer2
} from 'lucide-react';
import { cn } from '../lib/utils';

const Settings: React.FC = () => {
   return (
      <div className="p-8 md:p-12 space-y-16 relative">
         <header className="space-y-4 border-b border-white/5 pb-10">
            <div className="flex items-center gap-3 text-accent/60">
               <SettingsIcon size={18} />
               <span className="text-[10px] uppercase tracking-[0.4em] font-black italic">System Infrastructure</span>
            </div>
            <h1 className="text-6xl md:text-8xl font-display font-black uppercase tracking-tighter text-white leading-none">Kernel<span className="text-accent biolume-glow">Config</span> 🦀</h1>
         </header>

         <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Core Settings */}
            <div className="lg:col-span-7 space-y-12">
               <div className="space-y-8">
                  <header className="flex items-center gap-4">
                     <div className="h-1.5 w-1.5 rounded-full bg-accent/40" />
                     <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-primary/20">Operational Parameters</h2>
                  </header>

                  <div className="grid grid-cols-1 gap-4">
                     <ConfigField label="Sonar Bridge URL" value="ws://localhost:3001" icon={Wifi} />
                     <ConfigField label="Neural Buffer Depth" value="4096 KB" icon={Database} />
                     <ConfigField label="Swarm Concurrency" value="12 Nodes" icon={Cpu} />
                     <ConfigField label="Protocol Encryption" value="🦀.Strict" icon={Shield} />
                  </div>
               </div>

               <div className="space-y-8">
                  <header className="flex items-center gap-4">
                     <div className="h-1.5 w-1.5 rounded-full bg-chitin/40" />
                     <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-primary/20">Chitin Security Tier</h2>
                  </header>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     <div className="abyss-card p-8 space-y-6 group notch-clip bg-white/[0.02] hover:bg-white/[0.05] transition-all">
                        <div className="flex justify-between items-start">
                           <span className="text-[9px] uppercase tracking-[0.3em] text-primary/20 font-black">Bio-Encryption</span>
                           <Lock size={16} className="text-accent/40" />
                        </div>
                        <div className="space-y-1">
                           <p className="text-3xl font-display font-black uppercase tracking-tight text-white leading-none">AES.256</p>
                           <p className="text-[9px] font-mono text-accent/20 uppercase tracking-[0.2em] font-black">Live Tunneling</p>
                        </div>
                     </div>
                     <div className="abyss-card p-8 space-y-6 group notch-clip bg-white/[0.02] hover:bg-white/[0.05] transition-all">
                        <div className="flex justify-between items-start">
                           <span className="text-[9px] uppercase tracking-[0.3em] text-primary/20 font-black">Pressure Guard</span>
                           <Fingerprint size={16} className="text-chitin/40" />
                        </div>
                        <div className="space-y-1">
                           <p className="text-3xl font-display font-black uppercase tracking-tight text-white leading-none">ENABLED</p>
                           <p className="text-[9px] font-mono text-chitin/20 uppercase tracking-[0.2em] font-black">Active Intrusion Defense</p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            {/* Persistence & Actions */}
            <div className="lg:col-span-5 space-y-12">
               <div className="space-y-8">
                  <header className="flex items-center gap-4">
                     <div className="h-1.5 w-1.5 rounded-full bg-accent/30" />
                     <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-primary/20">Data Depth Persistence</h2>
                  </header>

                  <div className="abyss-card p-10 space-y-8 group notch-clip bg-accent/[0.02] border-accent/10">
                     <div className="flex items-center gap-6">
                        <div className="h-14 w-14 bg-accent/20 border border-accent/20 rounded-xl flex items-center justify-center biolume-glow">
                           <Zap className="text-accent" size={24} />
                        </div>
                        <div className="space-y-1">
                           <h3 className="text-xl font-display font-black uppercase tracking-tight text-white">Buffer Bridge</h3>
                           <p className="text-[9px] font-mono text-accent/40 uppercase tracking-widest font-black">Instant State Sync</p>
                        </div>
                     </div>
                     <p className="text-sm font-sans font-medium text-primary/30 leading-relaxed italic">
                        Synchronize the current swarm state across all decentralized nodes in the Abyssal network. Irreversible after commit.
                     </p>
                     <button className="w-full py-5 bg-accent text-[#020617] text-[10px] font-black uppercase tracking-[0.4em] hover:bg-accent/90 transition-all notch-clip shadow-biolume">
                        Synchronize Core
                     </button>
                  </div>
               </div>

               <div className="space-y-6 pt-6">
                  <button className="w-full py-4 text-[9px] font-black uppercase tracking-[0.2em] text-primary/20 border border-white/5 hover:border-white/10 hover:text-primary transition-all rounded-lg">
                     Factory_System_Reset
                  </button>
                  <button className="w-full py-4 text-[9px] font-black uppercase tracking-[0.2em] text-chitin/40 border border-chitin/10 hover:bg-chitin/5 transition-all rounded-lg">
                     Decompress_All_Nodes
                  </button>
               </div>
            </div>
         </div>
      </div>
   );
};

const ConfigField = ({ label, value, icon: Icon }: any) => (
   <div className="abyss-card px-8 py-5 group flex items-center justify-between notch-clip hover:bg-white/[0.03] transition-all">
      <div className="flex items-center gap-6">
         <Icon size={16} className="text-primary/10 group-hover:text-accent/40 transition-colors" />
         <div className="space-y-0.5">
            <span className="text-[9px] uppercase tracking-[0.3em] text-primary/20 font-black">{label}</span>
            <p className="text-sm font-mono text-primary/80 group-hover:text-white transition-colors uppercase tracking-widest">{value}</p>
         </div>
      </div>
      <button className="p-2 text-primary/10 hover:text-accent transition-colors">
         <ChevronRight size={14} />
      </button>
   </div>
);

export default Settings;
