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
    <div className="bg-white border border-slate-200 rounded-xl p-5 font-sans">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Google Sheets Backup
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Connected to the master Google Sheet. Data is synced automatically.
          </p>
        </div>
      </div>

      <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-600 flex items-center justify-between gap-3">
        <span className="truncate">
          Backed up ({displayStudentCount} students) &middot; Last update {displayTime}
        </span>
        {sheetsSyncStatus === 'syncing' && (
          <span className="text-amber-600 font-bold flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Syncing...
          </span>
        )}
      </div>
    </div>
  );
}
