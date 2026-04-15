import db, { storage } from './db.js';
import { FieldValue } from 'firebase-admin/firestore';

export const logEvent = async (userId: string | null, eventType: string, description: string, req: any) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const deviceId = req.body?.deviceFingerprint || 'unknown';
  await db.collection('audit_logs').add({
    user_id: userId,
    event_type: eventType,
    description,
    ip_address: String(ip),
    device_id: String(deviceId),
    timestamp: FieldValue.serverTimestamp()
  });
};

export const logSuspiciousCapture = async (studentId: string, sessionId: string | null, reason: string, imageData: string, req: any) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const deviceId = req.body?.deviceFingerprint || 'unknown';
  
  let imageUrl = imageData; 
  if (imageData) {
    try {
      const bucket = storage.bucket();
      const buffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ""), 'base64');
      const filename = `suspicious/${Date.now()}_${studentId}.jpg`;
      const file = bucket.file(filename);
      await file.save(buffer, { contentType: 'image/jpeg' });
      await file.makePublic();
      imageUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
    } catch (e) {
      console.warn("Storage upload failed, using fallback.", e);
      if (imageUrl.length > 800000) imageUrl = ""; // Prevent 1MB limit crash
    }
  }

  await db.collection('suspicious_captures').add({
    student_id: studentId,
    session_id: sessionId,
    reason,
    image_data: imageUrl,
    ip_address: String(ip),
    device_id: String(deviceId),
    timestamp: FieldValue.serverTimestamp()
  });
  
  await logEvent(studentId, 'SUSPICIOUS_CAPTURE', `Suspicious activity captured: ${reason}`, req);
};

// --- INCIDENT RESPONSE SYSTEM ---

const attemptTracker = new Map<string, { count: number, lastAttempt: number }>();

export const triggerSecurityIncident = async (type: string, description: string, severity: 'low' | 'medium' | 'high' | 'critical', req: any, userId?: string, sessionId?: string, evidenceImage?: string) => {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress);
  const deviceId = String(req.body?.deviceFingerprint || 'unknown');

  await db.collection('security_incidents').add({
    type,
    user_id: userId || null,
    session_id: sessionId || null,
    ip_address: ip,
    device_id: deviceId,
    evidence_image: evidenceImage || null,
    description,
    severity,
    timestamp: FieldValue.serverTimestamp()
  });

  await logEvent(userId || null, `SECURITY_INCIDENT_${severity.toUpperCase()}`, `Incident Triggered: ${type} - ${description}`, req);

  // --- PROGRESSIVE SECURITY & RISK SCORING ---
  // If we have a userId and collectionName (from auth), we can update risk score
  const collectionName = req.user?.collectionName || 'students'; // Default to students for attendance violations

  if (userId) {
    const scoreMap = { low: 1, medium: 3, high: 5, critical: 10 };
    const scoreIncrease = scoreMap[severity] || 1;
    
    const userRef = db.collection(collectionName).doc(userId);
    const userDoc = await userRef.get();
    if (userDoc.exists) {
      const data = userDoc.data();
      const newRiskScore = (data?.risk_score || 0) + scoreIncrease;
      const newViolationCount = (data?.violation_count || 0) + 1;
      
      await userRef.update({
        risk_score: newRiskScore,
        violation_count: newViolationCount
      });

      // Auto-Defense Logic
      if (newRiskScore >= 20 || newViolationCount >= 5) {
        await userRef.update({ status: 'blocked' });
        await blockIp(ip, `Auto-blocked due to high risk score (${newRiskScore}) for user ${userId} in ${collectionName}`);
      }
    }
  }

  // Auto-Defense: Block IP if critical
  if (severity === 'critical') {
    await blockIp(ip, `Auto-blocked due to critical incident: ${type}`);
  }
};

export const blockIp = async (ip: string, reason: string) => {
  try {
    await db.collection('blocked_ips').doc(ip.replace(/\//g, '_')).set({
      ip_address: ip,
      reason,
      blocked_at: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[SECURITY] IP Blocked: ${ip} - Reason: ${reason}`);
  } catch (e) {
    console.error('Failed to block IP', e);
  }
};

export const isIpBlocked = async (ip: string): Promise<boolean> => {
  const doc = await db.collection('blocked_ips').doc(ip.replace(/\//g, '_')).get();
  return doc.exists;
};

export const trackAttempt = (key: string, limit: number, windowMs: number): boolean => {
  const now = Date.now();
  const data = attemptTracker.get(key) || { count: 0, lastAttempt: now };

  if (now - data.lastAttempt > windowMs) {
    data.count = 1;
    data.lastAttempt = now;
  } else {
    data.count++;
  }

  attemptTracker.set(key, data);
  return data.count > limit;
};

export const securityMiddleware = async (req: any, res: any, next: any) => {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress);
  
  if (await isIpBlocked(ip)) {
    return res.status(403).json({ error: 'Access denied. Your IP has been blocked for security reasons.' });
  }
  next();
};
