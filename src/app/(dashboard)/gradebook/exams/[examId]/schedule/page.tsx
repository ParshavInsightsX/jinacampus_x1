import { redirect } from "next/navigation";
export default async function GradebookExamScheduleAliasPage({ params }: { params: Promise<{ examId: string }> }) { const { examId } = await params; redirect(`/gradebook/exams/${examId}#exam-schedule-title`); }
