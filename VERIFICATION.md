# Verification record

Verified locally on 2026-09-20 against the actual production Docker Compose application.

## Passed

- `docker compose up --build -d`: production image built and started successfully.
- Container reports healthy; `GET /health` returns HTTP 200 and `{"status":"ok"}`.
- Strict TypeScript check and production Vite/server builds pass.
- ESLint and Prettier checks pass.
- **17 engine and real-socket tests pass**, covering question generation, deadlines, independent progress, phase barriers, correct/incorrect/timeout scoring, tie-breaks, answer-key privacy, duplicate/stale rejection, capacity, reconnection, rematches, and cleanup.
- **Two-browser multiplayer E2E passes**: separate guest sessions create/join/start, receive identical visuals/options, play all 30 questions, wait at phase barriers, recover after a browser refresh, receive matching final statistics, request a mutual rematch, and leave cleanly.
- Desktop browser viewport: 1440 × 1000. Mobile gameplay: 390 × 844 and 320 × 760. Horizontal overflow checks pass.
- Mobile welcome test passes at 320px, including keyboard form submission.
- No browser JavaScript or console errors in the complete multiplayer run.
- All **80 flag SVGs** render pixel-identically to their upstream originals after country-coded IDs and descriptive metadata are sanitized.
- All eligible country silhouettes were visually inspected together. Projection seam and distant-island issues were corrected before delivery.

## Review artifacts

Screenshots are in `artifacts/`, including desktop welcome/lobby/waiting/game/results screens, mobile gameplay/results, 320px flag/capital questions, and a contact sheet of all eligible silhouettes.

## Intentional operating constraints

The service is a single-process, ephemeral guest game. Restarting the server clears rooms and matches. Reconnection restores sessions during the 45-second grace period, while question timers continue. Public deployment should terminate HTTPS at a reverse proxy. No external geography API or flag CDN is required for gameplay.
