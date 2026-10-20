// Helper: convert CSS hex color string to Phaser hex number
function hexColor(cssColor) {
    if (typeof cssColor === 'string' && cssColor.startsWith('#')) {
        return parseInt(cssColor.substring(1), 16);
    }
    return cssColor;
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
        // left goes to the spring half. An even split either way.
        //
        //   LANDSCAPE  UI on the LEFT, springs on the right — share of the WIDTH
        //   PORTRAIT   UI at the BOTTOM, springs above — share of the HEIGHT
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

    BATTERY_START_LEVEL: 10,
    // Coins a new run starts with. Default 2500; raise it to debug later levels.
    START_COINS: 2500,
    // THE ECONOMY. Coins come from releasing the springs — see levelData.js.
    ECONOMY: {
        SPAWN_COST_PER_LEVEL: 25,    // a spawn costs this × the spawn level
    },

     BACKGROUND: {
        // MATCHED TO THE SPRING HALF'S GROUND — partB (the springs) has no
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
            AREA_SHARE: 0.65,   // the share landing on the spring half; the rest
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
    // Three slots in a row along the spring half's bottom edge, one under
    // each spring. The slot SIZE is derived, not set (SPRING.COL_FRAC /
    // SLOT_H_FRAC), capped at ONE GRID CELL — a piggy in a slot should look
    // like a piggy in a cell. (See createSprings.)
    PLATFORM: {
        SLOT_SIZE: 130,                // reference slot square (px) — the ratio
                                       // every slot-derived size is measured in
        SLOT_RADIUS: 15,               // corner radius (px)
        SLOT_EMPTY_ALPHA: 0,           // an EMPTY slot's face: 0 is no face at
                                       // all — just the rim, with the brown
                                       // ground inside it, so it reads as empty
                                       // rather than as another colour. Filled,
                                       // the slot takes its grained face as ever
        CHARGE_RATE_GAP: 2,            // gap (px) between the slot's edge and
                                       // the charge-rate figure. The font's
                                       // own padding adds to this on screen
        // THE DROP ZONE round each slot — bigger than the slot. X and Y are
        // shares of the most it may spread: across, to the edges of the
        // slot's column (so no two overlap); up, over its spring to the top
        // of the half. 0 is the slot itself.
        DROP_ZONE: { X: 1, Y: 1 },
    },

    // ===================================================================
    // THE SPRINGS
    // ===================================================================
    // The half beside the merge grid: three vertical springs in a row, each
    // standing over its slot, the slots in a row along the half's BOTTOM edge.
    // Every second the piggy in a slot squeezes the spring above it by its
    // own figure (CHARGE_PER_SECOND_BY_LEVEL) until that spring reaches its
    // strength. Once all three are fully compressed one RELEASE button lets
    // them all go, which pays out (levelPayoutsFor), and the next level's
    // springs (levelData.js, LEVEL_STRENGTHS) start again.
    //
    // Sizes are px @ design for a spring on a 1920-wide stage; the whole
    // spring is scaled down as one to fit its third of the half (see
    // createSprings), so their proportions hold on any screen.
    SPRING: {
        PAYOUT_MULT:    1,       // from level 3 a spring pays its strength × this, coins (see levelData.js)
        STEP_MS:        250,     // how long each step's squeeze takes (rest of the second it holds), ms
        STEP_EASE:      'Cubic.Out', // a crisp stop reads as stiff; 'Back.Out' overshoots and reads soft

        // ── Placement in the half ──
        BOTTOM_PAD:    30,       // px @ design: half's bottom edge → slot's bottom edge
        TOP_PAD:       24,       // px @ design: half's top edge → top of the spring
        BASE_GAP:      14,       // px @ design: slot's rate label → spring's figure (under the base plate)
        COL_FRAC:      0.62,     // the slot square's share of its column's width, capped at a grid cell
        SLOT_H_FRAC:   0.22,     // …and of the half's height
        MAX_SCALE:     1,        // the spring never draws bigger than its design size
        SIZE:          0.64,     // the spring's size, fraction of the most that fits (its base stays put)

        REST_HEIGHT:  520,       // coil height when relaxed, px
        MIN_HEIGHT:   110,       // coil height when fully compressed, px
        WIDTH:        170,       // coil width, px
        COILS:        9,         // number of turns
        END_TURNS:    0.75,      // turns at each end lying flat on its plate (a closed end), not climbing
        LINE_WIDTH:   14,        // wire thickness, px — thicker reads as stronger
        COLOR:        '#B0BEC5', // front of each turn
        BACK_COLOR:   '#546E7A', // back of each turn, darker so it reads as depth
        COIL_TILT:    22,        // half-height of each turn's ellipse (viewing angle), px
        PLATE_COLOR:  '#78909C',
        PLATE_H:      24,        // plate thickness, px
        RELEASE_MS:   700,       // spring-back animation, ms
        DEPTH:        2,         // under the slots (3) and the piggies (10+)

        // ── Look ──
        OUTLINE_COLOR:   '#263238', // dark edge round the wire
        HIGHLIGHT_COLOR: '#FFFFFF', // thin light streak along the front of the wire
        HOT_COLOR:       '#FF8A65', // the front warms toward this as it is squeezed
        GLOW_COLOR:      '#FFD54F', // pulsing glow behind a fully compressed spring
        DUST_COLOR:      '#CFD8DC',

        // ── Motion ──
        BULGE:           0.015,  // sideways swell of the middle turns on each step, fraction of width
        STEP_RIPPLE:     2,      // wave down the coil on each step, px — keep small, wobble reads as weak
        RELEASE_RIPPLE:  30,     // wave up the coil on release, px
        RIPPLE_MS:       450,    // how long the release ripple takes to die out, ms
        STEP_RIPPLE_MS:  180,    // how long a step's ripple takes to die out, ms
        SHIVER_PX:       1.5,    // up-and-down shiver of the top when full (less while compressing), px
        SHAKE_MS:        150,    // screen shake on release, ms
        SHAKE_INTENSITY: 0.006,  // screen shake strength, fraction of the view
        DUST_COUNT:      10,     // dust puffs per spring on release

        // ── Labels ──
        // The spring's remaining figure (MAX! when full) over it, and the piggy's figure
        // over its slot, in one look.
        LABEL: { SIZE: 30, COLOR: '#1c1c1c', STROKE: '#ffffff', STROKE_W: 5 },  // px @ design
        RATE_SUFFIX: '',         // after each slot's figure (none: a bare number)
        // THE PIGGY'S FIGURE PULSES on each tick, as its spring steps.
        RATE_PULSE: { ENABLED: true, SCALE: 1.2, MS: 200 },
        // PULL ARROWS: on each tick, a column of down-pointing chevrons down each
        // side of the coil slides one place toward the base and fades — the top
        // plate drawn down from below. Sizes px @ design (× spring scale);
        // SPACING shrinks to fit a squeezed coil, GAP is the clearance from the
        // coil's ends, SIDE_GAP from the wire to a column.
        ARROW: { ENABLED: true, MS: 450, COUNT: 4, COLOR: '#FFD54F',
                 W: 36, H: 22, THICK: 9, SPACING: 26, GAP: 8, SIDE_GAP: 12 },  // MS: whole slide + fade, ms
        // ALL FULL → a 3-2-1 countdown, centred in the half over the springs, then
        // they launch on their own. Each number pops in from POP × size.
        COUNTDOWN: { FROM: 3, STEP_MS: 800,   // ms per number
                     SIZE: 120, COLOR: '#FFFFFF', STROKE: '#E53935', STROKE_W: 10, POP: 1.6,  // px @ design
                     Y_FRAC: 0.45 },          // fraction of the rest height above the base
    },

    // ── THE PAYLOADS ─────────────────────────────────────────────────────────
    // Each level, three copies of one item ride the springs' top plates; the
    // RELEASE launches them up off the screen and the next level's drop in.
    PAYLOAD: {
        FILES: ['spacecraft', 'dome', 'solar-panels', 'water-tower', 'antenna'],  // graphics/payload/<name>.webp, level 1, 2, … (loops)
        SIZE:      240,          // longest side, px @ spring design (× the spring's scale)
        MIRROR:    [1],          // which of the three (0, 1, 2 — spring / spot order) are drawn flipped left-right, so the copies differ
        PIVOT_X:   { 'flag': 0 }, // by file: the point across the picture (0 left .. 1 right) that stands on the plate's centre; 0.5 if not listed
        SINK:      0.4,          // how far its bottom sits into the top plate's face, fraction of the face's half-height
        DEPTH:     4,            // over the springs (2) and the slots (3), under the piggies
        LAUNCH_MS: 450,          // launch tween, ms — it leaves the screen early on, fast
        LAUNCH_SPIN: 25,         // up to this much turn on the way out, degrees
        DROP_MS:   280,          // the next one set down onto its plate (falling, no bounce), ms
        DROP_PX:   90,           // …from this little way above, px @ spring design
        FIRST_DROP_DELAY: 900,   // the game's first set-down waits this long, ms — the loading screen fades out over it (250 + 450 ms)
        SEAT_DIP:  16,           // its weight pushes the top plate down this much and the spring takes it back, px @ spring design (rigid: keep small)
        SEAT_MS:   260,          // …the whole dip and back, ms
        // "LAUNCH N" AND THE ITEM'S NAME at the top centre of the launch half, over
        // everything there (springs, payloads, the flight, Mars): the item
        // this level launches, or the one flying / landing. 'solar-panels'
        // shows as "Solar Panels" unless TITLES names it.
        NAME_LABEL: { SIZE: 32, COLOR: '#FFFFFF', STROKE: '#1c1c1c', STROKE_W: 6,  // px @ design
                      TOP: 18,          // its top below the half's top, px @ design
                      DEPTH: 150,       // UI: over coins in flight (100+) too
                      LAUNCH: 'Launch', // the line above it: "Launch 1", "Launch 2", … (the level)
                      LAUNCH_SIZE: 20,  // …its text size, px @ design
                      TITLES: {} },     // by file: the name to show instead
    },

    // ── THE SKY AND THE FLIGHT ───────────────────────────────────────────────
    // The spring half's ground is the top of the Earth with blue sky and clouds
    // over it. On RELEASE the half cuts to the FLIGHT: the three payloads in
    // view, climbing ever faster through the clouds, the sky going dark and
    // the stars streaking past, then it fades back to the springs.
    // Altitudes are in half-heights above the ground.
    SKY: {
        SKY_TOP:   '#3A8DDE',    // blue sky, top of the half
        SKY_BOT:   '#BFE6FF',    // …at the horizon
        SPACE_TOP: '#05071A',    // space, top
        SPACE_BOT: '#151040',    // …bottom
        SPACE_ALT: 2.5,          // altitude where the sky is fully space
        STARS:     80,
        STAR_COLOR: '#FFFFFF',
        STAR_SIZE: 2.2,          // radius of the nearest stars, px @ design (far ones smaller)
        EARTH: { SEAT: 24,       // the ground meets the springs' base plates this far below their face, px @ spring design
                 TOP: 0.78,      // (only before the springs exist) top of the Earth, fraction of the half's height
                 RADIUS: 1.6,    // sphere radius, × the half's width
                 HAZE: '#BFE9FF', HAZE_PX: 14, HAZE_ALPHA: 0.25,     // air glow round the rim: one ring this wide (px @ design), this opaque
                 OCEAN: '#4FA3E6',
                 LAND: '#5DAA4C', SAND: '#D9C48A',
                 // Continents: [angle from the crown (radians), depth below the surface, size], × the half's width.
                 CONTINENTS: [],  // none: only the springs' island on the crown (was 5 blobs, e.g. [-0.27, 0.12, 0.07])
                 // The springs' island on the crown: half its width (× the half's width), and its layers'
                 // depths at the middle, px @ design.
                 ISLAND: 0.46, GRASS_PX: 16, SOIL_PX: 48, DEEP_PX: 90, SAND_PX: 26,
                 GRASS: '#5DBB4A', GRASS_LIGHT: '#8EDB6A', GRASS_DARK: '#3F8F35',
                 SOIL: '#8D6339', SOIL_DEEP: '#6B4A2F',
                 TUFTS: 18, TUFT_PX: 10 },                          // grass tufts along the top: how many, how tall (px @ design)
        CLOUDS: { COUNT: 9, FROM: 0.35, TO: 2.4,  // how many, spread between these altitudes
                  SIZE: 150,     // px @ design (each one 0.6..1.4 of it)
                  DRIFT: 0.01,   // sideways drift, fraction of the half's width per second
                  COLOR: '#FFFFFF', SHADE: '#D6E4F0', ALPHA: 0.9 },
        FLIGHT: {
            ENABLED:   true,
            DEPTH:     40,       // over the springs, slots and slot piggies; under coins and dragging
            CUT_MS:    150,      // release → the cut to the flight (the springs' throw plays first), ms
            FADE_MS:   150,      // the cut's fade in, ms
            START_ALT: 0.4,      // altitude it opens at
            SPEED:     7,        // full climb, half-heights per second
            ACCEL_MS:  1400,     // time to reach it, ms
            MS:        3200,     // whole flight from release, ms
            OUT_MS:    450,      // at its end the payloads shoot off the top and it fades out, ms
            SCALE:     1.3,      // payload size in flight, × its size on the spring
            CRUISE_Y:  0.45,     // where they hold, fraction of the half's height from its top
            ENTER_MS:  600,      // rising into view after the cut, ms
        },
    },

    // ── THE LANDING ON MARS ──────────────────────────────────────────────────
    // After the flight the half cuts to Mars: the colony so far (every earlier
    // level's item at its COLONY_SPOTS spot, colonySpots.js) and this level's
    // three falling onto theirs, then back to the springs. The whole stage's
    // ground goes Martian meanwhile, under the grid too. An item with no spots
    // skips it. Map px are the colony map's (2048 × 2048).
    MARS: {
        ENABLED:   true,
        DEPTH:     45,           // the colony's layer in the spring half: over the flight (40), under coins and dragging
        TILE:      512,          // the ground tile's side on the map, map px
        FIT:       0.6,          // the box round the new spots and the colony so far fills this much of the half (centred on it)
        ZOOM_MAX:  1,            // closest view, screen px per map px @ design (× platformScale)
        FADE_MS:   250,          // the cut in (as the flight ends) and back out, ms
        FALL_MS:   433,          // each one's fall from above the screen, ms
        MAX_DELAY: 1000,         // each one starts after a random 0..this, ms
        HOLD_MS:   3000,         // after the last touchdown, before going back, ms
        SQUASH:    0.11,         // touchdown squash: this much flatter (and half as much wider)
        SQUASH_MS: 90,           // …down, and the same back up, ms
        // SIZE, SPEED and COUNT are for an item REF map px big; a bigger one
        // (a spacecraft) kicks up more, further, in proportion.
        DUST: { REF:   100,      // the item size the numbers below are for, map px
                COUNT: 9,        // puffs per touchdown (× the size ratio, rounded up)
                SIZE:  14,       // radius, map px (each 0.6..1.4 of it, growing as it fades)
                SPEED: 260,      // outward, map px per second (each 0.4..1 of it)
                TTL:   380,      // life, ms (each 0.7..1.3 of it) — Mars dust settles fast
                // Sampled from graphics/mars/mars_ground.webp: its average colour,
                // and the means of its darkest and lightest fifths.
                COLORS: ['#DB6C35', '#D46532', '#E27438'] },
        // A SOFT SHADOW under each item on the ground (drawn in code, so the
        // pictures stay shadowless for the springs and the flight). Smaller and
        // fainter the higher it is off the ground — falling in, or hopping.
        SHADOW: { COLOR: '#3A1608',   // dark red-brown, the ground's own shade
                  ALPHA: 0.245,       // on the ground
                  WIDTH: 0.8,         // across, × the item's drawn width
                  FLAT:  0.28,        // its height, × its width (the 3/4 view)
                  LIFT:  1.5,         // gone at this height above the ground, × the item's size
                  RAISE: 0.06,        // its middle this far up from the feet, × the item's drawn height
                  // By item: WIDTH / FLAT / RAISE in place of the above, for
                  // pictures whose base is wider or deeper than most.
                  BY_ITEM: { 'spacecraft': { WIDTH: 1.15, FLAT: 0.32, RAISE: 0.08 } } },
        // WHAT EACH ITEM DOES once its three are down, and what it leaves on
        // the ground for good (redrawn on every later landing): the crew walks
        // out of the craft leaving footprints and plants the flag (the camp's
        // edge); domes get paths to the middle; solar panels catch the sun,
        // power runs down cables and each dome lights up with a bolt; water
        // towers get pipes, a wet patch and the first sprout. Keyed by
        // PAYLOAD.FILES name in code.
        // THE CREW: no level of its own — it rides inside FROM and, once that
        // has landed, walks out of it (copy i of FROM lets out crew member i)
        // to its own COLONY_SPOTS spots, hopping, and stays.
        CREW: { NAME: 'astronaut',    // graphics/payload/<name>.webp, and its COLONY_SPOTS key
                FROM: 'spacecraft',   // the item it comes out of
                DELAY_MS: 1000,       // after the craft's landing, before the first one shows, ms
                HATCH:  0.45,         // where it shows, up on the craft: × the craft's drawn height above its feet
                APPEAR_MS: 150,       // showing at the hatch, ms
                JUMP_MS: 550,         // the jump down to the ground in front of the craft, ms
                JUMP_H: 0.2,          // how high it springs before dropping, × its size
                GAP_MS: 450,          // between one crew member and the next, ms
                MAX_HOPS: 4,          // each leg of the walk takes at most this many hops (longer hops if far)
                // THE FLAG, no level either: the first crew member plants it
                // where it lands, in front of the first craft, then walks on.
                CRAFT_STAYS: false,   // false: the craft shows only on its own landing (level 1), unseen after
                FLAG: 'flag',         // graphics/payload/<name>.webp
                FLAG_SIZE: 90,        // its longest side, map px
                FLAG_SIDE: 0.35,      // its pole this far right of the planter, × the crew member's size
                PLANT_MS: 450,        // the flag's pop, up and back, ms (the walk waits for it)
                FLAG_DELAY_MS: 1000,  // it rises this long after its planter's touchdown, ms (the planter waits for it)
                IDLE_SQUASH: 0.05,    // standing still, it breathes: this much flatter (and half as much wider) at most
                IDLE_MS: 1100 },      // …one breath, ms
        // A CAPTION, plain text, as each item's reaction finishes — by item
        // name, so it follows the item whatever its level. Stays till the
        // view goes back to Earth.
        CAPTION: { TEXTS: { 'dome': 'Shelter Ready!', 'solar-panels': 'Power On!',
                            'water-tower': 'Water Flowing!', 'antenna': 'Linked to Earth!' },
                   Y:    0.15,        // its middle, fraction of the half's height from its top
                   SIZE: 40, COLOR: '#FFFFFF', STROKE: '#5A2410', STROKE_W: 7,   // px @ design
                   DEPTH: 160 },      // UI, over everything
        // A BANNER WITH CONFETTI once a landing's reaction is over (the first:
        // after the crew has walked out), by the level that landed. Shown for
        // MS, then back to Earth.
        BANNER: { TEXTS: { 1: 'First Landing!', 5: 'Base Established!' },
                  MS:    2600,        // on screen before going back, ms
                  Y:     0.32,        // its middle, fraction of the half's height from its top
                  SIZE:  60, COLOR: '#FFFFFF', STROKE: '#7A2E10', STROKE_W: 8,   // px @ design
                  RIBBON: '#E8572A', RIBBON_EDGE: '#A63A17',
                  POP_MS: 420,        // popping in, ms
                  DEPTH: 160,         // UI, over everything
                  CONFETTI: { COUNT: 110,
                              SPEED: 900,     // burst, px @ design per second (each 0.4..1 of it)
                              GRAVITY: 1300,  // px @ design per second²
                              SIZE: 16,       // a piece's long side, px @ design (each 0.6..1.2 of it)
                              COLORS: ['#FFD54F', '#4FC3F7', '#F06292', '#81C784', '#FFFFFF', '#BA68C8'] } },
        REACT: { HOLD_MS:   1000,     // the least hold after the reaction starts, ms
                 LOOK_MS:   2000,     // then this long more to take in the change, ms (not on the crew's landing)
                 HOP_MS:    1040,     // one hop, ms
                 HOP_PAUSE: 220,      // standing still between hops, ms
                 HOP_H:     0.1,      // how high a hop goes, × the item's size
                 HOP_STEP:  0.3,      // one hop's length, × the crew member's size (unless MAX_HOPS stretches it)
                 GLINT_MS:  450,      // a solar panel catching the sun, ms (one after another)
                 POWER_MS:  1800,     // power running down the cables after, ms
                 MARK:   '#A9461F',   // footprints and wet ground
                 PATH:   '#C05A2B',   // paths between the domes
                 CLAIM:  '#F6B07A',   // the camp's dashed edge
                 CABLE:  '#3B3446',   // power cables
                 PIPE:   '#9FB3C0',   // water pipes
                 PIPE_FROM: [0.5, 0.8], // where a pipe leaves the tower: on its picture, [across, down] 0..1 (behind it)
                 PIPE_TO:   [0.5, 0.8], // …and meets the dome, the same way
                 CABLE_FROM: [0.5, 0.8], // where a power cable leaves a solar panel, the same way (behind it)
                 CABLE_TO:   [0.5, 0.8], // …and meets the dome
                 GLOW:   '#FFD27A',   // lit domes, the power running to them, the bolts over them
                 BOLT_EDGE: '#8A5A00', // the bolts' outline
                 SPROUT: '#5FC24A',   // the first green
                 // THE ANTENNA'S SIGNAL: arcs pulsing out from its tip toward
                 // where the dish faces, each antenna in turn.
                 SIGNAL: { TIP: [171 / 191, 61 / 256],  // the tip on its picture, [across, down] 0..1 (mirrored with it)
                           DIR: -50,          // the way the arcs go, degrees (0 right, -90 up; mirrored with it)
                           SPREAD: 45,        // each arc's half-width, degrees
                           MS: 2600,          // how long it sends, ms
                           EVERY: 380,        // a new arc this often, ms
                           WAVE_MS: 950,      // each arc's life, ms
                           REACH: 0.75,       // how far an arc travels, × the antenna's size
                           COLOR: '#8FE8FF' } },
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
