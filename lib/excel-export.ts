import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  ExamConfig,
  SubjectConfig,
  StudentReportRow,
  InternalComponentConfig,
  SubjectBreakdown,
  getDefaultSubjectComponents,
  generateDefaultBreakdown,
  getEffectiveExamConfigForClass,
  computeStudentResult,
  computeSubjectTotalFromBreakdown,
  syncBreakdownWithTotal,
  hasCsInPtExam,
} from '@/lib/report-card-types';

/**
 * Maps section name to Roman numeral class header matching reference sheet:
 * e.g. 'Diamond' -> 'CLASS - IX Diamond 2026 -2027'
 */
export function formatReferenceClassHeader(
  sectionOrAll: string,
  session: string = '2026 -2027',
  examNameOrCode?: string
): string {
  let baseClass = '';
  if (!sectionOrAll || sectionOrAll === 'all' || sectionOrAll === 'ALL') {
    baseClass = `CLASS - VI to IX (All Classes) ${session}`;
  } else {
    const romanMap: Record<string, string> = {
      Sparkle: 'VI Sparkle',
      Twinkle: 'VI Twinkle',
      Topaz: 'VII Topaz',
      Jade: 'VII Jade',
      Garnet: 'VIII Garnet',
      Emerald: 'VIII Emerald',
      Ruby: 'IX Ruby',
      Diamond: 'IX Diamond',
    };
    const label = romanMap[sectionOrAll] || sectionOrAll;
    baseClass = `CLASS - ${label} ${session}`;
  }

  if (examNameOrCode) {
    const cleanExam = examNameOrCode.trim();
    return `${baseClass} (${cleanExam})`;
  }
  return baseClass;
}

/**
 * Maps subject name to exact tab name in reference sheet 1FuU-gS2AxSG81nDnwSOL5NFlV4PlZ99tCevzmIsgot8:
 * ENGLISH, MARATHI, HINDI, MATHS, SCIENCE, SS, CS
 */
export function getReferenceSubjectTabName(subjectName: string): string {
  const lower = subjectName.trim().toLowerCase();
  if (lower === 'english') return 'ENGLISH';
  if (lower === 'marathi') return 'MARATHI';
  if (lower === 'hindi') return 'HINDI';
  if (lower === 'maths' || lower === 'mathematics') return 'MATHS';
  if (lower === 'science') return 'SCIENCE';
  if (lower === 'social science' || lower === 'ss') return 'SS';
  if (lower === 'computer science' || lower === 'cs') return 'CS';
  return subjectName.trim().toUpperCase().slice(0, 30);
}

/**
 * Maps subject name to exact Row 3 title in reference sheet:
 * e.g. 'SUBJECT - ENGLISH', 'SUBJECT - MATH', 'SUBJECT - SOCIAL SCIENCE', 'SUBJECT - CS'
 */
export function getReferenceSubjectHeaderTitle(subjectName: string): string {
  const lower = subjectName.trim().toLowerCase();
  if (lower === 'english') return 'SUBJECT - ENGLISH';
  if (lower === 'marathi') return 'SUBJECT - MARATHI';
  if (lower === 'hindi') return 'SUBJECT - HINDI';
  if (lower === 'maths' || lower === 'mathematics') return 'SUBJECT - MATH';
  if (lower === 'science') return 'SUBJECT - SCIENCE';
  if (lower === 'social science' || lower === 'ss') return 'SUBJECT - SOCIAL SCIENCE';
  if (lower === 'computer science' || lower === 'cs') return 'SUBJECT - CS';
  return `SUBJECT - ${subjectName.trim().toUpperCase()}`;
}

/**
 * Orders subjects to match the exact tab sequence of reference sheet 1FuU-gS2AxSG81nDnwSOL5NFlV4PlZ99tCevzmIsgot8:
 * ENGLISH, MARATHI, HINDI, MATHS, SCIENCE, SS, CS
 */
export function orderSubjectsLikeReferenceSheet(subjects: SubjectConfig[]): SubjectConfig[] {
  const orderRank: Record<string, number> = {
    english: 1,
    marathi: 2,
    hindi: 3,
    maths: 4,
    mathematics: 4,
    science: 5,
    'social science': 6,
    ss: 6,
    'computer science': 7,
    cs: 7,
  };
  return [...subjects].sort((a, b) => {
    const rA = orderRank[a.name.trim().toLowerCase()] ?? 99;
    const rB = orderRank[b.name.trim().toLowerCase()] ?? 99;
    return rA - rB;
  });
}

/**
 * Orders subjects to match the exact sequence in Consolidated Sheet (1QMuO9-8j9TM-b8zWW_5kIL8rjzwNJBIvSmH6uU9SPmk):
 * ENGLISH, HINDI, MARATHI, MATHS, SCIENCE, SOCIAL SCIENCE, COMPUTER SCIENCE
 */
export function orderSubjectsForConsolidated(subjects: SubjectConfig[]): SubjectConfig[] {
  const orderRank: Record<string, number> = {
    english: 1,
    hindi: 2,
    marathi: 3,
    maths: 4,
    mathematics: 4,
    science: 5,
    'social science': 6,
    ss: 6,
    'computer science': 7,
    cs: 7,
  };
  return [...subjects].sort((a, b) => {
    const rA = orderRank[a.name.trim().toLowerCase()] ?? 99;
    const rB = orderRank[b.name.trim().toLowerCase()] ?? 99;
    return rA - rB;
  });
}

/**
 * Computes standard CBSE 9-point scale letter grade based on percentage / marks out of 100
 */
export function computeCbseGrade(scoreOutOf100: number): string {
  if (scoreOutOf100 >= 91) return 'A1';
  if (scoreOutOf100 >= 81) return 'A2';
  if (scoreOutOf100 >= 71) return 'B1';
  if (scoreOutOf100 >= 61) return 'B2';
  if (scoreOutOf100 >= 51) return 'C1';
  if (scoreOutOf100 >= 41) return 'C2';
  if (scoreOutOf100 >= 32) return 'D';
  if (scoreOutOf100 >= 20) return 'E1';
  return 'E2';
}

/**
 * Excel IF formula for CBSE grade matching demo sheet 1QMuO9-8j9TM-b8zWW_5kIL8rjzwNJBIvSmH6uU9SPmk
 */
export function getCbseGradeFormula(cellRef: string): string {
  return `IF(${cellRef}>=91,"A1",IF(${cellRef}>=81,"A2",IF(${cellRef}>=71,"B1",IF(${cellRef}>=61,"B2",IF(${cellRef}>=51,"C1",IF(${cellRef}>=41,"C2",IF(${cellRef}>=32,"D",IF(${cellRef}>=20,"E1","E2"))))))))`;
}

