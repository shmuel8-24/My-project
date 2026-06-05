 'use client';

import React, { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X, MessagesSquare, PenTool, TrendingUp, GraduationCap, ChevronUp, Check } from 'lucide-react';
import { useLanguage } from './providers/language';
import { useCourse }   from './providers/course';
import { landing } from './locales/landing';

type Mode = 'magic' | 'password';
type ForgotView = 'email' | 'sent' | null;
const WORKSPACE_ROUTE = '/course-picker';

/* ─── Shared input focus/blur handlers ───────────────────────────────────── */
const focusInput = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '#517B3E';
  e.target.style.boxShadow   = '0 0 0 3px rgba(81,123,62,0.15)';
};
const blurInput = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = 'rgba(200,190,170,0.75)';
  e.target.style.boxShadow   = 'none';
};

const INPUT_STYLE: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid rgba(200,190,170,0.75)',
  background: 'rgba(255,255,255,0.75)',
  fontSize: '0.9375rem',
  color: '#1a2540',
  outline: 'none',
  width: '100%',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: '#374151',
};

/* ─── Email field ─────────────────────────────────────────────────────────── */
function EmailField({ value, onChange, label = 'Email' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={LABEL_STYLE}>{label}</label>
      <input
        type="email"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="you@example.com"
        required
        dir="ltr"
        autoComplete="email"
        style={INPUT_STYLE}
        onFocus={focusInput}
        onBlur={blurInput}
      />
    </div>
  );
}

/* ─── Submit button ──────────────────────────────────────────────────────── */
function SubmitButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="active:scale-[0.97]"
      style={{
        marginTop: '8px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '13px 32px',
        borderRadius: '12px',
        fontSize: '1rem',
        fontWeight: 600,
        color: 'white',
        backgroundColor: loading ? '#6B9053' : '#517B3E',
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        boxShadow: loading ? 'none' : '0 4px 16px rgba(81,123,62,0.38)',
        transition: 'background-color 0.2s, box-shadow 0.2s, transform 0.1s',
        width: '100%',
      }}
    >
      {loading && (
        <span
          className="animate-spin"
          style={{
            width: '15px', height: '15px',
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.35)',
            borderTopColor: 'white',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      )}
      {loading ? loadingLabel : label}
    </button>
  );
}

/* ─── Gender avatar images ───────────────────────────────────────────────────── */
function MaleAvatar() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/assets/avatars/IMG_1.PNG"
      alt="זכר"
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
}

