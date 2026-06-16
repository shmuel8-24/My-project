'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Settings as IconSettings, Home, BookOpen, PenTool, Presentation as PresentationIcon, Brain, Target, LogOut, Folder } from 'lucide-react';
import { useAuth }     from '../providers/auth';
import { useLanguage } from '../providers/language';
import { useCourse, COURSES, type Course } from '../providers/course';
import CoursePill        from '../../components/CoursePill';

/* ── Auth helpers ─────────────────────────────────────────────────────────── */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

/* ── Design tokens — Matcha theme ────────────────────────────────────────── */
const D = {
  pageBg:        '#97AB92',
  headerBg:      '#8BAF84',
  cardBg:        '#DCE8D6',
  cardBgHover:   '#E5EFE0',
  cardBorder:    '1px solid #BCCAB5',
  cardShadow:    '0 6px 24px rgba(20,42,16,0.14), 0 1px 4px rgba(20,42,16,0.06)',
  cardShadowHov: '0 12px 36px rgba(20,42,16,0.22)',
  /* forest-green dark: was #1F3327, now #1A2E26 everywhere */
  crystalBg:     '#1A2E26',
  textPrimary:   '#2C4A3B',
  textSec:       '#4A7A5E',
  textLabel:     '#7BA08A',
  accent:        '#4ADE80',
  accentDark:    '#2C4A3B',
  trackBg:       'rgba(44,74,59,0.10)',
  darkCard:      '#1A2E26',
  /* tinted shadows */
  darkShadow:    '0 8px 32px rgba(26,46,38,0.22), 0 2px 8px rgba(26,46,38,0.10)',
  darkShadowHov: '0 20px 56px rgba(26,46,38,0.30), 0 0 0 1.5px rgba(74,222,128,0.30)',
};

/* ── Shared micro-components ─────────────────────────────────────────────── */
function LogoMark({ size = 36 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.PNG" alt="U-Note" style={{ height: size, width: 'auto', objectFit: 'contain' }} />;
}
function AvatarContent({ gender, initials }: { gender: string; initials: string }) {
  if (gender === 'זכר') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width:'62%', height:'62%' }}>
      <circle cx="9.5" cy="13" r="5.8" /><line x1="14" y1="8.5" x2="20" y2="3" /><polyline points="15.5 3 20 3 20 7.5" />
    </svg>
  );
  if (gender === 'נקבה') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width:'62%', height:'62%' }}>
      <circle cx="12" cy="8.5" r="5.8" /><line x1="12" y1="14.3" x2="12" y2="20.5" /><line x1="9" y1="17.5" x2="15" y2="17.5" />
    </svg>
  );
  return <>{initials || '?'}</>;
}
function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}
function LogoutConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(28,51,41,0.30)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E8F0EB', boxShadow: '0 24px 64px rgba(28,51,41,0.18)' }}>
        <div className="px-6 pt-6 pb-2">
          <h2 className="font-bold text-lg text-[#1C3329]">יציאה מהמערכת</h2>
          <p className="text-sm mt-1 text-[#527061]">האם אתה בטוח שברצונך להתנתק?</p>
        </div>
        <div className="flex gap-2 px-6 py-4">
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#dc2626' }}>כן, צא</button>
          <button onClick={onCancel}  className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: '#EEF5F0', color: '#1C3329', border: '1px solid #D3E0D8' }}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

