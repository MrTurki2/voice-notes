import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'cvs.db');
const db = new Database(dbPath);

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS cvs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    data TEXT NOT NULL,
    completion_percentage INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export interface CVRecord {
  id: number;
  title: string;
  data: string;
  completion_percentage: number;
  created_at: string;
  updated_at: string;
}

export function getAllCVs(): CVRecord[] {
  const stmt = db.prepare('SELECT * FROM cvs ORDER BY updated_at DESC');
  return stmt.all() as CVRecord[];
}

export function getCVById(id: number): CVRecord | undefined {
  const stmt = db.prepare('SELECT * FROM cvs WHERE id = ?');
  return stmt.get(id) as CVRecord | undefined;
}

export function createCV(title: string, data: string, completionPercentage: number): number {
  const stmt = db.prepare(
    'INSERT INTO cvs (title, data, completion_percentage) VALUES (?, ?, ?)'
  );
  const result = stmt.run(title, data, completionPercentage);
  return result.lastInsertRowid as number;
}

export function updateCV(id: number, data: string, completionPercentage: number): void {
  const stmt = db.prepare(
    'UPDATE cvs SET data = ?, completion_percentage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  stmt.run(data, completionPercentage, id);
}

export function deleteCV(id: number): void {
  const stmt = db.prepare('DELETE FROM cvs WHERE id = ?');
  stmt.run(id);
}

export function calculateCompletionPercentage(cvData: any): number {
  const fields = [
    // Personal Info (30%)
    cvData.personalInfo?.fullName ? 5 : 0,
    cvData.personalInfo?.age ? 3 : 0,
    cvData.personalInfo?.phone ? 4 : 0,
    cvData.personalInfo?.email ? 5 : 0,
    cvData.personalInfo?.location ? 3 : 0,
    cvData.personalInfo?.title ? 5 : 0,
    cvData.personalInfo?.nationality ? 2 : 0,
    cvData.personalInfo?.gender ? 3 : 0,

    // Summary (10%)
    cvData.summary && cvData.summary.length > 20 ? 10 : 0,

    // Experience (25%)
    cvData.experience && cvData.experience.length > 0 ? 25 : 0,

    // Education (15%)
    cvData.education && cvData.education.length > 0 ? 15 : 0,

    // Skills (10%)
    cvData.skills?.technical?.length > 0 || cvData.skills?.soft?.length > 0 ? 10 : 0,

    // Languages (5%)
    cvData.languages && cvData.languages.length > 0 ? 5 : 0,

    // Certificates (3%)
    cvData.certificates && cvData.certificates.length > 0 ? 3 : 0,

    // Hobbies (2%)
    cvData.hobbies && cvData.hobbies.length > 0 ? 2 : 0,
  ];

  return fields.reduce((sum, val) => sum + val, 0);
}

export default db;
