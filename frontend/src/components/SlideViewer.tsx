/* ── Slide viewer for the AI Presentation Agent (/presentation-generator) ──
   Distinct from SlideLayouts.tsx (used by /presentation): the agent returns
   {title, layout, content, ...} slides via build_presentation function-calling
   (backend/services/slides.py::generate_deck_via_agent), where "layout" is
   "title" | "bullets" | "metric" | "split-screen" | "timeline" | "barChart" |
   "tileGrid" | "bleedImage" | "architecture". "content" (string[] | string |
   number) is used by "title"/"metric"/"bullets"/"split-screen"/"bleedImage";
   "timeline", "barChart", "tileGrid", and "architecture" instead use
   timelineData / chartData / tiles / (layers, nodes, connections).

   Slide rendering (on-screen + print) uses the "Matcha Executive" deck theme:
   a dark, high-contrast, consulting-style palette distinct from the app's
   light Creamy Matcha UI — only the slide rectangle itself is dark. */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Urbanist, Assistant } from 'next/font/google';
import {
  Target, TrendingUp, Users, Globe, Lightbulb, Shield,
  Clock, CheckCircle, Star, BookOpen, Briefcase, Cpu,
  Database, Layers, Zap, BarChart3, Image as ImageIcon,
} from 'lucide-react';

