'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Settings as IconSettings } from 'lucide-react';
import { useAuth }     from '../providers/auth';
import { useLanguage } from '../providers/language';
import { useCourse }   from '../providers/course';
import CoursePill      from '../../components/CoursePill';
import { CodeBlockPre, InlineCode } from '../../components/CodeBlock';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm  from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import dynamic from 'next/dynamic';

/* @uiw/react-md-editor accesses `window` at module level — must be ssr:false */
const AcademicRichEditor = dynamic(
  () => import('../../components/AcademicRichEditor'),
  { ssr: false },
);

const API = 'http://127.0.0.1:5003';

/* ─── Auth helpers ───────────────────────────────────────────────────────── */
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('levy_ai_token');
}
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}
const UPLOADS_STORAGE_KEY = 'unote_academic_uploads';

function _clearAuth() {
  ['levy_ai_token','levy_ai_email','levy_ai_first_name','levy_ai_last_name',
   'levy_ai_institution','levy_ai_primary_major','levy_ai_degree_type',
   'levy_ai_country','levy_ai_secondary_major','levy_ai_gender',
   UPLOADS_STORAGE_KEY,
  ].forEach(k => localStorage.removeItem(k));
  document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
}
async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (token) {
    const p = decodeJwtPayload(token);
    if (p?.exp && (p.exp as number) * 1000 < Date.now()) {
      _clearAuth(); window.location.href = '/?login=true';
      return new Response(null, { status: 401 });
    }
  }
  const res = await fetch(url, {
    ...init,
    headers: { ...((init.headers as Record<string, string>) ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (res.status === 401) { _clearAuth(); window.location.href = '/?login=true'; }
  return res;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function preprocessMath(content: string): string {
  return content
    // \[...\]  →  $$...$$  (display block — most common AI output)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, eq) => `$$${eq}$$`)
    // \(...\)  →  $...$   (inline)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, eq) => `$${eq}$`)
    // \begin{equation|align|gather|eqnarray|displaymath}...\end{...}  →  $$...$$
    .replace(
      /\\begin\{(equation\*?|align\*?|gather\*?|eqnarray\*?|displaymath)\}([\s\S]*?)\\end\{\1\}/g,
      (_m, _env, eq) => `$$${eq}$$`,
    )
    // \begin{math}...\end{math}  →  $...$
    .replace(/\\begin\{math\}([\s\S]*?)\\end\{math\}/g, (_m, eq) => `$${eq}$`);
}
/* ─── RenderedHtml ────────────────────────────────────────────────────────────
 * Injects backend-rendered HTML (Pygments code highlighting + preserved $…$
 * math) and runs KaTeX auto-render so formulas are fully typeset client-side.
 * ─────────────────────────────────────────────────────────────────────────── */
function RenderedHtml({ html, className }: { html: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // mdx_math emits <script type="math/tex"> / <script type="math/tex; mode=display">
    // KaTeX mathtex-script-type processes those script tags.
    import('katex/dist/contrib/mathtex-script-type.mjs').then(mod => {
      const render = (mod.default ?? mod) as (el: HTMLElement) => void;
      render(el);
    }).catch(() => {
      // fallback: auto-render handles $...$ delimiters if script-type unavailable
      import('katex/contrib/auto-render').then(arMod => {
        const ar = (arMod.default ?? arMod) as (
          el: HTMLElement,
          opts: { delimiters: Array<{ left: string; right: string; display: boolean }>; throwOnError?: boolean }
        ) => void;
        ar(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true  },
            { left: '$',  right: '$',  display: false },
          ],
          throwOnError: false,
        });
      }).catch(() => {});
    });
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={className}
      /* Content originates from our own backend (LLM output already
         sanitised by is_safe_output); no external user HTML is injected. */
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface DocInfo { file_id: string; name: string; chunks: number; }
interface SessionInfo { id: number; title: string; updated_at: string; }
interface UploadedFile { name: string; size: number; fileId: string; }

const WRITING_TYPES = [
  { id: 'essay',    emoji: '✍️',  he: 'חיבור',         en: 'Essay' },
  { id: 'research', emoji: '📚',  he: 'עבודת מחקר',    en: 'Research Paper' },
  { id: 'summary',  emoji: '📝',  he: 'סיכום',          en: 'Summary' },
  { id: 'email',    emoji: '📧',  he: 'אימייל אקדמי',  en: 'Academic Email' },
] as const;
type WritingTypeId = typeof WRITING_TYPES[number]['id'];

/* ─── Icons ──────────────────────────────────────────────────────────────── */
function IconPen({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}
function IconDownload({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}
function IconWord({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}
function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}
function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}
function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}
function IconCloud({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
    </svg>
  );
}
function IconCheck({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
function AvatarContent({ gender, initials }: { gender: string; initials: string }) {
  if (gender === 'זכר') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width:'62%', height:'62%' }}>
      <circle cx="9.5" cy="13" r="5.8"/><line x1="14" y1="8.5" x2="20" y2="3"/><polyline points="15.5 3 20 3 20 7.5"/>
    </svg>
  );
  if (gender === 'נקבה') return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ width:'62%', height:'62%' }}>
      <circle cx="12" cy="8.5" r="5.8"/><line x1="12" y1="14.3" x2="12" y2="20.5"/><line x1="9" y1="17.5" x2="15" y2="17.5"/>
    </svg>
  );
  return <>{initials || '?'}</>;
}
function LogoMark({ size = 36 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.PNG" alt="U-Note" style={{ height: size, width: 'auto', objectFit: 'contain' }} />;
}

/* ─── Translations ───────────────────────────────────────────────────────── */
const TR = {
  he: {
    pageTitle:       'כתיבה אקדמית',
    configTitle:     'הגדרת כתיבה',
    configSubtitle:  'בחר את הבסיס לכתיבה ואת סוג היצירה',
    leftTitle:       'בחר בסיס לכתיבה',
    sessionsSec:     'שיחות קודמות',
    docsSec:         'מסמכים שהועלו',
    noSessions:      'אין שיחות קודמות',
    noDocs:          'אין מסמכים מועלים',
    writingTypeSec:  'סוג כתיבה',
    rightTitle:      'העלאת חומרים חדשים',
    dragDrop:        'גרור ושחרר קבצים',
    dragHint:        'PDF, PPTX, תמונות — לחץ לבחירה',
    dropHere:        'שחרר כאן!',
    uploading:       'מעלה...',
    uploadedOk:      (n: number) => `${n} קטעים · הועלה בהצלחה`,
    startWriting:    'התחל כתיבה',
    startHint:       'בחר סוג כתיבה ומקור חומר כדי להתחיל',
    paperTitle:      'כתיבה אקדמית',
    paperSubtitle:   'כתוב מאמר מבוסס המסמכים שהועלו',
    waitingPdf:      'ממתין לקובץ PDF',
    downloadPdf:     'הורד PDF',
    downloadWord:    'הורד Word',
    exporting:       'מייצא...',
    topicChips:      ['סיכום הנושאים המרכזיים', 'השוואת גישות ורעיונות', 'ביקורת ספרות', 'ניתוח מושגי מפתח'],
    enterTopic:      'הזן נושא ולחץ על "חבר"',
    aiWrites:        'ה-AI יכתוב מאמר אקדמי מלא ומובנה בעברית',
    suggestedTopics: 'נושאים מוצעים:',
    writingPaper:    'כותב מאמר אקדמי...',
    takeSecs:        'זה עשוי לקחת מספר שניות',
    paperErr:        'שגיאה ביצירת המאמר.',
    serverErr:       'לא ניתן להתחבר לשרת.',
    sources:         'מקורות:',
    topicPh:         'נושא המאמר (לדוגמה: השפעת הגלובליזציה על החינוך)',
    instructionsPh:  'הוראות נוספות (אופציונלי): אורך, פרקים, סגנון...',
    composePaper:    'חבר',
    writingBtn:      'כותב...',
    exportErr:            'שגיאה בייצוא ה-PDF',
    wordErr:              'שגיאה בייצוא Word',
    backToConfig:         'חזרה להגדרות',
    customInstructionsPh: 'הנחיות נוספות ל-AI (למשל: דגשים לעבודה, מבנה רצוי, הגבלת מילים)...',
    personalStyleLabel:   'כתוב בסגנון הכתיבה הטבעי שלך',
    navHome:         'בית',
    navStudyLab:     'מרחב לימוד',
    navProfSim:      'הראש של המרצה',
    navGapFill:      'שליטה בחומר',
    navAcademic:     'כתיבה אקדמית',
    navAdmin:        'Admin',
    logout:          'יציאה',
    logoutTitle:     'יציאה מהמערכת',
    logoutBody:      'האם אתה בטוח שברצונך להתנתק?',
    logoutYes:       'כן, צא',
    cancel:          'ביטול',
    langLabel:       'EN',
    loading:         'טוען...',
  },
  en: {
    pageTitle:       'Academic Writing',
    configTitle:     'Writing Setup',
    configSubtitle:  'Choose your source material and writing type',
    leftTitle:       'Select Writing Base',
    sessionsSec:     'Previous Sessions',
    docsSec:         'Uploaded Documents',
    noSessions:      'No previous sessions',
    noDocs:          'No documents uploaded',
    writingTypeSec:  'Writing Type',
    rightTitle:      'Upload New Material',
    dragDrop:        'Drag & drop files',
    dragHint:        'PDF, PPTX, images — click to select',
    dropHere:        'Drop here!',
    uploading:       'Uploading...',
    uploadedOk:      (n: number) => `${n} chunks · Uploaded`,
    startWriting:    'Start Writing',
    startHint:       'Select a writing type and source material to continue',
    paperTitle:      'Academic Writing',
    paperSubtitle:   'Write a paper based on uploaded documents',
    waitingPdf:      'Waiting for PDF file',
    downloadPdf:     'Download PDF',
    downloadWord:    'Download Word',
    exporting:       'Exporting...',
    topicChips:      ['Summary of main topics', 'Comparison of approaches', 'Literature review', 'Analysis of key concepts'],
    enterTopic:      'Enter a topic and click "Compose"',
    aiWrites:        'The AI will write a full structured academic paper',
    suggestedTopics: 'Suggested topics:',
    writingPaper:    'Writing academic paper...',
    takeSecs:        'This may take a few seconds',
    paperErr:        'Error generating paper.',
    serverErr:       'Cannot connect to server.',
    sources:         'Sources:',
    topicPh:         'Paper topic (e.g., The impact of globalization on education)',
    instructionsPh:  'Additional instructions (optional): length, chapters, style...',
    composePaper:    'Compose',
    writingBtn:      'Writing...',
    exportErr:            'Error exporting PDF',
    wordErr:              'Error exporting Word',
    backToConfig:         'Back to Setup',
    customInstructionsPh: 'Additional AI instructions (e.g. emphasis, desired structure, word limit)...',
    personalStyleLabel:   'Write in your natural writing style',
    navHome:         'Home',
    navStudyLab:     'StudyLab',
    navProfSim:      "Professor's Brain",
    navGapFill:      'Mastery',
    navAcademic:     'Academic Writing',
    navAdmin:        'Admin',
    logout:          'Logout',
    logoutTitle:     'Log Out',
    logoutBody:      'Are you sure you want to log out?',
    logoutYes:       'Yes, Log Out',
    cancel:          'Cancel',
    langLabel:       'HE',
    loading:         'Loading...',
  },
} as const;
type TType = typeof TR.he | typeof TR.en;

/* ─── Logout modal ───────────────────────────────────────────────────────── */
function LogoutConfirmModal({ t, onConfirm, onCancel }: { t: TType; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(28,51,41,0.30)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid #E8F0EB', boxShadow: '0 24px 64px rgba(28,51,41,0.18)' }}>
        <div className="px-6 pt-6 pb-2">
          <h2 className="font-bold text-lg text-[#1C3329]">{t.logoutTitle}</h2>
          <p className="text-sm mt-1 text-[#527061]">{t.logoutBody}</p>
        </div>
        <div className="flex gap-2 px-6 py-4">
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#dc2626' }}>{t.logoutYes}</button>
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-bold" style={{ background: '#EEF5F0', color: '#1C3329', border: '1px solid #D3E0D8' }}>{t.cancel}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Sidebar ────────────────────────────────────────────────────────────── */
function Sidebar({ isOpen, onClose, isAdmin, t, lang, userFirstName, userLastName, userEmail, userGender, userInitials, onRequestLogout }: {
  isOpen: boolean; onClose: () => void; isAdmin: boolean;
  t: TType; lang: 'he' | 'en';
  userFirstName: string; userLastName: string; userEmail: string;
  userGender: string; userInitials: string; onRequestLogout: () => void;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const { selectedCourse } = useCourse();
  const he = lang === 'he';
  const translateClass = isOpen ? 'translate-x-0' : he ? 'translate-x-full' : '-translate-x-full';
  const isActive = (p: string) => pathname === p;
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  return (
    <>
      <div className={['fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-300', isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'].join(' ')}
        style={{ backgroundColor: 'rgba(28,51,41,0.25)' }} onClick={onClose} aria-hidden="true" />
      <aside className={['fixed inset-y-0 start-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out', translateClass].join(' ')}
        style={{ backgroundColor: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderInlineEnd: '1px solid #E2EBE5', boxShadow: '4px 0 32px rgba(28,51,41,0.08)' }}>
        <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: '1px solid #E8F0EB' }}>
          <LogoMark size={36} />
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/10 transition-colors">
            <IconX className="w-4 h-4 text-[#4a5e3a]" />
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
          <div className="mx-3 mt-3 px-3 py-2.5 rounded-xl flex items-center gap-2 shrink-0"
            style={{ background: `${selectedCourse.color}12`, border: `1px solid ${selectedCourse.color}28` }}>
            <span className="text-base leading-none shrink-0">{selectedCourse.icon}</span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: selectedCourse.color }}>{he ? 'קורס פעיל' : 'Active course'}</p>
              <p className="text-xs font-bold text-[#1C3329] truncate">{selectedCourse.name}</p>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="px-3 py-3 space-y-1 shrink-0" style={{ borderBottom: '1px solid #E8F0EB' }}>
            <p className="text-[10px] font-semibold text-[#527061] uppercase tracking-widest px-2 mb-2">Navigation</p>
            {[
              { path: '/dashboard',                     emoji: '🏠',  label: t.navHome },
              { path: '/workspace',                     emoji: '🌱',  label: t.navStudyLab },
              { path: '/academic-writing',              emoji: '✍️',  label: t.navAcademic },
              { path: '/workspace/professor-simulator', emoji: '🧠',  label: t.navProfSim },
              { path: '/mastery',                       emoji: '🎯',  label: t.navGapFill },
            ].map(({ path, emoji, label }) => (
              <button key={path} onClick={() => { router.push(path); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all"
                style={isActive(path)
                  ? { backgroundColor: '#D1E6D9', color: '#183025', fontWeight: 700 }
                  : { color: '#1C3329' }}
                onMouseEnter={e => { if (!isActive(path)) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EEF5F0'; }}
                onMouseLeave={e => { if (!isActive(path)) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}>
                <span className="text-base leading-none shrink-0">{emoji}</span>{label}
              </button>
            ))}
            <button onClick={() => { router.push('/settings'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all"
              style={isActive('/settings')
                ? { backgroundColor: '#D1E6D9', color: '#183025', fontWeight: 700 }
                : { color: '#1C3329' }}
              onMouseEnter={e => { if (!isActive('/settings')) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EEF5F0'; }}
              onMouseLeave={e => { if (!isActive('/settings')) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}>
              <IconSettings className="w-4 h-4 shrink-0" />{he ? 'הגדרות' : 'Settings'}
            </button>
          </div>
          <div className="flex-1" />
          {isAdmin && (
            <div className="px-3 py-3 shrink-0" style={{ borderTop: '1px solid #E8F0EB' }}>
              <button onClick={() => { router.push('/admin'); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#1C3329]/70 transition-all hover:bg-[#EEF5F0] hover:text-[#1C3329]">
                <IconShield className="w-4 h-4 shrink-0" />{t.navAdmin}
              </button>
            </div>
          )}
        </div>
        <div className="shrink-0 px-3 pt-2 pb-2.5" style={{ borderTop: '1px solid #E8F0EB' }}>
          <button dir={he ? 'rtl' : 'ltr'} onClick={() => { onClose(); onRequestLogout(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-[#527061] hover:bg-red-50 hover:text-red-500 mb-1">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            <span className="text-sm font-medium">{t.logout}</span>
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
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-[#EEF5F0] active:scale-[0.99] cursor-pointer group"
              style={{ textAlign: 'start' }}
            >
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

/* ─── Toggle switch ──────────────────────────────────────────────────────── */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { lang } = useLanguage();
  /* In RTL the flex container places the thumb at the inline-start (visual right),
     so the checked offset must be negative to move it toward the inline-end (visual left). */
  const offset = checked ? (lang === 'he' ? -18 : 18) : 0;
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, flexShrink: 0,
        background:  checked ? '#2D4A3E' : 'rgba(157,192,139,0.28)',
        border:      `1.5px solid ${checked ? 'rgba(74,222,128,0.40)' : 'rgba(157,192,139,0.30)'}`,
        padding:     2, display: 'flex', alignItems: 'center', cursor: 'pointer',
        transition:  'background 0.2s ease, border-color 0.2s ease',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background:  checked ? '#4ADE80' : 'rgba(255,255,255,0.88)',
        boxShadow:   checked ? '0 0 7px rgba(74,222,128,0.55)' : '0 1px 3px rgba(0,0,0,0.14)',
        transition:  'transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
        transform:   `translateX(${offset}px)`,
      }} />
    </button>
  );
}

/* ─── Wizard ─────────────────────────────────────────────────────────────── */
type SourceType = 'upload' | 'documents' | 'sessions';

function Wizard({
  t, he,
  sessions, docs, docsLoading, sessionsLoading,
  selectedSessionId, onSelectSession,
  selectedDocId, onSelectDoc,
  writingType, onSelectType,
  uploadedFiles, uploading, uploadError, onDrop, onRemoveFile,
  hasDoc, onStart,
}: {
  t: TType; he: boolean;
  sessions: SessionInfo[]; docs: DocInfo[]; docsLoading: boolean; sessionsLoading: boolean;
  selectedSessionId: number | null; onSelectSession: (id: number | null) => void;
  selectedDocId: string | null; onSelectDoc: (id: string | null) => void;
  writingType: WritingTypeId | null; onSelectType: (id: WritingTypeId) => void;
  uploadedFiles: UploadedFile[]; uploading: boolean; uploadError: string | null; onDrop: (files: File[]) => void; onRemoveFile: (file: UploadedFile) => void;
  hasDoc: boolean; onStart: (customInstructions: string, usePersonalStyle: boolean, includeSources: boolean, pageCount: number, studentName: string) => void;
}) {
  const router = useRouter();
  const [step,               setStep]               = useState<1 | 2 | 3>(1);
  const [sourceType,         setSourceType]         = useState<SourceType | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const [usePersonalStyle,   setUsePersonalStyle]   = useState(false);
  const [includeSources,     setIncludeSources]     = useState(false);
  const [pageCount,          setPageCount]          = useState(1);
  const [studentName,        setStudentName]        = useState('');
  const [scanningFileNames,  setScanningFileNames]  = useState<string[]>([]);

  // Capture file names immediately when dropped so we can show per-file
  // scanning cards before the async upload resolves.
  const handleDropWithScanning = useCallback((files: File[]) => {
    if (files.length) setScanningFileNames(files.map(f => f.name));
    onDrop(files);
  }, [onDrop]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDropWithScanning,
    accept: {
      'application/pdf': [],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': [],
      'image/png': [], 'image/jpeg': [],
    },
    disabled: uploading || sourceType !== 'upload',
    maxSize: 50 * 1024 * 1024,
  });

  // Clear the scanning list once the parent signals upload is done.
  // Promise.resolve defers setState out of the synchronous effect body
  // to satisfy the react-hooks/set-state-in-effect ESLint rule.
  useEffect(() => {
    if (!uploading) {
      Promise.resolve().then(() => setScanningFileNames([]));
    }
  }, [uploading]);

  const step1Ready =
    (sourceType === 'upload'    && (uploadedFiles.length > 0 || hasDoc)) ||
    (sourceType === 'documents' && selectedDocId !== null) ||
    (sourceType === 'sessions'  && selectedSessionId !== null);

  const step2Ready = writingType !== null;

  const STEPS = [
    { n: 1, he: 'בחר מקור',   en: 'Source' },
    { n: 2, he: 'סוג כתיבה',  en: 'Type' },
    { n: 3, he: 'אישור',       en: 'Confirm' },
  ] as const;

  /* ── style tokens ── */
  const card: React.CSSProperties = {
    background: 'rgba(232,239,229,0.92)',
    border: '1px solid rgba(255,255,255,0.52)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(44,74,59,0.08)',
  };
  const tileBase: React.CSSProperties = {
    background: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.45)',
    transition: 'all 0.18s ease',
  };
  const tileActive: React.CSSProperties = {
    background: '#EAF5EC',
    border: '1.5px solid rgba(81,123,62,0.55)',
    boxShadow: '0 4px 16px rgba(81,123,62,0.12)',
  };

  /* ── Source-type tile ── */
  function SourceTile({ id, emoji, title, subtitle }: { id: SourceType; emoji: string; title: string; subtitle: string }) {
    const active = sourceType === id;
    return (
      <button onClick={() => { setSourceType(id); onSelectSession(null); onSelectDoc(null); }}
        className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-start"
        style={active ? tileActive : tileBase}
        onMouseEnter={e => { if (!active) Object.assign((e.currentTarget as HTMLButtonElement).style, { background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.65)' }); }}
        onMouseLeave={e => { if (!active) Object.assign((e.currentTarget as HTMLButtonElement).style, { background: tileBase.background, borderColor: (tileBase.border as string).replace('1px solid ', '') }); }}>
        <span className="text-3xl shrink-0 leading-none">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm" style={{ color: active ? '#183025' : '#2C4A3B' }}>{title}</p>
          <p className="text-xs mt-0.5" style={{ color: '#7BA08A' }}>{subtitle}</p>
        </div>
        <div className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center"
          style={{ borderColor: active ? '#517B3E' : 'rgba(157,192,139,0.5)', background: active ? '#517B3E' : 'transparent' }}>
          {active && <IconCheck className="w-3 h-3 text-white" />}
        </div>
      </button>
    );
  }

  /* ── Scrollable list for docs / sessions ── */
  function SelectList<T>({ items, loading, empty, keyFn, label, subLabel, selected, onSelect }: {
    items: T[]; loading: boolean; empty: string;
    keyFn: (i: T) => string; label: (i: T) => string; subLabel?: (i: T) => string;
    selected: string | null; onSelect: (key: string) => void;
  }) {
    return loading ? (
      <p className="text-xs py-3 text-center" style={{ color: '#7BA08A' }}>{t.loading}</p>
    ) : items.length === 0 ? (
      <p className="text-xs py-3 text-center" style={{ color: '#7BA08A' }}>{empty}</p>
    ) : (
      <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
        {items.map(item => {
          const k = keyFn(item);
          const active = selected === k;
          return (
            <button key={k} onClick={() => onSelect(active ? '' : k)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-start transition-all"
              style={active ? tileActive : tileBase}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: active ? '#183025' : '#2C4A3B' }}>{label(item)}</p>
                {subLabel && <p className="text-[11px] mt-0.5" style={{ color: '#7BA08A' }}>{subLabel(item)}</p>}
              </div>
              {active && <IconCheck className="w-4 h-4 shrink-0" style={{ color: '#517B3E' } as React.CSSProperties} />}
            </button>
          );
        })}
      </div>
    );
  }

  /* ── Confirmation row ── */
  function SummaryRow({ emoji, label, value }: { emoji: string; label: string; value: string }) {
    return (
      <div className="flex items-center gap-4 px-5 py-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.45)' }}>
        <span className="text-2xl shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#7BA08A' }}>{label}</p>
          <p className="text-sm font-bold mt-0.5 truncate" style={{ color: '#1C3329' }}>{value}</p>
        </div>
        <IconCheck className="w-4 h-4 shrink-0" style={{ color: '#517B3E' } as React.CSSProperties} />
      </div>
    );
  }

  /* ── Source label for confirmation ── */
  const sourceLabel = () => {
    if (sourceType === 'upload')    return uploadedFiles.length > 0 ? uploadedFiles.map(f => f.name).join(', ') : (he ? 'מסמכים קיימים' : 'Existing documents');
    if (sourceType === 'documents') return docs.find(d => d.file_id === selectedDocId)?.name ?? '';
    if (sourceType === 'sessions')  return sessions.find(s => String(s.id) === String(selectedSessionId))?.title ?? `Session ${selectedSessionId}`;
    return '';
  };
  const wtLabel = writingType ? (he ? WRITING_TYPES.find(w => w.id === writingType)?.he : WRITING_TYPES.find(w => w.id === writingType)?.en) ?? '' : '';
  const wtEmoji = WRITING_TYPES.find(w => w.id === writingType)?.emoji ?? '✍️';

  return (
    <div className="flex flex-col items-center w-full max-w-lg mx-auto px-4 py-8 gap-8">

      {/* Progress bar */}
      <div className="flex items-center gap-0 w-full max-w-xs">
        {STEPS.map((s, i) => {
          const done    = step > s.n;
          const current = step === s.n;
          return (
            <React.Fragment key={s.n}>
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={done
                    ? { background: '#517B3E', color: '#fff' }
                    : current
                      ? { background: 'linear-gradient(135deg,#517B3E,#2A3B22)', color: '#fff', boxShadow: '0 4px 12px rgba(81,123,62,0.35)' }
                      : { background: 'rgba(232,239,229,0.92)', color: '#7BA08A', border: '1.5px solid rgba(157,192,139,0.4)' }}>
                  {done ? <IconCheck className="w-3.5 h-3.5" /> : s.n}
                </div>
                <span className="text-[10px] font-semibold" style={{ color: current || done ? '#2C4A3B' : '#7BA08A' }}>
                  {he ? s.he : s.en}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-px mx-2 mb-4" style={{ background: step > s.n ? '#9DC08B' : 'rgba(157,192,139,0.3)' }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step card */}
      <div className="w-full rounded-3xl p-6 flex flex-col gap-5" style={card}>

        {/* ── Step 1: Source ── */}
        {step === 1 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: '#1C3329' }}>{t.leftTitle}</h2>
              <p className="text-sm mt-1" style={{ color: '#527061' }}>{he ? 'מה הבסיס שממנו תרצה לכתוב?' : 'What material will you base your writing on?'}</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <SourceTile id="upload"
                emoji="📤"
                title={t.rightTitle}
                subtitle={he ? 'גרור קבצים חדשים (PDF, PPTX, תמונות)' : 'Drag & drop new files (PDF, PPTX, images)'} />
              <SourceTile id="documents"
                emoji="📄"
                title={t.docsSec}
                subtitle={he ? `${docs.length} מסמכים זמינים` : `${docs.length} document${docs.length !== 1 ? 's' : ''} available`} />
              <SourceTile id="sessions"
                emoji="💬"
                title={t.sessionsSec}
                subtitle={he ? `${sessions.length} שיחות קודמות` : `${sessions.length} previous session${sessions.length !== 1 ? 's' : ''}`} />
            </div>

            {/* Sub-content expands when a source type is selected */}
            {sourceType === 'upload' && (
              <div className="mt-1 flex flex-col gap-3">
                <div {...getRootProps()}
                  className="rounded-2xl flex flex-col items-center justify-center gap-3 px-6 py-8 text-center select-none cursor-pointer transition-all"
                  style={isDragActive
                    ? { background: 'rgba(255,255,255,0.80)', border: '1px solid rgba(81,123,62,0.55)', boxShadow: '0 0 20px rgba(81,123,62,0.12)' }
                    : uploading
                      ? { background: 'rgba(255,255,255,0.40)', border: '1px solid rgba(255,255,255,0.40)', opacity: 0.6 }
                      : { background: 'rgba(155,180,148,0.35)', border: '1px solid rgba(155,180,148,0.35)' }}>
                  <input {...getInputProps()} />
                  {uploading ? (
                    <>
                      {/* Doc icon inside a spinning ring */}
                      <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
                        <div className="absolute inset-0 rounded-full border-2 border-[#9DC08B]/25 border-t-[#517B3E] animate-spin" />
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#517B3E" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0
                               0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5
                               3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504
                               1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0
                               0 0-9-9Z" />
                        </svg>
                      </div>
                      <div className="space-y-0.5 text-center">
                        <p className="text-sm font-semibold" style={{ color: '#517B3E' }}>
                          {he ? 'סורק ומנתח...' : 'Scanning & indexing...'}
                        </p>
                        <p className="text-[11px]" style={{ color: '#7BA08A' }}>
                          {he ? 'מחלץ טקסט ומאנדקס לחיפוש' : 'Extracting text and indexing for search'}
                        </p>
                      </div>
                    </>
                  ) : isDragActive ? (
                    <>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center animate-bounce" style={{ background: '#517B3E' }}>
                        <IconCloud className="w-7 h-7 text-white" />
                      </div>
                      <p className="font-bold" style={{ color: '#517B3E' }}>{t.dropHere}</p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#9DC08B,#517B3E)' }}>
                        <IconCloud className="w-7 h-7 text-white" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold" style={{ color: '#2C4A3B' }}>{t.dragDrop}</p>
                        <p className="text-xs" style={{ color: '#7BA08A' }}>{t.dragHint}</p>
                      </div>
                    </>
                  )}
                </div>
                {/* Per-file scanning cards — shown while the upload/index is in flight.
                    Filtered to exclude names that are already in uploadedFiles so there
                    is no flash of duplication when the upload resolves. */}
                {scanningFileNames
                  .filter(name => !uploadedFiles.some(f => f.name === name))
                  .map(name => (
                    <div key={`scan-${name}`}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.55)', border: '1px dashed rgba(157,192,139,0.45)' }}>
                      <div className="w-4 h-4 rounded-full border-2 border-[#9DC08B]/30 border-t-[#517B3E] animate-spin shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: '#527061' }}>{name}</p>
                        <p className="text-[10px]" style={{ color: '#7BA08A' }}>
                          {he ? 'סורק מסמך...' : 'Scanning document...'}
                        </p>
                      </div>
                    </div>
                  ))}

                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                    style={{ background: '#D1E6D9', border: '1px solid rgba(81,123,62,0.25)' }}>
                    <IconCheck className="w-4 h-4 shrink-0" style={{ color: '#517B3E' } as React.CSSProperties} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: '#183025' }}>{f.name}</p>
                      <p className="text-[10px]" style={{ color: '#527061' }}>{fmtBytes(f.size)}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); onRemoveFile(f); }}
                      className="shrink-0 p-1 rounded-lg hover:bg-red-100 transition-colors"
                      style={{ color: '#527061' }}
                      title={he ? 'הסר קובץ' : 'Remove file'}
                    >
                      <IconX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {uploadError && (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs"
                    style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626' }}>
                    <IconX className="w-3.5 h-3.5 shrink-0" />
                    {uploadError}
                  </div>
                )}
              </div>
            )}

            {sourceType === 'documents' && (
              <SelectList
                items={docs} loading={docsLoading} empty={t.noDocs}
                keyFn={d => d.file_id} label={d => d.name} subLabel={d => `${d.chunks} chunks`}
                selected={selectedDocId} onSelect={key => { onSelectDoc(key || null); onSelectSession(null); }}
              />
            )}

            {sourceType === 'sessions' && (
              <SelectList
                items={sessions} loading={sessionsLoading} empty={t.noSessions}
                keyFn={s => String(s.id)} label={s => s.title || `Session ${s.id}`}
                selected={selectedSessionId !== null ? String(selectedSessionId) : null}
                onSelect={key => { onSelectSession(key ? Number(key) : null); onSelectDoc(null); }}
              />
            )}
          </>
        )}

        {/* ── Step 2: Writing type ── */}
        {step === 2 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: '#1C3329' }}>{t.writingTypeSec}</h2>
              <p className="text-sm mt-1" style={{ color: '#527061' }}>{he ? 'איזה סוג יצירה תרצה לכתוב?' : 'What kind of piece do you want to write?'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {WRITING_TYPES.map(wt => {
                const label = he ? wt.he : wt.en;
                const active = writingType === wt.id;
                return (
                  <button key={wt.id} onClick={() => onSelectType(wt.id)}
                    className="flex flex-col items-center gap-2 px-4 py-5 rounded-2xl text-center transition-all"
                    style={active
                      ? { background: 'linear-gradient(135deg,#517B3E,#2A3B22)', border: '1.5px solid rgba(81,123,62,0.5)', boxShadow: '0 6px 18px rgba(81,123,62,0.30)' }
                      : tileBase}>
                    <span className="text-3xl leading-none">{wt.emoji}</span>
                    <span className="text-xs font-bold" style={{ color: active ? '#fff' : '#2C4A3B' }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Step 3: Confirmation ── */}
        {step === 3 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: '#1C3329' }}>{he ? 'אישור והתחלה' : 'Confirm & Start'}</h2>
              <p className="text-sm mt-1" style={{ color: '#527061' }}>{he ? 'כל ההגדרות מוכנות — לחץ להתחיל לכתוב' : 'Everything is set — click to start writing'}</p>
            </div>
            <div className="flex flex-col gap-3">
              <SummaryRow emoji="📂" label={he ? 'מקור החומר' : 'Source material'} value={sourceLabel()} />
              <SummaryRow emoji={wtEmoji} label={he ? 'סוג כתיבה' : 'Writing type'} value={wtLabel} />
            </div>

            {/* Page count selector */}
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#1C3329' }}>
                  {he ? 'אורך מוערך (עמודים)' : 'Estimated length (pages)'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#7BA08A' }}>
                  {he ? 'כמה עמודים בערך תרצה שהמסמך יכיל' : 'Roughly how many pages the document should span'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0" style={{
                background: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(157,192,139,0.42)',
                borderRadius: '0.75rem',
                padding: '6px 10px',
              }}>
                <button
                  type="button"
                  onClick={() => setPageCount(p => Math.max(1, p - 1))}
                  disabled={pageCount <= 1}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-base font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: '#2A3B22', background: 'rgba(81,123,62,0.10)' }}
                  aria-label={he ? 'הפחת עמוד' : 'Decrease pages'}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={pageCount}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    if (!Number.isNaN(v)) setPageCount(Math.min(15, Math.max(1, v)));
                  }}
                  className="w-10 text-center text-sm font-bold outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  style={{ color: '#1C3329' }}
                />
                <button
                  type="button"
                  onClick={() => setPageCount(p => Math.min(15, p + 1))}
                  disabled={pageCount >= 15}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-base font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: '#2A3B22', background: 'rgba(81,123,62,0.10)' }}
                  aria-label={he ? 'הוסף עמוד' : 'Increase pages'}
                >
                  +
                </button>
              </div>
            </div>

            {/* Student name — used for the document header & personal writing voice */}
            <div className="flex flex-col gap-1.5 px-1">
              <p className="text-sm font-semibold" style={{ color: '#1C3329' }}>
                {he ? 'שם הסטודנט' : 'Student name'}
              </p>
              <p className="text-xs" style={{ color: '#7BA08A' }}>
                {he ? 'יוצג בראש המסמך והכתיבה תותאם לקול אישי בשמך' : 'Shown at the top of the document and used to write in your personal voice'}
              </p>
              <input
                type="text"
                dir="auto"
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                placeholder={he ? 'לדוגמה: ישראל ישראלי' : 'e.g. Jane Doe'}
                className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
                style={{
                  background:  'rgba(255,255,255,0.50)',
                  border:      '1px solid rgba(157,192,139,0.42)',
                  color:       '#1A2E26',
                }}
                onFocus={e => {
                  e.currentTarget.style.background  = 'rgba(255,255,255,0.80)';
                  e.currentTarget.style.borderColor = 'rgba(81,123,62,0.65)';
                  e.currentTarget.style.boxShadow   = '0 0 0 2px rgba(81,123,62,0.10)';
                }}
                onBlur={e => {
                  e.currentTarget.style.background  = 'rgba(255,255,255,0.50)';
                  e.currentTarget.style.borderColor = 'rgba(157,192,139,0.42)';
                  e.currentTarget.style.boxShadow   = 'none';
                }}
              />
            </div>

            {/* Custom instructions — plain textarea */}
            <textarea
              dir="auto"
              rows={3}
              value={customInstructions}
              onChange={e => setCustomInstructions(e.target.value)}
              placeholder={t.customInstructionsPh}
              className="w-full rounded-xl resize-none outline-none text-sm transition-all"
              style={{
                background:  'rgba(255,255,255,0.50)',
                border:      '1px solid rgba(157,192,139,0.42)',
                color:       '#1A2E26',
                padding:     '14px 16px',
                lineHeight:  1.65,
                fontFamily:  'inherit',
                height:      96,
              }}
              onFocus={e => {
                e.currentTarget.style.background    = 'rgba(255,255,255,0.80)';
                e.currentTarget.style.borderColor   = 'rgba(81,123,62,0.65)';
                e.currentTarget.style.boxShadow     = '0 0 0 2px rgba(81,123,62,0.10)';
              }}
              onBlur={e => {
                e.currentTarget.style.background    = 'rgba(255,255,255,0.50)';
                e.currentTarget.style.borderColor   = 'rgba(157,192,139,0.42)';
                e.currentTarget.style.boxShadow     = 'none';
              }}
            />

            {/* Personal style toggle */}
            <div className="flex items-center gap-3 px-1">
              <ToggleSwitch checked={usePersonalStyle} onChange={setUsePersonalStyle} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#1C3329' }}>{t.personalStyleLabel}</p>
                <p className="text-xs mt-0.5" style={{ color: '#7BA08A' }}>
                  {he ? 'התאם את הכתיבה לסגנון אישי וישיר' : 'Adapts the output to a personal, direct voice'}
                </p>
              </div>
            </div>

            {/* Include sources toggle */}
            <div className="flex items-center gap-3 px-1">
              <ToggleSwitch checked={includeSources} onChange={setIncludeSources} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: '#1C3329' }}>{he ? 'הוסף מקורות' : 'Add sources'}</p>
                <p className="text-xs mt-0.5" style={{ color: '#7BA08A' }}>
                  {he ? 'ציין מאיזה קובץ נלקח המידע בסוף כל פסקה' : 'Cite which file each paragraph draws from'}
                </p>
              </div>
            </div>

            <button onClick={() => onStart(customInstructions, usePersonalStyle, includeSources, pageCount, studentName.trim())}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl text-base font-bold text-white transition-all active:scale-[0.98] mt-2"
              style={{ background: 'linear-gradient(135deg,#517B3E,#2A3B22)', boxShadow: '0 8px 28px rgba(81,123,62,0.42)' }}>
              <IconPen className="w-5 h-5" />
              {t.startWriting}
            </button>
          </>
        )}
      </div>

      {/* Navigation row */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => step > 1 ? setStep(s => (s - 1) as 1 | 2 | 3) : router.push('/dashboard')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-gray-500 hover:text-gray-800 hover:bg-gray-100/50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={he ? 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3' : 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18'} />
          </svg>
          {step === 1 ? (he ? 'ביטול' : 'Cancel') : (he ? 'הקודם' : 'Back')}
        </button>

        {step < 3 && (
          <button
            onClick={() => setStep(s => (s < 3 ? (s + 1) as 1 | 2 | 3 : s))}
            disabled={step === 1 ? !step1Ready : !step2Ready}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed"
            style={(step === 1 ? step1Ready : step2Ready)
              ? { background: 'linear-gradient(135deg,#517B3E,#2A3B22)', boxShadow: '0 4px 16px rgba(81,123,62,0.35)' }
              : { background: 'rgba(157,192,139,0.35)' }}>
            {he ? 'הבא' : 'Next'}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={he ? 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18' : 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3'} />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Writing panel — Co-Writer mode (paragraph-by-paragraph) ───────────── */
function WritingPanel({
  t, he, hasDoc, writingType, onBack, wizardInstructions, usePersonalStyle, includeSources, pageCount, studentName,
  userFirstName, userLastName,
}: {
  t: TType; he: boolean; hasDoc: boolean;
  writingType: WritingTypeId | null;
  onBack: () => void;
  wizardInstructions: string;
  usePersonalStyle: boolean;
  includeSources: boolean;
  pageCount: number;
  studentName: string;
  userFirstName: string;
  userLastName: string;
}) {
  const { selectedCourse } = useCourse();
  const formattedDate = useMemo(
    () => new Date().toLocaleDateString(he ? 'he-IL' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    [he],
  );
  const [topic,              setTopic]              = useState('');
  const [loading,            setLoading]            = useState(false);
  const [isStreamingDraft,   setIsStreamingDraft]   = useState(false);
  const [error,              setError]              = useState<string | null>(null);
  const [approvedParagraphs, setApprovedParagraphs] = useState<string[]>([]);
  const [currentDraft,       setCurrentDraft]       = useState<string | null>(null);
  const [waitingForFeedback, setWaitingForFeedback] = useState(false);
  const [userFeedback,       setUserFeedback]       = useState('');
  const [isFinished,         setIsFinished]         = useState(false);
  const [downloading,        setDownloading]        = useState(false);
  const [downloadingWord,    setDownloadingWord]    = useState(false);
  const [copied,             setCopied]             = useState(false);
  const [editMode,           setEditMode]           = useState(false);
  const [editedContent,      setEditedContent]      = useState<string | null>(null);
  // Parallel HTML arrays — populated from backend paper_html for rich display
  const [approvedParagraphsHtml, setApprovedParagraphsHtml] = useState<string[]>([]);
  const [currentDraftHtml,       setCurrentDraftHtml]       = useState<string | null>(null);
  const [paperFullHtml,          setPaperFullHtml]           = useState<string | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);

  const wtLabel = writingType
    ? (he ? WRITING_TYPES.find(w => w.id === writingType)?.he : WRITING_TYPES.find(w => w.id === writingType)?.en) ?? ''
    : '';

  const isStarted = approvedParagraphs.length > 0 || waitingForFeedback || loading || isFinished;

  useEffect(() => {
    if (waitingForFeedback && reviewRef.current) {
      setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
    }
  }, [waitingForFeedback, currentDraft]);

  const generateParagraph = useCallback(async (
    paragraphNum: number, approved: string[], feedback: string,
  ) => {
    if (!topic.trim() || !hasDoc) return;
    setLoading(true);
    setError(null);
    setWaitingForFeedback(false);
    setUserFeedback('');
    setCurrentDraft(null);

    // Safe type-hint mapping: avoids "essay", "research paper", "כתוב", "עבודה"
    // which trip the model's homework-detection filter.
    const TYPE_HINT_SAFE: Record<string, { he: string; en: string }> = {
      essay:    { he: 'טקסט רהוט עם מבנה ופסקאות ברורות',  en: 'fluent, well-structured prose'       },
      research: { he: 'דוח מפורט עם ניתוח מקצועי',          en: 'detailed analytical professional report' },
      summary:  { he: 'סיכום תמציתי ומובנה',                en: 'concise structured overview'          },
      email:    { he: 'מכתב עסקי רשמי',                     en: 'formal business correspondence'       },
    };
    const safeHint = writingType ? TYPE_HINT_SAFE[writingType] : null;
    const typeHint  = safeHint
      ? (he ? `עצב את הטקסט כ${safeHint.he}.` : `Format the output as ${safeHint.en}.`)
      : '';
    const styleHint = usePersonalStyle
      ? (he ? 'עצב בסגנון אישי וטבעי, לא פורמלי מדי.' : 'Use a personal, natural voice — not overly formal.')
      : '';
    const nameHint = studentName.trim()
      ? (he
          ? `כתוב מסמך זה כאילו הסטודנט/ית ${studentName.trim()} כתב/ה אותו בעצמו/ה — בקול אקדמי טבעי, מגובש ואישי. הימנע מפתיחות שנשמעות כמו AI, והשתמש בחשיבה ביקורתית וזרימה לוגית כפי שסטודנט/ית היה/הייתה כותב/ת.`
          : `Write this document as if the student ${studentName.trim()} wrote it themselves — in a natural, cohesive, personal academic voice. Avoid generic "AI-sounding" intros, and use the kind of critical thinking and logical flow a student would have.`)
      : '';

    const prevContext = approved.length > 0
      ? approved.map((p, i) => `[Section ${i + 1}]:\n${p}`).join('\n\n---\n\n')
      : '';

    const isFirstSection = approved.length === 0;

    const constraint = [
      'IMPORTANT: Generate ONLY the next single section of the document — '
        + 'one logical chunk of about 10–15 lines.',
      'Do NOT write the full document in one go — only the single section described below.',
      isFirstSection
        ? 'CRITICAL — THIS IS THE OPENING OF THE DOCUMENT: you MUST start your output with '
          + 'a single main document title on its own line using Markdown level-1 syntax — '
          + '`# [Title Name]` — a polished academic title capturing the essence of the topic. '
          + 'Do NOT start with paragraph text or skip the title. Immediately after the title, '
          + 'add the introduction heading `## מבוא` on its own line, and only then begin the '
          + "introduction's opening paragraph."
        : 'Do NOT include a top-level `# Title` — the document title was already generated '
          + 'in the first section above; never repeat or duplicate it.',
      'STRICT MARKDOWN STRUCTURE RULE — mandatory: if this section opens a new logical '
        + 'part of the document (e.g., a new argument/topic, a conclusion), '
        + 'it MUST start with a real Markdown heading on its own line — '
        + '`## גוף הדיון`, `## סיכום`, etc. (use `###` for sub-points within a section). '
        + 'NEVER write section names as plain inline prose like "במבוא זה..." or "לסיכום, ...". '
        + 'If this section continues the SAME part as the previous one, do not repeat its heading — '
        + 'just continue the prose.',
      'Do NOT force-bold or highlight keywords unless absolutely necessary for the clarity '
        + 'of a specific technical term — write naturally, as a professional academic '
        + 'researcher would, and prioritize readability and flow over stylistic decoration.',
      `This is section number ${paragraphNum + 1}.`,
      approved.length > 0
        ? `The following sections have already been written and approved (do not repeat their headings, including the title):\n\n${prevContext}`
        : '',
      feedback.trim()
        ? `The user requested this revision to the previous draft: "${feedback.trim()}". Address this feedback carefully.`
        : '',
      includeSources
        ? 'When relevant, briefly note which source file a claim comes from, e.g. (Source: filename.pdf).'
        : 'CRITICAL: DO NOT include any references, citations, or source file names anywhere in the text. Output ONLY clean prose.',
      'Output only the section content (its heading, if any, plus its prose) — '
        + 'no extra labels, numbers, or commentary.',
    ].filter(Boolean).join('\n');

    setIsStreamingDraft(true);
    try {
      const res = await authFetch(`${API}/generate-paper`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          instructions: [typeHint, styleHint, nameHint, wizardInstructions, constraint].filter(Boolean).join('\n\n'),
          pageCount,
          studentName: studentName.trim() || null,
          courseId:   selectedCourse?.id   ?? null,
          courseName: selectedCourse?.name ?? null,
        }),
      });

      // Validation errors (no docs, missing topic, etc.) come back as plain JSON,
      // not an SSE stream — handle those before attempting to read the body as a stream.
      if (!res.ok) {
        const errData = await res.json().catch(() => ({} as { error?: string }));
        setError(errData.error ?? t.paperErr);
        return;
      }
      if (!res.body) throw new Error('No response body');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', streamedText = '', firstDelta = true, gotResult = false, done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let parsed: { type: string; text?: string; paper?: string; paper_html?: string; message?: string };
          try { parsed = JSON.parse(line.slice(6)); }
          catch { continue; }

          if (parsed.type === 'delta' && parsed.text) {
            streamedText += parsed.text;
            if (firstDelta) {
              firstDelta = false;
              setLoading(false);
              setWaitingForFeedback(true);
            }
            // Render the raw Markdown live as it streams in — typed-out ChatGPT-style effect.
            // The polished `paper_html` (with KaTeX/Pygments) replaces it once the 'result' event lands.
            setCurrentDraft(streamedText);
            setCurrentDraftHtml(null);
          } else if (parsed.type === 'result') {
            gotResult = true;
            setCurrentDraft(parsed.paper ?? streamedText);
            setCurrentDraftHtml(parsed.paper_html ?? null);
            setWaitingForFeedback(true);
            done = true;
            break;
          } else if (parsed.type === 'error') {
            throw new Error(parsed.message ?? t.paperErr);
          }
        }
      }
      if (!gotResult && !streamedText) throw new Error(t.paperErr);
    } catch (err) {
      // Surface the raw fetch error (CORS / network / DNS) — "Cannot connect"
      // toasts alone don't distinguish a dead backend from a CORS rejection.
      console.error('[academic-writing] generate-paper request failed:', err);
      setError(err instanceof Error ? err.message : t.serverErr);
      setCurrentDraft(null);
      setCurrentDraftHtml(null);
      setWaitingForFeedback(false);
    }
    finally { setLoading(false); setIsStreamingDraft(false); }
  }, [topic, hasDoc, writingType, wtLabel, he, usePersonalStyle, includeSources, wizardInstructions, pageCount, studentName, selectedCourse, t]);

  const approveAndContinue = () => {
    if (!currentDraft) return;
    const next     = [...approvedParagraphs,     currentDraft];
    const nextHtml = [...approvedParagraphsHtml, currentDraftHtml ?? ''];
    setApprovedParagraphs(next);
    setApprovedParagraphsHtml(nextHtml);
    setCurrentDraft(null);
    setCurrentDraftHtml(null);
    setWaitingForFeedback(false);
    generateParagraph(next.length, next, '');
  };

  const regenerateWithFeedback = () => {
    generateParagraph(approvedParagraphs.length, approvedParagraphs, userFeedback);
  };

  const finishDocument = () => {
    const final     = currentDraft     ? [...approvedParagraphs,     currentDraft]     : [...approvedParagraphs];
    const finalHtml = currentDraftHtml ? [...approvedParagraphsHtml, currentDraftHtml] : [...approvedParagraphsHtml];
    setApprovedParagraphs(final);
    setApprovedParagraphsHtml(finalHtml);
    setEditedContent(final.join('\n\n'));
    setPaperFullHtml(finalHtml.filter(Boolean).join('\n') || null);
    setCurrentDraft(null);
    setCurrentDraftHtml(null);
    setWaitingForFeedback(false);
    setIsFinished(true);
    setEditMode(false);
  };

  const resetSession = () => {
    setApprovedParagraphs([]); setApprovedParagraphsHtml([]);
    setCurrentDraft(null);     setCurrentDraftHtml(null);
    setPaperFullHtml(null);
    setWaitingForFeedback(false); setIsFinished(false);
    setEditMode(false); setEditedContent(null);
    setError(null); setUserFeedback('');
  };

  const safeTitle = () => topic.trim().slice(0, 40).replace(/[^\w֐-׿\s-]/g, '') || 'paper';

  const downloadPdf = async () => {
    const text = editedContent ?? approvedParagraphs.join('\n\n');
    if (!text || downloading) return;
    setDownloading(true);
    try {
      const res = await authFetch(`${API}/export-pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: `u-note-${safeTitle()}.pdf` }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t.exportErr);
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `u-note-${safeTitle()}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
    finally { setDownloading(false); }
  };

  const downloadWord = async () => {
    const text = editedContent ?? approvedParagraphs.join('\n\n');
    if (!text || downloadingWord) return;
    setDownloadingWord(true);
    try {
      const res = await authFetch(`${API}/export-docx`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: `u-note-${safeTitle()}.docx` }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t.wordErr);
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `u-note-${safeTitle()}.docx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
    finally { setDownloadingWord(false); }
  };

  return (
    <div className="flex flex-col flex-1 min-h-[600px] w-full max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-8">
      <div className="rounded-2xl flex flex-col flex-1" style={{
        background: 'rgba(232,239,229,0.92)', border: '1px solid rgba(155,180,148,0.35)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.04)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid rgba(157,192,139,0.3)' }}>
          <button onClick={onBack} className="p-1.5 rounded-lg transition-all hover:bg-black/05 shrink-0" title={t.backToConfig}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={he ? 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3' : 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18'} />
            </svg>
          </button>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #9DC08B, #517B3E)' }}>
            <IconPen className="w-5 h-5 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#2A3B22] text-sm">{t.paperTitle}</p>
            <p className="text-xs text-[#7a9268]">
              {isFinished
                ? (he ? `✅ ${approvedParagraphs.length} פסקאות · מוכן` : `✅ ${approvedParagraphs.length} paragraphs · Ready`)
                : waitingForFeedback
                  ? (he ? `סוקר פסקה ${approvedParagraphs.length + 1}` : `Reviewing paragraph ${approvedParagraphs.length + 1}`)
                  : loading
                    ? (he ? `כותב פסקה ${approvedParagraphs.length + 1}...` : `Writing paragraph ${approvedParagraphs.length + 1}…`)
                    : he ? 'מצב כתיבה משותפת' : 'Co-Writer mode'}
            </p>
          </div>
          {isFinished && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={downloadWord} disabled={downloadingWord}
                className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-all active:scale-95"
                style={{ backgroundColor: downloadingWord ? 'rgba(157,192,139,0.4)' : '#2d6a9f' }}>
                <IconWord className="w-3.5 h-3.5" />{downloadingWord ? t.exporting : t.downloadWord}
              </button>
              <button onClick={downloadPdf} disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-bold rounded-lg transition-all active:scale-95"
                style={{ backgroundColor: downloading ? 'rgba(157,192,139,0.4)' : '#517B3E' }}>
                <IconDownload className="w-3.5 h-3.5" />{downloading ? t.exporting : t.downloadPdf}
              </button>
              <button
                onClick={() => {
                  if (editMode) {
                    setEditMode(false);
                  } else {
                    setEditMode(true);
                    if (editedContent === null) setEditedContent(approvedParagraphs.join('\n\n'));
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                style={editMode
                  ? { background: 'rgba(81,123,62,0.15)', border: '1px solid rgba(81,123,62,0.35)', color: '#517B3E' }
                  : { background: 'rgba(255,255,255,0.80)', border: '1px solid rgba(157,192,139,0.45)', color: '#527061' }}>
                <IconPen className="w-3.5 h-3.5" />
                {editMode ? (he ? 'סיום עריכה' : 'Done Editing') : (he ? 'ערוך מסמך' : 'Edit Document')}
              </button>
              <button onClick={resetSession} title={he ? 'כתיבה חדשה' : 'New document'}
                className="p-1.5 rounded-lg hover:bg-black/05 transition-all text-[#7a9268] hover:text-[#2d3b25]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* ── Scrollable content ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 flex flex-col gap-4">

          {/* Empty / topic entry */}
          {!isStarted && (
            <div className="flex flex-col items-center justify-center gap-5 py-8 text-center flex-1">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.15)' }}>
                <IconPen className="w-10 h-10 text-[#9DC08B]" />
              </div>
              <div>
                <p className="font-semibold text-[#2d3b25]">{he ? 'מצב כתיבה משותפת' : 'Co-Writer Mode'}</p>
                <p className="text-sm text-[#7a9268] mt-1 max-w-sm">
                  {he ? 'ה-AI יכתוב פסקה אחת בכל פעם. תוכל לאשר, לתקן, ולהמשיך עד שהמסמך מוכן.' : 'The AI writes one paragraph at a time. Approve, revise, or give feedback — until your document is ready.'}
                </p>
              </div>
              <div className="w-full max-w-md flex flex-col gap-3">
                <input type="text" value={topic} onChange={e => setTopic(e.target.value)} dir="auto"
                  placeholder={t.topicPh}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{ border: '1px solid rgba(157,192,139,0.4)', background: 'rgba(255,255,255,0.80)', color: '#2A3B22' }}
                  onKeyDown={e => { if (e.key === 'Enter' && topic.trim() && hasDoc) generateParagraph(0, [], ''); }} />
                <button onClick={() => generateParagraph(0, [], '')} disabled={!topic.trim() || !hasDoc}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-bold transition-all active:scale-[0.99] disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ backgroundColor: (topic.trim() && hasDoc) ? '#517B3E' : 'rgba(157,192,139,0.4)' }}>
                  <IconPen className="w-4 h-4" />{he ? 'התחל לכתוב' : 'Start Writing'}
                </button>
                {!hasDoc && <p className="text-xs text-red-500 text-center">{he ? 'נדרש לפחות מסמך אחד מועלה' : 'At least one uploaded document is required'}</p>}
              </div>
              <div>
                <p className="text-xs text-[#7a9268] mb-2">{t.suggestedTopics}</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                  {t.topicChips.map(chip => (
                    <button key={chip} onClick={() => { setTopic(chip); generateParagraph(0, [], ''); }}
                      className="px-4 py-2 text-xs rounded-full transition-all hover:scale-[1.02]"
                      style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.2)', color: '#517B3E' }}>
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-950/50 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
              <IconX className="w-4 h-4 shrink-0" />{error}
              <button onClick={() => setError(null)} className="ms-auto opacity-60 hover:opacity-100"><IconX className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* Approved paragraphs — assembled document so far */}
          {approvedParagraphs.length > 0 && (
            <div dir="rtl" className="bg-white shadow-sm border border-slate-100 rounded-2xl p-6 sm:p-8">
              <div className="mb-5">
                <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-sm font-medium inline-flex items-center gap-2 border border-emerald-100">
                  <IconCheck className="w-3.5 h-3.5" />
                  {he ? `${approvedParagraphs.length} פסקאות אושרו` : `${approvedParagraphs.length} approved paragraph${approvedParagraphs.length > 1 ? 's' : ''}`}
                </div>
              </div>
              {approvedParagraphs.map((para, i) => (
                approvedParagraphsHtml[i]
                  ? <RenderedHtml key={i} html={approvedParagraphsHtml[i]}
                      className="text-base text-slate-700 leading-loose text-right mb-4 prose-para" />
                  : <ReactMarkdown key={i}
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000', strict: false }]]}
                      components={{
                        h1: ({ children }) => <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-8 mt-2 text-center underline decoration-emerald-500/30 underline-offset-8">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-2xl font-bold text-slate-800 mb-4 mt-8 border-b border-slate-200 pb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-lg font-bold text-slate-800 mt-5 mb-3">{children}</h3>,
                        p: ({ children }) => <p className="text-base leading-relaxed mb-4 text-slate-700" style={{ textAlign: 'right' }}>{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                        em: ({ children }) => <em className="italic text-slate-600">{children}</em>,
                      }}>
                      {preprocessMath(para)}
                    </ReactMarkdown>
              ))}
            </div>
          )}

          {/* Generating spinner */}
          {loading && (
            <div className="flex items-center justify-center gap-3 py-8 px-6 rounded-xl animate-pulse bg-emerald-50/50">
              <span className="text-xl leading-none">✨</span>
              <p className="text-sm font-medium text-emerald-700">
                {he ? 'ה-AI מנסח את הפסקה הבאה...' : 'AI is drafting the next paragraph…'}
              </p>
            </div>
          )}

          {/* Current draft — review card */}
          {waitingForFeedback && currentDraft && (
            <div ref={reviewRef} className="rounded-xl overflow-hidden"
              style={{ border: '2px solid rgba(81,123,62,0.5)', background: 'rgba(255,255,255,0.96)', boxShadow: '0 4px 20px rgba(81,123,62,0.12)' }}>
              <div className="px-4 py-3 flex items-center gap-2"
                style={{ background: 'rgba(81,123,62,0.08)', borderBottom: '1px solid rgba(81,123,62,0.18)' }}>
                <div className="w-2 h-2 rounded-full bg-[#517B3E] animate-pulse" />
                <p className="text-xs font-bold text-[#517B3E] uppercase tracking-wider">
                  {isStreamingDraft
                    ? (he ? `✨ פסקה ${approvedParagraphs.length + 1} — ה-AI מקליד...` : `✨ Paragraph ${approvedParagraphs.length + 1} — AI is typing…`)
                    : (he ? `פסקה ${approvedParagraphs.length + 1} — ממתינה לאישורך` : `Paragraph ${approvedParagraphs.length + 1} — Awaiting your review`)}
                </p>
              </div>
              <div dir="rtl" className="px-6 py-5">
                {currentDraftHtml
                  ? <RenderedHtml html={currentDraftHtml} className="text-base text-slate-700 leading-loose text-right prose-para" />
                  : <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000', strict: false }]]}
                      components={{
                        h1: ({ children }) => <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-8 mt-2 text-center underline decoration-emerald-500/30 underline-offset-8">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-2xl font-bold text-slate-800 mb-4 mt-8 border-b border-slate-200 pb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-lg font-bold text-slate-800 mt-5 mb-3">{children}</h3>,
                        p: ({ children }) => <p className="text-base leading-relaxed mb-4 text-slate-700" style={{ textAlign: 'right' }}>{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                        em: ({ children }) => <em className="italic text-slate-600">{children}</em>,
                      }}>
                      {preprocessMath(currentDraft)}
                    </ReactMarkdown>
                }
              </div>
              <div className="px-4 pb-4 pt-3 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(157,192,139,0.22)' }}>
                <textarea
                  value={userFeedback} onChange={e => setUserFeedback(e.target.value)}
                  dir="auto" rows={2}
                  placeholder={he ? 'הערות לפסקה זו (אופציונלי)...' : 'Notes for this paragraph (optional)...'}
                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                  style={{ border: '1px solid rgba(157,192,139,0.4)', background: 'rgba(255,255,255,0.80)', color: '#2A3B22' }} />
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={approveAndContinue} disabled={isStreamingDraft}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    style={{ background: 'linear-gradient(135deg,#517B3E,#2A3B22)', boxShadow: '0 3px 14px rgba(81,123,62,0.32)' }}>
                    <IconCheck className="w-4 h-4" />
                    {he ? 'אשר והמשך לפסקה הבאה' : 'Approve & Continue'}
                  </button>
                  <button onClick={regenerateWithFeedback} disabled={isStreamingDraft}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    style={{ background: 'rgba(255,255,255,0.80)', border: '1px solid rgba(157,192,139,0.5)', color: '#527061' }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    {he ? 'תקן לפי ההערות' : 'Regenerate with Feedback'}
                  </button>
                  <button onClick={finishDocument} disabled={isStreamingDraft}
                    className="sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-gray-500 hover:text-gray-800 hover:bg-gray-100/50 disabled:opacity-50 disabled:cursor-not-allowed">
                    {he ? 'סיים כתיבה' : 'Finish Document'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Finished — full assembled document */}
          {isFinished && approvedParagraphs.length > 0 && (
            <div dir="rtl" className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(157,192,139,0.3)' }}>
              {/* Finished toolbar */}
              <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap"
                style={{ borderBottom: '1px solid rgba(157,192,139,0.25)', background: 'rgba(81,123,62,0.05)' }}>
                <div className="flex items-center gap-2">
                  <IconCheck className="w-4 h-4 text-[#517B3E]" />
                  <p className="text-sm font-bold text-[#2A3B22]">{topic}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(editedContent ?? approvedParagraphs.join('\n\n'));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    style={{ background: copied ? 'rgba(81,123,62,0.15)' : 'rgba(255,255,255,0.80)', border: '1px solid rgba(157,192,139,0.45)', color: copied ? '#517B3E' : '#527061' }}>
                    {copied ? (
                      <><IconCheck className="w-3.5 h-3.5" />{he ? 'הועתק!' : 'Copied!'}</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                      {he ? 'העתק טקסט מלא' : 'Copy Full Text'}</>
                    )}
                  </button>
                  <button
                    onClick={() => { setIsFinished(false); setCurrentDraft(null); setWaitingForFeedback(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:bg-gray-100/50"
                    style={{ border: '1px solid rgba(157,192,139,0.45)', color: '#527061' }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={he ? 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3' : 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18'} />
                    </svg>
                    {he ? 'חזור לעריכה' : 'Back to editing'}
                  </button>
                </div>
              </div>
              {editMode ? (
                /* ── Rich editor mode ───────────────────────────────────── */
                <div className="p-4">
                  <AcademicRichEditor
                    value={editedContent ?? approvedParagraphs.join('\n\n')}
                    onChange={(val: string) => { setEditedContent(val); setPaperFullHtml(null); }}
                    he={he}
                    placeholder={he ? 'ערוך את המסמך...' : 'Edit your document...'}
                    minHeight={500}
                  />
                  <p className="text-[11px] mt-2 text-center" style={{ color: '#7BA08A' }}>
                    {he
                      ? 'תמיכה ב-Markdown מלא · משוואות LaTeX ($…$) · בלוקי קוד · תמונות'
                      : 'Full Markdown · LaTeX equations ($…$) · Syntax-highlighted code blocks · Images'}
                  </p>
                </div>
              ) : (
                /* ── Read-only "Page View" — A4-style document, ready for submission ── */
                <div className="px-3 sm:px-8 py-10" style={{ background: '#EEF2EF' }}>
                  <div
                    dir="rtl"
                    className="bg-white shadow-lg border border-slate-200 max-w-4xl mx-auto py-16 px-12"
                    style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#1f2937' }}
                  >
                    {/* Document header — student metadata, shown for personal-style / named documents */}
                    {(() => {
                      const displayName = studentName.trim() || [userFirstName, userLastName].filter(Boolean).join(' ');
                      if (!usePersonalStyle && !displayName) return null;
                      return (
                        <div className="border-b-2 border-slate-800 pb-4 mb-10">
                          {displayName && (
                            <p className="text-right font-bold text-slate-900 mb-2 leading-[1.8]">
                              {he ? `שם הסטודנט: ${displayName}` : `Student name: ${displayName}`}
                            </p>
                          )}
                          <p className="text-right font-bold text-slate-900 mb-2 leading-[1.8]">
                            {he ? `תאריך: ${formattedDate}` : `Date: ${formattedDate}`}
                          </p>
                          <p className="text-right text-slate-700 leading-[1.8]">
                            {he ? `נושא: ${topic}` : `Topic: ${topic}`}
                          </p>
                        </div>
                      );
                    })()}

                    <div className="leading-[1.8]">
                    {paperFullHtml
                      ? <RenderedHtml
                          html={paperFullHtml}
                          className="paper-rendered-html text-base leading-[1.8]"
                        />
                      : <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000', strict: false }]]}
                          components={{
                            pre: CodeBlockPre,
                            code: ({ className, children }) => {
                              if (className) return <code dir="ltr" className={`${className} text-[#9DC08B] text-[11px] font-mono leading-relaxed`} style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'embed' }}>{children}</code>;
                              return <InlineCode>{children}</InlineCode>;
                            },
                            h1: ({ children }) => <h1 className="text-3xl font-bold mb-8 mt-2 pb-3 text-center" style={{ color: '#1f2937', borderBottom: '1px solid #e2e8f0' }}>{children}</h1>,
                            h2: ({ children }) => <h2 className="text-xl font-bold mt-8 mb-4 pb-2" style={{ color: '#1f2937', borderBottom: '1px solid #e2e8f0' }}>{children}</h2>,
                            h3: ({ children }) => <h3 className="text-lg font-semibold mt-6 mb-3" style={{ color: '#1f2937' }}>{children}</h3>,
                            p:  ({ children }) => <p className="text-base leading-[1.8] mb-4" style={{ color: '#1f2937', textAlign: 'justify' }}>{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold" style={{ color: '#0f172a' }}>{children}</strong>,
                            em:     ({ children }) => <em className="italic" style={{ color: '#374151' }}>{children}</em>,
                            ul: ({ children }) => <ul className="list-disc mb-4 space-y-1.5 text-base leading-[1.8] pe-5">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal mb-4 space-y-1.5 text-base leading-[1.8] pe-5">{children}</ol>,
                            li: ({ children }) => <li className="text-base leading-[1.8]" style={{ color: '#1f2937' }}>{children}</li>,
                            blockquote: ({ children }) => (
                              <blockquote className="pr-4 my-4 italic text-base leading-[1.8] py-2 rounded-sm" style={{ borderRight: '4px solid #cbd5e1', background: '#f8fafc', color: '#374151' }}>{children}</blockquote>
                            ),
                            hr: () => <hr className="my-8" style={{ borderColor: '#e2e8f0' }} />,
                            table: ({ children }) => <div className="overflow-x-auto my-4"><table className="w-full text-sm border-collapse">{children}</table></div>,
                            th: ({ children }) => <th className="px-3 py-2 font-semibold text-right" style={{ border: '1px solid #e2e8f0', background: '#f8fafc', color: '#1f2937' }}>{children}</th>,
                            td: ({ children }) => <td className="px-3 py-2 text-right" style={{ border: '1px solid #e2e8f0', color: '#374151' }}>{children}</td>,
                            a: ({ href, children }) => {
                              const safeHref = href && /^https?:\/\//i.test(href) ? href : '#';
                              return <a href={safeHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:opacity-75" style={{ color: '#517B3E' }}>{children}</a>;
                            },
                          }}>
                          {preprocessMath(editedContent ?? approvedParagraphs.join('\n\n'))}
                        </ReactMarkdown>
                    }
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: progress indicator while writing, hidden when finished */}
        {isStarted && !isFinished && !loading && !waitingForFeedback && (
          <div className="px-5 pb-3 pt-2 shrink-0 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(157,192,139,0.3)' }}>
            <p className="text-xs text-[#7a9268]">
              {he ? `${approvedParagraphs.length} פסקאות אושרו` : `${approvedParagraphs.length} paragraph${approvedParagraphs.length !== 1 ? 's' : ''} approved`}
            </p>
            {approvedParagraphs.length > 0 && (
              <button onClick={finishDocument}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors text-[#527061] hover:text-[#2d3b25] hover:bg-[#EEF5F0]">
                {he ? 'סיים כתיבה' : 'Finish Document'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function AcademicWritingPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { lang, toggleLanguage } = useLanguage();
  const he = lang === 'he';
  const t  = (he ? TR.he : TR.en) as TType;

  /* Shell state */
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [headerScrolled,  setHeaderScrolled]  = useState(false);

  /* Config state */
  const [phase,             setPhase]             = useState<'config' | 'writing'>('config');
  const [wizardInstructions,  setWizardInstructions]  = useState('');
  const [wizardPersonalStyle,  setWizardPersonalStyle]  = useState(false);
  const [wizardIncludeSources, setWizardIncludeSources] = useState(false);
  const [wizardPageCount,      setWizardPageCount]      = useState(1);
  const [wizardStudentName,    setWizardStudentName]    = useState('');
  const [sessions,          setSessions]           = useState<SessionInfo[]>([]);
  const [docs,              setDocs]               = useState<DocInfo[]>([]);
  const [sessionsLoading,   setSessionsLoading]    = useState(true);
  const [docsLoading,       setDocsLoading]        = useState(true);
  const [selectedSessionId, setSelectedSessionId]  = useState<number | null>(null);
  const [selectedDocId,     setSelectedDocId]      = useState<string | null>(null);
  const [writingType,       setWritingType]        = useState<WritingTypeId | null>(null);
  const [uploadedFiles,     setUploadedFiles]      = useState<UploadedFile[]>([]);
  const [uploading,         setUploading]          = useState(false);
  const [uploadError,       setUploadError]        = useState<string | null>(null);
  const [hasDoc,            setHasDoc]             = useState(false);

  /* User info */
  const [isAdmin]       = useState(() => typeof window !== 'undefined' ? (() => { const tk = localStorage.getItem('levy_ai_token'); if (!tk) return false; return decodeJwtPayload(tk)?.is_admin === true; })() : false);
  const [userEmail]     = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_email')      ?? '') : '');
  const [userFirstName] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_first_name') ?? '') : '');
  const [userLastName]  = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_last_name')  ?? '') : '');
  const [userGender]    = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_gender')     ?? '') : '');
  const userInitials = [userFirstName[0], userLastName[0]].filter(Boolean).join('').toUpperCase() || (userEmail ? userEmail.slice(0, 2).toUpperCase() : '?');

  /* Guards */
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
    const k = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setSidebarOpen(false); setShowLogoutModal(false); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  /* Fetch sessions + documents */
  useEffect(() => {
    if (!authUser) return;
    authFetch(`${API}/sessions`)
      .then(r => r.ok ? r.json() : [])
      .then((data: SessionInfo[]) => { setSessions(Array.isArray(data) ? data.slice(0, 20) : []); })
      .catch(() => { setSessions([]); })
      .finally(() => setSessionsLoading(false));

    authFetch(`${API}/documents`)
      .then(r => r.ok ? r.json() : { documents: [] })
      .then((data: { documents: DocInfo[] }) => {
        const arr = Array.isArray(data.documents) ? data.documents : [];
        setDocs(arr);
        // Use OR so restoring uploadedFiles from storage isn't clobbered
        // by an empty docs response arriving after the load effect runs.
        setHasDoc(prev => prev || arr.length > 0);
      })
      .catch(() => { setDocs([]); })
      .finally(() => setDocsLoading(false));
  }, [authUser]);

  /* Restore uploaded files from the previous session (localStorage) */
  useEffect(() => {
    Promise.resolve(localStorage.getItem(UPLOADS_STORAGE_KEY))
      .then(saved => {
        if (!saved) return;
        try {
          const parsed = JSON.parse(saved) as UploadedFile[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setUploadedFiles(parsed);
            setHasDoc(true);
          }
        } catch { /* ignore stale / corrupt data */ }
      });
  }, []);

  /* Persist uploaded files whenever the list changes */
  useEffect(() => {
    if (uploadedFiles.length > 0) {
      localStorage.setItem(UPLOADS_STORAGE_KEY, JSON.stringify(uploadedFiles));
    } else {
      localStorage.removeItem(UPLOADS_STORAGE_KEY);
    }
  }, [uploadedFiles]);

  /* File upload */
  const handleDrop = useCallback(async (files: File[]) => {
    if (!files.length || uploading) return;
    setUploading(true);
    try {
      // Send all files in one multipart request — backend expects field name "files" (plural)
      const fd = new FormData();
      for (const file of files) fd.append('files', file);
      const res  = await authFetch(`${API}/upload-pdf`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        console.error('[Academic Writing] upload failed:', data.error ?? res.status);
        setUploadError(data.error ?? (he ? 'שגיאה בהעלאת הקובץ' : 'Upload failed'));
        return;
      }
      // Backend returns { files: [{source, file_id, chunks_stored, already_indexed, ...}] }
      const uploaded: UploadedFile[] = (data.files ?? []).map((f: { source: string; file_id: string }) => {
        const original = files.find(file => file.name === f.source) ?? files[0];
        return { name: f.source, size: original?.size ?? 0, fileId: f.file_id ?? '' };
      });
      if (uploaded.length) {
        setUploadedFiles(prev => [...prev, ...uploaded]);
        setHasDoc(true);
        setUploadError(null);
        // Refresh the "מסמכים שהועלו" tab so the new file appears there immediately
        authFetch(`${API}/documents`)
          .then(r => r.ok ? r.json() : { documents: [] })
          .then((d: { documents: DocInfo[] }) => {
            if (Array.isArray(d.documents)) setDocs(d.documents);
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('[Academic Writing] upload error:', err);
      setUploadError(he ? 'שגיאה בחיבור לשרת' : 'Cannot reach server');
    } finally {
      setUploading(false);
    }
  }, [uploading, he]);

  const handleRemoveFile = useCallback((fileToRemove: UploadedFile) => {
    const remaining = uploadedFiles.filter(f => f.fileId !== fileToRemove.fileId);
    setUploadedFiles(remaining);
    if (remaining.length === 0) setHasDoc(docs.length > 0);
  }, [uploadedFiles, docs]);

  const handleLogout = useCallback(() => {
    _clearAuth();
    window.location.href = '/';
  }, []);

  if (authLoading || !authUser) return null;

  return (
    <div dir={he ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col overflow-x-hidden"
      style={{ background: '#97AB92' }}>

      {/* Leaf watermarks */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden" style={{ zIndex: 0 }}>
        <svg style={{ position:'absolute', top:'-70px', right:'-40px', width:'340px', opacity:.04, transform:'rotate(22deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
        <svg style={{ position:'absolute', bottom:'-50px', left:'-25px', width:'260px', opacity:.035, transform:'rotate(-18deg) scaleX(-1)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
        <svg style={{ position:'absolute', top:'40%', right:'-12px', width:'170px', opacity:.028, transform:'rotate(48deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
        <svg style={{ position:'absolute', top:'18%', left:'-8px', width:'130px', opacity:.022, transform:'rotate(-32deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
      </div>

      <Sidebar
        isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}
        isAdmin={isAdmin} t={t} lang={lang}
        userFirstName={userFirstName} userLastName={userLastName}
        userEmail={userEmail} userGender={userGender} userInitials={userInitials}
        onRequestLogout={() => { setSidebarOpen(false); setShowLogoutModal(true); }}
      />

      {showLogoutModal && <LogoutConfirmModal t={t} onConfirm={handleLogout} onCancel={() => setShowLogoutModal(false)} />}

      {/* Header */}
      <header className="shrink-0 relative z-30" style={{
        background: '#8BAF84', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        boxShadow: headerScrolled ? '0 4px 16px rgba(28,51,41,0.12)' : '0 1px 0 rgba(28,51,41,0.10)',
        transition: 'box-shadow 0.3s ease',
      }}>
        <div className="max-w-full px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-[#1C3329] hover:bg-[#EEF5F0] transition-all">
              <IconMenu className="w-5 h-5" />
            </button>
            <LogoMark size={38} />
          </div>
          <div className="flex items-center gap-2 text-[#1C3329]">
            <span className="text-lg leading-none">✍️</span>
            <h1 className="font-bold text-base tracking-wide">{t.pageTitle}</h1>
          </div>
          <div className="flex items-center gap-2">
            <CoursePill />
            <button onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF5F0] hover:bg-[#E8F0EB] border border-[#D3E0D8] rounded-full text-sm text-[#1C3329] font-semibold transition-all">
              {t.langLabel}
            </button>
          </div>
        </div>
      </header>

      {/* Main — switches between config and writing */}
      <main className="flex-1 flex flex-col overflow-y-auto relative" style={{ zIndex: 1 }}>
        {phase === 'config' ? (
          <Wizard
            t={t} he={he}
            sessions={sessions} docs={docs}
            docsLoading={docsLoading} sessionsLoading={sessionsLoading}
            selectedSessionId={selectedSessionId} onSelectSession={setSelectedSessionId}
            selectedDocId={selectedDocId} onSelectDoc={setSelectedDocId}
            writingType={writingType} onSelectType={setWritingType}
            uploadedFiles={uploadedFiles} uploading={uploading} uploadError={uploadError} onDrop={handleDrop} onRemoveFile={handleRemoveFile}
            hasDoc={hasDoc} onStart={(ci, ps, is, pc, sn) => { setWizardInstructions(ci); setWizardPersonalStyle(ps); setWizardIncludeSources(is); setWizardPageCount(pc); setWizardStudentName(sn); setPhase('writing'); }}
          />
        ) : (
          <WritingPanel
            t={t} he={he}
            hasDoc={hasDoc}
            writingType={writingType}
            onBack={() => setPhase('config')}
            wizardInstructions={wizardInstructions}
            usePersonalStyle={wizardPersonalStyle}
            includeSources={wizardIncludeSources}
            pageCount={wizardPageCount}
            studentName={wizardStudentName}
            userFirstName={userFirstName}
            userLastName={userLastName}
          />
        )}
      </main>

      <footer className="py-3 text-center text-xs shrink-0 relative" style={{ color: '#7BA08A', zIndex: 1 }}>
        U-Note · {he ? 'מופעל על ידי OpenAI ו-Flask' : 'Powered by OpenAI and Flask'}
      </footer>
    </div>
  );
}
