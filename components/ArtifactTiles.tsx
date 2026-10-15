import Link from "next/link";
import { artifactTiles } from "@/lib/pipeline";
import type { PhaseId } from "@/lib/pipeline";

/**
 * A phase's artifacts as a row of square tiles, sitting directly under the page
 * header — before any heading of the read. Each tile opens that artifact's own
 * page; phases with no artifacts render nothing.
 */
export function ArtifactTiles({ projectId, phaseId }: { projectId: string; phaseId: PhaseId }) {
  const tiles = artifactTiles(phaseId);
  if (!tiles.length) return null;
  return (
    <nav aria-label="Artifacts" className="mb-8 flex flex-wrap gap-3">
      {tiles.map((t) => (
        <Link
          key={t.id}
          href={`/project/${projectId}/${phaseId}/${t.path}`}
          className="flex aspect-square w-24 flex-col items-center justify-center gap-2 rounded-xl border border-edge bg-panel p-2 text-center transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-accent/5 sm:w-28"
        >
          <span className="text-2xl" aria-hidden>{t.icon}</span>
          <span className="text-[12px] font-medium leading-tight text-fg">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
