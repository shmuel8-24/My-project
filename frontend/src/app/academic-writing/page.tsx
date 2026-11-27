'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Settings as IconSettings, Minus, Plus, Home, BookOpen, PenTool, Presentation as PresentationIcon, Brain, Target, LogOut, Folder, Sparkles } from 'lucide-react';
import { useAuth }          from '../providers/auth';
import { useLanguage }       from '../providers/language';
import { useCourse }         from '../providers/course';
import { useDocuments }      from '../providers/documents';
import type { DocInfo }      from '../providers/documents';
import { uploadAndIndexFile }         from '../../lib/uploadFile';
import { eventBus, EVT_DOCUMENTS_UPDATED } from '../../lib/eventBus';
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

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5003';

/* ─── Auth helpers ───────────────────────────────────────────────────────── */
const UPLOADS_STORAGE_KEY      = 'unote_academic_uploads';
const WIZARD_SOURCE_STORAGE_KEY = 'unote_wizard_source_type';
const WIZARD_DOC_ID_STORAGE_KEY = 'unote_wizard_doc_id';

function _clearAuth() {
  ['levy_ai_email','levy_ai_first_name','levy_ai_last_name',
   'levy_ai_institution','levy_ai_primary_major','levy_ai_degree_type',
   'levy_ai_country','levy_ai_secondary_major','levy_ai_gender',
   UPLOADS_STORAGE_KEY, WIZARD_SOURCE_STORAGE_KEY, WIZARD_DOC_ID_STORAGE_KEY,
  ].forEach(k => localStorage.removeItem(k));
  document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
}
async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, credentials: 'include' });
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
// DocInfo is imported from providers/documents
interface SessionInfo { id: number; title: string; updated_at: string; }
interface UploadedFile { name: string; size: number; fileId: string; }

