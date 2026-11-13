// In-memory session storage (never persisted to localStorage or sessionStorage,
// preventing token theft via DevTools/XSS and requiring fresh authentication on open).

import { TeacherProfile } from './teacher-permissions';

let inMemorySessionToken: string | null = null;
let inMemoryUserRole: 'admin' | 'teacher' | null = null;
let inMemoryUsername: string | null = null;
let inMemoryTeacherProfile: TeacherProfile | null = null;

export function getStoredAdminToken(): string | null {
  return inMemorySessionToken;
}

export function getStoredUserRole(): 'admin' | 'teacher' | null {
  return inMemoryUserRole;
}

export function getStoredUsername(): string | null {
  return inMemoryUsername;
}

export function getStoredTeacherProfile(): TeacherProfile | null {
  return inMemoryTeacherProfile;
}

export function setStoredAdminSession(
  token: string,
  role: 'admin' | 'teacher',
  username: string,
  teacherProfile: TeacherProfile | null = null
): void {
  inMemorySessionToken = token;
  inMemoryUserRole = role;
  inMemoryUsername = username;
  inMemoryTeacherProfile = teacherProfile;
}

export function setStoredAdminToken(token: string): void {
  inMemorySessionToken = token;
}

export function clearStoredAdminToken(): void {
  inMemorySessionToken = null;
  inMemoryUserRole = null;
  inMemoryUsername = null;
  inMemoryTeacherProfile = null;
}

export function getAdminAuthHeaders(): Record<string, string> {
  if (!inMemorySessionToken) return {};
  return { Authorization: `Bearer ${inMemorySessionToken}` };
}
