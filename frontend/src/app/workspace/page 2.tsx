'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLanguage }   from '../providers/language';
import { useAuth }       from '../providers/auth';
import { useCourse }     from '../providers/course';
import CoursePill        from '../../components/CoursePill';
import SelectionPopover  from '../../components/SelectionPopover';
import { CodeBlockPre, InlineCode }  from '../../components/CodeBlock';
import AIThinkingIndicator           from '../../components/AIThinkingIndicator';
import { useHaptics }                from '../../hooks/useHaptics';
import { playPop, getSoundEnabled, toggleSound } from '../../utils/audio';
import type { KeyboardEvent, ChangeEvent } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import type { FileRejection } from 'react-dropzone';
import UserProfileModal from './UserProfileModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const API = 'http://127.0.0.1:5003';

/* ─── Auth helpers ───────────────────────────────────────────────────────────── */
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

const _AUTH_KEYS = [
  'levy_ai_token', 'levy_ai_email', 'levy_ai_first_name', 'levy_ai_last_name',
  'levy_ai_institution', 'levy_ai_primary_major', 'levy_ai_degree_type',
  'levy_ai_country', 'levy_ai_secondary_major', 'levy_ai_gender',
] as const;

function _clearAuth() {
  _AUTH_KEYS.forEach(k => localStorage.removeItem(k));
  document.cookie = 'levy_ai_session=; path=/; SameSite=Lax; max-age=0';
}

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();

  // Proactive expiry check — avoids a round-trip when we can already tell the
  // token is expired from the `exp` claim.
  if (token) {
    const p = decodeJwtPayload(token);
    if (p?.exp && (p.exp as number) * 1000 < Date.now()) {
      _clearAuth();
      window.location.href = '/?login=true';
      return new Response(null, { status: 401 });
    }
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string>) ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) {
    _clearAuth();
    window.location.href = '/?login=true';
  }
  if (res.status === 429) {
    window.dispatchEvent(new CustomEvent('u-note-rate-limit'));
  }
  return res;
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface CitationSource {
  file_name: string;
  page_number: number | null;
  file_id: string;
}

interface DocumentInfo {
  name: string;
  chunks: number;
  file_id: string;
  upload_date?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  searchedWeb?: boolean;
  webSources?: { title: string; url: string }[];
  sources?: string[];
  citations?: CitationSource[];
  executedCode?: string;
  codeOutput?: string;
  images?: string[];
}

type SseEvent =
  | { type: 'status'; phase: string }
  | { type: 'result'; answer: string; sources: string[]; citation_sources?: CitationSource[]; chunks_used: number; searched_web: boolean; web_sources: { title: string; url: string }[]; session_id: number; executed_code?: string; code_output?: string; images?: string[] }
  | { type: 'error'; message: string };

interface UploadedFile {
  name: string;
  size: number;
  chunks: number;
  fileType: 'pdf' | 'pptx' | 'image';
  previewUrl?: string;
}

interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface QuizQuestion {
  question:       string;
  options:        string[];
  correct_answer: number;   // 0-based index into options[]
}

type Lang = 'he' | 'en';

/* ─── Translations ──────────────────────────────────────────────────────────── */
const translations = {
  he: {
    subtitle: 'שותף המחקר החכם שלך',
    docLoaded: 'מסמך טעון',
    waiting: 'ממתין',
    langLabel: 'EN',
    openMenu: 'פתח תפריט',
    closeMenu: 'סגור תפריט',
    newChat: 'שיחה חדשה',
    noPrevChats: 'אין שיחות קודמות',
    deleteChat: 'מחק שיחה',
    uploadDocs: 'העלאת מסמכים',
    pdfOnly: 'PDF · PPTX · תמונות · עד 50 MB לקובץ',
    dropHere: 'שחרר כאן!',
    dragDrop: 'גרור ושחרר קבצים',
    dragHint: 'PDF, PPTX, תמונות · ניתן לגרור מספר קבצים · או לחץ לבחירה ידנית',
    pdfBadge: 'PDF · PPTX · PNG / JPG · עד 50 MB',
    addMore: 'הוסף עוד קבצים',
    uploading: 'מעלה...',
    chunksLabel: (n: number) => `${n} קטעים · הועלה בהצלחה`,
    imageUploaded: 'תמונה הועלתה בהצלחה',
    removeFile: 'הסר קובץ',
    howToUse: 'איך להשתמש?',
    tips: [
      'העלה קובץ PDF אחד או יותר – חומרי לימוד, מאמרים, ספרים',
      'שאל שאלות בעברית או אנגלית על תוכן הקבצים',
      'קבל סיכומים, הסברים ודוגמאות ממוקדות',
      'חזור על הכל בקלות לפני המבחן',
    ],
    rejectionErr: (n: number) => `${n} קבצ${n === 1 ? '' : 'ים'} נדח${n === 1 ? '' : 'ו'} — ניתן להעלות PDF, PPTX, PNG, JPG בלבד.`,
    uploadErr: 'שגיאה בהעלאת הקבצים.',
    serverErr: 'לא ניתן להתחבר לשרת. בדוק שה-backend פועל על פורט 5003.',
    chatTitle: 'Workspace',
    docReady: 'מסמך מוכן – ניתן לשאול שאלות',
    waitingPdf: 'ממתין לקובץ PDF',
    askQ: 'שאל שאלה על המסמך',
    uploadToStart: 'עדיין קצת ריק פה 🌱 בוא נעלה את הסיכום הראשון',
    askHint: 'ניתן לשאול בעברית, אנגלית, או שילוב של שתיהן',
    uploadSideHint: 'לחץ על אזור ההעלאה מצד ימין',
    suggestions: ['סכם את המסמך בקצרה', 'מה הנקודות העיקריות?', 'הסבר את הנושא הראשון', 'תן לי שאלות לתרגול'],
    webSourcesLabel: 'מקורות',
    webSearched: 'שילב חיפוש ברשת',
    showSources: (n: number) => `${n} מקורות`,
    hideSources: 'הסתר',
    searchingWeb: 'מחפש ברשת...',
    runningCode: 'מריץ קוד Python...',
    seeCode: 'הצג קוד',
    hideCode: 'הסתר קוד',
    codeOutputLabel: 'פלט',
    chatPlaceholder: 'מה לא היה ברור היום בשיעור? אפשר לשאול הכל...',
    chatPlaceholderNoDoc: 'יש להעלות קובץ תחילה',
    send: 'שלח',
    enterHint: 'Enter לשליחה · Shift+Enter לשורה חדשה',
    commErr: 'שגיאה בתקשורת עם השרת',
    paperTitle: 'כתיבה אקדמית',
    paperSubtitle: 'כתוב מאמר מבוסס המסמכים שהועלו',
    downloadPdf: 'הורד PDF',
    downloadWord: 'הורד Word',
    exporting: 'מייצא...',
    topicChips: ['סיכום הנושאים המרכזיים', 'השוואת גישות ורעיונות', 'ביקורת ספרות', 'ניתוח מושגי מפתח'],
    enterTopic: 'הזן נושא ולחץ על "חבר מאמר"',
    aiWrites: 'ה-AI יכתוב מאמר אקדמי מלא ומובנה בעברית',
    uploadFirst: 'יש להעלות מסמך PDF תחילה',
    suggestedTopics: 'נושאים מוצעים:',
    writingPaper: 'כותב מאמר אקדמי...',
    takeSecs: 'זה עשוי לקחת מספר שניות',
    paperErr: 'שגיאה ביצירת המאמר.',
    sources: 'מקורות:',
    topicPh: 'נושא המאמר (לדוגמה: השפעת הגלובליזציה על החינוך)',
    topicPhNoDoc: 'יש להעלות קובץ תחילה',
    instructionsPh: 'הוראות נוספות (אופציונלי): אורך, פרקים ספציפיים, סגנון...',
    composePaper: 'חבר מאמר',
    writingBtn: 'כותב מאמר...',
    exportErr: 'שגיאה בייצוא ה-PDF',
    wordErr: 'שגיאה בייצוא Word',
    tabChat: 'Workspace',
    tabPaper: 'כתיבה אקדמית',
    footer: 'U-Note · מופעל על ידי OpenAI ו-Flask',
    logout: 'יציאה',
    profileSettings: 'הגדרות פרופיל',
    logoutTitle:     'יציאה מהמערכת',
    logoutBody:      'האם אתה בטוח שברצונך להתנתק ולצאת?',
    logoutYes:       'כן, צא',
    cancel:          'ביטול',
    navHome: 'בית',
    navNotes: 'Notes',
    navStudyLab: 'מרחב לימוד',
    navAdmin: 'Admin',
    navDashboard: 'Platform',
    usageUploads:   (used: number, limit: number) => `${used}/${limit} העלאות בוצעו`,
    usageQuestions: (used: number, limit: number) => `${used}/${limit} שאלות נשאלו`,
    usageUnlimited: 'Pro — ללא הגבלה',
    upgradePrompt:  'שדרג ל-Pro',
    filterLabel:    'סנן לפי קובץ:',
    filterAll:      'הכל',
    micStart:       'הקלט שאלה קולית',
    micStop:        'עצור הקלטה',
    micProcessing:  'מעבד שמע...',
    micError:       'לא ניתן לגשת למיקרופון. אנא אפשר גישה בהגדרות הדפדפן.',
    micErrGeneric:  'חלה שגיאה קלה בעיבוד האודיו, אנא נסה שוב',
    quizMe:         'בחן אותי',
    quizTitle:      'חידון מהמסמך',
    quizLoading:    'מכין חידון...',
    quizProgress:   (n: number, total: number) => `שאלה ${n} מתוך ${total}`,
    quizCorrect:    '✓ נכון!',
    quizWrong:      '✗ לא נכון',
    quizNext:       'הבא',
    quizFinish:     'סיים',
    quizScore:      (s: number, tot: number) => `${s} מתוך ${tot} נכון`,
    quizPerfect:    'מושלם! 🌟',
    quizGreat:      'כל הכבוד! 🎉',
    quizPractice:   'המשך לתרגל 💪',
    quizRetry:      'חידון חדש',
    quizClose:      'סגור',
    quizErr:        'שגיאה ביצירת החידון. נסה שוב.',
    rateLimitMsg:   'יותר מדי בקשות — אנא המתן רגע.',
    navProfSim:     'הראש של המרצה',
    navGapFill:     'שליטה בחומר',
  },
  en: {
    subtitle: 'Your Academic Sidekick',
    docLoaded: 'Document Loaded',
    waiting: 'Waiting',
    langLabel: 'HE',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    newChat: 'New Chat',
    noPrevChats: 'No previous chats',
    deleteChat: 'Delete chat',
    uploadDocs: 'Upload Documents',
    pdfOnly: 'PDF · PPTX · Images · Up to 50 MB per file',
    dropHere: 'Drop here!',
    dragDrop: 'Drag & drop files',
    dragHint: 'PDF, PPTX, images · multiple files at once · or click to select',
    pdfBadge: 'PDF · PPTX · PNG / JPG · Up to 50 MB',
    addMore: 'Add more files',
    uploading: 'Uploading...',
    chunksLabel: (n: number) => `${n} chunks · Uploaded successfully`,
    imageUploaded: 'Image uploaded successfully',
    removeFile: 'Remove file',
    howToUse: 'How to use?',
    tips: [
      'Upload one or more PDFs – study materials, articles, books',
      'Ask questions in Hebrew or English about the file content',
      'Get focused summaries, explanations, and examples',
      'Review everything easily before the exam',
    ],
    rejectionErr: (n: number) => `${n} file${n === 1 ? '' : 's'} rejected — only PDF, PPTX, PNG, and JPG are allowed.`,
    uploadErr: 'Error uploading files.',
    serverErr: 'Cannot connect to server. Check that the backend is running on port 5003.',
    chatTitle: 'Workspace',
    docReady: 'Document ready – you can ask questions',
    waitingPdf: 'Waiting for PDF file',
    askQ: 'Ask a question about the document',
    uploadToStart: 'Upload a PDF document to start',
    askHint: 'You can ask in Hebrew, English, or both',
    uploadSideHint: 'Click on the upload area on the left',
    suggestions: ['Summarize the document briefly', 'What are the main points?', 'Explain the first topic', 'Give me practice questions'],
    webSourcesLabel: 'Sources',
    webSearched: 'Included web search',
    showSources: (n: number) => `${n} sources`,
    hideSources: 'Hide',
    searchingWeb: 'Searching the web...',
    runningCode: 'Running Python code...',
    seeCode: 'See the code',
    hideCode: 'Hide the code',
    codeOutputLabel: 'Output',
    chatPlaceholder: 'Ask a question about the document...',
    chatPlaceholderNoDoc: 'Please upload a file first',
    send: 'Send',
    enterHint: 'Enter to send · Shift+Enter for new line',
    commErr: 'Server communication error',
    paperTitle: 'Academic Writing',
    paperSubtitle: 'Write a paper based on uploaded documents',
    downloadPdf: 'Download PDF',
    downloadWord: 'Download Word',
    exporting: 'Exporting...',
    topicChips: ['Summary of main topics', 'Comparison of approaches', 'Literature review', 'Analysis of key concepts'],
    enterTopic: 'Enter a topic and click "Compose Paper"',
    aiWrites: 'The AI will write a full structured academic paper',
    uploadFirst: 'Please upload a PDF document first',
    suggestedTopics: 'Suggested topics:',
    writingPaper: 'Writing academic paper...',
    takeSecs: 'This may take a few seconds',
    paperErr: 'Error generating paper.',
    sources: 'Sources:',
    topicPh: 'Paper topic (e.g., The impact of globalization on education)',
    topicPhNoDoc: 'Please upload a file first',
    instructionsPh: 'Additional instructions (optional): length, specific chapters, style...',
    composePaper: 'Compose Paper',
    writingBtn: 'Writing paper...',
    exportErr: 'Error exporting PDF',
    wordErr: 'Error exporting Word',
    tabChat: 'Workspace',
    tabPaper: 'Academic Writing',
    footer: 'U-Note · Powered by OpenAI and Flask',
    logout: 'Logout',
    profileSettings: 'Profile Settings',
    logoutTitle:     'Log Out',
    logoutBody:      'Are you sure you want to log out?',
    logoutYes:       'Yes, Log Out',
    cancel:          'Cancel',
    navHome: 'Home',
    navNotes: 'Notes',
    navStudyLab: 'StudyLab',
    navAdmin: 'Admin',
    navDashboard: 'Platform',
    usageUploads:   (used: number, limit: number) => `${used}/${limit} uploads used`,
    usageQuestions: (used: number, limit: number) => `${used}/${limit} questions used`,
    usageUnlimited: 'Pro — unlimited',
    upgradePrompt:  'Upgrade to Pro',
    filterLabel:    'Filter by file:',
    filterAll:      'All',
    micStart:       'Record voice question',
    micStop:        'Stop recording',
    micProcessing:  'Processing audio...',
    micError:       'Cannot access microphone. Please allow access in browser settings.',
    micErrGeneric:  'A small error occurred processing the audio. Please try again.',
    quizMe:         'Quiz Me',
    quizTitle:      'Document Quiz',
    quizLoading:    'Generating quiz...',
    quizProgress:   (n: number, total: number) => `Question ${n} of ${total}`,
    quizCorrect:    '✓ Correct!',
    quizWrong:      '✗ Incorrect',
    quizNext:       'Next',
    quizFinish:     'Finish',
    quizScore:      (s: number, tot: number) => `${s} of ${tot} correct`,
    quizPerfect:    'Perfect! 🌟',
    quizGreat:      'Well done! 🎉',
    quizPractice:   'Keep practicing 💪',
    quizRetry:      'New Quiz',
    quizClose:      'Close',
    quizErr:        'Quiz generation failed. Please try again.',
    rateLimitMsg:   'Too many requests. Please wait a moment.',
    navProfSim:     "Professor's Brain",
    navGapFill:     'Mastery',
  },
};

