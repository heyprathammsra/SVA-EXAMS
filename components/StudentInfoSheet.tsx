'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  Trash2,
  X,
  Check,
  Copy,
  ClipboardPaste,
  ArrowDownToLine,
  Eraser,
  Grid2x2Check,
  Users,
} from 'lucide-react';
import CustomSelect from '@/components/CustomSelect';
import BulkAddStudentsModal from '@/components/BulkAddStudentsModal';
import {
  ClassDefinition,
  SVA_SCHOOL_HOUSES,
  StudentReportRow,
} from '@/lib/report-card-types';
import {
  formatAttendanceParts,
  formatClassGradeShortLabel,
} from '@/lib/erp-persistence';
import type { BulkStudentCandidate } from '@/lib/student-bulk-import';
import {
  SHEET_COLUMNS,
  SheetCellCoord,
  SheetSelectionRange,
  applyTsvPasteToStudents,
  clearSheetRange,
  fillDownSheetRange,
  getSheetCellDisplayValue,
  normalizeSheetRange,
  serializeSheetRangeToTsv,
} from '@/lib/student-sheet-range';

interface StudentInfoSheetProps {
  classDef: ClassDefinition;
  classes: ClassDefinition[];
  students: StudentReportRow[];
  onSwitchClass: (classSection: string) => void;
  onClose: () => void;
  onUpdateStudent: (studentId: string, patch: Partial<StudentReportRow>) => void;
  onUpdateStudentsBatch?: (
    patchesByStudentId: Record<string, Partial<StudentReportRow>>
  ) => void;
  onAddStudentsBatch?: (
    inputs: Array<{
      name: string;
      rollNo: string;
      section: string;
      dob?: string;
      fatherName?: string;
      motherName?: string;
      house?: string;
      height?: string;
      weight?: string;
      attendance?: string;
      attendanceOutOf?: string;
    }>
  ) => void;
  onBulkImportStudents?: (params: {
    targetSection: string;
    replaceExisting: boolean;
    candidates: BulkStudentCandidate[];
  }) => void;
  onBulkUpdateAttendanceOutOf: (section: string, outOf: string) => void;
  onAddStudent: (input: {
    name: string;
    rollNo: string;
    section: string;
    dob?: string;
    fatherName?: string;
    motherName?: string;
    house?: string;
    height?: string;
    weight?: string;
    attendance?: string;
    attendanceOutOf?: string;
  }) => void;
  onDeleteStudent: (studentId: string) => void;
  showToast: (msg: string) => void;
}

const COL_WIDTH_CLASSES: Record<(typeof SHEET_COLUMNS)[number]['key'], string> = {
  rollNo: 'w-[56px] min-w-[56px]',
  name: 'min-w-[168px]',
  dob: 'min-w-[126px]',
  fatherName: 'min-w-[132px]',
  motherName: 'min-w-[132px]',
  house: 'min-w-[116px]',
  height: 'w-[80px] min-w-[80px]',
  weight: 'w-[80px] min-w-[80px]',
  attendancePresent: 'w-[82px] min-w-[82px]',
  attendanceOutOf: 'w-[112px] min-w-[112px]',
};

async function writeTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const ok = document.execCommand('copy');
    textArea.remove();
    return ok;
  } catch {
    return false;
  }
}

