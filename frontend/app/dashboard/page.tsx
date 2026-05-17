'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  FileText, MessageSquare, BookOpen, Users, ArrowLeft, LayoutDashboard,
} from 'lucide-react';

const API = 'http://127.0.0.1:5003';

/* ─── Auth helpers (same pattern as workspace/page.tsx) ─────────────────────── */
function getToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('levy_ai_token') : null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (token) {
    const p = decodeJwtPayload(token);
    if (p?.exp && (p.exp as number) * 1000 < Date.now()) {
      localStorage.removeItem('levy_ai_token');
      window.location.href = '/?login=true';
      return new Response(null, { status: 401 });
    }
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string>) ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('levy_ai_token');
    window.location.href = '/?login=true';
  }
  return res;
}

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface ActivityDay { date: string; messages: number }
interface Stats {
  documents:        number;
  sessions:         number;
  messages:         number;
  activity:         ActivityDay[];
  is_admin:         boolean;
  total_users?:     number;
  total_docs?:      number;
  total_messages?:  number;
  global_activity?: ActivityDay[];
}

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function fmtDay(d: string): string {
  const [, mm, dd] = d.split('-');
  return `${parseInt(mm)}/${parseInt(dd)}`;
}

/* ─── Sub-components ─────────────────────────────────────────────────────────── */
function KpiCard({ icon, label, value, bg, fg }: {
  icon: React.ReactNode; label: string; value: number; bg: string; fg: string;
}) {
  return (
    <div className="rounded-2xl p-5 flex items-center gap-4"
      style={{
        background: 'rgba(255,255,255,0.88)',
        border: '1px solid rgba(157,192,139,0.28)',
        boxShadow: '0 2px 12px rgba(60,90,40,0.06)',
      }}>
      <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: bg }}>
        <span style={{ color: fg }}>{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-tight" style={{ color: '#1a2e14' }}>{value.toLocaleString()}</p>
        <p className="text-xs mt-0.5 leading-tight" style={{ color: '#7a9268' }}>{label}</p>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="h-24 rounded-2xl animate-pulse"
      style={{ background: 'rgba(157,192,139,0.18)' }} />
  );
}

