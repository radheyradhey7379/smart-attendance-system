import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from './components/Common/ErrorBoundary.js';
import { AuthPage } from './components/Auth/AuthPage.js';
import { ProfessorPortal } from './components/Admin/ProfessorPortal.js';
import { DeveloperConsole } from './components/Admin/DeveloperConsole.js';
import { SecureKeyModal } from './components/Admin/SecureKeyModal.js';
import { StudentDashboard } from './components/Student/StudentDashboard.js';
import { apiFetch } from './lib/api.js';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDevUnlocked, setIsDevUnlocked] = useState(false);
  const [showDevChallenge, setShowDevChallenge] = useState(false);

  // New: Prompt Admin upon login
  const handleAdminLogin = (u: User) => {
    setUser(u);
    if (u.role === 'admin') {
        const wantsDev = window.confirm("Access Developer Console?\n(Requires Secure Key Identity Verification)");
        if (wantsDev) setShowDevChallenge(true);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await apiFetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (err) {
        console.error('Auth check failed');
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    await apiFetch('/api/logout', { method: 'POST' });
    setUser(null);
    setIsDevUnlocked(false);
    setShowDevChallenge(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Initializing Secure Portal...</p>
      </div>
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {!user ? (
          <AuthPage onLogin={handleAdminLogin} />
        ) : user.role === 'admin' ? (
          <>
            {showDevChallenge && (
              <SecureKeyModal 
                onSuccess={() => { setIsDevUnlocked(true); setShowDevChallenge(false); }}
                onCancel={() => setShowDevChallenge(false)} 
              />
            )}
            {isDevUnlocked ? (
               <DeveloperConsole user={user} onLogout={handleLogout} />
            ) : (
               <ProfessorPortal user={user} onLogout={handleLogout} />
            )}
          </>
        ) : user.role === 'teacher' ? (
          <ProfessorPortal user={user} onLogout={handleLogout} />
        ) : (
          <StudentDashboard user={user} onLogout={handleLogout} />
        )}
      </div>
    </ErrorBoundary>
  );
}
