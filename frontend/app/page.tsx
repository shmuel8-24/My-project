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
}

type SseEvent =
  | { type: 'status'; phase: string }
  | { type: 'result'; answer: string; sources: string[]; chunks_used: number; searched_web: boolean; web_sources: { title: string; url: string }[] }
  | { type: 'error'; message: string };

interface UploadedFile {
  name: string;
  size: number;
  chunks: number;
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

/* ─── PDF Uploader ──────────────────────────────────────────────────────────── */
function PdfUploader({
  onUpload,
  onRemove,
}: {
  onUpload: () => void;
  onRemove: () => void;
}) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      const rejectionErrors: string[] = rejected.length
        ? [`${rejected.length} קבצ${rejected.length === 1 ? '' : 'ים'} נדח${rejected.length === 1 ? '' : 'ו'} — יש לבחור קבצי PDF בלבד.`]
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
          setErrors([...rejectionErrors, data.error ?? 'שגיאה בהעלאת הקבצים.']);
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
              if (idx >= 0) next[idx] = nf; // re-upload of same file → update in place
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
        setErrors([...rejectionErrors, 'לא ניתן להתחבר לשרת. בדוק שה-backend פועל על פורט 5003.']);
      } finally {
        setUploading(false);
      }
    },
    [onUpload],
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
      {/* Upload card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5">

        {/* Section label */}
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
            <IconDoc className="w-5 h-5 text-indigo-600" />
          </span>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">העלאת מסמכים</p>
            <p className="text-xs text-gray-500">PDF בלבד · עד 50 MB לקובץ</p>
          </div>
        </div>

        {/* Uploaded file list */}
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
                  <p className="text-xs text-emerald-600">{fmt(file.size)} · {file.chunks} קטעים · הועלה בהצלחה</p>
                </div>
                <button
                  onClick={() => handleRemoveFile(file.name)}
                  aria-label="הסר קובץ"
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-emerald-200 transition-colors shrink-0"
                >
                  <IconX className="w-4 h-4 text-emerald-700" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Drop zone — full size when empty, compact "Add more" strip when files exist */}
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
                <p className="text-sm font-medium text-indigo-600">מעלה...</p>
              </>
            )}

            {!uploading && isDragActive && (
              <>
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-300 animate-bounce">
                  <IconCloud className="w-9 h-9 text-white" />
                </div>
                <p className="text-indigo-700 font-bold text-lg">שחרר כאן!</p>
              </>
            )}

            {!uploading && !isDragActive && (
              <>
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                  <IconCloud className="w-9 h-9 text-white" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-800">גרור ושחרר קבצי PDF</p>
                  <p className="text-sm text-gray-400">ניתן לגרור מספר קבצים בו-זמנית · או לחץ לבחירה ידנית</p>
                </div>
                <span className="px-3 py-1 bg-indigo-100 text-indigo-600 text-xs font-medium rounded-full">
                  PDF · עד 50 MB לקובץ
                </span>
              </>
            )}
          </div>
        ) : (
          /* Compact "add more" strip */
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
              {uploading ? 'מעלה...' : 'הוסף עוד קבצי PDF'}
            </span>
          </div>
        )}

        {/* Error banners */}
        {errors.map((err, i) => (
          <div key={i} className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm">
            <IconX className="w-4 h-4 shrink-0" />
            {err}
          </div>
        ))}
      </div>

      {/* Usage tips card */}
      <div className="flex-1 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-5">
        <p className="text-sm font-semibold text-violet-800 mb-3">איך להשתמש?</p>
        <ul className="space-y-2.5">
          {[
            'העלה קובץ PDF אחד או יותר – חומרי לימוד, מאמרים, ספרים',
            'שאל שאלות בעברית או אנגלית על תוכן הקבצים',
            'קבל סיכומים, הסברים ודוגמאות ממוקדות',
            'חזור על הכל בקלות לפני המבחן',
          ].map((tip, i) => (
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
const SUGGESTIONS = [
  'סכם את המסמך בקצרה',
  'מה הנקודות העיקריות?',
  'הסבר את הנושא הראשון',
  'תן לי שאלות לתרגול',
];

function ChatInterface({ hasDoc }: { hasDoc: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchPhase, setSearchPhase] = useState<'thinking' | 'searching_web'>('thinking');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Chat state is intentionally reset by remounting via key prop in Home (see below).

  const send = useCallback(
    async (text?: string) => {
      const q = (text ?? input).trim();
      if (!q || loading || !hasDoc) return;

      // Snapshot history before adding the new user message (strip UI-only id field).
      const history = messages.map(({ role, content }) => ({ role, content }));

      const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: q };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      setSearchPhase('thinking');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      try {
        const payload = { message: q, history };
        console.log('[/ask payload]', JSON.stringify(payload, null, 2));
        const response = await fetch('http://127.0.0.1:5003/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        // Non-SSE error (e.g. 400 no documents uploaded)
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error ?? 'שגיאה בתקשורת עם השרת');
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
              setSearchPhase(parsed.phase as 'thinking' | 'searching_web');
            } else if (parsed.type === 'result') {
              setMessages(prev => [
                ...prev,
                {
                  id: `a${Date.now()}`,
                  role: 'assistant',
                  content: parsed.answer,
                  searchedWeb: parsed.searched_web,
                  webSources: parsed.web_sources ?? [],
                  sources: parsed.sources ?? [],
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
    [input, loading, hasDoc, messages],
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col flex-1 min-h-[520px]">

      {/* Chat panel header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
        <span className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shrink-0">
          <IconSparkles className="w-5 h-5 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">שיחה עם המסמך</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${hasDoc ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}
            />
            <span className="text-xs text-gray-500">
              {hasDoc ? 'מסמך מוכן – ניתן לשאול שאלות' : 'ממתין לקובץ PDF'}
            </span>
          </div>
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 min-h-0">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center gap-5 py-12 flex-1 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-3xl flex items-center justify-center">
              <IconSparkles className="w-10 h-10 text-indigo-400" />
            </div>
            <div>
              <p className="font-medium text-gray-700">
                {hasDoc ? 'שאל שאלה על המסמך' : 'העלה מסמך PDF כדי להתחיל'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {hasDoc
                  ? 'ניתן לשאול בעברית, אנגלית, או שילוב של שתיהן'
                  : 'לחץ על אזור ההעלאה מצד ימין'}
              </p>
            </div>
            {/* Quick-start suggestion chips (shown only when doc is loaded) */}
            {hasDoc && (
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map(s => (
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
                /*
                  RTL flex-row layout trick:
                    justify-start → aligns to the RIGHT (RTL start) → user messages ✓
                    justify-end   → aligns to the LEFT  (RTL end)   → AI messages  ✓
                */
                className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div className="flex flex-col gap-1.5 max-w-[78%]">
                  <div
                    dir="auto"
                    className={[
                      'px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-sm'   // tail → top-right (user on right)
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm', // tail → top-left  (AI on left)
                    ].join(' ')}
                  >
                    {msg.content}
                  </div>
                  {msg.searchedWeb && msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 px-1">
                      <IconGlobe className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="text-xs text-indigo-400">שילב חיפוש ברשת</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing / status indicator */}
            {loading && (
              <div className="flex justify-end">
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-5 py-3.5">
                  {searchPhase === 'searching_web' ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin shrink-0" />
                      <span className="text-xs text-indigo-600 font-medium">מחפש ברשת...</span>
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

      {/* Input area */}
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
            placeholder={hasDoc ? 'שאל שאלה על המסמך...' : 'יש להעלות קובץ תחילה'}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-800 placeholder-gray-400 disabled:cursor-not-allowed leading-relaxed"
            style={{ maxHeight: 130 }}
          />
          <button
            onClick={() => send()}
            disabled={!hasDoc || !input.trim() || loading}
            aria-label="שלח"
            className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 flex items-center justify-center shrink-0 transition-all active:scale-95 disabled:cursor-not-allowed"
          >
            <IconSend className="w-4 h-4 text-white" />
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2 select-none">
          Enter לשליחה · Shift+Enter לשורה חדשה
        </p>
      </div>
    </div>
  );
}

/* ─── Paper Writer ───────────────────────────────────────────────────────────── */
const TOPIC_CHIPS = [
  'סיכום הנושאים המרכזיים',
  'השוואת גישות ורעיונות',
  'ביקורת ספרות',
  'ניתוח מושגי מפתח',
];

function PaperWriter({ hasDoc }: { hasDoc: boolean }) {
  const [topic, setTopic]               = useState('');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading]           = useState(false);
  const [paper, setPaper]               = useState<string | null>(null);
  const [sources, setSources]           = useState<string[]>([]);
  const [error, setError]               = useState<string | null>(null);
  const [downloading, setDownloading]   = useState(false);

  const generate = useCallback(
    async (topicOverride?: string) => {
      const t = (topicOverride ?? topic).trim();
      if (!t || loading || !hasDoc) return;
      setLoading(true);
      setError(null);
      setPaper(null);
      setSources([]);
      try {
        const res = await fetch('http://127.0.0.1:5003/generate-paper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: t, instructions: instructions.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'שגיאה ביצירת המאמר.');
          return;
        }
        setPaper(data.paper);
        setSources(data.sources ?? []);
      } catch {
        setError('לא ניתן להתחבר לשרת. בדוק שה-backend פועל על פורט 5003.');
      } finally {
        setLoading(false);
      }
    },
    [topic, instructions, loading, hasDoc],
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
        throw new Error((err as { error?: string }).error ?? 'שגיאה בייצוא ה-PDF');
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

      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
        <span className="w-9 h-9 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shrink-0">
          <IconPen className="w-5 h-5 text-white" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">כתיבה אקדמית</p>
          <p className="text-xs text-gray-500">
            {hasDoc ? 'כתוב מאמר מבוסס המסמכים שהועלו' : 'ממתין לקובץ PDF'}
          </p>
        </div>
        {paper && (
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-xs font-medium rounded-lg transition-all active:scale-95 shrink-0"
          >
            <IconDownload className="w-3.5 h-3.5" />
            {downloading ? 'מייצא...' : 'הורד PDF'}
          </button>
        )}
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">

        {/* Empty state */}
        {!paper && !loading && !error && (
          <div className="flex flex-col items-center justify-center gap-5 py-10 text-center h-full">
            <div className="w-20 h-20 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-3xl flex items-center justify-center">
              <IconPen className="w-10 h-10 text-violet-400" />
            </div>
            <div>
              <p className="font-medium text-gray-700">
                {hasDoc ? 'הזן נושא ולחץ על "חבר מאמר"' : 'יש להעלות מסמך PDF תחילה'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {hasDoc
                  ? 'ה-AI יכתוב מאמר אקדמי מלא ומובנה בעברית'
                  : 'לחץ על אזור ההעלאה מצד ימין'}
              </p>
            </div>
            {hasDoc && (
              <>
                <p className="text-xs text-gray-400">נושאים מוצעים:</p>
                <div className="flex flex-wrap gap-2 justify-center max-w-xs">
                  {TOPIC_CHIPS.map(chip => (
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

        {/* Generating spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-20 h-full">
            <div className="w-12 h-12 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin" />
            <div className="text-center">
              <p className="font-medium text-gray-700 text-sm">כותב מאמר אקדמי...</p>
              <p className="text-xs text-gray-400 mt-1">זה עשוי לקחת מספר שניות</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm mt-4">
            <IconX className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Rendered paper */}
        {paper && !loading && (
          <div className="flex flex-col gap-3">
            {sources.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400">מקורות:</span>
                {sources.map(s => (
                  <span key={s} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-xs rounded-full border border-indigo-100">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <div
              dir="rtl"
              className="bg-white rounded-xl border border-gray-200 p-8 text-gray-800"
            >
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

      {/* Input form — topic + instructions + compose button */}
      <div className={`px-4 pb-4 pt-3 border-t border-gray-100 shrink-0 ${!hasDoc ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="flex flex-col gap-2">

          {/* Topic — required */}
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            dir="auto"
            disabled={!hasDoc || loading}
            placeholder={hasDoc ? 'נושא המאמר (לדוגמה: השפעת הגלובליזציה על החינוך)' : 'יש להעלות קובץ תחילה'}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-violet-400 focus:bg-white focus:shadow-sm transition-all disabled:cursor-not-allowed"
            onKeyDown={e => { if (e.key === 'Enter') generate(); }}
          />

          {/* Instructions — optional, auto-growing */}
          <textarea
            value={instructions}
            onChange={onInstructionsInput}
            dir="auto"
            rows={2}
            disabled={!hasDoc || loading}
            placeholder="הוראות נוספות (אופציונלי): אורך, פרקים ספציפיים, סגנון..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-violet-400 focus:bg-white focus:shadow-sm transition-all resize-none disabled:cursor-not-allowed"
            style={{ maxHeight: 100 }}
          />

          {/* Compose button */}
          <button
            onClick={() => generate()}
            disabled={!hasDoc || !topic.trim() || loading}
            className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white text-sm font-medium transition-all active:scale-[0.99] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading
              ? <><div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /><span>כותב מאמר...</span></>
              : <><IconPen className="w-4 h-4" /><span>חבר מאמר</span></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Root page ──────────────────────────────────────────────────────────────── */
export default function Home() {
  const [hasDoc, setHasDoc] = useState(false);
  const [mode, setMode] = useState<'chat' | 'paper'>('chat');
  const handleUpload = useCallback(() => setHasDoc(true), []);
  const handleRemove = useCallback(() => setHasDoc(false), []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-slate-900 shadow-xl shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo + wordmark */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-900/40">
              <IconSparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-none">
                Levy AI
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">עוזר הסטודנט החכם</p>
            </div>
          </div>

          {/* Status badge */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-full px-4 py-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                hasDoc ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span className="text-sm text-slate-300 font-medium">
              {hasDoc ? 'מסמך טעון' : 'ממתין'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      {/*
        RTL flex-row ordering (desktop):
          1st child → RIGHT side  →  PDF upload zone  ✓
          2nd child → LEFT  side  →  Chat interface   ✓
        Mobile (flex-col): upload on top, chat below.
      */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-6 md:py-8 flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-[38%] flex flex-col">
          <PdfUploader onUpload={handleUpload} onRemove={handleRemove} />
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
              שיחה עם המסמך
            </button>
            <button
              onClick={() => setMode('paper')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'paper' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              כתיבה אקדמית
            </button>
          </div>
          {/* key remounts ChatInterface on every doc change → fresh state, no effect hacks */}
          {mode === 'chat'
            ? <ChatInterface key={String(hasDoc)} hasDoc={hasDoc} />
            : <PaperWriter hasDoc={hasDoc} />
          }
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="py-3 text-center text-xs text-gray-400 shrink-0">
        Levy AI · מופעל על ידי OpenAI ו-Flask
      </footer>
    </div>
  );
}
