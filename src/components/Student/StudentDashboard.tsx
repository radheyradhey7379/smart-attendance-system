import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    School, LogOut, Camera, ShieldCheck, Loader2,
    CheckCircle2, XCircle, MapPin, Smartphone, ShieldAlert,
    QrCode, User as UserIcon, Sparkles, Fingerprint,
    Scan, Bell, Calendar, Clock, Activity, Shield,
    Zap, Award, Key, AlertTriangle, ArrowRight
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { getDeviceFingerprint } from '../../lib/security';

interface AppSystemUser {
    id: string;
    username: string;
    email: string;
    role: 'admin' | 'teacher' | 'student';
    fullName: string;
}

export default function StudentDashboard({ user, onLogout }: { user: AppSystemUser, onLogout: () => void }) {
    const [scanning, setScanning] = useState(false);
    const [challenge, setChallenge] = useState<'blink' | 'smile' | 'none'>('none');
    const [challengeMet, setChallengeMet] = useState(false);
    const [sessionCode, setSessionCode] = useState('');
    const [stats, setStats] = useState({ streak: 0, score: 0 });
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string }>({ type: 'idle', message: '' });
    const [loading, setLoading] = useState(false);
    const [faceSnapshot, setFaceSnapshot] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const scannerRef = useRef<any>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // V2.0 Behavioral Monitoring: Detect Tab Switching
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && (scanning || loading)) {
                setStatus({ type: 'error', message: 'Security Alert: Background detected. Transaction aborted.' });
                cancelScanner();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [scanning, loading]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        const fetchStats = async () => {
            try {
                const res = await apiFetch('/api/student/stats');
                if (res.ok) setStats(await res.json());
            } catch (e) { }
        };
        fetchStats();
        return () => clearInterval(timer);
    }, []);

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            if (context) {
                context.drawImage(videoRef.current, 0, 0, 480, 480);
                return canvasRef.current.toDataURL('image/jpeg', 0.8);
            }
        }
        return null;
    };

    const startScanner = async () => {
        if (sessionCode.length < 3) {
            alert('Please enter a valid session code.');
            return;
        }
        setScanning(true);
        // Randomize challenge
        const challenges: ('blink' | 'smile')[] = ['blink', 'smile'];
        setChallenge(challenges[Math.floor(Math.random() * challenges.length)]);
    };

    const cancelScanner = () => {
        setScanning(false);
        setFaceSnapshot(null);
        setChallenge('none');
        setChallengeMet(false);
        if (scannerRef.current) { try { scannerRef.current.stop(); } catch (e) { } }
        const stream = videoRef.current?.srcObject as MediaStream;
        stream?.getTracks().forEach(t => t.stop());
    };

    const captureFace = () => {
        const photo = capturePhoto();
        if (photo) {
            setFaceSnapshot(photo);
            setChallengeMet(true);
            const stream = videoRef.current?.srcObject as MediaStream;
            stream?.getTracks().forEach(t => t.stop());

            setTimeout(async () => {
                try {
                    const { Html5Qrcode } = await import('html5-qrcode');
                    const scanner = new Html5Qrcode("reader");
                    scannerRef.current = scanner;
                    await scanner.start(
                        { facingMode: "environment" },
                        { fps: 20, qrbox: 250 },
                        onScanSuccess,
                        () => { }
                    );
                } catch (err) { setStatus({ type: 'error', message: 'Sensor initialization failed.' }); }
            }, 500);
        }
    };

    const onScanSuccess = async (decodedText: string) => {
        setLoading(true);
        if (scannerRef.current) { try { await scannerRef.current.stop(); } catch (e) { } }

        const deviceId = await getDeviceFingerprint();

        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const res = await apiFetch('/api/mark-attendance', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Device-ID': deviceId
                    },
                    body: JSON.stringify({
                        token: decodedText,
                        sessionCode,
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude,
                        faceSnapshot,
                        deviceId,
                        livenessVerified: true
                    }),
                });
                const data = await res.json();
                if (res.ok) setStatus({ type: 'success', message: 'Identity confirmed. Attendance logged.' });
                else setStatus({ type: 'error', message: data.error || 'Verification rejected.' });
            } catch (err) { setStatus({ type: 'error', message: 'Encrypted tunnel break.' }); }
            finally { setLoading(false); setScanning(false); setFaceSnapshot(null); setChallenge('none'); }
        }, () => {
            setStatus({ type: 'error', message: 'GPS authorization required.' });
            setLoading(false);
            setScanning(false);
        }, { enableHighAccuracy: true });
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const cardVariants: any = {
        hidden: { opacity: 0, y: 30, scale: 0.95 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 100, damping: 15 } }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFF] flex flex-col items-center p-6 pt-10 relative overflow-hidden font-sans selection:bg-indigo-100">
            {/* Elite Background elements */}
            <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-gradient-to-br from-indigo-100/40 to-transparent blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-cyan-100/30 blur-[120px] rounded-full animate-pulse delay-700" />

            <div className="w-full max-w-lg relative z-10 space-y-8">
                {/* Elite Top Nav */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between px-3"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-2xl shadow-xl shadow-indigo-100/50 flex items-center justify-center border border-white">
                            <School className="text-indigo-600" size={26} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-slate-900 font-black text-xl tracking-tighter leading-none mb-1">ScholarPort.</h1>
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Secure Network Active</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex flex-col items-end mr-2 text-right">
                            <p className="text-slate-900 font-bold text-xs">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            <p className="text-slate-400 text-[8px] font-bold uppercase tracking-widest">{currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                        </div>
                        <button onClick={onLogout} className="w-12 h-12 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-rose-500 hover:border-rose-100 transition-all active:scale-90 flex items-center justify-center shadow-sm">
                            <LogOut size={20} />
                        </button>
                    </div>
                </motion.div>

                {/* Main Interface */}
                <motion.div
                    initial="hidden" animate="visible" variants={containerVariants}
                    className="space-y-6"
                >
                    <AnimatePresence mode="wait">
                        {loading ? (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                                className="bg-white/80 backdrop-blur-3xl rounded-[40px] p-16 flex flex-col items-center gap-8 shadow-2xl border border-white"
                            >
                                <div className="relative">
                                    <div className="w-24 h-24 rounded-full border-4 border-indigo-50 border-t-indigo-600 animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Fingerprint size={40} className="text-indigo-600 animate-pulse" />
                                    </div>
                                </div>
                                <div className="text-center space-y-2">
                                    <h3 className="text-slate-900 font-black text-xl tracing-tight uppercase">Encrypting</h3>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Handshaking with Node Global...</p>
                                </div>
                            </motion.div>
                        ) : status.type !== 'idle' ? (
                            <motion.div
                                key="status"
                                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                className="bg-white rounded-[40px] p-12 text-center space-y-8 shadow-2xl border border-white relative overflow-hidden"
                            >
                                <div className={`mx-auto w-24 h-24 rounded-[32px] flex items-center justify-center relative ${status.type === 'success' ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
                                    <div className={`absolute inset-0 blur-2xl opacity-20 ${status.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    {status.type === 'success' ? <CheckCircle2 size={56} strokeWidth={1} /> : <XCircle size={56} strokeWidth={1} />}
                                </div>
                                <div className="space-y-3">
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">
                                        {status.type === 'success' ? 'Confirmed' : 'Rejected'}
                                    </h2>
                                    <p className="text-slate-500 text-sm font-semibold max-w-[240px] mx-auto leading-relaxed">
                                        {status.message}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setStatus({ type: 'idle', message: '' })}
                                    className="w-full py-5 bg-slate-950 text-white rounded-3xl font-black uppercase text-[10px] tracking-[0.3em] shadow-xl active:scale-95 transition-all"
                                >
                                    Return to Port
                                </button>
                            </motion.div>
                        ) : !scanning ? (
                            <div className="grid grid-cols-1 gap-6">
                                {/* Profile Hero Card */}
                                <motion.div variants={cardVariants} className="bg-white rounded-[40px] p-8 shadow-xl border border-white relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 blur-3xl rounded-full translate-x-10 -translate-y-10 group-hover:bg-indigo-100 transition-colors" />
                                    <div className="flex items-center gap-6 relative z-10">
                                        <div className="w-20 h-20 rounded-[28px] bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                                            <UserIcon size={36} strokeWidth={1.5} />
                                        </div>
                                        <div>
                                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1 italic">Verified Scholar</p>
                                            <h2 className="text-slate-900 font-black text-2xl tracking-tighter leading-none">{user.fullName}</h2>
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[8px] font-black uppercase tracking-widest border border-indigo-100">
                                                    {user.role}
                                                </div>
                                                <div className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md text-[8px] font-black uppercase tracking-widest border border-slate-100">
                                                    ID: {user.username}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>

                                <div className="grid grid-cols-2 gap-6">
                                    {/* Attendance Analytics */}
                                    <motion.div variants={cardVariants} className="bg-white rounded-[32px] p-6 shadow-lg border border-white flex flex-col items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                                            <Zap size={20} className="fill-emerald-50" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">Streak</p>
                                            <p className="text-slate-900 font-black text-lg leading-none">{stats.streak} Days</p>
                                        </div>
                                    </motion.div>
                                    <motion.div variants={cardVariants} className="bg-white rounded-[32px] p-6 shadow-lg border border-white flex flex-col items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
                                            <Award size={20} className="fill-indigo-50" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-slate-400">Score</p>
                                            <p className="text-slate-900 font-black text-lg leading-none">{stats.score}%</p>
                                        </div>
                                    </motion.div>
                                </div>

                                {/* Session Code Input */}
                                <motion.div variants={cardVariants} className="bg-white rounded-[32px] p-6 shadow-lg border border-white space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Class Authorization</h3>
                                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                            <Key size={14} />
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        placeholder="Enter 6-Digit Code"
                                        value={sessionCode}
                                        onChange={(e) => setSessionCode(e.target.value.replace(/\D/g, ''))}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-center text-2xl font-black tracking-[0.5em] text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-200 placeholder:tracking-normal placeholder:text-sm"
                                    />
                                </motion.div>

                                {/* Elite Master Action Button */}
                                <motion.button
                                    variants={cardVariants}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={startScanner}
                                    className="group relative w-full py-10 bg-indigo-600 rounded-[48px] text-white flex flex-col items-center justify-center gap-6 shadow-[0_32px_64px_-12px_rgba(79,70,229,0.4)] overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-indigo-700" />
                                    {/* Animated Rings Background */}
                                    <div className="absolute w-64 h-64 border border-white/10 rounded-full animate-ping opacity-20" />
                                    <div className="absolute w-32 h-32 border border-white/20 rounded-full animate-pulse opacity-20" />

                                    <div className="p-6 bg-white/10 rounded-[32px] backdrop-blur-xl border border-white/20 shadow-2xl relative z-10 transition-transform group-hover:rotate-6 duration-500">
                                        <Scan size={48} strokeWidth={1} className="text-white" />
                                    </div>
                                    <div className="text-center relative z-10">
                                        <span className="font-black uppercase tracking-[0.4em] text-[12px] block mb-2 italic">Begin Handshake</span>
                                        <div className="flex items-center justify-center gap-2 py-1.5 px-4 bg-white/10 rounded-full border border-white/10 backdrop-blur-md">
                                            <Shield size={12} className="text-emerald-400" />
                                            <span className="text-[8px] font-black uppercase tracking-widest">End-to-End Encrypted</span>
                                        </div>
                                    </div>

                                    <div className="absolute bottom-4 right-8 opacity-20 group-hover:translate-x-2 transition-transform">
                                        <ArrowRight size={24} />
                                    </div>
                                </motion.button>
                            </div>
                        ) : !faceSnapshot ? (
                            <motion.div
                                key="camera"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="bg-white rounded-[40px] p-8 shadow-2xl border border-white space-y-8"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-slate-900 font-black text-xl tracking-tighter uppercase italic">Biometric-ID</h3>
                                        <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">Security Layer 01 of 02</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                        <Camera size={20} />
                                    </div>
                                </div>

                                <div className="aspect-square bg-slate-100 rounded-[56px] overflow-hidden relative border-4 border-slate-50 shadow-inner group">
                                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover -scale-x-100" />

                                    {/* V2.0 Challenge Overlay */}
                                    <AnimatePresence>
                                        {challenge !== 'none' && !challengeMet && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                                className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 z-20"
                                            >
                                                <div className="bg-indigo-600/90 backdrop-blur-md px-6 py-4 rounded-[32px] border border-white/20 shadow-2xl flex flex-col items-center gap-2">
                                                    <Sparkles className="text-indigo-200 animate-pulse" size={24} />
                                                    <p className="text-white font-black uppercase text-xs tracking-[0.2em] text-center">
                                                        Liveness Check:<br />
                                                        <span className="text-indigo-100 text-lg">{challenge === 'blink' ? 'Blink Slowly' : 'Smile for Camera'}</span>
                                                    </p>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="absolute inset-0 bg-indigo-500/5" />
                                    <div className="absolute inset-[15%] border-2 border-dashed border-white/40 rounded-[48px] animate-pulse" />
                                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/20" />
                                    <div className="absolute top-0 left-1/2 w-[1px] h-full bg-white/20" />

                                    {/* HUD Corners */}
                                    <div className="absolute top-8 left-8 w-8 h-8 border-t-4 border-l-4 border-indigo-500/50 rounded-tl-2xl" />
                                    <div className="absolute top-8 right-8 w-8 h-8 border-t-4 border-r-4 border-indigo-500/50 rounded-tr-2xl" />
                                    <div className="absolute bottom-8 left-8 w-8 h-8 border-b-4 border-l-4 border-indigo-500/50 rounded-bl-2xl" />
                                    <div className="absolute bottom-8 right-8 w-8 h-8 border-b-4 border-r-4 border-indigo-500/50 rounded-br-2xl" />
                                </div>
                                <canvas ref={canvasRef} width="480" height="480" className="hidden" />

                                <div className="flex flex-col gap-3">
                                    <button onClick={captureFace} className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">Record Identity</button>
                                    <button onClick={cancelScanner} className="w-full py-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest hover:text-rose-500">Emergency Cancel</button>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="qr"
                                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                                className="bg-white rounded-[40px] p-8 shadow-2xl border border-white space-y-8"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-slate-900 font-black text-xl tracking-tighter uppercase italic">Authorization</h3>
                                        <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest">Security Layer 02 of 02</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                                        <QrCode size={20} />
                                    </div>
                                </div>

                                <div className="aspect-square bg-white rounded-[56px] overflow-hidden border-2 border-slate-100 shadow-xl relative">
                                    <div id="reader" className="w-full h-full" />
                                    <div className="absolute inset-x-8 top-1/2 h-[2px] bg-indigo-500/40 blur-[1px] animate-[ping_2s_infinite]" />
                                </div>

                                <div className="p-5 bg-slate-50 border border-slate-100 rounded-3xl flex items-center gap-4">
                                    <div className="p-3 bg-white shadow-sm rounded-2xl text-indigo-600"><AlertTriangle size={20} /></div>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase leading-relaxed tracking-wider">Please scan the unique classroom QR code displayed by your instructor.</p>
                                </div>
                                <button onClick={cancelScanner} className="w-full py-4 text-slate-400 text-[10px] font-black uppercase tracking-widest">Abort Handshake</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Global Security Footer */}
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
                    className="flex items-center justify-center gap-6 pt-4"
                >
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-300">Port Secured</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-300">Handshake Ready</span>
                    </div>
                </motion.div>
            </div>

            <style>{`
        @keyframes ping {
           0% { transform: scale(1); opacity: 1; }
           100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
        </div>
    );
}
