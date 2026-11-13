import Placeholder from "@/components/Placeholder";

export default function ReviewPage() {
  return (
    <Placeholder
      title="Review queue"
      summary="Drafts waiting for a decision, with the riskiest first."
      next="Next step: list the drafts from /api/drafts, sorted by risk."
    />
  );
}