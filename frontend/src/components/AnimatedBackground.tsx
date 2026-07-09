'use client';

/**
 * AnimatedBackground
 *
 * A "living" full-screen background layer for the U-Note dashboard.
 *
 * LAYERING (z-index)
 *   z-0  ← AnimatedBackground  (this component, fixed, pointer-events:none)
 *   z-0  ← leaf watermarks     (existing, fixed, after this in DOM → renders on top)
 *   z-1  ← <main> content
 *   z-30 ← <header>
 *   z-40 ← sidebar backdrop
 *   z-50 ← sidebar panel / modals
 *
 * PERFORMANCE
 *   • All 5 blob divs are plain `<div>`s animated by CSS @keyframes defined in
 *     globals.css.  `transform` is the only animated property → guaranteed
 *     compositor-thread execution, zero JS overhead per frame.
 *   • The spotlight uses Framer Motion's `useAnimationFrame` to drive two
 *     `useMotionValue`s on the elliptical orbit path (sin/cos math).  Motion
 *     values bypass React render → no re-render on every frame.
 *   • `will-change: transform` is set on every animated element to opt them
 *     into their own GPU layer.
 *   • CSS `@media (prefers-reduced-motion)` freezes the CSS blobs; the JS
 *     `useReducedMotion` hook stops the spotlight frame-loop.
 */

import { useEffect, useRef } from 'react';
import {
  motion,
  useMotionValue,
  useAnimationFrame,
  useReducedMotion,
} from 'framer-motion';

/* ─────────────────────────────────────────────────────────────
   Blob configuration
   Colors use rgba() so opacity is baked into the value — this
   avoids an `opacity` CSS property on elements that already have
   a GPU-heavy blur filter, preventing repaint on older browsers.
───────────────────────────────────────────────────────────── */
const BLOBS = [
  /* A — large matcha light pool, top-left */
  {
    id:    'a',
    color: 'rgba(209,231,221, 0.55)',   // #d1e7dd @ 55%
    w:     520,
    h:     440,
    blur:  92,
    style: { top: '-4%', left: '-3%' },
    anim:  'ab-blob-a 24s ease-in-out infinite alternate',
  },
  /* B — deep blue depth shadow, center-right */
  {
    id:    'b',
    color: 'rgba(30,41,59, 0.13)',      // #1e293b @ 13%
    w:     640,
    h:     560,
    blur:  115,
    style: { top: '28%', left: '55%' },
    anim:  'ab-blob-b 34s ease-in-out infinite alternate',
  },
  /* C — cream light source, top-right */
  {
    id:    'c',
    color: 'rgba(248,250,252, 0.44)',   // #f8fafc @ 44%
    w:     480,
    h:     400,
    blur:  96,
    style: { top: '-2%', left: '52%' },
    anim:  'ab-blob-c 21s ease-in-out infinite alternate',
  },
  /* D — soft matcha accent, bottom-left */
  {
    id:    'd',
    color: 'rgba(200,223,192, 0.48)',   // #c8dfc0 @ 48%
    w:     400,
    h:     340,
    blur:  82,
    style: { top: '62%', left: '1%' },
    anim:  'ab-blob-d 29s ease-in-out infinite alternate',
  },
  /* E — sage pulse, centre */
  {
    id:    'e',
    color: 'rgba(139,175,132, 0.36)',   // #8baf84 @ 36%
    w:     320,
    h:     300,
    blur:  76,
    style: { top: '38%', left: '28%' },
    anim:  'ab-blob-e 19s ease-in-out infinite alternate',
  },
] as const;

/* Spotlight orbit parameters */
const ORBIT = { rx: 200, ry: 100, period: 45_000 } as const;

/* ─────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────── */
export function AnimatedBackground() {
  const prefersReduced    = useReducedMotion() ?? false;
  const prefersReducedRef = useRef(prefersReduced);
  useEffect(() => { prefersReducedRef.current = prefersReduced; }, [prefersReduced]);

  /* Spotlight motion values — updated each frame, never trigger re-renders */
  const spotX = useMotionValue<number>(ORBIT.rx);   // starts at right-most point
  const spotY = useMotionValue<number>(0);

  useAnimationFrame((t) => {
    if (prefersReducedRef.current) return;
    const θ = ((t / ORBIT.period) % 1) * Math.PI * 2;
    spotX.set(Math.cos(θ) * ORBIT.rx);
    spotY.set(Math.sin(θ) * ORBIT.ry);
  });

  return (
    /**
     * motion.div — satisfies the "use Framer Motion" requirement.
     * Fades the entire background in gently on page load.
     * After that FM hands off; all per-frame work is CSS or motion values.
     */
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.8, ease: 'easeOut' }}
      className="fixed inset-0 pointer-events-none select-none overflow-hidden"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      {/* ── CSS-animated blobs ── */}
      {BLOBS.map(blob => (
        <div
          key={blob.id}
          className="ab-blob absolute rounded-full"
          style={{
            ...blob.style,
            width:     blob.w,
            height:    blob.h,
            background: blob.color,
            filter:    `blur(${blob.blur}px)`,
            willChange: 'transform',
            animation: prefersReduced ? 'none' : blob.anim,
          }}
        />
      ))}

      {/* ── FM-driven spotlight (elliptical orbit) ── */}
      <motion.div
        style={{
          x:          spotX,
          y:          spotY,
          position:   'absolute',
          /* Orbit centre sits at ~(50 %, 32 %) of the viewport */
          top:        'calc(32% - 110px)',
          left:       'calc(50% - 130px)',
          width:      260,
          height:     220,
          borderRadius: '50%',
          background: 'rgba(255,255,255, 0.18)',
          filter:     'blur(72px)',
          willChange: 'transform',
        }}
      />

      {/* ── Subtle vignette — darkens edges slightly for depth ── */}
      <div
        style={{
          position:   'absolute',
          inset:      0,
          background: [
            'radial-gradient(ellipse 70% 60% at 50% 40%,',
            '  transparent 40%,',
            '  rgba(26,46,38,0.06) 100%)',
          ].join(''),
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  );
}
