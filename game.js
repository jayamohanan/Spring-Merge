// Merge Spring — main game scene
// No physics engine — pure drag/drop merge, with the spring half beside it: the
// pigs in its three slots squeeze the springs, and releasing them pays the coins.

// AN ITEM'S ART CAN RUN PAST ITS PIG. The pig face is the top-left
// CELL.ICON_PIG_PX square of the texture; the rest of the canvas (the tool) is
// allowed out of the icon box. So the ORIGIN goes on the pig's centre — the
// sprite is still placed at the box's centre and the pig lands exactly there —
// and the size is set so that square, not the whole canvas, is pigW × pigH.
function itemPigOrigin(spr) {
    const P = CONFIG.CELL.ICON_PIG_PX || 128;
    const f = spr.frame;
    return spr.setOrigin(Math.min(1, P / 2 / f.realWidth), Math.min(1, P / 2 / f.realHeight));
}
function fitItemIcon(spr, pigW, pigH) {
    const P = CONFIG.CELL.ICON_PIG_PX || 128;
    const f = spr.frame;
    itemPigOrigin(spr);
    return spr.setDisplaySize(pigW * f.realWidth / P, pigH * f.realHeight / P);
}

class AssetManager {
    constructor(scene) {
        this.scene = scene;
        this.loading = new Map();
    }

    ensureImage(key, url) {
        if (this.scene.textures.exists(key)) {
            return Promise.resolve();
        }

        if (this.loading.has(key)) {
            return this.loading.get(key);
        }

        // RESOLVES EITHER WAY, and only on ITS OWN file. It used to reject, and
        // to listen for the next 'loaderror' from ANY file — so one unrelated
        // failed download rejected whichever battery happened to be in flight,
        // and the await that was waiting on it threw. Whatever it was building
        // was then never built.
        const promise = new Promise((resolve) => {
            const done = () => {
                this.scene.load.off(`filecomplete-image-${key}`, ok);
                this.scene.load.off('loaderror', fail);
                this.loading.delete(key);
                resolve();
            };
            const ok = () => done();
            const fail = (file) => { if (!file || file.key === key) done(); };
            this.scene.load.on(`filecomplete-image-${key}`, ok);
            this.scene.load.on('loaderror', fail);
            this.scene.load.image(key, url);
            this.scene.load.start();
        });

        this.loading.set(key, promise);
        return promise;
    }

    // AN ITEM'S TEXTURE, `battery<iconLvl>`: its piggy and its steering wheel
    // fetched, then drawn together into one (composeBattery). Resolves either
    // way, like ensureImage — if a picture fails the item is simply not there.
    ensureBattery(iconLvl) {
        const key = `battery${iconLvl}`;
        if (this.scene.textures.exists(key)) return Promise.resolve();
        if (this.loading.has(key)) return this.loading.get(key);
        const promise = Promise.all([
            this.ensureImage(itemPiggyKey(iconLvl), itemPiggyPath(iconLvl)),
            this.ensureImage(itemWheelKey(iconLvl), itemWheelPath(iconLvl)),
        ]).then(() => {
            this.loading.delete(key);
            if (this.scene.sys && this.scene.sys.isActive()) this.composeBattery(iconLvl);
        });
        this.loading.set(key, promise);
        return promise;
    }

    // THE PIGGY WITH ITS WHEEL ON, baked into one canvas texture the size of
    // the piggy, or bigger where the wheel runs past it — the wheel at
    // ITEM_ART.WHEEL_AT, scaled with the piggy if the art is not the reference
    // size. Needs both pictures in hand; returns whether the texture now exists.
    composeBattery(iconLvl) {
        const T = this.scene.textures;
        const key = `battery${iconLvl}`;
        if (T.exists(key)) return true;
        const pk = itemPiggyKey(iconLvl), wk = itemWheelKey(iconLvl);
        if (!T.exists(pk) || !T.exists(wk)) return false;
        const pig = T.get(pk).getSourceImage(), wheel = T.get(wk).getSourceImage();
        const at = ITEM_ART.WHEEL_AT;
        const kx = pig.width / ITEM_ART.REF_W, ky = pig.height / ITEM_ART.REF_H;
        const cw = Math.max(pig.width,  Math.ceil((at.x + at.size) * kx));
        const ch = Math.max(pig.height, Math.ceil((at.y + at.size) * ky));
        const canvas = T.createCanvas(key, cw, ch);
        if (!canvas) return false;
        const ctx = canvas.getContext();
        ctx.drawImage(pig, 0, 0);
        ctx.drawImage(wheel, at.x * kx, at.y * ky, at.size * kx, at.size * ky);
        canvas.refresh();
        return true;
    }

    // A battery texture that EXISTS RIGHT NOW: the level's own if it is in
    // hand, otherwise the nearest lower one already loaded.
    //
    // Nothing waits for a download before it is drawn. A merge result held back
    // until its picture arrived left a battery that was in the grid but on
    // screen as nothing — and a cell that looked empty took another battery on
    // top of it. The tile appears at once wearing the closest picture there is,
    // and swaps to its own the moment that lands.
    iconKey(iconLvl) {
        for (let l = iconLvl; l >= 1; l--) {
            const k = `battery${l}`;
            if (this.scene.textures.exists(k)) return k;
        }
        return `battery${iconLvl}`;
    }

    // A PIGGY IN A SLOT: `spr` wears the piggy alone and `wheel` its steering
    // wheel, as soon as both pictures are in hand — the wheel is a sprite of
    // its own there, so it can turn (see GameScene._steerWheels). Until then
    // the wheel stays hidden and the sprite wears whatever it already has.
    dressSlotWhenReady(spr, wheel, iconLvl) {
        const T = this.scene.textures;
        const wear = () => {
            if (!spr.scene || !wheel.scene) return;
            const pk = itemPiggyKey(iconLvl), wk = itemWheelKey(iconLvl);
            if (!T.exists(pk) || !T.exists(wk)) return;
            spr.setTexture(pk);
            itemPigOrigin(spr);
            wheel.setTexture(wk);
            wheel.ready = true;
        };
        if (T.exists(itemPiggyKey(iconLvl)) && T.exists(itemWheelKey(iconLvl))) wear();
        else this.ensureBattery(iconLvl).then(wear);
    }

    // Draw `spr` as `iconLvl` as soon as that art is in hand. Safe to call for a
    // texture already loaded — it simply sets it.
    dressWhenReady(spr, iconLvl) {
        // setTexture keeps the sprite's SCALE, and every item's pig is the
        // same ICON_PIG_PX square — so the same scale keeps the pig the same
        // size on any canvas, and a bigger canvas just spills further out. Only
        // the origin has to follow the new canvas (see fitItemIcon).
        const wear = (key) => {
            spr.setTexture(key);
            itemPigOrigin(spr);
        };
        const key = `battery${iconLvl}`;
        if (this.scene.textures.exists(key)) { wear(key); return; }
        this.ensureBattery(iconLvl).then(() => {
            if (spr && spr.scene && this.scene.textures.exists(key)) wear(key);
        });
    }

    // Warm a battery level in the background (fire-and-forget).
    // ensureBattery already dedupes via textures.exists + the loading Map.
    prefetchBattery(level) {
        if (level < 1) return;
        this.ensureBattery(level).catch(() => {});
    }

    // ...and the few after it. A battery icon is ~2.5KB, so fetching several
    // levels ahead costs almost nothing and means a fast run of merges never
    // reaches a level whose picture has not arrived. Anything already loaded or
    // in flight is skipped, so calling this on every merge is free.
    prefetchAhead(level) {
        const n = Math.max(1, CONFIG.BATTERY_PREFETCH_AHEAD !== undefined
                            ? CONFIG.BATTERY_PREFETCH_AHEAD : 3);
        const top = getHighestBatteryLevel();
        for (let l = level; l < level + n && l <= top; l++) this.prefetchBattery(l);
    }
}

// Blend two 0xRRGGBB colours; k 0 → a, 1 → b.
function lerpColor(a, b, k) {
    const ch = (sh) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * k);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

class GameScene extends Phaser.Scene {
    constructor() { super('GameScene'); }

    // ================================================================
    // INIT
    // ================================================================
    init() {
        this.platforms          = [];   // 3 battery slots (share this name so the
                                        // drag/drop code keeps working unchanged)
        this.coins              = CONFIG.START_COINS;
        this.grid               = Array(3).fill(null).map(() => Array(3).fill(null));
        this.gridCells          = [];
        this.batteries          = [];
        this.draggingBattery    = null;
        this.hasStartedPlaying  = false;
        this.spawnButtonLevel   = CONFIG.BATTERY_START_LEVEL;
        this.spawnCost          = CONFIG.ECONOMY.SPAWN_COST_PER_LEVEL * CONFIG.BATTERY_START_LEVEL;
        this.highestBatteryLevel = CONFIG.BATTERY_START_LEVEL;
        this.levelUpTimer       = null;
        this.levelUpButtonVisible    = false;
        this.levelUpButtonShowTime   = null;
        this.firstLevelUpTimer  = true;
        this.mergeTutorialShown = false;
        this.mergePointer       = null;
        this.slotHints          = null;   // the "put one here" arrows, per slot
        this.slotHintPending    = false;  // …scheduled but not yet up
        this.slotHintDone       = false;  // …every slot has had its first pig
        this.slotHintSeen       = [false, false, false];  // …per slot: had its first pig
        this.isWatchingAd = false;  // Flag to block interactions during ad

        this.CELL_SIZE  = CONFIG.CELL.SIZE;
        this.CELL_GAP   = CONFIG.CELL.GAP;
        this.GRID_COLS  = 3;
        this.GRID_ROWS  = 3;

        this.chargingSlots    = [null, null, null];
        this.chargingInterval = null;

        // ── The springs ──────────────────────────────────────────────────
        // SPRING STATE lives here, not in the view, so a relayout keeps it.
        // One per slot, strengths from the level's row (levelData.js):
        //   max        — its strength: units to reach fully compressed
        //   compressed — units applied so far (0..max)
        //   squeeze    — what is DRAWN, 0 relaxed .. 1 fully compressed
        //   phase      — 'compressing' | 'ready' | 'releasing'
        this.level = 1;
        const strengths = levelStrengthsFor(this.level);
        this.springs = [0, 1, 2].map((i) => ({
            max: strengths[i], compressed: 0, squeeze: 0, phase: 'compressing',
        }));
        this.springGeo         = null;   // where they are drawn (createSprings)
        this.springGfx         = null;
        this.springLabels      = [];
        this.countdown         = null;   // the 3-2-1 before a launch (_startCountdown)
        this.steeringItems     = [];     // slot piggies whose wheels turn

        // Layout state for responsive design
        this.isPortrait         = true;  // Detected in create()
        this.layoutConfig       = {};    // Will store calculated layout values
    }

    // ================================================================
    // LAYOUT HELPERS
    // ================================================================
    calculateLayout() {
        const W = this.scale.width;
        const H = this.scale.height;
        this.isPortrait = H > W;

        // THE DESIGN FIGURES, FROM THE CONFIG — never this.CELL_SIZE / CELL_GAP,
        // which hold the SCALED sizes once a layout has run (see
        // _applyLayoutFields). Read from there, a relayout scaled an already
        // scaled cell again, and the grid grew with every turn of the screen.
        const COLS = this.GRID_COLS, ROWS = this.GRID_ROWS, GAP = CONFIG.CELL.GAP;
        const P    = CONFIG.PLATFORM;
        const isP  = this.isPortrait;

        // Design-space constants. None of these depend on the split, so they
        // come first: the design column is built out of them.
        const BASE        = CONFIG.CELL.SIZE;                         // 130
        const panPadRef   = CONFIG.CELL.GRID_PANEL_PADDING;          // 14
        const btnBotRef   = CONFIG.BUTTON.BOTTOM_PADDING;            // 70
        const btnGridRef  = CONFIG.MERGE_GRID.PADDING_FROM_BUTTON_TOP; // 50
        const coinGapRef  = 25;
        const coinHRef    = 32;                                      // counter height
        const spawnBtnLogHalfRef = CONFIG.BUTTON.SPAWN_HEIGHT / 2;   // 45
        const designGridH = ROWS * BASE + (ROWS - 1) * CONFIG.CELL.GAP;
        const designPanH  = designGridH + 2 * panPadRef;

        // ── The design column, and the split ─────────────────────────────────
        // ONE COLUMN, BOTH ORIENTATIONS. The UI half holds coin, panel and
        // button and nothing else — the slots live in the spring half — so
        // the reference height is the same either way and there is no longer a
        // per-orientation branch to keep in step.
        //
        //   6  top margin
        //   +  coin (half its height to its centre) + coinGap
        //   +  panel, less the padding already counted by the button gap
        //   +  gap to button + button half-height + bottom margin
        // which lands the coin's centre at 22 — hard against the top — and the
        // panel at 47..473 with the button at 554, in a column of 624.
        const LY    = CONFIG.LAYOUT || {};
        const REF_H = LY.REF_H_COLUMN || (6 + coinHRef / 2 + coinGapRef + designPanH
                                          - panPadRef + btnGridRef + spawnBtnLogHalfRef + btnBotRef);

        // ── partA (UI) and partB (the springs) ────────────────────────────────
        // Portrait:  partA = bottom, partB = top    (PORTRAIT_SPLIT)
        // Landscape: partA = left,   partB = right  (LANDSCAPE_SPLIT)
        //
        // Both are the UI HALF'S share, so 0.5 either way is an even split and
        // the two numbers mean the same thing.
        const splitL = LY.LANDSCAPE_SPLIT !== undefined ? LY.LANDSCAPE_SPLIT : 0.5;
        const splitP = LY.PORTRAIT_SPLIT  !== undefined ? LY.PORTRAIT_SPLIT  : 0.5;
        let partA, partB;
        if (isP) {
            partA = { x: 0, y: H * (1 - splitP), width: W, height: H * splitP };
            partB = { x: 0, y: 0,                width: W, height: H * (1 - splitP) };
        } else {
            partA = { x: 0,          y: 0, width: W * splitL,       height: H };
            partB = { x: W * splitL, y: 0, width: W * (1 - splitL), height: H };
        }

        // ── TWO-FACTOR RESPONSIVE SIZING ───────────────────────────────────────
        // Single design reference = my 1440×778 landscape MacBook, whose partA
        // (left half) is 720×778. partB has identical dimensions to partA in both
        // orientations, so the same factors apply to both halves.
        //   sW    = width  ratio  → HORIZONTAL gaps / margins / offsets
        //   sH    = height ratio  → VERTICAL   gaps / margins / positions
        //   scale = min(sW, sH)   → UNIFORM element SIZES (keeps the grid square)
        // No upper clamp — everything scales past the reference on bigger screens.
        //
        // REF_W in landscape is the half AT THE CURRENT SPLIT, which is what
        // keeps the grid the same size when the split moves: sW works out to
        // screenWidth/1440 whatever the split is (0.5·W/720 === 0.4·W/576). Do
        // not "simplify" this back to a constant.
        const REF_W = isP ? (LY.REF_W_PORTRAIT || 720) : 1440 * splitL;
        const sW    = partA.width  / REF_W;             // horizontal ratio
        const sH    = partA.height / REF_H;             // vertical ratio
        const baseScale = Math.min(sW, sH);             // uniform size factor (square-preserving)
        // LANDSCAPE: THE MERGE COLUMN GROWS INTO SPARE HEIGHT. A half taller
        // than the width-fitted column needs (sH > sW — 16:9 already, more so
        // 16:10 and an iPad) lets the coin/grid/button column grow, up to
        // LANDSCAPE_GRID_GROW × and never past the height or LANDSCAPE_GRID_MAX_W
        // of the half's width. Only this column: the spring half keeps baseScale
        // (exported as `scale`), its slots baseCell. Portrait is untouched.
        let scale = baseScale;
        if (!isP) {
            const grow = LY.LANDSCAPE_GRID_GROW !== undefined ? LY.LANDSCAPE_GRID_GROW : 1.15;
            const designPanW = COLS * BASE + (COLS - 1) * GAP + 2 * panPadRef;
            const wCap = partA.width * (LY.LANDSCAPE_GRID_MAX_W !== undefined ? LY.LANDSCAPE_GRID_MAX_W : 0.9) / designPanW;
            scale = Math.max(baseScale, Math.min(baseScale * grow, sH, wCap));
        }
        const cellSize = BASE * scale;                  // no Math.min(BASE,…) clamp
        const baseCell = BASE * baseScale;              // the spring half's slots stay at this

        // SIZES — uniform `scale`
        const panPad           = Math.floor(panPadRef * scale);
        const spawnBtnDisplayH = Math.floor((CONFIG.BUTTON.SPAWN_HEIGHT + 30) * scale);
        const panW             = COLS * cellSize + (COLS - 1) * GAP + 2 * panPad;
        const spawnBtnDisplayW = Math.min(
            Math.floor((CONFIG.BUTTON.SPAWN_WIDTH + 30) * scale),
            panW - 10                                                // relational cap — kept
        );

        // VERTICAL anchors — each block's centre sits at a fixed fraction of
        // partA.height (designY × sH). The topmost item therefore lands at its
        // design Y on any aspect (no empty top band), and because scale ≤ sH the
        // scale-sized elements never overflow the proportional spacing (no overlap).
        const designButtonCY    = REF_H - btnBotRef;
        const designGridBotEdge = designButtonCY - spawnBtnLogHalfRef - btnGridRef;
        // PANEL_DROP is gone with the battery case it opened room for: the
        // column now starts at the coin in both orientations, so dropping the
        // panel would only reopen the gap the short column closes.
        const designPanelCY     = designGridBotEdge + panPadRef - designPanH / 2;
        let   buttonCenterY     = partA.y + designButtonCY * sH;
        let   panelCenterY      = partA.y + designPanelCY  * sH;

        // ── The spring half's slot row ────────────────────────────────────────
        // Three slots in a row along partB's bottom edge, one per third of its
        // width. The square is a share of its column and of the half's height,
        // capped at a grid cell (SPRING.COL_FRAC / SLOT_H_FRAC).
        const SP        = CONFIG.SPRING || {};
        const slotSize  = Math.max(8, Math.min(baseCell,
                                   partB.width / 3 * (SP.COL_FRAC !== undefined ? SP.COL_FRAC : 0.62),
                                   partB.height * (SP.SLOT_H_FRAC !== undefined ? SP.SLOT_H_FRAC : 0.22)));

        // Slot-derived sizes ride this: it equals `scale`, expressed against the
        // reference slot so slot-space numbers convert without a second factor.
        const platformScale = baseCell / P.SLOT_SIZE;

        // ── All content sizes that must scale with cellSize ───────────────────
        // Cell gap
        const cellGap           = Math.max(2, Math.round(CONFIG.CELL.GAP * scale));
        // THE COIN COUNTER HANGS OFF THE PANEL'S REAL TOP EDGE, a size-scaled
        // gap above it — not at a fraction of the half's height like the
        // blocks above. On a tall half sH outgrows scale, and a counter placed
        // by sH drifts up toward the screen's edge, away from the grid it
        // belongs to.
        const panHReal    = ROWS * cellSize + (ROWS - 1) * cellGap + 2 * panPad;
        // LANDSCAPE: THE COLUMN AS ONE BLOCK, CENTRED. Coin, panel and button
        // keep their design spacing (× scale) to each other, and whatever
        // height the half has left over goes equally above and below — not
        // into the gap between grid and button, where it read as a missing
        // piece. Portrait keeps the button anchored low, in thumb reach.
        if (!isP && LY.LANDSCAPE_CENTER !== false) {
            const aboveRef = coinHRef / 2 + coinGapRef;                         // coin top -> panel top
            const belowRef = spawnBtnLogHalfRef + btnGridRef - panPadRef;       // panel bottom -> button centre
            const blockH   = (aboveRef + belowRef + spawnBtnLogHalfRef) * scale + panHReal;
            const top      = partA.y + Math.max(0, (partA.height - blockH) / 2);
            panelCenterY   = top + aboveRef * scale + panHReal / 2;
            buttonCenterY  = panelCenterY + panHReal / 2 + belowRef * scale;
        }
        const coinCenterY = panelCenterY - panHReal / 2 - coinGapRef * scale;

        // Battery icon + level text inside grid cells (and platform slots).
        //
        // PORTRAIT DERIVES THEM FROM THE CELL; landscape keeps the authored
        // figures. On a phone the authored ones leave a battery half the width
        // of its cell and a label under 8px, because they were chosen against a
        // desktop cell with room to spare. Here the cell's own height is the
        // only input: pad it, give the label its share, and the battery takes
        // everything else.
        const MB = CONFIG.CELL.MOBILE || {};
        // FITTED TO THE BOX IT IS DRAWN IN. Pad it, give the label its share,
        // and the battery takes the rest — returned as offsets from the box's
        // CENTRE, which is what the drawing code works in.
        const fitBox = (box) => {
            // A SHARE of the box, floored at PAD_MIN. Fixed design pixels do
            // not survive the cell's own inset border — see CELL.MOBILE.
            const pad   = Math.max((MB.PAD_FRAC !== undefined ? MB.PAD_FRAC : 0.07) * box,
                                   (MB.PAD_MIN  !== undefined ? MB.PAD_MIN  : 6) * scale);
            const gap   = (MB.GAP !== undefined ? MB.GAP : 1) * scale;
            const inner = Math.max(8, box - 2 * pad);
            const textH = inner * (MB.TEXT_SHARE !== undefined ? MB.TEXT_SHARE : 0.24);
            const batt  = Math.max(4, inner - textH - gap);
            // BATTERY ON TOP, LABEL UNDER IT — stacked in that order inside
            // the padded box, so the number reads as a caption to the tool
            // rather than a tag floating over it.
            const top   = -inner / 2;
            const textC = top + batt + gap + textH / 2;
            // FITTED, NOT STRETCHED. The icon fills the width the padding
            // leaves and the height the label leaves, whichever runs out
            // first, at the art's OWN ratio — so square art is capped by the
            // height and wide art by the width, and neither is squashed to
            // reach the other edge.
            const asp   = Math.max(0.05, CONFIG.CELL.ICON_ASPECT || 1);
            const h     = Math.max(4, Math.min(inner / asp, batt));
            const w     = h * asp;
            // TOP EDGE ON THE PADDING LINE rather than centred in the space it
            // was given. Art that does not use the full height would otherwise
            // float, and a row of cells holding different levels would not line
            // their heads up.
            const battC = top + h / 2;
            return {
                w:    Math.round(w),
                h:    Math.round(h),
                yOff: Math.round(battC),
                // The label's offset is measured from the BATTERY, not the box:
                // the sprite is placed at yOff and the text at yOff + tOff.
                // Positive now, since the label sits below. textC comes off the
                // BOX, so the label holds its line whatever height the art
                // turns out to want.
                tOff: Math.round(textC - battC),
                text: Math.max(8, Math.round(textH /
                        (MB.LINE !== undefined ? MB.LINE : 1.28) *
                        (MB.TEXT_SCALE !== undefined ? MB.TEXT_SCALE : 1))) + 'px',
            };
        };
        // TWO BOXES, NOT ONE. A grid cell and a charging slot are the same size
        // in landscape, and in PORTRAIT they are not: the slot is squeezed by
        // the case and the rate label beside it, so it is capped at a cell and
        // is usually well under one. Sizing both from the cell overflowed the
        // slots — the battery ran clean past the bottom edge, which is what
        // looked like the padding not being applied at all.
        let batteryDisplayW, batteryDisplayH, batteryYOffset, levelTextYOffset, levelTextSize;
        let slotBatteryW, slotBatteryH, slotBatteryYOffset, slotLevelTextYOffset, slotLevelTextSize;
        // BOTH ORIENTATIONS DERIVE, unless CELL.FIT_TO_CELL is turned off — and
        // portrait derives even then, which is where this started.
        const fitCell = CONFIG.CELL.FIT_TO_CELL !== false || (isP && MB.ENABLED !== false);
        if (fitCell) {
            const cf = fitBox(cellSize), sf = fitBox(slotSize);
            batteryDisplayW = cf.w; batteryDisplayH = cf.h; batteryYOffset = cf.yOff;
            levelTextYOffset   = cf.tOff; levelTextSize  = cf.text;
            slotBatteryW    = sf.w; slotBatteryH = sf.h; slotBatteryYOffset = sf.yOff;
            slotLevelTextYOffset = sf.tOff; slotLevelTextSize  = sf.text;
        } else {
            const authored = Math.round(CONFIG.CELL.BATTERY_DISPLAY_SIZE * scale);
            batteryDisplayW = batteryDisplayH = authored;
            batteryYOffset     = Math.round(CONFIG.CELL.BATTERY_Y_OFFSET     * scale);
            levelTextYOffset   = Math.round(CONFIG.CELL.LEVEL_TEXT_Y_OFFSET  * scale);
            levelTextSize      = Math.max(8, Math.round(11 * scale)) + 'px';
            slotBatteryW = slotBatteryH = authored;
            slotBatteryYOffset   = batteryYOffset;
            slotLevelTextYOffset = levelTextYOffset;
            slotLevelTextSize    = levelTextSize;
        }

        // Spawn button interior (coin value text, coin icon, battery icon)
        const spawnCoinTextSize  = Math.max(14, Math.round(32 * scale)) + 'px';
        const spawnCoinTextX     = Math.round(CONFIG.BUTTON.COIN_TEXT_X          * scale);
        const spawnCoinIconX     = Math.round(CONFIG.BUTTON.COIN_ICON_X           * scale);
        const spawnCoinIconSize  = Math.round(CONFIG.BUTTON.COIN_ICON_WIDTH       * scale);
        const spawnBattIconX     = Math.round(CONFIG.BUTTON.BATTERY_ICON_X        * scale);
        const spawnBattIconSize  = Math.round(CONFIG.BUTTON.BATTERY_ICON_WIDTH    * scale);

        // Coin counter display (above grid panel)
        const coinIconSize       = Math.round(CONFIG.COIN_COUNTER.COIN_ICON_WIDTH * scale);
        const coinTextSize       = Math.max(12, Math.round(29 * 1.3 * scale)) + 'px';   // 40% down from 48, then 30% back up
        const coinTextIconGap    = Math.max(3,  Math.round(5 * scale));

        // VFX sizes
        const rewardCoinSize    = Math.round(CONFIG.COIN_REWARD_ANIMATION.REWARD_COIN_SIZE * scale);

        this.layoutConfig = {
            isPortrait: isP,
            cellSize, cellGap,
            panPad, spawnBtnDisplayH, spawnBtnDisplayW,
            partA, partB,
            platformScale,
            sW, sH, scale: baseScale, colScale: scale,
            panelCenterY, buttonCenterY, coinCenterY, slotSize,
            // Battery / cell content
            batteryDisplayW, batteryDisplayH, batteryYOffset, levelTextYOffset, levelTextSize,
            slotBatteryW, slotBatteryH, slotBatteryYOffset, slotLevelTextYOffset, slotLevelTextSize,
            // Spawn button contents
            spawnCoinTextSize, spawnCoinTextX, spawnCoinIconX, spawnCoinIconSize,
            spawnBattIconX, spawnBattIconSize,
            // Coin counter
            coinIconSize, coinTextSize, coinTextIconGap,
            // VFX
            rewardCoinSize,
        };
    }

