'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth }     from '../../providers/auth';
import { useLanguage } from '../../providers/language';
import { useCourse }   from '../../providers/course';
import CoursePill      from '../../../components/CoursePill';
import { UpgradeModal } from '../UpgradeModal';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API = 'http://127.0.0.1:5003';
const FREE_FILE_LIMIT = 2;
const FREE_SIM_LIMIT  = 2;

// ── Exam style presets ────────────────────────────────────────────────────────
const STYLE_OPTIONS = [
  { value: "שאלות קאטש' ומכשולים לוגיים", label: "שאלות קאטש' ומכשולים לוגיים" },
  { value: "הנחות שגויות ומקרי קצה",       label: "הנחות שגויות ומקרי קצה" },
  { value: "הגדרות ומינוח מדויק",           label: "הגדרות ומינוח מדויק" },
  { value: "ניתוח ועיבוד כמותי / מתמטי",   label: "ניתוח ועיבוד כמותי / מתמטי" },
  { value: "שאלות פתוחות ועיון מעמיק",     label: "שאלות פתוחות ועיון מעמיק" },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────
interface ProfMsg {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

interface UploadedFile {
  name:    string;
  file_id: string;
  size:    number;
}

interface UsageData {
  plan_type:            string;
  prof_sims_this_month: number;
  prof_sim_limit:       number | null;
}

// ── Auth / fetch helpers ──────────────────────────────────────────────────────
function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('levy_ai_token') : null;
}

async function authFetch(url: string, init: RequestInit = {}) {
  const token = getToken();
  return fetch(url, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string>) ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function formatBytes(b: number): string {
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1_048_576).toFixed(1)} MB`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

// ── Small shared components ───────────────────────────────────────────────────
function LogoMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.PNG" alt="U-Note" style={{ height: size, width: 'auto', objectFit: 'contain' }} />
  );
}

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? 'w-3.5 h-3.5 border-white/30 border-t-white'
    : 'w-5 h-5 border-[#9DC08B]/30 border-t-[#517B3E]';
  return <span className={`inline-block rounded-full border-2 animate-spin ${cls}`} />;
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function AvatarContent({ gender, initials }: { gender: string; initials: string }) {
  if (gender === 'זכר') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
        style={{ width: '62%', height: '62%' }}>
        <circle cx="9.5" cy="13" r="5.8"/>
        <line x1="14" y1="8.5" x2="20" y2="3"/>
        <polyline points="15.5 3 20 3 20 7.5"/>
      </svg>
    );
  }
  if (gender === 'נקבה') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
        style={{ width: '62%', height: '62%' }}>
        <circle cx="12" cy="8.5" r="5.8"/>
        <line x1="12" y1="14.3" x2="12" y2="20.5"/>
        <line x1="9" y1="17.5" x2="15" y2="17.5"/>
      </svg>
    );
  }
  return <>{initials || '?'}</>;
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

// ── Logout confirmation modal ─────────────────────────────────────────────────
function LogoutConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(42,59,34,0.45)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(157,192,139,0.3)', boxShadow: '0 24px 64px rgba(20,40,15,0.25)' }}
      >
        <div className="px-6 pt-6 pb-2">
          <h2 className="font-bold text-[#1a2e14] text-lg">יציאה מהמערכת</h2>
          <p className="text-sm text-[#7a9268] mt-1">האם אתה בטוח שברצונך להתנתק ולצאת?</p>
        </div>
        <div className="flex gap-2 px-6 py-4">
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: '#dc2626' }}
          >
            כן, צא
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: 'rgba(81,123,62,0.1)', color: '#517B3E', border: '1px solid rgba(81,123,62,0.2)' }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar (professor simulator — no sessions list, active state on this item) ──
interface ProfSimSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  lang: 'he' | 'en';
  userFirstName: string;
  userLastName: string;
  userEmail: string;
  userGender: string;
  userInitials: string;
  onRequestLogout: () => void;
  isProcessing?: boolean;
}

function ProfSimSidebar({ isOpen, onClose, isAdmin, lang, userFirstName, userLastName, userEmail, userGender, userInitials, onRequestLogout, isProcessing = false }: ProfSimSidebarProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const he = lang === 'he';
  const { selectedCourse, setSelectedCourse } = useCourse();
  const translateClass = isOpen
    ? 'translate-x-0'
    : he ? 'translate-x-full' : '-translate-x-full';
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  return (
    <>
      {/* Backdrop */}
      <div
        className={['fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'].join(' ')}
        style={{ backgroundColor: 'rgba(42,59,34,0.35)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={['fixed inset-y-0 start-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out', translateClass].join(' ')}
        style={{
          backgroundColor: 'rgba(217,235,208,0.97)',
          backdropFilter: 'blur(20px)',
          borderInlineEnd: '1px solid rgba(100,140,80,0.25)',
          boxShadow: '4px 0 32px rgba(60,90,40,0.12)',
        }}
      >
        {/* Logo header */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(100,140,80,0.2)' }}>
          <LogoMark size={36} />
          <button onClick={onClose} aria-label={lang === 'he' ? 'סגור תפריט' : 'Close menu'}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors shrink-0">
            <svg className="w-4 h-4 text-[#4a5e3a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(100,140,80,0.2)' }}>
          <button onClick={() => { router.push('/workspace'); onClose(); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ backgroundColor: '#517B3E' }}>
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {he ? '+ שיחה חדשה' : '+ New Chat'}
          </button>
        </div>

        {/* Active course indicator */}
        {selectedCourse && (
          <div className="mx-3 mt-2 px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 shrink-0"
            style={{ background: `${selectedCourse.color}12`, border: `1px solid ${selectedCourse.color}25` }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm leading-none shrink-0">{selectedCourse.icon}</span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: selectedCourse.color }}>{he ? 'קורס פעיל' : 'Active course'}</p>
                <p className="text-xs font-bold text-[#1a2e14] truncate">{selectedCourse.name}</p>
              </div>
            </div>
            <button onClick={() => setSelectedCourse(null)} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded hover:bg-black/10 transition-colors" style={{ color: selectedCourse.color }}>✕</button>
          </div>
        )}

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-3 py-3 space-y-1 shrink-0" style={{ borderBottom: '1px solid rgba(100,140,80,0.2)' }}>
            <p className="text-[10px] font-semibold text-[#7a9268] uppercase tracking-widest px-2 mb-2">Navigation</p>

            <button onClick={() => { router.push('/dashboard'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">🏠</span>
              {lang === 'he' ? 'בית' : 'Home'}
            </button>

            <button onClick={() => { router.push('/workspace'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">🌱</span>
              {he ? 'מרחב לימוד' : 'StudyLab'}
            </button>

            <button onClick={() => { router.push('/academic-writing'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">✍️</span>
              {he ? 'כתיבה אקדמית' : 'Academic Writing'}
            </button>

            {/* ── Active item: הראש של המרצה ──────────────────────────────────
                 Three visual states driven by the isProcessing prop:
                 • idle      — standard active highlight, no animation
                 • processing — border intensifies, brain icon gets glow ring,
                                three staggered dots appear at the trailing edge  ── */}
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm border transition-all duration-300"
              style={{
                backgroundColor: isProcessing
                  ? 'rgba(81,123,62,0.18)'
                  : 'rgba(81,123,62,0.12)',
                borderColor: isProcessing
                  ? 'rgba(81,123,62,0.50)'
                  : 'rgba(81,123,62,0.30)',
                color: '#517B3E',
                fontWeight: 600,
              }}
            >
              {/* Brain icon — pulsing ring glow while AI is processing */}
              <span
                className={[
                  'text-base leading-none shrink-0 rounded-full transition-all duration-300',
                  isProcessing ? 'animate-brain-ring' : '',
                ].join(' ')}
                style={isProcessing ? { backgroundColor: 'rgba(81,123,62,0.12)' } : undefined}
              >
                🧠
              </span>
              {lang === 'he' ? 'הראש של המרצה' : "Professor's Brain"}

              {/* Processing indicator — three staggered dots */}
              {isProcessing && (
                <span className="ms-auto flex items-center gap-[3px] shrink-0" aria-hidden="true">
                  {[0, 180, 360].map(delay => (
                    <span
                      key={delay}
                      className="w-1 h-1 rounded-full bg-[#517B3E] animate-pulse"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
              )}
            </button>

            <button onClick={() => { router.push('/mastery'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">🎯</span>
              {lang === 'he' ? 'שליטה בחומר' : 'Mastery'}
            </button>

            <button disabled
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#7a9268] text-sm cursor-not-allowed opacity-50">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
              Collaboration
              <span className="ms-auto text-[10px] bg-[#517B3E]/15 text-[#517B3E] px-1.5 py-0.5 rounded-full font-medium">Soon</span>
            </button>
          </div>

          <div className="flex-1" />

          {/* Admin CT — visible only to admin users */}
          {isAdmin && (
            <div className="px-3 py-3 shrink-0 space-y-0.5" style={{ borderTop: '1px solid rgba(100,140,80,0.2)' }}>
              <p className="text-[10px] font-semibold text-[#7a9268] uppercase tracking-widest px-2 mb-2">Admin CT</p>

              <button
                onClick={() => { router.push('/dashboard'); onClose(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === '/dashboard'
                    ? 'border'
                    : 'hover:bg-[#517B3E]/10 text-[#2d3b25]'
                }`}
                style={pathname === '/dashboard'
                  ? { backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 }
                  : undefined}
              >
                <span className="text-base leading-none shrink-0">🖥️</span>
                Platform
              </button>

              <button
                onClick={() => { router.push('/admin'); onClose(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === '/admin'
                    ? 'border'
                    : 'hover:bg-[#517B3E]/10 text-[#7a9268] hover:text-[#2d3b25]'
                }`}
                style={pathname === '/admin'
                  ? { backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 }
                  : undefined}
              >
                <IconShield className="w-4 h-4 shrink-0" />
                Admin
              </button>
            </div>
          )}
        </div>

        {/* Bottom: Logout + User profile */}
        <div className="shrink-0 px-3 pt-2 pb-2.5" style={{ borderTop: '1px solid rgba(100,140,80,0.2)' }}>
          <button
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            onClick={() => { onClose(); onRequestLogout(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[#7a9268] hover:bg-red-50 hover:text-red-500 mb-1"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            <span className="text-sm font-medium">{lang === 'he' ? 'יציאה' : 'Logout'}</span>
          </button>

          <div className="relative">
            {isProfileMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-50">
                <button onClick={() => { setIsProfileMenuOpen(false); router.push('/settings'); onClose(); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-gray-700 text-sm transition-colors">
                  <span aria-hidden="true">⚙️</span>
                  <span>{he ? 'הגדרות חשבון' : 'Account Settings'}</span>
                </button>
                <button onClick={() => { setIsProfileMenuOpen(false); onClose(); onRequestLogout(); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 text-red-600 text-sm transition-colors">
                  <span aria-hidden="true">🚪</span>
                  <span>{he ? 'התנתק' : 'Logout'}</span>
                </button>
              </div>
            )}
            <button
              dir={he ? 'rtl' : 'ltr'}
              onClick={() => setIsProfileMenuOpen(p => !p)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-[#517B3E]/10 active:scale-[0.99] cursor-pointer group"
              style={{ textAlign: 'start' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 select-none transition-transform group-hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #517B3E 0%, #2A3B22 100%)' }}
              >
                <AvatarContent gender={userGender} initials={userInitials} />
              </div>
              <div className="flex-1 min-w-0 text-start">
                <p className="text-sm font-semibold text-[#2d3b25] truncate leading-snug">
                  {userFirstName} {userLastName}
                </p>
                <p className="text-[11px] text-[#7a9268] truncate">{userEmail}</p>
              </div>
              <svg className="w-4 h-4 text-[#7a9268] shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProfessorSimulatorPage() {
  const router   = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang, toggleLanguage } = useLanguage();
  const { selectedCourse, courseHydrated } = useCourse();

  // ── Usage / plan ────────────────────────────────────────────────────────────
  const [usage, setUsage] = useState<UsageData | null>(null);

  const isPro     = usage ? ['pro', 'semester'].includes(usage.plan_type) : false;
  const simsUsed  = usage?.prof_sims_this_month ?? 0;
  const simLimit  = isPro ? null : FREE_SIM_LIMIT;
  const canSim    = simLimit === null || simsUsed < simLimit;
  const fileLimit = isPro ? null : FREE_FILE_LIMIT;

  // ── Professor config ─────────────────────────────────────────────────────────
  const [profName,  setProfName]  = useState('');
  const [examStyle, setExamStyle] = useState('');
  const [topics,    setTopics]    = useState('');

  // Pre-fill topics with selected course name when course changes
  useEffect(() => {
    if (!selectedCourse) return;
    Promise.resolve(selectedCourse.name)
      .then(name => setTopics(prev => prev || name));
  }, [selectedCourse]);

  // ── Files ────────────────────────────────────────────────────────────────────
  const [files,     setFiles]     = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ProfMsg[]>([]);
  const [input,    setInput]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [chatErr,  setChatErr]  = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Upgrade modal ─────────────────────────────────────────────────────────────
  const [upgradeOpen, setUpgradeOpen]   = useState(false);
  const [upgradeMsg,  setUpgradeMsg]    = useState('');

  // ── Header / sidebar / profile state ──────────────────────────────────────
  const [sidebarOpen,        setSidebarOpen]        = useState(false);
  const [showLogoutModal,    setShowLogoutModal]    = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const profilePopoverRef = useRef<HTMLDivElement>(null);

  const [isAdmin] = useState(() => {
    if (typeof window === 'undefined') return false;
    const token = localStorage.getItem('levy_ai_token');
    if (!token) return false;
    const p = decodeJwtPayload(token);
    return p?.is_admin === true;
  });
  const [userEmail]     = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_email')      ?? '') : '');
  const [userFirstName] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_first_name') ?? '') : '');
  const [userLastName]  = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_last_name')  ?? '') : '');
  const [userGender]    = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_gender')     ?? '') : '');

  const userInitials = [userFirstName[0], userLastName[0]].filter(Boolean).join('').toUpperCase()
    || (userEmail ? userEmail.slice(0, 2).toUpperCase() : '?');

  // ── Auth guard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) router.replace('/?login=true');
  }, [authLoading, authUser, router]);

  // ── Course guard — hard redirect if no course is active ──────────────────────
  useEffect(() => {
    if (authLoading || !authUser) return;
    if (!courseHydrated) return;
    if (!selectedCourse) router.replace('/course-picker');
  }, [authLoading, authUser, courseHydrated, selectedCourse, router]);

  // ── Fetch usage ───────────────────────────────────────────────────────────────
  const refreshUsage = useCallback(() => {
    if (!authUser) return;
    authFetch(`${API}/api/usage`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUsage(d); })
      .catch(() => {});
  }, [authUser]);

  useEffect(() => { refreshUsage(); }, [refreshUsage]);

  // ── Profile popover click-outside ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node)) {
        setProfilePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    ['levy_ai_token','levy_ai_email','levy_ai_first_name','levy_ai_last_name',
     'levy_ai_institution','levy_ai_primary_major','levy_ai_degree_type',
     'levy_ai_country','levy_ai_secondary_major','levy_ai_gender',
    ].forEach(k => localStorage.removeItem(k));
    document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
    window.location.href = '/';
  }, []);

  // ── Scroll to bottom ──────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // ── File upload (dropzone) ───────────────────────────────────────────────────
  const canUploadMore = fileLimit === null || files.length < fileLimit;

  const onDrop = useCallback(async (accepted: File[]) => {
    if (accepted.length === 0) return;

    if (!canUploadMore) {
      setUpgradeMsg('הגעת למגבלת 2 קבצים במסלול החינמי. שדרג ל-Pro להעלאה ללא הגבלה!');
      setUpgradeOpen(true);
      return;
    }

    const toUpload = fileLimit !== null
      ? accepted.slice(0, fileLimit - files.length)
      : accepted;

    if (toUpload.length === 0) {
      setUpgradeMsg('הגעת למגבלת 2 קבצים במסלול החינמי. שדרג ל-Pro להעלאה ללא הגבלה!');
      setUpgradeOpen(true);
      return;
    }

    setUploading(true); setUploadErr(null);
    try {
      const form = new FormData();
      toUpload.forEach(f => form.append('files', f));
      const res  = await authFetch(`${API}/upload-pdf`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setUploadErr(data.error ?? 'שגיאה בהעלאת הקבצים'); return; }
      const added: UploadedFile[] = (data.files ?? []).map(
        (f: { source: string; file_id: string; size: number }) => ({
          name: f.source, file_id: f.file_id, size: f.size,
        })
      );
      setFiles(prev => [...prev, ...added]);
    } catch { setUploadErr('לא ניתן להתחבר לשרת'); }
    finally { setUploading(false); }
  }, [canUploadMore, fileLimit, files.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    },
    disabled: uploading || (!isPro && files.length >= FREE_FILE_LIMIT),
  });

  // ── Send / generate ───────────────────────────────────────────────────────────
  const send = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    if (!canSim) {
      setUpgradeMsg('הגעת למגבלת 2 סימולציות בחשבון החינמי. שדרג ל-Pro לסימולציות ללא הגבלה!');
      setUpgradeOpen(true);
      return;
    }

    const userMsg: ProfMsg = { id: `u-${Date.now()}`, role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true); setChatErr(null);

    try {
      const res  = await authFetch(`${API}/api/professor-simulator/ask`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professor_name: profName.trim(),
          exam_style:     examStyle,
          trap_types:     examStyle ? [examStyle] : [],
          topics:         topics.trim(),
          question:       text,
          history:        messages.map(m => ({ role: m.role, content: m.content })),
          file_ids:       files.map(f => f.file_id),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.limit_reached) {
          setUpgradeMsg('הגעת למגבלת 2 סימולציות בחשבון החינמי. שדרג ל-Pro לסימולציות ללא הגבלה!');
          setUpgradeOpen(true);
          setMessages(prev => prev.filter(m => m.id !== userMsg.id));
        } else {
          setChatErr(data.error ?? 'שגיאה ביצירת הסימולציה');
        }
        return;
      }

      setMessages(prev => [...prev, {
        id:      `a-${Date.now()}`,
        role:    'assistant',
        content: data.reply as string,
      }]);
      refreshUsage();
    } catch { setChatErr('לא ניתן להתחבר לשרת. בדוק שהשרת פועל.'); }
    finally { setSending(false); }
  }, [sending, canSim, profName, examStyle, topics, messages, files, refreshUsage]);

  const startSimulation = () => {
    send('צור שאלת בחינה אופיינית אחת (עם ניתוח מלכודת מפורט) על בסיס חומר הלימוד שלי.');
  };

  // ── Derived counters ──────────────────────────────────────────────────────────
  const simsLeft      = simLimit === null ? null : Math.max(0, simLimit - simsUsed);
  const simBarPct     = simLimit ? Math.min(100, (simsUsed / simLimit) * 100) : 0;
  const fileBadge     = fileLimit ? `${files.length} / ${fileLimit}` : `${files.length}`;
  const showSimWarn   = !isPro && simsUsed >= FREE_SIM_LIMIT;

  // ── Shared card style ─────────────────────────────────────────────────────────
  const card = {
    background:    'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(16px)',
    border:        '1px solid rgba(157,192,139,0.35)',
    boxShadow:     '0 4px 24px rgba(60,90,40,0.07)',
    borderRadius:  '1rem',
  } as const;

  const inputStyle = {
    border:     '1px solid rgba(157,192,139,0.4)',
    background: 'rgba(255,255,255,0.80)',
    color:      '#2A3B22',
  } as const;

  const focusGreen = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = '#517B3E';
    e.currentTarget.style.boxShadow   = '0 0 0 3px rgba(81,123,62,0.12)';
  };
  const blurGreen = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = 'rgba(157,192,139,0.4)';
    e.currentTarget.style.boxShadow   = 'none';
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  if (authLoading || !authUser || !courseHydrated || !selectedCourse) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#97AB92' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col" style={{ background: '#97AB92' }}>

      {/* ── Header ── */}
      <header className="shrink-0 relative z-30" style={{
        background: '#8BAF84',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 1px 0 rgba(28,51,41,0.10)',
      }}>
        <div className="max-w-full px-4 py-3 flex items-center justify-between gap-3">

          {/* Start: Hamburger + Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label={lang === 'he' ? 'פתח תפריט' : 'Open menu'}
              className="p-2 rounded-lg hover:bg-[#EEF5F0] transition-colors text-[#1C3329]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <LogoMark size={40} />
          </div>

          {/* End: Course pill + Lang toggle + avatar */}
          <div className="flex items-center gap-2">
            <CoursePill />

            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF5F0] hover:bg-[#E8F0EB] border border-[#D3E0D8] rounded-full text-sm text-[#1C3329] font-semibold transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              {lang === 'he' ? 'EN' : 'HE'}
            </button>

            {/* Profile avatar + dropdown popover */}
            <div ref={profilePopoverRef} className="relative">
              <button
                onClick={() => setProfilePopoverOpen(p => !p)}
                aria-label="Profile menu"
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 transition-all select-none"
                style={{
                  backgroundColor: profilePopoverOpen ? '#D1E6D9' : '#EEF5F0',
                  boxShadow: profilePopoverOpen ? '0 0 0 2px #D1E6D9' : 'none',
                  color: '#1C3329',
                }}
              >
                <AvatarContent gender={userGender} initials={userInitials} />
              </button>

              {profilePopoverOpen && (
                <div
                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                  className="absolute top-full mt-2 z-50 w-64 rounded-2xl overflow-hidden"
                  style={{
                    ...(lang === 'he' ? { left: 0 } : { right: 0 }),
                    background: 'rgba(255,255,255,0.98)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(157,192,139,0.35)',
                    boxShadow: '0 8px 32px rgba(20,40,15,0.20), 0 2px 8px rgba(20,40,15,0.08)',
                  }}
                >
                  <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(157,192,139,0.22)' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 select-none"
                        style={{ backgroundColor: '#2A3B22' }}>
                        <AvatarContent gender={userGender} initials={userInitials} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[#1a2e14] text-sm truncate leading-snug">
                          {userFirstName} {userLastName}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="px-2 py-2 flex flex-col gap-0.5">
                    <button
                      onClick={() => { setProfilePopoverOpen(false); router.push('/profile'); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors"
                      style={{ color: '#2d3b25', textAlign: 'start' }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.09)'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                    >
                      <svg className="w-4 h-4 shrink-0" style={{ color: '#517B3E' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                      {lang === 'he' ? 'הגדרות פרופיל' : 'Profile Settings'}
                    </button>

                    <div style={{ height: 1, background: 'rgba(157,192,139,0.25)', margin: '2px 12px' }} />

                    <button
                      onClick={() => { setProfilePopoverOpen(false); setShowLogoutModal(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors"
                      style={{ color: '#dc2626', textAlign: 'start' }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                      </svg>
                      {lang === 'he' ? 'יציאה' : 'Logout'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <ProfSimSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isAdmin={isAdmin}
        lang={lang}
        userFirstName={userFirstName}
        userLastName={userLastName}
        userEmail={userEmail}
        userGender={userGender}
        userInitials={userInitials}
        onRequestLogout={() => { setSidebarOpen(false); setShowLogoutModal(true); }}
        isProcessing={sending || uploading}
      />

      {/* ── Logout confirmation modal ── */}
      {showLogoutModal && (
        <LogoutConfirmModal
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

      {/* ── Main two-column layout ── */}
      <main className="flex-1 flex flex-col md:flex-row gap-5 max-w-7xl mx-auto w-full p-5 md:p-6 min-h-0">

        {/* ════════════ LEFT COLUMN — Config + Upload ════════════ */}
        <div className="w-full md:w-[38%] flex flex-col gap-4 shrink-0">

          {/* ── Professor config card ── */}
          <div style={card} className="overflow-hidden">
            <div
              className="flex items-center gap-2.5 px-5 py-3.5"
              style={{ borderBottom: '1px solid rgba(157,192,139,0.28)', background: 'linear-gradient(135deg,rgba(81,123,62,0.07),transparent)' }}
            >
              <span className="text-lg select-none">🧠</span>
              <p className="font-bold text-[#2A3B22] text-sm flex-1">פרטי המרצה</p>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3.5">

              {/* Professor name */}
              <div>
                <label className="block text-[10px] font-semibold text-[#7a9268] uppercase tracking-wider mb-1.5">
                  שם המרצה
                </label>
                <input
                  type="text" value={profName} onChange={e => setProfName(e.target.value)}
                  placeholder='לדוגמה: ד"ר כהן' dir="auto"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
                  style={inputStyle} onFocus={focusGreen} onBlur={blurGreen}
                />
              </div>

              {/* Exam style */}
              <div>
                <label className="block text-[10px] font-semibold text-[#7a9268] uppercase tracking-wider mb-1.5">
                  סגנון בחינה
                </label>
                <div className="relative">
                  <select
                    value={examStyle} onChange={e => setExamStyle(e.target.value)}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all appearance-none"
                    style={{ ...inputStyle, color: examStyle ? '#2A3B22' : '#9aaf8a' }}
                    onFocus={focusGreen} onBlur={blurGreen}
                  >
                    <option value="">בחר סגנון...</option>
                    {STYLE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
                    <svg className="w-4 h-4 text-[#9DC08B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* Topics */}
              <div>
                <label className="block text-[10px] font-semibold text-[#7a9268] uppercase tracking-wider mb-1.5">
                  נושאים (אופציונלי)
                </label>
                <input
                  type="text" value={topics} onChange={e => setTopics(e.target.value)}
                  placeholder="לדוגמה: גמישות, אינטגרלים, סדרות" dir="auto"
                  className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all"
                  style={inputStyle} onFocus={focusGreen} onBlur={blurGreen}
                />
              </div>

            </div>
          </div>

          {/* ── File upload card ── */}
          <div style={card} className="overflow-hidden">
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: '1px solid rgba(157,192,139,0.28)' }}
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#517B3E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <p className="font-bold text-[#2A3B22] text-sm">חומר מבחן</p>
              </div>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(81,123,62,0.09)', color: '#517B3E', border: '1px solid rgba(81,123,62,0.2)' }}
              >
                {fileBadge} קבצים{fileLimit && ` / ${fileLimit}`}
              </span>
            </div>

            <div className="px-5 py-4 space-y-3">

              {/* File list */}
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map(f => (
                    <div
                      key={f.file_id}
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                      style={{ background: 'rgba(81,123,62,0.06)', border: '1px solid rgba(81,123,62,0.18)' }}
                    >
                      <svg className="w-4 h-4 text-[#517B3E] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#2d3b25] truncate">{f.name}</p>
                        <p className="text-[10px] text-[#7a9268]">{formatBytes(f.size)}</p>
                      </div>
                      <button
                        onClick={() => setFiles(prev => prev.filter(x => x.file_id !== f.file_id))}
                        className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-100/60 transition-colors shrink-0"
                      >
                        <span className="text-[#7a9268] hover:text-red-500"><TrashIcon /></span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Drop zone */}
              {canUploadMore ? (
                <div
                  {...getRootProps()}
                  className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-6 cursor-pointer transition-all text-center"
                  style={{
                    borderColor:     isDragActive ? '#517B3E' : 'rgba(157,192,139,0.5)',
                    backgroundColor: isDragActive ? 'rgba(81,123,62,0.07)' : 'rgba(255,255,255,0.4)',
                    opacity:         uploading ? 0.6 : 1,
                  }}
                >
                  <input {...getInputProps()} />
                  {uploading ? (
                    <><Spinner /><p className="text-sm text-[#517B3E] font-medium">מעלה...</p></>
                  ) : isDragActive ? (
                    <p className="text-sm font-bold text-[#517B3E]">שחרר כאן!</p>
                  ) : (
                    <>
                      <svg className="w-8 h-8 text-[#9DC08B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      <p className="text-sm font-medium text-[#4a5e3a]">גרור קבצים לכאן</p>
                      <p className="text-xs text-[#9aaf8a]">PDF · PPTX · עד 50 MB</p>
                      {!isPro && (
                        <p className="text-[10px] text-[#b4a890] mt-1">
                          {files.length === 0 ? 'עד 2 קבצים בחשבון החינמי' : `נותר קובץ 1 נוסף`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                /* Limit reached banner */
                <div
                  className="rounded-xl px-4 py-3 text-center"
                  style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)' }}
                >
                  <p className="text-xs font-semibold text-amber-700">הגבלת הקבצים במסלול החינמי</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">שדרג ל-Pro להעלאה ללא הגבלה</p>
                  <button
                    onClick={() => { setUpgradeMsg('שדרג ל-Pro להעלאת קבצים ללא הגבלה!'); setUpgradeOpen(true); }}
                    className="mt-2 text-[11px] font-bold text-white px-3 py-1 rounded-lg transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#517B3E,#2A3B22)' }}
                  >
                    שדרג ל-Pro
                  </button>
                </div>
              )}

              {uploadErr && (
                <p className="text-xs text-red-500 flex items-center gap-1.5">
                  <span>⚠️</span>{uploadErr}
                </p>
              )}
            </div>
          </div>

          {/* ── Usage counter ── */}
          {usage && (
            <div
              style={{ ...card, padding: '1rem 1.25rem' }}
              className="space-y-2"
            >
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-semibold text-[#7a9268] uppercase tracking-wider">
                  סימולציות בחודש זה
                </p>
                <span className={`text-xs font-bold ${showSimWarn ? 'text-amber-600' : 'text-[#517B3E]'}`}>
                  {simLimit === null ? `${simsUsed} ∞` : `${simsUsed} / ${simLimit}`}
                </span>
              </div>
              {simLimit !== null && (
                <div className="h-1.5 rounded-full bg-stone-200 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${simBarPct}%`,
                      background: showSimWarn
                        ? 'linear-gradient(90deg,#f59e0b,#d97706)'
                        : 'linear-gradient(90deg,#517B3E,#6B904A)',
                    }}
                  />
                </div>
              )}
              {showSimWarn && (
                <div className="text-center pt-1">
                  <p className="text-[10px] text-amber-600 font-medium">הגבלת הסימולציות הגיעה</p>
                  <button
                    onClick={() => { setUpgradeMsg('שדרג ל-Pro לסימולציות ללא הגבלה!'); setUpgradeOpen(true); }}
                    className="mt-1.5 text-[11px] font-bold text-white px-3 py-1 rounded-lg hover:opacity-90 transition-all"
                    style={{ background: 'linear-gradient(135deg,#517B3E,#2A3B22)' }}
                  >
                    שדרג ל-Pro
                  </button>
                </div>
              )}
              {simsLeft !== null && simsLeft > 0 && (
                <p className="text-[10px] text-[#9aaf8a] text-center">
                  נותרו {simsLeft} סימולציות החודש
                </p>
              )}
            </div>
          )}

        </div>

        {/* ════════════ RIGHT COLUMN — Chat ════════════ */}
        <div className="flex-1 flex flex-col gap-0 min-h-0 min-h-[520px]">
          <div
            className="flex-1 flex flex-col overflow-hidden"
            style={{ ...card, display: 'flex', flexDirection: 'column' }}
          >
            {/* Chat header */}
            <div
              className="flex items-center gap-3 px-5 py-3.5 shrink-0"
              style={{ borderBottom: '1px solid rgba(157,192,139,0.28)' }}
            >
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base"
                style={{ background: 'linear-gradient(135deg,#9DC08B,#517B3E)' }}>
                🎓
              </span>
              <div>
                <p className="font-semibold text-[#2A3B22] text-sm">
                  {profName.trim() ? `מבחן — ${profName.trim()}` : 'סימולטור מבחן'}
                </p>
                <p className="text-[10px] text-[#7a9268]">
                  {examStyle || 'ללא סגנון נבחר'}{topics ? ` · ${topics}` : ''}
                </p>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">

              {messages.length === 0 && !sending && (
                <div className="flex flex-col items-center justify-center h-full gap-5 py-10 text-center">
                  <div
                    className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
                    style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.15)' }}
                  >
                    🧠
                  </div>
                  <div>
                    <p className="font-semibold text-[#2A3B22] text-base">מוכן לסימולציה</p>
                    <p className="text-sm text-[#7a9268] mt-1">
                      הגדר את פרטי המרצה ולחץ &quot;צור סימולציה&quot; כדי להתחיל
                    </p>
                  </div>
                  {canSim && (
                    <button
                      onClick={startSimulation}
                      disabled={sending}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg,#517B3E,#2A3B22)' }}
                    >
                      <span>🧠</span>
                      <span>צור סימולציה</span>
                    </button>
                  )}
                </div>
              )}

              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={msg.role === 'assistant' ? {
                      background: 'linear-gradient(135deg,rgba(81,123,62,0.10),rgba(81,123,62,0.06))',
                      border:     '1px solid rgba(81,123,62,0.22)',
                      color:      '#1a2e14',
                    } : {
                      background: '#fff',
                      border:     '1px solid rgba(157,192,139,0.35)',
                      color:      '#2d3b25',
                    }}
                  >
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          strong: ({ children }) => <strong className="font-bold text-[#2A3B22]">{children}</strong>,
                          p:      ({ children }) => <p className="mb-2 last:mb-0 leading-7">{children}</p>,
                          ul:     ({ children }) => <ul className="list-disc pe-4 space-y-1 mb-2">{children}</ul>,
                          ol:     ({ children }) => <ol className="list-decimal pe-4 space-y-1 mb-2">{children}</ol>,
                          li:     ({ children }) => <li className="leading-6">{children}</li>,
                          h2:     ({ children }) => <h2 className="font-bold text-base text-[#2A3B22] mt-3 mb-1">{children}</h2>,
                          h3:     ({ children }) => <h3 className="font-semibold text-sm text-[#2A3B22] mt-2 mb-1">{children}</h3>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-end">
                  <div
                    className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm"
                    style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.18)', color: '#517B3E' }}
                  >
                    <Spinner size="sm" />
                    <span>מייצר שאלה...</span>
                  </div>
                </div>
              )}

              {chatErr && (
                <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/25 text-red-400 rounded-xl px-4 py-3 text-xs">
                  <span>⚠️</span>{chatErr}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* ── Input bar ── */}
            <div
              className="shrink-0 px-4 py-3"
              style={{ borderTop: '1px solid rgba(157,192,139,0.28)' }}
            >
              {/* Generate button (shown when chat is empty) */}
              {messages.length === 0 && !sending && (
                <button
                  onClick={startSimulation}
                  disabled={sending || showSimWarn}
                  className="w-full py-3 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: showSimWarn ? 'rgba(157,192,139,0.4)' : 'linear-gradient(135deg,#517B3E,#2A3B22)' }}
                >
                  {sending
                    ? <><Spinner size="sm" /><span>מייצר...</span></>
                    : <><span>🧠</span><span>צור סימולציית מבחן</span></>
                  }
                </button>
              )}

              {/* Follow-up input (shown when conversation started) */}
              {messages.length > 0 && (
                <div className="flex gap-2">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                    placeholder="כתוב תשובה או שאל שאלה המשך..."
                    dir="auto"
                    rows={2}
                    disabled={sending || showSimWarn}
                    className="flex-1 rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all resize-none disabled:opacity-50"
                    style={{ ...inputStyle, maxHeight: '80px' }}
                    onFocus={focusGreen} onBlur={blurGreen}
                  />
                  <button
                    onClick={() => send(input)}
                    disabled={!input.trim() || sending || showSimWarn}
                    className="px-4 rounded-xl text-white font-bold transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed self-end"
                    style={{ background: '#517B3E', paddingTop: '0.6rem', paddingBottom: '0.6rem' }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Limit reached inline prompt */}
              {showSimWarn && (
                <div
                  className="mt-2 flex items-center justify-between rounded-xl px-4 py-2.5"
                  style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
                >
                  <p className="text-xs text-amber-700">
                    הגעת למגבלת הסימולציות החינמיות (2/2)
                  </p>
                  <button
                    onClick={() => { setUpgradeMsg('שדרג ל-Pro לסימולציות ללא הגבלה!'); setUpgradeOpen(true); }}
                    className="text-xs font-bold text-white px-3 py-1 rounded-lg hover:opacity-90 transition-all"
                    style={{ background: 'linear-gradient(135deg,#517B3E,#2A3B22)' }}
                  >
                    שדרג ל-Pro
                  </button>
                </div>
              )}

              <p className="text-center text-[10px] text-[#9aaf8a] mt-2">
                {files.length > 0
                  ? `🧠 הסימולציה מבוססת על ${files.length} קבצ${files.length === 1 ? '' : 'ים'} שהעלית`
                  : 'ניתן לייצר שאלות גם ללא קבצים — הוסף מסמכים לשאלות מדויקות יותר'}
              </p>
            </div>
          </div>
        </div>

      </main>

      {/* ── Upgrade modal ── */}
      {upgradeOpen && (
        <>
          {/* Reason banner above modal */}
          <div
            className="fixed top-0 inset-x-0 z-[61] flex justify-center pointer-events-none"
            style={{ paddingTop: '1.5rem' }}
          >
            <div
              className="pointer-events-auto px-5 py-3 rounded-2xl text-sm font-medium text-center max-w-md"
              style={{ background: 'rgba(42,59,34,0.92)', color: '#D9EBD0', backdropFilter: 'blur(12px)' }}
            >
              {upgradeMsg}
            </div>
          </div>
          <UpgradeModal lang="he" onClose={() => setUpgradeOpen(false)} />
        </>
      )}

    </div>
  );
}
