'use client';

import React, { useState, useEffect } from 'react';
import {
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  X,
} from 'lucide-react';
import { StudentReportRow } from '@/lib/report-card-types';
import {
  DEFAULT_GAS_URL,
  GAS_SCRIPT_CODE,
  getStoredGasUrl,
  LOCKED_SPREADSHEET_URL,
  saveStoredGasUrl,
} from '@/lib/gas-sync';
import { copyToClipboard } from '@/lib/utils';

interface GoogleSheetsConnectCardProps {
  students?: StudentReportRow[];
  selectedExam?: string;
  examCount?: number;
  onSyncSuccess?: () => void;
  onPullFromSheet?: (examId?: string) => void;
  showToast?: (msg: string) => void;
  lastSyncTime?: string | null;
  sheetsSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
}

export default function GoogleSheetsConnectCard({
  students = [],
  selectedExam = 'SA-1',
  examCount = 6,
  onSyncSuccess,
  onPullFromSheet,
  showToast,
  lastSyncTime: propLastSyncTime,
  sheetsSyncStatus = 'idle',
}: GoogleSheetsConnectCardProps) {
  const [initialTime, setInitialTime] = useState<string>('--:--');
  const [isScriptModalOpen, setIsScriptModalOpen] = useState<boolean>(false);
  const [gasUrlInput, setGasUrlInput] = useState<string>(DEFAULT_GAS_URL);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);

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
      setGasUrlInput(getStoredGasUrl());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const displayTime = propLastSyncTime || initialTime;
  const displayStudentCount = students ? students.length : 0;

  const handleCopyScript = async () => {
    const ok = await copyToClipboard(GAS_SCRIPT_CODE);
    if (ok) {
      setCopiedScript(true);
      showToast?.('Copied Google Apps Script v2.0 to clipboard');
      setTimeout(() => setCopiedScript(false), 2000);
    }
  };

  const handleSaveGasUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = gasUrlInput.trim() || DEFAULT_GAS_URL;
    saveStoredGasUrl(clean);
    setGasUrlInput(clean);
    setIsScriptModalOpen(false);
    showToast?.('Saved Google Apps Script Web App URL');
    onSyncSuccess?.();
  };

  return (
    <div className="bg-white border border-slate-200/85 rounded-2xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Google Sheets Backup &amp; Cloud Sync
            </h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              v2.0 Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Automatically backs up all exams, dynamic subjects, internal breakdowns, remarks, classes, and teacher mappings to the master Google Sheet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onSyncSuccess && (
            <button
              type="button"
              data-testid="sync-all-sheets-btn"
              disabled={sheetsSyncStatus === 'syncing'}
              onClick={onSyncSuccess}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl shadow-[0_1px_2px_rgba(37,99,235,0.25)] transition-all cursor-pointer whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  sheetsSyncStatus === 'syncing' ? 'animate-spin' : ''
                }`}
              />
              <span>
                {sheetsSyncStatus === 'syncing' ? 'Syncing...' : 'Sync All to Sheet'}
              </span>
            </button>
          )}

          {onPullFromSheet && (
            <button
              type="button"
              data-testid="pull-sheet-btn"
              disabled={sheetsSyncStatus === 'syncing'}
              onClick={() => onPullFromSheet(selectedExam)}
              title={`Pull ${selectedExam} marks from Google Sheet`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Pull {selectedExam}</span>
            </button>
          )}

          <a
            href={LOCKED_SPREADSHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            <span>Open Sheet</span>
          </a>

          <button
            type="button"
            data-testid="open-gas-script-modal-btn"
            onClick={() => {
              setGasUrlInput(getStoredGasUrl());
              setIsScriptModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <Code2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Apps Script</span>
          </button>
        </div>
      </div>

      <div className="mt-4 px-3.5 py-2.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs text-slate-600 tabular-nums flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="truncate">
            Backed up ({displayStudentCount} students &middot; {examCount} exams &middot; Teachers &amp; Mapping) &middot; Last update {displayTime}
          </span>
        </div>
        {sheetsSyncStatus === 'syncing' && (
          <span className="text-amber-600 font-semibold shrink-0">
            Syncing with Google Sheets...
          </span>
        )}
      </div>

      {isScriptModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Google Apps Script v2.0 Setup"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsScriptModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl w-full max-w-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Google Apps Script (v2.0) &amp; Web App URL
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Supports dynamic subjects, custom max marks, student particulars, remarks, Teachers &amp; Mapping tab, and cloud state sync.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setIsScriptModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGasUrl} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Deployed Apps Script Web App URL (ends with /exec)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={gasUrlInput}
                    onChange={(e) => setGasUrlInput(e.target.value)}
                    placeholder={DEFAULT_GAS_URL}
                    className="flex-1 h-9 px-3 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setGasUrlInput(DEFAULT_GAS_URL)}
                    className="px-2.5 h-9 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Default
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-slate-600">
                    Updated Code.gs Script (v2.0)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 transition-colors cursor-pointer"
                  >
                    {copiedScript ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Apps Script v2.0</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="w-full max-h-60 overflow-y-auto p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] leading-relaxed select-all">
                  {GAS_SCRIPT_CODE}
                </pre>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsScriptModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Save &amp; Sync Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