    // ================================================================
    // RELAYOUT — the screen turned
    // ================================================================
    // THE GAME RE-LAYS ITSELF OUT IN PLACE when the screen turns between
    // portrait and landscape. Nothing restarts: the run — coins, pigs, the
    // level, how far each plant has been picked — is the same objects before
    // and after. The stage takes the new shape, and everything is placed on it
    // again.
    //
    // ONLY ON A TURN, not on every resize. Within one orientation the stage
    // keeps its size and the browser simply scales it (see pickStage), so a
    // desktop window being dragged about is still a non-event.
    //
    // AT REST, NEVER MID-ANIMATION. A bank bursting, fruit in the air, coins
    // on their way to the counter all carry the game forward in their
    // callbacks — the payout, the level turn — and are aimed at places on the
    // old layout. So a turn only ASKS for a relayout: the squeeze tick holds,
    // whatever is in flight lands, and the relayout runs on the first frame
    // where nothing is moving (see _isSettled).
    //
    // FAST-FORWARDED TO THAT POINT. Played out at normal speed the wait is a
    // second or two of the old layout squeezed onto the turned screen, so
    // tweens and timers run STAGE.RELAYOUT_FAST_FORWARD times faster until it
    // comes — a few frames. Nothing is skipped: every payout and level turn
    // still happens, only sooner, while the player is looking at a layout
    // that is about to be replaced anyway.
    // WATCHED EVERY FRAME, not on resize events. A phone reports its new
    // width and height some time after it says it has turned — later than any
    // fixed wait can be relied on — so a check fired off the event could read
    // the OLD shape, decide nothing had changed, and never be asked again.
    // Reading the window each frame cannot miss it. The new shape has to hold
    // for STAGE.RELAYOUT_DEBOUNCE_MS first, so a size passed through on the
    // way round is not mistaken for the one it arrived at.
    _pollOrientation() {
        const S = CONFIG.STAGE || {};
        const w = window.innerWidth, h = window.innerHeight;
        if (!w || !h) return;
        const now = performance.now();
        // WHAT THIS FRAME WOULD GET, and whether it differs enough from what
        // the game has: a TURN (portrait <-> landscape), or a RESHAPE — the
        // same orientation, but a stage height more than RESHAPE_TOLERANCE
        // away (a tall phone after a squat tablet, the fullscreen button on a
        // 16:10 screen, iPad split view). Small changes — a phone's toolbar
        // sliding — stay under the tolerance and are left to FIT's scaling.
        const want = pickStage();
        const turn = want.portrait !== this.isPortrait;
        const tol = S.RESHAPE_TOLERANCE !== undefined ? S.RESHAPE_TOLERANCE : 0.05;
        const reshape = !turn && tol >= 0
            && Math.abs(want.height - this.scale.height) / this.scale.height > tol;
        if (!turn && !reshape) {
            // Matches — including changed back before a relayout ran.
            this._turnSeenAt = 0;
            this._seenW = this._seenH = 0;
            this._relayoutPending = false;
            return;
        }
        // THE SIZE HAS TO STAND STILL first: every new size restarts the wait,
        // so a window being dragged relayouts once, when it is let go.
        if (w !== this._seenW || h !== this._seenH) {
            this._seenW = w; this._seenH = h;
            this._turnSeenAt = now;
            orientLog(`${turn ? 'turn' : 'reshape'} seen: frame ${w} x ${h} wants ` +
                `${want.portrait ? 'PORTRAIT' : 'LANDSCAPE'} ${want.width} x ${want.height}, ` +
                `game is ${this.isPortrait ? 'PORTRAIT' : 'LANDSCAPE'} ${this.scale.width} x ${this.scale.height}`);
            return;
        }
        const wait = turn
            ? (S.RELAYOUT_DEBOUNCE_MS !== undefined ? S.RELAYOUT_DEBOUNCE_MS : 100)
            : (S.RESHAPE_DEBOUNCE_MS  !== undefined ? S.RESHAPE_DEBOUNCE_MS  : 250);
        if (!this._relayoutPending && now - this._turnSeenAt >= wait) {
            this._relayoutPending = true;
            orientLog('relayout pending — runs once the field is settled');
        }
    }

    // NOTHING IN FLIGHT that the game is waiting on. Looping tweens — the
    // tutorial pointers, the slot hints, the level-up button's pulse — never
    // end, and are simply rebuilt on the new layout, so they do not count.
    _isSettled() {
        return !this._unsettledBy();
    }
    // What is holding the field unsettled, or null — named for [orient].
    _unsettledBy() {
        if (this.draggingBattery) return 'a pig is being dragged';
        if (this.isWatchingAd)    return 'an ad is playing';
        if ((this._coinFlights || 0) > 0) return 'coins in flight';
        if (this.flight)                  return 'a launch in flight';
        if (this.countdown)               return 'a launch counting down';
        const t = this.tweens.getTweens().filter((tw) => !tw.isInfinite).length;
        return t ? `${t} tween(s) running` : null;
    }

    // Time sped up while a relayout waits, and put back after. The charge tick
    // is held meanwhile (see chargeCycle), so running its clock fast costs
    // nothing; the level-up timer reads the real clock, not this one.
    _fastForward(on) {
        const S = CONFIG.STAGE || {};
        const k = on ? Math.max(1, S.RELAYOUT_FAST_FORWARD !== undefined ? S.RELAYOUT_FAST_FORWARD : 25) : 1;
        if (this.tweens.timeScale !== k) this.tweens.timeScale = k;
        if (this.time.timeScale   !== k) this.time.timeScale   = k;
    }

    _relayout() {
        this._relayoutPending = false;
        this._orientWaitWhy = undefined;
        const st = pickStage();
        orientLog(`relayout: frame ${window.innerWidth} x ${window.innerHeight} -> ` +
            `${st.portrait ? 'PORTRAIT' : 'LANDSCAPE'} stage ${st.width} x ${st.height}`);
        this.scale.setGameSize(st.width, st.height);
        this.cameras.main.setSize(st.width, st.height);

        // WHAT THE FURNITURE WAS SHOWING — the only state it holds, carried
        // across. Everything else lives in records that are kept as they are.
        const lvlUp = { visible: this.levelUpButtonVisible, showTime: this.levelUpButtonShowTime,
                        alpha: this.levelUpButtonBg ? this.levelUpButtonBg.alpha : 1 };
        const hadOverlay   = !!this.startOverlay;
        const hadMergeHint = !!this.mergePointer;
        const hadSlotHints = !!this.slotHints;

        // ── The old layout's furniture comes down ────────────────────────────
        const gone = (o) => { if (o && o.scene) { this.tweens.killTweensOf(o); o.destroy(); } };
        gone(this.gridPanel);
        for (const row of this.gridCells) for (const cd of row || []) { gone(cd.cell); gone(cd.filledBg); }
        for (const p of this.platforms) { gone(p.slotBg); gone(p.slotBgFilled); gone(p.chargeRateText); }
        gone(this.springGfx);
        gone(this.skyGfx);
        gone(this.flightGfx);
        for (const p of this.payloads || []) gone(p);
        this.payloads = [];
        for (const t of this.springLabels) gone(t);
        this.springGfx = null;
        this.springLabels = [];
        gone(this.coinIcon);
        gone(this.coinText);
        gone(this.spawnButton);
        gone(this.levelUpButton);
        gone(this.splitLine);
        gone(this.startOverlay);
        gone(this.startPointer);
        this.startOverlay = this.startPointer = null;
        gone(this.mergePointer);
        this.mergePointer = null;
        for (const lot of this.slotHints || []) for (const o of lot || []) gone(o);
        this.slotHints = null;

        // ── …and goes back up on the new one ────────────────────────────────
        this.calculateLayout();
        this._applyLayoutFields();
        this._drawBackground();

        // The spring half: three springs, a slot under each.
        this.createSprings();

        // The merge half.
        this.createGrid();
        for (let r = 0; r < this.GRID_ROWS; r++) {
            for (let c = 0; c < this.GRID_COLS; c++) {
                const cd = this.gridCells[r][c], on = !!this.grid[r][c];
                cd.filledBg.setVisible(on);
                cd.isEmpty = !on;
            }
        }
        for (const bd of this.batteries) this._placeBattery(bd);
        this.platforms.forEach((p, i) => {
            const slot = this.chargingSlots[i];
            p.slotBgFilled.setVisible(!!slot);
            if (!slot) return;
            p.chargeRateText.setText(this._rateText(slot.perSec)).setVisible(true);
            this._placeBattery(slot.batteryData);
            p.batterySprite    = slot.batteryData.sprite;
            p.batteryLevelText = slot.batteryData.levelText;
        });

        this.createCoinDisplay();
        this.createButtons();
        this.updateSpawnButton();
        this.levelUpButtonShowTime = lvlUp.showTime;
        this.levelUpButtonBg.setAlpha(lvlUp.alpha);
        if (lvlUp.visible) {
            this.levelUpButton.setVisible(true);
            this.levelUpButtonVisible = true;
            this.tweens.add({
                targets: this.levelUpButton,
                scaleX: 1.05, scaleY: 1.05, duration: 300,
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            });
        }

        this._buildSplitLine();
        if (hadOverlay)   this.createStartOverlay();
        if (hadMergeHint) this.createMergeTutorial();
        if (hadSlotHints) this._showSlotHint();

        // Turned again while this ran? _pollOrientation picks it up next frame.
        this._turnSeenAt = 0;
    }

    // ── SAVING ───────────────────────────────────────────────────────────────
    // CONFIG.SAVE. So a refresh by mistake does not cost a player their run:
    // the run is written to localStorage every EVERY_MS and whenever the page
    // is hidden or closed (a reload is a close), and read back at boot.
    //
    // ONLY SETTLED FIGURES — levels, coins, how far each spring is squeezed — never
    // anything mid-animation. Coins still flying to the counter are not in the
    // figure yet; losing a handful of those to a refresh is the trade.
    _collectSave() {
        const lvlOf = (row) => row.map((b) => (b ? b.level : 0));
        return {
            v: SAVE_VERSION,
            t: Date.now(),
            coins: this.coins,
            // A release in progress saves as released (the level is already the next).
            level: this.level,
            springs: this.springs.map((sp) => (sp.phase === 'releasing' ? 0 : sp.compressed)),
            grid: this.grid.map(lvlOf),
            slots: this.chargingSlots.map((sl) => (sl ? sl.level : 0)),
            highest: this.highestBatteryLevel,
            spawnLevel: this.spawnButtonLevel,
            spawnCost: this.spawnCost,
            started: !!this.hasStartedPlaying,
            mergeTut: !!this.mergeTutorialShown,
            slotSeen: this.slotHintSeen.slice(),
        };
    }

    _writeSave() {
        const S = CONFIG.SAVE || {};
        if (S.ENABLED === false || !this._saveReady) return;
        try { localStorage.setItem(saveKey(), JSON.stringify(this._collectSave())); }
        catch (e) { /* incognito / storage full / blocked — play on unsaved */ }
    }

