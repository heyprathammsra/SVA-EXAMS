import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import {
  ComputedStudentResult,
  ExamInfo,
  REPORT_CARD_GRADING_SYSTEM,
  formatPtPercentage,
  getPtExamHeading,
  getPtSubjectDisplayName,
  getStudentPtProfile,
  hasCsInPtExam,
  isClass9Section,
  isPtExam,
} from './report-card-types';
import {
  getDefaultClassTeacherRemark,
  getDefaultSubjectRemark,
} from './remarks-utils';
import { ROCKWELL_EXTRABOLD_BASE64 } from './rockwell-font';
import {
  APTOS_COMPLETE_BASE64,
  CALIBRI_SUBSET_BASE64,
  MONTSERRAT_BOLD_BASE64,
  SCHOOL_LOGO_BASE64,
} from './pdf-assets';

function ensureReportCardFonts(doc: jsPDF) {
  try {
    const fontList = doc.getFontList() || {};
    if (!fontList['RockwellExtraBold']) {
      doc.addFileToVFS('Rockwell-ExtraBold.ttf', ROCKWELL_EXTRABOLD_BASE64);
      doc.addFont('Rockwell-ExtraBold.ttf', 'RockwellExtraBold', 'normal');
    }
    if (!fontList['Aptos']) {
      doc.addFileToVFS('Aptos-Complete.ttf', APTOS_COMPLETE_BASE64);
      doc.addFont('Aptos-Complete.ttf', 'Aptos', 'normal');
      doc.addFont('Aptos-Complete.ttf', 'Aptos', 'bold');
    }
    if (!fontList['Calibri']) {
      doc.addFileToVFS('Calibri-Subset.ttf', CALIBRI_SUBSET_BASE64);
      doc.addFont('Calibri-Subset.ttf', 'Calibri', 'normal');
    }
    if (!fontList['MontserratBold']) {
      doc.addFileToVFS('Montserrat-Bold.ttf', MONTSERRAT_BOLD_BASE64);
      doc.addFont('Montserrat-Bold.ttf', 'MontserratBold', 'normal');
      doc.addFont('Montserrat-Bold.ttf', 'MontserratBold', 'bold');
    }
  } catch {
    // Fallback to standard PDF fonts if custom VFS registration fails
  }
}

function setFontSafe(doc: jsPDF, fontName: string, fontStyle: string = 'normal') {
  try {
    const fontList = doc.getFontList() || {};
    if (fontList[fontName]) {
      doc.setFont(fontName, fontStyle);
      return;
    }
  } catch {
    // ignore
  }
  doc.setFont('helvetica', fontStyle === 'bold' ? 'bold' : 'normal');
}

/**
 * Draws text with a subtle 0.08mm stroke in addition to fill (`2 Tr`),
 * matching the browser's `-webkit-text-stroke: 0.35px currentColor` on Aptos 12px.
 */
function drawAptosBoldText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: { align?: 'left' | 'center' | 'right' }
) {
  setFontSafe(doc, 'Aptos', 'normal');
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.06);
  doc.text(text, x, y, {
    ...(options || {}),
    renderingMode: 'fillThenStroke',
  } as any);
}

/**
 * Renders the official Saraswati Vidya Academy A4 header with the school crest logo,
 * Rockwell Extra Bold #27457B title, Montserrat Bold affiliation line, Calibri address
 * and blue underlined email, and horizontal black divider line.
 */
