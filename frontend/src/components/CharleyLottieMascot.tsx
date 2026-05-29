'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Lottie from 'react-lottie-player';
import { useAuth } from '../app/providers/auth';

/* ── Types ───────────────────────────────────────────────────────────────── */

type AnimState = 'idle' | 'thinking' | 'celebrating' | 'dashboard';

const ACTIVE_ROUTES = ['/dashboard', '/workspace', '/mastery'];
const TRANSITION_MS = 300;

function getAnimState(path: string): AnimState {
  if (path.startsWith('/dashboard')) return 'dashboard';
  if (path.startsWith('/workspace')) return 'thinking';
  if (path.startsWith('/mastery'))   return 'celebrating';
  return 'idle';
}

/* ── Component ───────────────────────────────────────────────────────────── */

export default function CharleyLottieMascot() {
  const pathname                    = usePathname();
  const { user: authUser }          = useAuth();
  const [dismissed, setDismissed]   = useState(false);

  // Two-slot cross-fade: A and B alternate as the "active" and "incoming" slot.
  const [dataA,  setDataA]  = useState<object | null>(null);
  const [dataB,  setDataB]  = useState<object | null>(null);
  const [opacA,  setOpacA]  = useState(0);
  const [opacB,  setOpacB]  = useState(0);

  // Which slot is currently showing; the other is the next target.
  const activeSlot  = useRef<'A' | 'B'>('A');
  const pendingSlot = useRef<'A' | 'B'>('B');
  const swapTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevState   = useRef<AnimState | null>(null);

  const loadAnimation = useCallback((state: AnimState) => {
    const url  = `/assets/mascot/charley_${state}.json`;
    const next = pendingSlot.current;
    const prev = activeSlot.current;

    fetch(url)
      .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
      .then((data: object) => {
        // 1. Write data into the INACTIVE slot (still at opacity 0 — invisible).
        if (next === 'A') setDataA(data);
        else              setDataB(data);

        // 2. After React renders the new slot at opacity 0, start the cross-fade.
        //    Double-rAF ensures the browser has committed a frame with the new node.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (next === 'A') { setOpacA(1); setOpacB(0); }
            else              { setOpacB(1); setOpacA(0); }
          })
        );

        // 3. After the CSS transition finishes, flip slot references.
        if (swapTimer.current) clearTimeout(swapTimer.current);
        swapTimer.current = setTimeout(() => {
          activeSlot.current  = next;
          pendingSlot.current = prev;
        }, TRANSITION_MS + 60);
      })
      .catch(() => { /* Silently fail — show nothing for this state */ });
  }, []);

  // Re-load whenever the route (and therefore AnimState) changes.
  useEffect(() => {
    const state = getAnimState(pathname ?? '');
    if (state === prevState.current) return;
    prevState.current = state;
    loadAnimation(state);
  }, [pathname, loadAnimation]);

  // Cleanup swap timer on unmount.
  useEffect(() => () => {
    if (swapTimer.current) clearTimeout(swapTimer.current);
  }, []);

  const show =
    !dismissed &&
    !!authUser &&
    ACTIVE_ROUTES.some(r => (pathname ?? '').startsWith(r));

  if (!show) return null;

  return (
    <div
      className="fixed bottom-6 left-6 z-50 group select-none w-28 h-28"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Dismiss button — visible on hover */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10 cursor-pointer"
        style={{ background: '#E8F0EB', color: '#527061', border: '1px solid #D3E0D8' }}
        aria-label="Dismiss Charley"
      >
        ×
      </button>

      {/* Cross-fade container */}
      <div
        className="relative w-full h-full"
        style={{ filter: 'drop-shadow(0 6px 16px rgba(28,51,41,0.12))' }}
        aria-hidden="true"
      >
        {/* Slot A */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: opacA, transition: `opacity ${TRANSITION_MS}ms ease` }}
        >
          {dataA && (
            <Lottie
              loop
              play
              animationData={dataA}
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </div>

        {/* Slot B */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: opacB, transition: `opacity ${TRANSITION_MS}ms ease` }}
        >
          {dataB && (
            <Lottie
              loop
              play
              animationData={dataB}
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
