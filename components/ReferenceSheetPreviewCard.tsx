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

interface ReferenceSheetPreviewCardProps {
  students: StudentReportRow[];
  examConfig: ExamConfig;
  examId: string;
  classScope: string;
  subjectScope: string;
  onSubjectScopeChange?: (val: string) => void;
}

export default function ReferenceSheetPreviewCard({
  students,
  examConfig,
  examId,
  classScope,
  subjectScope,
  onSubjectScopeChange,
}: ReferenceSheetPreviewCardProps) {
  const effectiveConfig = useMemo(
    () =>
      classScope && classScope !== 'all'
        ? getEffectiveExamConfigForClass(examConfig, classScope)
        : examConfig,
    [examConfig, classScope]
  );

  const allReferenceSubjects = useMemo(() => {
    return orderSubjectsLikeReferenceSheet(effectiveConfig.subjects);
  }, [effectiveConfig.subjects]);

  const [localTab, setLocalTab] = React.useState<string | null>(null);

  // Derive active preview tab directly without cascading setState in useEffect
  const activeTab = useMemo(() => {
    if (subjectScope === 'consolidated') return 'consolidated';
    if (subjectScope && subjectScope !== 'all_consolidated') return subjectScope;
    return localTab || 'consolidated';
  }, [subjectScope, localTab]);

  const isConsolidated = activeTab === 'consolidated';

  const currentSubject = useMemo(() => {
    if (isConsolidated) return allReferenceSubjects[0];
    const found = allReferenceSubjects.find(
      (s) => s.name.toLowerCase() === activeTab.toLowerCase()
    );
    return found || allReferenceSubjects[0];
  }, [allReferenceSubjects, isConsolidated, activeTab]);

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

  // Single Subject components
  const components = useMemo(() => {
    if (!currentSubject) return [];
    const sampleBd = filteredStudents.find(
      (s) => s.breakdowns?.[currentSubject.name]
    )?.breakdowns?.[currentSubject.name];
    return resolveSubjectComponentsForExport(
      currentSubject,
      effectiveConfig.code || examId,
      sampleBd
    );
  }, [currentSubject, filteredStudents, effectiveConfig.code, examId]);

  const isPtExam = (effectiveConfig.code || examId).toUpperCase().startsWith('PT');
  const includeTotalColumn = !isPtExam && components.length > 1;
  const colSpanCount = components.length + (includeTotalColumn ? 3 : 2);

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
    if (!isConsolidated) return null;
    const examCode = effectiveConfig.code || examId;
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
      grandMaxMarks: grandMaxMarks || 700,
      subjectSections,
    };
  }, [
    isConsolidated,
    consolidatedSubjects,
    filteredStudents,
    effectiveConfig.code,
    examId,
    isPtExam,
    studentResultsMap,
  ]);

  if (!currentSubject) return null;

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
      {/* Top Bar with matching tab buttons */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-800">
          Excel Sheet Preview
        </span>

        {/* Workbook Sheet Tabs: Consolidated Sheet matches the exact button styling of the other sheets */}
        <div className="flex items-center flex-wrap gap-1.5">
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

          {allReferenceSubjects.map((sub) => {
            const isSubActive = !isConsolidated && activeTab.toLowerCase() === sub.name.toLowerCase();
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

      {/* Complete Table with clean padding so bottom and side borders are never clipped */}
      <div className="p-4 sm:p-5 overflow-x-auto bg-white border-t border-slate-200">
        {isConsolidated && consolidatedStructure ? (
          /* =========================================================
             CONSOLIDATED SHEET PREVIEW (Demo Sheet 1QMuO9... Format)
             ========================================================= */
          <table className="w-full border-collapse border border-slate-900 text-slate-900 text-xs">
            <thead>
              {/* Row 1: School Name */}
              <tr className="bg-white">
                <th
                  colSpan={consolidatedStructure.totalCols}
                  className="border border-slate-300 py-2 px-3 text-center font-bold text-sm tracking-tight bg-white text-slate-900"
                >
                  SARASWATI VIDYA ACADEMY, LONAVALA
                </th>
              </tr>
              {/* Row 2: Class & Exam */}
              <tr className="bg-white">
                <th
                  colSpan={consolidatedStructure.totalCols}
                  className="border border-slate-300 py-1.5 px-3 text-center font-bold text-xs tracking-tight bg-white text-slate-900"
                >
                  {formatReferenceClassHeader(
                    classScope,
                    '2026 -2027',
                    effectiveConfig.code || examId
                  )}
                </th>
              </tr>
              {/* Row 3: Sheet Title */}
              <tr className="bg-white">
                <th
                  colSpan={consolidatedStructure.totalCols}
                  className="border border-slate-300 border-b-slate-900 py-1.5 px-3 text-center font-bold text-xs tracking-tight bg-white text-slate-900"
                >
                  CONSOLIDATED SHEET
                </th>
              </tr>

              {/* Row 4: Two-level Group Headers */}
              <tr className="bg-white">
                <th
                  rowSpan={2}
                  className="border border-slate-900 px-2 py-2 text-center font-bold uppercase w-16 text-slate-900 bg-white align-middle"
                >
                  ROLL NO
                </th>
                <th
                  rowSpan={2}
                  className="border border-slate-900 px-3 py-2 text-center font-bold uppercase min-w-[200px] text-slate-900 bg-white align-middle"
                >
                  NAME OF THE STUDENTS
                </th>
                {consolidatedStructure.subjectSections.map((sec) => (
                  <th
                    key={sec.subject.name}
                    colSpan={sec.colSpan}
                    className="border border-slate-900 px-2 py-1.5 text-center font-bold uppercase bg-slate-50 text-slate-900"
                  >
                    {sec.subject.name.toUpperCase()}
                  </th>
                ))}
                <th
                  colSpan={3}
                  className="border border-slate-900 px-2 py-1.5 text-center font-bold uppercase bg-emerald-50 text-emerald-900"
                >
                  OVERALL PERFORMANCE
                </th>
              </tr>

              {/* Row 5: Sub-headers */}
              <tr className="bg-white">
                {consolidatedStructure.subjectSections.map((sec) => {
                  const examCode = effectiveConfig.code || examId;
                  return (
                    <React.Fragment key={`subheaders-${sec.subject.name}`}>
                      {sec.components.map((comp) => {
                        let headerText = formatComponentColumnHeader(comp, examCode);
                        if (comp.isMainExam) {
                          headerText = `${examCode} ${sec.subject.name.toUpperCase()} ${comp.maxMarks}`;
                        }
                        return (
                          <th
                            key={comp.key}
                            className="border border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] leading-tight min-w-[90px] text-slate-900 bg-white"
                          >
                            {headerText}
                          </th>
                        );
                      })}
                      {sec.isMulti && (
                        <>
                          <th className="border border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[80px] bg-slate-100 text-slate-900">
                            TOTAL {sec.subject.maxMarks || 100}
                          </th>
                          <th className="border border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[65px] bg-slate-100 text-slate-900">
                            GRADE
                          </th>
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
                <th className="border border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[95px] bg-emerald-50 text-emerald-900">
                  GRAND TOTAL {consolidatedStructure.grandMaxMarks}
                </th>
                <th className="border border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[85px] bg-emerald-50 text-emerald-900">
                  PERCENTAGE
                </th>
                <th className="border border-slate-900 px-2 py-1.5 text-center font-bold uppercase text-[11px] min-w-[65px] bg-emerald-50 text-emerald-900">
                  GRADE
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, idx) => {
                const rollNum = parseInt(String(student.rollNo), 10) || idx + 1;
                const studentResult = studentResultsMap.get(student.id);
                let grandTotal = 0;

                return (
                  <tr key={student.id} className="hover:bg-slate-50/70">
                    <td className="border border-slate-900 px-2 py-1.5 text-center font-normal">
                      {rollNum}
                    </td>
                    <td className="border border-slate-900 px-3 py-1.5 text-left font-normal whitespace-nowrap">
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
                              className="border border-slate-900 px-2 py-1.5 text-center font-normal"
                            >
                              {val}
                            </td>
                          ))}
                          {sec.isMulti && (
                            <>
                              <td className="border border-slate-900 px-2 py-1.5 text-center font-bold bg-slate-50/50">
                                {totalVal}
                              </td>
                              <td className="border border-slate-900 px-2 py-1.5 text-center font-bold bg-slate-50/50">
                                {grade}
                              </td>
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {/* Overall Performance */}
                    <td className="border border-slate-900 px-2 py-1.5 text-center font-bold bg-emerald-50/40 text-emerald-950">
                      {studentResult ? studentResult.totalObtained : grandTotal}
                    </td>
                    <td className="border border-slate-900 px-2 py-1.5 text-center font-bold bg-emerald-50/40 text-emerald-950">
                      {studentResult
                        ? studentResult.percentage.toFixed(2)
                        : ((grandTotal / consolidatedStructure.grandMaxMarks) * 100).toFixed(2)}
                      %
                    </td>
                    <td className="border border-slate-900 px-2 py-1.5 text-center font-bold bg-emerald-50/40 text-emerald-950">
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
        ) : (
          /* =========================================================
             SINGLE SUBJECT SHEET PREVIEW (Reference Sheet Format)
             ========================================================= */
          <table className="w-full border-collapse border border-slate-900 text-slate-900 text-xs">
            <thead>
              {/* Sheet Title Rows (exact match to Google Sheet Rows 1-3) */}
              <tr className="bg-white">
                <th
                  colSpan={colSpanCount}
                  className="border border-slate-300 py-2 px-3 text-center font-bold text-sm tracking-tight bg-white text-slate-900"
                >
                  SARASWATI VIDYA ACADEMY, LONAVALA
                </th>
              </tr>
              <tr className="bg-white">
                <th
                  colSpan={colSpanCount}
                  className="border border-slate-300 py-1.5 px-3 text-center font-bold text-xs tracking-tight bg-white text-slate-900"
                >
                  {formatReferenceClassHeader(
                    classScope,
                    '2026 -2027',
                    effectiveConfig.code || examId
                  )}
                </th>
              </tr>
              <tr className="bg-white">
                <th
                  colSpan={colSpanCount}
                  className="border border-slate-300 border-b-slate-900 py-1.5 px-3 text-center font-bold text-xs tracking-tight bg-white text-slate-900"
                >
                  {getReferenceSubjectHeaderTitle(currentSubject.name)}
                </th>
              </tr>
              {/* Column Headers (Row 4) - Pure White matching reference sheet */}
              <tr className="bg-white">
                <th className="border border-slate-900 px-2.5 py-2 text-center font-bold uppercase w-20 text-slate-900 bg-white">
                  ROLL NO
                </th>
                <th className="border border-slate-900 px-3 py-2 text-center font-bold uppercase min-w-[210px] text-slate-900 bg-white">
                  NAME OF THE STUDENTS
                </th>
                {components.map((comp) => (
                  <th
                    key={comp.key}
                    className="border border-slate-900 px-2.5 py-2 text-center font-bold uppercase w-32 leading-tight text-slate-900 bg-white"
                  >
                    {formatComponentColumnHeader(comp, effectiveConfig.code || examId)}
                  </th>
                ))}
                {includeTotalColumn && (
                  <th className="border border-slate-900 px-2.5 py-2 text-center font-bold uppercase w-24 text-slate-900 bg-white">
                    TOTAL {currentSubject.maxMarks || 100}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student, idx) => {
                const rollNum = parseInt(String(student.rollNo), 10) || idx + 1;
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
                  <tr key={student.id} className="hover:bg-slate-50/70">
                    <td className="border border-slate-900 px-2.5 py-1.5 text-center font-normal">
                      {rollNum}
                    </td>
                    <td className="border border-slate-900 px-3 py-1.5 text-left font-normal">
                      {student.name}
                    </td>
                    {compVals.map((val, cIdx) => {
                      const isMain = components[cIdx]?.isMainExam;
                      return (
                        <td
                          key={components[cIdx]?.key || cIdx}
                          className={`border border-slate-900 px-2.5 py-1.5 text-center ${
                            isMain || !includeTotalColumn ? 'font-normal' : 'font-bold'
                          }`}
                        >
                          {val}
                        </td>
                      );
                    })}
                    {includeTotalColumn && (
                      <td className="border border-slate-900 px-2.5 py-1.5 text-center font-normal">
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

      {/* Bottom Footer Bar */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-700">
          Showing all {filteredStudents.length} students
        </span>
        <span className="text-[11px] text-slate-400">
          {isConsolidated
            ? `End of Consolidated Marksheet (${consolidatedSubjects.length} Subjects + Overall Performance)`
            : `End of ${currentSubject.name} Marksheet`}
        </span>
      </div>
    </div>
  );
}
