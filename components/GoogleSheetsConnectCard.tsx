'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
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
  examCount?: number;
  onUrlSaved?: () => void;
  showToast?: (msg: string) => void;
  lastSyncTime?: string | null;
  sheetsSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
}

export default function GoogleSheetsConnectCard({
  students = [],
  examCount = 6,
  onUrlSaved,
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
      showToast?.('Copied Google Apps Script v3.0 to clipboard');
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
    onUrlSaved?.();
  };

  return (
    <div
      data-testid="google-sheets-sync-card"
      className="bg-white border border-slate-200/85 rounded-2xl px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] font-sans"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">
            Google Sheets Auto-Sync
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 tabular-nums">
            <span>Auto-sync every 10s</span>
            <span aria-hidden="true">&middot;</span>
            <span>{displayStudentCount} students</span>
            <span aria-hidden="true">&middot;</span>
            <span>{examCount} exams</span>
            <span aria-hidden="true">&middot;</span>
            {sheetsSyncStatus === 'syncing' ? (
              <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Syncing...</span>
              </span>
            ) : sheetsSyncStatus === 'error' ? (
              <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                <AlertCircle className="w-3 h-3" />
                <span>Retry in 10s</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                <span>Synced {displayTime}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={LOCKED_SPREADSHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-lg transition-colors whitespace-nowrap shrink-0"
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
            className="inline-flex items-center justify-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Code2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Apps Script</span>
          </button>
        </div>
      </div>

      {isScriptModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Google Apps Script v3.0 Setup"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsScriptModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl w-full max-w-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Google Apps Script (v3.0) &amp; Web App URL
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Includes atomic multi-user locking, formula-safe cloud state chunks, and structured Teachers &amp; Mapping sync.
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
                    Code.gs Script (v3.0)
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
                        <span>Copy Apps Script v3.0</span>
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
                  Save URL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
