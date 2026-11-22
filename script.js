import Panzoom from 'https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4/+esm';

document.addEventListener('DOMContentLoaded', async () => {
    const viewport = document.getElementById('viewport');
    const content  = document.getElementById('content');

    if (!content) {
        console.error('Элемент #content не найден в DOM');
        return;
    }

    // Ждём, пока SVG получит реальные размеры — иначе Panzoom стартует «вхолостую»
    try {
        if (!content.complete || content.naturalWidth === 0) {
            await content.decode();
        }
    } catch (err) {
        console.error('Не удалось загрузить tree.svg', err);
        return;
    }

    const MIN_SCALE = 0.3;
    const MAX_SCALE = 6;

    const pz = Panzoom(content, {
        minScale: MIN_SCALE,
        maxScale: MAX_SCALE,
        cursor: 'grab',
        contain: 'outside',
    });

    /* ==================== ПЛАВНЫЙ ЗУМ (ЛЕРП) ==================== */

    const ZOOM_SPEED  = 0.0015; // чувствительность колеса
    const ZOOM_LERP   = 0.15;   // доля пути к цели за ~кадр (60 fps): меньше = плавнее
    const ZOOM_EPS    = 0.001;  // порог, при котором считаем, что цель достигнута

    let targetScale = pz.getScale();
    let zoomFocal   = { clientX: 0, clientY: 0 };
    let zoomRafId   = null;
    let zoomLast    = 0;

    const zoomStep = (now) => {
        const dt      = Math.min(now - zoomLast, 50); // защита от больших скачков
        zoomLast      = now;
        const current = pz.getScale();
        const diff    = targetScale - current;

        if (Math.abs(diff) < ZOOM_EPS) {
            pz.zoomToPoint(targetScale, zoomFocal, { animate: false });
            zoomRafId = null;
            return;
        }

        // Независимый от частоты кадров лерп
        const k    = 1 - Math.pow(1 - ZOOM_LERP, dt / 16.667);
        const next = current + diff * k;

        pz.zoomToPoint(next, zoomFocal, { animate: false });

        // Если Panzoom ограничил масштаб (contain: 'outside'), не гонимся за недостижимой целью
        if (Math.abs(pz.getScale() - next) > 1e-4) {
            targetScale = pz.getScale();
        }

        zoomRafId = requestAnimationFrame(zoomStep);
    };

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Нормализация deltaY для разных режимов прокрутки
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;       // строки
        else if (e.deltaMode === 2) delta *= 100; // страницы

        // Если анимация не идёт — стартуем от текущего масштаба
        if (zoomRafId === null) targetScale = pz.getScale();

        targetScale *= Math.exp(-delta * ZOOM_SPEED);
        targetScale  = Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetScale));

        zoomFocal = { clientX: e.clientX, clientY: e.clientY };

        if (zoomRafId === null) {
            zoomLast  = performance.now();
            zoomRafId = requestAnimationFrame(zoomStep);
        }
    }, { passive: false });

    /* ==================== ИНЕРЦИЯ ==================== */

    const FRICTION = 0.94;
    const STOP_VEL = 0.1;
    const MIN_VEL  = 0.1;

    let lastPan  = null;
    let lastTime = 0;
    let vx = 0, vy = 0;
    let inInertia = false;
    let rafId = null;

    // Замер скорости при каждом движении (panzoompan)
    content.addEventListener('panzoompan', (e) => {
        if (inInertia) return; // игнорируем собственные вызовы pz.pan()

        const now = performance.now();
        const pan = { x: e.detail.x, y: e.detail.y };

        if (lastPan && now > lastTime) {
            const dt  = now - lastTime;
            const ivx = (pan.x - lastPan.x) / dt;
            const ivy = (pan.y - lastPan.y) / dt;
            vx = 0.8 * ivx + 0.2 * vx;
            vy = 0.8 * ivy + 0.2 * vy;
        }

        lastPan  = pan;
        lastTime = now;
    });

    // Начало нового перетаскивания — прерываем инерцию
    content.addEventListener('panzoomstart', () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        inInertia = false;
        lastPan = null;
        vx = 0;
        vy = 0;
    });

    // Окончание перетаскивания — запускаем скольжение
    content.addEventListener('panzoomend', () => {
        let mvx = vx * 16; // переводим в «единицы за кадр»
        let mvy = vy * 16;

        if (Math.hypot(mvx, mvy) < MIN_VEL) return;

        inInertia = true;

        const step = () => {
            mvx *= FRICTION;
            mvy *= FRICTION;

            if (Math.abs(mvx) < STOP_VEL && Math.abs(mvy) < STOP_VEL) {
                inInertia = false;
                lastPan   = null;
                rafId     = null;
                return;
            }

            pz.pan(mvx, mvy, { relative: true });
            rafId = requestAnimationFrame(step);
        };

        rafId = requestAnimationFrame(step);
    });
});