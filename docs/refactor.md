# Refactor Backlog

Tracked improvements identified during codebase review. Items are grouped by area and roughly prioritized within each group.

Status: `[ ]` planned · `[~]` in progress · `[x]` done

---

## Backend

### Architecture — Service Layer (in progress)

Current state: all business logic lives inline in routers. No separation between HTTP concerns and domain logic. Membership checks, balance calculations, and validation are scattered across ~1500 LOC of router code.

Target architecture:

```
src/mampfi_api/
├── routers/        # thin HTTP layer: parse request → call service → return schema
├── services/       # business logic: one module per domain area, raises domain exceptions
├── schemas/        # all Pydantic request/response models (extracted from routers)
├── exceptions.py   # domain exceptions: NotFound, Forbidden, Conflict, DomainError
├── models.py       # SQLModel DB models (unchanged)
├── auth.py         # current user dependency (dev header now, real auth later)
└── db.py           # session management
```

Domain exceptions are raised by services and translated to HTTP responses by a single exception handler registered in `main.py`. Business logic never imports `HTTPException`.

Implementation order:
- [x] **`exceptions.py`** — `NotFound`, `Forbidden`, `Conflict`, `DomainError`; register handler in `main.py`
- [x] **`schemas/`** — extract all inline Pydantic models from routers into per-domain schema files
- [x] **`services/`** — one module per domain (events, orders, purchases, payments, members, invites, balances); move all business logic; use domain exceptions
- [x] **Thin routers** — routers become pure HTTP adapters: validate input, call service, return schema
- [x] **Type JSONB fields** — `DailyOrder.items` typed as `list[OrderItemDict]`, `Purchase.lines` as `list[PurchaseLineDict]`; output schemas `AggregateOut` and `PurchaseOut` use typed Pydantic models
- [x] **Remove duplicate balance calculation** — consolidated into `services/balances.py`; `members.py` imports from there

### Remaining Backend

- [x] **Harden input validation** — Added max_length constraints to all string fields, `gt=0` for amounts/prices, IANA timezone validation, `EmailStr` for invite emails, `end_date >= start_date` check.

- [x] **Add test suite** — 54 integration tests via pytest + httpx against SQLite in-memory DB.

- [x] **Production auth** — Email+password signup, JWT access tokens (15min) + refresh tokens (30d) with family-based rotation and reuse detection. Email verification required. Dev header preserved in development mode.

- [x] **Structured logging** — JSON output in production, human-readable in dev. Request logging middleware with method/path/status/duration.

---

## Frontend

### High Priority

- [x] **Split `EventDetail.tsx` (1,626 lines)** — Extracted into `DayTab`, `HistoryTab`, `PaymentsTab`, `AdminTab` + `useEventContext` hook. Sub-components colocated in tab files.

- [x] **Eliminate `any` casts** — Defined domain types in `lib/types.ts`. Replaced all `any` in `api.ts` return types and most component code.

### Medium Priority

- [x] **Replace modal boolean flags with state machine** — DayTab's 3 finalize modals (`finalizeOpen`, `precheckOpen`, `worksheetOpen`) replaced with single `ModalState` enum.

- [x] **Extract custom hooks** — `useEventContext` hook extracts all 13+ queries and derived state from EventDetail.

- [x] **Tune React Query `staleTime`** — Static data (event, price items, me) cached 5 min; members cached 1 min; orders/balances/payments stay at 0 (polled).

### Low Priority / Later

- [x] **Gate dev auth behind `import.meta.env.DEV`** — Dev email picker and X-Dev-User header only active in dev builds.

- [ ] **Implement i18n** — Requirements specify DE default + EN. react-i18next is configured in requirements but UI strings are not yet externalized.

- [ ] **PWA** — Requirements mention `@vite-pwa/plugin` for App Shell + offline fallback. Not yet implemented. **(later)**

---

## Infra / DevOps

- [x] **Add CI/CD pipeline** — CI workflow (lint + test on push/PR) and release workflow (Docker images on `v*` tags to GHCR).

- [ ] **Add database backup strategy** — Production data lives on a named Docker volume with no documented backup/restore procedure. **(later)**

- [x] **Run containers as non-root** — Backend uses `app` user; frontend uses `nginxinc/nginx-unprivileged` on port 8080.

- [~] **Notifications worker** — Outbox processor + SMTP sending implemented. Remaining: wire domain events (payments, purchases) to enqueue notification emails.

- [ ] **Post-deploy smoke test** — `infra/deploy.sh` has no health check after restart to confirm the deploy succeeded. **(later)**
