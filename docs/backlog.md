# Beta Feedback Backlog

Issues and feature requests collected from beta testing.

Status: `[ ]` open · `[~]` in progress · `[x]` done

---

## Completed

### Batch 1 — Critical mobile fixes & quick UI wins
- [x] Mobile: Date picker Android issues
- [x] Mobile: Horizontal scroll overflow on order cards
- [x] Mobile: Date field truncation on iOS
- [x] Help modal spacing
- [x] Help button styling (round, visible border)
- [x] Einkaufsabschluss section spacing
- [x] Members list role column alignment
- [x] 404 on /assets/mampfi-logo.png
- [x] Language picker styling (Chrome/macOS select)
- [x] Frontend price validation on event creation
- [x] Item name length limit (36 chars)

### Batch 2 — Finalize UX & order improvements
- [x] Finalize button UX (explanatory text + "Für den Einkäufer")
- [x] Save order button: disable when unchanged
- [x] Help content: add glossary

### Batch 3 — Admin capabilities & members
- [x] Admin: promote members to admin
- [x] Admin: change cutoff time in Admin tab
- [x] Personal order history in History tab

### Batch 4 — Purchase management
- [x] Admin: revert/invalidate purchase finalization
- [x] Receipt photo upload + view in history (base64 in DB)

### Batch 5 — Advanced features
- [x] Delivery fee (Bring-Pauschale) — event setting + finalization checkbox
- [x] Member notes (allergies) — per-event note in members list
- [x] Admin: delete events with email notification
- [x] Auto-delete events 90 days past end date (worker)

### Rollover fix
- [x] Server-side rollover preference (Membership.rollover_enabled)
- [x] Filter inactive items consistently in get_my_order
- [x] Three-state order indicator (explicit / rolled from [date] / no order)
- [x] Aggregate respects rollover_enabled

---

## Open — Bugs

- [ ] **list_members missing note + rollover_enabled** — Backend `list_members` doesn't include `note` or `rollover_enabled` in response, so notes are invisible to other members and rollover toggle appears stuck. Root cause of both member note invisibility and rollover toggle bug.
- [ ] **Rollover toggle UI stuck on "An"** — After toggling, the members query isn't refetched immediately. Even with the backend fix, need to ensure the toggle invalidates aggressively.
- [ ] **Can't re-finalize after revert** — Frontend treats invalidated purchase as existing (returns 200, not 404). Need to check `invalidated_at` and show finalize button when purchase is invalidated.
- [ ] **Finalize modal doesn't close on success** — The `finalize` mutation's `onSuccess` doesn't close the finalize confirmation modal.
- [ ] **Delivery fee checkbox not visible** — Checkbox only shows in the "finalize as is" confirmation modal. Verify event has `delivery_fee_minor > 0` and that event data is fresh.

## Open — UX Improvements

- [ ] **Receipt upload during finalization** — Should be a step in the finalize modal flow, not only available after finalization. Add as last step before confirming.
- [ ] **Revert button in history tab** — Currently only in Day tab. Add compact icon button per row in history (admin only).
- [ ] **Event deletion: confirm with balance info** — Show balance summary in confirmation dialog. After deletion, email ALL members with ALL balances (not just personal). If settled, say so. If not, include full balance table.
- [ ] **Member notes discoverability** — The note button only appears if a note exists, making it hard to discover. Consider always showing a "set note" option for the current user with a brief explanation of purpose.

## Open — Deferred

- [ ] **Event name/description editing in Admin tab**
- [ ] **PWA** — App Shell + offline fallback **(later)**
- [ ] **Database backup strategy** **(later)**
- [ ] **Post-deploy smoke test** **(later)**
