import express from 'express';
import cors from 'cors';
import path from 'path';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import db, { initDb } from './server/db.js';
import { seedTeachers } from './server/teachers.js';
import { authenticate, handleRegister, handleLogin, handleLogout, verifyDevSecret } from './server/auth.js';
import { handleStartSession, handleEndSession, handleRefreshToken, handleGetSessionTimeline } from './server/sessions.js';
import { handleMarkAttendance } from './server/attendance.js';
import { logSuspiciousCapture, securityMiddleware, triggerSecurityIncident, checkVulnerability } from './server/security.js';

const PORT = process.env.PORT || 3000;

// Centralized User Data Resolver for logs and history
async function getUsersMap() {
  const [students, teachers, admins] = await Promise.all([
    db.collection('students').get(),
    db.collection('teachers').get(),
    db.collection('admins').get()
  ]);

  const map: Record<string, any> = {};
  students.docs.forEach(d => map[d.id] = { id: d.id, ...d.data(), role: 'student' });
  teachers.docs.forEach(d => map[d.id] = { id: d.id, ...d.data(), role: 'teacher' });
  admins.docs.forEach(d => map[d.id] = { id: d.id, ...d.data(), role: 'admin' });
  return map;
}

async function startServer() {
  await initDb();
  await seedTeachers();

  const app = express();
  app.set('trust proxy', 1);

  // Security: Whitelist only your future Firebase Hosting URL
  const whitelist = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost',      // Android Capacitor
    'https://localhost',     // Android Capacitor (Secured)
    'capacitor://localhost', // iOS Capacitor
    /\.web\.app$/,
    /\.firebaseapp\.com$/
  ];

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || whitelist.some(w => typeof w === 'string' ? w === origin : w.test(origin))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());
  app.use(securityMiddleware);

  // Rate Limiting: Harden the system
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Security Limit: Too many requests.' }
  });

  const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    message: { error: 'Login protection: Too many attempts.' }
  });

  app.use('/api/', limiter);
  app.use('/api/login', authLimiter);
  app.use('/api/register', authLimiter);

  // --- API ROUTES ---

  // Auth
  app.post('/api/register', handleRegister);
  app.post('/api/login', handleLogin);
  app.post('/api/logout', handleLogout);
  app.get('/api/me', authenticate, (req: any, res) => res.json(req.user));
  app.post('/api/admin/verify-secret', authenticate, verifyDevSecret);

  // Multi-Collection User Aggregator (Security Optimized)
  const getUsersMap = async () => {
    const [students, teachers, admins] = await Promise.all([
      db.collection('students').get(),
      db.collection('teachers').get(),
      db.collection('admins').get()
    ]);

    const map: any = {};
    students.docs.forEach(d => map[d.id] = { id: d.id, ...d.data(), role: 'student' });
    teachers.docs.forEach(d => map[d.id] = { id: d.id, ...d.data(), role: 'teacher' });
    admins.docs.forEach(d => map[d.id] = { id: d.id, ...d.data(), role: 'admin' });
    return map;
  };

  // Sessions
  // Student Stats: Streak & Score
  app.get('/api/student/stats', authenticate, async (req: any, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Forbidden' });

    try {
      const studentDoc = await db.collection('students').doc(req.user.id).get();
      if (!studentDoc.exists) return res.status(404).json({ error: 'Student Profile Missing' });
      const student = studentDoc.data() as any;

      // 1. Fetch all attendance records
      const attendanceQ = await db.collection('attendance')
        .where('username', '==', req.user.id)
        .orderBy('timestamp', 'desc')
        .get();

      // 2. Fetch all sessions for this student's metadata
      const sessionsQ = await db.collection('sessions')
        .where('branch', '==', student.branch)
        .where('class', '==', student.session)
        .where('section', '==', student.sub_branch)
        .get();

      const attendedSessions = attendanceQ.docs.map(d => d.data().session_id);
      const totalSessions = sessionsQ.docs.length;

      // Calculate Score
      const score = totalSessions > 0 ? Math.round((attendedSessions.length / totalSessions) * 100) : 100;

      // Calculate Streak (Consecutive days)
      let streak = 0;
      if (attendanceQ.docs.length > 0) {
        const uniqueDates = Array.from(new Set(attendanceQ.docs.map(doc => {
          const ts = doc.data().timestamp;
          return ts.toDate().toISOString().split('T')[0];
        })));

        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        let currentDate = uniqueDates.includes(today) ? today : (uniqueDates.includes(yesterday) ? yesterday : null);

        if (currentDate) {
          streak = 1;
          let idx = uniqueDates.indexOf(currentDate);
          for (let i = idx + 1; i < uniqueDates.length; i++) {
            const d1 = new Date(uniqueDates[i - 1]);
            const d2 = new Date(uniqueDates[i]);
            const diffDays = Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
              streak++;
            } else {
              break;
            }
          }
        }
      }

      res.json({ streak, score });
    } catch (err) {
      console.error('Stats Error:', err);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Unified Active Session Resolver
  app.get('/api/active-session', authenticate, async (req: any, res) => {
    try {
      const q = await db.collection('sessions').where('is_active', '==', 1).get();
      if (q.empty) return res.json({ active: false });

      let sessionDoc = q.docs[0];

      // If user is a student, find the session matching their class/branch
      if (req.user.role === 'student') {
        const studentDoc = await db.collection('students').doc(req.user.id).get();
        if (studentDoc.exists) {
          const student = studentDoc.data() as any;
          const match = q.docs.find(doc => {
            const s = doc.data();
            const sBranch = (s.branch || '').trim().toLowerCase();
            const uBranch = (student.branch || '').trim().toLowerCase();
            const sYear = (s.class || '').trim().toLowerCase();
            const uYear = (student.session || '').trim().toLowerCase();
            const sSection = (s.section || '').trim().toLowerCase();
            const uSection = (student.sub_branch || '').trim().toLowerCase();

            return (!sBranch || sBranch === uBranch) &&
              (!sYear || sYear === uYear) &&
              (!sSection || sSection === uSection);
          });
          if (!match) return res.json({ active: false });
          sessionDoc = match;
        }
      }
      // If user is a teacher, show the session they created (or latest active)
      else {
        const teacherMatch = q.docs.find(d => d.data().admin_id === req.user.id);
        if (teacherMatch) sessionDoc = teacherMatch;
      }

      const data = sessionDoc.data();
      res.json({
        active: true,
        session: {
          id: sessionDoc.id,
          token: data.token,
          session_code: data.session_code,
          subject: data.subject || 'General',
          branch: data.branch,
          section: data.section,
          className: data.class,
          createdAt: data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.created_at || new Date().toISOString())
        }
      });
    } catch (e) {
      console.error('Session Discovery Error:', e);
      res.status(500).json({ error: 'System synchronization issue' });
    }
  });
  app.post('/api/sessions', authenticate, handleStartSession);
  app.post('/api/sessions/:id/end', authenticate, handleEndSession);
  app.get('/api/sessions/:sessionId/refresh', authenticate, handleRefreshToken);
  app.get('/api/admin/session-timeline/:sessionId', authenticate, handleGetSessionTimeline);

  // Historical Attendance Retrieval
  app.get('/api/admin/attendance-history', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

    const { date } = req.query; // YYYY-MM-DD
    if (!date) return res.status(400).json({ error: 'Date is required' });

    try {
      const startOfDay = new Date(date as string);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date as string);
      endOfDay.setHours(23, 59, 59, 999);

      const sessionsQ = await db.collection('sessions')
        .where('created_at', '>=', startOfDay)
        .where('created_at', '<=', endOfDay)
        .orderBy('created_at', 'desc')
        .get();

      const history = await Promise.all(sessionsQ.docs.map(async (doc) => {
        const s = doc.data();
        const attQ = await db.collection('attendance').where('session_id', '==', doc.id).get();
        const usersMap = await getUsersMap();

        const attendance = attQ.docs.map(a => {
          const data = a.data();
          const u = usersMap[data.student_id] || {};
          return { id: a.id, ...data, username: u.username, full_name: u.full_name, roll_number: u.roll_number };
        });

        return {
          id: doc.id,
          ...s,
          created_at: s.created_at?.toDate ? s.created_at.toDate() : s.created_at,
          attendance_count: attendance.length,
          records: attendance
        };
      }));

      res.json(history);
    } catch (err) {
      console.error('History Fetch Error:', err);
      res.status(500).json({ error: 'Could not retrieve history' });
    }
  });

  // Attendance
  app.post('/api/mark-attendance', authenticate, handleMarkAttendance);
  app.get('/api/sessions/:id/attendance', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
    const q = await db.collection('attendance').where('session_id', '==', req.params.id).orderBy('timestamp', 'desc').get();
    const usersMap = await getUsersMap();
    const records = q.docs.map(doc => {
      const data = doc.data();
      const u = usersMap[data.student_id] || {};
      return { id: doc.id, ...data, username: u.username, full_name: u.full_name, program: u.program, roll_number: u.roll_number };
    });
    res.json(records);
  });

  // Security & Logs
  app.get('/api/logs', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const q = await db.collection('audit_logs').orderBy('timestamp', 'desc').limit(100).get();
    const usersMap = await getUsersMap();
    const logs = q.docs.map(doc => {
      const data = doc.data();
      const u = usersMap[data.user_id] || {};
      return { id: doc.id, ...data, username: u.username, full_name: u.full_name };
    });
    res.json(logs);
  });

  app.post('/api/suspicious', authenticate, async (req: any, res) => {
    const { reason, image, sessionId } = req.body;
    await logSuspiciousCapture(req.user.id, sessionId || null, reason, image, req);
    res.json({ success: true });
  });

  app.get('/api/suspicious-captures', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const q = await db.collection('suspicious_captures').orderBy('timestamp', 'desc').get();
    const usersMap = await getUsersMap();
    const captures = q.docs.map(doc => {
      const data = doc.data();
      const u = usersMap[data.student_id] || {};
      return { id: doc.id, ...data, full_name: u.full_name, username: u.username };
    });
    res.json(captures);
  });

  app.get('/api/security/incidents', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const q = await db.collection('security_incidents').orderBy('timestamp', 'desc').limit(100).get();
    const usersMap = await getUsersMap();
    const incidents = q.docs.map(doc => {
      const data = doc.data();
      const u = usersMap[data.user_id] || {};
      return { id: doc.id, ...data, full_name: u.full_name, username: u.username };
    });
    res.json(incidents);
  });

  app.get('/api/security/blocked-ips', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const q = await db.collection('blocked_ips').orderBy('blocked_at', 'desc').get();
    res.json(q.docs.map(d => ({ id: d.id, ...d.data() })));
  });

  app.post('/api/security/unblock-ip', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { ip } = req.body;
    await db.collection('blocked_ips').doc(ip.replace(/\//g, '_')).delete();
    res.json({ success: true });
  });

  app.post('/api/security/lock-user', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    const { userId, status, role } = req.body;
    const collection = role === 'teacher' ? 'teachers' : 'students';
    await db.collection(collection).doc(userId).update({ status });
    res.json({ success: true });
  });

  app.post('/api/security/check-vulnerability', authenticate, checkVulnerability);

  // --- HEALTH & MONITORING ---
  app.get('/api/admin/health-stats', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

    // Aggregated Health Check
    const [sCount, tCount, aCount, incCount, ipCount] = await Promise.all([
      db.collection('students').count().get(),
      db.collection('teachers').count().get(),
      db.collection('admins').count().get(),
      db.collection('security_incidents').count().get(),
      db.collection('blocked_ips').count().get()
    ]);

    const stats = {
      activeUsers: { count: sCount.data().count + tCount.data().count + aCount.data().count },
      totalIncidents: { count: incCount.data().count },
      blockedIps: { count: ipCount.data().count },
      uptime: process.uptime()
    };
    res.json(stats);
  });

  // Serve Frontend Production Build
  const distPath = path.join(process.cwd(), 'dist');
  const indexHtmlPath = path.join(distPath, 'index.html');

  // Build Detection: Help the user if they've forgotten to build
  app.use(async (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();

    const fs = (await import('fs')).default;
    if (!fs.existsSync(indexHtmlPath)) {
      return res.status(200).send(`
            <div style="font-family: sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc;">
                <div style="background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); max-width: 400px; text-align: center;">
                    <h1 style="color: #ef4444; margin-bottom: 1rem;">Setup Required</h1>
                    <p style="color: #64748b; margin-bottom: 1.5rem;">The application is running in <b>Server Mode</b>, but you haven't built the frontend yet.</p>
                    <div style="background: #f1f5f9; padding: 1rem; border-radius: 0.5rem; font-family: monospace; font-size: 0.875rem; color: #0f172a; margin-bottom: 1.5rem;">
                        npm run build
                    </div>
                    <p style="font-size: 0.75rem; color: #94a3b8;">Run the command above to activate the Login Page.</p>
                </div>
            </div>
        `);
    }
    next();
  });

  app.use(express.static(distPath));

  // Fallback for React Router
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(indexHtmlPath);
  });

  const port = Number(PORT);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Backend API running on port ${port}`);
  });
}

startServer();