function renderOfficialSvaHeader(doc: jsPDF, exam: ExamInfo): number {
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm on A4
  ensureReportCardFonts(doc);

  // 1. Official School Crest Logo on Left (matching HTML preview position & proportions)
  try {
    doc.addImage(
      `data:image/png;base64,${SCHOOL_LOGO_BASE64}`,
      'PNG',
      17.5,
      9.2,
      14.5,
      18.0,
      'SVA_CREST_LOGO',
      'FAST'
    );
  } catch {
    // Fallback crest ring if image decode fails in headless env
    doc.setDrawColor(39, 69, 123);
    doc.setLineWidth(0.6);
    doc.circle(24.5, 18, 6.2, 'S');
  }

  const headerCenterX = pageWidth / 2 + 4.5;

  // 2. School Name in #27457B using exact Rockwell Extra Bold font
  setFontSafe(doc, 'RockwellExtraBold', 'normal');
  doc.setFontSize(25.2);
  doc.setTextColor(39, 69, 123); // #27457B
  doc.text(exam.schoolName || 'Saraswati Vidya Academy', headerCenterX, 15.8, {
    align: 'center',
  });

  // 3. Affiliation / School Code / UDISE Line in Montserrat Bold
  setFontSafe(doc, 'MontserratBold', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(0, 0, 0);
  const udiseNo = exam.udiseNo || '2724100374';
  doc.text(
    `CBSE Affiliation No. ${exam.affiliationNo || '1131575'}, School Code. ${exam.schoolCode || '31572'}, UDISE No. ${udiseNo}`,
    headerCenterX,
    20.8,
    { align: 'center' }
  );

  // 4. Address Line in Calibri
  setFontSafe(doc, 'Calibri', 'normal');
  doc.setFontSize(10.8);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Address: ${exam.schoolAddress || 'Village Shilatne, Maval Dist. Pune, Maharashtra 410405'}`,
    headerCenterX,
    25.5,
    { align: 'center' }
  );

  // 5. Email Line with blue underlined email address in Calibri
  const emailAddress = exam.schoolEmail || 'principal@saraswatividya.academy';
  const emailLabel = 'Email Id: ';
  setFontSafe(doc, 'Calibri', 'normal');
  doc.setFontSize(10.8);
  const labelW = doc.getTextWidth(emailLabel);
  const emailW = doc.getTextWidth(emailAddress);
  const totalEmailW = labelW + emailW;
  const emailStartX = headerCenterX - totalEmailW / 2;

  doc.setTextColor(0, 0, 0);
  doc.text(emailLabel, emailStartX, 30.2);
  doc.setTextColor(0, 0, 255);
  doc.text(emailAddress, emailStartX + labelW, 30.2);
  doc.setDrawColor(0, 0, 255);
  doc.setLineWidth(0.24);
  doc.line(emailStartX + labelW, 30.9, emailStartX + totalEmailW, 30.9);

  // 6. Horizontal Black Rule below Header
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.42);
  doc.line(14, 33.8, pageWidth - 14, 33.8);

  return 33.8;
}

/**
 * Renders a double-bordered table matching CSS `border-collapse: separate; border-spacing: 1.5px; border: 1px solid black`
 * with Aptos font size 12 (`9.2pt` on A4 = `12px` at 96 DPI) and subtle medium-bold text stroke.
 */
function renderDoubleBorderedAptosTable(
  doc: jsPDF,
  options: {
    startY: number;
    marginX: number;
    tableWidth: number;
    head?: any[][];
    body: any[][];
    columnStyles?: Record<number, any>;
    cellPadding?: { top: number; bottom: number; left: number; right: number };
    fontSizePt?: number;
  }
): number {
  const gap = 0.22; // half of 0.44mm (~1.5px) inter-cell spacing
  const fontSizePt = options.fontSizePt ?? 9.2; // 9.2pt = 12.2px on A4

  const origText = doc.text.bind(doc);
  (doc as any).text = (text: any, x: number, y: number, opts?: any, transform?: any) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.06);
    return origText(
      text,
      x,
      y,
      { ...(opts || {}), renderingMode: 'fillThenStroke' },
      transform
    );
  };

  try {
    autoTable(doc, {
      startY: options.startY,
      margin: { left: options.marginX, right: options.marginX },
      tableWidth: options.tableWidth,
      theme: 'plain',
      head: options.head,
      body: options.body,
      styles: {
        font: 'Aptos',
        fontStyle: 'normal',
        fontSize: fontSizePt,
        textColor: [0, 0, 0],
        lineColor: [255, 255, 255],
        lineWidth: 0,
        cellPadding: options.cellPadding || {
          top: 1.55,
          bottom: 1.55,
          left: 2.1,
          right: 2.1,
        },
        valign: 'middle',
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'normal',
        fontSize: fontSizePt,
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: options.columnStyles,
      didDrawCell: (data) => {
        const { x, y, width, height } = data.cell;
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.26);
        doc.rect(
          x + gap,
          y + gap,
          Math.max(0.1, width - gap * 2),
          Math.max(0.1, height - gap * 2),
          'S'
        );
      },
    });
  } finally {
    (doc as any).text = origText;
  }
  const endY = (doc as any).lastAutoTable?.finalY || options.startY + 20;

  // Outer table frame around all inset cell borders
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.32);
  doc.rect(
    options.marginX - gap,
    options.startY - gap,
    options.tableWidth + gap * 2,
    endY - options.startY + gap * 2,
    'S'
  );

  return endY;
}

/**
 * Renders a single-bordered collapsed table matching CSS `border-collapse: collapse; border: 1px solid black`
 * used for the centered Grading System table on Page 2 of the official report card.
 */
function renderSingleBorderedAptosTable(
  doc: jsPDF,
  options: {
    startY: number;
    marginX: number;
    tableWidth: number;
    head?: any[][];
    body: any[][];
    columnStyles?: Record<number, any>;
    cellPadding?: { top: number; bottom: number; left: number; right: number };
    fontSizePt?: number;
  }
): number {
  const fontSizePt = options.fontSizePt ?? 10.8;

  const origText = doc.text.bind(doc);
  (doc as any).text = (text: any, x: number, y: number, opts?: any, transform?: any) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.06);
    return origText(
      text,
      x,
      y,
      { ...(opts || {}), renderingMode: 'fillThenStroke' },
      transform
    );
  };

  try {
    autoTable(doc, {
      startY: options.startY,
      margin: { left: options.marginX, right: options.marginX },
      tableWidth: options.tableWidth,
      theme: 'grid',
      head: options.head,
      body: options.body,
      styles: {
        font: 'Aptos',
        fontStyle: 'normal',
        fontSize: fontSizePt,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.26,
        cellPadding: options.cellPadding || {
          top: 1.45,
          bottom: 1.45,
          left: 2.2,
          right: 2.2,
        },
        valign: 'middle',
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'normal',
        fontSize: fontSizePt,
        lineColor: [0, 0, 0],
        lineWidth: 0.26,
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: options.columnStyles,
    });
  } finally {
    (doc as any).text = origText;
  }

  return (doc as any).lastAutoTable?.finalY || options.startY + 20;
}

/**
 * Renders the 3-column symmetrical Signatures row on Page 2 of the report card.
 */
function renderThreeSignaturesRow(doc: jsPDF, sigTopY: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10.8);

  // Left: Signature of Class Teacher
  drawAptosBoldText(doc, 'Signature of', 36, sigTopY, { align: 'center' });
  drawAptosBoldText(doc, 'Class Teacher', 36, sigTopY + 5.0, { align: 'center' });

  // Center: Signature of Principal with Seal
  drawAptosBoldText(doc, 'Signature of', pageWidth / 2, sigTopY, { align: 'center' });
  drawAptosBoldText(doc, 'Principal with Seal', pageWidth / 2, sigTopY + 5.0, {
    align: 'center',
  });

  // Right: Signature of Parent / Guardian
  drawAptosBoldText(doc, 'Signature of', pageWidth - 36, sigTopY, { align: 'center' });
  drawAptosBoldText(doc, 'Parent / Guardian', pageWidth - 36, sigTopY + 5.0, {
    align: 'center',
  });
}

/**
 * Renders Page 2 of the official Saraswati Vidya Academy Report Card:
 * Centered 9-point Grading System table (single-bordered) and 3-column Signatures.
 */
function renderGradingAndSignaturesSecondPage(doc: jsPDF) {
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const gradingTableWidth = 86;
  const gradingMarginX = (pageWidth - gradingTableWidth) / 2;

  const gradingTableEndY = renderSingleBorderedAptosTable(doc, {
    startY: 18,
    marginX: gradingMarginX,
    tableWidth: gradingTableWidth,
    fontSizePt: 10.8,
    cellPadding: { top: 1.45, bottom: 1.45, left: 2.2, right: 2.2 },
    columnStyles: {
      0: { cellWidth: 48.0, halign: 'center' },
      1: { cellWidth: 38.0, halign: 'center' },
    },
    body: [
      [{ content: 'Grading System', colSpan: 2, styles: { halign: 'center' } }],
      [
        { content: 'Range of Marks', styles: { halign: 'center' } },
        { content: 'Grade', styles: { halign: 'center' } },
      ],
      ...REPORT_CARD_GRADING_SYSTEM.map((row) => [
        { content: row.range, styles: { halign: 'center' } },
        { content: row.grade, styles: { halign: 'center' } },
      ]),
    ],
  });

  const sigTopY = Math.max(gradingTableEndY + 26, 108);
  renderThreeSignaturesRow(doc, sigTopY);
}

/**
 * Formats SA exam heading cleanly in uppercase (e.g. SUMMATIVE ASSESSMENT - 1).
 */
function getSaExamHeading(examIdOrName?: string): string {
  const norm = (examIdOrName || 'SA-1').trim().toUpperCase();
  const match =
    norm.match(/SA[\s-]*(\d+)/i) || norm.match(/SUMMATIVE\s+ASSESSMENT[\s-]*(\d+)/i);
  if (match) {
    return `SUMMATIVE ASSESSMENT - ${match[1]}`;
  }
  return norm;
}

/**
 * Renders the complete 2-Page A4 PT Report Card (210mm x 297mm)
 * matching the official PT Report Card sample PDF and images 1:1.
 */
export function renderPtReportCardPages(
  doc: jsPDF,
  exam: ExamInfo,
  result: ComputedStudentResult
) {
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const student = result.student;
  const profile = getStudentPtProfile(student);

  // 1. Official School Header with Crest Logo
  const headerBottomY = renderOfficialSvaHeader(doc, exam);

  // 2. REPORT CARD (11.5pt) & PERIODIC TEST - X (14.5pt) Titles
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11.5);
  drawAptosBoldText(doc, 'REPORT CARD', pageWidth / 2, headerBottomY + 6.5, {
    align: 'center',
  });

  const ptHeading = getPtExamHeading(exam.examCode || exam.examName);
  doc.setFontSize(14.5);
  drawAptosBoldText(doc, ptHeading, pageWidth / 2, headerBottomY + 12.8, {
    align: 'center',
  });

  const tableMarginX = 14;
  const tableWidth = pageWidth - tableMarginX * 2; // 182mm

  // 3. Table 1: Student Particulars Box (6 rows, 10-column double-bordered table)
  const studentTableStartY = headerBottomY + 16.2;
  const studentTableEndY = renderDoubleBorderedAptosTable(doc, {
    startY: studentTableStartY,
    marginX: tableMarginX,
    tableWidth,
    fontSizePt: 10.8,
    cellPadding: { top: 2.0, bottom: 2.0, left: 2.2, right: 2.2 },
    columnStyles: {
      0: { cellWidth: 21.0, halign: 'left' },
      1: { cellWidth: 25.5, halign: 'left' },
      2: { cellWidth: 27.3, halign: 'left' },
      3: { cellWidth: 5.5, halign: 'left' },
      4: { cellWidth: 20.0, halign: 'left' },
      5: { cellWidth: 14.5, halign: 'left' },
      6: { cellWidth: 12.7, halign: 'left' },
      7: { cellWidth: 11.0, halign: 'left' },
      8: { cellWidth: 14.5, halign: 'left' },
      9: { cellWidth: 30.0, halign: 'left' },
    },
    body: [
      [
        'Roll No.',
        profile.rollNoDisplay,
        { content: 'Class & Section:', colSpan: 2 },
        { content: profile.classSectionDisplay, colSpan: 3 },
        { content: 'DOB:', colSpan: 2 },
        profile.dobDisplay,
      ],
      [
        { content: 'Name of the Student:', colSpan: 2 },
        { content: student.name, colSpan: 8 },
      ],
      [
        { content: 'Father’s Name:', colSpan: 2 },
        { content: profile.fatherNameDisplay, colSpan: 8 },
      ],
      [
        { content: 'Mother’s Name:', colSpan: 2 },
        { content: profile.motherNameDisplay, colSpan: 8 },
      ],
      [
        { content: 'House:', colSpan: 2 },
        profile.house,
        { content: 'Height:', colSpan: 2 },
        { content: profile.height, colSpan: 2 },
        { content: 'Weight:', colSpan: 2 },
        profile.weight,
      ],
      [
        { content: 'Attendance:', colSpan: 2 },
        { content: profile.attendance, colSpan: 8 },
      ],
    ],
  });

  // 4. Table 2: Subject Marks Table (6 subjects for Classes 6-8; 7 subjects with CS for Class 9)
  const includeCs = hasCsInPtExam(student.section || student.class);
  const ptSubjectRows = result.subjectDetails
    .filter((s) => {
      if (includeCs) return true;
      const lower = s.name.trim().toLowerCase();
      return lower !== 'computer science' && lower !== 'cs';
    })
    .map((sub, idx) => {
      const markStr =
        sub.obtained === 'AB'
          ? 'AB'
          : sub.obtained !== null && sub.obtained !== undefined
          ? String(sub.obtained)
          : '-';
      const subRemark =
        sub.remark && sub.remark.trim().length > 0
          ? sub.remark.trim()
          : getDefaultSubjectRemark(sub.obtained, sub.maxMarks);

      return [
        String(idx + 1),
        getPtSubjectDisplayName(sub.name),
        markStr,
        subRemark,
      ];
    });

  const marksTableStartY = studentTableEndY + 6.2;
  const marksTableEndY = renderDoubleBorderedAptosTable(doc, {
    startY: marksTableStartY,
    marginX: tableMarginX,
    tableWidth,
    fontSizePt: 11.2,
    cellPadding: { top: 2.3, bottom: 2.3, left: 2.2, right: 2.2 },
    head: [['SL.\nNO.', 'NAME OF THE SUBJECT', 'MARKS\nOBTAINED', 'REMARKS']],
    body: ptSubjectRows,
    columnStyles: {
      0: { cellWidth: 20.9, halign: 'center' },
      1: { cellWidth: 52.8, halign: 'center' },
      2: { cellWidth: 40.1, halign: 'center' },
      3: { cellWidth: 68.2, halign: 'left' },
    },
  });

  // 5. Table 3: Summary Strip (TOTAL / PERCENTAGE / GRADE)
  const pctFormatted = formatPtPercentage(result.totalObtained, result.totalMax);
  const summaryTableStartY = marksTableEndY + 6.2;
  const summaryTableEndY = renderDoubleBorderedAptosTable(doc, {
    startY: summaryTableStartY,
    marginX: tableMarginX,
    tableWidth,
    fontSizePt: 10.8,
    cellPadding: { top: 2.0, bottom: 2.0, left: 2.2, right: 2.2 },
    columnStyles: {
      0: { cellWidth: 25.5, halign: 'left' },
      1: { cellWidth: 23.7, halign: 'center' },
      2: { cellWidth: 34.6, halign: 'center' },
      3: { cellWidth: 43.7, halign: 'center' },
      4: { cellWidth: 29.1, halign: 'left' },
      5: { cellWidth: 25.4, halign: 'center' },
    },
    body: [
      [
        'TOTAL:',
        `${result.totalObtained}/${result.totalMax}`,
        'PERCENTAGE:',
        pctFormatted,
        'GRADE:',
        result.grade,
      ],
    ],
  });

  // 6. Table 4: Class Teacher's Remarks Box
  const hasAnyMarks = result.subjectDetails.some(
    (s) => s.obtained !== null && s.obtained !== undefined
  );
  const teacherRemarkText =
    student.customRemarks && student.customRemarks.trim().length > 0
      ? student.customRemarks.trim()
      : hasAnyMarks
      ? getDefaultClassTeacherRemark(result.percentage, result.status)
      : '';

  const remarksTableStartY = summaryTableEndY + 6.2;
  renderDoubleBorderedAptosTable(doc, {
    startY: remarksTableStartY,
    marginX: tableMarginX,
    tableWidth,
    fontSizePt: 10.8,
    cellPadding: { top: 2.3, bottom: 2.3, left: 2.2, right: 2.2 },
    columnStyles: {
      0: { cellWidth: 60.0, halign: 'left' },
      1: { cellWidth: 122.0, halign: 'left' },
    },
    body: [['CLASS TEACHER’S REMARKS:', teacherRemarkText]],
  });

  // 7. Page 2: Centered Grading System Table & Symmetrical 3-Column Signatures Row
  renderGradingAndSignaturesSecondPage(doc);
}

/**
 * Renders the 2-Page A4 Summative Assessment (SA-1 / SA-2) Report Card
 * matching the official Saraswati Vidya Academy report card layout 1:1.
 */
export function renderReportCardPage(
  doc: jsPDF,
  exam: ExamInfo,
  result: ComputedStudentResult
) {
  if (isPtExam(exam.examCode || exam.examName)) {
    renderPtReportCardPages(doc, exam, result);
    return;
  }

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const student = result.student;
  const profile = getStudentPtProfile(student);

  // 1. Official SVA Header with Crest Logo
  const headerBottomY = renderOfficialSvaHeader(doc, exam);

  // 2. REPORT CARD & SA Examination Heading
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11.5);
  drawAptosBoldText(doc, 'REPORT CARD', pageWidth / 2, headerBottomY + 6.5, {
    align: 'center',
  });

  const saHeading = getSaExamHeading(exam.examCode || exam.examName);
  doc.setFontSize(14.5);
  drawAptosBoldText(doc, saHeading, pageWidth / 2, headerBottomY + 12.8, {
    align: 'center',
  });

  const tableMarginX = 14;
  const tableWidth = pageWidth - tableMarginX * 2; // 182mm

  // 3. Table 1: Student Particulars Box (matching PT particulars layout)
  const studentTableEndY = renderDoubleBorderedAptosTable(doc, {
    startY: headerBottomY + 16.2,
    marginX: tableMarginX,
    tableWidth,
    fontSizePt: 10.5,
    cellPadding: { top: 1.85, bottom: 1.85, left: 2.2, right: 2.2 },
    columnStyles: {
      0: { cellWidth: 21.0, halign: 'left' },
      1: { cellWidth: 25.5, halign: 'left' },
      2: { cellWidth: 27.3, halign: 'left' },
      3: { cellWidth: 5.5, halign: 'left' },
      4: { cellWidth: 20.0, halign: 'left' },
      5: { cellWidth: 14.5, halign: 'left' },
      6: { cellWidth: 12.7, halign: 'left' },
      7: { cellWidth: 11.0, halign: 'left' },
      8: { cellWidth: 14.5, halign: 'left' },
      9: { cellWidth: 30.0, halign: 'left' },
    },
    body: [
      [
        'Roll No.',
        profile.rollNoDisplay,
        { content: 'Class & Section:', colSpan: 2 },
        { content: profile.classSectionDisplay, colSpan: 3 },
        { content: 'DOB:', colSpan: 2 },
        profile.dobDisplay,
      ],
      [
        { content: 'Name of the Student:', colSpan: 2 },
        { content: student.name, colSpan: 8 },
      ],
      [
        { content: 'Father’s Name:', colSpan: 2 },
        { content: profile.fatherNameDisplay, colSpan: 8 },
      ],
      [
        { content: 'Mother’s Name:', colSpan: 2 },
        { content: profile.motherNameDisplay, colSpan: 8 },
      ],
      [
        { content: 'House:', colSpan: 2 },
        profile.house,
        { content: 'Height:', colSpan: 2 },
        { content: profile.height, colSpan: 2 },
        { content: 'Weight:', colSpan: 2 },
        profile.weight,
      ],
      [
        { content: 'Attendance:', colSpan: 2 },
        { content: profile.attendance, colSpan: 8 },
      ],
    ],
  });

  // 4. Table 2: Scholastic Marks Table (with Internal, Exam, Max, Obtained, Grade, Remarks)
  const isClass9 = isClass9Section(student.section || student.class);
  const saRows = result.subjectDetails.map((detail, idx) => {
    const bd = detail.breakdown;
    const isHindi = detail.name.toLowerCase() === 'hindi';
    let internalLabel = '-';
    let writtenLabel = '-';

    if (
      detail.internalObtained !== undefined &&
      detail.internalMax &&
      detail.internalMax > 0
    ) {
      internalLabel = `${detail.internalObtained}/${detail.internalMax}`;
      writtenLabel = `${detail.mainObtained ?? '-'}/${detail.mainMax || detail.maxMarks}`;
    } else if (bd) {
      if (isClass9 && isHindi) {
        const allAb = bd.listening === 'AB' && bd.speaking === 'AB' && bd.project === 'AB';
        const list = typeof bd.listening === 'number' ? bd.listening : 0;
        const spk = typeof bd.speaking === 'number' ? bd.speaking : 0;
        const prj = typeof bd.project === 'number' ? bd.project : 0;
        const intTot = allAb ? 'AB' : list + spk + prj;
        internalLabel = `${intTot}/${detail.internalMax || 55}`;
        writtenLabel = `${bd.saExam ?? '-'}/${detail.mainMax || 45}`;
      } else {
        const isCs =
          detail.name.toLowerCase() === 'computer science' ||
          detail.name.toLowerCase() === 'cs';
        const hasAny4Part =
          bd.penPaper !== undefined ||
          bd.multipleAssessment !== undefined ||
          bd.subjectEnrichment !== undefined ||
          bd.portfolio !== undefined;
        const all4PartAB =
          bd.penPaper === 'AB' &&
          bd.multipleAssessment === 'AB' &&
          bd.subjectEnrichment === 'AB' &&
          bd.portfolio === 'AB';
        const pp = typeof bd.penPaper === 'number' ? bd.penPaper : 0;
        const ma = typeof bd.multipleAssessment === 'number' ? bd.multipleAssessment : 0;
        const se = typeof bd.subjectEnrichment === 'number' ? bd.subjectEnrichment : 0;
        const pf = typeof bd.portfolio === 'number' ? bd.portfolio : 0;
        const sum4Part = pp + ma + se + pf;
        const intTot =
          !isCs && hasAny4Part
            ? all4PartAB
              ? 'AB'
              : sum4Part
            : bd.internalMarks !== undefined && bd.internalMarks !== null
            ? bd.internalMarks
            : sum4Part;
        internalLabel = `${intTot}/${detail.internalMax || 20}`;
        writtenLabel = `${bd.writtenExam ?? '-'}/${detail.mainMax || 80}`;
      }
    }

    const markStr =
      detail.obtained === 'AB'
        ? 'AB'
        : detail.obtained !== null && detail.obtained !== undefined
        ? String(detail.obtained)
        : '-';
    const remarkText =
      detail.remark && detail.remark.trim().length > 0
        ? detail.remark.trim()
        : getDefaultSubjectRemark(detail.obtained, detail.maxMarks);

    return [
      String(idx + 1),
      getPtSubjectDisplayName(detail.name),
      internalLabel,
      writtenLabel,
      String(detail.maxMarks),
      markStr,
      detail.grade,
      remarkText,
    ];
  });

  const marksTableEndY = renderDoubleBorderedAptosTable(doc, {
    startY: studentTableEndY + 5.5,
    marginX: tableMarginX,
    tableWidth,
    fontSizePt: 10.0,
    cellPadding: { top: 2.0, bottom: 2.0, left: 1.5, right: 1.5 },
    head: [
      [
        'SL.\nNO.',
        'NAME OF THE SUBJECT',
        'INTERNAL',
        'EXAM',
        'MAX',
        'OBTAINED',
        'GRADE',
        'REMARKS',
      ],
    ],
    body: saRows,
    columnStyles: {
      0: { cellWidth: 11.0, halign: 'center' },
      1: { cellWidth: 38.0, halign: 'center' },
      2: { cellWidth: 18.0, halign: 'center' },
      3: { cellWidth: 16.0, halign: 'center' },
      4: { cellWidth: 12.0, halign: 'center' },
      5: { cellWidth: 19.0, halign: 'center' },
      6: { cellWidth: 14.0, halign: 'center' },
      7: { cellWidth: 54.0, halign: 'left' },
    },
  });

  // 5. Table 3: Summary Strip (TOTAL / PERCENTAGE / GRADE)
  const pctFormatted = formatPtPercentage(result.totalObtained, result.totalMax);
  const summaryTableEndY = renderDoubleBorderedAptosTable(doc, {
    startY: marksTableEndY + 5.5,
    marginX: tableMarginX,
    tableWidth,
    fontSizePt: 10.5,
    cellPadding: { top: 1.9, bottom: 1.9, left: 2.2, right: 2.2 },
    columnStyles: {
      0: { cellWidth: 25.5, halign: 'left' },
      1: { cellWidth: 23.7, halign: 'center' },
      2: { cellWidth: 34.6, halign: 'center' },
      3: { cellWidth: 43.7, halign: 'center' },
      4: { cellWidth: 29.1, halign: 'left' },
      5: { cellWidth: 25.4, halign: 'center' },
    },
    body: [
      [
        'TOTAL:',
        `${result.totalObtained}/${result.totalMax}`,
        'PERCENTAGE:',
        pctFormatted,
        'GRADE:',
        result.grade,
      ],
    ],
  });

  // 6. Table 4: Class Teacher's Remarks Box
  const hasAnyMarks = result.subjectDetails.some(
    (s) => s.obtained !== null && s.obtained !== undefined
  );
  const teacherRemarkText =
    student.customRemarks && student.customRemarks.trim().length > 0
      ? student.customRemarks.trim()
      : hasAnyMarks
      ? getDefaultClassTeacherRemark(result.percentage, result.status)
      : '';

  renderDoubleBorderedAptosTable(doc, {
    startY: summaryTableEndY + 5.5,
    marginX: tableMarginX,
    tableWidth,
    fontSizePt: 10.5,
    cellPadding: { top: 2.1, bottom: 2.1, left: 2.2, right: 2.2 },
    columnStyles: {
      0: { cellWidth: 60.0, halign: 'left' },
      1: { cellWidth: 122.0, halign: 'left' },
    },
    body: [['CLASS TEACHER’S REMARKS:', teacherRemarkText]],
  });

  // 7. Page 2: Centered Grading System Table & Symmetrical 3-Column Signatures Row
  renderGradingAndSignaturesSecondPage(doc);
}

export function generateSingleReportCardPDF(
  exam: ExamInfo,
  result: ComputedStudentResult
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  renderReportCardPage(doc, exam, result);
  return doc;
}

export function downloadSinglePDF(exam: ExamInfo, result: ComputedStudentResult) {
  const doc = generateSingleReportCardPDF(exam, result);
  const safeName = result.student.name.replace(/\s+/g, '_');
  doc.save(`ReportCard_${result.student.rollNo}_${safeName}.pdf`);
}

/**
 * Generates a SINGLE combined multi-page PDF containing all student report cards.
 * Easy for printing all report cards in one continuous A4 print job!
 */
export function downloadAllReportCardsSinglePDF(
  exam: ExamInfo,
  results: ComputedStudentResult[],
  customPdfName?: string
) {
  if (results.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  results.forEach((res, index) => {
    if (index > 0) {
      doc.addPage();
    }
    renderReportCardPage(doc, exam, res);
  });

  const fileName = customPdfName
    ? customPdfName.endsWith('.pdf')
      ? customPdfName
      : `${customPdfName}.pdf`
    : `All_ReportCards_${exam.examName.replace(/\s+/g, '_')}_${results.length}_Students.pdf`;

  doc.save(fileName);
}

export async function downloadAllPDFsAsZip(
  exam: ExamInfo,
  results: ComputedStudentResult[],
  customZipName?: string
) {
  const zip = new JSZip();

  results.forEach((res) => {
    const doc = generateSingleReportCardPDF(exam, res);
    const pdfBlob = doc.output('blob');
    const safeName = res.student.name.replace(/\s+/g, '_');
    const sectionName = res.student.section ? `_${res.student.section}` : '';
    zip.file(`ReportCard${sectionName}_${res.student.rollNo}_${safeName}.pdf`, pdfBlob);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = customZipName
    ? customZipName.endsWith('.zip')
      ? customZipName
      : `${customZipName}.zip`
    : `ReportCards_${exam.examName.replace(/\s+/g, '_')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
