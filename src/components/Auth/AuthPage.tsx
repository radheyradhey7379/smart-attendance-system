import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, LogIn, UserPlus, ShieldAlert, CheckCircle2, Loader2, School } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
}

export const AuthPage = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<'admin' | 'student'>('student');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    fullName: '',
    program: '',
    rollNumber: '',
    dob: '',
    fatherName: '',
    session: '',
    university: '',
    studentIdCard: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    const endpoint = isLogin ? '/api/login' : '/api/register';
    const loginRole = role === 'admin' ? 'teacher' : 'student'; // Map UI 'Teacher' to backend 'teacher' role
    
    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, role: loginRole }),
      });
      const data = await res.json();
      if (res.ok) {
        if (isLogin) {
          onLogin(data);
        } else {
          setSuccess('Registration successful! Please login.');
          setIsLogin(true);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-white rounded-[40px] shadow-2xl shadow-gray-200/50 overflow-hidden border border-white"
      >
        <div className="bg-indigo-600 p-10 text-white text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-400/20 rounded-full -ml-12 -mb-12 blur-xl" />

          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="p-4 bg-white/10 rounded-3xl backdrop-blur-md border border-white/20 shadow-xl">
              <ShieldCheck size={48} strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Smart Attendance</h1>
              <p className="text-indigo-100 text-sm font-medium mt-1 uppercase tracking-widest opacity-80">Military-Grade Security</p>
            </div>
          </div>
        </div>

        <div className="p-10 space-y-8">
          <div className="flex p-1 bg-gray-100 rounded-2xl">
            <button
              onClick={() => setRole('student')}
              className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${role === 'student' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
            >
              Student
            </button>
            <button
              onClick={() => { setRole('admin'); setIsLogin(true); }}
              className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${role === 'admin' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
            >
              Teacher
            </button>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
            <p className="text-sm text-gray-500 mt-1 font-medium">
              {role === 'admin' ? 'Access the professor control panel' : 'Secure student check-in portal'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {role === 'student' && !isLogin && (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Username</label>
                    <input
                      type="text"
                      placeholder="johndoe123"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Program</label>
                    <input
                      type="text"
                      placeholder="B.Tech CS"
                      value={formData.program}
                      onChange={(e) => setFormData({ ...formData, program: e.target.value })}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </>
              )}

              {role === 'student' && isLogin && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Username</label>
                  <input
                    type="text"
                    placeholder="tripureshtrip123"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    required
                  />
                </div>
              )}

              {role === 'admin' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="professor@university.edu"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    required
                  />
                </div>
              )}

              <div className={isLogin ? "md:col-span-2" : "md:col-span-2"}>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  required
                />
              </div>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium">
                <ShieldAlert size={14} />
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 p-3 bg-green-50 text-green-600 rounded-xl text-xs font-medium">
                <CheckCircle2 size={14} />
                {success}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white p-4 rounded-xl font-bold uppercase tracking-widest hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? <><LogIn size={20} /> Login</> : <><UserPlus size={20} /> Register</>)}
            </button>
          </form>

          {role === 'student' && (
            <div className="text-center">
              <button
                onClick={() => { setIsLogin(!isLogin); setError(''); setSuccess(''); }}
                className="text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
              >
                {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
