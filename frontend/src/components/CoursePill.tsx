'use client';

/**
 * CoursePill — global header component showing the active course context.
 *
 * Drop this into any page header. It reads from CourseContext so it's fully
 * self-contained — no props needed.
 *
 * Behaviours:
 *  • No course selected  → shows "📚 בחר קורס ▾" → click routes to /course-picker
 *  • Course selected     → shows a static badge (icon + name) plus a chevron
 *    that opens a dropdown listing every course. Picking one switches the
 *    active course via CourseContext — no navigation needed.
 *  • × button            → clears the selected course and routes to /course-picker
 *    (most pages assume an active course, so clearing it leaves the user on
 *    /course-picker to choose a new one — same destination as the pill itself
 *    when no course is selected)
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { useCourse, type Course } from '../app/providers/course';
import { useLanguage } from '../app/providers/language';

export default function CoursePill() {
  const router = useRouter();
  const { selectedCourse, setSelectedCourse, customCourses } = useCourse();
  const { lang } = useLanguage();
  const he = lang === 'he';

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isDropdownOpen]);

  const pillBase =
    'flex items-center gap-2 px-4 py-1.5 bg-white ' +
    'border border-[#D3E0D8] rounded-full shadow-sm text-sm font-semibold ' +
    'text-[#1C3329] cursor-pointer hover:bg-[#EEF5F0] hover:scale-105 ' +
    'transition-all duration-200';

  if (!selectedCourse) {
    return (
      <button
        onClick={() => router.push('/course-picker')}
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

  const selectCourse = (course: Course) => {
    setSelectedCourse(course);
    setIsDropdownOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1.5">
        {/* Main pill — static visual indicator, not interactive */}
        <div
          className="flex items-center gap-2 px-4 py-1.5 bg-white border border-[#D3E0D8] rounded-full shadow-sm text-sm font-semibold text-[#1C3329] select-none"
        >
          <span className="text-base leading-none">{selectedCourse.icon}</span>
          <span className="max-w-[110px] truncate">{selectedCourse.name}</span>
        </div>

        {/* Chevron — toggles the quick-switch dropdown */}
        <button
          onClick={() => setIsDropdownOpen(o => !o)}
          aria-label={he ? 'החלף קורס' : 'Switch course'}
          aria-expanded={isDropdownOpen}
          className="w-[26px] h-[26px] flex items-center justify-center bg-white border border-[#D3E0D8] rounded-full shadow-sm hover:bg-[#EEF5F0] hover:scale-105 transition-all duration-200 cursor-pointer shrink-0"
        >
          <svg
            className={`w-3 h-3 opacity-55 shrink-0 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </button>

        {/* Clear button — clears the course and returns to the course picker */}
        <button
          onClick={() => {
            setSelectedCourse(null);
            router.push('/course-picker');
          }}
          aria-label={he ? 'נקה בחירת קורס' : 'Clear course selection'}
          className="w-[26px] h-[26px] flex items-center justify-center bg-[#EEF5F0] border border-[#D3E0D8] rounded-full text-[11px] font-bold hover:bg-red-50 hover:text-red-500 transition-all duration-150 cursor-pointer shrink-0"
          style={{ color: '#527061' }}
        >
          ✕
        </button>
      </div>

      {isDropdownOpen && (
        <div
          dir={he ? 'rtl' : 'ltr'}
          className="absolute top-full mt-2 start-0 w-64 bg-white rounded-xl shadow-lg border border-[#E2EBE5] overflow-hidden z-50"
        >
          {customCourses.map(course => {
            const isActive = course.id === selectedCourse.id;
            return (
              <button
                key={course.id}
                onClick={() => selectCourse(course)}
                className={[
                  'w-full flex items-center gap-2.5 px-4 py-3 text-sm text-start cursor-pointer transition-colors',
                  isActive ? 'bg-[#EEF5F0] font-bold' : 'font-medium hover:bg-green-50',
                ].join(' ')}
                style={{ color: isActive ? '#183025' : '#1C3329' }}
              >
                <span className="flex-1 min-w-0 truncate">{course.name}</span>
                {isActive && <Check className="w-4 h-4 shrink-0" style={{ color: '#517B3E' }} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
