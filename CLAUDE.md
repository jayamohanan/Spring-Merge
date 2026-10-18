# Merge Spring (folder: Spring Merge)

A landscape casual merge + springs game for web portals (Poki). Phaser 3 (custom build), plain JS, no bundler.

**Left half:** a 3×3 merge grid of "piggies". Each piggy is a piggy picture plus a steering-wheel picture, composed into one texture. Merge equal levels; spawn with coins.

**Right half (top half in portrait):** three vertical springs in a row, a slot under each along the half's bottom edge. A piggy in a slot squeezes the spring above it by its value once a second. When all three are full, one RELEASE button lets them go and pays coins.

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
| `levelData.js` | `LEVEL_STRENGTHS` (the monster table: three spring strengths per level) and payouts. |
| `batteryChargeData.js` | Piggy value per level. |
| `assets.js` | Asset list shared by `game.js` and `build.sh`. |
| `build.sh` | Builds `build/`: copies files, adds preload hints, strips comments with esbuild, joins the five scripts into one `game.js` (so no two files may declare the same top-level name). |

The scripts share globals. The custom Phaser build has no `this.add.circle` / shapes and no `Phaser.Math.Easing`; use graphics and ease strings.

**Run locally:** a static server, e.g. `python3 -m http.server`, or VS Code Live Server. Add `?newgame` to the URL for a fresh run. Saving is off (`CONFIG.SAVE.ENABLED: false`). On localhost the Poki SDK adds about 6 s to loading (its init times out).

## Legacy names

| Name in code | Means |
|---|---|
| "battery" | a piggy |
| `platforms` / `chargingSlots` | the three slots under the springs |

## The springs (game.js, "CHARGING" and "THE SPRINGS" sections)

- **State** is `this.springs[i]` (made in `init`): `max` (strength, the level's row of `LEVEL_STRENGTHS`), `compressed`, `squeeze` (what is drawn, 0..1), `phase` (`compressing` / `ready` / `releasing`). A relayout keeps it; `createSprings` only rebuilds the view (`springGfx`, `springLabels`, `releaseBtn`, the slots) and `springGeo` (`xs`, `baseY`, size factor `k`).
- **Tick:** `chargeCycle` (1 s) adds the slot piggy's `perSec` to its spring until full, then `_stepSpring` tweens `squeeze` over `STEP_MS`.
- **Release:** `_releaseSprings` (only when all are `ready`): `Elastic.Out` back to rest, ripple, dust, camera shake, coins (`levelPayoutsFor(level)`), then `this.level` goes up and each spring comes back with the next row's strength.
- **Drawing:** `_updateSprings` every frame → `_drawSprings` / `_drawSpring` (helix coil, plates, glow when full). Every design px is multiplied by `springGeo.k`.
- **Wheels:** a slot piggy's wheel turns while its spring is compressing (`_steerWheels`, `_springWorking`).

## Other systems

- **Layout and relayout:** `calculateLayout`, `_relayout`. A relayout waits for `_unsettledBy()` to return null.
- **Tests (when needed):** puppeteer-core with the system Chrome. Capture the scene by trapping `window.Phaser` on new document and subclassing `Scene` to set `window.__sc`. There is no `Phaser.GAMES` in the custom build.

## Style

Comments explain why, and often open with an ALL-CAPS lead. Match the surrounding density and idiom. Config entries carry a comment saying what they do and their unit (`px @ design` = scaled by `platformScale`).
