'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Settings as IconSettings } from 'lucide-react';
import { useAuth }     from '../providers/auth';
import { useLanguage } from '../providers/language';
import { useCourse }   from '../providers/course';
import CoursePill      from '../../components/CoursePill';
import SlideViewer, { type DeckSlide } from '../../components/SlideViewer';

const API = 'http://127.0.0.1:5003';

/* ── Auth / fetch helpers ─────────────────────────────────────────────────── */
function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('levy_ai_token') : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
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

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    console.error(
      `[presentation-generator] Expected JSON but got "${ct || 'unknown content-type'}" (HTTP ${res.status}). Raw response:`,
      text.slice(0, 1000),
    );
    throw new Error(`Unexpected ${res.status} response (not JSON) — see console for the raw body`);
  }
  return res.json();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── Shared micro-components ─────────────────────────────────────────────── */
function LogoMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.PNG" alt="U-Note" style={{ height: size, width: 'auto', objectFit: 'contain' }} />
  );
}

function Spinner({ large = false }: { large?: boolean }) {
  const cls = large
    ? 'w-10 h-10 border-4 border-[#9DC08B]/30 border-t-[#517B3E]'
    : 'w-5 h-5 border-2 border-[#9DC08B]/30 border-t-[#517B3E]';
  return <span className={`inline-block rounded-full animate-spin ${cls}`} />;
}

function AvatarContent({ gender, initials }: { gender: string; initials: string }) {
  if (gender === 'זכר') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" style={{ width: '62%', height: '62%' }}>
        <circle cx="9.5" cy="13" r="5.8" />
        <line x1="14" y1="8.5" x2="20" y2="3" />
        <polyline points="15.5 3 20 3 20 7.5" />
      </svg>
    );
  }
  if (gender === 'נקבה') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" style={{ width: '62%', height: '62%' }}>
        <circle cx="12" cy="8.5" r="5.8" />
        <line x1="12" y1="14.3" x2="12" y2="20.5" />
        <line x1="9" y1="17.5" x2="15" y2="17.5" />
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
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
            style={{ background: '#dc2626' }}>
            כן, צא
          </button>
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: 'rgba(81,123,62,0.1)', color: '#517B3E', border: '1px solid rgba(81,123,62,0.2)' }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'mpeg', 'webm'].includes(ext)) return <span className="text-lg leading-none">🎞️</span>;
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac', 'mpga'].includes(ext)) return <span className="text-lg leading-none">🎙️</span>;
  if (['png', 'jpg', 'jpeg'].includes(ext)) return <span className="text-lg leading-none">🖼️</span>;
  if (ext === 'pptx') return <span className="text-lg leading-none">📊</span>;
  if (ext === 'docx') return <span className="text-lg leading-none">📃</span>;
  return <span className="text-lg leading-none">📄</span>;
}

interface PendingFile {
  id:   string;
  file: File;
}

