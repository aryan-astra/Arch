# Arch — Cloudflare R2 Question-Paper CLI Workflow

> Status: preparation only. No bucket has been created, no data uploaded, no
> credentials stored. This doc is the reproducible CLI path for future work.
> Sources: Cloudflare R2 official docs (pricing + Wrangler commands, checked
> 2026-09-21). Re-verify before provisioning — pricing changes.

## Cost guard (verified 2026-09-21, official docs)

R2 monthly free tier (Standard storage only):

| Resource | Free allowance |
|---|---|
| Storage | 10 GB-month |
| Class A ops (PUT/POST/DELETE/LIST) | 1 million |
| Class B ops (GET/HEAD) | 10 million |
| Egress | $0 (always free) |

Beyond free: storage $0.015/GB-month, Class A $4.50/M, Class B $0.36/M.
Question-paper PDFs (a few thousand files, MBs each, read-heavy) fit easily.

> **Open cost question (UNVERIFIED, third-party claim):** binding an R2 bucket
> to a deployed Worker / Pages Function may require the Workers Paid plan
> (~$5/mo). Do NOT design the serving path until this is confirmed against
> current official Workers limits. CLI-only and S3-compatible access do not
> need it.

## Tool choice

| Task | Tool | Why |
|---|---|---|
| Bucket create/list, single object put/get/delete | **Wrangler** | Minimal setup, OAuth login, no keys |
| Bulk migration / directory sync later | **rclone** | Wrangler caps single uploads at 315 MB and one object at a time |

Do NOT add an R2 SDK dependency to the app for one-off CLI work.

## Workflow

Wrangler is not installed in this repo's toolchain yet. Install on demand:

```bash
npm install -g wrangler
wrangler --version
```

Authenticate (browser OAuth — no API tokens, nothing to commit):

```bash
wrangler login
wrangler whoami
```

Select the account (if several):

```bash
# list, then export the account id for subsequent commands
wrangler r2 bucket list
```

Verify-or-create the question-paper bucket (private by default — keep it so):

```bash
BUCKET=<bucket-name>   # e.g. arch-question-papers (placeholder — decide later)

wrangler r2 bucket list | grep "^${BUCKET}$" \
  || wrangler r2 bucket create "${BUCKET}"

wrangler r2 bucket list
```

Upload one paper, then verify (checksum compare, not eyeballing):

```bash
FILE=<local/path.pdf>          # placeholder
KEY=<papers/2025/subject.pdf>  # placeholder key convention

wrangler r2 object put "${BUCKET}/${KEY}" --file "${FILE}" \
  --content-type application/pdf

wrangler r2 object get "${BUCKET}/${KEY}" --file /tmp/verify.pdf
# compare hashes of "${FILE}" and /tmp/verify.pdf before deleting the copy
```

List/inspect (Class A LIST ops — batch, don't poll):

```bash
wrangler r2 object list "${BUCKET}" --prefix "papers/"  # adjust flags to wrangler version
```

Delete only when explicitly requested (destructive — confirm twice):

```bash
wrangler r2 object delete "${BUCKET}/${KEY}"
```

## Rules

- Private bucket. No public access, no custom domain, until the serving design
  (and the Workers-plan question above) is resolved.
- No R2 credentials in source, docs, or shell history files — Wrangler OAuth
  leaves nothing committable.
- No bulk uploads in this phase; when migration comes, prefer rclone with
  `--dry-run` first.
- Every future provisioning step must re-check the pricing page and record the
  date checked.
