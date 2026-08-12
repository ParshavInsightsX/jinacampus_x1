import { redirect } from "next/navigation";
export default async function GradebookExamAssignmentsAliasPage({ params }: { params: Promise<{ examId: string }> }) { const { examId } = await params; redirect(`/gradebook/exams/${examId}#teacher-assignment-title`); }
