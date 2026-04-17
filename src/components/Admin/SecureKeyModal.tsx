import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, ShieldAlert, X, Loader2, Command, Lock } from 'lucide-react';
import { apiFetch } from '../../lib/api';

interface SecureKeyModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export const SecureKeyModal = ({ onSuccess, onCancel }: SecureKeyModalProps) => {
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/api/admin/verify-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        setError(data.error || 'Identity verification failed');
      }
    } catch (err) {
      setError('Connection failed. Encryption parity lost.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
        onClick={onCancel}
      />
      
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-[32px] shadow-2xl overflow-hidden p-8"
      >
        <div className="flex flex-col items-center text-center gap-6">
          <div className="p-4 bg-indigo-500/10 rounded-3xl border border-indigo-500/20 shadow-inner">
            <Lock className="text-indigo-500" size={40} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Identity Verification</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-relaxed">
              Accessing Developer Shell @ Root. <br/>Enter Secure Key for Authenticated Handshake.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className="space-y-1 text-left">
               <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Secure_Auth_Key</label>
               <input
                 type="password"
                 autoFocus
                 value={secret}
                 onChange={(e) => setSecret(e.target.value)}
                 className="w-full p-4 bg-slate-950 border border-slate-700 rounded-2xl text-white font-mono text-center tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:tracking-normal"
                 placeholder="••••••••"
                 required
               />
            </div>

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-3 bg-rose-500/10 text-rose-500 rounded-xl text-[10px] font-bold uppercase border border-rose-500/20">
                <ShieldAlert size={14} />
                {error}
              </motion.div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  onClick={onCancel}
                  className="p-4 bg-slate-800 text-slate-400 rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-700 transition-all"
                >
                  Terminate
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="p-4 bg-indigo-600 text-white rounded-2xl font-bold uppercase text-[10px] tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : 'AUTH_PERMIT'}
                </button>
            </div>
          </form>

          <div className="flex items-center gap-2 text-slate-600 text-[8px] font-bold uppercase tracking-widest pt-4">
            <Command size={10} /> SECURITY_PROTOCOL_7379_ACTIVE
          </div>
        </div>
      </motion.div>
    </div>
  );
};
