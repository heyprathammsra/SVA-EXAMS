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
  isPtExam,
} from './report-card-types';

/**
 * Renders the exact 2-page PT Report Card matching PT_report_card_sample_5cddbf65.pdf
 * Page 1: School Header, REPORT CARD, PERIODIC TEST - X, Student Particulars Table,
 *         Subject Marks Table (6 subjects for Classes 6-8; 7 subjects with CS for Class 9),
 *         Summary Strip (TOTAL / PERCENTAGE / GRADE), and Class Teacher's Remarks Box.
 * Page 2: Centered 9-point Grading System Table (A1..E2) and 3-column Signatures.
 */
export function renderPtReportCardPages(
  doc: jsPDF,
  exam: ExamInfo,
  result: ComputedStudentResult
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const student = result.student;
  const profile = getStudentPtProfile(student);

  // =========================================================================
  // PAGE 1: PT REPORT CARD
  // =========================================================================

  // Crest emblem placeholder on the left (x=22, y=14, r=7)
  doc.setDrawColor(39, 69, 123);
  doc.setLineWidth(0.6);
  doc.circle(26, 21, 6.2, 'S');
  doc.setDrawColor(212, 160, 23);
  doc.setLineWidth(0.35);
  doc.circle(26, 21, 5.1, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(39, 69, 123);
  doc.text('SVA', 26, 21.8, { align: 'center' });

  // School Name in #27457B
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(39, 69, 123); // #27457B
  doc.text('Saraswati Vidya Academy', pageWidth / 2 + 4, 18.5, { align: 'center' });

  // Affiliation / School Code / UDISE Line
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  const udiseNo = exam.udiseNo || '2724100374';
  doc.text(
    `CBSE Affiliation No. ${exam.affiliationNo || '1131575'}, School Code. ${exam.schoolCode || '31572'}, UDISE No. ${udiseNo}`,
    pageWidth / 2 + 4,
    24,
    { align: 'center' }
  );

  // Address Line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Address: ${exam.schoolAddress || 'Village Shilatne, Maval Dist. Pune, Maharashtra 410405'}`,
    pageWidth / 2 + 4,
    29.5,
    { align: 'center' }
  );

  // Email Line with blue underlined email address
  const emailAddress = exam.schoolEmail || 'principal@saraswatividya.academy';
  const emailLabel = 'Email Id: ';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  const labelW = doc.getTextWidth(emailLabel);
  const emailW = doc.getTextWidth(emailAddress);
  const totalEmailW = labelW + emailW;
  const emailStartX = (pageWidth + 8 - totalEmailW) / 2;

  doc.setTextColor(0, 0, 0);
  doc.text(emailLabel, emailStartX, 35);
  doc.setTextColor(0, 0, 255);
  doc.text(emailAddress, emailStartX + labelW, 35);
  doc.setDrawColor(0, 0, 255);
  doc.setLineWidth(0.25);
  doc.line(emailStartX + labelW, 35.8, emailStartX + totalEmailW, 35.8);

  // Horizontal Black Rule below Header
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(16, 40, pageWidth - 19, 40);

  // REPORT CARD & PERIODIC TEST - X Headings
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text('REPORT CARD', pageWidth / 2, 47, { align: 'center' });

  doc.setFontSize(15);
  const ptHeading = getPtExamHeading(exam.examCode || exam.examName);
  doc.text(ptHeading, pageWidth / 2, 54, { align: 'center' });

  const tableMarginX = 21;
  const tableWidth = pageWidth - tableMarginX * 2; // 168mm

  // Table 1: Student Particulars Box (6 rows, 10-column framed black grid)
  autoTable(doc, {
    startY: 57.5,
    margin: { left: tableMarginX, right: tableMarginX },
    tableWidth,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontStyle: 'bold',
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.35,
      cellPadding: { top: 2.1, bottom: 2.1, left: 2.2, right: 2.2 },
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 19 },
      1: { cellWidth: 24 },
      2: { cellWidth: 25 },
      3: { cellWidth: 5 },
      4: { cellWidth: 19 },
      5: { cellWidth: 13 },
      6: { cellWidth: 12 },
      7: { cellWidth: 10 },
      8: { cellWidth: 13 },
      9: { cellWidth: 28 },
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
        { content: `   ${profile.attendance}`, colSpan: 8 },
      ],
    ],
  });
  const studentTableEndY = (doc as any).lastAutoTable?.finalY || 105;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  doc.rect(
    tableMarginX - 0.6,
    57.5 - 0.6,
    tableWidth + 1.2,
    studentTableEndY - 57.5 + 1.2
  );

  const afterStudentTableY = studentTableEndY + 6.5;

  // Class 9 has Computer Science paper in PT exams; Classes 6-8 do not
  const includeCs = hasCsInPtExam(student.section || student.class);
  const ptSubjectRows = result.subjectDetails
    .filter((s) => {
      if (includeCs) return true;
      const lower = s.name.trim().toLowerCase();
      return lower !== 'computer science' && lower !== 'cs';
    })
    .map((sub, idx) => {
      const subRemark =
        sub.remark && sub.remark.trim().length > 0
          ? sub.remark.trim()
          : sub.obtained === 'AB'
          ? 'Absent'
          : typeof sub.obtained === 'number' && sub.maxMarks > 0
          ? (sub.obtained / sub.maxMarks) * 100 >= 90
            ? 'Outstanding! Strong conceptual understanding.'
            : (sub.obtained / sub.maxMarks) * 100 >= 75
            ? 'Excellent performance keep it up.'
            : (sub.obtained / sub.maxMarks) * 100 >= 50
            ? 'Good.Keep it up!'
            : 'Needs regular practice.'
          : '';

      return [
        String(idx + 1),
        getPtSubjectDisplayName(sub.name),
        sub.obtained === 'AB' ? 'AB' : sub.obtained !== null ? String(sub.obtained) : '',
        subRemark,
      ];
    });

  // Table 2: Subject Marks Table (6 subjects)
  autoTable(doc, {
    startY: afterStudentTableY,
    margin: { left: tableMarginX, right: tableMarginX },
    tableWidth,
    theme: 'grid',
    head: [['SL. NO.', 'NAME OF THE SUBJECT', 'MARKS\nOBTAINED', 'REMARKS']],
    body: ptSubjectRows,
    styles: {
      font: 'helvetica',
      fontStyle: 'bold',
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.35,
      cellPadding: { top: 2.3, bottom: 2.3, left: 2.2, right: 2.2 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' },
      1: { cellWidth: 44, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 83, halign: 'left' },
    },
  });
  const marksTableEndY = (doc as any).lastAutoTable?.finalY || 165;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  doc.rect(
    tableMarginX - 0.6,
    afterStudentTableY - 0.6,
    tableWidth + 1.2,
    marksTableEndY - afterStudentTableY + 1.2
  );

  const afterMarksTableY = marksTableEndY + 6.5;

  // Table 3: Summary Strip (TOTAL / PERCENTAGE / GRADE)
  const pctFormatted = formatPtPercentage(result.totalObtained, result.totalMax);
  autoTable(doc, {
    startY: afterMarksTableY,
    margin: { left: tableMarginX, right: tableMarginX },
    tableWidth,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontStyle: 'bold',
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.35,
      cellPadding: { top: 2.1, bottom: 2.1, left: 2.2, right: 2.2 },
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 24, halign: 'left' },
      1: { cellWidth: 21, halign: 'center' },
      2: { cellWidth: 32, halign: 'center' },
      3: { cellWidth: 41, halign: 'center' },
      4: { cellWidth: 27, halign: 'left' },
      5: { cellWidth: 23, halign: 'center' },
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
  const summaryTableEndY = (doc as any).lastAutoTable?.finalY || 182;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  doc.rect(
    tableMarginX - 0.6,
    afterMarksTableY - 0.6,
    tableWidth + 1.2,
    summaryTableEndY - afterMarksTableY + 1.2
  );

  const afterSummaryY = summaryTableEndY + 6.5;

  // Table 4: Class Teacher's Remarks Box
  const defaultPtRemark =
    'Excellent and consistent performance with strong understanding and commendable effort.';
  const teacherRemarkText =
    student.customRemarks && student.customRemarks.trim().length > 0
      ? student.customRemarks.trim()
      : defaultPtRemark;

  autoTable(doc, {
    startY: afterSummaryY,
    margin: { left: tableMarginX, right: tableMarginX },
    tableWidth,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontStyle: 'bold',
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.35,
      cellPadding: { top: 2.1, bottom: 2.1, left: 2.2, right: 2.2 },
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 57, halign: 'left' },
      1: { cellWidth: 111, halign: 'left' },
    },
    body: [['CLASS TEACHER’S REMARKS:', teacherRemarkText]],
  });
  const remarksTableEndY = (doc as any).lastAutoTable?.finalY || 200;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  doc.rect(
    tableMarginX - 0.6,
    afterSummaryY - 0.6,
    tableWidth + 1.2,
    remarksTableEndY - afterSummaryY + 1.2
  );

  // =========================================================================
  // PAGE 2: GRADING SYSTEM & SIGNATURES
  // =========================================================================
  doc.addPage();

  const gradingTableWidth = 84;
  const gradingMarginLeft = (pageWidth - gradingTableWidth) / 2;

  autoTable(doc, {
    startY: 18,
    margin: { left: gradingMarginLeft, right: gradingMarginLeft },
    tableWidth: gradingTableWidth,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontStyle: 'bold',
      fontSize: 9.5,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.35,
      cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 },
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 49, halign: 'center' },
      1: { cellWidth: 35, halign: 'center' },
    },
    body: [
      [{ content: 'Grading System', colSpan: 2 }],
      ['Range of Marks', 'Grade'],
      ...REPORT_CARD_GRADING_SYSTEM.map((row) => [row.range.replace('–', '-'), row.grade]),
    ],
  });
  const gradingTableEndY = (doc as any).lastAutoTable?.finalY || 78;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.45);
  doc.rect(
    gradingMarginLeft - 0.5,
    18 - 0.5,
    gradingTableWidth + 1,
    gradingTableEndY - 18 + 1
  );

  // 3 Signature labels matching Page 2 of PT_report_card_sample_5cddbf65.pdf
  const sigTopY = 110;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // Left: Signature of Class Teacher
  doc.text('Signature of', 30, sigTopY, { align: 'center' });
  doc.text('Class Teacher', 30, sigTopY + 5, { align: 'center' });

  // Center: Signature of Principal with Seal
  doc.text('Signature of', pageWidth / 2, sigTopY, { align: 'center' });
  doc.text('Principal with Seal', pageWidth / 2, sigTopY + 5, { align: 'center' });

  // Right: Signature of Parent / Guardian
  doc.text('Signature of', pageWidth - 30, sigTopY, { align: 'center' });
  doc.text('Parent / Guardian', pageWidth - 30, sigTopY + 5, { align: 'center' });
}