/**
 * Resolves the assessment components for a subject to match the reference sheet columns
 */
export function resolveSubjectComponentsForExport(
  sub: SubjectConfig,
  examCode: string,
  sampleBreakdown?: SubjectBreakdown
): InternalComponentConfig[] {
  const lower = sub.name.trim().toLowerCase();
  const isSummative =
    examCode.toUpperCase().startsWith('SA') || (sub.maxMarks || 100) === 100;

  if (!isSummative && (!sub.components || sub.components.length <= 1)) {
    return [
      {
        key: 'writtenExam',
        label: examCode,
        maxMarks: sub.maxMarks || 20,
        isMainExam: true,
      },
    ];
  }

  // Check if Hindi has Listening/Speaking/Project breakdown
  if (
    lower === 'hindi' &&
    sampleBreakdown &&
    (sampleBreakdown.listening !== undefined ||
      sampleBreakdown.speaking !== undefined ||
      sampleBreakdown.project !== undefined)
  ) {
    // Only use default Hindi 4-part split if user didn't customize Hindi to something else
    const isGeneric5Part =
      sub.components &&
      sub.components.length === 5 &&
      sub.components[0]?.key === 'penPaper';
    if (!sub.components || sub.components.length === 0 || isGeneric5Part) {
      return getDefaultSubjectComponents('Hindi', examCode);
    }
  }

  // Check if Computer Science has 20m Practicals + 80m Written breakdown
  if (
    (lower === 'computer science' || lower === 'cs') &&
    sampleBreakdown &&
    sampleBreakdown.internalMarks !== undefined
  ) {
    const isGeneric5Part =
      sub.components &&
      sub.components.length === 5 &&
      sub.components[0]?.key === 'penPaper';
    if (!sub.components || sub.components.length === 0 || isGeneric5Part) {
      return getDefaultSubjectComponents('Computer Science', examCode);
    }
  }

  if (sub.components && sub.components.length > 0) {
    return sub.components;
  }

  return getDefaultSubjectComponents(sub.name, examCode);
}

/**
 * Formats a component column header in Row 4 to match the reference sheet:
 * e.g. "PEN PAPER TEST 5", "MULTIPLE ASSESSMENTS 5", "SA -1 80"
 */
export function formatComponentColumnHeader(
  comp: InternalComponentConfig,
  examCode: string
): string {
  const rawLabel = (comp.label || examCode).trim().toUpperCase();
  if (comp.isMainExam) {
    if (rawLabel === 'SA-1' || rawLabel === 'SA -1' || rawLabel === 'SA-1 MAIN EXAM') {
      return `SA -1 ${comp.maxMarks}`;
    }
    if (rawLabel === 'SA-2' || rawLabel === 'SA -2' || rawLabel === 'SA-2 MAIN EXAM') {
      return `SA -2 ${comp.maxMarks}`;
    }
  }
  return `${rawLabel} ${comp.maxMarks}`;
}

/**
 * Extracts a student's numeric or 'AB' value for a specific component column
 */
export function getStudentComponentMark(
  student: StudentReportRow,
  subjectName: string,
  comp: InternalComponentConfig,
  allComps: InternalComponentConfig[],
  subjectMaxMarks: number
): number | string {
  const totalMark = student.marks[subjectName];
  if (totalMark === 'AB') return 'AB';

  // If this is a single-component test (like PT-1, PT-2, PT-3, PT-4, or single mark exam)
  if (allComps.length === 1) {
    if (typeof totalMark === 'number') {
      if (totalMark <= comp.maxMarks) {
        return totalMark;
      }
      return Math.min(
        comp.maxMarks,
        Math.max(
          0,
          Math.round((totalMark / (subjectMaxMarks > comp.maxMarks ? subjectMaxMarks : 100)) * comp.maxMarks)
        )
      );
    }
    return 0;
  }

  const rawBd = student.breakdowns?.[subjectName];
  let bd: SubjectBreakdown;
  if (rawBd) {
    const bdTotal = computeSubjectTotalFromBreakdown(
      subjectName,
      student.section,
      rawBd,
      allComps
    );
    if (typeof totalMark === 'number' && bdTotal !== null && bdTotal !== totalMark) {
      bd =
        syncBreakdownWithTotal(
          totalMark,
          subjectName,
          student.section,
          allComps,
          rawBd
        ) || rawBd;
    } else {
      bd = rawBd;
    }
  } else {
    bd =
      syncBreakdownWithTotal(
        typeof totalMark === 'number' ? totalMark : null,
        subjectName,
        student.section,
        allComps
      ) ||
      generateDefaultBreakdown(
        typeof totalMark === 'number' ? totalMark : null,
        subjectName,
        student.section
      );
  }

  const directVal = bd[comp.key];
  if (directVal !== undefined && directVal !== null) {
    if (directVal === 'AB') return 'AB';
    const num = Number(directVal);
    if (num <= comp.maxMarks) return num;
    return Math.min(comp.maxMarks, Math.round((num / 100) * comp.maxMarks));
  }

  if (comp.isMainExam) {
    const altMain = bd.writtenExam ?? bd.saExam;
    if (altMain !== undefined && altMain !== null) {
      if (altMain === 'AB') return 'AB';
      const num = Number(altMain);
      if (num <= comp.maxMarks) return num;
      return Math.min(comp.maxMarks, Math.round((num / 100) * comp.maxMarks));
    }
  }

  if (typeof totalMark === 'number' && subjectMaxMarks > 0) {
    return Math.min(comp.maxMarks, Math.round((totalMark / subjectMaxMarks) * comp.maxMarks));
  }

  return 0;
}

export interface SheetLayoutMetadata {
  sheetName: string;
  totalCols: number;
  studentRowCount: number;
  includeTotalColumn: boolean;
  isConsolidated?: boolean;
  hasSingleHeaderRow?: boolean;
  isResultAnalysis?: boolean;
  totalColIndices?: number[];
  gradeColIndices?: number[];
}

/**
 * Builds a single subject worksheet matching the exact layout of 1FuU-gS2AxSG81nDnwSOL5NFlV4PlZ99tCevzmIsgot8.
 * For PT tests (or single-test exams), omits the duplicate TOTAL column.
 */
