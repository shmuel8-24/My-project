'use client';

/**
 * CoursePill — global header component showing the active course context.
 *
 * Drop this into any page header. It reads from CourseContext so it's fully
 * self-contained — no props needed.
 *
 * Behaviours:
 *  • No course selected  → shows "📚 בחר קורס ▾" → click routes to /dashboard
 *  • Course selected     → shows "🎯 [name] ▾"   → click routes to /dashboard
 *  • × button            → clears the selected course (user stays on current page)
 */

import { useRouter } from 'next/navigation';
import { useCourse }   from '../app/providers/course';
import { useLanguage } from '../app/providers/language';

export default function CoursePill() {
  const router = useRouter();
  const { selectedCourse, setSelectedCourse } = useCourse();
  const { lang } = useLanguage();
  const he = lang === 'he';

  const pillBase =
    'flex items-center gap-2 px-4 py-1.5 bg-white ' +
    'border border-[#D3E0D8] rounded-full shadow-sm text-sm font-semibold ' +
    'text-[#1C3329] cursor-pointer hover:bg-[#EEF5F0] hover:scale-105 ' +
    'transition-all duration-200';

  if (!selectedCourse) {
    return (
      <button
        onClick={() => router.push('/dashboard')}
        className={pillBase}
      >
        <span className="text-base leading-none">📚</span>
        <span>{he ? 'בחר קורס' : 'Select course'}</span>
        <svg className="w-3 h-3 opacity-55 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
        </svg>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Main pill — routes to dashboard to view / re-select */}
      <button
        onClick={() => router.push('/dashboard')}
        className={pillBase}
      >
        <span className="text-base leading-none">{selectedCourse.icon}</span>
        <span className="max-w-[110px] truncate">{selectedCourse.name}</span>
        <svg className="w-3 h-3 opacity-55 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
        </svg>
      </button>

      {/* Clear button — stays on current page */}
      <button
        onClick={() => setSelectedCourse(null)}
        aria-label={he ? 'נקה בחירת קורס' : 'Clear course selection'}
        className="w-[26px] h-[26px] flex items-center justify-center bg-[#EEF5F0] border border-[#D3E0D8] rounded-full text-[11px] font-bold hover:bg-red-50 hover:text-red-500 transition-all duration-150 cursor-pointer shrink-0"
        style={{ color: '#527061' }}
      >
        ✕
      </button>
    </div>
  );
}
