// CAR TEST OVERLAY — open the game with ?cartest. DEV ONLY: dev/ is left out of
// the build (build.sh), and game.js only loads this file when asked.
//
// One road across the whole screen at 75% of its height, the piggy car leading
// and the chosen rival car trailing it, both at the race's road speed, forever.
// The buttons along the top pick the rival car. Both cars are built the way the
// game builds them (_makeCar, the rival at the piggy car's pixel scale raised
// to MIN_H (_rivalCarH), its driver from FACE), and the road is the game's
// road: same line, marks and bumps (_roadPattern, _bumpEvery), and the same
// suspension (_suspend).
//
// ALL: every rival car beside a piggy car, standing still, to compare sizes.
// The left / right arrow keys step through the cars too.
//
// It sits on the main camera over everything and swallows input, so the game
// underneath is left untouched.
window.carTest = function (scene) {
    const D = 10000;   // over everything the game draws
    const v = (x, d) => (x !== undefined ? x : d);
    const CARS = ((CONFIG.VILLAIN || {}).CAR || {}).CARS || [];
    let pick = 1, objs = [], hero = null, rival = null, gfx = null, info = null, btns = [];
    let all = false;
    let off = 0, set = null;

    const kill = (o) => { if (o && o.scene) o.destroy(); };
    const add = (o) => { o.onRoad = false; objs.push(o); return o; };

    // THE RIVAL CAR, as _makeGetawayCar builds it: at the piggy car's pixel
    // scale (x VILLAIN.CAR.SCALE), the driver's head in its window.
    function makeRival(groundY) {
        kill(rival);
        const K = (CONFIG.VILLAIN || {}).CAR || {};
        const spec = Object.assign({}, CARS[pick - 1], { bodyKey: getawayBodyKey(pick), tyreKey: getawayTyreKey(pick) });
        const F = spec.FACE || {};
        const gy = scene._carGround(spec), bw = v(spec.BODY_W, 254);
        const en = scene._makeCar(0, groundY, scene._rivalCarH(spec, hero.scaleX * v(K.SCALE, 1)), spec);
        en.onRoad = false;
        en.setDepth(D + 2);
        const key = villainKey(1);
        if (scene.textures.exists(key)) {
            const sill = -gy + v(F.Y, 28) + v(F.H, 40) / 2;
            const face = scene.add.image(-bw / 2 + v(F.X, 126), sill, key);
            const fw = face.frame.realWidth, fh = face.frame.realHeight;
            const ch = fh * v(F.HEAD_FRAC, 0.55);
            face.setCrop(0, 0, fw, ch).setOrigin(0.5, ch / fh).setScale(v(F.H, 40) / ch);
            en.addAt(face, 1);
            en.face = face;
            en.faceBaseY = face.y;
        }
        // TRAILING, a gap behind the piggy car's rear.
        const gap = 30 * scene.layoutConfig.platformScale;
        en.x = hero.x - hero.carW / 2 - gap - en.carW / 2;
        rival = en;
        info.setText(`car_${String(pick).padStart(2, '0')}   ${spec.BODY_W} x ${spec.BODY_H}   ` +
                     `FACE X ${v(F.X, '-')}  Y ${v(F.Y, '-')}  H ${v(F.H, '-')}`);
        btns.forEach((b, i) => b.setBackgroundColor(i + 1 === pick ? '#e8a33a' : '#3b3f4a'));
    }

    // THE LINE-UP: each rival car (as the game sizes it) left of a piggy car,
    // the pairs in a grid as big as fits under the buttons. Still, no road.
    function lineup(top) {
        const W = scene.scale.width, H = scene.scale.height, K = (CONFIG.VILLAIN || {}).CAR || {};
        const sc = scene.layoutConfig.platformScale;
        const hgy = scene._carGround(), hbw = v((CONFIG.CAR || {}).BODY_W, 254);
        // Each pair's size at hero scale 1 (art px): the widest rival.
        let pw = 0, ph = hgy;
        CARS.forEach((c) => {
            const k = scene._rivalCarH(c, 1) / scene._carGround(c);
            pw = Math.max(pw, v(c.BODY_W, 254) * k);
            ph = Math.max(ph, scene._rivalCarH(c, 1));
        });
        // In art px: a gap between the pair's cars and between pairs.
        const gap = 14, cellW = pw + hbw + 3 * gap, cellH = ph * 1.3;
        let best = 0, cols = 1;
        for (let c = 1; c <= CARS.length; c++) {
            const rows = Math.ceil(CARS.length / c);
            const s = Math.min((W - 8) / (c * cellW), (H - top - 8) / (rows * cellH));
            if (s > best) { best = s; cols = c; }
        }
        const s = best;
        CARS.forEach((c, i) => {
            const col = i % cols, row = Math.floor(i / cols);
            const x0 = 4 + (col * cellW + gap) * s, ground = top + (row + 1) * cellH * s;
            const spec = Object.assign({}, c, { bodyKey: getawayBodyKey(i + 1), tyreKey: getawayTyreKey(i + 1) });
            const en = add(scene._makeCar(0, ground, scene._rivalCarH(spec, s * v(K.SCALE, 1)), spec));
            en.x = x0 + en.carW / 2;
            const he = add(scene._makeCar(0, ground, hgy * s));
            he.x = en.x + en.carW / 2 + gap * s + he.carW / 2;
            [en, he].forEach((o) => { o.onRoad = false; o.setDepth(D + 2); });
            gfx.lineStyle(1, 0x7e6044, 1).lineBetween(x0, ground, he.x + he.carW / 2, ground);
            add(scene.add.text(x0, ground - cellH * s + 2, String(i + 1), {
                fontSize: Math.max(10, Math.round(13 * sc)) + 'px', fontFamily: CONFIG.FONT_FAMILY, color: '#2b2013',
            }).setDepth(D + 3));
        });
    }

    function build() {
        objs.forEach(kill); kill(rival);
        objs = []; btns = []; rival = null; hero = null;
        const W = scene.scale.width, H = scene.scale.height;
        const sc = scene.layoutConfig.platformScale;
        const groundY = Math.round(H * 0.75);
        set = scene._roadPattern(0);

        // THE BACKDROP, which also takes every tap meant for the game.
        const bg = add(scene.add.graphics().setDepth(D));
        bg.fillStyle(hexColor((CONFIG.BACKGROUND || {}).GRADIENT_START_COLOR || '#d5ba95'), 1);
        bg.fillRect(0, 0, W, H);
        // (No zones in the custom build: an invisible rectangle, topmost under
        // the buttons, so no tap or drag reaches the game's pieces.)
        add(scene.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setDepth(D).setInteractive());
        gfx = add(scene.add.graphics().setDepth(D + 1));

        // THE BUTTONS, one per rival car and ALL last, wrapping across the top.
        const fs = Math.max(12, Math.round(16 * sc)), size = fs * 2, pad = 6;
        const perRow = Math.max(1, Math.floor((W - 2 * pad) / (size + pad)));
        [...CARS, null].forEach((c, i) => {
            const x = pad + (i % perRow) * (size + pad), y = pad + Math.floor(i / perRow) * (size + pad);
            const b = add(scene.add.text(x, y, c ? String(i + 1) : 'ALL', {
                fontSize: fs + 'px', fontFamily: CONFIG.FONT_FAMILY, color: '#ffffff',
                backgroundColor: c ? '#3b3f4a' : (all ? '#e8a33a' : '#6b4a2a'), fixedWidth: size, fixedHeight: size, align: 'center',
                padding: { top: Math.round((size - fs * 1.3) / 2) },
            }).setDepth(D + 3).setInteractive({ useHandCursor: true }));
            b.on('pointerdown', () => {
                if (!c) { all = !all; build(); return; }
                pick = i + 1;
                if (all) { all = false; build(); } else makeRival(groundY);
            });
            if (c) btns.push(b);
        });
        const rows = Math.ceil((CARS.length + 1) / perRow);
        if (all) { lineup(pad + rows * (size + pad)); return; }

        // THE PIGGY CAR, at its size in the game.
        const real = scene.cars && scene.cars[0];
        const h = real ? real.carH : 80 * sc;
        hero = add(scene._makeCar(W * 0.6, groundY, h));
        hero.onRoad = false;
        hero.setDepth(D + 2);

        info = add(scene.add.text(pad, pad + rows * (size + pad), '', {
            fontSize: fs + 'px', fontFamily: CONFIG.FONT_FAMILY, color: '#2b2013',
        }).setDepth(D + 3));
        if (CARS.length) makeRival(groundY);
    }

    // EACH FRAME: the road slides back at road speed, the tyres spin at road
    // speed, and both cars ride the bumps.
    function step(time, delta) {
        if (!gfx || !gfx.scene || !hero || !hero.scene) return;
        const R = CONFIG.ROAD || {}, BU = R.BUMPS || {}, C = CONFIG.CAR || {};
        const sc = scene.layoutConfig.platformScale;
        const W = scene.scale.width, y = Math.round(scene.scale.height * 0.75);
        off += scene._raceV() * Math.min(delta, 50) / 1000;

        const period = Math.max(20, v(R.PERIOD, 420) * sc);
        const lineW = Math.max(1, v(R.LINE_W, 3) * sc);
        const lineC = hexColor(R.LINE_COLOR || '#a3825c'), markC = hexColor(R.MARK_COLOR || '#7e6044');
        const bumpH = v(BU.H, 6) * sc, bumpW = Math.max(2, v(BU.W, 40) * sc);
        const stepX = Math.max(1, v(R.SAMPLE, 4) * sc);
        const bumpP = scene._bumpEvery(), bumpOff = off % bumpP, o = off % period;
        const heightAt = (x) => {
            let hgt = 0;
            for (const b of set.bumps) {
                const w = bumpW * b.w;
                let c = b.at * bumpP - bumpOff;
                c += Math.round((x - c) / bumpP) * bumpP;
                const d = Math.abs(x - c);
                if (d < w / 2) hgt += bumpH * b.h * 0.5 * (1 + Math.cos(Math.PI * d / (w / 2)));
            }
            return hgt;
        };

        const g = gfx;
        g.clear();
        g.lineStyle(lineW, lineC, 1);
        g.beginPath();
        g.moveTo(0, y - heightAt(0));
        for (let x = stepX; x < W; x += stepX) g.lineTo(x, y - heightAt(x));
        g.lineTo(W, y - heightAt(W));
        g.strokePath();
        for (let base = -period; base < W + period; base += period) {
            for (const m of set.marks) {
                const x = base + m.at * period - o;
                if (x < 0 || x > W) continue;
                const yy = y - heightAt(x);
                if (m.kind === 'dash') {
                    const len = (8 + 14 * m.size) * sc;
                    g.lineStyle(lineW, markC, 1);
                    g.lineBetween(x, yy, Math.min(x + len, W), y - heightAt(Math.min(x + len, W)));
                } else {
                    g.fillStyle(markC, 1);
                    g.fillCircle(x, yy + (4 + 5 * m.drop) * sc, (1.2 + 1.6 * m.size) * sc);
                }
            }
        }

        const spin = v(C.SPIN_DEG_PER_SEC, 540) * v((CONFIG.RACE || {}).SPIN_AT_ROAD, 1.3) * delta / 1000;
        for (const car of [hero, rival]) {
            if (!car || !car.scene) continue;
            car.wheelAngle = (car.wheelAngle + spin) % 360;
            for (const t of car.tyres) t.setAngle(car.wheelAngle);
            scene._suspend(car, heightAt, 0, delta);
        }
    }

    // EVERY CAR DESIGN first: the game only loads them a level or two ahead.
    const loads = [];
    CARS.forEach((c, i) => {
        loads.push(scene.assets.ensureImage(getawayBodyKey(i + 1), c.BODY));
        loads.push(scene.assets.ensureImage(getawayTyreKey(i + 1), c.TYRE));
    });
    Promise.all(loads).then(build);
    scene.events.on('update', step);
    // THE ARROW KEYS step through the cars (wrapping), out of ALL if in it.
    window.addEventListener('keydown', (e) => {
        if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !CARS.length || !info) return;
        e.preventDefault();
        pick = (pick - 1 + (e.key === 'ArrowRight' ? 1 : -1) + CARS.length) % CARS.length + 1;
        if (all) { all = false; build(); } else makeRival(Math.round(scene.scale.height * 0.75));
    });
    // A RESIZE rebuilds it, once the game's own relayout has had its turn.
    scene.scale.on('resize', () => scene.time.delayedCall(300, build));
};
