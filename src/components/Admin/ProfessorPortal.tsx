import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  QrCode, Clock, XCircle, Users, RefreshCw, MapPin, 
  School, CheckCircle2, Loader2, History, User
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { SecurityGuard } from '../Common/SecurityGuard';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
}

interface AttendanceRecord {
  id: number;
  username: string;
  full_name: string;
  program?: string;
  roll_number?: string;
  timestamp: string;
  face_snapshot?: string;
  is_suspicious: number;
  rejection_reason?: string;
  status: 'Present' | 'Late' | 'Manual';
}

export const ProfessorPortal = ({ user, onLogout, onSecretTrigger }: { user: User, onLogout: () => void, onSecretTrigger?: () => void }) => {
  const [session, setSession] = useState<{ id: number, token: string, createdAt: string } | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const [sessionAge, setSessionAge] = useState(0);
  const [lastKnownLocation, setLastKnownLocation] = useState<{lat: number, lon: number} | null>(null);
  const [isFullscreenQR, setIsFullscreenQR] = useState(false);
  const [view, setView] = useState<'attendance' | 'timeline'>('attendance');
  const [secretCounter, setSecretCounter] = useState(0);

  // Recover Active Session
  useEffect(() => {
    const recover = async () => {
        try {
            const res = await apiFetch('/api/active-session-details');
            if (res.ok) {
                const data = await res.json();
                if (data.active) {
                    setSession({ id: data.id, token: data.token, createdAt: data.createdAt });
                }
            }
        } catch (e) {}
    };
    recover();
  }, []);

  // Session-wide Age Timer
  useEffect(() => {
    if (session) {
        const updateAge = () => {
            const start = new Date(session.createdAt).getTime();
            const age = Math.floor((Date.now() - start) / 1000);
            setSessionAge(age);
        };
        updateAge();
        const interval = setInterval(updateAge, 1000);
        return () => clearInterval(interval);
    }
  }, [session]);

  const handleSecretClick = () => {
    if (!onSecretTrigger) return;
    const next = secretCounter + 1;
    if (next >= 10) {
        onSecretTrigger();
        setSecretCounter(0);
    } else {
        setSecretCounter(next);
    }
  };

  // Geolocation Warming
  useEffect(() => {
    const warmGPS = () => {
        navigator.geolocation.getCurrentPosition(
            (pos) => setLastKnownLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            (err) => console.log('GPS Warming failed:', err.message),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };
    warmGPS();
    const interval = setInterval(warmGPS, 30000);
    return () => clearInterval(interval);
  }, []);

  // Sync Attendance & Timeline
  useEffect(() => {
    if (session) {
      const poll = setInterval(async () => {
          try {
            const res = await apiFetch(`/api/sessions/${session.id}/attendance`);
            if (res.ok) setAttendance(await res.json());
          } catch (e) {}
      }, 3000);
      return () => clearInterval(poll);
    }
  }, [session]);

  useEffect(() => {
    if (view === 'timeline' && session) {
        apiFetch(`/api/admin/session-timeline/${session.id}`)
            .then(res => res.json())
            .then(setTimeline)
            .catch(() => {});
    }
  }, [view, session]);

  // QR Refresh (15s)
  useEffect(() => {
    if (session) {
      const interval = setInterval(async () => {
        if (document.visibilityState !== 'visible') return;
        await refreshQR();
      }, 15000); 
      return () => clearInterval(interval);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      const interval = setInterval(() => {
        setTimeLeft(prev => prev <= 1 ? 15 : prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [session]);

  const [selection, setSelection] = useState({ className: '', branch: '', section: '' });

  const startClass = async () => {
    if (!selection.className || !selection.branch || !selection.section) {
        alert('Please select Class, Branch, and Section first.');
        return;
    }
    setLoading(true);
    try {
      let lat = lastKnownLocation?.lat, lon = lastKnownLocation?.lon;
      if (!lat || !lon) {
          const pos = await new Promise<GeolocationPosition>((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 5000 });
          });
          lat = pos.coords.latitude; lon = pos.coords.longitude;
      }
      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, ...selection }),
      });
      setSession(await res.json());
      setTimeLeft(15);
    } catch (err: any) {
        alert('GPS check failed. Please ensure location is enabled.');
    } finally { setLoading(false); }
  };

  const refreshQR = async () => {
    if (!session) return;
    try {
      const res = await apiFetch(`/api/sessions/${session.id}/refresh`);
      if (res.ok) {
          const data = await res.json();
          setSession(prev => prev ? { ...prev, token: data.token } : null);
          setTimeLeft(15);
      }
    } catch (err) {}
  };

  const endClass = async () => {
    if (!session || !confirm('End this session?')) return;
    try {
      await apiFetch(`/api/sessions/${session.id}/end`, { method: 'POST' });
      setSession(null);
      setAttendance([]);
    } catch (err) { alert('Failed to end session'); }
  };

  return (
    <SecurityGuard onLogout={onLogout}>
      <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans">
      <header className="bg-white border-b border-gray-100 px-8 py-4 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-600 rounded-xl text-white cursor-pointer select-none" onClick={handleSecretClick}>
              <School size={24} />
            </div>
            <div onClick={handleSecretClick} className="cursor-pointer select-none">
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Professor Portal</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{user.fullName} • Active</span>
              </div>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-red-500 font-bold text-xs uppercase tracking-widest transition-all">
            <XCircle size={18} /> Logout
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Class Settings</h2>
            {!session ? (
              <div className="space-y-6">
                 <div className="grid grid-cols-1 gap-4">
                   <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-tighter">Class (Year)</label>
                      <select value={selection.className} onChange={(e) => setSelection({ ...selection, className: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20">
                        <option value="">Select Year</option>
                        {['1st Year', '2nd Year', '3rd Year', 'Final Year'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-tighter">Branch</label>
                        <select value={selection.branch} onChange={(e) => setSelection({ ...selection, branch: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none">
                          <option value="">Select</option>
                          {['CS', 'IT', 'ME', 'CE', 'EE'].map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-tighter">Section</label>
                        <select value={selection.section} onChange={(e) => setSelection({ ...selection, section: e.target.value })} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none">
                          <option value="">Select</option>
                          {['A', 'B', 'C', 'D'].map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                   </div>
                </div>
                <button onClick={startClass} disabled={loading || !selection.className || !selection.branch} className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-bold uppercase tracking-widest hover:bg-indigo-700 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 shadow-xl shadow-indigo-100 disabled:opacity-50">
                  {loading ? <Loader2 className="animate-spin" size={24} /> : <><QrCode size={32} /> <span>Start Class</span></>}
                </button>
              </div>
            ) : (
                <div className="space-y-6 text-center">
                  <div className="bg-white p-6 border-2 border-dashed border-indigo-100 rounded-3xl inline-block relative group">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${session.token}`} alt="QR" className="w-56 h-56" />
                    <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[8px] px-2 py-1 rounded-full font-bold uppercase animate-pulse">Live QR Active</div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between px-6 py-3 bg-gray-50 rounded-2xl border border-gray-100">
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${sessionAge < 600 ? 'bg-green-500 animate-pulse' : sessionAge < 900 ? 'bg-amber-500' : 'bg-red-500'}`} />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Session Age</span>
                        </div>
                        <span className="text-sm font-black text-gray-900 font-mono">
                            {Math.floor(sessionAge / 60)}m {sessionAge % 60}s
                        </span>
                    </div>

                    <div className="flex items-center justify-between px-6 py-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                        <div className="flex items-center gap-3 text-indigo-600">
                            <Clock size={16} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">QR Refresh</span>
                        </div>
                        <span className="text-sm font-bold text-indigo-600 font-mono">{timeLeft}s</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between text-[8px] font-black uppercase tracking-[0.2em] text-gray-300">
                            <span>Started</span>
                            <span>{sessionAge < 600 ? 'Present Window' : sessionAge < 900 ? 'Late Window' : 'Expired'}</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div 
                                className={`h-full ${sessionAge < 600 ? 'bg-green-500' : sessionAge < 900 ? 'bg-amber-500' : 'bg-red-500'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, (sessionAge / 900) * 100)}%` }}
                            />
                        </div>
                    </div>

                    <button onClick={endClass} className="w-full bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-red-100 transition-colors">Terminate Session</button>
                  </div>
                </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
            <div className="flex gap-4 p-1 bg-gray-100 rounded-2xl w-fit">
               {['attendance', 'timeline'].map(v => (
                 <button key={v} onClick={() => setView(v as any)} className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${view === v ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}>
                    {v}
                 </button>
               ))}
            </div>

            <AnimatePresence mode="wait">
              {view === 'attendance' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Live Attendance ({attendance.length})</h2>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
                    {attendance.length === 0 ? (
                      <div className="p-20 text-center"><Users className="mx-auto text-gray-200 mb-4" size={48} /><p className="text-gray-400 font-medium text-sm">Waiting for scholars to scan...</p></div>
                    ) : (
                      attendance.map((record) => (
                        <div key={record.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100/50 overflow-hidden">
                                {record.face_snapshot ? <img src={record.face_snapshot} alt="face" className="w-full h-full object-cover" /> : <User className="text-indigo-300" size={24} />}
                                </div>
                                <div>
                                <p className="text-sm font-bold text-gray-900">{record.full_name}</p>
                                <p className="text-[10px] text-gray-400 font-medium">{record.roll_number || record.username} • {record.program}</p>
                                </div>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1">
                                <span className="px-3 py-1 bg-green-50 text-green-600 rounded-lg text-[9px] font-bold uppercase">{record.status}</span>
                                <span className="text-[9px] text-gray-400 font-medium">{new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                            </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
        </div>
      </main>
    </div>
    </SecurityGuard>
  );
};