const WRITING_TYPES = [
  { id: 'essay',    emoji: '✍️',  he: 'חיבור',       en: 'Essay' },
  { id: 'research', emoji: '📚',  he: 'עבודת מחקר',  en: 'Research Paper' },
  { id: 'summary',  emoji: '📝',  he: 'סיכום',        en: 'Summary' },
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
    dragHint:        'PDF, Word, PowerPoint, תמונות — לחץ לבחירה',
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
    personalStyleLabel:   'כתוב בשמך',
    navHome:         'בית',
    navStudyLab:     'מרחב לימוד',
    navMyDocuments:  'המסמכים שלי',
    navProfSim:      'הראש של המרצה',
    navGapFill:      'שליטה בחומר',
    navAcademic:     'כתיבה אקדמית',
    navPresentation: 'יצירת מצגת',
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
    dragHint:        'PDF, Word, PowerPoint, images — click to select',
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
    personalStyleLabel:   'Write as you',
    navHome:         'Home',
    navStudyLab:     'StudyLab',
    navMyDocuments:  'My Documents',
    navProfSim:      "Professor's Brain",
    navGapFill:      'Mastery',
    navAcademic:     'Academic Writing',
    navPresentation: 'Create Presentation',
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
              { path: '/dashboard',                     icon: Home,            label: t.navHome },
              { path: '/workspace',                     icon: BookOpen,        label: t.navStudyLab },
              { path: '/academic-writing',              icon: PenTool,         label: t.navAcademic },
              { path: '/presentation-generator',        icon: PresentationIcon, label: t.navPresentation },
              { path: '/workspace/professor-simulator', icon: Brain,           label: t.navProfSim },
              { path: '/mastery',                       icon: Target,          label: t.navGapFill },
              { path: '/my-documents',                  icon: Folder,          label: t.navMyDocuments },
            ].map(({ path, icon: Icon, label }) => (
              <button key={path} onClick={() => { router.push(path); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all"
                style={isActive(path)
                  ? { backgroundColor: '#D1E6D9', color: '#183025', fontWeight: 700 }
                  : { color: '#1C3329' }}
                onMouseEnter={e => { if (!isActive(path)) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#EEF5F0'; }}
                onMouseLeave={e => { if (!isActive(path)) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}>
                <Icon className="w-4 h-4 shrink-0" />{label}
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
  selectedDocIds, onSelectDoc,
  writingType, onSelectType,
  uploadedFiles, uploading, uploadError, onDrop, onRemoveFile,
  hasDoc, onSourceTypeChange, onStart,
  topic, onTopicChange,
  initialStep, initialSourceType, initialCustomInstructions,
  initialUsePersonalStyle, initialIncludeSources, initialPageCount,
}: {
  t: TType; he: boolean;
  sessions: SessionInfo[]; docs: DocInfo[]; docsLoading: boolean; sessionsLoading: boolean;
  selectedSessionId: number | null; onSelectSession: (id: number | null) => void;
  selectedDocIds: string[]; onSelectDoc: (ids: string[]) => void;
  writingType: WritingTypeId | null; onSelectType: (id: WritingTypeId) => void;
  uploadedFiles: UploadedFile[]; uploading: boolean; uploadError: string | null; onDrop: (files: File[]) => void; onRemoveFile: (file: UploadedFile) => void;
  hasDoc: boolean; onSourceTypeChange?: (st: SourceType | null) => void;
  onStart: (customInstructions: string, usePersonalStyle: boolean, includeSources: boolean, pageCount: number, sourceType: SourceType | null) => void;
  topic: string; onTopicChange: (t: string) => void;
  initialStep?: 1 | 2 | 3 | 4;
  initialSourceType?: SourceType | null;
  initialCustomInstructions?: string;
  initialUsePersonalStyle?: boolean;
  initialIncludeSources?: boolean;
  initialPageCount?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedCourse } = useCourse();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateTitles = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const payload = {
      topic:       topic.trim(),
      course_name: selectedCourse?.name ?? null,
      course_id:   selectedCourse?.id   || 'default_test_course',
    };
    try {
      const res = await authFetch(`${API}/api/writing/suggest-titles`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json() as { title?: string };
      if (data.title) onTopicChange(data.title);
    } catch {
      alert('שגיאה בחיבור לשרת');
    } finally {
      setIsGenerating(false);
    }
  };

  // Hard filter: never surface syllabus files in the document-selection list.
  const visibleDocs = docs.filter(d => {
    if (d == null) return false;
    const fileName = (d.name || d.file_name || d.filename || '').toLowerCase();
    return !fileName.includes('syllabus') && !fileName.includes('מפתחי קורס');
  });

  // Derive step from URL so browser Back/Forward work natively.
  const _urlStepNum = parseInt(searchParams.get('step') ?? '', 10);
  const step: 1 | 2 | 3 | 4 = (_urlStepNum === 1 || _urlStepNum === 2 || _urlStepNum === 3 || _urlStepNum === 4)
    ? _urlStepNum
    : (initialStep ?? 1);
  const [sourceType,         setSourceType]         = useState<SourceType | null>(initialSourceType ?? null);
  const [customInstructions, setCustomInstructions] = useState(initialCustomInstructions ?? '');
  const [usePersonalStyle,   setUsePersonalStyle]   = useState(initialUsePersonalStyle ?? false);
  const [includeSources,     setIncludeSources]     = useState(initialIncludeSources ?? false);
  const [pageCount,          setPageCount]          = useState(initialPageCount ?? 1);
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
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
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

  // Safety check: if the user removes all uploaded files while on the upload
  // step, ensure no ghost scanning entries survive a deletion.
  useEffect(() => {
    if (step !== 2 || sourceType !== 'upload') return;
    if (uploadedFiles.length === 0) {
      Promise.resolve().then(() => setScanningFileNames([]));
    }
  }, [step, sourceType, uploadedFiles.length]);

  const step1Ready = writingType !== null;

  // Upload type is only ready when files are actually present — do NOT fall
  // back to `hasDoc` here. If `hasDoc` were used as a fallback, a user who
  // deletes all their uploaded files would still see the Next button active,
  // and generation would fire with an empty fileIds list, causing a
  // whole-store RAG search that surfaces documents from previous sessions.
  const step2Ready =
    (sourceType === 'upload'    && uploadedFiles.length > 0) ||
    (sourceType === 'documents' && selectedDocIds.length > 0) ||
    (sourceType === 'sessions'  && selectedSessionId !== null);

  const step3Ready = topic.trim().length > 0;

  const STEPS = [
    { n: 1, he: 'סוג כתיבה',    en: 'Type' },
    { n: 2, he: 'בחר מקור',     en: 'Source' },
    { n: 3, he: 'בחירת כותרת',  en: 'Title' },
    { n: 4, he: 'אישור',        en: 'Confirm' },
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

  /* ── Source-type tile — vertical card layout ── */
  function SourceTile({ id, emoji, title, subtitle }: { id: SourceType; emoji: string; title: string; subtitle: string }) {
    const active = sourceType === id;
    return (
      <button onClick={() => { setSourceType(id); onSourceTypeChange?.(id); onSelectSession(null); onSelectDoc([]); }}
        className="flex flex-col items-center justify-center gap-3 px-4 rounded-2xl text-center transition-all active:scale-[0.97] w-full"
        style={{ minHeight: '160px', ...(active ? tileActive : tileBase) }}
        onMouseEnter={e => { if (!active) Object.assign((e.currentTarget as HTMLButtonElement).style, { background: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.65)' }); }}
        onMouseLeave={e => { if (!active) Object.assign((e.currentTarget as HTMLButtonElement).style, { background: tileBase.background as string, borderColor: (tileBase.border as string).replace('1px solid ', '') }); }}>
        <span className="text-4xl leading-none">{emoji}</span>
        <div>
          <p className="font-bold text-sm" style={{ color: active ? '#183025' : '#2C4A3B' }}>{title}</p>
          <p className="text-xs mt-0.5" style={{ color: '#7BA08A' }}>{subtitle}</p>
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
    if (sourceType === 'documents') {
      if (selectedDocIds.length === 0) return '';
      if (selectedDocIds.length === 1) return docs.find(d => d.file_id === selectedDocIds[0])?.name ?? '';
      return `${selectedDocIds.length} ${he ? 'מסמכים' : 'documents'}`;
    }
    if (sourceType === 'sessions')  return sessions.find(s => String(s.id) === String(selectedSessionId))?.title ?? `Session ${selectedSessionId}`;
    return '';
  };
  const wtLabel = writingType ? (he ? WRITING_TYPES.find(w => w.id === writingType)?.he : WRITING_TYPES.find(w => w.id === writingType)?.en) ?? '' : '';
  const wtEmoji = WRITING_TYPES.find(w => w.id === writingType)?.emoji ?? '✍️';

  return (
    <div className="flex flex-col items-center w-full max-w-3xl mx-auto px-4 py-8 gap-8">

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

      {/* Step card — always transparent; each step manages its own card surfaces */}
      <div className="w-full flex flex-col gap-5">

        {/* ── Step 2: Source ── */}
        {step === 2 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: '#1C3329' }}>{t.leftTitle}</h2>
              <p className="text-sm mt-1" style={{ color: '#527061' }}>{he ? 'מה הבסיס שממנו תרצה לכתוב?' : 'What material will you base your writing on?'}</p>
            </div>
            <div className="grid grid-cols-3 gap-6">
              <SourceTile id="upload"
                emoji="📤"
                title={t.rightTitle}
                subtitle={he ? 'גרור קבצים חדשים (PDF, Word, PowerPoint, תמונות)' : 'Drag & drop new files (PDF, Word, PowerPoint, images)'} />
              <SourceTile id="documents"
                emoji="📄"
                title={t.docsSec}
                subtitle={he ? `${visibleDocs.length} מסמכים זמינים` : `${visibleDocs.length} document${visibleDocs.length !== 1 ? 's' : ''} available`} />
              <SourceTile id="sessions"
                emoji="💬"
                title={t.sessionsSec}
                subtitle={he ? `${sessions.length} שיחות קודמות` : `${sessions.length} previous session${sessions.length !== 1 ? 's' : ''}`} />
            </div>

            {/* Sub-content expands when a source type is selected */}
            {sourceType === 'upload' && (
              <div className="flex flex-col gap-3">
                <div {...getRootProps()}
                  className="rounded-2xl flex flex-col items-center justify-center gap-5 px-8 py-14 text-center select-none cursor-pointer transition-all"
                  style={isDragActive
                    ? { background: 'rgba(255,255,255,0.92)', border: '2px dashed #517B3E', boxShadow: '0 0 28px rgba(81,123,62,0.18)' }
                    : uploading
                      ? { background: 'rgba(255,255,255,0.50)', border: '2px dashed rgba(157,192,139,0.40)', opacity: 0.7 }
                      : { background: 'rgba(255,255,255,0.68)', border: '2px dashed rgba(157,192,139,0.55)' }}>
                  <input {...getInputProps()} />
                  {uploading ? (
                    <>
                      <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
                        <div className="absolute inset-0 rounded-full border-2 border-[#9DC08B]/25 border-t-[#517B3E] animate-spin" />
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="#517B3E" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0
                               0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5
                               3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504
                               1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0
                               0 0-9-9Z" />
                        </svg>
                      </div>
                      <div className="space-y-1 text-center">
                        <p className="text-base font-semibold" style={{ color: '#517B3E' }}>
                          {he ? 'סורק ומנתח...' : 'Scanning & indexing...'}
                        </p>
                        <p className="text-xs" style={{ color: '#7BA08A' }}>
                          {he ? 'מחלץ טקסט ומאנדקס לחיפוש' : 'Extracting text and indexing for search'}
                        </p>
                      </div>
                    </>
                  ) : isDragActive ? (
                    <>
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-bounce" style={{ background: '#517B3E' }}>
                        <IconCloud className="w-9 h-9 text-white" />
                      </div>
                      <p className="text-base font-bold" style={{ color: '#517B3E' }}>{t.dropHere}</p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#9DC08B,#517B3E)' }}>
                        <IconCloud className="w-9 h-9 text-white" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-semibold" style={{ color: '#2C4A3B' }}>{t.dragDrop}</p>
                        <p className="text-sm" style={{ color: '#7BA08A' }}>{t.dragHint}</p>
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
                  <div key={f.fileId || f.name || i} className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
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
              docsLoading ? (
                <p className="text-xs py-3 text-center" style={{ color: '#7BA08A' }}>{t.loading}</p>
              ) : visibleDocs.length === 0 ? (
                <p className="text-xs py-3 text-center" style={{ color: '#7BA08A' }}>{t.noDocs}</p>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                  {visibleDocs.map(doc => {
                    const k   = doc.file_id;
                    const active = selectedDocIds.includes(k);
                    const lbl = doc.name ?? doc.file_name ?? doc.filename ?? '';
                    const sub = lbl.split('.').pop()?.toUpperCase() ?? '';
                    return (
                      <button key={k}
                        onClick={() => {
                          const next = active
                            ? selectedDocIds.filter(id => id !== k)
                            : [...selectedDocIds, k];
                          onSelectDoc(next);
                          onSelectSession(null);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-start transition-all"
                        style={active ? tileActive : tileBase}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: active ? '#183025' : '#2C4A3B' }}>{lbl}</p>
                          {sub && <p className="text-[11px] mt-0.5" style={{ color: '#7BA08A' }}>{sub}</p>}
                        </div>
                        {active && <IconCheck className="w-4 h-4 shrink-0" style={{ color: '#517B3E' } as React.CSSProperties} />}
                      </button>
                    );
                  })}
                </div>
              )
            )}

            {sourceType === 'sessions' && (
              <SelectList
                items={sessions} loading={sessionsLoading} empty={t.noSessions}
                keyFn={s => String(s.id)} label={s => s.title || `Session ${s.id}`}
                selected={selectedSessionId !== null ? String(selectedSessionId) : null}
                onSelect={key => { onSelectSession(key ? Number(key) : null); onSelectDoc([]); }}
              />
            )}
          </>
        )}

        {/* ── Step 1: Writing type ── */}
        {step === 1 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: '#1C3329' }}>{t.writingTypeSec}</h2>
              <p className="text-sm mt-1" style={{ color: '#527061' }}>{he ? 'איזה סוג יצירה תרצה לכתוב?' : 'What kind of piece do you want to write?'}</p>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {WRITING_TYPES.map(wt => {
                const label = he ? wt.he : wt.en;
                const active = writingType === wt.id;
                return (
                  <button key={wt.id} onClick={() => onSelectType(wt.id)}
                    className="flex flex-col items-center justify-center gap-4 px-6 rounded-2xl text-center transition-all active:scale-[0.97] w-full"
                    style={{
                      minHeight: '180px',
                      ...(active
                        ? { background: 'linear-gradient(135deg,#517B3E,#2A3B22)', border: '1.5px solid rgba(81,123,62,0.5)', boxShadow: '0 10px 30px rgba(81,123,62,0.32)' }
                        : { ...tileBase, boxShadow: '0 4px 16px rgba(81,123,62,0.09)' }),
                    }}>
                    <span className="text-5xl leading-none">{wt.emoji}</span>
                    <span className="text-base font-bold" style={{ color: active ? '#fff' : '#2C4A3B' }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Step 3: Title Selection ── */}
        {step === 3 && (
          <>
            {/* Heading + subtitle — bare on the background, identical to steps 1 & 2 */}
            <div>
              <h2 className="text-xl font-bold" style={{ color: '#1C3329' }}>{he ? 'בחירת כותרת' : 'Title Selection'}</h2>
              <p className="text-sm mt-1" style={{ color: '#527061' }}>
                {he
                  ? 'הזן נושא לעבודה שלך, או תן ל-AI להציע לך כותרת ממוקדת המבוססת על חומרי הקורס שלך.'
                  : 'Enter your paper topic, or let the AI suggest a focused title based on your course materials.'}
              </p>
            </div>

            {/* Glassy container — input + sparkles + chips only */}
            <div
              className="flex flex-col items-center gap-6 rounded-2xl p-8"
              style={{
                background: 'rgba(255,255,255,0.40)',
                border: '1px solid rgba(255,255,255,0.50)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              {/* Icon */}
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.15)' }}>
                <IconPen className="w-10 h-10 text-[#9DC08B]" />
              </div>

              {/* Input + Sparkles */}
              <div className="w-full max-w-md">
                <div className="relative w-full">
                  <input
                    type="text"
                    value={topic}
                    onChange={e => onTopicChange(e.target.value)}
                    dir="rtl"
                    placeholder={t.topicPh}
                    className="w-full rounded-xl pr-4 pl-12 py-3 text-sm outline-none text-right"
                    style={{ border: '1px solid rgba(255,255,255,0.60)', background: 'rgba(255,255,255,0.90)', color: '#2A3B22' }}
                    onKeyDown={e => { if (e.key === 'Enter' && topic.trim()) router.push('?step=4'); }}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateTitles}
                    disabled={isGenerating}
                    aria-label={he ? 'הצע כותרות באמצעות AI' : 'Suggest titles with AI'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-50 flex items-center justify-center cursor-pointer rounded-lg p-1 transition-colors hover:bg-black/5 disabled:opacity-40"
                    title={he ? 'הצע כותרות' : 'Suggest titles'}
                  >
                    {isGenerating ? (
                      <svg className="w-4 h-4 animate-spin text-[#517B3E]" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <Sparkles className="w-4 h-4 text-[#7c5bb5]" />
                    )}
                  </button>
                </div>
              </div>

              {/* Suggestion chips */}
              <div>
                <p className="text-xs text-[#7a9268] mb-2">{t.suggestedTopics}</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                  {t.topicChips.map(chip => (
                    <button key={chip} onClick={() => onTopicChange(chip)}
                      className="px-4 py-2 text-xs rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.45)', color: '#2C4A3B' }}>
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Step 4: Confirmation ── */}
        {step === 4 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: '#1C3329' }}>{he ? 'אישור והתחלה' : 'Confirm & Start'}</h2>
              <p className="text-sm mt-1" style={{ color: '#527061' }}>{he ? 'כל ההגדרות מוכנות — לחץ להתחיל לכתוב' : 'Everything is set — click to start writing'}</p>
            </div>

            {/* Top row: 2 summary cards */}
            <div className="grid grid-cols-2 gap-6">
              <div className="rounded-2xl p-5 flex flex-col gap-1.5" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(157,192,139,0.35)', boxShadow: '0 4px 16px rgba(81,123,62,0.08)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#7BA08A' }}>{he ? 'מקור החומר' : 'Source material'}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xl shrink-0">📂</span>
                  <p className="text-sm font-bold truncate" style={{ color: '#1C3329' }}>{sourceLabel() || (he ? '—' : '—')}</p>
                </div>
              </div>
              <div className="rounded-2xl p-5 flex flex-col gap-1.5" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(157,192,139,0.35)', boxShadow: '0 4px 16px rgba(81,123,62,0.08)' }}>
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#7BA08A' }}>{he ? 'סוג כתיבה' : 'Writing type'}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xl shrink-0">{wtEmoji}</span>
                  <p className="text-sm font-bold" style={{ color: '#1C3329' }}>{wtLabel}</p>
                </div>
              </div>
            </div>

            {/* Settings card — 2-column: controls left, textarea right */}
            <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(157,192,139,0.35)', boxShadow: '0 4px 16px rgba(81,123,62,0.08)' }}>
              <div className="grid grid-cols-2 gap-8">

                {/* Left column: page count + toggles */}
                <div className="flex flex-col gap-6">
                  {/* Page count stepper */}
                  <div>
                    <p className="text-sm font-semibold mb-0.5" style={{ color: '#1C3329' }}>
                      {he ? 'אורך מוערך (עמודים)' : 'Estimated length (pages)'}
                    </p>
                    <p className="text-xs mb-3" style={{ color: '#7BA08A' }}>
                      {he ? 'כמה עמודים בערך תרצה שהמסמך יכיל' : 'Roughly how many pages the document should span'}
                    </p>
                    <div className="flex items-center gap-2 w-fit" style={{
                      background: 'rgba(232,239,229,0.60)',
                      border: '1px solid rgba(157,192,139,0.42)',
                      borderRadius: '0.75rem',
                      padding: '6px 10px',
                    }}>
                      <button
                        type="button"
                        onClick={() => setPageCount(p => Math.max(1, p - 1))}
                        disabled={pageCount <= 1}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ color: '#2A3B22', background: 'rgba(81,123,62,0.10)' }}
                        aria-label={he ? 'הפחת עמוד' : 'Decrease pages'}
                      >
                        <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />
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
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ color: '#2A3B22', background: 'rgba(81,123,62,0.10)' }}
                        aria-label={he ? 'הוסף עמוד' : 'Increase pages'}
                      >
                        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="flex flex-col gap-4">
                    <div style={{ borderTop: '1px solid rgba(157,192,139,0.20)', paddingTop: '1rem' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: '#1C3329' }}>{t.personalStyleLabel}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#7BA08A' }}>
                            {he ? 'כתיבה בטון ובסגנון שמרגישים כמוך' : 'Writes in a tone that feels like you'}
                          </p>
                        </div>
                        <ToggleSwitch checked={usePersonalStyle} onChange={setUsePersonalStyle} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: '#1C3329' }}>{he ? 'הוסף מקורות' : 'Add sources'}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#7BA08A' }}>
                          {he ? 'ציין מאיזה קובץ נלקח המידע' : 'Cite which file each paragraph draws from'}
                        </p>
                      </div>
                      <ToggleSwitch checked={includeSources} onChange={setIncludeSources} />
                    </div>
                  </div>
                </div>

                {/* Right column: custom instructions */}
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold" style={{ color: '#1C3329' }}>
                    {he ? 'הנחיות מותאמות אישית' : 'Custom instructions'}
                  </p>
                  <p className="text-xs mb-1" style={{ color: '#7BA08A' }}>
                    {he ? 'כל דגש, מבנה, או הגבלה שתרצה להוסיף' : 'Any emphasis, structure, or constraint to add'}
                  </p>
                  <textarea
                    dir="auto"
                    value={customInstructions}
                    onChange={e => setCustomInstructions(e.target.value)}
                    placeholder={t.customInstructionsPh}
                    className="flex-1 w-full rounded-xl resize-none outline-none text-sm transition-all"
                    style={{
                      background: 'rgba(249,252,250,0.80)',
                      border: '1px solid rgba(157,192,139,0.42)',
                      color: '#1A2E26',
                      padding: '12px 14px',
                      lineHeight: 1.65,
                      fontFamily: 'inherit',
                      minHeight: '140px',
                    }}
                    onFocus={e => {
                      e.currentTarget.style.background  = 'rgba(255,255,255,0.95)';
                      e.currentTarget.style.borderColor = 'rgba(81,123,62,0.65)';
                      e.currentTarget.style.boxShadow   = '0 0 0 2px rgba(81,123,62,0.10)';
                    }}
                    onBlur={e => {
                      e.currentTarget.style.background  = 'rgba(249,252,250,0.80)';
                      e.currentTarget.style.borderColor = 'rgba(157,192,139,0.42)';
                      e.currentTarget.style.boxShadow   = 'none';
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Start Writing button — prominent, full width */}
            <button
              onClick={() => onStart(customInstructions, usePersonalStyle, includeSources, pageCount, sourceType)}
              className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl text-lg font-bold text-white transition-all active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#517B3E,#2A3B22)', boxShadow: '0 10px 36px rgba(81,123,62,0.45)' }}>
              <IconPen className="w-6 h-6" />
              {t.startWriting}
            </button>
          </>
        )}
      </div>

      {/* Navigation row — inherits page direction so RTL/LTR layout is automatic.
          In LTR (English): Back is on the left, Next on the right.
          In RTL (Hebrew): flex-start is the RIGHT side, so Back (first child)
          lands on the right and Next (second child) lands on the left — correct
          for Hebrew where "forward" reads left-ward. Arrow directions flip to match. */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => step > 1 ? router.back() : router.push('/dashboard')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-gray-500 hover:text-gray-800 hover:bg-gray-100/50"
        >
          {/* Arrow points ← in LTR (going back = leftward); → in RTL (going back = rightward) */}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d={he ? 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3' : 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18'} />
          </svg>
          {step === 1 ? (he ? 'ביטול' : 'Cancel') : (he ? 'הקודם' : 'Back')}
        </button>

        {step < 4 && (
          <button
            onClick={() => router.push(`?step=${step + 1}`)}
            disabled={step === 1 ? !step1Ready : step === 2 ? !step2Ready : !step3Ready}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed"
            style={(step === 1 ? step1Ready : step === 2 ? step2Ready : step3Ready)
              ? { background: 'linear-gradient(135deg,#517B3E,#2A3B22)', boxShadow: '0 4px 16px rgba(81,123,62,0.35)' }
              : { background: 'rgba(157,192,139,0.35)' }}>
            {he ? 'הבא' : 'Next'}
            {/* Arrow points → in LTR (going forward = rightward); ← in RTL (going forward = leftward) */}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d={he ? 'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18' : 'M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3'} />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// maxChunks = pageCount * CHUNKS_PER_PAGE. One chunk per page keeps each API call
// within its per-chunk word budget and prevents the chunk-count × chunk-minimum
// arithmetic from doubling the total document length.
const CHUNKS_PER_PAGE = 1;
// Absolute word-count target — single source of truth for "how long is this document?".
// targetWordCount = pageCount * WORDS_PER_PAGE is sent to the backend so both sides
// agree, and drives isFinalSection in generateParagraph: the loop keeps fetching body
// chunks until the accumulated word count reaches this target.
// 350 words/page matches Hebrew academic prose density (A4, 12pt, standard margins).
const WORDS_PER_PAGE = 350;
const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/* ─── Writing panel — Co-Writer mode (paragraph-by-paragraph) ───────────── */
function WritingPanel({
  t, he, hasDoc, writingType, onBack, wizardInstructions, usePersonalStyle, includeSources, pageCount,
  userFirstName, userLastName, userInstitution,
  sourceType, sourceDocIds, sourceUploadFileIds,
  initialTopic,
}: {
  t: TType; he: boolean; hasDoc: boolean;
  writingType: WritingTypeId | null;
  onBack: () => void;
  wizardInstructions: string;
  usePersonalStyle: boolean;
  includeSources: boolean;
  pageCount: number;
  userFirstName: string;
  userLastName: string;
  userInstitution: string;
  sourceType: SourceType | null;
  sourceDocIds: string[];
  sourceUploadFileIds: string[];
  initialTopic?: string;
}) {
  const { selectedCourse } = useCourse();
  const formattedDate = useMemo(
    () => new Date().toLocaleDateString(he ? 'he-IL' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    [he],
  );
  const [topic]                                      = useState(initialTopic || '');
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
  // 1-based chunk counter, kept in case future logic needs to read the current
  // chunk number — no longer displayed in the UI. chunkIndexRef holds the
  // always-current value used by event handlers; the state setter keeps a
  // mirror in sync (ref written first so event handlers never see stale state).
  const [, setCurrentChunkIndex] = useState(1);
  const chunkIndexRef = useRef(1);
  const reviewRef = useRef<HTMLDivElement>(null);
  // Guards the one-time auto-start effect so it never fires twice (e.g. strict-mode double-invoke).
  const autoStartedRef = useRef(false);
  // Whether the currently-displayed draft was generated as the FINAL/conclusion
  // chunk — set inside generateParagraph from isFinalSection (word-count OR
  // chunk-count driven). Drives the "approve to finish" UI + handleNextStep.
  const [draftIsFinal, setDraftIsFinal] = useState(false);
  // Word-count progress toward the document's target length — set inside
  // generateParagraph alongside draftIsFinal, surfaced as a progress bar/badge
  // in the review card so the user has a sense of how much is left.
  const [wordsSoFar,  setWordsSoFar]  = useState(0);
  const [targetWords, setTargetWords] = useState(0);
  const wtLabel = writingType
    ? (he ? WRITING_TYPES.find(w => w.id === writingType)?.he : WRITING_TYPES.find(w => w.id === writingType)?.en) ?? ''
    : '';

  const maxChunks   = (pageCount || 1) * CHUNKS_PER_PAGE;
  // True once the currently-reviewed draft was generated as the final/
  // conclusion chunk (see generateParagraph's isFinalSection derivation).
  const isLastChunk = draftIsFinal;

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
    };
    const safeHint = writingType ? TYPE_HINT_SAFE[writingType] : null;
    const typeHint  = safeHint
      ? (he ? `עצב את הטקסט כ${safeHint.he}.` : `Format the output as ${safeHint.en}.`)
      : '';
    const styleHint = usePersonalStyle
      ? (he ? 'עצב בסגנון אישי וטבעי, לא פורמלי מדי.' : 'Use a personal, natural voice — not overly formal.')
      : '';
    // Send ONLY the raw LLM-generated text — no UI labels, no section wrappers.
    // The backend wraps it in its own ALREADY-WRITTEN CONTENT block.
    const prevContext = approved.length > 0
      ? approved.join('\n\n')
      : '';

    const isFirstSection  = approved.length === 0;
    const chunkTotal      = (pageCount || 1) * CHUNKS_PER_PAGE;
    const wordsSoFar      = countWords(approved.join(' '));
    const targetWords     = (pageCount || 1) * WORDS_PER_PAGE;
    // Final once EITHER the accumulated word count already hits the target
    // (the loop keeps fetching body chunks until this is true) OR the
    // chunk-count ceiling is reached (last-resort safety net so the loop still
    // terminates if chunks badly undershoot).
    const isFinalSection  = wordsSoFar >= targetWords || paragraphNum + 1 >= chunkTotal;
    setDraftIsFinal(isFinalSection);
    setWordsSoFar(wordsSoFar);
    setTargetWords(targetWords);

    // Restrict RAG retrieval to the exact document(s) the user selected in Step 1.
    // This prevents context leakage from other documents in the user's collection.
    const fileIds: string[] = [];
    if (sourceType === 'documents') {
      fileIds.push(...sourceDocIds);
    } else if (sourceType === 'upload') {
      fileIds.push(...sourceUploadFileIds);
    }
    // sourceType === 'sessions': no file-level filter; let the full collection answer.

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
        + 'it MUST start with a real Markdown heading on its own line — but that heading '
        + 'MUST be SPECIFIC and DESCRIPTIVE of this section\'s actual content '
        + '(e.g., `## ניתוח מתמטי של עקרון אי-הוודאות`, `## יישומים נסיוניים: ניסוי שטרן-גרלך`, '
        + '`## סיכום ומסקנות`). NEVER use a generic placeholder heading like `## גוף הדיון` '
        + 'or `## חלק ב\'` — vague titles like that carry no real information and tempt you '
        + 'to reuse the exact same heading (and the content under it) across multiple sections, '
        + 'which creates duplicated sections in the final document. '
        + '(Use `###` for sub-points within a section.) '
        + 'NEVER write section names as plain inline prose like "במבוא זה..." or "לסיכום, ...". '
        + 'If this section continues the SAME part as the previous one, do not repeat its heading — '
        + 'just continue the prose.',
      'Do NOT force-bold or highlight keywords unless absolutely necessary for the clarity '
        + 'of a specific technical term — write naturally, as a professional academic '
        + 'researcher would, and prioritize readability and flow over stylistic decoration.',
      `This is section number ${paragraphNum + 1}.`,
      feedback.trim()
        ? `The user requested this revision to the previous draft: "${feedback.trim()}". Address this feedback carefully.`
        : '',
      isFinalSection
        ? `CRITICAL PACING INSTRUCTION: The document has reached ~${wordsSoFar} of the ~${targetWords}-word target for this ${pageCount}-page paper (chunk ${paragraphNum + 1} of up to ${chunkTotal}). You MUST formally conclude the document now. Use '## סיכום', summarize all key arguments, and formally close the paper.`
        : `CRITICAL PACING INSTRUCTION: The document has reached ~${wordsSoFar} of the ~${targetWords}-word target for this ${pageCount}-page paper (chunk ${paragraphNum + 1} of up to ${chunkTotal}). Write BODY content only — DO NOT use '## סיכום' or any closing/summary language. End mid-flow so the next chunk continues naturally.`,
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
          instructions: [typeHint, styleHint, wizardInstructions, constraint].filter(Boolean).join('\n\n'),
          previousContent: prevContext || null,
          personalStyle: usePersonalStyle,
          pageCount,
          isFinalSection,
          currentChunkIndex: paragraphNum,
          maxChunks: chunkTotal,
          targetWordCount: targetWords,
          studentName: [userFirstName, userLastName].filter(Boolean).join(' ') || null,
          institution: userInstitution || null,
          fileIds: fileIds.length > 0 ? fileIds : null,
          writingType: writingType ?? null,
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
  }, [topic, hasDoc, writingType, wtLabel, he, usePersonalStyle, includeSources, wizardInstructions, pageCount, selectedCourse, t, userFirstName, userLastName, sourceType, sourceDocIds, sourceUploadFileIds]);

  // Kick off the first generation immediately when WritingPanel mounts — the topic
  // was already chosen in wizard step 3, so there is no entry screen to show.
  useEffect(() => {
    if (autoStartedRef.current || !topic.trim() || !hasDoc) return;
    autoStartedRef.current = true;
    generateParagraph(0, [], '');
  }, [generateParagraph, topic, hasDoc]);

  // Unified approve action — the ONLY entry point for advancing the generation loop.
  // Routing is decided programmatically: the document is finalized once EITHER
  // the just-approved draft was generated as the final/conclusion chunk
  // (draftIsFinal — word-count OR chunk-count driven, see generateParagraph),
  // OR the chunk-count ceiling is hit as a last-resort safety net. Otherwise the
  // next chunk is generated. The LLM never decides when the paper ends — this
  // function does.
  const handleNextStep = useCallback(() => {
    if (!currentDraft) return;
    const next     = [...approvedParagraphs,     currentDraft];
    const nextHtml = [...approvedParagraphsHtml, currentDraftHtml ?? ''];
    setApprovedParagraphs(next);
    setApprovedParagraphsHtml(nextHtml);
    setCurrentDraft(null);
    setCurrentDraftHtml(null);
    setWaitingForFeedback(false);

    if (draftIsFinal || next.length >= maxChunks) {
      setEditedContent(next.join('\n\n'));
      setPaperFullHtml(nextHtml.filter(Boolean).join('\n') || null);
      setIsFinished(true);
      setEditMode(false);
    } else {
      chunkIndexRef.current += 1;
      setCurrentChunkIndex(chunkIndexRef.current);
      generateParagraph(next.length, next, '');
    }
  }, [currentDraft, approvedParagraphs, approvedParagraphsHtml, currentDraftHtml, draftIsFinal, maxChunks, generateParagraph]);

  const regenerateWithFeedback = () => {
    generateParagraph(approvedParagraphs.length, approvedParagraphs, userFeedback);
  };

  const resetSession = () => {
    setApprovedParagraphs([]); setApprovedParagraphsHtml([]);
    setCurrentDraft(null);     setCurrentDraftHtml(null);
    setPaperFullHtml(null);
    setWaitingForFeedback(false); setIsFinished(false);
    setEditMode(false); setEditedContent(null);
    setError(null); setUserFeedback('');
    chunkIndexRef.current = 1;
    setCurrentChunkIndex(1);
    setWordsSoFar(0);
    setTargetWords(0);
  };

  const safeTitle = () => topic.trim().slice(0, 40).replace(/[^\w֐-׿\s-]/g, '') || 'paper';

  /* Mirrors the on-screen attribution block (line ~1623) as Markdown so the
     exported file — the actual deliverable — carries the same מאת/קורס/תאריך/נושא
     header the student sees in the preview. Built deterministically (never by
     the LLM) so the name/course/date are always 100% accurate. */
  const buildAttributionHeader = () => {
    // Name/Institution only appear when "כתוב בשמך" (Write as you) is ON — otherwise
    // the document isn't claimed to be personally authored by this student.
    const displayName = usePersonalStyle ? [userFirstName, userLastName].filter(Boolean).join(' ') : '';
    if (!displayName && !selectedCourse?.name) return '';
    const lines: string[] = [];
    if (displayName)                    lines.push(he ? `**מאת:** ${displayName}`           : `**By:** ${displayName}`);
    if (displayName && userInstitution) lines.push(he ? `**מוסד לימודים:** ${userInstitution}` : `**Institution:** ${userInstitution}`);
    if (selectedCourse?.name)           lines.push(he ? `**קורס:** ${selectedCourse.name}`   : `**Course:** ${selectedCourse.name}`);
    lines.push(he ? `**תאריך:** ${formattedDate}` : `**Date:** ${formattedDate}`);
    lines.push(he ? `**נושא:** ${topic}` : `**Topic:** ${topic}`);
    return `${lines.join('  \n')}\n\n---\n\n`;
  };

  const downloadPdf = async () => {
    const text = buildAttributionHeader() + (editedContent ?? approvedParagraphs.join('\n\n'));
    if (!text || downloading) return;
    setDownloading(true);
    try {
      const res = await authFetch(`${API}/export-pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: `u-note-${safeTitle()}.pdf` }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t.exportErr);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `u-note-${safeTitle()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (err) { console.error(err); }
    finally { setDownloading(false); }
  };

  const downloadWord = async () => {
    const text = buildAttributionHeader() + (editedContent ?? approvedParagraphs.join('\n\n'));
    if (!text || downloadingWord) return;
    setDownloadingWord(true);
    try {
      const res = await authFetch(`${API}/export-docx`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: `u-note-${safeTitle()}.docx` }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t.wordErr);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `u-note-${safeTitle()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (err) { console.error(err); }
    finally { setDownloadingWord(false); }
  };

  // Running word count including the currently-displayed draft (if any) —
  // drives the header subtitle and the review-card progress bar.
  const reviewWordCount = wordsSoFar + countWords(currentDraft ?? '');

  return (
    <div className="flex flex-col flex-1 min-h-[600px] w-full max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-8">
      <div className="rounded-2xl flex flex-col flex-1" style={{
        background: 'rgba(255,255,255,0.90)', border: '1px solid #E8F0EB',
        boxShadow: '0 4px 24px rgba(28,51,41,0.06)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid rgba(157,192,139,0.3)' }}>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all shrink-0 text-[#527061] hover:text-[#1C3329] hover:bg-black/05"
          >
            <span className="hidden sm:inline">{t.backToConfig}</span>
          </button>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #9DC08B, #517B3E)' }}>
            <IconPen className="w-5 h-5 text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#2A3B22] text-sm">{t.paperTitle}</p>
            <p className="text-xs text-[#7a9268]">
              {isFinished
                ? (he ? '✅ מסמך מוכן' : '✅ Document ready')
                : waitingForFeedback
                  ? (he ? 'סוקר טיוטה' : 'Reviewing draft')
                  : loading
                    ? (he ? 'כותב...' : 'Writing…')
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

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626' }}>
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
                  {he ? 'פסקאות שאושרו' : 'Approved paragraphs'}
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
              <div className="px-4 py-2.5 flex flex-col gap-2"
                style={{ background: 'rgba(81,123,62,0.08)', borderBottom: '1px solid rgba(81,123,62,0.18)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#517B3E] animate-pulse shrink-0" />
                  <p className="text-xs font-bold text-[#517B3E] uppercase tracking-wider flex-1">
                    {isStreamingDraft
                      ? (he ? `✨ ה-AI מקליד...` : `✨ AI is typing…`)
                      : isLastChunk
                        ? (he ? `פרק אחרון — אשר כדי לסיים` : `Final part — approve to finish`)
                        : (he ? `ממתין לאישורך` : `Awaiting your review`)}
                  </p>
                </div>
                {targetWords > 0 && (
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(81,123,62,0.15)' }}>
                    <div
                      className="h-1 rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${Math.min(100, (reviewWordCount / targetWords) * 100)}%`,
                        background: isLastChunk
                          ? 'linear-gradient(90deg, #517B3E, #2A3B22)'
                          : 'linear-gradient(90deg, #9DC08B, #517B3E)',
                      }}
                    />
                  </div>
                )}
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
                  <button
                    onClick={handleNextStep}
                    disabled={isStreamingDraft}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    style={{ background: 'linear-gradient(135deg,#517B3E,#2A3B22)', boxShadow: '0 3px 14px rgba(81,123,62,0.32)' }}>
                    <IconCheck className="w-4 h-4" />
                    {isLastChunk
                      ? (he ? '✅ סיים ושמור מסמך' : '✅ Finish & Save')
                      : (he ? 'אשר והמשך' : 'Approve & Continue')}
                  </button>
                  <button onClick={regenerateWithFeedback} disabled={isStreamingDraft}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    style={{ background: 'rgba(255,255,255,0.80)', border: '1px solid rgba(157,192,139,0.5)', color: '#527061' }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                    {he ? 'תקן לפי ההערות' : 'Regenerate with Feedback'}
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
{he ? 'חזור לעריכה' : 'Back to editing'}
                  </button>
                  <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
                    style={{ background: 'rgba(81,123,62,0.10)', border: '1px solid rgba(81,123,62,0.35)', color: '#517B3E' }}>
{he ? 'חזור לשלב הקודם' : 'Back to setup'}
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
                    {/* Document header — rendered deterministically by the UI (never by the
                        LLM) so author attribution is always present, accurate, and never
                        duplicated inside the generated Markdown body. */}
                    {(() => {
                      // Name/Institution only appear when "כתוב בשמך" (Write as you) is ON —
                      // otherwise the document isn't claimed to be personally authored by this student.
                      const displayName = usePersonalStyle ? [userFirstName, userLastName].filter(Boolean).join(' ') : '';
                      if (!displayName && !selectedCourse?.name) return null;
                      return (
                        <div className="border-b-2 border-slate-800 pb-4 mb-10">
                          {displayName && (
                            <p className="text-right font-bold text-slate-900 mb-2 leading-[1.8]">
                              {he ? `מאת: ${displayName}` : `By: ${displayName}`}
                            </p>
                          )}
                          {displayName && userInstitution && (
                            <p className="text-right font-bold text-slate-900 mb-2 leading-[1.8]">
                              {he ? `מוסד לימודים: ${userInstitution}` : `Institution: ${userInstitution}`}
                            </p>
                          )}
                          {selectedCourse?.name && (
                            <p className="text-right font-bold text-slate-900 mb-2 leading-[1.8]">
                              {he ? `קורס: ${selectedCourse.name}` : `Course: ${selectedCourse.name}`}
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

      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
// `useSearchParams()` below opts this tree into client-side rendering, which
// Next.js requires to be wrapped in a Suspense boundary (build fails with
// "useSearchParams() should be wrapped in a suspense boundary" otherwise —
// see the exported wrapper at the bottom of this file). Same pattern as
// profile/page.tsx's ProfilePageInner / ProfilePage split.
function AcademicWritingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const { selectedCourse, courseHydrated } = useCourse();
  const { lang, toggleLanguage } = useLanguage();
  const he = lang === 'he';
  const t  = (he ? TR.he : TR.en) as TType;

  /* Shell state */
  const [sidebarOpen,     setSidebarOpen]     = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [headerScrolled,  setHeaderScrolled]  = useState(false);

  /* Config state */
  // Derive phase from URL so browser Back button re-enables after reaching the writing view.
  const phase: 'config' | 'writing' = searchParams.get('step') === 'writing' ? 'writing' : 'config';
  const [wizardInstructions,   setWizardInstructions]   = useState('');
  const [wizardPersonalStyle,  setWizardPersonalStyle]  = useState(false);
  const [wizardIncludeSources, setWizardIncludeSources] = useState(false);
  const [wizardPageCount,      setWizardPageCount]      = useState(1);
  const [wizardSourceType,     setWizardSourceType]     = useState<SourceType | null>(null);
  /* Global document list — shared with every other page via DocumentProvider */
  const { docs, docsLoading, refetchDocs: fetchDocs } = useDocuments();

  const [sessions,          setSessions]           = useState<SessionInfo[]>([]);
  const [sessionsLoading,   setSessionsLoading]    = useState(true);
  const [selectedSessionId, setSelectedSessionId]  = useState<number | null>(null);
  const [selectedDocIds,    setSelectedDocIds]     = useState<string[]>([]);
  const [writingType,       setWritingType]        = useState<WritingTypeId | null>(null);
  const [wizardTopic,       setWizardTopic]        = useState('');
  const [uploadedFiles,     setUploadedFiles]      = useState<UploadedFile[]>([]);
  const [uploading,         setUploading]          = useState(false);
  const [uploadError,       setUploadError]        = useState<string | null>(null);
  const [hasDoc,            setHasDoc]             = useState(false);
  // Stable reference — only recreated when the uploads list actually changes.
  const activeSourceFileIds = useMemo(() => uploadedFiles.map(f => f.fileId), [uploadedFiles]);
  // Tracks file IDs explicitly uploaded in THIS browser session.
  // The purge effect must NEVER remove these — they are confirmed to exist on the
  // server (the server returned the file_id in the upload response).  Only
  // stale localStorage-restored entries (not in this set) should be pruned.
  const sessionUploadedIds = useRef<Set<string>>(new Set());

  /* User info */
  const [isAdmin]       = useState(() => typeof window !== 'undefined' ? localStorage.getItem('levy_ai_is_admin') === 'true' : false);
  const [userEmail]     = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_email')      ?? '') : '');
  const [userFirstName,   setUserFirstName]   = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_first_name') ?? '') : '');
  const [userLastName,    setUserLastName]    = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_last_name')  ?? '') : '');
  const [userGender]                          = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_gender')     ?? '') : '');
  const [userInstitution, setUserInstitution] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_institution') ?? '') : '');
  const userInitials = [userFirstName[0], userLastName[0]].filter(Boolean).join('').toUpperCase() || (userEmail ? userEmail.slice(0, 2).toUpperCase() : '?');

  /* Guards */
  useEffect(() => {
    if (authLoading) return;
    if (!authUser) router.replace('/?login=true');
  }, [authLoading, authUser, router]);

  // Academic writing always needs course context (syllabus material, paper
  // attribution, etc.) — bounce to the course picker the moment the active
  // course is cleared (e.g. via the "✕" on the header CoursePill), mirroring
  // the guard in dashboard/layout.tsx.
  useEffect(() => {
    if (authLoading || !authUser) return;
    if (!courseHydrated) return;
    if (!selectedCourse) router.replace('/course-picker');
  }, [authLoading, authUser, courseHydrated, selectedCourse, router]);

  // Hard refresh at ?step=writing loses all wizard state (topic, source, etc.).
  // Without a topic the WritingPanel has nothing to auto-start — redirect to
  // step 1 so the user re-enters the wizard cleanly.
  useEffect(() => {
    if (phase !== 'writing') return;
    if (!wizardTopic.trim()) router.replace('?step=1');
  }, [phase, wizardTopic, router]);

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

  /* Fetch sessions (not course-scoped) */
  useEffect(() => {
    if (!authUser) return;
    authFetch(`${API}/sessions`)
      .then(r => r.ok ? r.json() : [])
      .then((data: SessionInfo[]) => { setSessions(Array.isArray(data) ? data.slice(0, 20) : []); })
      .catch(() => { setSessions([]); })
      .finally(() => setSessionsLoading(false));
  }, [authUser]);

  /* Sync hasDoc from the global document list.
     The fetch and course-change handling live in DocumentProvider — this page
     only needs to know whether any docs exist so it can enable the chat UI. */
  useEffect(() => {
    if (docs.length > 0) setHasDoc(prev => prev || true);
  }, [docs]);

  /* Subscribe to the global documents-updated event so ANY upload (wizard,
     My Documents, or a future entry point) refreshes the list here without
     the caller needing to manually call fetchDocs. */
  useEffect(() => {
    return eventBus.on(EVT_DOCUMENTS_UPDATED, fetchDocs);
  }, [fetchDocs]);

  /* Fetch fresh profile data so attribution headers never show stale localStorage values */
  useEffect(() => {
    if (!authUser) return;
    authFetch(`${API}/api/profile`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { first_name?: string; last_name?: string; institution?: string } | null) => {
        if (!data) return;
        const fn   = (data.first_name  || '').trim();
        const ln   = (data.last_name   || '').trim();
        const inst = (data.institution || '').trim();
        if (fn)   { setUserFirstName(fn);      localStorage.setItem('levy_ai_first_name', fn); }
        if (ln)   { setUserLastName(ln);       localStorage.setItem('levy_ai_last_name',  ln); }
        if (inst) { setUserInstitution(inst);  localStorage.setItem('levy_ai_institution', inst); }
      })
      .catch(() => {});
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

  /* Restore wizard source-type + selected document on mount so the selection
     survives navigating away from the page and coming back.
     Promise.resolve defers to satisfy react-hooks/set-state-in-effect. */
  useEffect(() => {
    Promise.resolve().then(() => {
      const st = localStorage.getItem(WIZARD_SOURCE_STORAGE_KEY);
      if (st === 'upload' || st === 'documents' || st === 'sessions') {
        setWizardSourceType(st as SourceType);
      }
      const docIdsRaw = localStorage.getItem(WIZARD_DOC_ID_STORAGE_KEY);
      if (docIdsRaw) {
        try {
          const parsed = JSON.parse(docIdsRaw);
          if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) {
            setSelectedDocIds(parsed);
          }
        } catch { /* ignore corrupt data */ }
      }
    });
  }, []);

  /* Persist wizard source-type whenever it changes */
  useEffect(() => {
    if (wizardSourceType) localStorage.setItem(WIZARD_SOURCE_STORAGE_KEY, wizardSourceType);
    else localStorage.removeItem(WIZARD_SOURCE_STORAGE_KEY);
  }, [wizardSourceType]);

  /* Persist selected document IDs (array) whenever they change */
  useEffect(() => {
    if (selectedDocIds.length > 0) localStorage.setItem(WIZARD_DOC_ID_STORAGE_KEY, JSON.stringify(selectedDocIds));
    else localStorage.removeItem(WIZARD_DOC_ID_STORAGE_KEY);
  }, [selectedDocIds]);

  /* Purge session-RESTORED files whose server record no longer exists.
     Runs after every docs refresh so stale localStorage entries don't survive
     server-side deletions (e.g. syllabus_AI.txt removed via My Documents).
     IMPORTANT: files in sessionUploadedIds are NEVER purged here — the server
     confirmed their existence by returning their file_id in the upload response.
     Only files that were restored from localStorage and are absent from the
     freshly-fetched docs list are eligible for removal.  Without this exclusion
     a race between a stale concurrent fetchDocs() response and setUploadedFiles()
     can delete a file the user just uploaded. */
  useEffect(() => {
    if (docsLoading) return;
    setUploadedFiles(prev => {
      if (prev.length === 0) return prev;
      const validIds = new Set(docs.map(d => d.file_id));
      const next = prev.filter(f => {
        if (!f.fileId) return false;
        if (sessionUploadedIds.current.has(f.fileId)) return true; // never auto-purge session uploads
        const keep = validIds.has(f.fileId);
        if (!keep) console.log('[Academic Writing] Purge: removing stale file', f.fileId, '(not in docs list)');
        return keep;
      });
      return next.length === prev.length ? prev : next;
    });
  }, [docs, docsLoading]);

  /* File upload */
  const handleDrop = useCallback(async (files: File[]) => {
    if (!files.length || uploading) return;
    // Debug visibility: log every file handed to the wizard before it's sent
    // to the backend, so a rejection can be traced to a specific name/type.
    files.forEach(f => console.log('[Academic Writing] Dropped file:', f.name, '| MIME:', f.type || '(none)', '| size:', f.size));
    setUploading(true);
    try {
      // Shared pipeline: uploadAndIndexFile → /upload-pdf → FAISS + SQLite
      const result = await uploadAndIndexFile(files, {
        courseName: selectedCourse?.name,
        // isSessionOnly removed: wizard uploads are now permanent documents
        // that appear in My Documents and the global library like any other file.
      });
      if (!result.ok) {
        console.error('[Academic Writing] upload failed:', result.error, result.errors ?? '(no per-file detail)');
        setUploadError(result.error ?? (he ? 'שגיאה בהעלאת הקובץ' : 'Upload failed'));
        return;
      }
      // Backend returns { files: [{source, file_id, chunks_stored, status?, ...}] }
      const uploaded: UploadedFile[] = result.files.map((f: { source: string; file_id: string }) => {
        const original = files.find(file => file.name === f.source) ?? files[0];
        return { name: f.source, size: original?.size ?? 0, fileId: f.file_id ?? '' };
      });
      if (uploaded.length) {
        // Register IDs BEFORE state update so the purge effect can never race ahead
        // and delete a file whose ID isn't in sessionUploadedIds yet.
        uploaded.forEach(f => { if (f.fileId) sessionUploadedIds.current.add(f.fileId); });
        console.log('[Academic Writing] Upload success — registered IDs:', [...sessionUploadedIds.current]);
        // Immediate optimistic update — file cards appear instantly in the wizard.
        setUploadedFiles(prev => {
          const next = [...prev, ...uploaded];
          console.log('[Academic Writing] uploadedFiles after upload:', next.map(f => f.fileId));
          return next;
        });
        setHasDoc(true);
        setUploadError(null);
        // Refresh the document library so the new file is visible in the
        // "My Documents" source tab without requiring a page reload.
        fetchDocs();
      }
    } catch (err) {
      console.error('[Academic Writing] upload error:', err);
      setUploadError(he ? 'שגיאה בחיבור לשרת' : 'Cannot reach server');
    } finally {
      setUploading(false);
    }
  }, [uploading, he, selectedCourse, fetchDocs]);

  const handleRemoveFile = useCallback((fileToRemove: UploadedFile) => {
    const remaining = uploadedFiles.filter(f => f.fileId !== fileToRemove.fileId);
    setUploadedFiles(remaining);
    // When the user explicitly removes the last file, fully reset hasDoc so the
    // wizard's step2Ready check correctly requires a new upload rather than
    // ghosting on other course documents that happen to exist in the library.
    if (remaining.length === 0) setHasDoc(false);
    // Session-only uploads are deleted from the backend when removed from the UI.
    if (fileToRemove.fileId) {
      authFetch(`${API}/documents/${fileToRemove.fileId}`, { method: 'DELETE' })
        .then(() => fetchDocs()) // Refresh library so the deleted file disappears
        .catch(() => {});
    }
  }, [uploadedFiles, fetchDocs]);

  const handleLogout = useCallback(() => {
    _clearAuth();
    window.location.href = '/';
  }, []);

  if (authLoading || !authUser || !courseHydrated || !selectedCourse) return null;

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
            selectedDocIds={selectedDocIds} onSelectDoc={setSelectedDocIds}
            writingType={writingType} onSelectType={setWritingType}
            uploadedFiles={uploadedFiles} uploading={uploading} uploadError={uploadError} onDrop={handleDrop} onRemoveFile={handleRemoveFile}
            hasDoc={hasDoc} onSourceTypeChange={setWizardSourceType}
            topic={wizardTopic}
            onTopicChange={setWizardTopic}
            initialStep={wizardSourceType ? 4 : 1}
            initialSourceType={wizardSourceType}
            initialCustomInstructions={wizardInstructions}
            initialUsePersonalStyle={wizardPersonalStyle}
            initialIncludeSources={wizardIncludeSources}
            initialPageCount={wizardPageCount}
            onStart={(ci, ps, is, pc, st) => { setWizardInstructions(ci); setWizardPersonalStyle(ps); setWizardIncludeSources(is); setWizardPageCount(pc); setWizardSourceType(st); router.push('?step=writing'); }}
          />
        ) : wizardTopic.trim() ? (
          <WritingPanel
            t={t} he={he}
            hasDoc={hasDoc}
            writingType={writingType}
            onBack={() => router.back()}
            wizardInstructions={wizardInstructions}
            usePersonalStyle={wizardPersonalStyle}
            includeSources={wizardIncludeSources}
            pageCount={wizardPageCount}
            userFirstName={userFirstName}
            userLastName={userLastName}
            userInstitution={userInstitution}
            sourceType={wizardSourceType}
            sourceDocIds={selectedDocIds}
            sourceUploadFileIds={activeSourceFileIds}
            initialTopic={wizardTopic}
          />
        ) : null}
      </main>

    </div>
  );
}

export default function AcademicWritingPage() {
  return (
    <Suspense fallback={null}>
      <AcademicWritingPageInner />
    </Suspense>
  );
}
