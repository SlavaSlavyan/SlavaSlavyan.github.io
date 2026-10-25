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

    const pz = Panzoom(content, {
        minScale: 0.3,
        maxScale: 6,
        cursor: 'grab',
        contain: 'outside',
    });

    viewport.addEventListener('wheel', pz.zoomWithWheel, { passive: false });

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
