# Project Requirements Document: Mampfi

## Project Description

Mampfi is a web application designed to facilitate daily group orders, such as getting breakfast during a trip. It works seamlessly on both mobile and desktop.  

Groups organize themselves into *events* with a defined start and end date. The creator of an event sets up a static price list of orderable items at the beginning. After that, all members share equal rights within the event.  

Members place their daily orders from the predefined list. Orders automatically roll over to the next day unless changed. To provide structure, each event has a *cut-off time* after which orders for the next day can no longer be modified.  

Each day, one member can volunteer as the *buyer* (for today or tomorrow). The buyer is responsible for purchasing the aggregated order using their own money and may adjust the final order if certain items are unavailable. The app does not assign buyers automatically.  

Mampfi tracks expenses virtually: no external payment providers are involved. Instead, the app keeps balances and provides a *cash-up* function at any time, showing who owes what. Payments between members are made outside the app but must be confirmed by both sides within the system to ensure consistent balances.  

Events can be created, joined, and left at any time. Past events are archived and remain accessible for reference, while active events allow daily orders and settlements.  

---

## Functional Requirements

| Requirement ID | Description | User Story | Expected Behavior / Outcome |
|----------------|-------------|------------|-----------------------------|
| FR-001 | Create event with dates, cutoff & price list | As a member, I want to create an event with start/end date, timezone, a daily cutoff time, and a static price list, so that our group has clear boundaries and ordering rules. | Event is created with name, description, start/end, timezone, cutoff time, and initial price list. After creation, the price list is read-only. |
| FR-002 | Invite & join via link | As a member, I want to invite others and let them join via an invite link, so that the group can participate easily. | Invite link is generated; invited users can sign up (if needed) and join the event. |
| FR-003 | Leave event | As a member, I want to leave an event, so that I no longer participate in orders or balances. | Member leaves; open balances remain recorded; historical data is preserved. |
| FR-004 | Place daily order | As a member, I want to place my order for a given day from the event’s price list, so that it’s included in the group purchase. | Order is stored per day and aggregated with others. Default target day is the next day. |
| FR-005 | Order rollover | As a member, I want my latest order to roll over to the next day unless I change it, so that I don’t have to reorder daily. | Next day’s order is pre-filled from the previous day until cutoff. |
| FR-006 | Cutoff locking | As a member, I want orders to lock at the daily cutoff for the next day, so that the buyer has a stable list. | After cutoff, orders for the next day are read-only; late attempts are rejected with guidance. |
| FR-007 | Volunteer as buyer | As a member, I want to claim the buyer role for today or tomorrow, so that the group doesn’t need automatic assignment. | Member can claim buyer for a specific date; conflicts are handled (first come, or replace with confirmation). |
| FR-008 | Buyer finalization & adjustments | As the buyer, I want to finalize and adjust the aggregated order (e.g., replace unavailable items), so that the purchase reflects reality. | Buyer can mark substitutions/omissions and record actual quantities and total spend. Changes are tracked. |
| FR-009 | Cash-up calculation (virtual) | As a member, I want to trigger a cash-up, so that I can see who owes whom based on recorded purchases. | System calculates per-member balances from orders and buyer spends; shows net settlements. |
| FR-010 | Payment logging & confirmation | As a member, I want to log a payment and have the recipient confirm it, so that balances are trustworthy. | Payment affects balances only after both parties confirm; status is visible to both. |
| FR-011 | Event archive | As a member, I want events to move to a Past Events view after the end date, so that history is kept but not cluttering active work. | On/after end date, event becomes read-only (except cash-up & confirmations) and appears under Past Events. |
| FR-012 | Notifications (optional) | As a member, I want notifications for key actions (buyer claimed, cutoff reached/locked, payment confirmation requests), so that I don’t miss important moments. | Email and/or in-app notifications can be enabled per event/user. |
| FR-013 | User signup via invite | As a user, I want to sign up via an invite, so that I can access the event. | Account is created/linked to the invited event; minimal profile stored. |


