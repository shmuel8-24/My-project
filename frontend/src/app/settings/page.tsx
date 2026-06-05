'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../providers/auth';
import { useLanguage } from '../providers/language';
import Skeleton from '../../components/ui/Skeleton';

const API = 'http://127.0.0.1:5003';

/* ── Design tokens ────────────────────────────────────────────────────────── */
const D = {
  pageBg:      '#97AB92',
  headerBg:    'rgba(200,214,196,0.95)',
  panelBg:     'rgba(255,255,255,0.90)',
  panelBorder: '1px solid #E8F0EB',
  panelRadius:  24,
  panelShadow: '0 4px 24px rgba(28,51,41,0.06)',
  rowBg:       'rgba(255,255,255,0.94)',
  textPrimary: '#1C3329',
  textSec:     '#527061',
  textLabel:   '#7B9E8F',
  activeBg:    '#D1E6D9',
  activeColor: '#183025',
  toggleOn:    '#4ADE80',
  toggleOff:   '#D3E0D8',
};

/* ── i18n ─────────────────────────────────────────────────────────────────── */
const i18n = {
  he: {
    title:            'הגדרות',
    back:             'חזרה ל-Dashboard',
    tabKnowledge:     'חומרי למידה',
    tabPreferences:   'הגדרות מערכת',
    tabAccount:       'החשבון שלי',
    knowledgeTitle:   'ספריית הידע שלך',
    files:            'קבצים',
    totalLabel:       'סה״כ',
    noDocuments:      'אין מסמכים עדיין',
    noDocsDesc:       'העלה קבצים בדף מרחב הלמידה כדי להתחיל',
    goWorkspace:      'מרחב הלמידה',
    addFile:          '+ הוסף קובץ',
    ready:            'מוכן בזיכרון',
    chunks:           'קטעים',
    uploaded:         'הועלה',
    clickToDelete:    'לחץ שוב למחיקה',
    prefsTitle:       'הגדרות ממשק',
    autoSave:         'שינויים נשמרים אוטומטית',
    prefAnimsLabel:   'אנימציות',
    prefAnimsDesc:    'אפקטים ואנימציות ממשק משתמש',
    prefAudioLabel:   'אפקטים קוליים',
    prefAudioDesc:    'צלילי אינטראקציה ואפקטים',
    prefFocusLabel:   'מצב פוקוס אוטומטי',
    prefFocusDesc:    'מסתיר הסחות דעת בזמן לימוד',
    prefMascotLabel:  'מסקוט שארלי',
    prefMascotDesc:   'האינדיקטור הצדדי המלווה',
    langSection:      'שפה ותצוגה',
    langLabel:        'שפת הממשק',
    langCurrent:      'עברית',
    langSwitch:       'EN',
    accountTitle:     'פרטי החשבון',
    planBasic:        'Basic',
    planPro:          'Pro',
    planSemester:     'Semester',
    uploadsLabel:     'העלאות החודש',
    questionsLabel:   'שאלות החודש',
    unlimited:        'ללא הגבלה',
    documents:        'מסמכים',
    sessions:         'שיחות',
    messages:         'הודעות',
    openProfile:      'פתח פרופיל מלא',
    logout:           'יציאה',
    logoutTitle:      'יציאה מהמערכת',
    logoutDesc:       'האם אתה בטוח שברצונך להתנתק?',
    logoutYes:        'כן, צא',
    logoutNo:         'ביטול',
    loading:          'טוען...',
    navigation:       'ניווט',
    dashboard:        'בית',
    studylab:         'מרחב לימוד',
    academic:         'כתיבה אקדמית',
    profSim:          'הראש של המרצה',
    mastery:          'שליטה בחומר',
    settings:         'הגדרות',
    prefHistoryLabel:    'שמירת היסטוריית שיחות',
    prefHistoryDesc:     'שמור את השיחות עם ה-AI כדי לחזור אליהן מאוחר יותר.',
    prefWritingLabel:    'סגנון כתיבה אישי כברירת מחדל',
    prefWritingDesc:     'החל תמיד את סגנון הכתיבה האישי שלך בעבודות אקדמיות.',
    prefNotifsLabel:     'התראות בזמן לימוד',
    prefNotifsDesc:      'קבל התראות חכמות בזמן קריאת חומרי לימוד.',
  },
  en: {
    title:            'Settings',
    back:             'Back to Dashboard',
    tabKnowledge:     'Knowledge Base',
    tabPreferences:   'System Settings',
    tabAccount:       'My Account',
    knowledgeTitle:   'Your Knowledge Library',
    files:            'files',
    totalLabel:       'total',
    noDocuments:      'No documents yet',
    noDocsDesc:       'Upload files in the StudyLab to get started',
    goWorkspace:      'StudyLab',
    addFile:          '+ Add file',
    ready:            'Ready in memory',
    chunks:           'chunks',
    uploaded:         'Uploaded',
    clickToDelete:    'Click again to confirm',
    prefsTitle:       'Interface Preferences',
    autoSave:         'Changes are saved automatically',
    prefAnimsLabel:   'Animations',
    prefAnimsDesc:    'Interface effects and animations',
    prefAudioLabel:   'Sound Effects',
    prefAudioDesc:    'Interaction sounds and audio cues',
    prefFocusLabel:   'Auto Focus Mode',
    prefFocusDesc:    'Hides distractions during study',
    prefMascotLabel:  'Charley Mascot',
    prefMascotDesc:   'Sidebar companion indicator',
    langSection:      'Language & Display',
    langLabel:        'Interface Language',
    langCurrent:      'English',
    langSwitch:       'HE',
    accountTitle:     'Account Details',
    planBasic:        'Basic',
    planPro:          'Pro',
    planSemester:     'Semester',
    uploadsLabel:     'Uploads this month',
    questionsLabel:   'Questions this month',
    unlimited:        'Unlimited',
    documents:        'Documents',
    sessions:         'Chats',
    messages:         'Messages',
    openProfile:      'Open Full Profile',
    logout:           'Log out',
    logoutTitle:      'Log out',
    logoutDesc:       'Are you sure you want to log out?',
    logoutYes:        'Yes, log out',
    logoutNo:         'Cancel',
    loading:          'Loading…',
    navigation:       'Navigation',
    dashboard:        'Home',
    studylab:         'StudyLab',
    academic:         'Academic Writing',
    profSim:          "Professor's Brain",
    mastery:          'Mastery',
    settings:         'Settings',
    prefHistoryLabel:    'Save Chat History',
    prefHistoryDesc:     'Keep your AI conversations so you can return to them later.',
    prefWritingLabel:    'Personal Writing Style as Default',
    prefWritingDesc:     'Always apply your personal writing style in academic papers.',
    prefNotifsLabel:     'Study Notifications',
    prefNotifsDesc:      'Receive smart notifications while reading study materials.',
  },
} as const;

