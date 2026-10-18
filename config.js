// Helper: convert CSS hex color string to Phaser hex number
function hexColor(cssColor) {
    if (typeof cssColor === 'string' && cssColor.startsWith('#')) {
        return parseInt(cssColor.substring(1), 16);
    }
    return cssColor;
}

// ONE GETAWAY CAR DESIGN (CONFIG.VILLAIN.CAR.CARS): graphics/villain_car/
// car_NN.webp and car_tyre_NN.webp, the body w x h, the tyre's
// square size, each tyre's top-left [x, y] in the body, and the head (FACE).
function getawayCarArt(n, w, h, tyre, rear, front, face) {
    const nn = String(n).padStart(2, '0');
    return {
        BODY: `graphics/villain_car/car_${nn}.webp`,
        TYRE: `graphics/villain_car/car_tyre_${nn}.webp`,
        BODY_W: w, BODY_H: h, TYRE_SIZE: tyre,
        TYRES: [{ x: rear[0], y: rear[1] }, { x: front[0], y: front[1] }],
        FACE: face,
    };
}

var CONFIG = {
    // Quotes are LOAD-BEARING. Phaser passes this straight into a canvas font
    // string, and a family with a space and a digit in it fails to parse
    // unquoted — silently, falling back to the system default with no error.
    FONT_FAMILY: '"Baloo 2", sans-serif',
    FONT_WEIGHT: '600',     // the ONE weight shipped in fonts/. Every label asks
                            // for this rather than 'bold', because 'bold' means
                            // 700 — which is not in the file, so the browser
                            // SYNTHESISES it by smearing the 600 sideways. That
                            // looks worst on small text with a stroke, which is
                            // most of this UI. Ship an 800 file and set this to
                            // '800' if the numbers want more weight.
    TEXT_COLOR: '#1A237E',

    // ── Screen split ──────────────────────────────────────────────────────────
    // Landscape puts the UI (grid, coin, spawn button, battery slots) on the LEFT
    // and the farm on the RIGHT. The farm is what the game is about, so it takes
    // the larger share: the UI needs only the grid panel's width plus margins.
    // Portrait stays a 50/50 top/bottom split — see calculateLayout().
    LAYOUT: {
        // THE UI HALF'S SHARE, and both numbers mean the same thing: what is
        // left goes to the car area. An even split either way.
        //
        //   LANDSCAPE  UI on the LEFT, car area on the right — share of the WIDTH
        //   PORTRAIT   UI at the BOTTOM, car area above — share of the HEIGHT
        LANDSCAPE_SPLIT: 0.5,
        // LANDSCAPE MERGE COLUMN (coin, grid, spawn button). On a half taller
        // than it needs, the column grows up to LANDSCAPE_GRID_GROW × its
        // width-fitted size (1 = never), its panel no wider than
        // LANDSCAPE_GRID_MAX_W of the half; then, with LANDSCAPE_CENTER, it is
        // centred as one block so leftover height splits above and below.
        LANDSCAPE_GRID_GROW:  1.15,
        LANDSCAPE_GRID_MAX_W: 0.9,
        LANDSCAPE_CENTER:     true,
        PORTRAIT_SPLIT:  0.5,

        // The design reference is a 1440x778 MacBook. REF_W is the UI half AT
        // THAT SPLIT, so changing the split alone never resizes the grid: the
        // scale works out to screenWidth/1440 either way.
        REF_W_PORTRAIT: 720,

        // The UI column's reference height — coin, panel, button, nothing else,
        // the same in both orientations now that the battery case has gone to
        // the farm half. Leave it unset to DERIVE it from those three, which is
        // what you want; a number here overrides the derivation and then the
        // grid scales against it.
        REF_H_COLUMN: 0,
    },

    // ── How figures are written ───────────────────────────────────────────────
    // Every number the player sees goes through _bigNum. Full figures while they
    // fit, a unit once they do not — the same rule everywhere, so two readouts
    // never write the same value differently.
    NUMBERS: {
        ABBREV_FROM: 1e5,   // below this the whole number is shown: 50000, not
                            // 50K. From here K takes over with up to three
                            // digits (100K … 999K), then M, B, T. Raise it and
                            // more of the run reads exactly; lower it and the
                            // readouts get narrower.
        SEPARATOR:   '',    // digit grouping, e.g. ',' for 50,000; '' for none
    },

    DEBUG_HALF_LINE: false,  // draw a line splitting partA / partB (vertical in
                             // landscape, horizontal in portrait)
    DEBUG_LAYOUT: false,     // log the canvas size, the layout's numbers and
                             // the camera split once at startup: [buffer],
                             // [layout], [camB], and the battery sprite count
    DEBUG_ORIENTATION: false, // [orient] logs: the frame size and stage chosen at
                             // boot, each portrait/landscape turn noticed, what
                             // holds a relayout back, and the stage it picks
    // HOW MANY BATTERY LEVELS ARE FETCHED AHEAD of the highest one reached.
    // Each icon is ~2.5KB — the whole set of 102 is 256KB — so this is nearly
    // free, and it is what keeps a fast run of merges from reaching a level
    // whose picture is still on its way.
    BATTERY_PREFETCH_AHEAD: 3,

    // ...and the WHOLE set, quietly, once the game is running: a few every
    // EVERY_MS until all 102 are in hand (~250KB in total). It never touches the
    // opening load — it waits for the loading screen to go — and it means a
    // player who loses signal mid-run can keep merging as far as they can get.
    BATTERY_BACKFILL: {
        ENABLED:  true,
        EVERY_MS: 900,
        BATCH:    4,        // icons per tick, so ~4.5 per second at the default
    },

    BATTERY_START_LEVEL: 1,
    // Coins a new run starts with. Default 2500; raise it to debug later levels.
    START_COINS: 2500,
    // THE ECONOMY. Coins come from catching villains — see levelData.js.
    ECONOMY: {
        SPAWN_COST_PER_LEVEL: 25,    // a spawn costs this × the spawn level
    },

     BACKGROUND: {
        // MATCHED TO THE CAR AREA'S GROUND — partB (the car area) has no
        // fill of its own; it is simply the canvas's own backgroundColor
        // showing through (set on the Phaser game config in game.js). Keeping
        // this the same value makes the seam between the two halves disappear
        // instead of reading as two different panels.
        GRADIENT_START_COLOR: "#e0c493",
        GRADIENT_END_COLOR: "#e0c493",
        // HOW OPAQUE THE PANEL CARD IS. It was 0 while the farm's own ground
        // sheet ran under both halves and was the better background; that sheet
        // went with the farm, so the card is what the UI half is made of now.
        OPACITY: 1,

        // THE SEAM between the two halves — the line that says these are two
        // different things rather than one continuous surface.
        SPLIT_LINE: {
            ENABLED: false,
            W:      3,          // px @ design scale
            COLOR:  0x7E6044,   // the tilled-soil brown, so the seam belongs to
                                // the ground it divides rather than to the UI
            ALPHA:  0.9,
        },

        // The UI PANEL's four corners, px @ design scale. 0 squares it off.
        // The fill is the panel half only; what shows through the notches the
        // rounding leaves is the canvas's own colour, matched to it in the page.
        CORNER_RADIUS: 0,
    },

    // ── The stage ─────────────────────────────────────────────────────────────
    // The game renders at ONE fixed size, chosen once at boot, and the canvas is
    // scaled by the browser to whatever the window is. Resizing then changes
    // nothing inside the game: no rebuild, no reflow, and so no progress to
    // lose. It replaces a scene restart that reset the run every time the window
    // moved, and it is what shipped Poki games do.
    //
    // The layout is picked from the window's shape at BOOT and never changes
    // again. Squeezing a desktop window tall leaves the game in landscape with
    // bars rather than reflowing into the phone layout — a desktop player
    // narrowing a window has not become a phone.
    //
    // It also settles a question that had no answer before: on-screen tile size
    // used to follow the viewport and ranged 49-131px, so no asset had a
    // provably correct export size. The farm half is now a constant, so a tile
    // is ONE number and every asset can be sized against it exactly.
    STAGE: {
        ENABLED: true,
        // ONLY THE WIDTH IS FIXED. Height is taken from the window's own aspect
        // at boot, so the stage matches the screen exactly and there are no bars
        // to begin with — a fixed 16:9 stage letterboxes on nearly every real
        // phone, none of which are 16:9 any more.
        //
        // Width is the half that must be constant, because tile size is the farm
        // half's width divided by the map's columns. Height is free: the world
        // scrolls vertically, so a taller stage simply shows more of it.
        //
        // The clamps stop a freak window from producing an absurd stage — a very
        // wide-and-short desktop window, or a phone-shaped browser on a monitor.
        // Beyond them you get bars again, which is the correct outcome.
        PORTRAIT:  { W: 1080, H: 1920, MIN_RATIO: 1.30, MAX_RATIO: 2.40 },
        LANDSCAPE: { W: 1920, H: 1080, MIN_RATIO: 0.45, MAX_RATIO: 0.80 },
        // false pins the stage to the H above, ignoring the window's shape.
        DERIVE_HEIGHT: true,
        // FIT      letterboxes: the whole game always visible, bars on a
        //          mismatched aspect, nothing ever cut off.
        // ENVELOP  fills the window and crops the overflow. No bars, but it eats
        //          the edges of a 22-column field — so FIT is the safer default
        //          for a game whose playfield spans the full width.
        MODE: 'FIT',
        // null decides from the window's shape at boot. 'portrait' / 'landscape'
        // pins it, which is how you test one layout on the other device.
        FORCE: null,
        // ON A TURN between portrait and landscape the game re-lays itself out
        // once whatever is mid-animation has landed (see _relayout in game.js).
        // Until then time runs this many times faster, so that wait is a few
        // frames rather than a second or two of the old layout on the new
        // screen. 1 waits at normal speed.
        RELAYOUT_FAST_FORWARD: 25,
        // How long a new shape has to hold before the game re-lays out for it,
        // ms — a turn passes through in-between sizes on the way round.
        RELAYOUT_DEBOUNCE_MS: 100,
        // A RESHAPE — same orientation, but a frame whose shape would give a
        // stage height more than this share away from the current one —
        // re-lays the game out too, once the size has held still for
        // RESHAPE_DEBOUNCE_MS. Under it (a phone's toolbar sliding), FIT just
        // scales. -1 turns reshapes off: only a turn re-lays out.
        RESHAPE_TOLERANCE:   0.05,
        RESHAPE_DEBOUNCE_MS: 250,
    },

    // ── Level art, loaded as levels come near ─────────────────────────────────
    // A level's OWN art — its crops, animals, produce, buildings, farmer and
    // any tile sheet only its map uses — is fetched when that level is about to
    // be built, not all up front. Shared art (canal and terrain sheets, the
    // trencher, lilies, block, fence poles, UI) still loads before play.
    //
    // What a level needs is read from its level entry and its map, both of
    // which ARE loaded up front — they are a few KB — so nothing has to be
    // listed by hand.
    //
    // The world is built a margin ahead of the view (ENDLESS.FILL_AHEAD). A
    // level whose art has not arrived simply waits to be built, and the margin
    // is what keeps that wait off screen. The loading screen stays up until
    // everything the opening view needs is built.
    // [timing] lines in the console: how long each stage before play took, and
    // the slowest downloads. For finding where the loading time goes; turn off
    // before release.
    DEBUG_LOAD_TIMING: false,

    // ── SAVING ──────────────────────────────────────────────────────────────
    // The run is kept in the browser (localStorage) so a refresh does not lose
    // it: coins, level and how far each plot is picked, every pig in the grid
    // and slots, the spawn button's level, and which tutorials are done.
    // Written every EVERY_MS and when the page is hidden or closed.
    //   LOAD false  — ignore any save at boot (always start fresh), still write
    //   ENABLED false — no saving or loading at all
    //   Add ?newgame to the page's address to wipe the save and start over.
    SAVE: {
        ENABLED:  false,   // OFF FOR NOW: every load starts fresh, nothing is saved
        LOAD:     true,
        KEY:      'mergeDriver.save',
        EVERY_MS: 2000,
    },

    LAZY_LEVELS: {
        // All that is left of per-level loading: the backstop that lifts the
        // loading screen anyway, so a stalled download cannot lock the player out.
        SCREEN_TIMEOUT_MS: 20000,
    },

    BUTTON: {
        SPAWN_WIDTH: 250,
        SPAWN_HEIGHT: 90,
        // THE SPAWN BUTTON'S FACE — the grid's wooden frame (CELL.GRID_PANEL_WOOD),
        // drawn at the button's size, no art.
        WOOD: {
            RADIUS:   24,          // px @ design
            FILL:     "#fdf5e3",   // the cream inside
            MAX_WOOD: 0.2,         // the wood band never takes more than this share of the height
            THICKNESS: 0.875,      // × the grid's wood width (CELL.GRID_PANEL_WOOD.WIDTH)
            // THE CREAM AS A RAISED PAD, not a sunk tray like the grid's: no dark
            // lip, a darker strip under it for thickness, a light line on top.
            // null = the grid's tray look.
            RAISED: {
                SHADE:     "#e3cba0",  // the pad's thickness, along its bottom
                EDGE:      4,          // px @ design of that strip
                HIGHLIGHT: "#ffffff",  // the line along its top
            },
        },
        BOTTOM_PADDING: 70,
        BATTERY_ICON_WIDTH: 64,
        BATTERY_ICON_X: -80,
        COIN_TEXT_X: 20,
        COIN_ICON_WIDTH: 50,
        COIN_ICON_X: 80,
    },

    AD: {
        DURATION: 15,  // Duration of mock ad in seconds (countdown timer)
        OVERLAY_COLOR: "#000000",
        OVERLAY_ALPHA: 1.0,  // Fully opaque - blocks game view completely
        TIMER_TEXT_SIZE: '120px',
        TIMER_TEXT_COLOR: '#FFFFFF',
        // ABOVE THE COUNTDOWN — a bare number said "waiting" without saying
        // what for. This says it once, and stays up the whole time rather
        // than counting down itself.
        REWARD_TEXT:       'Reward in progress',
        REWARD_TEXT_SIZE:  '40px',
        REWARD_TEXT_COLOR: '#FFFFFF',
        REWARD_TEXT_GAP:   20,   // clearance above the countdown number, px
    },

    MERGE_GRID: {
        PADDING_FROM_BUTTON_TOP: 50,
        // PANEL_DROP is gone: it opened room above the grid for the battery
        // case, and the case has moved to the farm half.
    },

    COIN_COUNTER: {
        TEXT_SIZE: '48px',
        TEXT_COLOR: '#1c1c1c',         // dark on a white outline, as the lead figure
        TEXT_STROKE_COLOR: '#ffffff',
        TEXT_STROKE_THICKNESS: 6,
        COIN_ICON_WIDTH: 40,
    },

    CELL: {
        SIZE: 130,
        GAP: 4,
        RADIUS: 15,
        EMPTY_BG_COLOR: "#e8d2a6",     // a sunken tan, so an empty cell reads as a hole
        FILLED_BG_COLOR: "#fdf5e3",    // warm cream card under a piggy
        INSET_SHADOW_COLOR: "#b48a58", // the soft brown rim round every cell
        EMPTY_DASH_COLOR: "#c9a873",   // dashed line inside an EMPTY cell; null = none
        INSET_BORDER_WIDTH: 3.5,
        // Grain over the flat cell colour. ui/merge-grid/cell_noise.webp is neutral
        // grey with blurred noise, blended over the fill when the cell faces are
        // baked — so this is the same composite you would build in an image
        // editor, except the colour underneath stays a config value and one
        // grain file serves every face. A change here needs a reload.
        NOISE: {
            ENABLED:  true,
            BLEND:    'overlay',       // 'overlay' | 'soft-light' | 'multiply'
            CONTRAST: 2,               // stretch the tile before blending. The
                                       // file is blurred noise spanning only
                                       // ±18% around neutral grey, so without
                                       // this an editor-style 7% alpha lands
                                       // under a level of 255 — invisible
            ALPHA:    0.25,            // strength of the blend, AFTER contrast.
                                       // Felt rather than seen: ~2 levels of 255
                                       // on a light cell
            TILE:     1,               // 1 = tile stretched to the cell.
                                       // 0.5 = blown up 2× → coarser grain
        },
        // LANDSCAPE / DESKTOP figures. A 64px battery in a 130px cell, with the
        // label parked 40px BELOW it — sized by eye against a big screen, where
        // there is room to spare and the cell can breathe. The label sits under
        // the tool because a pair of scissors reads from its handles down, and
        // a number over the blades was landing in the middle of the art.
        // ── THE ICON'S SHARE OF THE CELL ────────────────────────────────
        // The cell is padded, the label takes its share of the BOTTOM, and the
        // icon takes everything that is left, with its top edge hard against
        // the top padding line.
        //
        // Both orientations derive it now. The authored figures just below were
        // measured against a desktop cell with room to spare, and left a 64px
        // icon adrift in the middle of a 130px cell with air all round it —
        // fine for a thin tool standing on its own, wrong for a character that
        // is meant to fill its cell. Set this false to go back to them
        // (landscape only: portrait has always derived — see MOBILE).
        FIT_TO_CELL: true,
        // The art's own WIDTH / HEIGHT. The icon is fitted inside the space
        // above the label at this ratio so it is never stretched to reach an
        // edge: 1 for a square canvas, >1 for art wider than it is tall. A
        // character with the tool held out to one side is usually wider than
        // square — measure the file rather than guessing, because too large a
        // number here shrinks the icon to fit a width it does not need.
        ICON_ASPECT: 1,
        // THE PIG IS THE TOP-LEFT ICON_PIG_PX SQUARE of every item's art, in
        // the file's own pixels. That square is what fills the cell's icon box;
        // anything the canvas has past it (the tool) spills out over the edges
        // at the same scale rather than being squeezed in. See fitItemIcon.
        ICON_PIG_PX: 128,
        BATTERY_DISPLAY_SIZE: 64,
        BATTERY_Y_OFFSET: 5,
        // A NEAR-BLACK, not pure black — softer contrast, and the same warm
        // dark brown already used for label strokes elsewhere (LABEL_STROKE,
        // CROPS.YIELD_LABEL.STROKE) rather than a second dark tone.
        LEVEL_TEXT_COLOR: '#2b2013',
        LEVEL_TEXT_Y_OFFSET: 40,   // + is BELOW the icon

        // ── PORTRAIT: FILL THE CELL ─────────────────────────────────────────
        // The same figures on a phone are a battery half the width of its cell
        // and a label under 8px — legible on a desktop at arm's length and not
        // on a phone at all. The cell itself is not the problem; the content
        // sitting in the middle of it is.
        //
        // So portrait DERIVES all four instead of scaling them: pad the cell top
        // and bottom, give the label its share of what is left, and the battery
        // takes the rest. Nothing is chosen by eye — the cell's own height is
        // the only input, so it stays right at any phone size.
        //
        // The label goes ABOVE the battery, which is the order the desktop
        // offsets already put them in.
        MOBILE: {
            ENABLED:    true,
            // TOP AND BOTTOM PADDING, as a SHARE of the cell — not a fixed
            // number of design pixels.
            //
            // The battery takes the whole remainder, so its edge lands exactly
            // on this line, and the cell draws its own INSET_BORDER_WIDTH (3.5)
            // stroke inside its bounds. A 4px pad therefore left about half a
            // pixel between the battery's ink and that stroke — the padding was
            // being applied and there was nothing to see.
            //
            // A share scales with the cell instead, so the gap reads the same on
            // every device, and PAD_MIN keeps it clear of the border on the
            // smallest one.
            PAD_FRAC:   0.07,   // of the cell's side, each end
            PAD_MIN:    6,      // ...but never less than this, px @ design scale
            GAP:        1,      // between the label and the battery
            TEXT_SHARE: 0.24,   // the label's share of the padded height
            LINE:       1.28,   // font size vs the line box it has to fit — type
                                // is measured with its ascenders and descenders,
                                // so asking for a 20px line means asking for
                                // about 16px of type
            TEXT_SCALE: 0.9,    // ...and then this much of that. LINE is the
                                // arithmetic — what fits — and this is taste:
                                // the label filling its slot exactly reads as
                                // shouting next to the battery. Kept apart so
                                // neither has to pretend to be the other
        },
        DRAGGABLE_BG_COLOR: "#FFFFFF",
        DRAGGABLE_BG_ALPHA: 0,
        GRID_PANEL_PADDING: 18,        // the panel is a drawn rounded square now,
                                       // so this is real padding around the cells
                                       // rather than the old art's baked margin
        GRID_PANEL_COLOR: "#f1dfba",   // the cream tray the cells sit in
        GRID_PANEL_RADIUS: 26,         // px @ design scale
        GRID_PANEL_BORDER_COLOR: "#8a5a32",   // the frame's dark outer edge
        GRID_PANEL_BORDER_WIDTH: 3,
        // THE WOODEN FRAME, drawn — no art. A band of wood inside the padding
        // (WIDTH must stay under GRID_PANEL_PADDING, the rest is cream tray),
        // lighter on top and darker below so it reads as rounded, with a few
        // grain strokes, a top highlight and a dark lip where it meets the tray.
        GRID_PANEL_WOOD: {
            WIDTH:        10.4,        // px @ design, outer edge included
            INNER_ROUND:  0.6,         // inner rings keep at least this × the outer radius
            COLOR:        "#c98d52",   // the wood's face
            DARK:         "#b07840",   // its lower, shaded side
            BEVEL:        3,           // px @ design of that darker strip at the bottom
            GRAIN_COLOR:  "#9a6434",
            GRAIN_ALPHA:  0.28,
            HIGHLIGHT:    "#ebbb82",   // the thin light line along the top
            LIP_COLOR:    "#9a6a3e",   // ring between wood and tray
            LIP:          2,           // px @ design
            SHADOW_COLOR: "#000000",   // drop shadow under the whole panel
            SHADOW_ALPHA: 0.18,
            SHADOW_Y:     5,           // px @ design
        },
    },

    SPAWN_ANIMATION: {
        INITIAL_SCALE_X: 1.15,
        INITIAL_SCALE_Y: 0.85,
        STRETCH_SCALE_X: 0.9,
        STRETCH_SCALE_Y: 1.1,
        STRETCH_DURATION: 150,
        BOUNCE_SCALE_X: 1.05,
        BOUNCE_SCALE_Y: 0.975,
        BOUNCE_DURATION: 100,
        SETTLE_DURATION: 80,
    },

    POINTER: {
        TUTORIAL_ENABLED: true,        // the start mask + spawn-button pointer
        SCALE: 1,
        FILL_COLOR: "#ffd251",
        STROKE_COLOR: "#6d5727",
        STROKE_WIDTH: 3,
        OFFSET_Y: 20,
        ANIMATION_MOVE_UP: 12,
        ANIMATION_SCALE_DOWN: 0.9,
        ANIMATION_DURATION: 200,
        ANIMATION_YOYO: true,
        ANIMATION_REPEAT: -1,
        TUTORIAL_START_DELAY: 500,
        TUTORIAL_FADE_DURATION: 500,
        TUTORIAL_MASK_COLOR: "#000000",
        TUTORIAL_MASK_OPACITY: 0.75,
    },

    MERGE_TUTORIAL: {
        ENABLED: true,                 // the swap-to-merge hand animation
        ANIMATION_DURATION: 1000,
        ANIMATION_REPEAT: -1,
        ANIMATION_EASE: 'Sine.easeInOut',
    },

    // ── "PUT ONE HERE" ────────────────────────────────────────────────────────
    // The step after merging. Having made a bigger battery, the player has no
    // reason to guess that it goes in a slot — so an arrow drops toward each of
    // the three, saying where without saying anything.
    //
    // It waits DELAY_MS after the merge lesson ends rather than replacing it on
    // the spot: two hints in the same second read as one busy screen, and the
    // merge wants a beat to land before the next thing asks for attention.
    //
    // It leaves the moment ANY slot is filled. The lesson is "batteries go in
    // slots", and one battery in one slot proves it was learnt — holding the
    // arrows over the remaining two would turn a hint into nagging.
    SLOT_HINT: {
        ENABLED:   true,
        DELAY_MS:  900,      // after a merge. A beat for the merge to land, not
                             // a wait — at three seconds the player has already
                             // started looking for the next thing to do, and the
                             // arrows arrive as an answer to a question they
                             // gave up on
        SIZE:      23,       // arrow LENGTH along the way it points, px @ design
                             // scale. Drawn in code, the same shape as the
                             // roster's pointer, so the game has one arrow
        W_FRAC:    1.35,     // its width across, as a fraction of that length
        // PORTRAIT POINTS SIDEWAYS. The battery case stands on its end there and
        // the three slots are stacked, so an arrow above a slot sits on top of
        // the slot above it. Beside the case, pointing IN, is the only reading
        // that stays clear — and it crosses the case's side edge the same way
        // the landscape one crosses its top.
        SIDE_GAP:  0.12,     // gap from the case's side edge, in slot widths
        // IT CROSSES THE CASE'S TOP EDGE rather than hovering above it. Ending
        // outside the slot leaves the arrow pointing at a boundary; driving it
        // INTO the slot is what says "in here" rather than "down there".
        TRAVEL:      0.193,  // how far it travels down, in slot heights.
                             // Trimmed evenly at both ends — 15% of the run off
                             // each — so the stroke shrank about its own middle
                             // and the arrow did not drift up or down with it
        MS:        253,      // one stroke, down and back (was 380 — 50% faster)
        EASE:     'Sine.easeInOut',
        FADE_MS:   260,      // in when it appears, out when a slot is filled
    },

    // THE PIG, TO THE LEFT OF THE ARROW. graphics/ui/merge-grid/piggy_icon.webp
    // (see assets.js) — an outline-only pig, drawn as-is (no tint) and placed just
    // behind where the arrow's
    // stroke begins, so together "pig, arrow, slot" reads as "drag this here"
    // rather than an arrow pointing at nothing in particular.
    HINT_ICON: {
        ENABLED:   true,
        SIZE:      48,       // px @ design scale
        GAP:       4,        // clearance between the icon and the arrow's
                             // own tail, px @ design scale
        ALPHA:     1,
    },

    COIN_REWARD_ANIMATION: {
        COIN_COUNT: 16,                // a shower, not a trickle
        REWARD_COIN_SIZE: 64,          // px @ design scale; the counter's own
                                       // icon is 40, so these arrive larger than
                                       // the thing they land on and shrink into it
        ARRIVE_FRAC: 1.1,              // the size a coin LANDS at on the counter,
                                       // as a fraction of its flying size (was 0.55)
        BURST_RADIUS: 55,             // how far they scatter first, px @ design
        BURST_MS:     260,             // …and how long that throw takes
        TOP_SPEED_DURATION: 600,
        SPEED_VARIATION: 0.15,
        STAGGER_DELAY: 50,
        INITIAL_STACK_OFFSET: 0,
        EASE: 'Power2',
        PUNCH:    0.16,                // how hard the counter's icon knocks back
        PUNCH_MS: 110,                 // as each coin lands

        // ── THE SHOWER ───────────────────────────────────────────────────────
        // Coins are THROWN OUT from wherever the payout happened — the bank
        // that just burst, most of the time — to scattered spots across the
        // WHOLE screen, the merge grid included, then swept to the counter.
        // The motion goes where the eyes already are, and it starts from where
        // the coins were actually earned rather than blinking into existence
        // at random. ENABLED false falls back to a burst from the farmer who
        // paid.
        //
        // Nothing here can be touched, so a drag runs straight through it.
        SCATTER: {
            ENABLED:  true,
            SIZE:     34,       // px @ design scale. SMALLER than the single
                                // flight's coins: there are many, they move, and
                                // they are over the board
            CAR_SHARE: 0.65,    // the share landing on the car area; the rest
                                // fall over the panel and the grid
            AVOID_POINTER: 90,  // px @ design scale kept clear of a finger that
                                // is mid-drag
            OUT_MS:      180,   // how long the throw from the source to its
                                // landing spot takes — QUICK, on purpose: this
                                // is a coin leaving the bank, not one falling
                                // out of the sky
            POP_MS:      180,   // falls back for OUT_MS if that is unset, and
                                // still the duration used on any older caller
                                // that never gave a source to throw coins FROM
            POP_STAGGER: 22,    // between one coin's throw and the next, so it
                                // sprays rather than leaving all at once
            SWEEP_MS:    520,   // the run to the counter
            STAGGER:      0,    // between one coin's sweep start and the next.
                                // 0 = all leave together and, sharing one
                                // duration, ALL ARRIVE AT THE SAME INSTANT.
                                // Raise it (was 26) to spread the arrivals.
        },
    },

        // Platform stripes (top half) with battery slot on left, gadget on right
    // ── Battery slots ─────────────────────────────────────────────────────────
    // Three slots in one battery-shaped case. In LANDSCAPE they sit in the UI
    // half above the grid; in portrait they stay at the foot of the farm half.
    // The slot SIZE is derived, not set: the three take the row's full width
    // less the gaps, capped at ONE GRID CELL — a battery in a slot should look
    // like a battery in a cell. (See createSlots / calculateLayout.)
    PLATFORM: {
        SLOT_SIZE: 130,                // reference slot square (px) — the ratio
                                       // every slot-derived size is measured in
        SLOT_RADIUS: 15,               // corner radius (px)
        SLOT_EMPTY_ALPHA: 0,           // an EMPTY slot's face: 0 is no face at
                                       // all — just the rim, with the brown
                                       // ground inside it, so it reads as empty
                                       // rather than as another colour. Filled,
                                       // the slot takes its grained face as ever
        CHARGE_RATE_ABOVE: true,       // the charge-rate figure OVER its slot,
                                       // level with the distance lines over
                                       // the cars; false puts it under
        CHARGE_RATE_GAP: 2,            // gap (px) between the slot's edge and
                                       // the charge-rate figure. The font's
                                       // own padding adds to this on screen
        // THE DROP ZONE round each slot — bigger than the slot, centred on
        // it, as far each way as the other. X and Y are shares of the most it
        // may spread: across, to the edge of the race's half (the grid's side
        // in landscape, the screen's in portrait); up and down, to halfway to
        // the next slot (and never past the race's half), so no two overlap.
        // 0 is the slot itself.
        DROP_ZONE: { X: 1, Y: 1 },
    },

    // ── THE ROAD ─────────────────────────────────────────────────────────────
    // The only scenery: one thin line per lane at its ground level — the line
    // the tyres of both cars stand on — with small marks along it (dashes
    // on the line, pebbles under it) and a few real BUMPS in it, all sliding
    // BACKWARDS while the lane's car is driving, so the car reads as moving.
    // They run in step with the tyres' spin (CAR.SPIN_*), starting, coasting
    // and stopping with them. The tyres ride over the bumps and the body
    // follows on its springs (SUSPENSION). In a finish the road is carried by
    // the finish line (RACE).
    ROAD: {
        LINE_COLOR:  '#a3825c',
        LINE_W:      3,          // px @ design
        MARK_COLOR:  '#7e6044',
        THICK:       12,         // px @ design: the road strip's depth under its line (0 = just the line)
        FILL_COLOR:  '#c9a77c',  // the strip
        SPEED:       420,        // px/s @ design the marks slide at, full speed
        PERIOD:      420,        // px @ design before the pattern of marks repeats
        MARKS:       8,          // marks in one period
        DEPTH:       3.8,        // under the cars

        // THE BUMPS: smooth rises in the road, H px high and W px long
        // (@ design), each a random 70–100% of that. RARE, so each one reads
        // as an event: one every EVERY px of road (@ design) on level 1 —
        // about every 5–6 seconds at SPEED — coming closer together level by
        // level down to EVERY_MIN at level MIN_AT_LEVEL and after.
        BUMPS: { H: 6, W: 80, EVERY: 2400, EVERY_MIN: 1000, MIN_AT_LEVEL: 30 },
        SAMPLE: 4,               // px @ design between points of the drawn road

        // THE TERRAIN: each level's road its own shape, for variety — not
        // difficulty (it is only drawn; speed and leads are untouched). A
        // road is a run of SHAPES with flat GAPs between, picked from the
        // level's MOOD. Fixed per level and lane (hashed), so a rebuild draws
        // the same road. Flat for FLAT_START at the start, and flat from the
        // screen's right edge once a lane's finish begins.
        //   L   the shape's length, px @ design ([min, max])
        //   H   its height, px @ design (up is +; a dip is negative)
        //   RAMP  a plateau's climb and descent, px @ design
        //   N   a washboard's bumps
        TERRAIN: {
            ENABLED:     true,
            FLAT_START:  1200,       // px @ design flat at a level's start (at least the screen's width)
            GAP:         [250, 700], // px @ design of flat road between shapes
            FLAT_LEVELS: 2,          // levels 1..this: no terrain at all (the bumps only)
            CALM_EVERY:  5,          // and every this-th level after: a breather
            SHAPES: {
                swell:     { L: [600, 900],  H: [8, 14] },
                hill:      { L: [380, 600],  H: [14, 22] },
                dip:       { L: [320, 480],  H: [-12, -7] },
                plateau:   { L: [700, 1100], H: [12, 18], RAMP: [220, 300] },
                washboard: { L: [300, 450],  H: [3, 5], N: [3, 5] },
                straight:  { L: [400, 900] },   // just more flat road
            },
            // THE MOODS: how often each shape comes up (weights). A level's
            // mood is hashed from its number, never the same twice running.
            MOODS: {
                calm:    { straight: 3, swell: 2 },
                rolling: { swell: 3, dip: 2, straight: 1 },
                hilly:   { hill: 3, plateau: 2, straight: 1 },
                bumpy:   { washboard: 3, dip: 1, swell: 1, straight: 1 },
            },
        },
    },

    // ── THE SUSPENSION ───────────────────────────────────────────────────────
    // Hill Climb Racing style: the tyres follow the road under them, and the
    // body hangs on two springs, one over each tyre. A tyre going over a bump
    // squashes its spring, which lifts that end of the body — front first,
    // then rear, so the car pitches over each bump and settles.
    //   STIFFNESS  how fast the springs answer (rad/s): higher is stiffer
    //   DAMPING    how quickly they settle: 1 = no wobble, lower = bouncier
    //   MAX        the most a spring may stretch or squash, px @ design — the
    //              lanes are close, so the body never leaves its own lane
    SUSPENSION: {
        STIFFNESS: 16,
        DAMPING:   0.35,
        MAX:       9,
    },

    // ── THE RIVALS ───────────────────────────────────────────────────────────
    // One per lane, three to a level, all the same rival — its car a new
    // design each level (CAR.CARS), its driver's head in the window from the
    // rival pictures: level 1 wears FILES[0], level 2 FILES[1], level 3
    // FILES[2], level 4 FILES[0] again, and so on. (The key is still called
    // VILLAIN from the game's earlier life; it is the rival.) See CONFIG.RACE
    // for the race itself.
    VILLAIN: {
        // Head-only art: the shortest side is the face (128 px), ears / horns
        // grow the other side. Placed by the bottom centre.
        DIR:   'graphics/opponent/',
        FILES: ['mouse_rookie.webp', 'bunny_sprinter.webp', 'chick_racer.webp',
                'frog_hopper.webp', 'squirrel_dash.webp', 'puppy_rookie.webp',
                'kitten_racer.webp', 'duck_driver.webp', 'hamster_turbo.webp',
                'goat_kid.webp', 'red_panda.webp', 'raccoon_bandit.webp',
                'koala_cruiser.webp', 'beaver_builder.webp', 'fox_racer.webp',
                'sheep_challenger.webp', 'panda_pilot.webp', 'deer_racer.webp',
                'otter_driver.webp', 'owl_racer.webp', 'crow_rival.webp',
                'penguin_driver.webp', 'parrot_racer.webp', 'rooster_speedster.webp',
                'eagle_challenger.webp', 'turtle_racer.webp', 'chameleon_driver.webp',
                'gecko_racer.webp', 'crocodile_kid.webp', 'snake_racer.webp',
                'monkey_driver.webp', 'gorilla_racer.webp', 'lemur_racer.webp',
                'sloth_driver.webp', 'tiger_racer.webp', 'leopard_racer.webp',
                'lion_challenger.webp', 'wolf_racer.webp', 'hyena_driver.webp',
                'bear_racer.webp', 'polar_bear.webp', 'moose_racer.webp',
                'ram_driver.webp', 'bull_driver.webp', 'bison_driver.webp',
                'rhino_driver.webp', 'hippo_driver.webp', 'elephant_racer.webp',
                'giraffe_driver.webp', 'zebra_racer.webp', 'bat_racer.webp',
                'hedgehog_driver.webp', 'porcupine_racer.webp', 'skunk_racer.webp',
                'badger_driver.webp', 'coyote_racer.webp', 'lynx_driver.webp',
                'kangaroo_racer.webp', 'capybara_racer.webp', 'alpaca_racer.webp',
                'axolotl_racer.webp', 'dragon_rival.webp', 'robot_rival.webp',
                'alien_racer.webp', 'crowned_raven_champion.webp'],
        DEPTH:         4,
        PAYOUT_MULT:   1,        // coins = its lead × this (levels 1–2 are flat)
        PREFETCH_AHEAD: 4,       // levels ahead whose rival heads load in the background (only level 1's is in the startup load)

        NEXT_LEVEL_MS: 900,      // (no rank panel) pause after the last win before the next level
        ENTER_MS:      400,      // a new level: the piggy cars roll back to the line in this + 200

        // THE LEAD FIGURE over each lane (placed by RACE.LEAD).
        LABEL: {
            SIZE:     30,        // px @ design
            COLOR:    '#ffffff',
            STROKE:   '#2b2013',
            STROKE_W: 5,
            SUFFIX:   '',        // no unit: a count to zero, not a distance
        },

        // THE RIVAL'S CAR: a right-facing body and tyres (CARS, a new design
        // each level), the driver's head in its window, drawn BEHIND the
        // piggy car. It rides the road with it: tyres spinning, bumps and
        // suspension.
        CAR: {
            TINT:    '#eeeeee',    // a colour to tint the body with, or null for none
            SCALE:   1,            // of the piggy car's size
            PREFETCH_AHEAD: 2,     // levels ahead whose car designs load in the background (only level 1's is in the startup load)
            MIN_H:   0.9,          // never lower than this share of the piggy car's height: a low design is drawn longer instead (open ?cartest to compare)
            DEPTH:   3.9,          // behind the piggy car (CAR.DEPTH 4)
            // The head in the window, in the BODY's pixels (254 x 97): its
            // centre at X, Y and its face (the picture's shortest side) H —
            // ears / horns grow past it.
            FACE: { X: 126, Y: 28, H: 40 },
            // THE HEAD ON EVERY CAR (and the VS card): grown past FACE.H, and
            // sunk behind the door — its bottom CROP cut off exactly at the
            // window's bottom edge (FACE.S, measured from each car's art; or
            // Y + H/2 without it). The extra size grows up, over the roof.
            HEAD: {
                SCALE: 1.35,       // x FACE.H
                CROP:  0.1,        // share of the head's height hidden below the window's bottom edge
            },
            // THE LOOK BACK: the driver stays down out of sight — only the
            // window shows — and pops up from the sill to glance back only at
            // milestones, as the piggy car runs down each share of the lead in
            // AT, staying up SHOW seconds (a random time in the range). Beaten,
            // it stays up. ENABLED false keeps it up the whole time.
            PEEK: {
                ENABLED: true,
                AT:      [0.2, 0.4, 0.6, 0.8, 0.95],   // shares of the distance covered
                SHOW:    [1, 1.6],   // s up per look
                UP_MS:   160,        // popping up (0: just there)
                DOWN_MS: 0,          // ducking back down (0: just gone, no animation)
            },
            // THE RIVAL CAR DESIGNS — a NEW ONE EVERY LEVEL, in this order,
            // starting over once all have been used: a right-facing body and
            // its tyre, laid out like CONFIG.CAR — BODY_W x BODY_H art px,
            // TYRE_SIZE square tyres with their TOP-LEFT corners at TYRES
            // (rear, front) — and the driver's head (FACE, as above) in this
            // body's own driver's window: its cut edge on the window's sill,
            // the ears over the roof; S is the glass's bottom edge. With none here (or the art missing) the
            // piggy car's body stands in, with FACE above.
            CARS: [
                getawayCarArt(1, 207, 104, 56, [20, 65], [126, 65], { X: 100, Y: 27, H: 36, S: 45 }),   // yellow city car
                getawayCarArt(2, 256,  72, 56, [22, 34], [163, 34], { X: 110, Y: 17, H: 30, S: 32 }),   // red muscle car
                getawayCarArt(3, 256, 119, 65, [29, 75], [156, 75], { X: 113, Y: 40, H: 40, S: 59 }),   // green SUV
                getawayCarArt(4, 256, 100, 58, [28, 63], [173, 63], { X: 135, Y: 27, H: 36, S: 44 }),   // teal classic
                getawayCarArt(5, 256,  91, 53, [29, 60], [175, 60], { X: 135, Y: 19, H: 38, S: 37 }),   // dark sedan
                getawayCarArt(6, 256,  77, 56, [19, 39], [157, 39], { X: 112, Y: 17, H: 30, S: 30 }),   // blue sports car
                getawayCarArt(7, 256, 101, 54, [30, 67], [176, 67], { X: 143, Y: 30, H: 36, S: 49 }),   // orange wagon
                getawayCarArt(8, 256, 114, 60, [25, 75], [169, 75], { X: 138, Y: 34, H: 40, S: 50 }),   // cream city car
                getawayCarArt(9, 304, 102, 64, [38, 62], [216, 62], { X: 168, Y: 28, H: 38, S: 44 }),   // red pickup
                getawayCarArt(10, 307, 129, 64, [34, 85], [220, 85], { X: 214, Y: 42, H: 44, S: 60 }),  // blue van
                getawayCarArt(11, 288,  73, 49, [30, 43], [208, 43], { X: 150, Y: 18, H: 30, S: 29 }),  // purple limo
                getawayCarArt(12, 256, 150, 68, [30, 103], [162, 103], { X: 125, Y: 54, H: 50, S: 71 }), // mint bubble car
                getawayCarArt(13, 280,  81, 53, [32, 47], [196, 47], { X: 122, Y: 24, H: 34, S: 36 }),  // red fastback
                getawayCarArt(14, 256, 126, 65, [28, 82], [160, 82], { X: 122, Y: 39, H: 40, S: 56 }),  // green off-roader
                getawayCarArt(15, 256,  84, 48, [32, 52], [181, 52], { X: 138, Y: 22, H: 34, S: 35 }),  // cream sedan
                getawayCarArt(16, 256,  87, 58, [30, 52], [171, 52], { X: 118, Y: 25, H: 32, S: 38 }),  // yellow coupe
                getawayCarArt(17, 300, 125, 69, [28, 85], [205, 85], { X: 190, Y: 37, H: 44, S: 55 }),  // blue minivan
                getawayCarArt(18, 252,  66, 45, [36, 37], [178, 37], { X: 115, Y: 16, H: 28, S: 25 }),  // maroon coupe
                getawayCarArt(19, 256,  97, 56, [18, 57], [167, 57], { X: 112, Y: 24, H: 34, S: 38 }),  // red hatchback
                getawayCarArt(20, 270,  94, 54, [34, 60], [184, 60], { X: 158, Y: 23, H: 36, S: 38 }),  // blue pickup
                getawayCarArt(21, 256,  97, 45, [35, 67], [181, 67], { X: 145, Y: 27, H: 34, S: 40 }),  // olive classic
                getawayCarArt(22, 260,  73, 53, [34, 35], [175, 35], { X: 132, Y: 18, H: 28, S: 30 }),  // orange sports car
                getawayCarArt(23, 260,  89, 47, [35, 59], [185, 59], { X: 148, Y: 25, H: 34, S: 39 }),  // grey estate
                getawayCarArt(24, 280, 139, 65, [35, 97], [189, 97], { X: 168, Y: 45, H: 44, S: 64 }),  // yellow van
                getawayCarArt(25, 256,  94, 53, [27, 58], [177, 58], { X: 120, Y: 23, H: 36, S: 38 }),  // teal hatchback
                getawayCarArt(26, 256,  73, 47, [29, 44], [181, 44], { X: 140, Y: 17, H: 28, S: 28 }),  // dark green sedan
                getawayCarArt(27, 256,  94, 55, [26, 61], [180, 61], { X: 145, Y: 28, H: 36, S: 41 }),  // red estate
                getawayCarArt(28, 256,  93, 63, [17, 50], [185, 50], { X: 115, Y: 18, H: 28, S: 32 }),  // purple hot rod
                getawayCarArt(29, 256,  88, 56, [21, 53], [174, 53], { X: 137, Y: 22, H: 34, S: 36 }),  // copper crossover
                getawayCarArt(30, 256, 105, 53, [24, 72], [177, 72], { X: 142, Y: 33, H: 38, S: 49 }),  // yellow taxi
                getawayCarArt(31, 256,  77, 56, [26, 43], [178, 43], { X: 115, Y: 20, H: 28, S: 31 }),  // navy coupe
            ],
        },
    },

    // ── THE RACE ─────────────────────────────────────────────────────────────
    // Each lane is a race against the level's rival. The three run side by
    // side, in parallel, and read as three rounds.
    //
    // EACH LANE IS A LITTLE WORLD seen through its own camera (see
    // GameScene._raceStep): the cars have places along the road and speeds,
    // the finish line stands on the road, and the road scrolls with the
    // lane's camera. V, the racing pace, is the road's speed (ROAD.SPEED).
    //
    //   START   each rival DROPS in from above, lined up with the piggy car.
    //           The lane waits, still, until it has a piggy; LEAD_DELAY_MS
    //           later both set off — the rival reaches V in LEAD_RIVAL_MS and
    //           keeps it, the piggy car gets there later, so the gap opens to
    //           the whole lead (the figure counting up, wind off the rival).
    //   RACING  the rival holds V, holding its place on screen (RIVAL_AT of
    //           the car area); the piggy car stands behind it by the lead and
    //           closes as the piggy runs it down. With no piggy the lead, and
    //           the car, hold.
    //   FINISH  when the count reaches 0 the noses meet. The line stands on
    //           the road AHEAD_MS of the car's speed ahead; the car keeps its
    //           speed till wholly across, then rolls on and brakes to its
    //           spot; the rival keeps V till its nose is over, then brakes to
    //           rest behind. The camera follows the piggy car, carrying the
    //           line out of the frame, and ends on the end picture (VARY).
    //           1ST / 2ND badges go over the two.
    //
    // The player always wins: the figure only ever has to be run down.
    RACE: {
        RIVAL_AT:      0.62,     // where the rival holds while racing, share of the car area
        RIVAL_END:     0.35,     // …eased back to as the lead runs out (the camera slides ahead, clearing the road in front), share of the car area

        // THE START: the drop-in, then the head start.
        DROP: {
            MS:         380,     // the fall
            HEIGHT:     0.5,     // falls from this share of a lane's band above the road
            FADE_IN:    0.45,    // share of the fall spent fading in (it starts out of sight)
            STAGGER_MS: 110,     // between one lane's drop and the next
            SETTLE_MS:  200,     // after the last lands, before a lane can start
            KICK:       160,     // px/s @ design the springs take on landing
            DUST:       6,
        },
        LEAD_DELAY_MS: 300,      // after the piggy goes in, before they set off
        LEAD_RIVAL_MS: 350,      // the rival's pick-up to V (the piggy car's is as long as the lead needs)
        // THE WIND off the rival as it pulls ahead: streaks from its tail and
        // across its height, sliding back.
        WIND: {
            LINES:   11,
            LEN:     [50, 140],  // px @ design
            SPAN:    220,        // px @ design they travel back
            SPEED:   3,          // trips per second
            LINE_W:  4,
            COLOR:   '#ffffff',
            ALPHA:   0.95,
            FADE_MS: 350,        // dying away once it has its lead
        },
        // THE TYRES turn as fast as their car goes: at road speed V they spin
        // SPIN_AT_ROAD x CAR.SPIN_DEG_PER_SEC. So the rival's outrun the piggy
        // car's in the head start, and the piggy car's outrun the rival's
        // while its piggy closes the lead.
        SPIN_AT_ROAD:  1.3,

        // THE FINISH. How far ahead the line stands — AHEAD_MS of the car's
        // speed — is picked afresh per lane, so finishes differ: short is
        // close, long a clear win with the rival well back.
        AHEAD_MS:      [700, 2200],
        // THE LEVEL'S LAST WIN always takes the far end of AHEAD_MS, and is
        // pushed further if need be to cross this long after every other lane.
        FINAL_MARGIN_MS: 300,
        // THE PIGGY CAR'S SKID at the end of its braking: its tyres lock for
        // the last LOCK_S of it and it slides on, its nose dips on its springs
        // and dust kicks up at the tyres. The rival just brakes.
        SKID: {
            ENABLED:       true,
            LOCK_S:        0.35,  // s: the last of the braking, tyres locked
            DIP:           70,    // the nose's kick down as they lock, px/s @ design (the tail lifts a third of that)
            DUST:          4,     // puffs as they lock
            DUST_EVERY_MS: 90,    // and one more each this while it slides
        },
        FINISH_BRAKE:  false,    // true: past the line both cars brake to a stop, then drive off (the old finish); false: they drive straight on and out
        FINISH_ACCEL:  100,      // from the noses meeting till its nose is on the line, the piggy car keeps gaining speed on the rival, px/s² @ design
        // A CAP ON HOW FAST THE PIGGY CAR LOOKS, as a multiple of road speed.
        // A piggy far stronger than its level would otherwise close the gap and
        // cross the line so fast the camera loses both cars and the flag. The
        // figures still run at the piggy's real value; only the car is held.
        MAX_SPEED:     2.5,      // x road speed V
        CAM: {
            DRIFT_S:   0.4,      // after the noses meet, the piggy car's lead over the rival on screen fades over about this (s)
            EDGE_PAD:  12,       // that drift never takes the piggy car's nose closer than this to the road's right edge, px @ design
        },
        // THE END SCREEN: past the line both cars roll on till it has left
        // the road's frame (LINE.OFF_PAD), so no flag is left waving there;
        // they stop varied, so the three lanes never line up — each level
        // gives the lanes different stopping depths (front / mid / back, up
        // to CAR_BACK x the car's length short of the right edge, give or
        // take JITTER of that), and each its own share of the rival tucked
        // behind the winner (OVERLAP; below 0 a gap — never so far back that
        // the rival leaves the frame).
        VARY: {
            CAR_BACK:    0.2,
            JITTER:      0.25,
            OVERLAP:     [-0.3, 0.45],   // from a gap behind to tucked in; never ahead
        },
        EDGE_PAD:      6,        // px @ design kept clear of the screen's right edge
        BADGE_MS:      260,      // the 1ST / 2ND badges popping up

        // THE LEVEL'S LAST WIN — the lane that completes the level — is the
        // big finish: a LUNGE for the line (AHEAD x the car's length before
        // it, a short burst forward of SURGE x its length, kept to the end;
        // no lift of its own — the win's hop is the one lift), the ZOOM, and
        // confetti. The other two lanes finish lighter: the burst, FINISH!,
        // the green margin and the coins (WIN.CONFETTI_SMALL).
        LUNGE: {
            ENABLED: true,
            AHEAD:   0.35,
            SURGE:   [0.04, 0.08],
            OUT_MS:  160,          // the burst forward — then kept
        },

        // THE LEAD FIGURE'S COLOUR: BEHIND_COLOR while the rival leads. Once
        // the piggy overtakes it turns AHEAD_COLOR with AHEAD_PREFIX, starting
        // from what the last tick went past zero by and climbing smoothly at
        // that piggy's rate (slowed with the slow motion) until the nose
        // touches the line. There it stops at the winning margin, pops, holds
        // HOLD_MS and fades. Display only: the lead itself is 0.
        // It stays in ONE PLACE per lane: centred on the lane's road, ABOVE
        // px (@ design) clear of the piggy car's roof height.
        LEAD: {
            ABOVE:         40,
            BEHIND_COLOR:  '#1c1c1c',  // black, on a white outline
            BEHIND_STROKE: '#ffffff',
            AHEAD_COLOR:   '#1c1c1c',  // black as while behind: the icon says who leads
            AHEAD_STROKE:  '#ffffff',
            AHEAD_PREFIX: '',          // none: the icon says who leads
            // THE LEAD RUN OUT: no 0 — the last figure swells to SCALE and
            // fades over MS, and the figure is gone for the rest of the race.
            VANISH: { MS: 260, SCALE: 1.6 },
            FLIP_SCALE:   1.3,         // the leader picture's swell as the piggy takes the lead (the figure stays still)
            HIDE_AT_LINE: true,        // gone the moment the nose crosses (FINISH! is there); false = swell, hold, fade
            FREEZE_SCALE: 1.45,        // the swell as it stops at the line
            HOLD_MS:      1200,
            FADE_MS:      300,
        },

        // THE ZOOM, on the level's last finish: as the line comes within
        // AHEAD (x the car's length) of the winner's nose, that lane's
        // SECTION ALONE zooms in on the crossing — at most SCALE, over IN_MS —
        // like a camera of its own, and HOLD_MS after the win eases back out
        // over OUT_MS. The merge grid and the other lanes do not move.
        ZOOM: {
            ENABLED: true,
            AHEAD:   0.8,
            SCALE:   1.35,        // at most: less if the lead figure would not fit in view
            IN_MS:   350,
            HOLD_MS: 250,
            OUT_MS:  450,
            IGNORE_DEPTH: 50,     // not drawn zoomed: coins in flight, a dragged pig, the UI
        },

        // THE FINISH LINE: a chequered post standing on the road, a chequered
        // flag flying from its top. Sizes are shares of the car's height.
        LINE: {
            DEPTH:    3.85,      // behind the cars, over the road
            OFF_PAD:  8,         // px @ design past the road's left edge it ends, out of the frame
            POST_W:   0.16,
            POST_H:   1.45,
            FLAG_W:   0.72,
            FLAG_H:   0.44,
            CHECKS:   [5, 3],    // the flag's columns and rows
            DARK:     '#1c1c24',
            LIGHT:    '#ffffff',
            WAVE_MS:  260,       // one flutter of the flag
        },

        // THE WIN, as the winner's front crosses the line.
        WIN: {
            DEPTH:      6,
            CONFETTI:   80,          // the level's last finish
            CONFETTI_SMALL: 0,       // the other two
            CONFETTI_SIZE: [7, 13],  // px @ design, each piece's long side
            CONFETTI_RAIN: 45,       // the last finish's shower, falling from the lane's top
            RAIN_MS:    [900, 1500], // each piece's fall
            COLORS:     ['#ffd23f', '#ff5a5f', '#3ddc97', '#4cc9f0', '#ffffff', '#ff9f1c'],
            RISE:       [90, 190],   // px @ design the confetti flies up — never above its lane's top
            SPREAD:     [-260, 260], // …and sideways
            FLIGHT_MS:  [650, 1150],
            RING_MS:    520,         // the burst ring and its rays
            RAYS:       10,
            TEXT:       'FINISH!',
            TEXT_SIZE:  44,          // px @ design
            TEXT_COLOR: '#ffe27a',
            TEXT_STROKE:'#2b2013',
            TEXT_HOLD_MS: 900,
            SHAKE:      0,           // camera shake strength (0 = none) — off: it shook the whole screen, merge grid and all
            SHAKE_MS:   160,
            HOP:        12,          // px @ design the winner's hop rises
            HOP_OTHER:  0.5,         // the other lanes' wins hop this share of HOP (the level's last win: all of it)
            HOP_MS:     380,         // up and down, at full speed (slowed with the slow motion)
            HOP_LAND:   90,          // px/s @ design the springs take landing
            DUST:       6,           // puffs at the winner's tyres
        },
        BADGE: {
            DEPTH:      4.6,
            SIZE:       24,          // px @ design
            FIRST:      { TEXT: '1ST', FILL: '#ffd23f', INK: '#5a3b00' },
            SECOND:     { TEXT: '2ND', FILL: '#d7dde5', INK: '#2f3742' },
        },
        // A LANE'S CLOSE once both cars have stopped: they drive off to the
        // right, the lane dims and a "RACE n WON!" banner slams in. It stays
        // till the next level.
        CLOSE: {
            ENABLED:    true,
            SETTLE_MS:  350,         // the cars at rest this long before they drive off
            ACCEL:      500,         // px/s² @ design, the cars pulling away
            CRUISE:     0.6,         // their top speed, × road speed: an easy drive off
            RIVAL_LAG_MS: 120,       // the rival sets off this much after the piggy
            DEPTH:      6.5,
            DIM:        0.35,        // black over the lane, 0..1
            TEXT:       'RACE {n} WON!', // {n} = 1..3 top down
            SIZE:       30,          // px @ design, at most (shrunk to fit the lane)
            COLOR:      '#ffd23f',
            STROKE:     '#2b2013',
            BAR_COLOR:  '#1d2430',   // the banner behind the text
            BAR_ALPHA:  0.85,
            CHECKER:    10,          // px @ design, a chequer square at the banner's ends
            POP_MS:     220,         // the slam in
        },
    },

    // ── THE RANK ─────────────────────────────────────────────────────────────
    // The player climbs a racer ranking, one level at a time. Before the first
    // race they are #START; it falls by the same share each level (about 9%
    // with these figures) — big jumps while the rank is big, smaller as it
    // shrinks (CURVE above 1 front-loads it) — to TAIL + 1, then one place a
    // level to #1 when level TOP_LEVEL is won, and stays #1 after (for now: a
    // short CHAMPION toast). Each level's opponent is the racer at the rank
    // the player is about to take.
    //
    // After each level a quick panel shows it over the race area only (the
    // merge grid carries on): the player's row slides up past the rival just
    // beaten as the rank counts down, the next opponent at the foot. A tap on
    // it skips; the next level starts as it goes.
    RANK: {
        ENABLED:   true,
        START:     66,         // TOP_LEVEL + 1 with TAIL = TOP_LEVEL - 1: one place a level, all the way
        TOP_LEVEL: 65,
        TAIL:      64,
        CURVE:     1,
        DELAY_MS:       250,   // after the level's last finish, before it shows
        POP_MS:         180,
        SLIDE_DELAY_MS: 120,
        SLIDE_MS:       800,
        HOLD_MS:        650,
        OUT_MS:         220,
        DEPTH:     40,
        W:         440,        // px @ design, at most (and 86% of the race area)
        ROW_H:     144,        // px @ design, at most: a row, tall enough for the racer's sprite
        AHEAD:     3,          // racers listed above the player (grey till reached)
        BEHIND:    1,          // racers beaten earlier listed below the rival just beaten
        TITLE:       'LEADERBOARD',
        CHAMP_TEXT:  'CHAMPION! #1',
        YOU:         'YOU',
        NEXT:        'NEXT',
        CARD:        '#fff6e6',
        INK:         '#2b2013',
        TITLE_COLOR: '#e8590c',
        YOU_FILL:    '#ffd23f',
        ROW_FILL:    '#f26b5b',   // the active opponent's row (the rival raced, then the next), as the VS card's rival half
        ROW_IDLE:    '#a39a90',   // every other opponent's row
        ROW_INK:     '#ffffff',   // opponents' rows: their rank and name (the player's row: INK)
        GAP_COLOR:   '#a08560',
        NEXT_COLOR:  '#6b4a2a',
        LOCKED_TINT: '#7a7266',   // racers not yet reached: their sprite as a silhouette of this colour
        UNLOCK_MS:    350,        // the next opponent's silhouette filling in with colour
        PASSED_ALPHA: 0.45,       // racers already passed: their rows see-through to this (0-1)
        NEXT_MS:      2500,       // the next opponent highlighted this long after the climb, before the card goes
        NEXT_RING:    '#ffffff',  // the highlighted next opponent's outline
        // Racer names, fixed per rank.
        NAMES: ['Turbo Tess', 'Dusty Dan', 'Nitro Nia', 'Rusty Rex', 'Zippy Zoe', 'Blaze Bo',
                'Skid Sam', 'Vroom Val', 'Drift Dex', 'Rocket Ray', 'Gravel Gus', 'Piston Pia',
                'Torque Ty', 'Boost Bea', 'Clutch Cal', 'Spark Sid', 'Fender Flo', 'Gearbox Gil',
                'Hubcap Hal', 'Axle Ada', 'Throttle Tim', 'Brake Bree', 'Chrome Cleo', 'Exhaust Eli',
                'Muffler Mo', 'Spoiler Sal', 'Wheelie Wes', 'Racer Ruby', 'Lap Lou', 'Pit Pete'],
    },

    // ── THE VS CARD ──────────────────────────────────────────────────────────
    // At each level's start, as the rivals drop in: a card over the race area
    // only (like the rank panel), split by a slant — the player's piggy and rank on the left,
    // the level's rival (its head, its RANK name and rank) on the right, VS
    // between. No lane drives until it goes; a tap skips it.
    VERSUS: {
        ENABLED:    true,
        POP_MS:     200,
        HOLD_MS:    1200,      // up, after the sides and the VS are in
        OUT_MS:     220,
        DEPTH:      40,
        W:          440,       // px @ design, at most (and 86% of the race area)
        H:          210,       // px @ design, at most (and 86% of the race area)
        CAR_W:      0.92,      // each racer's car, × its half's width (capped by the height)
        PULSE:      1.08,      // the rival's picture swells to this × and back, over and over (1 = still)
        PULSE_MS:   380,       // ms, one swell (the same back)
        SLANT:      0.12,      // the split's lean: its top and bottom this share of the height either side of centre
        VS_TEXT:    'VS',
        VS_COLOR:   '#ffffff',
        YOU:        'YOU',
        YOU_FILL:   '#ffd23f', // the player's half
        RIVAL_FILL: '#f26b5b', // the rival's half
        RANK_FILL:  '#2b2013', // the rank pills: the player's now, the rival's the one a win takes
        RANK_COLOR: '#ffffff',
        RANK_SIZE:  26,        // px @ design, the rank in its pill (the name is 20)
    },

    // ── THE CHASE'S FEEDBACK ─────────────────────────────────────────────────
    // What makes each second of driving read like a hit.
    CHASE_FX: {
        // THE DISTANCE POP: each tick, the metres just closed fall off
        // the lane's gap line ("−200 m") and fade — the chase's damage numbers.
        DIST_POP: {
            ENABLED:  true,
            SIZE:     24,        // px @ design
            COLOR:    '#1c1c1c', // as the lead figure: dark on a white outline
            STROKE:   '#ffffff',
            STROKE_W: 4,         // px @ design
            FALL:     40,        // px @ design it falls, from the figure
            MS:       500,
            JITTER:   10,        // px @ design of sideways scatter, so ticks don't stack
        },
        // THE CAR GLIDES. The lead figure steps down by the piggy's value at
        // each tick; the piggy car closes that much smoothly, at the piggy's
        // rate, without stopping between ticks. ENABLED false: it jumps with
        // the figure instead.
        COUNT: {
            ENABLED: true,
        },
        // THE PIGGY'S FIGURE PULSES on each tick, as the lead drops.
        RATE_PULSE: {
            ENABLED: true,
            SCALE:   1.2,
            MS:      200,
        },
        // SPEED LINES AND EXHAUST behind the piggy car while it drives, as
        // strong as the chase is quick: by how many seconds the lane's piggy
        // would take to cover the whole level distance — SLOW_SECS or more is
        // the faintest (MIN), FAST_SECS or less the fullest. So merging a
        // better piggy visibly makes the chase more intense, level after
        // level. They fade in and out with the tyres.
        SPEED: {
            ENABLED:   true,
            SLOW_SECS: 40,
            FAST_SECS: 4,
            MIN:       0.35,     // intensity of the slowest chase, 0..1
            DEPTH:     3.85,     // over the road, under both cars
            LINES:      6,       // streaks per lane
            LINE_COLOR: '#ffffff',
            LINE_ALPHA: 0.6,
            LINE_W:     3,       // px @ design
            LINE_LEN:   [22, 70],// px @ design, shortest to longest
            LINE_SPAN:  150,     // px @ design they travel back from the bumper
            LINE_SPEED: 2.4,     // trips per second
            // Exhaust puffs from the tailpipe — in the piggy car body's own
            // pixels (CONFIG.CAR.BODY_W x BODY_H) — RATE puffs a second.
            EXHAUST: { X: 6, Y: 78, RATE: [1.5, 9], R: [3, 6], LIFE: 0.6,
                       COLOR: '#ffffff', ALPHA: 0.55, MAX: 60 },
        },
    },

    // ── THE PIGGY STEERS ─────────────────────────────────────────────────────
    // A piggy in a slot is drawn as its piggy with its steering wheel as a
    // separate sprite on top, and the wheel turns the way a driver's does:
    // small corrections, now and then a proper turn that is held a moment,
    // and back to centre. Each slot has its OWN driver (DRIVERS, in slot order)
    // so the three never move in step.
    //
    // How one driver steers: every HOLD_MIN..HOLD_MAX seconds it picks a new
    // wheel angle — back to centre (CENTER_CHANCE), a big turn of up to BIG_DEG
    // (BIG_CHANCE), or else a small correction of up to SMALL_DEG — and the
    // wheel swings there on a spring: STIFFNESS is how quickly (higher =
    // snappier hands), DAMPING how much it settles rather than overshoots
    // (1 = no overshoot, below 1 = a little wobble past the mark).
    STEERING: {
        DRIVERS: [
            // Calm on the motorway: small corrections, rarely a real turn.
            { SMALL_DEG: 18, BIG_DEG: 75,  BIG_CHANCE: 0.10, CENTER_CHANCE: 0.35,
              HOLD_MIN: 0.6, HOLD_MAX: 1.6, STIFFNESS: 5,   DAMPING: 0.95 },
            // Lively on a twisty road: quick hands, frequent turns.
            { SMALL_DEG: 40, BIG_DEG: 120, BIG_CHANCE: 0.25, CENTER_CHANCE: 0.20,
              HOLD_MIN: 0.3, HOLD_MAX: 0.9, STIFFNESS: 9,   DAMPING: 0.75 },
            // Lazy and sweeping: long holds, big slow hand-over-hand turns.
            { SMALL_DEG: 12, BIG_DEG: 170, BIG_CHANCE: 0.30, CENTER_CHANCE: 0.30,
              HOLD_MIN: 1.0, HOLD_MAX: 2.4, STIFFNESS: 3,   DAMPING: 1.0 },
        ],
    },

    // ===================================================================
    // THE CAR AREA
    // ===================================================================
    // The half beside the merge grid: the three slots stacked down its LEFT
    // edge, a car beside each, and the villains to the right. Every charge
    // tick each piggy in a slot drives its car its own distance
    // (CHARGE_PER_SECOND_BY_LEVEL, metres per second) closer to its villain.
    CAR_AREA: {
        // The slot column, down the area's left edge (px @ design).
        SLOT_COLUMN_PAD: 28,     // area's left edge → slot's left edge
        SLOT_COLUMN_GAP: 28,     // slot's right edge → where the empty car
                                 // area starts (see GameScene.carArea)
        // One slot (with its rate label) gets a third of BAND_FRAC of the
        // area's height; the slot square is SLOT_FRAC of that, capped at a
        // grid cell.
        BAND_FRAC: 0.9,
        SLOT_FRAC: 0.62,
        RATE_SUFFIX: '',         // after each slot's figure (none: a bare number, like the lead)
    },

    // ── THE CAR ──────────────────────────────────────────────────────────────
    // One car per slot, built from graphics/hero_car: the right-facing body and two
    // copies of the tyre. Positions are in the BODY's own pixels — its top-left
    // at 0,0 — and give each tyre's TOP-LEFT corner. The whole car is then
    // scaled as one, and placed by the point under its middle where the tyres
    // meet the ground (see _makeCar), so it always stands ON the line it is
    // given.
    CAR: {
        BODY_W: 254,             // the body art's size, px
        BODY_H: 97,
        TYRE_SIZE: 53,           // the tyre art's size, px (square)
        TYRES: [
            { x: 26,  y: 66 },   // rear
            { x: 175, y: 66 },   // front
        ],
        TYRES_IN_FRONT: true,    // tyres drawn over the body's dark arches
        // THE DRIVER: the piggy in side view (looking ahead, at the rival) in
        // the front window, in the BODY's pixels. Its height H with the bottom
        // CROP cut off at the window's bottom edge S, centred at X; whatever
        // is outside the glass (TOP, LEFT, RIGHT edges) cut off too.
        DRIVER: { KEY: 'piggy_side', X: 120, S: 43, TOP: 14, LEFT: 96, RIGHT: 147, H: 42, CROP: 0.1 },

        // ONE CAR PER SLOT, its road the line through the slot's bottom edge.
        // Sized to WIDTH_FRAC of the car area's width, but never taller (ground
        // to roof) than MAX_H_FRAC of a slot. Its LEFT edge sits LEFT_GAP px
        // (@ design) into the car area — close beside its slot, which is
        // CAR_AREA.SLOT_COLUMN_GAP away.
        WIDTH_FRAC: 0.45,
        // …and then scaled by this, whatever capped it above — 0.8 is 20%
        // smaller. The car shrinks toward its slot; the rival car is drawn at
        // the same pixel scale (VILLAIN.CAR.SCALE).
        SCALE:      0.8,
        MAX_H_FRAC: 1,
        LEFT_GAP:   0,
        DEPTH:      4,

        // In the race (CONFIG.RACE) both cars of a lane drive the whole race,
        // piggy or not — see GameScene._laneRacing. Otherwise:
        // THE TYRES TURN while the car's slot has a piggy driver in it. Both
        // tyres of a car share one angle. They speed up to SPIN_DEG_PER_SEC
        // when a piggy is put in and coast to a stop when it is taken out —
        // SPIN_EASE is how quickly they get there (per second).
        SPIN_DEG_PER_SEC: 540,
        SPIN_EASE:        4,
        DUST:             '#d9c3a0',   // the puffs at the tyres (a drop, a hop, a head start)
    },
};

