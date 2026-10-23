<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- The Cormyr Web site is the original static app in public/cormyr/; / redirects there. Edit those files directly; why: faithful migration without rewrite.
- The authenticated season-two extension lives in TanStack routes while the original archive remains static; this preserves the complete migrated app and supports managed authentication.
- Player and house permissions are enforced by RLS and transactional database functions; selecting a house is never a permission grant.
- Folder synchronization uses a server-only fetch adapter, leased durable mappings, transactional imports and a versioned outbox; each mapping requires explicit admin privacy review and runtime authorization, because archive association is not permission.
- Drive reconciliation uses one authenticated managed hourly callback plus admin execution; files are conditionally updated with ETag and read back before confirmation, because external work cannot be simulated or trusted without evidence.
- Official roster affiliation is stored separately from authorized memberships; this permits unlinked player registration without granting identity access.
