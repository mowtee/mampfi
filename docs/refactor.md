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
- [~] **`exceptions.py`** — `NotFound`, `Forbidden`, `Conflict`, `DomainError`; register handler in `main.py`
- [ ] **`schemas/`** — extract all inline Pydantic models from routers into per-domain schema files
- [ ] **`services/`** — one module per domain (events, orders, purchases, payments, members, invites, balances); move all business logic; use domain exceptions
- [ ] **Thin routers** — routers become pure HTTP adapters: validate input, call service, return schema
- [ ] **Type JSONB fields** — `DailyOrder.items` and `Purchase.lines` are raw `list[dict]`; define Pydantic models for order line items and purchase lines; do this while writing service layer
- [ ] **Remove duplicate balance calculation** — `_compute_balances_for_event()` duplicated in `members.py` and `balances.py`; consolidate into `services/balances.py`

### Remaining Backend

- [ ] **Harden input validation** — Name/description fields have no max length. Email validation only checks for `@`. Timezone should be validated at schema level. Notes fields risk XSS.

- [ ] **Add test suite** — `pytest` and `httpx` in dev deps but zero test files. Write integration tests against real DB once service layer is in place (services are easier to test than routers).

- [ ] **Production auth** — `X-Dev-User` header is dev-only. Replace with invite-based signup + session cookies. Swap only touches `auth.py` and router signatures — service layer is auth-agnostic.

- [ ] **Structured logging** — Add JSON logging from FastAPI and worker services.

---

## Frontend

### High Priority

- [ ] **Split `EventDetail.tsx` (1,626 lines)** — Extract tab-scoped components: `DayTab`, `HistoryTab`, `PaymentsTab`, `AdminTab`. Create a shared `useEventContext` hook to hold the 13+ queries and common state. Current file is unmaintainable.

- [ ] **Eliminate `any` casts (44+ instances)** — `strict: true` is set but bypassed. Focus on `lib/api.ts` (8 instances) and `EventDetail.tsx` (pervasive). Define proper response types per API endpoint.

### Medium Priority

- [ ] **Replace 9 modal boolean flags with state machine** — `devOpen`, `finalizeOpen`, `worksheetOpen`, etc. declared separately. Use a single `useReducer` or enum-keyed state object.

- [ ] **Extract custom hooks** — Tab switching (useSearchParams), event context queries, and rollover preference (localStorage) are good candidates.

- [ ] **Tune React Query `staleTime`** — Currently `0` everywhere (refetch on every mount). Set sensible per-query values; static data like price items can be cached much longer.

### Low Priority / Later

- [ ] **Gate dev auth behind `import.meta.env.DEV`** — The `X-Dev-User` email picker should not be visible in production builds.

- [ ] **Implement i18n** — Requirements specify DE default + EN. react-i18next is configured in requirements but UI strings are not yet externalized.

- [ ] **PWA** — Requirements mention `@vite-pwa/plugin` for App Shell + offline fallback. Not yet implemented.

---

## Infra / DevOps

- [ ] **Add CI/CD pipeline** — No GitHub Actions yet. Add: lint + test on PR (ruff, pytest, eslint, vitest), Docker build validation.

- [ ] **Add database backup strategy** — Production data lives on a named Docker volume with no documented backup/restore procedure.

- [ ] **Run containers as non-root** — No `USER` directive in either Dockerfile.

- [ ] **Notifications worker** — Worker service exists in compose but email delivery, scheduling, and templates are unimplemented. See `docs/requirements.md` FR-012.

- [ ] **Post-deploy smoke test** — `infra/deploy.sh` has no health check after restart to confirm the deploy succeeded.
