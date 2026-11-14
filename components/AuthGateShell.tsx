'use client';

import React, { useCallback, useState } from 'react';
import AdminLoginScreen from '@/components/AdminLoginScreen';
import SchoolErpApp from '@/components/SchoolErpApp';
import { TeacherProfile } from '@/lib/teacher-permissions';
import { clearStoredAdminToken } from '@/lib/auth-client';

export default function AuthGateShell() {
  const [session, setSession] = useState<{
    authenticated: boolean;
    role: 'admin' | 'teacher';
    username: string;
    teacherProfile: TeacherProfile | null;
  }>({
    authenticated: false,
    role: 'admin',
    username: '',
    teacherProfile: null,
  });

  const handleAuthenticated = useCallback(
    (
      role: 'admin' | 'teacher',
      username: string,
      teacherProfile: TeacherProfile | null
    ) => {
      setSession({
        authenticated: true,
        role,
        username,
        teacherProfile,
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
      onLogout={handleLogout}
    />
  );
}
