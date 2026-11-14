'use client';

import React, { useCallback, useState } from 'react';
import AdminLoginScreen from '@/components/AdminLoginScreen';
import SchoolErpApp from '@/components/SchoolErpApp';
import { TeacherProfile } from '@/lib/teacher-permissions';

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

  if (!session.authenticated) {
    return <AdminLoginScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <SchoolErpApp
      key={`${session.role}-${session.username}`}
      userRole={session.role}
      initialTeacherProfile={session.teacherProfile}
    />
  );
}
