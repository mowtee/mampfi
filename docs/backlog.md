# Beta Feedback Backlog

Issues and feature requests collected from beta testing. Roughly prioritized by area.

Status: `[ ]` open · `[~]` in progress · `[x]` done

---

## UX / UI Fixes

- [ ] **Help modal spacing** — Too little space between intro paragraph and first numbered item. Add margin-top before the step list.
- [ ] **Help button styling** — The `?` button is not recognizable enough as a button. Make it round with a visible border/background.
- [ ] **Help content: add glossary** — Explain potentially confusing terms (Sperrzeit/cutoff, Übernahme/rollover, Abschluss/finalize) in the help modal.
- [ ] **Spacing: "Einkaufsabschluss" section** — Too little space between the heading and the "Einkauf abschließen" button. Add margin.
- [ ] **Finalize button UX** — Not intuitive enough. Add explanatory text above: "Du hast den Einkauf übernommen? Erfasse jetzt deine Auslage!" and a sub-heading "Für den Einkäufer".
- [ ] **Members list: role column alignment** — Admin/Member badges are not vertically centered in the table row. Fix vertical alignment.
- [ ] **Save order button: disable when unchanged** — "Bestellung speichern" should be inactive when the current quantities match what's already saved in the DB.
- [ ] **Language picker styling (Chrome/macOS)** — The `<select>` dropdown has inconsistent styling on Chrome. Consider a custom dropdown or improved native styling.
- [ ] **404 on /assets/mampfi-logo.png** — Old reference to a non-existent path. Check where this is referenced and fix or remove.

## Mobile / Responsive

- [ ] **Date picker: Android issues** — Multiple problems on Android devices:
  - Date field shows empty/blank when not focused
  - Clicking into the field shows 01.01.1900 as default
  - Generally fragile on mobile — consider using native `<input type="date">` on touch devices more aggressively
- [ ] **Horizontal scroll overflow on cards (Android)** — Order table overflows the card on narrow screens, causing unwanted horizontal scroll. The qty stepper and total column get cut off. Fix: make table responsive (e.g. reduce column widths, allow wrapping, or use a mobile-specific layout).
- [ ] **Date field truncation (iOS)** — Date picker text gets cut off ("13.04.20...") on narrow screens. Ensure min-width or use shorter date format on mobile.

## Features

- [ ] **Admin: change cutoff time** — Cutoff time should be editable in the Admin tab (currently only set at event creation).
- [ ] **Admin: promote members to admin** — Admin should be able to promote other members to admin. Icon-only button in the members list, visible only to admins.
- [ ] **Admin: revert/invalidate purchase finalization** — Admins should be able to invalidate a finalized purchase for a day so it can be re-finalized. The original finalization should be preserved but marked as invalidated. Show in history: who invalidated, reason (required note).
- [ ] **Admin: delete events** — Ability to delete an event. All members receive an email notification: who deleted it, and what their personal settlement status was.
- [ ] **Receipt photo upload during finalization** — During purchase finalization, allow the buyer to upload a photo of the receipt. Show receipt photos in the history tab via a button that opens a modal.
- [ ] **Member notes (e.g. allergies)** — Members can set a per-event note visible to all members via a button in the members list (modal). Purpose: allergy info for buyers who may need to substitute items. Button only shown if a note exists. Open: where/how does a member configure this, and how to explain the purpose concisely.
- [ ] **Delivery fee ("Bring-Pauschale")** — Optional per-event setting for a flat delivery/errand fee. The buyer can opt in/out during finalization (checkbox, default: yes if configured). The fee is split among all members who ordered that day.
- [ ] **Personal order history** — New section in the History tab: "Persönlicher Verlauf" showing only the logged-in user's orders for finalized days. Columns: Date, Items received, Total. Example: `15.4. | 1× Kaffee, 2× Geiles Teil | 3,50 €`

## Validation

- [ ] **Item name length limit** — Restrict article names to 36 characters (frontend + backend).
- [ ] **Frontend price validation on event creation** — The event creation form does not validate prices inline like the admin price list does. Add the same validation hints (enter a name, valid price, price > 0).
