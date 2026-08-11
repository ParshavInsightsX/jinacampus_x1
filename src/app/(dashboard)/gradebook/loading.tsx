export default function GradebookLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading GradeBook">
      <div className="h-28 animate-pulse rounded-lg border border-campus-border bg-white" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse rounded-lg border border-campus-border bg-white" />)}
      </div>
      <span className="sr-only">Loading GradeBook...</span>
    </div>
  );
}
