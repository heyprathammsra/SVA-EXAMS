import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { SubjectBreakdown } from './report-card-types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const firestoreDb: Firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const firestoreAuth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const user = firestoreAuth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user?.uid,
      email: user?.email,
      emailVerified: user?.emailVerified,
      isAnonymous: user?.isAnonymous,
      tenantId: user?.tenantId,
      providerInfo:
        user?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionCheckStarted = false;

export async function testFirestoreConnection(): Promise<boolean> {
  if (connectionCheckStarted) return true;
  connectionCheckStarted = true;
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    // Expected permission-denied if unauthenticated on default-deny test path
    return true;
  }
}

export function sanitizeFirestoreDocId(raw: string, maxLen = 128): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, maxLen);
  return cleaned || 'default';
}

export async function mirrorMarkEntryToFirestoreIfSignedIn(params: {
  studentId: string;
  examId: string;
  section: string;
  subject: string;
  value: number | 'AB' | null;
  breakdown?: SubjectBreakdown;
}): Promise<void> {
  const user = firestoreAuth.currentUser;
  if (!user || !user.emailVerified) return;

  const markId = sanitizeFirestoreDocId(
    `${params.examId}_${params.studentId}_${params.subject}`
  );
  const path = `exam_marks/${markId}`;
  const scoreType =
    params.value === 'AB'
      ? 'AB'
      : typeof params.value === 'number'
      ? 'numeric'
      : 'empty';

  try {
    await setDoc(
      doc(firestoreDb, 'exam_marks', markId),
      {
        id: markId,
        studentId: sanitizeFirestoreDocId(params.studentId, 80),
        examId: params.examId.slice(0, 60),
        section: params.section.slice(0, 60),
        subject: params.subject.slice(0, 60),
        scoreType,
        ...(typeof params.value === 'number' ? { numericValue: params.value } : {}),
        ...(params.breakdown ? { breakdown: params.breakdown } : {}),
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
