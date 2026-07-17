'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth }     from '../providers/auth';
import { useLanguage } from '../providers/language';
import { useCourse, type Course } from '../providers/course';
import Skeleton        from '../../components/ui/Skeleton';
import { useHaptics }  from '../../hooks/useHaptics';
import { playSwitch }  from '../../utils/audio';
import { Plus, Trash2, MoreVertical, Edit2, FileUp, LogOut } from 'lucide-react';

const API = 'http://localhost:5003';

/* ── Time-based greeting ──────────────────────────────────────────────────── */
function getGreeting(he: boolean): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return he ? 'בוקר טוב, מוכנים ללמוד? ☕'              : 'Good morning, ready to learn? ☕';
  if (h >= 12 && h < 18) return he ? 'צהריים טובים, מה נלמד עכשיו? ☀️'        : 'Good afternoon, what shall we study? ☀️';
  if (h >= 18 && h < 23) return he ? 'ערב טוב, זמן להשלים פערים 🌙'            : 'Good evening, time to fill the gaps 🌙';
  return he ? 'לילה לבן של למידה? אנחנו איתך 🦉' : "Late-night study session? We're with you 🦉";
}

/* ── Course card ─────────────────────────────────────────────────────────── */
function CourseCard({
  course, isActive, isSelecting, he,
}: { course: Course; isActive: boolean; isSelecting: boolean; he: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center w-56 aspect-square rounded-[2rem] bg-gradient-to-br from-[#EAF4F8] to-white border border-sky-100/80 shadow-[0_2px_10px_-3px_rgba(135,206,235,0.2)] hover:shadow-[0_8px_20px_-6px_rgba(135,206,235,0.4)] hover:-translate-y-1.5 transition-all duration-300 ease-out cursor-pointer p-6"
      style={isSelecting ? {
        borderColor: '#517B3E',
        boxShadow: '0 0 0 3px rgba(81,123,62,0.28), 0 6px 20px rgba(81,123,62,0.18)',
        background: 'linear-gradient(135deg, #f0f7ed, #fafffe)',
      } : isActive ? {
        borderColor: '#38bdf8',
        boxShadow: '0 0 0 3px rgba(125,211,252,0.40)',
      } : undefined}
    >
      <p className="text-2xl font-extrabold text-sky-600 tracking-tight text-center leading-snug">
        {course.name}
      </p>
      {isSelecting && (
        <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
          style={{ background: 'rgba(81,123,62,0.12)', border: '1px solid rgba(81,123,62,0.28)', color: '#517B3E' }}>
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          {he ? 'נבחר' : 'Selected'}
        </span>
      )}
      {!isSelecting && isActive && (
        <span className="mt-3 inline-flex items-center px-3 py-1 rounded-full bg-sky-100 border border-sky-200 text-sky-700 text-xs font-bold uppercase tracking-wider">
          {he ? 'פעיל' : 'Active'}
        </span>
      )}
    </div>
  );
}

/* ── Add-course "+" card ─────────────────────────────────────────────────── */
function AddCard({ he }: { he: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center w-56 aspect-square rounded-[2rem] bg-white/40 hover:bg-gradient-to-br hover:from-sky-50 hover:to-white border-2 border-dashed border-sky-200 hover:border-sky-400 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg cursor-pointer text-sky-600 hover:text-sky-800 p-6">
      <Plus className="w-10 h-10" strokeWidth={1.5} />
      <p className="text-lg font-semibold mt-3 text-center">
        {he ? 'הוסף קורס חדש' : 'Add New Course'}
      </p>
    </div>
  );
}

/* ── Delete confirmation modal ────────────────────────────────────────────── */
function DeleteModal({
  course, he, isDeleting, onConfirm, onCancel,
}: {
  course: Course;
  he: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        onClick={() => { if (!isDeleting) onCancel(); }}
      />

      {/* Modal card */}
      <motion.div
        dir={he ? 'rtl' : 'ltr'}
        className="relative rounded-3xl p-8 w-full max-w-sm shadow-2xl"
        style={{ background: '#FFFFFF' }}
        initial={{ scale: 0.88, opacity: 0, y: 12 }}
        animate={{ scale: 1,    opacity: 1, y: 0  }}
        exit={{ scale: 0.88,    opacity: 0, y: 12 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: '#FEF2F2' }}
        >
          <Trash2 className="w-6 h-6" style={{ color: '#EF4444' }} />
        </div>

        <h2 className="text-xl font-bold mb-1" style={{ color: '#1C3329' }}>
          {he ? 'מחיקת קורס' : 'Delete Course'}
        </h2>
        <p className="text-sm font-semibold mb-3" style={{ color: '#1C3329' }}>
          {course.name}
        </p>
        <p className="text-sm mb-7 leading-relaxed" style={{ color: '#527061' }}>
          {he
            ? 'האם אתה בטוח שברצונך למחוק את הקורס? פעולה זו תמחק גם את כל חומרי הלימוד והסילבוס השמורים.'
            : 'Are you sure you want to delete this course? This will also delete all saved study materials and the syllabus.'}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-150"
            style={{ background: '#F4F9F6', color: '#527061', border: '1.5px solid #D3E0D8' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#EEF5F0'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#F4F9F6'; }}
          >
            {he ? 'ביטול' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all duration-200"
            style={{
              background: isDeleting
                ? '#FCA5A5'
                : 'linear-gradient(135deg, #EF4444, #DC2626)',
              boxShadow: '0 4px 14px rgba(239,68,68,0.28)',
            }}
          >
            {isDeleting
              ? (he ? 'מוחק...' : 'Deleting…')
              : (he ? 'מחק קורס' : 'Delete Course')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function CoursePickerPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading, logout } = useAuth();
  const { lang } = useLanguage();
  const { selectedCourse, setSelectedCourse, customCourses, removeCustomCourse } = useCourse();
  const he = lang === 'he';

  const { triggerHaptic } = useHaptics();

  const [selecting,      setSelecting]      = useState<string | null>(null);
  const [isExiting,      setIsExiting]      = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [isDeleting,     setIsDeleting]     = useState(false);
  const [toast,          setToast]          = useState('');
  const [openMenuId,          setOpenMenuId]          = useState<string | null>(null);
  const [menuPos,             setMenuPos]             = useState<{ top: number; left: number } | null>(null);
  const [isUploadingSyllabus, setIsUploadingSyllabus] = useState(false);
  const [changeLog,           setChangeLog]           = useState<string[]>([]);
  const menuRef          = useRef<HTMLDivElement>(null);
  const syllabusInputRef = useRef<HTMLInputElement>(null);
  const syllabusTargetRef = useRef<Course | null>(null);

  const allCourses = [...customCourses];

  /* Auth guard */
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) router.replace('/?login=true');
  }, [authLoading, authUser, router]);

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!openMenuId) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpenMenuId(null);
      setMenuPos(null);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [openMenuId]);

  /* Close dropdown on any scroll (menu is fixed; cards may scroll under it) */
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => { setOpenMenuId(null); setMenuPos(null); };
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [openMenuId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  const MENU_W = 192; // px — wide enough for "עדכון סילבוס"

  function toggleMenu(e: React.MouseEvent<HTMLButtonElement>, courseId: string) {
    e.stopPropagation();
    if (openMenuId === courseId) { setOpenMenuId(null); setMenuPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({
      top:  rect.bottom + 6,
      left: he ? rect.left : rect.right - MENU_W,
    });
    setOpenMenuId(courseId);
  }

  const handleSyllabusUpload = useCallback(async (course: Course, file: File) => {
    setIsUploadingSyllabus(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('course_name', course.name);
    try {
      const res = await fetch(`${API}/api/courses/update-syllabus`, {
        method: 'POST', credentials: 'include', body: formData,
      });
      const raw = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(raw); } catch { /* not JSON */ }
      if (!res.ok) {
        showToast(he ? `שגיאה בעדכון הסילבוס (${res.status})` : `Syllabus update failed (${res.status})`);
      } else {
        const changes = Array.isArray(data.changes) ? (data.changes as string[]) : [];
        if (changes.length > 0) {
          setChangeLog(changes);
          // Auto-dismiss after 9 s so the user has time to read the list
          setTimeout(() => setChangeLog([]), 9000);
        } else {
          showToast(he
            ? 'הסילבוס עודכן. לא זוהו שינויים בפרטי הקורס (מרצה, מתרגל וכו׳).'
            : 'Syllabus updated. No changes detected in course details.');
        }
      }
    } catch {
      showToast(he ? 'שגיאת רשת — נסה שנית' : 'Network error — try again');
    } finally {
      setIsUploadingSyllabus(false);
      if (syllabusInputRef.current) syllabusInputRef.current.value = '';
    }
  }, [he]);

  function handleSelect(course: Course) {
    if (selecting || courseToDelete) return;
    playSwitch();
    triggerHaptic('light');
    setSelecting(course.id);
    setSelectedCourse(course);
    // Phase 1 (0–160 ms): card presses + matcha-green border visible
    // Phase 2 (160–380 ms): card stays pressed while page fades out
    // Phase 3 (380 ms): navigate — dashboard mounts with slide-up fade
    setTimeout(() => setIsExiting(true), 160);
    setTimeout(() => router.push('/dashboard'), 380);
  }

  const handleDeleteConfirm = useCallback(async () => {
    if (!courseToDelete) return;
    setIsDeleting(true);

    try {
      // Use a dedicated POST endpoint rather than DELETE to avoid HTTP method
      // routing ambiguity in Flask and CORS preflight complications.
      const res = await fetch(`${API}/api/courses/delete`, {
        method:  'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ course_name: courseToDelete.name }),
      });
      const raw = await res.text();
      if (!res.ok) {
        let errMsg = '';
        try { errMsg = (JSON.parse(raw) as { error?: string }).error ?? ''; } catch { /* not JSON */ }
        console.error('[delete course]', errMsg || res.status);
      }
    } catch (err) {
      console.error('[delete course] network error:', err);
    } finally {
      setIsDeleting(false);
    }

    // Always clean up local state, even if the backend call failed
    removeCustomCourse(courseToDelete.id);
    if (selectedCourse?.id === courseToDelete.id) setSelectedCourse(null);
    setCourseToDelete(null);
    showToast(he ? 'הקורס נמחק בהצלחה ✓' : 'Course deleted ✓');
  }, [courseToDelete, he, removeCustomCourse, selectedCourse, setSelectedCourse]);

  if (authLoading || !authUser) {
    return (
      <div
        dir={he ? 'rtl' : 'ltr'}
        className="!bg-[#97AB92] w-full min-h-screen flex flex-col items-center justify-center px-6 py-16"
      >
        <div className="flex flex-col items-center w-full max-w-3xl gap-6">
          <Skeleton className="w-36 h-12 rounded-2xl" />
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="w-72 h-9 rounded-2xl" />
            <Skeleton className="w-48 h-5 rounded-xl" />
          </div>
          <div className="flex flex-wrap justify-center gap-8 mt-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex flex-col items-center gap-4">
                <Skeleton className="w-40 h-40 rounded-3xl" />
                <Skeleton className="w-20 h-4 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div
        dir={he ? 'rtl' : 'ltr'}
        className="!bg-[#97AB92] w-full min-h-screen flex flex-col items-center justify-center px-6 py-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: isExiting ? 0 : 1 }}
        transition={{ duration: 0.22, ease: 'easeInOut' }}
      >
        {/* Decorative leaf watermarks */}
        <div className="fixed inset-0 pointer-events-none select-none overflow-hidden" style={{ zIndex: 0 }}>
          <svg style={{ position:'absolute', top:'-70px', right:'-40px', width:'340px', opacity:.04, transform:'rotate(22deg)' }}
            viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
            <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
          </svg>
          <svg style={{ position:'absolute', bottom:'-50px', left:'-25px', width:'260px', opacity:.035, transform:'rotate(-18deg) scaleX(-1)' }}
            viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
            <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
          </svg>
          <svg style={{ position:'absolute', top:'45%', right:'-12px', width:'170px', opacity:.028, transform:'rotate(48deg)' }}
            viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true">
            <path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/>
          </svg>
        </div>

        {/* Sign out — this page has no other nav chrome, so it needs its own exit */}
        <button
          type="button"
          onClick={logout}
          className="fixed top-6 z-20 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors duration-150"
          style={{ insetInlineEnd: '24px', background: 'rgba(255,255,255,0.55)', color: '#527061', border: '1px solid rgba(255,255,255,0.7)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.85)'; e.currentTarget.style.color = '#1C3329'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.55)'; e.currentTarget.style.color = '#527061'; }}
        >
          <LogOut className="w-3.5 h-3.5" />
          {he ? 'התנתק' : 'Sign Out'}
        </button>

        <div className="relative z-10 flex flex-col items-center w-full max-w-3xl">

          {/* Logo */}
          <div className="mb-10 animate-course-card" style={{ animationDelay: '0ms' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.PNG" alt="U-Note" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
          </div>

          {/* Greeting */}
          <h1
            className="text-4xl font-medium mb-3 text-center animate-course-card"
            style={{ color: '#1C3329', animationDelay: '80ms' }}
            suppressHydrationWarning
          >
            {getGreeting(he)}
          </h1>

          {/* Subtitle */}
          <p
            className="text-base mb-12 text-center animate-course-card"
            style={{ color: '#527061', animationDelay: '140ms' }}
          >
            {he ? 'בחר/י קורס כדי להתחיל' : 'Select a course to begin'}
          </p>

          {/* Course grid */}
          <div className="w-full flex gap-6 overflow-x-auto snap-x snap-mandatory hide-scrollbar pb-2 px-4 md:flex-wrap md:justify-center md:overflow-visible md:snap-none md:gap-8 md:pb-0 md:px-0">

            <AnimatePresence mode="popLayout">
              {allCourses.map((course, i) => {
                const isActive    = !selecting && selectedCourse?.id === course.id;
                const isSelecting = selecting === course.id;

                return (
                  <motion.div
                    key={course.id}
                    layout
                    initial={{ opacity: 0, scale: 0.82 }}
                    animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.06, duration: 0.25 } }}
                    exit={{ opacity: 0, scale: 0.72, filter: 'blur(4px)', transition: { duration: 0.2 } }}
                    className="relative group snap-center shrink-0"
                  >
                    {/* Select button */}
                    <button
                      onClick={() => handleSelect(course)}
                      disabled={!!selecting || !!courseToDelete}
                      className="outline-none"
                      style={{
                        transform:  isSelecting ? 'scale(0.95)' : 'scale(1)',
                        transition: 'transform 0.22s cubic-bezier(0.34, 1.28, 0.64, 1)',
                      }}
                    >
                      <CourseCard course={course} isActive={isActive} isSelecting={isSelecting} he={he} />
                    </button>

                    {/* 3-dots menu trigger — revealed on hover */}
                    <button
                      type="button"
                      onClick={e => toggleMenu(e, course.id)}
                      disabled={!!selecting || !!courseToDelete}
                      aria-label={he ? 'אפשרויות' : 'Options'}
                      className="absolute w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                      style={{
                        top:            '12px',
                        insetInlineEnd: '12px',
                        background:     openMenuId === course.id ? '#F4F9F6' : 'rgba(255,255,255,0.92)',
                        color:          openMenuId === course.id ? '#1C3329' : '#94A3B8',
                        border:         openMenuId === course.id ? '1.5px solid #D3E0D8' : '1.5px solid #E2EBE5',
                        boxShadow:      '0 2px 8px rgba(0,0,0,0.08)',
                        opacity:        openMenuId === course.id ? 1 : undefined,  // keep visible when open
                      }}
                      onMouseEnter={e => {
                        if (openMenuId === course.id) return;
                        e.currentTarget.style.color       = '#1C3329';
                        e.currentTarget.style.background  = '#F4F9F6';
                        e.currentTarget.style.borderColor = '#D3E0D8';
                      }}
                      onMouseLeave={e => {
                        if (openMenuId === course.id) return;
                        e.currentTarget.style.color       = '#94A3B8';
                        e.currentTarget.style.background  = 'rgba(255,255,255,0.92)';
                        e.currentTarget.style.borderColor = '#E2EBE5';
                      }}
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Empty state — shown when the user has no courses yet */}
            {allCourses.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full flex flex-col items-center gap-3 py-6 text-center"
              >
                <p className="text-lg font-semibold" style={{ color: '#1C3329' }}>
                  {he ? 'עדיין אין קורסים' : 'No courses yet'}
                </p>
                <p className="text-sm" style={{ color: '#527061' }}>
                  {he
                    ? 'לחץ על "הוסף קורס חדש" כדי להתחיל'
                    : 'Click "Add New Course" to get started'}
                </p>
              </motion.div>
            )}

            {/* Add new course card */}
            <div
              className="animate-course-card snap-center shrink-0"
              style={{ animationDelay: `${200 + allCourses.length * 100}ms` }}
            >
              <button
                onClick={() => router.push('/course-picker/add')}
                disabled={!!selecting || !!courseToDelete}
                className="group outline-none"
              >
                <AddCard he={he} />
              </button>
            </div>

          </div>
        </div>
      </motion.div>

      {/* ── Context dropdown (fixed to viewport — escapes all overflow constraints) ── */}
      <AnimatePresence>
        {openMenuId && menuPos && (
          <motion.div
            ref={menuRef}
            dir={he ? 'rtl' : 'ltr'}
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{ opacity: 0,    scale: 0.92, y: -4 }}
            transition={{ duration: 0.13, ease: 'easeOut' }}
            className="py-1.5 rounded-2xl border border-[#E2EBE5]"
            style={{
              position:  'fixed',
              top:       menuPos.top,
              left:      menuPos.left,
              width:     MENU_W,
              zIndex:    10000,
              background: '#FFFFFF',
              boxShadow:  '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {/* Edit */}
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-150"
              style={{ color: '#1C3329' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F4F9F6'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => {
                router.push(`/course-picker/edit/${openMenuId}`);
                setOpenMenuId(null); setMenuPos(null);
              }}
            >
              <Edit2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#527061' }} />
              {he ? 'עריכה' : 'Edit'}
            </button>

            {/* Update Syllabus */}
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-150"
              style={{ color: '#1C3329' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F4F9F6'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => {
                const target = allCourses.find(c => c.id === openMenuId);
                syllabusTargetRef.current = target ?? null;
                setOpenMenuId(null); setMenuPos(null);
                syllabusInputRef.current?.click();
              }}
            >
              <FileUp className="w-3.5 h-3.5 shrink-0" style={{ color: '#527061' }} />
              {he ? 'עדכון סילבוס' : 'Update Syllabus'}
            </button>

            <div className="border-t border-[#F0F5F2] mx-2" />

            {/* Delete */}
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors duration-150"
              style={{ color: '#EF4444' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FEF2F2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => {
                const target = allCourses.find(c => c.id === openMenuId);
                if (target) setCourseToDelete(target);
                setOpenMenuId(null); setMenuPos(null);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              {he ? 'מחיקה' : 'Delete'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confirmation modal ── */}
      <AnimatePresence>
        {courseToDelete && (
          <DeleteModal
            course={courseToDelete}
            he={he}
            isDeleting={isDeleting}
            onConfirm={handleDeleteConfirm}
            onCancel={() => { if (!isDeleting) setCourseToDelete(null); }}
          />
        )}
      </AnimatePresence>

      {/* Hidden file input for quick syllabus upload via dropdown */}
      <input
        ref={syllabusInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          const target = syllabusTargetRef.current;
          if (file && target) handleSyllabusUpload(target, file);
        }}
      />

      {/* Syllabus upload loading overlay */}
      <AnimatePresence>
        {isUploadingSyllabus && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[9998] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          >
            <motion.div
              dir={he ? 'rtl' : 'ltr'}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl px-8 py-7 flex flex-col items-center gap-4 shadow-2xl text-center"
              style={{ maxWidth: 260 }}
            >
              <svg className="animate-spin" style={{ width: 28, height: 28, color: '#517B3E' }} fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              <div>
                <p className="text-sm font-bold" style={{ color: '#1C3329' }}>
                  {he ? 'מעדכן סילבוס...' : 'Updating syllabus…'}
                </p>
                <p className="text-xs mt-1" style={{ color: '#527061' }}>
                  {he ? 'ה-AI מנתח את הקובץ' : 'AI is analyzing the file'}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AI change log notification ── */}
      <AnimatePresence>
        {changeLog.length > 0 && (
          <motion.div
            dir={he ? 'rtl' : 'ltr'}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="fixed top-6 left-1/2 z-[9999] overflow-hidden rounded-2xl shadow-2xl border border-[#E2EBE5]"
            style={{
              transform:  'translateX(-50%)',
              maxWidth:   380,
              width:      'calc(100vw - 2rem)',
              background: '#FFFFFF',
            }}
          >
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#D1E6D9' }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '0.9rem' }}>📋</span>
                <span className="text-sm font-bold" style={{ color: '#183025' }}>
                  {he ? 'שינויים שזוהו בסילבוס' : 'Changes detected in syllabus'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setChangeLog([])}
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors"
                style={{ background: 'rgba(24,48,37,0.12)', color: '#183025' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(24,48,37,0.22)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(24,48,37,0.12)'; }}
                aria-label={he ? 'סגור' : 'Close'}
              >
                ✕
              </button>
            </div>
            {/* Changes list */}
            <ul className="px-4 py-3 flex flex-col gap-2">
              {changeLog.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: '#1C3329' }}>
                  <span className="shrink-0 font-bold mt-0.5" style={{ color: '#517B3E' }}>•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Success toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.22 }}
            className="fixed top-6 left-1/2 z-[9999] px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg pointer-events-none"
            style={{
              background:    '#D1E6D9',
              color:         '#183025',
              transform:     'translateX(-50%)',
              whiteSpace:    'nowrap',
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