/* ── Types ────────────────────────────────────────────────────────────────── */
type Tab  = 'knowledge' | 'preferences' | 'account';
type Lang = 'he' | 'en';

interface ProfileDoc {
  file_id:         string;
  filename:        string;
  uploaded_at:     string | null;
  file_size_bytes: number | null;
  chunks:          number;
}
interface UsageData {
  plan_type:             string;
  subscription_end_date: string | null;
  uploads_this_month:    number;
  upload_limit:          number | null;
  questions_this_month:  number;
  question_limit:        number | null;
}
interface StatsData {
  documents: number;
  sessions:  number;
  messages:  number;
}
interface Prefs {
  audio:                boolean;
  focus:                boolean;
  animations:           boolean;
  mascot:               boolean;
  saveChatHistory:      boolean;
  personalWritingStyle: boolean;
  studyNotifications:   boolean;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('levy_ai_token') : null;
}
function authFetch(url: string, init: RequestInit = {}) {
  const token = getToken();
  return fetch(url, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string>) ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
function formatDate(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return '—'; }
}
function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024)              return `${bytes} B`;
  if (bytes < 1024 * 1024)       return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function getFileInfo(filename: string): {
  tag: string; tagColor: string; tagBg: string; iconColor: string;
} {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf')                                    return { tag: 'PDF', tagColor: '#dc2626', tagBg: '#fef2f2', iconColor: '#dc2626' };
  if (['pptx', 'ppt'].includes(ext))                   return { tag: 'PPT', tagColor: '#ea580c', tagBg: '#fff7ed', iconColor: '#ea580c' };
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return { tag: 'IMG', tagColor: '#2563eb', tagBg: '#eff6ff', iconColor: '#2563eb' };
  return { tag: 'DOC', tagColor: '#6b7280', tagBg: '#f9fafb', iconColor: '#6b7280' };
}

/* ── Small components ─────────────────────────────────────────────────────── */
function LogoMark({ size = 34 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.PNG" alt="U-Note" style={{ height: size, width: 'auto', objectFit: 'contain' }} />;
}
function SpinnerRing({ className }: { className?: string }) {
  return (
    <span className={`inline-block rounded-full border-2 animate-spin ${className ?? 'w-5 h-5 border-[#D1E6D9] border-t-[#517B3E]'}`} />
  );
}
function AvatarContent({ gender, initials }: { gender: string; initials: string }) {
  if (gender === 'זכר') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '62%', height: '62%' }}>
      <circle cx="9.5" cy="13" r="5.8" /><line x1="14" y1="8.5" x2="20" y2="3" /><polyline points="15.5 3 20 3 20 7.5" />
    </svg>
  );
  if (gender === 'נקבה') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width: '62%', height: '62%' }}>
      <circle cx="12" cy="8.5" r="5.8" /><line x1="12" y1="14.3" x2="12" y2="20.5" /><line x1="9" y1="17.5" x2="15" y2="17.5" />
    </svg>
  );
  return <>{initials || '?'}</>;
}
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  const { lang } = useLanguage();
  /* In RTL the flex container places the thumb at visual-right (inline-start),
     so the offsets must be negated to move toward inline-end (visual-left). */
  const thumbOffset = lang === 'he'
    ? (checked ? '-22px' : '-3px')
    : (checked ?  '22px' :  '3px');
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4ADE80] focus-visible:ring-offset-2"
      style={{ background: checked ? D.toggleOn : D.toggleOff }}
    >
      <span
        className="pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: `translateX(${thumbOffset})` }}
      />
    </button>
  );
}
function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}
function FileIcon({ color }: { color: string }) {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}