export function buildReferenceSubjectWorksheet(
  students: StudentReportRow[],
  subjectConfig: SubjectConfig,
  examCode: string,
  classSectionOrAll: string
): { ws: XLSX.WorkSheet; meta: SheetLayoutMetadata } {
  const sampleBd = students.find((s) => s.breakdowns?.[subjectConfig.name])?.breakdowns?.[
    subjectConfig.name
  ];
  const components = resolveSubjectComponentsForExport(subjectConfig, examCode, sampleBd);
  const isPtExam = (examCode || '').toUpperCase().startsWith('PT');
  const includeTotalColumn = !isPtExam && components.length > 1;

  const compHeaders = components.map((c) => formatComponentColumnHeader(c, examCode));
  const totalHeader = `TOTAL ${subjectConfig.maxMarks || 100}`;

  const row4Headers = includeTotalColumn
    ? ['ROLL NO', 'NAME OF THE STUDENTS', ...compHeaders, totalHeader]
    : ['ROLL NO', 'NAME OF THE STUDENTS', ...compHeaders];

  const totalCols = row4Headers.length;
  const lastColIdx = totalCols - 1;

  // Row 1, Row 2, Row 3, Row 4
  const aoa: (string | number)[][] = [
    ['SARASWATI VIDYA ACADEMY, LONAVALA', ...Array(lastColIdx).fill('')],
    [formatReferenceClassHeader(classSectionOrAll, '2026 -2027', examCode), ...Array(lastColIdx).fill('')],
    [getReferenceSubjectHeaderTitle(subjectConfig.name), ...Array(lastColIdx).fill('')],
    row4Headers,
  ];

  // Sort students by Roll No (within class)
  const sortedStudents = [...students].sort((a, b) => {
    if (classSectionOrAll === 'all' && a.section !== b.section) {
      return a.section.localeCompare(b.section);
    }
    const rA = parseInt(String(a.rollNo), 10) || 0;
    const rB = parseInt(String(b.rollNo), 10) || 0;
    return rA - rB;
  });

  sortedStudents.forEach((student, idx) => {
    const numericRoll = parseInt(String(student.rollNo), 10) || idx + 1;
    const compValues = components.map((comp) =>
      getStudentComponentMark(
        student,
        subjectConfig.name,
        comp,
        components,
        subjectConfig.maxMarks || 100
      )
    );

    if (includeTotalColumn) {
      const sumVal = compValues.reduce<number>(
        (acc, v) => acc + (typeof v === 'number' ? v : 0),
        0
      );
      const finalTotal =
        student.marks[subjectConfig.name] === 'AB'
          ? 'AB'
          : sumVal > 0
          ? sumVal
          : typeof student.marks[subjectConfig.name] === 'number'
          ? Number(student.marks[subjectConfig.name])
          : 0;

      aoa.push([numericRoll, student.name, ...compValues, finalTotal]);
    } else {
      aoa.push([numericRoll, student.name, ...compValues]);
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Add real Excel SUM formulas on the TOTAL column ONLY when includeTotalColumn is true
  if (includeTotalColumn && components.length > 1) {
    const firstCompColLetter = XLSX.utils.encode_col(2); // Col C
    const lastCompColLetter = XLSX.utils.encode_col(2 + components.length - 1);
    const totalColLetter = XLSX.utils.encode_col(lastColIdx);

    sortedStudents.forEach((_, idx) => {
      const excelRowNumber = idx + 5; // Row 5 is 1st student
      const totalCellAddr = `${totalColLetter}${excelRowNumber}`;
      const cell = ws[totalCellAddr];
      if (cell && typeof cell.v === 'number') {
        cell.f = `SUM(${firstCompColLetter}${excelRowNumber}:${lastCompColLetter}${excelRowNumber})`;
      }
    });
  }

  // Merges for Row 1, Row 2, Row 3 across all columns of the table
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColIdx } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColIdx } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: lastColIdx } },
  ];

  // Column widths matching 1FuU-gS2AxSG81nDnwSOL5NFlV4PlZ99tCevzmIsgot8
  ws['!cols'] = [
    { wch: 11.5 }, // ROLL NO
    { wch: 34.5 }, // NAME OF THE STUDENTS
    ...components.map(() => ({ wch: 16.5 })),
    ...(includeTotalColumn ? [{ wch: 14.5 }] : []),
  ];

  return {
    ws,
    meta: {
      sheetName: getReferenceSubjectTabName(subjectConfig.name),
      totalCols,
      studentRowCount: sortedStudents.length,
      includeTotalColumn,
    },
  };
}

/**
 * Custom styles.xml matching the reference Google Sheet 1FuU-gS2AxSG81nDnwSOL5NFlV4PlZ99tCevzmIsgot8:
 * Style indices (s="..."):
 * s="0" -> Default cell
 * s="1" -> Top Title Rows 1-3: Open Sans 12pt Bold, Centered Horizontally & Vertically
 * s="2" -> Table Header Row 4: Open Sans 11pt Bold, Centered, Wrap Text, Thin Black Border All Around
 * s="3" -> Student Roll No (Col A): Open Sans 11pt Regular, Centered, Thin Black Border All Around
 * s="4" -> Student Name (Col B): Open Sans 11pt Regular, Left-Aligned, Vertically Centered, Thin Black Border All Around
 * s="5" -> Internal Component Marks (Cols C..F): Open Sans 11pt Bold, Centered, Thin Black Border All Around
 * s="6" -> Main Exam & Total Marks (Cols G, H): Open Sans 11pt Regular, Centered, Thin Black Border All Around
 */
