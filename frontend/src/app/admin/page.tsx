'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import AiAccountantChat, { type AiAccountantStats } from './AiAccountantChat';
import { useRouter } from 'next/navigation';
import { useAuth } from '../providers/auth';

/*
 * Direct calls to the Flask backend — same pattern as the workspace page.
 * Flask's CORS config already allows localhost:3000, so no proxy is needed.
 * Set NEXT_PUBLIC_API_URL in frontend/.env.local to override the default.
 */
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5003';

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

function authFetch(url: string, init: RequestInit = {}) {
  const token = getToken();
  return fetch(url, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string>) ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
  });
}

/* ── Logo ────────────────────────────────────────────────────────────────────── */
function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#FDFCF8" />
      <rect width="40" height="40" rx="9" stroke="rgba(107,144,74,0.35)" strokeWidth="1.5" fill="none" />
      <path d="M9 7 L9 26 C9 35 31 35 31 26 L31 7 L25 7 L25 26 C25 30 15 30 15 26 L15 7 Z" fill="#6B904A" />
    </svg>
  );
}

/* ── Types ───────────────────────────────────────────────────────────────────── */
interface AdminUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  plan_type: string;
  subscription_end_date: string | null;
  uploads_this_month: number;
  questions_this_month: number;
  created_at: string | null;
  session_count: number;
  message_count: number;
  document_count: number;
}

/* ── CFO Notification types ──────────────────────────────────────────────────── */
interface CfoNotifItem {
  id: number;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  created_at: string | null;
  is_read: boolean;
}

function relTime(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  if (min < 1)  return 'כרגע';
  if (min < 60) return `לפני ${min} דקות`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `לפני ${hr} שעות`;
  return `לפני ${Math.floor(hr / 24)} ימים`;
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/* ── PlanBadge ───────────────────────────────────────────────────────────────── */
function PlanBadge({ plan }: { plan: string | null | undefined }) {
  const styles: Record<string, { label: string; bg: string; color: string; border: string }> = {
    pro:      { label: 'Pro',      bg: '#6B904A18', color: '#3d6030', border: '#6B904A40' },
    semester: { label: 'Semester', bg: '#3d606018', color: '#2d4820', border: '#3d606040' },
    basic:    { label: 'Basic',    bg: '#9194A118', color: '#555870', border: '#91A1A140' },
  };
  const s = styles[plan?.toLowerCase() ?? 'basic'] ?? styles.basic;
  return (
    <span style={{
      fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px',
      borderRadius: 99, background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  );
}

/* ── KpiCard ─────────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 flex items-start gap-4 bg-[#FDFCF8] border border-stone-200"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-[#6B904A]/10 border border-[#6B904A]/20">
        <span className="text-[#6B904A]">{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-black text-slate-800">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5 font-medium">{label}</p>
      </div>
    </div>
  );
}

/* ── Toast ───────────────────────────────────────────────────────────────────── */
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, padding: '10px 22px', borderRadius: 12, fontSize: '0.85rem',
      fontWeight: 600, color: 'white', whiteSpace: 'nowrap',
      background: ok ? '#4a7a36' : '#c0392b',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
    }}>
      {msg}
    </div>
  );
}

/* ── ServerStatus ─────────────────────────────────────────────────────────────
 *
 * Auto-pings Flask /health on mount (direct call — same as the workspace page).
 *
 * STATUS KEY
 *   Flask API      — the URL being called (NEXT_PUBLIC_API_URL or default)
 *   Flask /health  — liveness; red means `python app.py` is not running
 *   Auth Token     — JWT in localStorage; must contain is_admin: true
 */
type PingStatus = 'checking' | 'online' | 'offline';

