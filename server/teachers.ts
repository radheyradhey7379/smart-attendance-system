import bcrypt from 'bcryptjs';
import db from './db.js';

// Configuration for distinct role accounts
const ADMINS = [
  {
    email: 'tripureshtripathi355@gmail.com',
    fullName: 'Tripuresh Tripathi',
    password: 'admin123'
  }
];

const TEACHERS = [
  {
    email: 'professor@university.edu',
    fullName: 'Head Professor',
    password: 'admin123'
  }
];

export const seedTeachers = async () => {
  try {
    // 1. Seed Admins
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
          violation_count: 0
        });
        console.log(`Admin seeded: ${admin.email}`);
      }
    }

    // 2. Seed Teachers
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
        console.log(`Teacher seeded: ${teacher.email}`);
      }
    }
  } catch (error) {
    console.error("Error seeding roles. (Check Firebase credentials)", error);
  }
};
