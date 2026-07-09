'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  motion,
  useMotionValue,
  animate,
  useReducedMotion,
  type PanInfo,
} from 'framer-motion';
import {
  BookOpen,
  PenTool,
  Target,
  Brain,
  Folder,
  Presentation as PresentationIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   Utility: hex → rgba string (avoids CSS color-mix compat issues)
───────────────────────────────────────────────────────────── */
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ─────────────────────────────────────────────────────────────
   Card definitions
───────────────────────────────────────────────────────────── */
interface CardDef {
  id: string;
  titleHe: string;
  titleEn: string;
  subtitleHe: string;
  subtitleEn: string;
  route: string | ((courseId: string) => string);
  Icon: React.ElementType;
  accent: string;   // icon + active border colour
  iconBg: string;   // icon container background
  cardFrom: string; // gradient tint start (active card)
}

const CARDS: CardDef[] = [
  {
    id: 'studylab',
    titleHe: 'מרחב לימוד',
    titleEn: 'StudyLab',
    subtitleHe: 'שאל שאלות על החומר שלך',
    subtitleEn: 'Ask questions about your material',
    route: '/workspace',
    Icon: BookOpen,
    accent: '#517B3E',
    iconBg: '#CBE5BC',
    cardFrom: '#EDF8E7',
  },
  {
    id: 'writing',
    titleHe: 'כתיבה אקדמית',
    titleEn: 'Academic Writing',
    subtitleHe: 'כתיבת עבודות בסגנון האישי שלך',
    subtitleEn: 'Write papers in your own style',
    route: '/academic-writing',
    Icon: PenTool,
    accent: '#5E7A3A',
    iconBg: '#D2E8BB',
    cardFrom: '#F4FAF0',
  },
  {
    id: 'mastery',
    titleHe: 'שליטה בחומר',
    titleEn: 'Mastery',
    subtitleHe: 'חידונים ומעקב התקדמות',
    subtitleEn: 'Quizzes & progress tracking',
    route: (cid: string) => `/mastery?course=${cid}`,
    Icon: Target,
    accent: '#2A7060',
    iconBg: '#B4DDD6',
    cardFrom: '#E8F7F4',
  },
  {
    id: 'professor',
    titleHe: 'הראש של המרצה',
    titleEn: "Prof's Brain",
    subtitleHe: 'סימולציית מבחן מתקדמת',
    subtitleEn: 'Advanced exam simulation',
    route: '/workspace/professor-simulator',
    Icon: Brain,
    accent: '#6B3A5A',
    iconBg: '#E0C4D8',
    cardFrom: '#F8EEF6',
  },
  {
    id: 'documents',
    titleHe: 'המסמכים שלי',
    titleEn: 'My Documents',
    subtitleHe: 'ניהול הקבצים שהעלית',
    subtitleEn: 'Manage your uploaded files',
    route: '/my-documents',
    Icon: Folder,
    accent: '#7A5A2A',
    iconBg: '#EAD8B4',
    cardFrom: '#FAF5E8',
  },
  {
    id: 'presentation',
    titleHe: 'צור מצגת',
    titleEn: 'Create Presentation',
    subtitleHe: 'מצגת מקצועית מהחומר שלך',
    subtitleEn: 'Professional deck from your materials',
    route: '/presentation-generator',
    Icon: PresentationIcon,
    accent: '#2E3E7A',
    iconBg: '#B8C4E4',
    cardFrom: '#EAEEF8',
  },
];

const CARD_GAP = 20; // px

/* ─────────────────────────────────────────────────────────────
   Spring presets
───────────────────────────────────────────────────────────── */
const SNAP_SPRING = { type: 'spring', stiffness: 320, damping: 28, mass: 0.85 } as const;

/* ─────────────────────────────────────────────────────────────
   Props
───────────────────────────────────────────────────────────── */
interface Props {
  lang: 'he' | 'en';
  courseId: string;
  onNavigate: (path: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   DashboardCarousel
───────────────────────────────────────────────────────────── */
export function DashboardCarousel({ lang, courseId, onNavigate }: Props) {
  const he             = lang === 'he';
  const prefersReduced = useReducedMotion();

  /* Refs ─────────────────────────────────────────────────── */
  const containerRef   = useRef<HTMLDivElement>(null);
  const firstCardRef   = useRef<HTMLDivElement>(null);
  const wasDraggedRef  = useRef(false);
  // Live measurements — readable in callbacks without stale closures
  const containerWRef  = useRef(0);
  const cardWRef       = useRef(0);
  const activeIdxRef   = useRef(0);

  /* State ─────────────────────────────────────────────────── */
  const [activeIndex,     setActiveIndex]     = useState(0);
  const [hasMeasured,     setHasMeasured]     = useState(false);
  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0 });

  /* Motion value ──────────────────────────────────────────── */
  const x = useMotionValue(0);

  /* Helpers — stable callbacks that read mutable refs ─────── */
  const getStep   = useCallback(() => cardWRef.current + CARD_GAP,                                        []);
  const getCenter = useCallback(() => (containerWRef.current - cardWRef.current) / 2,                     []);
  const getSnapX  = useCallback((i: number) => getCenter() - i * getStep(),  [getCenter, getStep]);

  /* Measurement + re-positioning on resize ───────────────── */
  useEffect(() => {
    const measure = () => {
      const cW = containerRef.current?.offsetWidth  ?? 0;
      const kW = firstCardRef.current?.offsetWidth  ?? 292;
      if (cW === 0 || kW === 0) return;

      containerWRef.current = cW;
      cardWRef.current      = kW;

      // Reposition track to keep active card centred
      x.set(getSnapX(activeIdxRef.current));

      // Store constraints in state so render never reads refs directly
      const s = kW + CARD_GAP;
      const c = (cW - kW) / 2;
      setDragConstraints({ right: c, left: c - (CARDS.length - 1) * s });
      setHasMeasured(true);
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Track nearest card while dragging ────────────────────── */
  useEffect(() => {
    return x.on('change', val => {
      if (!hasMeasured) return;
      const step   = getStep();
      const center = getCenter();
      const idx = CARDS.reduce((best, _, i) => {
        const d = Math.abs(val - (center - i * step));
        return d < Math.abs(val - (center - best * step)) ? i : best;
      }, 0);
      if (idx !== activeIdxRef.current) {
        activeIdxRef.current = idx;
        setActiveIndex(idx);
      }
    });
  }, [x, hasMeasured, getCenter, getStep]);

  /* Navigate to a card ────────────────────────────────────── */
  const goTo = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(CARDS.length - 1, index));
    activeIdxRef.current = clamped;
    setActiveIndex(clamped);
    animate(
      x,
      getSnapX(clamped),
      prefersReduced ? { duration: 0 } : SNAP_SPRING,
    );
  }, [x, prefersReduced, getSnapX]);

  /* Drag end → snap ──────────────────────────────────────── */
  const handleDragEnd = useCallback(
    (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
      // Mark as "dragged" so card click is suppressed
      wasDraggedRef.current = Math.abs(info.offset.x) > 5;

      const vel       = info.velocity.x;
      const off       = info.offset.x;
      const threshold = getStep() * 0.32;
      const currX     = x.get();
      const step      = getStep();
      const center    = getCenter();

      // Find snap index closest to resting position
      const base = CARDS.reduce((best, _, i) => {
        const d = Math.abs(currX - (center - i * step));
        return d < Math.abs(currX - (center - best * step)) ? i : best;
      }, 0);

      let target = base;
      if (vel < -500 || off < -threshold) target = Math.min(base + 1, CARDS.length - 1);
      if (vel >  500 || off >  threshold) target = Math.max(base - 1, 0);

      goTo(target);
    },
    [x, goTo, getCenter, getStep],
  );

  /* Keyboard navigation ───────────────────────────────────── */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const map: Record<string, number> = {
        ArrowRight: activeIndex - 1,
        ArrowLeft:  activeIndex + 1,
        Home:       0,
        End:        CARDS.length - 1,
      };
      if (e.key in map) { e.preventDefault(); goTo(map[e.key]); }
    },
    [activeIndex, goTo],
  );

  // dragConstraints is kept in state — set inside the measurement effect,
  // so refs are never accessed during render.

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <section
      className="w-full select-none"
      role="region"
      aria-label={he ? 'פעולות מהירות' : 'Quick Actions'}
    >
      {/* ── Arrow buttons + track ── */}
      <div className="relative">

        {/* Previous arrow */}
        <button
          aria-label={he ? 'הקודם' : 'Previous'}
          onClick={() => goTo(activeIndex - 1)}
          disabled={activeIndex === 0}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-10 h-10
                     items-center justify-center rounded-full border border-[#C8DFC0]
                     bg-white/92 shadow-md hover:bg-white hover:shadow-lg
                     disabled:opacity-25 disabled:cursor-not-allowed
                     transition-all duration-200"
          style={{ insetInlineStart: -20 }}
        >
          <ChevronLeft className="w-5 h-5 text-[#517B3E]" />
        </button>

        {/* Track container */}
        <div
          ref={containerRef}
          className="overflow-hidden cursor-grab active:cursor-grabbing"
          dir="ltr"   /* always LTR internally; card text sets its own dir */
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-roledescription="carousel"
        >
          <motion.div
            style={{ x, paddingTop: 20, paddingBottom: 28 }}
            className="flex flex-row"
            drag="x"
            dragConstraints={dragConstraints}
            dragElastic={0.06}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
          >
            {CARDS.map((card, i) => {
              const isActive = i === activeIndex;
              const dist     = Math.abs(i - activeIndex);
              const route    = typeof card.route === 'function'
                ? card.route(courseId)
                : card.route;

              return (
                <div
                  key={card.id}
                  ref={i === 0 ? firstCardRef : undefined}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${CARDS.length}: ${he ? card.titleHe : card.titleEn}`}
                  aria-current={isActive ? true : undefined}
                  style={{
                    width:            'clamp(240px, 70vw, 292px)',
                    flexShrink:       0,
                    marginInlineEnd:  i < CARDS.length - 1 ? CARD_GAP : 0,
                  }}
                >
                  {/* ── Card shell — CSS transitions for scale/opacity (GPU) ── */}
                  <div
                    className="relative flex flex-col gap-4 rounded-2xl border h-full
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#517B3E]"
                    style={{
                      padding:    '22px 24px 20px',
                      minHeight:  172,
                      cursor:     'pointer',
                      willChange: 'transform, opacity, box-shadow',
                      transform:  `scale(${isActive ? 1.05 : dist === 1 ? 0.975 : 0.94})`,
                      opacity:    isActive ? 1 : dist === 1 ? 0.88 : 0.72,
                      transition: [
                        'transform 0.32s cubic-bezier(0.34,1.28,0.64,1)',
                        'opacity 0.24s ease',
                        'box-shadow 0.24s ease',
                        'border-color 0.24s ease',
                        'background 0.24s ease',
                      ].join(', '),
                      background: isActive
                        ? `linear-gradient(148deg, ${card.cardFrom} 0%, #ffffff 100%)`
                        : 'rgba(255,255,255,0.90)',
                      borderColor: isActive
                        ? rgba(card.accent, 0.38)
                        : 'rgba(200,223,192,0.75)',
                      boxShadow: isActive
                        ? `0 18px 52px rgba(26,46,38,0.16), 0 0 0 1.5px ${rgba(card.accent, 0.22)}`
                        : '0 3px 12px rgba(26,46,38,0.08)',
                    }}
                    onClick={() => {
                      if (!wasDraggedRef.current) {
                        if (!isActive) { goTo(i); return; }
                        onNavigate(route);
                      }
                      wasDraggedRef.current = false;
                    }}
                    onMouseEnter={e => {
                      if (!isActive)
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          '0 8px 28px rgba(26,46,38,0.14)';
                    }}
                    onMouseLeave={e => {
                      if (!isActive)
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          '0 3px 12px rgba(26,46,38,0.08)';
                    }}
                  >
                    {/* Icon */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: card.iconBg }}
                    >
                      <card.Icon
                        className="w-[22px] h-[22px]"
                        style={{ color: card.accent }}
                        aria-hidden="true"
                      />
                    </div>

                    {/* Text */}
                    <div
                      dir={he ? 'rtl' : 'ltr'}
                      className={`flex flex-col gap-1 ${he ? 'text-right' : 'text-left'}`}
                    >
                      <p
                        className="font-bold leading-tight"
                        style={{ color: '#1C3329', fontSize: '1.0625rem' }}
                      >
                        {he ? card.titleHe : card.titleEn}
                      </p>
                      <p className="text-sm leading-snug" style={{ color: '#527061' }}>
                        {he ? card.subtitleHe : card.subtitleEn}
                      </p>
                    </div>

                    {/* Active indicator dot */}
                    <motion.div
                      className="absolute top-3 end-3 rounded-full"
                      animate={{
                        width:           isActive ? 8 : 0,
                        height:          isActive ? 8 : 0,
                        backgroundColor: card.accent,
                        opacity:         isActive ? 1 : 0,
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />

                    {/* Bottom accent stripe */}
                    <div
                      className="absolute bottom-0 start-6 end-6 rounded-full"
                      style={{
                        height:          2,
                        backgroundColor: card.accent,
                        opacity:         isActive ? 0.40 : 0,
                        transition:      'opacity 0.28s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* Next arrow */}
        <button
          aria-label={he ? 'הבא' : 'Next'}
          onClick={() => goTo(activeIndex + 1)}
          disabled={activeIndex === CARDS.length - 1}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 w-10 h-10
                     items-center justify-center rounded-full border border-[#C8DFC0]
                     bg-white/92 shadow-md hover:bg-white hover:shadow-lg
                     disabled:opacity-25 disabled:cursor-not-allowed
                     transition-all duration-200"
          style={{ insetInlineEnd: -20 }}
        >
          <ChevronRight className="w-5 h-5 text-[#517B3E]" />
        </button>
      </div>

      {/* ── Dot indicators ── */}
      <div
        className="flex items-center justify-center gap-[7px] mt-1"
        role="tablist"
        aria-label={he ? 'ניווט בין כרטיסים' : 'Card navigation'}
      >
        {CARDS.map((card, i) => (
          <button
            key={card.id}
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={he ? card.titleHe : card.titleEn}
            onClick={() => goTo(i)}
            className="rounded-full transition-all duration-300
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#517B3E]"
            style={{
              height:          8,
              width:           i === activeIndex ? 28 : 8,
              backgroundColor: i === activeIndex
                ? CARDS[i].accent
                : 'rgba(81,123,62,0.26)',
            }}
          />
        ))}
      </div>

      {/* Announce active card for screen readers */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {`${he ? CARDS[activeIndex].titleHe : CARDS[activeIndex].titleEn}, ${activeIndex + 1} of ${CARDS.length}`}
      </p>
    </section>
  );
}
