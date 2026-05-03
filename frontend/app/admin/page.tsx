'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const API = 'http://127.0.0.1:5003';

interface AdminUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string | null;
  session_count: number;
  message_count: number;
  document_count: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function PlanBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
      Free
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
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
        setUsers(data.users ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError('Cannot connect to server. Make sure the backend is running on port 5003.');
        setLoading(false);
      });
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

  const totalMessages  = useMemo(() => users.reduce((s, u) => s + u.message_count, 0), [users]);
  const totalDocuments = useMemo(() => users.reduce((s, u) => s + u.document_count, 0), [users]);

  return (
    <div dir="ltr" className="min-h-screen bg-slate-50">

      {/* Top bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Minimal U-Note wordmark in admin (keep muted) */}
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center">
            <span className="text-sm font-black text-slate-300">U</span>
          </div>
          <div>
            <h1 className="text-white font-semibold text-sm leading-tight">U-Note</h1>
            <p className="text-slate-500 text-xs">Admin · CRM Dashboard</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/')}
          className="text-slate-400 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to app
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8">

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">User Management</h2>
          <p className="text-slate-500 text-sm mt-0.5">All registered users on the U-Note platform</p>
        </div>

        {/* Stats */}
        {!loading && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <Stat label="Total Users"     value={users.length}   />
            <Stat label="Free Plan"       value={users.length}   />
            <Stat label="Total Messages"  value={totalMessages}  />
            <Stat label="Total Documents" value={totalDocuments} />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24 text-slate-400 gap-3">
            <span className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
            Loading users…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            {error}
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">

            {/* Search + count */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
              <div className="relative max-w-xs w-full">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
                />
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {filtered.length === users.length
                  ? `${users.length} user${users.length !== 1 ? 's' : ''}`
                  : `${filtered.length} of ${users.length}`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Subscription</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Token Usage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-slate-400">
                        {search ? 'No users match your search.' : 'No users found.'}
                      </td>
                    </tr>
                  )}
                  {filtered.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">

                      {/* Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-indigo-600">
                              {(user.first_name[0] ?? '?').toUpperCase()}
                              {(user.last_name[0]  ?? '').toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-slate-800">
                            {user.first_name} {user.last_name}
                          </span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                        {user.email}
                      </td>

                      {/* Joined */}
                      <td className="px-6 py-4 text-slate-500 text-sm whitespace-nowrap">
                        {formatDate(user.created_at)}
                      </td>

                      {/* Subscription */}
                      <td className="px-6 py-4 text-center">
                        <PlanBadge />
                      </td>

                      {/* Token Usage (messages as proxy) */}
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-0.5 rounded-md text-xs font-semibold bg-violet-50 text-violet-600">
                          {user.message_count}
                        </span>
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
