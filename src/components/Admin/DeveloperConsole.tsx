import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, ShieldCheck, Activity, Heart, Activity as LogsIcon, 
  MapPin, Clock, XCircle, Loader2, AlertTriangle, History, 
  Settings, Terminal, Database, Ban
} from 'lucide-react';
import { apiFetch } from '../../lib/api.js';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
}

export const DeveloperConsole = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [captures, setCaptures] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [blockedIps, setBlockedIps] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [view, setView] = useState<'logs' | 'suspicious' | 'security' | 'health'>('health');
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
        const [logsRes, capRes, incRes, blockRes, healthRes] = await Promise.all([
            apiFetch('/api/logs'),
            apiFetch('/api/suspicious-captures'),
            apiFetch('/api/security/incidents'),
            apiFetch('/api/security/blocked-ips'),
            apiFetch('/api/admin/health-stats')
        ]);
        setLogs(await logsRes.json());
        setCaptures(await capRes.json());
        setIncidents(await incRes.json());
        setBlockedIps(await blockRes.json());
        setHealth(await healthRes.json());
    } catch (e) {
        console.error('Fetch failed');
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [view]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex flex-col font-mono">
      <header className="bg-slate-900 border-b border-slate-800 px-8 py-4 sticky top-0 z-30 shadow-2xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-500/20">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tighter">DEVELOPER CONSOLE</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Root Access • {user.email}</span>
              </div>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-rose-400 font-bold text-xs uppercase tracking-widest transition-all">
             EXIT_SESSION_0x00
          </button>
        </div>
      </header>

      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-8 py-2 overflow-x-auto flex gap-2">
            {[
                { id: 'health', label: 'SYS_HEALTH', icon: Activity },
                { id: 'logs', label: 'AUDIT_LOGS', icon: Terminal },
                { id: 'suspicious', label: 'SUS_CAPTURES', icon: AlertTriangle },
                { id: 'security', label: 'SECURITY_INC', icon: ShieldCheck }
            ].map(item => (
                <button 
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded transition-all flex items-center gap-2 border ${view === item.id ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:border-indigo-500/50'}`}
                >
                  <item.icon size={12} />
                  {item.label}
                </button>
            ))}
        </div>
      </div>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
            {view === 'health' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Nodes</h3>
                            <Users className="text-indigo-400" size={16} />
                        </div>
                        <p className="text-4xl font-black text-white">{health?.activeUsers?.count || 0}</p>
                        <p className="text-[10px] text-emerald-400 mt-2 font-bold tracking-widest">+2.4% FROM_PREVIOUS_SESSION</p>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sys Uptime</h3>
                            <Clock className="text-indigo-400" size={16} />
                        </div>
                        <p className="text-4xl font-black text-white">{Math.floor((health?.uptime || 0) / 3600)}h {Math.floor(((health?.uptime || 0) % 3600) / 60)}m</p>
                        <p className="text-[10px] text-indigo-400 mt-2 font-bold tracking-widest">OS_THREAD_STABLE</p>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Blocked Vectors</h3>
                            <Ban className="text-rose-400" size={16} />
                        </div>
                        <p className="text-4xl font-black text-white">{health?.blockedIps?.count || 0}</p>
                        <p className="text-[10px] text-rose-400 mt-2 font-bold tracking-widest">ACTIVE_FIREWALL_PROTECTION</p>
                    </div>
                </motion.div>
            )}

            {view === 'logs' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
                    <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                        <span className="text-xs font-bold tracking-widest uppercase">Kernel Logs [Audit]</span>
                        <div className="flex gap-1">
                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        </div>
                    </div>
                    <div className="p-4 space-y-2 h-[600px] overflow-y-auto">
                        {logs.map(log => (
                            <div key={log.id} className="text-[11px] leading-relaxed flex gap-4 border-b border-slate-800/50 pb-2">
                                <span className="text-slate-500 font-bold">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                <span className="text-indigo-400 font-bold whitespace-nowrap">{log.event_type}</span>
                                <span className="text-slate-300 italic">{log.description}</span>
                                <span className="text-slate-600 ml-auto whitespace-nowrap">SRC://{log.ip_address}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {view === 'suspicious' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {captures.map(cap => (
                        <div key={cap.id} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl hover:border-rose-500/50 transition-all group">
                            <div className="aspect-video relative overflow-hidden bg-slate-950">
                                {cap.image_data ? <img src={cap.image_data} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="evidence"/> : <div className="w-full h-full flex items-center justify-center text-slate-800 italic">no_visual_data</div>}
                                <div className="absolute top-2 right-2 bg-rose-500 text-[9px] font-bold px-2 py-1 rounded">SUSPICIOUS_VAL</div>
                            </div>
                            <div className="p-4 space-y-2">
                                <p className="text-sm font-bold text-white mb-1 uppercase tracking-tighter">{cap.full_name}</p>
                                <div className="flex items-center gap-2 text-rose-400 text-[11px] font-bold">
                                    <AlertTriangle size={12} /> {cap.reason}
                                </div>
                                <p className="text-[10px] text-slate-500">IP: {cap.ip_address} • {new Date(cap.timestamp).toLocaleString()}</p>
                            </div>
                        </div>
                    ))}
                </motion.div>
            )}

            {view === 'security' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    {incidents.map(inc => (
                        <div key={inc.id} className="bg-slate-900 p-6 rounded-2xl border-l-4 border-l-rose-500 border border-slate-800 shadow-xl flex items-start gap-6">
                            <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500">
                                <ShieldAlert size={24} />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-lg font-black text-rose-500 uppercase tracking-tighter">{inc.type}</h3>
                                    <span className="text-[10px] text-slate-600 font-bold bg-slate-950 px-3 py-1 rounded-full">{new Date(inc.timestamp).toLocaleString()}</span>
                                </div>
                                <p className="text-sm text-slate-300 italic mb-4">"{inc.description}"</p>
                                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    <span>User_id: {inc.user_id || 'UNKNOWN'}</span>
                                    <span>Vector: {inc.ip_address}</span>
                                    <span className="text-rose-400">Severity: {inc.severity}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
      </main>
    </div>
  );
};
