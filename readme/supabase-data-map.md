# Supabase Data Map

This project writes user-related data into several `public` tables in Supabase/Postgres:

- `public.user_profiles` stores the main user profile record keyed by email.
- `public.user_legal_consents` stores terms/privacy acceptance for the current account.
- `public.user_data_snapshots` stores periodic full student snapshots.
- `public.user_attendance_subjects` stores normalized attendance rows for each snapshot.
- `public.user_mark_items` stores normalized mark/test rows for each snapshot.
- `public.study_material_votes` stores per-user votes for study material files.
- `public.study_material_share_events` stores share events for study material files.
- `public.study_material_submissions` stores uploaded PDF metadata and admin review state.
- `public.contributors` stores approved contributor accounts.
- `public.contributor_applications` stores contributor applications and review state.

Where the app writes them:

- Login/session identity is handled by the auth server, not Supabase.
- `POST /api/legal/accept` writes `user_legal_consents` after ensuring `user_profiles` exists.
- `POST /api/user/snapshot` writes `user_data_snapshots`, `user_attendance_subjects`, `user_mark_items`, and updates `user_profiles`.
- Study material upload/review routes write `study_material_submissions`.
- Contributor application routes write `contributor_applications`.
- Vote/share routes write `study_material_votes` and `study_material_share_events`.

If you only see `study_material_votes` and `study_material_share_events` in Supabase, the user-storage migration has not been applied in that project yet.
