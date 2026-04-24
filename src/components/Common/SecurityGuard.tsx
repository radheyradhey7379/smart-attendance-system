import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Geolocation } from '@capacitor/geolocation';
import {
  ShieldCheck, ShieldAlert, Loader2, MapPin,
  MapPinOff, Globe, Lock, AlertTriangle,
  RefreshCw, Smartphone, Key, Signal, Radar,
  Shield, Activity
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface SecurityGuardProps {
  children: React.ReactNode;
  onLogout: () => void;
}

export const SecurityGuard = ({ children, onLogout }: SecurityGuardProps) => {
  const [status, setStatus] = useState<'scanning' | 'gps_off' | 'vpn_detected' | 'secure'>('scanning');
  const [details, setDetails] = useState<string>('Initializing Secure Link...');
  const [errorDetails, setErrorDetails] = useState<string>('');
  const watchdogRef = useRef<any>(null);

  const requestGpsAccess = async () => {
    try {
      const perm = await Geolocation.requestPermissions();
      if (perm.location === 'granted') {
        performCheck();
      } else {
        setErrorDetails('Biometric Location Protocol must be authorized.');
      }
    } catch (e) {
      performCheck();
    }
  };

  const performCheck = async () => {
    setStatus('scanning');
    setDetails('Running GPS Handshake...');
    setErrorDetails('');

    try {
      await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });
    } catch (err: any) {
      setStatus('gps_off');
      setDetails('Security Node Offline.');
      setErrorDetails(err.message || 'GPS Signal Obstructed.');
      return;
    }

    setDetails('Analyzing Network Stream...');
    try {
      const res = await apiFetch('/api/security/check-vulnerability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          platform: navigator.platform
        })
      });
      const data = await res.json();

      if (data.vpnDetected) {
        setStatus('vpn_detected');
        setDetails('Network Intrusion Detected.');
        return;
      }
    } catch (e) { }

    setDetails('Link Synchronized.');
    setTimeout(() => setStatus('secure'), 800);
  };

  useEffect(() => {
    performCheck();

    const startWatchdog = async () => {
      try {
        watchdogRef.current = await Geolocation.watchPosition({
          enableHighAccuracy: true,
          timeout: 15000
        }, (pos, err) => {
          if (err) setStatus('gps_off');
        });
      } catch (e) { }
    };

    startWatchdog();

    return () => {
      if (watchdogRef.current) Geolocation.clearWatch({ id: watchdogRef.current });
    };
  }, []);

  if (status === 'secure') return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] bg-[#F8FAFF] flex flex-col items-center justify-center p-8 font-sans relative overflow-hidden">
      {/* celestial background elements - refined for better centering */}
      <div className="absolute inset-0 bg-[#fbfcfe]" />
      <div className="absolute top-[-10%] left-[-10%] w-full h-full bg-indigo-100/20 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-full h-full bg-indigo-50/20 blur-[120px] rounded-full" />

      <div className="relative w-full max-w-sm flex flex-col items-center gap-12 text-center">
        {/* Elite Security HUD */}
        <div className="relative w-48 h-48 flex-shrink-0">
          <div className="absolute inset-0 bg-white rounded-full shadow-[0_32px_64px_-12px_rgba(79,70,229,0.12)]" />
          <div className="absolute inset-[-8px] border border-indigo-100/30 rounded-full animate-pulse" />
          <div className="absolute inset-[-16px] border border-indigo-50/50 rounded-full animate-[spin_20s_linear_infinite]" />

          <div className="relative w-full h-full rounded-full flex items-center justify-center border border-white">
            <AnimatePresence mode="wait">
              {status === 'scanning' && (
                <motion.div key="scanning" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                  <Radar className="text-indigo-600" size={56} strokeWidth={1} />
                </motion.div>
              )}
              {status === 'gps_off' && (
                <motion.div key="gps" initial={{ scale: 0.5 }} animate={{ scale: 1, rotate: [-10, 10, -10, 0] }}>
                  <MapPinOff className="text-rose-500" size={64} strokeWidth={1} />
                </motion.div>
              )}
              {status === 'vpn_detected' && (
                <motion.div key="vpn" initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                  <Globe className="text-rose-500" size={64} strokeWidth={1} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Spinning Data Ring */}
            <div className="absolute inset-6 border-b-2 border-indigo-500/20 rounded-full animate-spin" />
          </div>
        </div>

        <div className="space-y-6 w-full">
          <div className="space-y-2">
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase italic leading-none">
              {status === 'scanning' ? 'Syncing...' : 'Link Broken'}
            </h2>
            <div className="flex items-center justify-center gap-2">
              <Shield size={12} className="text-indigo-600 fill-indigo-100" />
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em]">Protocol 7379 ACTIVE</span>
            </div>
          </div>

          <div className="p-8 bg-white/70 backdrop-blur-md border border-white shadow-xl rounded-[40px] relative overflow-hidden group">
            <div className="absolute inset-0 bg-indigo-50/10 group-hover:bg-indigo-50/20 transition-colors" />
            <p className="relative z-10 text-indigo-700 font-bold text-[11px] tracking-widest uppercase mb-1">
              {details}
            </p>
            {errorDetails && (
              <p className="relative z-10 text-slate-400 text-[9px] font-bold uppercase mt-4 pt-4 border-t border-slate-50 italic">
                {errorDetails}
              </p>
            )}
          </div>

          {(status === 'gps_off' || status === 'vpn_detected') && (
            <button
              onClick={status === 'gps_off' ? requestGpsAccess : performCheck}
              className="w-full bg-slate-950 text-white p-6 rounded-[32px] font-black uppercase tracking-[0.3em] text-[11px] shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <Signal size={16} className="animate-pulse" />
              Restore Identity Link
            </button>
          )}

          <button
            onClick={onLogout}
            className="w-full text-slate-400 hover:text-rose-500 font-bold uppercase tracking-[0.2em] text-[10px] transition-colors flex items-center justify-center gap-2 py-2"
          >
            <Smartphone size={14} />
            Terminate Handshake
          </button>
        </div>
      </div>

      {/* Absolute Bottom Badge */}
      <div className="absolute bottom-12 flex items-center gap-2 text-slate-200">
        <Lock size={12} />
        <span className="text-[10px] font-black uppercase tracking-[0.6em]">Antigravity Node 2.9</span>
      </div>
    </div>
  );
};
