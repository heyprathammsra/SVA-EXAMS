'use client';

import React, { useMemo } from 'react';
import {
  ExamConfig,
  StudentReportRow,
  ComputedStudentResult,
  computeStudentResult,
  getEffectiveExamConfigForClass,
} from '@/lib/report-card-types';
import {
  formatReferenceClassHeader,
  getReferenceSubjectHeaderTitle,
  orderSubjectsLikeReferenceSheet,
  orderSubjectsForConsolidated,
  resolveSubjectComponentsForExport,
  formatComponentColumnHeader,
  getStudentComponentMark,
  computeCbseGrade,
  getReferenceSubjectTabName,
} from '@/lib/excel-export';
import { subjectsMatch } from '@/lib/teacher-permissions';

interface ReferenceSheetPreviewCardProps {
  students: StudentReportRow[];
  examConfig: ExamConfig;
  examId: string;
  classScope: string;
  classGrade?: string;
  subjectScope: string;
  onSubjectScopeChange?: (val: string) => void;
  allowedSubjectNames?: string[];
  allowConsolidated?: boolean;
}

export default function ReferenceSheetPreviewCard({
  students,
  examConfig,
  examId,
  classScope,
  classGrade,
  subjectScope,
  onSubjectScopeChange,
  allowedSubjectNames,
  allowConsolidated = true,
}: ReferenceSheetPreviewCardProps) {
  const effectiveConfig = useMemo(
    () =>
      classScope && classScope !== 'all'
        ? getEffectiveExamConfigForClass(examConfig, classScope)
        : examConfig,
    [examConfig, classScope]
  );

  const allReferenceSubjects = useMemo(() => {
    const ordered = orderSubjectsLikeReferenceSheet(effectiveConfig.subjects);
    if (!allowedSubjectNames) return ordered;
    return ordered.filter((s) =>
      allowedSubjectNames.some((allowed) => subjectsMatch(allowed, s.name))
    );
  }, [effectiveConfig.subjects, allowedSubjectNames]);

  const [localTab, setLocalTab] = React.useState<string | null>(null);

  // Derive active preview tab directly without cascading setState in useEffect
  const activeTab = useMemo(() => {
    if (!allowConsolidated) {
      const fromScope = allReferenceSubjects.find(
        (s) => s.name.toLowerCase() === (subjectScope || '').toLowerCase()
      );
      if (fromScope) return fromScope.name;
      const fromLocal = allReferenceSubjects.find(
        (s) => s.name.toLowerCase() === (localTab || '').toLowerCase()
      );
      return fromLocal ? fromLocal.name : allReferenceSubjects[0]?.name || '';
    }
    if (localTab === 'result_analysis' && (subjectScope === 'consolidated' || subjectScope === 'all_consolidated' || !subjectScope)) {
      return 'result_analysis';
    }
    if (subjectScope === 'consolidated') return 'consolidated';
    if (subjectScope && subjectScope !== 'all_consolidated') return subjectScope;
    return localTab || 'consolidated';
  }, [allowConsolidated, allReferenceSubjects, subjectScope, localTab]);

  const isConsolidated = allowConsolidated && activeTab === 'consolidated';
  const isResultAnalysis = allowConsolidated && activeTab === 'result_analysis';

  const currentSubject = useMemo(() => {
    if (isConsolidated || isResultAnalysis) return allReferenceSubjects[0];
    const found = allReferenceSubjects.find(
      (s) => s.name.toLowerCase() === activeTab.toLowerCase()
    );
    return found || allReferenceSubjects[0];
  }, [allReferenceSubjects, isConsolidated, isResultAnalysis, activeTab]);

  const filteredStudents = useMemo(() => {
    const list = students.filter(
      (s) => !classScope || classScope === 'all' || s.section === classScope
    );
    return [...list].sort((a, b) => {
      if ((!classScope || classScope === 'all') && a.section !== b.section) {
        return a.section.localeCompare(b.section);
      }
      return (parseInt(String(a.rollNo), 10) || 0) - (parseInt(String(b.rollNo), 10) || 0);
    });
  }, [students, classScope]);

  const examCode = effectiveConfig.code || examId;
  const isPtExam = examCode.toUpperCase().startsWith('PT');

  // Single Subject components
  const components = useMemo(() => {
    if (!currentSubject) return [];
    const sampleBd = filteredStudents.find(
      (s) => s.breakdowns?.[currentSubject.name]
    )?.breakdowns?.[currentSubject.name];
    return resolveSubjectComponentsForExport(
      currentSubject,
      examCode,
      sampleBd
    );
  }, [currentSubject, filteredStudents, examCode]);

  const includeTotalColumn = !isPtExam && components.length > 1;

  // Consolidated sheet setup
  const consolidatedSubjects = useMemo(() => {
    return orderSubjectsForConsolidated(effectiveConfig.subjects);
  }, [effectiveConfig.subjects]);

  const studentResultsMap = useMemo(() => {
    const map = new Map<string, ComputedStudentResult>();
    filteredStudents.forEach((student) => {
      const res = computeStudentResult(
        student,
        effectiveConfig.subjects,
        effectiveConfig.totalFormula,
        effectiveConfig.customFormula,
        effectiveConfig.resultCriteria
      );
      map.set(student.id, res);
    });
    return map;
  }, [
    filteredStudents,
    effectiveConfig.subjects,
    effectiveConfig.totalFormula,
    effectiveConfig.customFormula,
    effectiveConfig.resultCriteria,
  ]);

  const consolidatedStructure = useMemo(() => {
    const subjectSections = consolidatedSubjects.map((sub) => {
      const sampleBd = filteredStudents.find(
        (s) => s.breakdowns?.[sub.name]
      )?.breakdowns?.[sub.name];
      const comps = resolveSubjectComponentsForExport(sub, examCode, sampleBd);
      const isMulti = !isPtExam && comps.length > 1;
      const subCols = isMulti ? comps.length + 2 : comps.length; // comps + TOTAL + GRADE
      return {
        subject: sub,
        components: comps,
        isMulti,
        colSpan: subCols,
      };
    });
    const hasAnyMulti = subjectSections.some((sec) => sec.isMulti);
    const totalCols = 2 + subjectSections.reduce((sum, sec) => sum + sec.colSpan, 0) + 3; // GRAND TOTAL, PERCENTAGE, GRADE
    const firstStudentRes = filteredStudents[0]
      ? studentResultsMap.get(filteredStudents[0].id)
      : undefined;
    const grandMaxMarks =
      firstStudentRes?.totalMax ||
      subjectSections.reduce(
        (sum, sec) => sum + (sec.subject.maxMarks || (isPtExam ? 25 : 100)),
        0
      );
    return {
      totalCols,
      hasAnyMulti,
      grandMaxMarks: grandMaxMarks || 700,
      subjectSections,
    };
  }, [
    consolidatedSubjects,
    filteredStudents,
    examCode,
    isPtExam,
    studentResultsMap,
  ]);

  if (!currentSubject) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs p-8 text-center text-xs text-slate-500">
        No mapped subjects are available to preview for the selected class.
      </div>
    );
  }

  const sheetRow3Title = isConsolidated
    ? 'CONSOLIDATED SHEET'
    : isResultAnalysis
    ? 'RESULT ANALYSIS SHEET'
    : getReferenceSubjectHeaderTitle(currentSubject.name);

  const resolvedClassGrade = classGrade || filteredStudents[0]?.class || '';

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
      {/* Top Bar with matching workbook tab buttons */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-800">
            Excel Sheet Preview
          </span>
          <span className="text-[11px] text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="text-[11px] font-medium text-slate-500">
            {formatReferenceClassHeader(classScope, '2026 -2027', examCode, resolvedClassGrade)}
          </span>
        </div>

        {/* Workbook Sheet Tabs */}
        <div className="flex items-center flex-wrap gap-1.5">
          {allowConsolidated && (
            <>
              <button
                type="button"
                onClick={() => {
                  setLocalTab('consolidated');
                  onSubjectScopeChange?.('consolidated');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  activeTab === 'consolidated'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-200'
                }`}
              >
                Consolidated Sheet
              </button>

              <button
                type="button"
                onClick={() => {
                  setLocalTab('result_analysis');
                  onSubjectScopeChange?.('consolidated');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  activeTab === 'result_analysis'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-200'
                }`}
              >
                Result Analysis
              </button>
            </>
          )}

          {allReferenceSubjects.map((sub) => {
            const isSubActive =
              !isConsolidated &&
              !isResultAnalysis &&
              activeTab.toLowerCase() === sub.name.toLowerCase();
            return (
              <button
                key={sub.name}
                type="button"
                onClick={() => {
                  setLocalTab(sub.name);
                  onSubjectScopeChange?.(sub.name);
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  isSubActive
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-200'
                }`}
              >
                {getReferenceSubjectTabName(sub.name)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified Sheet Frame */}
      <div className="p-4 sm:p-5 bg-white">
        <div className="border border-slate-900 bg-white overflow-hidden">
          {/* Always-Centered Official Sheet Title Rows (Rows 1-3) */}
          <div
            data-testid="sheet-preview-title-banner"
            className="bg-white text-slate-900 text-center select-none"
          >
            <div className="py-2 px-4 font-bold text-sm tracking-tight border-b border-slate-300 bg-slate-50/40">
              SARASWATI VIDYA ACADEMY, LONAVALA
            </div>
            <div className="py-1.5 px-4 font-bold text-xs tracking-tight border-b border-slate-300 bg-white">
              {formatReferenceClassHeader(classScope, '2026 -2027', examCode, resolvedClassGrade)}
            </div>
            <div className="py-1.5 px-4 font-bold text-xs tracking-wide border-b border-slate-900 bg-slate-50/60">
              {sheetRow3Title}
            </div>
          </div>

          {/* Scrollable Data Grid */}
          <div className="overflow-x-auto bg-white">
            {isConsolidated ? (
              /* =========================================================
                 CONSOLIDATED SHEET PREVIEW
                 ========================================================= */
              <table className="w-full border-collapse text-slate-900 text-xs">
                <thead>
                  {!consolidatedStructure.hasAnyMulti ? (
                    /* Single Header Row for PT / Single-Mark Exams */
                    <tr className="bg-slate-100">
                      <th className="sticky left-0 z-20 border-b border-r border-slate-900 px-2 py-2.5 text-center font-bold uppercase w-[52px] min-w-[52px] max-w-[52px] text-slate-900 bg-slate-100 align-middle">
                        ROLL NO
                      </th>
                      <th className="sticky left-[52px] z-20 border-b border-r border-slate-900 px-3 py-2.5 text-center font-bold uppercase w-[185px] min-w-[185px] max-w-[205px] text-slate-900 bg-slate-100 align-middle">
                        NAME OF THE STUDENTS
                      </th>
                      {consolidatedStructure.subjectSections.map((sec) => {
                        const maxM = sec.components[0]?.maxMarks ?? sec.subject.maxMarks ?? 25;
                        return (
                          <th
                            key={sec.subject.name}
                            className="border-b border-r border-slate-900 px-2 py-2.5 text-center font-bold uppercase text-[11px] leading-tight tracking-tight bg-slate-100/90 text-slate-900 min-w-[84px] whitespace-nowrap align-middle"
                          >
                            {sec.subject.name.toUpperCase()} ({maxM})
                          </th>
                        );
                      })}
                      <th className="border-b border-r border-slate-900 px-2 py-2.5 text-center font-bold uppercase text-[11px] min-w-[86px] whitespace-nowrap bg-emerald-50 text-emerald-950 align-middle">
                        TOTAL ({consolidatedStructure.grandMaxMarks})
                      </th>
                      <th className="border-b border-r border-slate-900 px-2 py-2.5 text-center font-bold uppercase text-[11px] min-w-[72px] whitespace-nowrap bg-emerald-50 text-emerald-950 align-middle">
                        PCT (%)
                      </th>
                      <th className="border-b border-slate-900 px-2 py-2.5 text-center font-bold uppercase text-[11px] min-w-[58px] whitespace-nowrap bg-emerald-50 text-emerald-950 align-middle">
                        GRADE
                      </th>
                    </tr>
                  ) : (
                    /* Two-Row Grouped Header for Multi-Component Exams (SA-1 / SA-2) */
                    <>
                      <tr className="bg-slate-50">
                        <th
                          rowSpan={2}
                          className="sticky left-0 z-20 border-b border-r border-slate-900 px-2 py-2 text-center font-bold uppercase w-[52px] min-w-[52px] max-w-[52px] text-slate-900 bg-slate-50 align-middle"
                        >
                          ROLL NO
                        </th>
                        <th
                          rowSpan={2}
                          className="sticky left-[52px] z-20 border-b border-r border-slate-900 px-3 py-2 text-center font-bold uppercase w-[185px] min-w-[185px] max-w-[205px] text-slate-900 bg-slate-50 align-middle"
                        >
                          NAME OF THE STUDENTS
                        </th>
                        {consolidatedStructure.subjectSections.map((sec) => (
                          <th
                            key={sec.subject.name}
                            colSpan={sec.colSpan}
                            className="border-b border-r border-slate-900 px-2 py-2 text-center font-bold uppercase tracking-tight bg-slate-100/90 text-slate-900 whitespace-nowrap"
                          >
                            {sec.subject.name.toUpperCase()}
                          </th>
                        ))}
                        <th
                          colSpan={3}
                          className="border-b border-slate-900 px-2 py-2 text-center font-bold uppercase tracking-tight bg-emerald-50 text-emerald-950 whitespace-nowrap"
                        >
                          OVERALL PERFORMANCE
                        </th>
                      </tr>

                      <tr className="bg-white">
                        {consolidatedStructure.subjectSections.map((sec) => (
                          <React.Fragment key={`subheaders-${sec.subject.name}`}>
                            {sec.components.map((comp) => {
                              const headerText = sec.isMulti
                                ? formatComponentColumnHeader(comp, examCode)
                                : `${examCode} (${comp.maxMarks})`;
                              return (
                                <th
                                  key={comp.key}
                                  className={`border-b border-r border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] leading-tight text-slate-800 bg-white ${
                                    sec.isMulti
                                      ? 'min-w-[84px]'
                                      : 'min-w-[78px] whitespace-nowrap'
                                  }`}
                                >
                                  {headerText}
                                </th>
                              );
                            })}
                            {sec.isMulti && (
                              <>
                                <th className="border-b border-r border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[74px] whitespace-nowrap bg-slate-100 text-slate-900">
                                  TOTAL ({sec.subject.maxMarks || 100})
                                </th>
                                <th className="border-b border-r border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[58px] whitespace-nowrap bg-slate-100 text-slate-900">
                                  GRADE
                                </th>
                              </>
                            )}
                          </React.Fragment>
                        ))}
                        <th className="border-b border-r border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[86px] whitespace-nowrap bg-emerald-50/80 text-emerald-950">
                          TOTAL ({consolidatedStructure.grandMaxMarks})
                        </th>
                        <th className="border-b border-r border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[72px] whitespace-nowrap bg-emerald-50/80 text-emerald-950">
                          PCT (%)
                        </th>
                        <th className="border-b border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[58px] whitespace-nowrap bg-emerald-50/80 text-emerald-950">
                          GRADE
                        </th>
                      </tr>
                    </>
                  )}
                </thead>
                <tbody>
                  {filteredStudents.map((student, idx) => {
                    const rollNum = parseInt(String(student.rollNo), 10) || idx + 1;
                    const studentResult = studentResultsMap.get(student.id);
                    const isLastRow = idx === filteredStudents.length - 1;
                    const rowBorderB = isLastRow ? '' : 'border-b border-slate-900';
                    let grandTotal = 0;

                    return (
                      <tr key={student.id} className="group hover:bg-blue-50/40 transition-colors">
                        <td
                          className={`sticky left-0 z-10 ${rowBorderB} border-r border-slate-900 px-2 py-1.5 text-center font-mono tabular-nums font-medium bg-white group-hover:bg-blue-50/40`}
                        >
                          {rollNum}
                        </td>
                        <td
                          className={`sticky left-[52px] z-10 ${rowBorderB} border-r border-slate-900 px-3 py-1.5 text-left font-medium whitespace-nowrap bg-white group-hover:bg-blue-50/40`}
                        >
                          {student.name}
                        </td>
                        {consolidatedStructure.subjectSections.map((sec) => {
                          const subMax = sec.subject.maxMarks || (isPtExam ? 25 : 100);
                          const compVals = sec.components.map((comp) =>
                            getStudentComponentMark(
                              student,
                              sec.subject.name,
                              comp,
                              sec.components,
                              subMax
                            )
                          );
                          const sumVal = compVals.reduce<number>(
                            (acc, v) => acc + (typeof v === 'number' ? v : 0),
                            0
                          );
                          const isAbsent = student.marks[sec.subject.name] === 'AB';
                          const totalVal: number | string = isAbsent
                            ? 'AB'
                            : sumVal > 0
                            ? sumVal
                            : (student.marks[sec.subject.name] ?? 0);

                          if (typeof totalVal === 'number') {
                            grandTotal += totalVal;
                          }

                          const grade =
                            typeof totalVal === 'number'
                              ? computeCbseGrade((totalVal / subMax) * 100)
                              : isAbsent
                              ? 'AB'
                              : '';

                          return (
                            <React.Fragment key={`marks-${student.id}-${sec.subject.name}`}>
                              {compVals.map((val, cIdx) => (
                                <td
                                  key={sec.components[cIdx]?.key || cIdx}
                                  className={`${rowBorderB} border-r border-slate-900 px-2 py-1.5 text-center font-mono tabular-nums font-normal`}
                                >
                                  {val}
                                </td>
                              ))}
                              {sec.isMulti && (
                                <>
                                  <td
                                    className={`${rowBorderB} border-r border-slate-900 px-2 py-1.5 text-center font-mono tabular-nums font-bold bg-slate-50/70`}
                                  >
                                    {totalVal}
                                  </td>
                                  <td
                                    className={`${rowBorderB} border-r border-slate-900 px-2 py-1.5 text-center font-mono tabular-nums font-bold bg-slate-50/70`}
                                  >
                                    {grade}
                                  </td>
                                </>
                              )}
                            </React.Fragment>
                          );
                        })}
                        {/* Overall Performance */}
                        <td
                          className={`${rowBorderB} border-r border-slate-900 px-2 py-1.5 text-center font-mono tabular-nums font-bold bg-emerald-50/40 text-emerald-950`}
                        >
                          {studentResult ? studentResult.totalObtained : grandTotal}
                        </td>
                        <td
                          className={`${rowBorderB} border-r border-slate-900 px-2 py-1.5 text-center font-mono tabular-nums font-bold bg-emerald-50/40 text-emerald-950`}
                        >
                          {studentResult
                            ? studentResult.percentage.toFixed(2)
                            : ((grandTotal / consolidatedStructure.grandMaxMarks) * 100).toFixed(2)}
                          %
                        </td>
                        <td
                          className={`${rowBorderB} px-2 py-1.5 text-center font-mono tabular-nums font-bold bg-emerald-50/40 text-emerald-950`}
                        >
                          {studentResult
                            ? studentResult.grade
                            : computeCbseGrade(
                                (grandTotal / consolidatedStructure.grandMaxMarks) * 100
                              )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : isResultAnalysis ? (
              /* =========================================================
                 RESULT ANALYSIS SHEET PREVIEW (Subject Totals + Overall)
                 ========================================================= */
              <table className="w-full border-collapse text-slate-900 text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border-b border-r border-slate-900 px-2.5 py-2 text-center font-bold uppercase w-16 text-slate-900">
                      ROLL NO
                    </th>
                    <th className="border-b border-r border-slate-900 px-3 py-2 text-center font-bold uppercase min-w-[200px] text-slate-900">
                      NAME OF THE STUDENT
                    </th>
                    {consolidatedSubjects.map((sub) => (
                      <th
                        key={sub.name}
                        className="border-b border-r border-slate-900 px-2.5 py-2 text-center font-bold uppercase min-w-[84px] text-slate-900 bg-white"
                      >
                        <div>{getReferenceSubjectTabName(sub.name)}</div>
                        <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                          ({sub.maxMarks || (isPtExam ? 25 : 100)})
                        </div>
                      </th>
                    ))}
                    <th className="border-b border-r border-slate-900 px-2.5 py-2 text-center font-bold uppercase min-w-[92px] bg-emerald-50 text-emerald-950">
                      <div>TOTAL</div>
                      <div className="text-[10px] font-semibold text-emerald-700 mt-0.5">
                        ({consolidatedStructure.grandMaxMarks})
                      </div>
                    </th>
                    <th className="border-b border-r border-slate-900 px-2.5 py-2 text-center font-bold uppercase min-w-[92px] bg-emerald-50 text-emerald-950">
                      PERCENTAGE
                    </th>
                    <th className="border-b border-slate-900 px-2.5 py-2 text-center font-bold uppercase min-w-[68px] bg-emerald-50 text-emerald-950">
                      GRADE
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, idx) => {
                    const rollNum = parseInt(String(student.rollNo), 10) || idx + 1;
                    const studentResult = studentResultsMap.get(student.id);
                    const isLastRow = idx === filteredStudents.length - 1;
                    const rowBorderB = isLastRow ? '' : 'border-b border-slate-900';

                    return (
                      <tr key={student.id} className="hover:bg-blue-50/40 transition-colors">
                        <td
                          className={`${rowBorderB} border-r border-slate-900 px-2.5 py-1.5 text-center font-mono tabular-nums font-medium`}
                        >
                          {rollNum}
                        </td>
                        <td
                          className={`${rowBorderB} border-r border-slate-900 px-3 py-1.5 text-left font-medium whitespace-nowrap`}
                        >
                          {student.name}
                        </td>
                        {consolidatedSubjects.map((sub) => {
                          const markVal = student.marks[sub.name];
                          return (
                            <td
                              key={sub.name}
                              className={`${rowBorderB} border-r border-slate-900 px-2.5 py-1.5 text-center font-mono tabular-nums`}
                            >
                              {markVal ?? 0}
                            </td>
                          );
                        })}
                        <td
                          className={`${rowBorderB} border-r border-slate-900 px-2.5 py-1.5 text-center font-mono tabular-nums font-bold bg-emerald-50/40 text-emerald-950`}
                        >
                          {studentResult?.totalObtained ?? 0}
                        </td>
                        <td
                          className={`${rowBorderB} border-r border-slate-900 px-2.5 py-1.5 text-center font-mono tabular-nums font-bold bg-emerald-50/40 text-emerald-950`}
                        >
                          {studentResult ? studentResult.percentage.toFixed(2) : '0.00'}%
                        </td>
                        <td
                          className={`${rowBorderB} px-2.5 py-1.5 text-center font-mono tabular-nums font-bold bg-emerald-50/40 text-emerald-950`}
                        >
                          {studentResult?.grade ?? 'E2'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              /* =========================================================
                 SINGLE SUBJECT SHEET PREVIEW (Reference Sheet Format)
                 ========================================================= */
              <table className="w-full border-collapse text-slate-900 text-xs">
                <thead>
                  {/* Column Headers (Row 4) */}
                  <tr className="bg-slate-50">
                    <th className="border-b border-r border-slate-900 px-2.5 py-2 text-center font-bold uppercase w-20 text-slate-900 bg-slate-50">
                      ROLL NO
                    </th>
                    <th className="border-b border-r border-slate-900 px-3 py-2 text-center font-bold uppercase min-w-[210px] text-slate-900 bg-slate-50">
                      NAME OF THE STUDENTS
                    </th>
                    {components.map((comp, cIdx) => {
                      const isLastCol = !includeTotalColumn && cIdx === components.length - 1;
                      return (
                        <th
                          key={comp.key}
                          className={`border-b ${
                            isLastCol ? '' : 'border-r'
                          } border-slate-900 px-2.5 py-2 text-center font-bold uppercase w-32 leading-tight text-slate-900 bg-white`}
                        >
                          {formatComponentColumnHeader(comp, examCode)}
                        </th>
                      );
                    })}
                    {includeTotalColumn && (
                      <th className="border-b border-slate-900 px-2.5 py-2 text-center font-bold uppercase w-24 text-slate-900 bg-slate-100">
                        TOTAL {currentSubject.maxMarks || 100}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student, idx) => {
                    const rollNum = parseInt(String(student.rollNo), 10) || idx + 1;
                    const isLastRow = idx === filteredStudents.length - 1;
                    const rowBorderB = isLastRow ? '' : 'border-b border-slate-900';

                    const compVals = components.map((comp) =>
                      getStudentComponentMark(
                        student,
                        currentSubject.name,
                        comp,
                        components,
                        currentSubject.maxMarks || 100
                      )
                    );
                    const sumVal = compVals.reduce<number>(
                      (acc, v) => acc + (typeof v === 'number' ? v : 0),
                      0
                    );
                    const totalVal =
                      student.marks[currentSubject.name] === 'AB'
                        ? 'AB'
                        : sumVal > 0
                        ? sumVal
                        : student.marks[currentSubject.name] ?? 0;

                    return (
                      <tr key={student.id} className="hover:bg-blue-50/40 transition-colors">
                        <td
                          className={`${rowBorderB} border-r border-slate-900 px-2.5 py-1.5 text-center font-mono tabular-nums font-medium`}
                        >
                          {rollNum}
                        </td>
                        <td
                          className={`${rowBorderB} border-r border-slate-900 px-3 py-1.5 text-left font-medium`}
                        >
                          {student.name}
                        </td>
                        {compVals.map((val, cIdx) => {
                          const isMain = components[cIdx]?.isMainExam;
                          const isLastCol = !includeTotalColumn && cIdx === compVals.length - 1;
                          return (
                            <td
                              key={components[cIdx]?.key || cIdx}
                              className={`${rowBorderB} ${
                                isLastCol ? '' : 'border-r'
                              } border-slate-900 px-2.5 py-1.5 text-center font-mono tabular-nums ${
                                isMain || !includeTotalColumn ? 'font-normal' : 'font-bold'
                              }`}
                            >
                              {val}
                            </td>
                          );
                        })}
                        {includeTotalColumn && (
                          <td
                            className={`${rowBorderB} px-2.5 py-1.5 text-center font-mono tabular-nums font-bold bg-slate-50/60`}
                          >
                            {totalVal}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Footer Bar */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-700">
          Showing all {filteredStudents.length} students
        </span>
        <span className="text-[11px] text-slate-400">
          {isConsolidated
            ? `End of Consolidated Marksheet (${consolidatedSubjects.length} Subjects + Overall Performance)`
            : isResultAnalysis
            ? `End of Result Analysis Sheet (${consolidatedSubjects.length} Subjects)`
            : `End of ${currentSubject.name} Marksheet`}
        </span>
      </div>
    </div>
  );
}
