/* ── Slide viewer for the AI Presentation Agent (/presentation-generator) ──
   Distinct from SlideLayouts.tsx (used by /presentation): the agent returns
   {title, layout, content} slides via build_presentation function-calling
   (backend/services/slides.py::generate_deck_via_agent), where "layout" is
   "title" | "bullets" | "metric" and "content" is string[] | string | number. */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type DeckSlideLayout = 'title' | 'bullets' | 'metric';

export interface DeckSlide {
  title:   string;
  layout:  DeckSlideLayout;
  content: string[] | string | number;
}

function TitleLayout({ slide }: { slide: DeckSlide }) {
  const subtitle = Array.isArray(slide.content) ? slide.content.join(' ') : String(slide.content);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center px-16 gap-6">
      <h1 className="text-5xl font-black leading-tight" style={{ color: '#1C3329' }}>{slide.title}</h1>
      <div className="w-16 h-1 rounded-full" style={{ background: '#517B3E' }} />
      {subtitle && <p className="text-xl font-medium" style={{ color: '#527061' }}>{subtitle}</p>}
    </div>
  );
}

function BulletsLayout({ slide }: { slide: DeckSlide }) {
  const bullets = Array.isArray(slide.content)
    ? slide.content
    : String(slide.content).split('\n').map(b => b.trim()).filter(Boolean);
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-8">
      <h2 className="text-3xl font-bold shrink-0" style={{ color: '#1C3329' }}>{slide.title}</h2>
      <div className="flex-1 flex flex-col justify-center gap-4 min-h-0">
        {bullets.map((bullet, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="mt-2 w-2 h-2 rounded-full shrink-0" style={{ background: '#517B3E' }} />
            <p className="text-lg leading-relaxed" style={{ color: '#2A3B22' }}>{bullet}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricLayout({ slide }: { slide: DeckSlide }) {
  const value = Array.isArray(slide.content) ? slide.content.join(' ') : String(slide.content);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 px-16">
      <p className="text-8xl font-black leading-none" style={{ color: '#517B3E' }}>{value}</p>
      <p className="text-2xl font-bold" style={{ color: '#1C3329' }}>{slide.title}</p>
    </div>
  );
}

function SlideContent({ slide }: { slide: DeckSlide }) {
  switch (slide.layout) {
    case 'bullets': return <BulletsLayout slide={slide} />;
    case 'metric':  return <MetricLayout slide={slide} />;
    case 'title':
    default:        return <TitleLayout slide={slide} />;
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
    <div className="flex flex-col gap-4">
      {/* On-screen viewer — hidden during PDF export in favor of print-slide-deck below */}
      <div className="print:hidden flex flex-col gap-4">
        <div className="w-full mx-auto" style={{ maxWidth: 1280 }}>
          <div
            className="relative w-full rounded-2xl overflow-hidden"
            style={{ aspectRatio: '1280 / 720', background: '#F9FCFA', border: '1px solid rgba(157,192,139,0.35)', boxShadow: '0 12px 40px rgba(60,90,40,0.12)' }}
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
          <div key={i} className="print-slide-page" style={{ background: '#F9FCFA' }}>
            <SlideContent slide={s} />
          </div>
        ))}
      </div>
    </div>
  );
}