export default function StudentInfoSheet({
  classDef,
  classes,
  students,
  onSwitchClass,
  onClose,
  onUpdateStudent,
  onUpdateStudentsBatch,
  onAddStudentsBatch,
  onBulkImportStudents,
  onBulkUpdateAttendanceOutOf,
  onAddStudent,
  onDeleteStudent,
  showToast,
}: StudentInfoSheetProps) {
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [bulkOutOf, setBulkOutOf] = useState('31');
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);

  // Range selection state
  const [selectedRange, setSelectedRange] = useState<SheetSelectionRange | null>(null);
  const [focusedCell, setFocusedCell] = useState<SheetCellCoord | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const isSelectingRef = useRef(false);
  const isShiftSelectingRef = useRef(false);

  // Fallback inline paste drawer when browser blocks clipboard.readText()
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [manualPasteText, setManualPasteText] = useState('');

  // Inline quick-add student form state
  const [newRoll, setNewRoll] = useState('');
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState('2014-01-01');
  const [newFather, setNewFather] = useState('');
  const [newMother, setNewMother] = useState('');
  const [newHouse, setNewHouse] = useState<string>(SVA_SCHOOL_HOUSES[0]);
  const [newHeight, setNewHeight] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [newAttPresent, setNewAttPresent] = useState('31');
  const [newAttOutOf, setNewAttOutOf] = useState('31');

  const cellRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelectingRef.current) {
        isSelectingRef.current = false;
        setIsSelecting(false);
      }
      isShiftSelectingRef.current = false;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const classStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...students]
      .filter((s) => s.section === classDef.section)
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          String(s.rollNo).toLowerCase().includes(q) ||
          (s.fatherName || '').toLowerCase().includes(q) ||
          (s.motherName || '').toLowerCase().includes(q) ||
          (s.house || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (parseInt(a.rollNo, 10) || 0) - (parseInt(b.rollNo, 10) || 0));
  }, [students, classDef.section, search]);

  const totalInClass = useMemo(
    () => students.filter((s) => s.section === classDef.section).length,
    [students, classDef.section]
  );

  const normalizedRange = useMemo(
    () =>
      normalizeSheetRange(
        selectedRange,
        classStudents.length - 1,
        SHEET_COLUMNS.length - 1
      ),
    [selectedRange, classStudents.length]
  );

  const commitBatchPatches = useCallback(
    (patchesByStudentId: Record<string, Partial<StudentReportRow>>) => {
      const ids = Object.keys(patchesByStudentId);
      if (ids.length === 0) return;
      if (onUpdateStudentsBatch) {
        onUpdateStudentsBatch(patchesByStudentId);
      } else {
        ids.forEach((id) => onUpdateStudent(id, patchesByStudentId[id]));
      }
    },
    [onUpdateStudentsBatch, onUpdateStudent]
  );

  const setDraftValue = (studentId: string, field: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [`${studentId}::${field}`]: value }));
  };

  const clearDraftValue = (studentId: string, field: string) => {
    setDrafts((prev) => {
      const key = `${studentId}::${field}`;
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSelectAllRange = useCallback(() => {
    if (classStudents.length === 0) return;
    setSelectedRange({
      start: { rowIdx: 0, colIdx: 0 },
      end: { rowIdx: classStudents.length - 1, colIdx: SHEET_COLUMNS.length - 1 },
    });
    setFocusedCell({ rowIdx: 0, colIdx: 0 });
    showToast(
      `Selected all ${classStudents.length * SHEET_COLUMNS.length} cells`
    );
  }, [classStudents.length, showToast]);

  const handleSelectColumn = useCallback(
    (colIdx: number) => {
      if (classStudents.length === 0) return;
      setSelectedRange({
        start: { rowIdx: 0, colIdx },
        end: { rowIdx: classStudents.length - 1, colIdx },
      });
      setFocusedCell({ rowIdx: 0, colIdx });
      cellRefs.current[`0:${colIdx}`]?.focus();
    },
    [classStudents.length]
  );

  const handleCopyRange = useCallback(async () => {
    if (classStudents.length === 0) {
      showToast('No student cells to copy');
      return '';
    }
    const target =
      normalizedRange ||
      (focusedCell
        ? normalizeSheetRange(
            { start: focusedCell, end: focusedCell },
            classStudents.length - 1,
            SHEET_COLUMNS.length - 1
          )
        : null);

    if (!target) {
      showToast('Select a cell or range first');
      return '';
    }

    const tsv = serializeSheetRangeToTsv(classStudents, target, bulkOutOf || '31');
    await writeTextToClipboard(tsv);
    showToast(
      `Copied ${target.cellCount} ${target.cellCount === 1 ? 'cell' : 'cells'} to clipboard`
    );
    return tsv;
  }, [classStudents, normalizedRange, focusedCell, bulkOutOf, showToast]);

  const executeTsvPaste = useCallback(
    (tsvText: string, overrideStart?: SheetCellCoord) => {
      const startRow = overrideStart?.rowIdx ?? focusedCell?.rowIdx ?? 0;
      const startCol = overrideStart?.colIdx ?? focusedCell?.colIdx ?? 0;
      const res = applyTsvPasteToStudents({
        classStudents,
        targetRange: normalizedRange,
        startRow,
        startCol,
        tsvText,
        allowAppendRows: search.trim() === '',
        defaultOutOf: bulkOutOf || '31',
      });

      const patchCount = Object.keys(res.patchesByStudentId).length;
      if (patchCount === 0 && res.studentsToAppend.length === 0) {
        if (res.skippedInvalidCount > 0) {
          showToast('Pasted values did not match valid DOB or School House options');
        } else {
          showToast('Nothing to paste');
        }
        return false;
      }

      if (patchCount > 0) {
        commitBatchPatches(res.patchesByStudentId);
      }

      if (res.studentsToAppend.length > 0) {
        const appendInputs = res.studentsToAppend.map((item) => ({
          ...item,
          section: classDef.section,
        }));
        if (onAddStudentsBatch) {
          onAddStudentsBatch(appendInputs);
        } else {
          appendInputs.forEach((inp) => onAddStudent(inp));
        }
      }

      setDrafts({});
      if (res.appliedRange) {
        setSelectedRange(res.appliedRange);
      }
      setIsPasteModalOpen(false);
      setManualPasteText('');

      const parts: string[] = [];
      if (res.updatedCellCount > 0) {
        parts.push(
          `Pasted ${res.updatedCellCount} ${res.updatedCellCount === 1 ? 'cell' : 'cells'}`
        );
      }
      if (res.studentsToAppend.length > 0) {
        parts.push(
          `added ${res.studentsToAppend.length} ${res.studentsToAppend.length === 1 ? 'student' : 'students'}`
        );
      }
      if (res.skippedInvalidCount > 0) {
        parts.push(`${res.skippedInvalidCount} invalid skipped`);
      }
      showToast(parts.join(' · '));
      return true;
    },
    [
      classStudents,
      normalizedRange,
      focusedCell,
      search,
      bulkOutOf,
      classDef.section,
      commitBatchPatches,
      onAddStudentsBatch,
      onAddStudent,
      showToast,
    ]
  );

  const handlePasteButtonClick = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          executeTsvPaste(text);
          return;
        }
      }
    } catch {
      // Browser/iframe denied async clipboard read; open inline paste helper
    }
    setIsPasteModalOpen((prev) => !prev);
  };

  const handleFillDown = useCallback(() => {
    if (!normalizedRange || normalizedRange.rowCount < 2) {
      showToast('Select 2 or more rows in a column to Fill Down');
      return;
    }
    const res = fillDownSheetRange({
      classStudents,
      range: normalizedRange,
      defaultOutOf: bulkOutOf || '31',
    });
    if (res.updatedCellCount === 0) {
      showToast('Nothing to fill down');
      return;
    }
    commitBatchPatches(res.patchesByStudentId);
    setDrafts({});
    showToast(
      `Filled down ${res.updatedCellCount} ${res.updatedCellCount === 1 ? 'cell' : 'cells'}`
    );
  }, [normalizedRange, classStudents, bulkOutOf, commitBatchPatches, showToast]);

  const handleClearRange = useCallback(() => {
    if (!normalizedRange) {
      showToast('Select a range to clear');
      return;
    }
    const res = clearSheetRange({
      classStudents,
      range: normalizedRange,
      defaultOutOf: bulkOutOf || '31',
    });
    if (res.clearedCellCount === 0) {
      showToast('Roll No, Student Name, and House cannot be cleared in bulk');
      return;
    }
    commitBatchPatches(res.patchesByStudentId);
    setDrafts({});
    showToast(
      `Cleared ${res.clearedCellCount} ${res.clearedCellCount === 1 ? 'cell' : 'cells'}`
    );
  }, [normalizedRange, classStudents, bulkOutOf, commitBatchPatches, showToast]);

  const handleControlPaste = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    const text = e.clipboardData?.getData('text') || '';
    if (!text) return;

    const isMultiCellSelection = Boolean(normalizedRange && normalizedRange.cellCount > 1);
    const hasTsvStructure = /[\t\r\n]/.test(text);
    const isSpecialControl =
      e.currentTarget.tagName === 'SELECT' ||
      (e.currentTarget as HTMLInputElement).type === 'date';

    if (isMultiCellSelection || hasTsvStructure || isSpecialControl) {
      e.preventDefault();
      executeTsvPaste(text, { rowIdx, colIdx });
    }
  };

  const handleControlCopy = (
    e: React.ClipboardEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const target = e.currentTarget;
    const isMultiCell = Boolean(normalizedRange && normalizedRange.cellCount > 1);
    const hasPartialTextSelection =
      target instanceof HTMLInputElement &&
      target.type === 'text' &&
      target.selectionStart !== null &&
      target.selectionEnd !== null &&
      target.selectionStart !== target.selectionEnd;

    if (isMultiCell || !hasPartialTextSelection) {
      const rangeToUse =
        normalizedRange ||
        (focusedCell
          ? normalizeSheetRange(
              { start: focusedCell, end: focusedCell },
              classStudents.length - 1,
              SHEET_COLUMNS.length - 1
            )
          : null);
      if (rangeToUse) {
        const tsv = serializeSheetRangeToTsv(
          classStudents,
          rangeToUse,
          bulkOutOf || '31'
        );
        e.preventDefault();
        e.clipboardData.setData('text/plain', tsv);
        writeTextToClipboard(tsv);
        showToast(
          `Copied ${rangeToUse.cellCount} ${rangeToUse.cellCount === 1 ? 'cell' : 'cells'} to clipboard`
        );
      }
    }
  };

  const handleCellMouseDown = useCallback(
    (
      e: React.MouseEvent,
      rowIdx: number,
      colIdx: number,
      isInRange: boolean,
      isMultiCellRange: boolean
    ) => {
      if (e.button !== 0) return;
      if (e.shiftKey) {
        e.preventDefault();
        isShiftSelectingRef.current = true;
        setSelectedRange((prev) => {
          const start = prev
            ? prev.start
            : focusedCell || { rowIdx, colIdx };
          return { start, end: { rowIdx, colIdx } };
        });
        setFocusedCell({ rowIdx, colIdx });
        cellRefs.current[`${rowIdx}:${colIdx}`]?.focus();
      } else if (isInRange && isMultiCellRange) {
        setFocusedCell({ rowIdx, colIdx });
      } else {
        isSelectingRef.current = true;
        setIsSelecting(true);
        setSelectedRange({
          start: { rowIdx, colIdx },
          end: { rowIdx, colIdx },
        });
        setFocusedCell({ rowIdx, colIdx });
      }
    },
    [focusedCell]
  );

  const handleCellMouseEnter = useCallback((rowIdx: number, colIdx: number) => {
    if (isSelectingRef.current) {
      window.getSelection()?.removeAllRanges();
      setSelectedRange((prev) =>
        prev
          ? { start: prev.start, end: { rowIdx, colIdx } }
          : { start: { rowIdx, colIdx }, end: { rowIdx, colIdx } }
      );
    }
  }, []);

  const handleCellFocus = useCallback(
    (
      rowIdx: number,
      colIdx: number,
      isInRange: boolean,
      isMultiCellRange: boolean
    ) => {
      setFocusedCell({ rowIdx, colIdx });
      if (
        !isSelectingRef.current &&
        !isShiftSelectingRef.current &&
        !(isInRange && isMultiCellRange)
      ) {
        setSelectedRange({
          start: { rowIdx, colIdx },
          end: { rowIdx, colIdx },
        });
      }
      isShiftSelectingRef.current = false;
    },
    []
  );

  const handleGridKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    // 1. Shift + Arrows: Expand / Shrink rectangular range
    if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      setSelectedRange((prev) => {
        const base = prev || {
          start: { rowIdx, colIdx },
          end: { rowIdx, colIdx },
        };
        let nextRow = base.end.rowIdx;
        let nextCol = base.end.colIdx;
        if (e.key === 'ArrowDown') nextRow = Math.min(classStudents.length - 1, nextRow + 1);
        if (e.key === 'ArrowUp') nextRow = Math.max(0, nextRow - 1);
        if (e.key === 'ArrowRight') nextCol = Math.min(SHEET_COLUMNS.length - 1, nextCol + 1);
        if (e.key === 'ArrowLeft') nextCol = Math.max(0, nextCol - 1);
        return {
          start: base.start,
          end: { rowIdx: nextRow, colIdx: nextCol },
        };
      });
      return;
    }

    // 2. Ctrl+C / Cmd+C: Copy multi-cell range (or whole cell if no inline text selection)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      const target = e.currentTarget;
      const hasInlineSelection =
        target instanceof HTMLInputElement &&
        target.type === 'text' &&
        target.selectionStart !== null &&
        target.selectionEnd !== null &&
        target.selectionStart !== target.selectionEnd;
      if ((normalizedRange && normalizedRange.cellCount > 1) || !hasInlineSelection) {
        e.preventDefault();
        handleCopyRange();
        return;
      }
    }

    // 3. Ctrl+D / Cmd+D: Fill Down top row of range
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      handleFillDown();
      return;
    }

    // 4. Ctrl+A / Cmd+A: Select all grid cells (preserve single-press select-text when typing inside non-empty text box)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      const target = e.currentTarget;
      const isTextWithUnselectedChars =
        target instanceof HTMLInputElement &&
        target.type === 'text' &&
        target.value.length > 0 &&
        !(target.selectionStart === 0 && target.selectionEnd === target.value.length) &&
        (!normalizedRange || normalizedRange.cellCount <= 1);
      if (!isTextWithUnselectedChars) {
        e.preventDefault();
        handleSelectAllRange();
        return;
      }
    }

    // 5. Delete / Backspace when multiple cells selected -> Clear selected range
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      normalizedRange &&
      normalizedRange.cellCount > 1
    ) {
      e.preventDefault();
      handleClearRange();
      return;
    }

    // 6. Escape -> Collapse range back to focused cell
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsPasteModalOpen(false);
      setSelectedRange({
        start: { rowIdx, colIdx },
        end: { rowIdx, colIdx },
      });
      return;
    }

    // 7. Standard vertical cell navigation
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      if (e.currentTarget.tagName === 'SELECT' && e.key === 'ArrowDown') return;
      e.preventDefault();
      const targetRow = Math.min(classStudents.length - 1, rowIdx + 1);
      setSelectedRange({
        start: { rowIdx: targetRow, colIdx },
        end: { rowIdx: targetRow, colIdx },
      });
      setFocusedCell({ rowIdx: targetRow, colIdx });
      cellRefs.current[`${targetRow}:${colIdx}`]?.focus();
    } else if (e.key === 'ArrowUp') {
      if (e.currentTarget.tagName === 'SELECT') return;
      e.preventDefault();
      const targetRow = Math.max(0, rowIdx - 1);
      setSelectedRange({
        start: { rowIdx: targetRow, colIdx },
        end: { rowIdx: targetRow, colIdx },
      });
      setFocusedCell({ rowIdx: targetRow, colIdx });
      cellRefs.current[`${targetRow}:${colIdx}`]?.focus();
    }
  };

  const handleOpenAddInline = () => {
    const maxRoll = students
      .filter((s) => s.section === classDef.section)
      .reduce((max, s) => Math.max(max, parseInt(s.rollNo, 10) || 0), 0);
    setNewRoll(String(maxRoll + 1).padStart(2, '0'));
    setNewName('');
    setNewDob('2014-01-01');
    setNewFather('');
    setNewMother('');
    setNewHouse(SVA_SCHOOL_HOUSES[0]);
    setNewHeight('');
    setNewWeight('');
    setNewAttPresent(bulkOutOf || '31');
    setNewAttOutOf(bulkOutOf || '31');
    setIsAddingInline(true);
  };

  const handleSubmitInlineStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newRoll.trim()) {
      showToast('Please enter Roll No and Student Name');
      return;
    }
    onAddStudent({
      name: newName.trim(),
      rollNo: newRoll.trim(),
      section: classDef.section,
      dob: newDob,
      fatherName: newFather.trim(),
      motherName: newMother.trim(),
      house: newHouse,
      height: newHeight.trim(),
      weight: newWeight.trim(),
      attendance: newAttPresent.trim(),
      attendanceOutOf: newAttOutOf.trim(),
    });
    setIsAddingInline(false);
    setNewName('');
  };

  const classCountsMap = useMemo(() => {
    const counts: Record<string, number> = {};
    students.forEach((s) => {
      counts[s.section] = (counts[s.section] || 0) + 1;
    });
    return counts;
  }, [students]);

  const classSwitchOptions = useMemo(
    () =>
      classes.map((c) => {
        const count = classCountsMap[c.section] || 0;
        return {
          value: c.section,
          label: formatClassGradeShortLabel(classes, c.section),
          meta: `${count}`,
        };
      }),
    [classes, classCountsMap]
  );

  const rangeSummaryLabel = useMemo(() => {
    if (!normalizedRange) {
      return 'Drag or Shift+Click cells';
    }
    if (normalizedRange.cellCount === 1) {
      const colLabel = SHEET_COLUMNS[normalizedRange.minCol]?.label || 'Cell';
      return `${colLabel} · Row ${normalizedRange.minRow + 1}`;
    }
    return `Selected: ${normalizedRange.rowCount}×${normalizedRange.colCount} (${normalizedRange.cellCount} cells)`;
  }, [normalizedRange]);

  const canFillDown = Boolean(normalizedRange && normalizedRange.rowCount >= 2);
  const canClearRange = Boolean(
    normalizedRange &&
      Array.from(
        { length: normalizedRange.maxCol - normalizedRange.minCol + 1 },
        (_, i) => SHEET_COLUMNS[normalizedRange.minCol + i]
      ).some((c) => c?.clearable)
  );

  const handleBulkModalImport = ({
    targetSection,
    replaceExisting,
    candidates,
  }: {
    targetSection: string;
    replaceExisting: boolean;
    candidates: BulkStudentCandidate[];
  }) => {
    if (onBulkImportStudents) {
      onBulkImportStudents({ targetSection, replaceExisting, candidates });
    } else if (onAddStudentsBatch) {
      onAddStudentsBatch(
        candidates.map((c) => ({ ...c, section: targetSection }))
      );
      showToast(
        `Added ${candidates.length} student${candidates.length === 1 ? '' : 's'}`
      );
    } else {
      candidates.forEach((c) =>
        onAddStudent({ ...c, section: targetSection })
      );
      showToast(
        `Added ${candidates.length} student${candidates.length === 1 ? '' : 's'}`
      );
    }

    setDrafts({});
    setSelectedRange(null);
    setFocusedCell(null);
    setIsBulkAddOpen(false);
    if (targetSection !== classDef.section) {
      onSwitchClass(targetSection);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Minimal Top Command Row */}
      <div className="w-full min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to Classes"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200/90 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Classes</span>
          </button>

          <span className="h-4 w-px bg-slate-200 hidden sm:block" aria-hidden="true" />

          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 truncate">
              {formatClassGradeShortLabel(classes, classDef.section)}
            </h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap shrink-0">
              {totalInClass} {totalInClass === 1 ? 'student' : 'students'}
            </span>
          </div>

          <CustomSelect
            id="sheet-class-switch"
            value={classDef.section}
            onChange={(nextSec) => {
              setDrafts({});
              setSelectedRange(null);
              setFocusedCell(null);
              onSwitchClass(nextSec);
            }}
            containerClassName="flex items-center gap-1.5 bg-white border border-slate-200/90 rounded-lg px-2.5 py-1.5 hover:border-slate-300 transition-colors"
            triggerClassName="text-xs font-medium text-slate-700"
            options={classSwitchOptions}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsBulkAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>Bulk Add</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAddInline}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Inline Add Student Form */}
      {isAddingInline && (
        <form
          onSubmit={handleSubmitInlineStudent}
          className="bg-white border border-blue-200 rounded-xl p-3.5 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900">
              Add New Student to {formatClassGradeShortLabel(classes, classDef.section)}
            </h3>
            <button
              type="button"
              onClick={() => setIsAddingInline(false)}
              aria-label="Close add student form"
              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Roll No *</label>
              <input
                type="text"
                required
                value={newRoll}
                onChange={(e) => setNewRoll(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-md font-mono text-xs"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Student Name *</label>
              <input
                type="text"
                required
                placeholder="Full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">DOB</label>
              <input
                type="date"
                value={newDob}
                onChange={(e) => setNewDob(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Father&apos;s Name</label>
              <input
                type="text"
                placeholder="Father"
                value={newFather}
                onChange={(e) => setNewFather(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Mother&apos;s Name</label>
              <input
                type="text"
                placeholder="Mother"
                value={newMother}
                onChange={(e) => setNewMother(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">House</label>
              <select
                value={newHouse}
                onChange={(e) => setNewHouse(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-xs bg-white"
              >
                {SVA_SCHOOL_HOUSES.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Height (cm)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="132"
                value={newHeight}
                onChange={(e) => setNewHeight(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-md font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Weight (kg)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="25"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 rounded-md font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Att.</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newAttPresent}
                  onChange={(e) => setNewAttPresent(e.target.value)}
                  className="w-full px-1.5 py-1.5 border border-slate-200 rounded-md font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Out Of</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={newAttOutOf}
                  onChange={(e) => setNewAttOutOf(e.target.value)}
                  className="w-full px-1.5 py-1.5 border border-slate-200 rounded-md font-mono text-xs"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddingInline(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
            >
              Add to Sheet
            </button>
          </div>
        </form>
      )}

      {/* Single-Elevation Spreadsheet Card (Utility Bar + Grid) */}
      <div
        className="w-full min-w-0 bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden"
        onPaste={(e) => {
          if (classStudents.length === 0) {
            const text = e.clipboardData?.getData('text') || '';
            if (text.trim()) {
              e.preventDefault();
              executeTsvPaste(text, { rowIdx: 0, colIdx: 0 });
            }
          }
        }}
      >
        {/* Unified Minimal Toolbar */}
        <div className="px-3.5 py-2.5 bg-slate-50/60 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
            <div className="relative w-full sm:w-56 md:w-64 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Search students in sheet"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedRange(null);
                }}
                placeholder="Search student, roll, parent..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200/90 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch('');
                    setSelectedRange(null);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <span
              data-testid="sheet-range-status"
              className={`text-xs font-medium tabular-nums truncate ${
                normalizedRange && normalizedRange.cellCount > 1
                  ? 'text-blue-700'
                  : 'text-slate-400 hidden xl:inline'
              }`}
            >
              {rangeSummaryLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {/* Working Days / Attendance Out Of */}
            <div className="flex items-center gap-1.5 pr-1.5 sm:mr-0.5 sm:border-r sm:border-slate-200">
              <label
                htmlFor="bulk-attendance-outof"
                className="text-slate-500 font-medium whitespace-nowrap"
              >
                Out Of
              </label>
              <input
                id="bulk-attendance-outof"
                type="text"
                inputMode="numeric"
                value={bulkOutOf}
                onChange={(e) => setBulkOutOf(e.target.value)}
                className="w-12 px-1.5 py-1 text-center font-mono tabular-nums text-xs bg-white border border-slate-200/90 rounded-md text-slate-900 focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => {
                  const cleaned = bulkOutOf.trim();
                  if (!cleaned) {
                    showToast('Enter total working days first');
                    return;
                  }
                  onBulkUpdateAttendanceOutOf(classDef.section, cleaned);
                  setDrafts({});
                }}
                title="Apply Attendance Out Of value to entire class"
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-100 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Check className="w-3.5 h-3.5 text-blue-600" />
                <span>Apply</span>
              </button>
            </div>

            {/* Range Clipboard & Bulk Cell Controls */}
            <button
              type="button"
              onClick={handleSelectAllRange}
              disabled={classStudents.length === 0}
              title="Select all cells in sheet (Ctrl+A)"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Grid2x2Check className="w-3.5 h-3.5 text-slate-500" />
              <span>Select All</span>
            </button>

            <button
              type="button"
              onClick={handleCopyRange}
              disabled={!normalizedRange && !focusedCell}
              title="Copy selected range (Ctrl+C)"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Copy className="w-3.5 h-3.5 text-blue-600" />
              <span>Copy</span>
            </button>

            <button
              type="button"
              onClick={handlePasteButtonClick}
              title="Paste cells from Excel / Sheets (Ctrl+V)"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-100 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
              <span>Paste</span>
            </button>

            <button
              type="button"
              onClick={handleFillDown}
              disabled={!canFillDown}
              title="Fill top row value down selected rows (Ctrl+D)"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-slate-500" />
              <span>Fill Down</span>
            </button>

            <button
              type="button"
              onClick={handleClearRange}
              disabled={!canClearRange}
              title="Clear selected optional fields (Delete)"
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200/90 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Inline TSV Paste Box (fallback when browser blocks async clipboard read) */}
        {isPasteModalOpen && (
          <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                Paste Excel / Google Sheets cells below (starts at{' '}
                {normalizedRange
                  ? `${SHEET_COLUMNS[normalizedRange.minCol]?.label}, Row ${normalizedRange.minRow + 1}`
                  : focusedCell
                  ? `${SHEET_COLUMNS[focusedCell.colIdx]?.label}, Row ${focusedCell.rowIdx + 1}`
                  : 'Roll No, Row 1'}
                ):
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsPasteModalOpen(false);
                  setManualPasteText('');
                }}
                aria-label="Close paste box"
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={3}
              aria-label="Paste TSV student data"
              value={manualPasteText}
              onChange={(e) => setManualPasteText(e.target.value)}
              placeholder="Paste tab-separated rows here or press Ctrl+V directly inside any sheet cell..."
              className="w-full p-2 text-xs font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsPasteModalOpen(false);
                  setManualPasteText('');
                }}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeTsvPaste(manualPasteText)}
                disabled={!manualPasteText.trim()}
                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-md cursor-pointer"
              >
                Apply Paste
              </button>
            </div>
          </div>
        )}

        <div className="w-full overflow-x-auto max-h-[68vh] overflow-y-auto">
          <table className={`w-full border-collapse text-xs ${isSelecting ? 'select-none' : ''}`}>
            <thead className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                {SHEET_COLUMNS.map((col, colIdx) => {
                  const isColHighlighted =
                    normalizedRange !== null &&
                    colIdx >= normalizedRange.minCol &&
                    colIdx <= normalizedRange.maxCol;
                  const stickyClass =
                    colIdx === 0
                      ? 'sticky left-0 z-30'
                      : colIdx === 1
                      ? 'sticky left-[56px] z-30'
                      : '';
                  const alignClass = colIdx >= 6 ? 'text-center' : 'text-left';
                  return (
                    <th
                      key={col.key}
                      className={`${stickyClass} ${
                        isColHighlighted ? 'bg-blue-50 text-blue-800' : 'bg-slate-50'
                      } border-r border-slate-200 p-0 whitespace-nowrap ${COL_WIDTH_CLASSES[col.key]}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectColumn(colIdx)}
                        title={`Click to select entire ${col.label} column`}
                        className={`w-full px-2 py-2.5 ${alignClass} hover:bg-blue-50/70 transition-colors cursor-pointer font-semibold`}
                      >
                        {col.label}
                      </button>
                    </th>
                  );
                })}
                <th className="px-1.5 py-2.5 text-center w-[42px] min-w-[42px]">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {classStudents.length === 0 ? null : (
                classStudents.map((stu, rowIdx) => {
                  const defaultPresent = getSheetCellDisplayValue(
                    stu,
                    'attendancePresent',
                    bulkOutOf || '31'
                  );
                  const defaultOutOf = getSheetCellDisplayValue(
                    stu,
                    'attendanceOutOf',
                    bulkOutOf || '31'
                  );

                  const rollVal =
                    drafts[`${stu.id}::rollNo`] ??
                    getSheetCellDisplayValue(stu, 'rollNo');
                  const nameVal =
                    drafts[`${stu.id}::name`] ??
                    getSheetCellDisplayValue(stu, 'name');
                  const dobVal =
                    drafts[`${stu.id}::dob`] ??
                    getSheetCellDisplayValue(stu, 'dob');
                  const fatherVal =
                    drafts[`${stu.id}::fatherName`] ??
                    getSheetCellDisplayValue(stu, 'fatherName');
                  const motherVal =
                    drafts[`${stu.id}::motherName`] ??
                    getSheetCellDisplayValue(stu, 'motherName');
                  const houseVal = getSheetCellDisplayValue(stu, 'house');
                  const heightVal =
                    drafts[`${stu.id}::height`] ??
                    getSheetCellDisplayValue(stu, 'height');
                  const weightVal =
                    drafts[`${stu.id}::weight`] ??
                    getSheetCellDisplayValue(stu, 'weight');
                  const attPresentVal =
                    drafts[`${stu.id}::attendancePresent`] ?? defaultPresent;
                  const attOutOfVal =
                    drafts[`${stu.id}::attendanceOutOf`] ?? defaultOutOf;

                  const cellVisual = (colIdx: number, isSticky: boolean) => {
                    const isFocused =
                      focusedCell?.rowIdx === rowIdx && focusedCell?.colIdx === colIdx;
                    const isInRange =
                      normalizedRange !== null &&
                      rowIdx >= normalizedRange.minRow &&
                      rowIdx <= normalizedRange.maxRow &&
                      colIdx >= normalizedRange.minCol &&
                      colIdx <= normalizedRange.maxCol;
                    const isMultiCellRange = Boolean(
                      normalizedRange && normalizedRange.cellCount > 1
                    );

                    const shadows: string[] = [];
                    if (isInRange && isMultiCellRange && normalizedRange) {
                      if (rowIdx === normalizedRange.minRow)
                        shadows.push('inset 0 2px 0 0 #1d4ed8');
                      if (rowIdx === normalizedRange.maxRow)
                        shadows.push('inset 0 -2px 0 0 #1d4ed8');
                      if (colIdx === normalizedRange.minCol)
                        shadows.push('inset 2px 0 0 0 #1d4ed8');
                      if (colIdx === normalizedRange.maxCol)
                        shadows.push('inset -2px 0 0 0 #1d4ed8');
                    }

                    const bgClass =
                      isInRange && isMultiCellRange
                        ? isSticky
                          ? 'bg-[#dbeafe]'
                          : 'bg-blue-500/15'
                        : isSticky
                        ? 'bg-white'
                        : 'bg-transparent';

                    const focusRingClass =
                      isFocused && !isMultiCellRange
                        ? 'ring-2 ring-inset ring-blue-600 z-10'
                        : '';

                    return {
                      isInRange,
                      isMultiCellRange,
                      style: shadows.length > 0 ? { boxShadow: shadows.join(', ') } : undefined,
                      className: `border-r border-slate-200 p-0 relative transition-colors ${bgClass} ${focusRingClass}`,
                    };
                  };

                  const v0 = cellVisual(0, true);
                  const v1 = cellVisual(1, true);
                  const v2 = cellVisual(2, false);
                  const v3 = cellVisual(3, false);
                  const v4 = cellVisual(4, false);
                  const v5 = cellVisual(5, false);
                  const v6 = cellVisual(6, false);
                  const v7 = cellVisual(7, false);
                  const v8 = cellVisual(8, false);
                  const v9 = cellVisual(9, false);

                  return (
                    <tr
                      key={stu.id}
                      className="hover:bg-blue-50/30 transition-colors"
                    >
                      {/* 0: Roll No */}
                      <td
                        data-sheet-cell={`${rowIdx}:0`}
                        data-in-range={v0.isInRange ? 'true' : 'false'}
                        style={v0.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 0, v0.isInRange, v0.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 0)}
                        className={`sticky left-0 z-10 ${v0.className}`}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:0`] = el;
                          }}
                          type="text"
                          aria-label={`Roll No for ${stu.name}`}
                          value={rollVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftValue(stu.id, 'rollNo', v);
                            if (v.trim()) {
                              onUpdateStudent(stu.id, { rollNo: v.trim() });
                            }
                          }}
                          onBlur={() => clearDraftValue(stu.id, 'rollNo')}
                          onFocus={() => handleCellFocus(rowIdx, 0, v0.isInRange, v0.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 0, v0.isInRange, v0.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 0)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 0)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 0)}
                          className="w-full h-9 px-2.5 bg-transparent font-mono tabular-nums text-slate-800 focus:outline-none"
                        />
                      </td>

                      {/* 1: Student Name */}
                      <td
                        data-sheet-cell={`${rowIdx}:1`}
                        data-in-range={v1.isInRange ? 'true' : 'false'}
                        style={v1.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 1, v1.isInRange, v1.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 1)}
                        className={`sticky left-[56px] z-10 ${v1.className}`}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:1`] = el;
                          }}
                          type="text"
                          aria-label={`Student Name for roll ${stu.rollNo}`}
                          value={nameVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftValue(stu.id, 'name', v);
                            if (v.trim()) {
                              onUpdateStudent(stu.id, { name: v });
                            }
                          }}
                          onBlur={(e) => {
                            if (e.target.value.trim()) {
                              onUpdateStudent(stu.id, { name: e.target.value.trim() });
                            }
                            clearDraftValue(stu.id, 'name');
                          }}
                          onFocus={() => handleCellFocus(rowIdx, 1, v1.isInRange, v1.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 1, v1.isInRange, v1.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 1)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 1)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 1)}
                          className="w-full h-9 px-2.5 bg-transparent font-medium text-slate-900 focus:outline-none"
                        />
                      </td>

                      {/* 2: DOB */}
                      <td
                        data-sheet-cell={`${rowIdx}:2`}
                        data-in-range={v2.isInRange ? 'true' : 'false'}
                        style={v2.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 2, v2.isInRange, v2.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 2)}
                        className={v2.className}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:2`] = el;
                          }}
                          type="date"
                          aria-label={`DOB for ${stu.name}`}
                          value={dobVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftValue(stu.id, 'dob', v);
                            onUpdateStudent(stu.id, { dob: v });
                          }}
                          onBlur={() => clearDraftValue(stu.id, 'dob')}
                          onFocus={() => handleCellFocus(rowIdx, 2, v2.isInRange, v2.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 2, v2.isInRange, v2.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 2)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 2)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 2)}
                          className="w-full h-9 px-2 bg-transparent font-mono text-slate-800 focus:outline-none"
                        />
                      </td>

                      {/* 3: Father's Name */}
                      <td
                        data-sheet-cell={`${rowIdx}:3`}
                        data-in-range={v3.isInRange ? 'true' : 'false'}
                        style={v3.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 3, v3.isInRange, v3.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 3)}
                        className={v3.className}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:3`] = el;
                          }}
                          type="text"
                          aria-label={`Father's Name for ${stu.name}`}
                          value={fatherVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftValue(stu.id, 'fatherName', v);
                            onUpdateStudent(stu.id, { fatherName: v });
                          }}
                          onBlur={() => clearDraftValue(stu.id, 'fatherName')}
                          onFocus={() => handleCellFocus(rowIdx, 3, v3.isInRange, v3.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 3, v3.isInRange, v3.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 3)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 3)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 3)}
                          className="w-full h-9 px-2.5 bg-transparent text-slate-800 focus:outline-none"
                        />
                      </td>

                      {/* 4: Mother's Name */}
                      <td
                        data-sheet-cell={`${rowIdx}:4`}
                        data-in-range={v4.isInRange ? 'true' : 'false'}
                        style={v4.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 4, v4.isInRange, v4.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 4)}
                        className={v4.className}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:4`] = el;
                          }}
                          type="text"
                          aria-label={`Mother's Name for ${stu.name}`}
                          value={motherVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftValue(stu.id, 'motherName', v);
                            onUpdateStudent(stu.id, { motherName: v });
                          }}
                          onBlur={() => clearDraftValue(stu.id, 'motherName')}
                          onFocus={() => handleCellFocus(rowIdx, 4, v4.isInRange, v4.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 4, v4.isInRange, v4.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 4)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 4)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 4)}
                          className="w-full h-9 px-2.5 bg-transparent text-slate-800 focus:outline-none"
                        />
                      </td>

                      {/* 5: House (Four School Houses) */}
                      <td
                        data-sheet-cell={`${rowIdx}:5`}
                        data-in-range={v5.isInRange ? 'true' : 'false'}
                        style={v5.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 5, v5.isInRange, v5.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 5)}
                        className={v5.className}
                      >
                        <select
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:5`] = el;
                          }}
                          aria-label={`House for ${stu.name}`}
                          value={houseVal}
                          onChange={(e) =>
                            onUpdateStudent(stu.id, { house: e.target.value })
                          }
                          onFocus={() => handleCellFocus(rowIdx, 5, v5.isInRange, v5.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 5, v5.isInRange, v5.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 5)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 5)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 5)}
                          className="w-full h-9 px-2 bg-transparent text-slate-800 focus:outline-none cursor-pointer"
                        >
                          {SVA_SCHOOL_HOUSES.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 6: Height */}
                      <td
                        data-sheet-cell={`${rowIdx}:6`}
                        data-in-range={v6.isInRange ? 'true' : 'false'}
                        style={v6.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 6, v6.isInRange, v6.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 6)}
                        className={v6.className}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:6`] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          aria-label={`Height for ${stu.name}`}
                          value={heightVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftValue(stu.id, 'height', v);
                            onUpdateStudent(stu.id, { height: v.trim() });
                          }}
                          onBlur={() => clearDraftValue(stu.id, 'height')}
                          onFocus={() => handleCellFocus(rowIdx, 6, v6.isInRange, v6.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 6, v6.isInRange, v6.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 6)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 6)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 6)}
                          className="w-full h-9 px-2 text-center bg-transparent font-mono tabular-nums text-slate-800 focus:outline-none"
                        />
                      </td>

                      {/* 7: Weight */}
                      <td
                        data-sheet-cell={`${rowIdx}:7`}
                        data-in-range={v7.isInRange ? 'true' : 'false'}
                        style={v7.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 7, v7.isInRange, v7.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 7)}
                        className={v7.className}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:7`] = el;
                          }}
                          type="text"
                          inputMode="decimal"
                          aria-label={`Weight for ${stu.name}`}
                          value={weightVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftValue(stu.id, 'weight', v);
                            onUpdateStudent(stu.id, { weight: v.trim() });
                          }}
                          onBlur={() => clearDraftValue(stu.id, 'weight')}
                          onFocus={() => handleCellFocus(rowIdx, 7, v7.isInRange, v7.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 7, v7.isInRange, v7.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 7)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 7)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 7)}
                          className="w-full h-9 px-2 text-center bg-transparent font-mono tabular-nums text-slate-800 focus:outline-none"
                        />
                      </td>

                      {/* 8: Attendance (Present) */}
                      <td
                        data-sheet-cell={`${rowIdx}:8`}
                        data-in-range={v8.isInRange ? 'true' : 'false'}
                        style={v8.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 8, v8.isInRange, v8.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 8)}
                        className={v8.className}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:8`] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          aria-label={`Attendance for ${stu.name}`}
                          value={attPresentVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftValue(stu.id, 'attendancePresent', v);
                            const outOf =
                              drafts[`${stu.id}::attendanceOutOf`] ?? defaultOutOf;
                            onUpdateStudent(stu.id, {
                              attendance: formatAttendanceParts(v, outOf),
                            });
                          }}
                          onBlur={() => clearDraftValue(stu.id, 'attendancePresent')}
                          onFocus={() => handleCellFocus(rowIdx, 8, v8.isInRange, v8.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 8, v8.isInRange, v8.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 8)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 8)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 8)}
                          className="w-full h-9 px-2 text-center bg-transparent font-mono tabular-nums text-slate-800 focus:outline-none"
                        />
                      </td>

                      {/* 9: Attendance Out Of */}
                      <td
                        data-sheet-cell={`${rowIdx}:9`}
                        data-in-range={v9.isInRange ? 'true' : 'false'}
                        style={v9.style}
                        onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 9, v9.isInRange, v9.isMultiCellRange)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, 9)}
                        className={v9.className}
                      >
                        <input
                          ref={(el) => {
                            cellRefs.current[`${rowIdx}:9`] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          aria-label={`Attendance Out Of for ${stu.name}`}
                          value={attOutOfVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftValue(stu.id, 'attendanceOutOf', v);
                            const present =
                              drafts[`${stu.id}::attendancePresent`] ?? defaultPresent;
                            onUpdateStudent(stu.id, {
                              attendance: formatAttendanceParts(present, v),
                            });
                          }}
                          onBlur={() => clearDraftValue(stu.id, 'attendanceOutOf')}
                          onFocus={() => handleCellFocus(rowIdx, 9, v9.isInRange, v9.isMultiCellRange)}
                          onMouseDown={(e) => handleCellMouseDown(e, rowIdx, 9, v9.isInRange, v9.isMultiCellRange)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, 9)}
                          onPaste={(e) => handleControlPaste(e, rowIdx, 9)}
                          onCopy={handleControlCopy}
                          onKeyDown={(e) => handleGridKeyDown(e, rowIdx, 9)}
                          className="w-full h-9 px-2 text-center bg-transparent font-mono tabular-nums text-slate-800 focus:outline-none"
                        />
                      </td>

                      {/* Delete Row */}
                      <td className="p-0 text-center">
                        <button
                          type="button"
                          aria-label={`Delete ${stu.name}`}
                          title={`Delete ${stu.name}`}
                          onClick={() => onDeleteStudent(stu.id)}
                          className="inline-flex items-center justify-center w-8 h-8 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {classStudents.length === 0 && (
          totalInClass === 0 ? (
            <div className="py-14 px-6 flex flex-col items-center justify-center text-center gap-3.5 border-t border-slate-100">
              <div className="space-y-1 max-w-md">
                <p className="text-sm font-semibold text-slate-900">
                  No students in {formatClassGradeShortLabel(classes, classDef.section)} yet
                </p>
                <p className="text-xs text-slate-500">
                  Paste a roll-and-name list, upload an Excel/CSV file, or add students individually.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkAddOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-2xs"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Bulk Add Students</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddInline}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Single Student</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-12 px-6 text-center text-xs text-slate-500 border-t border-slate-100">
              No students match &ldquo;{search}&rdquo;.
            </div>
          )
        )}
      </div>

      {isBulkAddOpen && (
        <BulkAddStudentsModal
          isOpen={isBulkAddOpen}
          onClose={() => setIsBulkAddOpen(false)}
          classes={classes}
          students={students}
          initialSection={classDef.section}
          defaultOutOf={bulkOutOf || '31'}
          onImport={handleBulkModalImport}
        />
      )}
    </div>
  );
}
