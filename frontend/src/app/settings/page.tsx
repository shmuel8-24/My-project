'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Settings as IconSettings, Home, BookOpen, PenTool, Presentation as PresentationIcon, Brain, Target, Monitor, LogOut, Folder } from 'lucide-react';
import { useAuth }     from '../providers/auth';
import { useLanguage } from '../providers/language';
import { useCourse }   from '../providers/course';
import CoursePill      from '../../components/CoursePill';
import Skeleton        from '../../components/ui/Skeleton';

/* ── Design tokens ────────────────────────────────────────────────────────── */
const D = {
  panelBg:     'rgba(255,255,255,0.90)',
  panelBorder: '1px solid #E8F0EB',
  panelRadius:  24,
  panelShadow: '0 4px 24px rgba(28,51,41,0.06)',
  toggleOn:    '#4ADE80',
  toggleOff:   '#D3E0D8',
};

/* ── i18n ─────────────────────────────────────────────────────────────────── */
const i18n = {
  he: {
    prefsTitle:       'הגדרות מערכת',
    autoSave:         'שינויים נשמרים אוטומטית',
    platformPrefs:    'העדפות פלטפורמה',
    interfacePrefs:   'הגדרות ממשק',
    prefHistoryLabel: 'שמירת היסטוריית שיחות',
    prefHistoryDesc:  'שמור את השיחות עם ה-AI כדי לחזור אליהן מאוחר יותר.',
    prefWritingLabel: 'סגנון כתיבה אישי כברירת מחדל',
    prefWritingDesc:  'החל תמיד את סגנון הכתיבה האישי שלך בעבודות אקדמיות.',
    prefNotifsLabel:  'התראות בזמן לימוד',
    prefNotifsDesc:   'קבל התראות חכמות בזמן קריאת חומרי לימוד.',
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
  },
  en: {
    prefsTitle:       'System Settings',
    autoSave:         'Changes are saved automatically',
    platformPrefs:    'Platform Preferences',
    interfacePrefs:   'Interface Settings',
    prefHistoryLabel: 'Save Chat History',
    prefHistoryDesc:  'Keep your AI conversations so you can return to them later.',
    prefWritingLabel: 'Personal Writing Style as Default',
    prefWritingDesc:  'Always apply your personal writing style in academic papers.',
    prefNotifsLabel:  'Study Notifications',
    prefNotifsDesc:   'Receive smart notifications while reading study materials.',
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
  },
} as const;

/* ── Types ────────────────────────────────────────────────────────────────── */
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
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

/* ── Shared micro-components ─────────────────────────────────────────────── */
function LogoMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.PNG" alt="U-Note" style={{ height: size, width: 'auto', objectFit: 'contain' }} />
  );
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

