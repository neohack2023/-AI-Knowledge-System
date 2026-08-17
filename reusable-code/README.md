# AIOS Reusable Code Store

Git-backed executable store for CODE-REUSE-05. Repository presence does not imply REUSABLE or canon status.

Admission requires an evidence-bound CODE-REUSE-04 ValidationReceipt for the exact candidate digest and source revision.

Layout:
- `units/<chunk-id>/` admitted VERIFIED units
- `anti-patterns/<chunk-id>/` negative implementation knowledge
- `registry/manifest.schema.json` unit schema
- `tools/admission_verifier.py` fail-closed admission gate
- `tools/repository_intake.py` read-only pinned-revision CODE-REUSE-02 repository intake adapter
- `fixtures/` boundary proof inputs and results
