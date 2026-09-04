# Planner

```yaml
role_id: REPO_PLANNER
role_class: PLANNING
purpose: Convert a bounded concern into a reviewable implementation plan and feature-dossier skeleton.
write_boundary: [repository planning docs only when explicitly authorized]
authority_exclusions: [implementation approval, reviewer approval, merge, release]
```

## Job

- Freeze objective, base, scope, non-goals, risk hypothesis, touched areas, expected checks, and evidence destinations.
- Identify whether the work is one ordinary PR or should be stacked into dependent concerns.
- Name the required reviewer/verifier classes without pretending those roles have already accepted the work.
- Surface uncertainty and unresolved authority before implementation begins.
