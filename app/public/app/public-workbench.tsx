"use client";

import Link from "next/link";
import { BookOpen, CheckCircle2, Compass, Database, ExternalLink, LockKeyhole, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./public-workbench.module.css";

type Topic = "All" | "Governance" | "Retrieval" | "Reliability" | "Contribution";

type Learning = {
  label: string;
  title: string;
  summary: string;
  practical: string;
  topic: Exclude<Topic, "All">;
};

const learnings: Learning[] = [
  {
    label: "AUTHORITY SEPARATION",
    title: "Knowing is not permission",
    summary: "Memory, retrieval, confidence, recommendation, and execution authority are different things. A system can know what should happen without being authorized to make it happen.",
    practical: "Before an action, identify who owns the truth, who may decide, and who may write.",
    topic: "Governance",
  },
  {
    label: "CONTEXT MINIMALITY",
    title: "Use the smallest useful context",
    summary: "More context is not automatically better context. Load the smallest trustworthy packet that materially improves the task, then stop.",
    practical: "Start with exact scope, current handoff, and task-specific evidence. Expand only when a real gap requires it.",
    topic: "Retrieval",
  },
  {
    label: "SOURCE-SPECIFIC TRUTH",
    title: "Different sources can own different facts",
    summary: "A memory store, runtime control plane, repository, and research source may each be authoritative for different domains. Recency alone does not decide authority.",
    practical: "Resolve the truth domain first. Treat disagreement as drift to investigate, not permission to blend sources.",
    topic: "Governance",
  },
  {
    label: "PROVENANCE",
    title: "Keep the trail attached",
    summary: "Useful knowledge should retain where it came from, what changed it, and which authority claims travel with it. Transformations should not erase lineage.",
    practical: "Preserve source identity and transformation history before durable promotion or consequential action.",
    topic: "Reliability",
  },
  {
    label: "FAIL-CLOSED FIDELITY",
    title: "Do not invent missing canon",
    summary: "When a task depends on exact established rules, missing source material is a reason to narrow the answer, not fabricate continuity.",
    practical: "If fidelity-critical knowledge cannot be verified, mark the gap and continue only with supported material.",
    topic: "Reliability",
  },
  {
    label: "PUBLIC CONTRIBUTION",
    title: "Evidence is not canon",
    summary: "Outside suggestions, votes, reviews, and consensus can be valuable evidence without automatically becoming accepted truth or write authority.",
    practical: "Route contributions through candidate review. Promotion remains a separate governed decision.",
    topic: "Contribution",
  },
];

const topics: Topic[] = ["All", "Governance", "Retrieval", "Reliability", "Contribution"];

export default function PublicWorkbench() {
  const [topic, setTopic] = useState<Topic>("All");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return learnings.filter((item) => {
      const topicMatch = topic === "All" || item.topic === topic;
      const textMatch = !needle || [item.label, item.title, item.summary, item.practical, item.topic].join(" ").toLowerCase().includes(needle);
      return topicMatch && textMatch;
    });
  }, [query, topic]);

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/public" className={styles.brand} aria-label="AIOS public entrance">
          <span className={styles.brandMark}><Compass size={18} /></span>
          <span><strong>AIOS</strong><small>PUBLIC WORKBENCH</small></span>
        </Link>
        <nav className={styles.nav} aria-label="Public workbench navigation">
          <a href="#knowledge">Knowledge</a>
          <a href="#boundary">Boundary</a>
          <Link href="/public/contribute">Contribute</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>Explore the public layer of a governed AI knowledge system.</h1>
          <p>
            Browse reusable lessons, inspect the rules that keep public knowledge separate from private authority,
            and prepare contributions without crossing into owner-only memory or execution surfaces.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href="#knowledge">Browse knowledge</a>
            <Link className={styles.secondary} href="/public/contribute">Prepare a contribution</Link>
          </div>
        </div>
        <div className={styles.signalPanel} aria-label="Public boundary status">
          <div className={styles.signalRow}><CheckCircle2 size={16} /><span>Public knowledge</span><strong>READ ONLY</strong></div>
          <div className={styles.signalRow}><ShieldCheck size={16} /><span>Contributor intake</span><strong>VALIDATED</strong></div>
          <div className={styles.signalRow}><LockKeyhole size={16} /><span>Durable writes</span><strong>DISABLED</strong></div>
          <div className={styles.signalFoot}>PUBLIC VIEW ≠ SYSTEM AUTHORITY</div>
        </div>
      </section>

      <section className={styles.quickRail} aria-label="Public app destinations">
        <Link href="/public/knowledge" className={styles.quickItem}><BookOpen size={18} /><span><strong>Knowledge library</strong><small>Read the curated projection</small></span><ExternalLink size={14} /></Link>
        <Link href="/public/contribute" className={styles.quickItem}><Users size={18} /><span><strong>Contributor intake</strong><small>Validate a candidate locally</small></span><ExternalLink size={14} /></Link>
        <a href="#boundary" className={styles.quickItem}><LockKeyhole size={18} /><span><strong>Boundary model</strong><small>See what stays private</small></span><ExternalLink size={14} /></a>
      </section>

      <section id="knowledge" className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Public knowledge</h2>
            <p>Six reusable AIOS lessons, presented as public-safe guidance rather than private memory.</p>
          </div>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search public knowledge" aria-label="Search public knowledge" />
          </div>
        </div>

        <div className={styles.filters} aria-label="Knowledge topics">
          {topics.map((item) => (
            <button key={item} type="button" onClick={() => setTopic(item)} className={topic === item ? styles.filterActive : styles.filterButton}>{item}</button>
          ))}
        </div>

        <div className={styles.knowledgeList}>
          {visible.map((item, index) => (
            <article key={item.title} className={styles.learning}>
              <div className={styles.learningIndex}>{String(index + 1).padStart(2, "0")}</div>
              <div className={styles.learningBody}>
                <div className={styles.learningMeta}><span>{item.label}</span><span>{item.topic}</span></div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <div className={styles.rule}><Sparkles size={15} /><span><strong>Practical rule:</strong> {item.practical}</span></div>
              </div>
            </article>
          ))}
          {visible.length === 0 && <div className={styles.emptyState}>No public knowledge matches that filter.</div>}
        </div>
      </section>

      <section id="boundary" className={styles.boundarySection}>
        <div className={styles.boundaryIntro}>
          <LockKeyhole size={24} />
          <h2>The public app is a projection, not a mirror.</h2>
          <p>The useful part is exposed. The dangerous or private part stays on the other side of the wall.</p>
        </div>
        <div className={styles.boundaryGrid}>
          <div>
            <span className={styles.boundaryLabel}>PUBLIC</span>
            <ul>
              <li>Curated AIOS operating lessons</li>
              <li>Public-safe architecture explanations</li>
              <li>Local contribution validation</li>
              <li>Public release status and outcomes</li>
            </ul>
          </div>
          <div>
            <span className={styles.boundaryLabel}>PRIVATE / OWNER ONLY</span>
            <ul>
              <li>Private memory and personal context</li>
              <li>Internal Notion and Drive source bodies</li>
              <li>Credentials, tokens, and runtime bindings</li>
              <li>Repository mutation and governed write authority</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div>
          <Database size={22} />
          <h2>Have something worth adding?</h2>
          <p>Prepare a candidate, validate it against the public schema, and keep it explicitly outside canon until review.</p>
        </div>
        <Link className={styles.primary} href="/public/contribute">Open contributor intake</Link>
      </section>

      <footer className={styles.footer}>
        <span>AIOS PUBLIC WORKBENCH</span>
        <span>READ ONLY · NO EXECUTION AUTHORITY · NO DURABLE SUBMISSION</span>
      </footer>
    </main>
  );
}
