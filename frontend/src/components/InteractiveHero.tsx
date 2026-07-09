'use client';

/**
 * InteractiveHero — the "expanding card" hero.
 *
 * Resting state: a light, minimal frosted-glass hero card (h1 + CTA only —
 * compact, no icon/illustration, no badge), sitting in the middle of the
 * page — no dark fill, no glow aura, blends with the page background.
 *
 * Expanded state (`isExpanded === true`, driven by the parent's
 * `isLoginModalOpen`): the SAME `motion.div` (no route change, no
 * separate modal element — one persistent node) grows via Framer Motion's
 * `layout` projection to fill the viewport and becomes a deep matcha-green
 * glassmorphic immersive panel. `children` (the login/auth panel content,
 * owned and passed down by page.tsx) renders inside a light glass sub-card
 * centered within that panel — the app's actual entry point into the
 * Workspace, since the Workspace itself lives behind auth and can't be
 * pre-rendered here.
 *
 * The hero content and `children` are both permanently mounted and crossfade
 * via opacity (not AnimatePresence — an exit/enter mount cycle fights the
 * parent's in-progress `layout` spring, see the comment at the crossfade
 * below); the box itself morphs via the `layout` prop with weighty spring
 * physics.
 */

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { landing } from '../app/locales/landing';

interface Props {
  onOpenAuth: () => void;
  lang: 'he' | 'en';
  isExpanded: boolean;
  children?: ReactNode;
}

const SPRING = { type: 'spring', stiffness: 100, damping: 20 } as const;

export function InteractiveHero({ onOpenAuth, lang, isExpanded, children }: Props) {
  const t  = landing[lang];
  const he = lang === 'he';

  return (
    <main
      className="relative flex items-center justify-center"
      style={{
        minHeight: 'calc(100vh - 116px)',
        padding: '40px 24px',
        /* Header sits at z-20 — while expanded, this must out-rank it so the
           fixed full-viewport card isn't confined below the header's own
           stacking context (a position:fixed descendant can't escape an
           ancestor's stacking order, only its normal-flow layout). */
        zIndex: isExpanded ? 50 : 10,
      }}
      dir={he ? 'rtl' : 'ltr'}
    >
      {/* ── The expanding card itself — light glass at rest, dark immersive panel when expanded ── */}
      <motion.div
        layout
        transition={{ layout: SPRING }}
        style={{
          position:             isExpanded ? 'fixed' : 'relative',
          inset:                isExpanded ? 0 : 'auto',
          zIndex:               isExpanded ? 40 : 1,
          width:                isExpanded ? '100vw' : '100%',
          height:               isExpanded ? '100vh' : 'auto',
          maxWidth:             isExpanded ? '100vw' : '520px',
          backgroundColor:      isExpanded ? 'rgba(10,26,17,0.96)' : 'rgba(255,255,255,0.68)',
          backdropFilter:       'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderRadius:         isExpanded ? 0 : 24,
          padding:              isExpanded ? 0 : '64px 44px',
          boxShadow:            isExpanded
            ? 'none'
            : '0 8px 48px rgba(30,42,69,0.10), 0 1px 8px rgba(30,42,69,0.06)',
          border:               isExpanded ? 'none' : '1px solid rgba(255,255,255,0.85)',
          overflowY:            isExpanded ? 'auto' : 'visible',
          textAlign:            'center',
        }}
      >
        {/* Decorative inner glow — only visible once expanded, gives the
            immersive panel depth instead of a flat dark fill. */}
        {isExpanded && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(ellipse at 50% 28%, rgba(74,222,128,0.16) 0%, transparent 62%)',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Both branches stay permanently mounted and crossfade via opacity —
            deliberately NOT AnimatePresence mount/unmount here. The parent's
            own `layout` spring is mid-flight during this swap, and an
            exit/enter cycle (even mode="popLayout") fights that in-progress
            layout projection: the exiting child's box keeps getting
            re-measured against a moving parent, which can stall
            onExitComplete indefinitely (observed: page never recovers,
            requestAnimationFrame stops advancing). A plain opacity crossfade
            has no such dependency on the parent settling. */}
        <div style={{ position: 'relative', width: '100%', height: isExpanded ? '100%' : 'auto' }}>
          <motion.div
            key="hero-content"
            initial={false}
            animate={{ opacity: isExpanded ? 0 : 1 }}
            transition={{ duration: 0.18 }}
            style={{
              pointerEvents: isExpanded ? 'none' : 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '32px',
            }}
          >
              {/* ── H1 — original colour, size, and font ── */}
              <motion.h1
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0  }}
                transition={{ duration: 0.50, delay: 0.10, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  fontSize:      'clamp(2rem, 5vw, 2.7rem)',
                  fontWeight:    800,
                  color:         '#1a2540',
                  lineHeight:    1.22,
                  margin:        0,
                  fontFamily:    'Georgia, serif',
                }}
              >
                {t.heroTitle1}
                <br />
                {t.heroTitle2}
              </motion.h1>

              {/* ── CTA button — original green, original copy ── */}
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.40, delay: 0.22 }}
                whileHover={{
                  scale:     1.03,
                  boxShadow: '0 8px 24px rgba(81,123,62,0.50)',
                }}
                whileTap={{ scale: 0.97 }}
                onClick={onOpenAuth}
                style={{
                  display:         'inline-flex',
                  alignItems:      'center',
                  gap:             '8px',
                  padding:         '13px 32px',
                  borderRadius:    '12px',
                  fontSize:        '1rem',
                  fontWeight:      600,
                  color:           'white',
                  backgroundColor: '#517B3E',
                  border:          'none',
                  cursor:          'pointer',
                  boxShadow:       '0 4px 16px rgba(81,123,62,0.38)',
                  transition:      'opacity 0.2s, transform 0.1s',
                }}
              >
                {t.heroCta}
                {/* Original left-chevron arrow from page.tsx */}
                <svg
                  width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 3 12 9 6" />
                </svg>
              </motion.button>
          </motion.div>

          <motion.div
            key="auth-content"
            initial={false}
            animate={{ opacity: isExpanded ? 1 : 0 }}
            transition={{ duration: 0.22, delay: isExpanded ? 0.18 : 0 }}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              pointerEvents: isExpanded ? 'auto' : 'none',
            }}
          >
              {/* ── Light glass sub-card floating inside the dark immersive panel ──
                  Hosts the existing login/auth form exactly as before, so none of
                  its internal (light-theme) colours need to change. */}
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: '440px',
                  background: 'rgba(255,255,255,0.94)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: '24px',
                  padding: '48px 44px 44px',
                  boxShadow: '0 16px 64px rgba(0,0,0,0.35), 0 2px 12px rgba(0,0,0,0.18)',
                  border: '1px solid rgba(255,255,255,0.6)',
                  textAlign: 'center',
                }}
              >
                {children}
              </div>
          </motion.div>
        </div>
      </motion.div>
    </main>
  );
}
