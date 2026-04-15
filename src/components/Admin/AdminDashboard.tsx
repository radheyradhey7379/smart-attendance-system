import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, LogOut, QrCode, Clock, XCircle, Users, 
  RefreshCw, ShieldAlert, MapPin, User, Loader2, ShieldCheck,
  Camera, AlertTriangle, History, School, Activity, Heart,
  CheckCircle2, Ban
} from 'lucide-react';
import { apiFetch } from '../../lib/api.js';

interface User {
  id: number;
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

export const AdminDashboard = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [session, setSession] = useState<{ id: number, token: string } | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [captures, setCaptures] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [blockedIps, setBlockedIps] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes
  const [view, setView] = useState<'attendance' | 'logs' | 'suspicious' | 'security' | 'timeline'>('attendance');
  const [isFullscreenQR, setIsFullscreenQR] = useState(false);

  const fetchLogs = async () => {
    try {
      const res = await apiFetch('/api/logs');
      const data = await res.json();
      setLogs(data);
    } catch (err) { console.error('Failed to fetch logs'); }
  };

  const fetchCaptures = async () => {
    try {
      const res = await apiFetch('/api/suspicious-captures');
      const data = await res.json();
      setCaptures(data);
    } catch (err) { console.error('Failed to fetch captures'); }
  };

  const fetchSecurityData = async () => {
    try {
      const [incRes, blockRes, healthRes] = await Promise.all([
        apiFetch('/api/security/incidents'),
        apiFetch('/api/security/blocked-ips'),
        apiFetch('/api/admin/health-stats')
      ]);
      setIncidents(await incRes.json());
      setBlockedIps(await blockRes.json());
      setHealth(await healthRes.json());
    } catch (err) { console.error('Failed to fetch security data'); }
  };

  const fetchTimeline = async () => {
    if (!session) return;
    try {
      const res = await apiFetch(`/api/admin/session-timeline/${session.id}`);
      setTimeline(await res.json());
    } catch (err) { console.error('Failed to fetch timeline'); }
  };

  useEffect(() => {
    if (view === 'logs') fetchLogs();
    if (view === 'suspicious') fetchCaptures();
    if (view === 'security') fetchSecurityData();
    if (view === 'timeline') fetchTimeline();
  }, [view, session]);

  // Dynamic QR Refresh Logic
  useEffect(() => {
    if (session) {
      const interval = setInterval(async () => {
        if (document.visibilityState !== 'visible') return;
        try {
          const res = await apiFetch(`/api/sessions/${session.id}/refresh`);
          const data = await res.json();
          if (data.token) {
            setSession(prev => prev ? { ...prev, token: data.token } : null);
          }
        } catch (err) { console.error('QR Refresh failed'); }
      }, 5000); 
      return () => clearInterval(interval);
    }
  }, [session]);

  const [selection, setSelection] = useState({ branch: '', subBranch: '' });

