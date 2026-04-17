import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion';
import { 
  ShieldCheck, ShieldAlert, Loader2, MapPin, 
  MapPinOff, Globe, Lock, AlertTriangle
} from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface SecurityGuardProps {
  children: React.ReactNode;
  onLogout: () => void;
}

export const SecurityGuard = ({ children, onLogout }: SecurityGuardProps) => {
  const [status, setStatus] = useState<'scanning' | 'gps_off' | 'vpn_detected' | 'secure'>('scanning');
  const [details, setDetails] = useState<string>('Initializing Secure Link...');

  const performCheck = async () => {
    setStatus('scanning');
    setDetails('Verifying GPS Subsystem...');

    // 1. Check GPS Permission & Availability
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 });
      });
      console.log('GPS Verified:', pos.coords.latitude);
    } catch (err: any) {
      setStatus('gps_off');
      setDetails('GPS Signal Lost or Permission Denied.');
      return;
    }

    // 2. Check VPN / Proxy
    setDetails('Analyzing Network Integrity...');
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
            setDetails('External Proxy/VPN Detected. Access Suspended.');
            return;
        }
    } catch (e) {
        console.warn('Vulnerability check failed, proceeding with caution');
    }

    setDetails('Security Identity Confirmed.');
    setTimeout(() => setStatus('secure'), 800);
  };

  useEffect(() => {
    performCheck();
    
    // Continuous monitoring
    const interval = setInterval(async () => {
        // Just re-check VPN headers intermittently
        try {
            const res = await apiFetch('/api/security/check-vulnerability', { method: 'POST' });
            const data = await res.json();
            if (data.vpnDetected) {
                setStatus('vpn_detected');
                setDetails('Network Integrity Breach: VPN Enabled.');
            }
        } catch(e) {}
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (status === 'secure') return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0f172a] flex flex-col items-center justify-center p-6 font-sans">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent opacity-50" />
      
      <div className="relative w-full max-w-sm space-y-12 text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full scale-150 animate-pulse" />
          
          <div className="relative mx-auto w-32 h-32 rounded-full border-2 border-indigo-500/30 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              {status === 'scanning' && (
                <motion.div 
                  key="scanning"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2"
                >
                  <Loader2 className="animate-spin text-indigo-400" size={48} />
                </motion.div>
              )}
              {status === 'gps_off' && (
                <motion.div 
                  key="gps"
                  initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                  className="text-amber-500"
                >
                  <MapPinOff size={56} />
                </motion.div>
              )}
              {status === 'vpn_detected' && (
                <motion.div 
                  key="vpn"
                  initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                  className="text-rose-500"
                >
                  <Globe size={56} />
                </motion.div>
              )}
            </AnimatePresence>
            
            <motion.div 
                className="absolute inset-0 bg-indigo-500/5"
                animate={{ rotate: 360 }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-black text-white tracking-widest uppercase italic">
            {status === 'scanning' ? 'Scanning Vulnerabilities' : 'Security Breach'}
          </h2>
          <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-2xl backdrop-blur-sm">
            <p className="text-indigo-400 font-mono text-[10px] tracking-widest uppercase">
              {details}
            </p>
          </div>
        </div>

        <div className="space-y-4">
            {status === 'gps_off' && (
                <button 
                  onClick={performCheck}
                  className="w-full bg-indigo-600 text-white p-4 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all"
                >
                  Retry GPS Verification
                </button>
            )}
            {status === 'vpn_detected' && (
                <div className="text-xs text-rose-400 font-medium italic animate-pulse">
                    Please disable all VPN and Proxy services to continue.
                </div>
            )}
            
            <button 
              onClick={onLogout}
              className="text-slate-500 hover:text-rose-400 font-bold uppercase tracking-widest text-[10px] pt-4 transition-colors"
            >
              Terminate Session
            </button>
        </div>
      </div>
      
      <div className="absolute bottom-10 flex items-center gap-2 text-slate-700 text-[8px] font-bold uppercase tracking-widest">
        <Lock size={10} /> Powered by Antigravity Guard v2.5
      </div>
    </div>
  );
};
