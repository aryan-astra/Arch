# Resources, archive, and community — plan (design only, no uploads)

> No files uploaded, no buckets created, no IA interaction performed.
> `internetarchive` tooling is NOT installed (checked 2026-09-21); install
> only when the archival phase begins, and only the official package.
> Implemented this phase: `src/lib/resources.ts` (validate → sha256 →
> canonical filename → metadata gate) with tests, plus `resources`,
> `resource_ratings`, community, and `contributor_scores` tables in migration
> `20260921000000` (unapplied).

## Storage layers

- **R2 = hot/optimized delivery.** Optimized copies + previews of frequently
  accessed files only. Promotion/eviction is deterministic from analytics
  (access count, unique users, recency, downloads) with normalized popularity
  so one user cannot pin a file hot forever. Cold files leave R2; the
  authoritative copy always lives elsewhere.
- **Internet Archive = cold/authoritative.** Originals + metadata. First design
  an `ArchiveProvider` abstraction (`uploadOriginal`, `verifyExistence`,
  `getMetadata`, `getFile`, `verifyChecksum`, `getCanonicalId`) so no
  IA-specific URL ever reaches the UI or database as a primary key.
- Students see **Download** through Arch-controlled endpoints with cache
  headers + immutable identifiers. Raw R2/IA URLs never ship to clients.

## PDF pipeline (upload path)

Validate type (`%PDF-` magic) + size (≤25 MB) → SHA-256 → exact-hash dedupe
(already-exists points at the existing resource; no duplicates) → metadata
validation (year, unit, subject, uploader required) → canonical filename
**YEAR first, UNIT second** (`src/lib/resources.ts:canonicalFilename`) →
metadata row → archive original → generate optimized copy/preview only when
meaningful → track analytics → promote on popularity.

No fuzzy-duplicate requirement for v1. No copyright-violating or
unauthorized material; ownership/takedown fields live on the resource row.

## Quality and moderation

Ratings (1–5 + usefulness + reports) per account per resource. Negative
consensus auto-flags and can remove from discovery, but destructive action is
moderation-governed: quarantine/soft-delete first, audit trail never
destroyed, admin has final authority and every admin action is logged
(`admin_actions`).

## Community

Submissions (timetable/rooms/dates/events) are community-scoped (B.Tech →
section/batch) and NEVER override official source fields — official data
stays authoritative; community data renders as community data with trust
state. Corrections are new rows, not edits; votes decide visibility;
everything auditable (`community_submissions`, `community_corrections`,
`submission_votes`). Reputation math is specified separately
(`reputation-design.md`) and stays non-production until reviewed.
