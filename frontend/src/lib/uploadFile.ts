/**
 * Shared file upload pipeline — wraps POST /upload-pdf.
 * Emits EVT_DOCUMENTS_UPDATED via eventBus on success so all mounted
 * subscribers (wizard, My Documents, any future page) refresh automatically.
 *
 * Both the academic-writing wizard and the My Documents page MUST use this
 * function instead of inlining a fetch directly.  This keeps the upload
 * behaviour consistent: the same endpoint, the same credential handling, and
 * the same return shape regardless of the entry point.
 *
 * The backend endpoint (/upload-pdf) already handles:
 *   - Persistent binary storage  →  backend/data/uploads/user_{id}/
 *   - FAISS chunk indexing        →  backend/data/faiss/user_{id}/
 *   - UserDocument ownership row →  backend/data/chat.db
 *
 * No separate "documents_index.json" is needed — SQLite IS the index.
 * No new endpoint is needed — /upload-pdf already unifies all uploads.
 */

import { eventBus, EVT_DOCUMENTS_UPDATED } from './eventBus';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5003';

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface UploadedFileEntry {
  source:         string;
  file_id:        string;
  chunks_stored?: number;
  status?:        string;
}

export interface UploadFileResult {
  /** Files successfully processed by the backend. */
  files:   UploadedFileEntry[];
  /** Backend error message, if any. */
  error?:  string;
  /** Per-file rejection reasons (e.g. {source: "x.doc", error: "unsupported file type"}) — populated whenever the backend skips one or more files, even on an otherwise-successful (ok: true) response. */
  errors?: { source: string; error: string }[];
  /** True when the HTTP response was 2xx. */
  ok:      boolean;
}

export interface UploadFileOptions {
  /** Tag uploads to this course for course-scoped RAG retrieval. */
  courseName?: string;
}

/* ── Shared utility ──────────────────────────────────────────────────────── */

/**
 * Upload one or more files to the backend and index them.
 *
 * After this resolves with `ok: true`, call `refetchDocs()` from
 * `useDocuments()` so every component that reads the global document list
 * (wizard, My Documents, any future page) reflects the new file immediately.
 */
export async function uploadAndIndexFile(
  files: File[],
  opts: UploadFileOptions = {}
): Promise<UploadFileResult> {
  if (!files.length) return { files: [], ok: false, error: 'No files provided' };

  const fd = new FormData();
  files.forEach(f => fd.append('files', f));
  if (opts.courseName) fd.append('course_name', opts.courseName);

  let res: Response;
  try {
    res = await fetch(`${API}/upload-pdf`, {
      method:      'POST',
      credentials: 'include',
      body:        fd,
    });
  } catch {
    return { files: [], ok: false, error: 'Network error — could not reach server' };
  }

  if (res.status === 401) {
    window.location.href = '/?login=true';
    return { files: [], ok: false };
  }

  const data: Partial<UploadFileResult> = await res.json().catch(() => ({}));
  const result: UploadFileResult = {
    files:  Array.isArray(data.files) ? data.files : [],
    error:  data.error,
    errors: Array.isArray(data.errors) ? data.errors : undefined,
    ok:     res.ok,
  };
  if (result.errors?.length) {
    // Per-file rejection detail from the backend (e.g. an unsupported
    // extension after filename sanitization) — logged even when other files
    // in the same batch succeeded, so a partial failure isn't silent.
    result.errors.forEach(e => console.log('[uploadAndIndexFile] File rejected by backend:', e));
  }
  if (result.ok) {
    // Wait 1 s before notifying subscribers.  Flask's /upload-pdf returns 200
    // only after the SQLite commit completes, so in practice this delay is
    // conservative — but it guards against any edge-case lag between the HTTP
    // response and the row being fully visible to a concurrent SELECT.
    await new Promise<void>(r => setTimeout(r, 1000));
    eventBus.emit(EVT_DOCUMENTS_UPDATED);
  }
  return result;
}