export function renderReportCardPage(
  doc: jsPDF,
  exam: ExamInfo,
  result: ComputedStudentResult
) {
  if (isPtExam(exam.examCode || exam.examName)) {
    renderPtReportCardPages(doc, exam, result);
    return;
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const student = result.student;

  // Outer Border
  doc.setLineWidth(0.6);
  doc.setDrawColor(30, 41, 59); // slate-800
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  // Inner Border
  doc.setLineWidth(0.2);
  doc.rect(9.5, 9.5, pageWidth - 19, pageHeight - 19);

  // Header Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(exam.schoolName.toUpperCase(), pageWidth / 2, 18, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(exam.schoolAddress, pageWidth / 2, 23, { align: 'center' });
  doc.text(
    `Affiliation No: ${exam.affiliationNo} | School Code: ${exam.schoolCode} | Session: ${exam.academicSession}`,
    pageWidth / 2,
    27,
    { align: 'center' }
  );

  // Divider
  doc.setLineWidth(0.4);
  doc.setDrawColor(203, 213, 225);
  doc.line(12, 30, pageWidth - 12, 30);

  // Banner
  doc.setFillColor(30, 41, 59);
  doc.rect(12, 32, pageWidth - 24, 7.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`ANNUAL PROGRESS REPORT CARD — ${exam.academicSession}`, pageWidth / 2, 37, {
    align: 'center',
  });

  // Student Info Box
  const startY = 43;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.rect(12, startY, pageWidth - 24, 26, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(12, startY, pageWidth - 24, 26, 'S');

  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  // Column 1
  doc.setFont('helvetica', 'bold');
  doc.text('Student Name:', 15, startY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.text(student.name, 42, startY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Roll Number:', 15, startY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(student.rollNo, 42, startY + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('Date of Birth:', 15, startY + 18.5);
  doc.setFont('helvetica', 'normal');
  doc.text(student.dob || 'N/A', 42, startY + 18.5);

  // Column 2
  const col2X = pageWidth / 2 + 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Class & Section:', col2X, startY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${student.class} - ${student.section}`, col2X + 28, startY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.text("Father's Name:", col2X, startY + 11.5);
  doc.setFont('helvetica', 'normal');
  doc.text(student.fatherName || 'N/A', col2X + 28, startY + 11.5);

  doc.setFont('helvetica', 'bold');
  doc.text("Mother's Name:", col2X, startY + 17.5);
  doc.setFont('helvetica', 'normal');
  doc.text(student.motherName || 'N/A', col2X + 28, startY + 17.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Examination:', col2X, startY + 23);
  doc.setFont('helvetica', 'normal');
  doc.text(exam.examName, col2X + 28, startY + 23);

  // Determine if this exam has internal breakdown components (SA-1, SA-2 out of 100)
  const hasBreakdown = result.subjectDetails.some((s) => s.breakdown && s.maxMarks === 100);
  const isC9 = (student.section || '').toLowerCase().includes('ruby') ||
               (student.section || '').toLowerCase().includes('diamond') ||
               (student.section || '').toLowerCase().includes('9');

  const tableHead = hasBreakdown
    ? [['#', 'Subject Name', 'Internal (IA)', 'Theory Exam', 'Total (100)', 'Grade', 'Result', 'Subject Teacher Remark']]
    : [['#', 'Subject Name', 'Max', 'Pass', 'Obtained', 'Grade', 'Result', 'Subject Teacher Remark']];

  const tableBody = result.subjectDetails.map((sub, idx) => {
    const subRemark =
      sub.remark && sub.remark.trim().length > 0
        ? sub.remark.trim()
        : sub.obtained === 'AB'
        ? 'Absent'
        : typeof sub.obtained === 'number' && sub.maxMarks > 0
        ? (sub.obtained / sub.maxMarks) * 100 >= 75
          ? 'Very good performance'
          : (sub.obtained / sub.maxMarks) * 100 >= 50
          ? 'Good progress'
          : (sub.obtained / sub.maxMarks) * 100 >= 32
          ? 'Needs regular practice'
          : 'Needs remedial attention'
        : '-';

    if (hasBreakdown) {
      const b = sub.breakdown;
      const isHindi = sub.name.toLowerCase() === 'hindi';
      let iaText = '-';
      let theoryText = '-';

      if (b) {
        if (isC9 && isHindi) {
          const l = b.listening ?? 0;
          const s = b.speaking ?? 0;
          const p = b.project ?? 0;
          const iaSum = (typeof l === 'number' ? l : 0) + (typeof s === 'number' ? s : 0) + (typeof p === 'number' ? p : 0);
          iaText = `${iaSum} / 55`;
          theoryText = `${b.saExam ?? '-'} / 45`;
        } else {
          const pp = b.penPaper ?? 0;
          const ma = b.multipleAssessment ?? 0;
          const se = b.subjectEnrichment ?? 0;
          const pf = b.portfolio ?? 0;
          const fallbackSum = (typeof pp === 'number' ? pp : 0) + (typeof ma === 'number' ? ma : 0) + (typeof se === 'number' ? se : 0) + (typeof pf === 'number' ? pf : 0);
          const iaSum = b.internalMarks !== undefined && b.internalMarks !== null ? b.internalMarks : fallbackSum;
          iaText = `${iaSum} / 20`;
          theoryText = `${b.writtenExam ?? '-'} / 80`;
        }
      }

      return [
        (idx + 1).toString(),
        sub.name,
        iaText,
        theoryText,
        sub.obtained === 'AB' ? 'AB' : sub.obtained !== null ? sub.obtained.toString() : '-',
        sub.grade,
        sub.status,
        subRemark,
      ];
    }

    return [
      (idx + 1).toString(),
      sub.name,
      sub.maxMarks.toString(),
      sub.passMarks.toString(),
      sub.obtained === 'AB' ? 'AB (Absent)' : sub.obtained !== null ? sub.obtained.toString() : '-',
      sub.grade,
      sub.status,
      subRemark,
    ];
  });

  autoTable(doc, {
    startY: startY + 30,
    margin: { left: 12, right: 12 },
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [15, 23, 42],
    },
    columnStyles: hasBreakdown
      ? {
          0: { halign: 'center', cellWidth: 7 },
          1: { halign: 'left', cellWidth: 28 },
          2: { halign: 'center', cellWidth: 20 },
          3: { halign: 'center', cellWidth: 20 },
          4: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
          5: { halign: 'center', cellWidth: 13, fontStyle: 'bold' },
          6: { halign: 'center', cellWidth: 16 },
          7: { halign: 'left' },
        }
      : {
          0: { halign: 'center', cellWidth: 8 },
          1: { halign: 'left', cellWidth: 30 },
          2: { halign: 'center', cellWidth: 15 },
          3: { halign: 'center', cellWidth: 15 },
          4: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
          5: { halign: 'center', cellWidth: 14, fontStyle: 'bold' },
          6: { halign: 'center', cellWidth: 18 },
          7: { halign: 'left' },
        },
  });

  // Summary box
  const finalY = (doc as any).lastAutoTable.finalY + 5;

  doc.setFillColor(241, 245, 249);
  doc.rect(12, finalY, pageWidth - 24, 22, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(12, finalY, pageWidth - 24, 22, 'S');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Total Marks Obtained:', 16, finalY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(`${result.totalObtained} / ${result.totalMax}`, 56, finalY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Overall Percentage:', 16, finalY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${result.percentage.toFixed(2)}%`, 56, finalY + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('Overall Grade:', 16, finalY + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(result.grade, 56, finalY + 18);

  const sumCol2 = pageWidth / 2 + 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Result Status:', sumCol2, finalY + 6);

  const isPass = result.status === 'PASS';
  doc.setTextColor(isPass ? 34 : 220, isPass ? 197 : 38, isPass ? 94 : 38);
  doc.text(result.status, sumCol2 + 25, finalY + 6);
  doc.setTextColor(15, 23, 42);

  doc.setFont('helvetica', 'bold');
  doc.text('Class Rank:', sumCol2, finalY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(result.rank ? `#${result.rank}` : 'N/A', sumCol2 + 25, finalY + 12);

  // Class Teacher's Remarks
  const remarkY = finalY + 28;
  doc.setFont('helvetica', 'bold');
  doc.text("Class Teacher's Remarks:", 12, remarkY);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  const defaultRemark =
    result.status === 'PASS'
      ? 'Consistent academic progress and sincere effort demonstrated throughout the term.'
      : 'Satisfactory effort. Needs focused attention on core subjects.';
  doc.text(student.customRemarks || defaultRemark, 52, remarkY);

  // Signatures
  const sigY = pageHeight - 28;
  doc.setLineWidth(0.4);
  doc.setDrawColor(100, 116, 139);

  // Teacher
  doc.line(16, sigY, 56, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(exam.classTeacherName || 'Class Teacher', 36, sigY + 4, { align: 'center' });

  // Parent
  doc.line(pageWidth / 2 - 20, sigY, pageWidth / 2 + 20, sigY);
  doc.text('Parent / Guardian', pageWidth / 2, sigY + 4, { align: 'center' });

  // Principal
  doc.line(pageWidth - 56, sigY, pageWidth - 16, sigY);
  doc.setFont('helvetica', 'bold');
  doc.text(exam.principalName, pageWidth - 36, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('Principal', pageWidth - 36, sigY + 8, { align: 'center' });
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
 * Easy for printing all report cards in one continuous print job!
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
    ? `${customPdfName}.pdf`
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
  a.download = customZipName ? `${customZipName}.zip` : `ReportCards_${exam.examName.replace(/\s+/g, '_')}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
