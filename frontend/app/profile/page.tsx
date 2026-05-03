'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API = 'http://127.0.0.1:5003';

const i18n = {
  he: {
    langLabel:      'EN',
    backToApp:      'חזרה ל-Workspace',
    memberSince:    'חבר מאז',
    editProfile:    'עריכת פרופיל',
    saveChanges:    'שמור שינויים',
    saving:         'שומר...',
    cancel:         'ביטול',
    logout:         'יציאה',
    firstNameLabel: 'שם פרטי',
    lastNameLabel:  'שם משפחה',
    emailLabel:     'אימייל',
    loading:        'טוען...',
    saveSuccess:    'הפרופיל עודכן בהצלחה',
    serverErr:      'לא ניתן להתחבר לשרת.',
    statChats:      'שיחות',
    statMessages:   'הודעות',
    statDocs:       'מסמכים',
    planLabel:      'תוכנית נוכחית',
    planFree:       'Free',
    upgradePro:     'שדרג ל-U-Note Pro',
    upgradeDesc:    'גישה בלתי מוגבלת, עיבוד מסמכים מהיר יותר ותכונות AI מתקדמות',
  },
  en: {
    langLabel:      'HE',
    backToApp:      'Back to Workspace',
    memberSince:    'Member since',
    editProfile:    'Edit Profile',
    saveChanges:    'Save Changes',
    saving:         'Saving…',
    cancel:         'Cancel',
    logout:         'Log out',
    firstNameLabel: 'First name',
    lastNameLabel:  'Last name',
    emailLabel:     'Email',
    loading:        'Loading…',
    saveSuccess:    'Profile updated successfully',
    serverErr:      'Cannot connect to server.',
    statChats:      'Chats',
    statMessages:   'Messages',
    statDocs:       'Documents',
    planLabel:      'Current plan',
    planFree:       'Free',
    upgradePro:     'Upgrade to U-Note Pro',
    upgradeDesc:    'Unlimited access, faster document processing, and advanced AI features',
  },
} as const;

type Lang = 'he' | 'en';

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

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none" aria-hidden="true">
      <rect width="52" height="52" rx="14" fill="#060b18"/>
      <rect width="52" height="52" rx="14" fill="none" stroke="rgba(0,212,255,0.4)" strokeWidth="1.5"/>
      <rect x="18" y="4" width="16" height="9" rx="3" fill="#00d4ff"/>
      <rect x="6" y="11" width="40" height="3.5" rx="1.75" fill="#00d4ff"/>
      <line x1="39" y1="14" x2="44" y2="23" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="44" cy="25.5" r="3" fill="#8b5cf6"/>
      <path d="M13 15 L13 33 Q13 43 26 43 Q39 43 39 33 L39 15"
            stroke="#00d4ff" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

