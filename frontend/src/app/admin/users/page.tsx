'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../providers/auth';
import AdminShell from '../AdminShell';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:5003';

function authFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: { ...(init.headers as Record<string,string> ?? {}), ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
  });
}

/* ── Types ───────────────────────────────────────────────────────────────────── */
interface CrmUser {
  id:                   number;
  first_name:           string;
  last_name:            string;
  email:                string;
  role:                 string;
  plan_type:            string;
  subscription_end_date:string | null;
  uploads_this_month:   number;
  questions_this_month: number;
  created_at:           string | null;
  session_count:        number;
  message_count:        number;
  document_count:       number;
  last_active?:         string | null;
}

/* ── Mock data (development fallback) ───────────────────────────────────────── */
const MOCK: CrmUser[] = [
  { id:1,  first_name:'שמואל', last_name:'לוי',       email:'shmuel@example.com',   role:'admin',  plan_type:'pro',      subscription_end_date:'2025-09-01', uploads_this_month:4,  questions_this_month:18, created_at:'2024-10-01T09:00:00Z', session_count:34, message_count:210, document_count:12, last_active:'2026-05-31T14:22:00Z' },
  { id:2,  first_name:'דניאל', last_name:'כהן',       email:'daniel@example.com',   role:'user',   plan_type:'basic',    subscription_end_date:null,          uploads_this_month:2,  questions_this_month:9,  created_at:'2025-01-12T11:00:00Z', session_count:8,  message_count:41,  document_count:3,  last_active:'2026-05-30T18:05:00Z' },
  { id:3,  first_name:'מיכל', last_name:'אביב',       email:'michal@example.com',   role:'user',   plan_type:'semester', subscription_end_date:'2026-01-31', uploads_this_month:7,  questions_this_month:55, created_at:'2024-09-15T08:30:00Z', session_count:62, message_count:430, document_count:21, last_active:'2026-06-01T08:11:00Z' },
  { id:4,  first_name:'יונתן',last_name:'שפירא',      email:'yonatan@example.com',  role:'user',   plan_type:'pro',      subscription_end_date:'2026-07-01', uploads_this_month:3,  questions_this_month:22, created_at:'2025-03-20T12:00:00Z', session_count:19, message_count:98,  document_count:8,  last_active:'2026-05-28T22:44:00Z' },
  { id:5,  first_name:'נועה',  last_name:'פרידמן',    email:'noa@example.com',      role:'user',   plan_type:'basic',    subscription_end_date:null,          uploads_this_month:0,  questions_this_month:1,  created_at:'2026-02-10T15:00:00Z', session_count:2,  message_count:7,   document_count:0,  last_active:'2026-03-01T10:00:00Z' },
  { id:6,  first_name:'עידן',  last_name:'גרינברג',   email:'idan@example.com',     role:'user',   plan_type:'semester', subscription_end_date:'2026-02-28', uploads_this_month:5,  questions_this_month:40, created_at:'2025-08-05T09:45:00Z', session_count:47, message_count:318, document_count:15, last_active:'2026-06-01T07:55:00Z' },
  { id:7,  first_name:'תמר',   last_name:'כץ',        email:'tamar@example.com',    role:'user',   plan_type:'basic',    subscription_end_date:null,          uploads_this_month:1,  questions_this_month:4,  created_at:'2026-04-18T14:00:00Z', session_count:5,  message_count:19,  document_count:1,  last_active:'2026-05-22T16:30:00Z' },
  { id:8,  first_name:'אמיר',  last_name:'בן דוד',    email:'amir@example.com',     role:'user',   plan_type:'pro',      subscription_end_date:'2026-08-15', uploads_this_month:6,  questions_this_month:38, created_at:'2025-05-11T10:00:00Z', session_count:28, message_count:195, document_count:10, last_active:'2026-05-29T20:10:00Z' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60)  return 'Just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 2592000) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' });
}
function initials(u: CrmUser) {
  return [u.first_name[0], u.last_name[0]].filter(Boolean).join('').toUpperCase() || '?';
}
function avatarColor(id: number) {
  const PALETTE = ['#517B3E','#3b7bbf','#b45309','#6B4E9B','#2E7D7A','#9B3A4E','#8B5E3C'];
  return PALETTE[id % PALETTE.length];
}

