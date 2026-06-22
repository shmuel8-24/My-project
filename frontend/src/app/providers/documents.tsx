'use client';

/**
 * Global document context.
 *
 * Fetches the active-course document list once and makes it available to any
 * component in the app.  Re-fetches whenever the active course changes.
 * `refetchDocs` can be called imperatively after upload/delete to keep the
 * list in sync without a full page reload.
 *
 * Must live inside both AuthProvider and CourseProvider in the tree.
 */

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './auth';
import { useCourse } from './course';

const API = 'http://localhost:5003';

/* ── Shared type ─────────────────────────────────────────────────────────── */

export interface DocInfo {
  file_id:   string;
  name?:     string;
  file_name?: string;
  filename?: string;
  chunks?:   number;
}

/* ── Context ─────────────────────────────────────────────────────────────── */

interface DocumentContextValue {
  docs:        DocInfo[];
  docsLoading: boolean;
  refetchDocs: () => void;
}

const DocumentContext = createContext<DocumentContextValue>({
  docs:        [],
  docsLoading: false,
  refetchDocs: () => {},
});

/* ── Provider ────────────────────────────────────────────────────────────── */

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const { selectedCourse }  = useCourse();

  const [docs,        setDocs]        = useState<DocInfo[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const refetchDocs = useCallback(() => {
    if (!authUser || !selectedCourse) {
      setDocs([]);
      return;
    }
    setDocsLoading(true);
    // _t cache-buster forces the browser past any cached response so every
    // call to refetchDocs() always reaches the Flask server.
    const url = `${API}/documents?course_name=${encodeURIComponent(selectedCourse.name)}&_t=${Date.now()}`;
    fetch(url, { credentials: 'include' })
      .then(r => {
        if (r.status === 401) {
          // Mirror the per-page authFetch 401 behaviour.
          window.location.href = '/?login=true';
          return { documents: [] as DocInfo[] };
        }
        return r.ok ? (r.json() as Promise<{ documents: DocInfo[] }>) : { documents: [] as DocInfo[] };
      })
      .then(data => {
        setDocs(Array.isArray(data.documents) ? data.documents : []);
      })
      .catch(() => setDocs([]))
      .finally(() => setDocsLoading(false));
  }, [authUser, selectedCourse]);

  /* Fetch on mount and whenever the active course changes */
  useEffect(() => { refetchDocs(); }, [refetchDocs]);

  return (
    <DocumentContext.Provider value={{ docs, docsLoading, refetchDocs }}>
      {children}
    </DocumentContext.Provider>
  );
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

export function useDocuments(): DocumentContextValue {
  return useContext(DocumentContext);
}