const urbanist = Urbanist({ subsets: ['latin'], weight: ['700', '800', '900'], variable: '--font-urbanist' });
const assistant = Assistant({ subsets: ['hebrew', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-assistant' });

export type DeckSlideLayout =
  | 'title' | 'bullets' | 'metric' | 'split-screen'
  | 'timeline' | 'barChart' | 'tileGrid' | 'bleedImage' | 'architecture';

export interface DeckTimelineItem { date: string; event: string }
export interface DeckChartItem    { label: string; percentage: number }
export interface DeckTile         { iconName: string; title: string; text: string }
export interface DeckArchNode       { id: string; label: string; layer: number }
export interface DeckArchConnection { from: string; to: string }

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

/* "Matcha Executive" deck theme */
const EXEC = {
  bg:     '#0c120e', // deep dark green / almost black slide background
  accent: '#8BAF84', // matcha green — borders, icons, highlighted numbers
  text:   '#f5f5f5', // high-contrast white body/heading text
  cream:  '#daffde', // soft cream — secondary text / subtitles
};

const HEADING_FONT = 'var(--font-urbanist), var(--font-assistant), sans-serif';
const BODY_FONT    = 'var(--font-assistant), sans-serif';

/* "architecture" layout — per-layer accent colors (cycled if >4 layers) */
const LAYER_COLORS = [
  '#c68a64', // Presentation / UI — muted terracotta
  '#5b7b8e', // API / Bridge — steel blue
  '#8a8f98', // Business Logic — slate grey (lightened from #444c56 for contrast on dark bg)
  '#5e9c72', // Data — forest green (lightened from #2e3b30 for contrast on dark bg)
];

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

function CheckIcon() {
  return (
    <span
      className="mt-1 w-5 h-5 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'rgba(139,175,132,0.15)', border: `1px solid ${EXEC.accent}` }}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke={EXEC.accent} strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    </span>
  );
}

function VisualPlaceholder() {
  return (
    <div
      className="w-full h-full rounded-2xl flex items-center justify-center"
      style={{ border: `1px solid rgba(139,175,132,0.35)`, background: 'rgba(139,175,132,0.06)' }}
    >
      <svg className="w-20 h-20" fill="none" viewBox="0 0 24 24" stroke={EXEC.accent} strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5 8.25 8.25l4.5 4.5L21 4.5M21 4.5h-5.25M21 4.5v5.25" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 19.5h18" />
      </svg>
    </div>
  );
}

function TitleLayout({ slide }: { slide: DeckSlide }) {
  const subtitle = toText(slide.content);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center px-16 gap-6">
      <h1 className="text-5xl font-black leading-tight" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{slide.title}</h1>
      <div className="w-16 h-1 rounded-full" style={{ background: EXEC.accent }} />
      {subtitle && <p className="text-xl font-medium" style={{ color: EXEC.cream, fontFamily: BODY_FONT }}>{subtitle}</p>}
    </div>
  );
}

function BulletsLayout({ slide }: { slide: DeckSlide }) {
  const bullets = toBullets(slide.content);
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-8">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="flex-1 flex flex-col justify-center gap-4 min-h-0">
        {bullets.map((bullet, i) => (
          <div key={i} className="flex items-start gap-3">
            <CheckIcon />
            <p className="text-lg leading-relaxed" style={{ color: EXEC.text, fontFamily: BODY_FONT }}>{bullet}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricLayout({ slide }: { slide: DeckSlide }) {
  const value = toText(slide.content);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-5 px-20">
      <p className="text-8xl font-black leading-none" style={{ color: EXEC.accent, fontFamily: HEADING_FONT }}>{value}</p>
      <p className="text-xl md:text-2xl font-bold leading-snug max-w-3xl" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{slide.title}</p>
    </div>
  );
}

function SplitScreenLayout({ slide }: { slide: DeckSlide }) {
  const bullets = toBullets(slide.content);
  return (
    <div className="w-full h-full flex">
      <div className="w-1/2 flex flex-col justify-center px-14 py-14 gap-7 min-w-0">
        <h2 className="text-2xl md:text-3xl font-extrabold leading-snug" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
        <div className="flex flex-col gap-4">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-3">
              <CheckIcon />
              <p className="text-base leading-relaxed" style={{ color: EXEC.text, fontFamily: BODY_FONT }}>{bullet}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="w-1/2 p-10">
        <VisualPlaceholder />
      </div>
    </div>
  );
}

function TimelineLayout({ slide }: { slide: DeckSlide }) {
  const items = slide.timelineData ?? [];
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-10">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="flex-1 flex items-start min-h-0 pt-2">
        <div className="relative w-full">
          <div className="absolute top-[10px] inset-x-0 h-[2px]" style={{ background: 'rgba(139,175,132,0.3)' }} />
          <div className="relative flex items-start justify-between gap-2">
            {items.map((item, i) => (
              <div key={i} className="flex-1 flex flex-col items-center text-center px-2">
                <div className="w-5 h-5 rounded-full mb-5 shrink-0" style={{ background: EXEC.accent, boxShadow: '0 0 0 4px rgba(139,175,132,0.15)' }} />
                <p className="text-sm font-bold mb-1.5" style={{ color: EXEC.accent, fontFamily: HEADING_FONT }}>{item.date}</p>
                <p className="text-sm leading-snug" style={{ color: EXEC.text, fontFamily: BODY_FONT }}>{item.event}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BarChartLayout({ slide }: { slide: DeckSlide }) {
  const items = slide.chartData ?? [];
  const max = Math.max(...items.map(i => i.percentage), 1);
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-8">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="flex-1 flex flex-col justify-center gap-5 min-h-0">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-4">
            <p className="w-32 shrink-0 text-sm font-semibold truncate" style={{ color: EXEC.text, fontFamily: BODY_FONT }}>{item.label}</p>
            <div className="flex-1 h-6 rounded-full overflow-hidden" style={{ background: 'rgba(139,175,132,0.12)' }}>
              <div className="h-full rounded-full" style={{ width: `${(item.percentage / max) * 100}%`, background: EXEC.accent }} />
            </div>
            <p className="w-14 shrink-0 text-end text-sm font-bold" style={{ color: EXEC.accent, fontFamily: HEADING_FONT }}>{item.percentage}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TileGridLayout({ slide }: { slide: DeckSlide }) {
  const tiles = slide.tiles ?? [];
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-8">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="flex-1 grid grid-cols-3 gap-5 min-h-0">
        {tiles.map((tile, i) => {
          const Icon = TILE_ICONS[tile.iconName] ?? Lightbulb;
          return (
            <div key={i} className="rounded-2xl p-5 flex flex-col gap-3" style={{ border: '1px solid rgba(139,175,132,0.25)', background: 'rgba(139,175,132,0.05)' }}>
              <Icon className="w-7 h-7" style={{ color: EXEC.accent }} />
              <p className="text-base font-bold leading-snug" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{tile.title}</p>
              {tile.text && <p className="text-sm leading-relaxed" style={{ color: EXEC.cream, fontFamily: BODY_FONT }}>{tile.text}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BleedImageLayout({ slide }: { slide: DeckSlide }) {
  const bullets = toBullets(slide.content);
  return (
    <div className="w-full h-full flex">
      <div className="w-1/2 flex flex-col justify-center px-14 py-14 gap-6 min-w-0">
        <h2 className="text-2xl md:text-3xl font-extrabold leading-snug" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
        <div className="flex flex-col gap-4">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-3">
              <CheckIcon />
              <p className="text-base leading-relaxed" style={{ color: EXEC.text, fontFamily: BODY_FONT }}>{bullet}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="w-1/2 h-full flex items-center justify-center" style={{ background: 'rgba(139,175,132,0.08)', borderInlineStart: '1px solid rgba(139,175,132,0.25)' }}>
        <ImageIcon className="w-16 h-16" style={{ color: EXEC.accent, opacity: 0.5 }} />
      </div>
    </div>
  );
}

function ArchitectureLayout({ slide }: { slide: DeckSlide }) {
  const layers      = slide.layers ?? [];
  const nodes       = slide.nodes ?? [];
  const connections = slide.connections ?? [];
  if (layers.length === 0 || nodes.length === 0) return <TitleLayout slide={slide} />;

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
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="flex-1 flex min-h-0 gap-5">
        {/* layer name labels */}
        <div className="flex flex-col shrink-0 w-28">
          {layers.map((name, i) => (
            <div key={i} className="flex-1 flex items-center justify-center text-center px-1">
              <p className="text-xs font-bold leading-tight" style={{ color: LAYER_COLORS[i % LAYER_COLORS.length], fontFamily: HEADING_FONT }}>{name}</p>
            </div>
          ))}
        </div>

        {/* diagram area */}
        <div className="relative flex-1">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {connections.map((c, i) => {
              const from = positions.get(c.from);
              const to   = positions.get(c.to);
              if (!from || !to) return null;
              return (
                <g key={i}>
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke="rgba(139,175,132,0.45)" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
                  />
                  <circle cx={from.x} cy={from.y} r={1.1} fill={EXEC.accent} vectorEffect="non-scaling-stroke" />
                  <circle cx={to.x} cy={to.y} r={1.1} fill={EXEC.accent} vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>
          <div className="relative w-full h-full flex flex-col">
            {rows.map((rowNodes, layerIdx) => (
              <div key={layerIdx} className="flex-1 flex items-center justify-evenly px-2">
                {rowNodes.map(node => {
                  const color = LAYER_COLORS[layerIdx % LAYER_COLORS.length];
                  return (
                    <div
                      key={node.id}
                      className="px-5 py-3 text-center"
                      style={{
                        borderRadius: 8,
                        background: `${color}26`,
                        border: `1px solid ${color}`,
                        boxShadow: `0 0 18px ${color}40`,
                      }}
                    >
                      <p className="text-sm font-bold whitespace-nowrap" style={{ color: EXEC.text, fontFamily: BODY_FONT }}>{node.label}</p>
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

function SlideContent({ slide }: { slide: DeckSlide }) {
  switch (slide.layout) {
    case 'bullets':      return <BulletsLayout slide={slide} />;
    case 'metric':       return <MetricLayout slide={slide} />;
    case 'split-screen': return <SplitScreenLayout slide={slide} />;
    case 'timeline':     return <TimelineLayout slide={slide} />;
    case 'barChart':     return <BarChartLayout slide={slide} />;
    case 'tileGrid':     return <TileGridLayout slide={slide} />;
    case 'bleedImage':   return <BleedImageLayout slide={slide} />;
    case 'architecture': return <ArchitectureLayout slide={slide} />;
    case 'title':
    default:             return <TitleLayout slide={slide} />;
  }
}

interface SlideViewerProps {
  slides: DeckSlide[];
  lang:   'he' | 'en';
}

export default function SlideViewer({ slides, lang }: SlideViewerProps) {
  const [current, setCurrent] = useState(0);
  const he = lang === 'he';
  const slide = slides[current];
  if (!slide) return null;

  const goPrev = () => setCurrent(c => Math.max(0, c - 1));
  const goNext = () => setCurrent(c => Math.min(slides.length - 1, c + 1));
  const downloadPdf = () => window.print();

  return (
    <div className={`flex flex-col gap-4 ${urbanist.variable} ${assistant.variable}`}>
      {/* On-screen viewer — hidden during PDF export in favor of print-slide-deck below */}
      <div className="print:hidden flex flex-col gap-4">
        <div className="w-full mx-auto" style={{ maxWidth: 1280 }}>
          <div
            className="relative w-full rounded-2xl overflow-hidden"
            style={{ aspectRatio: '1280 / 720', background: EXEC.bg, border: '1px solid rgba(139,175,132,0.25)', boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }}
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
                <SlideContent slide={slide} />
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
            style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(157,192,139,0.4)', color: '#1C3329' }}
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
                  background: i === current ? '#517B3E' : 'rgba(81,123,62,0.25)',
                }}
              />
            ))}
          </div>

          <button
            onClick={goNext}
            disabled={current === slides.length - 1}
            className="px-5 py-2.5 rounded-full text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/80"
            style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(157,192,139,0.4)', color: '#1C3329' }}
          >
            {he ? 'הבא' : 'Next'}
          </button>
        </div>

        <p className="text-center text-sm font-medium" style={{ color: '#2A3B22' }}>
          {current + 1} / {slides.length}
        </p>

        {/* Export */}
        <button
          onClick={downloadPdf}
          className="self-center flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: '#517B3E' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {he ? 'הורד כ-PDF' : 'Download as PDF'}
        </button>
      </div>

      {/* Print-only full deck — one slide per fixed 16:9 page (see globals.css @media print) */}
      <div className="hidden print:block print-slide-deck">
        {slides.map((s, i) => (
          <div key={i} className="print-slide-page" style={{ background: EXEC.bg }}>
            <SlideContent slide={s} />
          </div>
        ))}
      </div>
    </div>
  );
}