type T = typeof translations.he;

/* ─── U-Note Logo mark ──────────────────────────────────────────────────────── */
function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <img src="/logo.PNG" alt="U-Note" style={{ height: size, width: 'auto', objectFit: 'contain' }} />
  );
}

/* ─── Inline SVG icons ──────────────────────────────────────────────────────── */
function IconCloud({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
    </svg>
  );
}
function IconDoc({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}
function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}
function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}
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
function IconSparkles({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}
function IconGlobe({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}
function IconPlus({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
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
function IconMic({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  );
}
function IconCode({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  );
}
function IconPresentation({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6.75v6.75" />
    </svg>
  );
}
function IconPhoto({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
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
function IconShield({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}
function IconBrain({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
  );
}
/* ─── Helpers ───────────────────────────────────────────────────────────────── */
/* Renders gender-specific icon (Mars/Venus) or falls back to initials. */
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

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url; }
}

function preprocessMath(content: string): string {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, eq) => `$$${eq}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, eq) => `$${eq}$`);
}

/* ─── Code interpreter result block ─────────────────────────────────────────── */
function CodeExecutionBlock({ code, output, images, t }: {
  code?: string; output?: string; images?: string[]; t: T;
}) {
  const [showCode, setShowCode] = useState(false);
  const hasCode   = !!(code   && code.trim());
  const hasOutput = !!(output && output.trim());
  const hasImages = !!(images && images.length > 0);

  return (
    <div dir="ltr" className="mt-2 rounded-xl overflow-hidden border border-[#1e2d4a] text-left text-sm">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#080e1f]">
        <IconCode className="w-3.5 h-3.5 text-[#8b5cf6] shrink-0" />
        <span className="flex-1 text-[11px] font-mono font-medium text-slate-400">Python</span>
        {hasCode && (
          <button onClick={() => setShowCode(s => !s)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1e2d4a] hover:bg-[#2a3f60] text-slate-300 text-[11px] font-medium transition-colors">
            {showCode ? t.hideCode : t.seeCode}
          </button>
        )}
      </div>
      {showCode && hasCode && (
        <pre className="m-0 p-4 bg-[#060b18] text-emerald-300 text-[11px] font-mono overflow-x-auto leading-relaxed whitespace-pre border-b border-[#1e2d4a]">
          {code}
        </pre>
      )}
      {hasOutput && (
        <div className="px-4 py-3 bg-[#060b18] border-t border-[#1e2d4a] font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
          <span className="text-slate-600 text-[9px] uppercase tracking-widest block mb-1.5 select-none">{t.codeOutputLabel}</span>
          <span className="text-slate-300">{output}</span>
        </div>
      )}
      {hasImages && (
        <div className="bg-[#0d1424] border-t border-[#1e2d4a] p-3 flex flex-col gap-2">
          {images!.map((b64, i) => (
            <img key={i} src={`data:image/png;base64,${b64}`} alt={`Chart ${i + 1}`}
              className="w-full h-auto rounded-lg block" style={{ maxWidth: 480 }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Quiz modal ────────────────────────────────────────────────────────────── */
function QuizModal({ questions, loading, error, lang, t, onClose, onRetry }: {
  questions: QuizQuestion[];
  loading:   boolean;
  error:     string | null;
  lang:      Lang;
  t:         T;
  onClose:   () => void;
  onRetry:   () => void;
}) {
  const [idx,      setIdx]      = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score,    setScore]    = useState(0);
  const [done,     setDone]     = useState(false);

  const q     = questions[idx];
  const total = questions.length;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (i: number) => {
    if (selected !== null) return;
    setSelected(i);
    if (i === q.correct_answer) setScore(s => s + 1);
  };

  const next = () => {
    if (idx < total - 1) { setIdx(i => i + 1); setSelected(null); }
    else setDone(true);
  };

  const scoreEmoji = score === total ? '🌟' : score >= Math.ceil(total / 2) ? '🎉' : '💪';
  const scoreMsg   = score === total ? t.quizPerfect : score >= Math.ceil(total / 2) ? t.quizGreat : t.quizPractice;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(20,30,15,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        dir={lang === 'he' ? 'rtl' : 'ltr'}
        className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: 'rgba(255,255,255,0.98)', border: '1px solid rgba(157,192,139,0.4)', maxHeight: '90vh' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center px-5 py-3.5 shrink-0"
          style={{ background: 'rgba(81,123,62,0.07)', borderBottom: '1px solid rgba(157,192,139,0.25)' }}>
          <div className="flex items-center gap-2 shrink-0">
            <IconBrain className="w-4 h-4 text-[#517B3E]" />
            <span className="font-bold text-[#2A3B22] text-sm">{t.quizTitle}</span>
          </div>
          {!loading && !error && !done && total > 0 && (
            <span className="flex-1 text-center text-[11px] font-semibold text-[#7a9268]">
              {t.quizProgress(idx + 1, total)}
            </span>
          )}
          {(loading || error || done || total === 0) && <span className="flex-1" />}
          <button
            onClick={onClose} aria-label={t.quizClose}
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/10 transition-colors text-[#7a9268] text-lg shrink-0">
            ×
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          {loading ? (
            /* Loading spinner */
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <span className="w-12 h-12 rounded-full border-4 animate-spin block"
                style={{ borderColor: 'rgba(157,192,139,0.3)', borderTopColor: '#517B3E' }} />
              <p className="text-sm font-medium text-[#7a9268]">{t.quizLoading}</p>
            </div>
          ) : error ? (
            /* Error state */
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="text-3xl">⚠️</span>
              <p className="text-sm text-red-600 font-medium">{error}</p>
              <button onClick={onRetry}
                className="mt-2 px-5 py-2 rounded-full text-sm font-semibold text-white"
                style={{ background: '#517B3E', boxShadow: '0 2px 8px rgba(81,123,62,0.35)' }}>
                {t.quizRetry}
              </button>
            </div>
          ) : done ? (
            /* Result screen */
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <span className="text-5xl">{scoreEmoji}</span>
              <p className="text-2xl font-bold text-[#2A3B22]">{t.quizScore(score, total)}</p>
              <p className="text-sm text-[#7a9268] font-medium">{scoreMsg}</p>
              <div className="flex gap-2.5 mt-1">
                {Array.from({ length: total }).map((_, i) => (
                  <span key={i} className="w-2.5 h-2.5 rounded-full transition-colors"
                    style={{ background: i < score ? '#517B3E' : 'rgba(157,192,139,0.3)' }} />
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={onRetry}
                  className="px-5 py-2 rounded-full text-sm font-semibold text-white"
                  style={{ background: '#517B3E', boxShadow: '0 2px 8px rgba(81,123,62,0.35)' }}>
                  {t.quizRetry}
                </button>
                <button onClick={onClose}
                  className="px-5 py-2 rounded-full text-sm font-semibold"
                  style={{ border: '1px solid rgba(157,192,139,0.5)', color: '#7a9268' }}>
                  {t.quizClose}
                </button>
              </div>
            </div>
          ) : q ? (
            /* Question */
            <div className="flex flex-col gap-4">
              {/* Progress bar */}
              <div className="w-full h-1 rounded-full" style={{ background: 'rgba(157,192,139,0.2)' }}>
                <div className="h-1 rounded-full transition-all duration-500"
                  style={{ width: `${((idx + 1) / total) * 100}%`, background: '#9DC08B' }} />
              </div>
              {/* Question text */}
              <p dir="auto" className="text-base font-semibold text-[#2A3B22] leading-relaxed">{q.question}</p>
              {/* Options */}
              <div className="flex flex-col gap-2.5">
                {q.options.map((opt, i) => {
                  const answered  = selected !== null;
                  const isChosen  = selected === i;
                  const isCorrect = i === q.correct_answer;
                  const dimmed    = answered && !isCorrect && !isChosen;
                  let bg = 'rgba(255,255,255,0.9)', border = 'rgba(157,192,139,0.45)', color = '#2A3B22';
                  if (answered && isCorrect) { bg = 'rgba(74,222,128,0.15)'; border = '#4ade80'; color = '#166534'; }
                  else if (answered && isChosen) { bg = 'rgba(239,68,68,0.10)'; border = '#ef4444'; color = '#991b1b'; }
                  return (
                    <button key={i} onClick={() => pick(i)} dir="auto"
                      className="w-full text-start px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-3 transition-all duration-200"
                      style={{ background: bg, border: `1.5px solid ${border}`, color, cursor: answered ? 'default' : 'pointer', opacity: dimmed ? 0.45 : 1 }}>
                      <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold transition-all"
                        style={{
                          background: answered && isCorrect ? '#4ade80' : answered && isChosen ? '#ef4444' : 'rgba(81,123,62,0.1)',
                          color: answered && isCorrect ? '#166534' : answered && isChosen ? '#991b1b' : '#517B3E',
                        }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {answered && isCorrect && <span className="shrink-0 text-green-500 font-bold">✓</span>}
                      {answered && isChosen && !isCorrect && <span className="shrink-0 text-red-500 font-bold">✗</span>}
                    </button>
                  );
                })}
              </div>
              {/* Feedback + Next */}
              {selected !== null && (
                <div className="flex items-center justify-between pt-3"
                  style={{ borderTop: '1px solid rgba(157,192,139,0.2)' }}>
                  <p className="text-sm font-semibold"
                    style={{ color: selected === q.correct_answer ? '#166534' : '#991b1b' }}>
                    {selected === q.correct_answer ? t.quizCorrect : t.quizWrong}
                  </p>
                  <button onClick={next}
                    className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-all"
                    style={{ background: '#517B3E', boxShadow: '0 2px 8px rgba(81,123,62,0.35)' }}>
                    {idx < total - 1 ? t.quizNext : t.quizFinish}
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ─── PDF Uploader ──────────────────────────────────────────────────────────── */
function PdfUploader({ onUpload, onRemove, t }: {
  onUpload: () => void; onRemove: () => void; t: T;
}) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      const rejectionErrors: string[] = rejected.length ? [t.rejectionErr(rejected.length)] : [];
      if (!accepted.length) { setErrors(rejectionErrors); return; }

      const previewMap: Record<string, string> = {};
      for (const file of accepted) {
        if (file.type.startsWith('image/')) previewMap[file.name] = URL.createObjectURL(file);
      }

      setUploading(true); setErrors([]);
      try {
        const fd = new FormData();
        for (const file of accepted) fd.append('files', file);
        const res  = await authFetch(`${API}/upload-pdf`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
          Object.values(previewMap).forEach(URL.revokeObjectURL);
          setErrors([...rejectionErrors, data.error ?? t.uploadErr]); return;
        }
        if (data.files?.length) {
          const incoming: UploadedFile[] = data.files.map(
            (f: { source: string; size: number; chunks_stored: number; type: string }) => ({
              name: f.source, size: f.size, chunks: f.chunks_stored,
              fileType: (f.type ?? 'pdf') as UploadedFile['fileType'],
              previewUrl: previewMap[f.source],
            }),
          );
          setUploadedFiles(prev => {
            const next = [...prev];
            for (const nf of incoming) {
              const idx = next.findIndex(f => f.name === nf.name);
              if (idx >= 0) { if (next[idx].previewUrl) URL.revokeObjectURL(next[idx].previewUrl!); next[idx] = nf; }
              else next.push(nf);
            }
            return next;
          });
          onUpload();
        }
        const serverErrors = (data.errors ?? []).map((e: { source: string; error: string }) => `${e.source}: ${e.error}`);
        setErrors([...rejectionErrors, ...serverErrors]);
      } catch {
        Object.values(previewMap).forEach(URL.revokeObjectURL);
        setErrors([...rejectionErrors, t.serverErr]);
      } finally { setUploading(false); }
    },
    [onUpload, t],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'image/png':  ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    disabled: uploading,
  });

  const fmt = (b: number) =>
    b < 1_048_576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1_048_576).toFixed(1)} MB`;

  const handleRemoveFile = (name: string) => {
    const target = uploadedFiles.find(f => f.name === name);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    const next = uploadedFiles.filter(f => f.name !== name);
    setUploadedFiles(next);
    if (next.length === 0) onRemove();
  };

  const hasFiles = uploadedFiles.length > 0;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="rounded-2xl p-6 flex flex-col gap-5" style={{
        background: 'rgba(232,239,229,0.92)',
        border: '1px solid rgba(155,180,148,0.35)',
        boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}>

        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(81,123,62,0.10)', border: '1px solid rgba(81,123,62,0.2)' }}>
            <IconDoc className="w-5 h-5 text-[#517B3E]" />
          </span>
          <div>
            <p className="font-semibold text-[#2A3B22] text-sm leading-tight">{t.uploadDocs}</p>
            <p className="text-xs text-[#7a9268]">{t.pdfOnly}</p>
          </div>
        </div>

        {hasFiles && (
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {uploadedFiles.map(file => {
              const isPptx  = file.fileType === 'pptx';
              const isImage = file.fileType === 'image';
              return (
                <div key={file.name}
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(157,192,139,0.3)' }}>
                  {isImage && file.previewUrl ? (
                    <img src={file.previewUrl} alt={file.name} className="w-8 h-8 rounded-lg object-cover shrink-0" style={{ border: '1px solid rgba(157,192,139,0.3)' }} />
                  ) : (
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(81,123,62,0.10)', border: '1px solid rgba(81,123,62,0.2)' }}>
                      {isPptx  && <IconPresentation className="w-5 h-5 text-[#517B3E]" />}
                      {isImage && <IconPhoto        className="w-5 h-5 text-[#517B3E]" />}
                      {!isPptx && !isImage && <IconCheck className="w-5 h-5 text-[#517B3E]" />}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#2d3b25] text-xs truncate">{file.name}</p>
                    <p className="text-xs text-[#7a9268]">
                      {fmt(file.size)} · {isImage && file.chunks === 0 ? t.imageUploaded : t.chunksLabel(file.chunks)}
                    </p>
                  </div>
                  <button onClick={() => handleRemoveFile(file.name)} aria-label={t.removeFile}
                    className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-red-100/60 transition-colors shrink-0">
                    <IconX className="w-4 h-4 text-[#7a9268] hover:text-red-500" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!hasFiles ? (
          <div {...getRootProps()}
            className={[
              'rounded-2xl border flex flex-col items-center justify-center',
              'gap-4 min-h-52 transition-all duration-300 ease-in-out px-6 py-10 text-center select-none shadow-sm',
              uploading
                ? 'opacity-50 cursor-not-allowed border-white/40 bg-white/40'
                : isDragActive
                  ? 'scale-[1.01] border-[#517B3E]/50 bg-white/60 cursor-default'
                  : 'cursor-pointer border-white/50 bg-white/40 hover:bg-white/60 hover:border-white/70',
            ].join(' ')}
            style={isDragActive ? { boxShadow: '0 0 20px rgba(81,123,62,0.12)' } : undefined}>
            <input {...getInputProps()} />
            {uploading && (
              <>
                <div className="w-12 h-12 rounded-full border-2 border-[#9DC08B]/30 border-t-[#517B3E] animate-spin" />
                <p className="text-sm font-medium text-[#517B3E]">{t.uploading}</p>
              </>
            )}
            {!uploading && isDragActive && (
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-bounce" style={{ backgroundColor: '#517B3E' }}>
                  <IconCloud className="w-9 h-9 text-white" />
                </div>
                <p className="text-[#517B3E] font-bold text-lg">{t.dropHere}</p>
              </>
            )}
            {!uploading && !isDragActive && (
              <>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #9DC08B, #517B3E)' }}>
                  <IconCloud className="w-9 h-9 text-white" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-[#2d3b25]">{t.dragDrop}</p>
                  <p className="text-sm text-[#7a9268]">{t.dragHint}</p>
                </div>
                <span className="px-3 py-1 text-xs font-medium rounded-full" style={{ background: 'rgba(81,123,62,0.10)', border: '1px solid rgba(81,123,62,0.2)', color: '#517B3E' }}>
                  {t.pdfBadge}
                </span>
              </>
            )}
          </div>
        ) : (
          <div {...getRootProps()}
            className={[
              'rounded-xl border flex items-center justify-center gap-3',
              'py-3 px-4 transition-all duration-200 ease-in-out select-none',
              uploading
                ? 'opacity-50 cursor-not-allowed border-white/40 bg-white/40'
                : isDragActive
                  ? 'border-[#517B3E]/50 bg-white/60 cursor-default'
                  : 'cursor-pointer border-white/50 bg-white/40 hover:bg-white/60 hover:border-white/70',
            ].join(' ')}
            style={isDragActive ? { boxShadow: '0 0 12px rgba(81,123,62,0.10)' } : undefined}>
            <input {...getInputProps()} />
            {uploading
              ? <div className="w-4 h-4 rounded-full border-2 border-[#9DC08B]/30 border-t-[#517B3E] animate-spin" />
              : <IconCloud className="w-4 h-4 text-[#9DC08B] shrink-0" />
            }
            <span className="text-xs font-medium text-[#517B3E]">
              {uploading ? t.uploading : t.addMore}
            </span>
          </div>
        )}

        {errors.map((err, i) => (
          <div key={i} className="flex items-center gap-2 bg-red-950/50 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
            <IconX className="w-4 h-4 shrink-0" />
            {err}
          </div>
        ))}
      </div>

      {/* How to use panel */}
      <div className="flex-1 rounded-2xl p-5" style={{ background: 'rgba(232,239,229,0.92)', border: '1px solid rgba(155,180,148,0.35)', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
        <p className="text-sm font-semibold text-[#517B3E] mb-3">{t.howToUse}</p>
        <ul className="space-y-2.5">
          {t.tips.map((tip, i) => (
            <li key={i} className="flex gap-2 items-start text-sm text-[#4a5e3a]">
              <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: '#9DC08B' }} />
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Chat Interface ─────────────────────────────────────────────────────────── */
interface ChatInterfaceProps {
  hasDoc: boolean;
  sessionId: number | null;
  initialMessages: Message[];
  onSessionCreated: (id: number) => void;
  onSessionsUpdated: () => void;
  lang: Lang;
  t: T;
}

function ChatInterface({ hasDoc, sessionId, initialMessages, onSessionCreated, onSessionsUpdated, lang, t }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [localSessionId, setLocalSessionId] = useState<number | null>(sessionId);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchPhase, setSearchPhase] = useState<'thinking' | 'searching_web' | 'running_code'>('thinking');
  const [visibleSources, setVisibleSources] = useState<Set<string>>(new Set());
  const [availableDocs, setAvailableDocs] = useState<DocumentInfo[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef          = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef  = useRef<HTMLDivElement>(null);
  const [chatScrolled, setChatScrolled] = useState(false);
  const { triggerHaptic } = useHaptics();

  function handleSelectionAction(action: 'explain' | 'summarize' | 'quiz', text: string) {
    const q = lang === 'he'
      ? { explain: `הסבר לי את הקטע הבא:\n"${text}"`, summarize: `תמצת לי:\n"${text}"`, quiz: `צור שאלת מבחן על:\n"${text}"` }
      : { explain: `Explain this:\n"${text}"`, summarize: `Summarize:\n"${text}"`, quiz: `Create a quiz question about:\n"${text}"` };
    setInput(q[action]);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  /* ── Voice recording ── */
  const [isRecording,    setIsRecording]    = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError,     setVoiceError]     = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);

  /* ── Quiz ── */
  const [quizOpen,      setQuizOpen]      = useState(false);
  const [quizLoading,   setQuizLoading]   = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizError,     setQuizError]     = useState<string | null>(null);
  const [quizKey,       setQuizKey]       = useState(0);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    function onScroll() { setChatScrolled((messagesContainerRef.current?.scrollTop ?? 0) > 4); }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Fetch document list whenever docs become available (for the filter chip bar).
  useEffect(() => {
    if (!hasDoc) { setAvailableDocs([]); setSelectedFileId(null); return; }
    void (async () => {
      try {
        const res = await authFetch(`${API}/documents`);
        if (!res.ok) return;
        const data = await res.json() as { documents: DocumentInfo[] };
        Promise.resolve().then(() => setAvailableDocs(data.documents ?? []));
      } catch { /* ignore — filter bar just won't appear */ }
    })();
  }, [hasDoc]);

  const send = useCallback(async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading || !hasDoc) return;
    const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: q };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setLoading(true); setSearchPhase('thinking');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const payload: Record<string, unknown> = { message: q, session_id: localSessionId };
      if (selectedFileId) payload.file_id = selectedFileId;
      const response = await authFetch(`${API}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error ?? t.commErr);
      }
      if (!response.body) throw new Error('No response body');

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let parsed: SseEvent;
          try { parsed = JSON.parse(line.slice(6)) as SseEvent; }
          catch { continue; }
          if (parsed.type === 'status') {
            setSearchPhase(parsed.phase as 'thinking' | 'searching_web' | 'running_code');
          } else if (parsed.type === 'result') {
            if (!localSessionId && parsed.session_id) {
              setLocalSessionId(parsed.session_id);
              onSessionCreated(parsed.session_id);
            }
            onSessionsUpdated();
            setMessages(prev => [...prev, {
              id: `a${Date.now()}`, role: 'assistant', content: parsed.answer,
              searchedWeb: parsed.searched_web, webSources: parsed.web_sources ?? [],
              sources:   parsed.sources ?? [],
              citations: parsed.citation_sources ?? [],
              executedCode: parsed.executed_code || undefined,
              codeOutput:   parsed.code_output   || undefined,
              images: parsed.images && parsed.images.length > 0 ? parsed.images : undefined,
            }]);
            done = true; break;
          } else if (parsed.type === 'error') {
            throw new Error(parsed.message);
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: `e${Date.now()}`, role: 'assistant', content: err instanceof Error ? err.message : String(err) }]);
    } finally { setLoading(false); setSearchPhase('thinking'); }
  }, [input, loading, hasDoc, localSessionId, selectedFileId, onSessionCreated, onSessionsUpdated, t]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };
  const onInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target; el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
  };

  /* ── Release microphone when ChatInterface is destroyed (key change) ── */
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  /* ── Auto-dismiss voice error after 6 s ── */
  useEffect(() => {
    if (!voiceError) return;
    const timer = setTimeout(() => setVoiceError(null), 6000);
    return () => clearTimeout(timer);
  }, [voiceError]);

  const handleMicClick = useCallback(async () => {
    if (isTranscribing) return;

    /* Stop recording */
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    /* Request microphone access — show inline error instead of alert() */
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('[Voice] Microphone access denied:', err);
      setVoiceError(t.micError);
      return;
    }

    audioChunksRef.current = [];
    setVoiceError(null);

    /* Pick best MIME type supported by this browser */
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ].find(m => MediaRecorder.isTypeSupported(m)) ?? '';

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Always release the microphone first, regardless of what follows
      stream.getTracks().forEach(track => track.stop());

      try {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        if (blob.size < 200) return; // too short / accidental tap

        setIsTranscribing(true);

        const fd  = new FormData();
        const ext = recorder.mimeType.includes('ogg') ? 'ogg'
                  : recorder.mimeType.includes('mp4') ? 'mp4'
                  : 'webm';
        fd.append('audio', blob, `recording.${ext}`);

        console.log('🎤 Sending audio to: http://127.0.0.1:5003/api/transcribe');
        const res = await authFetch('http://127.0.0.1:5003/api/transcribe', { method: 'POST', body: fd, mode: 'cors' });

        // Guard against non-JSON bodies (e.g. 502 proxy error)
        let data: { text?: string; error?: string } = {};
        try { data = await res.json(); } catch { /* body wasn't JSON */ }

        if (res.ok && data.text?.trim()) {
          const transcribed = data.text.trim();
          setInput(prev => prev.trimEnd() ? prev.trimEnd() + ' ' + transcribed : transcribed);
          setTimeout(() => textareaRef.current?.focus(), 0);
        } else {
          console.error('Voice processing failed:', data.error ?? `HTTP ${res.status}`);
        }
      } catch (err) {
        // Server unreachable or network error — log for developer, UI stays clean
        console.error('Voice processing failed:', err);
      } finally {
        // Always reset loading state so the button never stays stuck
        setIsTranscribing(false);
      }
    };

    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    recorder.start();
  }, [isRecording, isTranscribing, send, t]);

  const fetchQuiz = useCallback(async () => {
    if (quizLoading) return;
    setQuizKey(k => k + 1);   // force QuizModal remount → resets internal question/score state
    setQuizLoading(true);
    setQuizError(null);
    setQuizQuestions([]);
    try {
      const res  = await authFetch(`${API}/api/generate-quiz`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(selectedFileId ? { file_id: selectedFileId } : {}),
      });
      const data = await res.json() as { questions?: QuizQuestion[]; error?: string };
      if (!res.ok) { setQuizError(data.error ?? t.quizErr); return; }
      setQuizQuestions(data.questions ?? []);
    } catch {
      setQuizError(t.quizErr);
    } finally {
      setQuizLoading(false);
    }
  }, [quizLoading, selectedFileId, t]);

  const userAlign = lang === 'he' ? 'justify-start' : 'justify-end';
  const aiAlign   = lang === 'he' ? 'justify-end'   : 'justify-start';

  return (
    <div className="rounded-2xl flex flex-col flex-1 min-h-[520px]" style={{
      background: 'rgba(232,239,229,0.92)',
      border: '1px solid rgba(155,180,148,0.35)',
      boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }}>

      {/* Header — glassmorphic depth when messages are scrolled */}
      <div className="px-5 py-4 flex items-center gap-3 shrink-0"
        style={{
          borderBottom:         '1px solid rgba(157,192,139,0.3)',
          boxShadow:            chatScrolled ? '0 4px 12px rgba(28,51,41,0.06)' : 'none',
          background:           chatScrolled ? 'rgba(255,255,255,0.88)' : 'transparent',
          backdropFilter:       chatScrolled ? 'blur(8px)' : 'none',
          WebkitBackdropFilter: chatScrolled ? 'blur(8px)' : 'none',
          transition:           'box-shadow 0.25s ease, background 0.25s ease',
        }}>
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(81,123,62,0.12)', border: '1px solid rgba(81,123,62,0.2)' }}>
          <IconSparkles className="w-5 h-5 text-[#517B3E]" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#2A3B22] text-sm">{t.chatTitle}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${hasDoc ? 'bg-[#9DC08B] animate-pulse' : 'bg-[#9DC08B]/30'}`} />
            <span className="text-xs text-[#7a9268]">{hasDoc ? t.docReady : t.waitingPdf}</span>
          </div>
        </div>
        {hasDoc && (
          <button
            onClick={() => { setQuizOpen(true); void fetchQuiz(); }}
            disabled={quizLoading}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 hover:shadow-[0_6px_20px_rgba(209,230,217,0.5)]"
            style={{
              background: 'rgba(81,123,62,0.1)',
              border:     '1.5px solid rgba(81,123,62,0.3)',
              color:      '#517B3E',
              cursor:     quizLoading ? 'wait' : 'pointer',
              opacity:    quizLoading ? 0.65 : 1,
            }}
          >
            {quizLoading
              ? <span className="w-3 h-3 rounded-full border-2 animate-spin shrink-0 block"
                  style={{ borderColor: 'rgba(81,123,62,0.25)', borderTopColor: '#517B3E' }} />
              : <IconBrain className="w-3.5 h-3.5 shrink-0" />
            }
            <span>{quizLoading ? t.quizLoading : t.quizMe}</span>
          </button>
        )}
      </div>

      {/* Document filter chips — only when multiple docs are uploaded */}
      {availableDocs.filter(d => d.file_id).length > 1 && (
        <div className="px-4 py-2 flex items-center gap-2 flex-wrap shrink-0"
          style={{ borderBottom: '1px solid rgba(157,192,139,0.18)' }}>
          <span className="text-[11px] font-semibold text-[#7a9268] shrink-0 me-0.5">{t.filterLabel}</span>
          {/* "All" chip */}
          <button
            onClick={() => setSelectedFileId(null)}
            className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all"
            style={!selectedFileId
              ? { background: '#9DC08B', color: '#1a2e14' }
              : { border: '1px solid rgba(157,192,139,0.45)', color: '#7a9268' }}>
            {t.filterAll}
          </button>
          {/* One chip per document */}
          {availableDocs.filter(d => d.file_id).map(doc => (
            <button
              key={doc.file_id}
              onClick={() => setSelectedFileId(prev => prev === doc.file_id ? null : doc.file_id)}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all max-w-[140px] truncate"
              title={doc.name}
              style={selectedFileId === doc.file_id
                ? { background: '#517B3E', color: 'white' }
                : { border: '1px solid rgba(157,192,139,0.45)', color: '#7a9268' }}>
              {doc.name.replace(/\.[^/.]+$/, '')}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-5 py-12 flex-1 text-center">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.15)' }}>
              <IconSparkles className="w-10 h-10 text-[#9DC08B]" />
            </div>
            <div>
              <p className="font-medium text-[#2d3b25]">{hasDoc ? t.askQ : t.uploadToStart}</p>
              <p className="text-sm text-[#7a9268] mt-1">{hasDoc ? t.askHint : t.uploadSideHint}</p>
            </div>
            {hasDoc && (
              <div className="flex flex-wrap gap-2 justify-center">
                {t.suggestions.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="px-4 py-2 text-xs rounded-full transition-all hover:scale-[1.02]"
                    style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.2)', color: '#517B3E' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.15)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.08)'; }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? userAlign : aiAlign}`}>
                <div className="flex flex-col gap-1.5 max-w-[78%]">
                  <div dir="auto"
                    className={[
                      'px-4 py-3 rounded-2xl text-sm',
                      msg.role === 'user'
                        ? 'rounded-tr-sm leading-relaxed whitespace-pre-wrap font-medium'
                        : 'rounded-tl-sm',
                    ].join(' ')}
                    style={msg.role === 'user'
                      ? { background: '#9DC08B', color: '#1a2e14', boxShadow: '0 2px 8px rgba(81,123,62,0.18)' }
                      : {
                          background: 'rgba(255,255,255,0.90)',
                          color:      '#2A3B22',
                          border:     loading && idx === messages.length - 1
                            ? '1px solid rgba(74,222,128,0.35)'
                            : '1px solid rgba(157,192,139,0.3)',
                          boxShadow:  loading && idx === messages.length - 1
                            ? '0 2px 8px rgba(60,90,40,0.07), 0 0 18px rgba(74,222,128,0.12)'
                            : '0 2px 8px rgba(60,90,40,0.07)',
                          transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
                        }}>
                    {msg.role === 'user' ? msg.content : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000', strict: false }]]}
                        components={{
                          h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-1.5 text-[#1a2e14] border-b border-[rgba(81,123,62,0.25)] pb-1">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-semibold mt-2.5 mb-1 text-[#2A3B22]">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-0.5 text-[#3a5028]">{children}</h3>,
                          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold text-[#1a2e14]">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          blockquote: ({ children }) => (
                            <blockquote className="border-s-2 ps-3 my-2 italic text-[#4a6035]"
                              style={{ borderColor: 'rgba(81,123,62,0.45)' }}>
                              {children}
                            </blockquote>
                          ),
                          pre: CodeBlockPre,
                          code: ({ className, children }) => {
                            if (className) return (
                              <code dir="ltr" style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'embed' }}
                                className={`${className} text-[#9DC08B] text-[11px] font-mono leading-relaxed`}>
                                {children}
                              </code>
                            );
                            return <InlineCode>{children}</InlineCode>;
                          },
                          ul: ({ children }) => <ul className="list-disc ps-4 my-1.5 space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal ps-4 my-1.5 space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-2">
                              <table className="text-xs border-collapse w-full">{children}</table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="px-2 py-1 font-semibold text-left" style={{ border: '1px solid rgba(81,123,62,0.25)', background: 'rgba(81,123,62,0.08)', color: '#2A3B22' }}>{children}</th>
                          ),
                          td: ({ children }) => (
                            <td className="px-2 py-1" style={{ border: '1px solid rgba(81,123,62,0.2)', color: '#374151' }}>{children}</td>
                          ),
                          hr: () => <hr className="my-2" style={{ borderColor: 'rgba(81,123,62,0.25)' }} />,
                          a: ({ href, children }) => {
                            // Block non-http(s) protocols (javascript:, data:, etc.)
                            const safeHref = href && /^https?:\/\//i.test(href) ? href : '#';
                            return (
                              <a href={safeHref} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 max-w-[220px] px-2.5 py-0.5 mx-0.5 rounded-full border text-xs font-semibold transition-all align-middle"
                                style={{ background: 'rgba(81,123,62,0.08)', borderColor: 'rgba(81,123,62,0.3)', color: '#517B3E', textDecoration: 'none' }}>
                                <span className="shrink-0 text-[11px]">🔗</span>
                                <span className="min-w-0" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {children}
                                </span>
                              </a>
                            );
                          },
                        }}>
                        {preprocessMath(msg.content)}
                      </ReactMarkdown>
                    )}
                  </div>

                  {/* Code results */}
                  {msg.role === 'assistant' &&
                    (msg.executedCode || msg.codeOutput || (msg.images && msg.images.length > 0)) && (
                    <CodeExecutionBlock code={msg.executedCode} output={msg.codeOutput} images={msg.images} t={t} />
                  )}

                  {/* Document citation badges — page-level source attribution */}
                  {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {msg.citations.map((cite, i) => (
                        <span key={i}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: 'rgba(107,144,74,0.09)',
                            color:      '#3d6030',
                            border:     '1px solid rgba(107,144,74,0.22)',
                          }}>
                          <svg className="w-3 h-3 shrink-0 opacity-70" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                          </svg>
                          <span className="max-w-[110px] truncate">
                            {cite.file_name.replace(/\.[^/.]+$/, '')}
                          </span>
                          {cite.page_number != null && (
                            <span className="text-[10px] font-bold px-1 rounded"
                              style={{ background: 'rgba(107,144,74,0.18)', color: '#2d5020' }}>
                              p.{cite.page_number}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Web source chips — neon outline style, on-demand */}
                  {msg.role === 'assistant' && msg.webSources && msg.webSources.length > 0 && (
                    <div className="mt-0.5">
                      <button
                        onClick={() => setVisibleSources(prev => {
                          const next = new Set(prev);
                          if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id);
                          return next;
                        })}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
                        style={{ border: '1px solid rgba(81,123,62,0.25)', background: 'rgba(81,123,62,0.07)', color: '#517B3E' }}>
                        <IconGlobe className="w-3 h-3 shrink-0" />
                        {visibleSources.has(msg.id) ? t.hideSources : t.showSources(msg.webSources.length)}
                      </button>
                      {visibleSources.has(msg.id) && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {msg.webSources.map((src, i) => (
                            <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                              title={src.title || src.url}
                              className="group flex items-center gap-1.5 max-w-[180px] px-2.5 py-1.5 rounded-lg transition-all no-underline"
                              style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(157,192,139,0.3)', color: '#2d3b25' }}>
                              <span className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 leading-none" style={{ background: 'rgba(81,123,62,0.12)', color: '#517B3E' }}>
                                {i + 1}
                              </span>
                              <IconGlobe className="w-3 h-3 shrink-0 text-[#9DC08B]" />
                              <span className="text-xs text-[#4a5e3a] min-w-0"
                                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {src.title ? src.title : getDomain(src.url)}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* AI thinking indicator */}
            {loading && (
              <div className={`flex ${aiAlign}`}>
                <AIThinkingIndicator
                  phase={searchPhase}
                  searchingText={t.searchingWeb}
                  runningCodeText={t.runningCode}
                />
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area — pb uses safe-area-inset-bottom so the iOS keyboard doesn't cover it */}
      <div
        className={`px-4 pt-3 shrink-0 transition-opacity ${!hasDoc ? 'opacity-40' : ''}`}
        style={{ borderTop: '1px solid rgba(157,192,139,0.3)', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className={[
          'flex items-end gap-2 rounded-2xl px-4 py-2.5 transition-all duration-150',
          !hasDoc ? 'pointer-events-none' : '',
        ].join(' ')}
        style={{
          background: 'rgba(255,255,255,0.80)',
          border: '1px solid rgba(157,192,139,0.35)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 12px rgba(60,90,40,0.06)',
        }}>
          <textarea ref={textareaRef} value={input} onChange={onInput} onKeyDown={onKey}
            dir="auto" rows={1}
            disabled={!hasDoc || loading || isTranscribing}
            placeholder={
              isTranscribing  ? t.micProcessing :
              isRecording     ? '🔴 ' + t.micStop :
              hasDoc          ? t.chatPlaceholder :
              t.chatPlaceholderNoDoc
            }
            className="flex-1 bg-transparent resize-none outline-none text-sm disabled:cursor-not-allowed leading-relaxed"
            style={{ maxHeight: 130, color: '#2A3B22' }} />

          {/* ── Microphone button ── */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isTranscribing || ((!hasDoc || loading) && !isRecording)}
            aria-label={isRecording ? t.micStop : t.micStart}
            title={isRecording ? t.micStop : t.micStart}
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:cursor-not-allowed ${isRecording ? 'animate-pulse' : ''}`}
            style={{
              backgroundColor: isRecording
                ? 'rgba(220,38,38,0.85)'
                : isTranscribing
                  ? 'rgba(157,192,139,0.35)'
                  : 'rgba(157,192,139,0.25)',
              border: isRecording
                ? '2px solid rgba(220,38,38,0.40)'
                : '1.5px solid rgba(157,192,139,0.30)',
            }}
          >
            {isTranscribing ? (
              <div className="w-4 h-4 rounded-full border-2 border-[#9DC08B]/30 border-t-[#517B3E] animate-spin" />
            ) : (
              <IconMic className={`w-4 h-4 ${isRecording ? 'text-white' : 'text-[#517B3E]'}`} />
            )}
          </button>

          {/* ── Send button ── */}
          <button
            onClick={() => { playPop(); triggerHaptic('light'); send(); }}
            disabled={!hasDoc || !input.trim() || loading || isRecording || isTranscribing}
            aria-label={t.send}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:cursor-not-allowed hover:shadow-[0_8px_30px_rgba(209,230,217,0.5)]"
            style={{ backgroundColor: (!hasDoc || !input.trim() || loading || isRecording || isTranscribing) ? 'rgba(157,192,139,0.3)' : '#517B3E' }}>
            <IconSend className="w-4 h-4 text-white" />
          </button>
        </div>
        {voiceError && (
          <p className="text-center text-xs text-red-500 mt-1.5 select-none animate-fade-scale-lift">
            🎤 {voiceError}
          </p>
        )}
        <p className="text-center text-xs text-[#9aaf8a] mt-1 select-none">{t.enterHint}</p>
      </div>

      {/* Selection action popover — fixed; responds to text highlighted inside the messages area */}
      <SelectionPopover
        containerRef={messagesContainerRef}
        onAction={handleSelectionAction}
        lang={lang}
      />

      {/* Quiz overlay — fixed positioning covers the full viewport regardless of DOM parent */}
      {quizOpen && (
        <QuizModal
          key={quizKey}
          questions={quizQuestions}
          loading={quizLoading}
          error={quizError}
          lang={lang}
          t={t}
          onClose={() => setQuizOpen(false)}
          onRetry={() => void fetchQuiz()}
        />
      )}
    </div>
  );
}

/* ─── Pricing modal ──────────────────────────────────────────────────────────── */
function PricingModal({ onClose }: { onClose: () => void }) {
  const { lang } = useLanguage();
  const [selected, setSelected] = useState<'monthly' | 'semester'>('semester');
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClose = useCallback(() => {
    setClosing(true);
    closeTimerRef.current = setTimeout(onClose, 230);
  }, [onClose]);

  // Clear timer on unmount to prevent stale-closure side effects
  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const he = lang === 'he';

  const CHECK = (
    <svg className="w-[14px] h-[14px] shrink-0" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2.5} style={{ color: '#517B3E' }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
      style={{
        backgroundColor: 'rgba(12,22,10,0.52)',
        backdropFilter: 'blur(18px)',
        animation: closing
          ? 'overlay-exit 0.24s ease-in both'
          : 'overlay-enter 0.3s ease-out both',
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* ── Modal card ── */}
      <div
        dir={he ? 'rtl' : 'ltr'}
        className="relative w-full max-w-2xl rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(248,252,244,0.97)',
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(157,192,139,0.28)',
          boxShadow: '0 20px 56px rgba(20,36,16,0.18), 0 4px 16px rgba(81,123,62,0.10)',
          maxHeight: '92vh',
          overflowY: 'auto',
          animation: closing
            ? 'pricing-exit 0.22s cubic-bezier(0.4,0,0.6,1) both'
            : 'pricing-enter 0.38s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* ── Decorative organic background ── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {/* Radial bloom — top-end corner */}
          <div className="absolute -top-24 -end-20 w-80 h-80 rounded-full"
            style={{ background: 'radial-gradient(circle at center, rgba(164,214,136,0.2) 0%, transparent 65%)' }} />
          {/* Radial bloom — bottom-start corner */}
          <div className="absolute -bottom-20 -start-20 w-72 h-72 rounded-full"
            style={{ background: 'radial-gradient(circle at center, rgba(81,123,62,0.09) 0%, transparent 65%)' }} />
          {/* Concentric ripple rings — centred */}
          <div className="absolute rounded-full" style={{
            width: 440, height: 440,
            top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            border: '1px solid rgba(157,192,139,0.08)',
          }} />
          <div className="absolute rounded-full" style={{
            width: 290, height: 290,
            top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            border: '1px solid rgba(157,192,139,0.06)',
          }} />

          {/* Minimalist bonsai — bottom-end */}
          <svg width="96" height="96" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg"
            className="absolute bottom-4 end-4" style={{ opacity: 0.065 }}>
            <path d="M48 90 C47 76 45 66 48 54" stroke="#2A3B22" strokeWidth="3.5" strokeLinecap="round"/>
            <path d="M48 63 C43 57 32 54 23 47" stroke="#2A3B22" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M48 57 C53 50 63 47 72 40" stroke="#2A3B22" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M48 54 C47 45 47 37 48 31" stroke="#2A3B22" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="21" cy="43" r="11" fill="#517B3E"/>
            <circle cx="32" cy="36" r="9" fill="#2A3B22"/>
            <circle cx="72" cy="36" r="10" fill="#517B3E"/>
            <circle cx="59" cy="29" r="8" fill="#2A3B22"/>
            <circle cx="48" cy="25" r="12" fill="#517B3E"/>
            <circle cx="40" cy="31" r="7" fill="#3d5530"/>
            <rect x="38" y="90" width="20" height="5" rx="2.5" fill="#2A3B22"/>
            <path d="M35 90 L37 98 H59 L61 90 Z" fill="#3d5530"/>
          </svg>

          {/* Minimalist matcha cup — top-start */}
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg"
            className="absolute top-3 start-3" style={{ opacity: 0.07 }}>
            <path d="M28 22 C27 17 31 16 30 11" stroke="#517B3E" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M40 20 C39 15 43 14 42 9" stroke="#517B3E" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M52 22 C51 17 55 16 54 11" stroke="#517B3E" strokeWidth="1.8" strokeLinecap="round"/>
            <rect x="17" y="26" width="46" height="6" rx="3" fill="#2A3B22"/>
            <path d="M21 32 L23 60 H57 L59 32 Z" fill="#517B3E"/>
            <path d="M59 36 C68 36 70 41 70 45 C70 49 68 54 59 54"
              stroke="#2A3B22" strokeWidth="3" fill="none" strokeLinecap="round"/>
            <ellipse cx="40" cy="62" rx="25" ry="4.5" fill="#2A3B22"/>
          </svg>
        </div>

        {/* ── Header ── */}
        <div className="relative px-6 pt-5 pb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-[#1a2e14] leading-snug tracking-tight">
              {he ? 'שדרג את החשבון שלך' : 'Upgrade Your Account'}
            </h2>
            <p className="text-[13px] text-[#7a9268] mt-1">
              {he ? 'בחר את המסלול המתאים לך' : 'Choose the plan that fits you'}
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label={he ? 'סגור' : 'Close'}
            className="shrink-0 mt-0.5 p-2 rounded-xl transition-all"
            style={{ color: '#9aad8a', background: 'rgba(157,192,139,0.10)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(157,192,139,0.22)'; (e.currentTarget as HTMLButtonElement).style.color = '#517B3E'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(157,192,139,0.10)'; (e.currentTarget as HTMLButtonElement).style.color = '#9aad8a'; }}
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>

        {/* Thin divider */}
        <div className="mx-5 mb-4" style={{ height: '1px', background: 'rgba(157,192,139,0.22)' }} />

        {/* ── Side-by-side plan cards ──
            RTL flex-row: first child → right (Semester)
                          second child → left (Monthly)            ── */}
        <div className="px-5 flex flex-col sm:flex-row gap-3">

          {/* Semester — right in RTL, first in DOM */}
          <button
            type="button"
            onClick={() => setSelected('semester')}
            className="flex-1 text-start rounded-2xl relative overflow-hidden transition-all"
            style={{
              padding: '0 20px 20px',
              background: selected === 'semester'
                ? 'rgba(192,232,170,0.32)'
                : 'rgba(214,240,198,0.20)',
              border: selected === 'semester'
                ? '1.5px solid rgba(81,123,62,0.45)'
                : '1.5px solid rgba(157,192,139,0.30)',
              boxShadow: selected === 'semester'
                ? '0 4px 22px rgba(81,123,62,0.13)'
                : 'none',
            }}
          >
            {/* Full-width top banner badge */}
            <div
              className="flex items-center justify-center gap-1.5 py-1.5 -mx-5 mb-4 text-[10px] font-bold tracking-widest uppercase"
              style={{
                background: 'linear-gradient(90deg, #2A3B22 0%, #517B3E 50%, #2A3B22 100%)',
                color: 'rgba(255,255,255,0.9)',
                letterSpacing: '0.08em',
              }}
            >
              <IconSparkles className="w-3 h-3" />
              {he ? 'הכי משתלם' : 'Best Value'}
            </div>

            {/* Radio + title row */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <div
                className="w-[17px] h-[17px] rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                style={{ borderColor: selected === 'semester' ? '#517B3E' : 'rgba(157,192,139,0.5)' }}
              >
                {selected === 'semester' && (
                  <div className="w-[7px] h-[7px] rounded-full" style={{ background: '#517B3E' }} />
                )}
              </div>
              <span className="text-[15px] font-bold text-[#1a2e14]">
                {he ? 'סמסטר' : 'Semester'}
              </span>
              <span
                className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full tracking-wide"
                style={{ background: 'rgba(81,123,62,0.14)', color: '#2A3B22' }}
              >
                {he ? 'חיסכון 15%' : 'Save 15%'}
              </span>
            </div>

            {/* Price */}
            <div className="leading-none mb-0.5">
              <span className="text-[44px] font-black text-[#1a2e14]">₪100</span>
            </div>
            <p className="text-[12px] text-[#7a9268]">{he ? 'ל-4 חודשים' : 'for 4 months'}</p>
            <p className="text-[12px] font-semibold mb-4" style={{ color: '#517B3E' }}>
              {he ? '₪25 לחודש בלבד' : '₪25/month only'}
            </p>

            {/* Features */}
            <ul className="space-y-2.5 mb-4">
              {(he
                ? ['כל תכונות ה-Pro', 'חיסכון של 15%', 'שקט נפשי לכל הסמסטר']
                : ['All Pro features', 'Save 15%', 'Peace of mind all semester']
              ).map(f => (
                <li key={f} className="flex items-center gap-2.5 text-[13px] text-[#3a5228]">
                  {CHECK}{f}
                </li>
              ))}
            </ul>

            <p className="text-[11px]" style={{ color: 'rgba(100,130,80,0.85)' }}>
              {he ? 'תשלום חד פעמי — ללא חיוב חוזר' : 'One-time payment — no recurring charges'}
            </p>
          </button>

          {/* Monthly — left in RTL, second in DOM */}
          <button
            type="button"
            onClick={() => setSelected('monthly')}
            className="flex-1 text-start rounded-2xl p-5 transition-all"
            style={{
              background: selected === 'monthly'
                ? 'rgba(255,255,255,0.92)'
                : 'rgba(232,239,229,0.92)',
              border: selected === 'monthly'
                ? '1.5px solid rgba(157,192,139,0.55)'
                : '1.5px solid rgba(200,215,188,0.48)',
              boxShadow: selected === 'monthly'
                ? '0 4px 18px rgba(81,123,62,0.09)'
                : 'none',
            }}
          >
            {/* Radio + title */}
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className="w-[17px] h-[17px] rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                style={{ borderColor: selected === 'monthly' ? '#517B3E' : 'rgba(157,192,139,0.5)' }}
              >
                {selected === 'monthly' && (
                  <div className="w-[7px] h-[7px] rounded-full" style={{ background: '#517B3E' }} />
                )}
              </div>
              <span className="text-[15px] font-bold text-[#1a2e14]">
                {he ? 'מסלול חודשי' : 'Monthly Plan'}
              </span>
            </div>

            {/* Price */}
            <div className="leading-none mb-0.5">
              <span className="text-[44px] font-black text-[#1a2e14]">₪29</span>
            </div>
            <p className="text-[12px] text-[#7a9268] mb-5">{he ? 'לחודש' : '/month'}</p>

            {/* Features */}
            <ul className="space-y-2.5 mb-4">
              {(he
                ? ['גישה מלאה ל-AI', 'העלאת קבצים ללא הגבלה', 'תמיכה מועדפת']
                : ['Full AI access', 'Unlimited file uploads', 'Priority support']
              ).map(f => (
                <li key={f} className="flex items-center gap-2.5 text-[13px] text-[#3a5228]">
                  {CHECK}{f}
                </li>
              ))}
            </ul>

            <p className="text-[11px]" style={{ color: 'rgba(100,130,80,0.85)' }}>
              {he ? 'חיוב חודשי חוזר' : 'Recurring monthly billing'}
            </p>
          </button>
        </div>

        {/* ── Disabled CTA ── */}
        <div className="px-5 pt-4 pb-6">
          <button
            disabled
            className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #2A3B22 0%, #3d5530 100%)',
              color: 'rgba(200,225,185,0.38)',
              fontSize: '0.875rem',
              fontWeight: 700,
              opacity: 0.46,
              letterSpacing: '0.01em',
            }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            {he ? 'מעבר לתשלום' : 'Continue to Payment'}
          </button>
          <p className="text-center text-[11px] text-[#7a9268] mt-2.5 leading-snug">
            {he
              ? 'התשלום יהיה זמין בקרוב (המערכת בשדרוג)'
              : 'Payment coming soon (system upgrade in progress)'}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Logout confirmation modal ─────────────────────────────────────────────── */
function LogoutConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { lang } = useLanguage();
  const t = translations[lang];

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-slide-up-fade"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        dir={lang === 'he' ? 'rtl' : 'ltr'}
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.98)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(220,38,38,0.18)',
          boxShadow: '0 20px 60px rgba(30,10,10,0.22), 0 4px 16px rgba(220,38,38,0.08)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ background: 'rgba(220,38,38,0.04)', borderBottom: '1px solid rgba(220,38,38,0.12)' }}
        >
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.2)' }}
          >
            <svg className="w-5 h-5" style={{ color: '#dc2626' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
          </div>
          <h2 className="text-base font-bold text-[#1a2e14]">{t.logoutTitle}</h2>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          <p className="text-sm text-[#4a5e3a] leading-relaxed">
            {t.logoutBody}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all"
            style={{ color: '#7a9268', borderColor: 'rgba(157,192,139,0.45)', background: 'transparent' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.06)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            {t.cancel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 text-white"
            style={{ background: '#dc2626', boxShadow: '0 4px 14px rgba(220,38,38,0.30)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#b91c1c'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#dc2626'; }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            {t.logoutYes}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Sidebar ────────────────────────────────────────────────────────────────── */
interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: number | null;
  onNewChat: () => void;
  onSelectSession: (id: number) => void;
  onDeleteSession: (id: number) => void;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  lang: Lang;
  t: T;
  userFirstName: string;
  userLastName: string;
  userEmail: string;
  userInitials: string;
  userGender: string;
  onOpenProfile: () => void;
  onRequestLogout: () => void;
}

function Sidebar({ sessions, currentSessionId, onNewChat, onSelectSession, onDeleteSession, isOpen, onClose, isAdmin, lang, t, userFirstName, userLastName, userEmail, userInitials, userGender, onOpenProfile, onRequestLogout }: SidebarProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const { selectedCourse, setSelectedCourse } = useCourse();
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const translateClass = isOpen
    ? 'translate-x-0'
    : lang === 'he' ? 'translate-x-full' : '-translate-x-full';

  return (
    <>
      {/* Backdrop */}
      <div
        className={['fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'].join(' ')}
        style={{ backgroundColor: 'rgba(28,51,41,0.25)' }}
        onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <aside className={[
        'fixed inset-y-0 start-0 z-50 w-72',
        'flex flex-col transition-transform duration-300 ease-in-out',
        translateClass,
      ].join(' ')}
      style={{
        backgroundColor: 'rgba(255,255,255,0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderInlineEnd: '1px solid #E2EBE5',
        boxShadow: '4px 0 28px rgba(28,51,41,0.07)',
      }}>

        {/* Logo header */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: '1px solid #E8F0EB' }}>
          <LogoMark size={36} />
          <button onClick={onClose} aria-label={t.closeMenu}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors shrink-0">
            <IconX className="w-4 h-4 text-[#4a5e3a]" />
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 py-3 shrink-0" style={{ borderBottom: '1px solid #E8F0EB' }}>
          <button onClick={() => { onNewChat(); onClose(); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ backgroundColor: '#517B3E' }}>
            <IconPlus className="w-4 h-4 shrink-0" />
            {t.newChat}
          </button>
        </div>

        {/* Active course indicator */}
        {selectedCourse && (
          <div className="mx-3 mt-2 px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 shrink-0"
            style={{ background: `${selectedCourse.color}12`, border: `1px solid ${selectedCourse.color}25` }}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm leading-none shrink-0">{selectedCourse.icon}</span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: selectedCourse.color }}>{lang === 'he' ? 'קורס פעיל' : 'Active course'}</p>
                <p className="text-xs font-bold text-[#1a2e14] truncate">{selectedCourse.name}</p>
              </div>
            </div>
            <button onClick={() => setSelectedCourse(null)} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded hover:bg-black/10 transition-colors" style={{ color: selectedCourse.color }}>✕</button>
          </div>
        )}

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto flex flex-col">

          {/* Quick nav */}
          <div className="px-3 py-3 space-y-1 shrink-0" style={{ borderBottom: '1px solid #E8F0EB' }}>
            <p className="text-[10px] font-semibold text-[#527061] uppercase tracking-widest px-2 mb-2">Navigation</p>
            <button
              onClick={() => { router.push('/dashboard'); onClose(); }}
              className={['w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all', pathname === '/dashboard' ? 'font-bold' : 'hover:bg-white/5'].join(' ')}
              style={pathname === '/dashboard' ? { backgroundColor: '#D1E6D9', color: '#183025', fontWeight: 700 } : { color: '#1C3329' }}
            >
              <span className="text-base leading-none shrink-0">🏠</span>
              {t.navHome}
            </button>
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-bold"
              style={{ backgroundColor: '#D1E6D9', color: '#183025' }}
            >
              <span className="text-base leading-none shrink-0">🌱</span>
              {t.navStudyLab}
            </button>
            <button
              onClick={() => { router.push('/academic-writing'); onClose(); }}
              className={['w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all', pathname === '/academic-writing' ? 'font-bold' : 'hover:bg-white/5'].join(' ')}
              style={pathname === '/academic-writing' ? { backgroundColor: '#D1E6D9', color: '#183025', fontWeight: 700 } : { color: '#1C3329' }}
            >
              <span className="text-base leading-none shrink-0">✍️</span>
              {t.tabPaper}
            </button>
            <button
              onClick={() => { router.push('/workspace/professor-simulator'); onClose(); }}
              className={['w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all', pathname === '/workspace/professor-simulator' ? 'font-bold' : 'hover:bg-white/5'].join(' ')}
              style={pathname === '/workspace/professor-simulator' ? { backgroundColor: '#D1E6D9', color: '#183025', fontWeight: 700 } : { color: '#1C3329' }}
            >
              <span className="text-base leading-none shrink-0">🧠</span>
              {t.navProfSim}
            </button>
            <button
              onClick={() => { router.push('/mastery'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#1C3329]/70 transition-all hover:bg-[#EEF5F0] hover:text-[#1C3329]"
            >
              <span className="text-base leading-none shrink-0">🎯</span>
              {t.navGapFill}
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

          {/* Notes (sessions) */}
          <div className="flex-1 overflow-y-auto py-2">
            <p className="text-[10px] font-semibold text-[#527061] uppercase tracking-widest px-5 mb-2 mt-2">
              {t.navNotes}
            </p>
            {sessions.length === 0 ? (
              <p className="text-xs text-center py-6 px-4 text-[#527061]">{t.noPrevChats}</p>
            ) : (
              sessions.map(s => (
                <div key={s.id}
                  onClick={() => { onSelectSession(s.id); onClose(); }}
                  className={`group flex items-start gap-2 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-all ${
                    currentSessionId === s.id ? 'font-bold' : 'hover:bg-[#EEF5F0]'
                  }`}
                  style={currentSessionId === s.id ? { backgroundColor: '#EEF5F0', borderInlineStart: '2px solid #527061' } : {}}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate leading-snug ${currentSessionId === s.id ? 'text-[#1C3329]' : 'text-[#1C3329]/70'}`}>
                      {s.title}
                    </p>
                    <p className="text-xs mt-0.5 text-[#527061]">{fmtDate(s.updated_at)}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }}
                    aria-label={t.deleteChat}
                    className="opacity-0 group-hover:opacity-100 mt-0.5 p-1 rounded hover:bg-red-100/60 transition-all shrink-0">
                    <IconX className="w-3 h-3 text-[#7a9268] hover:text-red-500" />
                  </button>
                </div>
              ))
            )}
          </div>

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
                {t.navDashboard}
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
                {t.navAdmin}
              </button>
            </div>
          )}
        </div>

        {/* ── Bottom: Logout + User Profile ── */}
        <div className="shrink-0 px-3 pt-2 pb-2.5" style={{ borderTop: '1px solid rgba(100,140,80,0.2)' }}>

          {/* Logout ghost button */}
          <button
            dir="rtl"
            onClick={() => { onClose(); onRequestLogout(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[#7a9268] hover:bg-red-50 hover:text-red-500 mb-1"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
            </svg>
            <span className="text-sm font-medium">{t.logout}</span>
          </button>

          {/* User profile trigger */}
          <button
            dir="rtl"
            onClick={onOpenProfile}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-[#517B3E]/10 active:scale-[0.99] group"
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
              <p className="text-[11px] text-[#7a9268] truncate">
                {userEmail}
              </p>
            </div>
            <svg
              className="w-4 h-4 text-[#7a9268] shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
            </svg>
          </button>
        </div>

      </aside>
    </>
  );
}

interface UsageInfo {
  plan_type: string;
  uploads_this_month: number;
  upload_limit: number | null;
  questions_this_month: number;
  question_limit: number | null;
}

/* ─── Root page ──────────────────────────────────────────────────────────────── */

// ── Matcha Leaf CSS ────────────────────────────────────────────────────
const MATCHA_LEAF_CSS = `
  .matcha-workspace-main {
    position: relative !important;
    overflow: hidden !important;
  }
  .matcha-workspace-main::before {
    content: '';
    position: absolute;
    top: -18%; right: -6%;
    width: 280px; height: 280px;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M 50 0 C 75 15%2C 90 35%2C 85 55 C 80 75%2C 65 90%2C 50 100 C 35 90%2C 20 75%2C 15 55 C 10 35%2C 25 15%2C 50 0 Z' fill='%234a7a32'/%3E%3C/svg%3E") no-repeat center/contain;
    transform: rotate(-25deg);
    opacity: 0.06; pointer-events: none; z-index: 0;
  }
  .matcha-workspace-main::after {
    content: '';
    position: absolute;
    bottom: -10%; left: -6%;
    width: 250px; height: 250px;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M 50 0 C 75 15%2C 90 35%2C 85 55 C 80 75%2C 65 90%2C 50 100 C 35 90%2C 20 75%2C 15 55 C 10 35%2C 25 15%2C 50 0 Z' fill='%234a7a32'/%3E%3C/svg%3E") no-repeat center/contain;
    transform: rotate(50deg);
    opacity: 0.055; pointer-events: none; z-index: 0;
  }
  .matcha-workspace-main > * { position: relative; z-index: 1; }
`;

function Home() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading, logout: authLogout } = useAuth();
  const { selectedCourse, setSelectedCourse, courseHydrated } = useCourse();

  // isAuthenticated always starts false (same on server and client) to avoid
  // the SSR/hydration mismatch where the server returns null but the client
  // returns the full UI. The useEffect below sets it to true after mount.
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
  const [userInstitution,  setUserInstitution]  = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_institution')   ?? '') : '');
  const [userPrimaryMajor, setUserPrimaryMajor] = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_primary_major') ?? '') : '');
  const [userDegreeType]                        = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_degree_type')     ?? '') : '');
  const [userSecondaryMajor]                    = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_secondary_major') ?? '') : '');
  const [userCountry]                           = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_country')         ?? '') : '');
  const [userGender, setUserGender]             = useState(() => typeof window !== 'undefined' ? (localStorage.getItem('levy_ai_gender')          ?? '') : '');

  const [hasDoc, setHasDoc]                     = useState(false);

  /* ── Usage ── */
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const fetchUsage = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/usage`);
      if (res.ok) setUsage(await res.json());
    } catch { /* backend not running */ }
  }, []);
  const [sessions, setSessions]                 = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [initialMessages, setInitialMessages]   = useState<Message[]>([]);
  const [chatKey, setChatKey]                   = useState<string>('new');
  const [pdfKey, setPdfKey]                     = useState<string>('initial');

  const { lang, toggleLanguage }                = useLanguage();
  const [sidebarOpen, setSidebarOpen]           = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal]   = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [rateLimitToast, setRateLimitToast]     = useState(false);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const profilePopoverRef   = useRef<HTMLDivElement>(null);
  const mainScrollRef       = useRef<HTMLDivElement>(null);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [soundOn,         setSoundOn]        = useState(true);

  const t = translations[lang];

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { setSidebarOpen(false); setProfilePopoverOpen(false); setShowLogoutModal(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ── Intercept browser Back button ── */
  useEffect(() => {
    // Push an extra history entry so the Back button has something to pop.
    window.history.pushState(null, '', window.location.href);
    const onPop = () => {
      // Re-push to prevent actual navigation away from the workspace.
      window.history.pushState(null, '', window.location.href);
      setShowLogoutModal(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /* ── Rate-limit toast ── */
  useEffect(() => {
    const handle = () => {
      setRateLimitToast(true);
      const timer = setTimeout(() => setRateLimitToast(false), 6000);
      return () => clearTimeout(timer);
    };
    window.addEventListener('u-note-rate-limit', handle);
    return () => window.removeEventListener('u-note-rate-limit', handle);
  }, []);

  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    function onScroll() { setHeaderScrolled((mainScrollRef.current?.scrollTop ?? 0) > 4); }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    Promise.resolve(null).then(() => setSoundOn(getSoundEnabled()));
  }, []);

  const handleSoundToggle = useCallback(() => {
    const next = toggleSound();
    setSoundOn(next);
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/sessions`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch { /* backend not running yet */ }
  }, []);

  // Auth check — waits for the global AuthProvider to finish reading localStorage,
  // then gates on the context user object so the check survives client-side
  // navigation without re-reading localStorage on every mount.
  useEffect(() => {
    if (authLoading) return;           // provider not ready yet
    if (!authUser) {
      router.replace('/?login=true');  // context says no valid session
      return;
    }
    authFetch(`${API}/sessions`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then((data: { sessions?: ChatSession[] }) => setSessions(data.sessions ?? []))
      .catch(() => {})
      .finally(() => setIsAuthenticated(true));
  }, [authLoading, authUser, router]);

  // Course guard — hard redirect to /course-picker if no course is active.
  useEffect(() => {
    if (authLoading || !authUser) return;
    if (!courseHydrated) return;
    if (!selectedCourse) router.replace('/course-picker');
  }, [authLoading, authUser, courseHydrated, selectedCourse, router]);

  // Fetch usage stats once after auth is confirmed.
  useEffect(() => {
    if (!isAuthenticated) return;
    authFetch(`${API}/api/usage`)
      .then(r => r.ok ? r.json() : null)
      .then((data: UsageInfo | null) => { if (data) setUsage(data); })
      .catch(() => {});
  }, [isAuthenticated]);

  // Fetch profile fields for the popover widget.
  useEffect(() => {
    if (!isAuthenticated) return;
    authFetch(`${API}/api/profile`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { institution?: string; primary_major?: string; gender?: string } | null) => {
        if (!data) return;
        if (data.institution)   { setUserInstitution(data.institution);   localStorage.setItem('levy_ai_institution',   data.institution); }
        if (data.primary_major) { setUserPrimaryMajor(data.primary_major); localStorage.setItem('levy_ai_primary_major', data.primary_major); }
        if (data.gender)        { setUserGender(data.gender);              localStorage.setItem('levy_ai_gender',        data.gender); }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  // Close profile popover on click outside.
  useEffect(() => {
    if (!profilePopoverOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node)) {
        setProfilePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [profilePopoverOpen]);

  const startNewChat = useCallback(() => {
    setCurrentSessionId(null); setInitialMessages([]);
    setChatKey(`new-${Date.now()}`);
  }, []);

  const handleNewChat = useCallback(() => {
    setHasDoc(false); setPdfKey(`pdf-${Date.now()}`);
    setCurrentSessionId(null); setInitialMessages([]);
    setChatKey(`new-${Date.now()}`);
  }, []);

  const loadSession = useCallback(async (id: number) => {
    try {
      const res  = await authFetch(`${API}/sessions/${id}`);
      const data = await res.json();
      const msgs: Message[] = (data.messages ?? []).map(
        (m: { id: number; role: 'user' | 'assistant'; content: string }) => ({
          id: String(m.id), role: m.role, content: m.content,
        }),
      );
      setCurrentSessionId(id); setInitialMessages(msgs);
      setChatKey(`session-${id}`);
    } catch { /* silently ignore */ }
  }, []);

  const deleteSession = useCallback(async (id: number) => {
    try {
      await authFetch(`${API}/sessions/${id}`, { method: 'DELETE' });
      if (currentSessionId === id) startNewChat();
      fetchSessions();
    } catch { /* silently ignore */ }
  }, [currentSessionId, startNewChat, fetchSessions]);

  const handleSessionCreated = useCallback((id: number) => {
    setCurrentSessionId(id); fetchSessions();
  }, [fetchSessions]);

  const handleUpload = useCallback(() => {
    if (!hasDoc) startNewChat();
    setHasDoc(true);
    fetchUsage();
  }, [hasDoc, startNewChat, fetchUsage]);

  const handleRemove = useCallback(() => {
    setHasDoc(false); startNewChat();
  }, [startNewChat]);

  const handleLogout = () => { setSelectedCourse(null); authLogout(); };

  const userInitials = [userFirstName[0], userLastName[0]]
    .filter(Boolean).join('').toUpperCase()
    || userEmail.slice(0, 2).toUpperCase();

  if (!isAuthenticated || !courseHydrated || !selectedCourse) return null;

  return (
    <div className="min-h-screen flex flex-col relative" style={{ background: '#97AB92' }}>

      {/* Rate-limit toast — fixed overlay, auto-hides after 6 s */}
      {rateLimitToast && (
        <div className="fixed top-4 inset-x-0 flex justify-center z-[9999] pointer-events-none px-4">
          <div className="pointer-events-auto flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold animate-fade-scale-lift"
            style={{ background: '#ea580c', color: 'white', boxShadow: '0 8px 32px rgba(234,88,12,0.35)' }}>
            <span>⏳</span>
            <span>{t.rateLimitMsg}</span>
            <button
              onClick={() => setRateLimitToast(false)}
              className="ms-1 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors text-base leading-none shrink-0"
              aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}

      {/* Subtle leaf watermarks — matches dashboard pattern */}
      <div className="fixed inset-0 pointer-events-none select-none overflow-hidden" style={{ zIndex: 0 }}>
        <svg style={{ position:'absolute', top:'-70px', right:'-40px', width:'340px', opacity:.04, transform:'rotate(22deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
        <svg style={{ position:'absolute', bottom:'-50px', left:'-25px', width:'260px', opacity:.035, transform:'rotate(-18deg) scaleX(-1)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
        <svg style={{ position:'absolute', top:'40%', right:'-12px', width:'170px', opacity:.028, transform:'rotate(48deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
        <svg style={{ position:'absolute', top:'18%', left:'-8px', width:'130px', opacity:.022, transform:'rotate(-32deg)' }} viewBox="0 0 100 150" fill="#2A3B22" aria-hidden="true"><path d="M50 8C76 8 92 33 92 62C92 100 70 140 50 148C30 140 8 100 8 62C8 33 24 8 50 8Z"/></svg>
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 relative z-30" style={{
        background:           '#8BAF84',
        backdropFilter:       'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom:         '1px solid #E2EBE5',
        boxShadow:            headerScrolled ? '0 4px 16px rgba(28,51,41,0.07)' : 'none',
        transition:           'box-shadow 0.3s ease',
      }}>
        <div className="max-w-full px-4 py-3 flex items-center justify-between gap-3">

          {/* Start: Hamburger + Logo */}
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} aria-label={t.openMenu}
              className="p-2 rounded-lg hover:bg-[#EEF5F0] transition-colors text-[#1C3329]">
              <IconMenu className="w-5 h-5" />
            </button>
            <LogoMark size={40} />
          </div>

          {/* End: Course pill + Status + Lang + Profile widget */}
          <div className="flex items-center gap-2">
            <CoursePill />
            <div className="hidden sm:flex items-center gap-2 rounded-full px-4 py-1.5 bg-[#EEF5F0] border border-[#D3E0D8]">
              <span className={`w-2 h-2 rounded-full transition-colors duration-500 ${hasDoc ? 'bg-[#527061] animate-pulse' : 'bg-[#D3E0D8]'}`} />
              <span className="text-sm font-medium text-[#527061]">{hasDoc ? t.docLoaded : t.waiting}</span>
            </div>
            {/* Sound mute toggle */}
            <button
              onClick={handleSoundToggle}
              aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'}
              title={soundOn ? 'Mute sounds' : 'Unmute sounds'}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-all hover:bg-[#EEF5F0] border border-transparent hover:border-[#D3E0D8] active:scale-90"
              style={{ color: soundOn ? '#527061' : '#A8C4B4' }}
            >
              {soundOn ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.757 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.757 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
              )}
            </button>

            <button onClick={toggleLanguage} aria-label={`Switch to ${t.langLabel}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EEF5F0] hover:bg-[#E8F0EB] border border-[#D3E0D8] rounded-full text-sm text-[#1C3329] font-semibold transition-all">
              <IconGlobe className="w-4 h-4 text-[#527061]" />
              {t.langLabel}
            </button>

            {/* Profile avatar + dropdown popover */}
            <div ref={profilePopoverRef} className="relative">
              <button
                onClick={() => setProfilePopoverOpen(p => !p)}
                aria-label="Profile menu"
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all select-none"
                style={{ backgroundColor: profilePopoverOpen ? '#D1E6D9' : '#EEF5F0', boxShadow: profilePopoverOpen ? '0 0 0 2px #D1E6D9' : 'none', color: '#1C3329' }}>
                <AvatarContent gender={userGender} initials={userInitials} />
              </button>

              {/* Floating popover */}
              {profilePopoverOpen && (
                <div
                  dir={lang === 'he' ? 'rtl' : 'ltr'}
                  className="absolute top-full mt-2 z-50 w-64 rounded-2xl overflow-hidden animate-slide-up-fade"
                  style={{
                    ...(lang === 'he' ? { left: 0 } : { right: 0 }),
                    background: 'rgba(255,255,255,0.98)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(157,192,139,0.35)',
                    boxShadow: '0 8px 32px rgba(20,40,15,0.20), 0 2px 8px rgba(20,40,15,0.08)',
                  }}
                >
                  {/* User info */}
                  <div className="px-4 py-4" style={{ borderBottom: '1px solid rgba(157,192,139,0.22)' }}>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 select-none"
                        style={{ backgroundColor: '#2A3B22' }}>
                        <AvatarContent gender={userGender} initials={userInitials} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[#1a2e14] text-sm truncate leading-snug">
                          {userFirstName} {userLastName}
                        </p>
                        <p className="text-xs text-[#7a9268] truncate mt-0.5" title={userEmail}>
                          {userEmail}
                        </p>
                      </div>
                    </div>
                    {(userInstitution || userPrimaryMajor) && (
                      <div
                        className="mt-3 px-2.5 py-1.5 rounded-xl text-xs font-medium"
                        style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.15)', color: '#517B3E' }}>
                        {[userInstitution, userPrimaryMajor].filter(Boolean).join(' | ')}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="px-2 py-2 flex flex-col gap-0.5">
                    <button
                      onClick={() => { setProfilePopoverOpen(false); router.push('/profile'); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors"
                      style={{ color: '#2d3b25', textAlign: 'start' }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.09)'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}>
                      <svg className="w-4 h-4 shrink-0" style={{ color: '#517B3E' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      </svg>
                      {t.profileSettings}
                    </button>

                    <div style={{ height: 1, background: 'rgba(157,192,139,0.25)', margin: '2px 12px' }} />

                    <button
                      onClick={() => { setProfilePopoverOpen(false); setShowLogoutModal(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors"
                      style={{ color: '#dc2626', textAlign: 'start' }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}>
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
                      </svg>
                      {t.logout}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSelectSession={loadSession}
        onDeleteSession={deleteSession}

        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isAdmin={isAdmin}
        lang={lang}
        t={t}
        userFirstName={userFirstName}
        userLastName={userLastName}
        userEmail={userEmail}
        userInitials={userInitials}
        userGender={userGender}
        onOpenProfile={() => { setSidebarOpen(false); setProfileModalOpen(true); }}
        onRequestLogout={() => { setSidebarOpen(false); setShowLogoutModal(true); }}
      />

      {/* ── User profile modal ───────────────────────────────────────────────── */}
      <UserProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onLogout={() => { setProfileModalOpen(false); setShowLogoutModal(true); }}
        firstName={userFirstName}
        lastName={userLastName}
        email={userEmail}
        initials={userInitials}
        gender={userGender}
        country={userCountry}
        institution={userInstitution}
        degreeType={userDegreeType}
        primaryMajor={userPrimaryMajor}
        secondaryMajor={userSecondaryMajor}
        isAdmin={isAdmin}
      />

      {/* ── Logout confirmation modal (sidebar button + Back button) ────────── */}
      {showLogoutModal && (
        <LogoutConfirmModal
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

      {/* ── Pricing modal ─────────────────────────────────────────────────────── */}
      {showPricingModal && (
        <PricingModal onClose={() => setShowPricingModal(false)} />
      )}

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div ref={mainScrollRef} className="flex-1 flex flex-col overflow-y-auto">
        <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 py-6 md:px-8 md:py-8">
        <main className="flex-1 flex flex-col md:flex-row gap-5 md:gap-7 min-h-0 matcha-workspace-main" style={{ background: 'transparent' }}>
          <style dangerouslySetInnerHTML={{ __html: MATCHA_LEAF_CSS }} />
          <div className="w-full md:w-[38%] flex flex-col relative" style={{ zIndex: 1 }}>
            {/* ── Usage indicator (Basic plan only) ────────────────────────── */}
            {usage && (
              <div className="mb-3 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                style={{
                  background: 'rgba(232,239,229,0.92)',
                  border: '1px solid rgba(155,180,148,0.35)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}>
                {usage.plan_type === 'basic' ? (
                  <>
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>
                        <span className={`font-bold ${usage.uploads_this_month >= (usage.upload_limit ?? 0) ? 'text-red-500' : 'text-slate-700'}`}>
                          {t.usageUploads(usage.uploads_this_month, usage.upload_limit ?? 2)}
                        </span>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>
                        <span className={`font-bold ${usage.questions_this_month >= (usage.question_limit ?? 0) ? 'text-red-500' : 'text-slate-700'}`}>
                          {t.usageQuestions(usage.questions_this_month, usage.question_limit ?? 15)}
                        </span>
                      </span>
                    </div>
                    <button
                      onClick={() => setShowPricingModal(true)}
                      className="shrink-0 text-[#517B3E] font-semibold hover:underline transition-colors bg-transparent border-none cursor-pointer p-0"
                      style={{ fontSize: '0.72rem' }}>
                      {t.upgradePrompt} →
                    </button>
                  </>
                ) : (
                  <span className="text-[#517B3E] font-semibold">{t.usageUnlimited}</span>
                )}
              </div>
            )}
            <PdfUploader key={pdfKey} onUpload={handleUpload} onRemove={handleRemove} t={t} />
          </div>
          <div className="flex-1 flex flex-col gap-3 min-h-0" style={{ position: 'relative', zIndex: 1 }}>

            <div className="flex-1 flex flex-col">
              <ChatInterface
                key={chatKey}
                hasDoc={hasDoc}
                sessionId={currentSessionId}
                initialMessages={initialMessages}
                onSessionCreated={handleSessionCreated}
                onSessionsUpdated={fetchSessions}
                lang={lang}
                t={t}
              />
            </div>

          </div>
        </main>
        </div>

        <footer className="py-3 text-center text-xs text-[#9aaf8a] shrink-0 relative z-10" style={{ borderTop: '1px solid rgba(157,192,139,0.25)' }}>
          {t.footer}
        </footer>
      </div>
    </div>
  );
}

export default Home;
