/* ── Slide viewer for the AI Presentation Agent (/presentation-generator) ──
   Distinct from SlideLayouts.tsx (used by /presentation): the agent returns
   {title, layout, content, ...} slides via build_presentation function-calling
   (backend/services/slides.py::generate_deck_via_agent), where "layout" is
   "title" | "bullets" | "metric" | "split-screen" | "timeline" | "barChart" |
   "tileGrid" | "bleedImage" | "architecture". "content" (string[] | string |
   number) is used by "title"/"metric"/"bullets"/"split-screen"/"bleedImage";
   "timeline", "barChart", "tileGrid", and "architecture" instead use
   timelineData / chartData / tiles / (layers, nodes, connections).

   Slide rendering (on-screen + print) uses one of 5 light "Matcha Executive
   Light"-family themes (see presentationThemes.ts) via DeckThemeProvider: a
   bright, high-contrast, consulting-style palette — pale off-white slide
   background, near-black text, and a single saturated accent color per theme
   for borders/icons/highlights. Each deck is assigned a theme deterministically
   from its content (pickThemeForDeck); the "shuffle theme" control lets the
   user preview the deck in any of the other themes. */

'use client';

import { useState } from 'react';
import NextImage from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Poppins, Lato, Assistant } from 'next/font/google';
import {
  Target, TrendingUp, Users, Globe, Lightbulb, Shield,
  Clock, CheckCircle, Star, BookOpen, Briefcase, Cpu,
  Database, Layers, Zap, BarChart3, Image as ImageIcon, Shuffle,
} from 'lucide-react';
import ChartSlide from './ChartSlide';
import { exportToPPTX } from './pptxExport';
import {
  PRESENTATION_THEMES, hexToRgba, pickThemeForDeck,
  DeckThemeProvider, useDeckTheme,
} from './presentationThemes';