---

## Non-Functional Requirements

| Requirement ID | Category | Description |
|----------------|----------|-------------|
| NFR-001 | Security | Access must be secured with user authentication, HTTPS, and invite-only event participation. |
| NFR-002 | Usability | The UI must be intuitive and optimized for both mobile and desktop usage. |
| NFR-003 | Performance | The app should respond to user interactions within 300ms for a smooth experience. |
| NFR-004 | Availability | The service should be available 99.5% of the time during event durations. |
| NFR-005 | Data integrity | Cash-up and payments must remain consistent even with concurrent updates. |
| NFR-006 | Persistence | Past events and historical data must be stored and accessible in a dedicated archive view. |
| NFR-007 | Notifications | Notifications (email/in-app) must be delivered reliably within a few minutes of triggering events. |
| NFR-008 | Scalability | The system should handle at least several hundred active users and events concurrently without degradation. |
| NFR-009 | Internationalization | The frontend should support multiple languages. At minimum, German (default) and English must be implemented. |
| NFR-010 | Currency support | The app should support multiple currencies. Each event has exactly one chosen currency, which is fixed at creation time and used for all orders and balances in that event. |


---

## Look & Feel

The application should provide a modern, lightweight, and friendly user experience that matches the casual group-use context:

- **Visual style:** clean and minimal with soft colors, rounded corners, and subtle shadows (using TailwindCSS + shadcn/ui defaults).
- **Tone:** approachable and playful (aligning with the project name *Mampfi*), while keeping clarity and readability.
- **Layout:** simple grid and card-based layouts for events, orders, and cash-up screens.
- **Mobile-first:** responsive design optimized for small screens; desktop layouts expand naturally with more space.
- **Feedback:** animations and transitions should be smooth (e.g., button presses, order changes), with immediate confirmation via toasts/snackbars.
- **Accessibility:** follow WCAG AA where feasible (color contrast, keyboard navigation, aria labels).
- **Internationalization:** UI strings loaded from i18n resources, with German as default and English as alternative.
- **Branding:** logo/iconography that conveys group-sharing and food-ordering in a lighthearted manner.

---

## Technology Decisions

### Backend
- **Framework:** FastAPI
- **Data models & validation:** Pydantic + **SQLModel** (for ORM-style models and migrations via Alembic)
- **Database:** PostgreSQL
- **Auth & sessions:** Invite-based signup; server-generated invite tokens; session via httpOnly cookie (JWT or session ID). Password reset optional.
- **Time & scheduling:** All event times (start/end, cutoff) stored in UTC with event **timezone** saved; cutoff evaluation done server-side.
- **Money:** Amounts stored as integers (minor units, e.g., cents); currency as ISO 4217 code per event.
- **API style:** REST/JSON with clear resource boundaries (events, orders, buyer-claims, purchases, payments); optimistic concurrency for buyer finalization.
- **Testing:** Pytest; factories for fixtures; integration tests against ephemeral Postgres.

### Frontend
- **Type:** SPA + PWA (installierbar, offline-fähige UI)
- **Stack:** React + TypeScript + Vite
- **Routing:** React Router
- **Server State:** TanStack Query (Caching, Mutations, Refetch-on-focus)
- **Forms/Validation:** react-hook-form + zod
- **Styling/UI:** Tailwind CSS + shadcn/ui; Icons: lucide-react
- **Internationalization:** react-i18next (Sprachen: **DE Standard**, EN)
- **Dates/Timezones:** luxon (oder Temporal Polyfill bei Bedarf)
- **Currency/Formatting:** Intl.NumberFormat basierend auf Event-Währung
- **PWA:** @vite-pwa/plugin (App Shell, Offline-Fallback)
- **Testing:** Vitest, React Testing Library, Playwright (E2E)
