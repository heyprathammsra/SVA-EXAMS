import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_TEACHER_PRATHAM_PROFILE,
  normalizeTeacherProfile,
  TeacherClassSubjectAssignment,
  TeacherProfile,
} from './teacher-permissions';

export type UserRole = 'admin' | 'teacher';

export const ADMIN_SESSION_COOKIE_NAME = 'sva_erp_session';
export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'sva0pass';
export const DEFAULT_TEACHER_USERNAME = 'pratham';
export const DEFAULT_TEACHER_PASSWORD = 'sva#2026';
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export interface AuthSessionPayload {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
  jti: string;
}

export interface AuthVerificationResult {
  authenticated: boolean;
  username?: string;
  role?: UserRole;
  teacherProfile?: TeacherProfile;
}

export interface StoredTeacherAccount extends TeacherProfile {
  passwordHashHex: string;
}

const SCRYPT_SALT = 'sva-erp-v2-credential-salt-9f8e7d6c';

let cachedRuntimeSecret: string | null = null;
let inMemoryTeacherStore: StoredTeacherAccount[] | null = null;

function getUsersFilePath(): string {
  return path.join(process.cwd(), '.data', 'erp-users.json');
}

export function getConfiguredAdminPassword(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.ADMIN_PASSWORD;
  if (typeof configured === 'string' && configured.length > 0) {
    return configured;
  }
  return DEFAULT_ADMIN_PASSWORD;
}

export function getConfiguredTeacherPassword(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.TEACHER_PRATHAM_PASSWORD;
  if (typeof configured === 'string' && configured.length > 0) {
    return configured;
  }
  return DEFAULT_TEACHER_PASSWORD;
}

export function getAuthSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.AUTH_SESSION_SECRET;
  if (typeof configured === 'string' && configured.trim().length >= 16) {
    return configured.trim();
  }
  if (cachedRuntimeSecret) {
    return cachedRuntimeSecret;
  }
  try {
    const dataDir = path.join(process.cwd(), '.data');
    const secretFile = path.join(dataDir, '.auth-secret');
    if (fs.existsSync(secretFile)) {
      const existing = fs.readFileSync(secretFile, 'utf8').trim();
      if (existing.length >= 32) {
        cachedRuntimeSecret = existing;
        return existing;
      }
    }
    fs.mkdirSync(dataDir, { recursive: true });
    const generated = randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
    cachedRuntimeSecret = generated;
    return generated;
  } catch {
    cachedRuntimeSecret = createHash('sha256')
      .update(`sva-erp-session-key::${getConfiguredAdminPassword(env)}::${getConfiguredTeacherPassword(env)}`)
      .digest('hex');
    return cachedRuntimeSecret;
  }
}

export function derivePasswordKey(password: string): Buffer {
  return scryptSync(password, SCRYPT_SALT, 32);
}

export function hashPasswordHex(password: string): string {
  return derivePasswordKey(password).toString('hex');
}

