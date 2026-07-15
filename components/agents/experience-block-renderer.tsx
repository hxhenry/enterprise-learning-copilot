import { AnalyticsSummaryCard } from "@/components/learning/analytics-summary-card";
import { CertificationProgressCard } from "@/components/learning/certification-progress-card";
import { SourceList } from "@/components/learning/source-list";
import type { ExperienceBlock } from "@/lib/schemas/events";

type ExperienceBlockRendererProps = {
  blocks: ExperienceBlock[];
};

export function ExperienceBlockRenderer({
  blocks,
}: ExperienceBlockRendererProps) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block) => {
        switch (block.kind) {
          case "certification-progress":
            return (
              <CertificationProgressCard
                key={block.id}
                block={block}
              />
            );

          case "analytics-summary":
            return (
              <AnalyticsSummaryCard
                key={block.id}
                block={block}
              />
            );

          case "sources":
            return <SourceList key={block.id} block={block} />;
        }
      })}
    </div>
  );
}