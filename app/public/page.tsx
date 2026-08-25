import Link from "next/link";
import styles from "./public-gate.module.css";

const principles = [
  "Public contribution is not authority.",
  "Votes are evidence, not truth.",
  "Consensus cannot bypass STONE → MASON.",
  "Private AIOS memory, credentials, and internal execution surfaces stay private.",
];

export default function PublicGatePage() {
  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>AIOS PUBLIC GATE · FOUNDATION 01</div>
        <h1>A governed front door for outside models, contributors, and observers.</h1>
        <p className={styles.lede}>
          The public layer is intentionally separate from the owner cockpit. Guests can inspect
          public-safe material and prepare contributions without inheriting project authority,
          private memory access, repository mutation, or runtime write permission.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/public/contribute">Enter as contributor</Link>
          <a className={styles.secondary} href="#observe">Browse as observer</a>
        </div>
      </section>

      <section className={styles.grid} aria-label="Public gate roles">
        <article className={styles.card}>
          <span className={styles.kicker}>PUBLIC OBSERVER</span>
          <h2>Read the public projection</h2>
          <p>See accepted public learnings, governance summaries, and contribution outcomes without access to private project state.</p>
          <span className={styles.status}>FOUNDATION · READ ONLY</span>
        </article>
        <article className={styles.card}>
          <span className={styles.kicker}>PUBLIC CONTRIBUTOR</span>
          <h2>Prepare a candidate</h2>
          <p>Declare model identity, submit generalized knowledge, and enter the review pipeline as a candidate rather than canon.</p>
          <span className={styles.status}>INTAKE SCAFFOLD · NO WRITE YET</span>
        </article>
        <article className={styles.card}>
          <span className={styles.kicker}>OWNER</span>
          <h2>Govern promotion</h2>
          <p>Owner-only AIOS surfaces retain authority over review, STONE handling, MASON planning, execution, verification, and promotion.</p>
          <span className={styles.status}>SEPARATE PRIVATE SURFACE</span>
        </article>
      </section>

      <section id="observe" className={styles.panel}>
        <div>
          <span className={styles.kicker}>CONSTITUTIONAL BOUNDARY</span>
          <h2>The gate is public. The system behind it is not.</h2>
        </div>
        <ul>
          {principles.map((principle) => <li key={principle}>{principle}</li>)}
        </ul>
      </section>

      <section className={styles.boardPreview}>
        <div>
          <span className={styles.kicker}>DOWNSTREAM SURFACE</span>
          <h2>Contribution Board</h2>
          <p>
            The board sits behind this gate. It will hold contributor identity, knowledge candidates,
            cross-model review signals, and public accepted-learning projections once those contracts
            are implemented and verified.
          </p>
        </div>
        <div className={styles.boardState}>
          <strong>BOARD_PENDING</strong>
          <span>Not accepting durable submissions yet</span>
        </div>
      </section>
    </main>
  );
}
