'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useCourse } from './course';
import { useLanguage } from './language';
import type { DeckSlide } from '../../components/SlideViewer';

const API = 'http://127.0.0.1:5003';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('levy_ai_token') : null;
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

// File types the standard document library (/upload-pdf, /my-documents) can index.
// .docx and audio/video files are presentation-agent-only — they have no
// permanent-storage equivalent in /upload-pdf and stay in-memory for this flow.
const DOCUMENT_LIBRARY_EXTS = new Set(['pdf', 'pptx', 'png', 'jpg', 'jpeg']);

function fileExt(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i + 1).toLowerCase();
}

export interface PendingFile {
  id:   string;
  file: File;
}

export interface SourceResult {
  filename: string;
  type:     'document' | 'image' | 'media' | 'unsupported';
  chars:    number;
}

interface PresentationContextValue {
  topic:                string;
  setTopic:             (topic: string) => void;
  pending:              PendingFile[];
  addFiles:             (files: File[]) => void;
  removeFile:           (id: string) => void;
  selectedFileIds:      string[];
  setSelectedFileIds:   (ids: string[]) => void;
  slideCount:           number;
  setSlideCount:        (n: number) => void;
  isGenerating:         boolean;
  error:                string | null;
  slides:               DeckSlide[] | null;
  sources:              SourceResult[];
  generate:             () => Promise<void>;
  reset:                () => void;
}

const PresentationContext = createContext<PresentationContextValue | null>(null);

// Lives at the root of the provider tree (layout.tsx) so generation state
// survives navigation away from /presentation-generator: the in-flight
// fetch's .then()/.catch() always update this provider's state, not a
// component that may have since unmounted.
export function PresentationProvider({ children }: { children: ReactNode }) {
  const { selectedCourse } = useCourse();
  const { lang } = useLanguage();
  const he = lang === 'he';

  const [topic,              setTopic]              = useState('');
  const [pending,            setPending]            = useState<PendingFile[]>([]);
  const [selectedFileIds,    setSelectedFileIds]    = useState<string[]>([]);
  const [slideCount,         setSlideCount]         = useState(10);
  const [isGenerating,       setIsGenerating]       = useState(false);
  const [error,              setError]              = useState<string | null>(null);
  const [slides,             setSlides]             = useState<DeckSlide[] | null>(null);
  const [sources,            setSources]            = useState<SourceResult[]>([]);

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    setPending(prev => [
      ...prev,
      ...files.map(file => ({ id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`, file })),
    ]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setPending(prev => prev.filter(p => p.id !== id));
  }, []);

  // Save eligible files into the active course's permanent document library
  // (same /upload-pdf pipeline + course_name tagging as /my-documents), so
  // they show up there too. Best-effort and non-blocking — failures here
  // (quota limits, duplicates, etc.) must never affect presentation generation.
  const persistToCourseLibrary = useCallback((files: File[]) => {
    if (!selectedCourse) return;
    const libraryFiles = files.filter(f => DOCUMENT_LIBRARY_EXTS.has(fileExt(f.name)));
    if (libraryFiles.length === 0) return;

    const form = new FormData();
    libraryFiles.forEach(f => form.append('files', f));
    form.append('course_name', selectedCourse.name);

    authFetch(`${API}/upload-pdf`, { method: 'POST', body: form })
      .catch(err => console.error('[presentation-generator] failed to save files to course library:', err));
  }, [selectedCourse]);

  const generate = useCallback(async () => {
    const hasContent = pending.length > 0 || selectedFileIds.length > 0;
    if (!hasContent || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    if (pending.length > 0) persistToCourseLibrary(pending.map(p => p.file));

    try {
      const form = new FormData();
      if (topic.trim()) form.append('topic', topic.trim());
      if (selectedCourse) form.append('course_name', selectedCourse.name);
      form.append('slide_count', String(slideCount));
      form.append('style', 'academic');
      if (selectedFileIds.length > 0) form.append('file_ids', selectedFileIds.join(','));
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
      setIsGenerating(false);
    }
  }, [pending, selectedFileIds, topic, slideCount, isGenerating, he, selectedCourse, persistToCourseLibrary]);

  const reset = useCallback(() => {
    setSlides(null);
    setSources([]);
    setPending([]);
    setSelectedFileIds([]);
    setTopic('');
    setError(null);
  }, []);

  // ── Reset on active-course change ─────────────────────────────────────────
  // When the user switches courses (or clears the active course via CoursePill's
  // "✕"), any generated deck / pending files belong to the previous course's
  // context and must not linger. Adjusting state during render (rather than in
  // an effect) per https://react.dev/learn/you-might-not-need-an-effect.
  const activeCourseKey = selectedCourse?.id ?? null;
  const [lastCourseKey, setLastCourseKey] = useState<string | null>(activeCourseKey);
  if (activeCourseKey !== lastCourseKey) {
    setLastCourseKey(activeCourseKey);
    reset();
  }

  const value = useMemo<PresentationContextValue>(() => ({
    topic, setTopic,
    pending, addFiles, removeFile,
    selectedFileIds, setSelectedFileIds,
    slideCount, setSlideCount,
    isGenerating, error, slides, sources, generate, reset,
  }), [topic, pending, addFiles, removeFile, selectedFileIds, slideCount, isGenerating, error, slides, sources, generate, reset]);

  return (
    <PresentationContext.Provider value={value}>
      {children}
    </PresentationContext.Provider>
  );
}

export function usePresentationGenerator(): PresentationContextValue {
  const ctx = useContext(PresentationContext);
  if (!ctx) throw new Error('usePresentationGenerator must be used within a PresentationProvider');
  return ctx;
}
