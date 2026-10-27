import { useEffect, useRef } from 'react';

const UP = '16,185,129';
const DOWN = '244,63,94';

/** Fixed scene: soft colour mesh plus a faint, slowly scrolling candlestick chart with a price grid. */
export default function HudBackground() {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const STEP = 16; // candle pitch in px
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let offset = 0;
    let price = 100;
    let candles = [];

    const nextCandle = () => {
      const open = price;
      const drift = (Math.random() - 0.48) * 2.6;
      const close = open + drift;
      const high = Math.max(open, close) + Math.random() * 1.4;
      const low = Math.min(open, close) - Math.random() * 1.4;
      price = close;
      return { open, close, high, low };
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const need = Math.ceil(w / STEP) + 4;
      while (candles.length < need) candles.push(nextCandle());
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const top = h * 0.38;
      const bottom = h * 0.96;

      // price grid
      ctx.strokeStyle = 'rgba(148,163,184,0.05)';
      ctx.lineWidth = 1;
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.18)';
      const visible = candles.slice(0, Math.ceil(w / STEP) + 2);
      const hi = Math.max(...visible.map((k) => k.high));
      const lo = Math.min(...visible.map((k) => k.low));
      const span = hi - lo || 1;
      const y = (v) => bottom - ((v - lo) / span) * (bottom - top);
      for (let i = 0; i <= 5; i++) {
        const gy = top + ((bottom - top) * i) / 5;
        ctx.beginPath();
        ctx.moveTo(0, gy + 0.5);
        ctx.lineTo(w, gy + 0.5);
        ctx.stroke();
        ctx.fillText((hi - (span * i) / 5).toFixed(2), w - 52, gy - 4);
      }

      // candles
      visible.forEach((k, i) => {
        const x = i * STEP - offset;
        const col = k.close >= k.open ? UP : DOWN;
        ctx.strokeStyle = `rgba(${col},0.22)`;
        ctx.fillStyle = `rgba(${col},0.16)`;
        ctx.beginPath();
        ctx.moveTo(x + STEP / 2, y(k.high));
        ctx.lineTo(x + STEP / 2, y(k.low));
        ctx.stroke();
        const yo = y(k.open);
        const yc = y(k.close);
        ctx.fillRect(x + 4, Math.min(yo, yc), STEP - 8, Math.max(1.5, Math.abs(yc - yo)));
      });

      // moving average
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(56,189,248,0.22)';
      ctx.lineWidth = 1.5;
      visible.forEach((_, i) => {
        const win = visible.slice(Math.max(0, i - 8), i + 1);
        const ma = win.reduce((a, k) => a + k.close, 0) / win.length;
        const px = i * STEP - offset + STEP / 2;
        if (i === 0) ctx.moveTo(px, y(ma));
        else ctx.lineTo(px, y(ma));
      });
      ctx.stroke();
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return; // ~30fps is plenty for a backdrop
      last = now;
      offset += 0.35;
      if (offset >= STEP) {
        offset -= STEP;
        candles.shift();
        candles.push(nextCandle());
      }
      draw();
    };

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) raf = requestAnimationFrame(loop);
    };
    const onMove = (e) => {
      document.documentElement.style.setProperty('--gx', `${e.clientX}px`);
      document.documentElement.style.setProperty('--gy', `${e.clientY}px`);
    };

    resize();
    draw();
    if (!reduced) raf = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none">
      <div className="mesh mesh-1" />
      <div className="mesh mesh-2" />
      <div className="mesh mesh-3" />
      <div className="mesh mesh-4" />
      <div className="cursor-glow" />
      <canvas ref={ref} className="market-canvas fixed inset-0 z-0 h-full w-full" />
    </div>
  );
}
