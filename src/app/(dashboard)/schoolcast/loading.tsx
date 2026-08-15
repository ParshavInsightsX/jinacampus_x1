import { LoadingState } from "@/components/ui/empty-state";

export default function SchoolCastLoading() {
  return (
    <LoadingState
      title="Loading SchoolCast..."
      description="Preparing the communication workspace for the active school context."
    />
  );
}