interface SourceResult {
  filename: string;
  type:     'document' | 'image' | 'media' | 'unsupported';
  chars:    number;
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
interface SidebarProps {
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
}

function Sidebar({
  isOpen, onClose, isAdmin, lang,
  userFirstName, userLastName, userEmail, userGender, userInitials,
  onRequestLogout,
}: SidebarProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const he = lang === 'he';
  const { selectedCourse, setSelectedCourse } = useCourse();
  const translateClass = isOpen ? 'translate-x-0' : he ? 'translate-x-full' : '-translate-x-full';
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
          backgroundColor: '#EEF5EB',
          backdropFilter: 'blur(20px)',
          borderInlineEnd: '1px solid #BCCAB5',
          boxShadow: '4px 0 28px rgba(20,42,16,0.14)',
        }}
      >
        {/* Logo header */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0"
          style={{ borderBottom: '1px solid #BCCAB5' }}>
          <LogoMark size={36} />
          <button onClick={onClose} aria-label={he ? 'סגור תפריט' : 'Close menu'}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors shrink-0">
            <svg className="w-4 h-4 text-[#4a5e3a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 py-3 shrink-0" style={{ borderBottom: '1px solid #BCCAB5' }}>
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

        {/* Nav */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-3 py-3 space-y-1 shrink-0"
            style={{ borderBottom: '1px solid #BCCAB5' }}>
            <p className="text-[10px] font-semibold text-[#7a9268] uppercase tracking-widest px-2 mb-2">Navigation</p>

            <button onClick={() => { router.push('/dashboard'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">🏠</span>
              {he ? 'בית' : 'Home'}
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

            <button onClick={() => { router.push('/presentation-generator'); onClose(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${pathname.startsWith('/presentation') ? 'border' : 'hover:bg-[#517B3E]/10 text-[#2d3b25]'}`}
              style={pathname.startsWith('/presentation') ? { backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 } : undefined}>
              <span className="text-base leading-none shrink-0">🎬</span>
              {he ? 'יצירת מצגת' : 'Create Presentation'}
            </button>

            <button onClick={() => { router.push('/workspace/professor-simulator'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">🧠</span>
              {he ? 'הראש של המרצה' : "Professor's Brain"}
            </button>

            <button onClick={() => { router.push('/mastery'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <span className="text-base leading-none shrink-0">🎯</span>
              {he ? 'שליטה בחומר' : 'Mastery'}
            </button>

            <button onClick={() => { router.push('/settings'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <IconSettings className="w-4 h-4 shrink-0" />
              {he ? 'הגדרות' : 'Settings'}
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

          {/* Admin CT */}
          {isAdmin && (
            <div className="px-3 py-3 shrink-0 space-y-0.5"
              style={{ borderTop: '1px solid rgba(100,140,80,0.2)' }}>
              <p className="text-[10px] font-semibold text-[#7a9268] uppercase tracking-widest px-2 mb-2">Admin CT</p>
              <button onClick={() => { router.push('/dashboard'); onClose(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/dashboard' ? 'border' : 'hover:bg-[#517B3E]/10 text-[#2d3b25]'}`}
                style={pathname === '/dashboard' ? { backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 } : undefined}>
                <span className="text-base leading-none shrink-0">🖥️</span>
                Platform
              </button>
              <button onClick={() => { router.push('/admin'); onClose(); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${pathname === '/admin' ? 'border' : 'hover:bg-[#517B3E]/10 text-[#7a9268] hover:text-[#2d3b25]'}`}
                style={pathname === '/admin' ? { backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 } : undefined}>
                <IconShield className="w-4 h-4 shrink-0" />
                Admin
              </button>
            </div>
          )}
        </div>

        {/* Bottom: Logout + profile */}
        <div className="shrink-0 px-3 pt-2 pb-2.5"
          style={{ borderTop: '1px solid rgba(100,140,80,0.2)' }}>
          <button
            dir={he ? 'rtl' : 'ltr'}
            onClick={() => { onClose(); onRequestLogout(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[#7a9268] hover:bg-red-50 hover:text-red-500 mb-1"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            <span className="text-sm font-medium">{he ? 'יציאה' : 'Logout'}</span>
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
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 select-none"
                style={{ background: 'linear-gradient(135deg, #517B3E 0%, #2A3B22 100%)' }}
              >
                <AvatarContent gender={userGender} initials={userInitials} />
              </div>
              <div className="flex-1 min-w-0 text-start">
                <p className="text-sm font-semibold text-[#2d3b25] truncate leading-snug">{userFirstName} {userLastName}</p>
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

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function PresentationGeneratorPage() {
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang, toggleLanguage } = useLanguage();
  const he = lang === 'he';

  // ── Shell state ────────────────────────────────────────────────────────────
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

  const [topic,     setTopic]     = useState('');
  const [pending,   setPending]   = useState<PendingFile[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [slides,    setSlides]    = useState<DeckSlide[] | null>(null);
  const [sources,   setSources]   = useState<SourceResult[]>([]);

  const onDrop = useCallback((accepted: File[]) => {
    setError(null);
    setPending(prev => [
      ...prev,
      ...accepted.map(file => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`, file })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: loading,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/png':  ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'video/mp4':  ['.mp4'],
      'video/webm': ['.webm'],
      'video/mpeg': ['.mpeg'],
      'audio/mpeg': ['.mp3', '.mpga'],
      'audio/mp4':  ['.m4a'],
      'audio/wav':  ['.wav'],
      'audio/ogg':  ['.ogg'],
      'audio/flac': ['.flac'],
    },
  });

  const removeFile = useCallback((id: string) => {
    setPending(prev => prev.filter(p => p.id !== id));
  }, []);

  const totalSize = useMemo(() => pending.reduce((sum, p) => sum + p.file.size, 0), [pending]);

  const generate = useCallback(async () => {
    if (pending.length === 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      if (topic.trim()) form.append('topic', topic.trim());
      pending.forEach(p => form.append('files', p.file));

      const res = await authFetch(`${API}/api/generate-presentation`, {
        method: 'POST',
        body:   form,
      });
      const data = await safeJson(res);
      if (!res.ok) {
        setError((data.error as string) ?? (he ? 'שגיאה ביצירת המצגת' : 'Failed to generate the presentation'));
        return;
      }
      setSlides(data.slides as DeckSlide[]);
      setSources((data.sources ?? []) as SourceResult[]);
    } catch (err) {
      console.error('[presentation-generator] generate-presentation failed:', err);
      setError(he ? 'לא ניתן להתחבר לשרת' : 'Could not connect to the server');
    } finally {
      setLoading(false);
    }
  }, [pending, topic, loading, he]);

  const reset = useCallback(() => {
    setSlides(null);
    setSources([]);
    setPending([]);
    setTopic('');
    setError(null);
  }, []);

  // ── Click-outside profile popover ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node))
        setProfilePopoverOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Esc key ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setProfilePopoverOpen(false);
        setShowLogoutModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    ['levy_ai_token','levy_ai_email','levy_ai_first_name','levy_ai_last_name',
     'levy_ai_institution','levy_ai_primary_major','levy_ai_degree_type',
     'levy_ai_country','levy_ai_secondary_major','levy_ai_gender',
    ].forEach(k => localStorage.removeItem(k));
    document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
    window.location.href = '/';
  }, []);

  if (authLoading || !authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#97AB92' }}>
        <Spinner large />
      </div>
    );
  }

  return (
    <div dir={he ? 'rtl' : 'ltr'} className="h-screen flex flex-col overflow-hidden" style={{ background: '#97AB92' }}>

      {/* ── Sidebar ── */}
      <Sidebar
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
      />

      {/* ── Logout modal ── */}
      {showLogoutModal && (
        <LogoutConfirmModal
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

      {/* ── Header ── */}
      <header className="shrink-0 relative z-30" style={{
        background: '#8BAF84',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 1px 0 rgba(28,51,41,0.10)',
      }}>
        <div className="max-w-full px-4 py-3 flex items-center justify-between gap-3">

          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label={he ? 'פתח תפריט' : 'Open menu'}
              className="p-2 rounded-lg hover:bg-[#EEF5F0] transition-colors text-[#1C3329] shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <LogoMark size={32} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <CoursePill />
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF5F0] hover:bg-[#E8F0EB] border border-[#D3E0D8] rounded-full text-sm text-[#1C3329] font-semibold transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
              {he ? 'EN' : 'HE'}
            </button>

            <div ref={profilePopoverRef} className="relative">
              <button
                onClick={() => setProfilePopoverOpen(p => !p)}
                aria-label="Profile menu"
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all select-none"
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
                  dir={he ? 'rtl' : 'ltr'}
                  className="absolute top-full mt-2 z-50 w-64 rounded-2xl overflow-hidden"
                  style={{
                    insetInlineEnd: 0,
                    background: 'rgba(255,255,255,0.98)',
                    border: '1px solid rgba(157,192,139,0.3)',
                    boxShadow: '0 16px 48px rgba(20,40,15,0.18)',
                  }}
                >
                  <div className="px-4 py-4" style={{ borderBottom: '1px solid #e8f0e0' }}>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 select-none"
                        style={{ background: 'linear-gradient(135deg, #517B3E 0%, #2A3B22 100%)' }}
                      >
                        <AvatarContent gender={userGender} initials={userInitials} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1a2e14] truncate">{userFirstName} {userLastName}</p>
                        <p className="text-xs text-[#7a9268] truncate">{userEmail}</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-2 py-2">
                    <button
                      onClick={() => { setProfilePopoverOpen(false); setShowLogoutModal(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors text-[#7a9268] hover:bg-red-50 hover:text-red-500"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                      </svg>
                      {he ? 'יציאה' : 'Logout'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6">

          {!slides && (
            <>
              {/* Intro */}
              <div className="flex flex-col items-center text-center gap-2 py-2">
                <span className="text-4xl">🤖</span>
                <h2 className="text-xl font-bold" style={{ color: '#1C3329' }}>
                  {he ? 'סוכן AI ליצירת מצגות' : 'AI Presentation Agent'}
                </h2>
                <p className="text-sm max-w-lg" style={{ color: '#527061' }}>
                  {he
                    ? 'העלה מסמכים, תמונות, הקלטות שמע או וידאו — והבינה המלאכותית תבנה עבורך מצגת מקצועית בת 10 שקופיות'
                    : 'Upload documents, images, audio or video — and the AI will build a professional 10-slide deck for you'}
                </p>
              </div>

              {/* Topic input */}
              <div
                className="rounded-2xl p-5"
                style={{
                  background: 'rgba(255,255,255,0.82)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(157,192,139,0.35)',
                  boxShadow: '0 4px 24px rgba(60,90,40,0.07)',
                  borderRadius: '1rem',
                }}
              >
                <label className="block text-xs font-bold mb-2" style={{ color: '#2A3B22' }}>
                  {he ? 'נושא המצגת (אופציונלי)' : 'Presentation topic (optional)'}
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  disabled={loading}
                  placeholder={he ? 'לדוגמה: סיכום הרצאה 4 — תרמודינמיקה' : 'e.g. Lecture 4 summary — Thermodynamics'}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all disabled:opacity-60"
                  style={{ border: '1px solid rgba(157,192,139,0.4)', background: 'rgba(255,255,255,0.80)', color: '#2A3B22' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#517B3E'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(81,123,62,0.12)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(157,192,139,0.4)'; e.currentTarget.style.boxShadow = 'none'; }}
                />

                {/* Drop zone */}
                <div
                  {...getRootProps()}
                  className="mt-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 py-10 cursor-pointer transition-all text-center"
                  style={{
                    borderColor:     isDragActive ? '#517B3E' : 'rgba(157,192,139,0.5)',
                    backgroundColor: isDragActive ? 'rgba(81,123,62,0.07)' : 'rgba(255,255,255,0.4)',
                    opacity:         loading ? 0.6 : 1,
                  }}
                >
                  <input {...getInputProps()} />
                  {isDragActive ? (
                    <p className="text-sm font-bold" style={{ color: '#517B3E' }}>
                      {he ? 'שחרר כאן!' : 'Drop here!'}
                    </p>
                  ) : (
                    <>
                      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="#9DC08B" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      <p className="text-sm font-medium" style={{ color: '#4a5e3a' }}>
                        {he ? 'גרור קבצים לכאן או לחץ לבחירה' : 'Drag files here or click to browse'}
                      </p>
                      <p className="text-xs" style={{ color: '#9aaf8a' }}>
                        {he ? 'PDF · PPTX · DOCX · תמונות · אודיו · וידאו' : 'PDF · PPTX · DOCX · Images · Audio · Video'}
                      </p>
                    </>
                  )}
                </div>

                {/* File list */}
                {pending.length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    {pending.map(p => (
                      <div key={p.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(157,192,139,0.3)' }}>
                        <FileTypeIcon name={p.file.name} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: '#2A3B22' }}>{p.file.name}</p>
                          <p className="text-[10px]" style={{ color: '#7a9268' }}>{formatBytes(p.file.size)}</p>
                        </div>
                        <button
                          onClick={() => removeFile(p.id)}
                          disabled={loading}
                          aria-label={he ? 'הסר קובץ' : 'Remove file'}
                          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-100/60 transition-colors shrink-0 disabled:opacity-40"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="#7a9268" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <p className="text-[11px] text-end" style={{ color: '#7a9268' }}>
                      {pending.length} {he ? 'קבצים' : 'files'} · {formatBytes(totalSize)}
                    </p>
                  </div>
                )}

                {/* Generate button */}
                <button
                  onClick={generate}
                  disabled={pending.length === 0 || loading}
                  className="mt-4 w-full px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: '#517B3E' }}
                >
                  {loading ? <Spinner /> : null}
                  {loading
                    ? (he ? 'הסוכן מעבד את החומרים...' : 'The agent is processing your materials...')
                    : (he ? 'צור מצגת' : 'Create Presentation')}
                </button>

                {loading && (
                  <p className="mt-2 text-xs text-center" style={{ color: '#7a9268' }}>
                    {he
                      ? 'מחלץ טקסט, מנתח תמונות, מתמלל מדיה ובונה מצגת — זה עשוי לקחת עד דקה'
                      : 'Extracting text, analyzing images, transcribing media and building your deck — this may take up to a minute'}
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', color: '#b91c1c' }}>
                  {error}
                </div>
              )}
            </>
          )}

          {/* Slide viewer */}
          {slides && slides.length > 0 && (
            <div className="flex flex-col gap-4">
              <SlideViewer slides={slides} lang={lang} />

              {/* Sources summary */}
              {sources.length > 0 && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(157,192,139,0.3)' }}>
                  <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: '#7a9268' }}>
                    {he ? 'קבצים שעובדו' : 'Processed files'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sources.map((s, i) => (
                      <span key={i}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                        style={{
                          background: s.type === 'unsupported' ? 'rgba(220,38,38,0.08)' : 'rgba(81,123,62,0.08)',
                          color:      s.type === 'unsupported' ? '#b91c1c' : '#2A3B22',
                        }}>
                        <FileTypeIcon name={s.filename} />
                        {s.filename}
                        {s.type === 'unsupported' && (he ? ' (לא נתמך)' : ' (unsupported)')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={reset}
                className="self-center px-6 py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: '#EEF5F0', color: '#1C3329', border: '1px solid #D3E0D8' }}
              >
                {he ? 'מצגת חדשה' : 'New Presentation'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