function SettingsSidebar({
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
              <Home className="w-4 h-4 shrink-0" />
              {he ? 'בית' : 'Home'}
            </button>

            <button onClick={() => { router.push('/workspace'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <BookOpen className="w-4 h-4 shrink-0" />
              {he ? 'מרחב לימוד' : 'StudyLab'}
            </button>

            <button onClick={() => { router.push('/academic-writing'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <PenTool className="w-4 h-4 shrink-0" />
              {he ? 'כתיבה אקדמית' : 'Academic Writing'}
            </button>

            <button onClick={() => { router.push('/presentation-generator'); onClose(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${pathname.startsWith('/presentation') ? 'border' : 'hover:bg-[#517B3E]/10 text-[#2d3b25]'}`}
              style={pathname.startsWith('/presentation') ? { backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 } : undefined}>
              <PresentationIcon className="w-4 h-4 shrink-0" />
              {he ? 'יצירת מצגת' : 'Create Presentation'}
            </button>

            <button onClick={() => { router.push('/workspace/professor-simulator'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <Brain className="w-4 h-4 shrink-0" />
              {he ? 'הראש של המרצה' : "Professor's Brain"}
            </button>

            <button onClick={() => { router.push('/mastery'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <Target className="w-4 h-4 shrink-0" />
              {he ? 'שליטה בחומר' : 'Mastery'}
            </button>

            <button onClick={() => { router.push('/my-documents'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <Folder className="w-4 h-4 shrink-0" />
              {he ? 'המסמכים שלי' : 'My Documents'}
            </button>

            {/* Settings — active */}
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm border"
              style={{ backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', fontWeight: 600 }}
            >
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
                <Monitor className="w-4 h-4 shrink-0" />
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
                <button onClick={() => { setIsProfileMenuOpen(false); onClose(); onRequestLogout(); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 text-red-600 text-sm transition-colors">
                  <LogOut className="w-4 h-4" aria-hidden="true" />
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

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const router                                     = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang, toggleLanguage }                   = useLanguage();
  const he = lang === 'he';
  const T  = he ? i18n.he : i18n.en;

  /* ── Shell state ─────────────────────────────────────────────────────────── */
  const [sidebarOpen,        setSidebarOpen]        = useState(false);
  const [showLogoutModal,    setShowLogoutModal]    = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const profilePopoverRef = useRef<HTMLDivElement>(null);
  const [headerScrolled,  setHeaderScrolled]  = useState(false);

  /* ── User info from localStorage ────────────────────────────────────────── */
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

  /* ── Preferences state ───────────────────────────────────────────────────── */
  const [prefs, setPrefs] = useState<Prefs>({
    audio: false, focus: false, animations: true, mascot: true,
    saveChatHistory: true, personalWritingStyle: false, studyNotifications: true,
  });

  /* ── Auth redirect ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) router.replace('/?login=true');
  }, [authLoading, authUser, router]);

  /* ── Header scroll depth ─────────────────────────────────────────────────── */
  useEffect(() => {
    function onScroll() { setHeaderScrolled(window.scrollY > 4); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Click-outside profile popover ───────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node))
        setProfilePopoverOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── ESC closes panels ───────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSidebarOpen(false);
      setProfilePopoverOpen(false);
      setShowLogoutModal(false);
    };
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

  /* ── Handlers ────────────────────────────────────────────────────────────── */
  const updatePref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('levy_ai_prefs', JSON.stringify(next));
      return next;
    });
  }, []);

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
      <div dir={he ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col" style={{ background: '#97AB92' }}>
        <div className="h-[60px] shrink-0 flex items-center justify-between px-4"
          style={{ background: '#8BAF84', backdropFilter: 'blur(16px)', boxShadow: '0 1px 0 rgba(28,51,41,0.10)' }}>
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-10 h-10 rounded-xl" />
          <Skeleton className="w-20 h-8 rounded-full" />
        </div>
        <div className="flex-1 flex items-start justify-center px-4 py-8">
          <Skeleton className="w-full max-w-2xl h-[420px] rounded-3xl" />
        </div>
      </div>
    );
  }

  /* ── JSX ─────────────────────────────────────────────────────────────────── */
  return (
    <div dir={he ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: '#97AB92' }}>

      {/* ── Sidebar ── */}
      <SettingsSidebar
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
      <header className="shrink-0 relative z-30"
        style={{
          background:           '#8BAF84',
          backdropFilter:       'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow:            headerScrolled ? '0 4px 16px rgba(28,51,41,0.12)' : '0 1px 0 rgba(28,51,41,0.10)',
          transition:           'box-shadow 0.3s ease',
        }}>
        <div className="max-w-full px-4 py-3 flex items-center justify-between gap-3">

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label={he ? 'פתח תפריט' : 'Open menu'}
              className="p-2 rounded-lg hover:bg-[#EEF5F0] transition-colors text-[#1C3329]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <LogoMark size={40} />
          </div>

          <div className="flex items-center gap-2">
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
      <main className="flex-1 flex flex-col items-center py-8 px-4 md:px-8 overflow-y-auto relative" style={{ zIndex: 1 }}>
        <div className="w-full max-w-2xl">
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
              <h1 className="text-2xl font-bold text-[#1A2E26] mb-1">{T.prefsTitle}</h1>
              <p className="text-xs text-[#7B9E8F]">{T.autoSave}</p>
            </div>

            {/* Platform preference rows */}
            <div className="px-6 py-5 space-y-4" style={{ borderBottom: '1px solid #EEF5F0' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#7B9E8F]">
                {T.platformPrefs}
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
                {T.interfacePrefs}
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
                  style={{ color: '#1C3329', borderColor: '#D3E0D8' }}
                >
                  🌐 {T.langSwitch}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>


    </div>
  );
}