/* ── Course Option Card ───────────────────────────────────────────────────── */
function CourseOptionCard({ course, he, onSelect }: { course: Course; he: boolean; onSelect: (c: Course) => void }) {
  return (
    <button
      onClick={() => onSelect(course)}
      className="flex flex-col gap-4 p-6 rounded-[32px] text-start w-full"
      style={{
        background:           'rgba(26,46,38,0.96)',
        backdropFilter:       'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border:               '1px solid rgba(74,222,128,0.14)',
        boxShadow:            D.darkShadow,
        transition:           'transform 0.22s cubic-bezier(0.34,1.28,0.64,1), box-shadow 0.22s ease, background 0.2s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform  = 'scale(1.03) translateY(-4px)';
        e.currentTarget.style.background = 'rgba(45,74,62,0.97)';
        e.currentTarget.style.boxShadow  = D.darkShadowHov;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform  = 'scale(1) translateY(0)';
        e.currentTarget.style.background = 'rgba(26,46,38,0.96)';
        e.currentTarget.style.boxShadow  = D.darkShadow;
      }}
    >
      <div style={{ width:52, height:52, borderRadius:18, background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.22)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>
        {course.icon}
      </div>
      <div>
        <h3 style={{ color: '#DDE5DB', fontWeight: 800, fontSize: '1.0625rem', lineHeight: 1.3 }}>{course.name}</h3>
        <p style={{ color: 'rgba(221,229,219,0.45)', fontSize: '0.6875rem', marginTop: 3 }}>
          {he ? 'לחץ לבחירת קורס' : 'Click to select'}
        </p>
      </div>
    </button>
  );
}

/* ── Quick Action Crystal Card ───────────────────────────────────────────── */
function CrystalCard({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-1 p-6 rounded-2xl w-full text-right bg-gradient-to-br from-sky-100 to-sky-50 border border-sky-300 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:bg-sky-200 hover:border-sky-400 hover:shadow-lg hover:shadow-sky-300/40 active:scale-95"
    >
      <p className="text-sky-950 text-xl font-bold">{title}</p>
      <p className="text-sky-700 text-sm">{subtitle}</p>
    </button>
  );
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
interface SidebarProps {
  isOpen: boolean; onClose: () => void; isAdmin: boolean; lang: 'he' | 'en';
  userFirstName: string; userLastName: string; userEmail: string;
  userGender: string; userInitials: string; onRequestLogout: () => void;
}
function DashboardSidebar({ isOpen, onClose, isAdmin, lang, userFirstName, userLastName, userEmail, userGender, userInitials, onRequestLogout }: SidebarProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const { selectedCourse, setSelectedCourse } = useCourse();
  const he = lang === 'he';
  const translateClass = isOpen ? 'translate-x-0' : he ? 'translate-x-full' : '-translate-x-full';
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  return (
    <>
      <div
        className={['fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-300', isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'].join(' ')}
        style={{ backgroundColor: 'rgba(28,51,41,0.25)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={['fixed inset-y-0 start-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out', translateClass].join(' ')}
        style={{ backgroundColor: '#EEF5EB', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderInlineEnd: '1px solid #BCCAB5', boxShadow: '4px 0 28px rgba(20,42,16,0.14)' }}
      >
        <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: '1px solid #E8F0EB' }}>
          <LogoMark size={36} />
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/10 transition-colors shrink-0">
            <svg className="w-4 h-4 text-[#4a5e3a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 py-3 shrink-0" style={{ borderBottom: '1px solid #E8F0EB' }}>
          <button onClick={() => { router.push('/workspace'); onClose(); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ backgroundColor: '#517B3E' }}>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {he ? '+ שיחה חדשה' : '+ New Chat'}
          </button>
        </div>

        {selectedCourse && (
          <div
            className="mx-3 mt-3 px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 shrink-0"
            style={{ background: `${selectedCourse.color}12`, border: `1px solid ${selectedCourse.color}28` }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base leading-none shrink-0">{selectedCourse.icon}</span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: selectedCourse.color }}>{he ? 'קורס פעיל' : 'Active course'}</p>
                <p className="text-xs font-bold text-[#1C3329] truncate">{selectedCourse.name}</p>
              </div>
            </div>
            <button onClick={() => setSelectedCourse(null)} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded hover:bg-black/10 transition-colors" style={{ color: selectedCourse.color }}>✕</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-3 py-3 space-y-1 shrink-0" style={{ borderBottom: '1px solid #E8F0EB' }}>
            <p className="text-[10px] font-semibold text-[#527061] uppercase tracking-widest px-2 mb-2">Navigation</p>
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: '#D1E6D9', color: '#183025', boxShadow: '0 2px 4px rgba(28,51,41,0.06)' }}
            >
              <Home className="w-4 h-4 shrink-0" />{he ? 'בית' : 'Home'}
            </button>
            <button onClick={() => { router.push('/workspace'); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#527061] transition-all duration-150 hover:bg-[#EEF5F0] hover:text-[#1C3329]">
              <BookOpen className="w-4 h-4 shrink-0" />{he ? 'מרחב לימוד' : 'StudyLab'}
            </button>
            <button onClick={() => { router.push('/academic-writing'); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#527061] transition-all duration-150 hover:bg-[#EEF5F0] hover:text-[#1C3329]">
              <PenTool className="w-4 h-4 shrink-0" />{he ? 'כתיבה אקדמית' : 'Academic Writing'}
            </button>
            <button onClick={() => { router.push('/presentation-generator'); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#527061] transition-all duration-150 hover:bg-[#EEF5F0] hover:text-[#1C3329]">
              <PresentationIcon className="w-4 h-4 shrink-0" />{he ? 'יצירת מצגת' : 'Create Presentation'}
            </button>
            <button onClick={() => { router.push('/workspace/professor-simulator'); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#527061] transition-all duration-150 hover:bg-[#EEF5F0] hover:text-[#1C3329]">
              <Brain className="w-4 h-4 shrink-0" />{he ? 'הראש של המרצה' : "Professor's Brain"}
            </button>
            <button onClick={() => { router.push('/mastery'); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#527061] transition-all duration-150 hover:bg-[#EEF5F0] hover:text-[#1C3329]">
              <Target className="w-4 h-4 shrink-0" />{he ? 'שליטה בחומר' : 'Mastery'}
            </button>
            <button onClick={() => { router.push('/my-documents'); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#527061] transition-all duration-150 hover:bg-[#EEF5F0] hover:text-[#1C3329]">
              <Folder className="w-4 h-4 shrink-0" />{he ? 'המסמכים שלי' : 'My Documents'}
            </button>
            <button onClick={() => { router.push('/settings'); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#527061] transition-all duration-150 hover:bg-[#EEF5F0] hover:text-[#1C3329]">
              <IconSettings className="w-4 h-4 shrink-0" />{he ? 'הגדרות' : 'Settings'}
            </button>
            <button disabled className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#527061] cursor-not-allowed opacity-40">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
              Collaboration
              <span className="ms-auto text-[10px] bg-[#517B3E]/15 text-[#517B3E] px-1.5 py-0.5 rounded-full font-medium">Soon</span>
            </button>
          </div>
          <div className="flex-1" />
          {isAdmin && (
            <div className="px-3 py-3 shrink-0 space-y-0.5" style={{ borderTop: '1px solid #E8F0EB' }}>
              <p className="text-[10px] font-semibold text-[#527061] uppercase tracking-widest px-2 mb-2">Admin CT</p>
              <button
                onClick={() => { router.push('/admin'); onClose(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${pathname === '/admin' ? 'font-bold' : 'text-[#1C3329]/70 hover:bg-[#EEF5F0] hover:text-[#1C3329]'}`}
                style={pathname === '/admin' ? { backgroundColor: '#D1E6D9', color: '#183025', fontWeight: 700 } : undefined}
              >
                <IconShield className="w-4 h-4 shrink-0" />Admin
              </button>
            </div>
          )}
        </div>

        <div className="shrink-0 px-3 pt-2 pb-2.5" style={{ borderTop: '1px solid #E8F0EB' }}>
          <button
            dir={he ? 'rtl' : 'ltr'}
            onClick={() => { onClose(); onRequestLogout(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[#527061] hover:bg-red-50 hover:text-red-500 mb-1"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            <span className="text-sm font-medium">{he ? 'יציאה' : 'Logout'}</span>
          </button>
          <div className="relative">
            {isProfileMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-50">
                <button onClick={() => { setIsProfileMenuOpen(false); router.push('/settings'); onClose(); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-gray-700 text-sm transition-colors">
                  <IconSettings className="w-4 h-4" aria-hidden="true" />
                  <span>{he ? 'הגדרות חשבון' : 'Account Settings'}</span>
                </button>
                <button onClick={() => { setIsProfileMenuOpen(false); onClose(); onRequestLogout(); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 text-red-600 text-sm transition-colors">
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>{he ? 'התנתק' : 'Logout'}</span>
                </button>
              </div>
            )}
            <button dir={he ? 'rtl' : 'ltr'} onClick={() => setIsProfileMenuOpen(p => !p)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-[#EEF5F0] cursor-pointer group"
              style={{ textAlign: 'start' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 select-none"
                style={{ background: 'linear-gradient(135deg, #527061 0%, #1C3329 100%)' }}>
                <AvatarContent gender={userGender} initials={userInitials} />
              </div>
              <div className="flex-1 min-w-0 text-start">
                <p className="text-sm font-semibold text-[#1C3329] truncate">{userFirstName} {userLastName}</p>
                <p className="text-[11px] text-[#527061] truncate">{userEmail}</p>
              </div>
              <svg className="w-4 h-4 text-[#527061] shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang, toggleLanguage } = useLanguage();
  const { selectedCourse, setSelectedCourse, courseHydrated } = useCourse();
  const he = lang === 'he';

  const [sidebarOpen,        setSidebarOpen]        = useState(false);
  const [showLogoutModal,    setShowLogoutModal]    = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const [headerScrolled,     setHeaderScrolled]     = useState(false);
  const profilePopoverRef = useRef<HTMLDivElement>(null);

  const [isAdmin] = useState(() => {
    if (typeof window === 'undefined') return false;
    const t = localStorage.getItem('levy_ai_token');
    if (!t) return false;
    return decodeJwtPayload(t)?.is_admin === true;
  });
  const [userEmail]     = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_email')      ?? '') : '');
  const [userFirstName] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_first_name') ?? '') : '');
  const [userLastName]  = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_last_name')  ?? '') : '');
  const [userGender]    = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_gender')     ?? '') : '');
  const userInitials = [userFirstName[0], userLastName[0]].filter(Boolean).join('').toUpperCase() || (userEmail ? userEmail.slice(0, 2).toUpperCase() : '?');

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) router.replace('/?login=true');
  }, [authLoading, authUser, router]);

  useEffect(() => {
    function onScroll() { setHeaderScrolled(window.scrollY > 4); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (authLoading || !authUser) return;
    if (!courseHydrated) return;
    if (!selectedCourse) router.replace('/course-picker');
  }, [authLoading, authUser, courseHydrated, selectedCourse, router]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node))
        setProfilePopoverOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { setSidebarOpen(false); setProfilePopoverOpen(false); setShowLogoutModal(false); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const handleLogout = useCallback(() => {
    setSelectedCourse(null);
    ['levy_ai_token', 'levy_ai_email', 'levy_ai_first_name', 'levy_ai_last_name',
     'levy_ai_institution', 'levy_ai_primary_major', 'levy_ai_degree_type',
     'levy_ai_country', 'levy_ai_secondary_major', 'levy_ai_gender',
    ].forEach(k => localStorage.removeItem(k));
    document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
    document.cookie = 'levy_ai_token=; path=/; SameSite=Lax; max-age=0';
    window.location.href = '/';
  }, [setSelectedCourse]);

  if (!selectedCourse) return null;

  return (
    <div dir={he ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: D.pageBg }}>

      {/* Subtle leaf watermarks */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden" style={{ zIndex: 0 }}>
        <svg style={{ position:'absolute', top:'-70px', right:'-40px', width:'340px', opacity:.04, transform:'rotate(22deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
        <svg style={{ position:'absolute', bottom:'-50px', left:'-25px', width:'260px', opacity:.035, transform:'rotate(-18deg) scaleX(-1)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
        <svg style={{ position:'absolute', top:'40%', right:'-12px', width:'170px', opacity:.028, transform:'rotate(48deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
        <svg style={{ position:'absolute', top:'18%', left:'-8px', width:'130px', opacity:.022, transform:'rotate(-32deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
      </div>

      <DashboardSidebar
        isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}
        isAdmin={isAdmin} lang={lang}
        userFirstName={userFirstName} userLastName={userLastName}
        userEmail={userEmail} userGender={userGender} userInitials={userInitials}
        onRequestLogout={() => { setSidebarOpen(false); setShowLogoutModal(true); }}
      />
      {showLogoutModal && <LogoutConfirmModal onConfirm={handleLogout} onCancel={() => setShowLogoutModal(false)} />}

      {/* Header */}
      <header className="shrink-0 relative z-30"
        style={{
          background:           D.headerBg,
          backdropFilter:       'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow:            headerScrolled ? '0 4px 16px rgba(28,51,41,0.12)' : '0 1px 0 rgba(28,51,41,0.10)',
          transition:           'box-shadow 0.3s ease',
        }}>
        <div className="max-w-full px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-[#1C3329] hover:bg-[#EEF5F0] transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
            </button>
            <LogoMark size={38} />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <CoursePill />
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF5F0] hover:bg-[#E8F0EB] border border-[#D3E0D8] rounded-full text-sm text-[#1C3329] font-semibold transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>
              {he ? 'EN' : 'HE'}
            </button>
            <div ref={profilePopoverRef} className="relative">
              <button
                onClick={() => setProfilePopoverOpen(p => !p)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black select-none transition-all"
                style={{ backgroundColor: profilePopoverOpen ? '#D1E6D9' : '#EEF5F0', boxShadow: profilePopoverOpen ? '0 0 0 2px #D1E6D9' : 'none', color: '#1C3329' }}
              >
                <AvatarContent gender={userGender} initials={userInitials} />
              </button>
              {profilePopoverOpen && (
                <div dir={he ? 'rtl' : 'ltr'} className="absolute top-full mt-2 z-50 w-64 rounded-2xl overflow-hidden"
                  style={{ insetInlineEnd: 0, background: 'rgba(255,255,255,0.98)', border: '1px solid #E8F0EB', boxShadow: '0 16px 48px rgba(28,51,41,0.12)' }}>
                  <div className="px-4 py-4" style={{ borderBottom: '1px solid #E8F0EB' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 select-none"
                        style={{ background: 'linear-gradient(135deg,#527061,#1C3329)' }}>
                        <AvatarContent gender={userGender} initials={userInitials} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1C3329] truncate">{userFirstName} {userLastName}</p>
                        <p className="text-xs text-[#527061] truncate">{userEmail}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-2 py-2">
                    <button
                      onClick={() => { setProfilePopoverOpen(false); setShowLogoutModal(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all text-[#527061] hover:bg-red-50 hover:text-red-500"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>
                      {he ? 'יציאה' : 'Logout'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col py-8 px-6 md:px-12 relative" style={{ zIndex: 1 }}>
        <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-8">

          {/* ── Greeting hero ─────────────────────────────────────────── */}
          <div className="flex items-center gap-8 md:gap-10 px-4 bg-transparent shadow-none">
            {/* Owl mascot */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/mascot/charley.PNG"
              alt=""
              className="w-48 h-48 md:w-64 md:h-64 object-contain mix-blend-multiply bg-transparent shadow-none shrink-0"
            />
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              {/*
                RTL fix: wrap the name in <bdi> to isolate its LTR directionality.
                Without it, the bidi algorithm attaches "!" to the LTR run (Shmuel!),
                placing it on the wrong visual side. With <bdi>, "!" sits back in the
                RTL stream, directly after the Hebrew word as expected.
              */}
              <h1 className="text-3xl font-bold leading-tight" style={{ color: D.textPrimary }}>
                {he
                  ? <>{'שלום, '}<bdi>{userFirstName || 'סטודנט'}</bdi>{'!'}</>
                  : `Hello, ${userFirstName || 'Student'}!`}
              </h1>
              <p className="text-sm font-medium" style={{ color: 'rgba(26,46,38,0.65)' }}>
                {selectedCourse
                  ? he
                    ? <>{'לומד עכשיו: '}<span dir="rtl">{selectedCourse.name}{'‏'}</span></>
                    : `Studying: ${selectedCourse.name}`
                  : (he ? 'בחר קורס כדי להתחיל' : 'Select a course to get started')}
              </p>
            </div>
          </div>

          {selectedCourse ? (
            <>
              {/* Crystal action cards */}
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 4px', marginBottom:16 }}>
                  <div style={{ width:4, height:16, borderRadius:9999, background:'linear-gradient(180deg,#4ADE80,#2C4A3B)', flexShrink:0 }} />
                  <p style={{ color:D.textLabel, fontSize:'0.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>
                    {he ? 'פעולות לקורס זה' : 'Actions for this course'}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <CrystalCard title={he ? 'מרחב לימוד'      : 'StudyLab'}         subtitle={he ? 'שאל על החומר'                    : 'Ask about material'}           onClick={() => router.push('/workspace')} />
                  <CrystalCard title={he ? 'הראש של המרצה'   : "Prof's Brain"}     subtitle={he ? 'סימולציית מבחן'                  : 'Exam simulation'}              onClick={() => router.push('/workspace/professor-simulator')} />
                  <CrystalCard title={he ? 'שליטה בחומר'     : 'Mastery'}          subtitle={he ? 'חידונים ומעקב'                   : 'Quizzes & tracking'}           onClick={() => router.push(`/mastery?course=${selectedCourse.id}`)} />
                  <CrystalCard title={he ? 'כתיבה אקדמית'    : 'Academic Writing'} subtitle={he ? 'כתיבת עבודות בסגנון האישי שלך'  : 'Write papers in your style'}   onClick={() => router.push('/academic-writing')} />
                  <CrystalCard title={he ? 'צור מצגת'        : 'Create Presentation'} subtitle={he ? 'מצגת מקצועית מהחומר שלך'      : 'A professional deck from your materials'} onClick={() => router.push('/presentation-generator')} />
                  <CrystalCard title={he ? 'המסמכים שלי'     : 'My Documents'}     subtitle={he ? 'ניהול הקבצים שהעלית'             : 'Manage your uploaded files'}   onClick={() => router.push('/my-documents')} />
                </div>
              </div>
            </>
          ) : (
            /* COURSE SELECTOR */
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 4px', marginBottom:20 }}>
                <div style={{ width:4, height:16, borderRadius:9999, background:'linear-gradient(180deg,#517B3E,#2A3B22)', flexShrink:0 }} />
                <p style={{ color:D.textLabel, fontSize:'0.6875rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em' }}>
                  {he ? 'בחר קורס להתמקד בו' : 'Select a focus course'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {COURSES.map(course => (
                  <CourseOptionCard key={course.id} course={course} he={he} onSelect={setSelectedCourse} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
