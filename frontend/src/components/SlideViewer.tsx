/* ── Slide viewer for the AI Presentation Agent (/presentation-generator) ──
   Distinct from SlideLayouts.tsx (used by /presentation): the agent returns
   {title, layout, content, ...} slides via build_presentation function-calling
   (backend/services/slides.py::generate_deck_via_agent), where "layout" is
   "title" | "bullets" | "metric" | "split-screen" | "timeline" | "barChart" |
   "tileGrid" | "bleedImage" | "architecture" | "quote_focus" | "formula_heavy" |
   "two_column".
   "content" (string[] | string | number) is used by "title"/"metric"/
   "bullets"/"split-screen"/"bleedImage"/"quote_focus"/"formula_heavy"/
   "two_column"; "timeline", "barChart", "tileGrid", and "architecture" instead
   use timelineData / chartData / tiles / (layers, nodes, connections).
   "quote_focus" may carry "attribution"; "formula_heavy" requires
   "latexFormula" (rendered via KaTeX); "two_column" requires "keyTakeaway"
   ({title, text}), a definition/concept panel rendered beside its bullets.
   Any slide whose layout is one of "bullets"/"split-screen"/"bleedImage"/
   "quote_focus"/"formula_heavy" may also carry an optional "highlightBox"
   callout ({type: 'tip'|'warning'|'definition', title, text}).
   "split-screen"/"bleedImage" slides may additionally carry an optional
   "imagePrompt" (a 15-20 word English AI image-generation prompt, see
   backend/services/slides.py rule 19) — rendered via AIImage, which builds a
   Pollinations.ai image URL directly from the prompt, no API key required.

   Slide rendering (on-screen + print) uses one of 5 light "Matcha Executive
   Light"-family themes (see presentationThemes.ts) via DeckThemeProvider: a
   bright, high-contrast, consulting-style palette — pale off-white slide
   background, near-black text, and a single saturated accent color per theme
   for borders/icons/highlights. Each deck is assigned a theme deterministically
   from its content (pickThemeForDeck); the "shuffle theme" control lets the
   user preview the deck in any of the other themes.

   Bullet rows across "bullets"/"split-screen"/"bleedImage"/"formula_heavy"
   render a context-relevant lucide icon per bullet (bulletIcon()) instead of a
   uniform checkmark, picked via lightweight Hebrew/English keyword matching
   over the bullet text with an icon-cycling fallback. */

'use client';