function ChartCard({ title, data, barColor, noActivity }: {
  title: string; data: ActivityDay[]; barColor: string; noActivity: string;
}) {
  const hasData = data.some(d => d.messages > 0);
  return (
    <div className="rounded-2xl p-6"
      style={{
        background: 'rgba(255,255,255,0.88)',
        border: '1px solid rgba(157,192,139,0.28)',
        boxShadow: '0 2px 12px rgba(60,90,40,0.06)',
      }}>
      <h2 className="text-sm font-semibold mb-5" style={{ color: '#2A3B22' }}>{title}</h2>
      {hasData ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(157,192,139,0.25)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDay}
              tick={{ fontSize: 11, fill: '#7a9268' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: '#7a9268' }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip
              cursor={{ fill: 'rgba(157,192,139,0.12)' }}
              contentStyle={{
                border: '1px solid rgba(157,192,139,0.3)',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.97)',
                fontSize: 13,
                boxShadow: '0 4px 16px rgba(60,90,40,0.08)',
              }}
              labelStyle={{ color: '#2A3B22', fontWeight: 600 }}
              labelFormatter={(d: unknown) => typeof d === 'string' ? fmtDay(d) : String(d)}
            />
            <Bar dataKey="messages" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[220px] text-sm" style={{ color: '#7a9268' }}>
          {noActivity}
        </div>
      )}
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();

  const [lang] = useState<'he' | 'en'>(() =>
    typeof window !== 'undefined' && localStorage.getItem('levy_ai_lang') === 'en' ? 'en' : 'he'
  );
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  // Prevent recharts SSR: render charts only after client mount
  const [mounted, setMounted] = useState(false);

  const t = lang === 'he'
    ? {
        title:          'לוח מחוונים',
        docs:           'מסמכים שהועלו',
        sessions:       'שיחות',
        messages:       'הודעות שנשלחו',
        activity7:      'פעילות אישית — 7 ימים אחרונים',
        systemActivity: 'פעילות מערכת — 7 ימים אחרונים',
        back:           'חזרה ל-Workspace',
        adminBadge:     'Admin',
        totalUsers:     'סה"כ משתמשים',
        totalDocs:      'סה"כ מסמכים',
        totalMsgs:      'סה"כ הודעות',
        noActivity:     'אין עדיין פעילות',
        error:          'שגיאה בטעינת הנתונים',
      }
    : {
        title:          'Dashboard',
        docs:           'Documents Uploaded',
        sessions:       'Chat Sessions',
        messages:       'Messages Sent',
        activity7:      'My Activity — Last 7 Days',
        systemActivity: 'System Activity — Last 7 Days',
        back:           'Back to Workspace',
        adminBadge:     'Admin',
        totalUsers:     'Total Users',
        totalDocs:      'Total Documents',
        totalMsgs:      'Total Messages',
        noActivity:     'No activity yet',
        error:          'Failed to load statistics',
      };

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace('/?login=true'); return; }
    const p = decodeJwtPayload(token);
    if (p?.exp && (p.exp as number) * 1000 < Date.now()) {
      localStorage.removeItem('levy_ai_token');
      router.replace('/?login=true');
      return;
    }

    authFetch(`${API}/api/stats`)
      .then(async r => {
        if (!r.ok) { setError(t.error); return; }
        setStats(await r.json() as Stats);
      })
      .catch(() => setError(t.error))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <div className="min-h-screen" dir={lang === 'he' ? 'rtl' : 'ltr'}
      style={{ backgroundColor: '#F7F5EF' }}>

      {/* Subtle organic background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10" aria-hidden="true">
        <div className="absolute" style={{
          top: '-8%', right: '-6%', width: '48%', height: '55%',
          background: 'radial-gradient(ellipse at 60% 40%, rgba(157,192,139,0.22) 0%, transparent 70%)',
          borderRadius: '40% 60% 60% 40% / 40% 40% 60% 60%',
        }} />
        <div className="absolute" style={{
          bottom: '-10%', left: '-8%', width: '50%', height: '60%',
          background: 'radial-gradient(ellipse at 40% 60%, rgba(81,123,62,0.11) 0%, transparent 70%)',
          borderRadius: '60% 40% 40% 60% / 60% 60% 40% 40%',
        }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 px-4 py-3 flex items-center gap-3"
        style={{
          background: 'rgba(157,192,139,0.97)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(80,110,60,0.25)',
        }}>
        <img src="/logo.PNG" alt="U-Note" style={{ height: 32, width: 'auto', objectFit: 'contain' }} />

        <button
          onClick={() => router.push('/workspace')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all hover:bg-black/10"
          style={{ color: '#1a2e14' }}>
          <ArrowLeft className="w-4 h-4" />
          {t.back}
        </button>

        <span className="flex-1" />

        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5" style={{ color: '#1a2e14' }} />
          <span className="font-bold" style={{ color: '#1a2e14' }}>{t.title}</span>
        </div>

        {!loading && stats?.is_admin && (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold text-white"
            style={{ background: '#517B3E' }}>
            {t.adminBadge}
          </span>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {error && (
          <p className="text-center text-sm py-8" style={{ color: '#dc2626' }}>{error}</p>
        )}

        {/* Personal KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loading ? (
            <><Skeleton /><Skeleton /><Skeleton /></>
          ) : stats ? (
            <>
              <KpiCard
                icon={<FileText className="w-6 h-6" />}
                label={t.docs}
                value={stats.documents}
                bg="rgba(81,123,62,0.12)"
                fg="#517B3E"
              />
              <KpiCard
                icon={<BookOpen className="w-6 h-6" />}
                label={t.sessions}
                value={stats.sessions}
                bg="rgba(59,123,191,0.12)"
                fg="#3b7bbf"
              />
              <KpiCard
                icon={<MessageSquare className="w-6 h-6" />}
                label={t.messages}
                value={stats.messages}
                bg="rgba(180,83,9,0.10)"
                fg="#b45309"
              />
            </>
          ) : null}
        </div>

        {/* Admin global KPI cards */}
        {!loading && stats?.is_admin && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              icon={<Users className="w-6 h-6" />}
              label={t.totalUsers}
              value={stats.total_users ?? 0}
              bg="rgba(124,58,237,0.10)"
              fg="#7c3aed"
            />
            <KpiCard
              icon={<FileText className="w-6 h-6" />}
              label={t.totalDocs}
              value={stats.total_docs ?? 0}
              bg="rgba(8,145,178,0.10)"
              fg="#0891b2"
            />
            <KpiCard
              icon={<MessageSquare className="w-6 h-6" />}
              label={t.totalMsgs}
              value={stats.total_messages ?? 0}
              bg="rgba(220,38,38,0.10)"
              fg="#dc2626"
            />
          </div>
        )}

        {/* Personal 7-day activity chart */}
        {mounted && (
          <ChartCard
            title={t.activity7}
            data={loading ? [] : (stats?.activity ?? [])}
            barColor="#9DC08B"
            noActivity={loading ? '' : t.noActivity}
          />
        )}
        {!mounted && <Skeleton />}

        {/* Admin system-wide activity chart */}
        {mounted && !loading && stats?.is_admin && (
          <ChartCard
            title={t.systemActivity}
            data={stats.global_activity ?? []}
            barColor="#517B3E"
            noActivity={t.noActivity}
          />
        )}

      </main>
    </div>
  );
}