/* ── Document Row ──────────────────────────────────────────────────────────── */
function DocumentRow({
  doc, he, lang, index, isDeleting, isConfirming, onDeleteRequest,
}: {
  doc: ProfileDoc; he: boolean; lang: Lang; index: number;
  isDeleting: boolean; isConfirming: boolean;
  onDeleteRequest: (id: string) => void;
}) {
  const T    = he ? i18n.he : i18n.en;
  const info = getFileInfo(doc.filename);

  return (
    <div
      className="group relative flex items-center gap-4 px-5 py-4 animate-fade-in-up"
      style={{
        background:           isDeleting ? 'rgba(239,68,68,0.04)' : D.rowBg,
        backdropFilter:       'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius:         16,
        border:               `1px solid ${isConfirming ? 'rgba(239,68,68,0.35)' : '#E8F0EB'}`,
        boxShadow:            '0 2px 8px rgba(28,51,41,0.04)',
        transition:           'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.2s ease',
        animationDelay:       `${index * 55}ms`,
        animationFillMode:    'both',
        opacity:              isDeleting ? 0.6 : 1,
      }}
      onMouseEnter={e => {
        if (!isDeleting) {
          e.currentTarget.style.transform  = 'translateY(-1px)';
          e.currentTarget.style.boxShadow  = '0 6px 22px rgba(28,51,41,0.09)';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(28,51,41,0.04)';
      }}
    >
      {/* File type icon */}
      <div
        className="shrink-0 flex items-center justify-center rounded-2xl"
        style={{ width: 48, height: 48, background: info.tagBg, border: `1px solid ${info.tagColor}22` }}
      >
        <FileIcon color={info.iconColor} />
      </div>

      {/* Name + metadata */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: D.textPrimary }} title={doc.filename}>
          {doc.filename}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span
            className="inline-flex items-center px-1.5 py-[1px] rounded text-[10px] font-bold uppercase tracking-wide"
            style={{ background: info.tagBg, color: info.tagColor, border: `1px solid ${info.tagColor}28` }}
          >
            {info.tag}
          </span>
          {doc.uploaded_at && (
            <span className="text-[11px]" style={{ color: D.textLabel }}>
              {T.uploaded} {formatDate(doc.uploaded_at, lang)}
            </span>
          )}
          <span className="text-[11px]" style={{ color: D.textLabel }}>·</span>
          <span className="text-[11px]" style={{ color: D.textLabel }}>
            {doc.chunks} {T.chunks}
          </span>
          {!!doc.file_size_bytes && doc.file_size_bytes > 0 && (
            <>
              <span className="text-[11px]" style={{ color: D.textLabel }}>·</span>
              <span className="text-[11px]" style={{ color: D.textLabel }}>{formatBytes(doc.file_size_bytes)}</span>
            </>
          )}
        </div>
      </div>

      {/* Right side — status / confirm label / spinner */}
      <div className="shrink-0 flex items-center gap-2">
        {isDeleting && <SpinnerRing className="w-4 h-4 border-[#ef4444]/25 border-t-[#ef4444]" />}

        {!isDeleting && !isConfirming && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold opacity-100 group-hover:opacity-0 transition-opacity duration-150"
            style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] inline-block" />
            {T.ready}
          </span>
        )}

        {isConfirming && !isDeleting && (
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}
          >
            {T.clickToDelete}
          </span>
        )}

        {/* Delete button */}
        {!isDeleting && (
          <button
            type="button"
            onClick={() => onDeleteRequest(doc.file_id)}
            className={[
              'p-2 rounded-xl transition-all duration-150 cursor-pointer',
              isConfirming
                ? 'opacity-100 text-red-400 bg-red-50 hover:bg-red-100'
                : 'opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-400',
            ].join(' ')}
            style={{ color: isConfirming ? '#ef4444' : D.textSec }}
            aria-label={he ? 'מחק מסמך' : 'Delete document'}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Preference Row ───────────────────────────────────────────────────────── */
function PreferenceRow({
  icon, label, description, checked, onToggle,
}: {
  icon: string; label: string; description: string;
  checked: boolean; onToggle: () => void;
}) {
  return (
    <div className="flex flex-row justify-between items-center p-4 bg-[#F8FAF9] rounded-xl border border-gray-100 hover:border-[#BCCAB7] transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="shrink-0 flex items-center justify-center rounded-2xl text-lg select-none"
          style={{ width: 40, height: 40, background: '#EEF5F0', border: '1px solid #E2EBE5' }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1A2E26]">{label}</p>
          <p className="text-[11px] mt-0.5 text-[#527061]">{description}</p>
        </div>
      </div>
      <ToggleSwitch checked={checked} onChange={onToggle} />
    </div>
  );
}

/* ── Usage bar ────────────────────────────────────────────────────────────── */
function UsageBar({ label, used, limit, unlimitedLabel }: {
  label: string; used: number; limit: number | null; unlimitedLabel: string;
}) {
  const pct   = limit ? Math.min(100, (used / limit) * 100) : 0;
  const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : '#517B3E';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs font-medium" style={{ color: D.textSec }}>{label}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {limit === null ? unlimitedLabel : `${used} / ${limit}`}
        </span>
      </div>
      {limit !== null && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(28,51,41,0.08)' }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}

/* ── Stat mini card ───────────────────────────────────────────────────────── */
function StatMini({ value, label, icon }: { value: number; label: string; icon: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1 py-4 px-2 rounded-2xl flex-1"
      style={{ background: '#EEF5F0', border: '1px solid #E2EBE5' }}
    >
      <span className="text-xl leading-none select-none">{icon}</span>
      <p className="text-xl font-black" style={{ color: D.textPrimary }}>{value.toLocaleString()}</p>
      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: D.textLabel }}>{label}</p>
    </div>
  );
}

/* ── Logout confirm modal ─────────────────────────────────────────────────── */
function LogoutModal({ he, onConfirm, onCancel }: { he: boolean; onConfirm: () => void; onCancel: () => void }) {
  const T = he ? i18n.he : i18n.en;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(28,51,41,0.30)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden animate-slide-up-fade"
        style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E8F0EB', boxShadow: '0 24px 64px rgba(28,51,41,0.18)' }}
      >
        <div className="px-6 pt-6 pb-2">
          <h2 className="font-bold text-lg" style={{ color: D.textPrimary }}>{T.logoutTitle}</h2>
          <p className="text-sm mt-1" style={{ color: D.textSec }}>{T.logoutDesc}</p>
        </div>
        <div className="flex gap-2 px-6 py-4">
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer"
            style={{ background: '#dc2626' }}
          >
            {T.logoutYes}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{ background: '#EEF5F0', color: D.textPrimary, border: '1px solid #D3E0D8' }}
          >
            {T.logoutNo}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const router                                   = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang, toggleLanguage }                 = useLanguage();
  const he = lang === 'he';
  const T  = he ? i18n.he : i18n.en;

  /* ── User info from localStorage ────────────────────────────────────────── */
  const [userEmail]     = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_email')      ?? '') : '');
  const [userFirstName] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_first_name') ?? '') : '');
  const [userLastName]  = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_last_name')  ?? '') : '');
  const [userGender]    = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_gender')     ?? '') : '');
  const userInitials    = [userFirstName[0], userLastName[0]].filter(Boolean).join('').toUpperCase() || '?';

  /* ── UI state ────────────────────────────────────────────────────────────── */
  const [activeTab,       setActiveTab]       = useState<Tab>('preferences');
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [headerScrolled,  setHeaderScrolled]  = useState(false);

  /* ── Documents state ─────────────────────────────────────────────────────── */
  const [docs,        setDocs]        = useState<ProfileDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsLoaded,  setDocsLoaded]  = useState(false);
  const [totalBytes,  setTotalBytes]  = useState(0);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [confirmId,   setConfirmId]   = useState<string | null>(null);
  const confirmTimer                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Preferences state ───────────────────────────────────────────────────── */
  const [prefs, setPrefs] = useState<Prefs>({ audio: false, focus: false, animations: true, mascot: true, saveChatHistory: true, personalWritingStyle: false, studyNotifications: true });

  /* ── Account tab state ───────────────────────────────────────────────────── */
  const [usage,         setUsage]         = useState<UsageData | null>(null);
  const [stats,         setStats]         = useState<StatsData | null>(null);
  const [accountLoaded, setAccountLoaded] = useState(false);

  /* ── Auth redirect ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) router.replace('/?login=true');
  }, [authLoading, authUser, router]);

  /* ── Scroll shadow ───────────────────────────────────────────────────────── */
  useEffect(() => {
    function onScroll() { setHeaderScrolled(window.scrollY > 4); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── ESC closes panels ───────────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setSidebarOpen(false);
      setShowLogoutModal(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── Load prefs from localStorage ───────────────────────────────────────── */
  useEffect(() => {
    Promise.resolve(localStorage.getItem('levy_ai_prefs')).then(raw => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<Prefs>;
        setPrefs(prev => ({ ...prev, ...parsed }));
      } catch { /* ignore malformed */ }
    });
  }, []);

  /* ── Lazy-load documents (only when knowledge tab active) ────────────────── */
  useEffect(() => {
    if (activeTab !== 'knowledge' || docsLoaded) return;
    Promise.resolve(true)
      .then(start => { setDocsLoading(start); return authFetch(`${API}/api/profile/documents`); })
      .then(r => r.ok ? r.json() : { documents: [] })
      .then((data: { documents: ProfileDoc[] }) => {
        const list = data.documents ?? [];
        setDocs(list);
        setTotalBytes(list.reduce((s, d) => s + (d.file_size_bytes ?? 0), 0));
        setDocsLoaded(true);
      })
      .catch(() => { setDocsLoaded(true); })
      .finally(() => setDocsLoading(false));
  }, [activeTab, docsLoaded]);

  /* ── Lazy-load stats / usage (only when account tab active) ──────────────── */
  useEffect(() => {
    if (activeTab !== 'account' || accountLoaded || !authUser) return;
    Promise.all([
      authFetch(`${API}/api/stats`).then(r => r.ok ? r.json() : null),
      authFetch(`${API}/api/usage`).then(r => r.ok ? r.json() : null),
    ]).then(([s, u]) => {
      if (s) setStats(s as StatsData);
      if (u) setUsage(u as UsageData);
      setAccountLoaded(true);
    }).catch(() => setAccountLoaded(true));
  }, [activeTab, accountLoaded, authUser]);

  /* ── Cleanup confirm timer on unmount ────────────────────────────────────── */
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  /* ── Handlers ────────────────────────────────────────────────────────────── */
  const updatePref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('levy_ai_prefs', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleDeleteRequest = useCallback((fileId: string) => {
    if (confirmId === fileId) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmId(null);
      setDeletingId(fileId);
      authFetch(`${API}/documents/${fileId}`, { method: 'DELETE' })
        .then(r => {
          if (r.ok) {
            setDocs(prev => {
              const next = prev.filter(d => d.file_id !== fileId);
              setTotalBytes(next.reduce((s, d) => s + (d.file_size_bytes ?? 0), 0));
              return next;
            });
          }
        })
        .catch(() => {})
        .finally(() => setDeletingId(null));
    } else {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmId(fileId);
      confirmTimer.current = setTimeout(() => setConfirmId(null), 2500);
    }
  }, [confirmId]);

  const handleLogout = useCallback(() => {
    [
      'levy_ai_token', 'levy_ai_email', 'levy_ai_first_name', 'levy_ai_last_name',
      'levy_ai_institution', 'levy_ai_primary_major', 'levy_ai_degree_type',
      'levy_ai_country', 'levy_ai_secondary_major', 'levy_ai_gender', 'levy_ai_course',
    ].forEach(k => localStorage.removeItem(k));
    document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
    window.location.href = '/';
  }, []);

  /* ── Loading guard ───────────────────────────────────────────────────────── */
  if (authLoading || !authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: D.pageBg }}>
        <SpinnerRing className="w-8 h-8 border-4 border-[#D1E6D9] border-t-[#517B3E]" />
      </div>
    );
  }

  /* ── Derived ─────────────────────────────────────────────────────────────── */
  const navTabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'knowledge',   icon: '📚', label: T.tabKnowledge },
    { id: 'preferences', icon: '⚙️',  label: T.tabPreferences },
    { id: 'account',     icon: '👤', label: T.tabAccount },
  ];

  function planBadge(plan: string) {
    if (plan === 'pro')      return { label: T.planPro,      bg: '#7c3aed', text: '#fff' };
    if (plan === 'semester') return { label: T.planSemester, bg: '#0369a1', text: '#fff' };
    return { label: T.planBasic, bg: '#EEF5F0', text: D.textSec };
  }

  /* ── JSX ─────────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: D.pageBg }} dir={he ? 'rtl' : 'ltr'}>

      {/* ── Slide-in sidebar ──────────────────────────────────────────────── */}
      <div
        className={[
          'fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-300',
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        style={{ backgroundColor: 'rgba(28,51,41,0.25)' }}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={[
          'fixed inset-y-0 start-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : (he ? 'translate-x-full' : '-translate-x-full'),
        ].join(' ')}
        style={{
          backgroundColor:      'rgba(255,255,255,0.97)',
          backdropFilter:       'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderInlineEnd:      '1px solid #E2EBE5',
          boxShadow:            '4px 0 32px rgba(28,51,41,0.08)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: '1px solid #E8F0EB' }}>
          <LogoMark size={32} />
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-black/10 transition-colors cursor-pointer">
            <svg className="w-4 h-4 text-[#527061]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-2" style={{ color: D.textLabel }}>
            {T.navigation}
          </p>
          {[
            { label: T.dashboard, icon: '🏠', path: '/dashboard',        active: false },
            { label: T.studylab,  icon: '🌱', path: '/workspace',        active: false },
            { label: T.academic,  icon: '✍️', path: '/academic-writing',              active: false },
            { label: T.profSim,   icon: '🧠', path: '/workspace/professor-simulator', active: false },
            { label: T.mastery,   icon: '🎯', path: '/mastery',                       active: false },
            { label: T.settings,  icon: '⚙️',  path: '/settings',        active: true  },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => { setSidebarOpen(false); router.push(item.path); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer text-start"
              style={item.active
                ? { backgroundColor: D.activeBg, color: D.activeColor, fontWeight: 700 }
                : { color: D.textSec }}
              onMouseEnter={e => { if (!item.active) e.currentTarget.style.background = '#EEF5F0'; }}
              onMouseLeave={e => { if (!item.active) e.currentTarget.style.background = ''; }}
            >
              <span className="text-base leading-none shrink-0">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        <div className="shrink-0 px-3 py-3" style={{ borderTop: '1px solid #E8F0EB' }}>
          <button
            onClick={() => { setSidebarOpen(false); setShowLogoutModal(true); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer hover:bg-red-50"
            style={{ color: D.textSec }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = D.textSec; }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            {T.logout}
          </button>
        </div>
      </aside>

      {/* ── Fixed header ──────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 inset-x-0 z-30 h-14 flex items-center px-4 gap-3 transition-all duration-200"
        style={{
          background:           D.headerBg,
          backdropFilter:       'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom:         `1px solid ${headerScrolled ? '#E2EBE5' : 'transparent'}`,
          boxShadow:            headerScrolled ? '0 2px 12px rgba(28,51,41,0.06)' : 'none',
        }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-xl transition-colors hover:bg-[#EEF5F0] cursor-pointer shrink-0"
          aria-label={he ? 'פתח תפריט' : 'Open menu'}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: D.textSec }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        <LogoMark size={28} />

        <h1 className="flex-1 min-w-0 text-base font-bold truncate" style={{ color: D.textPrimary }}>
          {T.title}
        </h1>

        <button
          onClick={toggleLanguage}
          className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors hover:bg-[#EEF5F0] cursor-pointer shrink-0"
          style={{ color: D.textSec, borderColor: '#D3E0D8' }}
        >
          {T.langSwitch}
        </button>

        <button
          onClick={() => router.push('/dashboard')}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors hover:bg-[#EEF5F0] cursor-pointer shrink-0"
          style={{ color: D.textSec, borderColor: '#D3E0D8' }}
        >
          <svg
            className="w-3.5 h-3.5 shrink-0"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            style={{ transform: he ? 'scaleX(-1)' : 'none' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          {T.back}
        </button>
      </header>

      {/* ── Page body ─────────────────────────────────────────────────────── */}
      <main className="pt-[72px] pb-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row gap-6 items-start">

            {/* ── Left nav panel ──────────────────────────────────────────── */}
            <div
              className="w-full md:w-56 md:sticky top-[80px] shrink-0"
              style={{
                background:           D.panelBg,
                backdropFilter:       'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border:               D.panelBorder,
                borderRadius:         D.panelRadius,
                boxShadow:            D.panelShadow,
              }}
            >
              {/* Avatar mini card */}
              <div className="p-4 flex items-center gap-3" style={{ borderBottom: '1px solid #EEF5F0' }}>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 select-none"
                  style={{ background: 'linear-gradient(135deg, #527061 0%, #1C3329 100%)' }}
                >
                  <AvatarContent gender={userGender} initials={userInitials} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: D.textPrimary }}>
                    {userFirstName} {userLastName}
                  </p>
                  <p className="text-[10px] truncate" style={{ color: D.textLabel }}>{userEmail}</p>
                </div>
              </div>

              {/* Tab nav */}
              <div className="p-2">
                {navTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer text-start mb-0.5"
                    style={
                      activeTab === tab.id
                        ? { backgroundColor: D.activeBg, color: D.activeColor, fontWeight: 700, boxShadow: '0 2px 8px rgba(28,51,41,0.06)' }
                        : { color: D.textSec }
                    }
                    onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.background = '#EEF5F0'; }}
                    onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.background = ''; }}
                  >
                    <span className="text-base leading-none shrink-0">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Back link */}
              <div className="p-2" style={{ borderTop: '1px solid #EEF5F0' }}>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all hover:bg-[#EEF5F0] text-start"
                  style={{ color: D.textLabel }}
                >
                  <svg
                    className="w-3.5 h-3.5 shrink-0"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    style={{ transform: he ? 'scaleX(-1)' : 'none' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                  {T.back}
                </button>
              </div>
            </div>

            {/* ── Right content ────────────────────────────────────────────── */}
            <div className="flex-1 min-w-0">

              {/* ════════ KNOWLEDGE BASE TAB ════════ */}
              {activeTab === 'knowledge' && (
                <div
                  style={{
                    background:           D.panelBg,
                    backdropFilter:       'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border:               D.panelBorder,
                    borderRadius:         D.panelRadius,
                    boxShadow:            D.panelShadow,
                    overflow:             'hidden',
                  }}
                >
                  {/* Panel header */}
                  <div
                    className="px-6 py-5 flex items-center justify-between gap-4"
                    style={{ borderBottom: '1px solid #EEF5F0' }}
                  >
                    <div>
                      <h2 className="text-lg font-bold" style={{ color: D.textPrimary }}>
                        {T.knowledgeTitle}
                      </h2>
                      {!docsLoading && docs.length > 0 && (
                        <p className="text-xs mt-0.5" style={{ color: D.textLabel }}>
                          {docs.length} {T.files}
                          {totalBytes > 0 && ` · ${formatBytes(totalBytes)} ${T.totalLabel}`}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => router.push('/workspace')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer transition-opacity hover:opacity-90 shrink-0"
                      style={{
                        background:  'linear-gradient(135deg,#517B3E,#2A3B22)',
                        boxShadow:   '0 2px 10px rgba(81,123,62,0.28)',
                      }}
                    >
                      {T.addFile}
                    </button>
                  </div>

                  {/* Document list body */}
                  <div className="p-4 flex flex-col gap-2.5 min-h-[200px]">
                    {/* Skeleton loading */}
                    {docsLoading && (
                      Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton
                          key={i}
                          className="h-[72px] rounded-2xl"
                          style={{ animationDelay: `${i * 100}ms` }}
                        />
                      ))
                    )}

                    {/* Empty state */}
                    {!docsLoading && docs.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                        <span className="text-5xl select-none" aria-hidden="true">📭</span>
                        <p className="text-base font-semibold" style={{ color: D.textPrimary }}>
                          {T.noDocuments}
                        </p>
                        <p className="text-sm max-w-xs" style={{ color: D.textSec }}>
                          {T.noDocsDesc}
                        </p>
                        <button
                          onClick={() => router.push('/workspace')}
                          className="mt-2 px-5 py-2 rounded-xl text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-90"
                          style={{ background: 'linear-gradient(135deg,#517B3E,#2A3B22)', boxShadow: '0 2px 10px rgba(81,123,62,0.22)' }}
                        >
                          {T.goWorkspace}
                        </button>
                      </div>
                    )}

                    {/* Document rows */}
                    {!docsLoading && docs.map((doc, i) => (
                      <DocumentRow
                        key={doc.file_id}
                        doc={doc}
                        he={he}
                        lang={lang}
                        index={i}
                        isDeleting={deletingId === doc.file_id}
                        isConfirming={confirmId === doc.file_id}
                        onDeleteRequest={handleDeleteRequest}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ════════ PREFERENCES TAB ════════ */}
              {activeTab === 'preferences' && (
                <div
                  style={{
                    background:           D.panelBg,
                    backdropFilter:       'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border:               D.panelBorder,
                    borderRadius:         D.panelRadius,
                    boxShadow:            D.panelShadow,
                    overflow:             'hidden',
                  }}
                >
                  {/* Panel header */}
                  <div className="px-6 py-5" style={{ borderBottom: '1px solid #EEF5F0' }}>
                    <h1 className="text-2xl font-bold text-[#1A2E26] mb-1">{he ? 'הגדרות מערכת' : 'System Settings'}</h1>
                    <p className="text-xs text-[#7B9E8F]">{T.autoSave}</p>
                  </div>

                  {/* Platform preference rows */}
                  <div className="px-6 py-5 space-y-4" style={{ borderBottom: '1px solid #EEF5F0' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B9E8F]">
                      {he ? 'העדפות פלטפורמה' : 'Platform Preferences'}
                    </p>
                    <PreferenceRow
                      icon="💬"
                      label={T.prefHistoryLabel}
                      description={T.prefHistoryDesc}
                      checked={prefs.saveChatHistory}
                      onToggle={() => updatePref('saveChatHistory', !prefs.saveChatHistory)}
                    />
                    <PreferenceRow
                      icon="✍️"
                      label={T.prefWritingLabel}
                      description={T.prefWritingDesc}
                      checked={prefs.personalWritingStyle}
                      onToggle={() => updatePref('personalWritingStyle', !prefs.personalWritingStyle)}
                    />
                    <PreferenceRow
                      icon="🔔"
                      label={T.prefNotifsLabel}
                      description={T.prefNotifsDesc}
                      checked={prefs.studyNotifications}
                      onToggle={() => updatePref('studyNotifications', !prefs.studyNotifications)}
                    />
                  </div>

                  {/* Interface preference rows */}
                  <div className="px-6 py-5 space-y-4" style={{ borderBottom: '1px solid #EEF5F0' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B9E8F]">
                      {he ? 'הגדרות ממשק' : 'Interface Settings'}
                    </p>
                    <PreferenceRow
                      icon="✨"
                      label={T.prefAnimsLabel}
                      description={T.prefAnimsDesc}
                      checked={prefs.animations}
                      onToggle={() => updatePref('animations', !prefs.animations)}
                    />
                    <PreferenceRow
                      icon="🔊"
                      label={T.prefAudioLabel}
                      description={T.prefAudioDesc}
                      checked={prefs.audio}
                      onToggle={() => updatePref('audio', !prefs.audio)}
                    />
                    <PreferenceRow
                      icon="🎯"
                      label={T.prefFocusLabel}
                      description={T.prefFocusDesc}
                      checked={prefs.focus}
                      onToggle={() => updatePref('focus', !prefs.focus)}
                    />
                    <PreferenceRow
                      icon="🦉"
                      label={T.prefMascotLabel}
                      description={T.prefMascotDesc}
                      checked={prefs.mascot}
                      onToggle={() => updatePref('mascot', !prefs.mascot)}
                    />
                  </div>

                  {/* Language section */}
                  <div className="px-6 py-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-4 text-[#7B9E8F]">
                      {T.langSection}
                    </p>
                    <div className="flex flex-row justify-between items-center p-4 bg-[#F8FAF9] rounded-xl border border-gray-100 hover:border-[#BCCAB7] transition-colors">
                      <div>
                        <p className="text-sm font-semibold text-[#1A2E26]">{T.langLabel}</p>
                        <p className="text-[11px] mt-0.5 text-[#527061]">{T.langCurrent}</p>
                      </div>
                      <button
                        onClick={toggleLanguage}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border cursor-pointer transition-all hover:bg-[#EEF5F0]"
                        style={{ color: D.textPrimary, borderColor: '#D3E0D8' }}
                      >
                        🌐 {T.langSwitch}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ════════ ACCOUNT TAB ════════ */}
              {activeTab === 'account' && (
                <div
                  style={{
                    background:           D.panelBg,
                    backdropFilter:       'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border:               D.panelBorder,
                    borderRadius:         D.panelRadius,
                    boxShadow:            D.panelShadow,
                    overflow:             'hidden',
                  }}
                >
                  {/* Panel header */}
                  <div className="px-6 py-5" style={{ borderBottom: '1px solid #EEF5F0' }}>
                    <h2 className="text-lg font-bold" style={{ color: D.textPrimary }}>{T.accountTitle}</h2>
                  </div>

                  <div className="p-6 flex flex-col gap-6">
                    {/* Avatar + name + plan */}
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-white font-black text-lg shrink-0 select-none"
                        style={{ background: 'linear-gradient(135deg, #527061 0%, #1C3329 100%)' }}
                      >
                        <AvatarContent gender={userGender} initials={userInitials} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base truncate" style={{ color: D.textPrimary }}>
                          {userFirstName} {userLastName}
                        </p>
                        <p className="text-sm truncate" style={{ color: D.textSec }}>{userEmail}</p>
                        {usage && (
                          <span
                            className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold"
                            style={{ background: planBadge(usage.plan_type).bg, color: planBadge(usage.plan_type).text }}
                          >
                            {planBadge(usage.plan_type).label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats row */}
                    {!accountLoaded && (
                      <div className="flex gap-3">
                        {[0, 1, 2].map(i => (
                          <Skeleton key={i} className="h-20 rounded-2xl flex-1" style={{ animationDelay: `${i * 80}ms` }} />
                        ))}
                      </div>
                    )}
                    {accountLoaded && stats && (
                      <div className="flex gap-3">
                        <StatMini value={stats.documents} label={T.documents} icon="📄" />
                        <StatMini value={stats.sessions}  label={T.sessions}  icon="💬" />
                        <StatMini value={stats.messages}  label={T.messages}  icon="🧠" />
                      </div>
                    )}

                    {/* Usage bars */}
                    {accountLoaded && usage && (
                      <div
                        className="flex flex-col gap-4 p-4 rounded-2xl"
                        style={{ background: '#EEF5F0', border: '1px solid #E2EBE5' }}
                      >
                        <UsageBar
                          label={T.uploadsLabel}
                          used={usage.uploads_this_month}
                          limit={usage.upload_limit}
                          unlimitedLabel={T.unlimited}
                        />
                        <UsageBar
                          label={T.questionsLabel}
                          used={usage.questions_this_month}
                          limit={usage.question_limit}
                          unlimitedLabel={T.unlimited}
                        />
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="px-6 pb-6 flex gap-3">
                    <button
                      onClick={() => router.push('/profile')}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-90"
                      style={{
                        background: 'linear-gradient(135deg,#517B3E,#2A3B22)',
                        boxShadow: '0 2px 10px rgba(81,123,62,0.25)',
                      }}
                    >
                      {T.openProfile}
                    </button>
                    <button
                      onClick={() => setShowLogoutModal(true)}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-colors hover:bg-red-50"
                      style={{ background: '#EEF5F0', color: D.textSec, border: '1px solid #D3E0D8' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = D.textSec; }}
                    >
                      {T.logout}
                    </button>
                  </div>
                </div>
              )}

            </div>{/* end right content */}
          </div>
        </div>
      </main>

      {/* ── Logout modal ──────────────────────────────────────────────────── */}
      {showLogoutModal && (
        <LogoutModal
          he={he}
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

    </div>
  );
}