const REFERENCE_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF000000"/><name val="Aptos"/></font>
    <font><b/><sz val="12"/><color rgb="FF000000"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FF000000"/><name val="Aptos"/></font>
    <font><sz val="11"/><color rgb="FF000000"/><name val="Aptos"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF000000"/></left>
      <right style="thin"><color rgb="FF000000"/></right>
      <top style="thin"><color rgb="FF000000"/></top>
      <bottom style="thin"><color rgb="FF000000"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>`;

/**
 * Post-processes the raw .xlsx buffer with JSZip so every worksheet has:
 * - Centered bold 12pt titles in Rows 1-3
 * - Wrapped bold 11pt bordered headers in Row 4 (height 30pt)
 * - Bordered 24pt student rows in Rows 5+ with bold internal marks, left-aligned names, and centered totals
 */
export async function applyReferenceSheetStylesToXlsxBuffer(
  rawXlsxBuffer: ArrayBuffer | Uint8Array,
  sheetsMeta: SheetLayoutMetadata[]
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(rawXlsxBuffer);
  zip.file('xl/styles.xml', REFERENCE_STYLES_XML);

  for (let i = 0; i < sheetsMeta.length; i++) {
    const sheetPath = `xl/worksheets/sheet${i + 1}.xml`;
    const file = zip.file(sheetPath);
    if (!file) continue;

    let xml = await file.async('string');
    const meta = sheetsMeta[i];
    if (meta.isConsolidated) {
      const firstStudentRow = meta.hasSingleHeaderRow ? 5 : 6;
      xml = xml.replace(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, (_match, rowStr, innerCells) => {
        const rowNum = parseInt(rowStr, 10);
        let rowHeightAttr = '';
        if (rowNum >= 1 && rowNum <= 3) {
          rowHeightAttr = ' ht="20" customHeight="1"';
        } else if (rowNum === 4) {
          rowHeightAttr = meta.hasSingleHeaderRow ? ' ht="28" customHeight="1"' : ' ht="25" customHeight="1"';
        } else if (!meta.hasSingleHeaderRow && rowNum === 5) {
          rowHeightAttr = ' ht="35" customHeight="1"';
        } else if (rowNum >= firstStudentRow) {
          rowHeightAttr = ' ht="24" customHeight="1"';
        }

        const styledCells = innerCells.replace(
          /<c r="([A-Z]+)(\d+)"([^/>]*)(\/?>)/g,
          (_cMatch: string, colLetters: string, rNumStr: string, attrs: string, closeTag: string) => {
            const colIdx = XLSX.utils.decode_col(colLetters);
            let styleIdx = 0;

            if (rowNum >= 1 && rowNum <= 3) {
              styleIdx = 1;
            } else if (rowNum >= 4 && rowNum < firstStudentRow) {
              styleIdx = 2;
            } else if (rowNum >= firstStudentRow && colIdx < meta.totalCols) {
              if (colIdx === 0) {
                styleIdx = 3;
              } else if (colIdx === 1) {
                styleIdx = 4;
              } else if (meta.totalColIndices?.includes(colIdx)) {
                styleIdx = 5;
              } else if (meta.gradeColIndices?.includes(colIdx)) {
                styleIdx = 6;
              } else {
                styleIdx = 3;
              }
            }

            const cleanedAttrs = attrs.replace(/\s+s="\d+"/g, '');
            return `<c r="${colLetters}${rNumStr}"${cleanedAttrs} s="${styleIdx}"${closeTag}`;
          }
        );

        return `<row r="${rowNum}"${rowHeightAttr}>${styledCells}</row>`;
      });
    } else if (meta.isResultAnalysis) {
      xml = xml.replace(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, (_match, rowStr, innerCells) => {
        const rowNum = parseInt(rowStr, 10);
        const rowHeightAttr = rowNum === 1 ? ' ht="25" customHeight="1"' : ' ht="22" customHeight="1"';

        const styledCells = innerCells.replace(
          /<c r="([A-Z]+)(\d+)"([^/>]*)(\/?>)/g,
          (_cMatch: string, colLetters: string, rNumStr: string, attrs: string, closeTag: string) => {
            const colIdx = XLSX.utils.decode_col(colLetters);
            let styleIdx = 0;

            if (rowNum === 1) {
              styleIdx = 2;
            } else if (rowNum >= 2 && colIdx < meta.totalCols) {
              if (colIdx === 0) {
                styleIdx = 3;
              } else if (colIdx === 1) {
                styleIdx = 4;
              } else if (colIdx >= meta.totalCols - 2) {
                styleIdx = 5;
              } else {
                styleIdx = 3;
              }
            }

            const cleanedAttrs = attrs.replace(/\s+s="\d+"/g, '');
            return `<c r="${colLetters}${rNumStr}"${cleanedAttrs} s="${styleIdx}"${closeTag}`;
          }
        );

        return `<row r="${rowNum}"${rowHeightAttr}>${styledCells}</row>`;
      });
    } else {
      const { totalCols, includeTotalColumn } = meta;
      const mainExamColIndex = includeTotalColumn ? totalCols - 2 : totalCols - 1;
      const totalColIndex = includeTotalColumn ? totalCols - 1 : -1;

      // Set row heights and cell styles per row
      xml = xml.replace(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, (_match, rowStr, innerCells) => {
        const rowNum = parseInt(rowStr, 10);
        let rowHeightAttr = '';
        if (rowNum >= 1 && rowNum <= 3) {
          rowHeightAttr = ' ht="20" customHeight="1"';
        } else if (rowNum === 4) {
          rowHeightAttr = ' ht="30" customHeight="1"';
        } else if (rowNum >= 5) {
          rowHeightAttr = ' ht="24" customHeight="1"';
        }

        const styledCells = innerCells.replace(
          /<c r="([A-Z]+)(\d+)"([^/>]*)(\/?>)/g,
          (_cMatch: string, colLetters: string, rNumStr: string, attrs: string, closeTag: string) => {
            const colIdx = XLSX.utils.decode_col(colLetters);
            let styleIdx = 0;

            if (rowNum >= 1 && rowNum <= 3) {
              styleIdx = 1; // Bold 12pt centered title
            } else if (rowNum === 4) {
              styleIdx = 2; // Bold 11pt wrapped header with black border
            } else if (rowNum >= 5 && colIdx < totalCols) {
              if (colIdx === 0) {
                styleIdx = 3; // Roll No: centered + border
              } else if (colIdx === 1) {
                styleIdx = 4; // Student Name: left-aligned + border
              } else if (colIdx === mainExamColIndex || colIdx === totalColIndex) {
                styleIdx = 6; // Main Exam & Total 100: regular centered + border
              } else {
                styleIdx = 5; // Internal marks: bold centered + border
              }
            }

            const cleanedAttrs = attrs.replace(/\s+s="\d+"/g, '');
            return `<c r="${colLetters}${rNumStr}"${cleanedAttrs} s="${styleIdx}"${closeTag}`;
          }
        );

        return `<row r="${rowNum}"${rowHeightAttr}>${styledCells}</row>`;
      });
    }

    zip.file(sheetPath, xml);
  }

  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * Generates the complete styled .xlsx binary (Uint8Array) matching sheet 1FuU-gS2AxSG81nDnwSOL5NFlV4PlZ99tCevzmIsgot8
 */
export async function generateReferenceFormatWorkbookBytes(params: {
  students: StudentReportRow[];
  examConfig: ExamConfig;
  examId: string;
  classScope: string; // e.g. 'Diamond', 'Sparkle', or 'all'
  subjectScope: string; // 'all_consolidated' or a specific subject name like 'English'
}): Promise<{ bytes: Uint8Array; fileName: string }> {
  const { students, examConfig, examId, classScope, subjectScope } = params;

  const targetStudents = students.filter(
    (s) => !classScope || classScope === 'all' || s.section === classScope
  );

  let effectiveConfig =
    classScope && classScope !== 'all'
      ? getEffectiveExamConfigForClass(examConfig, classScope)
      : examConfig;

  if ((!classScope || classScope === 'all') && targetStudents.some((s) => hasCsInPtExam(s.section))) {
    const class9Cfg = getEffectiveExamConfigForClass(examConfig, 'Diamond');
    const seen = new Set(effectiveConfig.subjects.map((s) => s.name.toLowerCase()));
    const mergedSubjects = [...effectiveConfig.subjects];
    class9Cfg.subjects.forEach((s) => {
      if (!seen.has(s.name.toLowerCase())) {
        mergedSubjects.push(s);
        seen.add(s.name.toLowerCase());
      }
    });
    effectiveConfig = { ...effectiveConfig, subjects: mergedSubjects };
  }

  const orderedSubjects =
    subjectScope === 'all_consolidated'
      ? orderSubjectsLikeReferenceSheet(effectiveConfig.subjects)
      : effectiveConfig.subjects.filter(
          (s) => s.name.toLowerCase() === subjectScope.toLowerCase()
        );

  const subjectsToExport =
    orderedSubjects.length > 0 ? orderedSubjects : [effectiveConfig.subjects[0]];

  const wb = XLSX.utils.book_new();
  const sheetsMeta: SheetLayoutMetadata[] = [];

  for (const sub of subjectsToExport) {
    const { ws, meta } = buildReferenceSubjectWorksheet(
      targetStudents,
      sub,
      effectiveConfig.code || examId,
      classScope
    );
    XLSX.utils.book_append_sheet(wb, ws, meta.sheetName);
    sheetsMeta.push(meta);
  }

  const rawArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const styledBytes = await applyReferenceSheetStylesToXlsxBuffer(rawArray, sheetsMeta);

  const classSlug =
    !classScope || classScope === 'all'
      ? 'All_Classes'
      : formatReferenceClassHeader(classScope)
          .replace('CLASS - ', '')
          .replace(/\s+/g, '_');

  const fileName =
    subjectScope === 'all_consolidated'
      ? `${classSlug}_${examId}_Marksheet.xlsx`
      : `${classSlug}_${examId}_${getReferenceSubjectTabName(subjectScope)}.xlsx`;

  return { bytes: styledBytes, fileName };
}

/**
 * Triggers browser download of the generated .xlsx bytes
 */
export async function downloadReferenceFormatExcel(params: {
  students: StudentReportRow[];
  examConfig: ExamConfig;
  examId: string;
  classScope: string;
  subjectScope: string;
}): Promise<string> {
  const { bytes, fileName } = await generateReferenceFormatWorkbookBytes(params);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return fileName;
}

/**
 * Builds the Consolidated Worksheet matching the demo Google Sheet:
 * 1QMuO9-8j9TM-b8zWW_5kIL8rjzwNJBIvSmH6uU9SPmk
 */
export function buildConsolidatedWorksheet(
  students: StudentReportRow[],
  examConfig: ExamConfig,
  examCode: string,
  classSectionOrAll: string
): { ws: XLSX.WorkSheet; meta: SheetLayoutMetadata } {
  const isPtExam = (examCode || '').toUpperCase().startsWith('PT');
  const subjects = orderSubjectsForConsolidated(examConfig.subjects);

  interface ColDef {
    groupTitle: string;
    subHeader: string;
    subjectName?: string;
    compKey?: string;
    isTotal?: boolean;
    isGrade?: boolean;
    isGrandTotal?: boolean;
    isPercentage?: boolean;
    isOverallGrade?: boolean;
    maxMarks?: number;
    colIndex: number;
  }

  const colDefs: ColDef[] = [];
  const groupRanges: { title: string; startCol: number; endCol: number }[] = [];
  const totalColIndices: number[] = [];
  const gradeColIndices: number[] = [];
  const subjectTotalCellColLetters: string[] = [];

  colDefs.push({ groupTitle: 'ROLL NO', subHeader: '', colIndex: 0 });
  colDefs.push({ groupTitle: 'NAME OF THE STUDENTS', subHeader: '', colIndex: 1 });

  let curCol = 2;

  let hasMulti = false;

  subjects.forEach((sub) => {
    const sampleBd = students.find((s) => s.breakdowns?.[sub.name])?.breakdowns?.[sub.name];
    const components = resolveSubjectComponentsForExport(sub, examCode, sampleBd);
    const startCol = curCol;

    if (!isPtExam && components.length > 1) {
      hasMulti = true;
      components.forEach((c) => {
        const subH = formatComponentColumnHeader(c, examCode);
        colDefs.push({
          groupTitle: sub.name.toUpperCase(),
          subHeader: subH,
          subjectName: sub.name,
          compKey: c.key,
          colIndex: curCol++,
        });
      });

      const totalColIdx = curCol++;
      colDefs.push({
        groupTitle: sub.name.toUpperCase(),
        subHeader: `TOTAL ${sub.maxMarks || 100}`,
        subjectName: sub.name,
        isTotal: true,
        maxMarks: sub.maxMarks || 100,
        colIndex: totalColIdx,
      });
      totalColIndices.push(totalColIdx);
      subjectTotalCellColLetters.push(XLSX.utils.encode_col(totalColIdx));

      const gradeColIdx = curCol++;
      colDefs.push({
        groupTitle: sub.name.toUpperCase(),
        subHeader: 'GRADE',
        subjectName: sub.name,
        isGrade: true,
        maxMarks: sub.maxMarks || 100,
        colIndex: gradeColIdx,
      });
      gradeColIndices.push(gradeColIdx);
    } else {
      const mainComp = components[0] || { key: 'writtenExam', label: examCode, maxMarks: sub.maxMarks || 20 };
      const scoreColIdx = curCol++;
      colDefs.push({
        groupTitle: `${sub.name.toUpperCase()} (${mainComp.maxMarks})`,
        subHeader: `${sub.name.toUpperCase()} (${mainComp.maxMarks})`,
        subjectName: sub.name,
        compKey: mainComp.key,
        isTotal: true,
        maxMarks: mainComp.maxMarks,
        colIndex: scoreColIdx,
      });
      totalColIndices.push(scoreColIdx);
      subjectTotalCellColLetters.push(XLSX.utils.encode_col(scoreColIdx));
    }

    groupRanges.push({
      title: sub.name.toUpperCase(),
      startCol,
      endCol: curCol - 1,
    });
  });

  const overallStart = curCol;
  const sampleFormulaResult = students[0]
    ? computeStudentResult(
        students[0],
        subjects,
        examConfig.totalFormula,
        examConfig.customFormula,
        examConfig.resultCriteria
      )
    : null;
  const grandMaxMarks =
    sampleFormulaResult?.totalMax ||
    subjects.reduce((sum, s) => sum + (s.maxMarks || (isPtExam ? 20 : 100)), 0);

  const grandTotalIdx = curCol++;
  colDefs.push({
    groupTitle: 'OVERALL PERFORMANCE',
    subHeader: hasMulti ? `GRAND TOTAL ${grandMaxMarks}` : `TOTAL (${grandMaxMarks})`,
    isGrandTotal: true,
    colIndex: grandTotalIdx,
  });
  totalColIndices.push(grandTotalIdx);

  const percentageIdx = curCol++;
  colDefs.push({
    groupTitle: 'OVERALL PERFORMANCE',
    subHeader: hasMulti ? 'PERCENTAGE' : 'PCT (%)',
    isPercentage: true,
    colIndex: percentageIdx,
  });
  totalColIndices.push(percentageIdx);

  const overallGradeIdx = curCol++;
  colDefs.push({
    groupTitle: 'OVERALL PERFORMANCE',
    subHeader: 'GRADE',
    isOverallGrade: true,
    colIndex: overallGradeIdx,
  });
  gradeColIndices.push(overallGradeIdx);

  groupRanges.push({
    title: 'OVERALL PERFORMANCE',
    startCol: overallStart,
    endCol: curCol - 1,
  });

  const totalCols = curCol;
  const lastColIdx = totalCols - 1;
  const hasSingleHeaderRow = !hasMulti;

  const row1 = ['', '', 'SARASWATI VIDYA ACADEMY, LONAVALA', ...Array(Math.max(0, lastColIdx - 2)).fill('')];
  const row2 = ['', '', formatReferenceClassHeader(classSectionOrAll, '2026 -2027', examCode), ...Array(Math.max(0, lastColIdx - 2)).fill('')];
  const row3 = ['', '', 'CONSOLIDATED SHEET', ...Array(Math.max(0, lastColIdx - 2)).fill('')];

  let aoa: (string | number)[][];
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 2 }, e: { r: 0, c: lastColIdx } },
    { s: { r: 1, c: 2 }, e: { r: 1, c: lastColIdx } },
    { s: { r: 2, c: 2 }, e: { r: 2, c: lastColIdx } },
  ];

  if (hasSingleHeaderRow) {
    const singleHeaderRow: string[] = ['ROLL NO', 'NAME OF THE STUDENTS'];
    for (let c = 2; c < totalCols; c++) {
      singleHeaderRow.push(colDefs[c]?.subHeader || '');
    }
    aoa = [row1, row2, row3, singleHeaderRow];
  } else {
    const row4: string[] = ['ROLL NO', 'NAME OF THE STUDENTS'];
    groupRanges.forEach((g) => {
      row4.push(g.title);
      for (let c = g.startCol + 1; c <= g.endCol; c++) {
        row4.push('');
      }
    });

    const row5: string[] = ['', ''];
    for (let c = 2; c < totalCols; c++) {
      row5.push(colDefs[c]?.subHeader || '');
    }

    aoa = [row1, row2, row3, row4, row5];
    merges.push(
      { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
      { s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }
    );
    groupRanges.forEach((g) => {
      if (g.endCol > g.startCol) {
        merges.push({ s: { r: 3, c: g.startCol }, e: { r: 3, c: g.endCol } });
      }
    });
  }

  const sortedStudents = [...students].sort((a, b) => {
    if (classSectionOrAll === 'all' && a.section !== b.section) {
      return a.section.localeCompare(b.section);
    }
    const rA = parseInt(String(a.rollNo), 10) || 0;
    const rB = parseInt(String(b.rollNo), 10) || 0;
    return rA - rB;
  });

  sortedStudents.forEach((student, idx) => {
    const rowValues: (string | number)[] = [];
    const numericRoll = parseInt(String(student.rollNo), 10) || idx + 1;
    rowValues.push(numericRoll);
    rowValues.push(student.name);

    for (let c = 2; c < totalCols; c++) {
      const def = colDefs[c];
      if (!def) {
        rowValues.push('');
        continue;
      }
      if (def.isGrandTotal || def.isPercentage || def.isOverallGrade) {
        rowValues.push(0);
      } else if (def.isTotal) {
        const mark = student.marks[def.subjectName || ''];
        rowValues.push(typeof mark === 'number' ? mark : 0);
      } else if (def.isGrade) {
        const mark = Number(student.marks[def.subjectName || '']) || 0;
        const max = def.maxMarks || (isPtExam ? 20 : 100);
        rowValues.push(computeCbseGrade((mark / max) * 100));
      } else if (def.subjectName && def.compKey) {
        const sub = subjects.find((s) => s.name === def.subjectName)!;
        const sampleBd = student.breakdowns?.[sub.name];
        const comps = resolveSubjectComponentsForExport(sub, examCode, sampleBd);
        const comp = comps.find((x) => x.key === def.compKey) || comps[0];
        const val = getStudentComponentMark(student, sub.name, comp, comps, sub.maxMarks || 100);
        rowValues.push(val);
      } else {
        rowValues.push(0);
      }
    }
    aoa.push(rowValues);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;

  const firstStudentRowNumber = hasSingleHeaderRow ? 5 : 6;
  sortedStudents.forEach((student, idx) => {
    const r = idx + firstStudentRowNumber;
    const studentFormulaRes = computeStudentResult(
      student,
      subjects,
      examConfig.totalFormula,
      examConfig.customFormula,
      examConfig.resultCriteria
    );

    let subCompStartLetter = '';
    let subCompEndLetter = '';
    let lastTotalLetter = '';

    colDefs.forEach((def) => {
      if (def.colIndex < 2) return;
      const colLetter = XLSX.utils.encode_col(def.colIndex);
      const cellRef = `${colLetter}${r}`;

      if (def.compKey) {
        if (!subCompStartLetter) subCompStartLetter = colLetter;
        subCompEndLetter = colLetter;
      }

      if (def.isTotal) {
        lastTotalLetter = colLetter;
        if (subCompStartLetter && subCompEndLetter && subCompStartLetter !== colLetter) {
          ws[cellRef] = {
            t: 'n',
            v: Number(ws[cellRef]?.v) || 0,
            f: `SUM(${subCompStartLetter}${r}:${subCompEndLetter}${r})`,
          };
        }
        subCompStartLetter = '';
        subCompEndLetter = '';
      }

      if (def.isGrade && lastTotalLetter) {
        const max = def.maxMarks || (isPtExam ? 20 : 100);
        const gradeFormula = max === 100
          ? getCbseGradeFormula(`${lastTotalLetter}${r}`)
          : getCbseGradeFormula(`(${lastTotalLetter}${r}/${max})*100`);
        ws[cellRef] = {
          t: 's',
          v: String(ws[cellRef]?.v || 'A1'),
          f: gradeFormula,
        };
      }
    });

    const grandTotalRef = `${XLSX.utils.encode_col(grandTotalIdx)}${r}`;
    const subjectTotalRefs = subjectTotalCellColLetters.map((l) => `${l}${r}`);
    const grandTotalVal = studentFormulaRes.totalObtained;
    const rawCustom = (examConfig.customFormula || '').trim();
    const upperCustom = rawCustom.toUpperCase().replace(/\s+/g, '');
    const bestMatch =
      examConfig.totalFormula === 'BEST_5'
        ? 5
        : examConfig.totalFormula === 'CUSTOM'
        ? parseInt(
            (upperCustom.match(/^BEST(?:\((\d+)\)|_(\d+))$/)?.[1] ||
              upperCustom.match(/^BEST(?:\((\d+)\)|_(\d+))$/)?.[2] ||
              '0'),
            10
          )
        : 0;
    const isAdditiveBracketSubset =
      examConfig.totalFormula === 'CUSTOM' &&
      /^\s*\[[^\]:]+\](\s*\+\s*\[[^\]:]+\])*\s*$/.test(rawCustom);

    let grandTotalFormula: string | undefined;
    if (examConfig.totalFormula === 'SUM' || !examConfig.totalFormula) {
      const includedRefs = subjects
        .map((sub, sIdx) => (sub.includedInTotal !== false ? subjectTotalRefs[sIdx] : null))
        .filter((ref): ref is string => Boolean(ref));
      grandTotalFormula = `SUM(${(includedRefs.length > 0 ? includedRefs : subjectTotalRefs).join(',')})`;
    } else if (isAdditiveBracketSubset) {
      const lowerCustom = rawCustom.toLowerCase();
      const matchedRefs = subjects
        .map((sub, sIdx) =>
          lowerCustom.includes(`[${sub.name.toLowerCase()}]`) ? subjectTotalRefs[sIdx] : null
        )
        .filter((ref): ref is string => Boolean(ref));
      if (matchedRefs.length > 0) {
        grandTotalFormula = `SUM(${matchedRefs.join(',')})`;
      }
    } else if (bestMatch > 0) {
      const includedRefs = subjects
        .map((sub, sIdx) => (sub.includedInTotal !== false ? subjectTotalRefs[sIdx] : null))
        .filter((ref): ref is string => Boolean(ref));
      const pool = includedRefs.length > 0 ? includedRefs : subjectTotalRefs;
      const takeCount = Math.min(bestMatch, pool.length);
      if (takeCount > 0) {
        const unionArg = pool.length === 1 ? pool[0] : `(${pool.join(',')})`;
        const parts = Array.from(
          { length: takeCount },
          (_, k) => `LARGE(${unionArg},${k + 1})`
        );
        grandTotalFormula = parts.join('+');
      }
    }

    ws[grandTotalRef] = grandTotalFormula
      ? {
          t: 'n',
          v: grandTotalVal,
          f: grandTotalFormula,
        }
      : {
          t: 'n',
          v: grandTotalVal,
        };

    const percentageRef = `${XLSX.utils.encode_col(percentageIdx)}${r}`;
    const pctVal = studentFormulaRes.percentage;
    const effectiveMax = studentFormulaRes.totalMax || grandMaxMarks;
    const divider = effectiveMax === 700 ? '7' : `${effectiveMax > 0 ? effectiveMax / 100 : 1}`;
    ws[percentageRef] = {
      t: 'n',
      v: pctVal,
      f: `${grandTotalRef}/${divider}`,
    };

    const overallGradeRef = `${XLSX.utils.encode_col(overallGradeIdx)}${r}`;
    ws[overallGradeRef] = {
      t: 's',
      v: studentFormulaRes.grade,
      f: getCbseGradeFormula(percentageRef),
    };
  });

  ws['!cols'] = colDefs.map((def) => {
    if (def.colIndex === 0) return { wch: 8 };
    if (def.colIndex === 1) return { wch: 26 };
    if (def.isGrandTotal) return { wch: 16 };
    if (def.isPercentage) return { wch: 14 };
    if (def.isGrade || def.isOverallGrade) return { wch: 8 };
    if (def.isTotal) return { wch: 12 };
    return { wch: 13 };
  });

  return {
    ws,
    meta: {
      sheetName: 'Consolidated',
      totalCols,
      studentRowCount: sortedStudents.length,
      includeTotalColumn: true,
      isConsolidated: true,
      hasSingleHeaderRow,
      totalColIndices,
      gradeColIndices,
    },
  };
}

/**
 * Builds the Result Analysis Worksheet matching the second tab of 1QMuO9-8j9TM-b8zWW_5kIL8rjzwNJBIvSmH6uU9SPmk
 */
export function buildResultAnalysisWorksheet(
  students: StudentReportRow[],
  examConfig: ExamConfig,
  classSectionOrAll: string
): { ws: XLSX.WorkSheet; meta: SheetLayoutMetadata } {
  const subjects = orderSubjectsForConsolidated(examConfig.subjects);
  const subjectHeaders = subjects.map((s) => getReferenceSubjectTabName(s.name));

  const headers = ['ROLL NO', 'NAME OF THE STUDENT', ...subjectHeaders, 'TOTAL', 'PERCENTAGE'];
  const aoa: (string | number)[][] = [headers];

  const sortedStudents = [...students].sort((a, b) => {
    if (classSectionOrAll === 'all' && a.section !== b.section) {
      return a.section.localeCompare(b.section);
    }
    const rA = parseInt(String(a.rollNo), 10) || 0;
    const rB = parseInt(String(b.rollNo), 10) || 0;
    return rA - rB;
  });

  const sampleRes = sortedStudents[0]
    ? computeStudentResult(
        sortedStudents[0],
        subjects,
        examConfig.totalFormula,
        examConfig.customFormula,
        examConfig.resultCriteria
      )
    : null;
  const grandMaxMarks =
    sampleRes?.totalMax || subjects.reduce((sum, s) => sum + (s.maxMarks || 100), 0);
  const totalCols = headers.length;
  const firstSubColLetter = 'C';
  const lastSubColLetter = XLSX.utils.encode_col(1 + subjects.length);
  const totalColLetter = XLSX.utils.encode_col(2 + subjects.length);
  const pctColLetter = XLSX.utils.encode_col(3 + subjects.length);

  sortedStudents.forEach((student, idx) => {
    const numericRoll = parseInt(String(student.rollNo), 10) || idx + 1;
    const studentRes = computeStudentResult(
      student,
      subjects,
      examConfig.totalFormula,
      examConfig.customFormula,
      examConfig.resultCriteria
    );
    const subMarks = subjects.map((s) => {
      const m = student.marks[s.name];
      return typeof m === 'number' ? m : 0;
    });
    const sumMarks = studentRes.totalObtained;
    const pct = studentRes.percentage;

    aoa.push([numericRoll, student.name, ...subMarks, sumMarks, pct]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  sortedStudents.forEach((_, idx) => {
    const r = idx + 2;
    const totalRef = `${totalColLetter}${r}`;
    const pctRef = `${pctColLetter}${r}`;
    const rawCustom = (examConfig.customFormula || '').trim();
    const upperCustom = rawCustom.toUpperCase().replace(/\s+/g, '');
    const bestMatch =
      examConfig.totalFormula === 'BEST_5'
        ? 5
        : examConfig.totalFormula === 'CUSTOM'
        ? parseInt(
            (upperCustom.match(/^BEST(?:\((\d+)\)|_(\d+))$/)?.[1] ||
              upperCustom.match(/^BEST(?:\((\d+)\)|_(\d+))$/)?.[2] ||
              '0'),
            10
          )
        : 0;
    const isAdditiveBracketSubset =
      examConfig.totalFormula === 'CUSTOM' &&
      /^\s*\[[^\]:]+\](\s*\+\s*\[[^\]:]+\])*\s*$/.test(rawCustom);
    const subjectCellRefs = subjects.map(
      (__, sIdx) => `${XLSX.utils.encode_col(2 + sIdx)}${r}`
    );

    let totalFormula: string | undefined;
    if (examConfig.totalFormula === 'SUM' || !examConfig.totalFormula) {
      if (subjects.every((s) => s.includedInTotal !== false)) {
        totalFormula = `SUM(${firstSubColLetter}${r}:${lastSubColLetter}${r})`;
      } else {
        const includedRefs = subjects
          .map((sub, sIdx) => (sub.includedInTotal !== false ? subjectCellRefs[sIdx] : null))
          .filter((ref): ref is string => Boolean(ref));
        if (includedRefs.length > 0) totalFormula = `SUM(${includedRefs.join(',')})`;
      }
    } else if (isAdditiveBracketSubset) {
      const lowerCustom = rawCustom.toLowerCase();
      const matchedRefs = subjects
        .map((sub, sIdx) =>
          lowerCustom.includes(`[${sub.name.toLowerCase()}]`) ? subjectCellRefs[sIdx] : null
        )
        .filter((ref): ref is string => Boolean(ref));
      if (matchedRefs.length > 0) {
        totalFormula = `SUM(${matchedRefs.join(',')})`;
      }
    } else if (bestMatch > 0) {
      const takeCount = Math.min(bestMatch, subjects.length);
      if (takeCount > 0) {
        const rangeArg = `${firstSubColLetter}${r}:${lastSubColLetter}${r}`;
        totalFormula = Array.from(
          { length: takeCount },
          (_, k) => `LARGE(${rangeArg},${k + 1})`
        ).join('+');
      }
    }

    ws[totalRef] = totalFormula
      ? {
          t: 'n',
          v: Number(ws[totalRef]?.v) || 0,
          f: totalFormula,
        }
      : {
          t: 'n',
          v: Number(ws[totalRef]?.v) || 0,
        };

    ws[pctRef] = {
      t: 'n',
      v: Number(ws[pctRef]?.v) || 0,
      f: `ROUND(${totalRef}/${grandMaxMarks || 1}*100,2)`,
    };
  });

  ws['!cols'] = [
    { wch: 8 },
    { wch: 26 },
    ...subjects.map(() => ({ wch: 12 })),
    { wch: 12 },
    { wch: 14 },
  ];

  return {
    ws,
    meta: {
      sheetName: 'Result Analysis',
      totalCols,
      studentRowCount: sortedStudents.length,
      includeTotalColumn: true,
      isResultAnalysis: true,
    },
  };
}

/**
 * Generates the complete Consolidated format workbook with Consolidated + Result Analysis sheets
 * matching 1QMuO9-8j9TM-b8zWW_5kIL8rjzwNJBIvSmH6uU9SPmk
 */
export async function generateConsolidatedWorkbookBytes(params: {
  students: StudentReportRow[];
  examConfig: ExamConfig;
  examId: string;
  classScope: string;
}): Promise<{ bytes: Uint8Array; fileName: string }> {
  const { students, examConfig, examId, classScope } = params;
  const targetStudents = students.filter(
    (s) => !classScope || classScope === 'all' || s.section === classScope
  );

  let effectiveConfig =
    classScope && classScope !== 'all'
      ? getEffectiveExamConfigForClass(examConfig, classScope)
      : examConfig;

  if ((!classScope || classScope === 'all') && targetStudents.some((s) => hasCsInPtExam(s.section))) {
    const class9Cfg = getEffectiveExamConfigForClass(examConfig, 'Diamond');
    const seen = new Set(effectiveConfig.subjects.map((s) => s.name.toLowerCase()));
    const mergedSubjects = [...effectiveConfig.subjects];
    class9Cfg.subjects.forEach((s) => {
      if (!seen.has(s.name.toLowerCase())) {
        mergedSubjects.push(s);
        seen.add(s.name.toLowerCase());
      }
    });
    effectiveConfig = { ...effectiveConfig, subjects: mergedSubjects };
  }

  const wb = XLSX.utils.book_new();
  const sheetsMeta: SheetLayoutMetadata[] = [];

  const { ws: conWs, meta: conMeta } = buildConsolidatedWorksheet(
    targetStudents,
    effectiveConfig,
    effectiveConfig.code || examId,
    classScope
  );
  XLSX.utils.book_append_sheet(wb, conWs, conMeta.sheetName);
  sheetsMeta.push(conMeta);

  const { ws: resWs, meta: resMeta } = buildResultAnalysisWorksheet(
    targetStudents,
    effectiveConfig,
    classScope
  );
  XLSX.utils.book_append_sheet(wb, resWs, resMeta.sheetName);
  sheetsMeta.push(resMeta);

  const rawArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  const styledBytes = await applyReferenceSheetStylesToXlsxBuffer(rawArray, sheetsMeta);

  const classSlug =
    !classScope || classScope === 'all'
      ? 'All_Classes'
      : formatReferenceClassHeader(classScope)
          .replace('CLASS - ', '')
          .replace(/\s+/g, '_');

  const fileName = `SVA_Consolidated_${classSlug}_${examId}_2026-2027.xlsx`;

  return { bytes: styledBytes, fileName };
}

/**
 * Triggers browser download of the Consolidated Excel file (.xlsx)
 */
export async function downloadConsolidatedFormatExcel(params: {
  students: StudentReportRow[];
  examConfig: ExamConfig;
  examId: string;
  classScope: string;
}): Promise<string> {
  const { bytes, fileName } = await generateConsolidatedWorkbookBytes(params);
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return fileName;
}
