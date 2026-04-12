# SESSION_NOTES

Working notes to retain context, decisions, and open questions across sessions.

## Purpose
- Capture project knowledge that doesn’t fit specs or code comments.
- Track decisions, assumptions, and open questions until resolved.
- Keep a lightweight session log to maintain continuity.

## Snapshot
- Project: Mampfi — daily group ordering app with buyer volunteer and virtual cash-up.
- Backend: FastAPI, SQLModel, Postgres, Alembic, Pytest.
- Frontend: React + TypeScript + Vite, TanStack Query, Tailwind + shadcn/ui, react-i18next (DE default, EN), PWA.
- Key rules: Cutoff locks next-day orders; orders roll over; one currency per event; payments are logged and require dual confirmation.

## Current Status
- Requirements reviewed (see `mampfi_requirements.md`).
- Awaiting preferences on repo shape (monorepo vs split) and invite policy. Buyer policy decided (see below).

## Decisions & Assumptions (Draft)
- Auth: Invite-based signup; session via httpOnly cookie. Details TBD (token expiry, single vs multi-use).
- Time: Backend is UTC-only. Accept timezone-aware inputs and cast to UTC on ingress; store as Postgres `timestamptz`. Persist the event’s IANA timezone string separately; server enforces cutoff using the event timezone but all stored datetimes are UTC. Replace deprecated `datetime.utcnow()` with `now_utc()` (aware). 
- Money: Store minor units (integers). Event currency is ISO 4217, fixed at creation.
- API: REST/JSON with optimistic concurrency where buyer finalizes.
- i18n: German default, English available.
- Buyer policy: No pre-claim. Anyone can buy; the person who actually buys finalizes the purchase for that date by marking themselves as buyer and recording actuals (substitutions/omissions) at the same time. Exactly one finalized purchase per (event, date).
- Accounts & invites: Single global signup per user (account reused across events). Invites are event-scoped links; default multi-use group link with optional single-use invites. Tokens have 14-day TTL, auto-invalid after event end, and can be revoked/rotated by event owner.
- Notifications: In-app + Email only (no push). Email sent via provided SMTP account; outbound-only (no inbound processing needed). Use i18n templates (DE default, EN). Configure From address; recommend SPF/DKIM at domain for deliverability.
- Repo layout: Monorepo with Docker Compose (dev/prod). Backend uses Poetry for dependency management. Frontend uses Vite/Node.
- Deployment: Caddy as external reverse proxy (not in compose). Compose runs api, web, db, worker, migrate. Caddy routes to services via host networking or shared Docker network outside the stack.
- Python: Use Python 3.13 for backend runtime and development.
- Price list changes (Option 1 policy): During an event, owners may add new items and (de)activate items. Changing unit price is not allowed; instead add a new item with the new price and deactivate the old one. Orders can only reference active items. Listings default to active-only (toggle available for include_inactive). No cutoff guards will be implemented; changes take immediate effect.

## Open Questions
1) Buyer conflict policy: RESOLVED — post-purchase self-mark with single finalization per day.
2) Invite tokens: RESOLVED — event-scoped, 14-day TTL, default multi-use with optional single-use; revocable/rotatable.
3) Notifications: RESOLVED — In-app + Email (SMTP) from the start; no push, no inbound mail required.
4) Repo layout: RESOLVED — Monorepo + Docker Compose; backend with Poetry; Caddy external reverse proxy.
5) Payment confirmation UX: RESOLVED — two-step confirm (proposer logs, recipient confirms/declines); proposer can cancel while pending.

## Near-Term TODOs
- Choose repo layout and scaffolding approach.
- Define initial data model (users, events, memberships, price_items, daily_orders, purchases, payments).
- Sketch auth flows (accept invite, join event, session cookie lifecycle).
- Plan core endpoints and basic UI routes.

