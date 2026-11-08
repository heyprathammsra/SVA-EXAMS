import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import { Student, Examination, CalculatedStudentResult, SchoolSettings } from './types';

export function generateReportCardPDF(
  school: SchoolSettings,
  student: Student,
  exam: Examination,
  result: CalculatedStudentResult
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Page Border
  doc.setLineWidth(0.8);
  doc.setDrawColor(30, 41, 59); // Slate-800
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  doc.setLineWidth(0.3);
  doc.rect(9.5, 9.5, pageWidth - 19, pageHeight - 19);

  // 1. Header Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(school.schoolName.toUpperCase(), pageWidth / 2, 18, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(school.schoolAddress, pageWidth / 2, 23, { align: 'center' });
  doc.text(`Affiliation No: ${school.affiliationNo} | School Code: ${school.schoolCode} | Contact: ${school.schoolContact}`, pageWidth / 2, 27, { align: 'center' });

  // Divider line
  doc.setLineWidth(0.5);
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.line(12, 30, pageWidth - 12, 30);

  // Report Card Title Banner
  doc.setFillColor(30, 41, 59); // dark slate background
  doc.rect(12, 32, pageWidth - 24, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`PROGRESS REPORT CARD - ${exam.academicSession}`, pageWidth / 2, 37.5, { align: 'center' });

  // 2. Student Info Box
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);

  const startY = 44;
  doc.setFillColor(248, 250, 252);
  doc.rect(12, startY, pageWidth - 24, 28, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(12, startY, pageWidth - 24, 28, 'S');

  // Left Column
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

  // Right Column
  const col2X = pageWidth / 2 + 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Class & Section:', col2X, startY + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${student.class} - ${student.section}`, col2X + 30, startY + 5);

  doc.setFont('helvetica', 'bold');
  doc.text('Roll Number:', col2X, startY + 11);
  doc.setFont('helvetica', 'normal');
  doc.text(student.rollNo, col2X + 30, startY + 11);

  doc.setFont('helvetica', 'bold');
  doc.text('Father\'s Name:', col2X, startY + 17);
  doc.setFont('helvetica', 'normal');
  doc.text(student.fatherName, col2X + 30, startY + 17);

  doc.setFont('helvetica', 'bold');
  doc.text('Mother\'s Name:', col2X, startY + 23);
  doc.setFont('helvetica', 'normal');
  doc.text(student.motherName, col2X + 30, startY + 23);

  // Exam Name subhead
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`EXAMINATION: ${exam.name.toUpperCase()}`, 12, startY + 34);

  // 3. Subject Marks Table
  const tableHead = [['S.No.', 'Subject Name', 'Max Marks', 'Pass Marks', 'Obtained', 'Grade', 'Status']];
  const tableBody = result.subjectResults.map((sr, index) => [
    (index + 1).toString(),
    sr.subjectName,
    sr.maxMarks.toString(),
    sr.passMarks.toString(),
    sr.obtainedMarks === 'AB' ? 'AB (Absent)' : sr.obtainedMarks !== null ? sr.obtainedMarks.toString() : '-',
    sr.grade,
    sr.status,
  ]);

  autoTable(doc, {
    startY: startY + 37,
    margin: { left: 12, right: 12 },
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'center', cellWidth: 25, fontStyle: 'bold' },
      5: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
      6: { halign: 'center', cellWidth: 25 },
    },
  });

  // Get Y position after table
  const finalY = (doc as any).lastAutoTable.finalY + 6;

  // 4. Performance Summary Box
  doc.setFillColor(241, 245, 249);
  doc.rect(12, finalY, pageWidth - 24, 26, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(12, finalY, pageWidth - 24, 26, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTAL MARKS OBTAINED:', 16, finalY + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(`${result.totalObtained} / ${result.totalMax}`, 62, finalY + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('AGGREGATE PERCENTAGE:', 16, finalY + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(`${result.percentage.toFixed(2)}%`, 62, finalY + 14);

  doc.setFont('helvetica', 'bold');
  doc.text('FINAL OVERALL GRADE:', 16, finalY + 21);
  doc.setFont('helvetica', 'normal');
  doc.text(`${result.grade}`, 62, finalY + 21);

  // Right summary column
  const sumCol2X = pageWidth / 2 + 10;
  doc.setFont('helvetica', 'bold');
  doc.text('FINAL RESULT:', sumCol2X, finalY + 7);

  let statusColor = [34, 197, 94]; // Green
  if (result.resultStatus === 'FAIL') statusColor = [239, 68, 68]; // Red
  if (result.resultStatus === 'COMPARTMENT') statusColor = [245, 158, 11]; // Amber

  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.text(result.resultStatus, sumCol2X + 35, finalY + 7);
  doc.setTextColor(15, 23, 42);

  doc.setFont('helvetica', 'bold');
  doc.text('CLASS RANK:', sumCol2X, finalY + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(result.rank ? `#${result.rank}` : 'N/A', sumCol2X + 35, finalY + 14);

  doc.setFont('helvetica', 'bold');
  doc.text('CALCULATION METHOD:', sumCol2X, finalY + 21);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(result.formulaUsed, sumCol2X + 42, finalY + 21);

  // 5. Remarks & Grading Scale Reference
  const remarkY = finalY + 31;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('TEACHER\'S REMARKS:', 12, remarkY);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  const remarkText =
    result.resultStatus === 'PASS'
      ? 'Exemplary academic effort and good discipline throughout the term. Keep it up!'
      : result.resultStatus === 'COMPARTMENT'
      ? 'Satisfactory overall progress. Additional focus required in weak subjects.'
      : 'Needs significant improvement and regular homework submission.';
  doc.text(remarkText, 45, remarkY);

  // 6. Signatures Section at bottom
  const sigY = pageHeight - 32;

  doc.setLineWidth(0.4);
  doc.setDrawColor(71, 85, 105);

  // Class Teacher Signature Line
  doc.line(16, sigY, 60, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Class Teacher Signature', 38, sigY + 4, { align: 'center' });

  // Parent Signature Line
  doc.line(pageWidth / 2 - 22, sigY, pageWidth / 2 + 22, sigY);
  doc.text('Parent / Guardian Signature', pageWidth / 2, sigY + 4, { align: 'center' });

  // Principal Signature Line
  doc.line(pageWidth - 60, sigY, pageWidth - 16, sigY);
  doc.setFont('helvetica', 'bold');
  doc.text(school.principalName, pageWidth - 38, sigY + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text('Principal & Stamp', pageWidth - 38, sigY + 8, { align: 'center' });

  // Issue Date at footer
  const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on: ${todayStr} | Report Card Verification Code: ${student.id}-${exam.id}`, pageWidth / 2, pageHeight - 12, { align: 'center' });

  return doc;
}

export function downloadIndividualReportCardPDF(
  school: SchoolSettings,
  student: Student,
  exam: Examination,
  result: CalculatedStudentResult
) {
  const doc = generateReportCardPDF(school, student, exam, result);
  const fileName = `ReportCard_${student.class}_${student.section}_${student.rollNo}_${student.name.replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}

export async function downloadBulkReportCardsZIP(
  school: SchoolSettings,
  items: Array<{ student: Student; exam: Examination; result: CalculatedStudentResult }>
) {
  const zip = new JSZip();

  items.forEach(({ student, exam, result }) => {
    const doc = generateReportCardPDF(school, student, exam, result);
    const pdfBlob = doc.output('blob');
    const fileName = `ReportCard_${student.rollNo}_${student.name.replace(/\s+/g, '_')}.pdf`;
    zip.file(fileName, pdfBlob);
  });

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bulk_ReportCards_${items[0]?.student.class || 'Class'}_${items[0]?.student.section || ''}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
