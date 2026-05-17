'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLanguage } from '../providers/language';
import type { KeyboardEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import type { FileRejection } from 'react-dropzone';
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

const _AUTH_KEYS = ['levy_ai_token', 'levy_ai_email', 'levy_ai_first_name', 'levy_ai_last_name'] as const;

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
    uploadToStart: 'העלה מסמך PDF כדי להתחיל',
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
    chatPlaceholder: 'שאל שאלה על המסמך...',
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
    navNotes: 'Notes',
    navWorkspace: 'Workspace',
    navInsights: 'Insights',
    navAdmin: 'Admin',
    navDashboard: 'Dashboard',
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
    navNotes: 'Notes',
    navWorkspace: 'Workspace',
    navInsights: 'Insights',
    navAdmin: 'Admin',
    navDashboard: 'Dashboard',
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
function IconBarChart({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
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
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(157,192,139,0.35)',
        boxShadow: '0 4px 24px rgba(60,90,40,0.08)',
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
              'rounded-2xl border-2 border-dashed flex flex-col items-center justify-center',
              'gap-4 min-h-52 cursor-pointer transition-all duration-200 px-6 py-10 text-center select-none',
              uploading
                ? 'opacity-50 cursor-not-allowed'
                : isDragActive
                  ? 'scale-[1.01]'
                  : '',
            ].join(' ')}
            style={{
              borderColor: isDragActive ? '#517B3E' : 'rgba(157,192,139,0.45)',
              backgroundColor: isDragActive ? 'rgba(81,123,62,0.08)' : 'rgba(255,255,255,0.45)',
              boxShadow: isDragActive ? '0 0 20px rgba(81,123,62,0.12)' : 'none',
            }}>
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
              'rounded-xl border-2 border-dashed flex items-center justify-center gap-3',
              'py-3 px-4 cursor-pointer transition-all duration-150 select-none',
              uploading ? 'opacity-50 cursor-not-allowed' : '',
            ].join(' ')}
            style={{
              borderColor: isDragActive ? '#517B3E' : 'rgba(157,192,139,0.4)',
              backgroundColor: isDragActive ? 'rgba(81,123,62,0.08)' : 'transparent',
            }}>
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
      <div className="flex-1 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', border: '1px solid rgba(157,192,139,0.3)' }}>
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(157,192,139,0.35)',
      boxShadow: '0 4px 24px rgba(60,90,40,0.08)',
    }}>

      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid rgba(157,192,139,0.3)' }}>
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
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
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
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0">
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
            {messages.map(msg => (
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
                      : { background: 'rgba(255,255,255,0.90)', color: '#2A3B22', border: '1px solid rgba(157,192,139,0.3)', boxShadow: '0 2px 8px rgba(60,90,40,0.07)' }}>
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
                          pre: ({ children }) => (
                            <div className="my-2" style={{ background: '#1a2e14', borderRadius: 10, border: '1px solid rgba(81,123,62,0.18)', overflow: 'hidden' }}>
                              <pre dir="ltr" style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'embed', margin: 0 }}
                                className="p-4 overflow-x-auto text-left">
                                {children}
                              </pre>
                            </div>
                          ),
                          code: ({ className, children }) => {
                            const isBlock = !!className || String(children).includes('\n');
                            if (isBlock) return (
                              <code dir="ltr" style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'embed' }}
                                className={`${className ?? ''} text-[#9DC08B] text-[11px] font-mono leading-relaxed`}>
                                {children}
                              </code>
                            );
                            return <code className="px-1.5 py-0.5 rounded text-[11px] font-mono" style={{ background: 'rgba(81,123,62,0.1)', color: '#517B3E' }}>{children}</code>;
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

            {/* Loading indicator */}
            {loading && (
              <div className={`flex ${aiAlign}`}>
                <div className="rounded-2xl rounded-tl-sm px-5 py-3.5" style={{ background: 'rgba(255,255,255,0.90)', border: '1px solid rgba(157,192,139,0.3)', boxShadow: '0 2px 8px rgba(60,90,40,0.07)' }}>
                  {searchPhase === 'searching_web' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-[#9DC08B]/30 border-t-[#517B3E] animate-spin shrink-0" />
                      <span className="text-xs text-[#517B3E] font-medium">{t.searchingWeb}</span>
                    </div>
                  ) : searchPhase === 'running_code' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-[#9DC08B]/30 border-t-[#517B3E] animate-spin shrink-0" />
                      <IconCode className="w-3 h-3 text-[#517B3E] shrink-0" />
                      <span className="text-xs text-[#517B3E] font-medium">{t.runningCode}</span>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 items-center">
                      {[0, 150, 300].map(d => (
                        <span key={d} className="w-2 h-2 rounded-full bg-[#9DC08B] animate-pulse"
                          style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className={`px-4 pb-4 pt-3 shrink-0 transition-opacity ${!hasDoc ? 'opacity-40' : ''}`} style={{ borderTop: '1px solid rgba(157,192,139,0.3)' }}>
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
            onClick={() => send()}
            disabled={!hasDoc || !input.trim() || loading || isRecording || isTranscribing}
            aria-label={t.send}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:cursor-not-allowed"
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

/* ─── Paper Writer ───────────────────────────────────────────────────────────── */
function PaperWriter({ hasDoc, t }: { hasDoc: boolean; t: T }) {
  const [topic, setTopic]               = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading]           = useState(false);
  const [paper, setPaper]               = useState<string | null>(null);
  const [sources, setSources]           = useState<string[]>([]);
  const [error, setError]               = useState<string | null>(null);
  const [downloading, setDownloading]         = useState(false);
  const [downloadingWord, setDownloadingWord] = useState(false);

  const generate = useCallback(async (topicOverride?: string) => {
    const top = (topicOverride ?? topic).trim();
    if (!top || loading || !hasDoc) return;
    setLoading(true); setError(null); setPaper(null); setSources([]);
    try {
      const res  = await authFetch(`${API}/generate-paper`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: top, instructions: instructions.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t.paperErr); return; }
      setPaper(data.paper); setSources(data.sources ?? []);
    } catch { setError(t.serverErr); }
    finally  { setLoading(false); }
  }, [topic, instructions, loading, hasDoc, t]);

  const downloadPdf = async () => {
    if (!paper || downloading) return;
    setDownloading(true);
    try {
      const safeTitle = topic.trim().slice(0, 40).replace(/[^\w֐-׿\s-]/g, '') || 'paper';
      const res = await authFetch(`${API}/export-pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: paper, filename: `u-note-${safeTitle}.pdf` }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t.exportErr);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `u-note-${safeTitle}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error('PDF export failed:', err); }
    finally { setDownloading(false); }
  };

  const downloadWord = async () => {
    if (!paper || downloadingWord) return;
    setDownloadingWord(true);
    try {
      const safeTitle = topic.trim().slice(0, 40).replace(/[^\w֐-׿\s-]/g, '') || 'paper';
      const res = await authFetch(`${API}/export-docx`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: paper, filename: `u-note-${safeTitle}.docx` }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t.wordErr);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `u-note-${safeTitle}.docx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error('Word export failed:', err); }
    finally { setDownloadingWord(false); }
  };

  const onInstructionsInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInstructions(e.target.value);
    const el = e.target; el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  };

  return (
    <div className="rounded-2xl flex flex-col flex-1 min-h-[520px]" style={{
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(157,192,139,0.35)',
      boxShadow: '0 4px 24px rgba(60,90,40,0.08)',
    }}>

      <div className="px-5 py-4 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid rgba(157,192,139,0.3)' }}>
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #9DC08B, #517B3E)' }}>
          <IconPen className="w-5 h-5 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#2A3B22] text-sm">{t.paperTitle}</p>
          <p className="text-xs text-[#7a9268]">{hasDoc ? t.paperSubtitle : t.waitingPdf}</p>
        </div>
        {paper && (
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={downloadWord} disabled={downloadingWord}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-all active:scale-95"
              style={{ backgroundColor: downloadingWord ? 'rgba(157,192,139,0.4)' : '#2d6a9f' }}>
              <IconWord className="w-3.5 h-3.5" />
              {downloadingWord ? t.exporting : t.downloadWord}
            </button>
            <button onClick={downloadPdf} disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-bold rounded-lg transition-all active:scale-95"
              style={{ backgroundColor: downloading ? 'rgba(157,192,139,0.4)' : '#517B3E' }}>
              <IconDownload className="w-3.5 h-3.5" />
              {downloading ? t.exporting : t.downloadPdf}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
        {!paper && !loading && !error && (
          <div className="flex flex-col items-center justify-center gap-5 py-10 text-center h-full">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.15)' }}>
              <IconPen className="w-10 h-10 text-[#9DC08B]" />
            </div>
            <div>
              <p className="font-medium text-[#2d3b25]">{hasDoc ? t.enterTopic : t.uploadFirst}</p>
              <p className="text-sm text-[#7a9268] mt-1">{hasDoc ? t.aiWrites : t.uploadSideHint}</p>
            </div>
            {hasDoc && (
              <>
                <p className="text-xs text-[#7a9268]">{t.suggestedTopics}</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-xs">
                  {t.topicChips.map(chip => (
                    <button key={chip} onClick={() => { setTopic(chip); generate(chip); }}
                      className="px-4 py-2 text-xs rounded-full transition-all hover:scale-[1.02]"
                      style={{ background: 'rgba(81,123,62,0.08)', border: '1px solid rgba(81,123,62,0.2)', color: '#517B3E' }}>
                      {chip}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-20 h-full">
            <div className="w-12 h-12 rounded-full border-2 border-[#9DC08B]/30 border-t-[#517B3E] animate-spin" />
            <div className="text-center">
              <p className="font-medium text-[#2d3b25] text-sm">{t.writingPaper}</p>
              <p className="text-xs text-[#7a9268] mt-1">{t.takeSecs}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-950/50 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm mt-4">
            <IconX className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        {paper && !loading && (
          <div className="flex flex-col gap-3">
            {sources.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-[#7a9268]">{t.sources}</span>
                {sources.map(s => (
                  <span key={s} className="px-2 py-0.5 text-xs rounded-full" style={{ background: 'rgba(81,123,62,0.10)', color: '#517B3E', border: '1px solid rgba(81,123,62,0.2)' }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
            <div dir="rtl" className="rounded-xl p-8" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(157,192,139,0.3)', color: '#2A3B22' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#cc0000', strict: false }]]}
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 pb-2 text-center" style={{ color: '#2A3B22', borderBottom: '1px solid rgba(157,192,139,0.4)' }}>{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-bold mt-7 mb-3" style={{ color: '#2A3B22' }}>{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-semibold mt-5 mb-2" style={{ color: '#2d3b25' }}>{children}</h3>,
                  p: ({ children }) => <p className="text-sm leading-8 mb-4" style={{ color: '#374151', textAlign: 'justify' }}>{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold" style={{ color: '#1a2e14' }}>{children}</strong>,
                  em: ({ children }) => <em className="italic" style={{ color: '#4a5e3a' }}>{children}</em>,
                  ul: ({ children }) => <ul className="list-disc mb-4 space-y-1 text-sm pe-5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal mb-4 space-y-1 text-sm pe-5">{children}</ol>,
                  li: ({ children }) => <li className="text-sm leading-7" style={{ color: '#374151' }}>{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="pr-4 my-4 italic text-sm py-2 rounded-sm" style={{ borderRight: '4px solid rgba(81,123,62,0.4)', background: 'rgba(81,123,62,0.05)', color: '#4a5e3a' }}>
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="my-6" style={{ borderColor: 'rgba(157,192,139,0.4)' }} />,
                  table: ({ children }) => <div className="overflow-x-auto my-4"><table className="w-full text-sm border-collapse">{children}</table></div>,
                  th: ({ children }) => <th className="px-3 py-2 font-semibold text-right" style={{ border: '1px solid rgba(157,192,139,0.3)', background: 'rgba(81,123,62,0.06)', color: '#2d3b25' }}>{children}</th>,
                  td: ({ children }) => <td className="px-3 py-2 text-right" style={{ border: '1px solid rgba(157,192,139,0.3)', color: '#4a5e3a' }}>{children}</td>,
                  a: ({ href, children }) => {
                    const safeHref = href && /^https?:\/\//i.test(href) ? href : '#';
                    return (
                      <a href={safeHref} target="_blank" rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:opacity-75 transition-opacity"
                        style={{ color: '#517B3E' }}>
                        {children}
                      </a>
                    );
                  },
                }}>
                {preprocessMath(paper)}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      <div className={`px-4 pb-4 pt-3 shrink-0 ${!hasDoc ? 'opacity-40 pointer-events-none' : ''}`} style={{ borderTop: '1px solid rgba(157,192,139,0.3)' }}>
        <div className="flex flex-col gap-2">
          <input type="text" value={topic} onChange={e => setTopic(e.target.value)} dir="auto"
            disabled={!hasDoc || loading}
            placeholder={hasDoc ? t.topicPh : t.topicPhNoDoc}
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all disabled:cursor-not-allowed"
            style={{ border: '1px solid rgba(157,192,139,0.4)', background: 'rgba(255,255,255,0.80)', color: '#2A3B22' }}
            onKeyDown={e => { if (e.key === 'Enter') generate(); }} />
          <textarea value={instructions} onChange={onInstructionsInput} dir="auto" rows={2}
            disabled={!hasDoc || loading} placeholder={t.instructionsPh}
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all resize-none disabled:cursor-not-allowed"
            style={{ border: '1px solid rgba(157,192,139,0.4)', background: 'rgba(255,255,255,0.80)', color: '#2A3B22', maxHeight: 100 }} />
          <button onClick={() => generate()} disabled={!hasDoc || !topic.trim() || loading}
            className="w-full py-2.5 rounded-xl text-white text-sm font-bold transition-all active:scale-[0.99] disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: (!hasDoc || !topic.trim() || loading) ? 'rgba(157,192,139,0.4)' : '#517B3E' }}>
            {loading
              ? <><div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" /><span>{t.writingBtn}</span></>
              : <><IconPen className="w-4 h-4" /><span>{t.composePaper}</span></>}
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
  onSwitchMode: (mode: 'chat' | 'paper') => void;
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  lang: Lang;
  t: T;
}

function Sidebar({ sessions, currentSessionId, onNewChat, onSelectSession, onDeleteSession, onSwitchMode, isOpen, onClose, isAdmin, lang, t }: SidebarProps) {
  const router = useRouter();
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
        style={{ backgroundColor: 'rgba(42,59,34,0.35)' }}
        onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <aside className={[
        'fixed inset-y-0 start-0 z-50 w-72',
        'flex flex-col transition-transform duration-300 ease-in-out',
        translateClass,
      ].join(' ')}
      style={{
        backgroundColor: 'rgba(217,235,208,0.97)',
        backdropFilter: 'blur(20px)',
        borderInlineEnd: '1px solid rgba(100,140,80,0.25)',
        boxShadow: '4px 0 32px rgba(60,90,40,0.12)',
      }}>

        {/* Logo header */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(100,140,80,0.2)' }}>
          <LogoMark size={36} />
          <button onClick={onClose} aria-label={t.closeMenu}
            className="p-1.5 rounded-lg hover:bg-black/10 transition-colors shrink-0">
            <IconX className="w-4 h-4 text-[#4a5e3a]" />
          </button>
        </div>

        {/* New chat button */}
        <div className="px-3 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(100,140,80,0.2)' }}>
          <button onClick={() => { onNewChat(); onClose(); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.99]"
            style={{ backgroundColor: '#517B3E' }}>
            <IconPlus className="w-4 h-4 shrink-0" />
            {t.newChat}
          </button>
        </div>

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto flex flex-col">

          {/* Quick nav */}
          <div className="px-3 py-3 space-y-1" style={{ borderBottom: '1px solid rgba(100,140,80,0.2)' }}>
            <p className="text-[10px] font-semibold text-[#7a9268] uppercase tracking-widest px-2 mb-2">Navigation</p>
            <button onClick={() => { onSwitchMode('chat'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <IconSparkles className="w-4 h-4 text-[#517B3E]/70 shrink-0" />
              {t.navWorkspace}
            </button>
            <button onClick={() => { onSwitchMode('paper'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <IconPen className="w-4 h-4 text-[#517B3E]/70 shrink-0" />
              {t.navInsights}
            </button>
            <button onClick={() => { router.push('/dashboard'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#2d3b25] text-sm transition-colors">
              <IconBarChart className="w-4 h-4 text-[#517B3E]/70 shrink-0" />
              {t.navDashboard}
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
            <p className="text-[10px] font-semibold text-[#7a9268] uppercase tracking-widest px-5 mb-2 mt-2">
              {t.navNotes}
            </p>
            {sessions.length === 0 ? (
              <p className="text-[#7a9268] text-xs text-center py-6 px-4">{t.noPrevChats}</p>
            ) : (
              sessions.map(s => (
                <div key={s.id}
                  onClick={() => { onSelectSession(s.id); onClose(); }}
                  className={`group flex items-start gap-2 px-3 py-2.5 mx-1 rounded-lg cursor-pointer transition-colors ${
                    currentSessionId === s.id ? 'border' : 'hover:bg-[#517B3E]/10'
                  }`}
                  style={currentSessionId === s.id ? { backgroundColor: 'rgba(81,123,62,0.12)', borderColor: 'rgba(81,123,62,0.3)' } : {}}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate leading-snug ${currentSessionId === s.id ? 'text-[#517B3E]' : 'text-[#2d3b25]'}`}>
                      {s.title}
                    </p>
                    <p className="text-[#7a9268] text-xs mt-0.5">{fmtDate(s.updated_at)}</p>
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

          {/* Admin link (hidden — only for admins) */}
          {isAdmin && (
            <div className="px-3 py-3 shrink-0" style={{ borderTop: '1px solid rgba(100,140,80,0.2)' }}>
              <button onClick={() => { router.push('/admin'); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[#517B3E]/10 text-[#7a9268] hover:text-[#2d3b25] text-xs transition-colors">
                <IconShield className="w-4 h-4 shrink-0" />
                {t.navAdmin}
              </button>
            </div>
          )}
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
export default function Home() {
  const router = useRouter();

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

  const [hasDoc, setHasDoc]                     = useState(false);

  /* ── Usage ── */
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const fetchUsage = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/usage`);
      if (res.ok) setUsage(await res.json());
    } catch { /* backend not running */ }
  }, []);
  const [mode, setMode]                         = useState<'chat' | 'paper'>('chat');
  const [sessions, setSessions]                 = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [initialMessages, setInitialMessages]   = useState<Message[]>([]);
  const [chatKey, setChatKey]                   = useState<string>('new');
  const [pdfKey, setPdfKey]                     = useState<string>('initial');
  const { lang, toggleLanguage }                = useLanguage();
  const [sidebarOpen, setSidebarOpen]           = useState(false);
  const [rateLimitToast, setRateLimitToast]     = useState(false);

  const t = translations[lang];

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  const fetchSessions = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/sessions`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch { /* backend not running yet */ }
  }, []);

  // Check auth on mount — synchronous localStorage read avoids SSR mismatch.
  useEffect(() => {
    const token = localStorage.getItem('levy_ai_token');
    if (!token) { router.replace('/?login=true'); return; }
    const payload = decodeJwtPayload(token);
    if (payload?.exp && (payload.exp as number) * 1000 < Date.now()) {
      _clearAuth();
      router.replace('/?login=true');
      return;
    }
    setIsAuthenticated(true);
    authFetch(`${API}/sessions`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then((data: { sessions?: ChatSession[] }) => setSessions(data.sessions ?? []))
      .catch(() => {});
  }, [router]);

  // Fetch usage stats once after auth is confirmed.
  useEffect(() => {
    if (!isAuthenticated) return;
    authFetch(`${API}/api/usage`)
      .then(r => r.ok ? r.json() : null)
      .then((data: UsageInfo | null) => { if (data) setUsage(data); })
      .catch(() => {});
  }, [isAuthenticated]);

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

  const handleLogout = () => {
    _clearAuth();
    router.push('/');
  };

  const userInitials = [userFirstName[0], userLastName[0]]
    .filter(Boolean).join('').toUpperCase()
    || userEmail.slice(0, 2).toUpperCase();

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex flex-col relative" style={{ backgroundColor: '#F7F5EF' }}>

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

      {/* Organic background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute" style={{
          top: '-8%', right: '-6%', width: '48%', height: '55%',
          background: 'radial-gradient(ellipse at 60% 40%, rgba(157,192,139,0.22) 0%, transparent 70%)',
          borderRadius: '40% 60% 60% 40% / 40% 40% 60% 60%',
        }} />
        <div className="absolute" style={{
          bottom: '-10%', left: '-8%', width: '50%', height: '60%',
          background: 'radial-gradient(ellipse at 40% 60%, rgba(81,123,62,0.11) 0%, transparent 70%)',
          borderRadius: '60% 40% 40% 60% / 60% 60% 40% 40%',
        }} />
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 relative z-30" style={{
        backgroundColor: 'rgba(157,192,139,0.97)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(80,110,60,0.25)',
      }}>
        <div className="max-w-full px-4 py-3 flex items-center justify-between gap-3">

          {/* Start: Hamburger + Logo */}
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} aria-label={t.openMenu}
              className="p-2 rounded-lg hover:bg-black/10 transition-colors text-[#2d3b25]">
              <IconMenu className="w-5 h-5" />
            </button>
            <LogoMark size={40} />
          </div>

          {/* End: Status + Lang + Avatar + Logout */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 rounded-full px-4 py-1.5 bg-white/30 border border-white/50">
              <span className={`w-2 h-2 rounded-full transition-colors duration-500 ${hasDoc ? 'bg-[#2A3B22] animate-pulse' : 'bg-[#2A3B22]/30'}`} />
              <span className="text-sm font-medium text-[#2A3B22]">{hasDoc ? t.docLoaded : t.waiting}</span>
            </div>
            <button onClick={toggleLanguage} aria-label={`Switch to ${t.langLabel}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/30 hover:bg-white/55 border border-white/50 rounded-full text-sm text-[#2d3b25] font-semibold transition-all">
              <IconGlobe className="w-4 h-4 text-[#2d3b25]" />
              {t.langLabel}
            </button>
            <button onClick={() => router.push('/profile')} title={userEmail} aria-label="Profile"
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 hover:scale-110 transition-transform select-none"
              style={{ backgroundColor: '#2A3B22' }}>
              {userInitials || '?'}
            </button>
            <button onClick={handleLogout} aria-label={t.logout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/30 hover:bg-red-100/60 border border-white/50 hover:border-red-300/50 rounded-full text-xs text-[#2d3b25] hover:text-red-700 font-medium transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
              <span className="hidden sm:inline">{t.logout}</span>
            </button>
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
        onSwitchMode={setMode}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isAdmin={isAdmin}
        lang={lang}
        t={t}
      />

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-6 md:py-8 flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-[38%] flex flex-col">
            {/* ── Usage indicator (Basic plan only) ────────────────────────── */}
            {usage && (
              <div className="mb-3 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                style={{
                  background: 'rgba(253,252,249,0.80)',
                  border: '1px solid rgba(209,213,219,0.7)',
                  backdropFilter: 'blur(8px)',
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
                      onClick={() => router.push('/#pricing')}
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
          <div className="flex-1 flex flex-col gap-3 min-h-0">

            {/* Mode tab switcher */}
            <div className="flex gap-1 p-1 rounded-xl shrink-0" style={{ background: 'rgba(255,255,255,0.60)', border: '1px solid rgba(157,192,139,0.35)' }}>
              <button onClick={() => setMode('chat')}
                className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all"
                style={mode === 'chat'
                  ? { background: 'rgba(81,123,62,0.15)', border: '1px solid rgba(81,123,62,0.25)', color: '#517B3E' }
                  : { color: '#7a9268', border: '1px solid transparent' }}>
                {t.tabChat}
              </button>
              <button onClick={() => setMode('paper')}
                className="flex-1 py-2 text-sm font-semibold rounded-lg transition-all"
                style={mode === 'paper'
                  ? { background: 'rgba(81,123,62,0.15)', border: '1px solid rgba(81,123,62,0.25)', color: '#517B3E' }
                  : { color: '#7a9268', border: '1px solid transparent' }}>
                {t.tabPaper}
              </button>
            </div>

            <div className={mode === 'chat' ? 'flex-1 flex flex-col' : 'hidden'}>
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
            <div className={mode === 'paper' ? 'flex-1 flex flex-col' : 'hidden'}>
              <PaperWriter hasDoc={hasDoc} t={t} />
            </div>
          </div>
        </main>

        <footer className="py-3 text-center text-xs text-[#9aaf8a] shrink-0 relative z-10" style={{ borderTop: '1px solid rgba(157,192,139,0.25)' }}>
          {t.footer}
        </footer>
      </div>
    </div>
  );
}
