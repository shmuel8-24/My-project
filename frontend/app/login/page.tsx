'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const API = 'http://127.0.0.1:5003';

const i18n = {
  he: {
    langLabel:       'EN',
    subtitle:        'שותף המחקר החכם שלך',
    heading1:        'ברוך הבא ל-U-Note',
    heading2:        'קצת עליך',
    heading3:        'אימות זהות',
    sub1:            'הזן את האימייל שלך כדי להתחבר או להירשם',
    sub2:            'ספר לנו מי אתה לפני שנמשיך',
    sub3:            'הזן את הקוד החד-פעמי שנשלח לתיבת הדואר שלך',
    emailLabel:      'כתובת אימייל',
    emailPh:         'you@example.com',
    continueBtn:     'המשך',
    checking:        'בודק...',
    firstNameLabel:  'שם פרטי',
    firstNamePh:     'ישראל',
    lastNameLabel:   'שם משפחה',
    lastNamePh:      'ישראלי',
    sendCode:        'שלח קוד',
    sending:         'שולח...',
    errNameRequired: 'יש להזין שם פרטי ושם משפחה.',
    codeSentTo:      'שלחנו קוד ל-',
    devHint:         'מצב פיתוח: הקוד מוצג בטרמינל',
    verify:          'אמת',
    verifying:       'מאמת...',
    resend:          'שלח קוד חדש',
    resendIn:        'שלח שוב בעוד',
    emailErrInvalid: 'כתובת אימייל לא תקינה.',
    errOtpIncomplete:'יש להזין 6 ספרות.',
    serverErr:       'לא ניתן להתחבר לשרת. בדוק שה-backend פועל על פורט 5003.',
    footer:          'U-Note · שותף המחקר החכם שלך',
  },
  en: {
    langLabel:       'HE',
    subtitle:        'Your Academic Sidekick',
    heading1:        'Welcome to U-Note',
    heading2:        'About You',
    heading3:        'Verification',
    sub1:            'Enter your email to sign in or create an account',
    sub2:            'Tell us a bit about yourself to continue',
    sub3:            'Enter the one-time code sent to your inbox',
    emailLabel:      'Email address',
    emailPh:         'you@example.com',
    continueBtn:     'Continue',
    checking:        'Checking…',
    firstNameLabel:  'First name',
    firstNamePh:     'John',
    lastNameLabel:   'Last name',
    lastNamePh:      'Smith',
    sendCode:        'Send Code',
    sending:         'Sending…',
    errNameRequired: 'Please enter your first and last name.',
    codeSentTo:      'We sent a code to',
    devHint:         'Dev mode: check the server terminal',
    verify:          'Verify',
    verifying:       'Verifying…',
    resend:          'Send new code',
    resendIn:        'Resend in',
    emailErrInvalid: 'Please enter a valid email address.',
    errOtpIncomplete:'Please enter all 6 digits.',
    serverErr:       'Cannot connect to server. Make sure the backend is running on port 5003.',
    footer:          'U-Note · Your Academic Sidekick',
  },
} as const;

type Lang = 'he' | 'en';

