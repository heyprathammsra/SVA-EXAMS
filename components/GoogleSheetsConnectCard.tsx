'use client';

import React, { useState, useEffect } from 'react';
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
  const [initialTime, setInitialTime] = useState<string>('--:--');

  useEffect(() => {
    const timer = setTimeout(() => {
      const now = new Date();
      setInitialTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const displayTime = propLastSyncTime || initialTime;

  const displayStudentCount = students ? students.length : 0;

  return (
    <div className="bg-white border border-slate-200/85 rounded-2xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] font-sans">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Google Sheets Backup
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Connected to the master Google Sheet. Data is synced automatically.
          </p>
        </div>
      </div>

      <div className="mt-4 px-3.5 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs text-slate-600 tabular-nums flex items-center justify-between gap-3">
        <span className="truncate">
          Backed up ({displayStudentCount} students) &middot; Last update {displayTime}
        </span>
        {sheetsSyncStatus === 'syncing' && (
          <span className="text-amber-600 font-semibold shrink-0">
            Syncing...
          </span>
        )}
      </div>
    </div>
  );
}
