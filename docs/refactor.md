# Refactor Backlog

Tracked improvements identified during codebase review. Items are grouped by area and roughly prioritized within each group.

Status: `[ ]` planned · `[~]` in progress · `[x]` done

---

## Backend

### High Priority

- [ ] **Extract membership auth dependency** — `session.get(Membership, (user.id, ev.id))` is repeated ~40 times across all routers. Replace with a single `Depends(require_member)` FastAPI dependency. A `_ensure_member()` helper already exists in `payments.py` — generalize it.

- [ ] **Type JSONB fields** — `DailyOrder.items` and `Purchase.lines` are raw `list[dict]`. Define `TypedDict` or Pydantic models for order line items and purchase lines. Eliminate scattered `str(it.get("price_item_id"))` coercions.

- [ ] **Remove duplicate balance calculation** — `_compute_balances_for_event()` is implemented separately in both `members.py` (lines 43–60) and `balances.py` (lines 38–57). Extract to a shared utility function.

### Medium Priority

- [ ] **Harden input validation** — Name/description fields have no max length. Email validation only checks for `@`. Timezone should be validated at schema level (not runtime try/except). Notes fields risk XSS.

- [ ] **Fix broad exception swallowing** — `except Exception` in `holidays.py:26`, `main.py:43`, and `members.py:51–54` silently masks real errors. Use specific exception types or at minimum re-raise after logging.

- [ ] **Add test suite** — `pytest` and `httpx` are in dev deps but zero test files exist. Start with router-level integration tests using a real test DB.

- [ ] **Add response DTOs** — Several routes return raw SQLModel objects or plain dicts. Define explicit Pydantic read models per resource for stable API contracts.

### Low Priority / Later

- [ ] **Production auth** — `X-Dev-User` header creates users on first request. Replace with JWT or session-based auth before any production deployment.

- [ ] **Structured logging** — Add JSON logging from FastAPI and worker services to enable log aggregation.

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
