import bcrypt from 'bcryptjs';
import db from './db.js';

// Configuration for distinct role accounts
// Admins = Developers only
const ADMINS = [
  {
    email: 'tripureshtripathi355@gmail.com',
    fullName: 'Developer (Tripuresh)',
    password: 'admin123'
  }
];

// Teachers = University Staff
const TEACHERS = [
  {
    email: 'professor@university.edu',
    fullName: 'Professor Matrix',
    password: 'admin123'
  },
  {
    email: 'hod@university.edu',
    fullName: 'Head of Department',
    password: 'admin123'
  }
];

export const seedTeachers = async () => {
  try {
    console.log("🌱 Database Seeding: Synchronizing Roles...");

    // 1. Seed Developers (Admins)
    const adminsRef = db.collection('admins');
    for (const admin of ADMINS) {
      const existing = await adminsRef.where('email', '==', admin.email).get();
      if (existing.empty) {
        const hashedPassword = bcrypt.hashSync(admin.password, 10);
        await adminsRef.add({
          email: admin.email,
          password: hashedPassword,
          role: 'admin',
          full_name: admin.fullName,
          status: 'active',
          risk_score: 0,
          violation_count: 0,
          is_dev: true // Developer flag
        });
        console.log(`✅ Admin (Developer) seeded: ${admin.email}`);
      }
    }

    // 2. Seed University Staff (Teachers)
    const teachersRef = db.collection('teachers');
    for (const teacher of TEACHERS) {
      const existing = await teachersRef.where('email', '==', teacher.email).get();
      if (existing.empty) {
        const hashedPassword = bcrypt.hashSync(teacher.password, 10);
        await teachersRef.add({
          email: teacher.email,
          password: hashedPassword,
          role: 'teacher',
          full_name: teacher.fullName,
          status: 'active',
          risk_score: 0,
          violation_count: 0
        });
        console.log(`✅ Teacher seeded: ${teacher.email}`);
      }
    }

    console.log("✨ Seeding Complete: 3-Section Model Active.");
  } catch (error) {
    console.error("❌ Error seeding roles. Check your Firebase connectivity.", error);
  }
};
