/* ── Shared slide types & layouts (Light Matcha — cream background, dark green accents) ──
   Used by both /presentation (RAG-based deck generator) and /presentation-generator
   (file-upload AI agent). Keep in sync with the slide schema produced by
   backend/services/slides.py::generate_slide_deck (VALID_SLIDE_LAYOUTS). */

export type LayoutType = 'Title_Slide' | 'Image_Right' | 'Big_Metric';

export interface Slide {
  title:      string;
  content:    string;
  layoutType: LayoutType;
  imageQuery: string;
}

export function ImagePlaceholder({ query }: { query: string }) {
  return (
    <div
      className="flex-1 h-full flex flex-col items-center justify-center gap-3 rounded-2xl min-h-0"
      style={{ background: '#EEF5EB', border: '1.5px dashed #9DC08B' }}
    >
      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="#7a9268" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M2.25 15.75 8.69 9.31a2.25 2.25 0 0 1 3.18 0l4.06 4.06m0 0 1.94-1.94a2.25 2.25 0 0 1 3.18 0l2.06 2.06M6 20.25h12a2.25 2.25 0 0 0 2.25-2.25V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
        <circle cx="8.25" cy="8.25" r="1.5" />
      </svg>
      <p className="text-sm font-medium px-4 text-center" style={{ color: '#527061' }}>{query}</p>
    </div>
  );
}

export function TitleSlideLayout({ slide }: { slide: Slide }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center px-16 gap-6">
      <h1 className="text-5xl font-black leading-tight" style={{ color: '#1C3329' }}>{slide.title}</h1>
      <div className="w-16 h-1 rounded-full" style={{ background: '#517B3E' }} />
      <p className="text-xl font-medium" style={{ color: '#527061' }}>{slide.content}</p>
    </div>
  );
}

export function ImageRightLayout({ slide }: { slide: Slide }) {
  const bullets = slide.content.split('\n').map(b => b.trim()).filter(Boolean);
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-8">
      <h2 className="text-3xl font-bold shrink-0" style={{ color: '#1C3329' }}>{slide.title}</h2>
      <div className="flex-1 flex gap-10 min-h-0">
        <div className="flex-1 flex flex-col justify-center gap-4 min-w-0">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="mt-2 w-2 h-2 rounded-full shrink-0" style={{ background: '#517B3E' }} />
              <p className="text-lg leading-relaxed" style={{ color: '#2A3B22' }}>{bullet}</p>
            </div>
          ))}
        </div>
        <ImagePlaceholder query={slide.imageQuery} />
      </div>
    </div>
  );
}

export function BigMetricLayout({ slide }: { slide: Slide }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-center gap-4 px-16">
      <p className="text-8xl font-black leading-none" style={{ color: '#517B3E' }}>{slide.content}</p>
      <p className="text-2xl font-bold" style={{ color: '#1C3329' }}>{slide.title}</p>
    </div>
  );
}

export function SlideRenderer({ slide }: { slide: Slide }) {
  switch (slide.layoutType) {
    case 'Image_Right': return <ImageRightLayout slide={slide} />;
    case 'Big_Metric':  return <BigMetricLayout slide={slide} />;
    case 'Title_Slide':
    default:            return <TitleSlideLayout slide={slide} />;
  }
}