## Domain Sketch (Updated)
- User: id, name, email, locale.
- Event: id, name, description, start/end, timezone, cutoff_time, currency.
- Membership: user_id, event_id, role=member, joined_at, left_at.
- PriceItem: event_id, name, unit_price_minor, active.
- DailyOrder: event_id, user_id, date, items[{price_item_id, qty}], locked_at.
- Purchase (authoritative finalization): id, event_id, date, buyer_id, finalized_at, notes,
  lines:[{ type: 'price_item'|'custom', price_item_id?, name?, qty_final, unit_price_minor, reason?('unavailable'|'substituted'|null), allocations:[{user_id, qty}] }],
  total_minor (stored; server recalculates), version.
- PurchaseEvent (audit): purchase_id, event_type (created, edited), actor_id, at, diff.
- Payment: from_user_id, to_user_id, event_id, amount_minor, status (proposed, confirmed), timestamps.

Notes:
- Removed: BuyerClaim and takeover flow (superseded by post-purchase finalization).
- Unique constraint: one Purchase per (event_id, date).

## Non-Functional Notes
- Performance target: p95 UI actions ≤ 300ms perceived.
- Availability: 99.5% during active events.
- Data integrity: double-entry style balance calc from immutable facts (orders, purchases, payments) preferred.

## Conventions
- Naming: snake_case in backend, camelCase in frontend.
- IDs: ULIDs or UUIDv4 (decide at scaffold time).
- Currency formatting: `Intl.NumberFormat` with event currency.
- Dates: Luxon on FE; store ISO 8601 UTC in API.

## Session Log
- 2025-08-28: Invites UX, SPA fallback, mobile dev input, holidays fixes
  - Invites UX: In Admin after creating invites, show absolute invite URL (built from window.location.origin) and provide a Copy URL button. Join page now previews a token (via new API) to show the event name and a primary Join button when arriving with a URL-encoded token.
  - API: Added GET /v1/invites/preview to validate token and return event details without joining; kept POST /v1/invites/redeem for the actual join.
  - SPA routing: Added nginx config in web image to serve index.html for client routes (try_files), fixing 404 on reload for /events/:id.
  - Frontend stability: Fixed Rules-of-Hooks issues by (1) converting holidays hook to useQueries with a single call, and (2) calling useHolidays unconditionally before early returns in EventDetail. Ensured calendar dropdown uses a portal with outside-click exceptions.
  - Mobile UX: Made Dev Email accessible on small screens by replacing hard hide with a modal trigger (sm-only) and keeping inline form on larger screens (sm-hidden).
  - Holidays feature: Added per-event holiday_country_code and holiday_region_code (model + migration), server-side /v1/holidays proxy with caching and region filtering, FE dots in calendar, and day-view chip showing only localName.
  - Infra: Added infra/deploy.sh with local and remote (rsync + SSH) deployment; remote path builds, migrates, and restarts via Compose. Documented server update flow.
- 2025-08-28: Mobile responsiveness + desktop calendar
  - Responsive tweaks: ensured inputs/selects/textarea don’t overflow on small screens (`max-width: 100%`), made tables horizontally scrollable under 700px, allowed toolbars and tabs to wrap, slightly reduced paddings for small screens, and hid the dev-only email form in the topbar under 420px to keep the header compact.
  - Date picker field: introduced `DateField` component with glass styling and an inline calendar button; replaced native date inputs in EventDetail (Day toolbar) and New Event (Start/End). Kept native picker UX for mobile via `showPicker`/focus fallback.
  - Desktop calendar dropdown: added `Calendar` dropdown matching the app’s style and rendering via a portal anchored to `document.body` to avoid clipping/z-index issues; supports month navigation, Today action, and min/max bounds. Fallback to native picker on touch/narrow screens.
  - Fixed clipping: dropdown previously rendered inside layout could sit behind sections; moved to portal with fixed positioning and high z-index.
  - Verified `npm run build` success after changes.
- 2025-08-28: Finalization worksheet alignment and pre-check wording
  - Finalize with adjustments: removed custom line support; removed per-item reason; removed line-level remove (set qty to 0 instead); prices shown as plain amounts (e.g., €1.40); added ability to add active price list items not originally ordered (for substitutions); increased top spacing above "Set all 0".
  - Submission now sends only `price_item` lines and ignores zero-quantity lines.
  - Pre-check modal copy updated to emphasize the positive path: title “Everything bought as ordered?”, body clarifies adjustments are for exceptions; primary action is “Yes, finalize as is”; secondary “No, make adjustments”.
  - Built frontend successfully with Vite.
