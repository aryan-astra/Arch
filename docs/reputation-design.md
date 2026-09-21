# Contributor reputation — design inputs (NOT an implementation)

> The scoring algorithm is intentionally unspecified here. This doc records
> what the algorithm must account for; the math lands only after separate
> review and never becomes a silent production dependency.

## Score properties

- Range `[0,1]`, high precision (`numeric(6,5)` in `contributor_scores`).
- Stable: no extreme scores without substantial evidence; quantity of
  low-value content must not move the needle.
- Submission weight > review weight; both configurable per action type.

## Required inputs

- Contribution events (submission, correction, verification, rating) with
  weights per kind.
- Verification outcomes (confirmed / contested / removed) per contribution.
- Disagreement handling: competing submissions resolved by evidence-weighted
  votes, not raw counts.
- Decay: inactivity and aging evidence reduce confidence over time.
- Source reliability: track record of the contributor's past claims.

## Abuse resistance (must-address list)

- Sybil / account farming: minimum evidence before any reputation; rate
  limits on new-account influence; device/behavioral signals where available.
- Mutual-confirmation rings: discount correlated voter clusters.
- Mass-rating attacks: per-target velocity caps; normalized popularity.
- False information: penalties on moderator-confirmed bad content, with
  appeal path and recovery (reputation can rebuild through verified work).
- Cold start: newcomers start unscored (NULL), not zero — UI must render
  "unproven" distinctly from "untrusted".

## Confidence

- Store component breakdown (`components` JSON) alongside the score so any
  decision is explainable.
- Where useful, expose intervals, not points.
- No public leaderboard until the algorithm is reviewed and stable.

## Storage

`contributor_scores(account_id PK, score NULLABLE, components JSONB,
updated_at)`. NULL = unproven. Writes happen only from reviewed,
audited jobs — never directly from client requests.
