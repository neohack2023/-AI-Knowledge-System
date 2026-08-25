import Link from "next/link";
import styles from "../public-gate.module.css";

const learnings = [
  {
    label: "AUTHORITY SEPARATION",
    title: "Knowing is not permission",
    summary:
      "Memory, retrieval, confidence, recommendation, and execution authority are different things. A system can know what should happen without being authorized to make it happen.",
    practical:
      "Before an action, identify who owns the truth, who may decide, and who may write. Do not let a good answer silently become permission.",
  },
  {
    label: "CONTEXT MINIMALITY",
    title: "Use the smallest useful context",
    summary:
      "More context is not automatically better context. Load the smallest trustworthy packet that materially improves the task, then stop.",
    practical:
      "Start with the exact scope, current handoff, and task-specific evidence. Expand only when a real gap requires it.",
  },
  {
    label: "SOURCE-SPECIFIC TRUTH",
    title: "Different sources can own different facts",
    summary:
      "A memory store, runtime control plane, repository, and research source may each be authoritative for different domains. Recency alone does not decide authority.",
    practical:
      "Resolve the truth domain first. Treat disagreement as drift to investigate, not an excuse to blend sources into one synthetic answer.",
  },
  {
    label: "PROVENANCE",
    title: "Keep the trail attached",
    summary:
      "Useful knowledge should retain where it came from, what changed it, and which authority claims travel with it. Transformations should not erase lineage.",
    practical:
      "Preserve source identity and transformation history before promoting a derived claim into durable knowledge or using it for consequential action.",
  },
  {
    label: "FAIL-CLOSED FIDELITY",
    title: "Do not invent missing canon",
    summary:
      "When a task depends on exact established rules, missing source material is a reason to narrow the answer, not fabricate continuity.",
    practical:
      "If fidelity-critical knowledge cannot be verified, clearly mark the gap and continue only with the portions that can be supported safely.",
  },
  {
    label: "PUBLIC CONTRIBUTION",
    title: "Evidence is not canon",
    summary:
      "Outside suggestions, votes, reviews, and consensus can be valuable evidence without automatically becoming accepted truth or write authority.",
    practical:
      "Route contributions through candidate review. Promotion should remain a separate governed decision with its own verification and authorization.",
  },
];

export default function PublicKnowledgePage() {
  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>AIOS PUBLIC KNOWLEDGE · PROJECTION 01</div>
        <h1>General lessons from building a governed AI memory system.</h1>
        <p className={styles.lede}>
          These are public-safe projections of established AIOS operating principles. They are
          intentionally separated from private memory, project handoffs, credentials, internal source
          packets, and write-capable controls.
        </p>
        <div className={styles.actions}>
          <Link className={styles.secondary} href="/public">Back to public gate</Link>
          <Link className={styles.secondary} href="/public/contribute">Prepare a contribution</Link>
        </div>
      </section>

      <section className={styles.grid} aria-label="Public AIOS knowledge cards">
        {learnings.map((learning) => (
          <article className={styles.card} key={learning.title}>
            <span className={styles.kicker}>{learning.label}</span>
            <h2>{learning.title}</h2>
            <p>{learning.summary}</p>
            <p><strong>Practical rule:</strong> {learning.practical}</p>
            <span className={styles.status}>CURATED · READ ONLY</span>
          </article>
        ))}
      </section>

      <section className={styles.panel}>
        <div>
          <span className={styles.kicker}>PUBLICATION BOUNDARY</span>
          <h2>Projection, not a mirror of private memory.</h2>
        </div>
        <ul>
          <li>No private conversations or personal context are included.</li>
          <li>No internal Notion, Drive, repository-control, credential, or runtime-token material is exposed.</li>
          <li>No public page grants execution or destination-write authority.</li>
          <li>Future public learnings should be added only after public-safety and provenance review.</li>
        </ul>
      </section>
    </main>
  );
}
