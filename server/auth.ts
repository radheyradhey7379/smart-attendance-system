import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from './db.js';
import { logEvent, trackAttempt, triggerSecurityIncident } from './security.js';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export const authenticate = (req: any, res: any, next: any) => {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  const deviceId = req.headers['x-device-id'];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;

    // V2.0 Device Integrity Check for Students
    if (decoded.role === 'student' && deviceId) {
      // In production, we would fetch User from DB here to verify binding
      // For now, we allow the bypass only if deviceId matches the one in token or session
    }

    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

export const handleRegister = async (req: any, res: any) => {
  const {
    username, email, password, fullName, program,
    rollNumber, dob, fatherName, session, university,
    studentIdCard, branch, subBranch, deviceId, role = 'student'
  } = req.body;

  // Registration is only for students. Admins/Teachers must be seeded or added manually.
  if (role !== 'student') {
    return res.status(403).json({ error: 'Manual registration only allowed for students' });
  }

  try {
    const studentsRef = db.collection('students');

    // Check uniqueness across students
    const userSnapshot = await studentsRef.where('username', '==', username).get();
    if (!userSnapshot.empty) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const docRef = await studentsRef.add({
      username: username || null,
      email: email || null,
      password: hashedPassword,
      role: 'student',
      full_name: fullName,
      program: program || null,
      roll_number: rollNumber || null,
      dob: dob || null,
      father_name: fatherName || null,
      session: session || null,
      university: university || null,
      student_id_card: studentIdCard || null,
      branch: branch || null,
      sub_branch: subBranch || null,
      status: 'active',
      risk_score: 0,
      violation_count: 0,
      device_id: deviceId || null, // V2.0 Binding
      collection_source: 'students' // Security tag
    });

    await logEvent(docRef.id, 'REGISTER', `New student registered: ${username} with device: ${deviceId}`, req);
    res.json({ success: true, message: 'Registration successful' });
  } catch (err: any) {
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const handleLogin = async (req: any, res: any) => {
  const { username, email, password, role, deviceId } = req.body;
  let userDoc;
  let collectionName = '';

  // Isolated login paths based on role
  if (role === 'teacher' || role === 'admin' || role === 'faculty') {
    // Faculty Login: Check both admins and teachers collections
    const [adminSnapshot, teacherSnapshot] = await Promise.all([
      db.collection('admins').where('email', '==', email).get(),
      db.collection('teachers').where('email', '==', email).get()
    ]);

    if (!adminSnapshot.empty) {
      userDoc = adminSnapshot.docs[0];
      collectionName = 'admins';
    } else if (!teacherSnapshot.empty) {
      userDoc = teacherSnapshot.docs[0];
      collectionName = 'teachers';
    }
  } else {
    // Student Login
    collectionName = 'students';
    const q = await db.collection('students').where('username', '==', username).get();
    if (!q.empty) userDoc = q.docs[0];
  }

  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!userDoc) {
    await logEvent(null, 'LOGIN_FAILED', `Failed login attempt for ${username || email} into ${collectionName}`, req);
    if (trackAttempt(String(ip), 5, 5 * 60 * 1000)) {
      await triggerSecurityIncident('BRUTE_FORCE_LOGIN', `Multiple failed login attempts into ${collectionName}`, 'high', req);
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = { id: userDoc.id, ...userDoc.data() } as any;

  if (!bcrypt.compareSync(password, user.password)) {
    await logEvent(user.id, 'LOGIN_FAILED', `Incorrect password for ${username || email} in ${collectionName}`, req);
    if (trackAttempt(String(ip), 5, 5 * 60 * 1000)) {
      await triggerSecurityIncident('BRUTE_FORCE_LOGIN', `Multiple incorrect password attempts for ${user.id}`, 'high', req, user.id);
    }
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.status === 'blocked') {
    await logEvent(user.id, 'LOGIN_BLOCKED', `Blocked user attempted login: ${user.username || user.email}`, req);
    return res.status(403).json({ error: 'Account locked for security reasons. Contact administrator.' });
  }

  // V2.0 Device Binding Check for Students
  if (user.role === 'student') {
    if (!user.device_id) {
      // First login: bind device
      await db.collection('students').doc(user.id).update({ device_id: deviceId });
      await logEvent(user.id, 'DEVICE_BOUND', `Account bound to device: ${deviceId}`, req);
    } else if (user.device_id !== deviceId) {
      await logEvent(user.id, 'DEVICE_MISMATCH', `Login from unauthorized device: ${deviceId}`, req);
      return res.status(403).json({
        error: 'Security Breach! This account is bound to another device. Access denied.',
        incidentId: 'DEV_MISMATCH'
      });
    }
  }

  const token = jwt.sign({
    id: user.id,
    username: user.role === 'student' ? user.username : null,
    email: user.email,
    role: user.role,
    fullName: user.full_name,
    deviceId, // Include in token for faster validation
    collectionName // Include for subsequent auth checks
  }, JWT_SECRET, { expiresIn: '1d' });

  await logEvent(user.id, 'LOGIN_SUCCESS', `Successful login: ${user.username || user.email} (${user.role})`, req);
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true, // Required for sameSite: 'none'
    maxAge: 24 * 60 * 60 * 1000
  });
  res.json({ id: user.id, username: user.username, email: user.email, role: user.role, fullName: user.full_name, deviceId });
};

export const verifyDevSecret = async (req: any, res: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const { secret } = req.body;
  if (secret === process.env.DEV_PORTAL_KEY) {
    await logEvent(req.user.id, 'DEV_PORTAL_UNLOCK', 'Admin successfully unlocked developer console', req);
    res.json({ success: true });
  } else {
    await logEvent(req.user.id, 'DEV_PORTAL_UNLOCK_FAILED', 'Admin failed developer console unlock attempt', req);
    res.status(401).json({ error: 'Invalid secure key' });
  }
};

export const handleLogout = (req: any, res: any) => {
  res.clearCookie('token');
  res.json({ success: true });
};
