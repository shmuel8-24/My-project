'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { KeyboardEvent, ChangeEvent } from 'react';
import { useDropzone } from 'react-dropzone';
import type { FileRejection } from 'react-dropzone';

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}

/* ─── PDF Uploader ──────────────────────────────────────────────────────────── */
function PdfUploader({
  onUpload,
  onRemove,
}: {
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const [uploaded, setUploaded] = useState<{ name: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      setError(null);
      if (rejected.length) {
        setError('יש לבחור קובץ PDF בלבד.');
        return;
      }
      const file = accepted[0];
      if (!file) return;
      setUploading(true);
      try {
        // TODO: wire up Flask backend when ready:
        // const fd = new FormData();
        // fd.append('file', file);
        // await fetch('http://127.0.0.1:5003/upload-pdf', { method: 'POST', body: fd });
        await new Promise(r => setTimeout(r, 900));   // simulated upload delay
        setUploaded({ name: file.name, size: file.size });
        onUpload(file);
      } catch {
        setError('שגיאה בהעלאת הקובץ. אנא נסה שנית.');
      } finally {
        setUploading(false);
      }
    },
    [onUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: uploading,
  });

  const fmt = (b: number) =>
    b < 1_048_576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1_048_576).toFixed(1)} MB`;

  const handleRemove = () => {
    setUploaded(null);
    setError(null);
    onRemove();
  };

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
            <p className="font-semibold text-gray-900 text-sm leading-tight">העלאת מסמך</p>
            <p className="text-xs text-gray-500">PDF בלבד · עד 50 MB</p>
          </div>
        </div>

        {/* Drop zone */}
        {!uploaded ? (
          <div
            {...getRootProps()}
            className={[
              'rounded-2xl border-2 border-dashed flex flex-col items-center justify-center',
              'gap-4 min-h-52 cursor-pointer transition-all duration-200 px-6 py-10 text-center select-none',
              uploading
                ? 'opacity-50 cursor-not-allowed border-indigo-300 bg-indigo-50/40'
                : isDragActive
                  ? 'border-indigo-500 bg-indigo-100 scale-[1.015] shadow-lg shadow-indigo-100'
                  : [
                    'border-indigo-200 bg-gradient-to-b from-indigo-50/70 to-white',
                    'hover:border-indigo-400 hover:bg-indigo-50/90',
                  ].join(' '),
            ].join(' ')}
          >
            <input {...getInputProps()} />

            {/* uploading spinner */}
            {uploading && (
              <>
                <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
                <p className="text-sm font-medium text-indigo-600">מעלה...</p>
              </>
            )}

            {/* drag-active */}
            {!uploading && isDragActive && (
              <>
                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-300 animate-bounce">
                  <IconCloud className="w-9 h-9 text-white" />
                </div>
                <p className="text-indigo-700 font-bold text-lg">שחרר כאן!</p>
              </>
            )}

            {/* idle */}
            {!uploading && !isDragActive && (
              <>
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                  <IconCloud className="w-9 h-9 text-white" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-gray-800">גרור ושחרר קובץ PDF</p>
                  <p className="text-sm text-gray-400">או לחץ כאן לבחירה ידנית</p>
                </div>
                <span className="px-3 py-1 bg-indigo-100 text-indigo-600 text-xs font-medium rounded-full">
                  PDF · עד 50 MB
                </span>
              </>
            )}
          </div>
        ) : (
          /* Uploaded success state */
          <div className="flex items-center gap-3 border-2 border-emerald-200 bg-emerald-50 rounded-2xl px-5 py-4">
            <span className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <IconCheck className="w-6 h-6 text-emerald-600" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-emerald-900 text-sm truncate">{uploaded.name}</p>
              <p className="text-xs text-emerald-600">{fmt(uploaded.size)} · הועלה בהצלחה</p>
            </div>
            <button
              onClick={handleRemove}
              aria-label="הסר קובץ"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-emerald-200 transition-colors shrink-0"
            >
              <IconX className="w-5 h-5 text-emerald-700" />
            </button>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm">
            <IconX className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Usage tips card */}
      <div className="flex-1 bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl p-5">
        <p className="text-sm font-semibold text-violet-800 mb-3">איך להשתמש?</p>
        <ul className="space-y-2.5">
          {[
            'העלה קובץ PDF – חומרי לימוד, מאמרים, ספרים',
            'שאל שאלות בעברית או אנגלית על תוכן הקובץ',
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

      const userMsg: Message = { id: `u${Date.now()}`, role: 'user', content: q };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      try {
        // TODO: wire up Flask backend when ready:
        // const res = await fetch('http://127.0.0.1:5003/ask', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ question: q }),
        // });
        // const data = await res.json();
        // const answer = data.answer ?? data.reply ?? 'לא הצלחתי לקבל תשובה.';
        await new Promise(r => setTimeout(r, 1400));   // simulated API latency
        const answer =
          'זוהי תשובה לדוגמה. ברגע שה-API של Flask יחובר, תקבל תשובות אמיתיות ישירות מהמסמך שהעלית.';
        setMessages(prev => [
          ...prev,
          { id: `a${Date.now()}`, role: 'assistant', content: answer },
        ]);
      } catch {
        setMessages(prev => [
          ...prev,
          { id: `e${Date.now()}`, role: 'assistant', content: 'אירעה שגיאה. אנא נסה שנית.' },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, hasDoc],
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
                <div
                  dir="auto"
                  className={[
                    'max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-sm'   // tail → top-right (user on right)
                      : 'bg-gray-100 text-gray-800 rounded-tl-sm', // tail → top-left  (AI on left)
                  ].join(' ')}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-end">
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-5 py-3.5">
                  <div className="flex gap-1.5 items-center">
                    {[0, 150, 300].map(d => (
                      <span
                        key={d}
                        className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
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

/* ─── Root page ──────────────────────────────────────────────────────────────── */
export default function Home() {
  const [hasDoc, setHasDoc] = useState(false);
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
        {/* key remounts ChatInterface on every doc change → fresh state, no effect hacks */}
        <div className="flex-1 flex flex-col">
          <ChatInterface key={String(hasDoc)} hasDoc={hasDoc} />
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="py-3 text-center text-xs text-gray-400 shrink-0">
        Levy AI · מופעל על ידי OpenAI ו-Flask
      </footer>
    </div>
  );
}
