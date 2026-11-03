# Othello — CPU Web App (Project No.4, Phase 1)

A complete, playable Othello (Reversi) game against a CPU opponent, built as a
plain static web app: **vanilla HTML/CSS/JS, no build step, no frameworks.**
`index.html` sits at the project root so it can be served from a domain root.

> **Hosting plan (Akira's decision, 2026-11-03):** spec item 18 (source must
> stay private) was **withdrawn** — the GitHub repo for this app will be
> **public**, under `tysseo7-meru`, and the app will be hosted on **GitHub
> Pages** from that public repo. (Repo creation/publishing is a separate step;
> this directory is the deployable content as-is.)

> **Phase 2 (later):** conversion for the Pi testnet / Pi Browser (Pi SDK
> integration, Pi username) is intentionally NOT included in phase 1.

## Features

- Standard Othello rules, 8×8. You are **Black** and move first. A player with
  no legal move passes; the game ends when both sides pass or the board is
  full; more discs wins; draws are possible.
- CPU difficulty (chosen on the top screen):
  - **Low** — noisy 1-ply greedy (random blunders).
  - **Mid** — positional greedy: corners first, avoids corner-adjacent squares
    while the corner is empty, flip count as tiebreak.
  - **High** — alpha-beta minimax, depth 6, positional + mobility evaluation;
    exact endgame search when ≤ 12 squares remain.
  - CPU "thinks" for ~600 ms so play feels natural.
- Legal-move hint markers, disc flip animations, and a wooden **"コト" click**
  (WebAudio-synthesized) on every placement and flip.
- Every button press plays a short **"ポチ" pop** (WebAudio-synthesized),
  wired by event delegation so all buttons — present and future — get it.
- Countdown: big graphical 3-2-1 plus a childlike synthesized voice —
  "3、2、1、ゲームスタート" (Japanese UI) or "3, 2, 1, Game start!" (English UI).
- BGM: Pachelbel's **Canon in D major** — our own rendition
  **synthesized at runtime with WebAudio**. The composition is public
  domain; no recording is used, so no performer's rights are involved.
  The arrangement loops 8 passes of the famous 8-chord ground
  (D–A–Bm–F♯m–G–D–G–A) with the 2-bar bass ostinato, flowing eighth-note
  arpeggios, and the first violin's melody (the F♯–E–D–B entry and the
  F♯–E–D–C♯–B–A–B–C♯ scale phrase) at quarter ≈ 66 — about 58 s per loop.
  Toggle on/off any time (top screen and in-game); the preference persists.
  Starts only after the first user gesture (autoplay policy).
- UI language: **English (default) / Japanese**, switchable on the top screen;
  every UI string goes through the EN/JA table in `js/i18n.js`. Persists.
- Username is required before a game; it persists in the browser.

## Ranking (wins only)

A win (and only a win) is recorded in the ranking database:

- Each browser keeps a persistent random **playerId** (UUID, localStorage).
- Record: `{ playerId, displayName, total, low, mid, high, updatedAt }`,
  where `updatedAt` is the time of the win that produced the current totals.
- **Display name rule:** at a player's first recorded win, their display name
  is their chosen username — unless a *different* playerId already holds that
  name, in which case they get `name(n)` with the smallest free natural
  number `n ≥ 2`. A player always merges into their own record and keeps the
  name they were first assigned.
- Ranking screen: sorted by total wins (desc), ties broken by `updatedAt`
  (earlier achiever first); **competition ranking** (1, 2, 2, 4). Every row
  with rank ≤ 30 is shown, so with ties the list can exceed 30 rows. Columns:
  rank, username, total wins, wins per level. Reachable after a game and from
  the top screen.

### Data backends (`js/db.js`)

One interface, two backends, selected by `js/config.js`:

| Mode | When | Storage |
|---|---|---|
| **local** (default) | `firebase: null` in config | browser `localStorage` (`othello.rankings.v1`) |
| **cloud** | `firebase: {...}` filled in | Cloud Firestore, collection `rankings`, doc id = playerId, via the official Firebase compat SDK from CDN |

> GitHub Pages is static hosting, so in cloud mode the browser talks to
> Firestore directly; the Firestore security rules are what protect the data.

### Reset

