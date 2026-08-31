# Permanent deletion runbook

Prefer suspension for access incidents and uncertain cases. Permanent deletion is for confirmed account lifecycle or compliance outcomes and cannot be undone.

1. Open **System → Permanent deletion**, choose a user or workspace UUID, enter the business reason, and generate an impact preview.
2. Review every count and warning. Platform-owner users, their workspace, non-active workspaces, and users that still own a workspace are rejected server-side.
3. Type the exact case-sensitive phrase and submit before the single-use challenge expires. The impact digest is recomputed immediately; changed data forces a new preview.
4. Follow the durable stages. Work is cancelled and the workspace is suspended while deletion remains reversible. The worker then marks the job irreversible before removing tenant rows. Supabase Auth deletion is the final external step.
5. Cancellation is available only before `irreversibleAt`. It restores an active workspace. Failed jobs can be retried with a new audited reason and resume completed stages without repeating them.

Workspace Auth-user deletion is opt-in. Only users with no remaining workspace memberships are removed. The allowlisted platform owner is never eligible. Provider data-deletion requests are visible under **System → Provider deletion requests** without signed requests or confirmation codes.

Test deletion only against disposable staging users/workspaces. Before production use, confirm the database migration is applied, the worker is healthy, Valkey is reachable, Supabase service-role access is configured, and the exact owner UUID allowlist is present in both web and worker environments.
