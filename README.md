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
- **Final stage** (optional), seeded from the standings after the rounds:
  - *Top-k final* — the best `k` play one final whose placements decide positions 1–`k`.
  - *Finals for everyone* — tiered finals (standings 1–`k` in the A-final, `k+1`–`2k` in the
    B-final, … one per arena) whose placements decide the overall order.
  - *Knockout bracket* — everyone (or the top 4/8/16) enters a single-elimination tree seeded
    1st vs last, 2nd vs second-last, … so the top two can only meet in the final. Head-to-head
    matches, winner advances; if the count isn't a power of two the top seeds get first-round
    byes; semifinal losers play a bronze match. Editing an earlier match cascades downstream.

  Group-stage points remain the qualification table; the final stage decides positions, it
  does not add points. The admin can pick (or randomise) the arena for each final/match,
  re-seed, or skip the stage.

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

Installed apps update themselves: the worker is network-first, so a new release is used the
next time the app is opened online; if a release lands while the app is open, a "new version
is ready — Reload" banner appears. No reinstall needed.

## Live scoring (optional, Firebase)

Players can follow the tournament on their own phones and send their group's result to the
organiser. The organiser's device stays the source of truth: it publishes the tournament to a
*room* and applies incoming results through the normal `SET_RESULT` path (so they are validated
and can be corrected).

### Why the Firebase config is committed

The web-app config (`apiKey`, `projectId`, `databaseURL`, `appId`) identifies the project; it is
not a secret and every Firebase site ships it in its bundle. Access control is enforced
server-side by `database.rules.json`:

- nothing is readable or writable by default, and rooms cannot be listed;
- a room is readable by anyone who knows its 6-character code (~10⁹ combinations);
- `state` is writable only by the anonymous identity that created the room (`adminUid`, written
  once);
- `results/{groupId}` is writable by anyone with the code, with the shape and size validated;
- `registrations/{uid}` is writable only by that identity (players joining from their own phone).

The only secret Firebase has — the Admin SDK service-account key — is never used here.

### One-time setup

1. [Firebase console](https://console.firebase.google.com) → *Add project* (Analytics off).
2. *Build → Realtime Database → Create database* (europe-west1, **locked mode**), then paste
   `database.rules.json` under *Rules* and publish.
3. *Build → Authentication → Sign-in method → Anonymous → Enable.*
4. *Authentication → Settings → Authorized domains* → add `robinodling.github.io`.
5. *Project settings → Your apps → Web* → copy the config into `src/lib/firebaseConfig.ts`.

The Firebase client is loaded lazily, only when a room is used; without a config the feature
is simply hidden. Rooms are created from *Live scoring* (on the Setup page or under Manage);
players open the shared link (`…/tournament/?room=CODE`). Before the start they can **join the
roster** from their phone (the organiser's app adds them, linking to a pre-entered name if it
matches); once the tournament runs, registered phones are recognised automatically and everyone
else picks their name (or *Just watching*). Players can then send results only for the groups
and matches they play in.

Games flow on their own: a group is playable once every player in it has finished their earlier
rounds and its arena is free, and each player's phone shows their own next game (ready, or
waiting for whom/what). When it becomes ready the phone alerts them — a system notification via
the service worker where the browser allows it (Android; on iPhone only as a Home Screen app),
plus a vibration, a short sound and an in-app banner. The bell in the room header turns this
off per phone (default on). That gate is client-side — the organiser's app
validates every incoming result and can overrule it — which is plenty for friends and keeps the
database rules simple.

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
