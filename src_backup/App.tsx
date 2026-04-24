import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import AuthPage from './components/Auth/AuthPage';
import ProfessorPortal from './components/Admin/ProfessorPortal';
import SecureKeyModal from './components/Admin/SecureKeyModal';
import ErrorBoundary from './components/Common/ErrorBoundary';
import { apiFetch } from './lib/api';

// LAZY LOADING - Simplified for build stability
const StudentDashboard = React.lazy(() => import('./components/Student/StudentDashboard'));
const DeveloperConsole = React.lazy(() => import('./components/Admin/DeveloperConsole'));

interface AppSystemUser {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
}

export default function App() {
  const [user, setUser] = useState<AppSystemUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDevUnlocked, setIsDevUnlocked] = useState(() => sessionStorage.getItem('dev_unlocked') === 'true');
  const [showDevChallenge, setShowDevChallenge] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const timeoutId = setTimeout(() => { if (loading) setLoading(false); }, 3000); 
      try {
        const res = await apiFetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          if (data.role === 'admin' && sessionStorage.getItem('dev_unlocked') === 'true') {
              setIsDevUnlocked(true);
          }
        }
      } catch (err) {
        console.error('App: Auth check failed:', err);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };
    checkAuth();
  }, [loading]);

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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>
        <Loader2 className="animate-spin" size={48} color="#4f46e5" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage onLogin={u => setUser(u)} />;
  }

  let mainContent;
  if (user.role === 'admin') {
    mainContent = (
      <React.Suspense fallback={<div style={{ padding: '80px', textAlign: 'center' }}><Loader2 className="animate-spin" /></div>}>
        {showDevChallenge && <SecureKeyModal onSuccess={handleDevSuccess} onCancel={() => setShowDevChallenge(false)} />}
        {isDevUnlocked ? (
          <DeveloperConsole user={user} onLogout={handleLogout} />
        ) : (
          <ProfessorPortal user={user} onLogout={handleLogout} onSecretTrigger={() => setShowDevChallenge(true)} />
        )}
      </React.Suspense>
    );
  } else if (user.role === 'teacher') {
    mainContent = <ProfessorPortal user={user} onLogout={handleLogout} />;
  } else {
    mainContent = (
      <React.Suspense fallback={<div style={{ padding: '80px', textAlign: 'center' }}><Loader2 className="animate-spin" /></div>}>
        <StudentDashboard user={user} onLogout={handleLogout} />
      </React.Suspense>
    );
  }

  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
        {mainContent}
      </div>
    </ErrorBoundary>
  );
}
