import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthPage } from './components/Auth/AuthPage';
import { ProfessorPortal } from './components/Admin/ProfessorPortal';
import { SecureKeyModal } from './components/Admin/SecureKeyModal';
import { StudentDashboard } from './components/Student/StudentDashboard';
import { ErrorBoundary } from './components/Common/ErrorBoundary';
import { apiFetch } from './lib/api';

const DeveloperConsole = React.lazy(() => import('./components/Admin/DeveloperConsole'));

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
  const [isDevUnlocked, setIsDevUnlocked] = useState(() => sessionStorage.getItem('dev_unlocked') === 'true');
  const [showDevChallenge, setShowDevChallenge] = useState(false);

  // God Mode Summoning
  const handleAdminLogin = (u: User) => {
    setUser(u);
    // No longer auto-prompting for Dev Console
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await apiFetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          // If admin was previously unlocked, keep them there
          if (data.role === 'admin' && sessionStorage.getItem('dev_unlocked') === 'true') {
              setIsDevUnlocked(true);
          }
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
    sessionStorage.removeItem('dev_unlocked');
  };

  const handleDevSuccess = () => {
      setIsDevUnlocked(true);
      setShowDevChallenge(false);
      sessionStorage.setItem('dev_unlocked', 'true');
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
          <React.Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
              <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
          }>
            {showDevChallenge && (
              <SecureKeyModal 
                onSuccess={handleDevSuccess}
                onCancel={() => setShowDevChallenge(false)} 
              />
            )}
            {isDevUnlocked ? (
               <DeveloperConsole user={user} onLogout={handleLogout} />
            ) : (
               <ProfessorPortal 
                 user={user} 
                 onLogout={handleLogout} 
                 onSecretTrigger={() => setShowDevChallenge(true)} 
               />
            )}
          </React.Suspense>
        ) : user.role === 'teacher' ? (
          <ProfessorPortal user={user} onLogout={handleLogout} />
        ) : (
          <StudentDashboard user={user} onLogout={handleLogout} />
        )}
      </div>
    </ErrorBoundary>
  );
}
