# Merge Driver (folder: Merge Racer)

A landscape casual merge + racing game for web portals (Poki). Phaser 3 (custom build), plain JS, no bundler.

**Left half:** a 3×3 merge grid of "piggies". Each piggy is a piggy picture plus a steering-wheel picture, composed into one texture. Merge equal levels; spawn with coins.

**Right half:** three race lanes. A piggy dropped in a lane's slot drives that lane's car. Its value is taken off the rival's lead every second.

Each level is three races against one rival, three times over. Winning all three ranks you up (`#2000 → #1` by level 65). The player always wins: the lead only ever has to be run down.

## Working with the user

- **Do only what is asked.** Minimal change, no unrequested refactors or redesigns. Suggest bigger cleanups separately.
- **Simple features:** make the edit, run `node --check game.js config.js`, and stop. The user tests manually.
- **Browser tests:** only when behaviour is genuinely uncertain (motion, timing). They play in real time and cost minutes.
- **Explain before changing** when the user asks "what do you think", "first check" or "no code change".
- **Don't commit** unless asked.
- **`changes.md`** is only added to when explicitly asked.
- Keep replies short. The user's connection is metered.

## Files

| File | What it is |
|---|---|
| `index.html` | Page with an HTML loading bar. Loads the scripts in order. |
| `game.js` | Everything runtime: `GameScene`, boot, Poki, save. ~5k lines. |
| `config.js` | One big `CONFIG` object. All tunables live here; read in code with defaults: `v(C.X, default)`. |
| `levelData.js` | `LEVEL_DISTANCES` (each lane's lead per level) and payouts. |
| `batteryChargeData.js` | Piggy value per level. |
| `assets.js` | Asset list shared by `game.js` and `build.sh`. |
| `build.sh` | Builds `build/`: copies files, adds preload hints, strips comments with esbuild, joins the five scripts into one `game.js` (so no two files may declare the same top-level name). |

The scripts share globals. The custom Phaser build has no `this.add.circle` / shapes and no `Phaser.Math.Easing`; use graphics and ease strings.

**Run locally:** a static server, e.g. `python3 -m http.server`, or VS Code Live Server. Add `?newgame` to the URL for a fresh run. Saving is off (`CONFIG.SAVE.ENABLED: false`). On localhost the Poki SDK adds about 6 s to loading (its init times out).

## Legacy names (this began as a chase game; the names stayed)

| Name in code | Means |
|---|---|
| "battery" | a piggy |
| `VILLAIN` / `villains[i]` / `_makeGetawayCar` | the rival and its car (driver's head in the window, art in `graphics/villain/`) |
| `lane.caught` | lane won |
| `villainArea` | free area right of the cars |

## The race (game.js, "THE RACE" section)

Each lane is a small world with its own camera. Everything goes through `this.race[i]` and `_raceStep` (once per frame).

- **World and camera:** cars have world x and speed (`rc.pw`/`rc.vp` for the player, `rc.rw`/`rc.vr` for the rival). `rc.cam` is one number. Screen x = world x − cam. The road scroll is `roadOffsets[i] = rc.road0 + rc.cam`.
- **The finish line** is fixed in the world (`rc.fin.flagW`). It never moves by itself.
- **V** = road speed = `ROAD.SPEED × platformScale`. Tyre spin is proportional to the car's speed (`RACE.SPIN_AT_ROAD`).

Phases (`rc.phase`):

1. **`wait`:** the rival has dropped in (`_raceIntro` / `_dropRival`), lined up with the player. Nothing moves until a piggy is in the slot.
2. **`lead`** (`_raceStartLead`): the rival reaches V fast and keeps it; the player gets to V later, so the gap opens to the whole lead. The camera is on the player. `lane.shown` counts up.
3. **`race`:** the camera holds the rival at `RIVAL_AT` on screen.
   - `chargeCycle` (1 s tick) steps `lane.left` by the piggy's value; the figure shows `lane.left`.
   - The car glides: `lane.track` follows `lane.left` at the piggy's rate per frame, and the player's screen x = `_raceCarAt(track)`.
   - At 0 on a won lane (`lane.closing`), the finish starts.
4. **`finish`** (`_raceFinish`):
   - The flag is placed `AHEAD_MS` of the car's speed ahead.
   - The player keeps its speed until wholly across, then brakes. The rival keeps V until its nose is over, then brakes.
   - The camera follows the player (`P0`/`u0` drift, then eases to `Pend`).
   - The cars roll on until the flag is off-frame (`LINE.OFF_PAD`). End spots come from `_raceGeom` (varied per lane via `VARY`, hashed by lane and level).
5. **`done`** (`_raceFinishDone`): badges, then `lane.finishing = false`, then `_turnWhenDone` → rank panel (`_showRankUp`) → `_nextLevel`.

- **Lane record:** `_levelLanes` creates it. Fields: `left`, `total`, `payout`, `caught`, `surged`, `leading`, `dropped`, `closing`, `finishing`, `final`, `ahead`, `track`, `over`, `overRate`. A rebuild (relayout) recreates `race[i]` from this record via `_raceSetup`.
- **Final lane** (`lane.final`, the level's last win): lunge (`_lunge`, a visual push folded into the position at the end), per-lane zoom (`_laneZoom`: a second Phaser camera over that lane's band), and confetti. Every lane gets `_winFx` (burst, FINISH!, hop, coins).
- **Road camera:** `this.roadCam`, viewport = car area, drawn first. Every road object must be wrapped in `_onRoad(...)` so it is clipped to the road area. `_roadCamFilter` routes objects each frame: the main camera draws the grid, slots, coins and UI. **Anything new drawn on the road must use `_onRoad`.**
- **Green figure:** after 0, `lane.ahead` counts up at the piggy's rate until the nose crosses (`_freezeAhead`).

## Other systems

- **Rank:** `_rankAfter(L)` is a geometric table from `RANK.START` to #1 at `TOP_LEVEL`, one place per level for the last `TAIL` levels. `_racerName(rank)` is hashed from `RANK.NAMES`.
- **Layout and relayout:** `calculateLayout`, `_relayout`. A relayout waits for `_unsettledBy()` to return null.
- **Tests (when needed):** puppeteer-core with the system Chrome. Capture the scene by trapping `window.Phaser` on new document and subclassing `Scene` to set `window.__sc`. There is no `Phaser.GAMES` in the custom build.

## Style

Comments explain why, and often open with an ALL-CAPS lead. Match the surrounding density and idiom. Config entries carry a comment saying what they do and their unit (`px @ design` = scaled by `platformScale`).