/* ── U-Note logo mark ─────────────────────────────────────────────────────── */
function LogoMark({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" fill="none" aria-hidden="true">
      {/* Dark card */}
      <rect width="52" height="52" rx="14" fill="#060b18"/>
      <rect width="52" height="52" rx="14" fill="none" stroke="rgba(0,212,255,0.4)" strokeWidth="1.5"/>
      {/* Graduation cap crown */}
      <rect x="18" y="4" width="16" height="9" rx="3" fill="#00d4ff"/>
      {/* Graduation cap brim */}
      <rect x="6" y="11" width="40" height="3.5" rx="1.75" fill="#00d4ff"/>
      {/* Tassel string */}
      <line x1="39" y1="14" x2="44" y2="23" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round"/>
      {/* Tassel ball */}
      <circle cx="44" cy="25.5" r="3" fill="#8b5cf6"/>
      {/* U body */}
      <path d="M13 15 L13 33 Q13 43 26 43 Q39 43 39 33 L39 15"
            stroke="#00d4ff" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();

  const [lang,           setLang]           = useState<Lang>('he');
  const [step,           setStep]           = useState<1 | 2 | 3>(1);
  const [animating,      setAnimating]      = useState(false);

  const [email,          setEmail]          = useState('');
  const [isNewUser,      setIsNewUser]      = useState(false);
  const [firstName,      setFirstName]      = useState('');
  const [lastName,       setLastName]       = useState('');
  const [otp,            setOtp]            = useState(['', '', '', '', '', '']);

  const [busy,           setBusy]           = useState(false);
  const [verifying,      setVerifying]      = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error,          setError]          = useState('');

  const emailRef     = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const otpRefs      = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));

  const t   = i18n[lang];
  const dir = lang === 'he' ? 'rtl' : 'ltr';

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    const saved = localStorage.getItem('levy_ai_lang') as Lang | null;
    if (saved === 'en' || saved === 'he') setLang(saved);
    if (localStorage.getItem('levy_ai_token')) router.replace('/');
  }, [router]);

  useEffect(() => {
    document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem('levy_ai_lang', lang);
  }, [lang]);

  const toggleLang = () => setLang(l => l === 'he' ? 'en' : 'he');

  const goTo = (s: 1 | 2 | 3) => {
    setError('');
    setAnimating(true);
    setTimeout(() => {
      setStep(s);
      setAnimating(false);
      setTimeout(() => {
        if (s === 1) emailRef.current?.focus();
        if (s === 2) firstNameRef.current?.focus();
        if (s === 3) otpRefs.current[0]?.focus();
      }, 30);
    }, 180);
  };

  const doSendOtp = async (addr: string): Promise<boolean> => {
    try {
      const res  = await fetch(`${API}/api/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t.serverErr); return false; }
      return true;
    } catch {
      setError(t.serverErr);
      return false;
    }
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = email.trim().toLowerCase();
    if (!val || !val.includes('@') || !val.split('@')[1]?.includes('.')) {
      setError(t.emailErrInvalid); return;
    }
    setError(''); setBusy(true);
    try {
      const res  = await fetch(`${API}/api/check-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: val }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t.serverErr); return; }
      if (data.exists) {
        setIsNewUser(false);
        const ok = await doSendOtp(val);
        if (!ok) return;
        setResendCooldown(60);
        goTo(3);
      } else {
        setIsNewUser(true);
        goTo(2);
      }
    } catch { setError(t.serverErr); }
    finally  { setBusy(false); }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { setError(t.errNameRequired); return; }
    setError(''); setBusy(true);
    const ok = await doSendOtp(email.trim().toLowerCase());
    setBusy(false);
    if (!ok) return;
    setResendCooldown(60);
    goTo(3);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) { setError(t.errOtpIncomplete); return; }
    setError(''); setVerifying(true);
    try {
      const payload: Record<string, string> = { email: email.trim().toLowerCase(), code };
      if (isNewUser) { payload.first_name = firstName.trim(); payload.last_name = lastName.trim(); }
      const res  = await fetch(`${API}/api/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Verification failed.'); return; }
      localStorage.setItem('levy_ai_token',      data.token);
      localStorage.setItem('levy_ai_email',      data.email);
      localStorage.setItem('levy_ai_first_name', data.first_name ?? '');
      localStorage.setItem('levy_ai_last_name',  data.last_name  ?? '');
      router.push('/');
    } catch { setError(t.serverErr); }
    finally  { setVerifying(false); }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || busy) return;
    setOtp(['', '', '', '', '', '']);
    setError(''); setBusy(true);
    const ok = await doSendOtp(email.trim().toLowerCase());
    setBusy(false);
    if (ok) { setResendCooldown(60); otpRefs.current[0]?.focus(); }
  };

  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next  = [...otp]; next[i] = digit; setOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };
  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace'  && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft'  && i > 0)             otpRefs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5)             otpRefs.current[i + 1]?.focus();
  };
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next   = Array(6).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setOtp(next);
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const heading  = step === 1 ? t.heading1 : step === 2 ? t.heading2 : t.heading3;
  const subtitle = step === 1 ? t.sub1     : step === 2 ? t.sub2     : t.sub3;

  return (
    <div className="min-h-screen bg-[#060b18] flex items-center justify-center px-4 relative overflow-hidden">

      {/* Ambient background glow blobs */}
      <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-[#00d4ff] opacity-[0.04] blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-5%] right-[15%] w-[400px] h-[400px] rounded-full bg-[#8b5cf6] opacity-[0.05] blur-[100px] pointer-events-none" />

      {/* Language toggle */}
      <button
        onClick={toggleLang}
        aria-label={`Switch to ${t.langLabel}`}
        className="fixed top-5 right-5 z-50 flex items-center gap-1.5 px-3 py-1.5 bg-[#0d1424] border border-[#1e2d4a] hover:border-[#00d4ff]/40 rounded-full text-sm text-slate-300 font-semibold transition-all shadow-sm"
      >
        <svg className="w-4 h-4 text-[#00d4ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        {t.langLabel}
      </button>

      <div className="w-full max-w-md relative z-10">

        {/* Branding */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-5">
            <LogoMark size={64} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight text-neon-glow">U-Note</h1>
          <p className="text-slate-500 mt-1.5 text-sm">{t.subtitle}</p>
        </div>

        {/* Card */}
        <div
          dir={dir}
          className="bg-[#0d1424] rounded-2xl border border-[#1e2d4a] p-8 shadow-2xl"
          style={{ boxShadow: '0 0 0 1px rgba(0,212,255,0.06), 0 32px 64px rgba(0,0,0,0.5)' }}
        >
          <h2 className="text-lg font-bold text-white mb-1 text-center transition-all duration-200">
            {heading}
          </h2>
          <p className="text-xs text-slate-500 text-center mb-7">{subtitle}</p>

          {/* Step content — fades in/out on transition */}
          <div className={`transition-all duration-180 ease-in-out ${animating ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}>

            {/* Error banner */}
            {error && (
              <div className="mb-5 flex items-start gap-2.5 bg-red-950/50 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                {error}
              </div>
            )}

            {/* ═══ STEP 1: Email ═══════════════════════════════════════════ */}
            {step === 1 && (
              <form onSubmit={handleContinue} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">{t.emailLabel}</label>
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    dir="ltr"
                    autoComplete="email"
                    autoFocus
                    placeholder={t.emailPh}
                    className="w-full rounded-xl border border-[#1e2d4a] bg-[#080e1f] px-4 py-3 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-[#00d4ff]/60 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.1)] transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-[#00d4ff] hover:bg-[#00bbdd] disabled:bg-slate-700 text-[#060b18] text-sm font-bold transition-all active:scale-[0.99] disabled:cursor-not-allowed flex items-center justify-center gap-2 animate-neon-pulse"
                >
                  {busy && <span className="w-4 h-4 rounded-full border-2 border-[#060b18]/30 border-t-[#060b18] animate-spin" />}
                  {busy ? t.checking : t.continueBtn}
                </button>
              </form>
            )}

            {/* ═══ STEP 2: Name (new users) ════════════════════════════════ */}
            {step === 2 && (
              <form onSubmit={handleSendCode} className="space-y-4">

                {/* Email back-chip */}
                <button type="button" onClick={() => goTo(1)} dir="ltr"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[#080e1f] hover:bg-[#0d1a30] border border-[#1e2d4a] hover:border-[#00d4ff]/30 rounded-xl text-sm text-slate-400 transition-all group">
                  <svg className="w-4 h-4 text-slate-600 group-hover:text-[#00d4ff] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  <span className="flex-1 text-start truncate text-slate-300 font-medium">{email}</span>
                  <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-[#00d4ff]/60 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                  </svg>
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">{t.firstNameLabel}</label>
                    <input
                      ref={firstNameRef}
                      type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                      required dir="auto" autoComplete="given-name" placeholder={t.firstNamePh}
                      className="w-full rounded-xl border border-[#1e2d4a] bg-[#080e1f] px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-[#00d4ff]/60 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.1)] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">{t.lastNameLabel}</label>
                    <input
                      type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                      required dir="auto" autoComplete="family-name" placeholder={t.lastNamePh}
                      className="w-full rounded-xl border border-[#1e2d4a] bg-[#080e1f] px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-[#00d4ff]/60 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.1)] transition-all"
                    />
                  </div>
                </div>

                <button type="submit" disabled={busy}
                  className="w-full py-3 rounded-xl bg-[#00d4ff] hover:bg-[#00bbdd] disabled:bg-slate-700 text-[#060b18] text-sm font-bold transition-all active:scale-[0.99] disabled:cursor-not-allowed flex items-center justify-center gap-2 animate-neon-pulse">
                  {busy && <span className="w-4 h-4 rounded-full border-2 border-[#060b18]/30 border-t-[#060b18] animate-spin" />}
                  {busy ? t.sending : t.sendCode}
                </button>
              </form>
            )}

            {/* ═══ STEP 3: OTP boxes ═══════════════════════════════════════ */}
            {step === 3 && (
              <form onSubmit={handleVerify} className="space-y-5">

                {/* Email back-chip */}
                <button type="button"
                  onClick={() => { setOtp(['', '', '', '', '', '']); goTo(isNewUser ? 2 : 1); }}
                  dir="ltr"
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 bg-[#080e1f] hover:bg-[#0d1a30] border border-[#1e2d4a] hover:border-[#00d4ff]/30 rounded-xl text-sm text-slate-400 transition-all group">
                  <svg className="w-4 h-4 text-slate-600 group-hover:text-[#00d4ff] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  <span className="flex-1 text-start truncate text-slate-300 font-medium">{email}</span>
                  <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-[#00d4ff]/60 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                  </svg>
                </button>

                {/* Code sent notice */}
                <div className="flex items-start gap-2 text-xs text-slate-600 px-1">
                  <svg className="w-4 h-4 text-[#00d4ff]/50 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                  <span>{t.codeSentTo} <span className="text-slate-400 font-medium">{email}</span> · <em className="text-slate-600">{t.devHint}</em></span>
                </div>

                {/* 6-digit OTP boxes */}
                <div dir="ltr" className="flex gap-2 justify-center">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { otpRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      onFocus={e => e.target.select()}
                      className={[
                        'w-11 text-center text-xl font-bold rounded-xl border-2 outline-none',
                        'bg-[#080e1f] text-[#00d4ff] transition-all duration-150 caret-transparent',
                        digit
                          ? 'border-[#00d4ff]/70 shadow-[0_0_12px_rgba(0,212,255,0.3)]'
                          : 'border-[#1e2d4a] focus:border-[#00d4ff]/50 focus:shadow-[0_0_8px_rgba(0,212,255,0.15)]',
                      ].join(' ')}
                      style={{ aspectRatio: '1 / 1.2' }}
                    />
                  ))}
                </div>

                <button type="submit" disabled={verifying || otp.join('').length < 6}
                  className="w-full py-3 rounded-xl bg-[#00d4ff] hover:bg-[#00bbdd] disabled:bg-slate-700 text-[#060b18] text-sm font-bold transition-all active:scale-[0.99] disabled:cursor-not-allowed flex items-center justify-center gap-2 animate-neon-pulse">
                  {verifying && <span className="w-4 h-4 rounded-full border-2 border-[#060b18]/30 border-t-[#060b18] animate-spin" />}
                  {verifying ? t.verifying : t.verify}
                </button>

                <p className="text-center text-sm">
                  <button type="button" onClick={handleResend}
                    disabled={resendCooldown > 0 || busy}
                    className="text-[#00d4ff]/80 hover:text-[#00d4ff] font-medium disabled:text-slate-600 disabled:cursor-default transition-colors text-xs">
                    {busy ? t.sending
                      : resendCooldown > 0 ? `${t.resendIn} ${resendCooldown}s`
                      : t.resend}
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-700">{t.footer}</p>
      </div>
    </div>
  );
}
