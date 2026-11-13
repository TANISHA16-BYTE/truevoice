import Placeholder from "@/components/Placeholder";

export default function SubmitPage() {
  return (
    <Placeholder
      title="Submit draft"
      summary="Paste a draft to see what needs fixing before it goes to a reviewer."
      next="Next step: a text box that sends the draft to /api/drafts and shows the findings."
    />
  );
}