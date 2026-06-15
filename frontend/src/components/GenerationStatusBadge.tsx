'use client';

import { useRouter, usePathname } from 'next/navigation';
import { Presentation } from 'lucide-react';
import { usePresentationGenerator } from '../app/providers/presentation';
import { useLanguage } from '../app/providers/language';

// Global "AI is generating a presentation" indicator — rendered once in
// layout.tsx (inside PresentationProvider) so it floats above every page.
// Lets the user navigate away from /presentation-generator while a deck is
// being built and come back to find it ready.
export default function GenerationStatusBadge() {
  const { isGenerating } = usePresentationGenerator();
  const { lang } = useLanguage();
  const he = lang === 'he';
  const router = useRouter();
  const pathname = usePathname();

  if (!isGenerating || pathname === '/presentation-generator') return null;

  return (
    <button
      onClick={() => router.push('/presentation-generator')}
      dir={he ? 'rtl' : 'ltr'}
      className="fixed bottom-5 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-full text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.98]"
      style={{
        insetInlineEnd: '1.25rem',
        background: 'linear-gradient(135deg, #517B3E 0%, #2A3B22 100%)',
        boxShadow: '0 8px 24px rgba(28,51,41,0.30)',
      }}
    >
      <span className="relative flex items-center justify-center w-4 h-4 shrink-0">
        <span className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        <Presentation className="w-2.5 h-2.5" />
      </span>
      {he ? 'ה-AI מייצר מצגת...' : 'AI is generating a presentation...'}
    </button>
  );
}
