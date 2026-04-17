import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion';
import { 
  School, LogOut, Camera, ShieldCheck, Loader2, 
  CheckCircle2, XCircle, MapPin, Smartphone, ShieldAlert
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { apiFetch } from '../../lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
}

export const StudentDashboard = ({ user, onLogout }: { user: User, onLogout: () => void }) => {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string }>({ type: 'idle', message: '' });
  const [loading, setLoading] = useState(false);
  const [faceSnapshot, setFaceSnapshot] = useState<string | null>(null);
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- PROCTORING UTILS ---
  
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, 320, 240);
        // Compressed JPEG (60% quality) as requested for optimization
        return canvasRef.current.toDataURL('image/jpeg', 0.6);
      }
    }
    return null;
  };

  const reportSuspicious = async (reason: string) => {
    const image = capturePhoto();
    if (!image) return;
    
    try {
      await apiFetch('/api/suspicious', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, image })
      });
    } catch (err) { console.error('Failed to report suspicious activity'); }
  };

  // 1. Tab Switch Detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && scanning) {
        reportSuspicious('Tab Switch Detected');
        cancelScanner();
        setStatus({ type: 'error', message: 'Verification cancelled: Tab switching is prohibited.' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scanning]);

  // 2. Network Switch Detection
  useEffect(() => {
    const checkIp = async () => {
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        if (currentIp && currentIp !== data.ip && scanning) {
          reportSuspicious('Network Switch Detected');
          cancelScanner();
          setStatus({ type: 'error', message: 'Verification cancelled: Network change detected.' });
        }
        setCurrentIp(data.ip);
      } catch (err) { console.error('IP check failed'); }
    };
    
    checkIp();
    const interval = setInterval(checkIp, 10000);
    return () => clearInterval(interval);
  }, [currentIp, scanning]);

  // --- SCANNER LOGIC ---

  const startScanner = async () => {
    setLoading(true);
    setStatus({ type: 'idle', message: '' });
    setFaceSnapshot(null);

    try {
      const sessionRes = await apiFetch('/api/active-session');
      const sessionData = await sessionRes.json();
      if (!sessionData.active) {
        setStatus({ type: 'error', message: 'Class has not started yet. Please wait for the professor.' });
        setLoading(false);
        return;
      }

      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (e) { console.warn("Fullscreen failed"); }

      setScanning(true);
      setLoading(false);
    } catch (err) {
      setStatus({ type: 'error', message: 'Connection error' });
      setLoading(false);
    }
  };

  const cancelScanner = async () => {
    setScanning(false);
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (e) {}
    }
    if (scannerRef.current) {
      try {
        if (scannerRef.current.getState() === 2) {
          await scannerRef.current.stop();
        }
      } catch (e) { console.error("Scanner stop error", e); }
    }
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
  };

  useEffect(() => {
    if (scanning && !faceSnapshot) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
        .catch(() => setStatus({ type: 'error', message: 'Camera access denied' }));
    }
  }, [scanning, faceSnapshot]);

  const captureFace = () => {
    const photo = capturePhoto();
    if (photo) {
      setFaceSnapshot(photo);
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      
      setTimeout(() => {
        const scanner = new Html5Qrcode("reader");
        scannerRef.current = scanner;
        scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          onScanSuccess,
          () => {}
        ).catch(() => setStatus({ type: 'error', message: 'QR Camera failed' }));
      }, 800);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    setLoading(true);
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch (e) {}
    }
    
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch (e) {}
    }

    const submitAttendance = async (latitude: number, longitude: number) => {
      try {
        const res = await apiFetch('/api/mark-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: decodedText,
            lat: latitude,
            lon: longitude,
            deviceFingerprint: navigator.userAgent + screen.width,
            faceSnapshot
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setStatus({ type: 'success', message: data.message });
        } else {
          setStatus({ type: 'error', message: data.error });
        }
      } catch (err) {
        setStatus({ type: 'error', message: 'Connection error' });
      } finally {
        setLoading(false);
        setScanning(false);
      }
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => submitAttendance(pos.coords.latitude, pos.coords.longitude),
      (err) => {
        // FAIL-SAFE MODE: Allow submission even if GPS fails, but it will be flagged as suspicious
        console.warn("GPS Failed, using fail-safe mode");
        submitAttendance(0, 0);
      },
      { timeout: 5000 }
    );
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] font-sans flex flex-col">
      <header className="bg-white border-b border-gray-100 p-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-lg shadow-indigo-100"><School size={18} /></div>
            <h1 className="text-sm font-bold text-gray-900">Student Portal</h1>
          </div>
          <button onClick={onLogout} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col items-center justify-center max-w-md mx-auto w-full">
        <div className="w-full bg-white rounded-[40px] p-10 shadow-xl shadow-gray-200/50 border border-white text-center space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">Attendance Check-in</h2>
            <p className="text-sm text-gray-500 font-medium">Welcome back, {user.fullName}</p>
          </div>

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-12 space-y-6">
                <div className="relative">
                  <Loader2 className="animate-spin text-indigo-600" size={64} />
                  <ShieldCheck className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={24} />
                </div>
                <p className="text-xs text-gray-400 font-medium">Security Check in progress...</p>
              </motion.div>
            ) : status.type !== 'idle' ? (
              <motion.div key="status" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="py-8 space-y-8">
                <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center shadow-xl ${status.type === 'success' ? 'bg-green-50 text-green-500 shadow-green-100' : 'bg-red-50 text-red-500 shadow-red-100'}`}>
                  {status.type === 'success' ? <CheckCircle2 size={48} /> : <XCircle size={48} />}
                </div>
                <div className="space-y-3">
                  <h3 className={`text-2xl font-bold ${status.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{status.type === 'success' ? 'Verified!' : 'Rejected'}</h3>
                  <p className="text-gray-500 text-sm font-medium leading-relaxed px-4">{status.message}</p>
                </div>
                <button onClick={() => setStatus({ type: 'idle', message: '' })} className="w-full py-4 bg-gray-50 text-gray-900 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors">Back to Home</button>
              </motion.div>
            ) : !scanning ? (
              <motion.div key="idle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
                <button onClick={startScanner} className="w-full aspect-square bg-indigo-600 text-white rounded-[48px] flex flex-col items-center justify-center gap-6 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-2xl shadow-indigo-200 group">
                  <div className="p-8 bg-white/10 rounded-full group-hover:scale-110 transition-transform"><Camera size={56} /></div>
                  <div className="space-y-1">
                    <span className="block font-bold uppercase tracking-widest text-sm">Start Verification</span>
                    <span className="block text-[10px] text-indigo-200 font-bold uppercase tracking-tighter">Face + QR + GPS</span>
                  </div>
                </button>
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-3 text-left">
                  <ShieldCheck className="text-indigo-600 flex-shrink-0" size={20} />
                  <p className="text-[10px] text-indigo-700 font-bold uppercase leading-tight">Your attendance is secured with multi-layer proctoring.</p>
                </div>
              </motion.div>
            ) : !faceSnapshot ? (
              <motion.div key="face-capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="w-full aspect-square bg-black rounded-[48px] overflow-hidden relative border-4 border-indigo-600 shadow-2xl shadow-indigo-100">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                  <div className="absolute inset-0 border-[20px] border-black/40 rounded-[44px] pointer-events-none" />
                </div>
                <canvas ref={canvasRef} width="320" height="240" className="hidden" />
                <div className="space-y-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Position your face in the frame</p>
                  <button onClick={captureFace} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">Capture Snapshot</button>
                  <button onClick={cancelScanner} className="w-full py-2 text-gray-400 font-bold uppercase tracking-widest text-[10px] hover:text-gray-600">Cancel</button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="qr-scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="w-full aspect-square bg-black rounded-[48px] overflow-hidden relative border-4 border-indigo-600 shadow-2xl shadow-indigo-100">
                  <div id="reader" className="w-full h-full"></div>
                </div>
                <div className="space-y-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Now scan the class QR code</p>
                  <button onClick={cancelScanner} className="w-full py-3 text-gray-400 font-bold uppercase tracking-widest text-[10px] hover:text-gray-600">Cancel</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-8 border-t border-gray-50 grid grid-cols-3 gap-4">
            {[
              { icon: MapPin, label: 'GPS' },
              { icon: Smartphone, label: 'Device' },
              { icon: ShieldCheck, label: 'Secure' }
            ].map((item, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="p-2 bg-gray-50 rounded-xl text-gray-400"><item.icon size={16} /></div>
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
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