    // Every EVERY_MS on the scene's clock (so not during an ad's freeze), and
    // on the page being hidden or closed — the one that catches a reload.
    _startAutosave() {
        const S = CONFIG.SAVE || {};
        if (S.ENABLED === false) return;
        this._saveReady = true;
        this.time.addEvent({ delay: S.EVERY_MS !== undefined ? S.EVERY_MS : 2000,
            loop: true, callback: () => this._writeSave() });
        if (!this._saveHooked && typeof window !== 'undefined') {
            this._saveHooked = true;
            const now = () => this._writeSave();
            window.addEventListener('pagehide', now);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') now();
            });
        }
    }

    // THE FIGURES FROM A SAVE, before anything is built from them.
    _applySave(sv) {
        this.coins = sv.coins;
        // No further squeezed than its strength — a save from before a
        // strength change could say otherwise.
        this.level = sv.level;
        const strengths = levelStrengthsFor(this.level);
        this.springs.forEach((sp, i) => {
            sp.max = strengths[i];
            sp.compressed = Math.min(sp.max, sv.springs[i]);
            sp.squeeze = sp.compressed / sp.max;
            sp.phase = sp.compressed >= sp.max ? 'ready' : 'compressing';
        });
        this.highestBatteryLevel = sv.highest;
        this.spawnButtonLevel = sv.spawnLevel;
        this.spawnCost = sv.spawnCost;
        this.mergeTutorialShown = sv.mergeTut;
        this.slotHintSeen = sv.slotSeen;
        this.slotHintDone = this.slotHintSeen.every(Boolean);
    }

    // THE PIGS FROM A SAVE, back in their cells and slots.
    _restorePigs(sv) {
        for (let r = 0; r < this.GRID_ROWS; r++) {
            for (let c = 0; c < this.GRID_COLS; c++) {
                const lv = sv.grid[r] && sv.grid[r][c];
                if (lv > 0) this.spawnBatteryInGrid(r, c, lv, false);
            }
        }
        sv.slots.forEach((lv, i) => { if (lv > 0) this.addBatteryToSlot(i, lv); });
    }

    // A pig moved to where its cell or slot now is, at the new size. The same
    // sprite, label and drag handle — only their geometry changes.
    _placeBattery(bd) {
        if (!bd || !bd.sprite) return;
        const inSlot = bd.inChargingSlot;
        const p   = inSlot ? this.platforms[bd.slotIndex] : null;
        const cd  = inSlot ? null : this.gridCells[bd.row][bd.col];
        const x   = inSlot ? p.slotX : cd.x;
        const y   = inSlot ? p.slotY : cd.y;
        const box = inSlot ? p.slotSize : this.CELL_SIZE;
        const yOff = inSlot ? this.slotBatteryYOffset : this.batteryYOffset;
        const tOff = inSlot ? this.slotLevelTextYOffset : this.levelTextYOffset;
        for (const o of [bd.sprite, bd.levelText, bd.draggableBg]) if (o) this.tweens.killTweensOf(o);

        bd.originalX = x;
        bd.originalY = y + yOff;
        bd.sprite.setPosition(x, bd.originalY).setDepth(11);
        fitItemIcon(bd.sprite, inSlot ? this.slotBatteryW : this.batteryDisplayW,
                               inSlot ? this.slotBatteryH : this.batteryDisplayH);
        bd.levelText.setFontSize(inSlot ? this.slotLevelTextSize : this.levelTextSize)
            .setScale(1).setPosition(x, bd.originalY + tOff).setDepth(12).setVisible(true);
        if (bd.draggableBg) {
            bd.draggableBg.setPosition(x, y).setSize(box, box).setDepth(10);
            if (bd.draggableBg.input) bd.draggableBg.input.hitArea.setSize(box, box);
        }
    }

    // ================================================================
    // PRELOAD
    // ================================================================
    preload() {
        loadMark('Phaser booted — preload starting');
        this._save = readSave();
        // REAL FIGURES FROM HERE. The page's creep stops where it is and this
        // loader's progress carries on from there.
        if (typeof window !== 'undefined' && window.__loading) {
            window.__loading.takeOver();
            loadingShown = window.__loading.value();
        }
        // The loading bar. This preload runs it up to LOAD_PRELOAD_CAP. The
        // opening view's remaining levels come in later batches, each of which
        // restarts the loader's own 0-1 — so each takes a share of what is left
        // instead, and the bar only ever moves forward.
        // Whatever the creep reached is the floor: the first batch runs from
        // there to LOAD_PRELOAD_CAP, so the hand-over is a jump forward or
        // nothing at all, never a drop.
        let barFrom = Math.max(LOAD_BOOT_SHARE, loadingShown), barTo = LOAD_PRELOAD_CAP, batch = 0;
        this.load.on('start', () => {
            if (batch++ === 0) return;
            barFrom = loadingShown;
            barTo   = loadingShown + (0.97 - loadingShown) * 0.6;
        });
        this.load.on('progress', (v) => setLoadingProgress(barFrom + (barTo - barFrom) * v));
        this.load.on('complete', () => {
            if (!loadingScreenDone) loadMark(batch <= 1 ? 'preload files downloaded' : 'more level art downloaded');
        });
        // Level maps and art that are queued, and those that failed. A file that
        // fails is not retried forever: it is written off, and the level builds
        // without it — the same as a missing file always did.
        this._artFailed = new Set();
        this.load.on('loaderror', (file) => { if (file && file.key) this._artFailed.add(file.key); });

        // SHARED ART — the merge grid, the machine, the lake, the UI. The list
        // lives in assets.js, which the build also reads to write the page's
        // preload hints, so what is loaded here and what is hinted cannot drift.
        for (const a of sharedAssets()) {
            if (a.type === 'json')  this.load.json(a.key, a.url);
            else if (a.frame)       this.load.spritesheet(a.key, a.url, a.frame);
            else                    this.load.image(a.key, a.url);
        }

        // A file that 404s leaves the cache entry simply absent, and whatever
        // wanted it draws nothing — which looks exactly like art that loaded and
        // was blank. Say so instead.
        this.load.on('loaderror', (file) => {
            console.error(`[load] FAILED "${file.key}" <- ${file.url} ` +
                `(${file.type}). Check the path is relative to index.html and ` +
                `that the file is actually served.`);
        });
    }

    // ================================================================
    // CREATE
    // ================================================================
    create() {
        loadMark('create: building the view');
        // The backstop for a download that never ends. The opening view has no
        // lazily-loaded art left in it, so the end of create() lifts the screen.
        setTimeout(finishLoadingScreen, (CONFIG.LAZY_LEVELS || {}).SCREEN_TIMEOUT_MS || 20000);

        if (CONFIG.DEBUG_LAYOUT) {
            const c = this.game.canvas;
            const dpr = window.devicePixelRatio || 1;
            console.log(
              `[buffer] backingStore=${c.width}x${c.height} ` +          // actual render pixels (drawing buffer)
              `cssDisplay=${c.clientWidth}x${c.clientHeight} ` +          // size shown on page (CSS px)
              `DPR=${dpr} ` +
              `physicalScreen=${Math.round(c.clientWidth*dpr)}x${Math.round(c.clientHeight*dpr)}`  // what the screen really has
            );
        }

        this.assets = new AssetManager(this);
        // The starting pig's two pictures came in with the preload; put them
        // together now, before anything is drawn wearing them.
        this.assets.composeBattery(getBatteryIconLevel(CONFIG.BATTERY_START_LEVEL));
        const W = this.scale.width;
        const H = this.scale.height;

        // Calculate layout based on orientation
        this.calculateLayout();
        this._applyLayoutFields();
        const L = this.layoutConfig;
        // One-time responsive-layout sanity log
        const _cx   = L.partA.x + L.partA.width / 2;
        const _panW = this.GRID_COLS * L.cellSize + (this.GRID_COLS - 1) * L.cellGap + 2 * L.panPad;
        const _panH = this.GRID_ROWS * L.cellSize + (this.GRID_ROWS - 1) * L.cellGap + 2 * L.panPad;
        if (CONFIG.DEBUG_LAYOUT) console.log(`[layout] partA=${Math.round(L.partA.width)}x${Math.round(L.partA.height)} ` +
            `sW=${L.sW.toFixed(3)} sH=${L.sH.toFixed(3)} scale=${L.scale.toFixed(3)} cellSize=${L.cellSize.toFixed(1)} ` +
            `panel=${_panW.toFixed(0)}x${_panH.toFixed(0)} | ` +
            `coin=(${_cx.toFixed(0)},${L.coinCenterY.toFixed(0)}) ` +
            `grid=(${_cx.toFixed(0)},${L.panelCenterY.toFixed(0)}) ` +
            `button=(${_cx.toFixed(0)},${L.buttonCenterY.toFixed(0)})`);

        // Background
        this._drawBackground();

        // The spring half: three springs, a slot under each.
        const save = this._save;
        if (save) this._applySave(save);
        this.createSprings();

        // The merge half
        this.createGrid();
        this.createCoinDisplay();
        if (save) this._restorePigs(save);
        else this.spawnBatteryInGrid(0, 0, CONFIG.BATTERY_START_LEVEL);
        this.assets.prefetchAhead(this.highestBatteryLevel + 1);
        this.createButtons();
        if (save) this.updateSpawnButton();
        this.time.addEvent({
            delay: 1000, callback: this.checkLevelUpTimer, callbackScope: this, loop: true,
        });
        // A RETURNING PLAYER skips the start tutorial — what removeStartOverlay
        // would have set, set directly.
        if (save && save.started) {
            this.hasStartedPlaying = true;
            this.levelUpTimer = this.time.now;
            this.firstLevelUpTimer = true;
        } else {
            this.createStartOverlay();
        }
        this._startAutosave();

        // Input
        this.input.on('dragstart', this.onDragStart, this);
        this.input.on('drag',      this.onDrag,      this);
        this.input.on('dragend',   this.onDragEnd,   this);

        this.startCharging();
        this._startBatteryBackfill();

        // Debug: a line marking the partA / partB split — vertical in landscape
        // (left | right), horizontal in portrait (top / bottom).
        if (CONFIG.DEBUG_HALF_LINE) {
            const W = this.scale.width, H = this.scale.height;
            const dl = this.add.graphics().setDepth(99999);
            dl.lineStyle(Math.max(1, 2 * L.platformScale), 0xff00ff, 0.9);
            if (L.isPortrait) {
                const y = L.partB.y + L.partB.height;   // split between top/bottom halves
                dl.lineBetween(0, y, W, y);
            } else {
                const x = L.partB.x;                     // split between left/right halves
                dl.lineBetween(x, 0, x, H);
            }
        }

        this.gamePaused = false;   // frozen only while an ad plays (_setPaused)
        this._buildSplitLine();

        // Everything the opening view needs is up.
        finishLoadingScreen();
    }

    // The layout's figures, copied onto the scene where the rest of the code
    // reads them. Run after every calculateLayout — at build and on a relayout.
    _applyLayoutFields() {
        const L = this.layoutConfig;
        this.CELL_SIZE          = L.cellSize;
        this.CELL_GAP           = L.cellGap;
        this.batteryDisplayW    = L.batteryDisplayW;
        this.batteryDisplayH    = L.batteryDisplayH;
        this.slotBatteryW         = L.slotBatteryW;
        this.slotBatteryH         = L.slotBatteryH;
        this.slotBatteryYOffset   = L.slotBatteryYOffset;
        this.slotLevelTextYOffset = L.slotLevelTextYOffset;
        this.slotLevelTextSize    = L.slotLevelTextSize;
        this.batteryYOffset     = L.batteryYOffset;
        this.levelTextYOffset   = L.levelTextYOffset;
        this.levelTextSize      = L.levelTextSize;
        // VFX
        this.rewardCoinSize     = L.rewardCoinSize;
    }

    // THE UI HALF'S CARD. Redrawn in place on a relayout — same object, cleared.
    _drawBackground() {
        const bgGfx = this.bgGfx = (this.bgGfx && this.bgGfx.scene) ? this.bgGfx.clear() : this.add.graphics();
        const sc = parseInt(CONFIG.BACKGROUND.GRADIENT_START_COLOR.substring(1), 16);
        const ec = parseInt(CONFIG.BACKGROUND.GRADIENT_END_COLOR.substring(1), 16);
        // A TINT OVER THE GROUND, not the panel itself. At 0 nothing is drawn at
        // all and the field's own colour is what the panel is made of.
        const bgA = CONFIG.BACKGROUND.OPACITY !== undefined ? CONFIG.BACKGROUND.OPACITY : 1;
        bgGfx.fillGradientStyle(sc, sc, ec, ec, bgA);
        // THE UI HALF'S OWN CARD, rounded on all four of ITS corners — the two
        // against the screen edge and the two against the spring half.
        //
        // Drawn to partA rather than across the stage, because a full-screen
        // fill would sit UNDER the rounded shape and show through its corners,
        // which is the one thing rounding them is for. The spring half needs
        // no fill: the canvas's own colour is its ground.
        const A = this.layoutConfig.partA;
        const bgR = Math.round((CONFIG.BACKGROUND.CORNER_RADIUS || 0) * this.layoutConfig.scale);
        if (bgA > 0) {
            if (bgR > 0) bgGfx.fillRoundedRect(A.x, A.y, A.width, A.height, bgR);
            else         bgGfx.fillRect(A.x, A.y, A.width, A.height);
        }
        bgGfx.setDepth(0);
    }

    // ================================================================
    // THE SPRING HALF — three springs, a slot under each
    // ================================================================
    // Three columns across partB. In each, a slot along the half's bottom
    // edge with its piggy's figure over it, and a spring standing on a base
    // plate above that, what it still needs (MAX! when full) between the two. Slots wear
    // the same grained face as a grid cell, so a slot and a cell read as the
    // same kind of object.
    //
    // ON A RELAYOUT the slot records are kept — they are what the charging
    // slots and their pigs are paired through — and only their geometry and
    // furniture are swapped for the new ones. The springs' state is kept too
    // (this.springs); only the drawing is rebuilt.
    createSprings() {
        const P     = CONFIG.PLATFORM;
        const SP    = CONFIG.SPRING || {};
        const v     = (x, d) => (x !== undefined ? x : d);
        const L     = this.layoutConfig;
        const scale = L.platformScale;
        const s     = (n) => n * scale;
        const B     = L.partB;
        const ssz   = L.slotSize;
        const colW  = B.width / 3;

        const LB = SP.LABEL || {};
        const style = {
            fontSize: Math.max(10, Math.round(v(LB.SIZE, 30) * scale)) + 'px',
            fontFamily: CONFIG.FONT_FAMILY, fontStyle: CONFIG.FONT_WEIGHT,
            color: LB.COLOR || '#1c1c1c', stroke: LB.STROKE || '#ffffff',
            strokeThickness: Math.round(v(LB.STROKE_W, 5) * scale),
        };
        // The label's REAL height, so the base plate clears the slot's figure.
        const probe  = this.add.text(0, 0, '0', style);
        const labelH = probe.height;
        probe.destroy();

        // BOTTOM UP: the slot on the half's bottom edge, its figure over it,
        // then the spring's own figure, then the spring's base plate.
        const slotY    = B.y + B.height - s(v(SP.BOTTOM_PAD, 30)) - ssz / 2;
        const rateY    = slotY - ssz / 2 - s(P.CHARGE_RATE_GAP);          // figure's bottom
        const plateRef = v(SP.PLATE_H, 24), restRef = v(SP.REST_HEIGHT, 520);
        const labelGap = s(10);
        const labelY   = rateY - labelH - s(v(SP.BASE_GAP, 14));          // spring figure's bottom
        const plateBot = labelY - labelH - labelGap;
        // THE SPRING'S SIZE, k × design: as big as fits between the base and
        // the half's top (with its label), and across its column.
        // The plates are discs in perspective: each face's ellipse reaches its
        // half-height past the plate (ry, at the coil's tilt) — under the
        // base, over the top.
        const ryOf = (rx) => rx * v(SP.COIL_TILT, 22) / (v(SP.WIDTH, 170) / 2);
        const ryBase = ryOf(v(SP.WIDTH, 170) / 2 + 30), ryTop = ryOf(v(SP.WIDTH, 170) / 2 + 10);
        const room = plateBot - (B.y + s(v(SP.TOP_PAD, 24)));
        const k = Math.max(0.05, Math.min(
            room / (restRef + 2 * plateRef + ryBase + ryTop),
            colW * 0.9 / (v(SP.WIDTH, 170) + 60),
            v(SP.MAX_SCALE, 1)) * v(SP.SIZE, 1));
        const baseY = plateBot - (plateRef + ryBase) * k;                 // top of the base plate
        const xs = [0, 1, 2].map((i) => B.x + colW * (i + 0.5));
        this.springGeo = { xs, baseY, k };

        this.springGfx = this.add.graphics().setDepth(v(SP.DEPTH, 2));
        this.skyGfx    = this.add.graphics().setDepth(1);
        this.flightGfx = this.add.graphics().setDepth(((CONFIG.SKY || {}).FLIGHT || {}).DEPTH || 40).setVisible(false);
        // A launch in flight is never relaid (it holds the relayout with its
        // tweens), so every spring not letting go gets its payload back here.
        this.payloads = this.springs.map((s, i) => (s.phase === 'releasing' ? null : this._makePayload(i, false)));
        this.springLabels = xs.map((x) => this.add.text(x, labelY, '', style).setOrigin(0.5, 1).setDepth(5));

        // The face texture the filled state uses, baked at the GRID's cell size
        // and scaled down here — one texture for both.
        this._makeCellTextures(L.cellSize);

        // THE DROP ZONE (PLATFORM.DROP_ZONE): across, toward the column's
        // edges; up, over the spring toward the half's top.
        const DZ = P.DROP_ZONE || {}, lerp = (q, a, b) => a + (b - a) * Math.max(0, Math.min(1, v(q, 0)));
        const dropHW = lerp(DZ.X, ssz / 2, colW / 2);
        const dropTop = lerp(DZ.Y, slotY - ssz / 2, B.y);
        const dropBot = lerp(DZ.Y, slotY + ssz / 2, B.y + B.height);

        for (let i = 0; i < 3; i++) {
            const slotX = xs[i];
            // The SAME faces as the grid's cells: the empty one stays up the
            // whole time, and filling the slot lays the filled one over it —
            // same size and shape, so it covers it exactly.
            const slotBg = this.add.image(slotX, slotY, 'cell_empty')
                .setDisplaySize(ssz, ssz).setDepth(3);
            const slotBgFilled = this.add.image(slotX, slotY, 'cell_filled')
                .setDisplaySize(ssz, ssz).setDepth(3).setVisible(false);

            // What this slot's pig squeezes per second, over the square.
            const chargeRateText = this.add.text(slotX, rateY, '', style)
                .setOrigin(0.5, 1).setDepth(5).setVisible(false);

            const drop = { x0: slotX - dropHW, x1: slotX + dropHW, y0: dropTop, y1: dropBot };
            const slot = { index: i, slotX, slotY, slotSize: ssz, drop, slotBg, slotBgFilled, chargeRateText };
            if (this.platforms[i]) Object.assign(this.platforms[i], slot);
            else this.platforms.push(Object.assign(slot, { batterySprite: null, batteryLevelText: null }));
        }
        this._drawSprings();
    }

    // ── Cell faces ───────────────────────────────────────────────────────────
    // The grid cell, its filled twin and the battery case's occupied division
    // are baked ONCE into textures rather than drawn per cell: a rounded square
    // in the flat colour, the noise tile blended over it (the same overlay-at-
    // low-alpha composite you would build in an image editor, done here so the
    // COLOUR stays a config value — one grain file serves every face), then the
    // inset bevel ring. Nine cells then cost nine images sharing two textures,
    // where they used to cost eighteen graphics objects.
    //
    // Baked at the cell's true pixel size, and rebaked only if that size changes.
    _makeCellTextures(px) {
        const C = CONFIG.CELL;
        const N = C.NOISE || {};
        px = Math.max(8, Math.round(px));
        if (this._cellTexPx === px) return;
        this._cellTexPx = px;

        const inset = Math.max(1, Math.round(C.INSET_BORDER_WIDTH * px / C.SIZE));
        const rad   = Math.max(1, Math.round(C.RADIUS * px / C.SIZE));
        const noise = (N.ENABLED !== false && this.textures.exists('cell_noise'))
                    ? this.textures.get('cell_noise').getSourceImage() : null;
        // Canvas wants CSS colours; the config already uses them, but tolerate a
        // hex number in case one slips in.
        const hexStr = (c) => typeof c === 'number'
            ? '#' + (c >>> 0).toString(16).padStart(6, '0') : c;
        // Rounded-rect path by hand: roundRect() is too new to rely on.
        const path = (ctx, x, y, w, h, r) => {
            r = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y,     x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x,     y + h, r);
            ctx.arcTo(x,     y + h, x,     y,     r);
            ctx.arcTo(x,     y,     x + w, y,     r);
            ctx.closePath();
        };
        const bake = (key, faceColor, bevel, dash) => {
            if (this.textures.exists(key)) this.textures.remove(key);
            const canvas = this.textures.createCanvas(key, px, px);
            const ctx = canvas.getContext();
            ctx.clearRect(0, 0, px, px);
            if (bevel) {                       // the ring that fakes a recessed edge
                path(ctx, 0, 0, px, px, rad);
                ctx.fillStyle = C.INSET_SHADOW_COLOR;
                ctx.fill();
            }
            const o = bevel ? inset : 0;
            path(ctx, o, o, px - 2 * o, px - 2 * o, rad - o);
            ctx.fillStyle = faceColor;
            ctx.fill();
            if (noise) {
                // Clipped to the face just drawn, so the grain never crosses the
                // rounded edge or tints the bevel.
                ctx.save();
                ctx.clip();
                // CONTRAST first: the tile is blurred noise on neutral grey and
                // only spans about ±18% around mid — at a few percent alpha that
                // works out to a level or two of 255, i.e. nothing. Stretching it
                // before the blend is what an image editor's "noise layer at 100%,
                // group at 7%" actually gives you.
                const k = N.CONTRAST || 1;
                if (k !== 1 && typeof ctx.filter === 'string') ctx.filter = `contrast(${k})`;
                ctx.globalCompositeOperation = N.BLEND || 'overlay';
                ctx.globalAlpha = N.ALPHA !== undefined ? N.ALPHA : 0.6;
                const z = N.TILE || 1;         // <1 = coarser grain (tile blown up)
                ctx.drawImage(noise, o, o, (px - 2 * o) / z, (px - 2 * o) / z);
                ctx.restore();
            }
            // THE EMPTY CELL'S DASHED LINE — "something goes here".
            if (dash && C.EMPTY_DASH_COLOR) {
                const lw = Math.max(1, Math.round(px * 0.018));
                const d  = o + Math.round(px * 0.08);
                ctx.save();
                ctx.setLineDash([lw * 3, lw * 2.5]);
                ctx.lineWidth = lw;
                ctx.strokeStyle = hexStr(C.EMPTY_DASH_COLOR);
                path(ctx, d, d, px - 2 * d, px - 2 * d, Math.max(1, rad - d + o));
                ctx.stroke();
                ctx.restore();
            }
            canvas.refresh();
        };
        bake('cell_empty',  hexStr(C.EMPTY_BG_COLOR),  true, true);
        bake('cell_filled', hexStr(C.FILLED_BG_COLOR), true);
        bake('cell_face',   hexStr(C.FILLED_BG_COLOR), false);   // no bevel: inside the battery case
    }

    // The stand-alone slot face (portrait only — inside the battery case the
    // divisions use the baked cell texture instead).
    // A stable pseudo-random value in [0,1) for a cell, per `salt`. Same cell,
    // same number, every rebuild — which is the point: it decides which way each
    // cell's grain is mirrored, and a Math.random() there would reshuffle the
    // grid's whole speckle every time the scene is built.
    _cellHash(col, row, salt) {
        let h = (col * 374761393) ^ (row * 668265263) ^ ((salt || 0) * 2147483647);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    _drawSlot(gfx, x, y, size, filled) {
        const shadow = hexColor(CONFIG.CELL.INSET_SHADOW_COLOR);
        const fill   = filled ? hexColor(CONFIG.CELL.FILLED_BG_COLOR) : hexColor(CONFIG.CELL.EMPTY_BG_COLOR);
        const inset  = Math.max(1, Math.round(CONFIG.CELL.INSET_BORDER_WIDTH * size / CONFIG.PLATFORM.SLOT_SIZE));
        const r      = Math.round(CONFIG.PLATFORM.SLOT_RADIUS * size / CONFIG.PLATFORM.SLOT_SIZE);
        // THE EMPTY FACE IS SEE-THROUGH (PLATFORM.SLOT_EMPTY_ALPHA), so an
        // empty slot reads as a hole in the ground rather than a tile of some
        // other colour. So the rim is a RING, stroked, not a full square under
        // the face — a square there would show through the face instead of
        // the ground.
        const a = filled ? 1 : (CONFIG.PLATFORM.SLOT_EMPTY_ALPHA !== undefined
                                ? CONFIG.PLATFORM.SLOT_EMPTY_ALPHA : 1);
        gfx.clear();
        gfx.fillStyle(fill, a);
        gfx.fillRoundedRect(x - size / 2 + inset, y - size / 2 + inset,
            size - inset * 2, size - inset * 2, Math.max(1, r - inset));
        gfx.lineStyle(inset, shadow, 1);
        gfx.strokeRoundedRect(x - size / 2 + inset / 2, y - size / 2 + inset / 2,
            size - inset, size - inset, Math.max(1, r - inset / 2));
    }

    // THE RULE BETWEEN THE TWO HALVES.
    //
    // It used to need a camera of its own to sit ON the boundary: the old farm had
    // its own viewport starting at exactly this line and drawn after the main
    // one, so half the rule was painted over. With one camera left there is
    // nothing to draw over it, and a plain graphics object is the whole story.
    _buildSplitLine() {
        const S = (CONFIG.BACKGROUND || {}).SPLIT_LINE || {};
        if (S.ENABLED === false) return;
        const L = this.layoutConfig, B = L.partB;
        if (!B) return;
        const w = Math.max(1, (S.W !== undefined ? S.W : 3) * L.scale);
        const g = this.add.graphics().setDepth(99998);
        g.lineStyle(w, S.COLOR !== undefined ? S.COLOR : 0x364549,
                       S.ALPHA !== undefined ? S.ALPHA : 0.9);
        if (this.isPortrait) {
            const y = B.y + B.height;              // the springs are the top band
            g.lineBetween(0, y, this.scale.width, y);
        } else {
            const x = B.x;                         // the springs are the right half
            g.lineBetween(x, 0, x, this.scale.height);
        }
        this.splitLine = g;
        // BORN HIDDEN IF THE TUTORIAL IS ALREADY UP. The start overlay is built
        // earlier in create() than this is, so it cannot hide a line that does
        // not exist yet — it leaves word instead, and this honours it.
        if (this._splitLineOff) g.setVisible(false);
    }

    // Show or hide the rule between the halves, remembering the answer for a
    // line that has not been built yet.
    _showSplitLine(on) {
        this._splitLineOff = !on;
        if (this.splitLine && this.splitLine.scene) this.splitLine.setVisible(on);
    }





    // ================================================================
    // LEVEL ART — loaded as levels come near
    // ================================================================
    // WHAT a level needs is decided in assets.js (levelArtFor), from the level's
    // entry and its map — the build runs the same rules to write the page's
    // preload hints. What is here is only WHEN: fetched as levels come near,
    // and waited for before a level is built.




    // ── EVERY BATTERY, QUIETLY, ONCE THE GAME IS RUNNING ─────────────────────
    // The icons are ~2.5KB each and the whole set is 250KB, so nothing is gained
    // by making a player wait for one mid-merge — but nothing is gained by
    // putting 250KB in front of the first frame either.
    //
    // So they are fetched AFTER the loading screen has gone, a few at a time,
    // in the background. A player who loses signal (or a phone that drops to no
    // data on a train) keeps merging as far as they like, and the opening load
    // never grew. Levels the player is about to reach are fetched ahead of this
    // anyway (prefetchAhead), which is what covers the first minute.
    _startBatteryBackfill() {
        const B = CONFIG.BATTERY_BACKFILL || {};
        if (B.ENABLED === false) return;
        const top = getHighestBatteryLevel();
        let next = 1;
        // The timer is held rather than read from the callback's arguments:
        // Phaser hands a repeating callback whatever is in `args`, not the event
        // itself, so asking the argument to remove itself throws.
        let ev = null;
        ev = this.time.addEvent({
            delay: B.EVERY_MS !== undefined ? B.EVERY_MS : 900,
            loop: true,
            callback: () => {
                // NOT WHILE THE OPENING VIEW IS STILL COMING IN. These are the
                // least urgent files in the game; they wait their turn behind
                // the art the player is looking at.
                if (!loadingScreenDone) return;
                let sent = 0;
                const batch = Math.max(1, B.BATCH || 4);
                while (next <= top && sent < batch) {
                    const lvl = next++;
                    if (this.textures.exists(`battery${lvl}`)) continue;
                    this.assets.prefetchBattery(lvl);
                    sent++;
                }
                if (next > top && ev) ev.remove();
            },
        });
    }


    // Big numbers, readably. The economy reaches 27 trillion by level 65, so
    // every figure the player sees goes through this.
    _bigNum(v) {
        const N = CONFIG.NUMBERS || {};
        const a = Math.max(0, v);
        // SHORTEN ONLY WHEN IT BUYS SOMETHING. Abbreviating from a thousand up
        // costs the player the very granularity they are watching: coins going
        // 1,240 → 1,260 → 1,290 reads as progress, and the same run as
        // "1.2K → 1.2K → 1.3K" reads as stuck. Full figures hold until they stop
        // fitting (ABBREV_FROM), and only then does a unit take over.
        const from = N.ABBREV_FROM !== undefined ? N.ABBREV_FROM : 1e6;
        if (a >= from) {
            // ONE DECIMAL IN EACH UNIT'S FIRST DECADE — 1.2M, 9.9M, then 12M —
            // so a big figure still visibly moves instead of sitting on the same
            // two digits for a minute.
            for (const [at, suffix] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) {
                // Cut, not rounded, so 999,600 reads 999K rather than 1000K.
                const d = a < at * 10 ? 1 : 0, k = Math.pow(10, d);
                if (a >= at) return (Math.floor(a / at * k) / k).toFixed(d) + suffix;
            }
        }
        // Grouped, so six digits read at a glance: 50,000 not 50000.
        const whole = String(Math.ceil(a));
        const sep = N.SEPARATOR !== undefined ? N.SEPARATOR : ',';
        return sep ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : whole;
    }

    // Stop the world, or start it again.
    //
    // update() returning early is only half of it. Tweens, the clock, the
    // animations and the particle emitters all run on their own and would carry
    // on regardless — lilies drifting, the belt turning, charge still arriving —
    // so each is stopped explicitly. Anything missed here reads as a bug rather
    // than as a pause.
    _setPaused(on) {
        if (this.gamePaused === on) return;
        this.gamePaused = on;

        if (on) { this.tweens.pauseAll(); this.anims.pauseAll(); }
        else    { this.tweens.resumeAll(); this.anims.resumeAll(); }
        this.time.paused = on;                 // the 1s charge tick, and every
                                               // delayedCall

    }




    /**
     * Calculate display dimensions to fit sprite to target rectangle while preserving aspect ratio.
     * Automatically constrains by width or height to maximize area within the target rect.
     * 
     * @param {Phaser.Textures.Texture} texture - The sprite texture
     * @param {number} targetWidth - The target width
     * @param {number} targetHeight - The target height (optional, defaults to targetWidth for square)
     * @returns {{width: number, height: number}} - Display width and height
     */


    async addBatteryToSlot(slotIndex, level) {
        if (slotIndex < 0 || slotIndex >= 3) return;
        if (this.chargingSlots[slotIndex] !== null) return;
        const p   = this.platforms[slotIndex];
        const perSec  = getBatteryChargeValue(level);
        const batteryIconLevel = getBatteryIconLevel(level);
        // The SLOT's figures, not the grid cell's — see calculateLayout.
        const yOff  = this.slotBatteryYOffset;
        const tOff  = this.slotLevelTextYOffset;

        // Transparent draggable overlay that covers the whole slot cell —
        // gives a reliable pick-up region independent of sprite texture.
        const draggableBg = this.add.rectangle(
            p.slotX, p.slotY, p.slotSize, p.slotSize, 0xFFFFFF, 0)
            .setDepth(10)
            .setInteractive({ draggable: true, useHandCursor: true });

        // As in the grid: drawn on this frame with whatever art exists, dressed
        // in its own the moment that arrives.
        const batterySprite = this.add.image(p.slotX, p.slotY + yOff,
            this.assets.iconKey(batteryIconLevel));
        fitItemIcon(batterySprite, this.slotBatteryW, this.slotBatteryH);
        batterySprite.setDepth(11);
        // ITS STEERING WHEEL, a sprite of its own here so it can turn. Placed
        // over the piggy every frame (_steerWheels).
        const wheel = this.add.image(p.slotX, p.slotY, '__DEFAULT').setVisible(false);
        wheel.ready = false;
        this.assets.dressSlotWhenReady(batterySprite, wheel, batteryIconLevel);

        const levelText = this.add.text(p.slotX, p.slotY + yOff + tOff, `PIGGY ${level}`, {
            fontSize: this.slotLevelTextSize, fontFamily: CONFIG.FONT_FAMILY,
            color: CONFIG.CELL.LEVEL_TEXT_COLOR, fontStyle: CONFIG.FONT_WEIGHT,
        }).setOrigin(0.5).setDepth(12);

        p.slotBgFilled.setVisible(true);
        p.batterySprite    = batterySprite;
        p.batteryLevelText = levelText;

        // Show charge-rate label above the slot
        p.chargeRateText.setText(this._rateText(perSec)).setVisible(true);

        const batteryData = {
            sprite: batterySprite, levelText,
            draggableBg, level,
            slotIndex,
            originalX: p.slotX,
            originalY: p.slotY + yOff,
            inGrid: false, inChargingSlot: true,
            wheel, steer: { angle: 0, vel: 0, target: 0, hold: 0 },
        };
        this.steeringItems.push(batteryData);
        draggableBg.setData('batteryData', batteryData);
        this.chargingSlots[slotIndex] = { level, perSec, batteryData };
        this._hideSlotHint(slotIndex);
    }

    // ================================================================
    // CHARGING
    // ================================================================
    // ONE 1-SECOND TICK, and it is the whole game's heartbeat. Each slot with a
    // piggy in it squeezes the spring above it by that piggy's figure, until
    // the spring is fully compressed. Merge a better piggy, fill it sooner.
    startCharging() {
        if (this.chargingInterval) return;
        this.chargingInterval = this.time.addEvent({
            delay: 1000, callback: this.chargeCycle, callbackScope: this, loop: true,
        });
    }

    chargeCycle() {
        // HELD WHILE A RELAYOUT WAITS, so everything can come to rest — see
        // _pollOrientation. A second or so of squeezing, never lost work.
        if (this._relayoutPending) return;
        for (let i = 0; i < 3; i++) {
            const slot = this.chargingSlots[i], s = this.springs[i];
            if (!slot || !this._springWorking(i)) continue;
            s.compressed = Math.min(s.max, s.compressed + slot.perSec);
            this._stepSpring(s);
            this._pushArrow(s);
            this._pulseRate(i);
            if (s.compressed >= s.max) s.phase = 'ready';
        }
    }

    // THE PIGGY'S FIGURE PULSES on each tick — its push, landing as the
    // spring steps (SPRING.RATE_PULSE).
    _pulseRate(i) {
        const P = (CONFIG.SPRING || {}).RATE_PULSE || {}, t = this.platforms[i] && this.platforms[i].chargeRateText;
        if (P.ENABLED === false || !t || !t.scene || !t.visible) return;
        this.tweens.killTweensOf(t);
        t.setScale(1);
        this.tweens.add({ targets: t, scale: P.SCALE !== undefined ? P.SCALE : 1.2,
            duration: (P.MS !== undefined ? P.MS : 200) / 2, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => t.setScale(1) });
    }

    // THE PULL, MADE VISIBLE: chevrons inside the coil slide toward the base
    // on each tick and fade, so the squeeze has a cause (SPRING.ARROW). s.arrow runs 0..1;
    // _drawSpring draws it.
    _pushArrow(s) {
        const A = (CONFIG.SPRING || {}).ARROW || {};
        if (A.ENABLED === false) return;
        s.arrow = 0;
        this.tweens.add({ targets: s, arrow: 1, duration: A.MS || 450, ease: 'Linear' });
    }

    // A slot's figure: what its piggy squeezes per second.
    _rateText(v) {
        const sfx = (CONFIG.SPRING || {}).RATE_SUFFIX;
        return this._bigNum(v) + (sfx || '');
    }

    // ================================================================
    // THE SPRINGS
    // ================================================================
    // The state is this.springs (init), not the view, so a relayout keeps it:
    // createSprings only builds what draws it, at the size the half allows
    // (springGeo.k — every design px below is multiplied by it).

    // Spring i takes its piggy's push this second: a piggy in its slot, and
    // not yet full.
    _springWorking(i) {
        const s = this.springs[i];
        return !!(this.chargingSlots[i] && s && s.phase === 'compressing');
    }

    // ONE STEP OF THE FORCE: the coil slides down over STEP_MS and stops
    // crisply, with only a faint bulge and ripple (top turns first). Any real
    // wobble makes it read as a weak, floppy spring.
    _stepSpring(s) {
        const sc = CONFIG.SPRING || {};
        const ms = sc.STEP_MS || 250;
        this.tweens.killTweensOf(s);
        this.tweens.add({ targets: s, squeeze: s.compressed / s.max, duration: ms, ease: sc.STEP_EASE || 'Cubic.Out' });
        s.bulge = 0;
        this.tweens.add({ targets: s, bulge: 1, duration: ms / 2, yoyo: true, ease: 'Sine.Out' });
        this._startRipple(s, sc.STEP_RIPPLE || 2, 1, sc.STEP_RIPPLE_MS || 180);
    }

    // A DAMPED WAVE along the coil. dir 1 runs top → base, -1 base → top.
    // `amp` is design px.
    _startRipple(s, amp, dir, ms) {
        s.rAmp = amp; s.rDir = dir; s.rPhase = 0;
        this.tweens.add({
            targets: s, rPhase: 1,
            duration: ms || (CONFIG.SPRING || {}).RIPPLE_MS || 450, ease: 'Linear',
            onComplete: () => { s.rAmp = 0; },
        });
    }

    // 3, 2, 1 — over the springs once all are full, then they let go. If the
    // release cannot happen then (an ad), the springs stay full and the next
    // frame starts the count again.
    _startCountdown() {
        const CD = (CONFIG.SPRING || {}).COUNTDOWN || {}, G = this.springGeo;
        if (!G) return;
        const L = this.layoutConfig, B = L.partB, scale = L.platformScale;
        const y = G.baseY - ((CONFIG.SPRING || {}).REST_HEIGHT || 520) * G.k * (CD.Y_FRAC !== undefined ? CD.Y_FRAC : 0.45);
        const txt = this.add.text(B.x + B.width / 2, y, '', {
            fontFamily: CONFIG.FONT_FAMILY, fontStyle: CONFIG.FONT_WEIGHT,
            fontSize: Math.max(12, Math.round((CD.SIZE || 120) * scale)) + 'px',
            color: CD.COLOR || '#FFFFFF', stroke: CD.STROKE || '#E53935',
            strokeThickness: Math.round((CD.STROKE_W || 10) * scale),
        }).setOrigin(0.5).setDepth(50);
        const c = this.countdown = { txt, n: CD.FROM || 3, timer: null };
        const tick = () => {
            if (this.countdown !== c) return;
            if (c.n <= 0) { this._endCountdown(); this._releaseSprings(); return; }
            txt.setText(String(c.n)).setScale(CD.POP || 1.6).setAlpha(1);
            this.tweens.add({ targets: txt, scale: 1, duration: 300, ease: 'Back.Out' });
            c.n--;
            c.timer = this.time.delayedCall(CD.STEP_MS || 800, tick);
        };
        tick();
    }

    _endCountdown() {
        const c = this.countdown;
        if (!c) return;
        this.countdown = null;
        if (c.timer) c.timer.remove(false);
        this.tweens.killTweensOf(c.txt);
        c.txt.destroy();
    }

    // LET GO, ALL AT ONCE — only when every spring is fully compressed. Each
    // coil snaps back past rest and settles, a ripple runs up it, dust kicks
    // off the base and the screen jolts; the release pays out the level's
    // payouts, and each spring comes back as the NEXT level's, empty.
    _releaseSprings() {
        if (this.isWatchingAd || !this.springs.every(s => s.phase === 'ready')) return;
        const sc = CONFIG.SPRING || {};
        const pay = levelPayoutsFor(this.level).reduce((a, b) => a + b, 0);
        this.level += 1;
        const next = levelStrengthsFor(this.level);
        this.springs.forEach((s, i) => {
            s.phase = 'releasing';
            this.tweens.killTweensOf(s);
            s.bulge = 0;
            s.arrow = 1;
            this.tweens.add({
                targets: s, squeeze: 0,
                duration: sc.RELEASE_MS || 700,
                ease: 'Elastic.Out',
                onComplete: () => {
                    s.max = next[i]; s.compressed = 0; s.phase = 'compressing';
                    // Mid-flight, the flight's end brings them (_endFlight).
                    if (!this.flight) this.payloads[i] = this._makePayload(i, true);
                },
            });
            this._launchPayload(i);
            this._startRipple(s, sc.RELEASE_RIPPLE || 30, -1);
            this._spawnDust(i);
        });
        this.cameras.main.shake(sc.SHAKE_MS || 150, sc.SHAKE_INTENSITY || 0.006);
        this._startFlight(this.level - 1);
        this._drawSprings();
        // FROM THE MIDDLE SPRING'S TOP, where the eye is when it lets go.
        const G = this.springGeo;
        if (pay > 0 && G) {
            const mid = Math.floor(this.springs.length / 2);
            this.animateCoinReward(G.xs[mid], G.baseY - (sc.REST_HEIGHT || 520) * G.k, pay);
        }
    }

    // ── DUST ─────────────────────────────────────────────────────────────────
    // Puffs from both sides of a base plate. Kept as plain data and drawn into
    // the spring graphics, so there is nothing extra to tear down.
    _spawnDust(i) {
        const sc = CONFIG.SPRING || {}, G = this.springGeo;
        if (!G) return;
        const k = G.k;
        const half = ((sc.WIDTH || 170) / 2 + 30) * k;
        this.dust = this.dust || [];
        const n = sc.DUST_COUNT || 10;
        for (let j = 0; j < n; j++) {
            const side = j % 2 ? 1 : -1;
            this.dust.push({
                x: G.xs[i] + side * half, y: G.baseY,
                vx: side * (80 + Math.random() * 220) * k, vy: -(40 + Math.random() * 120) * k,   // px/s
                r: (8 + Math.random() * 10) * k, life: 0, ttl: 450 + Math.random() * 300,        // px, ms
            });
        }
    }

    _updateDust(delta) {
        if (!this.dust) return;
        const dt = delta / 1000;
        for (const d of this.dust) {
            d.life += delta;
            d.x += d.vx * dt; d.y += d.vy * dt;
            d.vx *= 0.92; d.vy *= 0.92;     // air drag, per frame
        }
        this.dust = this.dust.filter(d => d.life < d.ttl);
    }

    // Every frame (update): the shiver and glow run on this clock, which
    // stops with the game.
    _updateSprings(delta) {
        this._springT = (this._springT || 0) + delta;
        this._updateDust(delta);
        const dt = Math.min(delta, 50) / 1000;
        if (this.skyGfx && this.skyGfx.scene) { this.skyGfx.clear(); this._drawSky(this.skyGfx, 0, 0, dt); }
        this._updateFlight(dt);
        this._drawSprings();
    }

    // ── PAYLOADS ─────────────────────────────────────────────────────────────

    // Spring i's payload for the current level, sized to the spring. _drawSpring
    // seats it on the top plate every frame; `drop` brings it in from above.
    _makePayload(i, drop) {
        const PL = CONFIG.PAYLOAD || {}, G = this.springGeo;
        const key = payloadKey(this.level);
        if (!G || !this.textures.exists(key)) return null;
        const img = this.add.image(G.xs[i], G.baseY, key).setOrigin(0.5, 1).setDepth(PL.DEPTH || 4);
        const src = img.frame;
        img.setScale((PL.SIZE || 120) * G.k / Math.max(src.width, src.height));
        img.dropOff = 0;
        if (drop) {
            img.dropOff = -(PL.DROP_PX || 120) * G.k;
            img.setAlpha(0);
            this.tweens.add({ targets: img, dropOff: 0, alpha: 1, duration: PL.DROP_MS || 500, ease: 'Bounce.Out' });
        }
        return img;
    }

    // Off the spring and up, out of the top of the screen — fast from the
    // start, as the spring flings it — turning a little and shrinking into the
    // distance.
    _launchPayload(i) {
        const PL = CONFIG.PAYLOAD || {}, img = this.payloads[i];
        this.payloads[i] = null;
        if (!img || !img.scene) return;
        this.tweens.killTweensOf(img);
        img.setAlpha(1).setDepth(6);
        const B = this.layoutConfig.partB, spin = PL.LAUNCH_SPIN !== undefined ? PL.LAUNCH_SPIN : 25;
        this.tweens.add({
            targets: img,
            y: B.y - 2 * B.height,
            scale: img.scale * 0.6,
            angle: (Math.random() * 2 - 1) * spin,
            duration: PL.LAUNCH_MS || 900, ease: 'Cubic.Out',
            onComplete: () => img.destroy(),
        });
    }

    // ── THE SKY ──────────────────────────────────────────────────────────────
    // ONE WORLD, seen at an altitude `alt` (in half-heights above the ground):
    // the top of the Earth at the bottom, blue sky and clouds over it, and
    // higher up the sky goes dark and the stars come out. The spring half sits
    // at alt 0 (skyGfx, under the springs). A launch cuts to the FLIGHT — the
    // same world drawn over the whole half (flightGfx), climbing ever faster
    // with the payloads in view, until it fades back to the springs.

    _skyWorld() {
        if (this._sky) return this._sky;
        const S = CONFIG.SKY || {}, C = S.CLOUDS || {};
        const clouds = [], stars = [];
        for (let n = 0; n < (C.COUNT || 9); n++)
            clouds.push({ alt: (C.FROM || 0.35) + ((C.TO || 2.4) - (C.FROM || 0.35)) * (n + Math.random()) / (C.COUNT || 9),
                          x: Math.random(), s: 0.6 + 0.8 * Math.random(), v: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random()) });
        for (let n = 0; n < (S.STARS || 80); n++)
            stars.push({ x: Math.random(), y: Math.random(), z: 0.3 + 0.7 * Math.random() });
        return (this._sky = { clouds, stars });
    }

    // The world at `alt`, over partB, into g. `speed` is how fast it is
    // climbing (half-heights per second): the stars scroll by it, and streak.
    _drawSky(g, alt, speed, dt) {
        const S = CONFIG.SKY || {}, W = this._skyWorld();
        const L = this.layoutConfig, B = L.partB, H = B.height, sc = L.platformScale;
        const clamp = (x) => Math.max(0, Math.min(1, x));
        const dark = clamp(alt / (S.SPACE_ALT || 2.5));                // 0 blue sky .. 1 space
        const top = lerpColor(hexColor(S.SKY_TOP || '#3A8DDE'), hexColor(S.SPACE_TOP || '#05071A'), clamp(dark * 1.4));
        const bot = lerpColor(hexColor(S.SKY_BOT || '#BFE6FF'), hexColor(S.SPACE_BOT || '#151040'), dark);
        g.fillGradientStyle(top, top, bot, bot, 1);
        g.fillRect(B.x, B.y, B.width, H);

        // STARS, in screen space: they fade in as the sky darkens and scroll
        // down at the climb's own speed.
        const starA = clamp((dark - 0.45) / 0.55);
        if (starA > 0) {
            const col = hexColor(S.STAR_COLOR || '#FFFFFF');
            for (const st of W.stars) {
                st.y += speed * st.z * dt;
                if (st.y > 1) { st.y -= Math.floor(st.y); st.x = Math.random(); }
                const x = B.x + st.x * B.width, y = B.y + st.y * H;
                const r = Math.max(0.5, (S.STAR_SIZE || 2.2) * sc * st.z);
                const len = speed * st.z * H * 0.03;                   // about two frames' travel
                g.lineStyle(r * 1.4, col, starA * (0.35 + 0.65 * st.z));
                if (len > r) g.lineBetween(x, y - len, x, y);
                else { g.fillStyle(col, starA * (0.35 + 0.65 * st.z)); g.fillCircle(x, y, r); }
            }
        }

        // CLOUDS: a flat base and a few puffs, drifting sideways; at their own
        // altitudes, so a climb sweeps them down past the view.
        const C = S.CLOUDS || {}, cw = (C.SIZE || 150) * sc;
        for (const c of W.clouds) {
            c.x += c.v * (C.DRIFT || 0.01) * dt;
            if (c.x > 1.2) c.x -= 1.4; else if (c.x < -0.2) c.x += 1.4;
            const y = B.y + H - (c.alt - alt) * H, w = cw * c.s;
            if (y < B.y - w || y > B.y + H + w) continue;
            const x = B.x + c.x * B.width;
            g.fillStyle(hexColor(C.SHADE || '#D6E4F0'), C.ALPHA || 0.9);
            g.fillEllipse(x, y + w * 0.08, w * 1.5, w * 0.4);
            g.fillStyle(hexColor(C.COLOR || '#FFFFFF'), C.ALPHA || 0.9);
            for (const [dx, dy, r] of [[-0.45, -0.02, 0.24], [-0.15, -0.16, 0.32], [0.2, -0.12, 0.28], [0.48, 0, 0.2]])
                g.fillCircle(x + dx * w, y + dy * w, r * w);
            g.fillEllipse(x, y, w * 1.4, w * 0.32);
        }

        // THE EARTH: the top of a great sphere, with a thin bright haze of air
        // round its rim. It sinks away as the view climbs.
        // AT REST THE SPRINGS STAND ON IT: the ground meets the outer springs'
        // base plates SEAT design px below their face (the middle one, on the
        // crown, sinks in a touch).
        const E = S.EARTH || {}, G = this.springGeo;
        const R = B.width * (E.RADIUS || 1.6), ex = B.x + B.width / 2;
        let rest = B.y + H * (E.TOP || 0.78);
        if (G) {
            const dx = Math.max(...G.xs.map((x) => Math.abs(x - ex)));
            rest = G.baseY + (E.SEAT !== undefined ? E.SEAT : 24) * G.k - (R - Math.sqrt(Math.max(0, R * R - dx * dx)));
        }
        const eTop = rest + alt * H;
        if (eTop < B.y + H + 40 * sc) this._drawEarth(g, ex, eTop + R, R, B.width, sc);
    }

    // THE PLANET, as seen from just above it: a blue ocean with continents and
    // a band of air glowing round the rim; and on its crown the springs'
    // island — grass over brown soil, shown cut away like a slice of ground,
    // tapering to the shore at both ends. (cx, cy) is the centre, R the radius;
    // everything sits inside the circle, so nothing needs clipping.
    _drawEarth(g, cx, cy, R, w, sc) {
        const E = (CONFIG.SKY || {}).EARTH || {};
        const pt = (a, r) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];   // a = radians from the crown
        const fill = (pts, color, alpha) => {
            g.fillStyle(hexColor(color), alpha);
            g.beginPath();
            g.moveTo(pts[0][0], pts[0][1]);
            for (let j = 1; j < pts.length; j++) g.lineTo(pts[j][0], pts[j][1]);
            g.closePath();
            g.fillPath();
        };

        // AIR: a few soft rings, thinning outward.
        const haze = (E.HAZE_PX || 14) * sc;
        for (let n = 3; n >= 1; n--) {
            g.fillStyle(hexColor(E.HAZE || '#BFE9FF'), 0.18 + 0.12 * (3 - n));
            g.fillCircle(cx, cy, R + haze * n);
        }
        g.fillStyle(hexColor(E.OCEAN || '#2E7CC4'), 1);
        g.fillCircle(cx, cy, R);
        g.fillStyle(hexColor(E.OCEAN_DEEP || '#225FA0'), 1);
        g.fillCircle(cx, cy, R - 0.08 * w);

        // CONTINENTS: [angle from the crown, depth below the surface, size],
        // depth and size × the half's width. A sandy blob with green over most
        // of it; each stays clear of the rim.
        for (const [a, d, r] of E.CONTINENTS || []) {
            const [x, y] = pt(a, R - d * w), s = r * w;
            const blob = (k, dx, dy) => g.fillCircle(x + dx * s, y + dy * s, k * s);
            g.fillStyle(hexColor(E.SAND || '#D9C48A'), 1);
            blob(0.75, -0.55, 0.1); blob(0.95, 0, 0); blob(0.7, 0.6, -0.15); blob(0.55, 0.15, 0.7);
            g.fillStyle(hexColor(E.LAND || '#5DAA4C'), 1);
            blob(0.6, -0.5, 0.05); blob(0.82, 0, -0.05); blob(0.55, 0.55, -0.15); blob(0.4, 0.15, 0.6);
        }
        // Wisps of cloud over the ocean.
        g.fillStyle(0xffffff, 0.35);
        for (const [a, d, len] of [[-0.2, 0.2, 0.22], [0.12, 0.38, 0.28], [-0.05, 0.6, 0.2]]) {
            const [x, y] = pt(a, R - d * w);
            g.fillEllipse(x, y, len * w, 0.025 * w);
        }

        // THE ISLAND: lens-shaped layers sharing the surface as their top edge,
        // each its own depth at the middle and tapering to nothing at the shore.
        const half = Math.asin(Math.min(1, (E.ISLAND || 0.46) * w / R));
        const N = 48;
        const lens = (depth, color, grow) => {
            const a0 = half * (1 + grow), pts = [];
            for (let j = 0; j <= N; j++) pts.push(pt(-a0 + 2 * a0 * j / N, R + (grow ? 1.5 * sc : 0)));
            for (let j = N; j >= 0; j--) {
                const u = j / N, taper = Math.pow(Math.sin(Math.PI * u), 0.55);
                pts.push(pt(-a0 + 2 * a0 * u, R - depth * taper));
            }
            fill(pts, color, 1);
        };
        lens((E.SAND_PX || 26) * sc, E.SAND || '#D9C48A', 0.06);          // a beach just past the grass
        lens((E.DEEP_PX || 90) * sc, E.SOIL_DEEP || '#6B4A2F', 0);
        lens((E.SOIL_PX || 48) * sc, E.SOIL || '#8D6339', 0);
        lens((E.GRASS_PX || 16) * sc, E.GRASS || '#5DBB4A', 0);
        // Pebbles in the soil.
        g.fillStyle(hexColor(E.SOIL_DEEP || '#6B4A2F'), 1);
        for (const [u, d, r] of [[-0.7, 30, 4], [-0.35, 62, 5], [0.05, 38, 3.5], [0.4, 70, 4.5], [0.72, 34, 3.5], [-0.05, 75, 3]]) {
            const [x, y] = pt(u * half, R - d * sc);
            g.fillCircle(x, y, r * sc);
        }
        // Lit grass edge and darker tufts along the surface.
        g.lineStyle(Math.max(1, 4 * sc), hexColor(E.GRASS_LIGHT || '#8EDB6A'), 1);
        g.beginPath();
        for (let j = 0; j <= N; j++) {
            const [x, y] = pt(-half * 0.92 + 1.84 * half * j / N, R - 1.5 * sc);
            if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokePath();
        const tuftH = (E.TUFT_PX || 10) * sc, tufts = E.TUFTS || 18;
        for (let n = 0; n < tufts; n++) {
            const a = -half * 0.88 + 1.76 * half * (n + 0.5) / tufts + ((n * 37) % 7 - 3) * 0.002;
            const h = tuftH * (0.7 + 0.3 * ((n * 53) % 5) / 4);
            const pts = [pt(a - 0.008, R - 1), pt(a - 0.004, R + h), pt(a, R + h * 0.4), pt(a + 0.004, R + h * 0.9), pt(a + 0.008, R - 1)];
            fill(pts, E.GRASS_DARK || '#3F8F35', 1);
        }
    }

    // ── THE FLIGHT ───────────────────────────────────────────────────────────

    // Called on RELEASE, with the level that was just completed. The springs
    // fling their payloads off the top; CUT_MS later the half cuts to the
    // flight: the same three, climbing through the clouds into the stars.
    _startFlight(level) {
        const F = (CONFIG.SKY || {}).FLIGHT || {};
        if (F.ENABLED === false) return;
        const L = this.layoutConfig, B = L.partB, G = this.springGeo;
        const key = payloadKey(level);
        const g = this.flightGfx;
        const f = this.flight = { t: 0, alt: F.START_ALT || 0.4, speed: 0, imgs: [], out: false, alpha: 0 };
        this.tweens.add({ targets: f, alpha: 1, delay: F.CUT_MS || 450, duration: F.FADE_MS || 250 });
        if (!this.textures.exists(key) || !G) return;
        const size = ((CONFIG.PAYLOAD || {}).SIZE || 120) * G.k * (F.SCALE || 1.3);
        G.xs.forEach((x, i) => {
            const img = this.add.image(x, B.y + B.height + size, key).setOrigin(0.5).setDepth((F.DEPTH || 40) + 1).setAlpha(0);
            img.setScale(size / Math.max(img.frame.width, img.frame.height));
            img.by = img.y;
            // Up into view from below, as the camera catches them.
            this.tweens.add({ targets: img, by: B.y + B.height * (F.CRUISE_Y || 0.45) + (i - 1) * size * 0.15,
                alpha: 1, delay: (F.CUT_MS || 450) + 80 * i, duration: F.ENTER_MS || 600, ease: 'Cubic.Out' });
            f.imgs.push(img);
        });
        if (g) g.setVisible(true).setAlpha(0);
    }

    // Each frame: the climb speeds up (ACCEL_MS to full SPEED), the payloads
    // bob, and at the end they shoot off the top as the half fades back.
    _updateFlight(dt) {
        const f = this.flight, g = this.flightGfx;
        if (!f) { if (g && g.visible) g.clear().setVisible(false); return; }
        const F = (CONFIG.SKY || {}).FLIGHT || {};
        const B = this.layoutConfig.partB, sc = this.layoutConfig.platformScale;
        const total = F.MS || 3200, outMs = F.OUT_MS || 450;
        f.t += dt * 1000;
        const ramp = Math.min(1, f.t / (F.ACCEL_MS || 1400));
        f.speed = (F.SPEED || 3.5) * ramp * ramp;
        f.alt += f.speed * dt;
        if (g) {
            g.clear().setAlpha(f.alpha);
            this._drawSky(g, f.alt, f.speed, dt);
        }
        f.imgs.forEach((img, i) => {
            if (!img.scene) return;
            const ph = f.t * 0.006 + i * 2.1;
            img.setPosition(img.x, img.by + Math.sin(ph) * 5 * sc);
            if (!f.out) img.setAngle(Math.sin(ph * 0.7) * 6);
        });
        if (!f.out && f.t >= total - outMs) {
            f.out = true;
            for (const img of f.imgs) this.tweens.add({ targets: img, by: B.y - B.height * 0.6,
                scale: img.scale * 0.6, duration: outMs, ease: 'Cubic.In' });
            this.tweens.add({ targets: f, alpha: 0, delay: outMs * 0.5, duration: outMs * 0.5 });
        }
        if (f.t >= total + 50) this._endFlight();
    }

    // Back at the springs: the next level's payloads drop onto them.
    _endFlight() {
        const f = this.flight;
        if (!f) return;
        this.tweens.killTweensOf(f);
        for (const img of f.imgs) { this.tweens.killTweensOf(img); img.destroy(); }
        this.flight = null;
        if (this.flightGfx) this.flightGfx.clear().setVisible(false);
        this.springs.forEach((s, i) => {
            if (!this.payloads[i] && s.phase !== 'releasing') this.payloads[i] = this._makePayload(i, true);
        });
    }

    _drawSprings() {
        const g = this.springGfx;
        if (!g || !g.scene) return;
        g.clear();
        const sc = CONFIG.SPRING || {};
        this.springs.forEach((s, i) => {
            this._drawSpring(g, i, s);
            // What is still to go; fully compressed, MAX!
            const left = s.max - s.compressed;
            this.springLabels[i].setText(left > 0 ? this._bigNum(left) : 'MAX!');
        });
        for (const d of this.dust || []) {
            const k = d.life / d.ttl;
            g.fillStyle(hexColor(sc.DUST_COLOR || '#CFD8DC'), 0.5 * (1 - k));
            g.fillCircle(d.x, d.y, d.r * (1 + k));
        }
        // ALL FULL: count down and launch on its own.
        if (!this.countdown && !this.flight && !this.isWatchingAd && this.springs.every(s => s.phase === 'ready'))
            this._startCountdown();
    }

    _drawSpring(g, idx, s) {
        const sc = CONFIG.SPRING || {}, G = this.springGeo;
        const k = G.k, cx = G.xs[idx];
        const rest = (sc.REST_HEIGHT || 520) * k, min = (sc.MIN_HEIGHT || 110) * k;
        const w = (sc.WIDTH || 170) * k, coils = sc.COILS || 9, lw = Math.max(2, (sc.LINE_WIDTH || 14) * k);
        const plateH = (sc.PLATE_H || 24) * k;
        const t = this._springT || 0;

        const baseY = G.baseY;                              // top of the base plate
        const len = rest - (rest - min) * s.squeeze;        // squeeze may dip below 0 on the overshoot
        const topY = baseY - len;                           // bottom of the top plate

        // TENSION: the further it is squeezed the more it shivers; full, it
        // shivers hardest. ALONG THE AXIS, up and down — the coil straining
        // against the squeeze, not swaying. Offset grows up the coil — the
        // base is held down.
        // Each spring gets its own phase so they do not shake in lockstep.
        const sq = Math.max(0, Math.min(1, s.squeeze));
        const tension = s.phase === 'ready' ? 1 : (s.phase === 'compressing' ? 0.4 * sq * sq : 0);
        const shiver = (sc.SHIVER_PX || 3) * k * tension * Math.sin(t * 0.09 + idx * 2.1);

        // THE PLATES: flat round discs, seen from the coil's own angle — an
        // elliptical top face (squashed by the same tilt as each turn), a band
        // of side under it, and a dark rim. The base goes down first and the
        // coil stands on it; the top goes on last, over the coil's top turn.
        const outlineC = hexColor(sc.OUTLINE_COLOR || '#263238');
        const sideC = hexColor(sc.PLATE_COLOR || '#78909C');
        const faceC = lerpColor(sideC, 0xffffff, 0.35);
        const disc = (y, rx) => {                          // y = the top face's centre
            const ry = rx * (sc.COIL_TILT || 22) / ((sc.WIDTH || 170) / 2);
            const rim = Math.max(1, 2 * k);
            g.fillStyle(sideC, 1);
            g.fillRect(cx - rx, y, 2 * rx, plateH);
            g.fillEllipse(cx, y + plateH, 2 * rx, 2 * ry);
            // The rim: the side's outer edges and the near half of its bottom.
            g.lineStyle(rim, outlineC, 1);
            g.beginPath();
            g.moveTo(cx - rx, y);
            g.lineTo(cx - rx, y + plateH);
            for (let j = 1; j <= 24; j++) {
                const a = Math.PI - Math.PI * j / 24;
                g.lineTo(cx + rx * Math.cos(a), y + plateH + ry * Math.sin(a));
            }
            g.lineTo(cx + rx, y);
            g.strokePath();
            g.fillStyle(faceC, 1);
            g.fillEllipse(cx, y, 2 * rx, 2 * ry);
            g.strokeEllipse(cx, y, 2 * rx, 2 * ry);
        };
        disc(baseY, w / 2 + 30 * k);

        // THE COIL: a helix seen slightly from above. Each turn is an ellipse
        // (half-height `tilt`) climbing the axis; the back halves go down first
        // in a darker shade, then the front halves over them, so it reads as
        // wire wound round a cylinder rather than a flat zigzag.
        const tilt = (sc.COIL_TILT || 22) * k;
        // CLOSED ENDS, as on a real spring: the last END_TURNS at each end lie
        // FLAT on their plate rather than climbing, so a long arc of wire
        // bears on it instead of one point. The base's flat turn sits on the
        // plate's face; the top's hugs the top plate's rim from under it.
        const endT = Math.max(0, Math.min(coils / 2 - 0.05,
                         sc.END_TURNS !== undefined ? sc.END_TURNS : 0.75));
        const ryTop = (w / 2 + 10 * k) * tilt / (w / 2);    // the top plate's ellipse, as disc() draws it
        const baseAxis = baseY;
        const topAxis = topY + Math.max(0, ryTop - tilt) + lw * 0.5;
        const SEG = 20;                                     // samples per half turn
        const bulge = (sc.BULGE || 0.015) * (s.bulge || 0);
        const rAmp = (s.rAmp || 0) * k * (1 - (s.rPhase || 0)); // ripple dies out as it travels
        const point = (a) => {                              // a = angle along the wire, radians
            const u = a / (Math.PI * 2 * coils);            // 0 at the base .. 1 at the top
            // f: how far up the CLIMBING part this is — 0 along the base's
            // flat turn, 1 along the top's.
            const f = Math.max(0, Math.min(1, (a / (Math.PI * 2) - endT) / (coils - 2 * endT)));
            const ends = Math.sin(Math.PI * f);             // 0 on both flat ends: the plates hold them
            const ripple = rAmp * ends * Math.sin(Math.PI * 2 * (2 * u + 2 * (s.rDir || 1) * (s.rPhase || 0)));
            const axisY = baseAxis - (baseAxis - topAxis) * f + ripple + shiver * f;
            const r = (w / 2) * (1 + bulge * ends);
            return [cx + r * Math.cos(a), axisY + tilt * Math.sin(a)];
        };
        const halves = [];                                  // halves[n]: a in [nπ, (n+1)π]
        for (let n = 0; n < coils * 2; n++) {
            const pts = [];
            for (let j = 0; j <= SEG; j++) pts.push(point((n + j / SEG) * Math.PI));
            halves.push(pts);
        }
        const stroke = (n, width, color, alpha, dy) => {
            const pts = halves[n];
            g.lineStyle(width, color, alpha);
            g.beginPath();
            g.moveTo(pts[0][0], pts[0][1] + dy);
            for (let j = 1; j < pts.length; j++) g.lineTo(pts[j][0], pts[j][1] + dy);
            g.strokePath();
        };

        // FULL: a soft pulsing glow behind the whole coil says "loaded".
        if (s.phase === 'ready') {
            const a = 0.25 + 0.15 * Math.sin(t * 0.008);
            for (let n = 0; n < coils * 2; n++) stroke(n, lw + 22 * k, hexColor(sc.GLOW_COLOR || '#FFD54F'), a, 0);
        }

        // SHADED WIRE: a dark outline, the body, then a thin light streak along
        // the top edge, so the wire reads as a round metal rod. The front warms
        // toward HOT_COLOR as it is squeezed.
        const outline = hexColor(sc.OUTLINE_COLOR || '#263238');
        const front = lerpColor(hexColor(sc.COLOR || '#B0BEC5'), hexColor(sc.HOT_COLOR || '#FF8A65'), 0.6 * sq);
        // sin(a) > 0 is nearer the viewer (lower on screen): even half turns.
        for (let n = 1; n < coils * 2; n += 2) {
            stroke(n, lw + 4 * k, outline, 1, 0);
            stroke(n, lw, hexColor(sc.BACK_COLOR || '#546E7A'), 1, 0);
        }
        for (let n = 0; n < coils * 2; n += 2) {
            stroke(n, lw + 4 * k, outline, 1, 0);
            stroke(n, lw, front, 1, 0);
            stroke(n, Math.max(1, lw * 0.3), hexColor(sc.HIGHLIGHT_COLOR || '#FFFFFF'), 0.75, -lw * 0.22);
        }
        // PULL ARROWS, DOWN BOTH SIDES OF THE COIL: down-pointing chevrons
        // stacked from the top plate's level toward the base, all moving one
        // place down and fading — the top plate drawn down from below (see
        // _pushArrow).
        const A = sc.ARROW || {};
        if (s.phase === 'compressing' && s.arrow !== undefined && s.arrow < 1) {
            const p = s.arrow;
            const slide = 1 - Math.pow(1 - p, 3);                       // Cubic.Out
            const alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
            const hw = (A.W || 36) / 2 * k, ch = (A.H || 22) * k, th = (A.THICK || 9) * k;
            const count = A.COUNT || 4, pad = (A.GAP || 8) * k;
            const off = w / 2 + lw + (A.SIDE_GAP || 12) * k + hw;      // centre of each column from the axis
            const top = topAxis + tilt + pad, room = (baseAxis - tilt - pad) - top - ch;
            const step = Math.max(0, Math.min((A.SPACING || 26) * k, room / count));
            const fill = hexColor(A.COLOR || '#FFD54F');
            for (const x of [cx - off, cx + off]) for (let n = 0; n < count; n++) {
                const y0 = top + (n + slide) * step;
                const fade = 1 - 0.7 * (count - 1 - n) / count;     // the lowest, leading one strongest
                const pts = [[x - hw, y0], [x, y0 + ch - th], [x + hw, y0],
                             [x + hw, y0 + th], [x, y0 + ch], [x - hw, y0 + th]];
                g.fillStyle(fill, alpha * fade);
                g.lineStyle(Math.max(1, 3 * k), outlineC, alpha * fade);
                g.beginPath();
                g.moveTo(pts[0][0], pts[0][1]);
                for (let j = 1; j < pts.length; j++) g.lineTo(pts[j][0], pts[j][1]);
                g.closePath();
                g.fillPath();
                g.strokePath();
            }
        }

        disc(topY + shiver - plateH, w / 2 + 10 * k);

        // THE PAYLOAD rides the top plate, its bottom sunk a little into the face.
        const pay = this.payloads && this.payloads[idx];
        const seatY = topY + shiver - plateH + ryTop * ((CONFIG.PAYLOAD || {}).SINK || 0.4);
        if (pay && pay.scene) pay.setPosition(cx, seatY + (pay.dropOff || 0));
    }


    // ================================================================
    // STEERING — the slot piggies' wheels
    // ================================================================
    // Every piggy that went into a slot carries its own wheel sprite. Each
    // frame the wheel is laid over its piggy (wherever the piggy is — in the
    // slot, mid-drag, springing back) at the piggy's scale, and turned by its
    // slot's driver (CONFIG.STEERING). A piggy that has left the slots for the
    // grid gets its one-piece picture back and the wheel goes.
    _steerWheels(delta) {
        const dt = Math.min(delta, 50) / 1000;
        const ST = CONFIG.STEERING || {};
        const drivers = ST.DRIVERS || [];
        const at = ITEM_ART.WHEEL_AT;
        this.steeringItems = this.steeringItems.filter((bd) => {
            const spr = bd.sprite, wheel = bd.wheel;
            if (!wheel || !wheel.scene) return false;
            if (!spr || !spr.scene) { wheel.destroy(); return false; }
            // Off to the grid — the one-piece picture again, no wheel.
            if (!bd.inChargingSlot && bd !== this.draggingBattery) {
                wheel.destroy();
                bd.wheel = bd.steer = null;
                this.assets.dressWhenReady(spr, getBatteryIconLevel(bd.level));
                return false;
            }

            // THE DRIVER. Only while the piggy is actually sitting in its
            // slot and squeezing its spring; picked up, or with the spring
            // full, it lets go and the wheel drifts back to centre.
            const st = bd.steer;
            const slot = this.chargingSlots[bd.slotIndex];
            const driving = slot && slot.batteryData === bd && this._springWorking(bd.slotIndex);
            const D = drivers[bd.slotIndex % Math.max(1, drivers.length)] || {};
            if (driving) {
                st.hold -= dt;
                if (st.hold <= 0) {
                    const r = Math.random(), side = Math.random() < 0.5 ? -1 : 1;
                    if (r < (D.CENTER_CHANCE || 0)) st.target = 0;
                    else if (r < (D.CENTER_CHANCE || 0) + (D.BIG_CHANCE || 0))
                        st.target = side * (D.BIG_DEG || 90) * (0.55 + 0.45 * Math.random());
                    else st.target = side * (D.SMALL_DEG || 20) * Math.random();
                    const lo = D.HOLD_MIN !== undefined ? D.HOLD_MIN : 0.5;
                    const hi = D.HOLD_MAX !== undefined ? D.HOLD_MAX : 1.5;
                    st.hold = lo + (hi - lo) * Math.random();
                }
            } else {
                st.target = 0;
            }
            // A spring toward the target: hands on a wheel, not a dial.
            const w = D.STIFFNESS || 5, z = D.DAMPING !== undefined ? D.DAMPING : 0.9;
            st.vel += (w * w * (st.target - st.angle) - 2 * z * w * st.vel) * dt;
            st.angle += st.vel * dt;

            // OVER THE PIGGY, at the piggy's scale — measured off its frame
            // the same way the two were drawn together (composeBattery).
            const f = spr.frame;
            const kx = f.realWidth / ITEM_ART.REF_W, ky = f.realHeight / ITEM_ART.REF_H;
            const cx = (at.x + at.size / 2) * kx, cy = (at.y + at.size / 2) * ky;
            wheel.setPosition(spr.x + (cx - spr.originX * f.realWidth) * spr.scaleX,
                              spr.y + (cy - spr.originY * f.realHeight) * spr.scaleY)
                .setScale(at.size * kx * spr.scaleX / wheel.frame.realWidth,
                          at.size * ky * spr.scaleY / wheel.frame.realHeight)
                .setAngle(st.angle)
                .setDepth(spr.depth + 0.5)
                .setAlpha(spr.alpha)
                .setVisible(!!wheel.ready && spr.visible);
            return true;
        });
    }

    
    
    
    
    
    
    
    


    // ================================================================
    // BATTERY MERGE GRID (BOTTOM HALF)
    // ================================================================
    createGrid() {
        const W = this.scale.width;
        const H = this.scale.height;
        const L = this.layoutConfig;
        
        const gridW = this.GRID_COLS * this.CELL_SIZE + (this.GRID_COLS - 1) * this.CELL_GAP;
        const gridH = this.GRID_ROWS * this.CELL_SIZE + (this.GRID_ROWS - 1) * this.CELL_GAP;
        
        // Grid panel centre is anchored to a fixed fraction of partA.height
        // (L.panelCenterY); cells are laid around it using the actual scale-sized
        // gridH. Horizontally centred in the half (works in both orientations).
        const gridStartY = L.panelCenterY - gridH / 2 + this.CELL_SIZE / 2;
        const gridStartX = L.partA.x + (L.partA.width - gridW) / 2 + this.CELL_SIZE / 2;
        const gridCenterX = L.partA.x + L.partA.width / 2;

        this.gridStartX = gridStartX;
        this.gridStartY = gridStartY;

        const pad  = L.panPad;
        const panW = gridW + 2 * pad;
        const panH = gridH + 2 * pad;
        const cx   = gridStartX - this.CELL_SIZE / 2 + gridW / 2;
        const cy   = gridStartY - this.CELL_SIZE / 2 + gridH / 2;

        // The panel is drawn, not art: a rounded square hugging the cells with a
        // small even padding. The old grid_panel.png carried a lot of baked
        // margin and shadow around the nine cells, which cost vertical space the
        // half does not have to spare.
        const C     = CONFIG.CELL;
        const panel = this.gridPanel = this.add.graphics().setDepth(3.4);   // over the slots (3)
        const radius = Math.round(C.GRID_PANEL_RADIUS * L.colScale);
        this._drawWoodPanel(panel, cx - panW / 2, cy - panH / 2, panW, panH, radius, L.colScale, C.GRID_PANEL_COLOR, pad - 1, 0);

        this._makeCellTextures(this.CELL_SIZE);
        for (let row = 0; row < this.GRID_ROWS; row++) {
            this.gridCells[row] = [];
            for (let col = 0; col < this.GRID_COLS; col++) {
                const x = gridStartX + col * (this.CELL_SIZE + this.CELL_GAP);
                const y = gridStartY + row * (this.CELL_SIZE + this.CELL_GAP);

                // Both states are the baked textures. The grain is mirrored per
                // cell — from the cell's own hash, so it survives a rebuild —
                // otherwise the same speckle pattern repeats nine times over.
                const fx = this._cellHash(col, row, 9) < 0.5;
                const fy = this._cellHash(col, row, 10) < 0.5;
                const face = (key, visible) => this.add.image(x, y, key)
                    .setDisplaySize(this.CELL_SIZE, this.CELL_SIZE)
                    .setFlipX(fx).setFlipY(fy)
                    .setDepth(3.5).setVisible(visible);
                const emptyCell = face('cell_empty',  true);
                const filledBg  = face('cell_filled', false);

                this.gridCells[row][col] = { x, y, row, col, isEmpty: true, cell: emptyCell, filledBg };
            }
        }
    }

    // THE WOODEN FRAME (CELL.GRID_PANEL_WOOD), drawn into `panel` — layered
    // rounded rects, outside in: shadow, dark edge, shaded wood, lit wood,
    // grain, highlight, lip, then `fill` inside. Shared by the grid panel and
    // the spawn button so the two match. `s` scales the design px; `maxWood`
    // caps the band and `woodK` thins it; `salt` varies the grain between panels.
    // `raised` ({ SHADE, EDGE, HIGHLIGHT }) makes the inside a raised pad, not a
    // sunk tray: no dark lip, a darker strip under it, a light line on top.
    _drawWoodPanel(panel, x0, y0, panW, panH, radius, s, fill, maxWood, salt, woodK, raised) {
        const C      = CONFIG.CELL;
        const border = Math.max(1, Math.round(C.GRID_PANEL_BORDER_WIDTH * s));
        const Wd  = C.GRID_PANEL_WOOD || {}, v = (x, d) => (x !== undefined ? x : d);
        // INNER CORNERS STAY ROUND. Strictly concentric would be radius − inset,
        // which leaves the cream tray almost square-cornered inside a round
        // frame; the mockup keeps every ring visibly rounded.
        const rr  = (inset) => Math.max(2, radius - inset, radius * v(Wd.INNER_ROUND, 0.6));
        const box = (inset, color, alpha, dy, cut) => {
            panel.fillStyle(hexColor(color), alpha);
            panel.fillRoundedRect(x0 + inset, y0 + inset + (dy || 0),
                panW - 2 * inset, panH - 2 * inset - (cut || 0), rr(inset));
        };
        const woodW = Math.min(maxWood, Math.max(border + 2, Math.round(v(Wd.WIDTH, 13) * s * v(woodK, 1))));
        const lip   = Math.max(1, Math.round(v(Wd.LIP, 2) * s));
        box(0, v(Wd.SHADOW_COLOR, '#000000'), v(Wd.SHADOW_ALPHA, 0.18), Math.round(v(Wd.SHADOW_Y, 5) * s));
        box(0, C.GRID_PANEL_BORDER_COLOR, 1);
        box(border, v(Wd.DARK, '#8c5226'), 1);
        box(border, v(Wd.COLOR, '#b5733a'), 1, 0, Math.max(1, Math.round(v(Wd.BEVEL, 3) * s)));
        // GRAIN: two broken strokes along each side of the band. Lengths and
        // gaps come from _cellHash, so the frame looks the same every rebuild.
        const band = woodW - border;
        panel.lineStyle(Math.max(1, 1.3 * s), hexColor(v(Wd.GRAIN_COLOR, '#7a4520')), v(Wd.GRAIN_ALPHA, 0.45));
        const grain = (side, a0, a1, at) => {
            let a = a0, k = 0;
            while (a < a1) {
                const len = (0.12 + 0.25 * this._cellHash(side, k, 31 + salt)) * (a1 - a0);
                const b = Math.min(a1, a + len);
                const p = at + (this._cellHash(side, k, 32 + salt) - 0.5) * band * 0.15;
                panel.beginPath();
                if (side % 4 < 2) { panel.moveTo(a, p); panel.lineTo(b, p); }
                else          { panel.moveTo(p, a); panel.lineTo(p, b); }
                panel.strokePath();
                a = b + (0.12 + 0.2 * this._cellHash(side, k, 33 + salt)) * (a1 - a0);
                k++;
            }
        };
        [0.38, 0.7].forEach((f, n) => {
            const o = border + band * f;
            grain(0 + 4 * n, x0 + radius, x0 + panW - radius, y0 + o);          // top
            grain(1 + 4 * n, x0 + radius, x0 + panW - radius, y0 + panH - o);   // bottom
            grain(2 + 4 * n, y0 + radius, y0 + panH - radius, x0 + o);          // left
            grain(3 + 4 * n, y0 + radius, y0 + panH - radius, x0 + panW - o);   // right
        });
        // The light catching the top edge of the wood.
        panel.lineStyle(Math.max(1, 1.5 * s), hexColor(v(Wd.HIGHLIGHT, '#e3a868')), 0.9);
        panel.beginPath();
        panel.moveTo(x0 + radius, y0 + border + Math.max(1, s));
        panel.lineTo(x0 + panW - radius, y0 + border + Math.max(1, s));
        panel.strokePath();
        if (raised) {
            const edge = Math.max(1, Math.round(v(raised.EDGE, 3) * s));
            box(woodW, v(raised.SHADE, '#e3cba0'), 1);
            box(woodW, fill, 1, 0, edge);
            const hy = y0 + woodW + Math.max(1, s);
            panel.lineStyle(Math.max(1, 1.5 * s), hexColor(v(raised.HIGHLIGHT, '#ffffff')), 0.9);
            panel.beginPath();
            panel.moveTo(x0 + woodW + rr(woodW), hy);
            panel.lineTo(x0 + panW - woodW - rr(woodW), hy);
            panel.strokePath();
            return;
        }
        box(woodW, v(Wd.LIP_COLOR, '#6b3c1b'), 1);
        box(woodW + lip, fill, 1);
    }

    createCoinDisplay() {
        const W = this.scale.width;
        const H = this.scale.height;
        const L = this.layoutConfig;
        
        const gridW  = this.GRID_COLS * this.CELL_SIZE + (this.GRID_COLS - 1) * this.CELL_GAP;
        const gridH  = this.GRID_ROWS * this.CELL_SIZE + (this.GRID_ROWS - 1) * this.CELL_GAP;
        const pad    = L.panPad;
        const panW   = gridW + 2 * pad;
        const panH   = gridH + 2 * pad;
        
        // Unified: derive panel centre from gridStartX/Y (set by createGrid)
        const panCX   = this.gridStartX - this.CELL_SIZE / 2 + gridW / 2;
        const panCY   = this.gridStartY - this.CELL_SIZE / 2 + gridH / 2;
        const coinY     = L.coinCenterY;            // hangs off the panel's top edge
        const rightEdge = panCX + panW / 2;         // right-aligned to grid panel (relational)

        // Icon right edge aligns with grid panel right edge; scaled gap to text
        const iconX = rightEdge - L.coinIconSize / 2;
        this.coinIcon = this.add.image(iconX, coinY, 'coin')
            .setDisplaySize(L.coinIconSize, L.coinIconSize)
            .setDepth(10);

        const textX = iconX - L.coinIconSize / 2 - L.coinTextIconGap;
        this.coinText = this.add.text(textX, coinY, this._bigNum(this.coins), {
            fontSize: L.coinTextSize,
            fontFamily: CONFIG.FONT_FAMILY,
            color: CONFIG.COIN_COUNTER.TEXT_COLOR,
            fontStyle: CONFIG.FONT_WEIGHT,
            stroke: CONFIG.COIN_COUNTER.TEXT_STROKE_COLOR,
            strokeThickness: CONFIG.COIN_COUNTER.TEXT_STROKE_THICKNESS,
        }).setOrigin(1, 0.5).setDepth(10);
    }

    // `animate` false: no spawn bounce — a pig being PUT BACK (a save
    // restored), not newly made, simply stands there at its size.
    async spawnBatteryInGrid(row, col, level, animate = true) {
        const cell = this.gridCells[row][col];
        const iconLvl = getBatteryIconLevel(level);

        const draggableBg = this.add.rectangle(
            cell.x, cell.y, this.CELL_SIZE, this.CELL_SIZE,
            hexColor(CONFIG.CELL.DRAGGABLE_BG_COLOR), CONFIG.CELL.DRAGGABLE_BG_ALPHA)
            .setDepth(10)
            .setInteractive({ draggable: true, useHandCursor: true });

        // BUILT NOW, whatever art is to hand (see AssetManager.iconKey). The
        // cell is filled on this frame, so nothing can be dropped into it while
        // a picture downloads.
        const battery = fitItemIcon(this.add.image(cell.x, cell.y + this.batteryYOffset,
                this.assets.iconKey(iconLvl)), this.batteryDisplayW, this.batteryDisplayH)
            .setDepth(11);
        this.assets.dressWhenReady(battery, iconLvl);

        const levelText = this.add.text(
            cell.x, cell.y + this.batteryYOffset + this.levelTextYOffset,
            `PIGGY ${level}`,
            { fontSize: this.levelTextSize, fontFamily: CONFIG.FONT_FAMILY,
              color: CONFIG.CELL.LEVEL_TEXT_COLOR, fontStyle: CONFIG.FONT_WEIGHT })
            .setOrigin(0.5).setDepth(12);

        const batteryData = {
            draggableBg, sprite: battery, levelText, level, row, col,
            originalX: cell.x,
            originalY: cell.y + this.batteryYOffset,
            inGrid: true, inChargingSlot: false,
        };
        draggableBg.setData('batteryData', batteryData);
        this.batteries.push(batteryData);
        this.grid[row][col] = batteryData;
        cell.filledBg.setVisible(true);
        cell.isEmpty = false;
        if (animate) this.playSpawnAnimation(batteryData);
        return batteryData;
    
    }

    playSpawnAnimation(bd) {
        // The icon is no longer square, so the squash and stretch has to run
        // off its two sides separately rather than one figure for both.
        //
        // ON THE SPRITE'S SCALE, NOT ITS ON-SCREEN SIZE. A pig whose picture is
        // still downloading wears a stand-in — maybe Phaser's 32×32 missing
        // texture — and swaps to its own mid-bounce (dressWhenReady). A swap
        // keeps the SCALE, which is the same for every pig picture (see
        // fitItemIcon); a bounce tweening the stand-in's pixel size would end
        // on that size and squeeze the real picture into it, leaving the pig
        // small for good.
        const bx = bd.sprite.scaleX, by = bd.sprite.scaleY;
        const a    = CONFIG.SPAWN_ANIMATION;
        bd.sprite.setScale(bx * a.INITIAL_SCALE_X, by * a.INITIAL_SCALE_Y);
        bd.levelText.setScale(a.INITIAL_SCALE_X, a.INITIAL_SCALE_Y);
        const seq = [
            [a.STRETCH_SCALE_X, a.STRETCH_SCALE_Y, a.STRETCH_DURATION],
            [a.BOUNCE_SCALE_X,  a.BOUNCE_SCALE_Y,  a.BOUNCE_DURATION],
            [1, 1, a.SETTLE_DURATION],
        ];
        let chain = Promise.resolve();
        seq.forEach(([sx, sy, dur]) => {
            chain = chain.then(() => new Promise(res => {
                this.tweens.add({
                    targets: bd.sprite,
                    scaleX: bx * sx, scaleY: by * sy,
                    duration: dur, ease: 'Cubic.easeOut', onComplete: res,
                });
                this.tweens.add({
                    targets: bd.levelText, scaleX: sx, scaleY: sy,
                    duration: dur, ease: 'Cubic.easeOut',
                });
            }));
        });
    }

    async createButtons() {
        const v = (x, d) => (x !== undefined ? x : d);
        const W = this.scale.width;
        const H = this.scale.height;
        const L = this.layoutConfig;
        
        // Spawn button: horizontally centred, vertically at a fixed fraction of partA.height
        const spawnButtonX = L.partA.x + L.partA.width / 2;
        const spawnButtonY = L.buttonCenterY;
        // Level-up sits to the left of spawn at the same Y (horizontal gap × sW)
        const levelUpButtonX = spawnButtonX - L.spawnBtnDisplayW / 2 - 20 * L.sW - L.spawnBtnDisplayH * 0.44;
        const levelUpButtonY = spawnButtonY;

        // Spawn button
        const spawnBtn = this.add.container(spawnButtonX, spawnButtonY).setDepth(100);
        // THE BUTTON'S FACE is the grid's wooden frame, drawn and baked into a
        // texture at its exact size — an image still, so the disabled tint and
        // the hit area work as they did with the old art. Rebaked every build.
        const bw = Math.round(L.spawnBtnDisplayW), bh = Math.round(L.spawnBtnDisplayH);
        const BW = (CONFIG.BUTTON || {}).WOOD || {};
        const bs = L.colScale;
        const shY = Math.round(v(((CONFIG.CELL.GRID_PANEL_WOOD || {}).SHADOW_Y), 5) * bs);
        const g = this.make.graphics({ add: false });
        this._drawWoodPanel(g, 0, 0, bw, bh - shY, Math.round(v(BW.RADIUS, 18) * bs), bs,
            v(BW.FILL, CONFIG.CELL.FILLED_BG_COLOR), Math.round(v(BW.MAX_WOOD, 0.2) * bh), 7, v(BW.THICKNESS, 1), BW.RAISED);
        if (this.textures.exists('spawn_wood')) this.textures.remove('spawn_wood');
        g.generateTexture('spawn_wood', bw, bh);
        g.destroy();
        const spawnBg  = this.add.image(0, 0, 'spawn_wood')
            .setDisplaySize(L.spawnBtnDisplayW, L.spawnBtnDisplayH)
            .setInteractive({ useHandCursor: true });
        this.spawnButtonText = this.add.text(
            L.spawnCoinTextX, 0, this._bigNum(this.spawnCost), {
                fontSize: L.spawnCoinTextSize, fontFamily: CONFIG.FONT_FAMILY,
                color: '#2b2013', fontStyle: CONFIG.FONT_WEIGHT,   // near-black, not pure
            }).setOrigin(0.5);
        const spawnCoinIcon = this.add.image(L.spawnCoinIconX, 0, 'coin')
            .setDisplaySize(L.spawnCoinIconSize, L.spawnCoinIconSize);

        spawnBtn.add([spawnBg, this.spawnButtonText, spawnCoinIcon]);
        spawnBg.on('pointerdown', () => this.spawnBattery());
        this.spawnButton   = spawnBtn;
        this.spawnButtonBg = spawnBg;
        this.spawnButtonIcon = null;

        // The button's own battery, drawn at once with whatever art exists and
        // dressed in its own when that lands — the button is pressable from the
        // first frame, so its icon must be there from the first frame too.
        const iconLvl = getBatteryIconLevel(this.spawnButtonLevel);
        const spawnIcon = fitItemIcon(this.add.image(L.spawnBattIconX, 0, this.assets.iconKey(iconLvl)),
            L.spawnBattIconSize, L.spawnBattIconSize);
        this.assets.dressWhenReady(spawnIcon, iconLvl);
        spawnBtn.add(spawnIcon);
        this.spawnButtonIcon = spawnIcon;

        // Level-up button — one sprite, everything baked in (text, icon, the
        // lot), so it is drawn and wired exactly like any other icon button:
        // no separate label or fill to keep in step with it.
        const lvlBtn = this.add.container(levelUpButtonX, levelUpButtonY).setDepth(100);
        const lvlBg  = this.add.image(0, 0, 'upgrade_button')
            .setDisplaySize(L.spawnBtnDisplayH * 0.88, L.spawnBtnDisplayH * 0.88)
            .setInteractive({ useHandCursor: true });
        lvlBtn.add(lvlBg);
        lvlBg.on('pointerdown', () => { if (this.levelUpButtonVisible) this.levelUpAll(); });
        this.levelUpButton   = lvlBtn;
        this.levelUpButtonBg = lvlBg;
        this.levelUpButton.setVisible(false);
        this.levelUpButtonVisible = false;
        this.levelUpButtonShowTime = null;

    }

    createStartOverlay() {
        // Dev toggle: with the tutorial off there is no mask and no pointer, and
        // play starts immediately (removeStartOverlay's side effects run here).
        if (!CONFIG.POINTER.TUTORIAL_ENABLED) {
            this.startOverlay = null;
            this.startPointer = null;
            this.hasStartedPlaying = true;
            this.levelUpTimer = this.time.now;
            this.firstLevelUpTimer = true;
            return;
        }
        const W = this.scale.width;
        const H = this.scale.height;
        const L = this.layoutConfig;
        
        // Use actual camera/game dimensions for the overlay rect to ensure full coverage
        const gameW = this.cameras.main.width;
        const gameH = this.cameras.main.height;
        
        const maskColor = parseInt(CONFIG.POINTER.TUTORIAL_MASK_COLOR.substring(1), 16);
        this.startOverlay = this.add.rectangle(gameW / 2, gameH / 2, gameW, gameH, maskColor,
            CONFIG.POINTER.TUTORIAL_MASK_OPACITY).setAlpha(0).setDepth(99);

        // THE RULE BETWEEN THE HALVES IS HIDDEN, not masked. It is one thin
        // rule; taking it away for the length of the tutorial costs nothing and
        // dims nothing else.
        this._showSplitLine(false);

        // Position pointer based on spawn button location
        let pointerX = this.spawnButton.x;
        const pY = this.spawnButton.y + CONFIG.POINTER.OFFSET_Y;
        
        const strokeColor = parseInt(CONFIG.POINTER.STROKE_COLOR.substring(1), 16);
        const fillColor   = parseInt(CONFIG.POINTER.FILL_COLOR.substring(1), 16);
        const pCont = this.add.container(pointerX, pY).setAlpha(0).setDepth(102);
        for (let a = 0; a < 360; a += 45) {
            const rad = a * Math.PI / 180;
            const sc  = this.add.image(
                Math.cos(rad) * CONFIG.POINTER.STROKE_WIDTH,
                Math.sin(rad) * CONFIG.POINTER.STROKE_WIDTH, 'point')
                .setScale(CONFIG.POINTER.SCALE).setTint(strokeColor).setOrigin(0.5, 0);
            pCont.add(sc);
        }
        const fp = this.add.image(0, 0, 'point')
            .setScale(CONFIG.POINTER.SCALE).setTint(fillColor).setOrigin(0.5, 0);
        pCont.add(fp);
        this.startPointer = pCont;

        this.time.delayedCall(CONFIG.POINTER.TUTORIAL_START_DELAY, () => {
            if (!this.startOverlay || !pCont.active) return;
            this._shadePage(CONFIG.POINTER.TUTORIAL_MASK_COLOR, CONFIG.POINTER.TUTORIAL_MASK_OPACITY,
                CONFIG.POINTER.TUTORIAL_FADE_DURATION);
            this.tweens.add({
                targets: this.startOverlay, alpha: 1,
                duration: CONFIG.POINTER.TUTORIAL_FADE_DURATION, ease: 'Linear',
                onComplete: () => {
                    if (!pCont.active) return;
                    pCont.setAlpha(1);
                    this.tweens.add({
                        targets: pCont,
                        y: pY - CONFIG.POINTER.ANIMATION_MOVE_UP,
                        scaleX: CONFIG.POINTER.SCALE * CONFIG.POINTER.ANIMATION_SCALE_DOWN,
                        scaleY: CONFIG.POINTER.SCALE * CONFIG.POINTER.ANIMATION_SCALE_DOWN,
                        duration: CONFIG.POINTER.ANIMATION_DURATION,
                        yoyo: CONFIG.POINTER.ANIMATION_YOYO,
                        repeat: CONFIG.POINTER.ANIMATION_REPEAT,
                    });
                },
            });
        });
    }

    // THE PAGE AROUND THE CANVAS, SHADED WITH AN OVERLAY. An overlay is drawn
    // inside the canvas, but on a frame whose shape the stage does not match
    // exactly, a strip of the page (html/body, the ground's #e0c493) shows
    // round it — invisible normally, a bright line once the game is darkened.
    // So the page takes the colour the overlay makes over the ground, fading
    // with it: `color` + `alpha` the overlay's, null to put the page back.
    _shadePage(color, alpha, ms) {
        if (typeof document === 'undefined') return;
        const ground = '#e0c493';
        let css = '';
        if (color) {
            const g = hexColor(ground), c = hexColor(color), a = Math.max(0, Math.min(1, alpha));
            const mix = (sh) => Math.round(((g >> sh) & 255) * (1 - a) + ((c >> sh) & 255) * a);
            css = `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
        }
        for (const el of [document.documentElement, document.body]) {
            if (!el) continue;
            el.style.transition = ms > 0 ? `background-color ${ms}ms linear` : '';
            el.style.backgroundColor = css || ground;
        }
    }

    removeStartOverlay() {
        if (!this.startOverlay) return;
        this._shadePage(null);
        this.startOverlay.destroy();
        if (this.startPointer) this.startPointer.destroy();
        this.startOverlay = null;
        this._showSplitLine(true);
        this.hasStartedPlaying = true;
        this.levelUpTimer = this.time.now;
        this.firstLevelUpTimer = true;
    }

    checkAndShowMergeTutorial() {
        if (!CONFIG.MERGE_TUTORIAL.ENABLED) return;   // disabled during development
        // AT LEAST two, not exactly two.
        //
        // An exact test only passes on the single frame the count is 2, and the
        // count does not only count spawns: a battery moved into a charging slot
        // leaves this list, so two on the grid can read as one. Miss that frame
        // and the lesson can never appear, because the number only climbs — which
        // is why it seemed to need three batteries rather than two.
        if (!this.mergeTutorialShown && this.batteries.length >= 2 && !this.mergePointer) {
            this.createMergeTutorial();
        }
    }

    createMergeTutorial() {
        const x1 = this.gridStartX;
        const y1 = this.gridStartY;
        const x2 = this.gridStartX + (this.CELL_SIZE + this.CELL_GAP);
        const strokeColor = parseInt(CONFIG.POINTER.STROKE_COLOR.substring(1), 16);
        const fillColor   = parseInt(CONFIG.POINTER.FILL_COLOR.substring(1), 16);
        const pc = this.add.container(x1, y1).setDepth(102);
        for (let a = 0; a < 360; a += 45) {
            const rad = a * Math.PI / 180;
            const sc  = this.add.image(
                Math.cos(rad) * CONFIG.POINTER.STROKE_WIDTH,
                Math.sin(rad) * CONFIG.POINTER.STROKE_WIDTH, 'point')
                .setScale(CONFIG.POINTER.SCALE).setTint(strokeColor).setOrigin(0.5, 0);
            pc.add(sc);
        }
        const fp = this.add.image(0, 0, 'point')
            .setScale(CONFIG.POINTER.SCALE).setTint(fillColor).setOrigin(0.5, 0);
        pc.add(fp);
        this.tweens.add({
            targets: pc, x: x2,
            duration: CONFIG.MERGE_TUTORIAL.ANIMATION_DURATION,
            ease: CONFIG.MERGE_TUTORIAL.ANIMATION_EASE,
            yoyo: false, repeat: -1, repeatDelay: 200,
        });
        this.mergePointer = pc;
    }

    removeMergeTutorial() {
        if (this.mergePointer) {
            this.mergePointer.destroy();
            this.mergePointer = null;
            this.mergeTutorialShown = true;
        }
    }

    // A MERGE HAPPENED — whether or not the hand was being shown for it.
    //
    // The next lesson used to be scheduled inside removeMergeTutorial, which
    // only runs when that pointer is up. A player who merged without ever seeing
    // the hand — merged early, or merged again later — got no arrows at all,
    // because the thing that starts their clock had nothing to remove.
    _afterMerge() {
        this.removeMergeTutorial();
        const H = CONFIG.SLOT_HINT || {};
        if (H.ENABLED === false || this.slotHintDone || this.slotHintPending) return;
        this.slotHintPending = true;
        this.time.delayedCall(H.DELAY_MS !== undefined ? H.DELAY_MS : 900,
            () => { this.slotHintPending = false; this._showSlotHint(); });
    }

    // AN ARROW AT EACH EMPTY SLOT, nodding toward it.
    //
    // Three of them rather than one, because the lesson is about the column: a
    // single arrow would read as "that slot", and the player would wonder what
    // the other two are for. In-and-back rather than a full bounce — the motion
    // has to point, and a symmetric bob points at nothing.
    //
    // FROM ABOVE, in both orientations: the slots are in a row along the
    // half's bottom edge, so beside each one are its neighbours and below it
    // the edge — above, under its spring, is the one clear approach.
    _showSlotHint() {
        const H = CONFIG.SLOT_HINT || {};
        if (H.ENABLED === false || this.slotHintDone || this.slotHints) return;
        if (!this.platforms) return;
        // PER SLOT: one already filled has had its lesson, and an arrow
        // pointing at a job already done is worse than no arrow. The others
        // keep theirs until each gets its own first pig.
        for (let i = 0; i < 3; i++) {
            if (this.chargingSlots && this.chargingSlots[i]) this.slotHintSeen[i] = true;
        }
        if (this.slotHintSeen.every(Boolean)) { this.slotHintDone = true; return; }

        const s = this.layoutConfig.scale;
        const P = CONFIG.POINTER || {};
        const HI = CONFIG.HINT_ICON || {};
        const len  = (H.SIZE || 23) * s;
        this.slotHints = [null, null, null];
        this.platforms.forEach((p, i) => {
            if (!p || p.slotX === undefined || this.slotHintSeen[i]) return;
            const lot = this.slotHints[i] = [];
            const size = p.slotSize || (100 * s);
            // DRAWN, rather than drawn
            // ON: one shape, one outline, no art file, and it turns to face
            // whichever way the layout needs without a second drawing.
            const arrow = this._makeArrow('s', len,
                    len * (H.W_FRAC !== undefined ? H.W_FRAC : 1.35),
                    P.FILL_COLOR || '#ffd251', P.STROKE_COLOR || '#6d5727',
                    (P.STROKE_WIDTH || 3) * s)
                // OVER EVERYTHING IT CAN CROSS — coins in flight (100+)
                // included. Still under a pig being dragged (10000+).
                .setDepth(121).setAlpha(0);
            // IT CROSSES THE SLOT'S EDGE rather than hovering outside it. The
            // crossing is what reads as "in here" instead of "over there".
            const run = (H.TRAVEL !== undefined ? H.TRAVEL : 0.193) * size;
            const gap = (H.SIDE_GAP !== undefined ? H.SIDE_GAP : 0.12) * size;

            // THE PIG, ON THE FAR SIDE OF THE ARROW FROM THE SLOT — so "pig, then arrow, then slot" reads as "drag the pig in
            // here". It rides along with the arrow (same relative travel from
            // each one's own start), so the two never drift apart. See
            // CONFIG.HINT_ICON.
            const iconSize = (HI.SIZE !== undefined ? HI.SIZE : 32) * s;
            const iconGap  = (HI.GAP !== undefined ? HI.GAP : 4) * s;
            let icon = null;
            const y0 = p.slotY - (size / 2 + gap + len / 2);
            arrow.setPosition(p.slotX, y0);
            if (HI.ENABLED !== false && this.textures.exists('pig_hint')) {
                icon = this.add.image(p.slotX, y0 - (len / 2 + iconGap + iconSize / 2), 'pig_hint')
                    .setDisplaySize(iconSize, iconSize)
                    .setDepth(120)    // just behind its arrow (121)
                    .setAlpha(0);
            }
            this.tweens.add({ targets: icon ? [arrow, icon] : arrow, y: `+=${run}`,
                duration: H.MS || 380, ease: H.EASE || 'Sine.easeInOut',
                yoyo: true, repeat: -1 });

            this.tweens.add({ targets: arrow, alpha: 1,
                duration: H.FADE_MS !== undefined ? H.FADE_MS : 260 });
            if (icon) {
                this.tweens.add({ targets: icon,
                    alpha: HI.ALPHA !== undefined ? HI.ALPHA : 0.6,
                    duration: H.FADE_MS !== undefined ? H.FADE_MS : 260 });
                lot.push(icon);
            }
            lot.push(arrow);
        });
    }

    // ONE ARROW, DRAWN. A filled triangle with an outline, its apex on the
    // object's own origin line and pointing `dir` ('s' down, 'e' right, 'n', 'w')
    // — so placing one is a single point wherever it is used. `len` is along the
    // way it points, `wide` across.
    _makeArrow(dir, len, wide, fill, stroke, strokeW) {
        const g = this.add.graphics();
        g.fillStyle(hexColor(fill), 1);
        g.lineStyle(Math.max(1, strokeW || 2), hexColor(stroke), 1);
        const L = len / 2, W = wide / 2;
        const pts = dir === 'e' ? [[-L, -W], [-L, W], [L, 0]]
                  : dir === 'w' ? [[L, -W], [L, W], [-L, 0]]
                  : dir === 'n' ? [[-W, L], [W, L], [0, -L]]
                  :               [[-W, -L], [W, -L], [0, L]];   // 's'
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        g.lineTo(pts[1][0], pts[1][1]);
        g.lineTo(pts[2][0], pts[2][1]);
        g.closePath();
        g.fillPath();
        g.strokePath();
        return g;
    }

    // Gone for good from THIS slot once its first battery is in; the other
    // slots keep theirs. `slotHintSeen` is what stops it coming back when the
    // slot is later emptied — the lesson was learnt, and a hint that returns
    // reads as the game not having noticed.
    _hideSlotHint(slotIndex) {
        this.slotHintSeen[slotIndex] = true;
        if (this.slotHintSeen.every(Boolean)) this.slotHintDone = true;
        const lot = this.slotHints && this.slotHints[slotIndex];
        if (!lot) return;
        this.slotHints[slotIndex] = null;
        const H = CONFIG.SLOT_HINT || {};
        for (const img of lot) {
            if (!img || !img.scene) continue;
            this.tweens.killTweensOf(img);
            this.tweens.add({ targets: img, alpha: 0,
                duration: H.FADE_MS !== undefined ? H.FADE_MS : 260,
                onComplete: () => img.destroy() });
        }
    }

    spawnBattery() {
        if (this.isWatchingAd) return;  // Block spawning during ad
        if (this.coins < this.spawnCost) return;
        let emptyCell = null;
        outer: for (let row = 0; row < this.GRID_ROWS; row++) {
            for (let col = 0; col < this.GRID_COLS; col++) {
                if (!this.grid[row][col]) { emptyCell = { row, col }; break outer; }
            }
        }
        if (!emptyCell) return;
        this.coins -= this.spawnCost;
        this.updateCoinDisplay();
        // AFTER THE BATTERY ACTUALLY EXISTS. Spawning is async — it waits on the
        // battery's texture before the new battery joins the list — so a check
        // fired on the next line counts the grid as it was BEFORE this spawn.
        // That is one battery behind, which is why the merge lesson appeared a
        // click late: two on the grid still read as one.
        this.spawnBatteryInGrid(emptyCell.row, emptyCell.col, this.spawnButtonLevel)
            .then(() => this.checkAndShowMergeTutorial());
        if (this.startOverlay) this.removeStartOverlay();
        this.updateSpawnButton();
    }

    async updateSpawnButton() {
        if (this.highestBatteryLevel >= 9) {
            const nl = this.highestBatteryLevel - 7;
            if (nl > this.spawnButtonLevel) {
                this.spawnButtonLevel = nl;
                // NO STRANDED PIGGIES: once the button makes level nl, a piggy
                // below it could never find a partner, so lift it to nl.
                for (const bd of this.batteries) if (bd.inGrid && bd.level < nl) this._setGridLevel(bd, nl);
                for (let i = 0; i < 3; i++) {
                    const slot = this.chargingSlots[i];
                    if (slot && slot.level < nl) this._setSlotLevel(i, nl);
                }
                this.spawnCost = nl * CONFIG.ECONOMY.SPAWN_COST_PER_LEVEL;
                this.spawnButtonText.setText(this._bigNum(this.spawnCost));
                const iconLvl = getBatteryIconLevel(nl);
                if (this.spawnButtonIcon) {
                    itemPigOrigin(this.spawnButtonIcon.setTexture(this.assets.iconKey(iconLvl)));
                    this.assets.dressWhenReady(this.spawnButtonIcon, iconLvl);
                }
            }
        }
        if (this.coins < this.spawnCost) {
            this.spawnButtonBg.setTint(0x888888).disableInteractive();
        } else {
            this.spawnButtonBg.setTint(0xffffff).setInteractive({ useHandCursor: true });
        }
    }

    // ================================================================
    // DRAG / DROP
    // ================================================================
    onDragStart(pointer, gameObject) {
        if (this.isWatchingAd) return;  // Block dragging during ad
        const bd = gameObject.getData('batteryData');
        if (!bd) return;
        this.draggingBattery = bd;

        if (bd.inChargingSlot) {
            const p = this.platforms[bd.slotIndex];
            this.chargingSlots[bd.slotIndex] = null;
            p.slotBg.setVisible(true);
            p.slotBgFilled.setVisible(false);
            p.chargeRateText.setVisible(false);
            p.batterySprite = p.batteryLevelText = null;
        }
        if (bd.draggableBg) bd.draggableBg.setDepth(10000);
        bd.sprite.setDepth(10001);
        bd.levelText.setDepth(10002);
        // HIDDEN WHILE HELD — "PIGGY 5" following the finger under the drag
        // adds a second thing to read right where the player is looking at
        // the art itself. It comes back the moment the drag ends, whatever
        // the outcome (see onDragEnd) — dropped, swapped, merged or bounced
        // back, there is always a fresh or restored levelText to show again.
        bd.levelText.setVisible(false);
        if (this.startOverlay) this.removeStartOverlay();
    }

    onDrag(pointer, gameObject, dragX, dragY) {
        const bd = gameObject.getData('batteryData');
        if (!bd) return;
        if (bd.draggableBg) { bd.draggableBg.x = dragX; bd.draggableBg.y = dragY; }
        bd.sprite.setPosition(dragX, dragY);
        bd.levelText.setPosition(dragX, dragY + this.levelTextYOffset);
        if (bd.inGrid) {
            const cd = this.gridCells[bd.row][bd.col];
            const b  = new Phaser.Geom.Rectangle(
                cd.x - this.CELL_SIZE / 2, cd.y - this.CELL_SIZE / 2,
                this.CELL_SIZE, this.CELL_SIZE);
            cd.filledBg.setVisible(Phaser.Geom.Rectangle.Contains(b, dragX, dragY));
        }
    }

    onDragEnd(pointer, gameObject) {
        const bd = gameObject.getData('batteryData');
        if (!bd) return;
        // BACK ON, before whatever the drop resolves to. A plain move or
        // swap keeps this same levelText, which needs showing again; a merge
        // destroys it in favour of a fresh one on the result, which is
        // visible by default — so unconditionally is correct either way.
        bd.levelText.setVisible(true);
        const dx = bd.sprite.x;
        const dy = bd.sprite.y;

        // Check platform slots first
        for (let i = 0; i < this.platforms.length; i++) {
            const d = this.platforms[i].drop;
            if (d && dx >= d.x0 && dx <= d.x1 && dy >= d.y0 && dy <= d.y1) {
                this.handleDropOnPlatformSlot(i, bd);
                this.draggingBattery = null;
                return;
            }
        }

        // Check grid cells
        for (let row = 0; row < this.GRID_ROWS; row++) {
            for (let col = 0; col < this.GRID_COLS; col++) {
                const cd = this.gridCells[row][col];
                if (Math.abs(dx - cd.x) <= this.CELL_SIZE / 2 &&
                    Math.abs(dy - cd.y) <= this.CELL_SIZE / 2) {
                    this.handleDrop(bd, { row, col, cellData: cd });
                    this.draggingBattery = null;
                    return;
                }
            }
        }
        this.returnBatteryToPosition(bd);
        this.draggingBattery = null;
    }

    handleDropOnPlatformSlot(slotIndex, bd) {
        const slot = this.chargingSlots[slotIndex];
        if (slot === null) {
            this.moveBatteryToSlot(bd, slotIndex);
        } else if (bd.inChargingSlot && bd.slotIndex === slotIndex) {
            this.returnBatteryToPosition(bd);
        } else if (slot.batteryData.level === bd.level) {
            this.mergeBatteriesInSlot(bd, slot.batteryData, slotIndex);
        } else {
            this.swapBatteryWithSlot(bd, slot.batteryData, slotIndex);
        }
    }

    handleDrop(bd, target) {
        const tBat = this.grid[target.row][target.col];
        if (!tBat)              this.moveBattery(bd, target.row, target.col);
        else if (tBat === bd)   this.returnBatteryToPosition(bd);
        else if (tBat.level === bd.level) this.mergeBatteries(bd, tBat, target.row, target.col);
        // FROM A SLOT ONTO AN OCCUPIED CELL. swapBatteries reads both batteries'
        // grid positions, and one dragged out of a charging slot has none — so
        // it left the slot's battery lying loose over the cell with the board
        // believing it was still in its slot. The two change places instead,
        // which is what the same drag does in the other direction.
        else if (bd.inChargingSlot) this.swapSlotWithCell(bd, tBat, target.row, target.col);
        else                    this.swapBatteries(bd, tBat);
    }

    // ================================================================
    // BATTERY OPERATIONS
    // ================================================================
    _clearBatterySource(bd) {
        if (bd.inGrid) {
            this.grid[bd.row][bd.col] = null;
            this.gridCells[bd.row][bd.col].filledBg.setVisible(false);
            this.gridCells[bd.row][bd.col].isEmpty = true;
        } else if (bd.inChargingSlot) {
            const p = this.platforms[bd.slotIndex];
            this.chargingSlots[bd.slotIndex] = null;
            p.slotBg.setVisible(true);
            p.slotBgFilled.setVisible(false);
            p.batterySprite = p.batteryLevelText = null;
        }
    }

    moveBattery(bd, newRow, newCol) {
        this._clearBatterySource(bd);
        bd.row  = newRow; bd.col = newCol;
        bd.inGrid = true; bd.inChargingSlot = false;
        this.grid[newRow][newCol] = bd;
        if (!this.batteries.includes(bd)) this.batteries.push(bd);
        const cd = this.gridCells[newRow][newCol];
        bd.originalX = cd.x;
        bd.originalY = cd.y + this.batteryYOffset;
        this.returnBatteryToPosition(bd);
        cd.filledBg.setVisible(true);
        cd.isEmpty = false;
    }

    mergeBatteries(dragged, target, tRow, tCol) {
        this._afterMerge();
        this.removeBattery(dragged);
        this.removeBattery(target);
        const newLevel = target.level + 1;
        this.spawnBatteryInGrid(tRow, tCol, newLevel);
        if (newLevel > this.highestBatteryLevel) {
            this.highestBatteryLevel = newLevel; this.updateSpawnButton();
            this.assets.prefetchAhead(newLevel + 1);
        }
        this.createMergeEffect(this.gridCells[tRow][tCol].x, this.gridCells[tRow][tCol].y);
    }

    // A battery dragged out of a CHARGING SLOT onto an occupied grid cell: the
    // two change places. Both are taken off the board and rebuilt on the other
    // side, the same way a grid-to-slot swap works — a battery's record carries
    // where it lives, so moving one is remaking it rather than editing it.
    swapSlotWithCell(bd, tBat, row, col) {
        const si = bd.slotIndex, lvSlot = bd.level, lvGrid = tBat.level;
        const p  = this.platforms[si];
        this.removeBattery(bd);           // empties the slot it came from
        if (p && p.chargeRateText) p.chargeRateText.setVisible(false);
        this.removeBattery(tBat);         // empties the cell it was dropped on
        this.spawnBatteryInGrid(row, col, lvSlot);
        this.addBatteryToSlot(si, lvGrid);
    }

    swapBatteries(b1, b2) {
        const r1 = b1.row, c1 = b1.col, r2 = b2.row, c2 = b2.col;
        this.grid[r1][c1] = b2; this.grid[r2][c2] = b1;
        b1.row = r2; b1.col = c2;
        b1.originalX = this.gridCells[r2][c2].x;
        b1.originalY = this.gridCells[r2][c2].y + this.batteryYOffset;
        b2.row = r1; b2.col = c1;
        b2.originalX = this.gridCells[r1][c1].x;
        b2.originalY = this.gridCells[r1][c1].y + this.batteryYOffset;
        this.returnBatteryToPosition(b1);
        this.returnBatteryToPosition(b2);
    }

    moveBatteryToSlot(bd, slotIndex) {
        if (bd.inGrid) {
            this.removeBattery(bd);
        } else if (bd.inChargingSlot) {
            const oldSI = bd.slotIndex;
            const oldP  = this.platforms[oldSI];
            this.chargingSlots[oldSI] = null;
            oldP.slotBg.setVisible(true);
            oldP.slotBgFilled.setVisible(false);
            oldP.chargeRateText.setVisible(false);
            oldP.batterySprite = oldP.batteryLevelText = null;
            if (bd.draggableBg) { bd.draggableBg.destroy(); bd.draggableBg = null; }
            if (bd.sprite)    bd.sprite.destroy();
            if (bd.levelText) bd.levelText.destroy();
        }
        this.addBatteryToSlot(slotIndex, bd.level);
    }

    swapBatteryWithSlot(b1, b2, slotIndex) {
        if (b1.inGrid) {
            const r1 = b1.row, c1 = b1.col;
            const lv2 = b2.level;
            this.removeBattery(b1);
            const p2 = this.platforms[slotIndex];
            this.chargingSlots[slotIndex] = null;
            p2.slotBg.setVisible(true);
            p2.slotBgFilled.setVisible(false);
            p2.chargeRateText.setVisible(false);
            if (b2.draggableBg) { b2.draggableBg.destroy(); b2.draggableBg = null; }
            if (b2.sprite)    b2.sprite.destroy();
            if (b2.levelText) b2.levelText.destroy();
            p2.batterySprite = p2.batteryLevelText = null;
            this.spawnBatteryInGrid(r1, c1, lv2);
            this.addBatteryToSlot(slotIndex, b1.level);
        } else if (b1.inChargingSlot) {
            const si1 = b1.slotIndex, si2 = slotIndex;
            const lv1 = b1.level, lv2 = b2.level;
            [b1, b2].forEach(b => {
                if (b.draggableBg) { b.draggableBg.destroy(); b.draggableBg = null; }
                if (b.sprite)    b.sprite.destroy();
                if (b.levelText) b.levelText.destroy();
            });
            const p1 = this.platforms[si1], p2 = this.platforms[si2];
            this.chargingSlots[si1] = this.chargingSlots[si2] = null;
            p1.batterySprite = p1.batteryLevelText = null;
            p2.batterySprite = p2.batteryLevelText = null;
            p1.slotBg.setVisible(true); p1.slotBgFilled.setVisible(false);
            p2.slotBg.setVisible(true); p2.slotBgFilled.setVisible(false);
            p1.chargeRateText.setVisible(false);
            p2.chargeRateText.setVisible(false);
            this.addBatteryToSlot(si1, lv2);
            this.addBatteryToSlot(si2, lv1);
        }
    }

    mergeBatteriesInSlot(dragged, target, targetSlotIndex) {
        this._afterMerge();
        if (dragged.inGrid) {
            this.removeBattery(dragged);
        } else if (dragged.inChargingSlot) {
            const si = dragged.slotIndex;
            const op = this.platforms[si];
            this.chargingSlots[si] = null;
            if (dragged.draggableBg) { dragged.draggableBg.destroy(); dragged.draggableBg = null; }
            if (dragged.sprite)    dragged.sprite.destroy();
            if (dragged.levelText) dragged.levelText.destroy();
            op.batterySprite = op.batteryLevelText = null;
            op.slotBg.setVisible(true); op.slotBgFilled.setVisible(false);
            op.chargeRateText.setVisible(false);
        }
        const tp = this.platforms[targetSlotIndex];
        this.chargingSlots[targetSlotIndex] = null;
        if (target.draggableBg) { target.draggableBg.destroy(); target.draggableBg = null; }
        if (target.sprite)    target.sprite.destroy();
        if (target.levelText) target.levelText.destroy();
        tp.batterySprite = tp.batteryLevelText = null;
        tp.slotBg.setVisible(true); tp.slotBgFilled.setVisible(false);
        tp.chargeRateText.setVisible(false);

        const newLevel = target.level + 1;
        this.addBatteryToSlot(targetSlotIndex, newLevel);
        if (newLevel > this.highestBatteryLevel) {
            this.highestBatteryLevel = newLevel; this.updateSpawnButton();
            this.assets.prefetchAhead(newLevel + 1);
        }
        this.createMergeEffect(tp.slotX, tp.slotY);
    }

    removeBattery(bd) {
        this._clearBatterySource(bd);
        const idx = this.batteries.indexOf(bd);
        if (idx > -1) this.batteries.splice(idx, 1);
        if (bd.draggableBg) bd.draggableBg.destroy();
        bd.sprite.destroy();
        bd.levelText.destroy();
    }

    returnBatteryToPosition(bd) {
        if (bd.draggableBg) bd.draggableBg.setDepth(10);
        bd.sprite.setDepth(11);
        bd.levelText.setDepth(12);

        if (bd.inChargingSlot) {
            const p  = this.platforms[bd.slotIndex];
            const cpm = getBatteryChargeValue(bd.level);
            this.chargingSlots[bd.slotIndex] = { level: bd.level, perSec: cpm, batteryData: bd };
            p.slotBgFilled.setVisible(true);
            p.batterySprite    = bd.sprite;
            p.batteryLevelText = bd.levelText;
            p.chargeRateText.setText(this._rateText(cpm)).setVisible(true);
            }

        if (bd.inGrid) {
            const cd = this.gridCells[bd.row][bd.col];
            cd.filledBg.setVisible(true);
            cd.isEmpty = false;
        }

        const tY = bd.originalY + this.levelTextYOffset;
        if (bd.draggableBg) {
            this.tweens.add({
                targets: bd.draggableBg,
                x: bd.originalX,
                y: bd.originalY - this.batteryYOffset,
                duration: 200, ease: 'Back.easeOut',
            });
        }
        this.tweens.add({ targets: bd.sprite,    x: bd.originalX, y: bd.originalY, duration: 200, ease: 'Back.easeOut' });
        this.tweens.add({ targets: bd.levelText, x: bd.originalX, y: tY,           duration: 200, ease: 'Back.easeOut' });
    }

    // OFF ON PURPOSE. This used to draw a white circle that scaled up and
    // faded at the merge point; removed at the art's request. Left as a no-op
    // rather than deleted from both call sites, so a merge effect can come
    // back here without re-wiring where it fires from.
    createMergeEffect(x, y) {}

    // ================================================================
    // LEVEL-UP TIMER
    // ================================================================
    checkLevelUpTimer() {
        if (!this.hasStartedPlaying) return;
        const now = this.time.now;
        if (this.levelUpButtonVisible && this.levelUpButtonShowTime) {
            if (now - this.levelUpButtonShowTime >= 30000) {
                this.tweens.killTweensOf(this.levelUpButton);
                this.levelUpButton.setScale(1).setVisible(false);
                this.levelUpButtonVisible = false;
                this.levelUpButtonBg.setAlpha(0.5);
                this.levelUpTimer = now;
            }
        } else if (!this.levelUpButtonVisible && this.levelUpTimer) {
            const wait = this.firstLevelUpTimer ? 20000 : 30000;
            if (now - this.levelUpTimer >= wait) {
                this.levelUpButton.setVisible(true);
                this.levelUpButtonVisible = true;
                this.levelUpButtonBg.setAlpha(1);
                this.levelUpButtonShowTime = now;
                this.firstLevelUpTimer = false;
                this.tweens.add({
                    targets: this.levelUpButton,
                    scaleX: 1.05, scaleY: 1.05, duration: 300,
                    yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                });
            }
        }
    }

    // THE LEVEL-UP-ALL REWARD, BEHIND A MOCK AD: a timed countdown
    // (AD.DURATION), then the reward. No ad SDK in this build.
    levelUpAll() {
        if (this.isWatchingAd) return;  // Prevent multiple ad triggers
        this.showMockAd(() => this.performLevelUpAll());
    }

    showMockAd(onComplete) {
        this.isWatchingAd = true;  // Block all interactions during ad
        // THE WORLD STOPS FOR THE AD — the squeeze tick, tweens mid-flight, every
        // timer — and picks up exactly where it was once the ad is over.
        this._setPaused(true);
        const W = this.cameras.main.width;
        const H = this.cameras.main.height;
        const A = CONFIG.AD;
        
        // Create overlay
        const overlay = this.add.rectangle(W / 2, H / 2, W, H, 
            parseInt(A.OVERLAY_COLOR.substring(1), 16), A.OVERLAY_ALPHA)
            .setDepth(10000)
            .setInteractive();  // Block clicks from passing through overlay
        this._shadePage(A.OVERLAY_COLOR, A.OVERLAY_ALPHA, 0);
        
        // Create countdown timer text in center
        const timerText = this.add.text(W / 2, H / 2, `${A.DURATION}`, {
            fontSize: A.TIMER_TEXT_SIZE,
            fontFamily: CONFIG.FONT_FAMILY,
            color: A.TIMER_TEXT_COLOR,
            fontStyle: CONFIG.FONT_WEIGHT,
        }).setOrigin(0.5).setDepth(10001);

        // "REWARD IN PROGRESS", sat just above the countdown — the number
        // alone read as a bare timer with nothing to say what it was
        // counting down TO. Static for the whole wait; only the number below
        // it moves. Measured off the number's own TOP edge, not the screen's
        // centre line: the number is centred there, so its top half would
        // otherwise run straight through this line.
        const rewardText = this.add.text(W / 2,
                timerText.y - timerText.height / 2
                    - (A.REWARD_TEXT_GAP !== undefined ? A.REWARD_TEXT_GAP : 20),
                A.REWARD_TEXT || 'Reward in progress', {
            fontSize: A.REWARD_TEXT_SIZE || '40px',
            fontFamily: CONFIG.FONT_FAMILY,
            color: A.REWARD_TEXT_COLOR || '#FFFFFF',
            fontStyle: CONFIG.FONT_WEIGHT,
        }).setOrigin(0.5, 1).setDepth(10001);

        // Countdown from AD.DURATION to 0. ON THE BROWSER'S CLOCK, not the
        // scene's: the scene's is the one stopped for the ad, and a countdown
        // on it would never reach zero.
        let timeLeft = A.DURATION;
        const countdown = window.setInterval(() => {
            if (!overlay.scene) { window.clearInterval(countdown); return; }   // scene gone
            timeLeft--;
            if (timeLeft > 0) {
                timerText.setText(`${timeLeft}`);
            } else {
                // Ad complete - destroy immediately and upgrade
                window.clearInterval(countdown);
                this._shadePage(null);
                overlay.destroy();
                rewardText.destroy();
                timerText.destroy();
                this.isWatchingAd = false;  // Re-enable interactions
                this._setPaused(false);     // the world carries on from where it stopped
                onComplete();  // Instant upgrade after ad
            }
        }, 1000);
    }

    _setGridLevel(bd, lv) {
        bd.level = lv;
        bd.levelText.setText(`PIGGY ${lv}`);
        this.assets.dressWhenReady(bd.sprite, getBatteryIconLevel(lv));
    }

    _setSlotLevel(i, lv) {
        const slot = this.chargingSlots[i], p = this.platforms[i];
        slot.level = lv;
        slot.perSec = getBatteryChargeValue(lv);
        if (slot.batteryData) slot.batteryData.level = lv;
        const sbd = slot.batteryData;
        if (p.batterySprite && sbd && sbd.wheel) {
            sbd.wheel.ready = false;
            this.assets.dressSlotWhenReady(p.batterySprite, sbd.wheel, getBatteryIconLevel(lv));
        }
        if (p.batteryLevelText) p.batteryLevelText.setText(`PIGGY ${lv}`);
        p.chargeRateText.setText(this._rateText(slot.perSec));
    }

    performLevelUpAll() {
        for (const bd of this.batteries) {
            if (bd.inGrid) {
                this._setGridLevel(bd, bd.level + 1);
                if (bd.level > this.highestBatteryLevel) this.highestBatteryLevel = bd.level;
            }
        }
        for (let i = 0; i < 3; i++) {
            const slot = this.chargingSlots[i];
            if (slot) {
                this._setSlotLevel(i, slot.level + 1);
                if (slot.level > this.highestBatteryLevel) this.highestBatteryLevel = slot.level;
            }
        }
        this.updateSpawnButton();
        this.assets.prefetchAhead(this.highestBatteryLevel + 1);
        this.tweens.killTweensOf(this.levelUpButton);
        this.levelUpButton.setScale(1).setVisible(false);
        this.levelUpButtonVisible = false;
        this.levelUpButtonBg.setAlpha(0.5);
        this.levelUpTimer = this.time.now;
    }

    // ================================================================
    // COIN DISPLAY
    // ================================================================
    updateCoinDisplay() {
        // Text is right-aligned (origin 1, 0.5), so its right edge stays fixed
        // at coinText.x and the icon never needs to move.
        this.coinText.setText(this._bigNum(this.coins));
        this.updateSpawnButton();
    }

    animateCoinReward(startX, startY, amount, delayBeforeFly = 0, platform = null, onComplete = null) {
        const C   = CONFIG.COIN_REWARD_ANIMATION;
        // No counter on screen, no flight — but the coins are still earned. This
        // is called on every release, so it must not be able to take the
        // game down with it if the UI half is ever built without one.
        if (!this.coinIcon || !this.coinIcon.scene) {
            this.coins += amount;
            if (this.coinText) this.updateCoinDisplay();
            if (onComplete) onComplete();
            return;
        }
        const tX  = this.coinIcon.x, tY = this.coinIcon.y;
        this._coinFlights = (this._coinFlights || 0) + 1;   // see _isSettled
        const n   = Math.max(1, C.COIN_COUNT);
        let done  = 0;

        // THE PAYOUT GOES WHERE THE EYES ARE. A player mid-merge is looking at
        // the grid, not at the field that just paid them — so the coins are
        // SCATTERED ACROSS THE WHOLE SCREEN, the grid half included, and then
        // swept to the counter. Motion crossing what someone is looking at
        // cannot be missed; a neat line sliding into a corner can.
        //
        // Nothing here is interactive, so a coin under a finger is invisible to
        // input and a drag runs straight through it. They still keep clear of a
        // dragging finger: a coin over the battery being placed is in the way
        // even when it cannot be pressed.
        const S       = C.SCATTER || {};
        const scatter = S.ENABLED !== false;
        const L       = this.layoutConfig;
        const size    = scatter ? (S.SIZE !== undefined ? S.SIZE : 34) * L.scale
                                : this.rewardCoinSize;
        const burst   = scatter ? 0
                      : (C.BURST_RADIUS !== undefined ? C.BURST_RADIUS : 55) * L.scale;
        const popMs   = S.POP_MS !== undefined ? S.POP_MS : 180;
        const popGap  = S.POP_STAGGER !== undefined ? S.POP_STAGGER : 22;
        // How long a coin's THROW OUT of the bank takes — S.OUT_MS if it is
        // set, popMs (the old "arrival pop" duration) otherwise, so an unedited
        // config keeps the same pacing it always had.
        const outMs   = S.OUT_MS !== undefined ? S.OUT_MS : popMs;
        // Somewhere on screen to fall: mostly over the spring half, the rest over the
        // panel, and never on top of a finger that is mid-drag.
        const spot = () => {
            const r = Math.random() < (S.AREA_SHARE !== undefined ? S.AREA_SHARE : 0.65)
                    ? L.partB : L.partA;
            const keep = (S.AVOID_POINTER !== undefined ? S.AVOID_POINTER : 90) * L.scale;
            const p = this.input && this.input.activePointer;
            for (let t = 0; t < 8; t++) {
                const x = r.x + r.width  * (0.08 + Math.random() * 0.84);
                const y = r.y + r.height * (0.08 + Math.random() * 0.84);
                if (!this.draggingBattery || !p || Math.hypot(x - p.x, y - p.y) > keep) return { x, y };
            }
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        };

        const coins = [];
        for (let i = 0; i < n; i++) {
            if (scatter) {
                // OUT OF WHERE IT WAS EARNED, QUICKLY — a coin does not simply
                // appear where it lands; it is thrown there from startX/startY
                // (the bank that just went off, or whatever paid out), a moment
                // after the last one so the screen RAINS across it rather than
                // blinking every coin on at once.
                const to = spot();
                const coin = this.add.image(startX, startY, 'coin')
                    .setDisplaySize(size, size)
                    .setDepth(100 + i)
                    .setAlpha(0);
                coins.push(coin);
                const sx = coin.scaleX, sy = coin.scaleY;
                coin.setScale(sx * 0.4, sy * 0.4);
                // STRAIGHT THERE AND STOPPED — no overshoot. Back.easeOut
                // sails past x/y before springing back, which on a COIN'S
                // POSITION reads as it swinging around where it landed; a coin
                // has to sit dead still once it arrives; the only motion left
                // in it after this is the later sweep to the counter.
                this.tweens.add({
                    targets: coin, x: to.x, y: to.y,
                    scaleX: sx, scaleY: sy, alpha: 1,
                    delay: i * popGap,
                    duration: outMs,
                    ease: 'Cubic.easeOut',
                });
                continue;
            }
            const at = { x: startX, y: startY - i * C.INITIAL_STACK_OFFSET };
            const coin = this.add.image(at.x, at.y, 'coin')
                .setDisplaySize(size, size)
                .setDepth(100 + i);
            coins.push(coin);
            if (burst > 0) {
                // The single-source version: thrown out and up, each its own way.
                const a2 = (i / n) * Math.PI * 2 + Math.random() * 0.6;
                const r2 = burst * (0.45 + Math.random() * 0.55);
                this.tweens.add({
                    targets: coin,
                    x: startX + Math.cos(a2) * r2,
                    y: startY + Math.sin(a2) * r2 * 0.7 - burst * 0.35,
                    duration: C.BURST_MS !== undefined ? C.BURST_MS : 260,
                    ease: 'Back.easeOut',
                });
            }
        }

        // Then in, one after another, to the counter. Quick: the sweep crosses
        // the board, so it must not linger over it.
        const settle = scatter ? outMs + n * popGap
                               : (C.BURST_MS !== undefined ? C.BURST_MS : 260);
        const flyMs  = scatter ? (S.SWEEP_MS !== undefined ? S.SWEEP_MS : 520)
                               : C.TOP_SPEED_DURATION;
        const gap    = scatter ? (S.STAGGER !== undefined ? S.STAGGER : 26)
                               : C.STAGGER_DELAY;
        // The size a coin lands at, as a fraction of its flying size.
        const arrive = C.ARRIVE_FRAC !== undefined ? C.ARRIVE_FRAC : 1.1;
        this.time.delayedCall(delayBeforeFly + settle, () => {
            coins.forEach((coin, i) => {
                // Scatter: one duration and (with STAGGER 0) one start, so every
                // coin lands on the counter at the same instant.
                const dur = scatter ? flyMs
                                    : flyMs * (1 + i * C.SPEED_VARIATION / Math.max(1, n - 1));
                this.time.delayedCall(i * gap, () => {
                    if (!coin.scene) return; // Already destroyed
                    this.tweens.add({
                        targets: coin, x: tX, y: tY,
                        displayWidth: size * arrive, displayHeight: size * arrive,
                        duration: dur, ease: C.EASE,
                        onComplete: () => {
                            coin.destroy();
                            // EACH ARRIVAL LANDS. The counter's icon takes a hit
                            // per coin, so a payout is felt as a run of blows
                            // rather than a number quietly changing.
                            this._punchCoinCounter(i === n - 1);
                            if (++done === n) {
                                this._coinFlights--;
                                this.coins += amount;
                                this.updateCoinDisplay();
                                // Mark coin animation complete for this platform
                                if (platform) platform.coinAnimationComplete = true;
                                if (onComplete) onComplete();
                            }
                        },
                    });
                });
            });
        });
    }

    // The counter reacting to a coin landing on it: the icon knocks back, and on
    // the last one the figure itself does too.
    _punchCoinCounter(last) {
        const C = CONFIG.COIN_REWARD_ANIMATION || {};
        const amt = C.PUNCH !== undefined ? C.PUNCH : 0.16;
        const ms  = C.PUNCH_MS !== undefined ? C.PUNCH_MS : 110;
        const hit = (o, mul) => {
            if (!o || !o.scene) return;
            if (o._punchBase === undefined) o._punchBase = o.scaleX;
            this.tweens.killTweensOf(o);
            o.setScale(o._punchBase);
            this.tweens.add({ targets: o, scale: o._punchBase * (1 + amt * mul),
                duration: ms, yoyo: true, ease: 'Sine.easeOut',
                onComplete: () => { if (o.scene) o.setScale(o._punchBase); } });
        };
        hit(this.coinIcon, 1);
        if (last) hit(this.coinText, 0.7);
    }

    // ================================================================
    // UPDATE
    // ================================================================
    update(time, delta) {
        if (!this._firstFrameMarked) { this._firstFrameMarked = true; loadMark('first frame — create() finished'); }
        if (this.gamePaused) return;
        this._pollOrientation();
        if (this._relayoutPending) {
            const why = this._unsettledBy();
            if (why !== this._orientWaitWhy) { this._orientWaitWhy = why; if (why) orientLog(`relayout waiting: ${why}`); }
            if (!why) { this._fastForward(false); this._relayout(); }
            // Not while a pig is held: that wait is the player's, and the
            // field rushing along under their finger would look broken.
            else this._fastForward(!this.draggingBattery);
        } else {
            this._fastForward(false);   // turned back before it ran
        }
        // Stepped per frame: the slot piggies' wheels and the springs' drawing.
        // Everything else that moves is tween- or timer-driven, and _setPaused
        // stops those.
        this._steerWheels(delta);
        this._updateSprings(delta);
    }
}

// ================================================================
// PHASER CONFIG + BOOT
// ================================================================
// [orient] console lines — CONFIG.DEBUG_ORIENTATION.
function orientLog(msg) {
    if (typeof CONFIG !== 'undefined' && CONFIG.DEBUG_ORIENTATION) console.log(`[orient] ${msg}`);
}

// ── THE STAGE ──────────────────────────────────────────────────────────────
// One fixed render size, decided once, scaled by the browser to fill whatever
// window it lands in.
//
// This used to be the opposite: the canvas was sized to the live viewport in
// device pixels and the scene was RESTARTED on every resize to re-lay it out.
// That was sharp, but a restart destroys the scene, so dragging a window — or
// rotating a phone, which is the same event — reset the run to level one.
//
// Fixing the size removes the problem rather than saving around it. Nothing
// inside the game ever learns the window changed, so there is nothing to
// preserve and nothing to replay.
//
// Chosen from the window's SHAPE — at boot, and again when the screen turns
// between portrait and landscape OR changes shape enough within one
// (STAGE.RESHAPE_TOLERANCE — see _pollOrientation). Neither restarts
// anything: the scene takes the new size and re-lays itself out in place, run
// and all (see _relayout). A smaller resize is just the browser scaling this
// stage.
function pickStage() {
    const S = (typeof CONFIG !== 'undefined' && CONFIG.STAGE) || {};
    const P = S.PORTRAIT  || { W: 1080, H: 1920 };
    const L = S.LANDSCAPE || { W: 1920, H: 1080 };
    const winW = window.innerWidth  || 1280;
    const winH = window.innerHeight || 720;
    let portrait;
    if (S.FORCE === 'portrait')       portrait = true;
    else if (S.FORCE === 'landscape') portrait = false;
    else portrait = winH > winW;
    const d = portrait ? P : L;

    // The WIDTH is the fixed half. The HEIGHT is taken from the window so the
    // stage matches the screen's shape and fills it with no bars — both halves
    // lay themselves out against the height they are given.
    let height = d.H;
    if (S.DERIVE_HEIGHT !== false) {
        const ratio = Math.min(Math.max(winH / winW, d.MIN_RATIO || 0.3), d.MAX_RATIO || 3);
        height = Math.round(d.W * ratio);
    }
    return { portrait, width: d.W, height };
}
const STAGE = pickStage();
orientLog(`boot: frame ${window.innerWidth} x ${window.innerHeight} -> ` +
    `${STAGE.portrait ? 'PORTRAIT' : 'LANDSCAPE'} stage ${STAGE.width} x ${STAGE.height}`);

const GAME_WIDTH  = STAGE.width;
const GAME_HEIGHT = STAGE.height;

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    // The canvas's own clear colour — what shows wherever nothing is drawn,
    // which since the panel's corners were rounded means those four notches.
    // Matched to the page behind it so the two cannot be told apart.
    backgroundColor: '#e0c493',
    scene: [GameScene],
    scale: {
        // FIT/ENVELOP means Phaser owns the canvas's DISPLAY size and keeps it
        // in step with the window on its own — no resize listener of ours, and
        // no restart. The game's own coordinate space stays exactly GAME_WIDTH
        // x GAME_HEIGHT forever, which is what makes a resize a non-event.
        mode: (Phaser.Scale[(CONFIG.STAGE || {}).MODE] || Phaser.Scale.FIT),
        autoCenter: Phaser.Scale.CENTER_BOTH,   // bars split evenly, not all on one side
        width:  GAME_WIDTH,
        height: GAME_HEIGHT,
        expandParent: true,
    },
    render: { antialias: true, pixelArt: false, roundPixels: false },
    // HOW MANY FILES DOWNLOAD AT ONCE. Phaser's own default is 32 — except on
    // Android, where it drops to 6, a guard for old Android browsers that
    // choked on many requests at once. Modern Android Chrome does not, and on a
    // server that takes seconds to answer each file, 6 slots turned the opening
    // load into queues: every file waited for one of six to come free, and the
    // preload ran in rounds. Poki's Inspector reports itself as an Android
    // phone, so it measured exactly that. Set here, it is 32 everywhere.
    //
    // IMAGES AS PLAIN <img> LOADS, not XHR. The build's index.html carries
    // <link rel="preload" as="image"> hints so the browser starts fetching the
    // opening art as soon as the page arrives. The browser only hands that early
    // download to a request of the SAME kind — an image load, CORS-anonymous —
    // and Phaser's default XHR fetch is a different kind, so it would download
    // every hinted image a second time. crossOrigin matches the hints'
    // crossorigin="anonymous"; the files are same-origin, so it costs nothing.
    loader: { maxParallelDownloads: 32, imageLoadType: 'HTMLImageElement', crossOrigin: 'anonymous' },
    callbacks: {
        // Runs after the canvas exists, before the first render: lock in exact
        // device-pixel sizing and keep it in sync on window resize / rotation.
        postBoot: () => { /* Phaser's scale manager tracks the window itself */ },
    },
};

// The font has to be IN HAND before the game starts, not merely declared.
// Phaser renders each Text into its own canvas texture the moment it is created
// and never re-renders it, so a label built before the font arrives keeps the
// fallback for the life of the scene — the classic symptom being the right font
// only after a refresh. document.fonts.load() both triggers the fetch (a
// declared @font-face is not fetched until something asks for it) and tells us
// when it is done.
//
// It resolves rather than rejects on failure, and a missing font is not a
// reason to withhold the game — so a failure here just means the fallback,
// which is what would have happened anyway.
function waitForFont() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const f = (CONFIG.FONT_FAMILY || '').split(',')[0].trim();
    if (!f) return Promise.resolve();
    return document.fonts.load(`${CONFIG.FONT_WEIGHT || '600'} 16px ${f}`)
        .catch(() => {})
        .then(() => document.fonts.ready)
        .catch(() => {});
}

// The loading screen in index.html. The time before Phaser boots (battery check,
// font) takes the first sliver of the bar; the asset loader fills the rest.
// Everything here is a no-op once the screen is gone — the scene restarts on a
// resize, and a second preload must not bring it back.
// ── Load timing ──────────────────────────────────────────────────────────────
// Where the time before play goes, stage by stage, printed as [timing] lines.
// performance.now() counts from the moment the page was opened, so each mark's
// first number is "ms since page open" — the same clock Poki's loading time
// runs on. The "+" figure is the gap since the mark before; the boot checks run
// side by side, so for those read the first number, not the gap.
const loadMarks = [];
function loadMark(label) {
    if (!CONFIG.DEBUG_LOAD_TIMING || typeof performance === 'undefined') return;
    const t = Math.round(performance.now());
    const prev = loadMarks.length ? loadMarks[loadMarks.length - 1].t : 0;
    loadMarks.push({ label, t });
    console.log(`[timing] ${String(t).padStart(6)}ms  (+${t - prev}ms)  ${label}`);
}
// Once, when loading finishes: the page's own download, then the network
// requests that took longest. A request's time includes waiting its turn, so a
// long list of files all starting late points at queuing, not at size.
function loadTimingReport() {
    if (!CONFIG.DEBUG_LOAD_TIMING || typeof performance === 'undefined' || !performance.getEntriesByType) return;
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) {
        console.log(`[timing] page HTML: request sent at ${Math.round(nav.requestStart)}ms, ` +
            `downloaded by ${Math.round(nav.responseEnd)}ms, parsed by ${Math.round(nav.domContentLoadedEventEnd)}ms`);
    }
    const res = performance.getEntriesByType('resource');
    const short = (u) => String(u).split('?')[0].split('/').slice(-2).join('/');
    const kb = (r) => r.transferSize ? `${(r.transferSize / 1024).toFixed(0)}KB` : 'size n/a';
    console.log(`[timing] ${res.length} requests before loading finished. Slowest:`);
    for (const r of [...res].sort((a, b) => b.duration - a.duration).slice(0, 10)) {
        console.log(`[timing]    ${String(Math.round(r.duration)).padStart(5)}ms  ` +
            `from ${Math.round(r.startTime)}ms to ${Math.round(r.responseEnd)}ms  ${kb(r)}  ${short(r.name)}`);
    }
}

const LOAD_BOOT_SHARE  = 0.1;
const LOAD_PRELOAD_CAP = 0.85;   // the rest is create() building the view
let loadingScreenDone = false;
let loadingShown = 0;            // never goes back: a batch added mid-load grows
                                 // the total, which would otherwise pull it back
function setLoadingProgress(v) {
    if (loadingScreenDone || typeof window === 'undefined') return;
    // THE PAGE OWNS THE BAR (see the script in index.html): it starts moving on
    // the first paint, long before this file exists, and it refuses to go
    // backwards. Everything here is a request to move it forward.
    const bar = window.__loading;
    if (!bar) return;
    bar.set(Math.max(0, Math.min(1, v)));
    loadingShown = bar.value();
}
function finishLoadingScreen() {
    if (loadingScreenDone) return;
    loadMark('opening view built — LOADING FINISHED');
    loadTimingReport();
    setLoadingProgress(1);
    loadingScreenDone = true;
    const screen = typeof document !== 'undefined' && document.getElementById('loading-screen');
    if (!screen) return;
    // A beat at 100% before fading, so the full bar is actually seen — create()
    // blocks the page while it builds, and a fade started now would freeze.
    setTimeout(() => {
        screen.classList.add('done');
        setTimeout(() => screen.remove(), 500);
    }, 250);
}

// ── The save, as stored ─────────────────────────────────────────────────────
// Bump SAVE_VERSION if the shape below changes incompatibly: an older save is
// then ignored (a fresh start) rather than misread.
const SAVE_VERSION = 5;   // 5: the level and each spring's compression
function saveKey() { return ((typeof CONFIG !== 'undefined' && CONFIG.SAVE) || {}).KEY || 'mergeSpring.save'; }

// The stored run, checked and tidied — or null for a fresh start: none
// saved, loading switched off, storage blocked, or anything malformed. A bad
// save must never stop the game from starting.
function readSave() {
    const S = (typeof CONFIG !== 'undefined' && CONFIG.SAVE) || {};
    if (S.ENABLED === false || S.LOAD === false) return null;
    try {
        // ?newgame in the page's address wipes the save — a fresh run to test.
        if (typeof location !== 'undefined' && /[?&]newgame\b/.test(location.search)) {
            localStorage.removeItem(saveKey());
            return null;
        }
        const raw = localStorage.getItem(saveKey());
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || d.v !== SAVE_VERSION) return null;
        const int = (v, min) => (Number.isFinite(v) ? Math.max(min, Math.floor(v)) : null);
        const sv = {
            coins: int(d.coins, 0),
            level: int(d.level, 1) || 1,
            springs: [0, 1, 2].map((i) => {
                const c = d.springs && d.springs[i];
                return Number.isFinite(c) ? Math.max(0, c) : 0;
            }),
            highest: int(d.highest, 1),
            spawnLevel: int(d.spawnLevel, 1),
            spawnCost: int(d.spawnCost, 0),
            started: !!d.started,
            mergeTut: !!d.mergeTut,
            slotSeen: [0, 1, 2].map((i) => !!(d.slotSeen && d.slotSeen[i])),
            grid: [0, 1, 2].map((r) => [0, 1, 2].map((c) => int(d.grid && d.grid[r] && d.grid[r][c], 0) || 0)),
            slots: [0, 1, 2].map((i) => int(d.slots && d.slots[i], 0) || 0),
        };
        if ([sv.coins, sv.highest, sv.spawnLevel, sv.spawnCost].some((v) => v === null)) return null;
        return sv;
    } catch (e) {
        return null;
    }
}

// THE PARENT PAGE MUST NOT SCROLL under the game — arrow keys, space and the
// mouse wheel would otherwise scroll the host page around it.
if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (ev) => {
        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) ev.preventDefault();
    });
    window.addEventListener('wheel', (ev) => ev.preventDefault(), { passive: false });
}

if (typeof window !== 'undefined' && !window.__LEVEL_VIEWER__) {
    loadMark('game script running (page and Phaser scripts are in)');
    setLoadingProgress(LOAD_BOOT_SHARE * 0.4);
    waitForFont().then(() => loadMark('font ready')).then(() => {
        loadMark('boot checks done — starting Phaser');
        setLoadingProgress(LOAD_BOOT_SHARE);
        new Phaser.Game(config);
    });
}
