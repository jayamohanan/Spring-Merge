// Merge Driver — main game scene
// No physics engine — pure drag/drop merge, with the car area beside it: the pigs
// in its three slots drive the car, and the distance driven pays the coins.

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

    // THE RIVAL CAR DESIGNS for this level and the next
    // VILLAIN.CAR.PREFETCH_AHEAD, in the background. Missing at its level
    // (a slow connection), the piggy car's art stands in (_getawaySpec).
    prefetchCars(level) {
        const n = ((CONFIG.VILLAIN || {}).CAR || {}).PREFETCH_AHEAD;
        const ahead = Math.max(1, n !== undefined ? n : 2);
        for (let l = Math.max(1, level); l <= level + ahead; l++) {
            const c = getawayCarFor(l);
            if (!c) return;
            this.ensureImage(getawayBodyKey(c.n), c.BODY).catch(() => {});
            this.ensureImage(getawayTyreKey(c.n), c.TYRE).catch(() => {});
        }
    }

    // THE RIVALS' HEADS round a level: the last one (the rank list's row
    // below) and the next VILLAIN.PREFETCH_AHEAD (the rank list's racers
    // ahead, and the next VS card). In the background; already loaded or in
    // flight is skipped.
    prefetchRivals(level) {
        const n = (CONFIG.VILLAIN || {}).PREFETCH_AHEAD;
        const ahead = Math.max(1, n !== undefined ? n : 4);
        for (let l = Math.max(1, level - 1); l <= level + ahead; l++) {
            const i = villainIndexFor(l);
            this.ensureImage(villainKey(i), villainPath(i)).catch(() => {});
        }
    }
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

        // ── The car area ─────────────────────────────────────────────────
        // How far the slots have driven, in metres — the run's progress.
        this.distance          = 0;
        this.carArea           = null;   // the empty rect right of the slots
        this.cars              = [];     // one per slot, on its slot's road line
        this.steeringItems     = [];     // slot piggies whose wheels turn
        // ── The level: one race per lane ─────────────────────────────────
        // lanes[i] is lane i's race: the rival's lead still to run down
        // (`left`, of `total`), what winning pays, and whether it has been
        // won (`caught`). See levelData.js and _levelLanes.
        this.level             = 1;
        this.lanes             = null;
        this.villains          = [];     // one rival car per lane
        this.laneLabels        = [];     // the lead figure over each lane
        this.roadGfx           = null;   // one graphics for the three roads
        this.roadOffsets       = [0, 0, 0];  // how far each lane's road has slid, px
        this._levelTurning     = false;  // between the last win and the next level
        this._briefing         = false;  // the rivals are dropping in: no racing yet
        this.finishLines       = [];     // per lane: its finish line, once it has won
        this.raceBadges        = [];     // per lane: its 1ST / 2ND badges
        this.podiums           = [];     // per lane: its WON banner, while it is up (_raceClose)
        this._zoomCams         = [];     // per lane: its zoom camera (_laneZoom)
        this.race              = [];     // per lane: its race — places, speeds, camera (_raceStep)
        this._rankPanel        = null;   // the rank-up panel, while it is up (_showRankUp)

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
        // button and nothing else — the slots live in the car area — so
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

        // ── partA (UI) and partB (the car area) ───────────────────────────────
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
        // of the half's width. Only this column: the car area keeps baseScale
        // (exported as `scale`), its slots baseCell. Portrait is untouched.
        let scale = baseScale;
        if (!isP) {
            const grow = LY.LANDSCAPE_GRID_GROW !== undefined ? LY.LANDSCAPE_GRID_GROW : 1.15;
            const designPanW = COLS * BASE + (COLS - 1) * GAP + 2 * panPadRef;
            const wCap = partA.width * (LY.LANDSCAPE_GRID_MAX_W !== undefined ? LY.LANDSCAPE_GRID_MAX_W : 0.9) / designPanW;
            scale = Math.max(baseScale, Math.min(baseScale * grow, sH, wCap));
        }
        const cellSize = BASE * scale;                  // no Math.min(BASE,…) clamp
        const baseCell = BASE * baseScale;              // the car area's slots stay at this

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

        // ── The car area's slot column ────────────────────────────────────────
        // Three slots stacked down the area's left edge, each with its rate
        // under it. One slot and its label get a third of the area's height
        // (BAND_FRAC of it); the square is capped at a grid cell, and only
        // shrinks on an area too short to give each slot a cell's worth.
        const CA        = CONFIG.CAR_AREA || {};
        const slotBandH = partB.height * (CA.BAND_FRAC !== undefined ? CA.BAND_FRAC : 0.9) / 3;
        const slotSize  = Math.max(8, Math.min(baseCell,
                                   slotBandH * (CA.SLOT_FRAC !== undefined ? CA.SLOT_FRAC : 0.62)));

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
            panelCenterY, buttonCenterY, coinCenterY, slotSize, slotBandH,
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
    // old layout. So a turn only ASKS for a relayout: the distance tick holds,
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
        if (this._levelTurning)   return 'a level turn';
        if (this._briefing)       return 'the level start';
        if (this.lanes && this.lanes.some((l) => l.finishing || l.leading || l.closing)) return 'a race moment';
        if (this._zoomCams.some(Boolean)) return 'a finish zoom';
        if (this._rankPanel) return 'the rank panel';
        if ((this._coinFlights || 0) > 0) return 'coins in flight';
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
        for (const car of this.cars) gone(car);
        this.cars = [];
        for (const o of [...this.villains, ...this.laneLabels]) gone(o);
        this.villains = []; this.laneLabels = [];
        gone(this.roadGfx);
        this.roadGfx = null;
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

        // The car area: the slot column down its left edge, a car beside each.
        this.createSlots();
        this._buildCars();
        if (!this.lanes) this.lanes = this._levelLanes(this.level);
        this._buildVillains(false);

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
            p.chargeRateText.setText(this._rateText(slot.distPerSec)).setVisible(true);
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
    // ONLY SETTLED FIGURES — levels, coins, the distance driven — never
    // anything mid-animation. Coins still flying to the counter are not in the
    // figure yet; losing a handful of those to a refresh is the trade.
    _collectSave() {
        const lvlOf = (row) => row.map((b) => (b ? b.level : 0));
        return {
            v: SAVE_VERSION,
            t: Date.now(),
            coins: this.coins,
            distance: this.distance,
            // A LEVEL TURN IN PROGRESS SAVES AS THE NEXT LEVEL, fresh.
            level: this._levelTurning ? this.level + 1 : this.level,
            lanes: this._levelTurning || !this.lanes ? null
                : this.lanes.map((l) => ({ left: l.left, caught: !!l.caught })),
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
        this.distance = sv.distance;
        this.level = sv.level;
        // No further from a villain than the level's table says — a save from
        // before a table change could say otherwise.
        if (sv.lanes) {
            this.lanes = this._levelLanes(this.level).map((l, i) => {
                const k = sv.lanes[i];
                return Object.assign(l, { left: Math.min(k.left, l.total), caught: k.caught, surged: true, dropped: true });
            });
        }
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
        // A SAVE past level 1: that level's rival and car are needed from the start.
        if (this._save && this._save.level > 1) {
            const i = villainIndexFor(this._save.level);
            this.load.image(villainKey(i), villainPath(i));
            const c = getawayCarFor(this._save.level);
            if (c) { this.load.image(getawayBodyKey(c.n), c.BODY); this.load.image(getawayTyreKey(c.n), c.TYRE); }
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

        // The car area: the slot column down its left edge, a car beside each.
        const save = this._save;
        if (save) this._applySave(save);
        this.createSlots();
        this._buildCars();
        if (!this.lanes) this.lanes = this._levelLanes(this.level);
        this._buildVillains(false);

        // The merge half
        this.createGrid();
        this.createCoinDisplay();
        if (save) this._restorePigs(save);
        else this.spawnBatteryInGrid(0, 0, CONFIG.BATTERY_START_LEVEL);
        this.assets.prefetchAhead(this.highestBatteryLevel + 1);
        this.assets.prefetchRivals(this.level);
        this.assets.prefetchCars(this.level);
        this.assets.ensureImage(PODIUM_PIGGY.key, PODIUM_PIGGY.url).catch(() => {});
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
        // THE LEVEL'S START — the rivals dropping in — now, or once the start
        // tutorial is dismissed (removeStartOverlay). Nothing for lanes
        // already under way.
        if (!this.startOverlay) this._raceIntro();
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

        // ?cartest: the car test overlay. DEV ONLY — dev/ is not in the build.
        if (/[?&]cartest\b/.test(location.search)) {
            const s = document.createElement('script');
            s.src = 'dev/carTest.js';
            s.onload = () => window.carTest(this);
            document.head.appendChild(s);
        }
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
        // against the screen edge and the two against the car area.
        //
        // Drawn to partA rather than across the stage, because a full-screen
        // fill would sit UNDER the rounded shape and show through its corners,
        // which is the one thing rounding them is for. The car area needs no
        // fill: its camera covers that ground edge to edge.
        const A = this.layoutConfig.partA;
        const bgR = Math.round((CONFIG.BACKGROUND.CORNER_RADIUS || 0) * this.layoutConfig.scale);
        if (bgA > 0) {
            if (bgR > 0) bgGfx.fillRoundedRect(A.x, A.y, A.width, A.height, bgR);
            else         bgGfx.fillRect(A.x, A.y, A.width, A.height);
        }
        bgGfx.setDepth(0);
    }

    // ================================================================
    // THE SLOTS — a column down the car area's left edge
    // ================================================================
    // Three places to put a pig, stacked top to bottom, each with the distance
    // it covers per second written under it. Drawn with the same grained face
    // as a grid cell, so a slot and a cell read as the same kind of object.
    // Everything right of the column is left empty for the car (this.carArea).
    //
    // ON A RELAYOUT the slot records are kept — they are what the charging
    // slots and their pigs are paired through — and only their geometry and
    // furniture are swapped for the new ones.
    createSlots() {
        const P     = CONFIG.PLATFORM;
        const CA    = CONFIG.CAR_AREA || {};
        const v     = (x, d) => (x !== undefined ? x : d);
        const L     = this.layoutConfig;
        const scale = L.platformScale;
        const s     = (n) => n * scale;
        const B     = L.partB;
        const ssz   = L.slotSize;

        // THE SAME LOOK AS THE LEAD FIGURE over the cars (VILLAIN.LABEL), so
        // the piggy's figure and the lead it runs down read as one kind of number.
        const LB = (CONFIG.VILLAIN || {}).LABEL || {}, RL = (CONFIG.RACE || {}).LEAD || {};
        // AS THE LEAD FIGURE while the rival leads (_setLaneLabel): dark on a white outline.
        const style = {
            fontSize: Math.max(10, Math.round(v(LB.SIZE, 30) * scale)) + 'px',
            fontFamily: CONFIG.FONT_FAMILY, fontStyle: CONFIG.FONT_WEIGHT,
            color: RL.BEHIND_COLOR || '#1c1c1c', stroke: RL.BEHIND_STROKE || '#ffffff',
            strokeThickness: Math.round(v(LB.STROKE_W, 5) * scale),
        };
        // The label's REAL height, so a slot and its label are centred in their
        // band as one block rather than the slot alone.
        const probe  = this.add.text(0, 0, '0', style);
        const labelH = probe.height + s(P.CHARGE_RATE_GAP);
        probe.destroy();

        // One band per slot, the three filling BAND_FRAC of the area's height
        // and centred in it.
        const slotX = B.x + s(v(CA.SLOT_COLUMN_PAD, 28)) + ssz / 2;
        const bandH = L.slotBandH;
        const top   = B.y + (B.height - 3 * bandH) / 2;

        // WHAT IS LEFT FOR THE CAR: everything right of the column.
        const carX = slotX + ssz / 2 + s(v(CA.SLOT_COLUMN_GAP, 28));
        this.carArea = { x: carX, y: B.y, width: Math.max(0, B.x + B.width - carX), height: B.height };

        // The face texture the filled state uses, baked at the GRID's cell size
        // and scaled down here — one texture for both.
        this._makeCellTextures(L.cellSize);

        for (let i = 0; i < 3; i++) {
            // The label ABOVE the square (CHARGE_RATE_ABOVE, in line with the
            // gap lines over the cars) or under it; the square shifts the
            // other way so the two stay centred in the band as one block.
            const above = P.CHARGE_RATE_ABOVE !== false;
            const slotY = top + bandH * (i + 0.5) + (above ? labelH / 2 : -labelH / 2);

            // The SAME faces as the grid's cells: the empty one stays up the
            // whole time, and filling the slot lays the filled one over it —
            // same size and shape, so it covers it exactly.
            const slotBg = this.add.image(slotX, slotY, 'cell_empty')
                .setDisplaySize(ssz, ssz).setDepth(3);
            const slotBgFilled = this.add.image(slotX, slotY, 'cell_filled')
                .setDisplaySize(ssz, ssz).setDepth(3).setVisible(false);

            // The distance this slot's pig covers per second, over (or under) the square.
            const rateY = above ? slotY - ssz / 2 - s(P.CHARGE_RATE_GAP) : slotY + ssz / 2 + s(P.CHARGE_RATE_GAP);
            const chargeRateText = this.add.text(slotX, rateY, '', style)
                .setOrigin(0.5, above ? 1 : 0).setDepth(5).setVisible(false);

            // THE DROP ZONE (PLATFORM.DROP_ZONE): its half-width and
            // half-height, the same both ways from the slot's centre — never
            // past the race's half, nor more than halfway to the next slot.
            const DZ = P.DROP_ZONE || {}, lerp = (k, a, b) => a + (b - a) * Math.max(0, Math.min(1, v(k, 0)));
            const dropHW = lerp(DZ.X, ssz / 2, Math.max(ssz / 2, slotX - B.x));
            const dropHH = lerp(DZ.Y, ssz / 2, Math.max(ssz / 2,
                Math.min(bandH / 2, slotY - B.y, B.y + B.height - slotY)));
            const slot = { index: i, slotX, slotY, slotSize: ssz, dropHW, dropHH, slotBg, slotBgFilled, chargeRateText };
            if (this.platforms[i]) Object.assign(this.platforms[i], slot);
            else this.platforms.push(Object.assign(slot, { batterySprite: null, batteryLevelText: null }));
        }
    }

    // ================================================================
    // THE CARS
    // ================================================================
    // One per slot, standing on the line through that slot's bottom edge — the
    // road, which is not drawn. Sized to the car area's width, capped by the
    // slot's height, then scaled by SCALE, and parked close beside its slot
    // (see CONFIG.CAR).
    _buildCars() {
        const C = CONFIG.CAR || {};
        const A = this.carArea;
        if (!A || !A.width) return;
        const v = (x, d) => (x !== undefined ? x : d);
        const bodyW = v(C.BODY_W, 254);
        const carH  = this._carGround();   // ground to roof, art px
        const left  = A.x + v(C.LEFT_GAP, 0) * this.layoutConfig.platformScale;
        this.cars = this.platforms.map((p) => {
            const h = Math.min(A.width * v(C.WIDTH_FRAC, 0.45) / bodyW * carH,
                               p.slotSize * v(C.MAX_H_FRAC, 1)) * v(C.SCALE, 1);
            const w = h / carH * bodyW;
            const car = this._makeCar(left + w / 2, p.slotY + p.slotSize / 2, h);
            this._seatDriver(car);
            return car;
        });
    }

    // THE PIGGY CAR'S DRIVER in its window (CAR.DRIVER): the side view, its
    // bottom cut at the window's bottom edge and its top at the glass's
    // top. Rides the body with the suspension (car.face, _suspend).
    _seatDriver(car) {
        const C = CONFIG.CAR || {}, Dr = C.DRIVER, v = (x, d) => (x !== undefined ? x : d);
        if (!Dr || !this.textures.exists(Dr.KEY)) return;
        const bw = v(C.BODY_W, 254), gy = this._carGround(C);
        const face = this.add.image(-bw / 2 + Dr.X, -gy + Dr.S, Dr.KEY).setOrigin(0.5, 0);
        const fw = face.frame.realWidth, fh = face.frame.realHeight;
        const s = Dr.H / fh, cut = v(Dr.CROP, 0);
        face.setScale(s);
        face.y -= Dr.H * (1 - cut);
        // Off the top and sides: whatever is outside the glass.
        const x0 = Dr.X - fw * s / 2;
        const top = Math.max(0, (Dr.TOP - (Dr.S - Dr.H * (1 - cut))) / s);
        const l = Dr.LEFT !== undefined ? Math.max(0, (Dr.LEFT - x0) / s) : 0;
        const r = Dr.RIGHT !== undefined ? Math.min(fw, (Dr.RIGHT - x0) / s) : fw;
        face.setCrop(l, top, r - l, fh * (1 - cut) - top);
        car.addAt(face, 1);
        car.face = face;
        car.faceBaseY = face.y;
    }

    // Where the tyres meet the ground, in the body's own pixels: the lowest
    // tyre bottom. The car's height, ground to roof, is the same figure.
    // `spec` is the car's art and layout — CONFIG.CAR (the piggy car) unless
    // given, or a getaway car's from VILLAIN.CAR.CARS.
    _carGround(spec) {
        const C = spec || CONFIG.CAR || {};
        const t = C.TYRE_SIZE !== undefined ? C.TYRE_SIZE : 53;
        return Math.max(C.BODY_H || 107, ...(C.TYRES || []).map((w) => w.y + t));
    }

    // A CAR: the body and its tyres in one container, laid out in the body's
    // own pixels and scaled as one. The container's origin is the point under
    // the car's middle where the tyres touch the ground — so (x, groundY) puts
    // the car standing on that line, `height` tall from ground to roof.
    // Returns the container; its `tyres` are there to spin. `spec` (see
    // _carGround) picks other art: its bodyKey / tyreKey textures and its
    // BODY_W / BODY_H / TYRE_SIZE / TYRES layout.
    _makeCar(x, groundY, height, spec) {
        const C  = spec || CONFIG.CAR || {};
        const bw = C.BODY_W !== undefined ? C.BODY_W : 254;
        const t  = C.TYRE_SIZE !== undefined ? C.TYRE_SIZE : 53;
        const gy = this._carGround(C);
        const ox = -bw / 2, oy = -gy;   // the body's top-left, from the ground point
        // ABOUT ITS CENTRE, so the suspension can tilt it in place.
        const bh = C.BODY_H || 107;
        const body = this.add.image(ox + bw / 2, oy + bh / 2, C.bodyKey || 'car_body').setDisplaySize(bw, bh);
        const tyres = (C.TYRES || []).map((w) =>
            this.add.image(ox + w.x + t / 2, oy + w.y + t / 2, C.tyreKey || 'car_tyre').setDisplaySize(t, t));
        const car = this._onRoad(this.add.container(x, groundY,
            C.TYRES_IN_FRONT === false ? [...tyres, body] : [body, ...tyres]));
        car.setScale(height / gy).setDepth(CONFIG.CAR.DEPTH !== undefined ? CONFIG.CAR.DEPTH : 4);
        car.tyres = tyres;
        car.bodyImg = body;
        // THE SUSPENSION (see _suspend). Resting y's inside the car, and where
        // the rear and front tyres sit across it from the body's centre, in
        // the car's own pixels.
        car.bodyBaseY = body.y;
        car.bodyBaseX = body.x;
        car.tyreBaseY = tyres.map((ty) => ty.y);
        car.tyreDX = tyres.map((ty) => ty.x);
        // Each end of the body: its height above rest and how fast it is
        // moving (px, up is +). `k` is the last speed share, for the squat.
        car.susp = { ends: tyres.map(() => ({ e: 0, v: 0 })), k: 0 };
        car.carH = height;     // ground to roof, px
        car.carW = bw * height / gy;
        car.homeX = x;         // where it starts a race (_raceMarks)
        car.wheelAngle = 0;    // degrees, shared by both tyres
        car.wheelSpeed = 0;    // degrees per second, eased toward its target
        return car;
    }

    // THE TYRES TURN UNDER A DRIVER. Each car's tyres spin while its slot has
    // its car moving — both at the same angle, as one car. Run every frame.
    _spinWheels(delta) {
        const C    = CONFIG.CAR || {};
        const top  = C.SPIN_DEG_PER_SEC !== undefined ? C.SPIN_DEG_PER_SEC : 540;
        const ease = Math.min(1, (C.SPIN_EASE !== undefined ? C.SPIN_EASE : 4) * delta / 1000);
        // AS FAST AS THEIR CAR GOES: each car's speed along the road (its
        // lane's race, _raceStep) as a share of the road's speed, times the
        // spin at road speed (RACE.SPIN_AT_ROAD x SPIN_DEG_PER_SEC). So the
        // rival's tyres outrun the piggy car's in the head start, and the
        // piggy car's outrun the rival's while its piggy closes the lead.
        const atRoad = top * ((CONFIG.RACE || {}).SPIN_AT_ROAD !== undefined ? CONFIG.RACE.SPIN_AT_ROAD : 1.3);
        const V = this._raceV();
        const all = [...this.cars.map((c, i) => [c, i, false]),
                     ...this.villains.map((en, i) => [en, i, true])];
        all.forEach(([car, i, rival]) => {
            if (!car || !car.scene) return;
            const rc = this.race[i];
            // LOCKED in the piggy car's skid (RACE.SKID): not turning at all.
            if (!rival && rc && rc.phase === 'finish' && rc.fin && rc.fin.locked) { car.wheelSpeed = 0; return; }
            const want = rc && !(rc.entering && !rival) ? atRoad * Math.max(0, rival ? rc.vr : rc.vp) / V : 0;
            // FROM THE FINISH ON, exactly its car's speed: eased, the tyres
            // lagged a hard stop and kept turning on a car all but at rest.
            const fin = rc && (rc.phase === 'finish' || rc.phase === 'done');
            car.wheelSpeed += (want - car.wheelSpeed) * (fin ? 1 : ease);
            if (!want && car.wheelSpeed < 1) car.wheelSpeed = 0;
            if (!car.wheelSpeed) return;
            car.wheelAngle = (car.wheelAngle + car.wheelSpeed * delta / 1000) % 360;
            for (const t of car.tyres) t.setAngle(car.wheelAngle);
        });
    }

    // ================================================================
    // THE VILLAINS
    // ================================================================
    // A level's three chases, fresh: each lane's distance and payout from
    // levelData.js.
    _levelLanes(level) {
        const d = levelDistancesFor(level), pay = levelPayoutsFor(level);
        // `caught` is "overtaken" in the race: the lane has been won. `surged`:
        // the rival has pulled ahead to its distance (the start is over).
        // `finishing`: the win is playing out.
        // `dropped`: the rival has landed on the road (_raceIntro).
        // `leading`: it is taking its head start (_raceStartLead).
        // `closing`: won, the count running its last stretch to 0 (_winLane).
        // `final`: the level's last win.
        return d.map((v, i) => ({ total: v, left: v, payout: pay[i], caught: false,
                                  surged: false, finishing: false, dropped: false, leading: false,
                                  closing: false, final: false }));
    }

    // Lane i's lead is being run down: a piggy in its slot, the rival has
    // taken its head start, and the lane is not yet won.
    _laneDriving(i) {
        const lane = this.lanes && this.lanes[i];
        return !!(this.chargingSlots[i] && lane && lane.surged && !lane.caught && !this._levelTurning && !this._briefing);
    }

    // THE LEVEL'S RIVALS, one per lane — the level's rival car, three times —
    // on each lane's road, with the lead figure over each lane. Built from
    // this.lanes, so a relayout rebuilds them exactly as they were (a won
    // lane as it ended). `enter`: a new level — the piggy cars roll back to
    // the line (and the rivals drop in: _raceIntro).
    _buildVillains(enter) {
        // EVERYTHING THE LAST BUILD MADE goes first — the road too. Left
        // behind, a new level drew its road over a frozen copy of the last
        // one's, and the lanes showed two road lines.
        for (const o of [...this.villains, ...this.laneLabels, this.roadGfx]) {
            if (o && o.scene) { this.tweens.killTweensOf(o); o.destroy(); }
        }
        this._clearRace();
        this.villains = []; this.laneLabels = []; this.race = [];
        this.roadGfx = null;
        const V  = CONFIG.VILLAIN || {}, LB = V.LABEL || {};
        const v  = (x, d) => (x !== undefined ? x : d);
        const L  = this.layoutConfig;
        if (!this.carArea || !this.lanes) return;
        const key = villainKey(villainIndexFor(this.level));
        const sc  = L.platformScale;
        this._terrainReset();

        this.platforms.forEach((p, i) => {
            const lane   = this.lanes[i];
            const car    = this.cars[i];
            const ground = p.slotY + p.slotSize / 2;

            // THE RIVAL'S CAR — out of sight until it drops in (_raceIntro).
            const en = this._makeGetawayCar(i, ground, key);
            if (!lane.dropped) en.setVisible(false);
            this.villains[i] = en;

            // THE LANE'S RACE, from its record (_raceSetup). A NEW LEVEL puts
            // the piggy car straight back at its home — no roll across.
            if (car) {
                this._raceSetup(i, enter);
                if (enter) {
                    this.tweens.killTweensOf(car);
                    car.x = car.homeX;
                    const rc = this.race[i];
                    if (rc) rc.entering = false;
                }
            }

            // THE LEAD FIGURE — placed every frame (_placeLaneLabels).
            const fs = Math.max(10, Math.round(v(LB.SIZE, 30) * sc));
            this.laneLabels[i] = this._onRoad(this.add.text(0, 0, '', {
                fontSize: fs + 'px', fontFamily: CONFIG.FONT_FAMILY, fontStyle: CONFIG.FONT_WEIGHT,
                color: LB.COLOR || '#ffffff', stroke: LB.STROKE || '#2b2013',
                strokeThickness: Math.round(v(LB.STROKE_W, 5) * sc),
            })).setOrigin(0.5).setDepth(v(V.DEPTH, 4) + 0.2);
            this._setLaneLabel(i);

            // A WON LANE as it ended — so a rebuild (a relayout) shows it so.
            if (lane.caught) this._raceFinal(i);
        });
        this._placeLaneLabels();
        const RD = CONFIG.ROAD || {};
        this.roadGfx = this._onRoad(this.add.graphics().setDepth(RD.DEPTH !== undefined ? RD.DEPTH : 3.8));
        this._setupRoadCam();
        this._drawRoads(0);
    }

    // ONE LANE'S ROAD, as a pattern over one PERIOD: its marks (where each sits
    // along it, what it is, its size) and its bumps (where, how high, how
    // long, as shares). Fixed per lane (hashed, not random), so a rebuild
    // draws the same road, and the three lanes differ.
    _roadPattern(lane) {
        const R = CONFIG.ROAD || {};
        const n = Math.max(1, R.MARKS || 8);
        const marks = [];
        for (let k = 0; k < n; k++) {
            const h = (s) => this._cellHash(lane, k, s);
            // Spread evenly, then nudged — irregular, but never bunched.
            const at = (k + 0.15 + 0.7 * h(1)) / n;
            marks.push({ at, kind: h(2) < 0.5 ? 'dash' : 'pebble', size: h(3), drop: h(4) });
        }
        // ONE BUMP per bump spacing (see _bumpEvery), somewhere along it.
        const h = (s) => this._cellHash(lane + 7, 0, s);
        const bumps = [{ at: 0.15 + 0.7 * h(1), h: 0.7 + 0.3 * h(2), w: 0.7 + 0.3 * h(3) }];
        return { marks, bumps };
    }

    // HOW FAR APART THE BUMPS ARE this level, px: EVERY on level 1, closing
    // in to EVERY_MIN by MIN_AT_LEVEL. Fixed for the level, so a bump never
    // jumps mid-road.
    _bumpEvery() {
        const B = (CONFIG.ROAD || {}).BUMPS || {};
        const v = (x, d) => (x !== undefined ? x : d);
        const a = v(B.EVERY, 2400), b = v(B.EVERY_MIN, 1000);
        const t = Math.min(1, Math.max(0, (this.level - 1) / Math.max(1, v(B.MIN_AT_LEVEL, 30) - 1)));
        return Math.max(20, (a + (b - a) * t) * this.layoutConfig.platformScale);
    }

    // ================================================================
    // THE TERRAIN — see CONFIG.ROAD.TERRAIN
    // ================================================================
    // Positions along a lane's road (`u`) are px @ design from where the
    // level's road began (T.t0, its scroll then), so they hold over a rebuild.

    // A NEW LEVEL'S TERRAIN: where its roads begin, nothing flattened yet.
    // Kept over a rebuild of the same level.
    _terrainReset() {
        const T = this._terrain;
        if (T && T.level === this.level) return;
        const TE = (CONFIG.ROAD || {}).TERRAIN || {};
        const sc = this.layoutConfig.platformScale, B = this.layoutConfig.partB;
        // FLAT AT THE START: at least the whole road on screen, and some.
        const wide = (B.x + B.width - this.carArea.x) / sc + 300;
        this._terrain = {
            level: this.level, t0: this.roadOffsets.slice(),
            start: Math.max(TE.FLAT_START !== undefined ? TE.FLAT_START : 1200, wide),
            flat: [Infinity, Infinity, Infinity], sets: [null, null, null],
        };
    }

    // THE LEVEL'S MOOD: none (flat) for the first FLAT_LEVELS, calm every
    // CALM_EVERY-th level, else hashed — and never the last level's hashed
    // mood twice running.
    _terrainMood(level) {
        const TE = (CONFIG.ROAD || {}).TERRAIN || {};
        const M = TE.MOODS || {}, names = Object.keys(M);
        if (!names.length || level <= (TE.FLAT_LEVELS || 0)) return null;
        const every = TE.CALM_EVERY || 0;
        if (M.calm && every && level % every === 0) return M.calm;
        const at = (l) => Math.floor(this._cellHash(13, l, 51) * names.length) % names.length;
        let k = at(level);
        if (k === at(level - 1)) k = (k + 1) % names.length;
        return M[names[k]];
    }

    // LANE i's SHAPES, made on to at least `upTo` (u). Each: its start `s`,
    // length `L`, height `h`, kind, and a plateau's ramp `r` / washboard's `n`.
    _terrainGrow(i, upTo) {
        const T = this._terrain;
        const TE = (CONFIG.ROAD || {}).TERRAIN || {};
        let set = T.sets[i];
        if (!set) set = T.sets[i] = { shapes: [], end: T.start, k: 0, mood: this._terrainMood(T.level) };
        const S = TE.SHAPES || {}, gap = TE.GAP || [250, 700];
        const mood = set.mood || {}, kinds = Object.keys(mood).filter((n) => S[n] && mood[n] > 0);
        const sum = kinds.reduce((a, n) => a + mood[n], 0);
        if (!sum) { set.end = Infinity; return set; }
        const lerp = (r, t) => (Array.isArray(r) ? r[0] + (r[1] - r[0]) * t : (r || 0));
        while (set.end < upTo) {
            const h = (s) => this._cellHash(i * 31 + 5, T.level * 97 + set.k, s);
            set.k++;
            let r = h(1) * sum, kind = kinds[kinds.length - 1];
            for (const n of kinds) { if ((r -= mood[n]) < 0) { kind = n; break; } }
            const D = S[kind], s = set.end + lerp(gap, h(2)), L = Math.max(40, lerp(D.L, h(3)));
            set.end = s + L;
            if (kind === 'straight') continue;
            set.shapes.push({
                kind, s, L, h: lerp(D.H, h(4)),
                r: Math.min(L * 0.45, lerp(D.RAMP || [200, 200], h(5))),
                n: Math.max(1, Math.round(lerp(D.N || [3, 3], h(6)))),
            });
        }
        return set;
    }

    // LANE i's SHAPE under `u`, or null. Shapes starting at or past the
    // lane's flattening (its finish) are gone.
    _terrainShapeAt(i, u) {
        const T = this._terrain;
        if (!T || !(u >= T.start)) return null;
        const list = this._terrainGrow(i, u).shapes;
        let lo = 0, hi = list.length - 1, at = -1;
        while (lo <= hi) {   // the last shape starting at or before u
            const mid = (lo + hi) >> 1;
            if (list[mid].s <= u) { at = mid; lo = mid + 1; } else hi = mid - 1;
        }
        const sh = at >= 0 ? list[at] : null;
        return sh && u < sh.s + sh.L && sh.s < T.flat[i] ? sh : null;
    }

    // LANE i's HEIGHT at a screen x, px (up is +) — or null with no terrain.
    // `x0`: the road's left edge, where the scroll counts from. `room`: how
    // far up and down it may go (_terrainRoom); each shape is held to it.
    _terrainFn(i, x0, room) {
        const TE = (CONFIG.ROAD || {}).TERRAIN || {};
        const T = this._terrain;
        if (!T || TE.ENABLED === false) return null;
        const sc = this.layoutConfig.platformScale;
        const base = this.roadOffsets[i] - x0 - T.t0[i];
        return (x) => {
            const sh = this._terrainShapeAt(i, (x + base) / sc);
            if (!sh) return 0;
            const t = ((x + base) / sc - sh.s) / sh.L;
            let k;
            if (sh.kind === 'plateau') {
                // Up its ramp, flat along the top, down its ramp.
                const r = sh.r / sh.L;
                k = t < r ? 0.5 * (1 - Math.cos(Math.PI * t / r))
                  : t > 1 - r ? 0.5 * (1 - Math.cos(Math.PI * (1 - t) / r)) : 1;
            } else {
                k = 0.5 * (1 - Math.cos(2 * Math.PI * (sh.kind === 'washboard' ? sh.n : 1) * t));
            }
            const hh = sh.h * sc;
            return (hh > 0 ? Math.min(hh, room.up) : Math.max(hh, -room.down)) * k;
        };
    }

    // THE ROOM LANE i's TERRAIN HAS in its band, px: up — the car's roof
    // (and a bump on top) kept in the band and clear of the lead figure;
    // down — the road's strip kept above the band's bottom.
    _terrainRoom(i, ground, thick) {
        const L = this.layoutConfig, B = L.partB, sc = L.platformScale;
        const v = (x, d) => (x !== undefined ? x : d);
        const R = CONFIG.ROAD || {}, RL = (CONFIG.RACE || {}).LEAD || {};
        const top = B.y + (B.height - 3 * L.slotBandH) / 2 + i * L.slotBandH;
        const car = this.cars[i], carH = (car && car.carH) || 0;
        const pad = 4 * sc + v(R.LINE_W, 3) * sc / 2;
        const up = Math.min(ground - carH - top, v(RL.ABOVE, 40) * sc) - v((R.BUMPS || {}).H, 6) * sc - pad;
        const down = top + L.slotBandH - ground - thick - pad;
        return { up: Math.max(0, up), down: Math.max(0, down) };
    }

    // LANE i's FINISH HAS BEGUN: no new shape from the screen's right edge
    // on, so the line, the braking and the stops are all on the flat.
    // Returns the world x where the road is flat for good (past any shape
    // still on screen), or -Infinity.
    _terrainSettle(i, rc) {
        const TE = (CONFIG.ROAD || {}).TERRAIN || {};
        const T = this._terrain;
        if (!T || TE.ENABLED === false) return -Infinity;
        const sc = this.layoutConfig.platformScale, B = this.layoutConfig.partB;
        const x0 = this.carArea.x;
        const base = rc.road0 - x0 - T.t0[i];   // u (px) = world x + base
        const edge = (B.x + B.width - x0 + rc.road0 + rc.cam - T.t0[i]) / sc;
        const sh = this._terrainShapeAt(i, edge);
        T.flat[i] = Math.min(T.flat[i], edge);
        return sh ? (sh.s + sh.L) * sc - base : -Infinity;
    }

    // THE ROADS, redrawn each frame — the line (with its bumps), the marks,
    // slid back by how far that lane has driven and faded out before its
    // villain — and each car's suspension stepped over the road under it.
    _drawRoads(delta) {
        const g = this.roadGfx;
        if (!g || !g.scene) return;
        g.clear();
        const R  = CONFIG.ROAD || {}, C = CONFIG.CAR || {}, BU = R.BUMPS || {};
        const v  = (x, d) => (x !== undefined ? x : d);
        const sc = this.layoutConfig.platformScale;
        const A  = this.carArea, B = this.layoutConfig.partB;
        if (!A) return;
        const x0 = A.x, xEnd = B.x + B.width;
        const period = Math.max(20, v(R.PERIOD, 420) * sc);
        const lineW  = Math.max(1, v(R.LINE_W, 3) * sc);
        const lineC  = hexColor(R.LINE_COLOR || '#a3825c');
        const markC  = hexColor(R.MARK_COLOR || '#7e6044');
        const fillC  = hexColor(R.FILL_COLOR || '#c9a77c');
        const thick  = v(R.THICK, 12) * sc;
        const bumpH  = v(BU.H, 6) * sc, bumpW = Math.max(2, v(BU.W, 40) * sc);
        const step   = Math.max(1, v(R.SAMPLE, 4) * sc);
        const top    = v(C.SPIN_DEG_PER_SEC, 540) || 1;
        if (!this._roadSets) this._roadSets = [0, 1, 2].map((i) => this._roadPattern(i));

        this.platforms.forEach((p, i) => {
            const y   = p.slotY + p.slotSize / 2;
            const car = this.cars[i], vl = this.villains[i];
            const set = this._roadSets[i];

            // HOW FAR THE ROAD HAS SLID: its lane's camera (_raceStep sets
            // it). Kept whole, since the marks and the bumps repeat at
            // different spacings and each takes its own share.
            const k = 0;   // (no longer used by the springs)
            const off = this.roadOffsets[i] % period;
            const bumpP = this._bumpEvery(), bumpOff = this.roadOffsets[i] % bumpP;

            // Both cars drive this one road: it runs whole, marks and bumps,
            // under both.
            // THE ROAD'S HEIGHT at a screen x (px, up is +): the bumps, each a
            // smooth rise, slid back with the marks.
            const terr = this._terrainFn(i, x0, this._terrainRoom(i, y, thick));
            const heightAt = (x) => {
                let hgt = terr ? terr(x) : 0;
                for (const b of set.bumps) {
                    const w = bumpW * b.w;
                    // The nearest copy of this bump, spacing by spacing.
                    let c = x0 + b.at * bumpP - bumpOff;
                    c += Math.round((x - c) / bumpP) * bumpP;
                    const d = Math.abs(x - c);
                    if (d < w / 2) hgt += bumpH * b.h * 0.5 * (1 + Math.cos(Math.PI * d / (w / 2)));
                }
                return hgt;
            };

            // THE STRIP under the line, its thickness kept over hill and dip.
            if (thick > 0) {
                g.fillStyle(fillC, 1);
                g.beginPath();
                g.moveTo(x0, y - heightAt(x0));
                for (let x = x0 + step; x < xEnd; x += step) g.lineTo(x, y - heightAt(x));
                g.lineTo(xEnd, y - heightAt(xEnd));
                for (let x = xEnd; x > x0; x -= step) g.lineTo(x, y - heightAt(x) + thick);
                g.lineTo(x0, y - heightAt(x0) + thick);
                g.closePath();
                g.fillPath();
            }

            // THE LINE, bumps and all.
            g.lineStyle(lineW, lineC, 1);
            g.beginPath();
            g.moveTo(x0, y - heightAt(x0));
            for (let x = x0 + step; x < xEnd; x += step) g.lineTo(x, y - heightAt(x));
            g.lineTo(xEnd, y - heightAt(xEnd));
            g.strokePath();

            // THE MARKS, every period across the lane, slid back by the offset.
            for (let base = x0 - period; base < xEnd + period; base += period) {
                for (const m of set.marks) {
                    const x = base + m.at * period - off;
                    if (x < x0 || x > xEnd) continue;
                    const yy = y - heightAt(x);
                    if (m.kind === 'dash') {
                        const len = (8 + 14 * m.size) * sc;
                        g.lineStyle(lineW, markC, 1);
                        g.lineBetween(x, yy, Math.min(x + len, xEnd), y - heightAt(Math.min(x + len, xEnd)));
                    } else {
                        g.fillStyle(markC, 1);
                        g.fillCircle(x, yy + (4 + 5 * m.drop) * sc, (1.2 + 1.6 * m.size) * sc);
                    }
                }
            }

            if (car && car.scene) this._suspend(car, heightAt, k, delta);
            // THE PIGGY IN THE WINDOW only while its slot holds a piggy; the
            // car itself carries on either way.
            if (car && car.face) {
                const slot = this.chargingSlots[i];
                car.face.setVisible(!!(slot && slot.batteryData));
            }
            if (vl && vl.scene) this._suspend(vl, heightAt, k, delta);
        });
    }

    // THE SUSPENSION, one step. Each tyre sits on the road straight under it;
    // each end of the body is a damped spring pulled toward its tyre's height.
    // The body then takes the two ends' average height and the tilt between
    // them. See CONFIG.SUSPENSION. (`k`, the tyres' share of full spin, is
    // unused now: the body no longer rocks with the road's speed.)
    _suspend(car, heightAt, k, delta) {
        const S  = CONFIG.SUSPENSION || {};
        const v  = (x, d) => (x !== undefined ? x : d);
        const sc = this.layoutConfig.platformScale;
        const s  = car.susp, ends = s.ends;
        if (!ends.length) return;
        const scale = car.scaleX || 1;
        const dt = Math.min(delta, 50) / 1000;
        const w  = v(S.STIFFNESS, 16), z = v(S.DAMPING, 0.35);
        const max = v(S.MAX, 9) * sc;

        car.tyres.forEach((ty, j) => {
            const hgt = heightAt(car.x + car.tyreDX[j] * scale);
            ty.y = car.tyreBaseY[j] - hgt / scale;
            const end = ends[j];
            // Two half-steps: steadier at a dropped frame.
            for (let n = 0; n < 2; n++) {
                const h = dt / 2;
                end.v += (w * w * (hgt - end.e) - 2 * z * w * end.v) * h;
                end.e += end.v * h;
            }
            if (end.e - hgt > max)  { end.e = hgt + max; end.v = Math.min(0, end.v); }
            if (hgt - end.e > max)  { end.e = hgt - max; end.v = Math.max(0, end.v); }
        });

        // THE LUNGE (_lunge): body and tyres pushed forward inside the car
        // by `car.lunge` px — the car's place on the road is untouched.
        const lx = (car.lunge || 0) / scale;
        car.bodyImg.x = car.bodyBaseX + lx;
        car.tyres.forEach((ty, j) => { ty.x = car.tyreDX[j] + lx; });

        // The body: halfway between its ends, tilted to the line between them.
        const r = ends[0], f = ends[ends.length - 1];
        const base = (car.tyreDX[ends.length - 1] - car.tyreDX[0]) * scale || 1;
        car.bodyImg.y = car.bodyBaseY - ((r.e + f.e) / 2) / scale;
        car.bodyImg.rotation = -Math.atan2(f.e - r.e, base);
        // A getaway car's driver rides with the body.
        if (car.face) {
            car.face.y = car.faceBaseY + (car.bodyImg.y - car.bodyBaseY);
            car.face.rotation = car.bodyImg.rotation;
        }
    }

    // THE LEAD FIGURES, placed every frame: each fixed over its lane's road —
    // centred on it, RACE.LEAD.ABOVE clear of the piggy car's roof height —
    // wherever the cars are. Up while the lane's race is on, and its green
    // margin once ahead until that fades.
    _placeLaneLabels() {
        if (!this.lanes || !this.carArea) return;
        const RL = (CONFIG.RACE || {}).LEAD || {}, CA = this.carArea;
        const sc = this.layoutConfig.platformScale;
        const above = (RL.ABOVE !== undefined ? RL.ABOVE : 40) * sc;
        this.platforms.forEach((p, i) => {
            const lane = this.lanes[i], car = this.cars[i], vl = this.villains[i], t = this.laneLabels[i];
            if (!t || !t.scene) return;
            // NOT BEFORE THE RIVAL HAS A LEAD: no "0" while the lane waits.
            // WON (the lead run out): gone once its pop-out has played
            // (_vanishLabel) — never a 0, nor the piggy's margin.
            const unstarted = !lane || (!lane.surged && !(lane.shown > 0));
            const won = lane && lane.caught && !(this.time.now < (t._vanishUntil || 0));
            if (unstarted || won || !car || !vl || !vl.visible) {
                t.setVisible(false);
                return;
            }
            const ground = p.slotY + p.slotSize / 2;
            t.setPosition(CA.x + CA.width / 2, ground - car.carH - above - t.height / 2).setVisible(true);
        });
    }

    _setLaneLabel(i) {
        const t = this.laneLabels[i], lane = this.lanes && this.lanes[i];
        if (!t || !t.scene || !lane) return;
        const LB = (CONFIG.VILLAIN || {}).LABEL || {};
        const suffix = LB.SUFFIX !== undefined ? LB.SUFFIX : ' m';
        // BLACK while the rival leads, GREEN with a + once the piggy is ahead
        // (_raceFinish / _raceStep) — display only, the lead itself is 0 by
        // then. See RACE.LEAD.
        const RL = (CONFIG.RACE || {}).LEAD || {};
        const ah = lane.ahead;
        // WON: no 0 — the last figure pops away instead.
        if (lane.caught || (lane.surged && lane.left <= 0)) { this._vanishLabel(i); return; }
        if (ah) {
            this._labelColor(t, RL.AHEAD_COLOR || '#2fb84f', RL.AHEAD_STROKE || '#ffffff');
            t.setText((RL.AHEAD_PREFIX !== undefined ? RL.AHEAD_PREFIX : '+') + this._bigNum(Math.floor(ah.v)) + suffix)
                .setVisible(!ah.gone);
            return;
        }
        this._labelColor(t, RL.BEHIND_COLOR || '#1c1c1c', RL.BEHIND_STROKE || '#ffffff');
        // The figure counts up from 0 while the rival pulls ahead (_raceStep),
        // then steps down by the piggy's value each tick (chargeCycle).
        const n = lane.shown !== undefined ? lane.shown : !lane.surged ? 0 : lane.left;
        t.setText(this._bigNum(Math.ceil(n)) + suffix).setVisible(!lane.caught || lane.closing);
    }

    // A label's colour and outline, set only when they change (a restyle
    // redraws the text).
    _labelColor(t, col, stroke) {
        if (t._col !== col) { t._col = col; t.setColor(col); }
        if (stroke && t._stroke !== stroke) {
            t._stroke = stroke;
            const LB = (CONFIG.VILLAIN || {}).LABEL || {};
            t.setStroke(stroke, Math.round((LB.STROKE_W !== undefined ? LB.STROKE_W : 5) * this.layoutConfig.platformScale));
        }
    }

    // WON: lane i's lead has been run down. The count runs its last stretch
    // to 0 — the noses meeting as it gets there — and the finish begins
    // (_raceStep -> _raceFinish). The level's last win turns the level once
    // every lane's finish has played out (_turnWhenDone).
    _winLane(i) {
        const lane = this.lanes[i];
        if (lane.caught) return;
        lane.caught = true;
        lane.left = 0;
        lane.finishing = true;
        // The level's last win (lane.final) is picked when its finish starts
        // (_raceFinish), so it is the last to cross.
        if (this.lanes.every((l) => l.caught)) this._levelTurning = true;
        lane.closing = true;   // the car's glide reaching 0 starts the finish (_raceStep)
    }

    // THE NEXT LEVEL: its rival, three times, and fresh leads.
    _nextLevel() {
        this.level += 1;
        this.assets.prefetchRivals(this.level);
        this.assets.prefetchCars(this.level);
        this.lanes = this._levelLanes(this.level);
        this._buildVillains(true);
        this._levelTurning = false;
        this._raceIntro();
    }

    // ================================================================
    // THE GETAWAY CARS — see CONFIG.VILLAIN.CAR
    // ================================================================
    // THIS LEVEL'S GETAWAY CAR DESIGN from VILLAIN.CAR.CARS — a new one each
    // level, looping once all are used — with the texture keys it loaded under; null if there are
    // none (or its art is missing), and the piggy car's art stands in.
    _getawaySpec() {
        const cars = ((CONFIG.VILLAIN || {}).CAR || {}).CARS || [];
        if (!cars.length) return null;
        const n = (Math.max(1, Math.floor(this.level)) - 1) % cars.length + 1;
        const spec = Object.assign({}, cars[n - 1], { bodyKey: getawayBodyKey(n), tyreKey: getawayTyreKey(n) });
        return this.textures.exists(spec.bodyKey) && this.textures.exists(spec.tyreKey) ? spec : null;
    }

    // A RIVAL CAR'S HEIGHT, ground to roof, at pixel scale k — but never
    // lower than MIN_H of the piggy car's at that scale. The car arts are
    // all about as wide, so a low design would otherwise come out small;
    // raised to MIN_H, it comes out long instead.
    _rivalCarH(spec, k) {
        const K = (CONFIG.VILLAIN || {}).CAR || {};
        const min = K.MIN_H !== undefined ? K.MIN_H : 0.9;
        return Math.max(this._carGround(spec), min * this._carGround()) * k;
    }

    // LANE i's RIVAL CAR: the level's design, the rival's head in the
    // driver's window — standing on the road at `ground`, behind the piggy
    // car. Its x is set by the race (_raceSetup).
    _makeGetawayCar(i, ground, key) {
        const K = (CONFIG.VILLAIN || {}).CAR || {};
        const v = (x, d) => (x !== undefined ? x : d);
        const car = this.cars[i], p = this.platforms[i];
        // THE LEVEL'S CAR DESIGN (CARS, a new one each level), or the
        // piggy car's own art if none is loaded.
        const spec = this._getawaySpec();
        const C  = spec || CONFIG.CAR || {}, F = (spec && spec.FACE) || K.FACE || {};
        const bw = v(C.BODY_W, 254), gy = this._carGround(C);
        // AT THE PIGGY CAR'S PIXEL SCALE — the two arts drawn alike, so a
        // lower, longer car comes out lower and longer, not stretched to match.
        const k  = (car ? car.scaleX : p.slotSize / gy) * v(K.SCALE, 1);
        const en = this._makeCar(0, ground, this._rivalCarH(C, k), C).setDepth(v(K.DEPTH, 3.9));
        if (K.TINT) en.bodyImg.setTint(hexColor(K.TINT));

        // THE DRIVER: the rival's head in the window.
        if (this.textures.exists(key)) {
            // Anchored at its BOTTOM CENTRE, on the window's sill — so it pops
            // up from the sill when it peeks (_peekFaces), and sinks back to
            // it. Its shortest side is the face, H; ears / horns grow past.
            const face = this.add.image(-bw / 2 + v(F.X, 126), -gy + v(F.S, v(F.Y, 28) + v(F.H, 40) / 2), key);
            this._seatHead(face, F);
            face.baseScale = face.scaleX;
            en.addAt(face, 1);
            en.face = face;
            en.faceH = v(F.H, 40);
            en.faceBaseY = face.y;
            // THE PEEK (_peekFaces): 1 fully up, 0 out of sight; ducked, its
            // next look at the first milestone the lane has not yet passed.
            en.peek = { v: 0, want: 0, t: 0, up: false, mi: this._nextMilestone(i) };
        }
        return en;
    }

    // A DRIVER'S HEAD, placed at the window's bottom edge (its y on entry):
    // sized from FACE.H x HEAD.SCALE by its shortest side, and sunk behind
    // the door — its bottom CROP below the edge, cut off. Origin stays the
    // full picture's bottom centre, so the peek's squash still works.
    _seatHead(face, F) {
        const Hd = ((CONFIG.VILLAIN || {}).CAR || {}).HEAD || {}, v = (x, d) => (x !== undefined ? x : d);
        const fw = face.frame.realWidth, fh = face.frame.realHeight;
        const s = v(F.H, 40) * v(Hd.SCALE, 1) / Math.min(fw, fh), cut = v(Hd.CROP, 0);
        face.setOrigin(0.5, 1).setScale(s);
        if (cut > 0) face.setCrop(0, 0, fw, fh * (1 - cut));
        face.y += fh * s * cut;
    }

    // Lane i's share of its distance covered, 0..1.
    _laneDone(i) {
        const lane = this.lanes && this.lanes[i];
        return lane && lane.total > 0 ? 1 - lane.left / lane.total : 0;
    }

    // The index of the first look-back milestone (PEEK.AT) lane i has not
    // reached yet.
    _nextMilestone(i) {
        const M = (((CONFIG.VILLAIN || {}).CAR || {}).PEEK || {}).AT || [];
        const done = this._laneDone(i);
        let mi = 0;
        while (mi < M.length && M[mi] <= done) mi++;
        return mi;
    }

    // THE VILLAINS LOOK BACK: each getaway car's driver stays down out of
    // sight — just the window — and pops up from the sill to glance back
    // only as the piggy car reaches a milestone (PEEK.AT: a share of the
    // distance covered), then ducks again. Several passed in one go are one
    // look. Caught, it stays up. See VILLAIN.CAR.PEEK.
    _peekFaces(delta) {
        const P = ((CONFIG.VILLAIN || {}).CAR || {}).PEEK || {}, v = (x, d) => (x !== undefined ? x : d);
        const dt = Math.min(delta, 50) / 1000, S = P.SHOW || [0.8, 1.6];
        this.villains.forEach((en, i) => {
            if (!en || !en.face || !en.peek || !en.scene) return;
            const pk = en.peek, lane = this.lanes && this.lanes[i];
            const M = P.AT || [];
            if (P.ENABLED === false || (lane && lane.caught)) pk.want = 1;
            else if (pk.up) {
                if ((pk.t -= dt) <= 0) { pk.up = false; pk.want = 0; }
            } else if (pk.mi < M.length && this._laneDone(i) >= M[pk.mi]) {
                pk.up = true; pk.want = 1;
                pk.t = Phaser.Math.FloatBetween(S[0], S[1]);
                pk.mi = this._nextMilestone(i);
            }
            // 0 ms is instant: the head simply appears / is gone.
            const ms = pk.want > pk.v ? v(P.UP_MS, 160) : v(P.DOWN_MS, 0);
            const step = ms > 0 ? dt * 1000 / ms : 1;
            pk.v = pk.want > pk.v ? Math.min(pk.want, pk.v + step) : Math.max(pk.want, pk.v - step);
            // Up with a little overshoot, down straight.
            // (Back-out by hand: Phaser.Math.Easing is not in the custom build.)
            const b = 1.70158, u = pk.v - 1;
            const e = pk.want ? 1 + u * u * ((b + 1) * u + b) : pk.v;
            en.face.setScale(en.face.baseScale, en.face.baseScale * Math.max(0, e));
        });
    }

    // DUST at a car's tyres, drifting back: `n` puffs, at the rear tyre
    // (side 0) or both (side -1).
    _dust(en, side, n) {
        const sc = this.layoutConfig.platformScale;
        const col = hexColor((CONFIG.CAR || {}).DUST || '#d9c3a0');
        const at = side === 0 ? [en.tyreDX[0]] : en.tyreDX;
        for (let k = 0; k < n; k++) {
            const tx = en.x + at[k % at.length] * en.scaleX;
            // A graphics, not this.add.circle: shapes are not in the custom build.
            const c = this._onRoad(this.add.graphics({ x: tx + Phaser.Math.Between(-6, 6) * sc,
                                          y: en.y - Phaser.Math.Between(0, 6) * sc })
                .fillStyle(col, 0.9).fillCircle(0, 0, Phaser.Math.Between(4, 8) * sc).setDepth(4.05));
            this.tweens.add({ targets: c, x: c.x - Phaser.Math.Between(10, 32) * sc,
                y: c.y - Phaser.Math.Between(6, 18) * sc, scale: 2.4, alpha: 0,
                duration: Phaser.Math.Between(420, 620), ease: 'Cubic.easeOut', onComplete: () => c.destroy() });
        }
    }

    // ================================================================
    // THE RACE — see CONFIG.RACE
    // ================================================================
    // EACH LANE IS A LITTLE WORLD seen through a camera of its own. The two
    // cars have places along the road (world px) and speeds; the finish line
    // has a place on the road and never moves by itself; the CAMERA is one
    // number — how far down the road the lane's view has travelled — and
    // everything in the lane is drawn at its world x less that. The road's
    // scroll is the camera. The tyres turn as fast as their car goes.
    //
    //   WAITING     the rival has dropped in, lined up with the piggy car:
    //               nothing moves until the lane has a piggy.
    //   HEAD START  the rival gets up to racing pace (the road's speed, V)
    //               quickly and KEEPS it; the piggy car gets there more
    //               slowly, so the gap opens — to exactly the lead. The camera
    //               rides with the piggy car: the road and its tyres speed up
    //               with it, and the rival settles ahead because the piggy
    //               car has caught up to its speed, not because it braked.
    //   RACING      the rival holds V and the camera rides with it — it holds
    //               its place on screen. The piggy car stands behind it by the
    //               lead (as shown, counting down smoothly), so it visibly
    //               closes; with no piggy the lead holds, and so does it.
    //   FINISH      from the noses meeting (the count reaching 0). The camera
    //               hands over to the piggy car, smoothly. The line is on the
    //               road ahead; the car keeps its speed till it is wholly
    //               across, then rolls on and brakes to its spot; the rival
    //               keeps V till its nose is over, then brakes to rest behind
    //               it. By then the camera has carried the line out of the
    //               frame. Where the cars end up is _raceGeom's.
    // One state per lane, this.race[i], rebuilt with the cars; the lane's own
    // record (lane.left, surged, caught, …) is what a rebuild works from.

    // The road's speed on screen, px/s — the racing pace, V.
    _raceV() {
        return Math.max(1, ((CONFIG.ROAD || {}).SPEED || 420) * this.layoutConfig.platformScale);
    }

    // THE RATE THE PIGGY CAR GLIDES AT, in lead units per second: its piggy's
    // value, held so the car never goes faster than RACE.MAX_SPEED x V — an
    // overpowered piggy otherwise outruns the camera (see RACE.MAX_SPEED).
    _raceRate(i, m) {
        const lane = this.lanes[i], V = this._raceV();
        const cap = (Math.max(1, (CONFIG.RACE || {}).MAX_SPEED || 2.5) - 1) * V
                  * Math.max(1, lane.total) / Math.max(1, m.meet - m.home);
        return Math.min(lane.overRate || 0, cap);
    }

    // LANE i's YARDSTICKS, on screen: the piggy car's start (its home), where
    // the rival holds while racing (RIVAL_AT of the car area), and where the
    // piggy car is when the noses meet.
    _raceMarks(i) {
        const R = CONFIG.RACE || {}, CA = this.carArea, car = this.cars[i], en = this.villains[i];
        const W = car.carW, eW = en.carW, home = car.homeX;
        const at = R.RIVAL_AT !== undefined ? R.RIVAL_AT : 0.62;
        const rivalAt = Math.max(home + (W + eW) / 2 + 0.2 * W, CA.x + CA.width * at);
        // AS THE LEAD RUNS OUT the rival's place eases back to RIVAL_END —
        // the camera sliding ahead — so the overtake has the road in front.
        const end = R.RIVAL_END !== undefined ? R.RIVAL_END : at;
        const back = Math.max(0, rivalAt - Math.max(home + 0.5 * W, CA.x + CA.width * end));
        return { home, rivalAt, meet: rivalAt + (eW - W) / 2, back, W, eW };
    }

    // How far the camera has slid ahead with `units` of lead left: none with
    // the whole lead, all of m.back at none — eased at both ends, so it sets
    // off and arrives (the noses meeting) at the road's own speed.
    _raceSlide(i, m, units) {
        const lane = this.lanes[i];
        const f = lane.total > 0 ? 1 - Math.max(0, Math.min(1, units / lane.total)) : 1;
        return (m.back || 0) * f * f * (3 - 2 * f);
    }

    // Where the piggy car stands on screen while racing, with `units` of lead
    // left: home with the whole lead, level with the rival at none.
    _raceCarAt(i, m, units) {
        const lane = this.lanes[i];
        const f = lane.total > 0 ? Math.max(0, Math.min(1, units / lane.total)) : 0;
        return m.home + (m.meet - m.home) * (1 - f);
    }

    // LANE i's RACE, set up from its record — a new level, or a rebuild — and
    // the cars put where that record says. `enter`: a new level, the piggy
    // car rolling back to its home (it is left to that roll meanwhile).
    _raceSetup(i, enter) {
        const lane = this.lanes[i], car = this.cars[i], en = this.villains[i];
        if (!lane || !car || !en) return;
        // NO PUSH CARRIED OVER: a finish that drives off (no braking) never
        // folds the last lunge in, and it would show all next race.
        car.lunge = 0;
        const m = this._raceMarks(i), V = this._raceV();
        // NOSE TO NOSE at the start: a longer rival's extra length lies behind.
        const rc = this.race[i] = { cam: 0, pw: m.home, rw: m.home + (m.W - m.eW) / 2, vp: 0, vr: 0,
                                    phase: 'wait', entering: !!enter, m };
        if (lane.caught) {
            const g = this._raceGeom(i);
            rc.phase = 'done';
            if (g) { rc.pw = g.carStop; rc.rw = g.enemyStop; }
        } else if (lane.surged) {
            rc.phase = 'race';
            const units = lane.track !== undefined ? lane.track : lane.left;
            const sl = this._raceSlide(i, m, units);
            rc.rw = m.rivalAt - sl;
            rc.pw = this._raceCarAt(i, m, units) - sl;
            rc.vp = rc.vr = V;
        }
        if (!enter) car.x = rc.pw;
        en.x = rc.rw;
        this.roadOffsets[i] = this.roadOffsets[i] || 0;
        rc.road0 = this.roadOffsets[i];   // the road's scroll = road0 + the camera
    }

    // WHERE LANE i's RACE ENDS, on screen: the winner's stop (as far right as
    // the screen allows) and the rival's stop behind it. (The line ends off
    // the road's frame, behind them both: _raceFinish.) Null with no cars.
    _raceGeom(i) {
        const R = CONFIG.RACE || {}, v = (x, d) => (x !== undefined ? x : d);
        const car = this.cars[i], en = this.villains[i], CA = this.carArea;
        if (!car || !en || !CA) return null;
        const sc = this.layoutConfig.platformScale;
        const W = car.carW, eW = en.carW;
        const right = CA.x + CA.width - v(R.EDGE_PAD, 6) * sc;
        // NO TWO LANES END ALIKE (RACE.VARY): each level deals the three lanes
        // a different stopping depth — one at the front, one mid, one back —
        // plus a little jitter, and its own spacing to the rival. Hashed from
        // lane and level, so a rebuild puts everything back where it was.
        const VR = R.VARY || {};
        const h = (salt) => this._cellHash(i + 1, Math.max(1, this.level), salt);
        const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
        const rank = perms[Math.floor(this._cellHash(0, Math.max(1, this.level), 41) * 6) % 6][i] || 0;
        const back = (rank / 2 + (h(42) - 0.5) * v(VR.JITTER, 0.16)) * v(VR.CAR_BACK, 0.45) * W;
        const carStop = Math.max(right - W / 2 - Math.max(0, back), this._raceMarks(i).meet + 0.3 * W);
        // The rival's nose is OVERLAP of its length inside the winner's tail
        // (below 0: a gap behind it instead) — anywhere in the range, but
        // never so far back that its tail leaves the road's frame.
        const OVR = VR.OVERLAP || [0.3, 0.3];
        const ovRoom = (CA.x + v(R.EDGE_PAD, 6) * sc + eW - (carStop - W / 2)) / eW;
        const ovLo = Math.min(OVR[1], Math.max(OVR[0], ovRoom));
        const ov = ovLo + (OVR[1] - ovLo) * h(43);
        return { carStop, enemyStop: carStop - W / 2 + ov * eW - eW / 2, ov };
    }

    // Every finish line, badge and zoom gone.
    _clearRace() {
        const kill = (o) => {
            if (!o || !o.scene) return;
            this.tweens.killTweensOf(o);
            if (o.flag) this.tweens.killTweensOf(o.flag);
            o.destroy();
        };
        this.finishLines.forEach(kill);
        this.raceBadges.forEach((pair) => (pair || []).forEach(kill));
        (this.podiums || []).forEach(kill);
        this.finishLines = []; this.raceBadges = []; this.podiums = [];
        // The piggy cars that drove off come back.
        (this.cars || []).forEach((c) => { if (c && c.scene) c.setVisible(true); });
        this._clearZooms();
    }

    // THE START of a level: each rival drops in from above onto the road,
    // lined up with the piggy car, and settles on its springs. Nothing
    // drives yet; a lane starts the moment it has a piggy (_raceStep).
    _raceIntro() {
        const R = CONFIG.RACE || {}, D = R.DROP || {}, v = (x, d) => (x !== undefined ? x : d);
        if (!this.lanes) return;
        const stag = v(D.STAGGER_MS, 110), ms = v(D.MS, 380);
        let end = -1, k = 0;
        this.lanes.forEach((lane, i) => {
            if (lane.dropped || lane.surged) return;
            const en = this.villains[i];
            if (!en || !en.scene) { lane.dropped = true; return; }
            const delay = k++ * stag;
            this._dropRival(i, delay);
            end = Math.max(end, delay + ms);
        });
        if (end < 0) return;
        // No racing until the rivals have settled AND the VS card has gone.
        this._briefing = true;
        let wait = 2;
        const ready = () => { if (--wait === 0) this._briefing = false; };
        this.time.delayedCall(end + v(D.SETTLE_MS, 200), ready);
        this._showVersus(ready);
    }

    // THE VS CARD at a level's start (VERSUS): over the race area only, the
    // merge grid carrying on — split by a slant, the player's piggy and rank
    // on the left, the level's rival (head, name, rank) on the right. The sides slide in, VS
    // punches in, it holds, then goes. `done` runs as it goes; a tap skips.
    _showVersus(done) {
        const X = CONFIG.VERSUS || {}, K = CONFIG.RANK || {}, v = (x, d) => (x !== undefined ? x : d);
        const CA = this.carArea, sc = this.layoutConfig.platformScale;
        // NOT ON LEVEL 1: the start tutorial has the screen then.
        if (X.ENABLED === false || !CA || this.level <= 1) { done(); return; }
        const font = (px, color) => ({ fontSize: Math.max(9, Math.round(px * sc)) + 'px',
            fontFamily: CONFIG.FONT_FAMILY, fontStyle: CONFIG.FONT_WEIGHT, color });
        const ink = K.INK || '#2b2013';
        const W = Math.min(CA.width * 0.86, v(X.W, 440) * sc), H = Math.min(CA.height * 0.86, v(X.H, 210) * sc);
        const pad = 12 * sc, rad = 16 * sc;
        const panel = this.add.container(CA.x + CA.width / 2, CA.y + CA.height / 2).setDepth(v(X.DEPTH, 40));

        // THE CARD, SPLIT BY A SLANT: the player's colour left of it, the
        // rival's right — the slant leaning SLANT of the height each way
        // from the centre, top to the right. Each half is the rounded card
        // cut along the slant (no masks in this build).
        const kx = v(X.SLANT, 0.12) * H;
        const slantX = (y) => -2 * kx * y / H;
        const card = [];
        [[W / 2 - rad, -H / 2 + rad, -90], [W / 2 - rad, H / 2 - rad, 0],
         [-W / 2 + rad, H / 2 - rad, 90], [-W / 2 + rad, -H / 2 + rad, 180]].forEach(([cx, cy, a0]) => {
            for (let n = 0; n <= 6; n++) {
                const a = (a0 + n * 15) * Math.PI / 180;
                card.push({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });
            }
        });
        // One side of the slant (sgn -1 left, 1 right) of a polygon.
        const cut = (pts, sgn) => {
            const f = (p) => sgn * (p.x - slantX(p.y)), out = [];
            pts.forEach((p, n) => {
                const q = pts[(n + 1) % pts.length], fp = f(p), fq = f(q);
                if (fp >= 0) out.push(p);
                if ((fp >= 0) !== (fq >= 0)) {
                    const t = fp / (fp - fq);
                    out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
                }
            });
            return out;
        };
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.22).fillRoundedRect(-W / 2 + 4 * sc, -H / 2 + 6 * sc, W, H, rad);
        bg.fillStyle(hexColor(X.YOU_FILL || '#ffd23f'), 1).fillPoints(cut(card, -1), true);
        bg.fillStyle(hexColor(X.RIVAL_FILL || '#f26b5b'), 1).fillPoints(cut(card, 1), true);
        bg.lineStyle(Math.max(3, 6 * sc), hexColor(ink), 1).lineBetween(kx, -H / 2, -kx, H / 2);
        bg.lineStyle(Math.max(1, 2 * sc), 0xffffff, 1).lineBetween(kx, -H / 2, -kx, H / 2);
        bg.lineStyle(Math.max(2, 3 * sc), hexColor(ink), 1).strokeRoundedRect(-W / 2, -H / 2, W, H, rad);
        panel.add(bg);

        // ONE SIDE: the racer in its car, as on the road (_versusCar), the
        // name under it, and the rank in a pill — the player's now, the
        // rival's the one a win takes.
        const tw = W / 2 - pad - kx, th = H - pad * 2, top = -H / 2 + pad;
        const ranked = K.ENABLED !== false;
        const side = (x, rival, name, rank) => {
            const c = this.add.container(x, 0);
            const im = this._versusCar(rival, tw * v(X.CAR_W, 0.92), th * (ranked ? 0.5 : 0.58));
            im.y = top + th * (ranked ? 0.55 : 0.62);
            c.add(im);
            c.fig = im;
            const fit = (t) => { if (t.width > tw * 0.92) t.setScale(tw * 0.92 / t.width); return t; };
            c.add(fit(this.add.text(0, top + th * (ranked ? 0.67 : 0.78), name, font(20, ink)).setOrigin(0.5)));
            if (ranked) {
                const rt = fit(this.add.text(0, top + th * 0.86, '#' + this._bigNum(rank),
                    font(v(X.RANK_SIZE, 26), X.RANK_COLOR || '#ffffff')).setOrigin(0.5));
                const pw = rt.displayWidth + 28 * sc, ph = rt.displayHeight + 6 * sc;
                const pill = this.add.graphics().fillStyle(hexColor(X.RANK_FILL || ink), 1)
                    .fillRoundedRect(-pw / 2, rt.y - ph / 2, pw, ph, ph / 2);
                c.add([pill, rt]);
            }
            return c;
        };
        const rivalR = this._rankAfter(this.level);
        const sx = W / 4 + kx / 2;
        const left  = side(-sx, false, X.YOU || 'YOU', this._rankAfter(this.level - 1));
        const right = side(sx, true, this._racerName(rivalR), rivalR);
        const vs = this.add.text(0, 0, X.VS_TEXT || 'VS', Object.assign(font(46, X.VS_COLOR || '#ffffff'),
            { stroke: ink, strokeThickness: Math.max(3, Math.round(6 * sc)) })).setOrigin(0.5);
        panel.add([left, right, vs]);

        // THE TIMELINE: pop in, sides slide in, VS punches in, hold, go.
        const popMs = v(X.POP_MS, 200), holdMs = v(X.HOLD_MS, 1200), outMs = v(X.OUT_MS, 220);
        panel.setScale(0.9).setAlpha(0);
        this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: popMs, ease: 'Back.easeOut' });
        [[left, -1], [right, 1]].forEach(([c, d]) => {
            const x = c.x;
            c.x += d * W * 0.25; c.setAlpha(0);
            this.tweens.add({ targets: c, x, alpha: 1, delay: popMs * 0.5, duration: 260, ease: 'Cubic.easeOut' });
        });
        vs.setScale(2.4).setAlpha(0);
        this.tweens.add({ targets: vs, scale: 1, alpha: 1, delay: popMs + 220, duration: 220, ease: 'Back.easeOut' });
        // THE RIVAL PULSES (PULSE) from its feet, once it has slid in, till the card goes.
        const pulse = right.fig && v(X.PULSE, 1.08) !== 1 ? this.tweens.add({ targets: right.fig,
            scale: right.fig.scale * v(X.PULSE, 1.08), delay: popMs * 0.5 + 260, duration: v(X.PULSE_MS, 380),
            ease: 'Sine.easeInOut', yoyo: true, repeat: -1 }) : null;
        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            timer.remove(false);
            if (pulse) pulse.stop();
            done();
            this.tweens.add({ targets: panel, alpha: 0, y: panel.y - 16 * sc, duration: outMs, ease: 'Cubic.easeIn',
                onComplete: () => panel.destroy() });
        };
        const timer = this.time.delayedCall(popMs + 440 + holdMs, close);
        const hit = this.add.rectangle(0, 0, W, H, 0x000000, 0).setInteractive();
        hit.on('pointerdown', close);
        panel.add(hit);
    }

    // A RACER IN ITS CAR for the VS card: the piggy car with the piggy's
    // head in the window, or this level's rival car with the rival's, facing
    // left (nose to nose). At most maxW wide, maxH tall, standing on its
    // origin. Wrapped, so the card's pulse can scale it without the flip.
    _versusCar(rival, maxW, maxH) {
        const K = (CONFIG.VILLAIN || {}).CAR || {}, v = (x, d) => (x !== undefined ? x : d);
        const spec = rival ? this._getawaySpec() : null;
        const C = spec || CONFIG.CAR || {}, F = (spec && spec.FACE) || K.FACE || {};
        const bw = v(C.BODY_W, 254), gy = this._carGround(C);
        const car = this._makeCar(0, 0, Math.min(maxH, maxW * gy / bw), spec);
        car.onRoad = false;
        car.setDepth(0);
        const key = rival ? villainKey(villainIndexFor(this.level)) : 'podium_piggy';
        if (this.textures.exists(key)) {
            const face = this.add.image(-bw / 2 + v(F.X, 126), -gy + v(F.S, v(F.Y, 28) + v(F.H, 40) / 2), key);
            this._seatHead(face, F);
            car.addAt(face, 1);
        }
        if (rival) car.scaleX = -car.scaleX;
        return this.add.container(0, 0, [car]);
    }

    // LANE i's RIVAL FALLS onto its road: from HEIGHT of a lane's band above
    // it — kept low so it never shows over the lane above — fading in over
    // the first FADE_IN of the fall, speeding up as it falls; the springs take
    // the landing and dust flies.
    _dropRival(i, delay) {
        const R = CONFIG.RACE || {}, D = R.DROP || {}, v = (x, d) => (x !== undefined ? x : d);
        const lane = this.lanes[i], en = this.villains[i], p = this.platforms[i];
        const sc = this.layoutConfig.platformScale;
        const ground = p.slotY + p.slotSize / 2;
        en.setVisible(true).setAlpha(0);
        en.y = ground - this.layoutConfig.slotBandH * v(D.HEIGHT, 0.5);
        this.tweens.add({ targets: en, alpha: 1, delay, duration: v(D.MS, 380) * v(D.FADE_IN, 0.45) });
        this.tweens.add({ targets: en, y: ground, delay, duration: v(D.MS, 380), ease: 'Quad.easeIn',
            onComplete: () => {
                lane.dropped = true;
                for (const e of en.susp.ends) e.v -= v(D.KICK, 160) * sc;
                this._dust(en, -1, v(D.DUST, 6));
            } });
    }

    // LANE i's HEAD START — its piggy has gone in. Both set off after
    // LEAD_DELAY_MS: the rival reaches V in LEAD_RIVAL_MS and keeps it; the
    // piggy car reaches V just late enough that the gap has opened to the
    // whole lead when it gets there (each a steady pick-up: V t² / 2T, then
    // V). The figure counts up with the gap; wind streams off the rival.
    _raceStartLead(i) {
        const R = CONFIG.RACE || {}, v = (x, d) => (x !== undefined ? x : d);
        const lane = this.lanes[i], rc = this.race[i], en = this.villains[i], m = rc.m;
        lane.leading = true;
        rc.phase = 'lead';
        rc.t = 0;
        rc.delay = v(R.LEAD_DELAY_MS, 300) / 1000;
        rc.pw0 = rc.pw; rc.rw0 = rc.rw;
        // The gap opens from the start's (noses level) to the race's.
        rc.gap0 = rc.rw0 - rc.pw0;
        rc.TR = Math.max(0.05, v(R.LEAD_RIVAL_MS, 350) / 1000);
        rc.TP = rc.TR + 2 * Math.max(1, m.rivalAt - m.home - rc.gap0) / this._raceV();
        lane.shown = 0;
        this._setLaneLabel(i);
        en.wind = 0;
        this.tweens.add({ targets: en, wind: 1, delay: rc.delay * 1000, duration: 150,
            onStart: () => this._dust(en, -1, 4) });
    }

    // The head start is over: the race is on.
    _raceLeadDone(i) {
        const R = CONFIG.RACE || {}, lane = this.lanes[i], en = this.villains[i];
        lane.surged = true;
        lane.leading = false;
        lane.shown = undefined;
        lane.track = lane.left;   // the car's glide starts from the whole lead
        this.race[i].phase = 'race';
        this._setLaneLabel(i);
        this.tweens.add({ targets: en, wind: 0, duration: ((R.WIND || {}).FADE_MS) || 350 });
    }

    // A CAR'S RUN-IN TO THE LINE, from speed v0 gathering speed as the
    // finish does (FINISH_ACCEL, up to MAX_SPEED × V): 'time' the seconds to
    // cover distance x, 'dist' the distance covered in x seconds.
    _finishRun(x, v0, want) {
        const R = CONFIG.RACE || {}, V = this._raceV();
        const a = (R.FINISH_ACCEL !== undefined ? R.FINISH_ACCEL : 100) * this.layoutConfig.platformScale;
        v0 = Math.max(1, v0);
        const vmax = Math.max(v0, (R.MAX_SPEED !== undefined ? R.MAX_SPEED : 2.5) * V);
        const tc = a > 0 ? (vmax - v0) / a : 0, dc = v0 * tc + a * tc * tc / 2;
        if (want === 'dist') return x <= tc ? v0 * x + a * x * x / 2 : dc + vmax * (x - tc);
        if (x <= 0) return 0;
        return x <= dc ? (-v0 + Math.sqrt(v0 * v0 + 2 * a * x)) / a : tc + (x - dc) / vmax;
    }

    // THE FINISH, from the noses meeting. The figure turns green (the margin,
    // counting up at the piggy's rate till the nose is on the line); the line
    // goes on the road ahead — far enough that the car, at its speed, gets
    // there in a picked AHEAD_MS — and the end is planned from _raceGeom: the
    // car brakes from wholly across the line to its spot, the rival brakes
    // from V to rest behind it, and the camera ends where the end picture
    // has them both — far enough on that the line has left the frame. The
    // level's last win gets the lunge, zoom and confetti.
    _raceFinish(i) {
        const R = CONFIG.RACE || {}, v = (x, d) => (x !== undefined ? x : d);
        const lane = this.lanes[i], car = this.cars[i], en = this.villains[i], rc = this.race[i];
        const g = this._raceGeom(i), CA = this.carArea, sc = this.layoutConfig.platformScale;
        if (!rc || !g || !car || !car.scene || !en || !en.scene) {
            this.animateCoinReward(CA.x + CA.width / 2, this.platforms[i].slotY, lane.payout);
            lane.finishing = false;
            this._turnWhenDone();
            return;
        }
        const m = rc.m, W = m.W;
        lane.ahead = { v: lane.over || 0, rate: lane.overRate || 0, frozen: false, gone: false };
        this._setLaneLabel(i);

        const pick = (x, d) => (Array.isArray(x) ? x[0] + (x[1] - x[0]) * Math.random() : v(x, d));
        const LG = R.LUNGE || {};
        // THE FINAL: the last lane to start its finish, every lane won.
        lane.final = this.lanes.every((l) => l.caught && !l.closing);
        const final = lane.final;
        const surge = final && LG.ENABLED !== false ? pick(LG.SURGE, 0.06) * W : 0;
        car.lunge = 0;

        const line = this._makeFinishLine(i, 0);
        line.final = final;
        this.finishLines[i] = line;
        // THE LINE ON THE ROAD: AHEAD_MS of the car's speed past its nose —
        // and never so close that it would appear in view rather than come in.
        const vp0 = Math.max(rc.vp, this._raceV());
        // The final's line: always the far end of AHEAD_MS, and further if
        // need be, so it crosses FINAL_MARGIN_MS after every other lane.
        const aheadMs = final && Array.isArray(R.AHEAD_MS) ? R.AHEAD_MS[1] : pick(R.AHEAD_MS, 1500);
        let flagW = rc.pw + W / 2 + vp0 * aheadMs / 1000;
        if (final) {
            let last = 0;
            this.race.forEach((o, j) => {
                const of = o && o.phase === 'finish' && o.fin;
                if (j === i || !of || of.won) return;
                const d = of.flagW - (o.pw + o.m.W / 2 + (this.cars[j].lunge || 0));
                last = Math.max(last, this._finishRun(d, o.vp, 'time'));
            });
            if (last > 0) flagW = Math.max(flagW, rc.pw + W / 2 +
                this._finishRun(last + v(R.FINAL_MARGIN_MS, 300) / 1000, vp0, 'dist'));
        }
        flagW = Math.max(flagW, rc.cam + CA.x + CA.width + line.flagW + line.postW * 2);
        // ON THE FLAT: past the last of the terrain (_terrainSettle).
        flagW = Math.max(flagW, this._terrainSettle(i, rc) + line.postW + 20 * sc);
        // THE END: past the line the cars roll on till it has left the road's
        // frame — the camera, following, carries it out past the left edge
        // (LINE.OFF_PAD beyond it) — and stop where the end picture has them.
        // The car brakes from wholly across the line; it keeps the lunge's
        // push, so it aims that much short.
        const across = flagW + line.postW / 2 + W / 2;
        const lineEnd = CA.x - line.postW / 2 - v((R.LINE || {}).OFF_PAD, 8) * sc;
        let pS = flagW + (g.carStop - lineEnd) - surge;
        if (pS < across + 0.2 * W) pS = across + 0.2 * W;
        const camEnd = pS + surge - g.carStop;
        rc.fin = {
            line, flagW, across, pS, camEnd,
            rS: camEnd + g.enemyStop,
            // The car's place on screen: where it met the rival, drifting on
            // a little as its speed over the rival's fades (u0, over DRIFT_S),
            // then — once it brakes — easing over to where it ends.
            P0: rc.pw - rc.cam, u0: Math.max(0, rc.vp - rc.vr), t: 0, Pend: g.carStop - surge,
            braking: false, rBraking: false,
            surge, final, won: false, lunged: false, zoomed: false,
        };
        rc.phase = 'finish';
    }

    // THE FINISH IS OVER: everything at rest. The lunge's push folds into the
    // car's place (nothing moves on screen), the badges go up, and the lane is
    // done.
    _raceFinishDone(i) {
        const lane = this.lanes[i], rc = this.race[i], car = this.cars[i];
        rc.phase = 'done';
        rc.pw += car.lunge || 0;
        car.lunge = 0;
        car.x = rc.pw - rc.cam;
        // NO 1ST / 2ND BADGES: the close says it. The cars sit a moment, then
        // drive off (the 'leave' step in _raceStep), then the banner.
        const C = (CONFIG.RACE || {}).CLOSE || {};
        if (C.ENABLED === false) { lane.finishing = false; this._turnWhenDone(); return; }
        this.time.delayedCall(C.SETTLE_MS !== undefined ? C.SETTLE_MS : 350, () => {
            if (this.race[i] !== rc || rc.phase !== 'done') return;
            rc.phase = 'leave';
            rc.leaveT = 0;
        });
    }

    // THE CARS ARE GONE from lane i: the dim and the banner (RACE.CLOSE),
    // then the lane is done. `rivalOn`: the rival still to come — left
    // showing, to drive past under the banner. It stays till the next level (_clearRace).
    // No `pop`: put straight there (a rebuild).
    _raceClose(i, pop, rivalOn) {
        const C = (CONFIG.RACE || {}).CLOSE || {}, v = (x, d) => (x !== undefined ? x : d);
        const L = this.layoutConfig, B = L.partB, CA = this.carArea;
        const lane = this.lanes[i];
        const done = () => { if (pop) { lane.finishing = false; this._turnWhenDone(); } };
        [this.cars[i], rivalOn ? null : this.villains[i], ...(this.raceBadges[i] || [])]
            .forEach((o) => { if (o && o.scene) o.setVisible(false); });
        if (!B || !CA) { done(); return; }
        const sc = L.platformScale, bh = L.slotBandH;
        const bandTop = B.y + (B.height - 3 * bh) / 2 + i * bh;
        const box = this.add.container(CA.x + CA.width / 2, bandTop + bh / 2);
        const dim = this.add.graphics();
        dim.fillStyle(0x000000, v(C.DIM, 0.35)).fillRect(-CA.width / 2, -bh / 2, CA.width, bh);
        box.add(dim);
        // THE BANNER: a dark bar, chequered at both ends, the words on it.
        const size = Math.max(10, Math.round(Math.min(v(C.SIZE, 30) * sc, bh * 0.4)));
        const t = this.add.text(0, 0, (C.TEXT || 'RACE {n} WON!').replace('{n}', i + 1), {
            fontSize: size + 'px', fontFamily: CONFIG.FONT_FAMILY, fontStyle: CONFIG.FONT_WEIGHT,
            color: C.COLOR || '#ffd23f', stroke: C.STROKE || '#2b2013',
            strokeThickness: Math.max(3, Math.round(size * 0.14)) }).setOrigin(0.5);
        const q = Math.max(4, Math.round(v(C.CHECKER, 10) * sc));
        const barH = q * 4, cols = 3;
        const barW = Math.min(CA.width * 0.92, t.width + q * (cols * 2 + 4));
        const bar = this.add.graphics();
        bar.fillStyle(hexColor(C.BAR_COLOR || '#1d2430'), v(C.BAR_ALPHA, 0.85))
            .fillRect(-barW / 2, -barH / 2, barW, barH);
        [-1, 1].forEach((side) => {
            const x0 = side < 0 ? -barW / 2 : barW / 2 - cols * q;
            for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) {
                bar.fillStyle((r + c) % 2 ? 0x111111 : 0xffffff, 1)
                    .fillRect(x0 + c * q, -barH / 2 + r * q, q, q);
            }
        });
        const banner = this.add.container(0, 0, [bar, t]);
        box.add(banner);
        this._onRoad(box.setDepth(v(C.DEPTH, 6.5)));
        this.podiums[i] = box;
        if (!pop) return;
        const ms = v(C.POP_MS, 380);
        dim.setAlpha(0);
        this.tweens.add({ targets: dim, alpha: 1, duration: ms });
        banner.setScale(1.8).setAlpha(0);
        this.tweens.add({ targets: banner, scale: 1, alpha: 1, duration: ms, ease: 'Back.easeOut', onComplete: done });
    }

    // THE LUNGE on lane i's final finish (RACE.LUNGE): just before the line
    // the piggy car gives a short burst forward — the push picked when the
    // finish began — easing in over OUT_MS and then kept (it folds into the
    // car's place at the end). A push only: the one lift is the win's hop.
    _lunge(i, surge) {
        const LG = (CONFIG.RACE || {}).LUNGE || {}, car = this.cars[i];
        if (LG.ENABLED === false || !car || !surge) return;
        this.tweens.add({ targets: car, lunge: surge,
            duration: LG.OUT_MS !== undefined ? LG.OUT_MS : 160, ease: 'Quad.easeOut' });
    }

    // EACH FRAME, every lane's race: speeds, then places, then the camera,
    // then where everything is drawn — and the moments that hang off them
    // (the start, the crossing, the zoom, the lunge, the end).
    _raceStep(time, delta) {
        const R = CONFIG.RACE || {}, Z = R.ZOOM || {}, v = (x, d) => (x !== undefined ? x : d);
        const dt = Math.min(delta, 50) / 1000;
        this._zoomFilter();
        // THE GREEN FIGURE climbs by its piggy's value each second, in steps
        // as the ticks did, until frozen.
        (this.lanes || []).forEach((lane, i) => {
            const ah = lane.ahead;
            if (!ah || ah.frozen) return;
            ah.t = (ah.t || 0) + dt;
            if (ah.t < 1) return;
            ah.t -= 1;
            ah.v += ah.rate;
            this._setLaneLabel(i);
        });
        (this.lanes || []).forEach((lane, i) => {
            const rc = this.race[i], car = this.cars[i], en = this.villains[i];
            if (!rc || !car || !car.scene || !en || !en.scene) return;
            const m = rc.m, V = this._raceV(), W = m.W;
            // A LANE STARTS once its rival has landed and a piggy is in its slot.
            if (rc.phase === 'wait' && lane.dropped && !rc.entering && this.chargingSlots[i] &&
                !this._briefing && !this._levelTurning) this._raceStartLead(i);
            let target = rc.cam;
            switch (rc.phase) {
            case 'wait':
                rc.vp = rc.vr = 0;
                target = rc.pw - m.home;
                break;
            case 'lead': {
                rc.t += dt;
                const t = Math.max(0, rc.t - rc.delay);
                const X = (T) => (t <= T ? V * t * t / (2 * T) : V * T / 2 + V * (t - T));
                rc.rw = rc.rw0 + X(rc.TR);
                rc.pw = rc.pw0 + X(rc.TP);
                rc.vr = V * Math.min(1, t / rc.TR);
                rc.vp = V * Math.min(1, t / rc.TP);
                target = rc.pw - m.home;
                lane.shown = lane.total * Math.max(0, Math.min(1, (rc.rw - rc.pw - (rc.gap0 || 0)) /
                    Math.max(1, m.rivalAt - m.home - (rc.gap0 || 0))));
                this._setLaneLabel(i);
                if (t >= rc.TP) this._raceLeadDone(i);
                break;
            }
            case 'race': {
                // THE CAR GLIDES TO THE LEAD: the figure steps by the piggy's
                // value each tick (chargeCycle); lane.track follows it down at
                // the piggy's rate, frame by frame, never stopping between
                // ticks — and the piggy car stands where lane.track says. On
                // a won lane, its reaching 0 is the noses meeting: the finish.
                if (lane.track === undefined) lane.track = lane.left;
                const glide = (CONFIG.CHASE_FX || {}).COUNT || {};
                lane.track = glide.ENABLED === false ? lane.left
                           : Math.max(lane.left, lane.track - this._raceRate(i, m) * dt);
                if (lane.track > lane.left && !(lane.overRate > 0)) lane.track = lane.left;
                const p0 = rc.pw;
                rc.vr = V;
                rc.rw += V * dt;
                const sl = this._raceSlide(i, m, lane.track);
                target = rc.rw - m.rivalAt + sl;
                rc.pw = target + this._raceCarAt(i, m, lane.track) - sl;
                rc.vp = dt > 0 ? (rc.pw - p0) / dt : V;
                if (lane.closing && lane.track <= 0) {
                    // (Its speed is the glide's — not this last part-frame's.)
                    rc.vp = V + this._raceRate(i, m) * (m.meet - m.home) / Math.max(1, lane.total);
                    lane.closing = false;
                    lane.track = undefined;
                    // The camera on this frame's mark first: the finish takes
                    // the car's place on screen (P0) from it.
                    rc.cam = target;
                    this._raceFinish(i);
                }
                break;
            }
            case 'finish': {
                const f = rc.fin;
                // NO BRAKING (RACE.FINISH_BRAKE false): both drive on at their
                // speed; once the line is out of frame they drive off (the
                // 'leave' step). True brings back the old stop below.
                const brakes = R.FINISH_BRAKE === true;
                // THE PIGGY CAR keeps its speed till wholly across the line,
                // then brakes, steadily, to its spot.
                // BRAKING runs on a fixed curve from where it began, so it
                // lands exactly on its spot — stepped frame by frame it fell
                // a few px short and snapped onto it at the stop.
                const brake = (b, x0, v0, a, S) => {
                    b.t = (b.t || 0) + dt;
                    const T = v0 / a;
                    if (b.t >= T) return [S, 0];
                    return [x0 + v0 * b.t - a * b.t * b.t / 2, v0 - a * b.t];
                };
                if (brakes && !f.braking && rc.pw >= f.across) {
                    f.braking = true;
                    f.pBrake = rc.pw;
                    f.pv0 = rc.vp;
                    f.a = rc.vp * rc.vp / (2 * Math.max(1, f.pS - rc.pw));
                    f.pb = {};
                }
                if (f.braking) {
                    [rc.pw, rc.vp] = brake(f.pb, f.pBrake, f.pv0, f.a, f.pS);
                    // THE SKID (RACE.SKID): the last LOCK_S of the braking on
                    // locked tyres — the nose dipping, dust kicking up.
                    const SK = R.SKID || {};
                    if (SK.ENABLED !== false && rc.vp > 0) {
                        const sc = this.layoutConfig.platformScale, ends = car.susp.ends;
                        if (!f.locked && f.pv0 / f.a - f.pb.t <= v(SK.LOCK_S, 0.35)) {
                            f.locked = true;
                            f.dustT = 0;
                            const dip = v(SK.DIP, 70) * sc;
                            ends[ends.length - 1].v -= dip;
                            if (ends.length > 1) ends[0].v += dip / 3;
                            this._dust(car, -1, v(SK.DUST, 4));
                        } else if (f.locked && (f.dustT += dt * 1000) >= v(SK.DUST_EVERY_MS, 90)) {
                            f.dustT = 0;
                            this._dust(car, -1, 1);
                        }
                    }
                }
                else {
                    // TILL ITS NOSE IS ON THE LINE it keeps pulling away: its
                    // speed over the rival's grows (FINISH_ACCEL), so no finish
                    // is a photo finish.
                    if (!f.won) rc.vp = Math.min(rc.vp + v(R.FINISH_ACCEL, 100) * this.layoutConfig.platformScale * dt,
                                                 Math.max(rc.vp, v(R.MAX_SPEED, 2.5) * V));
                    rc.pw += rc.vp * dt;
                }
                // THE RIVAL keeps V till it has finished — its nose over the
                // line — then brakes, steadily, to rest behind the winner. Its
                // nose never passes the winner's.
                if (brakes && !f.rBraking && rc.rw + m.eW / 2 >= f.flagW) {
                    f.rBraking = true;
                    f.rBrake = rc.rw;
                    f.rv0 = rc.vr;
                    f.ra = rc.vr * rc.vr / (2 * Math.max(1, f.rS - rc.rw));
                    f.rb = {};
                }
                if (f.rBraking) [rc.rw, rc.vr] = brake(f.rb, f.rBrake, f.rv0, f.ra, f.rS);
                else rc.rw += rc.vr * dt;
                rc.rw = Math.min(rc.rw, rc.pw + (W - m.eW) / 2);
                // THE CAMERA rides with the piggy car (_raceFinish: P0, u0,
                // Pend) — its place on screen carrying on smoothly from the
                // race, so the hand-over from the rival never jerks.
                f.t += dt;
                const tau = (R.CAM || {}).DRIFT_S !== undefined ? R.CAM.DRIFT_S : 0.4;
                // NEVER PAST THE ROAD'S RIGHT EDGE: on a narrow road the drift
                // could carry the nose out of frame — the camera keeps up instead.
                const CA = this.carArea, sc = this.layoutConfig.platformScale;
                const Pmax = CA.x + CA.width - W / 2 - (car.lunge || 0) - v((R.CAM || {}).EDGE_PAD, 12) * sc;
                const Pa = Math.min(Pmax, f.P0 + f.u0 * tau * (1 - Math.exp(-f.t / tau)));
                if (f.braking && f.Pb === undefined) f.Pb = Pa;
                const s = f.braking ? Math.max(0, Math.min(1, (rc.pw - f.pBrake) / Math.max(1, f.pS - f.pBrake))) : 0;
                target = rc.pw - (f.braking ? f.Pb + (f.Pend - f.Pb) * s * s * (3 - 2 * s) : Pa);
                // THE MOMENTS: the lunge and the zoom just before the line,
                // the win on it.
                const toLine = f.flagW - (rc.pw + W / 2 + (car.lunge || 0));
                if (f.final && !f.lunged && toLine < v(((R.LUNGE || {}).AHEAD), 0.35) * W) {
                    f.lunged = true;
                    this._lunge(i, f.surge);
                }
                if (f.final && !f.zoomed && toLine < v(Z.AHEAD, 0.8) * W) {
                    f.zoomed = true;
                    this._laneZoom(i, true);
                }
                if (!f.won && toLine <= 0) {
                    f.won = true;
                    this._winFx(i);
                    this._freezeAhead(i);
                    if (f.zoomed) this.time.delayedCall(v(Z.HOLD_MS, 250), () => this._laneZoom(i, false));
                }
                // NO BRAKING: won and the line gone past the road's left edge
                // — the camera stops there and the cars carry on out to the
                // right at their speed. NOT WAITING FOR THE RIVAL: a strong
                // piggy can finish far ahead; it comes on behind the banner.
                const lineOff = CA.x - f.line.postW / 2 - v((R.LINE || {}).OFF_PAD, 8) * sc;
                if (!brakes && f.won && f.flagW - target <= lineOff) {
                    rc.phase = 'leave';
                    rc.leaveT = 0;
                    rc.keepSpeed = true;
                }
                break;
            }
            case 'leave': {
                // THE CARS DRIVE OFF to the right (RACE.CLOSE); the camera
                // holds. Both gone: the banner.
                const C = R.CLOSE || {}, acc = v(C.ACCEL, 500) * this.layoutConfig.platformScale;
                const top = V * v(C.CRUISE, 0.6);
                rc.leaveT += dt;
                // Straight on from the finish (keepSpeed): as they were.
                if (!rc.keepSpeed) {
                    rc.vp = Math.min(top, rc.vp + acc * dt);
                    if (rc.leaveT * 1000 >= v(C.RIVAL_LAG_MS, 120)) rc.vr = Math.min(top, rc.vr + acc * dt);
                }
                rc.pw += rc.vp * dt;
                rc.rw += rc.vr * dt;
                // GONE once wholly past the road's right edge. The banner
                // comes as soon as the piggy car is gone; the rival drives on
                // under it till it is gone too.
                const edge = this.carArea.x + this.carArea.width;
                const rivalGone = rc.rw - rc.cam - m.eW / 2 > edge;
                if (!rc.closed && rc.pw - rc.cam - W / 2 + (car.lunge || 0) > edge) {
                    rc.closed = true;
                    this._raceClose(i, true, !rivalGone);
                }
                if (rc.closed && rivalGone) {
                    rc.phase = 'done';
                    rc.vp = rc.vr = 0;
                    en.setVisible(false);
                }
                break;
            }
            }
            // THE CAMERA: on its mark.
            rc.cam = target;
            // THE END of a finish: both at rest.
            if (rc.phase === 'finish' && rc.vp === 0 && rc.vr === 0) this._raceFinishDone(i);
            // WHERE IT ALL IS DRAWN: world less camera. The road scrolls with it.
            if (!rc.entering) car.x = rc.pw - rc.cam;
            en.x = rc.rw - rc.cam;
            if (rc.fin && rc.fin.line && rc.fin.line.scene) rc.fin.line.x = rc.fin.flagW - rc.cam;
            const bd = this.raceBadges[i];
            if (bd) {
                if (bd[0] && bd[0].scene) bd[0].x = car.x + bd[0].dx;
                if (bd[1] && bd[1].scene) bd[1].x = en.x + bd[1].dx;
            }
            this.roadOffsets[i] = Math.max(0, rc.road0 + rc.cam);
        });
    }

    // THE ROAD'S CAMERA. Everything on the road — the road itself, the cars,
    // the flags, the figures, the badges, the dust and confetti — is drawn
    // through a camera whose view is exactly the car area (right of the
    // slots), so whatever goes past its edge is cut off there, as in a real
    // camera's frame. The main camera leaves them to it and draws the rest:
    // the merge grid, the slots, the coins and the UI. It draws FIRST, so a
    // coin flying from the road to the counter passes over the road. Set up
    // with the road (_buildVillains), so a relayout moves it with the area.
    _setupRoadCam() {
        const CA = this.carArea, B = this.layoutConfig.partB;
        if (!CA || !B) return;
        let cam = this.roadCam;
        if (!cam || !this.cameras.cameras.includes(cam)) {
            cam = this.roadCam = this.cameras.add(CA.x, B.y, CA.width, B.height);
            cam.inputEnabled = false;
            const list = this.cameras.cameras;
            list.splice(list.indexOf(cam), 1);
            list.unshift(cam);
        }
        cam.setViewport(CA.x, B.y, CA.width, B.height);
        cam.setScroll(CA.x, B.y);
    }

    // An object that belongs on the road: drawn through the road's camera
    // (_setupRoadCam), cut off at its edges. Returns it.
    _onRoad(o) {
        if (o) o.onRoad = true;
        return o;
    }

    // Each frame: the road's objects to the road's camera only, everything
    // else to the main camera only (other cameras' choices left as they are).
    _roadCamFilter() {
        const road = this.roadCam, main = this.cameras.main;
        if (!road || !this.cameras.cameras.includes(road)) return;
        const both = road.id | main.id;
        for (const o of this.children.list) {
            o.cameraFilter = (o.cameraFilter & ~both) | (o.onRoad ? main.id : road.id);
        }
    }

    // A ZOOM CAMERA DRAWS ONLY ITS OWN LANE. Each frame it skips the UI
    // layer (flying coins, a dragged pig — anything at ZOOM.IGNORE_DEPTH or
    // above, which would otherwise show there a second time, enlarged) and
    // anything standing outside its section: the merge grid, the buttons,
    // the other lanes. The graphics shared by all three lanes are always
    // drawn. Re-checked every frame, so something moving in is drawn once it
    // is there.
    _zoomFilter() {
        const cams = this._zoomCams.filter(Boolean);
        if (!cams.length) return;
        const Z = (CONFIG.RACE || {}).ZOOM || {};
        const min = Z.IGNORE_DEPTH !== undefined ? Z.IGNORE_DEPTH : 50;
        const shared = [this.roadGfx, this.speedFx];
        for (const o of this.children.list) {
            const all = shared.includes(o);
            for (const cam of cams) {
                const b = cam.band, mg = b.h * 0.5;
                const out = o.depth >= min || (!all &&
                    (o.x < b.x - mg || o.x > b.x + b.w + mg || o.y < b.y - mg || o.y > b.y + b.h + mg));
                if (out) o.cameraFilter |= cam.id;
                else o.cameraFilter &= ~cam.id;
            }
        }
    }

    // LANE i's SECTION ZOOMS IN as its final finish nears the line, and back
    // out after (RACE.ZOOM) — that section alone: a second camera whose
    // viewport is exactly the lane's band of the car area, drawn over the
    // main one. It opens at zoom 1 on the same view (so nothing jumps), eases
    // in on the crossing, eases back out and is removed. It takes no input.
    _laneZoom(i, on) {
        const Z = (CONFIG.RACE || {}).ZOOM || {}, v = (x, d) => (x !== undefined ? x : d);
        const L = this.layoutConfig, B = L.partB, CA = this.carArea;
        if (!CA || !B) return;
        const bandH = L.slotBandH;
        const vx = CA.x, vy = B.y + (B.height - 3 * bandH) / 2 + i * bandH, vw = CA.width, vh = bandH;
        const mid = { x: vx + vw / 2, y: vy + vh / 2 };
        if (on) {
            if (Z.ENABLED === false || this._zoomCams[i]) return;
            const car = this.cars[i], p = this.platforms[i];
            if (!car || !p) return;
            // EVERYTHING THAT MATTERS STAYS IN VIEW: from the lead figure's top
            // down to the road. The zoom is SCALE, or less if that span would
            // not fit the section at SCALE.
            const ground = p.slotY + p.slotSize / 2, t = this.laneLabels[i];
            const pad = 8 * L.platformScale;
            const top = (t && t.scene ? t.y - t.height * 0.75 : ground - car.carH * 1.6) - pad;
            const span = Math.max(1, ground + pad - top);
            const z = Math.max(1, Math.min(v(Z.SCALE, 1.35), vh / span));
            const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
            // ON THE CROSSING, but never showing past the section's edges.
            const tx = clamp(car.x + car.carW / 2, vx + vw / (2 * z), vx + vw - vw / (2 * z));
            const ty = clamp((top + ground + pad) / 2, vy + vh / (2 * z), vy + vh - vh / (2 * z));
            const cam = this.cameras.add(vx, vy, vw, vh);
            cam.inputEnabled = false;
            cam.band = { x: vx, y: vy, w: vw, h: vh };
            // OPAQUE, in the ground's colour: the main camera draws this lane
            // underneath too, and must not show through.
            cam.setBackgroundColor((CONFIG.BACKGROUND || {}).GRADIENT_START_COLOR || '#e0c493');
            const st = cam.zoomState = { z: 1, x: mid.x, y: mid.y };
            cam.applyZoom = () => { cam.setZoom(st.z); cam.centerOn(st.x, st.y); };
            cam.applyZoom();
            this._zoomCams[i] = cam;
            // FILTERED AT ONCE: a camera's id is reused once it is removed,
            // so an earlier zoom's skips are still on the objects — the car
            // among them — and this frame would draw without it.
            this._zoomFilter();
            this.tweens.add({ targets: st, z, x: tx, y: ty, duration: v(Z.IN_MS, 350),
                ease: 'Sine.easeInOut', onUpdate: cam.applyZoom });
        } else {
            const cam = this._zoomCams[i];
            if (!cam || cam.leaving) return;
            cam.leaving = true;
            this.tweens.killTweensOf(cam.zoomState);
            this.tweens.add({ targets: cam.zoomState, z: 1, x: mid.x, y: mid.y, duration: v(Z.OUT_MS, 450),
                ease: 'Sine.easeInOut', onUpdate: cam.applyZoom,
                onComplete: () => { this.cameras.remove(cam); this._zoomCams[i] = null; } });
        }
    }

    // Every lane's zoom camera gone at once (a new level, a rebuild).
    _clearZooms() {
        this._zoomCams.forEach((cam) => {
            if (!cam) return;
            if (cam.zoomState) this.tweens.killTweensOf(cam.zoomState);
            this.cameras.remove(cam);
        });
        this._zoomCams = [];
    }

    // THE NOSE IS ON THE LINE: lane i's green figure stops at the winning
    // margin, pops, holds while FINISH! is up, and fades.
    _freezeAhead(i) {
        const lane = this.lanes && this.lanes[i], t = this.laneLabels[i];
        const R = CONFIG.RACE || {}, RL = R.LEAD || {}, v = (x, d) => (x !== undefined ? x : d);
        if (!lane || !lane.ahead) return;
        lane.ahead.frozen = true;
        // GONE AT THE LINE: FINISH! takes its place there.
        if (RL.HIDE_AT_LINE !== false) {
            lane.ahead.gone = true;
            if (t && t.scene) { this.tweens.killTweensOf(t); t.setScale(1).setAlpha(1); }
            this._setLaneLabel(i);
            return;
        }
        this._setLaneLabel(i);
        this._bumpLabel(i, v(RL.FREEZE_SCALE, 1.45));
        if (!t || !t.scene) return;
        this.tweens.add({ targets: t, alpha: 0, delay: v(RL.HOLD_MS, 1200), duration: v(RL.FADE_MS, 300),
            onComplete: () => { lane.ahead.gone = true; t.setAlpha(1); this._setLaneLabel(i); } });
    }

    // LANE i's FIGURE POPS AWAY (RACE.LEAD.VANISH): the lead run out, the
    // last figure swells and fades instead of showing 0. Once.
    _vanishLabel(i) {
        const t = this.laneLabels[i], VN = ((CONFIG.RACE || {}).LEAD || {}).VANISH || {};
        if (!t || !t.scene || t._vanishUntil || !t.visible) return;
        const ms = VN.MS !== undefined ? VN.MS : 260;
        t._vanishUntil = this.time.now + ms;
        this.tweens.killTweensOf(t);
        this.tweens.add({ targets: t, scale: VN.SCALE !== undefined ? VN.SCALE : 1.6, alpha: 0,
            duration: ms, ease: 'Quad.easeOut',
            onComplete: () => t.setVisible(false).setScale(1).setAlpha(1) });
    }

    // A quick swell and settle of lane i's figure.
    _bumpLabel(i, k) {
        const t = this.laneLabels[i];
        if (!t || !t.scene) return;
        this.tweens.add({ targets: t, scale: k, duration: 120, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => t.setScale(1) });
    }

    // THE NEXT LEVEL once every lane is won and every finish has played out.
    _turnWhenDone() {
        if (!this._levelTurning || this._turnQueued || !this.lanes) return;
        if (this.lanes.some((l) => l.finishing)) return;
        this._turnQueued = true;
        const V = CONFIG.VILLAIN || {}, K = CONFIG.RANK || {};
        const go = () => { this._turnQueued = false; this._nextLevel(); };
        // THE RANK CLIMB first (RANK), the next level starting as it goes.
        if (K.ENABLED !== false) {
            this.time.delayedCall(K.DELAY_MS !== undefined ? K.DELAY_MS : 250,
                () => this._showRankUp(this.level, go));
            return;
        }
        this.time.delayedCall(V.NEXT_LEVEL_MS !== undefined ? V.NEXT_LEVEL_MS : 900, go);
    }

    // ================================================================
    // THE RANK — see CONFIG.RANK
    // ================================================================
    // THE PLAYER'S RANK once level L is won (L 0: before the first race).
    // From START it falls by the same SHARE each level — a geometric climb:
    // big jumps while the rank is big, smaller as it shrinks, never a
    // crawl — to TAIL + 1 at level TOP_LEVEL - TAIL, then one place a level
    // to #1 at TOP_LEVEL, and stays #1 after. CURVE above 1 front-loads it.
    // Big ranks are rounded to tidy figures; every level always gains at
    // least one place. Built once.
    _rankAfter(L) {
        const K = CONFIG.RANK || {}, v = (x, d) => (x !== undefined ? x : d);
        if (!this._rankTable) {
            const start = Math.max(2, v(K.START, 2000)), N = Math.max(1, v(K.TOP_LEVEL, 65));
            const tail = Math.min(N - 1, Math.max(0, v(K.TAIL, 10))), P = Math.max(0.2, v(K.CURVE, 1));
            const t0 = N - tail, lo = Math.log(tail + 1), hi = Math.log(start);
            const nice = (x) => (x > 500 ? Math.round(x / 10) * 10 : x > 100 ? Math.round(x / 5) * 5 : Math.round(x));
            const T = [start];
            for (let l = 1; l <= N; l++) {
                let r = l >= t0 ? N - l + 1
                      : nice(Math.exp(hi + (lo - hi) * Math.pow(l / t0, 1 / P)));
                // Always up at least one, and always room left to keep climbing.
                r = Math.min(r, T[l - 1] - 1);
                r = Math.max(r, N - l + 1);
                T.push(r);
            }
            this._rankTable = T;
        }
        const T = this._rankTable;
        return T[Math.max(0, Math.min(T.length - 1, Math.floor(L)))];
    }

    // A RACER'S NAME for a rank — fixed per rank (hashed), from RANK.NAMES.
    _racerName(rank) {
        const N = (CONFIG.RANK || {}).NAMES || ['Rival'];
        return N[Math.floor(this._cellHash(rank, 7, 3) * N.length) % N.length];
    }

    // THE RANK-UP PANEL after level L: a card over the race area only — the
    // merge grid carries on — with the racers around the player. The
    // player's row slides up past the rival just beaten (who drops one
    // place) while the rank counts down, then the next opponent shows at
    // the foot. Quick, and a tap on it skips to the end. `next` (the next
    // level) runs as it starts to go.
    _showRankUp(L, next) {
        const K = CONFIG.RANK || {}, v = (x, d) => (x !== undefined ? x : d);
        const CA = this.carArea, sc = this.layoutConfig.platformScale;
        const oldR = this._rankAfter(L - 1), newR = this._rankAfter(L);
        if (!CA) { next(); return; }
        const champ = oldR === newR;   // already #1: a short toast, no climb
        const font = (px, color) => ({ fontSize: Math.max(9, Math.round(px * sc)) + 'px',
            fontFamily: CONFIG.FONT_FAMILY, fontStyle: CONFIG.FONT_WEIGHT, color });
        const ink = K.INK || '#2b2013';
        const hasGap = oldR - newR > 1;
        const N = v(K.TOP_LEVEL, 65);
        const nextR = L < N ? this._rankAfter(L + 1) : null;

        const W = Math.min(CA.width * 0.86, v(K.W, 440) * sc);
        const pad = 12 * sc, titleH = 44 * sc, footH = champ || nextR === null ? 0 : 34 * sc;
        // ROWS: AHEAD racers above YOU's final row (fewer near #1), the
        // slide, and BEHIND racers already beaten below YOU's first row.
        const ahead = Math.min(Math.max(0, v(K.AHEAD, 3)), newR - 1);
        const travel = hasGap ? 2 : 1;
        const behind = Math.max(0, Math.min(v(K.BEHIND, 1), this._rankAfter(0) - oldR));
        const slots = champ ? 0 : ahead + 1 + travel + behind;
        // Rows as tall as ROW_H, but shrunk so the card fits the race area.
        const rowH = Math.min(v(K.ROW_H, 40) * sc, slots ? (CA.height * 0.94 - pad * 2 - titleH - footH) / slots : 0);
        const H = pad * 2 + titleH + slots * rowH + footH;
        const panel = this.add.container(CA.x + CA.width / 2, CA.y + CA.height / 2).setDepth(v(K.DEPTH, 40));
        this._rankPanel = panel;

        const bg = this.add.graphics();
        const rad = 16 * sc;
        bg.fillStyle(0x000000, 0.22).fillRoundedRect(-W / 2 + 4 * sc, -H / 2 + 6 * sc, W, H, rad);
        bg.fillStyle(hexColor(K.CARD || '#fff6e6'), 1).fillRoundedRect(-W / 2, -H / 2, W, H, rad);
        bg.lineStyle(Math.max(2, 3 * sc), hexColor(ink), 1).strokeRoundedRect(-W / 2, -H / 2, W, H, rad);
        panel.add(bg);
        const title = this.add.text(0, -H / 2 + pad + titleH / 2, champ ? (K.CHAMP_TEXT || 'CHAMPION! #1') : (K.TITLE || 'RANK UP!'),
            font(30, K.TITLE_COLOR || '#e8590c')).setOrigin(0.5);
        panel.add(title);

        // A RANK'S SPRITE: the rival met at the level that takes that rank
        // (the player's row: the piggy).
        const spriteFor = (rank) => {
            for (let l = 1; l <= N; l++) if (this._rankAfter(l) === rank) return villainKey(villainIndexFor(l));
            return null;
        };

        // ONE ROW: rank on the left, the racer's sprite, name; the player's
        // row highlighted. A `locked` row (a racer not yet reached) shows its
        // sprite as a grey silhouette, with the colour sprite hidden over it
        // for the reveal. Its content sits in `body`, so it can be faded
        // apart from the edge fade `place` puts on the row.
        const slotY = (k) => -H / 2 + pad + titleH + (k + 0.5) * rowH;
        const row = (rank, name, you, key, locked) => {
            const c = this.add.container(0, 0);
            const body = this.add.container(0, 0);
            c.add(body); c.body = body;
            const g = this.add.graphics();
            const rw = W - pad * 2, rh = rowH - 6 * sc, rad = Math.min(rh / 2, 14 * sc);
            g.fillStyle(hexColor(you ? (K.YOU_FILL || '#ffd23f') : (K.ROW_IDLE || '#a39a90')), 1)
                .fillRoundedRect(-rw / 2, -rh / 2, rw, rh, rad);
            // THE ACTIVE OPPONENT'S COLOUR (ROW_FILL) over the grey, shown
            // only on the rival being raced, then on the next one.
            const warm = you ? null : this.add.graphics().fillStyle(hexColor(K.ROW_FILL || '#f26b5b'), 1)
                .fillRoundedRect(-rw / 2, -rh / 2, rw, rh, rad).setAlpha(0);
            if (you) g.lineStyle(Math.max(2, 2.5 * sc), hexColor(ink), 1).strokeRoundedRect(-rw / 2, -rh / 2, rw, rh, rad);
            const tc = you ? ink : (K.ROW_INK || '#ffffff');
            const rt = this.add.text(-rw / 2 + 16 * sc, 0, '#' + this._bigNum(rank), font(22, tc)).setOrigin(0, 0.5);
            const fig = rh * 0.86, figX = -rw / 2 + 76 * sc + fig / 2;
            body.add(warm ? [g, warm, rt] : [g, rt]);
            c.warm = warm;
            if (key && this.textures.exists(key)) {
                const im = this.add.image(figX, 0, key);
                im.setScale(fig / Math.max(im.width, im.height));
                if (locked) {
                    const sil = this.add.image(figX, 0, key).setScale(im.scale);
                    if (sil.setTintFill) sil.setTintFill(hexColor(K.LOCKED_TINT || '#7a7266'));
                    else sil.setTint(0x333333);
                    im.setAlpha(0);
                    body.add(sil);
                    c.sil = sil; c.fig = im;
                }
                body.add(im);
            } else if (key) {
                // NOT HERE YET (a slow connection): a round silhouette instead.
                body.add(this.add.graphics().fillStyle(hexColor(K.LOCKED_TINT || '#7a7266'), 1)
                    .fillCircle(figX, 0, fig * 0.4));
            }
            body.add(this.add.text(figX + fig / 2 + 12 * sc, 0, name, font(22, tc)).setOrigin(0, 0.5));
            // THE RING round the next opponent while it is highlighted. Off to begin.
            if (!you) {
                c.ring = this.add.graphics().lineStyle(Math.max(2, 3 * sc), hexColor(K.NEXT_RING || '#ffffff'), 1)
                    .strokeRoundedRect(-rw / 2, -rh / 2, rw, rh, rad).setAlpha(0);
                body.add(c.ring);
            }
            c.rankText = rt;
            return c;
        };
        // EVERY RACER PASSED: one row per rank from just above the new rank
        // down to just above the old one. As the player's rank `s` counts
        // down, the list scrolls past YOU and each racer drops a place as it
        // is passed. YOU goes from the bottom slot to its final one. Rows
        // fade at the window's edges (no masks in this build).
        let you = null, place = null, unlock = null;
        if (!champ) {
            const top = ahead;
            const others = [];
            let beaten = null, nextUp = null;
            // r is the rank a racer held before this level; those from oldR
            // on were beaten earlier and sit one place lower (r + 1), darkened.
            for (let r = newR - ahead; r < oldR + behind; r++) {
                const o = row(r, this._racerName(r), false, spriteFor(r), r < newR);
                if (r === newR) beaten = o;
                if (r === newR - 1) nextUp = o;
                o.rank = r; o.shown = r;
                panel.add(o); others.push(o);
            }
            you = row(oldR, K.YOU || 'YOU', true, 'podium_piggy');
            panel.add(you);
            // THE RIVAL JUST RACED IN ITS COLOUR, the rest grey; those beaten
            // in earlier levels see-through too (PASSED_ALPHA).
            const passed = v(K.PASSED_ALPHA, 0.45);
            for (const o of others) if (o.rank >= oldR) o.body.setAlpha(passed);
            if (beaten) beaten.warm.setAlpha(1);
            // UNLOCKED: once YOU has reached its row and bounced (the slide's
            // end), the rival just beaten fades and the next opponent's
            // silhouette fills in with colour.
            unlock = () => {
                const ms = v(K.UNLOCK_MS, 350);
                // Everyone just passed: grey and see-through.
                for (const o of others) {
                    if (o.rank < newR || o.rank >= oldR) continue;
                    this.tweens.add({ targets: o.warm, alpha: 0, duration: ms });
                    this.tweens.add({ targets: o.body, alpha: passed, duration: ms });
                }
                // THE NEXT OPPONENT lit up and highlighted (ring and a
                // pulse) until the card goes (NEXT_MS).
                if (nextUp) {
                    this.tweens.add({ targets: nextUp.warm, alpha: 1, duration: ms });
                    this.tweens.add({ targets: nextUp.ring, alpha: 1, duration: ms });
                    panel.nextPulse = this.tweens.add({ targets: nextUp.body, scale: 1.05, duration: 380, yoyo: true, repeat: -1,
                        ease: 'Sine.easeInOut' });
                }
                if (nextUp && nextUp.fig) {
                    this.tweens.add({ targets: nextUp.fig, alpha: 1, duration: ms, ease: 'Quad.easeOut' });
                    this.tweens.add({ targets: nextUp.sil, alpha: 0, duration: ms });
                }
            };
            place = (s) => {
                const ys = top + travel * (s - newR) / Math.max(1, oldR - newR);
                you.y = slotY(ys);
                you.rankText.setText('#' + this._bigNum(Math.round(s)));
                for (const o of others) {
                    const k = ys + o.rank - s + Math.min(1, Math.max(0, o.rank + 1 - s));
                    const out = Math.max(0, -k, k - (slots - 1));
                    o.setVisible(out < 0.5).setAlpha(Math.max(0, 1 - out * 2));
                    o.y = slotY(k);
                    const shown = s > o.rank + 0.5 ? o.rank : o.rank + 1;
                    if (shown !== o.shown) { o.shown = shown; o.rankText.setText('#' + this._bigNum(shown)); }
                }
            };
            place(oldR);
        }
        if (footH) {
            panel.add(this.add.text(0, H / 2 - pad - footH / 2,
                (K.NEXT || 'NEXT') + '  ' + this._racerName(nextR) + '  #' + this._bigNum(nextR),
                font(18, K.NEXT_COLOR || '#6b4a2a')).setOrigin(0.5));
        }

        // THE TIMELINE: pop in, slide and count, hold, go. A tap skips on.
        const popMs = v(K.POP_MS, 180), slideMs = v(K.SLIDE_MS, 800), holdMs = v(K.HOLD_MS, 650);
        const outMs = v(K.OUT_MS, 220), slideAt = popMs + v(K.SLIDE_DELAY_MS, 120);
        panel.setScale(0.9).setAlpha(0);
        this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: popMs, ease: 'Back.easeOut' });
        const settle = () => { if (place) place(newR); };
        let closed = false;
        const timers = [];
        const close = () => {
            if (closed) return;
            closed = true;
            timers.forEach((t) => t.remove(false));
            if (counter) counter.stop();
            settle();
            if (panel.nextPulse) panel.nextPulse.stop();
            next();
            this.tweens.add({ targets: panel, alpha: 0, y: panel.y - 16 * sc, duration: outMs, ease: 'Cubic.easeIn',
                onComplete: () => { panel.destroy(); if (this._rankPanel === panel) this._rankPanel = null; } });
        };
        let counter = null;
        if (!champ) {
            counter = this.tweens.addCounter({ from: oldR, to: newR, delay: slideAt, duration: slideMs, ease: 'Cubic.easeOut',
                onUpdate: (tw) => place(tw.getValue()),
                onComplete: () => {
                    settle();
                    this.tweens.add({ targets: you, scale: 1.06, duration: 120, yoyo: true, ease: 'Quad.easeOut',
                        onComplete: () => { if (!closed && unlock) unlock(); } });
                } });
        }
        // With a next opponent to show, it stays highlighted NEXT_MS.
        const after = !champ && newR > 1 && ahead > 0 ? Math.max(holdMs, v(K.NEXT_MS, 2500)) : holdMs;
        timers.push(this.time.delayedCall(champ ? popMs + holdMs : slideAt + slideMs + after, close));
        const hit = this.add.rectangle(0, 0, W, H, 0x000000, 0).setInteractive();
        hit.on('pointerdown', close);
        panel.add(hit);
    }

    // THE FINISH LINE: a chequered post standing on lane i's road with a
    // chequered flag fluttering from its top, centred on x. Its `flag`,
    // `postW`, `flagW` are kept for placing it and for clearing it.
    _makeFinishLine(i, x) {
        const L = (CONFIG.RACE || {}).LINE || {}, v = (n, d) => (n !== undefined ? n : d);
        const car = this.cars[i], p = this.platforms[i];
        const H = car.carH, ground = p.slotY + p.slotSize / 2;
        const pw = Math.max(5, H * v(L.POST_W, 0.16)), ph = H * v(L.POST_H, 1.45);
        const fw = H * v(L.FLAG_W, 0.72), fh = H * v(L.FLAG_H, 0.44);
        const dark = hexColor(L.DARK || '#1c1c24'), light = hexColor(L.LIGHT || '#ffffff');
        const [cols, rows] = L.CHECKS || [5, 3];
        const lw = Math.max(1, pw * 0.12);

        // The post: two columns of squares, from the ground up.
        const s = pw / 2, n = Math.ceil(ph / s);
        const post = this.add.graphics();
        for (let r = 0; r < n; r++) {
            for (let k = 0; k < 2; k++) {
                post.fillStyle((r + k) % 2 ? dark : light, 1).fillRect(-pw / 2 + k * s, -(r + 1) * s, s, s);
            }
        }
        post.lineStyle(lw, dark, 1).strokeRect(-pw / 2, -n * s, pw, n * s);

        // The flag, hung from the post's top and flying back (left) off it.
        const cw = fw / cols, ch = fh / rows;
        const fg = this.add.graphics();
        for (let r = 0; r < rows; r++) {
            for (let k = 0; k < cols; k++) {
                fg.fillStyle((r + k) % 2 ? dark : light, 1).fillRect(-fw + k * cw, r * ch, cw, ch);
            }
        }
        fg.lineStyle(lw, dark, 1).strokeRect(-fw, 0, fw, fh);
        const flag = this.add.container(-pw / 2, -n * s, [fg]);

        const line = this._onRoad(this.add.container(x, ground, [post, flag]).setDepth(v(L.DEPTH, 3.85)));
        line.flag = flag; line.postW = pw; line.flagW = fw;
        this.tweens.add({ targets: flag, scaleX: 0.8, angle: 3, duration: v(L.WAVE_MS, 260),
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        return line;
    }

    // THE BURST at x, y on the road: a ring with rays, swelling and fading.
    // The win's (_winFx), and the overtake's as the noses meet; `k` its size.
    _burst(x, y, k = 1) {
        const W = (CONFIG.RACE || {}).WIN || {}, v = (n, d) => (n !== undefined ? n : d);
        const sc = this.layoutConfig.platformScale;
        const burst = this._onRoad(this.add.graphics({ x, y }).setDepth(v(W.DEPTH, 6)).setScale(k));
        burst.lineStyle(Math.max(2, 5 * sc), 0xffffff, 1).strokeCircle(0, 0, 14 * sc);
        burst.lineStyle(Math.max(2, 4 * sc), 0xffe27a, 1);
        const rays = v(W.RAYS, 10);
        for (let k = 0; k < rays; k++) {
            const a = k / rays * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
            burst.lineBetween(c * 22 * sc, s * 22 * sc, c * 40 * sc, s * 40 * sc);
        }
        this.tweens.add({ targets: burst, scale: 4.5 * k, alpha: 0, duration: v(W.RING_MS, 520),
            ease: 'Cubic.easeOut', onComplete: () => burst.destroy() });
    }

    // THE WIN, as lane i's winner's nose crosses the line: a burst ring and
    // rays, confetti, FINISH!, a shake, the winner's hop and dust, the line's
    // punch, and the prize flying to the coin counter.
    _winFx(i) {
        const R = CONFIG.RACE || {}, W = R.WIN || {}, v = (x, d) => (x !== undefined ? x : d);
        const sc = this.layoutConfig.platformScale;
        const lane = this.lanes[i], car = this.cars[i], line = this.finishLines[i], p = this.platforms[i];
        if (!lane || !car || !car.scene || !p) return;
        const D = v(W.DEPTH, 6), ground = p.slotY + p.slotSize / 2;
        const x = line && line.scene ? line.x : car.x + car.carW / 2;
        const y = ground - car.carH * 0.75;

        this._burst(x, y);

        // CONFETTI: up and out from the line, then down to the road.
        const cols = (W.COLORS || ['#ffd23f', '#ff5a5f', '#3ddc97', '#4cc9f0']).map(hexColor);
        const SP = W.SPREAD || [-150, 150], RI = W.RISE || [90, 190], FL = W.FLIGHT_MS || [450, 800];
        // KEPT TO ITS OWN LANE: never higher than the top of the lane's band,
        // so it reads as this race's (and shows in the lane's zoom).
        const L0 = this.layoutConfig, B0 = L0.partB;
        const bandTop = B0 ? B0.y + (B0.height - 3 * L0.slotBandH) / 2 + i * L0.slotBandH : y - 1e4;
        const riseMax = Math.max(10 * sc, y - bandTop - 6 * sc);
        const nConf = !line || line.final ? v(W.CONFETTI, 30) : v(W.CONFETTI_SMALL, 0);
        for (let k = 0; k < nConf; k++) {
            const CS = W.CONFETTI_SIZE || [5, 9];
            const cw = Phaser.Math.FloatBetween(CS[0], CS[1]) * sc, ch = cw * Phaser.Math.FloatBetween(0.45, 0.9);
            const c = this._onRoad(this.add.graphics({ x, y }).setDepth(D));
            c.fillStyle(cols[Math.floor(Math.random() * cols.length)], 1).fillRect(-cw / 2, -ch / 2, cw, ch);
            c.setRotation(Math.random() * Math.PI * 2);
            const t = Phaser.Math.Between(FL[0], FL[1]);
            this.tweens.add({ targets: c, x: x + Phaser.Math.FloatBetween(SP[0], SP[1]) * sc,
                duration: t * 1.3, ease: 'Sine.easeOut' });
            this.tweens.add({ targets: c, rotation: c.rotation + Phaser.Math.FloatBetween(-8, 8),
                duration: t * 1.3 });
            this.tweens.add({ targets: c, y: y - Math.min(Phaser.Math.FloatBetween(RI[0], RI[1]) * sc, riseMax * Phaser.Math.FloatBetween(0.2, 1)),
                duration: t * 0.4, ease: 'Cubic.easeOut',
                onComplete: () => this.tweens.add({ targets: c, y: ground + 4 * sc, alpha: 0,
                    duration: t * 0.9, ease: 'Quad.easeIn', onComplete: () => c.destroy() }) });
        }

        // THE SHOWER (the level's last finish): more confetti falling from the
        // top of the lane across its whole width, swaying as it drops — kept
        // inside the lane, filling it.
        const nRain = !line || line.final ? v(W.CONFETTI_RAIN, 0) : 0;
        const CA0 = this.carArea, CS0 = W.CONFETTI_SIZE || [5, 9], RF = W.RAIN_MS || [900, 1500];
        for (let k = 0; k < nRain && CA0; k++) {
            const cw = Phaser.Math.FloatBetween(CS0[0], CS0[1]) * sc, ch = cw * Phaser.Math.FloatBetween(0.45, 0.9);
            const rx = CA0.x + Math.random() * CA0.width;
            const c = this._onRoad(this.add.graphics({ x: rx, y: bandTop + Math.random() * 10 * sc }).setDepth(D).setAlpha(0));
            c.fillStyle(cols[Math.floor(Math.random() * cols.length)], 1).fillRect(-cw / 2, -ch / 2, cw, ch);
            c.setRotation(Math.random() * Math.PI * 2);
            const t = Phaser.Math.Between(RF[0], RF[1]), delay = Math.random() * 350;
            this.tweens.add({ targets: c, alpha: 1, duration: 120, delay });
            this.tweens.add({ targets: c, y: ground + 2 * sc, duration: t, delay, ease: 'Sine.easeIn',
                onComplete: () => this.tweens.add({ targets: c, alpha: 0, duration: 200, onComplete: () => c.destroy() }) });
            this.tweens.add({ targets: c, x: rx + Phaser.Math.FloatBetween(-40, 40) * sc, duration: t / 3, delay,
                yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
            this.tweens.add({ targets: c, rotation: c.rotation + Phaser.Math.FloatBetween(-10, 10), duration: t, delay });
        }

        // FINISH!, popping up over the line and floating away.
        const size = Math.max(12, Math.round(v(W.TEXT_SIZE, 44) * sc));
        const t = this._onRoad(this._floatText('finish', {
            fontSize: size + 'px', fontFamily: CONFIG.FONT_FAMILY, fontStyle: CONFIG.FONT_WEIGHT,
            color: W.TEXT_COLOR || '#ffe27a', stroke: W.TEXT_STROKE || '#2b2013',
            strokeThickness: Math.max(3, Math.round(size * 0.14)),
        }));
        const ty = y - car.carH * 0.72;
        t.setText(W.TEXT || 'FINISH!').setOrigin(0.5).setDepth(D + 0.1)
            .setPosition(x - (line ? line.flagW * 0.3 : 0), ty).setScale(0.2);
        this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
        this.tweens.add({ targets: t, y: ty - 28 * sc, alpha: 0, delay: 260 + v(W.TEXT_HOLD_MS, 900),
            duration: 400, ease: 'Cubic.easeIn', onComplete: () => this._floatTextDone(t) });

        if (W.SHAKE) this.cameras.main.shake(v(W.SHAKE_MS, 160), W.SHAKE);

        // THE WINNER HOPS: a real arc — fast off the ground, slowing to its
        // top, falling back — up and down only (it never touches the car's
        // speed along the road), long enough to carry a stretch of road with
        // it, in the lane's time (slowed with its slow motion). It lands on
        // its springs. The line takes the hit; dust at the tyres.
        // The level's last win hops full height; the others HOP_OTHER of it.
        const hop = v(W.HOP, 12) * (!line || line.final ? 1 : v(W.HOP_OTHER, 0.5));
        const hopTw = this.tweens.add({ targets: car, y: car.y - hop * sc,
            duration: v(W.HOP_MS, 380) / 2, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => {
                for (const e of car.susp.ends) e.v -= v(W.HOP_LAND, 90) * sc;
                this._dust(car, -1, 3);
            } });
        if (line && line.tws) line.tws.push(hopTw);
        if (line && line.scene) {
            this.tweens.add({ targets: line, scale: 1.12, duration: 110, yoyo: true, ease: 'Sine.easeOut' });
        }
        this._dust(car, -1, v(W.DUST, 6));

        // THE PRIZE.
        this.animateCoinReward(x, y, lane.payout);
    }

    // THE 1ST / 2ND BADGES over lane i's two stopped cars — popped up in
    // turn, or put straight there (a rebuild). Returns how long it takes, ms.
    _raceBadges(i, pop) {
        const R = CONFIG.RACE || {}, B = R.BADGE || {}, v = (x, d) => (x !== undefined ? x : d);
        const sc = this.layoutConfig.platformScale;
        const car = this.cars[i], en = this.villains[i], p = this.platforms[i];
        if (!car || !car.scene || !en || !en.scene || !p) return 0;
        const ground = p.slotY + p.slotSize / 2;
        const size = Math.max(10, Math.round(v(B.SIZE, 24) * sc));
        const make = (spec, x, carH) => {
            const t = this.add.text(0, 0, spec.TEXT, { fontSize: size + 'px', fontFamily: CONFIG.FONT_FAMILY,
                fontStyle: CONFIG.FONT_WEIGHT, color: spec.INK }).setOrigin(0.5);
            const w = t.width + size * 0.8, h = t.height + size * 0.1;
            const g = this.add.graphics();
            g.fillStyle(hexColor(spec.FILL), 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
            g.lineStyle(Math.max(2, 3 * sc), 0x2b2013, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
            return this._onRoad(this.add.container(x, ground - carH - h / 2 - 6 * sc, [g, t]).setDepth(v(B.DEPTH, 4.6)));
        };
        // The rival's badge goes over the part of it left showing — from its
        // tail to the winner's tail, or the whole of it if they don't overlap.
        const showEnd = Math.min(en.x + en.carW / 2, car.x - car.carW / 2);
        const first = make(B.FIRST || { TEXT: '1ST', FILL: '#ffd23f', INK: '#5a3b00' }, car.x, car.carH);
        const second = make(B.SECOND || { TEXT: '2ND', FILL: '#d7dde5', INK: '#2f3742' },
            (en.x - en.carW / 2 + showEnd) / 2, en.carH);
        // They ride with their cars (_raceStep), so they move as the camera does.
        first.dx = first.x - car.x;
        second.dx = second.x - en.x;
        this.raceBadges[i] = [first, second];
        if (!pop) return 0;
        const ms = v(R.BADGE_MS, 260);
        [first, second].forEach((c, k) => {
            c.setScale(0);
            this.tweens.add({ targets: c, scale: 1, duration: ms, delay: k * 120, ease: 'Back.easeOut' });
        });
        return ms + 120;
    }

    // A lane already won, as it ends up, put straight there (a rebuild): the
    // two cars and their badges — the line has long left the frame.
    _raceFinal(i) {
        this._raceClose(i, false);
    }

    // A slot's figure: metres per second.
    _rateText(mps) {
        const CA = CONFIG.CAR_AREA || {};
        return this._bigNum(mps) + (CA.RATE_SUFFIX !== undefined ? CA.RATE_SUFFIX : ' m/s');
    }
    // ── POOLED FLOATING TEXT ─────────────────────────────────────────────────
    // The numbers that float up and fade — a pick's "-N", a plant's "+N", a
    // section's bonus — are TAKEN FROM A POOL, one per `kind`, not made and
    // thrown away each time. A finished one is only hidden; the next of its
    // kind takes it back, re-texted and moved. A new one is made only when
    // every one of its kind is still in the air, so a pool grows to the most
    // ever up at once and stays there. Its style is set again only if it
    // changed (a relayout's new scale), since a restyle redraws it.
    _floatText(kind, style) {
        const pools = this._textPools || (this._textPools = {});
        const list  = (pools[kind] || []).filter((o) => o.scene);
        pools[kind] = list;
        const key = JSON.stringify(style);
        let t = list.find((o) => !o.visible);
        if (!t) {
            t = this.add.text(0, 0, '', style);
            list.push(t);
        } else {
            this.tweens.killTweensOf(t);
            if (t._styleKey !== key) t.setStyle(style);
        }
        t._styleKey = key;
        return t.setVisible(true).setAlpha(1).setScale(1).setAngle(0);
    }

    // Back to its pool — hidden, not destroyed.
    _floatTextDone(t) {
        if (t && t.scene) { this.tweens.killTweensOf(t); t.setVisible(false); }
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
            const y = B.y + B.height;              // the car area is the top band
            g.lineBetween(0, y, this.scale.width, y);
        } else {
            const x = B.x;                         // the car area is the right half
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
        const distPerSec  = getBatteryChargeValue(level);
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
        p.chargeRateText.setText(this._rateText(distPerSec)).setVisible(true);

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
        this.chargingSlots[slotIndex] = { level, distPerSec, batteryData };
        this._hideSlotHint(slotIndex);
    }

    // ================================================================
    // CHARGING
    // ================================================================
    // ONE 1-SECOND TICK, and it is the whole game's heartbeat. Each slot with a
    // piggy in it takes that piggy's figure off its lane's lead; at zero the
    // lane is won (_winLane). Merge a better piggy, win sooner.
    startCharging() {
        if (this.chargingInterval) return;
        this.chargingInterval = this.time.addEvent({
            delay: 1000, callback: this.chargeCycle, callbackScope: this, loop: true,
        });
    }

    chargeCycle() {
        // HELD WHILE A RELAYOUT WAITS, so everything can come to rest — see
        // _pollOrientation. A second or so of driving, never lost work. Held
        // too between levels — nobody to race — and while the rivals drop in.
        if (this._relayoutPending || this._levelTurning || this._briefing || !this.lanes) return;
        for (let i = 0; i < 3; i++) {
            const slot = this.chargingSlots[i];
            if (!slot || !this._laneDriving(i)) continue;
            // THE PIGGY'S M/S OFF ITS LANE'S DISTANCE — its damage, in effect.
            const lane = this.lanes[i];
            // What this tick goes PAST zero by: where the green "ahead"
            // figure starts (_raceFinish).
            lane.over = Math.max(0, slot.distPerSec - lane.left);
            lane.overRate = slot.distPerSec;
            const got  = Math.min(slot.distPerSec, lane.left);
            this.distance += got;
            lane.left = Math.max(0, lane.left - slot.distPerSec);
            this._distPop(i, got);
            this._setLaneLabel(i);   // the figure steps by the piggy's value
            this._pulseRate(i);      // (the car glides to match: _raceStep, lane.track)
            if (lane.left <= 0) this._winLane(i);
        }
    }

    // THE PIGGY'S FIGURE PULSES on each tick — its hit, landing as the lead
    // drops (CHASE_FX.RATE_PULSE).
    _pulseRate(i) {
        const P = (CONFIG.CHASE_FX || {}).RATE_PULSE || {}, t = this.platforms[i] && this.platforms[i].chargeRateText;
        if (P.ENABLED === false || !t || !t.scene || !t.visible) return;
        this.tweens.killTweensOf(t);
        t.setScale(1);
        this.tweens.add({ targets: t, scale: P.SCALE !== undefined ? P.SCALE : 1.2,
            duration: (P.MS !== undefined ? P.MS : 200) / 2, yoyo: true, ease: 'Quad.easeOut',
            onComplete: () => t.setScale(1) });
    }

    // THE DISTANCE POP: the metres lane i just closed, floating up off its
    // gap line (or over its car, when the line is too short to show).
    _distPop(i, amt) {
        const D = (CONFIG.CHASE_FX || {}).DIST_POP || {};
        if (D.ENABLED === false || !(amt > 0)) return;
        const v = (x, d) => (x !== undefined ? x : d);
        const sc = this.layoutConfig.platformScale;
        const t = this.laneLabels[i], car = this.cars[i], p = this.platforms[i];
        if (!car || !p) return;
        const ground = p.slotY + p.slotSize / 2;
        const x = t && t.visible ? t.x : car.x;
        // FROM THE FIGURE ITSELF, falling away from it.
        const y = t && t.visible ? t.y - t.height * (t.originY - 0.5) : ground - car.carH;
        const LB = ((CONFIG.VILLAIN || {}).LABEL) || {};
        const f = this._onRoad(this._floatText('distPop', {
            fontSize: Math.max(10, Math.round(v(D.SIZE, 24) * sc)) + 'px',
            fontFamily: CONFIG.FONT_FAMILY, fontStyle: CONFIG.FONT_WEIGHT,
            color: D.COLOR || '#ffe27a', stroke: D.STROKE || '#2b2013',
            strokeThickness: Math.round(v(D.STROKE_W, 4) * sc),
        }));
        const j = v(D.JITTER, 10) * sc;
        f.setText('−' + this._bigNum(Math.round(amt)) + (LB.SUFFIX !== undefined ? LB.SUFFIX : ' m'))
            .setOrigin(0.5).setDepth(t ? t.depth - 0.01 : 4.3) // under the figure it falls from
            .setPosition(x + Phaser.Math.FloatBetween(-j, j), y);
        // FAST OUT FROM BEHIND THE FIGURE, so it shows with the slot's pulse
        // (_pulseRate, the same tick) rather than after it.
        this.tweens.add({ targets: f, y: y + v(D.FALL, 34) * sc, duration: v(D.MS, 800), ease: 'Quad.easeOut' });
        this.tweens.add({ targets: f, alpha: 0, duration: v(D.MS, 800), ease: 'Cubic.easeIn',
            onComplete: () => this._floatTextDone(f) });
    }

    // HOW HARD LANE i IS BEING CHASED, 0..1: by how many seconds its piggy
    // would take over the whole level distance (CHASE_FX.SPEED), times how
    // fast its tyres are turning — so it fades in and out with them.
    _chaseIntensity(i) {
        const S = (CONFIG.CHASE_FX || {}).SPEED || {}, v = (x, d) => (x !== undefined ? x : d);
        const C = CONFIG.CAR || {};
        const car = this.cars[i], slot = this.chargingSlots[i], lane = this.lanes && this.lanes[i];
        if (!car || !car.scene || !slot || !lane || !(slot.distPerSec > 0)) return { k: 0, p: 0 };
        const k = Math.min(1, (car.wheelSpeed || 0) / (v(C.SPIN_DEG_PER_SEC, 540) || 1));
        const secs = lane.total / slot.distPerSec;
        const slow = v(S.SLOW_SECS, 40), fast = v(S.FAST_SECS, 4);
        const p = Math.max(0, Math.min(1, (slow - secs) / Math.max(0.001, slow - fast)));
        const min = v(S.MIN, 0.35);
        return { k: k * (min + (1 - min) * p), p };
    }

    // SPEED LINES AND EXHAUST behind each driving piggy car, every frame, as
    // strong as its chase is quick (_chaseIntensity). One graphics for all
    // three lanes; the puffs are plain records drawn into it, not objects.
    _drawSpeedFx(delta) {
        const S = (CONFIG.CHASE_FX || {}).SPEED || {};
        if (S.ENABLED === false || !this.platforms) return;
        const v = (x, d) => (x !== undefined ? x : d);
        if (!this.speedFx || !this.speedFx.scene) {
            this.speedFx = this._onRoad(this.add.graphics().setDepth(v(S.DEPTH, 3.85)));
            this._puffs = []; this._puffAcc = [0, 0, 0]; this._fxT = 0;
        }
        const g = this.speedFx, sc = this.layoutConfig.platformScale, dt = Math.min(delta, 50) / 1000;
        const C = CONFIG.CAR || {}, EX = S.EXHAUST || {}, LL = S.LINE_LEN || [22, 70];
        const bw = v(C.BODY_W, 254), gy = this._carGround();
        const lineC = hexColor(S.LINE_COLOR || '#ffffff'), lineA = v(S.LINE_ALPHA, 0.6);
        const left = this.carArea ? this.carArea.x : 0;
        this._fxT += dt;
        g.clear();

        this.platforms.forEach((p, i) => {
            // WIND off a rival taking its head start (RACE.WIND, en.wind 0..1).
            const en = this.villains[i];
            if (en && en.scene && en.wind > 0.01) {
                const WD = (CONFIG.RACE || {}).WIND || {}, WL = WD.LEN || [40, 120];
                const eg = p.slotY + p.slotSize / 2, er = en.x - en.carW / 2;
                const wc = hexColor(WD.COLOR || '#ffffff');
                for (let m = 0; m < v(WD.LINES, 9); m++) {
                    const h1 = this._cellHash(i, m, 21), h2 = this._cellHash(i, m, 22), h3 = this._cellHash(i, m, 23);
                    const ph = (this._fxT * v(WD.SPEED, 3) * (0.7 + 0.6 * h1) + h2) % 1;
                    const len = (WL[0] + (WL[1] - WL[0]) * h1) * sc;
                    const x0 = er + en.carW * 0.25 * h3 - ph * v(WD.SPAN, 220) * sc;
                    const x1 = Math.max(left, x0 - len);
                    if (x0 <= x1) continue;
                    const y = eg - en.carH * (0.12 + 0.95 * h3);
                    g.lineStyle(Math.max(1, v(WD.LINE_W, 3) * sc), wc, v(WD.ALPHA, 0.75) * en.wind * Math.sin(Math.PI * ph));
                    g.lineBetween(x1, y, x0, y);
                }
            }
            const car = this.cars[i];
            if (!car || !car.scene) return;
            const { k, p: pw } = this._chaseIntensity(i);
            if (k <= 0.01) { this._puffAcc[i] = 0; return; }
            const ground = p.slotY + p.slotSize / 2;
            const rear = car.x - car.carW / 2;

            // THE STREAKS: each its own pace and height (hashed, so steady),
            // sliding back from the bumper and fading in and out on the way.
            const n = v(S.LINES, 6);
            for (let m = 0; m < n; m++) {
                const h1 = this._cellHash(i, m, 11), h2 = this._cellHash(i, m, 12), h3 = this._cellHash(i, m, 13);
                const ph = (this._fxT * v(S.LINE_SPEED, 2.4) * (0.7 + 0.6 * h1) + h2) % 1;
                const len = (LL[0] + (LL[1] - LL[0]) * h1) * sc * (0.5 + 0.5 * pw);
                const x0 = rear - 6 * sc - ph * v(S.LINE_SPAN, 150) * sc;
                const x1 = Math.max(left, x0 - len);
                if (x0 <= x1) continue;
                const y = ground - car.carH * (0.18 + 0.62 * h3);
                g.lineStyle(Math.max(1, v(S.LINE_W, 3) * sc), lineC, lineA * k * Math.sin(Math.PI * ph));
                g.lineBetween(x1, y, x0, y);
            }

            // THE EXHAUST: puffs at a rate that rises with the chase.
            const rate = v((EX.RATE || [])[0], 1.5) + (v((EX.RATE || [])[1], 9) - v((EX.RATE || [])[0], 1.5)) * pw;
            this._puffAcc[i] += rate * k * dt;
            while (this._puffAcc[i] >= 1 && this._puffs.length < v(EX.MAX, 60)) {
                this._puffAcc[i] -= 1;
                const s = car.scaleX;
                const R = EX.R || [3, 6];
                this._puffs.push({
                    x: car.x + (-bw / 2 + v(EX.X, 6)) * s, y: car.y + (-gy + v(EX.Y, 86)) * s,
                    vx: -Phaser.Math.FloatBetween(30, 70) * sc, vy: -Phaser.Math.FloatBetween(4, 16) * sc,
                    r: Phaser.Math.FloatBetween(R[0], R[1]) * sc, age: 0,
                });
            }
            if (this._puffAcc[i] > 1) this._puffAcc[i] = 1;
        });

        // The puffs drift back, swell and fade.
        const life = v(EX.LIFE, 0.6), pc = hexColor(EX.COLOR || '#ffffff'), pa = v(EX.ALPHA, 0.55);
        this._puffs = this._puffs.filter((q) => (q.age += dt) < life);
        for (const q of this._puffs) {
            q.x += q.vx * dt; q.y += q.vy * dt;
            const a = q.age / life;
            g.fillStyle(pc, pa * (1 - a));
            g.fillCircle(q.x, q.y, q.r * (1 + 1.5 * a));
        }
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
            // slot; picked up, it lets go and the wheel drifts back to centre.
            const st = bd.steer;
            const slot = this.chargingSlots[bd.slotIndex];
            const driving = slot && slot.batteryData === bd && this._laneDriving(bd.slotIndex);
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
        this._raceIntro();
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
    // FROM THE RIGHT, in both orientations: the slots are stacked, so above and
    // below each one are its neighbours, and the empty car area beside the
    // column is the one clear approach.
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
            // LANDSCAPE: from the grid's side (left), pointing right — the
            // way the pig is dragged. Portrait keeps it on the right.
            const side = this.isPortrait ? 1 : -1;
            // DRAWN, rather than drawn
            // ON: one shape, one outline, no art file, and it turns to face
            // whichever way the layout needs without a second drawing.
            const arrow = this._makeArrow(side > 0 ? 'w' : 'e', len,
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
            const x0 = p.slotX + side * (size / 2 + gap + len / 2);
            arrow.setPosition(x0, p.slotY);
            if (HI.ENABLED !== false && this.textures.exists('pig_hint')) {
                icon = this.add.image(x0 + side * (len / 2 + iconGap + iconSize / 2), p.slotY, 'pig_hint')
                    .setDisplaySize(iconSize, iconSize)
                    .setDepth(120)    // just behind its arrow (121)
                    .setAlpha(0);
            }
            this.tweens.add({ targets: icon ? [arrow, icon] : arrow, x: side > 0 ? `-=${run}` : `+=${run}`,
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
            const p    = this.platforms[i];
            const half = p.slotSize / 2;
            if (Math.abs(dx - p.slotX) <= (p.dropHW || half) && Math.abs(dy - p.slotY) <= (p.dropHH || half)) {
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
            this.chargingSlots[bd.slotIndex] = { level: bd.level, distPerSec: cpm, batteryData: bd };
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
        // THE WORLD STOPS FOR THE AD — distance tick, tweens mid-flight, every
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
        slot.distPerSec = getBatteryChargeValue(lv);
        if (slot.batteryData) slot.batteryData.level = lv;
        const sbd = slot.batteryData;
        if (p.batterySprite && sbd && sbd.wheel) {
            sbd.wheel.ready = false;
            this.assets.dressSlotWhenReady(p.batterySprite, sbd.wheel, getBatteryIconLevel(lv));
        }
        if (p.batteryLevelText) p.batteryLevelText.setText(`PIGGY ${lv}`);
        p.chargeRateText.setText(this._rateText(slot.distPerSec));
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
        // is called at every level end now, so it must not be able to take the
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
        // Somewhere on screen to fall: mostly over the car area, the rest over the
        // panel, and never on top of a finger that is mid-drag.
        const spot = () => {
            const r = Math.random() < (S.CAR_SHARE !== undefined ? S.CAR_SHARE : 0.65)
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
            // field racing along under their finger would look broken.
            else this._fastForward(!this.draggingBattery);
        } else {
            this._fastForward(false);   // turned back before it ran
        }
        // The one thing stepped per frame: the cars' tyres. Everything else
        // that moves is tween- or timer-driven, and _setPaused stops those.
        this._raceStep(time, delta);
        this._roadCamFilter();
        this._spinWheels(delta);
        this._steerWheels(delta);
        this._placeLaneLabels();
        this._drawRoads(delta);
        this._drawSpeedFx(delta);
        this._peekFaces(delta);
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
const SAVE_VERSION = 3;   // 3: the level and each lane's chase
function saveKey() { return ((typeof CONFIG !== 'undefined' && CONFIG.SAVE) || {}).KEY || 'mergeDriver.save'; }

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
            distance: Number.isFinite(d.distance) ? Math.max(0, d.distance) : 0,
            level: int(d.level, 1) || 1,
            lanes: Array.isArray(d.lanes)
                ? [0, 1, 2].map((i) => {
                    const l = d.lanes[i] || {};
                    return { left: Number.isFinite(l.left) ? Math.max(0, l.left) : 0, caught: !!l.caught };
                })
                : null,
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
        // EVERY VILLAIN CAUGHT is a level that was about to turn: resume on the next.
        if (sv.lanes && sv.lanes.every((l) => l.caught)) { sv.level += 1; sv.lanes = null; }
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