const poppins = Poppins({ subsets: ['latin'], weight: ['700', '800', '900'], variable: '--font-poppins' });
const lato = Lato({ subsets: ['latin'], weight: ['400', '700', '900'], variable: '--font-lato' });
const assistant = Assistant({ subsets: ['hebrew', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-assistant' });

export type DeckSlideLayout =
  | 'title' | 'bullets' | 'metric' | 'split-screen'
  | 'timeline' | 'barChart' | 'tileGrid' | 'bleedImage' | 'architecture';

export interface DeckTimelineItem { date: string; event: string }
export interface DeckChartItem    { label: string; percentage: number }
export interface DeckTile         { iconName: string; title: string; text: string }
export interface DeckArchNode       { id: string; label: string; layer: number }
export interface DeckArchConnection { from: string; to: string }
export interface DeckImageCredit  { name: string; link: string }
export interface DeckImage        { url: string; alt: string; credit: DeckImageCredit }

export interface DeckSlide {
  title:         string;
  layout:        DeckSlideLayout;
  content?:      string[] | string | number;
  timelineData?: DeckTimelineItem[];
  chartData?:    DeckChartItem[];
  tiles?:        DeckTile[];
  layers?:       string[];
  nodes?:        DeckArchNode[];
  connections?:  DeckArchConnection[];
  /* Optional stock photo for "split-screen"/"bleedImage" slides (see
     backend/services/images.py). Absent when no image provider is configured
     or no photo was found — those slides render their existing placeholder
     visual unchanged. */
  image?:        DeckImage;
}

/* iconName -> lucide-react component, must match TILE_ICON_NAMES in
   backend/services/slides.py */
const TILE_ICONS: Record<string, typeof Target> = {
  'target': Target,
  'trending-up': TrendingUp,
  'users': Users,
  'globe': Globe,
  'lightbulb': Lightbulb,
  'shield': Shield,
  'clock': Clock,
  'check-circle': CheckCircle,
  'star': Star,
  'book-open': BookOpen,
  'briefcase': Briefcase,
  'cpu': Cpu,
  'database': Database,
  'layers': Layers,
  'zap': Zap,
  'bar-chart': BarChart3,
};

const HEADING_FONT = 'var(--font-poppins), var(--font-assistant), sans-serif';
const BODY_FONT    = 'var(--font-lato), var(--font-assistant), sans-serif';

function toBullets(content: DeckSlide['content']): string[] {
  if (content == null) return [];
  return Array.isArray(content)
    ? content.map(String)
    : String(content).split('\n').map(b => b.trim()).filter(Boolean);
}

function toText(content: DeckSlide['content']): string {
  if (content == null) return '';
  return Array.isArray(content) ? content.join(' ') : String(content);
}

/**
 * Scales a Tailwind text-size class down as bullet/tile content gets denser
 * (more items and/or longer full-sentence text), so a high-density deck still
 * fits the fixed 1280x720 slide. `sizes` is [normal, dense, very dense].
 */
function densityTextClass(items: string[], sizes: readonly [string, string, string]): string {
  const totalChars = items.reduce((sum, item) => sum + item.length, 0);
  if (items.length <= 3 && totalChars <= 220) return sizes[0];
  if (items.length <= 5 && totalChars <= 420) return sizes[1];
  return sizes[2];
}

function CheckIcon() {
  const theme = useDeckTheme();
  return (
    <span
      className="mt-1 w-5 h-5 rounded-full flex items-center justify-center shrink-0"
      style={{ background: hexToRgba(theme.accent, 0.15), border: `1px solid ${theme.accent}` }}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke={theme.accent} strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    </span>
  );
}

function VisualPlaceholder() {
  const theme = useDeckTheme();
  return (
    <div
      className="w-full h-full rounded-2xl flex items-center justify-center"
      style={{ border: `1px solid ${hexToRgba(theme.accent, 0.4)}`, background: hexToRgba(theme.accent, 0.08) }}
    >
      <svg className="w-20 h-20" fill="none" viewBox="0 0 24 24" stroke={theme.accent} strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5 8.25 8.25l4.5 4.5L21 4.5M21 4.5h-5.25M21 4.5v5.25" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 19.5h18" />
      </svg>
    </div>
  );
}

/* Renders slide.image (an Unsplash photo) full-bleed within its parent, with a
   bottom gradient scrim + Unsplash attribution (required by Unsplash API
   guidelines) — the scrim guarantees the credit line stays legible regardless
   of how busy/dark the photo is. Falls back to `fallback` (the existing
   themed placeholder) when no image is set, or if the image fails to load —
   so a broken image is never shown. `rounded` controls corner rounding:
   true for split-screen's padded visual area, false for bleedImage's
   edge-to-edge half. */
function SlideImage({ image, fallback, rounded = true }: { image?: DeckImage; fallback: React.ReactNode; rounded?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) return <>{fallback}</>;

  return (
    <div className={`relative w-full h-full overflow-hidden ${rounded ? 'rounded-2xl' : ''}`}>
      <NextImage
        src={image.url}
        alt={image.alt}
        fill
        sizes="640px"
        className="object-cover"
        onError={() => setFailed(true)}
      />
      <div
        className="absolute inset-x-0 bottom-0 px-3 py-1.5 flex justify-end"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}
        dir="ltr"
      >
        <a
          href={`${image.credit.link}?utm_source=u-note&utm_medium=referral`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium text-white/90 hover:text-white hover:underline"
        >
          Photo: {image.credit.name} / Unsplash
        </a>
      </div>
    </div>
  );
}

/* "cover" — first slide of the deck: full-bleed poster treatment with top/bottom
   accent bars. "divider" — any later "title" slide acting as a section break:
   smaller, left-aligned (right-aligned in RTL), with an accent tick mark. */
function TitleLayout({ slide, variant }: { slide: DeckSlide; variant: 'cover' | 'divider' }) {
  const theme = useDeckTheme();
  const subtitle = toText(slide.content);

  if (variant === 'divider') {
    return (
      <div className="w-full h-full flex flex-col items-start justify-center px-20 gap-5">
        <div className="w-14 h-1.5 rounded-full" style={{ background: theme.accent }} />
        <h1 className="text-4xl md:text-5xl font-black leading-tight max-w-3xl" style={{ color: theme.text, fontFamily: HEADING_FONT }}>
          {slide.title}
        </h1>
        {subtitle && (
          <p className="text-lg font-medium max-w-2xl" style={{ color: theme.cream, fontFamily: BODY_FONT }}>
            {subtitle}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center px-16 gap-6 relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-2" style={{ background: theme.accent }} />
      <div className="absolute bottom-0 inset-x-0 h-2" style={{ background: theme.accent }} />
      <h1 className="text-6xl font-black leading-tight" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</h1>
      <div className="w-20 h-1.5 rounded-full" style={{ background: theme.accent }} />
      {subtitle && <p className="text-xl font-medium max-w-2xl" style={{ color: theme.cream, fontFamily: BODY_FONT }}>{subtitle}</p>}
    </div>
  );
}

function BulletsLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const bullets = toBullets(slide.content);
  const textSize = densityTextClass(bullets, ['text-lg', 'text-base', 'text-sm']);
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-8">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="flex-1 flex flex-col justify-center gap-4 min-h-0 overflow-y-auto">
        {bullets.map((bullet, i) => (
          <div key={i} className="flex items-start gap-3">
            <CheckIcon />
            <p className={`${textSize} leading-relaxed`} style={{ color: theme.text, fontFamily: BODY_FONT }}>{bullet}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const value = toText(slide.content);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-5 px-20">
      <p className="text-8xl font-black leading-none" style={{ color: theme.accentDark, fontFamily: HEADING_FONT }}>{value}</p>
      <p className="text-xl md:text-2xl font-bold leading-snug max-w-3xl" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</p>
    </div>
  );
}

function SplitScreenLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const bullets = toBullets(slide.content);
  const textSize = densityTextClass(bullets, ['text-base', 'text-sm', 'text-xs']);
  return (
    <div className="w-full h-full flex">
      <div className="w-1/2 h-full flex flex-col justify-center px-14 py-14 gap-7 min-w-0 min-h-0">
        <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
        <div className="flex-1 flex flex-col justify-center gap-4 min-h-0 overflow-y-auto">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-3">
              <CheckIcon />
              <p className={`${textSize} leading-relaxed`} style={{ color: theme.text, fontFamily: BODY_FONT }}>{bullet}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="w-1/2 p-10">
        <SlideImage image={slide.image} fallback={<VisualPlaceholder />} />
      </div>
    </div>
  );
}

function TimelineLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const items = slide.timelineData ?? [];
  const textSize = densityTextClass(items.map(item => item.event), ['text-sm', 'text-xs', 'text-xs']);
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-10">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="flex-1 flex items-start min-h-0 pt-2">
        <div className="relative w-full h-full">
          <div className="absolute top-[10px] inset-x-0 h-[2px]" style={{ background: hexToRgba(theme.accent, 0.3) }} />
          <div className="relative flex items-start justify-between gap-2 h-full">
            {items.map((item, i) => (
              <div key={i} className="flex-1 flex flex-col items-center text-center px-2 h-full min-h-0 overflow-y-auto">
                <div className="w-5 h-5 rounded-full mb-5 shrink-0" style={{ background: theme.accent, boxShadow: `0 0 0 4px ${hexToRgba(theme.accent, 0.15)}` }} />
                <p className="text-sm font-bold mb-1.5 shrink-0" style={{ color: theme.accentDark, fontFamily: HEADING_FONT }}>{item.date}</p>
                <p className={`${textSize} leading-snug`} style={{ color: theme.text, fontFamily: BODY_FONT }}>{item.event}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TileGridLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const tiles = slide.tiles ?? [];
  const textSize = densityTextClass(tiles.map(tile => tile.text ?? ''), ['text-sm', 'text-xs', 'text-xs']);
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-8">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="flex-1 grid grid-cols-3 gap-5 min-h-0">
        {tiles.map((tile, i) => {
          const Icon = TILE_ICONS[tile.iconName] ?? Lightbulb;
          return (
            <div key={i} className="rounded-2xl p-5 flex flex-col gap-3 min-h-0 overflow-y-auto" style={{ border: `1px solid ${hexToRgba(theme.accent, 0.35)}`, background: hexToRgba(theme.accent, 0.10) }}>
              <Icon className="w-7 h-7 shrink-0" style={{ color: theme.accent }} />
              <p className="text-base font-bold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{tile.title}</p>
              {tile.text && <p className={`${textSize} leading-relaxed`} style={{ color: theme.cream, fontFamily: BODY_FONT }}>{tile.text}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BleedImageLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const bullets = toBullets(slide.content);
  const textSize = densityTextClass(bullets, ['text-base', 'text-sm', 'text-xs']);
  return (
    <div className="w-full h-full flex">
      <div className="w-1/2 h-full flex flex-col justify-center px-14 py-14 gap-6 min-w-0 min-h-0">
        <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
        <div className="flex-1 flex flex-col justify-center gap-4 min-h-0 overflow-y-auto">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-3">
              <CheckIcon />
              <p className={`${textSize} leading-relaxed`} style={{ color: theme.text, fontFamily: BODY_FONT }}>{bullet}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="w-1/2 h-full" style={{ background: hexToRgba(theme.accent, 0.08), borderInlineStart: `1px solid ${hexToRgba(theme.accent, 0.25)}` }}>
        <SlideImage
          image={slide.image}
          rounded={false}
          fallback={
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-16 h-16" style={{ color: theme.accent, opacity: 0.6 }} />
            </div>
          }
        />
      </div>
    </div>
  );
}

function ArchitectureLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const layers      = slide.layers ?? [];
  const nodes       = slide.nodes ?? [];
  const connections = slide.connections ?? [];
  if (layers.length === 0 || nodes.length === 0) return <TitleLayout slide={slide} variant="divider" />;

  const rows = layers.map((_, layerIdx) => nodes.filter(n => n.layer === layerIdx));
  const rowHeight = 100 / layers.length;

  // node id -> {x, y} as percentages of the diagram area, used to draw connectors
  const positions = new Map<string, { x: number; y: number }>();
  rows.forEach((rowNodes, layerIdx) => {
    const y = (layerIdx + 0.5) * rowHeight;
    rowNodes.forEach((node, i) => {
      positions.set(node.id, { x: ((i + 0.5) / rowNodes.length) * 100, y });
    });
  });

  return (
    <div className="w-full h-full flex flex-col px-16 py-12 gap-6">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="flex-1 flex min-h-0 gap-5">
        {/* layer name labels */}
        <div className="flex flex-col shrink-0 w-28">
          {layers.map((name, i) => (
            <div key={i} className="flex-1 flex items-center justify-center text-center px-1">
              <p className="text-xs font-bold leading-tight" style={{ color: theme.layerColors[i % theme.layerColors.length], fontFamily: HEADING_FONT }}>{name}</p>
            </div>
          ))}
        </div>

        {/* diagram area kept LTR — connector-line math assumes left-to-right x positions */}
        <div className="relative flex-1" dir="ltr">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {connections.map((c, i) => {
              const from = positions.get(c.from);
              const to   = positions.get(c.to);
              if (!from || !to) return null;
              return (
                <g key={i}>
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={hexToRgba(theme.accent, 0.45)} strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                  />
                  <circle cx={from.x} cy={from.y} r={1.1} fill={theme.accent} vectorEffect="non-scaling-stroke" />
                  <circle cx={to.x} cy={to.y} r={1.1} fill={theme.accent} vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>
          <div className="relative w-full h-full flex flex-col">
            {rows.map((rowNodes, layerIdx) => (
              <div key={layerIdx} className="flex-1 flex items-center justify-evenly px-2">
                {rowNodes.map(node => {
                  const color = theme.layerColors[layerIdx % theme.layerColors.length];
                  return (
                    <div
                      key={node.id}
                      className="px-5 py-3 text-center"
                      style={{
                        borderRadius: 8,
                        background: `${color}26`,
                        border: `1px solid ${color}`,
                        boxShadow: `0 2px 10px ${hexToRgba(theme.text, 0.08)}`,
                      }}
                    >
                      <p className="text-sm font-bold whitespace-nowrap" style={{ color: theme.text, fontFamily: BODY_FONT }}>{node.label}</p>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideContent({ slide, index }: { slide: DeckSlide; index: number }) {
  switch (slide.layout) {
    case 'bullets':      return <BulletsLayout slide={slide} />;
    case 'metric':       return <MetricLayout slide={slide} />;
    case 'split-screen': return <SplitScreenLayout slide={slide} />;
    case 'timeline':     return <TimelineLayout slide={slide} />;
    case 'barChart':     return <ChartSlide title={slide.title} data={slide.chartData ?? []} />;
    case 'tileGrid':     return <TileGridLayout slide={slide} />;
    case 'bleedImage':   return <BleedImageLayout slide={slide} />;
    case 'architecture': return <ArchitectureLayout slide={slide} />;
    case 'title':
    default:             return <TitleLayout slide={slide} variant={index === 0 ? 'cover' : 'divider'} />;
  }
}

interface SlideViewerProps {
  slides: DeckSlide[];
  lang:   'he' | 'en';
}

function SlideViewerInner({ slides, lang, theme, onShuffleTheme }: SlideViewerProps & {
  theme: ReturnType<typeof useDeckTheme>;
  onShuffleTheme: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [exportingPptx, setExportingPptx] = useState(false);
  const he = lang === 'he';
  const slide = slides[current];
  if (!slide) return null;

  const goPrev = () => setCurrent(c => Math.max(0, c - 1));
  const goNext = () => setCurrent(c => Math.min(slides.length - 1, c + 1));
  const downloadPdf = () => window.print();
  const downloadPptx = async () => {
    if (exportingPptx) return;
    setExportingPptx(true);
    try {
      await exportToPPTX(slides, lang);
    } catch (err) {
      console.error('[SlideViewer] PPTX export failed:', err);
    } finally {
      setExportingPptx(false);
    }
  };

  return (
    <div className={`flex flex-col gap-4 ${poppins.variable} ${lato.variable} ${assistant.variable}`}>
      {/* On-screen viewer — hidden during PDF export in favor of print-slide-deck below */}
      <div className="print:hidden flex flex-col gap-4">
        <div className="w-full mx-auto" style={{ maxWidth: 1280 }}>
          <div
            dir="rtl"
            lang="he"
            className="relative w-full rounded-2xl overflow-hidden"
            style={{ aspectRatio: '1280 / 720', background: theme.bg, border: `1px solid ${hexToRgba(theme.accent, 0.25)}`, boxShadow: `0 12px 40px ${hexToRgba(theme.text, 0.18)}` }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="absolute inset-0"
              >
                <SlideContent slide={slide} index={current} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={goPrev}
            disabled={current === 0}
            className="px-5 py-2.5 rounded-full text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/80"
            style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${hexToRgba(theme.accent, 0.4)}`, color: theme.text }}
          >
            {he ? 'הקודם' : 'Previous'}
          </button>

          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                aria-label={`${he ? 'שקופית' : 'Slide'} ${i + 1}`}
                className="rounded-full transition-all"
                style={{
                  width:  i === current ? 20 : 8,
                  height: 8,
                  background: i === current ? theme.accentDark : hexToRgba(theme.accentDark, 0.25),
                }}
              />
            ))}
          </div>

          <button
            onClick={goNext}
            disabled={current === slides.length - 1}
            className="px-5 py-2.5 rounded-full text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/80"
            style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${hexToRgba(theme.accent, 0.4)}`, color: theme.text }}
          >
            {he ? 'הבא' : 'Next'}
          </button>
        </div>

        <p className="text-center text-sm font-medium" style={{ color: theme.text }}>
          {current + 1} / {slides.length}
        </p>

        {/* Export + theme */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={downloadPdf}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: theme.accentDark }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {he ? 'הורד כ-PDF' : 'Download as PDF'}
          </button>

          <button
            onClick={downloadPptx}
            disabled={exportingPptx}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${hexToRgba(theme.accent, 0.4)}`, color: theme.text }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {exportingPptx
              ? (he ? 'מייצא...' : 'Exporting...')
              : (he ? 'הורד כ-PPTX' : 'Download as PPTX')}
          </button>

          <button
            onClick={onShuffleTheme}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: 'rgba(255,255,255,0.6)', border: `1px solid ${hexToRgba(theme.accent, 0.4)}`, color: theme.text }}
            title={theme.label[he ? 'he' : 'en']}
          >
            <Shuffle className="w-4 h-4" />
            {he ? 'החלף עיצוב' : 'Shuffle theme'}
          </button>
        </div>
      </div>

      {/* Print-only full deck — one slide per fixed 16:9 page (see globals.css @media print) */}
      <div className="hidden print:block print-slide-deck">
        {slides.map((s, i) => (
          <div key={i} dir="rtl" lang="he" className="print-slide-page" style={{ background: theme.bg }}>
            <SlideContent slide={s} index={i} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SlideViewer({ slides, lang }: SlideViewerProps) {
  const [theme, setTheme] = useState(() => pickThemeForDeck(slides));

  const shuffleTheme = () => {
    setTheme(t => {
      const idx = PRESENTATION_THEMES.findIndex(x => x.id === t.id);
      return PRESENTATION_THEMES[(idx + 1) % PRESENTATION_THEMES.length];
    });
  };

  if (!slides[0]) return null;

  return (
    <DeckThemeProvider value={theme}>
      <SlideViewerInner slides={slides} lang={lang} theme={theme} onShuffleTheme={shuffleTheme} />
    </DeckThemeProvider>
  );
}
