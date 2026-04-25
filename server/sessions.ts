import crypto from 'crypto';
import db from './db.js';
import { logEvent } from './security.js';
import { FieldValue } from 'firebase-admin/firestore';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const AES_KEY = crypto.scryptSync(JWT_SECRET, 'salt', 32); // Derive 32-byte key

export const encryptPayload = (payload: any) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);

  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

export const decryptPayload = (encryptedData: string) => {
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
};

export const generateSignedToken = (sessionId: string, token: string, adminId: string, adminEmail: string) => {
  const payload = {
    sessionId,
    token,
    adminId,
    adminEmail,
    ts: Date.now()
  };

  return encryptPayload(payload);
};

export const handleStartSession = async (req: any, res: any) => {
  if (req.user.role !== 'admin' && req.user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  const { lat, lon, branch, subBranch, className, section, subject } = req.body;
  const token = crypto.randomBytes(16).toString('hex');

  // V3.0 Teacher-Controlled Code Logic: Prioritize Subject/Course Code
  let session_code = Math.floor(100000 + Math.random() * 900000).toString();

  if (subject && subject.trim().length >= 1) {
    const normalized = subject.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    // Prioritize teacher's explicit Course Code if normalization results in a valid identifier
    if (normalized.length >= 1) {
      session_code = normalized;
    }
  }

  const docRef = await db.collection('sessions').add({
    token,
    session_code,
    subject: subject || 'General',
    lat,
    lon,
    branch: branch || null,
    sub_branch: subBranch || null,
    class: className || null,
    section: section || null,
    admin_id: req.user.id,
    created_at: FieldValue.serverTimestamp(),
    is_active: 1
  });

  const signedToken = generateSignedToken(docRef.id, token, req.user.id, req.user.email);
  const createdAt = new Date().toISOString();

  await logEvent(req.user.id, 'SESSION_START', `Professor started class session ${docRef.id} for ${branch} bin ${subBranch} [Code: ${session_code}]`, req);
  res.json({
    id: docRef.id,
    token: signedToken,
    session_code,
    subject: subject || 'General',
    branch: branch || 'TBD',
    section: section || 'TBD',
    className: className || 'TBD',
    createdAt
  });
};

export const handleRefreshToken = async (req: any, res: any) => {
  if (req.user.role !== 'admin' && req.user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  const { sessionId } = req.params;
  const sessionDoc = await db.collection('sessions').doc(sessionId).get();

  if (!sessionDoc.exists) return res.status(404).json({ error: 'Active session not found' });

  const session = sessionDoc.data() as any;
  if (session.is_active !== 1) return res.status(404).json({ error: 'Active session not found' });

  const signedToken = generateSignedToken(sessionDoc.id, session.token, req.user.id, req.user.email);
  res.json({ token: signedToken });
};

export const handleEndSession = async (req: any, res: any) => {
  if (req.user.role !== 'admin' && req.user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  await db.collection('sessions').doc(req.params.id).update({
    is_active: 0,
    end_time: FieldValue.serverTimestamp()
  });
  await logEvent(req.user.id, 'SESSION_END', `Professor manually ended class session ${req.params.id}`, req);
  res.json({ success: true });
};

export const handleGetSessionTimeline = async (req: any, res: any) => {
  if (req.user.role !== 'admin' && req.user.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  const { sessionId } = req.params;

  try {
    // Fetch Attendance Events
    const attQ = await db.collection('attendance')
      .where('session_id', '==', sessionId)
      .orderBy('timestamp', 'asc')
      .get();

    // Fetch Suspicious Events
    const susQ = await db.collection('suspicious_captures')
      .where('session_id', '==', sessionId)
      .orderBy('timestamp', 'asc')
      .get();

    const events: any[] = [];

    attQ.docs.forEach(doc => {
      const d = doc.data();
      events.push({
        type: 'ATTENDANCE',
        id: doc.id,
        timestamp: d.timestamp,
        details: `Attendance marked for ${d.student_id}`,
        status: d.status,
        is_suspicious: d.is_suspicious
      });
    });

    susQ.docs.forEach(doc => {
      const d = doc.data();
      events.push({
        type: 'SUSPICIOUS',
        id: doc.id,
        timestamp: d.timestamp,
        details: `Suspicious activity: ${d.reason}`,
        reason: d.reason
      });
    });

    // Sort by timestamp
    events.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

    res.json(events);
  } catch (err) {
    console.error('Timeline fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
};
