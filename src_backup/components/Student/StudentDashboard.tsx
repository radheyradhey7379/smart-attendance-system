import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  School, LogOut, Camera, ShieldCheck, Loader2, 
  CheckCircle2, XCircle, MapPin, Smartphone, ShieldAlert
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface AppSystemUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
}

export default function StudentDashboard({ user, onLogout }: { user: AppSystemUser, onLogout: () => void }) {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string }>({ type: 'idle', message: '' });
  const [loading, setLoading] = useState(false);
  const [faceSnapshot, setFaceSnapshot] = useState<string | null>(null);
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, 320, 240);
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
    } catch (err) { console.error('Abuse report failed'); }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && scanning) {
        reportSuspicious('Tab switch detected during session');
        cancelScanner();
        setStatus({ type: 'error', message: 'Verification failed: Multi-tasking detected' });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scanning]);

  const startScanner = async () => {
    setLoading(true);
    try {
      const sessionRes = await apiFetch('/api/active-session');
      const sessionData = await sessionRes.json();
      if (!sessionData.active) {
        setStatus({ type: 'error', message: 'No active session' });
        return;
      }
      setScanning(true);
    } catch (err) { setStatus({ type: 'error', message: 'Connection error' }); }
    finally { setLoading(false); }
  };

  const cancelScanner = () => {
    setScanning(false);
    if (scannerRef.current) { try { scannerRef.current.stop(); } catch(e){} }
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(t => t.stop());
  };

  const captureFace = () => {
    const photo = capturePhoto();
    if (photo) {
      setFaceSnapshot(photo);
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(t => t.stop());
      
      setTimeout(async () => {
        try {
          const { Html5Qrcode } = await import('html5-qrcode');
          const scanner = new Html5Qrcode("reader");
          scannerRef.current = scanner;
          await scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess,
            () => {}
          );
        } catch (err) { setStatus({ type: 'error', message: 'QR Camera init failed' }); }
      }, 500);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    setLoading(true);
    if (scannerRef.current) { try { await scannerRef.current.stop(); } catch(e){} }
    
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await apiFetch('/api/mark-attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: decodedText,
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            faceSnapshot
          }),
        });
        const data = await res.json();
        if (res.ok) setStatus({ type: 'success', message: data.message });
        else setStatus({ type: 'error', message: data.error });
      } catch (err) { setStatus({ type: 'error', message: 'Final submission failed' }); }
      finally { setLoading(false); setScanning(false); }
    }, () => {
        setStatus({ type: 'error', message: 'GPS Location required' });
        setLoading(false);
        setScanning(false);
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-6 items-center justify-center">
      <div className="w-full max-w-md bg-white rounded-[40px] p-8 shadow-xl border border-gray-100 space-y-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
        <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Attendance</h2>
            <button onClick={onLogout} className="text-gray-400 hover:text-red-500"><LogOut size={20}/></button>
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
             <div className="flex flex-col items-center py-10 gap-4"><Loader2 className="animate-spin text-indigo-600" size={40}/></div>
          ) : status.type !== 'idle' ? (
             <div className="text-center py-10 space-y-6">
                <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${status.type === 'success' ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
                    {status.type === 'success' ? <CheckCircle2 size={40}/> : <XCircle size={40}/>}
                </div>
                <p className="font-bold">{status.message}</p>
                <button onClick={() => setStatus({type: 'idle', message: ''})} className="w-full py-4 bg-gray-100 rounded-2xl font-bold uppercase text-xs tracking-widest">Back</button>
             </div>
          ) : !scanning ? (
             <button onClick={startScanner} className="w-full aspect-square bg-indigo-600 rounded-[48px] text-white flex flex-col items-center justify-center gap-6 shadow-2xl shadow-indigo-200">
                <Camera size={50}/>
                <span className="font-bold uppercase tracking-widest text-sm">Start Check-in</span>
             </button>
          ) : !faceSnapshot ? (
             <div className="space-y-6">
                <div className="aspect-square bg-black rounded-[48px] overflow-hidden relative border-4 border-indigo-600"><video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover -scale-x-100"/></div>
                <canvas ref={canvasRef} width="320" height="240" className="hidden"/>
                <button onClick={captureFace} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl">Capture Face</button>
             </div>
          ) : (
             <div className="space-y-6">
                <div className="aspect-square bg-black rounded-[48px] overflow-hidden border-4 border-indigo-600"><div id="reader" className="w-full h-full"/></div>
                <p className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest">Scan QR Code</p>
                <button onClick={cancelScanner} className="w-full py-2 text-gray-400 text-xs font-bold uppercase">Cancel</button>
             </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
