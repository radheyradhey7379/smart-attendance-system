import { initializeApp, cert, getApps, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import dotenv from 'dotenv';

dotenv.config();

// Try to load credentials from environment
let credential;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    console.log("📍 Firebase: Loading from Base64 env...");
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
    credential = cert(JSON.parse(decoded));
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
    console.log("📍 Firebase: Loading from individual env vars...");
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
    credential = cert(serviceAccount as ServiceAccount);
  }
} catch (error) {
  console.error("❌ Firebase: Parse error during initialization:", error);
}

if (!credential) {
  console.error("❌ CRITICAL: No Firebase credentials found. Backend will exit.");
  process.exit(1);
}

// Initialize Firebase App
if (getApps().length === 0) {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET && process.env.FIREBASE_STORAGE_BUCKET !== 'placeholder' 
    ? process.env.FIREBASE_STORAGE_BUCKET 
    : 'smartattendencesystem-2aec1.appspot.com';
    
  console.log(`📍 Firebase: Initializing with bucket ${bucket}...`);
  
  initializeApp({
    credential: credential,
    storageBucket: bucket
  });
}

const db = getFirestore();
const storage = getStorage();

export const initDb = async () => {
  console.log("✅ Firebase initialized. Firestore connected.");
};

export { storage };
export default db;
