import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ReportCardPdfSnapshot = {
  institution: { name: string; branch: string; academicYear: string };
  report: { title: string; examName: string; generatedAt: string };
  student: { name: string; scholarNumber: string; classSection: string; rollNumber: string | null };
  subjects: Array<{ name: string; marks: string | null; maximumMarks: string | null; percentage: string | null; grade: string | null; status: string }>;
  overall: { totalMarks: string | null; maximumMarks: string | null; percentage: string | null; grade: string | null; status: string; promotionEligible: boolean };
  attendance: null | { eligibleDays: number; markedDays: number; presentDays: string; absentDays: string; percentage: string | null };
  signatureLabels: string[];
};

function pdfSafe(value: string) {
  if (/[^\u0000-\u00ff]/.test(value)) {
    throw new Error("GRADEBOOK_REPORT_CARD_FONT_UNSUPPORTED");
  }
  return value;
}
export async function renderReportCardPdf(snapshot: ReportCardPdfSnapshot) {
  const document = await PDFDocument.create();
  document.setTitle(`${snapshot.student.name} - ${snapshot.report.examName}`);
  document.setAuthor("JinaCampus GradeBook");
  document.setSubject("Academic report card");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const navy = rgb(0.05, 0.13, 0.29);
  const blue = rgb(0.12, 0.32, 0.86);
  const muted = rgb(0.36, 0.42, 0.52);
  const border = rgb(0.84, 0.88, 0.94);
  let y = height - 55;

  page.drawRectangle({ x: 36, y: height - 125, width: width - 72, height: 90, color: rgb(0.96, 0.98, 1), borderColor: border, borderWidth: 1 });
  page.drawText(pdfSafe(snapshot.institution.name), { x: 54, y, size: 18, font: bold, color: navy });
  y -= 24;
  page.drawText(pdfSafe(snapshot.report.title), { x: 54, y, size: 13, font: bold, color: blue });
  y -= 19;
  page.drawText(pdfSafe(`${snapshot.institution.branch} | ${snapshot.institution.academicYear} | ${snapshot.report.examName}`), { x: 54, y, size: 9, font: regular, color: muted });
  y = height - 158;
  const detailLines = [
    `Student: ${snapshot.student.name}`,
    `Scholar No.: ${snapshot.student.scholarNumber}`,
    `Class-section: ${snapshot.student.classSection}`,
    `Roll No.: ${snapshot.student.rollNumber ?? "-"}`
  ];
  detailLines.forEach((line, index) => page.drawText(pdfSafe(line), { x: index % 2 === 0 ? 44 : 310, y: y - Math.floor(index / 2) * 20, size: 10, font: index % 2 === 0 ? bold : regular, color: navy }));
  y -= 66;

  const columns = [44, 288, 365, 440, 505];
  const headers = ["Subject", "Marks", "Max", "%", "Grade"];
  page.drawRectangle({ x: 40, y: y - 6, width: width - 80, height: 25, color: rgb(0.93, 0.96, 1) });
  headers.forEach((header, index) => page.drawText(header, { x: columns[index]!, y: y + 2, size: 9, font: bold, color: navy }));
  y -= 18;
  for (const subject of snapshot.subjects) {
    if (y < 190) break;
    page.drawLine({ start: { x: 40, y: y - 5 }, end: { x: width - 40, y: y - 5 }, color: border, thickness: 0.5 });
    const values = [subject.name, subject.marks ?? subject.status, subject.maximumMarks ?? "-", subject.percentage ?? "-", subject.grade ?? "-"];
    values.forEach((value, index) => page.drawText(pdfSafe(value.slice(0, index === 0 ? 38 : 12)), { x: columns[index]!, y, size: 8.5, font: regular, color: navy }));
    y -= 20;
  }
  y -= 12;
  page.drawRectangle({ x: 40, y: y - 45, width: width - 80, height: 58, color: rgb(0.97, 0.99, 1), borderColor: border, borderWidth: 1 });
  page.drawText(`Overall: ${snapshot.overall.status}`, { x: 54, y: y - 5, size: 11, font: bold, color: navy });
  page.drawText(`Total: ${snapshot.overall.totalMarks ?? "-"} / ${snapshot.overall.maximumMarks ?? "-"}`, { x: 210, y: y - 5, size: 10, font: regular, color: navy });
  page.drawText(`Percentage: ${snapshot.overall.percentage ?? "-"}`, { x: 390, y: y - 5, size: 10, font: regular, color: navy });
  page.drawText(`Grade: ${snapshot.overall.grade ?? "-"}`, { x: 54, y: y - 27, size: 10, font: regular, color: navy });
  page.drawText(`Promotion eligible: ${snapshot.overall.promotionEligible ? "Yes" : "No"}`, { x: 210, y: y - 27, size: 10, font: regular, color: navy });
  y -= 82;
  if (snapshot.attendance) {
    page.drawText("Attendance", { x: 44, y, size: 11, font: bold, color: navy });
    y -= 18;
    page.drawText(`Working days: ${snapshot.attendance.eligibleDays}   Marked: ${snapshot.attendance.markedDays}   Present: ${snapshot.attendance.presentDays}   Absent: ${snapshot.attendance.absentDays}   Attendance: ${snapshot.attendance.percentage ?? "-"}%`, { x: 44, y, size: 9, font: regular, color: navy });
    y -= 46;
  }
  const signatureY = Math.max(75, y - 30);
  const gap = (width - 88) / snapshot.signatureLabels.length;
  snapshot.signatureLabels.forEach((label, index) => {
    const x = 44 + index * gap;
    page.drawLine({ start: { x, y: signatureY + 16 }, end: { x: x + Math.min(120, gap - 16), y: signatureY + 16 }, color: muted, thickness: 0.6 });
    page.drawText(pdfSafe(label), { x, y: signatureY, size: 8, font: regular, color: muted });
  });
  page.drawText(`Generated by JinaCampus on ${snapshot.report.generatedAt}`, { x: 44, y: 34, size: 7, font: regular, color: muted });
  return Buffer.from(await document.save({ useObjectStreams: true }));
}
