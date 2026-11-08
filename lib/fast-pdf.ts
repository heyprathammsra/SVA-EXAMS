import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { ComputedStudentResult, ExamInfo } from './report-card-types';

export function renderReportCardPage(
  doc: jsPDF,
  exam: ExamInfo,
  result: ComputedStudentResult
) {
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
          : (sub.obtained / sub.maxMarks) * 100 >= 33
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
