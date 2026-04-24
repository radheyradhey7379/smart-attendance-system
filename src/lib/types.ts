export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
  program?: string;
  rollNumber?: string;
  subBranch?: string;
  branch?: string;
  status?: string;
}

export type AppSystemUser = User;
