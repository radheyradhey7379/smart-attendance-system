import crypto from 'crypto';
import { getDistance } from 'geolib';
import db from './db.js';
import { logEvent, trackAttempt, triggerSecurityIncident } from './security.js';
import { decryptPayload } from './sessions.js';
import { FieldValue } from 'firebase-admin/firestore';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export const handleMarkAttendance = async (req: any, res: any) => {
  const { token: encryptedToken, sessionCode, lat, lon, deviceId, faceSnapshot, livenessVerified } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  let payload;
  try {
    payload = decryptPayload(encryptedToken);
  } catch (err) {
    await logEvent(req.user.id, 'ATTENDANCE_FAIL', 'Tampered, invalid or unreadable QR code', req);
    if (trackAttempt(String(ip), 3, 5 * 60 * 1000)) {
      await triggerSecurityIncident('QR_TAMPERING', 'Multiple invalid QR scan attempts', 'critical', req, req.user.id);
    }
    return res.status(400).json({ error: 'Invalid or tampered QR code' });
  }

  const { sessionId, token, ts } = payload;
  const sessionDoc = await db.collection('sessions').doc(sessionId).get();
  const session = sessionDoc.exists ? sessionDoc.data() : null;

  if (!session || session.token !== token || session.is_active !== 1) {
    return res.status(400).json({ error: 'Invalid or expired QR code' });
  }

  if (session.session_code.trim().toUpperCase() !== sessionCode.trim().toUpperCase()) {
    return res.status(403).json({ error: 'Invalid classroom access code.' });
  }

  const now = Date.now();
  if (now - ts > 15 * 1000) {
    return res.status(400).json({ error: 'QR Code expired. Scan the live one.' });
  }

  const studentDoc = await db.collection('students').doc(req.user.id).get();
  if (!studentDoc.exists) return res.status(403).json({ error: 'Unauthorized profile' });

  const student = studentDoc.data() as any;

  // V2.0 Hardware Binding Check
  if (student.device_id && student.device_id !== deviceId) {
    await triggerSecurityIncident('DEVICE_SPOOF_ATTEMPT', `Student ${req.user.id} attempted check-in from unauthorized device: ${deviceId}`, 'high', req, req.user.id);
    return res.status(403).json({ error: 'Security Violation: Device signature mismatch.' });
  }

  if (!student.device_id) {
    await db.collection('students').doc(req.user.id).update({ device_id: deviceId });
  }

  // V2.0 Liveness Check
  if (!livenessVerified) {
    return res.status(403).json({ error: 'Biometric verification incomplete.' });
  }

  // Branch/Section Checks
  const uBranch = (student.branch || '').trim().toLowerCase();
  const sBranch = (session.branch || '').trim().toLowerCase();
  if (sBranch && uBranch !== sBranch) return res.status(403).json({ error: 'Branch mismatch' });

  let isSuspicious = 0;
  let rejectionReason = null;

  // Geofencing
  const distance = getDistance(
    { latitude: session.lat, longitude: session.lon },
    { latitude: lat, longitude: lon }
  );
  if (distance > 50) {
    isSuspicious = 1;
    rejectionReason = `Outside geofence (${distance}m)`;
  }

  // Anti-Proxy IP/Device Multiplicity
  const [ipQ, devQ] = await Promise.all([
    db.collection('attendance').where('session_id', '==', sessionId).where('ip_address', '==', String(ip)).get(),
    db.collection('attendance').where('session_id', '==', sessionId).where('device_id', '==', deviceId).get()
  ]);

  if (ipQ.size >= 3) { isSuspicious = 1; rejectionReason = 'Shared Network / Proxy IP'; }
  if (devQ.size >= 1) {
    isSuspicious = 1;
    rejectionReason = 'Shared Device Attempt';
    await triggerSecurityIncident('PROXY_ATTEMPT', `Possible proxy attempt via device: ${deviceId}`, 'high', req, req.user.id);
  }

  await db.collection('attendance').add({
    student_id: req.user.id,
    session_id: sessionId,
    ip_address: String(ip),
    lat: lat || 0,
    lon: lon || 0,
    device_id: deviceId,
    face_snapshot: faceSnapshot,
    is_suspicious: isSuspicious,
    rejection_reason: rejectionReason,
    status: isSuspicious ? 'Flagged' : 'Present',
    timestamp: FieldValue.serverTimestamp()
  });

  res.json({ success: true, isSuspicious, message: isSuspicious ? 'Flagged for inspection' : 'Attendance verified' });
};
