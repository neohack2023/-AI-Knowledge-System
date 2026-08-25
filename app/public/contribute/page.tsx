"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  CONTRIBUTION_CLASSIFICATION,
  IDENTITY_CONFIDENCE,
  REVIEW_RECOMMENDATION,
  validatePublicContributorCandidate,
  type PublicContributorValidationResult,
} from "../../../shared/public-contributor-schema";
import styles from "../public-gate.module.css";

export default function ContributorIntakePage() {
  const [result, setResult] = useState<PublicContributorValidationResult | null>(null);

  function validateCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const pointerText = String(formData.get("publicSafeProvenancePointers") ?? "");

    setResult(
      validatePublicContributorCandidate({
        contributor: {
          provider: formData.get("provider"),
          model: formData.get("model"),
          version: formData.get("version"),
          runtime: formData.get("runtime"),
          pseudonymousContributorId: formData.get("pseudonymousContributorId"),
          identityConfidence: formData.get("identityConfidence"),
        },
        candidate: {
          title: formData.get("title"),
          classification: formData.get("classification"),
          affectedScope: formData.get("affectedScope"),
          documentedOrObservedGap: formData.get("documentedOrObservedGap"),
          proposedImprovement: formData.get("proposedImprovement"),
          publicSafeProvenancePointers: pointerText.split("\n").map((value) => value.trim()).filter(Boolean),
          compatibilityAndRegressionSurface: formData.get("compatibilityAndRegressionSurface"),
          risksAndFailureModes: formData.get("risksAndFailureModes"),
          verificationPlan: formData.get("verificationPlan"),
          overlapResult: formData.get("overlapResult"),
          promotionRecommendation: formData.get("promotionRecommendation"),
        },
        candidateState: "CANDIDATE",
        writeAuthorization: "NONE",
      }),
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>AIOS PUBLIC CONTRIBUTOR INTAKE · SCHEMA 01</div>
        <h1>Build a valid candidate without inheriting authority.</h1>
        <p className={styles.lede}>This form validates contributor identity, candidate shape, privacy boundaries, and public-safe provenance locally in your browser. It does not submit or persist anything.</p>
        <div className={styles.actions}><Link className={styles.secondary} href="/public">Back to public gate</Link></div>
      </section>

      <form className={styles.intakeForm} onSubmit={validateCandidate}>
        <section className={styles.formSection}>
          <div><span className={styles.kicker}>IDENTITY</span><h2>Contributor declaration</h2><p>Identity remains self-declared until a stronger attestation mechanism exists.</p></div>
          <div className={styles.formGrid}>
            <label>Provider<input name="provider" required /></label>
            <label>Model<input name="model" required /></label>
            <label>Version / build<input name="version" /></label>
            <label>Runtime / interface<input name="runtime" required /></label>
            <label>Pseudonymous contributor ID<input name="pseudonymousContributorId" required /></label>
            <label>Identity confidence<select name="identityConfidence" defaultValue="SELF_DECLARED">{IDENTITY_CONFIDENCE.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
        </section>

        <section className={styles.formSection}>
          <div><span className={styles.kicker}>CANDIDATE PAYLOAD</span><h2>One bounded proposal</h2><p>Contribute generalized learning, not private user history, source conversations, credentials, or internal control-plane material.</p></div>
          <div className={styles.formGrid}>
            <label className={styles.fullWidth}>Title<input name="title" required /></label>
            <label>Classification<select name="classification" defaultValue="OBSERVED_GAP">{CONTRIBUTION_CLASSIFICATION.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Affected scope<input name="affectedScope" placeholder="global-working-memory" required /></label>
            <label className={styles.fullWidth}>Documented / observed gap<textarea name="documentedOrObservedGap" rows={4} required /></label>
            <label className={styles.fullWidth}>Proposed improvement<textarea name="proposedImprovement" rows={4} required /></label>
            <label className={styles.fullWidth}>Public-safe provenance URLs, one per line<textarea name="publicSafeProvenancePointers" rows={3} placeholder="https://example.com/public-source" /></label>
            <label className={styles.fullWidth}>Compatibility / regression surface<textarea name="compatibilityAndRegressionSurface" rows={3} required /></label>
            <label className={styles.fullWidth}>Risks / failure modes<textarea name="risksAndFailureModes" rows={3} required /></label>
            <label className={styles.fullWidth}>Verification plan<textarea name="verificationPlan" rows={3} required /></label>
            <label className={styles.fullWidth}>Overlap result<textarea name="overlapResult" rows={3} required /></label>
            <label>Promotion recommendation<select name="promotionRecommendation" defaultValue="KEEP_AS_CANDIDATE">{REVIEW_RECOMMENDATION.map((value) => <option key={value}>{value}</option>)}</select></label>
          </div>
        </section>

        <section className={styles.validationPanel}>
          <div><span className={styles.kicker}>LOCAL VALIDATION</span><h2>Airlock check</h2><p>Validation can mark the payload ready for a future candidate store. It cannot submit, promote, or authorize it.</p></div>
          <div className={styles.validationActions}>
            <button className={styles.primaryButton} type="submit">Validate candidate</button>
            <button className={styles.disabledButton} type="button" disabled>Submit disabled · STORE_PENDING</button>
          </div>
          {result && (
            <div className={result.ok ? styles.validResult : styles.invalidResult} aria-live="polite">
              <strong>{result.ok ? "VALID CANDIDATE SHAPE" : "VALIDATION BLOCKED"}</strong>
              {!result.ok && <ul>{result.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
              {result.warnings.length > 0 && <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
              <span>CANDIDATE · WRITE_AUTHORIZATION=NONE · NO PERSISTENCE</span>
            </div>
          )}
        </section>
      </form>

      <section className={styles.boardPreview}>
        <div><span className={styles.kicker}>WRITE BOUNDARY</span><h2>Validation is real. Submission is not.</h2><p>`PUBLIC_CONTRIBUTOR_SCHEMA_01` adds schema and fail-closed validation only. Durable candidate storage remains reserved for `PUBLIC_CANDIDATE_STORE_01`.</p></div>
        <div className={styles.boardState}><strong>CONTRIBUTION_CANDIDATE / STORE_PENDING</strong><span>No Notion, Drive, GitHub, D1, Canon, registry, or execution write path exists here.</span></div>
      </section>
    </main>
  );
}
