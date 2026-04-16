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
  const { lat, lon, branch, subBranch, className, section } = req.body;
  const token = crypto.randomBytes(16).toString('hex');
  
  const docRef = await db.collection('sessions').add({
      token, 
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

  await logEvent(req.user.id, 'SESSION_START', `Professor started class session ${docRef.id} for ${branch} bin ${subBranch}`, req);
  res.json({ id: docRef.id, token: signedToken });
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
