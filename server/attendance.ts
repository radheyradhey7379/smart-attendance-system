import crypto from 'crypto';
import { getDistance } from 'geolib';
import db from './db.js';
import { logEvent, trackAttempt, triggerSecurityIncident } from './security.js';
import { decryptPayload } from './sessions.js';
import { FieldValue } from 'firebase-admin/firestore';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

export const handleMarkAttendance = async (req: any, res: any) => {
  const { token: encryptedToken, lat, lon, deviceFingerprint, faceSnapshot } = req.body;
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
    await logEvent(req.user.id, 'ATTENDANCE_FAIL', 'QR token mismatch or session inactive', req);
    return res.status(400).json({ error: 'Invalid or expired QR code' });
  }

  const now = Date.now();
  if (now - ts > 12 * 1000) {
    return res.status(400).json({ error: 'QR Code has expired. Please scan the current one on screen.' });
  }

  // Firebase Timestamp handling
  const createdAtMs = session.created_at?.toMillis ? session.created_at.toMillis() : new Date(session.created_at).getTime();
  const sessionAgeMs = Date.now() - createdAtMs;
  const sessionAgeMins = sessionAgeMs / (1000 * 60);
  
  let attendanceStatus = 'Present';
  if (sessionAgeMins > 15) {
    return res.status(400).json({ error: 'Attendance window closed for this session' });
  } else if (sessionAgeMins > 10) {
    attendanceStatus = 'Late';
  }

  let isSuspicious = 0;
  let rejectionReason = null;

  if (!lat || !lon) {
    isSuspicious = 1;
    rejectionReason = 'Manual Verification Required (GPS Failed)';
  } else {
    const distance = getDistance(
      { latitude: session.lat, longitude: session.lon },
      { latitude: lat, longitude: lon }
    );
    if (distance > 30) {
      isSuspicious = 1;
      rejectionReason = `Manual Verification Required (Distance: ${distance}m)`;
    }
  }

  // Security: Students must exist in the 'students' collection
  const studentDoc = await db.collection('students').doc(req.user.id).get();
  if (!studentDoc.exists) {
      await logEvent(req.user.id, 'ATTENDANCE_FAIL', 'Non-student account attempted attendance', req);
      return res.status(403).json({ error: 'Only registered students can mark attendance.' });
  }
  
  const student = studentDoc.data() as any;
  
  if (student.device_id && student.device_id !== deviceFingerprint) {
    await logEvent(req.user.id, 'ATTENDANCE_FAIL', 'Device mismatch detected', req);
    return res.status(403).json({ error: 'Unauthorized device. Please use your registered device.' });
  }
  if (!student.device_id) {
    await db.collection('students').doc(req.user.id).update({ device_id: deviceFingerprint });
  }

  const existingQ = await db.collection('attendance')
    .where('student_id', '==', req.user.id)
    .where('session_id', '==', sessionId)
    .get();
    
  if (!existingQ.empty) return res.status(400).json({ error: 'Attendance already marked' });

  if (!isSuspicious) {
    const ipQ = await db.collection('attendance')
      .where('session_id', '==', sessionId)
      .where('ip_address', '==', String(ip))
      .get();
      
    const ipStudents = new Set(ipQ.docs.map(d => d.data().student_id));
    if (ipStudents.size >= 3) {
      isSuspicious = 1;
      rejectionReason = 'Multiple users from same IP';
    }

    const deviceQ = await db.collection('attendance')
      .where('session_id', '==', sessionId)
      .where('device_id', '==', deviceFingerprint)
      .get();
      
    const deviceStudents = new Set(deviceQ.docs.map(d => d.data().student_id));
    if (deviceStudents.size >= 1) {
      isSuspicious = 1;
      rejectionReason = 'Device already used by another student';
    }
  }

  await db.collection('attendance').add({
    student_id: req.user.id,
    session_id: sessionId,
    ip_address: String(ip),
    lat: lat || 0,
    lon: lon || 0,
    device_id: deviceFingerprint,
    face_snapshot: faceSnapshot,
    is_suspicious: isSuspicious,
    rejection_reason: rejectionReason,
    status: attendanceStatus,
    timestamp: FieldValue.serverTimestamp()
  });

  await logEvent(req.user.id, isSuspicious ? 'ATTENDANCE_SUSPICIOUS' : 'ATTENDANCE_SUCCESS', isSuspicious ? `Suspicious attendance: ${rejectionReason}` : 'Attendance marked successfully', req);
  
  res.json({ 
    success: true, 
    message: isSuspicious ? `Attendance marked but flagged: ${rejectionReason}` : 'Attendance marked successfully!',
    isSuspicious 
  });
};