function StatChip({ label, value, color }: { label: string; value: number | string; color: 'cyan' | 'purple' | 'emerald' }) {
  const styles = {
    cyan:    'border-[#00d4ff]/20 bg-[#00d4ff]/5 text-[#00d4ff]',
    purple:  'border-[#8b5cf6]/20 bg-[#8b5cf6]/5 text-[#8b5cf6]',
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
  };
  return (
    <div className={`flex-1 flex flex-col items-center gap-1 border rounded-xl py-3 px-2 ${styles[color]}`}>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs opacity-70">{label}</span>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();

  const [lang,       setLang]       = useState<Lang>('he');
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error,      setError]      = useState('');

  const [firstName,     setFirstName]     = useState('');
  const [lastName,      setLastName]      = useState('');
  const [email,         setEmail]         = useState('');
  const [createdAt,     setCreatedAt]     = useState('');
  const [sessionCount,  setSessionCount]  = useState(0);
  const [messageCount,  setMessageCount]  = useState(0);
  const [documentCount, setDocumentCount] = useState(0);

  const [draftFirst, setDraftFirst] = useState('');
  const [draftLast,  setDraftLast]  = useState('');

  const t = i18n[lang];

  useEffect(() => {
    const savedLang = localStorage.getItem('levy_ai_lang') as Lang | null;
    if (savedLang === 'en' || savedLang === 'he') setLang(savedLang);

    const token = localStorage.getItem('levy_ai_token');
    if (!token) { router.replace('/login'); return; }

    authFetch(`${API}/api/profile`)
      .then(async r => {
        if (r.status === 401) { router.replace('/login'); return; }
        const data = await r.json();
        setFirstName(data.first_name     ?? '');
        setLastName(data.last_name       ?? '');
        setEmail(data.email              ?? '');
        setCreatedAt(data.created_at     ?? '');
        setSessionCount(data.session_count  ?? 0);
        setMessageCount(data.message_count  ?? 0);
        setDocumentCount(data.document_count ?? 0);
      })
      .catch(() => setError(t.serverErr))
      .finally(() => setLoading(false));
  }, [router, t.serverErr]);

  useEffect(() => {
    document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem('levy_ai_lang', lang);
  }, [lang]);

  const toggleLang = () => setLang(l => l === 'he' ? 'en' : 'he');

  const startEdit = () => {
    setDraftFirst(firstName); setDraftLast(lastName);
    setSuccessMsg(''); setError(''); setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setError(''); };

  const handleSave = async () => {
    if (!draftFirst.trim() || !draftLast.trim()) return;
    setSaving(true); setError('');
    try {
      const res  = await authFetch(`${API}/api/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: draftFirst.trim(), last_name: draftLast.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t.serverErr); return; }
      setFirstName(data.first_name); setLastName(data.last_name);
      localStorage.setItem('levy_ai_first_name', data.first_name);
      localStorage.setItem('levy_ai_last_name',  data.last_name);
      setEditing(false);
      setSuccessMsg(t.saveSuccess);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setError(t.serverErr);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    ['levy_ai_token', 'levy_ai_email', 'levy_ai_first_name', 'levy_ai_last_name'].forEach(k =>
      localStorage.removeItem(k),
    );
    router.push('/login');
  };

  const initials = [firstName[0], lastName[0]].filter(Boolean).join('').toUpperCase()
    || email.slice(0, 2).toUpperCase();

  const formattedDate = (() => {
    if (!createdAt) return '';
    try {
      return new Date(createdAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return ''; }
  })();

  const dir = lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="min-h-screen bg-[#060b18] relative overflow-hidden">

      {/* Ambient blobs */}
      <div className="absolute top-0 right-[30%] w-[400px] h-[300px] rounded-full bg-[#00d4ff] opacity-[0.03] blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-[20%] w-[350px] h-[300px] rounded-full bg-[#8b5cf6] opacity-[0.04] blur-[100px] pointer-events-none" />

      {/* Language toggle */}
      <button
        onClick={toggleLang}
        aria-label={`Switch to ${t.langLabel}`}
        className="fixed top-5 right-5 z-50 flex items-center gap-1.5 px-3 py-1.5 bg-[#0d1424] border border-[#1e2d4a] hover:border-[#00d4ff]/40 rounded-full text-sm text-slate-300 font-semibold transition-all"
      >
        <svg className="w-4 h-4 text-[#00d4ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        {t.langLabel}
      </button>

      {/* Top bar */}
      <div dir={dir} className="flex items-center justify-between px-6 pt-6 pb-0 max-w-lg mx-auto relative z-10">
        <Link href="/"
          className="flex items-center gap-2 text-slate-500 hover:text-[#00d4ff] text-sm font-medium transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          {t.backToApp}
        </Link>
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="text-white font-bold text-lg text-neon-glow">U-Note</span>
        </div>
      </div>

      {/* Profile card */}
      <div className="flex items-start justify-center px-4 py-10 min-h-[calc(100vh-80px)] relative z-10">
        <div dir={dir} className="w-full max-w-lg">

          {loading ? (
            <div className="bg-[#0d1424] border border-[#1e2d4a] rounded-2xl p-10 text-center text-slate-500">
              <div className="w-10 h-10 rounded-full border-2 border-[#1e2d4a] border-t-[#00d4ff] animate-spin mx-auto mb-4" />
              {t.loading}
            </div>
          ) : (
            <div className="space-y-4">

              {/* Avatar + name card */}
              <div className="bg-[#0d1424] border border-[#1e2d4a] rounded-2xl overflow-hidden"
                   style={{ boxShadow: '0 0 0 1px rgba(0,212,255,0.06), 0 24px 48px rgba(0,0,0,0.4)' }}>

                {/* Banner */}
                <div className="relative bg-gradient-to-br from-[#0a1a35] to-[#0d1424] px-8 pt-10 pb-16 text-center"
                     style={{ borderBottom: '1px solid rgba(0,212,255,0.08)' }}>
                  {/* Avatar with neon ring */}
                  <div className="relative inline-block">
                    <div
                      className="w-24 h-24 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#0085ff] flex items-center justify-center text-[#060b18] text-3xl font-bold mx-auto select-none"
                      style={{ boxShadow: '0 0 0 3px #060b18, 0 0 0 5px rgba(0,212,255,0.4), 0 0 24px rgba(0,212,255,0.3)' }}
                    >
                      {initials || '?'}
                    </div>
                  </div>
                  {!editing && (
                    <div className="mt-4">
                      <p className="text-white text-xl font-bold">{firstName} {lastName}</p>
                      <p className="text-slate-500 text-sm mt-0.5" dir="ltr">{email}</p>
                      {formattedDate && (
                        <p className="text-slate-600 text-xs mt-1">{t.memberSince} {formattedDate}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div className="px-8 pb-8 -mt-6 relative z-10">

                  {/* Plan badge */}
                  <div className="flex justify-center mb-6">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#080e1f] border border-[#1e2d4a] text-xs text-slate-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                      {t.planLabel}: <span className="text-slate-300">{t.planFree}</span>
                    </span>
                  </div>

                  {/* Toasts */}
                  {successMsg && (
                    <div className="mb-4 flex items-center gap-2 bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 rounded-xl px-4 py-3 text-sm">
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      {successMsg}
                    </div>
                  )}
                  {error && (
                    <div className="mb-4 bg-red-950/50 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
                      {error}
                    </div>
                  )}

                  {!editing ? (
                    <div className="space-y-3">
                      {[
                        [t.firstNameLabel, firstName],
                        [t.lastNameLabel, lastName],
                        [t.emailLabel, email],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-[#1e2d4a] bg-[#080e1f] px-4 py-3.5">
                          <p className="text-xs text-slate-600 mb-0.5">{label}</p>
                          <p className="text-sm font-medium text-slate-300" dir={label === t.emailLabel ? 'ltr' : 'auto'}>{value || '—'}</p>
                        </div>
                      ))}

                      <button onClick={startEdit}
                        className="w-full py-2.5 rounded-xl border border-[#00d4ff]/30 text-[#00d4ff] text-sm font-semibold hover:bg-[#00d4ff]/5 hover:border-[#00d4ff]/50 transition-all active:scale-[0.99]">
                        {t.editProfile}
                      </button>

                      <button onClick={handleLogout}
                        className="w-full py-2.5 rounded-xl border border-red-500/20 hover:bg-red-950/30 text-red-500 hover:text-red-400 text-sm font-semibold transition-all active:scale-[0.99]">
                        {t.logout}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.firstNameLabel}</label>
                          <input type="text" value={draftFirst} onChange={e => setDraftFirst(e.target.value)}
                            dir="auto" autoFocus
                            className="w-full rounded-xl border border-[#1e2d4a] bg-[#080e1f] px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-[#00d4ff]/60 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.1)] transition-all" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.lastNameLabel}</label>
                          <input type="text" value={draftLast} onChange={e => setDraftLast(e.target.value)}
                            dir="auto"
                            className="w-full rounded-xl border border-[#1e2d4a] bg-[#080e1f] px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-[#00d4ff]/60 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.1)] transition-all" />
                        </div>
                      </div>
                      <div className="rounded-xl border border-[#1e2d4a] bg-[#080e1f] px-4 py-3.5">
                        <p className="text-xs text-slate-600 mb-0.5">{t.emailLabel}</p>
                        <p className="text-sm text-slate-500" dir="ltr">{email}</p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={cancelEdit} disabled={saving}
                          className="flex-1 py-2.5 rounded-xl border border-[#1e2d4a] hover:bg-[#111c35] text-sm font-semibold text-slate-400 transition-all">
                          {t.cancel}
                        </button>
                        <button onClick={handleSave}
                          disabled={saving || !draftFirst.trim() || !draftLast.trim()}
                          className="flex-1 py-2.5 rounded-xl bg-[#00d4ff] hover:bg-[#00bbdd] disabled:bg-slate-700 text-[#060b18] text-sm font-bold transition-all flex items-center justify-center gap-2">
                          {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-[#060b18]/30 border-t-[#060b18] animate-spin" />}
                          {saving ? t.saving : t.saveChanges}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Usage stats */}
              <div className="bg-[#0d1424] border border-[#1e2d4a] rounded-2xl p-5">
                <div className="flex gap-3">
                  <StatChip label={t.statChats}    value={sessionCount}  color="cyan"    />
                  <StatChip label={t.statMessages} value={messageCount}  color="purple"  />
                  <StatChip label={t.statDocs}     value={documentCount} color="emerald" />
                </div>
              </div>

              {/* Pro upgrade CTA */}
              <div
                className="bg-gradient-to-br from-[#0a1a35] to-[#100d20] border border-[#8b5cf6]/20 rounded-2xl p-6 text-center"
                style={{ boxShadow: '0 0 0 1px rgba(139,92,246,0.08)' }}
              >
                <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-[#8b5cf6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                  </svg>
                </div>
                <p className="text-white font-bold text-sm mb-1">{t.upgradePro}</p>
                <p className="text-slate-500 text-xs mb-4 leading-relaxed">{t.upgradeDesc}</p>
                <button className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#6d28d9] hover:from-[#7c3aed] hover:to-[#5b21b6] text-white text-sm font-bold transition-all active:scale-[0.99] animate-purple-pulse">
                  {t.upgradePro} →
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