function FemaleAvatar() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/assets/avatars/IMG_2.PNG"
      alt="נקבה"
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export default function HomePage() {
  const router = useRouter();

  /* ── Modal ── */
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  /* ── Form state ── */
  const [mode, setMode]             = useState<Mode>('magic');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [netError, setNetError]     = useState(false);
  const [magicSent, setMagicSent]   = useState(false);
  const [otpDigits, setOtpDigits]   = useState<string[]>(Array(6).fill(''));
  const [otpLoading, setOtpLoading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { lang, toggleLanguage } = useLanguage();
  const t = landing[lang];
  const { setSelectedCourse } = useCourse();

  /* Clear any lingering course selection whenever the auth screen mounts. */
  useEffect(() => {
    Promise.resolve().then(() => setSelectedCourse(null));
  }, [setSelectedCourse]);

  /* ── Register modal state ── */
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [regStep,      setRegStep]      = useState(1);
  const [regEmail,     setRegEmail]     = useState('');
  const [regToken,     setRegToken]     = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName,  setRegLastName]  = useState('');
  const [regPassword,  setRegPassword]  = useState('');
  const [regConfirm,   setRegConfirm]   = useState('');
  const [regError,     setRegError]     = useState('');
  const [regLoading,   setRegLoading]   = useState(false);
  const [regGender,    setRegGender]    = useState<'' | 'male' | 'female' | 'other'>('');

  /* ── Register step 2: OTP boxes ── */
  const [regOtpDigits, setRegOtpDigits] = useState<string[]>(Array(6).fill(''));

  /* ── Forgot password (inside login modal) ── */
  const [forgotView,    setForgotView]    = useState<ForgotView>(null);
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError,   setForgotError]   = useState('');

  const otpRefs      = useRef<(HTMLInputElement | null)[]>([]);
  const regOtpRefs   = useRef<(HTMLInputElement | null)[]>([]);
  const solutionsRef = useRef<HTMLElement>(null);
  const blogRef      = useRef<HTMLElement>(null);
  const pricingRef   = useRef<HTMLElement>(null);

  const [showTopBtn,        setShowTopBtn]        = useState(false);
  const [solutionsVisible,  setSolutionsVisible]  = useState(false);
  const [blogInView,        setBlogInView]        = useState(false);
  const [pricingInView,     setPricingInView]     = useState(false);
  const [activeBlogId,      setActiveBlogId]      = useState<number | null>(null);

  const [loginModalClosing,    setLoginModalClosing]    = useState(false);
  const [registerModalClosing, setRegisterModalClosing] = useState(false);
  const loginCloseTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (loginCloseTimerRef.current)    clearTimeout(loginCloseTimerRef.current);
    if (registerCloseTimerRef.current) clearTimeout(registerCloseTimerRef.current);
  }, []);

  const closeModal = useCallback(() => {
    if (loginCloseTimerRef.current) { clearTimeout(loginCloseTimerRef.current); loginCloseTimerRef.current = null; }
    setLoginModalClosing(false);
    setIsLoginModalOpen(false);
    setIsTransitioning(false);
    setError(''); setNetError(false);
    setMagicSent(false);
    setOtpDigits(Array(6).fill(''));
    setMode('magic');
    setEmail('');
    setPassword('');
    setForgotView(null);
    setForgotEmail('');
    setForgotError('');
  }, []);

  const closeRegisterModal = useCallback(() => {
    if (registerCloseTimerRef.current) { clearTimeout(registerCloseTimerRef.current); registerCloseTimerRef.current = null; }
    setRegisterModalClosing(false);
    setIsRegisterModalOpen(false);
    setRegStep(1);
    setRegGender('');
    setRegEmail(''); setRegToken('');
    setRegFirstName(''); setRegLastName('');
    setRegPassword(''); setRegConfirm('');
    setRegError('');
    setRegOtpDigits(Array(6).fill(''));
  }, []);

  const openRegisterModal = useCallback(() => {
    closeModal();
    setIsRegisterModalOpen(true);
  }, [closeModal]);

  // Animated close — plays exit animation then fires the actual close
  const handleCloseLoginModal = useCallback(() => {
    if (loginCloseTimerRef.current) return;
    setLoginModalClosing(true);
    loginCloseTimerRef.current = setTimeout(() => {
      loginCloseTimerRef.current = null;
      closeModal();
    }, 240);
  }, [closeModal]);

  const handleCloseRegisterModal = useCallback(() => {
    if (registerCloseTimerRef.current) return;
    setRegisterModalClosing(true);
    registerCloseTimerRef.current = setTimeout(() => {
      registerCloseTimerRef.current = null;
      closeRegisterModal();
    }, 240);
  }, [closeRegisterModal]);

  /* ── Auto-open modal when redirected from a protected route or /login /register ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'true') {
      setIsLoginModalOpen(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    } else if (params.get('register') === 'true') {
      setIsRegisterModalOpen(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  }, []);

  /* ── Lock body scroll + ESC to close ── */
  useEffect(() => {
    if (!isLoginModalOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseLoginModal(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [isLoginModalOpen, handleCloseLoginModal]);

  useEffect(() => {
    if (!isRegisterModalOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCloseRegisterModal(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [isRegisterModalOpen, handleCloseRegisterModal]);

  /* ── Auto-focus first OTP box when the OTP step appears ── */
  useEffect(() => {
    if (!magicSent) return;
    const t = setTimeout(() => otpRefs.current[0]?.focus(), 60);
    return () => clearTimeout(t);
  }, [magicSent]);

  /* ── Auto-focus first OTP box on register step 2 ── */
  useEffect(() => {
    if (regStep !== 2) return;
    const t = setTimeout(() => regOtpRefs.current[0]?.focus(), 60);
    return () => clearTimeout(t);
  }, [regStep]);

  /* ── Back-to-top visibility ── */
  useEffect(() => {
    const onScroll = () => setShowTopBtn(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Scroll-reveal for solutions section ── */
  useEffect(() => {
    const el = solutionsRef.current;
    if (!el) return;
    // Already visible on mount (short screen, landscape, or after anchor navigation)
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setSolutionsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setSolutionsVisible(true); },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* ── Scroll-reveal for blog section ── */
  useEffect(() => {
    const el = blogRef.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setBlogInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setBlogInView(true); },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* ── Scroll-reveal for pricing section ── */
  useEffect(() => {
    const el = pricingRef.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight) {
      setPricingInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setPricingInView(true); },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* ── Blog modal: lock body scroll + ESC to close ── */
  useEffect(() => {
    if (activeBlogId === null) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveBlogId(null); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [activeBlogId]);

  const openModal = () => setIsLoginModalOpen(true);

  const clearErrors = () => { setError(''); setNetError(false); };

  const switchMode = (m: Mode) => {
    setMode(m); clearErrors(); setMagicSent(false); setOtpDigits(Array(6).fill(''));
    if (m === 'magic') setPassword('');
  };

  const validateEmail = (val: string): boolean => {
    if (!val || !val.includes('@') || !val.split('@')[1]?.includes('.')) {
      setError(t.errInvalidEmail);
      return false;
    }
    return true;
  };

  /* Send OTP */
  const handleMagicLink = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); clearErrors();
    const val = email.trim().toLowerCase();
    if (!validateEmail(val)) return;
    setLoading(true);
    try {
      const res  = await fetch('http://127.0.0.1:5003/api/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: val }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t.errSendCode); return; }
      setMagicSent(true);
    } catch { setNetError(true); }
    finally   { setLoading(false); }
  };

  /* Verify OTP — accepts an optional pre-assembled code so it can be called
     directly from onChange/onPaste before React commits the new state. */
  const handleVerifyOtp = async (code?: string) => {
    clearErrors();
    const otp = code ?? otpDigits.join('');
    if (otp.length !== 6) { setError(t.errInvalidOtp); return; }
    if (otpLoading) return;
    setOtpLoading(true);
    try {
      const res  = await fetch('http://127.0.0.1:5003/api/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t.errBadCode);
        setOtpDigits(Array(6).fill(''));
        setTimeout(() => otpRefs.current[0]?.focus(), 50);
        return;
      }
      if (data.token)      localStorage.setItem('levy_ai_token',      data.token);
      if (data.email)      localStorage.setItem('levy_ai_email',      data.email);
      if (data.first_name) localStorage.setItem('levy_ai_first_name', data.first_name);
      if (data.last_name)  localStorage.setItem('levy_ai_last_name',  data.last_name);
      // Session presence cookie — read by middleware before JS runs.
      document.cookie = 'levy_ai_session=1; path=/; SameSite=Lax; max-age=86400';
      // Token cookie — allows middleware to decode the is_admin claim server-side.
      if (data.token) document.cookie = `levy_ai_token=${data.token}; path=/; SameSite=Lax; max-age=86400`;
      setIsTransitioning(true);
      setTimeout(() => router.push(WORKSPACE_ROUTE), 1800);
    } catch { setNetError(true); }
    finally   { setOtpLoading(false); }
  };

  /* Password login */
  const handlePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); clearErrors();
    const val = email.trim().toLowerCase();
    if (!validateEmail(val)) return;
    if (!password) { setError(t.errNoPassword); return; }
    setLoading(true);
    try {
      const res  = await fetch('http://127.0.0.1:5003/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: val, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t.errBadLogin); return; }
      if (data.token)      localStorage.setItem('levy_ai_token',      data.token);
      if (data.email)      localStorage.setItem('levy_ai_email',      data.email);
      if (data.first_name) localStorage.setItem('levy_ai_first_name', data.first_name);
      if (data.last_name)  localStorage.setItem('levy_ai_last_name',  data.last_name);
      document.cookie = 'levy_ai_session=1; path=/; SameSite=Lax; max-age=86400';
      if (data.token) document.cookie = `levy_ai_token=${data.token}; path=/; SameSite=Lax; max-age=86400`;
      setIsTransitioning(true);
      setTimeout(() => router.push(WORKSPACE_ROUTE), 1800);
    } catch { setNetError(true); }
    finally   { setLoading(false); }
  };

  /* Step 1 — send verification OTP to the entered email */
  const handleRegStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    const em = regEmail.trim().toLowerCase();
    if (!em || !em.includes('@') || !em.split('@')[1]?.includes('.')) {
      setRegError(t.errInvalidEmailReg); return;
    }
    setRegLoading(true);
    try {
      const res  = await fetch('http://127.0.0.1:5003/api/register/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em }),
      });
      const data = await res.json();
      if (!res.ok) { setRegError(data.error ?? t.errSendCode); return; }
      setRegOtpDigits(Array(6).fill(''));
      setRegStep(2);
    } catch { setRegError(t.errNoServer); }
    finally  { setRegLoading(false); }
  };

  /* Step 2 — verify the OTP; receive reg_token */
  const handleRegStep2 = async (code?: string) => {
    setRegError('');
    const otp = code ?? regOtpDigits.join('');
    if (otp.length !== 6) { setRegError(t.errInvalidOtp); return; }
    if (regLoading) return;
    setRegLoading(true);
    try {
      const res  = await fetch('http://127.0.0.1:5003/api/register/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail.trim().toLowerCase(), code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error ?? t.errBadCode);
        setRegOtpDigits(Array(6).fill(''));
        setTimeout(() => regOtpRefs.current[0]?.focus(), 50);
        return;
      }
      setRegToken(data.reg_token ?? '');
      setRegStep(3);
    } catch { setRegError(t.errNoServer); }
    finally  { setRegLoading(false); }
  };

  /* Step 2 — resend OTP without leaving the step */
  const handleRegResend = async () => {
    setRegError('');
    try {
      const res = await fetch('http://127.0.0.1:5003/api/register/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail.trim().toLowerCase() }),
      });
      if (!res.ok) { const d = await res.json(); setRegError(d.error ?? t.errSendCode); return; }
      setRegOtpDigits(Array(6).fill(''));
    } catch { setRegError(t.errNoServer); }
  };

  /* Step 4 — validate personal details, advance to step 5 (no API call) */
  const handleRegStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (!regFirstName.trim()) { setRegError(t.errNoFirstName); return; }
    if (!regLastName.trim())  { setRegError(t.errNoLastName);  return; }
    setRegStep(5);
  };

  /* Step 4 — create the account with the verified reg_token */
  const handleRegStep4 = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (regPassword.length < 6) { setRegError(t.errWeakPassword); return; }
    if (regPassword !== regConfirm) { setRegError(t.errPasswordMismatch); return; }
    setRegLoading(true);
    try {
      const res  = await fetch('http://127.0.0.1:5003/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email:      regEmail.trim().toLowerCase(),
          password:   regPassword,
          first_name: regFirstName.trim(),
          last_name:  regLastName.trim(),
          reg_token:  regToken,
          gender:     regGender || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setRegError(data.error ?? t.errRegFailed); return; }
      if (data.token)      localStorage.setItem('levy_ai_token',      data.token);
      if (data.email)      localStorage.setItem('levy_ai_email',      data.email);
      if (data.first_name) localStorage.setItem('levy_ai_first_name', data.first_name);
      if (data.last_name)  localStorage.setItem('levy_ai_last_name',  data.last_name);
      document.cookie = 'levy_ai_session=1; path=/; SameSite=Lax; max-age=86400';
      if (data.token) document.cookie = `levy_ai_token=${data.token}; path=/; SameSite=Lax; max-age=86400`;
      closeRegisterModal();
      setIsTransitioning(true);
      setIsLoginModalOpen(true);
      setTimeout(() => router.push('/onboarding'), 1800);
    } catch { setRegError(t.errNoServer); }
    finally  { setRegLoading(false); }
  };

  /* Forgot-password submit */
  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForgotError('');
    const val = forgotEmail.trim().toLowerCase();
    if (!val || !val.includes('@') || !val.split('@')[1]?.includes('.')) {
      setForgotError(t.errInvalidEmail); return;
    }
    setForgotLoading(true);
    try {
      const res  = await fetch('http://127.0.0.1:5003/api/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: val }),
      });
      const data = await res.json();
      if (!res.ok) { setForgotError(data.error ?? t.errForgotFailed); return; }
      setForgotView('sent');
    } catch { setForgotError(t.errForgotFailed); }
    finally  { setForgotLoading(false); }
  };

  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="relative min-h-screen overflow-hidden" style={{ backgroundColor: '#e8e4d9', fontFamily: 'system-ui, sans-serif' }}>

      {/* ─── Organic Background ─── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #e2ddd0 0%, #d8d3c5 40%, #e5e0d5 100%)' }} />

        <div className="absolute" style={{
          top: '-15%', right: '-8%', width: '55%', height: '65%',
          background: 'radial-gradient(ellipse at 60% 40%, #1e2a45 0%, #263354 50%, transparent 80%)',
          borderRadius: '40% 60% 60% 40% / 40% 40% 60% 60%', opacity: 0.9,
        }} />
        <div className="absolute" style={{
          top: '25%', left: '-12%', width: '40%', height: '55%',
          background: 'radial-gradient(ellipse at 40% 60%, #5A7F4E 0%, #4C6E3E 60%, transparent 85%)',
          borderRadius: '60% 40% 40% 60% / 60% 60% 40% 40%', opacity: 0.75,
        }} />
        <div className="absolute" style={{
          bottom: '-15%', left: '0%', width: '38%', height: '45%',
          background: 'radial-gradient(ellipse at 30% 30%, #6A8E5E 0%, #4C6E3E 70%, transparent 90%)',
          borderRadius: '50% 70% 70% 30% / 30% 30% 70% 70%', opacity: 0.65,
        }} />
        <div className="absolute" style={{
          top: '15%', left: '15%', width: '60%', height: '70%',
          background: 'radial-gradient(ellipse at 50% 50%, #ccc7b3 0%, #c0baa6 60%, transparent 85%)',
          borderRadius: '55% 45% 45% 55% / 45% 55% 45% 55%', opacity: 0.45,
        }} />
        <div className="absolute" style={{
          bottom: '0%', right: '5%', width: '30%', height: '40%',
          background: 'radial-gradient(ellipse at 60% 70%, #1e2a45 0%, #263354 60%, transparent 85%)',
          borderRadius: '70% 30% 30% 70% / 30% 70% 30% 70%', opacity: 0.8,
        }} />

        <svg className="absolute" style={{ top: '3%', right: '12%', width: '280px', height: '280px', opacity: 0.12 }} viewBox="0 0 280 280" fill="none">
          {[25,48,71,94,117,135].map((r, i) => (
            <circle key={i} cx="140" cy="140" r={r} stroke="#c8b890" strokeWidth="1.2"/>
          ))}
        </svg>
        <svg className="absolute" style={{ bottom: '5%', left: '12%', width: '220px', height: '220px', opacity: 0.18 }} viewBox="0 0 220 220" fill="none">
          {[20,40,60,80,100].map((r, i) => (
            <circle key={i} cx="110" cy="110" r={r} stroke="#9a8868" strokeWidth="1.5"/>
          ))}
        </svg>

        <svg className="absolute" style={{ top: '38%', left: '3%', width: '100px', height: '160px', opacity: 0.55 }} viewBox="0 0 100 160" fill="none">
          <ellipse cx="50" cy="80" rx="32" ry="72" fill="#5A8048" transform="rotate(-15 50 80)"/>
          <ellipse cx="50" cy="80" rx="14" ry="60" fill="#4C6E3C" transform="rotate(-15 50 80)"/>
          <line x1="50" y1="15" x2="50" y2="145" stroke="#3E6030" strokeWidth="1.5" transform="rotate(-15 50 80)"/>
          <line x1="50" y1="50" x2="30" y2="35" stroke="#3E6030" strokeWidth="1" transform="rotate(-15 50 80)"/>
          <line x1="50" y1="70" x2="70" y2="58" stroke="#3E6030" strokeWidth="1" transform="rotate(-15 50 80)"/>
          <line x1="50" y1="90" x2="28" y2="80" stroke="#3E6030" strokeWidth="1" transform="rotate(-15 50 80)"/>
        </svg>

        {[[10, 22, '#b8a880'], [14, 20, '#a89870'], [8, 18, '#c8b890']].map(([w, h, c], i) => (
          <div key={i} className="absolute" style={{
            top: `${16 + i * 1.5}%`, right: `${44 - i * 2}%`,
            width: `${w}px`, height: `${h}px`,
            background: c as string, borderRadius: '50%', opacity: 0.55,
          }} />
        ))}

        <div className="absolute" style={{ top: '52%', left: '-3%', width: '22%', height: '14%', background: 'rgba(255,255,255,0.55)', borderRadius: '50% 70% 70% 30% / 30% 50% 70% 50%', filter: 'blur(10px)' }} />
        <div className="absolute" style={{ bottom: '22%', right: '22%', width: '18%', height: '11%', background: 'rgba(255,255,255,0.45)', borderRadius: '70% 30% 50% 50% / 50% 70% 30% 50%', filter: 'blur(8px)' }} />
        <div className="absolute" style={{ top: '8%', left: '35%', width: '12%', height: '8%', background: 'rgba(255,255,255,0.4)', borderRadius: '50%', filter: 'blur(6px)' }} />
      </div>

      {/* ─── Header ─── */}
      <header
        className="relative z-20 flex items-center justify-between px-8 py-3"
        style={{ backgroundColor: 'rgba(157,192,139,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(80,110,60,0.25)' }}
      >
        <Link href="/" className="flex items-center order-last">
          <img src="/logo.PNG" alt="U-Note" className="h-12 object-contain" />
        </Link>

        <nav className="flex items-center gap-7 order-2">
          <a href="#" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a2e14' }}>{t.navHome}</a>
          <a
            href="#solutions"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('solutions')?.scrollIntoView({ behavior: 'smooth' });
              setTimeout(() => setSolutionsVisible(true), 300);
            }}
            style={{ fontSize: '0.875rem', fontWeight: 400, color: '#2d3b25', cursor: 'pointer' }}
          >{t.navSolutions}</a>
          <a
            href="#blog"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('blog')?.scrollIntoView({ behavior: 'smooth' });
              setTimeout(() => setBlogInView(true), 300);
            }}
            style={{ fontSize: '0.875rem', fontWeight: 400, color: '#2d3b25', cursor: 'pointer' }}
          >{t.navBlog}</a>
          <a
            href="#pricing"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
              setTimeout(() => setPricingInView(true), 300);
            }}
            style={{ fontSize: '0.875rem', fontWeight: 400, color: '#2d3b25', cursor: 'pointer' }}
          >{t.navPricing}</a>
          <button
            onClick={openModal}
            style={{ fontSize: '0.875rem', fontWeight: 400, color: '#2d3b25', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {t.navLogin}
          </button>
        </nav>

        <div className="flex items-center gap-3 order-first">
          <button
            onClick={toggleLanguage}
            style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '0.8125rem',
              fontWeight: 600, color: '#2A3B22', cursor: 'pointer',
              background: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.55)',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.60)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.35)'; }}
          >
            {t.langToggle}
          </button>
          <button
            onClick={openModal}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '0.875rem',
              fontWeight: 600, color: 'white', backgroundColor: '#1e2a45',
              border: 'none', cursor: 'pointer', transition: 'opacity 0.2s',
            }}
          >
            {t.navGetStarted}
          </button>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <main
        className="relative z-10 flex items-center justify-center"
        style={{ minHeight: 'calc(100vh - 116px)', padding: '40px 24px' }}
      >
        <div
          style={{
            position: 'relative', width: '100%', maxWidth: '520px',
            background: 'rgba(255,255,255,0.68)', backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)', borderRadius: '24px',
            padding: '52px 44px 44px',
            boxShadow: '0 8px 48px rgba(30,42,69,0.10), 0 1px 8px rgba(30,42,69,0.06)',
            border: '1px solid rgba(255,255,255,0.85)', textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#8899aa', letterSpacing: '0.04em', marginBottom: '16px' }}>
            {t.heroBadge}
          </p>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.7rem)', fontWeight: 800, color: '#1a2540', lineHeight: 1.22, marginBottom: '36px', fontFamily: 'Georgia, serif' }}>
            {t.heroTitle1}<br />
            {t.heroTitle2}
          </h1>
          <button
            onClick={openModal}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '13px 32px', borderRadius: '12px', fontSize: '1rem',
              fontWeight: 600, color: 'white', backgroundColor: '#517B3E',
              border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(81,123,62,0.38)',
              transition: 'opacity 0.2s, transform 0.1s',
            }}
          >
            {t.heroCta}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 3 12 9 6"/>
            </svg>
          </button>
        </div>

      </main>

      {/* ─── Solutions ─── */}
      <section ref={solutionsRef} id="solutions" className="relative z-10 py-24 px-6">
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <h2
            className={solutionsVisible ? 'animate-fade-scale-lift' : 'reveal-hidden'}
            style={{
              textAlign: 'center',
              fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
              fontWeight: 800,
              color: '#2A3B22',
              marginBottom: '56px',
              fontFamily: 'Georgia, serif',
              letterSpacing: '-0.01em',
            }}
          >
            {t.solutionsTitle}
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
              gap: '24px',
            }}
          >
            {/* Card 1 */}
            <div
              className={solutionsVisible ? 'animate-fade-scale-lift delay-fade' : 'reveal-hidden'}
              style={{
                '--delay': '0.1s',
                background: 'rgba(255,255,255,0.72)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px',
                padding: '32px 28px',
                border: '1px solid rgba(255,255,255,0.85)',
                boxShadow: '0 4px 24px rgba(30,42,69,0.07), 0 1px 4px rgba(30,42,69,0.04)',
              } as React.CSSProperties}
            >
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(81,123,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <MessagesSquare size={22} color="#517B3E" strokeWidth={1.8} />
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#2A3B22', marginBottom: '10px' }}>
                {t.card1Title}
              </h3>
              <p style={{ fontSize: '0.9375rem', color: '#4d5a3e', lineHeight: 1.65, margin: 0 }}>
                {t.card1Desc}
              </p>
            </div>

            {/* Card 2 */}
            <div
              className={solutionsVisible ? 'animate-fade-scale-lift delay-fade' : 'reveal-hidden'}
              style={{
                '--delay': '0.3s',
                background: 'rgba(255,255,255,0.72)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px',
                padding: '32px 28px',
                border: '1px solid rgba(255,255,255,0.85)',
                boxShadow: '0 4px 24px rgba(30,42,69,0.07), 0 1px 4px rgba(30,42,69,0.04)',
              } as React.CSSProperties}
            >
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(81,123,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <PenTool size={22} color="#517B3E" strokeWidth={1.8} />
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#2A3B22', marginBottom: '10px' }}>
                {t.card2Title}
              </h3>
              <p style={{ fontSize: '0.9375rem', color: '#4d5a3e', lineHeight: 1.65, margin: 0 }}>
                {t.card2Desc}
              </p>
            </div>

            {/* Card 3 */}
            <div
              className={solutionsVisible ? 'animate-fade-scale-lift delay-fade' : 'reveal-hidden'}
              style={{
                '--delay': '0.5s',
                background: 'rgba(255,255,255,0.72)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px',
                padding: '32px 28px',
                border: '1px solid rgba(255,255,255,0.85)',
                boxShadow: '0 4px 24px rgba(30,42,69,0.07), 0 1px 4px rgba(30,42,69,0.04)',
              } as React.CSSProperties}
            >
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(81,123,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <TrendingUp size={22} color="#517B3E" strokeWidth={1.8} />
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#2A3B22', marginBottom: '10px' }}>
                {t.card3Title}
              </h3>
              <p style={{ fontSize: '0.9375rem', color: '#4d5a3e', lineHeight: 1.65, margin: 0 }}>
                {t.card3Desc}
              </p>
            </div>

            {/* Card 4 */}
            <div
              className={solutionsVisible ? 'animate-fade-scale-lift delay-fade' : 'reveal-hidden'}
              style={{
                '--delay': '0.7s',
                background: 'rgba(255,255,255,0.72)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px',
                padding: '32px 28px',
                border: '1px solid rgba(255,255,255,0.85)',
                boxShadow: '0 4px 24px rgba(30,42,69,0.07), 0 1px 4px rgba(30,42,69,0.04)',
              } as React.CSSProperties}
            >
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(81,123,62,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <GraduationCap size={22} color="#517B3E" strokeWidth={1.8} />
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#2A3B22', marginBottom: '10px' }}>
                {t.card4Title}
              </h3>
              <p style={{ fontSize: '0.9375rem', color: '#4d5a3e', lineHeight: 1.65, margin: 0 }}>
                {t.card4Desc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Blog ─── */}
      <section ref={blogRef} id="blog" className="relative z-10 py-24 px-6">
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <h2
            className={blogInView ? 'animate-fade-scale-lift' : 'reveal-hidden'}
            style={{
              textAlign: 'center',
              fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
              fontWeight: 800,
              color: '#2A3B22',
              marginBottom: '56px',
              fontFamily: 'Georgia, serif',
              letterSpacing: '-0.01em',
            }}
          >
            {t.blogTitle}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {t.blogs.map((blog, idx) => (
              <div
                key={blog.id}
                className={`flex flex-col ${blogInView ? 'animate-fade-scale-lift delay-fade' : 'reveal-hidden'}`}
                style={{
                  '--delay': `${0.15 + idx * 0.15}s`,
                  background: 'rgba(253,252,249,0.60)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderRadius: '20px',
                  padding: '28px 24px 24px',
                  border: '1px solid #D9E2D1',
                  boxShadow: '0 2px 12px rgba(30,42,69,0.05)',
                } as React.CSSProperties}
              >
                <h3
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#2A3B22',
                    lineHeight: 1.45,
                    marginBottom: '14px',
                    flexGrow: 0,
                  }}
                >
                  {blog.title}
                </h3>
                <p
                  style={{
                    fontSize: '0.875rem',
                    color: '#5a6a52',
                    lineHeight: 1.7,
                    margin: 0,
                    flexGrow: 1,
                    marginBottom: '24px',
                  }}
                >
                  {blog.excerpt}
                </p>
                <button
                  onClick={() => setActiveBlogId(blog.id)}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#517B3E',
                    background: 'rgba(81,123,62,0.10)',
                    border: '1px solid rgba(81,123,62,0.25)',
                    cursor: 'pointer',
                    transition: 'background 0.2s, border-color 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.18)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(81,123,62,0.45)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.10)';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(81,123,62,0.25)';
                  }}
                >
                  {blog.readMore} →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section ref={pricingRef} id="pricing" className="relative z-10 py-24 px-6">
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <h2
            className={pricingInView ? 'animate-fade-scale-lift' : 'reveal-hidden'}
            style={{
              textAlign: 'center',
              fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
              fontWeight: 800,
              color: '#2A3B22',
              marginBottom: '56px',
              fontFamily: 'Georgia, serif',
              letterSpacing: '-0.01em',
            }}
          >
            {t.pricingTitle}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">

            {/* ── Basic (Free) ── */}
            <div
              dir={lang === 'he' ? 'rtl' : 'ltr'}
              className={`flex flex-col ${pricingInView ? 'animate-fade-scale-lift delay-fade' : 'reveal-hidden'}`}
              style={{
                '--delay': '0.1s',
                background: 'rgba(253,252,249,0.72)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px',
                padding: '32px 28px',
                border: '1px solid rgba(255,255,255,0.85)',
                boxShadow: '0 4px 24px rgba(30,42,69,0.07)',
              } as React.CSSProperties}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2A3B22', marginBottom: '8px' }}>
                {t.planBasic}
              </h3>
              <p dir="ltr" style={{ fontSize: '2rem', fontWeight: 800, color: '#2A3B22', marginBottom: '24px', lineHeight: 1 }}>
                {t.planBasicPrice}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
                {t.planBasicFeatures.map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#4d5a3e', direction: lang === 'he' ? 'rtl' : 'ltr' }}>
                    <Check size={15} color="#517B3E" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={openModal}
                style={{
                  marginTop: 'auto',
                  padding: '11px 0',
                  borderRadius: '10px',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  color: '#517B3E',
                  background: 'rgba(81,123,62,0.10)',
                  border: '1px solid rgba(81,123,62,0.30)',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  width: '100%',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.18)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.10)'; }}
              >
                {t.ctaButton}
              </button>
            </div>

            {/* ── Pro (Most Popular) ── */}
            <div
              dir={lang === 'he' ? 'rtl' : 'ltr'}
              className={`flex flex-col ${pricingInView ? 'animate-fade-scale-lift delay-fade' : 'reveal-hidden'}`}
              style={{
                '--delay': '0.25s',
                background: 'rgba(253,252,249,0.85)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px',
                padding: '32px 28px',
                border: '2px solid #517B3E',
                boxShadow: '0 8px 32px rgba(81,123,62,0.18), 0 2px 8px rgba(81,123,62,0.10)',
                position: 'relative',
              } as React.CSSProperties}
            >
              {/* Badge — always centred, direction-neutral */}
              <span style={{
                position: 'absolute',
                top: '-14px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#517B3E',
                color: 'white',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 14px',
                borderRadius: '99px',
                whiteSpace: 'nowrap',
                letterSpacing: '0.02em',
                direction: 'ltr',
              }}>
                {t.planProBadge}
              </span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2A3B22', marginBottom: '8px' }}>
                {t.planPro}
              </h3>
              <p dir="ltr" style={{ fontSize: '2rem', fontWeight: 800, color: '#517B3E', marginBottom: '24px', lineHeight: 1 }}>
                {t.planProPrice}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
                {t.planProFeatures.map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#3d4d35', direction: lang === 'he' ? 'rtl' : 'ltr' }}>
                    <Check size={15} color="#517B3E" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={openModal}
                style={{
                  marginTop: 'auto',
                  padding: '11px 0',
                  borderRadius: '10px',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  color: 'white',
                  background: '#517B3E',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                  width: '100%',
                  boxShadow: '0 4px 14px rgba(81,123,62,0.35)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
              >
                {t.ctaButton}
              </button>
            </div>

            {/* ── Semester Pass ── */}
            <div
              dir={lang === 'he' ? 'rtl' : 'ltr'}
              className={`flex flex-col ${pricingInView ? 'animate-fade-scale-lift delay-fade' : 'reveal-hidden'}`}
              style={{
                '--delay': '0.4s',
                background: 'rgba(253,252,249,0.72)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '20px',
                padding: '32px 28px',
                border: '1px solid rgba(255,255,255,0.85)',
                boxShadow: '0 4px 24px rgba(30,42,69,0.07)',
              } as React.CSSProperties}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2A3B22', marginBottom: '8px' }}>
                {t.planSemester}
              </h3>
              <p dir="ltr" style={{ fontSize: '2rem', fontWeight: 800, color: '#2A3B22', marginBottom: '4px', lineHeight: 1 }}>
                {t.planSemesterPrice}
              </p>
              <p style={{ fontSize: '0.78rem', color: '#517B3E', fontWeight: 600, marginBottom: '24px' }}>
                {t.planSemesterSave}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1 }}>
                {t.planProFeatures.map((f, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#4d5a3e', direction: lang === 'he' ? 'rtl' : 'ltr' }}>
                    <Check size={15} color="#517B3E" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={openModal}
                style={{
                  marginTop: 'auto',
                  padding: '11px 0',
                  borderRadius: '10px',
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  color: '#517B3E',
                  background: 'rgba(81,123,62,0.10)',
                  border: '1px solid rgba(81,123,62,0.30)',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  width: '100%',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.18)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.10)'; }}
              >
                {t.ctaButton}
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer
        className="relative z-20 flex items-center justify-between px-8 py-3"
        style={{ borderTop: '1px solid rgba(180,170,150,0.25)', backgroundColor: 'rgba(232,228,217,0.65)' }}
      >
        <div className="flex items-center gap-5">
          <a href="#" className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', color: '#777', textDecoration: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            {t.footerPricing}
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', color: '#777', textDecoration: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            {t.footerGithub}
          </a>
          <a href="#" className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', color: '#777', textDecoration: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {t.footerContact}
          </a>
          {/* ── TEMPORARY: admin verification trigger ── */}
          <button
            onClick={async () => {
              const token = localStorage.getItem('levy_ai_token');
              if (!token) {
                alert('No token found in localStorage.\nPlease log in first, then click this button.');
                return;
              }
              try {
                console.log('[VerifySystem] Calling /api/refresh-token…');
                const res = await fetch('http://127.0.0.1:5003/api/refresh-token', {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                console.log('[VerifySystem] Server response:', data);
                if (!res.ok) {
                  alert(`Server error ${res.status}:\n${JSON.stringify(data, null, 2)}`);
                  return;
                }
                if (data.is_admin && data.token) {
                  localStorage.setItem('levy_ai_token', data.token);
                  document.cookie = 'levy_ai_session=1; path=/; SameSite=Lax; max-age=86400';
                  alert(`Admin Verified! ✓\n\nRole: ${data.role}\nis_admin: ${data.is_admin}\n\nToken refreshed. Navigate to /admin.`);
                } else {
                  alert(`Token refreshed but you are NOT admin.\n\nRole: ${data.role}\nis_admin: ${data.is_admin}\n\nCheck the backend — your DB role may still be "user".`);
                }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[VerifySystem] Error:', err);
                alert(`Network Error: ${msg}\n\nCheck:\n• Is the Flask backend running on port 5003?\n• Run: source .venv/bin/activate && python app.py`);
              }
            }}
            style={{
              fontSize: '0.65rem', color: 'rgba(180,170,150,0.5)',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 4px', letterSpacing: '0.05em',
            }}
          >
            Verify System
          </button>
          {/* ── END TEMPORARY ── */}
        </div>
      </footer>

      {/* ─── Back to Top ─── */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
        className={`fixed bottom-8 right-8 z-50 transition-all duration-300 ${showTopBtn ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}`}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'rgba(157,192,139,0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.55)',
          boxShadow: '0 4px 16px rgba(42,59,34,0.20)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(157,192,139,1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(157,192,139,0.82)'; }}
      >
        <ChevronUp size={20} color="#2A3B22" strokeWidth={2.5} />
      </button>

      {/* ═══════════════════════════════════════════════════════════════════
          BLOG ARTICLE MODAL
      ═══════════════════════════════════════════════════════════════════ */}
      {activeBlogId !== null && (() => {
        const blog = t.blogs.find(b => b.id === activeBlogId);
        if (!blog) return null;
        return (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center overflow-y-auto py-8 px-4"
            onClick={() => setActiveBlogId(null)}
          >
            <div
              className="animate-slide-up-fade"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '660px',
                background: 'rgba(253,252,249,0.88)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderRadius: '24px',
                padding: '52px 44px 44px',
                boxShadow: '0 16px 64px rgba(30,42,69,0.18), 0 2px 8px rgba(30,42,69,0.08)',
                border: '1px solid rgba(255,255,255,0.85)',
              }}
            >
              {/* Close button */}
              <button
                onClick={() => setActiveBlogId(null)}
                aria-label="Close"
                style={{
                  position: 'absolute',
                  top: '18px',
                  right: '18px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(81,123,62,0.10)',
                  border: '1px solid rgba(81,123,62,0.20)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.20)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(81,123,62,0.10)'; }}
              >
                <X size={16} color="#2A3B22" strokeWidth={2.5} />
              </button>

              {/* Article content */}
              <h2
                style={{
                  fontSize: 'clamp(1.1rem, 3vw, 1.4rem)',
                  fontWeight: 800,
                  color: '#2A3B22',
                  lineHeight: 1.4,
                  marginBottom: '24px',
                  fontFamily: 'Georgia, serif',
                  paddingInlineEnd: '32px',
                }}
              >
                {blog.title}
              </h2>
              <p
                style={{
                  fontSize: '1rem',
                  color: '#3d4d35',
                  lineHeight: 1.8,
                  margin: 0,
                }}
              >
                {blog.fullText}
              </p>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════
          LOGIN MODAL
      ═══════════════════════════════════════════════════════════════════ */}
      {isLoginModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center overflow-y-auto py-8"
          style={{ animation: loginModalClosing ? 'overlay-exit 0.26s ease-in both' : 'overlay-enter 0.3s ease-out both' }}
          onClick={handleCloseLoginModal}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '440px',
              margin: '0 20px',
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: '24px',
              padding: '48px 44px 44px',
              boxShadow: '0 16px 64px rgba(30,42,69,0.22), 0 2px 12px rgba(30,42,69,0.10)',
              border: '1px solid rgba(255,255,255,0.88)',
              animation: loginModalClosing
                ? 'pricing-exit 0.22s cubic-bezier(0.4,0,0.6,1) both'
                : 'pricing-enter 0.38s cubic-bezier(0.16,1,0.3,1) both',
            }}
          >
            {isTransitioning ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0 36px', gap: '22px' }}>
                <div
                  className="animate-pulse"
                  style={{
                    width: 84, height: 84, borderRadius: '50%',
                    background: 'rgba(157,192,139,0.25)',
                    border: '2px solid rgba(81,123,62,0.40)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#517B3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e2a45', margin: 0 }}>{t.loginSuccess}</p>
                  <p style={{ fontSize: '0.875rem', color: '#9DC08B', fontWeight: 500, margin: 0 }}>{t.loginPreparing}</p>
                </div>
              </div>
            ) : (
              <>
            {/* X close button */}
            <button
              type="button"
              onClick={handleCloseLoginModal}
              className="active:scale-[0.88]"
              style={{
                position: 'absolute', top: '14px', right: '14px',
                width: '32px', height: '32px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.05)',
                border: 'none', cursor: 'pointer',
                color: '#6b7280', transition: 'background 0.15s, color 0.15s, transform 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.10)';
                (e.currentTarget as HTMLButtonElement).style.color = '#1a2540';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.05)';
                (e.currentTarget as HTMLButtonElement).style.color = '#6b7280';
              }}
            >
              <X size={16} strokeWidth={2.5} />
            </button>

            {forgotView ? (
              forgotView === 'sent' ? (
                /* ── Reset-link sent confirmation ── */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px', padding: '24px 0 8px' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(81,123,62,0.12)', border: '1.5px solid rgba(81,123,62,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#517B3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e2a45', margin: '0 0 8px' }}>{t.forgotSentTitle}</p>
                    <p style={{ fontSize: '0.9rem', color: '#5A6E4A', lineHeight: 1.6, margin: 0 }}>{t.forgotSentMsg}</p>
                    <p style={{ fontSize: '0.8125rem', color: '#8899aa', lineHeight: 1.5, marginTop: '6px' }}>{t.forgotSentSub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setForgotView(null); setForgotError(''); setMode('password'); }}
                    style={{ marginTop: '8px', fontSize: '0.875rem', fontWeight: 600, color: '#517B3E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                  >
                    {t.forgotBackToLogin}
                  </button>
                </div>
              ) : (
                /* ── Forgot: enter email ── */
                <>
                  <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e2a45', lineHeight: 1.2, marginBottom: '6px', fontFamily: 'Georgia, serif', textAlign: 'center' }}>
                    {t.forgotTitle}
                  </h1>
                  <p style={{ fontSize: '0.875rem', color: '#8899aa', textAlign: 'center', marginBottom: '28px' }}>
                    {t.forgotSubtitle}
                  </p>
                  {forgotError && (
                    <div style={{ marginBottom: '20px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.22)', color: '#b91c1c', fontSize: '0.8125rem', textAlign: 'center' }}>
                      {forgotError}
                    </div>
                  )}
                  <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <EmailField value={forgotEmail} onChange={setForgotEmail} label={t.forgotEmailLabel} />
                    <SubmitButton loading={forgotLoading} label={t.forgotSubmit} loadingLabel={t.forgotSubmitting} />
                  </form>
                  <div style={{ marginTop: '18px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => { setForgotView(null); setForgotError(''); }}
                      style={{ fontSize: '0.8125rem', color: '#517B3E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    >
                      ← {t.forgotBackToLogin}
                    </button>
                  </div>
                </>
              )
            ) : (<>

            {/* Title */}
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e2a45', lineHeight: 1.2, marginBottom: '6px', fontFamily: 'Georgia, serif', textAlign: 'center' }}>
              {t.loginTitle}
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#8899aa', textAlign: 'center', marginBottom: '28px' }}>
              {t.loginSubtitle}
            </p>

            {/* Tab toggle */}
            <div style={{ display: 'flex', background: 'rgba(232,227,215,0.85)', borderRadius: '12px', padding: '4px', marginBottom: '26px', gap: '3px' }}>
              {([
                { key: 'magic' as Mode, icon: (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                ), label: t.loginTabMagic },
                { key: 'password' as Mode, icon: (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                ), label: t.loginTabPassword },
              ] as { key: Mode; icon: React.ReactNode; label: string }[]).map(tab => {
                const active = mode === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => switchMode(tab.key)}
                    style={{
                      flex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      padding: '8px 12px', borderRadius: '9px',
                      fontSize: '0.8125rem',
                      fontWeight: active ? 600 : 400,
                      color: active ? '#1e2a45' : '#999',
                      background: active ? 'white' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      boxShadow: active ? '0 1px 5px rgba(30,42,69,0.10)' : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Network error */}
            {netError && (
              <div style={{
                marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '11px 14px', borderRadius: '11px',
                background: 'rgba(242,236,221,0.95)', border: '1px solid rgba(198,180,145,0.5)',
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a08050" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
                </svg>
                <span style={{ fontSize: '0.8125rem', color: '#7a6035', lineHeight: 1.4 }}>{t.loginNetErr}</span>
              </div>
            )}

            {/* Validation / server error */}
            {error && !netError && (
              <div style={{
                marginBottom: '20px', padding: '10px 14px', borderRadius: '10px',
                background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.22)',
                color: '#b91c1c', fontSize: '0.8125rem', textAlign: 'center',
              }}>
                {error}
              </div>
            )}

            {/* ── Magic-link: email step ── */}
            {mode === 'magic' && !magicSent && (
              <form onSubmit={handleMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <EmailField value={email} onChange={setEmail} label={t.loginEmailLabel} />
                <SubmitButton loading={loading} label={t.loginSendCode} loadingLabel={t.loginSending} />
              </form>
            )}

            {/* ── Magic-link: OTP step ── */}
            {mode === 'magic' && magicSent && (
              <div style={{ padding: '4px 0' }}>
                {/* Success badge */}
                <div style={{ textAlign: 'center', marginBottom: '22px' }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'rgba(81,123,62,0.12)', border: '1.5px solid rgba(81,123,62,0.30)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#517B3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <p style={{ fontSize: '1rem', fontWeight: 700, color: '#1e2a45', marginBottom: '5px' }}>{t.loginCheckInbox}</p>
                  <p style={{ fontSize: '0.8125rem', color: '#7a8a9a', lineHeight: 1.55 }}>
                    {t.loginCodeSentPrefix}<strong style={{ color: '#374151' }}>{email}</strong>
                  </p>
                </div>

                {/* 6-box OTP form — auto-submits when the 6th digit is entered */}
                <form onSubmit={e => { e.preventDefault(); void handleVerifyOtp(); }} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '18px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ ...LABEL_STYLE, textAlign: 'center' }}>{t.loginEnterCode}</label>
                    <div dir="ltr" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      {otpDigits.map((digit, i) => (
                        <input
                          key={i}
                          ref={el => { otpRefs.current[i] = el; }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={digit}
                          disabled={otpLoading}
                          autoComplete={i === 0 ? 'one-time-code' : 'off'}
                          className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl outline-none transition-all"
                          style={{
                            borderColor: otpLoading ? '#527C40' : (digit ? '#527C40' : 'rgba(200,190,170,0.75)'),
                            background: otpLoading ? 'rgba(82,124,64,0.12)' : (digit ? 'rgba(82,124,64,0.08)' : 'rgba(255,255,255,0.75)'),
                            color: '#1a2540',
                            opacity: otpLoading ? 0.8 : 1,
                          }}
                          onChange={e => {
                            const d = e.target.value.replace(/\D/g, '').slice(-1);
                            const next = [...otpDigits];
                            next[i] = d;
                            setOtpDigits(next);
                            if (d && i < 5) otpRefs.current[i + 1]?.focus();
                            if (d && next.every(v => v !== '')) void handleVerifyOtp(next.join(''));
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Backspace' && !otpDigits[i] && i > 0) {
                              otpRefs.current[i - 1]?.focus();
                            } else if (e.key === 'ArrowLeft' && i > 0) {
                              e.preventDefault();
                              otpRefs.current[i - 1]?.focus();
                            } else if (e.key === 'ArrowRight' && i < 5) {
                              e.preventDefault();
                              otpRefs.current[i + 1]?.focus();
                            }
                          }}
                          onPaste={e => {
                            e.preventDefault();
                            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                            if (!pasted) return;
                            const next = Array(6).fill('');
                            for (let j = 0; j < pasted.length; j++) next[j] = pasted[j];
                            setOtpDigits(next);
                            otpRefs.current[Math.min(pasted.length, 5)]?.focus();
                            if (pasted.length === 6) void handleVerifyOtp(next.join(''));
                          }}
                          onFocus={e => {
                            if (!otpLoading) {
                              e.target.style.borderColor = '#527C40';
                              e.target.style.boxShadow = '0 0 0 3px rgba(82,124,64,0.18)';
                            }
                          }}
                          onBlur={e => {
                            e.target.style.borderColor = (otpLoading || digit) ? '#527C40' : 'rgba(200,190,170,0.75)';
                            e.target.style.boxShadow = 'none';
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  {otpLoading && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                      <div className="w-4 h-4 rounded-full border-2 border-[#517B3E] border-t-transparent animate-spin" />
                      <span style={{ fontSize: '0.8125rem', color: '#517B3E', fontWeight: 500 }}>{t.loginVerifying}</span>
                    </div>
                  )}
                </form>

                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => { setMagicSent(false); setOtpDigits(Array(6).fill('')); clearErrors(); }}
                    style={{ fontSize: '0.8125rem', color: '#517B3E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                  >
                    {t.loginResend}
                  </button>
                </div>
              </div>
            )}

            {/* ── Password form ── */}
            {mode === 'password' && (
              <form onSubmit={handlePassword} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <EmailField value={email} onChange={setEmail} label={t.loginEmailLabel} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={LABEL_STYLE}>{t.loginPasswordLabel}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    style={INPUT_STYLE}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </div>
                <SubmitButton loading={loading} label={t.loginSignIn} loadingLabel={t.loginSigningIn} />
                <div style={{ textAlign: 'center', marginTop: '2px' }}>
                  <button
                    type="button"
                    onClick={() => { setForgotView('email'); setForgotEmail(email); setError(''); setNetError(false); }}
                    style={{ fontSize: '0.8125rem', color: '#517B3E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                  >
                    {t.forgotLink}
                  </button>
                </div>
              </form>
            )}

            {/* Register link */}
            {!magicSent && (
              <div style={{ marginTop: '22px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{t.loginNoAccount}{' '}</span>
                <button
                  type="button"
                  onClick={openRegisterModal}
                  style={{
                    fontSize: '0.8125rem',
                    color: '#517B3E',
                    textDecoration: 'underline',
                    textUnderlineOffset: '2px',
                    fontWeight: 600,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {t.loginRegisterLink}
                </button>
              </div>
            )}
              </>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          REGISTER MODAL — 3-step wizard
      ═══════════════════════════════════════════════════════════════════ */}
      {isRegisterModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-center overflow-y-auto py-8"
          style={{ animation: registerModalClosing ? 'overlay-exit 0.26s ease-in both' : 'overlay-enter 0.3s ease-out both' }}
          onClick={handleCloseRegisterModal}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '440px',
              margin: '0 20px',
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: '24px',
              padding: '48px 44px 44px',
              boxShadow: '0 16px 64px rgba(30,42,69,0.22), 0 2px 12px rgba(30,42,69,0.10)',
              border: '1px solid rgba(255,255,255,0.88)',
              animation: registerModalClosing
                ? 'pricing-exit 0.22s cubic-bezier(0.4,0,0.6,1) both'
                : 'pricing-enter 0.38s cubic-bezier(0.16,1,0.3,1) both',
            }}
          >
            {/* Close */}
            <button
              type="button"
              onClick={handleCloseRegisterModal}
              className="active:scale-[0.88]"
              style={{
                position: 'absolute', top: '14px', right: '14px',
                width: '32px', height: '32px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '8px', background: 'rgba(0,0,0,0.05)',
                border: 'none', cursor: 'pointer',
                color: '#6b7280', transition: 'background 0.15s, color 0.15s, transform 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.10)';
                (e.currentTarget as HTMLButtonElement).style.color = '#1a2540';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.05)';
                (e.currentTarget as HTMLButtonElement).style.color = '#6b7280';
              }}
            >
              <X size={16} strokeWidth={2.5} />
            </button>

            {/* Title */}
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e2a45', lineHeight: 1.2, marginBottom: '6px', fontFamily: 'Georgia, serif', textAlign: 'center' }}>
              {regStep === 2 ? t.regVerifyTitle : regStep === 3 ? t.regGenderTitle : t.regTitle}
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#8899aa', textAlign: 'center', marginBottom: '24px' }}>
              {regStep === 1 && t.regStep1Sub}
              {regStep === 2 && t.regStep2Sub}
              {regStep === 3 && t.regGenderSub}
              {regStep === 4 && t.regStep3Sub}
              {regStep === 5 && t.regStep4Sub}
            </p>

            {/* Progress dots — 5 steps */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '28px' }}>
              {[1, 2, 3, 4, 5].map((s, i) => (
                <React.Fragment key={s}>
                  <div style={{
                    width:  regStep === s ? '12px' : '8px',
                    height: regStep === s ? '12px' : '8px',
                    borderRadius: '50%',
                    backgroundColor: regStep >= s ? '#517B3E' : 'rgba(200,190,170,0.5)',
                    transition: 'all 0.25s',
                    boxShadow: regStep === s ? '0 0 0 4px rgba(81,123,62,0.20)' : 'none',
                    flexShrink: 0,
                  }} />
                  {i < 4 && (
                    <div style={{
                      width: '28px', height: '2px',
                      backgroundColor: regStep > s ? '#517B3E' : 'rgba(200,190,170,0.5)',
                      transition: 'background-color 0.3s',
                      margin: '0 4px',
                      flexShrink: 0,
                    }} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Error */}
            {regError && (
              <div style={{
                marginBottom: '18px', padding: '10px 14px', borderRadius: '10px',
                background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.22)',
                color: '#b91c1c', fontSize: '0.8125rem', textAlign: 'center',
              }}>
                {regError}
              </div>
            )}

            {/* ── Step 3: Gender Selection ── */}
            {regStep === 3 && (
              <div className="animate-slide-up-fade" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Male + Female cards side by side */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  {(['male', 'female'] as const).map(g => {
                    const sel = regGender === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => { setRegGender(g); setRegError(''); }}
                        style={{
                          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                          gap: '10px', padding: '16px 10px 14px',
                          borderRadius: '16px', position: 'relative',
                          border: `2px solid ${sel ? '#517B3E' : 'rgba(200,190,170,0.60)'}`,
                          background: sel ? 'rgba(81,123,62,0.07)' : 'rgba(255,255,255,0.60)',
                          cursor: 'pointer',
                          boxShadow: sel ? '0 4px 20px rgba(81,123,62,0.22)' : '0 2px 8px rgba(0,0,0,0.04)',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => {
                          if (!sel) {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(81,123,62,0.40)';
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.80)';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                          }
                        }}
                        onMouseLeave={e => {
                          if (!sel) {
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,190,170,0.60)';
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.60)';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                          }
                        }}
                      >
                        {/* Radio circle */}
                        <div style={{
                          position: 'absolute', top: '10px',
                          insetInlineEnd: '10px',
                          width: '18px', height: '18px', borderRadius: '50%',
                          border: `2px solid ${sel ? '#517B3E' : 'rgba(200,190,170,0.80)'}`,
                          background: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'border-color 0.2s', flexShrink: 0,
                        }}>
                          {sel && <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#517B3E' }} />}
                        </div>
                        {/* Avatar */}
                        <div style={{ width: '120px', height: '120px' }}>
                          {g === 'male' ? <MaleAvatar /> : <FemaleAvatar />}
                        </div>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: sel ? '#2A3B22' : '#374151' }}>
                          {g === 'male' ? t.regGenderMale : t.regGenderFemale}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Other / Prefer not to say — full-width bar */}
                {(() => {
                  const sel = regGender === 'other';
                  return (
                    <button
                      type="button"
                      onClick={() => { setRegGender('other'); setRegError(''); }}
                      style={{
                        width: '100%', padding: '13px 16px',
                        borderRadius: '14px',
                        border: `1.5px solid ${sel ? '#517B3E' : 'rgba(200,190,170,0.60)'}`,
                        background: sel ? 'rgba(81,123,62,0.07)' : 'rgba(255,255,255,0.50)',
                        cursor: 'pointer', textAlign: 'start',
                        display: 'flex', alignItems: 'center', gap: '14px',
                        transition: 'all 0.2s',
                        boxShadow: sel ? '0 2px 12px rgba(81,123,62,0.15)' : 'none',
                      }}
                      onMouseEnter={e => {
                        if (!sel) {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(81,123,62,0.35)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.75)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!sel) {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,190,170,0.60)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.50)';
                        }
                      }}
                    >
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${sel ? '#517B3E' : 'rgba(200,190,170,0.80)'}`,
                        background: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'border-color 0.2s',
                      }}>
                        {sel && <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#517B3E' }} />}
                      </div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', margin: 0, flex: 1 }}>
                        {t.regGenderOther}
                      </p>
                    </button>
                  );
                })()}

                {/* Continue — full width */}
                <button
                  type="button"
                  disabled={!regGender}
                  onClick={() => {
                    if (!regGender) { setRegError(t.errNoGender); return; }
                    setRegError('');
                    setRegStep(4);
                  }}
                  className="active:scale-[0.97]"
                  style={{
                    marginTop: '6px', width: '100%',
                    padding: '13px', borderRadius: '12px',
                    fontSize: '0.9375rem', fontWeight: 600, color: 'white',
                    backgroundColor: regGender ? '#2A3B22' : 'rgba(175,175,165,0.70)',
                    border: 'none', cursor: regGender ? 'pointer' : 'not-allowed',
                    boxShadow: regGender ? '0 4px 18px rgba(42,59,34,0.32)' : 'none',
                    transition: 'background-color 0.2s, box-shadow 0.2s, transform 0.1s',
                  }}
                >
                  {t.regContinue}
                </button>
              </div>
            )}

            {/* ── Step 1: Email → send OTP ── */}
            {regStep === 1 && (
              <form onSubmit={handleRegStep1} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={LABEL_STYLE}>{t.regEmailLabel}</label>
                  <input
                    type="email" value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    placeholder="you@example.com" required dir="ltr" autoComplete="email"
                    style={INPUT_STYLE} onFocus={focusInput} onBlur={blurInput}
                  />
                </div>
                <button
                  type="submit"
                  disabled={regLoading}
                  style={{
                    marginTop: '8px', width: '100%',
                    padding: '13px 32px', borderRadius: '12px',
                    fontSize: '1rem', fontWeight: 600, color: 'white',
                    backgroundColor: regLoading ? '#6B9053' : '#517B3E',
                    border: 'none', cursor: regLoading ? 'not-allowed' : 'pointer',
                    boxShadow: regLoading ? 'none' : '0 4px 16px rgba(81,123,62,0.38)',
                    transition: 'background-color 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                  }}
                >
                  {regLoading && (
                    <span className="animate-spin" style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: 'white', display: 'inline-block', flexShrink: 0 }} />
                  )}
                  {regLoading ? t.loginSending : t.regSendCode}
                </button>
                <button type="button" onClick={() => { closeRegisterModal(); setIsLoginModalOpen(true); }}
                  style={{ fontSize: '0.8125rem', color: '#8899aa', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center' }}>
                  ← {t.regBack}
                </button>
              </form>
            )}

            {/* ── Step 2: Verify OTP ── */}
            {regStep === 2 && (
              <div style={{ padding: '4px 0' }}>
                <div style={{ textAlign: 'center', marginBottom: '22px' }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'rgba(81,123,62,0.12)', border: '1.5px solid rgba(81,123,62,0.30)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                  }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#517B3E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </div>
                  <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e2a45', marginBottom: '6px' }}>{t.regVerifyMsg}</p>
                  <p style={{ fontSize: '0.8125rem', color: '#7a8a9a', lineHeight: 1.6 }}>{t.regVerifyCheck}</p>
                </div>

                <form onSubmit={e => { e.preventDefault(); void handleRegStep2(); }} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ ...LABEL_STYLE, textAlign: 'center' }}>{t.loginEnterCode}</label>
                    <div dir="ltr" style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      {regOtpDigits.map((digit, i) => (
                        <input
                          key={i}
                          ref={el => { regOtpRefs.current[i] = el; }}
                          type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1}
                          value={digit}
                          disabled={regLoading}
                          autoComplete={i === 0 ? 'one-time-code' : 'off'}
                          className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl outline-none transition-all"
                          style={{
                            borderColor: regLoading ? '#527C40' : (digit ? '#527C40' : 'rgba(200,190,170,0.75)'),
                            background: regLoading ? 'rgba(82,124,64,0.12)' : (digit ? 'rgba(82,124,64,0.08)' : 'rgba(255,255,255,0.75)'),
                            color: '#1a2540',
                            opacity: regLoading ? 0.8 : 1,
                          }}
                          onChange={e => {
                            const d = e.target.value.replace(/\D/g, '').slice(-1);
                            const next = [...regOtpDigits]; next[i] = d; setRegOtpDigits(next);
                            if (d && i < 5) regOtpRefs.current[i + 1]?.focus();
                            if (d && next.every(v => v !== '')) void handleRegStep2(next.join(''));
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Backspace' && !regOtpDigits[i] && i > 0) { regOtpRefs.current[i - 1]?.focus(); }
                            else if (e.key === 'ArrowLeft'  && i > 0) { e.preventDefault(); regOtpRefs.current[i - 1]?.focus(); }
                            else if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); regOtpRefs.current[i + 1]?.focus(); }
                          }}
                          onPaste={e => {
                            e.preventDefault();
                            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                            if (!pasted) return;
                            const next = Array(6).fill('');
                            for (let j = 0; j < pasted.length; j++) next[j] = pasted[j];
                            setRegOtpDigits(next);
                            regOtpRefs.current[Math.min(pasted.length, 5)]?.focus();
                            if (pasted.length === 6) void handleRegStep2(next.join(''));
                          }}
                          onFocus={e => {
                            if (!regLoading) { e.target.style.borderColor = '#527C40'; e.target.style.boxShadow = '0 0 0 3px rgba(82,124,64,0.18)'; }
                          }}
                          onBlur={e => {
                            e.target.style.borderColor = (regLoading || digit) ? '#527C40' : 'rgba(200,190,170,0.75)';
                            e.target.style.boxShadow = 'none';
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  {regLoading && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                      <div className="w-4 h-4 rounded-full border-2 border-[#517B3E] border-t-transparent animate-spin" />
                      <span style={{ fontSize: '0.8125rem', color: '#517B3E', fontWeight: 500 }}>{t.loginVerifying}</span>
                    </div>
                  )}
                </form>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" onClick={() => { setRegStep(1); setRegError(''); setRegOtpDigits(Array(6).fill('')); }}
                    style={{ fontSize: '0.8125rem', color: '#8899aa', background: 'none', border: 'none', cursor: 'pointer' }}>
                    ← {t.regBack}
                  </button>
                  <button type="button" onClick={handleRegResend}
                    style={{ fontSize: '0.8125rem', color: '#517B3E', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                    {t.regVerifyResend}
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 4: Personal details (name only) ── */}
            {regStep === 4 && (
              <form onSubmit={handleRegStep3} className="animate-slide-up-fade" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={LABEL_STYLE}>{t.regFirstName}</label>
                    <input type="text" value={regFirstName} onChange={e => setRegFirstName(e.target.value)}
                      placeholder={t.regFirstNamePh} required autoComplete="given-name"
                      style={INPUT_STYLE} onFocus={focusInput} onBlur={blurInput} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={LABEL_STYLE}>{t.regLastName}</label>
                    <input type="text" value={regLastName} onChange={e => setRegLastName(e.target.value)}
                      placeholder={t.regLastNamePh} required autoComplete="family-name"
                      style={INPUT_STYLE} onFocus={focusInput} onBlur={blurInput} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button type="submit"
                    className="active:scale-[0.97]"
                    style={{
                      flex: 1, padding: '13px', borderRadius: '12px',
                      fontSize: '0.9375rem', fontWeight: 600, color: 'white',
                      backgroundColor: '#517B3E',
                      border: 'none', cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(81,123,62,0.35)',
                      transition: 'background-color 0.2s, transform 0.1s',
                    }}
                  >
                    {t.regContinue}
                  </button>
                  <button type="button" onClick={() => { setRegStep(3); setRegError(''); setRegOtpDigits(Array(6).fill('')); }}
                    className="active:scale-[0.97]"
                    style={{
                      flex: 1, padding: '13px', borderRadius: '12px',
                      fontSize: '0.9375rem', fontWeight: 500, color: '#4b5563',
                      backgroundColor: 'transparent', border: '1.5px solid rgba(200,190,170,0.75)',
                      cursor: 'pointer', transition: 'background-color 0.15s, transform 0.1s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(232,228,217,0.6)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                  >
                    {t.regBack}
                  </button>
                </div>
              </form>
            )}

            {/* ── Step 5: Security (password only) → submit ── */}
            {regStep === 5 && (
              <form onSubmit={handleRegStep4} className="animate-slide-up-fade" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={LABEL_STYLE}>{t.regPassword}</label>
                  <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)}
                    placeholder={t.regPasswordPh} required autoComplete="new-password"
                    style={INPUT_STYLE} onFocus={focusInput} onBlur={blurInput} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={LABEL_STYLE}>{t.regPasswordConfirm}</label>
                  <input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)}
                    placeholder={t.regPasswordConfirmPh} required autoComplete="new-password"
                    style={{
                      ...INPUT_STYLE,
                      borderColor: regConfirm && regConfirm !== regPassword ? 'rgba(220,38,38,0.5)' : 'rgba(200,190,170,0.75)',
                    }}
                    onFocus={focusInput} onBlur={blurInput} />
                  {regConfirm && regConfirm !== regPassword && (
                    <span style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '2px' }}>{t.regPasswordMismatch}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button type="submit" disabled={regLoading}
                    className="active:scale-[0.97]"
                    style={{
                      flex: 1, padding: '13px', borderRadius: '12px',
                      fontSize: '0.9375rem', fontWeight: 600, color: 'white',
                      backgroundColor: regLoading ? '#6B9053' : '#517B3E',
                      border: 'none', cursor: regLoading ? 'not-allowed' : 'pointer',
                      boxShadow: regLoading ? 'none' : '0 4px 16px rgba(81,123,62,0.35)',
                      transition: 'background-color 0.2s, transform 0.1s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                    }}
                  >
                    {regLoading && (
                      <span className="animate-spin" style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: 'white', display: 'inline-block', flexShrink: 0 }} />
                    )}
                    {regLoading ? t.regSubmitting : t.regSubmit}
                  </button>
                  <button type="button" onClick={() => { setRegStep(4); setRegError(''); }}
                    className="active:scale-[0.97]"
                    style={{
                      flex: 1, padding: '13px', borderRadius: '12px',
                      fontSize: '0.9375rem', fontWeight: 500, color: '#4b5563',
                      backgroundColor: 'transparent', border: '1.5px solid rgba(200,190,170,0.75)',
                      cursor: 'pointer', transition: 'background-color 0.15s, transform 0.1s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(232,228,217,0.6)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
                  >
                    {t.regBack}
                  </button>
                </div>
              </form>
            )}

            {/* Login link */}
            <div style={{ marginTop: '22px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{t.regHasAccount}{' '}</span>
              <button
                type="button"
                onClick={() => { closeRegisterModal(); setIsLoginModalOpen(true); }}
                style={{
                  fontSize: '0.8125rem', color: '#517B3E',
                  textDecoration: 'underline', textUnderlineOffset: '2px',
                  fontWeight: 600, background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0,
                }}
              >
                {t.regSignInLink}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
