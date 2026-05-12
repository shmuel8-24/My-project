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
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#FDFCF8"/>
      <rect width="40" height="40" rx="9" stroke="rgba(107,144,74,0.35)" strokeWidth="1.5" fill="none"/>
      <path d="M9 7 L9 26 C9 35 31 35 31 26 L31 7 L25 7 L25 26 C25 30 15 30 15 26 L15 7 Z" fill="#6B904A"/>
    </svg>
  );
}

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-1 border border-stone-200 bg-stone-50 rounded-xl py-3 px-2">
      <span className="text-xl font-bold text-slate-800">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
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
    <div className="min-h-screen bg-[#F5F3ED] relative overflow-hidden">

      {/* Soft organic blobs */}
      <div className="absolute top-0 right-[30%] w-[400px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'rgba(107,144,74,0.06)', filter: 'blur(100px)' }} />
      <div className="absolute bottom-0 left-[20%] w-[350px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'rgba(180,160,120,0.05)', filter: 'blur(90px)' }} />

      {/* Language toggle */}
      <button
        onClick={toggleLang}
        aria-label={`Switch to ${t.langLabel}`}
        className="fixed top-5 right-5 z-50 flex items-center gap-1.5 px-3 py-1.5 bg-[#FDFCF8] border border-stone-200 hover:border-[#6B904A]/40 rounded-full text-sm text-slate-600 font-semibold transition-all shadow-sm"
      >
        <svg className="w-4 h-4 text-[#6B904A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        {t.langLabel}
      </button>

      {/* Top bar */}
      <div dir={dir} className="flex items-center justify-between px-6 pt-6 pb-0 max-w-lg mx-auto relative z-10">
        <Link href="/"
          className="flex items-center gap-2 text-slate-500 hover:text-[#6B904A] text-sm font-medium transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          {t.backToApp}
        </Link>
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} />
          <span className="text-slate-900 font-bold text-lg">U-Note</span>
        </div>
      </div>

      {/* Profile card */}
      <div className="flex items-start justify-center px-4 py-10 min-h-[calc(100vh-80px)] relative z-10">
        <div dir={dir} className="w-full max-w-lg">

          {loading ? (
            <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-10 text-center text-slate-500 shadow-sm">
              <div className="w-10 h-10 rounded-full border-2 border-stone-200 border-t-[#6B904A] animate-spin mx-auto mb-4" />
              {t.loading}
            </div>
          ) : (
            <div className="space-y-4">

              {/* Avatar + name card */}
              <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl overflow-hidden"
                   style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)' }}>

                {/* Banner */}
                <div className="relative px-8 pt-10 pb-16 text-center"
                     style={{ background: 'linear-gradient(135deg, #F0EDE5 0%, #E8E3D8 100%)', borderBottom: '1px solid #E2DAC8' }}>
                  {/* Avatar */}
                  <div className="relative inline-block">
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto select-none"
                      style={{ background: '#6B904A', boxShadow: '0 0 0 4px #F0EDE5, 0 0 0 6px #D6CBB9' }}
                    >
                      {initials || '?'}
                    </div>
                  </div>
                  {!editing && (
                    <div className="mt-4">
                      <p className="text-slate-900 text-xl font-bold">{firstName} {lastName}</p>
                      <p className="text-slate-500 text-sm mt-0.5" dir="ltr">{email}</p>
                      {formattedDate && (
                        <p className="text-slate-400 text-xs mt-1">{t.memberSince} {formattedDate}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div className="px-8 pb-8 -mt-6 relative z-10">

                  {/* Toasts */}
                  {successMsg && (
                    <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      {successMsg}
                    </div>
                  )}
                  {error && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
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
                        <div key={label} className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3.5">
                          <p className="text-xs text-slate-400 mb-0.5">{label}</p>
                          <p className="text-sm font-medium text-slate-700" dir={label === t.emailLabel ? 'ltr' : 'auto'}>{value || '—'}</p>
                        </div>
                      ))}

                      <button onClick={startEdit}
                        className="w-full py-2.5 rounded-xl border border-[#6B904A]/40 text-[#6B904A] text-sm font-semibold hover:bg-[#6B904A]/5 hover:border-[#6B904A]/60 transition-all active:scale-[0.99]">
                        {t.editProfile}
                      </button>

                      <button onClick={handleLogout}
                        className="w-full py-2.5 rounded-xl border border-red-200 hover:bg-red-50 text-red-500 hover:text-red-600 text-sm font-semibold transition-all active:scale-[0.99]">
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
                            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all"
                            onFocus={e => { e.target.style.borderColor = '#6B904A'; e.target.style.boxShadow = '0 0 0 3px rgba(107,144,74,0.12)'; }}
                            onBlur={e  => { e.target.style.borderColor = '#E7E5E4'; e.target.style.boxShadow = 'none'; }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1.5">{t.lastNameLabel}</label>
                          <input type="text" value={draftLast} onChange={e => setDraftLast(e.target.value)}
                            dir="auto"
                            className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition-all"
                            onFocus={e => { e.target.style.borderColor = '#6B904A'; e.target.style.boxShadow = '0 0 0 3px rgba(107,144,74,0.12)'; }}
                            onBlur={e  => { e.target.style.borderColor = '#E7E5E4'; e.target.style.boxShadow = 'none'; }}
                          />
                        </div>
                      </div>
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3.5">
                        <p className="text-xs text-slate-400 mb-0.5">{t.emailLabel}</p>
                        <p className="text-sm text-slate-500" dir="ltr">{email}</p>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={cancelEdit} disabled={saving}
                          className="flex-1 py-2.5 rounded-xl border border-stone-200 hover:bg-stone-100 text-sm font-semibold text-slate-500 transition-all">
                          {t.cancel}
                        </button>
                        <button onClick={handleSave}
                          disabled={saving || !draftFirst.trim() || !draftLast.trim()}
                          className="flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                          style={{ background: saving || !draftFirst.trim() || !draftLast.trim() ? '#A8B99A' : '#6B904A' }}>
                          {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                          {saving ? t.saving : t.saveChanges}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Usage stats */}
              <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-5 shadow-sm">
                <div className="flex gap-3">
                  <StatChip label={t.statChats}    value={sessionCount}  />
                  <StatChip label={t.statMessages} value={messageCount}  />
                  <StatChip label={t.statDocs}     value={documentCount} />
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
