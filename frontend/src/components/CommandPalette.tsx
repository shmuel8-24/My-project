'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth }     from '../app/providers/auth';
import { useLanguage } from '../app/providers/language';
import { useCourse, COURSES } from '../app/providers/course';
import { useCommandPalette }  from '../app/providers/command-palette';

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Command {
  id:      string;
  icon:    string;
  labelHe: string;
  labelEn: string;
  group:   'nav' | 'course' | 'action';
  action:  () => void;
}

const GROUP_LABELS: Record<'nav' | 'course' | 'action', { he: string; en: string }> = {
  nav:    { he: 'ניווט',          en: 'Navigation'    },
  course: { he: 'החלפת קורס',    en: 'Switch Course' },
  action: { he: 'פעולות מהירות', en: 'Quick Actions'  },
};

/* ── Command item ─────────────────────────────────────────────────────────── */
function CommandItem({
  cmd, isFocused, onClick, onHover, he,
}: {
  cmd:       Command;
  isFocused: boolean;
  onClick:   () => void;
  onHover:   () => void;
  he:        boolean;
}) {
  return (
    <div
      data-focused={isFocused ? 'true' : undefined}
      className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors duration-75"
      style={{
        background: isFocused ? '#EEF5F0' : 'transparent',
        color:      isFocused ? '#1C3329'  : '#527061',
        borderInlineStart: isFocused ? '2px solid #517B3E' : '2px solid transparent',
      }}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      <span style={{ fontSize: '1.125rem', lineHeight: 1, flexShrink: 0 }}>{cmd.icon}</span>
      <span className="text-sm font-medium">{he ? cmd.labelHe : cmd.labelEn}</span>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function CommandPalette() {
  const router = useRouter();
  const { user: authUser }                                = useAuth();
  const { lang }                                          = useLanguage();
  const { setSelectedCourse, customCourses } = useCourse();
  const { isOpen, close, toggle }                         = useCommandPalette();
  const he = lang === 'he';

  const [query,      setQuery]      = useState('');
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [isMac,      setIsMac]      = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  /* Platform detection (client-only to avoid hydration mismatch) */
  useEffect(() => {
    Promise.resolve(null).then(() =>
      setIsMac(navigator.platform.toUpperCase().includes('MAC'))
    );
  }, []);

  /* Reset state and focus input when palette opens */
  useEffect(() => {
    if (!isOpen) return;
    Promise.resolve(null).then(() => {
      setQuery('');
      setFocusedIdx(0);
      inputRef.current?.focus();
    });
  }, [isOpen]);

  /* Reset focused index when search query changes */
  useEffect(() => {
    Promise.resolve(null).then(() => setFocusedIdx(0));
  }, [query]);

  /* Scroll focused item into view on keyboard navigation */
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-focused="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx]);

  /* Build commands (dynamic — includes custom courses) */
  const commands: Command[] = useMemo(() => {
    const allCourses = [...COURSES, ...customCourses];

    const nav: Command[] = [
      {
        id: 'home', icon: '🏠',
        labelHe: 'בית — דשבורד', labelEn: 'Home — Dashboard',
        group: 'nav',
        action: () => router.push('/dashboard'),
      },
      {
        id: 'studylab', icon: '🌱',
        labelHe: 'מרחב לימוד', labelEn: 'StudyLab',
        group: 'nav',
        action: () => router.push('/workspace'),
      },
      {
        id: 'professor', icon: '🧠',
        labelHe: 'הראש של המרצה', labelEn: "Professor's Brain",
        group: 'nav',
        action: () => router.push('/workspace/professor-simulator'),
      },
      {
        id: 'mastery', icon: '🎯',
        labelHe: 'שליטה בחומר', labelEn: 'Mastery Quizzes',
        group: 'nav',
        action: () => router.push('/mastery'),
      },
      {
        id: 'course-picker', icon: '📚',
        labelHe: 'בחר קורס', labelEn: 'Pick a Course',
        group: 'nav',
        action: () => router.push('/course-picker'),
      },
    ];

    const courses: Command[] = allCourses.map(course => ({
      id:      `course-${course.id}`,
      icon:    course.icon,
      labelHe: `החלף ל${course.name}`,
      labelEn: `Switch to ${course.name}`,
      group:   'course' as const,
      action:  () => {
        setSelectedCourse(course);
        router.push('/dashboard');
      },
    }));

    const actions: Command[] = [
      {
        id: 'start-quiz', icon: '🎯',
        labelHe: 'התחל מבחן שליטה', labelEn: 'Start Mastery Quiz',
        group: 'action',
        action: () => router.push('/mastery'),
      },
      {
        id: 'ask-professor', icon: '🧠',
        labelHe: 'שאל את המרצה', labelEn: 'Ask the Professor',
        group: 'action',
        action: () => router.push('/workspace/professor-simulator'),
      },
      {
        id: 'upload', icon: '📤',
        labelHe: 'העלה מסמך', labelEn: 'Upload Document',
        group: 'action',
        action: () => router.push('/workspace'),
      },
    ];

    return [...nav, ...courses, ...actions];
  }, [customCourses, router, setSelectedCourse]);

  /* Filter commands by query */
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(cmd => {
      const label = (he ? cmd.labelHe : cmd.labelEn).toLowerCase();
      return label.includes(q) || cmd.id.includes(q);
    });
  }, [commands, query, he]);

  /* Clamp focus index so it's always in bounds */
  const effectiveFocusedIdx = filteredCommands.length
    ? Math.min(focusedIdx, filteredCommands.length - 1)
    : 0;

  function execute(cmd: Command) {
    cmd.action();
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx(i => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const cmd = filteredCommands[effectiveFocusedIdx];
      if (cmd) execute(cmd);
    }
  }

  const kbdLabel = isMac ? '⌘K' : 'Ctrl+K';
  const searching = query.trim().length > 0;

  /* Don't render anything for unauthenticated users */
  if (!authUser) return null;

  return (
    <>
      {/* ── ⌘K / Ctrl+K floating hint badge ─────────────────────────────── */}
      {!isOpen && (
        <div
          className="fixed bottom-5 z-[90] opacity-50 hover:opacity-100 transition-opacity duration-200 cursor-pointer select-none"
          style={{ insetInlineEnd: '1.25rem' }}
          onClick={toggle}
          title={he ? `פתח תפריט פקודות (${kbdLabel})` : `Open command palette (${kbdLabel})`}
        >
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: 'rgba(255,255,255,0.92)',
              border:     '1px solid #E2EBE5',
              boxShadow:  '0 2px 8px rgba(28,51,41,0.08)',
              color:      '#527061',
            }}
          >
            <svg className="w-3 h-3 opacity-70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
            </svg>
            <span style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.01em' }}>
              {kbdLabel}
            </span>
          </div>
        </div>
      )}

      {/* ── Command palette overlay ──────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] animate-fade-in"
          style={{
            backgroundColor:      'rgba(28,51,41,0.40)',
            backdropFilter:       'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
          onClick={e => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            dir={he ? 'rtl' : 'ltr'}
            className="w-full max-w-2xl mx-4 rounded-2xl shadow-2xl border border-[#E8F0EB] overflow-hidden animate-slide-up-fade"
            style={{
              background:  '#F9FCFA',
              maxHeight:   '62vh',
              display:     'flex',
              flexDirection: 'column',
            }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-6 border-b border-[#E8F0EB]" style={{ flexShrink: 0 }}>
              <svg className="w-5 h-5 shrink-0" style={{ color: '#7A9689' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
              <input
                ref={inputRef}
                dir="auto"
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={he
                  ? 'לאן נעבור? או הקלד פעולה... (חפש קורס, מבחן, וכו’)'
                  : 'Where to? Or type an action...'}
                className="w-full bg-transparent py-5 text-2xl text-[#1C3329] placeholder-[#7A9689] outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="shrink-0 text-xs px-2 py-1 rounded-md transition-colors hover:bg-[#EEF5F0]"
                  style={{ color: '#7A9689' }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Results list */}
            <div ref={listRef} className="overflow-y-auto flex-1 py-2">
              {filteredCommands.length === 0 ? (
                <div className="py-10 text-center text-sm" style={{ color: '#A8C4B4' }}>
                  {he ? 'לא נמצאו תוצאות עבור "' + query + '"' : `No results for "${query}"`}
                </div>
              ) : searching ? (
                /* Flat filtered results */
                filteredCommands.map((cmd, i) => (
                  <CommandItem
                    key={cmd.id}
                    cmd={cmd}
                    isFocused={i === effectiveFocusedIdx}
                    onClick={() => execute(cmd)}
                    onHover={() => setFocusedIdx(i)}
                    he={he}
                  />
                ))
              ) : (
                /* Grouped default list */
                (['nav', 'course', 'action'] as const).map(group => {
                  const items = filteredCommands.filter(c => c.group === group);
                  if (!items.length) return null;
                  return (
                    <div key={group}>
                      <div
                        className="px-5 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: '#A8C4B4' }}
                      >
                        {he ? GROUP_LABELS[group].he : GROUP_LABELS[group].en}
                      </div>
                      {items.map(cmd => {
                        const flatIdx = filteredCommands.indexOf(cmd);
                        return (
                          <CommandItem
                            key={cmd.id}
                            cmd={cmd}
                            isFocused={flatIdx === effectiveFocusedIdx}
                            onClick={() => execute(cmd)}
                            onHover={() => setFocusedIdx(flatIdx)}
                            he={he}
                          />
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer shortcut hints */}
            <div
              className="px-5 py-2.5 flex items-center gap-4 flex-wrap"
              style={{ borderTop: '1px solid #E8F0EB', flexShrink: 0 }}
            >
              {[
                ['↑↓', he ? 'ניווט' : 'navigate'],
                ['↵',  he ? 'בחר'   : 'select'],
                ['Esc', he ? 'סגור'  : 'close'],
              ].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1 text-[11px]" style={{ color: '#A8C4B4' }}>
                  <kbd
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: '#EEF5F0', color: '#527061', fontFamily: 'ui-monospace,monospace' }}
                  >
                    {key}
                  </kbd>
                  {label}
                </span>
              ))}
              <span
                className="ms-auto text-[11px] font-semibold px-2 py-0.5 rounded-md"
                style={{ background: '#EEF5F0', color: '#527061', fontFamily: 'ui-monospace,monospace' }}
              >
                {kbdLabel}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
