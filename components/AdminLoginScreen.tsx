'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { setStoredAdminSession } from '@/lib/auth-client';
import { TeacherProfile } from '@/lib/teacher-permissions';

interface AdminLoginScreenProps {
  onAuthenticated: (
    role: 'admin' | 'teacher',
    username: string,
    teacherProfile: TeacherProfile | null
  ) => void;
}

export default function AdminLoginScreen({ onAuthenticated }: AdminLoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setError('Please enter your username and password.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          username: cleanUsername,
          password,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.authenticated) {
        setError(payload?.error || 'Invalid username or password.');
        setIsSubmitting(false);
        return;
      }

      const resolvedRole: 'admin' | 'teacher' =
        payload.role === 'teacher' ? 'teacher' : 'admin';
      const resolvedUsername: string =
        typeof payload.username === 'string' && payload.username
          ? payload.username
          : cleanUsername.toLowerCase();
      const resolvedTeacherProfile: TeacherProfile | null =
        resolvedRole === 'teacher' && payload.teacherProfile ? payload.teacherProfile : null;

      if (typeof payload.token === 'string' && payload.token.length > 0) {
        setStoredAdminSession(
          payload.token,
          resolvedRole,
          resolvedUsername,
          resolvedTeacherProfile
        );
      }

      onAuthenticated(resolvedRole, resolvedUsername, resolvedTeacherProfile);
    } catch {
      setError('Unable to sign in right now. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[360px]"
      >
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_2px_12px_rgb(15,23,42,0.03)] p-6 sm:p-7">
          {/* Minimal School Header */}
          <div className="flex items-center gap-3">
            <Image
              src="/school_logo.png"
              alt="Saraswati Vidya Academy Crest"
              width={36}
              height={36}
              referrerPolicy="no-referrer"
              className="w-9 h-9 object-contain shrink-0"
              priority
            />
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight text-slate-900 truncate">
                Saraswati Vidya Academy
              </h1>
              <p className="text-xs text-slate-500 truncate">
                Sign in to continue
              </p>
            </div>
          </div>

          {/* Clean Sign-In Form */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Username
              </label>
              <input
                id="login-username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                className="w-full h-10 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200/90 rounded-xl transition-colors focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/15"
              />
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'admin-login-error' : undefined}
                  className={`w-full h-10 pl-3.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 bg-white border rounded-xl transition-colors focus:outline-none focus:ring-2 ${
                    error
                      ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15'
                      : 'border-slate-200/90 focus:border-blue-600 focus:ring-blue-500/15'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div
                id="admin-login-error"
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 rounded-xl bg-rose-50/80 border border-rose-200/80 px-3 py-2 text-xs text-rose-700"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-10 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