  const startClass = async () => {
    if (!selection.branch || !selection.subBranch) {
        alert('Please select a Branch and Batch first.');
        return;
    }

    setLoading(true);
    try {
      // Trigger native permission prompt
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 5000 });
      });

      const res = await apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            lat: pos.coords.latitude, 
            lon: pos.coords.longitude,
            branch: selection.branch,
            subBranch: selection.subBranch
        }),
      });
      const data = await res.json();
      setSession(data);
      setTimeLeft(600);
    } catch (err: any) {
      if (err.code === 1) {
        alert('Location Permission Denied. Please enable GPS in your phone settings for this app.');
      } else {
        alert('GPS Timeout: Ensure your GPS is ON and you are in an open area.');
      }
    } finally {
      setLoading(false);
    }
  };

  const endClass = async () => {
    if (!session) return;
    if (!confirm('Are you sure you want to end this class session?')) return;
    try {
      await apiFetch(`/api/sessions/${session.id}/end`, { method: 'POST' });
      setSession(null);
      setAttendance([]);
      setIsFullscreenQR(false);
    } catch (err) { alert('Failed to end session'); }
  };

  // 1. Attendance Polling (Every 3 seconds)
  useEffect(() => {
    if (session) {
      const interval = setInterval(async () => {
        try {
          const res = await apiFetch(`/api/sessions/${session.id}/attendance`);
          if (res.ok) {
            const data = await res.json();
            setAttendance(data);
          }
        } catch (err) { console.error('Polling failed'); }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [session]);

  // 2. Real-time Countdown Timer (Every 1 second)
  useEffect(() => {
    if (session) {
      const interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            // Trigger Auto-Refresh when timer hits zero
            refreshQR();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [session]);

  const refreshQR = async () => {
    if (!session) return;
    try {
      const res = await apiFetch(`/api/sessions/${session.id}/refresh`);
      const data = await res.json();
      setSession(data);
      setTimeLeft(600); // Reset to 10 minutes
    } catch (err) { console.error('Auto-refresh failed'); }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans flex flex-col">
      <header className="bg-white border-b border-gray-200 p-4 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100">
              <LayoutDashboard size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 leading-tight">
                  {user.role === 'admin' ? 'Developer Console' : 'Professor Portal'}
                </h1>
                <button onClick={onLogout} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all ml-1">
                  <LogOut size={16} />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">
                {user.role === 'admin' ? 'System Management' : 'Attendance Control Center'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-100 p-1 rounded-xl">
              {[
                { id: 'attendance', label: 'Feed', icon: Users, visible: true },
                { id: 'timeline', label: 'Timeline', icon: Activity, visible: true },
                { id: 'logs', label: 'Logs', icon: History, visible: user.role === 'admin' },
                { id: 'suspicious', label: 'Alerts', icon: AlertTriangle, visible: user.role === 'admin' },
                { id: 'security', label: 'Security', icon: ShieldAlert, visible: user.role === 'admin' }
              ].filter(item => item.visible).map(item => (
                <button 
                  key={item.id}
                  onClick={() => setView(item.id as any)}
                  className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-2 ${view === item.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <item.icon size={12} />
                  {item.label}
                </button>
              ))}
            </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Session Control</h2>
            {!session ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-tighter">Branch</label>
                      <select 
                        value={selection.branch}
                        onChange={(e) => setSelection({ ...selection, branch: e.target.value })}
                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">Select</option>
                        {['CS', 'IT', 'ME', 'CE', 'EE'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                   </div>
                   <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-tighter">Batch</label>
                      <select 
                        value={selection.subBranch}
                        onChange={(e) => setSelection({ ...selection, subBranch: e.target.value })}
                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">Select</option>
                        {['B1', 'B2', 'B3', 'B4'].map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                   </div>
                </div>

                <button 
                  onClick={startClass}
                  disabled={loading || !selection.branch || !selection.subBranch}
                  className="w-full bg-indigo-600 text-white p-5 rounded-2xl font-bold uppercase tracking-widest hover:bg-indigo-700 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-3 shadow-xl shadow-indigo-100 disabled:opacity-50 disabled:shadow-none"
                >
                  {loading ? <Loader2 className="animate-spin" size={24} /> : <><QrCode size={32} /> <span>Start New Class</span></>}
                </button>
                <p className="text-[9px] text-gray-400 font-medium text-center">Your GPS coordinates will be locked for attendee validation.</p>
              </div>
            ) : (
              <div className="space-y-6 text-center">
                <div className="bg-white p-6 border-2 border-dashed border-indigo-100 rounded-3xl inline-block relative group">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${session.token}`} 
                    alt="QR Code" 
                    className="w-56 h-56"
                  />
                  <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[8px] px-2 py-1 rounded-full font-bold uppercase animate-pulse">Dynamic QR Active</div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-center gap-2 text-indigo-600 font-bold bg-indigo-50 py-2 rounded-xl">
                    <Clock size={16} />
                    <span className="text-sm">Window: {formatTime(timeLeft)}</span>
                  </div>
                  <button 
                    onClick={() => setIsFullscreenQR(true)}
                    className="w-full bg-indigo-600 text-white p-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                  >
                    <School size={16} /> Presentation Mode
                  </button>
                  <button 
                    onClick={endClass}
                    className="w-full bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle size={16} /> End Session
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">System Health</h2>
            <div className="space-y-4">
              {health ? (
                <>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Heart size={14} className="text-red-500" />
                      <span>Uptime</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-900">{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users size={14} className="text-blue-500" />
                      <span>Active Users</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-900">{health.activeUsers.count}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Ban size={14} className="text-orange-500" />
                      <span>Blocked IPs</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-900">{health.blockedIps.count}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-center py-4"><Loader2 className="animate-spin text-gray-300" size={20} /></div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-8">
          <div className="bg-white rounded-3xl h-full flex flex-col shadow-sm border border-gray-100 overflow-hidden">
            {view === 'attendance' && (
              <>
                <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Users size={18} />
                    </div>
                    <h2 className="text-sm font-bold text-gray-900">Live Attendance Feed</h2>
                  </div>
                  <span className="text-[10px] bg-indigo-600 text-white px-3 py-1 rounded-full font-bold uppercase tracking-widest">
                    {attendance.length} Present
                  </span>
                </div>
                <div className="flex-1 overflow-auto p-6">
                  {attendance.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 p-12 text-center grayscale">
                      <Users size={64} strokeWidth={1} />
                      <p className="mt-4 uppercase tracking-widest text-xs font-bold">Waiting for scans...</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {attendance.map((record) => (
                        <motion.div 
                          key={record.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-4 group hover:border-indigo-200 transition-all"
                        >
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0 border-2 border-white shadow-sm">
                            {record.face_snapshot ? (
                              <img src={record.face_snapshot} alt="Face" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400"><User size={20} /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-sm text-gray-900 truncate">{record.full_name}</p>
                              <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                record.status === 'Late' ? 'bg-orange-50 text-orange-600' : 
                                record.status === 'Manual' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                              }`}>
                                {record.status}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{record.username}</p>
                            {record.is_suspicious === 1 && (
                              <div className="flex items-center gap-2 mt-1">
                                <p className="text-[9px] text-red-500 font-bold italic">Flagged: {record.rejection_reason}</p>
                                <button 
                                  onClick={async () => {
                                    await apiFetch('/api/admin/remove-flag', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ attendanceId: record.id })
                                    });
                                    if (session) {
                                      const res = await apiFetch(`/api/sessions/${session.id}/attendance`);
                                      setAttendance(await res.json());
                                    }
                                  }}
                                  className="text-[8px] text-indigo-600 font-bold hover:underline uppercase"
                                >
                                  Clear Flag
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-indigo-600">{new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {view === 'timeline' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-indigo-50/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100"><Activity size={18} /></div>
                    <h2 className="text-sm font-bold text-gray-900">Session Replay Timeline</h2>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-8">
                  {timeline.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 p-12 text-center grayscale">
                      <Clock size={64} strokeWidth={1} />
                      <p className="mt-4 uppercase tracking-widest text-xs font-bold">No activity recorded yet.</p>
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-indigo-50 ml-4 space-y-8 pb-8">
                      {timeline.map((item, i) => (
                        <div key={i} className="relative pl-8">
                          <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-4 border-white shadow-sm ${
                            item.type === 'attendance' ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm inline-block min-w-[300px]">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="text-sm font-bold text-gray-900">{item.title}</h4>
                              <span className="text-[9px] text-gray-400 font-mono">{new Date(item.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${
                              item.type === 'attendance' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {item.type === 'attendance' ? `Marked ${item.detail}` : `Incident: ${item.detail}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {view === 'logs' && (
              <>
                <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-50 text-red-600 rounded-xl"><History size={18} /></div>
                    <h2 className="text-sm font-bold text-gray-900">Security Audit Logs</h2>
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                      <tr>
                        <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Timestamp</th>
                        <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Event</th>
                        <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">User</th>
                        <th className="p-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4 text-[10px] font-medium text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="p-4">
                            <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-widest ${
                              log.event_type.includes('FAIL') || log.event_type.includes('SUSPICIOUS') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                            }`}>
                              {log.event_type}
                            </span>
                            <p className="text-[10px] text-gray-400 mt-1">{log.description}</p>
                          </td>
                          <td className="p-4 text-[10px] font-bold text-gray-700">{log.full_name || 'System'}</td>
                          <td className="p-4 text-[10px] font-mono text-gray-400">{log.ip_address}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {view === 'suspicious' && (
              <>
                <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-50 text-orange-600 rounded-xl"><Camera size={18} /></div>
                    <h2 className="text-sm font-bold text-gray-900">Suspicious Activity Captures</h2>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-6">
                  {captures.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20 p-12 text-center grayscale">
                      <ShieldCheck size={64} strokeWidth={1} />
                      <p className="mt-4 uppercase tracking-widest text-xs font-bold">No suspicious captures yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {captures.map((cap) => (
                        <motion.div 
                          key={cap.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-white rounded-3xl border border-red-100 shadow-sm overflow-hidden flex flex-col"
                        >
                          <div className="aspect-video bg-black relative group">
                            <img src={cap.image_data} alt="Suspicious Capture" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-red-600/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <div className="p-4 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-sm text-gray-900">{cap.full_name}</p>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{cap.username}</p>
                              </div>
                              <span className="text-[8px] bg-red-50 text-red-600 px-2 py-1 rounded font-bold uppercase tracking-widest">
                                {cap.reason}
                              </span>
                            </div>
                            <div className="pt-2 border-t border-gray-50 flex justify-between items-center text-[9px] text-gray-400 font-medium">
                              <span>{new Date(cap.timestamp).toLocaleString()}</span>
                              <span className="font-mono">{cap.ip_address}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {view === 'security' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-red-50/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-600 text-white rounded-xl shadow-lg shadow-red-100"><ShieldAlert size={18} /></div>
                    <h2 className="text-sm font-bold text-gray-900">Incident Response Dashboard</h2>
                  </div>
                </div>
                
                <div className="flex-1 overflow-auto p-6 space-y-8">
                  <section className="space-y-4">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Blocked IP Addresses</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {blockedIps.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No IPs currently blocked.</p>
                      ) : (
                        blockedIps.map(block => (
                          <div key={block.ip_address} className="p-4 bg-red-50/50 border border-red-100 rounded-2xl flex justify-between items-center">
                            <div>
                              <p className="text-sm font-mono font-bold text-red-600">{block.ip_address}</p>
                              <p className="text-[10px] text-gray-500">{block.reason}</p>
                            </div>
                            <button 
                              onClick={async () => {
                                await apiFetch('/api/security/unblock-ip', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ip: block.ip_address })
                                });
                                fetchSecurityData();
                              }}
                              className="text-[10px] font-bold text-indigo-600 hover:underline uppercase tracking-widest"
                            >
                              Unblock
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Recent Security Incidents</h3>
                    <div className="space-y-3">
                      {incidents.map(inc => (
                        <div key={inc.id} className={`p-4 rounded-2xl border flex gap-4 ${
                          inc.severity === 'critical' ? 'bg-red-50 border-red-100' : 
                          inc.severity === 'high' ? 'bg-orange-50 border-orange-100' : 'bg-gray-50 border-gray-100'
                        }`}>
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                <span className={`text-[8px] px-2 py-0.5 rounded font-bold uppercase tracking-widest ${
                                  inc.severity === 'critical' ? 'bg-red-600 text-white' : 
                                  inc.severity === 'high' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
                                }`}>
                                  {inc.severity}
                                </span>
                                <h4 className="text-sm font-bold text-gray-900">{inc.type}</h4>
                              </div>
                              <span className="text-[9px] text-gray-400">{new Date(inc.timestamp).toLocaleString()}</span>
                            </div>
                            <p className="text-xs text-gray-600">{inc.description}</p>
                            <div className="flex gap-4 text-[9px] text-gray-400 font-mono">
                              <span>IP: {inc.ip_address}</span>
                              <span>Device: {inc.device_id.substring(0, 20)}...</span>
                              {inc.full_name && <span>User: {inc.full_name}</span>}
                            </div>
                          </div>
                          {inc.evidence_image && (
                            <div className="w-24 h-24 rounded-xl overflow-hidden bg-black flex-shrink-0">
                              <img src={inc.evidence_image} alt="Evidence" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isFullscreenQR && session && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-12"
          >
            <button 
              onClick={() => setIsFullscreenQR(false)}
              className="absolute top-8 right-8 p-4 text-gray-400 hover:text-gray-900 transition-colors"
            >
              <XCircle size={48} />
            </button>
            
            <div className="text-center space-y-8 max-w-2xl w-full">
              <div className="space-y-2">
                <h2 className="text-4xl font-black text-gray-900 tracking-tight">Scan to Mark Attendance</h2>
                <p className="text-indigo-600 font-bold uppercase tracking-[0.2em]">Class Session Active</p>
              </div>

              <div className="bg-white p-12 rounded-[64px] shadow-2xl shadow-indigo-100 border-8 border-indigo-50 inline-block relative">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(session.token)}`} 
                  alt="QR Code" 
                  className="w-[400px] h-[400px]"
                />
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-2 rounded-full font-bold text-sm uppercase tracking-widest shadow-xl">
                  Dynamic QR: {formatTime(timeLeft)}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-8 pt-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl"><MapPin size={32} /></div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">GPS Verified</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl"><ShieldAlert size={32} /></div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">AES Encrypted</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl"><Users size={32} /></div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{attendance.length} Present</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <footer className="p-6 text-center border-t border-gray-100 bg-white">
        <p className="text-[10px] text-gray-400 font-medium max-w-2xl mx-auto">
          <ShieldCheck size={12} className="inline mr-1 text-green-500" />
          This system captures user data (location, device ID, biometric snapshots) solely for maintaining academic integrity. 
          All data is processed securely and used with explicit user consent in accordance with institutional policies.
        </p>
      </footer>
    </div>
  );
};
