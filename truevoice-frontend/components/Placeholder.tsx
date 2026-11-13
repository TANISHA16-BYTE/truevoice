// Temporary page body for screens that are built later.
export default function Placeholder({
  title,
  summary,
  next,
}: {
  title: string;
  summary: string;
  next: string;
}) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-3 text-[var(--tv-muted)]">{summary}</p>
      <p className="mt-8 rounded-md border border-dashed border-[var(--tv-edge)] p-4">
        This screen is not built yet. {next}
      </p>
    </div>
  );
}