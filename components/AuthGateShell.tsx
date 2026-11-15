'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AdminLoginScreen from '@/components/AdminLoginScreen';
import SchoolErpApp from '@/components/SchoolErpApp';
import { PersistedErpState } from '@/lib/erp-persistence';
import { TeacherProfile } from '@/lib/teacher-permissions';
import {
  clearStoredAdminToken,
  getAdminAuthHeaders,
  setStoredAdminSession,
} from '@/lib/auth-client';

export default function AuthGateShell() {
  const [session, setSession] = useState<{
    authenticated: boolean;
    role: 'admin' | 'teacher';
    username: string;
    teacherProfile: TeacherProfile | null;
    initialErpState: PersistedErpState | null;
  }>({
    authenticated: false,
    role: 'admin',
    username: '',
    teacherProfile: null,
    initialErpState: null,
  });
  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const res = await fetch('/api/auth/session', {
          method: 'GET',
          headers: getAdminAuthHeaders(),
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => null);
        if (
          !cancelled &&
          res.ok &&
          data?.authenticated &&
          (data.role === 'admin' || data.role === 'teacher')
        ) {
          if (typeof data.token === 'string' && data.token) {
            setStoredAdminSession(
              data.token,
              data.role,
              data.username || data.role,
              data.teacherProfile || null
            );
          }
          setSession({
            authenticated: true,
            role: data.role,
            username: data.username || data.role,
            teacherProfile: data.teacherProfile || null,
            initialErpState:
              data.erpState && data.erpState.initialized ? data.erpState : null,
          });
        }
      } catch {
        // Ignore network errors and stay on login screen
      }
    }
    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = useCallback(
    (
      role: 'admin' | 'teacher',
      username: string,
      teacherProfile: TeacherProfile | null,
      initialErpState: PersistedErpState | null = null
    ) => {
      setSession({
        authenticated: true,
        role,
        username,
        teacherProfile,
        initialErpState,
      });
    },
    []
  );

  const handleLogout = useCallback(() => {
    clearStoredAdminToken();
    fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => {});
    setSession({
      authenticated: false,
      role: 'admin',
      username: '',
      teacherProfile: null,
      initialErpState: null,
    });
  }, []);

  if (!session.authenticated) {
    return <AdminLoginScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <SchoolErpApp
      key={`${session.role}-${session.username}`}
      userRole={session.role}
      username={session.username}
      initialTeacherProfile={session.teacherProfile}
      initialErpState={session.initialErpState}
      onLogout={handleLogout}
    />
  );
}
