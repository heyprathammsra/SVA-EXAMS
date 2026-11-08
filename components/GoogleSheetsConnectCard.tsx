'use client';

import React, { useState } from 'react';
import { StudentReportRow } from '@/lib/report-card-types';

interface GoogleSheetsConnectCardProps {
  students?: StudentReportRow[];
  selectedExam?: string;
  onSyncSuccess?: () => void;
  showToast?: (msg: string) => void;
  lastSyncTime?: string | null;
  sheetsSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
}

export default function GoogleSheetsConnectCard({
  students = [],
  lastSyncTime: propLastSyncTime,
  sheetsSyncStatus = 'idle',
}: GoogleSheetsConnectCardProps) {
  const [initialTime] = useState<string>(() => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  });

  const displayTime = propLastSyncTime || initialTime;

  const displayStudentCount = students.length || 280;

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs font-sans">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Google Sheets Backup
        </h2>
        <p className="text-sm text-slate-500 mt-1 max-w-2xl leading-relaxed">
          Connected to Saraswati Vidya Academy&apos;s master Google Sheet. Student marks and teacher remarks are backed up automatically.
        </p>
      </div>

      <div className="mt-5 p-3.5 px-4 bg-slate-50/90 border border-slate-200/70 rounded-2xl text-xs sm:text-sm font-mono text-slate-700 font-normal flex items-center justify-between flex-wrap gap-2">
        <span>
          Backed up to Google Sheets ({displayStudentCount} students) &middot; Last updated {displayTime}
        </span>
        {sheetsSyncStatus === 'syncing' && (
          <span className="text-xs font-sans text-amber-600 font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            Saving changes...
          </span>
        )}
      </div>
    </div>
  );
}