import { useState, useId, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Poppins, Lato, Assistant } from 'next/font/google';
import katex from 'katex';
import {
  Target, TrendingUp, Users, Globe, Lightbulb, Shield,
  Clock, CheckCircle, Star, BookOpen, Briefcase, Cpu,
  Database, Layers, Zap, BarChart3, Image as ImageIcon, Shuffle,
  Quote, AlertTriangle, Info, Award,
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
  | 'timeline' | 'barChart' | 'tileGrid' | 'bleedImage' | 'architecture'
  | 'quote_focus' | 'formula_heavy' | 'two_column';

export interface DeckTimelineItem { date: string; event: string }
export interface DeckChartItem    { label: string; percentage: number }
export interface DeckTile         { iconName: string; title: string; text: string }
export interface DeckArchNode       { id: string; label: string; layer: number }
export interface DeckArchConnection { from: string; to: string }

/* Optional supplementary callout — see backend/services/slides.py rule 24.
   Allowed on "bullets" | "split-screen" | "bleedImage" | "quote_focus" |
   "formula_heavy" slides only. */
export interface DeckHighlightBox { type: 'tip' | 'warning' | 'definition'; title: string; text: string }

/* Required for "two_column" slides — see backend/services/slides.py rule 25.
   The prominent key-term/concept definition panel rendered beside the bullets. */
export interface DeckKeyTakeaway { title: string; text: string }

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
  /* Optional AI image-generation prompt for "split-screen"/"bleedImage"
     slides (see backend/services/slides.py rule 19) — a 15-20 word English
     prompt rendered via AIImage (Pollinations.ai). Absent ⇒ those slides
     render their existing placeholder visual unchanged. */
  imagePrompt?:  string;
  /* "quote_focus" only: short Hebrew label naming the quote/insight's source. */
  attribution?:  string;
  /* "formula_heavy" only: LaTeX math expression (no $/$$ delimiters), rendered via KaTeX. */
  latexFormula?: string;
  /* Optional callout for "bullets" | "split-screen" | "bleedImage" |
     "quote_focus" | "formula_heavy" — see DeckHighlightBox. */
  highlightBox?: DeckHighlightBox;
  /* "two_column" only (required): the key-term/concept definition panel
     rendered beside the bullets — see DeckKeyTakeaway. */
  keyTakeaway?: DeckKeyTakeaway;
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

/* Maps a bullet's text to a context-relevant lucide icon via Hebrew/English
   keyword matching, falling back to a small rotating set of generic icons by
   index — replaces the previous uniform checkmark so bullet lists read with
   more visual variety. */
const BULLET_ICON_RULES: { pattern: RegExp; icon: typeof Target }[] = [
  { pattern: /יעד|מטרה|target|goal/i,                              icon: Target },
  { pattern: /צמיחה|עליה|עלייה|גידול|מגמה|growth|increase|trend/i,   icon: TrendingUp },
  { pattern: /משתמש|לקוח|אנשים|צוות|user|customer|team|people/i,    icon: Users },
  { pattern: /עולמי|גלובלי|בינלאומי|global|world/i,                 icon: Globe },
  { pattern: /רעיון|חדשנות|פתרון|תובנה|idea|innovation|insight/i,    icon: Lightbulb },
  { pattern: /אבטחה|סיכון|הגנה|איום|security|risk|protect|threat/i, icon: Shield },
  { pattern: /זמן|מהירות|לוח זמנים|מועד|time|speed|schedule|deadline/i, icon: Clock },
  { pattern: /הושלם|אישור|תקין|completed|success|valid|verified/i, icon: CheckCircle },
  { pattern: /איכות|מצוינות|הצטיינות|פרס|quality|excellence|award/i, icon: Award },
  { pattern: /מחקר|לימוד|ספר|תיאוריה|research|study|theory/i,       icon: BookOpen },
  { pattern: /עסק|שוק|תעשיה|תעשייה|business|market|industry/i,       icon: Briefcase },
  { pattern: /טכנולוגיה|מחשוב|אלגוריתם|מודל|technology|algorithm|model/i, icon: Cpu },
  { pattern: /נתונים|מסד נתונים|data|database/i,                    icon: Database },
  { pattern: /שכבה|מבנה|רמה|layer|structure|level/i,                icon: Layers },
  { pattern: /אנרגיה|חשמל|כוח|מהיר|energy|power|fast/i,             icon: Zap },
  { pattern: /סטטיסטיקה|אחוז|נתון מספרי|גרף|statistic|percent|chart|figure/i, icon: BarChart3 },
];

const BULLET_ICON_FALLBACKS: (typeof Target)[] = [Lightbulb, Target, Star, TrendingUp, CheckCircle, Award];

function bulletIcon(text: string, index: number): typeof Target {
  const rule = BULLET_ICON_RULES.find(({ pattern }) => pattern.test(text));
  return rule ? rule.icon : BULLET_ICON_FALLBACKS[index % BULLET_ICON_FALLBACKS.length];
}

function BulletIconBadge({ icon: Icon }: { icon: typeof Target }) {
  const theme = useDeckTheme();
  return (
    <span
      className="mt-1 w-7 h-7 rounded-full flex items-center justify-center shrink-0"
      style={{ background: hexToRgba(theme.accent, 0.15), border: `1px solid ${theme.accent}` }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color: theme.accent }} />
    </span>
  );
}

/* Subtle full-bleed decorative dot-grid background for the lower-density
   "quote_focus"/"formula_heavy" layouts, which otherwise have a lot of empty
   canvas. `useId()` keeps the SVG <pattern> id collision-free when every
   slide renders simultaneously (print view). */
