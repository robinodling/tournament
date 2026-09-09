# Tournament

A phone-first web app for running a group-based tournament — no backend, no accounts.
Live at **https://robinodling.github.io/tournament/**

Built for a pinball night, but generic: *players* are split into *groups* that each play on an
*arena* (a pinball machine, a table, a court — you choose the word), points are awarded by
placement within the group, and the schedule rotates everyone through as many different arenas
and opponents as possible.

## The format

- Pick a **group size** `k`. Each round, active players are split into groups of exactly `k`;
  each group plays on its own arena. Leftover players sit out (byes rotate fairly and earn the
  average points, or none — your choice).
- **Points**: 1st place in a group earns `k`, last earns 1 (groups of 4 → 4 / 3 / 2 / 1).
- **Standings**: total points, ties broken by count-back (most 1sts, then 2nds, …).
- **Schedule** is optimised for, in priority order: every player plays every arena (as evenly as
  possible), byes spread evenly, group-mates vary, arenas used evenly.
- **Final stage** (optional): after the rounds, either the top `k` in the standings play one
  final whose placements decide positions 1–`k`, or everyone plays *tiered* finals (standings
  1–`k` in the A-final, `k+1`–`2k` in the B-final, … one per arena) whose placements decide the
  overall order. Group-stage points remain the qualification table; finals decide positions,
  they do not add points. The admin can pick the arena for each final, re-seed it, or skip it.

### 8 players, 4 arenas, groups of 4, 4 rounds

Every player plays every arena exactly once. That is only possible if rounds come in pairs that
reuse the same split with the arenas swapped — so each player shares a group with one "rival"
in all four rounds, with four others twice, and never meets two people. The scheduler finds
this automatically. Alternatives: head-to-head (groups of 2) gives full coverage *and* no
repeated opponent in 4 rounds; groups of 4 over 6–8 rounds mixes opponents better.

## Running it

The admin uses the app on their phone:

1. **Setup** — name the tournament, choose the word for "arena", set how many players and
   arenas (quick-fill, then rename), group size, rounds. Generate the schedule, check the
   quality summary, re-draw if you like, start.
2. **Round** — shows every group and its arena, plus a "who plays where" list to read out.
   Tap a group and tap players in finishing order to record the result. When all groups are
   done, advance to the next round.
3. **Standings / Schedule** — live table; tap any group in any round to correct a result.
4. **Final** (if configured) — seeded automatically when the last round is done; enter each
   final like any group, then finish.
5. **Manage** — add or remove players (unplayed rounds are re-drawn, played ones are kept),
   swap a broken arena for a replacement (schedule kept), change the round count or final
   format, start the final early, install the app, export / import JSON, restore an automatic
   backup, or start over. Before a tournament is created, the Manage tab holds the
   device-level settings (install, storage, backups).

### Persistence

State is saved on every change to IndexedDB and mirrored to localStorage, with the last 40
states kept as backups. The app asks the browser for persistent storage and is installable
(the service worker precaches the app shell on first visit, which is what makes Chrome offer
**Install app**; an Install button appears in the app when the browser allows a prompt). On
iOS, **Add to Home Screen** is what exempts it from Safari's storage clean-up. Export a JSON
copy if you want a belt-and-braces backup.

## Development

```sh
pnpm install
pnpm dev        # http://localhost:5173/tournament/
pnpm test       # vitest
pnpm build      # type-check + production build to dist/
pnpm preview
```

Deploys automatically from `main` via GitHub Actions (`.github/workflows/deploy.yml`).
One-time repo setting: *Settings → Pages → Source: GitHub Actions*.

Stack: Vite, React, TypeScript, plain CSS. No runtime dependencies beyond React.