Open the app with **`?adm=reset&key=<RESET_KEY>`** to wipe all ranking records
(a confirmation banner is shown). The key lives in `js/config.js`
(`RESET_KEY`). **Because the repo is public, the key is visible in the
source** — it prevents only accidental/casual resets, it is not access
control.

## Configuration (`js/config.js`)

```js
window.APP_CONFIG = {
  RESET_KEY: "…",   // see above
  firebase: null    // fill with your Firebase web config to enable cloud mode:
                    // { apiKey, authDomain, projectId, appId }
};
```

## Assets & provenance

- `assets/countdown_ja.mp3`, `assets/countdown_en.mp3` — generated with a
  text-to-speech voice ("Giddy Confetti", bright/high female), then
  pitch-shifted ×1.32 with ffmpeg (tempo restored) to sound childlike.
  If a clip ever fails to load/play, the app falls back to the browser's
  `speechSynthesis` with pitch 1.6.
- BGM (a WebAudio-synthesized rendition of Pachelbel's Canon in D major;
  public-domain composition, own rendition) and the click/pop
  sounds: synthesized with WebAudio at runtime — no files, no third-party
  licenses involved.
- The favicon is an inline SVG data URI in `index.html`.

## Pi Network sign-in (`js/pi.js`)

Converted for Pi App Studio (2026-11-03). `index.html` loads the Pi SDK
(`https://sdk.minepi.com/pi-sdk.js`) and carries a connect-src-only CSP
meta (GitHub Pages cannot set HTTP headers). On load the app attempts
Pi sign-in once:

1. `Pi.init({ version: "2.0" })`, then `Pi.authenticate(["username"], …)`.
   The uid/username it returns are **not** trusted and are ignored.
2. The returned accessToken is exchanged once with App Studio
   (`POST https://backend.appstudio-u7cm9zhmha0ruwv8.piappengine.com/pi/auth/v1/login`).
   Only the response's `user.uid` / `user.username` become the player's
   identity: wins are recorded under playerId `pi:<uid>` with the Pi
   username as the display name, and the top screen shows it instead of
   the manual name input. The sessionToken stays in memory only.
3. Any failure (no SDK, not in Pi Browser, exchange error) silently
   falls back to the manual-username flow — the app behaves exactly as
   the non-Pi version in a normal browser.

`pi-app-validation.txt` at the repo root is the Pi App Studio domain
validation file (single token line, served verbatim by GitHub Pages).

## Run locally

```sh
cd othello-app
python3 -m http.server 8901
# open http://localhost:8901/
```

(Any static server works. Opening `index.html` via `file://` mostly works too,
but `localStorage`/audio behave best over http.)

## Tests

```sh
node tests/engine_test.js        # rules engine + CPU legality + ranking helpers (15 tests)
node tests/audio_test.js         # Canon arrangement data validation + no-AudioContext safety
# DOM end-to-end (needs the local server above and jsdom: npm install jsdom)
NODE_PATH=<path-to-jsdom>/node_modules node tests/dom_test.js       # 18 checks incl. a full game
NODE_PATH=<path-to-jsdom>/node_modules node tests/dom_win_test.js   # win path: win -> saved -> ranking record
NODE_PATH=<path-to-jsdom>/node_modules node tests/pi_auth_test.js   # Pi sign-in: no-SDK fallback + App Studio exchange identity
node tests/e2e_cdp.js            # optional: real-Chromium CDP test where a standalone
                                 # headless Chromium is available (CHROME_BIN)
```

## Structure

```
index.html          entry point (domain root)
css/style.css       all styles (mobile-first, responsive)
js/config.js        RESET_KEY + Firebase config placeholder
js/engine.js        pure Othello rules (browser + Node)
js/cpu.js           CPU: low / mid / high (alpha-beta)
js/i18n.js          EN/JA string table
js/db.js            ranking data layer (local / Firestore)
js/pi.js            Pi Network sign-in via App Studio token exchange
js/audio.js         WebAudio click + BGM, countdown voice (+ TTS fallback)
js/app.js           screens, game flow, countdown, ranking UI
pi-app-validation.txt  Pi App Studio domain validation token
assets/             countdown voice clips (ja/en)
tests/              engine unit tests + DOM end-to-end tests
```