export function verifyPasswordAgainstHashHex(candidate: string, expectedHashHex: string): boolean {
  if (typeof candidate !== 'string' || typeof expectedHashHex !== 'string') {
    return false;
  }
  if (candidate.length === 0 || candidate.length > 256 || expectedHashHex.length !== 64) {
    return false;
  }
  try {
    const candidateBuf = derivePasswordKey(candidate);
    const expectedBuf = Buffer.from(expectedHashHex, 'hex');
    if (candidateBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(candidateBuf, expectedBuf);
  } catch {
    return false;
  }
}

export function verifyPasswordConstantTime(candidate: string, expected: string): boolean {
  if (typeof candidate !== 'string' || typeof expected !== 'string') {
    return false;
  }
  if (candidate.length === 0 || expected.length === 0 || candidate.length > 256) {
    return false;
  }
  return timingSafeEqual(derivePasswordKey(candidate), derivePasswordKey(expected));
}

export function verifyAdminPassword(
  candidate: string,
  expectedPassword: string = getConfiguredAdminPassword()
): boolean {
  return verifyPasswordConstantTime(candidate, expectedPassword);
}

function createDefaultPrathamAccount(env: NodeJS.ProcessEnv = process.env): StoredTeacherAccount {
  return {
    ...DEFAULT_TEACHER_PRATHAM_PROFILE,
    passwordHashHex: hashPasswordHex(getConfiguredTeacherPassword(env)),
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

function stripPasswordHash(account: StoredTeacherAccount): TeacherProfile {
  const { passwordHashHex: _ignored, ...profile } = account;
  return profile;
}

export function loadStoredTeacherAccounts(env: NodeJS.ProcessEnv = process.env): StoredTeacherAccount[] {
  try {
    const usersFile = getUsersFilePath();
    if (fs.existsSync(usersFile)) {
      const raw = fs.readFileSync(usersFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid: StoredTeacherAccount[] = [];
        for (const item of parsed) {
          if (
            item &&
            typeof item === 'object' &&
            typeof item.username === 'string' &&
            typeof item.passwordHashHex === 'string'
          ) {
            const normalized = normalizeTeacherProfile({
              id: item.id,
              name: item.name || item.username,
              username: item.username,
              assignedSubject: item.assignedSubject || 'Science',
              assignedClasses: item.assignedClasses,
              classTeacherOf: item.classTeacherOf,
              assignments: item.assignments,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            });
            valid.push({
              ...normalized,
              passwordHashHex: item.passwordHashHex,
            });
          }
        }
        // Always ensure default 'pratham' exists unless explicitly present
        if (!valid.some((u) => u.username === DEFAULT_TEACHER_USERNAME)) {
          valid.unshift(createDefaultPrathamAccount(env));
        }
        inMemoryTeacherStore = valid;
        return valid;
      }
    }
  } catch {
    // Fallback to in-memory or default seed
  }
  if (inMemoryTeacherStore && inMemoryTeacherStore.length > 0) {
    return inMemoryTeacherStore;
  }
  const initial = [createDefaultPrathamAccount(env)];
  inMemoryTeacherStore = initial;
  return initial;
}

function saveStoredTeacherAccounts(accounts: StoredTeacherAccount[]): void {
  inMemoryTeacherStore = accounts;
  try {
    const dataDir = path.join(process.cwd(), '.data');
    fs.mkdirSync(dataDir, { recursive: true });
    const usersFile = getUsersFilePath();
    const tmpFile = `${usersFile}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(accounts, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpFile, usersFile);
  } catch {
    // In-memory store still holds latest accounts
  }
}

export function listTeacherUsers(env: NodeJS.ProcessEnv = process.env): TeacherProfile[] {
  return loadStoredTeacherAccounts(env).map(stripPasswordHash);
}

export function getTeacherProfileByUsername(
  username: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): TeacherProfile | null {
  if (!username || typeof username !== 'string') return null;
  const clean = username.trim().toLowerCase();
  const found = loadStoredTeacherAccounts(env).find((u) => u.username === clean);
  return found ? stripPasswordHash(found) : null;
}

export function upsertTeacherUser(
  input: {
    id?: string;
    name: string;
    username: string;
    password?: string;
    assignedSubject: string;
    assignedClasses?: string[];
    classTeacherOf?: string | null;
    assignments?: TeacherClassSubjectAssignment[];
  },
  env: NodeJS.ProcessEnv = process.env
): { ok: true; teacher: TeacherProfile; teachers: TeacherProfile[] } | { ok: false; error: string } {
  const cleanUsername = (input.username || '').trim().toLowerCase();
  const cleanName = (input.name || '').trim();
  const cleanSubject = (input.assignedSubject || '').trim();

  if (!cleanName) {
    return { ok: false, error: 'Please enter the teacher name.' };
  }
  if (!cleanUsername || !/^[a-z0-9._@-]{2,40}$/.test(cleanUsername)) {
    return {
      ok: false,
      error: 'Username must be 2–40 characters (letters, numbers, dots, underscores, or hyphens).',
    };
  }
  if (cleanUsername === 'admin') {
    return { ok: false, error: 'Username "admin" is reserved for the administrator account.' };
  }
  if (!cleanSubject) {
    return { ok: false, error: 'Please select an assigned subject.' };
  }

  const accounts = [...loadStoredTeacherAccounts(env)];
  const existingIdx = accounts.findIndex(
    (u) => (input.id && u.id === input.id) || u.username === cleanUsername
  );

  // Prevent username collision when renaming another user
  const usernameCollision = accounts.some(
    (u, idx) => idx !== existingIdx && u.username === cleanUsername
  );
  if (usernameCollision) {
    return { ok: false, error: `Username "${cleanUsername}" is already taken.` };
  }

  const now = Date.now();
  const normalized = normalizeTeacherProfile({
    id: existingIdx >= 0 ? accounts[existingIdx].id : input.id || `teacher-${cleanUsername}-${now}`,
    name: cleanName,
    username: cleanUsername,
    assignedSubject: cleanSubject,
    assignedClasses: input.assignedClasses,
    classTeacherOf: input.classTeacherOf,
    assignments: input.assignments,
    createdAt: existingIdx >= 0 ? accounts[existingIdx].createdAt : now,
    updatedAt: now,
  });

  let passwordHashHex: string;
  if (typeof input.password === 'string' && input.password.trim().length > 0) {
    if (input.password.trim().length < 4) {
      return { ok: false, error: 'Password must be at least 4 characters.' };
    }
    passwordHashHex = hashPasswordHex(input.password.trim());
  } else if (existingIdx >= 0) {
    passwordHashHex = accounts[existingIdx].passwordHashHex;
  } else {
    return { ok: false, error: 'Please provide a password for the new teacher user.' };
  }

  // Ensure at most one teacher is assigned as Class Teacher for the same class section
  if (normalized.classTeacherOf) {
    for (let i = 0; i < accounts.length; i++) {
      if (
        i !== existingIdx &&
        accounts[i].classTeacherOf &&
        accounts[i].classTeacherOf!.toLowerCase() === normalized.classTeacherOf.toLowerCase()
      ) {
        accounts[i] = {
          ...accounts[i],
          classTeacherOf: null,
          updatedAt: now,
        };
      }
    }
  }

  const storedAccount: StoredTeacherAccount = {
    ...normalized,
    passwordHashHex,
  };

  if (existingIdx >= 0) {
    accounts[existingIdx] = storedAccount;
  } else {
    accounts.push(storedAccount);
  }

  saveStoredTeacherAccounts(accounts);
  return {
    ok: true,
    teacher: stripPasswordHash(storedAccount),
    teachers: accounts.map(stripPasswordHash),
  };
}

export function deleteTeacherUser(
  usernameOrId: string,
  env: NodeJS.ProcessEnv = process.env
): { ok: true; teachers: TeacherProfile[] } | { ok: false; error: string } {
  const key = (usernameOrId || '').trim().toLowerCase();
  if (!key) {
    return { ok: false, error: 'Teacher identifier is required.' };
  }
  const accounts = loadStoredTeacherAccounts(env);
  const filtered = accounts.filter(
    (u) => u.id.toLowerCase() !== key && u.username.toLowerCase() !== key
  );
  if (filtered.length === accounts.length) {
    return { ok: false, error: 'Teacher user not found.' };
  }
  saveStoredTeacherAccounts(filtered);
  return {
    ok: true,
    teachers: filtered.map(stripPasswordHash),
  };
}

export function authenticateUserCredentials(
  usernameInput: string | null | undefined,
  passwordInput: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): AuthVerificationResult {
  const rawUsername = typeof usernameInput === 'string' ? usernameInput.trim().toLowerCase() : '';
  const password = typeof passwordInput === 'string' ? passwordInput : '';

  if (!password) {
    return { authenticated: false };
  }

  const adminPassword = getConfiguredAdminPassword(env);
  const defaultPrathamPassword = getConfiguredTeacherPassword(env);

  // Always compute digests so execution time does not leak whether username exists
  const isAdminPass = verifyPasswordConstantTime(password, adminPassword);
  const isDefaultPrathamPass = verifyPasswordConstantTime(password, defaultPrathamPassword);

  if ((rawUsername === 'admin' || rawUsername === '') && isAdminPass) {
    return {
      authenticated: true,
      username: 'admin',
      role: 'admin',
    };
  }

  const teacherAccounts = loadStoredTeacherAccounts(env);
  const matchedTeacher = teacherAccounts.find((u) => u.username === rawUsername);

  if (matchedTeacher) {
    const hashMatches = verifyPasswordAgainstHashHex(password, matchedTeacher.passwordHashHex);
    const prathamEnvFallback =
      rawUsername === DEFAULT_TEACHER_USERNAME && isDefaultPrathamPass;
    if (hashMatches || prathamEnvFallback) {
      return {
        authenticated: true,
        username: matchedTeacher.username,
        role: 'teacher',
        teacherProfile: stripPasswordHash(matchedTeacher),
      };
    }
  } else if (rawUsername === DEFAULT_TEACHER_USERNAME && isDefaultPrathamPass) {
    return {
      authenticated: true,
      username: DEFAULT_TEACHER_USERNAME,
      role: 'teacher',
      teacherProfile: DEFAULT_TEACHER_PRATHAM_PROFILE,
    };
  }

  return { authenticated: false };
}

function signPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createSessionToken(
  options: {
    username?: string;
    role?: UserRole;
    nowMs?: number;
    ttlSeconds?: number;
    secret?: string;
  } = {}
): string {
  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const ttl = options.ttlSeconds ?? ADMIN_SESSION_TTL_SECONDS;
  const secret = options.secret ?? getAuthSessionSecret();
  const role: UserRole = options.role ?? 'admin';
  const sub = options.username ?? (role === 'admin' ? 'admin' : 'pratham');

  const payload: AuthSessionPayload = {
    sub,
    role,
    iat: nowSec,
    exp: nowSec + ttl,
    jti: randomBytes(12).toString('base64url'),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export const createAdminSessionToken = createSessionToken;

export function verifySessionToken(
  token: string | null | undefined,
  options: {
    nowMs?: number;
    secret?: string;
  } = {}
): AuthSessionPayload | null {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const secret = options.secret ?? getAuthSessionSecret();
  const expectedSignature = signPayload(encodedPayload, secret);

  const providedBuf = Buffer.from(providedSignature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<AuthSessionPayload>;
    if (
      !parsed ||
      (parsed.role !== 'admin' && parsed.role !== 'teacher') ||
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
    if (parsed.exp <= nowSec) {
      return null;
    }
    return {
      sub: typeof parsed.sub === 'string' && parsed.sub ? parsed.sub : parsed.role,
      role: parsed.role,
      iat: parsed.iat,
      exp: parsed.exp,
      jti: typeof parsed.jti === 'string' ? parsed.jti : '',
    };
  } catch {
    return null;
  }
}

export const verifyAdminSessionToken = verifySessionToken;

export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (typeof authorizationHeader !== 'string') return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// ============================================================================
// Brute-Force Rate Limiter (Protects /api/auth/login against AI / bot scripts)
// ============================================================================
interface RateLimitRecord {
  failures: number;
  windowStartMs: number;
  lockedUntilMs: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

const loginRateLimitStore = new Map<string, RateLimitRecord>();

export function checkLoginRateLimit(
  clientKey: string,
  nowMs: number = Date.now()
): { allowed: boolean; retryAfterSeconds: number } {
  const key = clientKey || 'default';
  const entry = loginRateLimitStore.get(key);
  if (!entry) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.lockedUntilMs > nowMs) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.lockedUntilMs - nowMs) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  if (nowMs - entry.windowStartMs > RATE_WINDOW_MS) {
    loginRateLimitStore.delete(key);
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordLoginFailure(
  clientKey: string,
  nowMs: number = Date.now()
): { locked: boolean; retryAfterSeconds: number; remainingAttempts: number } {
  const key = clientKey || 'default';
  const existing = loginRateLimitStore.get(key);

  if (!existing || nowMs - existing.windowStartMs > RATE_WINDOW_MS) {
    loginRateLimitStore.set(key, {
      failures: 1,
      windowStartMs: nowMs,
      lockedUntilMs: 0,
    });
    return {
      locked: false,
      retryAfterSeconds: 0,
      remainingAttempts: MAX_FAILED_ATTEMPTS - 1,
    };
  }

  const failures = existing.failures + 1;
  if (failures >= MAX_FAILED_ATTEMPTS) {
    const lockedUntilMs = nowMs + LOCKOUT_DURATION_MS;
    loginRateLimitStore.set(key, {
      failures,
      windowStartMs: existing.windowStartMs,
      lockedUntilMs,
    });
    return {
      locked: true,
      retryAfterSeconds: Math.ceil(LOCKOUT_DURATION_MS / 1000),
      remainingAttempts: 0,
    };
  }

  loginRateLimitStore.set(key, {
    ...existing,
    failures,
  });
  return {
    locked: false,
    retryAfterSeconds: 0,
    remainingAttempts: MAX_FAILED_ATTEMPTS - failures,
  };
}

export function clearLoginFailures(clientKey: string): void {
  loginRateLimitStore.delete(clientKey || 'default');
}

export function resetAllLoginRateLimits(): void {
  loginRateLimitStore.clear();
}
