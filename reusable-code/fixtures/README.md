# Boundary fixtures

`SEED-001` tests G0 provenance failure. The registry revision `bf9e46be2ccd6cf2ebf4db047e418bb5d51d7ad2` did not resolve in `neohack2023/gef-monolithic-` during the 2026-08-16 live run, so validation terminates BLOCKED before admission.

`SEED-002` tests rewrite-required rejection. Live source was resolved at `fawadqureshi007/Mobile-hack@a8e19e44ab74d2c6f20edcf0d06d1b1d875d9ecc`, file `modules/apk_analyzer.py`; repository LICENSE is MIT. The harvested subprocess wrapper remains REWRITE_REQUIRED because the existing function does not satisfy the declared hardened adapter boundary. CODE-REUSE-05 must reject it until rewritten and revalidated.
