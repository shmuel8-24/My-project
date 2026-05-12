'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const API = 'http://127.0.0.1:5003';

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#FDFCF8"/>
      <rect width="40" height="40" rx="9" stroke="rgba(107,144,74,0.35)" strokeWidth="1.5" fill="none"/>
      <path d="M9 7 L9 26 C9 35 31 35 31 26 L31 7 L25 7 L25 26 C25 30 15 30 15 26 L15 7 Z" fill="#6B904A"/>
    </svg>
  );
}

interface AdminUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  created_at: string | null;
  session_count: number;
  message_count: number;
  document_count: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── KPI card ─────────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, icon }: {
  label: string; value: number | string; icon: React.ReactNode;
}) {
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

export default function AdminPage() {
  const router  = useRouter();
  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    const token = localStorage.getItem('levy_ai_token');
    if (!token) { router.replace('/login'); return; }
    fetch(`${API}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (res.status === 401) { router.replace('/login'); return; }
        if (res.status === 403) { router.replace('/');      return; }
        if (!res.ok) { setError('Failed to load users.'); setLoading(false); return; }
        const data = await res.json();
        setUsers(data.users ?? []); setLoading(false);
      })
      .catch(() => { setError('Cannot connect to server.'); setLoading(false); });
  }, [router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q)  ||
      u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const totalMessages = useMemo(() => users.reduce((s, u) => s + u.message_count, 0), [users]);
  const adminCount    = useMemo(() => users.filter(u => u.role === 'admin').length,   [users]);
  const activeUsers   = useMemo(() => users.filter(u => u.session_count > 0).length,  [users]);

  return (
    <div dir="ltr" className="min-h-screen bg-[#F5F3ED] relative overflow-hidden">

      {/* Soft ambient blobs */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div style={{ position: 'absolute', top: '-10%', right: '-8%', width: 480, height: 480,
          borderRadius: '50%', background: 'rgba(107,144,74,0.06)', filter: 'blur(120px)' }} />
        <div style={{ position: 'absolute', bottom: '-8%', left: '-4%', width: 380, height: 380,
          borderRadius: '50%', background: 'rgba(180,160,120,0.05)', filter: 'blur(100px)' }} />
      </div>

      {/* Sticky header */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-8 py-4"
        style={{
          background: 'rgba(245,243,237,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid #E2DAC8',
          boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
        }}>
        <div className="flex items-center gap-3">
          <LogoMark size={30} />
          <div>
            <span className="text-slate-900 font-bold text-sm">U-Note</span>
            <span className="text-slate-400 text-xs ms-2">· Admin</span>
          </div>
        </div>
        <button onClick={() => router.push('/')}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to app
        </button>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-8 py-8">

        {/* Page heading */}
        <div className="mb-8">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">User Management</h2>
          <p className="text-slate-500 text-sm mt-1">All registered users on the U-Note platform</p>
        </div>

        {/* KPI cards */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <KpiCard label="Total Users"    value={users.length}    icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>} />
            <KpiCard label="Active Users"   value={activeUsers}     icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>} />
            <KpiCard label="Total Messages" value={totalMessages}   icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>} />
            <KpiCard label="Admins"         value={adminCount}      icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>} />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-slate-400 gap-3">
            <span className="w-5 h-5 rounded-full border-2 border-stone-200 border-t-[#6B904A] animate-spin" />
            Loading users…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl px-5 py-4 text-sm flex items-center gap-3 text-red-700 bg-red-50 border border-red-200">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374l7.5-12.999c.866-1.5 3.032-1.5 3.898 0l7.206 12.999ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}

        {/* Table card */}
        {!loading && !error && (
          <div className="rounded-2xl overflow-hidden bg-[#FDFCF8] border border-stone-200"
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>

            {/* Search bar */}
            <div className="px-6 py-4 flex items-center justify-between gap-4 border-b border-stone-100">
              <div className="relative max-w-xs w-full">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input type="text" placeholder="Search by name or email…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm text-slate-700 placeholder-stone-400 outline-none rounded-xl transition-all bg-stone-50 border border-stone-200"
                  onFocus={e => { e.target.style.borderColor = '#6B904A'; e.target.style.boxShadow = '0 0 0 3px rgba(107,144,74,0.1)'; }}
                  onBlur={e  => { e.target.style.borderColor = '#E7E5E4'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {filtered.length === users.length ? `${users.length} users` : `${filtered.length} / ${users.length}`}
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    {['Name', 'Email', 'Joined', 'Activity', 'Actions'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-slate-400 text-sm">
                        {search ? 'No users match your search.' : 'No users found.'}
                      </td>
                    </tr>
                  )}
                  {filtered.map((user, idx) => (
                    <tr key={user.id}
                      className="transition-colors"
                      style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #F5F3ED' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#FAFAF8')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                      {/* Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black"
                            style={{ background: '#6B904A' }}>
                            {(user.first_name[0] ?? '?').toUpperCase()}
                            {(user.last_name[0]  ?? '').toUpperCase()}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800">
                              {user.first_name} {user.last_name}
                            </span>
                            {user.role === 'admin' && (
                              <span className="ms-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#6B904A]/10 text-[#6B904A] border border-[#6B904A]/20">Admin</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-6 py-4 text-slate-500 text-xs font-mono">{user.email}</td>

                      {/* Joined */}
                      <td className="px-6 py-4 text-slate-500 text-sm whitespace-nowrap">{formatDate(user.created_at)}</td>

                      {/* Activity (message count bar) */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden max-w-[80px] bg-stone-100">
                            <div className="h-full rounded-full"
                              style={{
                                width: `${Math.min(100, (user.message_count / Math.max(...filtered.map(u => u.message_count), 1)) * 100)}%`,
                                background: '#6B904A',
                              }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-400">{user.message_count}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <button
                          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all text-slate-500 border border-stone-200 hover:border-[#6B904A]/40 hover:text-[#6B904A]"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
