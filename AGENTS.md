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
- Drive reconciliation uses one authenticated managed hourly callback plus admin execution; provider ETags guard overwrites, and missing ETags require append-only content-addressed versions with read-back verification, because synthetic hashes must never authorize overwrites.
- Official roster affiliation is stored separately from authorized memberships; this permits unlinked player registration without granting identity access.
- Narrator-only Eventos/Aventuras live in src/server/gm-content.json, served by /api/public/gm-content after an admin check; why: public static files are readable by anyone.
- Images use private campaign storage and stable references in versioned text; RLS derives image readers from visible records/letters/replies, so attachments never become public.
- Public house galleries use a separate public-house namespace and catalog-referenced image policy; private campaign attachments cannot be promoted through gallery readers.
- Drive source imports retain original file identifiers and files; edits are versioned campaign JSON copies, and player refresh is scoped server-side to explicitly authorized bindings to prevent cross-house execution.
- Narrator mail editing is an admin-only transactional RPC with optimistic versions and immutable audit rows; the unified mail view retains original audiences and replies to avoid silent disclosure or history loss.
- Weekly delivery is enforced transactionally by message publication state and reply audience; Drive exports exclude unreleased messages from every non-master binding, because technical subfolders do not provide privacy.
- Additive campaign migrations retain a service-only inventory snapshot before backfilling delivery metadata, so historical IDs, readers and current round state remain recoverable.
- Technical Drive exports target a dedicated folder ID while narrative imports retain the original root; leased organization validates mappings and preserves file IDs to avoid moving original documents.
- Public archive refresh visits only catalog-approved house sources in bounded batches, preserving official metadata and recording conflicting narrative versions for administrative review.
- Narrator representation is a short-lived database session bound to the real actor; one transactional RPC applies player-scoped permissions and audits actions without authenticating as the player.
- Narrator round-response summaries derive from delivered messages and replies plus active authorized memberships; scheduled content and narrator replies never count as a house response.
- Structured noble-house management is isolated from legacy narrative/character records, uses a versioned central rules engine and transactional private snapshots with immutable ledger entries; legacy data enters only through explicit reconciliation.
- House exports share a browser-safe report model for PDF and Excel, including recorded costs, discounts and ledger entries; this keeps exported accounting consistent with the private workspace.
- Military operations use browser-safe pure rules with transactional server wrappers; mixed-unit missing rules require a narrator-recorded decision and survivors retain immutable battle events, preventing fabricated defaults or duplicate losses.
- House coverage is a read-only presentation of authorized-source coverage and gaps, separate from private house state; it must distinguish implementation, source reconciliation and unverified operations without estimating completion percentages.
- Vassal crests resolve from official house metadata; NPC links store only existing source-house record IDs and recheck reader access on opening, so narrator approval never copies private character content or grants cross-house access.

- Court roles reference existing same-house character records, including character sheets, while vassal selectors retain narrative-member eligibility; labels and content resolve under viewer access rather than copying private names into shared snapshots.
- House reconciliation previews use existing RLS-readable source records and session-local workbooks without mutation callbacks; candidate resource rows retain provenance and missing values rather than approving or merging balances.

- Structured house Drive exports have a dedicated one-way mapping in the existing leased technical-folder executor; private sheet and ledger remain authoritative, with real provider ETags required for stable updates and immutable versions otherwise.
- House resource views share the same central balance calculation and switch only presentation; chart saturation never changes recorded totals or allocations.