function SlidePattern({ color }: { color: string }) {
  const rawId = useId();
  const patternId = `dot-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <defs>
        <pattern id={patternId} width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill={color} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} opacity={0.08} />
    </svg>
  );
}

const HIGHLIGHT_BOX_ICONS: Record<DeckHighlightBox['type'], typeof Target> = {
  tip: Lightbulb,
  warning: AlertTriangle,
  definition: Info,
};

/* Optional supplementary callout — see DeckHighlightBox and
   HIGHLIGHT_BOX_LAYOUTS in backend/services/slides.py (rule 24). Color
   follows the active deck theme: tip -> accent, warning -> layerColors[1],
   definition -> layerColors[3]. */
function HighlightBox({ box }: { box?: DeckHighlightBox }) {
  const theme = useDeckTheme();
  if (!box) return null;
  const color = box.type === 'warning' ? theme.layerColors[1]
    : box.type === 'definition' ? theme.layerColors[3]
    : theme.accent;
  const Icon = HIGHLIGHT_BOX_ICONS[box.type] ?? Info;
  return (
    <div
      className="rounded-2xl p-4 flex items-start gap-3 shrink-0"
      style={{ background: hexToRgba(color, 0.10), border: `1px solid ${hexToRgba(color, 0.4)}` }}
    >
      <Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color }} />
      <div className="min-w-0">
        <p className="text-sm font-bold mb-1" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{box.title}</p>
        <p className="text-sm leading-relaxed" style={{ color: theme.cream, fontFamily: BODY_FONT }}>{box.text}</p>
      </div>
    </div>
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

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt/';

/* Renders an AI-generated image for slide.imagePrompt full-bleed within its
   parent, fetched on demand from Pollinations.ai (free, no API key) — the
   browser requests the image directly and Pollinations generates it on the
   fly. Shows the themed `fallback` placeholder while the image is generating
   (can take several seconds) and on load failure, so a broken/blank image is
   never shown. `rounded` controls corner rounding: true for split-screen's
   padded visual area, false for bleedImage's edge-to-edge half. */
function AIImage({ prompt, fallback, rounded = true }: { prompt?: string; fallback: React.ReactNode; rounded?: boolean }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  if (!prompt || status === 'error') return <>{fallback}</>;

  const src = `${POLLINATIONS_BASE}${encodeURIComponent(prompt)}?width=800&height=600&nologo=true`;

  return (
    <div className={`relative w-full h-full overflow-hidden ${rounded ? 'rounded-2xl' : ''}`}>
      {status === 'loading' && <div className="absolute inset-0">{fallback}</div>}
      {/* eslint-disable-next-line @next/next/no-img-element -- Pollinations generates the image on demand from the prompt; not a static asset for next/image */}
      <img
        src={src}
        alt={prompt}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
        style={{ opacity: status === 'loaded' ? 1 : 0 }}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
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
            <BulletIconBadge icon={bulletIcon(bullet, i)} />
            <p className={`${textSize} leading-relaxed`} style={{ color: theme.text, fontFamily: BODY_FONT }}>{bullet}</p>
          </div>
        ))}
      </div>
      {slide.highlightBox && <HighlightBox box={slide.highlightBox} />}
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
              <BulletIconBadge icon={bulletIcon(bullet, i)} />
              <p className={`${textSize} leading-relaxed`} style={{ color: theme.text, fontFamily: BODY_FONT }}>{bullet}</p>
            </div>
          ))}
        </div>
        {slide.highlightBox && <HighlightBox box={slide.highlightBox} />}
      </div>
      <div className="w-1/2 p-10">
        <AIImage prompt={slide.imagePrompt} fallback={<VisualPlaceholder />} />
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
              <BulletIconBadge icon={bulletIcon(bullet, i)} />
              <p className={`${textSize} leading-relaxed`} style={{ color: theme.text, fontFamily: BODY_FONT }}>{bullet}</p>
            </div>
          ))}
        </div>
        {slide.highlightBox && <HighlightBox box={slide.highlightBox} />}
      </div>
      <div className="w-1/2 h-full" style={{ background: hexToRgba(theme.accent, 0.08), borderInlineStart: `1px solid ${hexToRgba(theme.accent, 0.25)}` }}>
        <AIImage
          prompt={slide.imagePrompt}
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

/* A single foundational principle/definition/quote drawn from the source
   material — see backend rule 22. "content" is one full-sentence Hebrew
   string; "attribution" optionally names its source. */
function QuoteFocusLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const quote = toText(slide.content);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center px-20 gap-7 relative overflow-hidden">
      <SlidePattern color={theme.accent} />
      <h2 className="relative text-sm font-bold uppercase tracking-widest" style={{ color: theme.cream, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <Quote className="relative w-12 h-12" style={{ color: hexToRgba(theme.accent, 0.5) }} />
      <p className="relative text-3xl md:text-4xl font-bold leading-snug max-w-4xl" style={{ color: theme.text, fontFamily: HEADING_FONT }}>
        {quote}
      </p>
      {slide.attribution && (
        <p className="relative text-lg font-semibold" style={{ color: theme.accentDark, fontFamily: BODY_FONT }}>
          — {slide.attribution}
        </p>
      )}
      {slide.highlightBox && (
        <div className="relative w-full max-w-2xl">
          <HighlightBox box={slide.highlightBox} />
        </div>
      )}
    </div>
  );
}

/* Renders a LaTeX expression (no surrounding $/$$) via KaTeX. Kept LTR —
   math notation reads left-to-right even inside an RTL slide. */
function FormulaBlock({ latex }: { latex: string }) {
  const theme = useDeckTheme();
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, { throwOnError: false, displayMode: true });
    } catch {
      return latex;
    }
  }, [latex]);
  return (
    <div
      className="w-full rounded-2xl py-8 px-6 flex items-center justify-center overflow-x-auto shrink-0"
      style={{ background: hexToRgba(theme.accent, 0.08), border: `1px solid ${hexToRgba(theme.accent, 0.3)}` }}
      dir="ltr"
    >
      <div className="text-3xl md:text-4xl" style={{ color: theme.text }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/* A mathematical/physical/statistical/algorithmic formula with optional
   explanatory bullets — see backend rule 23. */
function FormulaHeavyLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const bullets = toBullets(slide.content);
  const textSize = densityTextClass(bullets, ['text-lg', 'text-base', 'text-sm']);
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-7 relative overflow-hidden">
      <SlidePattern color={theme.accent} />
      <h2 className="relative text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
      <div className="relative">
        <FormulaBlock latex={slide.latexFormula ?? ''} />
      </div>
      {bullets.length > 0 && (
        <div className="relative flex-1 flex flex-col justify-center gap-4 min-h-0 overflow-y-auto">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-3">
              <BulletIconBadge icon={bulletIcon(bullet, i)} />
              <p className={`${textSize} leading-relaxed`} style={{ color: theme.text, fontFamily: BODY_FONT }}>{bullet}</p>
            </div>
          ))}
        </div>
      )}
      {slide.highlightBox && (
        <div className="relative shrink-0">
          <HighlightBox box={slide.highlightBox} />
        </div>
      )}
    </div>
  );
}

/* Bullets paired with a required "keyTakeaway" definition/concept panel —
   see backend rule 25. Distinct from SplitScreenLayout (which pairs bullets
   with a photo/placeholder): here the other side is always a themed panel
   surfacing one key term or principle from the source material. */
function TwoColumnLayout({ slide }: { slide: DeckSlide }) {
  const theme = useDeckTheme();
  const bullets = toBullets(slide.content);
  const textSize = densityTextClass(bullets, ['text-lg', 'text-base', 'text-sm']);
  const takeaway = slide.keyTakeaway;
  return (
    <div className="w-full h-full flex">
      <div className="w-1/2 h-full flex flex-col justify-center px-14 py-14 gap-7 min-w-0 min-h-0">
        <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{slide.title}</h2>
        <div className="flex-1 flex flex-col justify-center gap-4 min-h-0 overflow-y-auto">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-3">
              <BulletIconBadge icon={bulletIcon(bullet, i)} />
              <p className={`${textSize} leading-relaxed`} style={{ color: theme.text, fontFamily: BODY_FONT }}>{bullet}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="w-1/2 h-full p-10 flex items-center justify-center" style={{ background: hexToRgba(theme.accent, 0.08), borderInlineStart: `1px solid ${hexToRgba(theme.accent, 0.25)}` }}>
        <div
          className="relative w-full rounded-2xl p-8 flex flex-col items-center text-center gap-4 overflow-hidden"
          style={{ background: theme.bg, border: `1px solid ${hexToRgba(theme.accent, 0.35)}`, boxShadow: `0 4px 24px ${hexToRgba(theme.text, 0.10)}` }}
        >
          <SlidePattern color={theme.accent} />
          <span
            className="relative w-14 h-14 rounded-full flex items-center justify-center shrink-0"
            style={{ background: hexToRgba(theme.accent, 0.15), border: `1px solid ${theme.accent}` }}
          >
            <BookOpen className="w-7 h-7" style={{ color: theme.accent }} />
          </span>
          {takeaway && (
            <>
              <p className="relative text-xl font-extrabold leading-snug" style={{ color: theme.accentDark, fontFamily: HEADING_FONT }}>{takeaway.title}</p>
              <p className="relative text-base leading-relaxed" style={{ color: theme.text, fontFamily: BODY_FONT }}>{takeaway.text}</p>
            </>
          )}
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
    case 'quote_focus':  return <QuoteFocusLayout slide={slide} />;
    case 'formula_heavy': return <FormulaHeavyLayout slide={slide} />;
    case 'two_column':   return <TwoColumnLayout slide={slide} />;
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

        <p className="text-center text-sm font-medium" dir="ltr" style={{ color: theme.text }}>
          {current + 1} {he ? 'מתוך' : 'of'} {slides.length}
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