function ServerStatus({ token }: { token: string | null }) {
  const [ping,   setPing]   = useState<PingStatus>('checking');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        // Direct ping — same CORS origin rules as any other fetch from this page.
        const res  = await fetch(`${API}/health`, { signal: ctrl.signal });
        const body = await res.text();
        if (res.ok) {
          setPing('online');
          setDetail(body.slice(0, 120));
        } else {
          setPing('offline');
          try {
            const j = JSON.parse(body) as { error?: string; description?: string };
            setDetail(j.error ?? j.description ?? `HTTP ${res.status}`);
          } catch {
            setDetail(`HTTP ${res.status}`);
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') return;
        setPing('offline');
        setDetail(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => ctrl.abort();
  }, []);

  const payload    = token ? decodeJwtPayload(token) : null;
  const isAdmin    = Boolean(payload?.is_admin);
  const tokenLabel = !token    ? 'No token — log in first'
                   : isAdmin   ? `Admin ✓  (${String(payload?.email ?? '')})`
                   :             `Non-admin  role: ${String(payload?.role ?? '?')}`;

  const rows: Array<{ label: string; value: string; status: 'ok' | 'warn' | 'err' }> = [
    {
      label:  'Flask API',
      value:  API,
      status: 'ok',
    },
    {
      label:  'Flask  /health',
      value:  ping === 'checking' ? 'Checking…'
            : ping === 'online'   ? `Connected  — ${detail}`
            :                       `Unreachable  — ${detail}`,
      status: ping === 'checking' ? 'warn'
            : ping === 'online'   ? 'ok'
            :                       'err',
    },
    {
      label:  'Auth Token',
      value:  tokenLabel,
      status: !token ? 'err' : isAdmin ? 'ok' : 'warn',
    },
  ];

  const dot: Record<'ok' | 'warn' | 'err', string> = {
    ok:   '#16a34a',
    warn: '#d97706',
    err:  '#dc2626',
  };

  return (
    <div className="mb-8 rounded-2xl overflow-hidden bg-[#FDFCF8] border border-stone-200"
      style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>

      {/* Header row */}
      <div className="px-6 py-3.5 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 0 0 3 3h7.5a3 3 0 0 0 3-3m-13.5 0V11.25m13.5 3V11.25m0 0a3 3 0 0 0-3-3H8.25a3 3 0 0 0-3 3m13.5 0V9a3 3 0 0 0-3-3H8.25a3 3 0 0 0-3 3v2.25" />
          </svg>
          <span className="text-xs font-bold text-slate-700 uppercase tracking-widest">Connection Status</span>
        </div>
        {/* Live indicator */}
        <span className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: ping === 'online' ? '#16a34a' : ping === 'checking' ? '#d97706' : '#dc2626' }}>
          <span className="w-2 h-2 rounded-full inline-block"
            style={{
              background: ping === 'online' ? '#16a34a' : ping === 'checking' ? '#d97706' : '#dc2626',
              boxShadow:  ping === 'online' ? '0 0 0 3px rgba(22,163,74,0.2)' : 'none',
            }} />
          {ping === 'online' ? 'Flask online' : ping === 'checking' ? 'Checking…' : 'Flask offline'}
        </span>
      </div>

      {/* Status rows */}
      <div className="divide-y divide-stone-50">
        {rows.map(r => (
          <div key={r.label} className="px-6 py-3 flex items-start gap-3">
            <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: dot[r.status] }} />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{r.label}</p>
              <p className="text-xs font-mono text-slate-700 break-all">{r.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Offline guidance */}
      {ping === 'offline' && (
        <div className="mx-4 mb-4 mt-1 rounded-xl px-4 py-3 text-xs"
          style={{ background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)', color: '#7f1d1d' }}>
          <p className="font-bold mb-1.5">Flask server is not running. Start it with:</p>
          <code className="block font-mono bg-white/70 rounded-lg px-3 py-2 text-red-800 border border-red-100 select-all">
            source .venv/bin/activate &amp;&amp; python app.py
          </code>
          <p className="mt-2 text-red-700/70">
            Run this in a terminal from the project root (same folder as <code>app.py</code>).
            The server starts on port 5003.
          </p>
        </div>
      )}

    </div>
  );
}

/* ── Constants (mirrors backend — keep in sync with app.py) ──────────────────── */
const BASIC_UPLOAD_LIMIT   = 2;
const BASIC_QUESTION_LIMIT = 15;

/* ═══════════════════════════════════════════════════════════════════════════════
   CfoNotificationBell
═══════════════════════════════════════════════════════════════════════════════ */

function CfoNotificationBell({ onOpenChat }: {
  onOpenChat: (message: string) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [notifs, setNotifs] = useState<CfoNotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/admin/notifications`);
      if (!res.ok) return;
      const data = await res.json() as { notifications?: CfoNotifItem[]; unread_count?: number };
      setNotifs(data.notifications ?? []);
      setUnread(data.unread_count ?? 0);
    } catch { /* silent — Flask not yet running */ }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void fetchNotifs(); }, 0);
    const id = setInterval(() => { void fetchNotifs(); }, 30_000);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [fetchNotifs]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = useCallback(async (id: number) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnread(prev => Math.max(0, prev - 1));
    try { await authFetch(`${API}/api/admin/notifications/${id}/read`, { method: 'POST' }); }
    catch { /* optimistic update — ignore */ }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnread(0);
    try { await authFetch(`${API}/api/admin/notifications/read-all`, { method: 'POST' }); }
    catch { /* optimistic */ }
  }, []);

  const typeAccent = (type: CfoNotifItem['type']) => {
    if (type === 'critical') return { border: '#dc2626', dot: '#dc2626', bg: 'rgba(220,38,38,0.04)' };
    if (type === 'warning')  return { border: '#d97706', dot: '#d97706', bg: 'rgba(217,119,6,0.04)' };
    return                          { border: '#517B3E', dot: '#517B3E', bg: 'rgba(81,123,62,0.04)' };
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* ── Bell button ──────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="CFO financial alerts"
        title="התראות CFO"
        style={{
          position: 'relative', background: 'transparent', border: 'none',
          cursor: 'pointer', padding: 6, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: open ? '#517B3E' : '#64748b', transition: 'color 0.15s',
        }}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 1, right: 1,
            minWidth: 16, height: 16, borderRadius: 99,
            background: '#dc2626', color: 'white',
            fontSize: 9, fontWeight: 800, lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', border: '1.5px solid rgba(245,243,237,0.95)',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ───────────────────────────────────────────────────── */}
      {open && (
        <div
          dir="rtl"
          style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0,
            width: 380, maxHeight: 500,
            background: '#FDFCF8', border: '1px solid #E2DAC8',
            borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            zIndex: 60, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px 12px',
            borderBottom: '1px solid rgba(226,218,200,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(135deg,rgba(81,123,62,0.07) 0%,transparent 100%)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 800, color: '#517B3E',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                התראות CFO
              </span>
              {unread > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                  background: 'rgba(220,38,38,0.1)', color: '#dc2626',
                  border: '1px solid rgba(220,38,38,0.2)',
                }}>
                  {unread} חדשות
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={() => { void markAllRead(); }}
                style={{
                  fontSize: 11, fontWeight: 600, color: '#517B3E',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '2px 6px', borderRadius: 6,
                }}
              >
                סמן הכל כנקרא
              </button>
            )}
          </div>

          {/* Notification list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifs.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(81,123,62,0.07)', border: '1px solid rgba(81,123,62,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24"
                    stroke="#517B3E" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <p style={{ fontWeight: 600, color: '#64748b', fontSize: 13, marginBottom: 4 }}>הכל תקין!</p>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>אין התראות פיננסיות כרגע</p>
              </div>
            ) : notifs.map(n => {
              const acc = typeAccent(n.type);
              return (
                <div
                  key={n.id}
                  onClick={() => { if (!n.is_read) void markRead(n.id); }}
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid rgba(226,218,200,0.4)',
                    borderRight: `3px solid ${acc.border}`,
                    background: n.is_read ? 'transparent' : acc.bg,
                    cursor: 'default', transition: 'background 0.15s',
                  }}
                >
                  {/* Title row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                      background: n.is_read ? '#cbd5e1' : acc.dot,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 12, fontWeight: n.is_read ? 600 : 700,
                        color: n.is_read ? '#64748b' : '#1e293b',
                        lineHeight: 1.4, marginBottom: 4, margin: '0 0 4px',
                      }}>
                        {n.title}
                      </p>
                      <p style={{
                        fontSize: 11, color: '#64748b', lineHeight: 1.5,
                        margin: 0, maxHeight: '3.3em', overflow: 'hidden',
                      }}>
                        {n.message}
                      </p>
                    </div>
                  </div>

                  {/* Footer: timestamp + open-chat CTA */}
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', paddingRight: 15, marginTop: 6,
                  }}>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>
                      {relTime(n.created_at)}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (!n.is_read) void markRead(n.id);
                        onOpenChat(
                          `דוח התראת CFO — ${n.title}\n\n${n.message}\n\nאנא נתח התראה זו ותן המלצות קונקרטיות לטיפול.`,
                        );
                        setOpen(false);
                      }}
                      style={{
                        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                        color: '#517B3E', background: 'rgba(81,123,62,0.09)',
                        border: '1px solid rgba(81,123,62,0.22)',
                        borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                      }}
                    >
                      פתח צ׳אט עם הרואה חשבון
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {notifs.length > 0 && (
            <div style={{
              padding: '10px 16px', flexShrink: 0,
              borderTop: '1px solid rgba(226,218,200,0.6)',
              background: 'rgba(245,243,237,0.6)',
              fontSize: 10, color: '#94a3b8', textAlign: 'center',
            }}>
              {notifs.length} התראות · מתרענן אוטומטית כל 30 שניות
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Admin Page
═══════════════════════════════════════════════════════════════════════════════ */
export default function AdminPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading, updateToken } = useAuth();

  /* All useState calls first — before any early return */
  const [isClient, setIsClient] = useState(false);
  const [isAdmin,  setIsAdmin]  = useState<boolean | null>(null);

  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const [search,   setSearch]   = useState('');
  const [toast,    setToast]    = useState<{ msg: string; ok: boolean } | null>(null);
  const [busyRow,  setBusyRow]  = useState<number | null>(null);
  const [chatPreload, setChatPreload] = useState('');

  const chatSectionRef = useRef<HTMLDivElement>(null);

  /* ── Callbacks ─────────────────────────────────────────────────────────── */
  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (typeof window !== 'undefined' && !window.navigator.onLine) {
        throw new Error('No internet connection.');
      }
      const res = await authFetch(`${API}/api/admin/users`);
      if (!res.ok) {
        const body = await res.text();
        let msg = `HTTP ${res.status}`;
        try {
          const j = JSON.parse(body) as { error?: string; description?: string; message?: string };
          msg = j.error ?? j.description ?? j.message ?? msg;
        } catch { msg = body.slice(0, 200) || msg; }
        if (res.status === 404) msg = `Route not found — restart Flask with the latest app.py\n(${msg})`;
        if (res.status === 401) msg = 'Authentication required. Log out and log back in.';
        if (res.status === 403) msg = 'Admin access denied. Run: python scripts/make_admin.py <email>';
        throw new Error(msg);
      }
      const data = await res.json() as { users?: AdminUser[] };
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGiftPro = useCallback(async (userId: number) => {
    setBusyRow(userId);
    try {
      const res = await authFetch(`${API}/api/admin/users/${userId}/gift-pro`, { method: 'PATCH' });
      if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status} — ${t}`); }
      showToast('Pro access granted for 30 days');
      void fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', false);
    } finally { setBusyRow(null); }
  }, [showToast, fetchUsers]);

  const handleGiftSemester = useCallback(async (userId: number) => {
    setBusyRow(userId);
    try {
      const res = await authFetch(`${API}/api/admin/users/${userId}/gift-semester`, { method: 'PATCH' });
      if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status} — ${t}`); }
      showToast('Semester access granted for 120 days');
      void fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', false);
    } finally { setBusyRow(null); }
  }, [showToast, fetchUsers]);

  const handleResetLimits = useCallback(async (userId: number) => {
    setBusyRow(userId);
    try {
      const res = await authFetch(`${API}/api/admin/users/${userId}/reset-limits`, { method: 'POST' });
      if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status} — ${t}`); }
      showToast('Usage limits reset');
      void fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', false);
    } finally { setBusyRow(null); }
  }, [showToast, fetchUsers]);

  const handleRefreshToken = useCallback(async () => {
    const token = getToken();
    if (!token) { showToast('Not logged in', false); return; }
    try {
      const res = await fetch(`${API}/api/refresh-token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { showToast(`Token refresh failed: HTTP ${res.status}`, false); return; }
      const data = await res.json() as { token?: string };
      if (!data.token) { showToast('No token in response', false); return; }
      localStorage.setItem('levy_ai_token', data.token);
      const payload = decodeJwtPayload(data.token);
      if (payload?.is_admin) {
        showToast('Admin token refreshed successfully');
        setIsAdmin(true);
        void fetchUsers();
      } else {
        showToast(
          `Role is "${String(payload?.role ?? '?')}" — run: python scripts/make_admin.py`,
          false,
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error', false);
    }
  }, [showToast, fetchUsers]);

  const handleOpenChatFromAlert = useCallback((message: string) => {
    setChatPreload(message);
    requestAnimationFrame(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  /* ── useMemo (before early returns) ────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q)  ||
      u.email.toLowerCase().includes(q),
    );
  }, [search, users]);

  const kpi = useMemo(() => ({
    total:    users.length,
    active:   users.filter(u => u.session_count > 0).length,
    paid:     users.filter(u => u.plan_type !== 'basic').length,
    messages: users.reduce((s, u) => s + u.message_count, 0),
  }), [users]);

  /* ── Effects ────────────────────────────────────────────────────────────── */
  /* 1. Flip isClient on the first client-side tick — kills hydration mismatch */
  useEffect(() => {
    Promise.resolve().then(() => setIsClient(true));
  }, []);

  /* 2. Silent token refresh + admin guard
   *
   * Waits for both the isClient flip AND the AuthProvider to finish reading
   * localStorage (authLoading=false) before running.  Uses a `mounted` flag
   * to cancel the async tail if the user navigates away before the token
   * refresh completes — the previous race condition that caused stale
   * router.replace calls after navigation.
   *
   * After a successful refresh, `updateToken` syncs the global context so
   * any other mounted page (workspace, profile) immediately sees the fresh token.
   *
   * authUser is intentionally read via ref inside the async IIFE — capturing it
   * at call-time prevents a dep-array loop when updateToken changes authUser.
   */
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;

  useEffect(() => {
    if (!isClient || authLoading) return;
    let mounted = true;
    void (async () => {
      const currentAuthUser = authUserRef.current;

      // Context says there is no valid session — no point refreshing.
      if (!currentAuthUser) {
        if (mounted) router.replace('/?login=true');
        return;
      }

      // Attempt a silent token refresh using the token the context already has.
      const stored = currentAuthUser.token;
      try {
        const res = await fetch(`${API}/api/refresh-token`, {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (res.ok) {
          const data = await res.json() as { token?: string };
          if (data.token && mounted) {
            localStorage.setItem('levy_ai_token', data.token);
            updateToken(data.token); // keep global context in sync
          }
        }
      } catch { /* server not yet up — fall back to stored token */ }

      // Guard navigated away before the async refresh completed — do nothing.
      if (!mounted) return;

      const latest  = localStorage.getItem('levy_ai_token');
      const payload = latest ? decodeJwtPayload(latest) : null;
      if (!payload || (!payload.is_admin && payload.role !== 'admin')) {
        router.replace('/?login=true');
        return;
      }
      setIsAdmin(true);
    })();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, authLoading, router, updateToken]);

  /* 3. Load real users once admin is confirmed */
  useEffect(() => {
    if (isAdmin) void fetchUsers();
  }, [isAdmin, fetchUsers]);

  /* ── Early returns (after ALL hooks) ───────────────────────────────────── */
  if (!isClient) return null;   // prevents hydration mismatch

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-[#F5F3ED] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#6B904A] border-t-transparent animate-spin" />
          <p className="text-sm text-slate-500">Verifying access…</p>
        </div>
      </div>
    );
  }

  const currentToken = getToken();

  /* ── Main render ────────────────────────────────────────────────────────── */
  return (
    <div dir="ltr" className="min-h-screen bg-[#F5F3ED] relative overflow-hidden">

      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div style={{
          position: 'absolute', top: '-10%', right: '-8%', width: 520, height: 520,
          borderRadius: '50%', background: 'rgba(107,144,74,0.055)', filter: 'blur(130px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-8%', left: '-4%', width: 400, height: 400,
          borderRadius: '50%', background: 'rgba(180,160,120,0.045)', filter: 'blur(110px)',
        }} />
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-8 py-4"
        style={{
          background: 'rgba(245,243,237,0.92)', backdropFilter: 'blur(18px)',
          borderBottom: '1px solid #E2DAC8', boxShadow: '0 1px 10px rgba(0,0,0,0.05)',
        }}>
        <div className="flex items-center gap-3">
          <LogoMark size={30} />
          <div>
            <span className="text-slate-900 font-bold text-sm tracking-tight">U-Note</span>
            <span className="text-slate-400 text-xs ms-2">· Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {isAdmin && <CfoNotificationBell onOpenChat={handleOpenChatFromAlert} />}
          <button onClick={handleRefreshToken}
            className="text-xs font-semibold text-[#6B904A] hover:text-[#4a7a36] transition-colors">
            Sync Admin Token
          </button>
          <button
            type="button"
            onClick={e => { e.preventDefault(); router.push('/workspace'); }}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to app
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="relative z-10 max-w-7xl mx-auto px-8 py-10">

        {/* Page heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">User Management</h1>
          <p className="text-slate-500 text-sm mt-1">All registered users · plan types · usage limits</p>
        </div>

        {/* ── Connection Status (always visible — shows live Flask health) ─── */}
        <ServerStatus token={currentToken} />

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <KpiCard label="Total Users"    value={kpi.total}    icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          } />
          <KpiCard label="Active Users"   value={kpi.active}   icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
          } />
          <KpiCard label="Pro / Semester" value={kpi.paid}     icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
            </svg>
          } />
          <KpiCard label="Total AI Msgs"  value={kpi.messages} icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          } />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400 text-sm">
            <div className="w-5 h-5 rounded-full border-2 border-[#6B904A] border-t-transparent animate-spin" />
            Loading users…
          </div>
        )}

        {/* Fetch error */}
        {!loading && error && (
          <div className="mb-6 rounded-2xl border border-red-100 overflow-hidden"
            style={{ background: '#FFF8F8', boxShadow: '0 2px 12px rgba(220,38,38,0.06)' }}>
            <div className="px-6 py-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
                style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.15)' }}>
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24"
                  stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-700 mb-1">Failed to load users</p>
                <p className="text-xs text-red-500 font-mono break-all">{error}</p>
                <p className="text-xs text-red-400 mt-2">
                  Check the Connection Status panel above — the Flask server must be running.
                </p>
              </div>
              <button onClick={fetchUsers}
                className="shrink-0 text-xs font-semibold px-4 py-2 rounded-xl text-white
                           transition-opacity hover:opacity-85"
                style={{ background: '#dc2626' }}>
                Retry
              </button>
            </div>
          </div>
        )}

        {/* ── AI Accountant ──────────────────────────────────────────────────── */}
        {isAdmin && (
          <div ref={chatSectionRef} className="mb-10">
            <div className="mb-5">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">רואה חשבון AI</h2>
              <p className="text-slate-500 text-sm mt-1">
                ייעוץ פיננסי, דוחות ותחזיות — מבוסס נתוני המערכת בזמן אמת
              </p>
            </div>
            <AiAccountantChat
              api={API}
              preloadMessage={chatPreload}
              onPreloadConsumed={() => setChatPreload('')}
              stats={
                {
                  report_date:    new Date().toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' }),
                  total_users:    kpi.total,
                  plan_breakdown: {
                    basic:    users.filter(u => u.plan_type === 'basic').length,
                    pro:      users.filter(u => u.plan_type === 'pro').length,
                    semester: users.filter(u => u.plan_type === 'semester').length,
                  },
                  active_users:    kpi.active,
                  total_messages:  kpi.messages,
                  total_sessions:  users.reduce((s, u) => s + u.session_count, 0),
                } satisfies AiAccountantStats
              }
            />
          </div>
        )}

        {/* User table */}
        {!loading && (
          <div className="rounded-2xl overflow-hidden bg-[#FDFCF8] border border-stone-200"
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

            {/* Toolbar */}
            <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-stone-100">
              <div className="relative max-w-xs w-full">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input type="text" placeholder="Search by name or email…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm text-slate-700 placeholder-stone-400
                             outline-none rounded-xl bg-stone-50 border border-stone-200 transition-shadow"
                  onFocus={e => { e.target.style.borderColor = '#6B904A'; e.target.style.boxShadow = '0 0 0 3px rgba(107,144,74,0.12)'; }}
                  onBlur={e  => { e.target.style.borderColor = '#E7E5E4'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-slate-400">
                  {filtered.length === users.length
                    ? `${users.length} user${users.length !== 1 ? 's' : ''}`
                    : `${filtered.length} / ${users.length}`}
                </span>
                <button onClick={fetchUsers} disabled={loading}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors
                             disabled:opacity-40 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Refresh
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50/70">
                    {['Name', 'Email', 'Plan', 'Sub Ends', 'Usage this month', 'Joined', 'Actions'].map(h => (
                      <th key={h}
                        className="px-5 py-3 text-left text-[11px] font-semibold uppercase
                                   tracking-widest text-slate-400 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Empty — no users */}
                  {!error && users.length === 0 && (
                    <tr><td colSpan={7}>
                      <div className="flex flex-col items-center gap-4 py-20 text-center">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                          style={{ background: 'rgba(107,144,74,0.07)', border: '1px solid rgba(107,144,74,0.12)' }}>
                          <svg className="w-7 h-7 text-[#6B904A]/50" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-600 text-sm">No users yet</p>
                          <p className="text-xs text-slate-400 mt-1">Registered users will appear here automatically</p>
                        </div>
                      </div>
                    </td></tr>
                  )}

                  {/* Empty — search */}
                  {filtered.length === 0 && search && !error && (
                    <tr><td colSpan={7}>
                      <div className="flex flex-col items-center gap-4 py-20 text-center">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-stone-100 border border-stone-200">
                          <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24"
                            stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-600 text-sm">No results for &ldquo;{search}&rdquo;</p>
                          <p className="text-xs text-slate-400 mt-1">Try a different name or email</p>
                        </div>
                      </div>
                    </td></tr>
                  )}

                  {/* User rows */}
                  {filtered.map((user, idx) => (
                    <tr key={user.id}
                      className="transition-colors"
                      style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #F5F3ED' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#FAFAF7')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                      {/* Name */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center
                                          text-white text-xs font-black"
                            style={{ background: '#6B904A' }}>
                            {(user.first_name[0] ?? '?').toUpperCase()}
                            {(user.last_name[0]  ?? '').toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 whitespace-nowrap text-sm">
                              {user.first_name} {user.last_name}
                            </p>
                            {user.role === 'admin' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full
                                               bg-[#6B904A]/10 text-[#6B904A] border border-[#6B904A]/20">
                                Admin
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-4 text-slate-500 text-xs font-mono">{user.email}</td>

                      {/* Plan */}
                      <td className="px-5 py-4"><PlanBadge plan={user.plan_type} /></td>

                      {/* Sub end */}
                      <td className="px-5 py-4 text-slate-500 text-xs whitespace-nowrap">
                        {formatDate(user.subscription_end_date)}
                      </td>

                      {/* Usage */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1 text-xs text-slate-500">
                          <span>
                            📄{' '}
                            <b className={
                              user.plan_type === 'basic' && user.uploads_this_month >= BASIC_UPLOAD_LIMIT
                                ? 'text-red-500' : 'text-slate-700'
                            }>
                              {user.uploads_this_month}
                            </b>
                            {user.plan_type === 'basic' ? ` / ${BASIC_UPLOAD_LIMIT} uploads` : ' uploads'}
                          </span>
                          <span>
                            💬{' '}
                            <b className={
                              user.plan_type === 'basic' && user.questions_this_month >= BASIC_QUESTION_LIMIT
                                ? 'text-red-500' : 'text-slate-700'
                            }>
                              {user.questions_this_month}
                            </b>
                            {user.plan_type === 'basic' ? ` / ${BASIC_QUESTION_LIMIT} questions` : ' questions'}
                          </span>
                        </div>
                      </td>

                      {/* Joined */}
                      <td className="px-5 py-4 text-slate-500 text-xs whitespace-nowrap">
                        {formatDate(user.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleGiftPro(user.id)} disabled={busyRow === user.id}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap
                                       transition-opacity hover:opacity-80 disabled:opacity-40"
                            style={{ background: '#6B904A12', color: '#4a7a36', border: '1px solid #6B904A30', cursor: 'pointer' }}>
                            {busyRow === user.id ? '…' : '⭐ Gift Pro'}
                          </button>
                          <button onClick={() => handleGiftSemester(user.id)} disabled={busyRow === user.id}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap
                                       transition-opacity hover:opacity-80 disabled:opacity-40"
                            style={{ background: '#2d482012', color: '#2d4820', border: '1px solid #2d482030', cursor: 'pointer' }}>
                            {busyRow === user.id ? '…' : '🎓 Gift Sem'}
                          </button>
                          <button onClick={() => handleResetLimits(user.id)} disabled={busyRow === user.id}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap
                                       transition-opacity hover:opacity-80 disabled:opacity-40"
                            style={{ background: 'transparent', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                            {busyRow === user.id ? '…' : '↺ Reset'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
}
