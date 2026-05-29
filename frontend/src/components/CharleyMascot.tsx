'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../app/providers/auth';

/* ── State machine ────────────────────────────────────────────────────────── */

type MascotState = 'welcoming' | 'relaxing' | 'studying' | 'coaching' | 'idle';

function getMascotState(path: string): MascotState {
  if (path === '/course-picker')          return 'welcoming';
  if (path.startsWith('/dashboard'))      return 'relaxing';
  if (path.startsWith('/workspace'))      return 'studying';
  if (path.startsWith('/mastery'))        return 'coaching';
  return 'idle';
}

const ACTIVE_ROUTES = ['/course-picker', '/dashboard', '/workspace', '/mastery'];

/* ── Entry point ──────────────────────────────────────────────────────────── */

export default function CharleyMascot() {
  const pathname    = usePathname();
  const { user: authUser } = useAuth();

  const [activeState, setActiveState] = useState<MascotState>('idle');
  const [visible,     setVisible]     = useState(true);
  const [dismissed,   setDismissed]   = useState(false);
  const prevStateRef  = useRef<MascotState>('idle');

  /* Cross-fade on route change */
  useEffect(() => {
    const next = getMascotState(pathname ?? '');
    if (next === prevStateRef.current) return;
    prevStateRef.current = next;
    Promise.resolve(null).then(() => setVisible(false));
    const t = setTimeout(() => {
      setActiveState(next);
      setVisible(true);
    }, 220);
    return () => clearTimeout(t);
  }, [pathname]);

  const show = !dismissed && !!authUser && ACTIVE_ROUTES.some(r => (pathname ?? '').startsWith(r));
  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 group select-none" style={{ pointerEvents: 'auto' }}>
      {/* Dismiss (appears on hover) */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10 cursor-pointer"
        style={{ background: '#E8F0EB', color: '#527061', border: '1px solid #D3E0D8' }}
        aria-label="Dismiss Charley the owl"
      >
        ×
      </button>

      {/* Animated wrapper */}
      <div
        className={activeState === 'coaching' ? 'animate-charley-bob' : 'animate-charley-breath'}
        style={{
          opacity:    visible ? 1 : 0,
          transform:  visible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.90)',
          transition: 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.34,1.28,0.64,1)',
          filter:     'drop-shadow(0 6px 16px rgba(28,51,41,0.12))',
        }}
      >
        <OwlSVG state={activeState} />
      </div>
    </div>
  );
}

/* ── SVG Owl ──────────────────────────────────────────────────────────────── */

