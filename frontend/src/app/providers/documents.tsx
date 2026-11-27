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

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth, clearAuthStorage } from './auth';
import { useCourse } from './course';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5003';

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
  docsError:   'unauthorized' | null;
  refetchDocs: () => void;
}

const DocumentContext = createContext<DocumentContextValue>({
  docs:        [],
  docsLoading: false,
  docsError:   null,
  refetchDocs: () => {},
});

/* ── Provider ────────────────────────────────────────────────────────────── */

export function DocumentProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const { selectedCourse, setSelectedCourse } = useCourse();

  const [docs,        setDocs]        = useState<DocInfo[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError,   setDocsError]   = useState<'unauthorized' | null>(null);
  // `authUser`/`selectedCourse` are derived from localStorage and only reflect
  // "there is locally cached profile/course data" — not "the session is still
  // valid server-side". If the real JWT has expired, every mount/course-change
  // refetches, 401s, and (previously) redirected without ever invalidating
  // that stale local signal — so the next page load read the same stale
  // localStorage, refetched, 401'd, and redirected again: an infinite reload
  // loop that floods the backend with /documents requests. This ref stops
  // this provider instance from firing more than one such redirect.
  const loggedOutRef = useRef(false);

  const refetchDocs = useCallback(() => {
    if (!authUser || !selectedCourse || loggedOutRef.current) {
      setDocs([]);
      return;
    }
    setDocsLoading(true);
    setDocsError(null);
    // _t cache-buster forces the browser past any cached response so every
    // call to refetchDocs() always reaches the Flask server.
    const url = `${API}/documents?course_name=${encodeURIComponent(selectedCourse.name)}&_t=${Date.now()}`;
    fetch(url, { credentials: 'include' })
      .then(r => {
        if (r.status === 401) {
          // Mirror the per-page authFetch 401 behaviour — crucially including
          // the clear step those wrappers do and this one previously skipped.
          loggedOutRef.current = true;
          setDocsError('unauthorized');
          clearAuthStorage();
          setSelectedCourse(null);
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
  }, [authUser, selectedCourse, setSelectedCourse]);

  /* Fetch on mount and whenever the active course changes */
  useEffect(() => { refetchDocs(); }, [refetchDocs]);

  return (
    <DocumentContext.Provider value={{ docs, docsLoading, docsError, refetchDocs }}>
      {children}
    </DocumentContext.Provider>
  );
}

/* ── Hook ────────────────────────────────────────────────────────────────── */

export function useDocuments(): DocumentContextValue {
  return useContext(DocumentContext);
}
