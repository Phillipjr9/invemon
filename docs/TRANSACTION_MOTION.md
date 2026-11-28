# Transaction flow motion

Shared styles: `src/components/transaction-motion.css`. Scoped to `.transaction-flow` on internal trading, withdrawals, finance admin, inventory admin, account timeline and email settings. No new runtime dependency or global animation library.

- Short 220–240ms opacity/6px entry transitions for newly mounted status, review and activity panels; existing keyed records do not animate on every render.
- Restrained button press/hover feedback and visible keyboard focus. Hover lifting applies only on hover-capable devices. No shake, flashing, confetti or animated money counters.
- Indeterminate spinner accompanies actual pending requests only. It is not a completion percentage. Existing idempotency, financial guards and disabled controls remain unchanged.
- Internal trading steps: choose amount → review/confirm → recorded. Recorded is shown only after successful server acceptance, never after requesting a quote. Editing the pair/amount clears the previous success step.
- Quote validity bar reflects server `expires_at`, capped at the 30-second quote maximum. It is time remaining, not a funding/progress guarantee. The existing explicit expired message and confirmation-disabled state remain. No timer is scheduled without a quote. Backend expiry remains authoritative.
- Keyboard focus moves to the new quote heading, then to confirmed success text after server success. Pending text and expiry text are separate; expiry is not a live-region announcement every second.
- `prefers-reduced-motion: reduce` removes transitions, animation and hover translations throughout these scoped flows. Spinner becomes a static dotted indicator with readable loading text. Content remains visible without animation.
- The email HTML itself stays static and inbox-safe; only web notification settings/history get motion. Server queues and actual email delivery semantics are unchanged.

Validation: 149 automated tests, TypeScript/build/diff checks, and 11 HTTP-mocked browser suites. Trading browser checks include delayed confirmation (no premature success), heading/success focus, countdown presence, reduced-motion computed styles, light/dark themes and 320–1440px layouts. Browser tooling is installed only in the local workspace, not added to package dependencies or lockfile. No production deployment/settings/migration is performed by these UI changes.
