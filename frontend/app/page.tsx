'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { KeyboardEvent, ChangeEvent } from 'react';
import { useDropzone } from 'react-dropzone';
import type { FileRejection } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  searchedWeb?: boolean;
  webSources?: { title: string; url: string }[];
  sources?: string[];
  executedCode?: string;
  codeOutput?: string;
  images?: string[];
}

type SseEvent =
  | { type: 'status'; phase: string }
  | { type: 'result'; answer: string; sources: string[]; chunks_used: number; searched_web: boolean; web_sources: { title: string; url: string }[]; session_id: number; executed_code?: string; code_output?: string; images?: string[] }
  | { type: 'error'; message: string };

interface UploadedFile {
  name: string;
  size: number;
  chunks: number;
}

interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

type Lang = 'he' | 'en';

/* ─── Translations ──────────────────────────────────────────────────────────── */
const translations = {
  he: {
    subtitle: 'עוזר הסטודנט החכם',
    docLoaded: 'מסמך טעון',
    waiting: 'ממתין',
    langLabel: 'EN',
    openMenu: 'פתח תפריט',
    closeMenu: 'סגור תפריט',
    newChat: 'שיחה חדשה',
    noPrevChats: 'אין שיחות קודמות',
    deleteChat: 'מחק שיחה',
    uploadDocs: 'העלאת מסמכים',
    pdfOnly: 'PDF בלבד · עד 50 MB לקובץ',
    dropHere: 'שחרר כאן!',
    dragDrop: 'גרור ושחרר קבצי PDF',
    dragHint: 'ניתן לגרור מספר קבצים בו-זמנית · או לחץ לבחירה ידנית',
    pdfBadge: 'PDF · עד 50 MB לקובץ',
    addMore: 'הוסף עוד קבצי PDF',
    uploading: 'מעלה...',
    chunksLabel: (n: number) => `${n} קטעים · הועלה בהצלחה`,
    removeFile: 'הסר קובץ',
    howToUse: 'איך להשתמש?',
    tips: [
      'העלה קובץ PDF אחד או יותר – חומרי לימוד, מאמרים, ספרים',
      'שאל שאלות בעברית או אנגלית על תוכן הקבצים',
      'קבל סיכומים, הסברים ודוגמאות ממוקדות',
      'חזור על הכל בקלות לפני המבחן',
    ],
    rejectionErr: (n: number) => `${n} קבצ${n === 1 ? '' : 'ים'} נדח${n === 1 ? '' : 'ו'} — יש לבחור קבצי PDF בלבד.`,
    uploadErr: 'שגיאה בהעלאת הקבצים.',
    serverErr: 'לא ניתן להתחבר לשרת. בדוק שה-backend פועל על פורט 5003.',
    chatTitle: 'שיחה עם המסמך',
    docReady: 'מסמך מוכן – ניתן לשאול שאלות',
    waitingPdf: 'ממתין לקובץ PDF',
    askQ: 'שאל שאלה על המסמך',
    uploadToStart: 'העלה מסמך PDF כדי להתחיל',
    askHint: 'ניתן לשאול בעברית, אנגלית, או שילוב של שתיהן',
    uploadSideHint: 'לחץ על אזור ההעלאה מצד ימין',
    suggestions: ['סכם את המסמך בקצרה', 'מה הנקודות העיקריות?', 'הסבר את הנושא הראשון', 'תן לי שאלות לתרגול'],
    webSourcesLabel: 'מקורות',
    webSearched: 'שילב חיפוש ברשת',
    searchingWeb: 'מחפש ברשת...',
    runningCode: 'מריץ קוד Python...',
    seeCode: 'הצג קוד',
    hideCode: 'הסתר קוד',
    chatPlaceholder: 'שאל שאלה על המסמך...',
    chatPlaceholderNoDoc: 'יש להעלות קובץ תחילה',
    send: 'שלח',
    enterHint: 'Enter לשליחה · Shift+Enter לשורה חדשה',
    commErr: 'שגיאה בתקשורת עם השרת',
    paperTitle: 'כתיבה אקדמית',
    paperSubtitle: 'כתוב מאמר מבוסס המסמכים שהועלו',
    downloadPdf: 'הורד PDF',
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
    tabChat: 'שיחה עם המסמך',
    tabPaper: 'כתיבה אקדמית',
    footer: 'Levy AI · מופעל על ידי OpenAI ו-Flask',
  },
  en: {
    subtitle: 'Smart Student Assistant',
    docLoaded: 'Document Loaded',
    waiting: 'Waiting',
    langLabel: 'HE',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    newChat: 'New Chat',
    noPrevChats: 'No previous chats',
    deleteChat: 'Delete chat',
    uploadDocs: 'Upload Documents',
    pdfOnly: 'PDF only · Up to 50 MB per file',
    dropHere: 'Drop here!',
    dragDrop: 'Drag & drop PDF files',
    dragHint: 'Drag multiple files at once · or click to select manually',
    pdfBadge: 'PDF · Up to 50 MB per file',
    addMore: 'Add more PDF files',
    uploading: 'Uploading...',
    chunksLabel: (n: number) => `${n} chunks · Uploaded successfully`,
    removeFile: 'Remove file',
    howToUse: 'How to use?',
    tips: [
      'Upload one or more PDFs – study materials, articles, books',
      'Ask questions in Hebrew or English about the file content',
      'Get focused summaries, explanations, and examples',
      'Review everything easily before the exam',
    ],
    rejectionErr: (n: number) => `${n} file${n === 1 ? '' : 's'} rejected — only PDF files are allowed.`,
    uploadErr: 'Error uploading files.',
    serverErr: 'Cannot connect to server. Check that the backend is running on port 5003.',
    chatTitle: 'Chat with Document',
    docReady: 'Document ready – you can ask questions',
    waitingPdf: 'Waiting for PDF file',
    askQ: 'Ask a question about the document',
    uploadToStart: 'Upload a PDF document to start',
    askHint: 'You can ask in Hebrew, English, or both',
    uploadSideHint: 'Click on the upload area on the left',
    suggestions: ['Summarize the document briefly', 'What are the main points?', 'Explain the first topic', 'Give me practice questions'],
    webSourcesLabel: 'Sources',
    webSearched: 'Included web search',
    searchingWeb: 'Searching the web...',
    runningCode: 'Running Python code...',
    seeCode: 'See the code',
    hideCode: 'Hide the code',
    chatPlaceholder: 'Ask a question about the document...',
    chatPlaceholderNoDoc: 'Please upload a file first',
    send: 'Send',
    enterHint: 'Enter to send · Shift+Enter for new line',
    commErr: 'Server communication error',
    paperTitle: 'Academic Writing',
    paperSubtitle: 'Write a paper based on uploaded documents',
    downloadPdf: 'Download PDF',
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
    tabChat: 'Chat with Document',
    tabPaper: 'Academic Writing',
    footer: 'Levy AI · Powered by OpenAI and Flask',
  },
};