function OwlSVG({ state }: { state: MascotState }) {
  const isStudying  = state === 'studying';
  const isCoaching  = state === 'coaching';
  const isRelaxing  = state === 'relaxing';
  const isWelcoming = state === 'welcoming';

  return (
    <svg
      width="82"
      height="102"
      viewBox="0 0 82 102"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Charley the owl"
    >
      {/* ── Ear tufts ───────────────────── */}
      <polygon points="22,16 16,4 30,14"  fill="#B4CEB8"/>
      <polygon points="60,16 66,4  52,14" fill="#B4CEB8"/>

      {/* ── Head ────────────────────────── */}
      <circle cx="41" cy="33" r="25" fill="#D1E6D9"/>

      {/* ── Face mask ───────────────────── */}
      <ellipse cx="41" cy="34" rx="17" ry="16" fill="#F4FAF5"/>

      {/* ── Coaching sweatband ──────────── */}
      {isCoaching && (
        <path d="M17 20 Q41 13 65 20"
          stroke="#4ADE80" strokeWidth="6" fill="none" strokeLinecap="round"/>
      )}

      {/* ── Brows ───────────────────────── */}
      {isCoaching ? (
        <>
          {/* Furrowed / determined */}
          <path d="M22 24 Q29 19 35 22" stroke="#517B3E" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
          <path d="M47 22 Q53 19 60 24" stroke="#517B3E" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
        </>
      ) : (
        <>
          {/* Relaxed brows */}
          <path d="M23 25 Q29 22 33 23" stroke="#86EFAC" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M49 23 Q53 22 59 25" stroke="#86EFAC" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </>
      )}

      {/* ── Eyes ────────────────────────── */}
      {/* Left */}
      <circle cx="31" cy="31" r="9.5" fill="white"/>
      <circle cx="31" cy="31" r="6.5" fill="#1C3329"/>
      <circle cx="31" cy="31" r="4"   fill="#2A5038"/>
      <circle cx="33.2" cy="28.8" r="2"   fill="white"/>

      {/* Right */}
      <circle cx="51" cy="31" r="9.5" fill="white"/>
      <circle cx="51" cy="31" r="6.5" fill="#1C3329"/>
      <circle cx="51" cy="31" r="4"   fill="#2A5038"/>
      <circle cx="53.2" cy="28.8" r="2"   fill="white"/>

      {/* Screen glow on eyes (studying) */}
      {isStudying && (
        <>
          <circle cx="31" cy="31" r="9.5" fill="rgba(134,239,172,0.14)" className="animate-charley-glow"/>
          <circle cx="51" cy="31" r="9.5" fill="rgba(134,239,172,0.14)" className="animate-charley-glow"/>
        </>
      )}

      {/* ── Glasses (studying) ──────────── */}
      {isStudying && (
        <g fill="none" stroke="#517B3E" strokeWidth="1.8">
          <circle cx="31" cy="31" r="11.5"/>
          <circle cx="51" cy="31" r="11.5"/>
          {/* Bridge */}
          <path d="M42.5 31 H39.5" strokeLinecap="round"/>
          {/* Arms */}
          <path d="M19.5 31 L17 30" strokeLinecap="round"/>
          <path d="M62.5 31 L65 30" strokeLinecap="round"/>
        </g>
      )}

      {/* ── Beak ────────────────────────── */}
      <path d="M38 44 L41 50 L44 44 Q41 42 38 44Z" fill="#F9DE8B"/>

      {/* ── Body ────────────────────────── */}
      <ellipse cx="41" cy="76" rx="23" ry="22" fill="#C8DCCC"/>

      {/* Belly stripes */}
      <path d="M29 71 Q41 68 53 71" stroke="#B0C8B6" strokeWidth="1.1" fill="none"/>
      <path d="M27 80 Q41 77 55 80" stroke="#B0C8B6" strokeWidth="1.1" fill="none"/>
      <path d="M28 89 Q41 86 54 89" stroke="#B0C8B6" strokeWidth="1.1" fill="none"/>

      {/* ── Left wing ───────────────────── */}
      <path d="M18 67 Q5 59 9 77 Q12 90 26 94 Q19 79 18 67Z" fill="#B4CEB8"/>

      {/* ── Right wing (raised = welcoming) */}
      {isWelcoming ? (
        <path
          d="M64 67 Q77 59 73 77 Q70 90 56 94 Q63 79 64 67Z"
          fill="#B4CEB8"
          className="animate-charley-wave"
        />
      ) : (
        <path d="M64 67 Q77 59 73 77 Q70 90 56 94 Q63 79 64 67Z" fill="#B4CEB8"/>
      )}

      {/* ── Relaxing: matcha latte ───────── */}
      {isRelaxing && (
        <g className="animate-charley-sip">
          {/* Cup body */}
          <rect x="33" y="74" width="17" height="13" rx="2.5" fill="#86EFAC"/>
          {/* Rim */}
          <rect x="31" y="74" width="21" height="3" rx="1.5" fill="#4ADE80"/>
          {/* Handle */}
          <path d="M50 77 Q56 77 56 81 Q56 85 50 85" stroke="#4ADE80" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
          {/* Latte art (swirl) */}
          <path d="M36 82 Q39 80 42 82 Q39 84 36 82" stroke="rgba(255,255,255,0.6)" strokeWidth="1" fill="none"/>
          {/* Steam */}
          <path d="M37 72 Q35 67 37 63" stroke="#D1E6D9" strokeWidth="1.2" fill="none" strokeLinecap="round" className="animate-charley-steam"/>
          <path d="M41 71 Q39 65 41 61" stroke="#D1E6D9" strokeWidth="1.2" fill="none" strokeLinecap="round" className="animate-charley-steam" style={{ animationDelay: '0.4s' }}/>
          <path d="M45 72 Q43 67 45 63" stroke="#D1E6D9" strokeWidth="1.2" fill="none" strokeLinecap="round" className="animate-charley-steam" style={{ animationDelay: '0.8s' }}/>
        </g>
      )}

      {/* ── Studying: tiny laptop ────────── */}
      {isStudying && (
        <g>
          {/* Screen lid */}
          <rect x="19" y="72" width="44" height="22" rx="2" fill="#D1E6D9" stroke="#B4CEB8" strokeWidth="1"/>
          {/* Screen */}
          <rect x="21" y="74" width="40" height="18" rx="1" fill="#86EFAC"/>
          {/* Code lines */}
          <line x1="23" y1="78" x2="41" y2="78" stroke="#517B3E" strokeWidth="1.3" strokeLinecap="round" opacity="0.75"/>
          <line x1="23" y1="82" x2="38" y2="82" stroke="#517B3E" strokeWidth="1.3" strokeLinecap="round" opacity="0.55"/>
          <line x1="23" y1="86" x2="43" y2="86" stroke="#517B3E" strokeWidth="1.3" strokeLinecap="round" opacity="0.75"/>
          <line x1="23" y1="90" x2="36" y2="90" stroke="#517B3E" strokeWidth="1.3" strokeLinecap="round" opacity="0.55"/>
          {/* Blinking cursor */}
          <rect x="38" y="89" width="1.4" height="7" fill="#1C3329" className="animate-charley-cursor"/>
          {/* Base / keyboard */}
          <rect x="17" y="93" width="48" height="4" rx="2" fill="#B4CEB8"/>
        </g>
      )}

      {/* ── Feet ────────────────────────── */}
      <g stroke="#517B3E" strokeWidth="2.2" strokeLinecap="round">
        <path d="M32 97 L26 102"/>
        <path d="M32 97 L32 102"/>
        <path d="M32 97 L38 102"/>
        <path d="M50 97 L44 102"/>
        <path d="M50 97 L50 102"/>
        <path d="M50 97 L56 102"/>
      </g>
    </svg>
  );
}