/* ── Sub-components ──────────────────────────────────────────────────────────── */
function RoleBadge({ role }: { role: string }) {
  const admin = role === 'admin';
  return (
    <span style={{
      fontSize:'0.6875rem', fontWeight:700, padding:'2px 8px', borderRadius:99,
      background: admin ? '#1C3329' : '#EEF5F0',
      color:      admin ? '#fff'    : '#527061',
      border:     admin ? 'none'    : '1px solid #D3E0D8',
      letterSpacing: '0.02em',
    }}>
      {admin ? 'Admin' : 'Student'}
    </span>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string, { label:string; bg:string; color:string; border:string }> = {
    pro:      { label:'Pro',      bg:'#517B3E12', color:'#3d6030', border:'#517B3E30' },
    semester: { label:'Semester', bg:'#3b7bbf12', color:'#2a5a8f', border:'#3b7bbf30' },
    basic:    { label:'Basic',    bg:'#9194A118', color:'#555870', border:'#91A1A140' },
  };
  const s = map[plan?.toLowerCase()] ?? map.basic;
  return (
    <span style={{ fontSize:'0.6875rem', fontWeight:700, padding:'2px 8px', borderRadius:99, background:s.bg, color:s.color, border:`1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

function Avatar({ user }: { user: CrmUser }) {
  const bg = avatarColor(user.id);
  return (
    <div style={{ width:32, height:32, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#fff', fontSize:'0.6875rem', fontWeight:800, letterSpacing:'0.02em' }}>
      {initials(user)}
    </div>
  );
}

/* ── Action menu ─────────────────────────────────────────────────────────────── */
type ActionMenuProps = { user: CrmUser; onGiftPro: () => void; onResetLimits: () => void; busy: boolean };
function ActionMenu({ user, onGiftPro, onResetLimits, busy }: ActionMenuProps) {
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const ITEMS = [
    { label: 'View Details',    icon: '👤', action: () => { setOpen(false); alert(`User #${user.id}: ${user.first_name} ${user.last_name}`); } },
    { label: 'Gift Pro Plan',   icon: '⭐', action: () => { setOpen(false); onGiftPro(); } },
    { label: 'Reset Limits',    icon: '↺',  action: () => { setOpen(false); onResetLimits(); } },
    { label: 'Assign Course',   icon: '📚', action: () => { setOpen(false); alert('Coming soon: course assignment UI'); } },
    { label: 'Suspend User',    icon: '🚫', action: () => { setOpen(false); alert('Coming soon: suspend action'); }, danger: true },
  ];

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        disabled={busy}
        style={{
          width:28, height:28, borderRadius:8, border:'1px solid #E8F0EB',
          background: open ? '#EEF5F0' : 'transparent',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          color:'#527061', transition:'background 0.12s',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.background='#EEF5F0'; }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLButtonElement).style.background='transparent'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5"  cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', insetInlineEnd:0, zIndex:50,
          background:'#fff', border:'1px solid #E8F0EB', borderRadius:12,
          boxShadow:'0 8px 32px rgba(28,51,41,0.12)', minWidth:168, overflow:'hidden',
          animation:'fadeIn 0.12s ease',
        }}>
          {ITEMS.map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display:'flex', alignItems:'center', gap:10,
                width:'100%', padding:'9px 14px', background:'transparent',
                border:'none', cursor:'pointer', fontSize:'0.8125rem',
                fontWeight:500, color: item.danger ? '#dc2626' : '#1C3329',
                textAlign:'start', transition:'background 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = item.danger ? '#fee2e210' : '#EEF5F0'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize:'0.875rem' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE
══════════════════════════════════════════════════════════════════════════════ */
export default function AdminUsersPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading, updateToken } = useAuth();

  const [isAdmin,  setIsAdmin]  = useState<boolean | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [users,    setUsers]    = useState<CrmUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [busyRow,  setBusyRow]  = useState<number | null>(null);
  const [toast,    setToast]    = useState<{ msg:string; ok:boolean } | null>(null);

  useEffect(() => { setIsClient(true); }, []);

  /* Admin verification */
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;

  useEffect(() => {
    if (!isClient || authLoading) return;
    let alive = true;
    void (async () => {
      const u = authUserRef.current;
      if (!u) { if (alive) router.replace('/?login=true'); return; }
      try {
        const res = await fetch(`${API}/api/refresh-token`, { credentials: 'include' });
        if (res.ok) {
          if (alive) updateToken();
        }
      } catch { /* backend down — continue with stored token */ }
      if (!alive) return;
      const isAdminFlag = localStorage.getItem('levy_ai_is_admin') === 'true';
      if (!isAdminFlag) { router.replace('/?login=true'); return; }
      if (alive) setIsAdmin(true);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, authLoading]);

  /* Fetch users */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/api/admin/users`);
      if (res.ok) { const d = await res.json() as { users?: CrmUser[] }; setUsers(d.users ?? MOCK); }
      else setUsers(MOCK);
    } catch { setUsers(MOCK); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) fetchUsers(); }, [isAdmin, fetchUsers]);

  /* Toast helper */
  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  /* Actions */
  const handleGiftPro = async (id: number) => {
    setBusyRow(id);
    try {
      const res = await authFetch(`${API}/api/admin/users/${id}/gift-pro`, { method:'PATCH' });
      if (res.ok) { showToast('Pro plan granted ✓', true); await fetchUsers(); }
      else showToast('Failed to grant Pro plan', false);
    } catch { showToast('Network error', false); }
    finally { setBusyRow(null); }
  };

  const handleResetLimits = async (id: number) => {
    setBusyRow(id);
    try {
      const res = await authFetch(`${API}/api/admin/users/${id}/reset-limits`, { method:'POST' });
      if (res.ok) { showToast('Limits reset ✓', true); await fetchUsers(); }
      else showToast('Failed to reset limits', false);
    } catch { showToast('Network error', false); }
    finally { setBusyRow(null); }
  };

  /* Filtered list */
  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter(u =>
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      )
    : users;

  /* ── Early returns ── */
  if (!isClient) return null;

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background:'#97AB92' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-white border-t-transparent animate-spin" />
          <p className="text-sm text-white/80 font-medium">Verifying admin access…</p>
        </div>
      </div>
    );
  }

  /* ── Full render ── */
  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto w-full">
        <div style={{
          background:'rgba(255,255,255,0.90)', backdropFilter:'blur(20px)',
          borderRadius:24, border:'1px solid #E8F0EB',
          boxShadow:'0 4px 24px rgba(28,51,41,0.06)', overflow:'hidden',
        }}>

          {/* ─── Panel header ─── */}
          <div className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap"
            style={{ borderBottom:'1px solid #EEF5F0' }}>
            <div>
              <h1 className="text-2xl font-bold text-[#1A2E26] mb-1">User Management</h1>
              <p className="text-xs text-[#7B9E8F]">
                {loading ? 'Loading users…' : `${filtered.length} of ${users.length} users`}
              </p>
            </div>

            {/* Search */}
            <div style={{ position:'relative', width:280 }}>
              <svg style={{ position:'absolute', insetInlineStart:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}
                width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#8FB3A0" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width:'100%', paddingBlock:8, paddingInlineStart:36, paddingInlineEnd:12,
                  borderRadius:10, border:'1px solid #E8F0EB', background:'#fff',
                  fontSize:'0.8125rem', color:'#1C3329', outline:'none',
                  boxShadow:'0 1px 4px rgba(28,51,41,0.04)',
                  transition:'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor='#517B3E'; e.target.style.boxShadow='0 0 0 3px rgba(81,123,62,0.12)'; }}
                onBlur={e  => { e.target.style.borderColor='#E8F0EB'; e.target.style.boxShadow='0 1px 4px rgba(28,51,41,0.04)'; }}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#517B3E] border-t-transparent animate-spin" />
                <p className="text-sm text-slate-400 font-medium">Loading users…</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span style={{ fontSize:'2.5rem' }}>🔍</span>
              <p style={{ color:'#527061', fontWeight:600, fontSize:'0.9375rem' }}>No users match your search</p>
              <button onClick={() => setSearch('')} style={{ fontSize:'0.8125rem', color:'#517B3E', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
                Clear filter
              </button>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>

                {/* ── Sticky header ── */}
                <thead>
                  <tr style={{
                    position:'sticky', top:0, zIndex:10,
                    background:'rgba(255,255,255,0.96)', backdropFilter:'blur(8px)',
                    borderBottom:'1px solid #E8F0EB',
                  }}>
                    {[
                      { label:'User',             w:'auto' },
                      { label:'Role',             w:100    },
                      { label:'Plan',             w:100    },
                      { label:'Docs',             w:80     },
                      { label:'Sessions',         w:90     },
                      { label:'Last Active',      w:120    },
                      { label:'',                 w:44     },
                    ].map(col => (
                      <th key={col.label} style={{
                        padding:'10px 16px', textAlign:'start',
                        fontSize:'0.6875rem', fontWeight:700, color:'#8FB3A0',
                        textTransform:'uppercase', letterSpacing:'0.08em',
                        whiteSpace:'nowrap', width: col.w === 'auto' ? undefined : col.w,
                      }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* ── Rows ── */}
                <tbody>
                  {filtered.map((user, idx) => (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: idx < filtered.length - 1 ? '1px solid #F0F4F1' : 'none',
                        transition:'background 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(209,230,217,0.18)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                    >
                      {/* User info */}
                      <td style={{ padding:'12px 16px' }}>
                        <div className="flex items-center gap-3">
                          <Avatar user={user} />
                          <div>
                            <p style={{ fontSize:'0.875rem', fontWeight:600, color:'#1C3329', lineHeight:1.3 }}>
                              {user.first_name} {user.last_name}
                            </p>
                            <p style={{ fontSize:'0.75rem', color:'#8FB3A0', marginTop:1 }}>
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td style={{ padding:'12px 16px' }}>
                        <RoleBadge role={user.role} />
                      </td>

                      {/* Plan */}
                      <td style={{ padding:'12px 16px' }}>
                        <PlanBadge plan={user.plan_type} />
                      </td>

                      {/* Docs */}
                      <td style={{ padding:'12px 16px' }}>
                        <div className="flex items-center gap-1.5">
                          <span style={{ fontSize:'0.875rem' }}>📄</span>
                          <span style={{ fontSize:'0.875rem', fontWeight:600, color:'#1C3329' }}>
                            {user.document_count}
                          </span>
                        </div>
                      </td>

                      {/* Sessions */}
                      <td style={{ padding:'12px 16px' }}>
                        <div className="flex items-center gap-1.5">
                          <span style={{ fontSize:'0.875rem' }}>💬</span>
                          <span style={{ fontSize:'0.875rem', fontWeight:600, color:'#1C3329' }}>
                            {user.session_count}
                          </span>
                        </div>
                      </td>

                      {/* Last Active */}
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontSize:'0.8125rem', color:'#527061', whiteSpace:'nowrap' }}>
                          {relTime(user.last_active ?? user.created_at)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding:'12px 16px', textAlign:'end' }}>
                        <ActionMenu
                          user={user}
                          busy={busyRow === user.id}
                          onGiftPro={() => handleGiftPro(user.id)}
                          onResetLimits={() => handleResetLimits(user.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer row */}
          {!loading && filtered.length > 0 && (
            <div style={{
              borderTop:'1px solid #F0F4F1', padding:'10px 16px',
              display:'flex', alignItems:'center', justifyContent:'space-between',
            }}>
              <span style={{ fontSize:'0.75rem', color:'#8FB3A0' }}>
                Showing {filtered.length} user{filtered.length !== 1 ? 's' : ''}
                {q ? ` matching "${q}"` : ''}
              </span>
              <button
                onClick={() => fetchUsers()}
                style={{ fontSize:'0.75rem', color:'#517B3E', background:'none', border:'none', cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color='#3d6030'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color='#517B3E'; }}
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                Refresh
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)',
          zIndex:9999, padding:'10px 22px', borderRadius:12, fontSize:'0.875rem',
          fontWeight:600, color:'white', whiteSpace:'nowrap',
          background: toast.ok ? '#517B3E' : '#dc2626',
          boxShadow:'0 4px 24px rgba(0,0,0,0.18)',
        }}>
          {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}
