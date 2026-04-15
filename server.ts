import express from 'express';
import cors from 'cors';
import path from 'path';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import db, { initDb } from './server/db.js';
import { seedTeachers } from './server/teachers.js';
import { authenticate, handleRegister, handleLogin, handleLogout } from './server/auth.js';
import { handleStartSession, handleEndSession, handleRefreshToken } from './server/sessions.js';
import { handleMarkAttendance } from './server/attendance.js';
import { logSuspiciousCapture, securityMiddleware, triggerSecurityIncident } from './server/security.js';

const PORT = process.env.PORT || 3000;

async function startServer() {
  await initDb();
  await seedTeachers();

  const app = express();
  
  // Security: Whitelist only your future Firebase Hosting URL
  const whitelist = [
    'http://localhost:5173', 
    'http://localhost:3000',
    'http://localhost',      // Android Capacitor
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
  app.get('/api/active-session', authenticate, async (req: any, res) => {
    const q = await db.collection('sessions').where('is_active', '==', 1).orderBy('created_at', 'desc').limit(1).get();
    res.json({ active: !q.empty });
  });
  app.post('/api/sessions', authenticate, handleStartSession);
  app.post('/api/sessions/:id/end', authenticate, handleEndSession);
  app.get('/api/sessions/:sessionId/refresh', authenticate, handleRefreshToken);
  
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

  // This server is now Headless (API Only). Frontend lives on Firebase Hosting.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend API running on port ${PORT}`);
  });
}

startServer();