// -------------------------------------------------------------------
// Battery image helpers
// -------------------------------------------------------------------

// WHICH OF THE 90 PICTURES a level shows (one per steering wheel — see
// ITEM_ART). Past the last one it WRAPS, not clamps — level 91 shows level 1's
// picture again, and so on forever. The piggy inside the picture loops on its
// own every 14 (itemPiggyIndex). This is the one place that
// decision is made: everywhere else that draws a pig's icon calls this first
// (see AssetManager and every dressWhenReady call site in game.js), so a
// change here is a change everywhere at once.
//
// The LEVEL NUMBER itself is never touched by this — "PIGGY 61" still reads
// 61, and its charge is still level 61's own real figure (see
// getBatteryChargeValue). Only the PICTURE loops; the progression underneath
// it does not.
function getBatteryIconLevel(level) {
    const highest = getHighestBatteryLevel();
    if (highest < 1) return level;
    if (level <= highest) return level;
    return ((level - 1) % highest) + 1;
}

// ===================================================================
// SPRITE SIZE QUICK REFERENCE
// ===================================================================
// Grid & Batteries:
//   • Grid cell (empty/filled):        130 × 130 px  (CELL.SIZE)
//   • Battery sprite in grid cell:      64 × 64 px   (CELL.BATTERY_DISPLAY_SIZE)
//   • Battery level text offset:        +40 px Y     (CELL.LEVEL_TEXT_Y_OFFSET, below icon)
//
// Platform/Charger System:
//   • Charger slot (battery holder):   130 × 130 px  (PLATFORM.SLOT_SIZE) — same as grid cell
//   • Debug rect (max gadget area):    170 × 113 px  (PLATFORM.DEBUG_RECT_WIDTH × WIDTH/ASPECT_RATIO, 3:2)
//   • Tooth area (toothbrush level):   200 × 80 px   (PLATFORM.TOOTH_AREA_WIDTH × WIDTH/ASPECT_RATIO, 2.5:1)
//   • Gadget sprite (within debug):    auto-sized    (aspect ratio preserved, centered horizontally, touching bottom)
//   • Socket (on slot):                 40 × 40 px   (PLATFORM.SOCKET_SIZE)
//   • Plug (on wire):                   28 × 28 px   (PLATFORM.PLUG_SIZE)
//   • Platform stripe height:           18 px        (PLATFORM.STRIPE_HEIGHT)
//
// Meter (analog gauge):
//   • Meter radius:                     62 px        (PLATFORM.METER_RADIUS)
//   • Meter diameter (approx):         124 px        (2 × radius)
//
// UI Elements:
//   • Button battery icon:              64 × 64 px   (BUTTON.BATTERY_ICON_WIDTH/HEIGHT)
//   • Button coin icon:                 50 × 50 px   (BUTTON.COIN_ICON_WIDTH/HEIGHT)
//   • Coin counter icon:                40 × 40 px   (COIN_COUNTER.COIN_ICON_WIDTH/HEIGHT)
//   • Reward coin (animation):          32 × 32 px   (COIN_REWARD_ANIMATION.REWARD_COIN_SIZE)
//   • Spawn button:                    250 × 90 px   (BUTTON.SPAWN_WIDTH/HEIGHT)
//   • Level-up button:                 180 × 70 px   (BUTTON.LEVELUP_WIDTH/HEIGHT)
// ===================================================================