- 2025-08-27: Styling foundation + modal plan
  - Added Nunito font and introduced light/dark CSS tokens based on provided palette (bg #F0F4F8, primary #264653, secondary #F4A261, accent #2A9D8F).
  - Implemented glass UI (blur, border, shadow), soft Gradient B for the app background, and updated base components (buttons, inputs, cards, chips, tables) to use tokens.
  - Prepared Tailwind v3 (config, PostCSS, entry file) and scaffolded simple UI wrappers (Button/Input/Select/Badge/Dialog/Table) without changing semantics.
  - Identified UX issues with finalize dialogs (overlay artifact, cramped scroll, low contrast). Decided to introduce a dedicated Modal component (portal + scroll lock + sticky footer) and render dialogs outside page sections to avoid nesting issues.
  - Restored EventDetail to a known-good version to fix a JSX structure regression, validated clean build, and planned a safe incremental refactor to the new Modal.

## Next Steps (Frontend UI)
- Implement `Modal` component (portal, top alignment, optional strong dim, sticky footer, Esc/overlay close, body scroll lock).
- Refactor EventDetail finalize dialog to use `Modal`; keep content and behavior unchanged initially.
- Optional follow-up: add precheck dialog and a full-size worksheet dialog, both using `Modal`.
- 2025-08-19: Reviewed requirements; created `SESSION_NOTES.md`; outlined domain and open questions; awaiting preferences to scaffold.
- 2025-08-19: Decided buyer policy: post-purchase finalization by the buyer; removed pre-claiming model; updated domain/API direction accordingly.
 - 2025-08-19: Decided notifications: In-app + Email via SMTP (outbound only); no push; added outbox + preferences plan.
 - 2025-08-19: Decided payments: two-step confirmation with cancel; only confirmed payments affect balances; added API and audit notes.
 - 2025-08-19: Scaffolded monorepo (backend FastAPI/Poetry, frontend Vite React, compose infra); Caddy kept external.
 - 2025-08-19: Set backend to Python 3.13; added Makefile (db-up/down/reset, dev-api, dev-web, migrate, seed).
 - 2025-08-19: Implemented DB wiring (SQLModel engine/session), health endpoint with DB ping, initial models, and Alembic "init" migration.
 - 2025-08-19: Added dev auth via `X-Dev-User`; implemented events create/list/get and purchase finalize/get endpoints; updated README.
- 2025-08-19: Fixed purchases endpoint issues (DTOs as Pydantic models, proper scalar selection for `PriceItem.id`); refined request validation.

- 2025-08-19: Upgraded stacks and validated models
  - Backend deps bumped to latest: FastAPI 0.116.1, SQLModel 0.0.24, Pydantic 2.11.7, Uvicorn 0.35.0, Alembic 1.16.4, Psycopg 3.2.9, python-dotenv 1.1.1, pydantic-settings 2.10.1; dev: Pytest 8.4.1, HTTPX 0.28.1, Ruff 0.12.9, Black 25.1.0.
  - Frontend deps bumped to latest: React 19.1.1, React DOM 19.1.1, Vite 7.1.3, @vitejs/plugin-react 5.0.1, TypeScript 5.9.2, @types/react 19.1.10, @types/react-dom 19.1.7. Verified `npm run build` succeeds.
  - Adjusted API route params to `uuid.UUID` for correctness: `GET /v1/events/{event_id}`, `POST/GET /v1/events/{event_id}/purchases/...`.
  - Revalidated backend models with SQLModel 0.0.24: All persisted models inherit from `SQLModel, table=True` (good). No v1-only Pydantic usage found.
  - Confirmed SQLAlchemy 2.x usage patterns (select/exec) are compatible.

- 2025-08-20: Implemented payments audit (`payment_events`) and balances endpoint. Extended smoke script with permissions/validation cases and balance delta checks verifying confirmed (+/-) vs declined/canceled (no change).

- 2025-08-20: Implemented Orders API (upsert, get-my-order enriched with name/unit price and totals, aggregate with metadata and totals). Implemented Invites API (group/single/list/revoke, redeem) with owner-only admin; event creator marked as owner. Fixed Pydantic v2 `from_attributes=True` use for invite responses. Added `scripts/smoke.sh` covering end-to-end flow and non-owner 403.

- 2025-08-21: Frontend UX cleanup and leave-intent flow
  - Refactored Event Detail into tabbed layout: Day (date picker, order, aggregate, finalization), History, Payments, Admin (owners only).
  - Added per-member delivery overview in aggregate (built from consumers allocations).
  - Payments tab: shows only my payments, pins pending payouts to me, adds "Settle my balance" helper; manual "Log a payment" remains available.
  - Backend: added `wants_to_leave` flag on `Membership` (+ Alembic migration `20250821_0004_leave_intent`).
  - New endpoints: `POST /v1/events/{id}/members/me/leave-intent` and `POST /v1/events/{id}/members/me/leave` (409 returns payout/collection plan, leavers prioritized).
  - Balances endpoint returns `wants_to_leave` and includes zero-balance members.
  - Fixed invites redeem timezone bug by using `now_utc()`.
  - Updated `scripts/smoke.sh` to finalize from aggregate allocations and assert balances net to zero after purchase and after payment confirm/decline/cancel.

- 2025-08-21 → 2025-08-22: Frontend Day tab + Payments + Admin UX
  - Day tab: Added status chip near date (Open until/Locked since and Finalized), mobile stepper (+/−) for qty inputs, sticky "Your total" footer in card, and a rollover note.

- 2025-08-22: Day tab UX, finalize view, wording, and controls
  - Finalization worksheet: simplified member add UX — "Add member" as a button that reveals a selector; no qty field during add (add at qty 0; adjust in grid).
  - Finalized purchase view: replaced list with tables for lines (Item, Qty, Unit, Total) and "Per-member delivery" built from final allocations.
  - Aggregate wording: "Aggregated For Date" → "Group Order"; per-member section labeled "Per-member orders" to distinguish requested vs delivered.
  - Rollover: per-user, per-event toggle in Day header; stored locally; when off, rolled-over server orders start empty with a hint.
  - Status badge: kept in header but simplified — shows "Open until HH:MM" or "Locked"; removed timezone name from badge text.
  - Timezone display: removed explicit timezone from event header and cutoff text; app still uses event TZ internally for lock logic.
  - Locale dates: added `formatYMDToLocale()` using `Intl.DateTimeFormat`; applied to event header, events list, and finalize modals.
  - Navigation: moved "New Event" button from top bar to Events list header.

- 2025-08-22: Deployment compose tweaks and guidance
  - Compose: added `db` healthcheck (`pg_isready`); gated `api/worker/migrate` on `service_healthy`; added `restart: unless-stopped` for `api/web/worker`, `restart: "no"` for `migrate`; noted avoiding host ports in prod (use Caddy on the Docker network).
  - Rationale: `worker` handles background jobs (notifications, outbox, schedules) without affecting API latency; `migrate` is a one-shot Alembic runner for predictable schema upgrades.
  - Deployment paths: (a) copy sources to server and build natively on amd64; (b) build amd64 images on Apple Silicon via Buildx and transfer tarballs; (c) build and push to a registry, then `compose pull` on server.
  - Rsync safety note: avoid targeting `user@server:` with `--delete` (danger: remote home); always create a subdir and dry-run first. Safe example:
    - `ssh user@server 'mkdir -p ~/mampfi'`
    - Dry run: `rsync -avzn --delete --filter=':- .gitignore' --exclude='.git' ./ user@server:~/mampfi/`
    - Then: `rsync -avz --delete --filter=':- .gitignore' --exclude='.git' ./ user@server:~/mampfi/`
  - Purchase finalization: Confirm dialog summarizing items and total; show "Nothing to finalize yet" with link to Day tab when aggregate is empty.
  - Payments: Pinned pending-to-me with highlight and a single status badge ("Awaiting you", "Awaiting recipient", "Confirmed", "Declined", "Canceled"); removed +/− 5.00, kept "Exact my balance"; currency formatting via Intl.NumberFormat.
  - Admin price list: Inline policy hint about immutable prices; validation hints on invalid price; formatted unit prices.
  - Members: In balances, keep leavers info and add a "Leaving" badge; leave plan rendered as inline checklist with Create payment buttons and a dismiss action.
  - UI polish: Fixed z-index so sticky totals don’t obscure buttons.

- 2025-08-22: Refresh behavior and navigation
  - QueryClient defaults: `refetchOnWindowFocus` and `refetchOnReconnect` set to `always`.
  - Active-tab polling with intervals (Day: 8s pre-cutoff, 60s post; Payments: 8s) and immediate invalidation on tab/date change.
  - Date navigation: Added ◀/▶ to move one day backward/forward; invalidates relevant queries on change.

- 2025-08-22: Read-time order rollover with membership bounds (Backend + FE)
  - Backend Orders API: `GET /v1/events/{id}/orders/{date}/me` falls back to the most recent prior explicit order within membership window; returns `is_rolled_over: true` when used. `PUT`/`GET` now enforce membership active-by-date (joined_at ≤ date < left_at in event TZ). Rollover stops once member left.
  - FE indicates rolled-over state with a chip in "Your Order".

- 2025-08-22: Leavers visibility and performance
  - Backend: Added `GET /v1/me` and enriched `GET /v1/events` (now returns `left_at` for current user).
  - FE: Events list shows "Active"/"Left" badges per membership; Event header shows "Active member" or "You left on {date}"; Day tab shows friendly note for post-leave dates.
  - Reduced unnecessary 403 retries: Set `retry: false` for `myOrder`; fetch invites only when user is owner; disabled Day polling when viewing dates after leaving.

- 2025-08-22: Status badges and chips
  - Payments use a single badge for status (no duplicate text) and centered multi-line chips; shortened "Awaiting your confirmation" to "Awaiting you".

- 2025-08-22: Aggregate rollover + finalize modal + history/day tables
  - Backend: Aggregates now include rolled-over orders for active members without an explicit order on the target date (within membership window and filtered to active items). This removes the need to save every day for rollover to take effect.
  - Frontend: Replaced browser confirm with an in-app modal for purchase finalization showing a summary table and total; no `window.confirm` prompts remain.
  - Frontend: Converted aggregate lists (Day tab) and history details to tables; history expands to show Aggregate and Per member tables.
  - Frontend: For past active days after leaving, if `myOrder` is not fetched, derive my quantities from the aggregate consumers to display what I ordered.
  - Frontend: Prevent order edits/saves for dates on/after leaving by disabling steppers and the Save button; shows a friendly note immediately.
  - Frontend: Avoids unnecessary requests for non-owners by gating invites fetch; avoids retries on expected 403s; stops `myOrder` fetch when inactive for date.
  - Bugfix: History allocation view used missing `memberLabel`; now correctly uses injected `label` prop.

- 2025-08-22: Finalization Worksheet Plan (Design Only)
  - Goal: Allow buyer to reconcile shortages/substitutions per item and per member so balances reflect actual delivery.
  - Flow addition: Before opening the full worksheet, ask: "Did you need to modify items compared to requests?" If No → finalize directly from aggregate; If Yes → open worksheet (defaults delivered=requested) for edits.
  - Worksheet (Phase 1): For each item show requested vs delivered with per-member delivered steppers; support marking items unavailable; live totals; submit as `purchases` POST with allocations. (No substitutions yet.)
  - Worksheet (Phase 2): Add substitutions (existing item or custom) with per-member allocations and optional reason/notes; add per-member charge preview.
  - Worksheet (Phase 3): Helpers like proportional distribution; optional short PATCH correction window with optimistic locking.
  - Data model: Keep purchase lines authoritative with `allocations`; optional snapshots (`requested_qty`, `requested_allocations`), `reason` and `notes` for audit clarity. `PurchaseEvent` logs diffs.
  - Validation: Server enforces membership-at-date, item ownership, qty consistency (sum allocations = qty_final), non-negative integers.

## Stack Versions (Current)
- Python: 3.13
- Backend: FastAPI 0.116.1, SQLModel 0.0.24, SQLAlchemy 2.0.x, Pydantic 2.11.7, Uvicorn 0.35.0, Alembic 1.16.4, Psycopg 3.2.9
- Frontend: React 19.1.1, Vite 7.1.3, TypeScript 5.9.2

## Recent Changes
- Dependency refresh to latest stable on both backend and frontend; lockfiles updated.
- Route parameter types switched to `uuid.UUID` to match DB PKs and improve FastAPI validation/OpenAPI.
- Models remain SQLModel-based; no need to drop SQLModel inheritance with current versions.
- Purchases endpoint fix: switched to `.all()` on ScalarResult (no extra `.scalars()`); input UUIDs for `price_item_id`, store as strings in JSONB.
- Price Items API: `GET /v1/events/{id}/price-items` added.
- Orders API: upsert my order (cutoff-enforced), get my order (enriched items with `name`, `unit_price_minor`, `item_total_minor`, plus top-level `total_minor`), and aggregate (per-item metadata + `item_total_minor`, plus top-level `total_minor`).
- Invites API: owner-only create/list/revoke, and redeem endpoint; event creator role set to `owner`.
- Payments API: create/list/confirm/decline/cancel; currency fixed to event; recipient confirms/declines, proposer cancels.
- Payments audit: `payment_events` table with (created, confirmed, declined, canceled) entries.
- Balances: `GET /v1/events/{id}/balances` computes per-user net balances from purchases and confirmed payments.
- Smoke script: end-to-end verification incl. permissions, validations, and payments confirmations.

- Frontend MVP extensions (2025-08-20):
  - Added balances and payments UI to Event detail; contextual actions for payments.
  - Added invites UI: create/rotate group invite, single-use invite form, list + revoke; join page at `/join` to redeem tokens.
  - Added purchase finalization UI: finalize from aggregate; show finalized purchase details.
  - Added purchases history with expandable rows loading line details on demand.
  - Added members fetch and mapped user labels (name/email) across balances, payments, purchases.
  - Added New Event page `/events/new` with initial price items.
  - Fixed FE bug: purchase history expansion now receives price-name mapping; no more ReferenceError.
  - Added owner price-list management UI on Event detail: add item, activate/deactivate, and only active items appear for ordering.
  - Active-only save: order upsert payload filtered to active items; inline warning when saved order contains inactive items; save disabled on finalized dates.

- Backend endpoints (2025-08-20):
  - Members: `GET /v1/events/{event_id}/members` (members-only) for labels.
  - Purchases list: `GET /v1/events/{event_id}/purchases` with optional `start_date`/`end_date`.
  - Price items management (owner-only):
    - `POST /v1/events/{event_id}/price-items` add new item (active).
    - `POST /v1/events/{event_id}/price-items/{price_item_id}/deactivate` and `/activate` to toggle active.
    - `GET /v1/events/{event_id}/price-items?include_inactive=false` default active-only.
  - Orders upsert now validates against active items only.
  - Fixed FastAPI 204 assertion: activate/deactivate endpoints return empty `Response(status_code=204)`.
  - README updated with new endpoints.
  - Orders: upsert locks if purchase exists (403). Structured 400 with `{inactive_item_ids, unknown_item_ids}`. `GET my-order` marks lines with `inactive: true` when applicable. Aggregates keep item metadata (name/unit price) for inactive items so historical orders still show correctly.

## Session Log
- 2025-08-20: Implemented FE balances/payments, invites UI, join flow, purchases finalization + history, members labels, New Event page. Added BE members and purchases list routes.
- 2025-08-20: Implemented price list management (owner) BE routes (add/activate/deactivate, filtered listing) and wired FE admin UI. Adopted Option 1 immediate-effect policy (no cutoff guards).
- 2025-08-20: Clarified order behavior with deactivated items: active-only saving, warnings in UI, aggregates retain names/prices for items already in saved orders. Locked order upserts on finalized dates. Fixed FE name mapping for inactive items in purchase displays.

## Follow-ups / Next Steps
- JSONB typing: typed models for `DailyOrder.items` and `Purchase.lines` (+ allocations) instead of `list[dict]`.
- Engine cleanup: remove `future=True` from `create_engine`; optional: use timezone-aware timestamps (UTC).
- Response DTOs: explicit read models for responses.
- Payments audit: add `payment_event` append-only log.
- Notifications/outbox worker: cutoff reminders and basic delivery.
- Price list UI (owner): wire FE controls to add/deactivate items; show inactive items with a filter.
- Optional: enforce "apply after next cutoff" for price-list changes (introduce effective date or server-side guard by target date).
- Currency/number formatting via `Intl.NumberFormat` and i18n plumbing (react-i18next) for DE/EN.

## Quick Dev Commands (refresher)
- DB up/migrate: `make db-up` → `make migrate`
- API dev: `make dev-api` → http://localhost:8000/health
- Web dev: `make dev-web` → http://localhost:5173

## Scaffold Summary
- Backend: FastAPI app with `/health`, SQLModel setup, Alembic configured to read `.env` for `DATABASE_URL`.
- Frontend: Vite + React + TS scaffold; added `@vitejs/plugin-react`.
- Infra: Docker Compose (db, api, web, worker, migrate); Caddy is an external proxy (example config provided).
- Tooling: Makefile shortcuts for DB, dev servers, migrate, and seed.

## Next Up (Backend)
- Seed improvements: create a dev user, sample event, and price items for quick testing.
- Payments audit log and balances view.
- Notifications worker + scheduler: start with cutoff reminders.

## TODOs (API shaping)
- Price items: keep using raw model for now; later add `PriceItemRead` DTO and filtering (`active=true` default, `?include_inactive` opt-in) once FE needs are clear.
- Purchases input: `price_item_id` now typed as UUID; FE should send UUIDs. Persist UUIDs as strings within JSONB lines for portability.

## Local Dev Workflow (Current)
- Start Postgres: `make db-up` (named volume) or manual `docker run` command.
- Backend env: copy `backend/.env.example` to `.env`; when running locally use `localhost` in `DATABASE_URL` and set `CORS_ORIGINS=http://localhost:5173`.
- Migrate: `make migrate`.
- Run API: `make dev-api` (Poetry) → http://localhost:8000/health.
- Run Web: `make dev-web` (Vite) → http://localhost:5173.

## Payments Plan
- Model: `payment` (id, event_id, from_user_id, to_user_id, amount_minor, currency, status: pending|confirmed|declined|canceled, note, created_at, decided_at, version).
- Audit: `payment_event` append-only log (created, confirmed, declined, canceled) with actor and timestamp.
- Rules: Only confirmed payments affect balances; pending/declined/canceled do not. No edits—cancel and recreate to change.
- UX: Proposer logs payment; recipient gets in-app/email notification to Confirm or Decline (optional reason). Proposer may Cancel while pending.
- Protections: Duplicate guard (same pair+amount within N hours prompts warning); rate limit create/cancel; cap pending per pair.
- API:
  - POST `/events/{id}/payments` → create pending payment
  - GET `/events/{id}/payments?status=...` → list
  - POST `/events/{id}/payments/{paymentId}/confirm`
  - POST `/events/{id}/payments/{paymentId}/decline` { reason? }
  - POST `/events/{id}/payments/{paymentId}/cancel`

## Notifications Plan
- Channels: In-app (notification center + toasts) and Email (SMTP). No push notifications.
- Triggers (initial): cutoff reminder (T-2h) and lock; purchase finalized (to participants); payment request/confirmation; member joined (owner toggle).
- Preferences: per user per event; defaults: in-app on, email on for critical events (payments, purchase finalized), adjustable.
- Backend: `notification` outbox table with worker for delivery, retries, and idempotency; scheduler for cutoff reminders (timezone aware).
- Email: use provided SMTP; from address configured; plain+HTML templates with i18n. No inbound processing. Optional bounce/complaint logging later.
- API: GET `/me/notifications`, POST `/me/notifications/{id}/ack`, GET/PUT `/me/notification-preferences`.

## Repo Layout Plan
- Structure: `backend/` (FastAPI, Poetry, Alembic), `frontend/` (Vite React), `infra/` (compose files, nginx static if needed), `scripts/`, `shared/` (OpenAPI export + FE types).
- Compose services: `api`, `web` (static), `db` (Postgres), `worker` (outbox/scheduler), `migrate` (one-shot Alembic). No `proxy` service.
- Backend image: multi-stage build with Poetry; slim runtime, non-root, healthcheck.
- Frontend image: Node builder → Nginx (or simple static server) runtime; immutable assets.
- Envs/Secrets: `.env` for dev; prod via env/secrets (DB URL, session secret, SMTP creds).

## Deployment Notes (Caddy)
- Caddy runs outside compose on the host (or separate stack), terminating TLS and reverse_proxy to compose services.
- Example targets: `api` at `http://127.0.0.1:8000`, `web` at `http://127.0.0.1:8080` exposed by compose; or attach Caddy to a shared Docker network and use `http://api:8000`.
- Compose will not manage Caddy; we’ll provide a Caddyfile snippet in docs for routing.

## API Sketch (Invites)
- POST `/events/{id}/invites/group` { ttl_days=14, max_uses=null } → creates/rotates the event’s group link (revokes previous), returns `invite_url`.
- POST `/events/{id}/invites/single` { email?, ttl_days=14 } → creates a single-use invite; optionally annotate intended email.
- POST `/invites/redeem` { token } → validates token, requires authenticated user; on success creates membership and returns event summary.
- GET `/events/{id}/invites` → list active invites (owner only) with usage/expiry stats.
- POST `/events/{id}/invites/{inviteId}/revoke` → immediate revocation.

Invite Flow Notes:
- New user follows invite link → sign up/login → backend stores pending token server-side → redeem → join event. Existing users redeem directly.
- Tokens are opaque, stored hashed; redemption increments used_count and enforces expiry/max_uses/event active.

## API Sketch (Buyer Finalization)
- GET `/events/{id}/orders/aggregate?date=YYYY-MM-DD` → aggregated intended order for the date (locked per cutoff rules).
- POST `/events/{id}/purchases` { date, lines, notes } → creates the single purchase for that date; sets buyer to current user; 201 on success, 409 if already finalized.
- GET `/events/{id}/purchases/{date}` → fetch finalized purchase.
- PATCH `/events/{id}/purchases/{date}` → optional small corrections by buyer within short window; versioned; or append audit events.

Concurrency/Integrity:
- DB unique index on (event_id, date) for purchases; return 409 with info on who finalized if duplicate attempt.
- Optimistic locking via `version` field on edits.

UX Notes:
- “View today/tomorrow list” shows aggregated items and consumers.
 - “Finalize purchase” button available to all; after submit, show buyer badge and lock the date.
 - Adjustments allow marking omissions, substitutions (custom lines), and per-user allocations when needed.

## Session Log
- 2025-08-27: Repo familiarization and alignment check
  - Reviewed `mampfi_requirements.md`, `README.md`, and repo layout (`backend/`, `frontend/`, `infra/`, `scripts/`).
  - Backend: confirmed routers exist for events, orders, purchases, payments, invites, balances; health/db wiring present; Alembic configured.
  - Frontend: Vite React app present; uses `styles.css`; verify if Tailwind + shadcn/ui are intended or if current approach is custom CSS.
  - Docs alignment: README mentions “Tailwind-like custom CSS” while requirements/notes specify Tailwind + shadcn/ui; decide and align.
  - i18n: requirements/notes call for `react-i18next` (DE default, EN). README doesn’t mention i18n; verify implementation status in FE.
  - Next steps: run dev servers to validate endpoints and UI; decide styling stack; proceed with JSONB typing for `DailyOrder.items` and `Purchase.lines`; plan notifications worker.