type T = typeof translations.he;

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
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
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

function IconCode({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  );
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/* ─── Code interpreter UI helpers ───────────────────────────────────────────── */
function CodeToggle({ code, t }: { code: string; t: T }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 text-xs font-medium transition-colors"
      >
        <IconCode className="w-3.5 h-3.5 shrink-0" />
        {open ? t.hideCode : t.seeCode}
      </button>
      {open && (
        <pre className="mt-2 p-4 bg-slate-900 text-emerald-300 text-[11px] font-mono rounded-xl overflow-x-auto leading-relaxed border border-slate-700 whitespace-pre">
          {code}
        </pre>
      )}
    </div>
  );
}

/* ─── PDF Uploader ──────────────────────────────────────────────────────────── */
function PdfUploader({
  onUpload,
  onRemove,
  t,
}: {
  onUpload: () => void;
  onRemove: () => void;
  t: T;
}) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      const rejectionErrors: string[] = rejected.length
        ? [t.rejectionErr(rejected.length)]
        : [];

      if (!accepted.length) {
        setErrors(rejectionErrors);
        return;
      }

      setUploading(true);
      setErrors([]);

      try {
        const fd = new FormData();
        for (const file of accepted) fd.append('files', file);

        const res = await fetch('http://127.0.0.1:5003/upload-pdf', { method: 'POST', body: fd });
        const data = await res.json();

        if (!res.ok) {
          setErrors([...rejectionErrors, data.error ?? t.uploadErr]);
          return;
        }

        if (data.files?.length) {
          const incoming: UploadedFile[] = data.files.map(
            (f: { source: string; size: number; chunks_stored: number }) => ({
              name: f.source,
              size: f.size,
              chunks: f.chunks_stored,
            }),
          );
          setUploadedFiles(prev => {
            const next = [...prev];
            for (const nf of incoming) {
              const idx = next.findIndex(f => f.name === nf.name);
              if (idx >= 0) next[idx] = nf;
              else next.push(nf);
            }
            return next;
          });
          onUpload();
        }

        const serverErrors = (data.errors ?? []).map(
          (e: { source: string; error: string }) => `${e.source}: ${e.error}`,
        );
        setErrors([...rejectionErrors, ...serverErrors]);
      } catch {
        setErrors([...rejectionErrors, t.serverErr]);
      } finally {
        setUploading(false);
      }
    },
    [onUpload, t],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    disabled: uploading,
  });

  const fmt = (b: number) =>
    b < 1_048_576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1_048_576).toFixed(1)} MB`;

  const handleRemoveFile = (name: string) => {
    setUploadedFiles(prev => {
      const next = prev.filter(f => f.name !== name);
      if (next.length === 0) onRemove();
      return next;
    });
  };

  const hasFiles = uploadedFiles.length > 0;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5">

        <div className="flex items-center gap-3">
          <span className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
            <IconDoc className="w-5 h-5 text-indigo-600" />
          </span>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">{t.uploadDocs}</p>
            <p className="text-xs text-gray-500">{t.pdfOnly}</p>
          </div>
        </div>

        {hasFiles && (
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {uploadedFiles.map(file => (
              <div
                key={file.name}
                className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 rounded-xl px-4 py-3"
              >
                <span className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                  <IconCheck className="w-5 h-5 text-emerald-600" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-emerald-900 text-xs truncate">{file.name}</p>
                  <p className="text-xs text-emerald-600">{fmt(file.size)} · {t.chunksLabel(file.chunks)}</p>
                </div>
                <button
                  onClick={() => handleRemoveFile(file.name)}
                  aria-label={t.removeFile}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-emerald-200 transition-colors shrink-0"
                >
                  <IconX className="w-4 h-4 text-emerald-700" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!hasFiles ? (
          <div
            {...getRootProps()}
            className={[
              'rounded-2xl border-2 border-dashed flex flex-col items-center justify-center',
              'gap-4 min-h-52 cursor-pointer transition-all duration-200 px-6 py-10 text-center select-none',
              uploading
                ? 'opacity-50 cursor-not-allowed border-indigo-300 bg-indigo-50/40'
                : isDragActive
                  ? 'border-indigo-500 bg-indigo-100 scale-[1.015] shadow-lg shadow-indigo-100'
                  : 'border-indigo-200 bg-gradient-to-b from-indigo-50/70 to-white hover:border-indigo-400 hover:bg-indigo-50/90',
            ].join(' ')}
          >
            <input {...getInputProps()} />

            {uploading && (
              <>
                <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
                <p className="text-sm font-medium text-indigo-600">{t.uploading}</p>
              </>
            )}

            {!uploading && isDragActive && (
              <>
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-300 animate-bounce">
                  <IconCloud className="w-9 h-9 text-white" />
                </div>
                <p className="text-indigo-700 font-bold text-lg">{t.dropHere}</p>
              </>
            )}

            {!uploading && !isDragActive && (
              <>
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                  <IconCloud className="w-9 h-9 text-white" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-800">{t.dragDrop}</p>
                  <p className="text-sm text-gray-400">{t.dragHint}</p>
                </div>
                <span className="px-3 py-1 bg-indigo-100 text-indigo-600 text-xs font-medium rounded-full">
                  {t.pdfBadge}
                </span>
              </>
            )}
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={[
              'rounded-xl border-2 border-dashed flex items-center justify-center gap-3',
              'py-3 px-4 cursor-pointer transition-all duration-150 select-none',
              uploading
                ? 'opacity-50 cursor-not-allowed border-indigo-200 bg-indigo-50/30'
                : isDragActive
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/60',
            ].join(' ')}
          >
            <input {...getInputProps()} />
            {uploading
              ? <div className="w-4 h-4 rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
              : <IconCloud className="w-4 h-4 text-indigo-400 shrink-0" />
            }
            <span className="text-xs font-medium text-indigo-500">
              {uploading ? t.uploading : t.addMore}
            </span>
          </div>
        )}

        {errors.map((err, i) => (
          <div key={i} className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm">
            <IconX className="w-4 h-4 shrink-0" />
            {err}
          </div>
        ))}
      </div>

      <div className="flex-1 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-5">
        <p className="text-sm font-semibold text-violet-800 mb-3">{t.howToUse}</p>
        <ul className="space-y-2.5">
          {t.tips.map((tip, i) => (
            <li key={i} className="flex gap-2 items-start text-sm text-violet-700">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(
    async (text?: string) => {
      const q = (text ?? input).trim();
      if (!q || loading || !hasDoc) return;

      const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: q };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      setSearchPhase('thinking');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      try {
        const payload = { message: q, session_id: localSessionId };
        const response = await fetch('http://127.0.0.1:5003/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error ?? t.commErr);
        }

        if (!response.body) throw new Error('No response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;

        while (!done) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            let parsed: SseEvent;
            try {
              parsed = JSON.parse(line.slice(6)) as SseEvent;
            } catch {
              continue;
            }

            if (parsed.type === 'status') {
              setSearchPhase(parsed.phase as 'thinking' | 'searching_web' | 'running_code');
            } else if (parsed.type === 'result') {
              if (!localSessionId && parsed.session_id) {
                setLocalSessionId(parsed.session_id);
                onSessionCreated(parsed.session_id);
              }
              onSessionsUpdated();
              setMessages(prev => [
                ...prev,
                {
                  id: `a${Date.now()}`,
                  role: 'assistant',
                  content: parsed.answer,
                  searchedWeb: parsed.searched_web,
                  webSources: parsed.web_sources ?? [],
                  sources: parsed.sources ?? [],
                  executedCode: parsed.executed_code || undefined,
                  codeOutput: parsed.code_output || undefined,
                  images: parsed.images && parsed.images.length > 0 ? parsed.images : undefined,
                },
              ]);
              done = true;
              break;
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message);
            }
          }
        }
      } catch (err) {
        setMessages(prev => [...prev, { id: `e${Date.now()}`, role: 'assistant', content: err instanceof Error ? err.message : String(err) }]);
      } finally {
        setLoading(false);
        setSearchPhase('thinking');
      }
    },
    [input, loading, hasDoc, localSessionId, onSessionCreated, onSessionsUpdated, t],
  );

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
  };

  // In RTL (Hebrew): user on the right (justify-start = RTL-start = right), AI on the left (justify-end = RTL-end = left).
  // In LTR (English): user on the right (justify-end = LTR-end = right), AI on the left (justify-start = LTR-start = left).
  const userAlign = lang === 'he' ? 'justify-start' : 'justify-end';
  const aiAlign   = lang === 'he' ? 'justify-end'   : 'justify-start';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-[520px]">

      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
        <span className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shrink-0">
          <IconSparkles className="w-5 h-5 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{t.chatTitle}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${hasDoc ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500">
              {hasDoc ? t.docReady : t.waitingPdf}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-5 py-12 flex-1 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-3xl flex items-center justify-center">
              <IconSparkles className="w-10 h-10 text-indigo-400" />
            </div>
            <div>
              <p className="font-medium text-gray-700">
                {hasDoc ? t.askQ : t.uploadToStart}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {hasDoc ? t.askHint : t.uploadSideHint}
              </p>
            </div>
            {hasDoc && (
              <div className="flex flex-wrap gap-2 justify-center">
                {t.suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="px-4 py-2 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? userAlign : aiAlign}`}
              >
                <div className="flex flex-col gap-1.5 max-w-[78%]">
                  <div
                    dir="auto"
                    className={[
                      'px-4 py-3 rounded-2xl text-sm',
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-sm leading-relaxed whitespace-pre-wrap'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm',
                    ].join(' ')}
                  >
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">{children}</strong>
                          ),
                          em: ({ children }) => (
                            <em className="italic">{children}</em>
                          ),
                          code: ({ children }) => (
                            <code className="px-1.5 py-0.5 bg-black/10 rounded text-[11px] font-mono">{children}</code>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc ps-4 my-1.5 space-y-0.5">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal ps-4 my-1.5 space-y-0.5">{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li className="leading-relaxed">{children}</li>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href ?? '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ textDecoration: 'none' }}
                              className="inline-flex items-center gap-1 max-w-[220px] px-2.5 py-0.5 mx-0.5 rounded-full bg-white border border-indigo-200 text-indigo-700 text-xs font-semibold hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-900 transition-all align-middle shadow-sm"
                            >
                              <span className="shrink-0 text-[11px]">🔗</span>
                              <span
                                className="min-w-0"
                                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              >
                                {children}
                              </span>
                            </a>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>
                  {/* ── Code interpreter results ──────────────────────────── */}
                  {msg.role === 'assistant' && msg.images && msg.images.length > 0 && (
                    <div className="flex flex-col gap-2 mt-1">
                      {msg.images.map((b64, i) => (
                        <div key={i} className="rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white">
                          <img
                            src={`data:image/png;base64,${b64}`}
                            alt={`Chart ${i + 1}`}
                            className="w-full h-auto block"
                            style={{ maxWidth: 480 }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.executedCode && (
                    <CodeToggle code={msg.executedCode} t={t} />
                  )}

                  {/* Web sources panel — shown below AI messages when sources exist */}
                  {msg.role === 'assistant' && msg.webSources && msg.webSources.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-0.5">
                      <span className="text-[11px] font-medium text-gray-400 px-0.5 select-none">
                        {t.webSourcesLabel}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.webSources.map((src, i) => (
                          <a
                            key={i}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={src.title || src.url}
                            className="group flex items-center gap-1.5 max-w-[180px] px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/70 transition-all no-underline"
                          >
                            <span className="w-4 h-4 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold shrink-0 leading-none">
                              {i + 1}
                            </span>
                            <IconGlobe className="w-3 h-3 text-gray-400 group-hover:text-indigo-500 shrink-0 transition-colors" />
                            <span
                              className="text-xs text-gray-600 group-hover:text-indigo-700 transition-colors min-w-0"
                              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            >
                              {src.title ? src.title : getDomain(src.url)}
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fallback: web-search used but no sources returned (edge case) */}
                  {msg.searchedWeb && msg.role === 'assistant' && (!msg.webSources || msg.webSources.length === 0) && (
                    <div className="flex items-center gap-1.5 px-1">
                      <IconGlobe className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="text-xs text-indigo-400">{t.webSearched}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className={`flex ${aiAlign}`}>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-5 py-3.5">
                  {searchPhase === 'searching_web' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin shrink-0" />
                      <span className="text-xs text-indigo-600 font-medium">{t.searchingWeb}</span>
                    </div>
                  ) : searchPhase === 'running_code' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin shrink-0" />
                      <IconCode className="w-3 h-3 text-violet-500 shrink-0" />
                      <span className="text-xs text-violet-600 font-medium">{t.runningCode}</span>
                    </div>
                  ) : (
                    <div className="flex gap-1.5 items-center">
                      {[0, 150, 300].map(d => (
                        <span
                          key={d}
                          className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: `${d}ms` }}
                        />
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

      <div className={`px-4 pb-4 pt-3 border-t border-gray-100 shrink-0 transition-opacity ${!hasDoc ? 'opacity-60' : ''}`}>
        <div
          className={[
            'flex items-end gap-2 rounded-2xl border px-4 py-2.5 transition-all duration-150',
            hasDoc
              ? 'bg-gray-50 border-gray-200 focus-within:border-indigo-400 focus-within:bg-white focus-within:shadow-sm'
              : 'bg-gray-50 border-gray-200 pointer-events-none',
          ].join(' ')}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={onInput}
            onKeyDown={onKey}
            dir="auto"
            rows={1}
            disabled={!hasDoc || loading}
            placeholder={hasDoc ? t.chatPlaceholder : t.chatPlaceholderNoDoc}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-800 placeholder-gray-400 disabled:cursor-not-allowed leading-relaxed"
            style={{ maxHeight: 130 }}
          />
          <button
            onClick={() => send()}
            disabled={!hasDoc || !input.trim() || loading}
            aria-label={t.send}
            className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:cursor-not-allowed"
          >
            <IconSend className="w-4 h-4 text-white" />
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2 select-none">
          {t.enterHint}
        </p>
      </div>
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
  const [downloading, setDownloading]   = useState(false);

  const generate = useCallback(
    async (topicOverride?: string) => {
      const top = (topicOverride ?? topic).trim();
      if (!top || loading || !hasDoc) return;
      setLoading(true);
      setError(null);
      setPaper(null);
      setSources([]);
      try {
        const res = await fetch('http://127.0.0.1:5003/generate-paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: top, instructions: instructions.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? t.paperErr);
          return;
        }
        setPaper(data.paper);
        setSources(data.sources ?? []);
      } catch {
        setError(t.serverErr);
      } finally {
        setLoading(false);
      }
    },
    [topic, instructions, loading, hasDoc, t],
  );

  const downloadPdf = async () => {
    if (!paper || downloading) return;
    setDownloading(true);
    try {
      const safeTitle = topic.trim().slice(0, 40).replace(/[^\w֐-׿\s-]/g, '') || 'paper';
      const filename = `levy-ai-${safeTitle}.pdf`;

      const res = await fetch('http://127.0.0.1:5003/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: paper, filename }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? t.exportErr);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const onInstructionsInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInstructions(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-[520px]">

      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
        <span className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shrink-0">
          <IconPen className="w-5 h-5 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{t.paperTitle}</p>
          <p className="text-xs text-gray-500">
            {hasDoc ? t.paperSubtitle : t.waitingPdf}
          </p>
        </div>
        {paper && (
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-xs font-medium rounded-lg transition-all active:scale-95 shrink-0"
          >
            <IconDownload className="w-3.5 h-3.5" />
            {downloading ? t.exporting : t.downloadPdf}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">

        {!paper && !loading && !error && (
          <div className="flex flex-col items-center justify-center gap-5 py-10 text-center h-full">
            <div className="w-20 h-20 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-3xl flex items-center justify-center">
              <IconPen className="w-10 h-10 text-violet-400" />
            </div>
            <div>
              <p className="font-medium text-gray-700">
                {hasDoc ? t.enterTopic : t.uploadFirst}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {hasDoc ? t.aiWrites : t.uploadSideHint}
              </p>
            </div>
            {hasDoc && (
              <>
                <p className="text-xs text-gray-400">{t.suggestedTopics}</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-xs">
                  {t.topicChips.map(chip => (
                    <button
                      key={chip}
                      onClick={() => { setTopic(chip); generate(chip); }}
                      className="px-4 py-2 text-xs bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-full transition-colors"
                    >
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
            <div className="w-12 h-12 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
            <div className="text-center">
              <p className="font-medium text-gray-700 text-sm">{t.writingPaper}</p>
              <p className="text-xs text-gray-400 mt-1">{t.takeSecs}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm mt-4">
            <IconX className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {paper && !loading && (
          <div className="flex flex-col gap-3">
            {sources.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400">{t.sources}</span>
                {sources.map(s => (
                  <span key={s} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full border border-indigo-100">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <div dir="rtl" className="bg-white rounded-xl border border-gray-200 p-8 text-gray-800">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-200 text-center">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-lg font-bold text-gray-800 mt-7 mb-3">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-base font-semibold text-gray-700 mt-5 mb-2">{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm leading-8 mb-4" style={{ textAlign: 'justify' }}>{children}</p>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-gray-900">{children}</strong>
                  ),
                  em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
                  ul: ({ children }) => (
                    <ul className="list-disc mb-4 space-y-1 text-sm pe-5">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal mb-4 space-y-1 text-sm pe-5">{children}</ol>
                  ),
                  li: ({ children }) => <li className="text-sm leading-7">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-r-4 border-violet-300 pr-4 my-4 italic text-sm bg-violet-50/50 py-2 rounded-sm text-gray-600">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <hr className="my-6 border-gray-200" />,
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4">
                      <table className="w-full text-sm border-collapse">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-gray-300 px-3 py-2 bg-gray-50 font-semibold text-right">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-gray-300 px-3 py-2 text-right">{children}</td>
                  ),
                }}
              >
                {paper}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      <div className={`px-4 pb-4 pt-3 border-t border-gray-100 shrink-0 ${!hasDoc ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            dir="auto"
            disabled={!hasDoc || loading}
            placeholder={hasDoc ? t.topicPh : t.topicPhNoDoc}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-violet-400 focus:bg-white focus:shadow-sm transition-all disabled:cursor-not-allowed"
            onKeyDown={e => { if (e.key === 'Enter') generate(); }}
          />
          <textarea
            value={instructions}
            onChange={onInstructionsInput}
            dir="auto"
            rows={2}
            disabled={!hasDoc || loading}
            placeholder={t.instructionsPh}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-violet-400 focus:bg-white focus:shadow-sm transition-all resize-none disabled:cursor-not-allowed"
            style={{ maxHeight: 100 }}
          />
          <button
            onClick={() => generate()}
            disabled={!hasDoc || !topic.trim() || loading}
            className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white text-sm font-medium transition-all active:scale-[0.99] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading
              ? <><div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /><span>{t.writingBtn}</span></>
              : <><IconPen className="w-4 h-4" /><span>{t.composePaper}</span></>
            }
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
  lang: Lang;
  t: T;
}

function Sidebar({ sessions, currentSessionId, onNewChat, onSelectSession, onDeleteSession, isOpen, onClose, lang, t }: SidebarProps) {
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  // Slide off toward the inline-start edge when closed (right in RTL, left in LTR).
  const translateClass = isOpen
    ? 'translate-x-0'
    : lang === 'he' ? 'translate-x-full' : '-translate-x-full';

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-300',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        className={[
          'fixed inset-y-0 start-0 z-50 w-64 bg-slate-900 border-e border-slate-700',
          'flex flex-col transition-transform duration-300 ease-in-out',
          translateClass,
        ].join(' ')}
      >
        {/* Header row: New Chat + Close */}
        <div className="flex items-center gap-2 p-3 border-b border-slate-700 shrink-0">
          <button
            onClick={() => { onNewChat(); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            <IconPlus className="w-4 h-4 shrink-0" />
            {t.newChat}
          </button>
          <button
            onClick={onClose}
            aria-label={t.closeMenu}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors shrink-0"
          >
            <IconX className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto py-2">
          {sessions.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-6 px-4">{t.noPrevChats}</p>
          ) : (
            sessions.map(s => (
              <div
                key={s.id}
                onClick={() => { onSelectSession(s.id); onClose(); }}
                className={`group flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-slate-800 transition-colors ${
                  currentSessionId === s.id ? 'bg-slate-800' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-xs font-medium truncate leading-snug">{s.title}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{fmtDate(s.updated_at)}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onDeleteSession(s.id); }}
                  aria-label={t.deleteChat}
                  className="opacity-0 group-hover:opacity-100 mt-0.5 p-1 rounded hover:bg-red-500/20 transition-all shrink-0"
                >
                  <IconX className="w-3 h-3 text-slate-400 hover:text-red-400" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

/* ─── Root page ──────────────────────────────────────────────────────────────── */
export default function Home() {
  const [hasDoc, setHasDoc]                     = useState(false);
  const [mode, setMode]                         = useState<'chat' | 'paper'>('chat');
  const [sessions, setSessions]                 = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [initialMessages, setInitialMessages]   = useState<Message[]>([]);
  const [chatKey, setChatKey]                   = useState<string>('new');
  const [pdfKey, setPdfKey]                     = useState<string>('initial');
  const [lang, setLang]                         = useState<Lang>('he');
  const [sidebarOpen, setSidebarOpen]           = useState(false);

  const t = translations[lang];

  // Sync document direction and language with the UI language state.
  useEffect(() => {
    document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Close sidebar on Escape key.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res  = await fetch('http://127.0.0.1:5003/sessions');
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch { /* backend not running yet */ }
  }, []);

  useEffect(() => {
    fetch('http://127.0.0.1:5003/sessions')
      .then(r => r.json())
      .then((data: { sessions?: ChatSession[] }) => setSessions(data.sessions ?? []))
      .catch(() => {});
  }, []);

  const startNewChat = useCallback(() => {
    setCurrentSessionId(null);
    setInitialMessages([]);
    setChatKey(`new-${Date.now()}`);
  }, []);

  // Full reset: clears chat state AND forces PdfUploader back to its empty initial state.
  // Used exclusively by the explicit "New Chat" button in the sidebar.
  const handleNewChat = useCallback(() => {
    setHasDoc(false);
    setPdfKey(`pdf-${Date.now()}`);
    setCurrentSessionId(null);
    setInitialMessages([]);
    setChatKey(`new-${Date.now()}`);
  }, []);

  const loadSession = useCallback(async (id: number) => {
    try {
      const res  = await fetch(`http://127.0.0.1:5003/sessions/${id}`);
      const data = await res.json();
      const msgs: Message[] = (data.messages ?? []).map(
        (m: { id: number; role: 'user' | 'assistant'; content: string }) => ({
          id: String(m.id),
          role: m.role,
          content: m.content,
        }),
      );
      setCurrentSessionId(id);
      setInitialMessages(msgs);
      setChatKey(`session-${id}`);
    } catch { /* silently ignore */ }
  }, []);

  const deleteSession = useCallback(async (id: number) => {
    try {
      await fetch(`http://127.0.0.1:5003/sessions/${id}`, { method: 'DELETE' });
      if (currentSessionId === id) startNewChat();
      fetchSessions();
    } catch { /* silently ignore */ }
  }, [currentSessionId, startNewChat, fetchSessions]);

  const handleSessionCreated = useCallback((id: number) => {
    setCurrentSessionId(id);
    fetchSessions();
  }, [fetchSessions]);

  const handleUpload = useCallback(() => {
    if (!hasDoc) startNewChat();
    setHasDoc(true);
  }, [hasDoc, startNewChat]);

  const handleRemove = useCallback(() => {
    setHasDoc(false);
    startNewChat();
  }, [startNewChat]);

  const toggleLang = () => setLang(l => l === 'he' ? 'en' : 'he');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-slate-900 shadow-xl shrink-0 relative z-30">
        <div className="max-w-full px-4 py-3.5 flex items-center justify-between gap-3">

          {/* Start: Hamburger + Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label={t.openMenu}
              className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
            >
              <IconMenu className="w-5 h-5 text-slate-300" />
            </button>
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/40 shrink-0">
              <IconSparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-none">Levy AI</h1>
              <p className="text-xs text-slate-400 mt-0.5">{t.subtitle}</p>
            </div>
          </div>

          {/* End: Status pill + Language toggle */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-full px-4 py-1.5">
              <span className={`w-2 h-2 rounded-full transition-colors duration-500 ${hasDoc ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-sm text-slate-300 font-medium">{hasDoc ? t.docLoaded : t.waiting}</span>
            </div>
            <button
              onClick={toggleLang}
              aria-label={`Switch to ${t.langLabel}`}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-full text-sm text-slate-200 font-semibold transition-colors"
            >
              <IconGlobe className="w-4 h-4" />
              {t.langLabel}
            </button>
          </div>
        </div>
      </header>

      {/* ── Sidebar (overlay) ──────────────────────────────────────────────── */}
      <Sidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSelectSession={loadSession}
        onDeleteSession={deleteSession}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        lang={lang}
        t={t}
      />

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-6 md:py-8 flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-[38%] flex flex-col">
            <PdfUploader key={pdfKey} onUpload={handleUpload} onRemove={handleRemove} t={t} />
          </div>
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            {/* Mode tab switcher */}
            <div className="flex gap-1 p-1 bg-slate-200/60 rounded-xl shrink-0">
              <button
                onClick={() => setMode('chat')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  mode === 'chat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.tabChat}
              </button>
              <button
                onClick={() => setMode('paper')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  mode === 'paper' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.tabPaper}
              </button>
            </div>
            {mode === 'chat' ? (
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
            ) : (
              <PaperWriter hasDoc={hasDoc} t={t} />
            )}
          </div>
        </main>

        <footer className="py-3 text-center text-xs text-gray-400 shrink-0">
          {t.footer}
        </footer>
      </div>
    </div>
  );
}
