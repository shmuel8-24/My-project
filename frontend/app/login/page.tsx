'use client';

import { useState, useEffect, useRef, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

const API = 'http://127.0.0.1:5003';
type Lang = 'he' | 'en';
type Step = 1 | 2 | 3;
type View = 'landing' | 'auth';

/* ─── Logo mark ─────────────────────────────────────────────────────────────── */
function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="#FDFCF8"/>
      <rect width="40" height="40" rx="9" stroke="rgba(107,144,74,0.35)" strokeWidth="1.5" fill="none"/>
      <path d="M9 7 L9 26 C9 35 31 35 31 26 L31 7 L25 7 L25 26 C25 30 15 30 15 26 L15 7 Z" fill="#6B904A"/>
    </svg>
  );
}

/* ─── Orbit item ─────────────────────────────────────────────────────────────── */
interface OrbitItemProps {
  ring: 'outer' | 'middle' | 'inner';
  period: number;   // animation duration in seconds
  delay: number;    // animation delay (negative = already in motion)
  glow: string;     // rgba color for box-shadow
  children: React.ReactNode;
}
function OrbitItem({ ring, period, delay, glow, children }: OrbitItemProps) {
  // Wrapper: sits at center (0,0), rotates → sweeps a circle
  // Child: offset by radius + counter-rotates so it stays upright
  const counterAnim = ring === 'outer' ? 'orbit-counter-outer'
    : ring === 'middle' ? 'orbit-counter-middle' : 'orbit-counter-inner';

  const wrapStyle: CSSProperties = {
    position: 'absolute', top: '50%', left: '50%', width: 0, height: 0,
    animation: `orbit-spin ${period}s linear infinite`,
    animationDelay: `${delay}s`,
    willChange: 'transform',
  };
  const itemStyle: CSSProperties = {
    position: 'absolute',
    animation: `${counterAnim} ${period}s linear infinite`,
    animationDelay: `${delay}s`,
    willChange: 'transform',
    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.1))',
  };
  return (
    <div style={wrapStyle}>
      <div style={itemStyle}>
        {children}
      </div>
    </div>
  );
}

/* ─── Academic SVG icons (lucide-style) ──────────────────────────────────────── */
function IcoGradCap({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
      <path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>
  );
}
function IcoFileText({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  );
}
function IcoPenTool({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19 7-7 3 3-7 7-3-3z"/>
      <path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
      <path d="m2 2 7.586 7.586"/>
      <circle cx="11" cy="11" r="2"/>
    </svg>
  );
}
function IcoBookOpen({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  );
}
function IcoAward({ s = 20 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6"/>
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  );
}

/* ─── Circular tool badge ─────────────────────────────────────────────────────── */
function ToolBadge({ children, bg, border, size = 44, label, color }: {
  children: React.ReactNode; bg: string; border: string; size?: number; label?: string; color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 cursor-default select-none">
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: bg, border: `1.5px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        color: color ?? '#1E293B',
      }}>
        {children}
      </div>
      {label && (
        <span className="text-[8px] font-semibold text-stone-400 leading-none tracking-wide">{label}</span>
      )}
    </div>
  );
}

/* ─── Student persona chip (floating identity pill) ─────────────────────────── */
function StudentChip({ name, initials }: { name: string; initials: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-full cursor-default select-none whitespace-nowrap"
      style={{
        background: '#FDFCF8',
        border: '1px solid #D6CBB9',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}>
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
        style={{ background: '#6B904A' }}>
        {initials}
      </div>
      <span className="text-[12px] font-semibold text-slate-700">{name}</span>
      <div className="w-2 h-2 rounded-full bg-[#6B904A] shrink-0" />
    </div>
  );
}

/* ─── Orbit visualization (kept for reuse) ───────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function OrbitVisualization() {
  const outerP = 42;
  const midP   = 28;
  const innerP = 17;

  const od = (p: number, deg: number) => -(p * deg / 360);

  return (
    <div className="relative" style={{ width: 500, height: 500 }}>

      {/* ── Organic botanical background blobs ── */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 500 500" fill="none">
        {/* Large leaf/teardrop shape — upper-right */}
        <path d="M320 60 C410 40 460 130 430 220 C400 310 310 350 260 300 C210 250 230 140 280 90 C295 72 308 62 320 60Z"
          fill="rgba(107,144,74,0.09)" />
        {/* Secondary organic blob — lower-left */}
        <path d="M80 310 C55 265 85 195 140 195 C195 195 230 250 220 310 C210 370 155 400 115 380 C75 360 100 350 80 310Z"
          fill="rgba(180,155,110,0.07)" />
        {/* Small accent oval — lower-right */}
        <ellipse cx="390" cy="360" rx="55" ry="72" fill="rgba(107,144,74,0.06)" transform="rotate(-20 390 360)" />
        {/* Tiny leaf — upper-left area */}
        <path d="M110 130 C95 100 120 70 150 80 C180 90 190 120 170 145 C150 170 120 155 110 130Z"
          fill="rgba(160,140,100,0.06)" />
      </svg>

      {/* ── Ghost-thin orbit rings ── */}
      {/* Outer ring */}
      <div className="absolute top-1/2 left-1/2 rounded-full pointer-events-none"
        style={{ width: 460, height: 460, transform: 'translate(-50%,-50%)',
          border: '0.75px solid rgba(107,144,74,0.16)',
        }} />
      {/* Middle ring */}
      <div className="absolute top-1/2 left-1/2 rounded-full pointer-events-none"
        style={{ width: 306, height: 306, transform: 'translate(-50%,-50%)',
          border: '0.75px dashed rgba(107,144,74,0.12)',
        }} />
      {/* Inner ring */}
      <div className="absolute top-1/2 left-1/2 rounded-full pointer-events-none"
        style={{ width: 174, height: 174, transform: 'translate(-50%,-50%)',
          border: '0.75px solid rgba(107,144,74,0.10)',
        }} />

      {/* ── Center: U-Note logo mark ── */}
      <div className="absolute top-1/2 left-1/2 animate-float flex items-center justify-center"
        style={{ transform: 'translate(-50%,-50%)',
          width: 58, height: 58,
          background: '#FDFCF8',
          border: '1px solid #D6CBB9',
          borderRadius: 14,
          boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
        }}>
        <svg width={26} height={26} viewBox="0 0 40 40" fill="none">
          <path d="M9 7 L9 26 C9 35 31 35 31 26 L31 7 L25 7 L25 26 C25 30 15 30 15 26 L15 7 Z" fill="#6B904A"/>
        </svg>
      </div>

      {/* ══════════════════════════════════════════════
          OUTER ORBIT — period 42s
          Mix: 2 icon badges + 1 persona chip
      ══════════════════════════════════════════════ */}

      {/* GraduationCap — 0° */}
      <OrbitItem ring="outer" period={outerP} delay={od(outerP, 0)} glow="">
        <ToolBadge size={48} label="Grad" bg="#FDFCF8" border="#D6CBB9" color="#6B904A">
          <IcoGradCap s={22} />
        </ToolBadge>
      </OrbitItem>

      {/* Persona chip "Sara Cohen" — 115° */}
      <OrbitItem ring="outer" period={outerP} delay={od(outerP, 115)} glow="">
        <StudentChip name="Sara Cohen" initials="SC" />
      </OrbitItem>

      {/* BookOpen — 240° */}
      <OrbitItem ring="outer" period={outerP} delay={od(outerP, 240)} glow="">
        <ToolBadge size={48} label="Book" bg="#FDFCF8" border="#D6CBB9" color="#6B904A">
          <IcoBookOpen s={22} />
        </ToolBadge>
      </OrbitItem>

      {/* ══════════════════════════════════════════════
          MIDDLE ORBIT — period 28s
          Mix: 2 icon badges + 1 persona chip + 1 icon
      ══════════════════════════════════════════════ */}

      {/* FileText — 0° */}
      <OrbitItem ring="middle" period={midP} delay={od(midP, 0)} glow="">
        <ToolBadge size={44} label="Paper" bg="#FDFCF8" border="#D6CBB9" color="#6B904A">
          <IcoFileText s={20} />
        </ToolBadge>
      </OrbitItem>

      {/* Persona chip "Levi Bar" — 85° */}
      <OrbitItem ring="middle" period={midP} delay={od(midP, 85)} glow="">
        <StudentChip name="Levi Bar" initials="LB" />
      </OrbitItem>

      {/* PenTool — 180° */}
      <OrbitItem ring="middle" period={midP} delay={od(midP, 180)} glow="">
        <ToolBadge size={44} label="Write" bg="#FDFCF8" border="#D6CBB9" color="#6B904A">
          <IcoPenTool s={20} />
        </ToolBadge>
      </OrbitItem>

      {/* Award — 270° */}
      <OrbitItem ring="middle" period={midP} delay={od(midP, 270)} glow="">
        <ToolBadge size={44} label="Award" bg="#FDFCF8" border="#D6CBB9" color="#6B904A">
          <IcoAward s={20} />
        </ToolBadge>
      </OrbitItem>

      {/* ══════════════════════════════════════════════
          INNER ORBIT — period 17s
      ══════════════════════════════════════════════ */}

      {/* U-Note logo — 0° (inner) */}
      <OrbitItem ring="inner" period={innerP} delay={od(innerP, 0)} glow="">
        <ToolBadge size={36} bg="#FDFCF8" border="#D6CBB9">
          <svg width={16} height={16} viewBox="0 0 40 40" fill="none">
            <path d="M9 7 L9 26 C9 35 31 35 31 26 L31 7 L25 7 L25 26 C25 30 15 30 15 26 L15 7 Z" fill="#6B904A"/>
          </svg>
        </ToolBadge>
      </OrbitItem>

      {/* GradCap small — 180° (inner) */}
      <OrbitItem ring="inner" period={innerP} delay={od(innerP, 180)} glow="">
        <ToolBadge size={36} bg="#FDFCF8" border="#D6CBB9" color="#6B904A">
          <IcoGradCap s={15} />
        </ToolBadge>
      </OrbitItem>
    </div>
  );
}

/* ─── Auth modal ─────────────────────────────────────────────────────────────── */
interface AuthModalProps {
  lang: Lang;
  onClose: () => void;
  onSuccess: () => void;
}

function AuthModal({ lang, onClose, onSuccess }: AuthModalProps) {
  const [step,           setStep]           = useState<Step>(1);
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

  const t = {
    he: {
      heading1: 'התחבר או צור חשבון', heading2: 'קצת עליך', heading3: 'אימות זהות',
      sub1: 'הזן אימייל להמשך. אם אין לך חשבון, ניצור עבורך אחד בשלב הבא.', sub2: 'ספר לנו מי אתה', sub3: 'הזן את הקוד החד-פעמי',
      emailLabel: 'אימייל', emailPh: 'you@example.com', continueBtn: 'המשך', checking: 'בודק...',
      firstNameLabel: 'שם פרטי', firstNamePh: 'ישראל', lastNameLabel: 'שם משפחה', lastNamePh: 'ישראלי',
      sendCode: 'שלח קוד', sending: 'שולח...', errNameRequired: 'יש להזין שם ושם משפחה.',
      codeSentTo: 'שלחנו קוד ל-', devHint: 'מצב פיתוח: הקוד בטרמינל',
      verify: 'אמת', verifying_: 'מאמת...', resend: 'שלח קוד חדש', resendIn: 'שלח שוב בעוד',
      emailErrInvalid: 'אימייל לא תקין.', errOtpIncomplete: 'הזן 6 ספרות.',
      serverErr: 'שגיאת שרת – בדוק שה-backend פועל על פורט 5003.',
    },
    en: {
      heading1: 'Login or Register', heading2: 'About You', heading3: 'Verification',
      sub1: "Enter your email to continue. If you don't have an account, we will create one for you.", sub2: 'Tell us a bit about yourself', sub3: 'Enter the 6-digit code',
      emailLabel: 'Email', emailPh: 'you@example.com', continueBtn: 'Continue', checking: 'Checking…',
      firstNameLabel: 'First name', firstNamePh: 'John', lastNameLabel: 'Last name', lastNamePh: 'Smith',
      sendCode: 'Send Code', sending: 'Sending…', errNameRequired: 'Please enter first and last name.',
      codeSentTo: 'We sent a code to', devHint: 'Dev: check server terminal',
      verify: 'Verify', verifying_: 'Verifying…', resend: 'Send new code', resendIn: 'Resend in',
      emailErrInvalid: 'Invalid email.', errOtpIncomplete: 'Enter all 6 digits.',
      serverErr: 'Server error — check that the backend is running on port 5003.',
    },
  }[lang];

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const goTo = (s: Step) => {
    setError(''); setAnimating(true);
    setTimeout(() => {
      setStep(s); setAnimating(false);
      setTimeout(() => {
        if (s === 1) emailRef.current?.focus();
        if (s === 2) firstNameRef.current?.focus();
        if (s === 3) otpRefs.current[0]?.focus();
      }, 30);
    }, 180);
  };

  const doSendOtp = async (addr: string): Promise<boolean> => {
    try {
      const r = await fetch(`${API}/api/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? t.serverErr); return false; }
      return true;
    } catch { setError(t.serverErr); return false; }
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = email.trim().toLowerCase();
    if (!val || !val.includes('@') || !val.split('@')[1]?.includes('.')) { setError(t.emailErrInvalid); return; }
    setError(''); setBusy(true);
    try {
      const r = await fetch(`${API}/api/check-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: val }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? t.serverErr); return; }
      if (d.exists) {
        setIsNewUser(false);
        const ok = await doSendOtp(val); if (!ok) return;
        setResendCooldown(60); goTo(3);
      } else { setIsNewUser(true); goTo(2); }
    } catch { setError(t.serverErr); }
    finally  { setBusy(false); }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) { setError(t.errNameRequired); return; }
    setError(''); setBusy(true);
    const ok = await doSendOtp(email.trim().toLowerCase());
    setBusy(false); if (!ok) return;
    setResendCooldown(60); goTo(3);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) { setError(t.errOtpIncomplete); return; }
    setError(''); setVerifying(true);
    try {
      const payload: Record<string, string> = { email: email.trim().toLowerCase(), code };
      if (isNewUser) { payload.first_name = firstName.trim(); payload.last_name = lastName.trim(); }
      const r = await fetch(`${API}/api/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'Verification failed.'); return; }
      localStorage.setItem('levy_ai_token',      d.token);
      localStorage.setItem('levy_ai_email',      d.email);
      localStorage.setItem('levy_ai_first_name', d.first_name ?? '');
      localStorage.setItem('levy_ai_last_name',  d.last_name  ?? '');
      onSuccess();
    } catch { setError(t.serverErr); }
    finally  { setVerifying(false); }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || busy) return;
    setOtp(['', '', '', '', '', '']); setError(''); setBusy(true);
    const ok = await doSendOtp(email.trim().toLowerCase());
    setBusy(false); if (ok) { setResendCooldown(60); otpRefs.current[0]?.focus(); }
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
    setOtp(next); otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const heading  = step === 1 ? t.heading1 : step === 2 ? t.heading2 : t.heading3;
  const subtitle = step === 1 ? t.sub1     : step === 2 ? t.sub2     : t.sub3;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(30,41,59,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card */}
      <div
        dir={dir}
        className="w-full max-w-sm animate-slide-up-fade"
        style={{
          background: '#FDFCF8',
          border: '1px solid #E2DAC8',
          borderRadius: 24,
          boxShadow: '0 8px 40px rgba(0,0,0,0.12), 0 2px 12px rgba(0,0,0,0.06)',
          padding: '32px 28px',
        }}
      >
        {/* Brand + Close */}
        <div className="flex justify-between items-start w-full mb-6">
          <div className="flex items-center gap-2">
            <LogoMark size={30} />
            <span className="text-slate-900 font-bold text-base">U-Note</span>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-stone-100 transition-all shrink-0">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Heading */}
        <h2 className="text-lg font-bold text-slate-900 mb-0.5">{heading}</h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">{subtitle}</p>

        {/* Step content */}
        <div className={`transition-all duration-150 ${animating ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3.5 py-2.5 text-xs">
              <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c.866 1.5-.217 3.374-1.948 3.374H4.645c-1.73 0-2.813-1.874-1.948-3.374l7.5-12.999c.866-1.5 3.032-1.5 3.898 0l7.206 12.999ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              {error}
            </div>
          )}

          {/* ═══ Step 1: Email ═══ */}
          {step === 1 && (
            <form onSubmit={handleContinue} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">{t.emailLabel}</label>
                <input ref={emailRef} type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required dir="ltr" autoComplete="email" autoFocus placeholder={t.emailPh}
                  className="w-full rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-stone-400 outline-none transition-all bg-stone-50"
                  style={{ border: '1px solid #D6CBB9' }}
                  onFocus={e => { e.target.style.borderColor = '#6B904A'; e.target.style.boxShadow = '0 0 0 3px rgba(107,144,74,0.12)'; }}
                  onBlur={e  => { e.target.style.borderColor = '#D6CBB9'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
              <button type="submit" disabled={busy}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.99] disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: busy ? '#A8B99A' : '#6B904A', boxShadow: busy ? 'none' : '0 2px 12px rgba(107,144,74,0.28)' }}>
                {busy && <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                {busy ? t.checking : t.continueBtn}
              </button>
            </form>
          )}

          {/* ═══ Step 2: Name ═══ */}
          {step === 2 && (
            <form onSubmit={handleSendCode} className="space-y-4">
              {/* Email chip */}
              <button type="button" onClick={() => goTo(1)} dir="ltr"
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all hover:bg-stone-100"
                style={{ background: 'rgba(107,144,74,0.06)', border: '1px solid rgba(107,144,74,0.2)' }}>
                <span className="text-green-700 text-xs">✦</span>
                <span className="flex-1 text-start truncate text-slate-600">{email}</span>
                <span className="text-xs text-slate-400">✎</span>
              </button>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { ref: firstNameRef, label: t.firstNameLabel, val: firstName, set: setFirstName, ph: t.firstNamePh },
                  { ref: undefined,    label: t.lastNameLabel,  val: lastName,  set: setLastName,  ph: t.lastNamePh  },
                ].map(({ ref, label, val, set, ph }) => (
                  <div key={label}>
                    <label className="block text-xs font-medium text-slate-600 mb-2">{label}</label>
                    <input ref={ref} type="text" value={val} onChange={e => set(e.target.value)}
                      required dir="auto" placeholder={ph}
                      className="w-full rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-stone-400 outline-none transition-all bg-stone-50"
                      style={{ border: '1px solid #D6CBB9' }}
                      onFocus={e => { e.target.style.borderColor = '#6B904A'; e.target.style.boxShadow = '0 0 0 3px rgba(107,144,74,0.12)'; }}
                      onBlur={e  => { e.target.style.borderColor = '#D6CBB9'; e.target.style.boxShadow = 'none'; }}
                    />
                  </div>
                ))}
              </div>
              <button type="submit" disabled={busy}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                style={{ background: busy ? '#A8B99A' : '#6B904A', boxShadow: busy ? 'none' : '0 2px 12px rgba(107,144,74,0.28)' }}>
                {busy && <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                {busy ? t.sending : t.sendCode}
              </button>
            </form>
          )}

          {/* ═══ Step 3: OTP ═══ */}
          {step === 3 && (
            <form onSubmit={handleVerify} className="space-y-5">
              {/* Email chip */}
              <button type="button"
                onClick={() => { setOtp(['', '', '', '', '', '']); goTo(isNewUser ? 2 : 1); }}
                dir="ltr"
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all hover:bg-stone-100"
                style={{ background: 'rgba(107,144,74,0.06)', border: '1px solid rgba(107,144,74,0.2)' }}>
                <span className="text-green-700 text-xs">✦</span>
                <span className="flex-1 text-start truncate text-slate-600">{email}</span>
                <span className="text-xs text-slate-400">✎</span>
              </button>
              <p className="text-xs text-slate-500 px-0.5">{t.codeSentTo} <em className="text-slate-700">{email}</em> · {t.devHint}</p>

              {/* OTP boxes */}
              <div dir="ltr" className="flex gap-2 justify-center">
                {otp.map((digit, i) => (
                  <input key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    type="text" inputMode="numeric" maxLength={2} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    onFocus={e => e.target.select()}
                    className="text-center text-xl font-bold outline-none rounded-xl caret-transparent transition-all bg-stone-50"
                    style={{
                      width: 46, aspectRatio: '1 / 1.2',
                      background: digit ? 'rgba(107,144,74,0.1)' : '#F5F3ED',
                      border: digit ? '2px solid #6B904A' : '2px solid #D6CBB9',
                      color: '#6B904A',
                    }}
                  />
                ))}
              </div>

              <button type="submit" disabled={verifying || otp.join('').length < 6}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                style={{ background: verifying || otp.join('').length < 6 ? '#A8B99A' : '#6B904A', boxShadow: verifying || otp.join('').length < 6 ? 'none' : '0 2px 12px rgba(107,144,74,0.28)' }}>
                {verifying && <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                {verifying ? t.verifying_ : t.verify}
              </button>

              <p className="text-center">
                <button type="button" onClick={handleResend}
                  disabled={resendCooldown > 0 || busy}
                  className="text-xs text-green-700/60 hover:text-green-700 disabled:text-stone-400 transition-colors">
                  {busy ? t.sending : resendCooldown > 0 ? `${t.resendIn} ${resendCooldown}s` : t.resend}
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Profile avatar SVG ─────────────────────────────────────────────────────── */
function ProfileAvatarSVG() {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="36" height="36" fill="#ddd8cf"/>
      <circle cx="18" cy="14" r="7" fill="#1a2744"/>
      <path d="M4 38 C4 27 12 21 18 21 C24 21 32 27 32 38" fill="#1a2744"/>
    </svg>
  );
}

/* ─── Floating profile pill ──────────────────────────────────────────────────── */
function ProfilePill({ name, sub, delay = 0 }: { name: string; sub?: string; delay?: number }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 rounded-2xl select-none whitespace-nowrap animate-float"
      style={{
        background: 'rgba(252,250,246,0.88)',
        border: '1px solid rgba(205,190,168,0.65)',
        boxShadow: '0 8px 28px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        backdropFilter: 'blur(18px)',
        animationDelay: `${delay}s`,
      }}>
      <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-stone-200">
        <ProfileAvatarSVG />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800 leading-tight">{name}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5 leading-none">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Main landing page ──────────────────────────────────────────────────────── */
export default function LandingPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>('he');
  const [view, setView] = useState<View>('landing');

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

  /* Verbatim text from the mockup image */
  const isHe = lang === 'he';

  /* ── Nav link data matching the mockup verbatim ── */
  const navItems = isHe
    ? ['בית', 'פתרונות', 'בלוג', 'תמחור', 'התחבר']
    : ['Home', 'Solutions', 'Blog', 'Pricing', 'Login'];

  return (
    /* RTL root — cream base */
    <div className="min-h-screen overflow-hidden relative" dir="rtl"
      style={{ background: 'linear-gradient(150deg, #EDE9DF 0%, #E6E0D4 50%, #DDD7C8 100%)' }}>

      {/* ════════════════════════════════════════════════════════════════
          LAYER 1 — colour washes (blurry divs, fixed)
      ════════════════════════════════════════════════════════════════ */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        {/* Sage-green bloom — upper centre-right */}
        <div style={{ position:'absolute', top:'-8%', right:'15%', width:720, height:560,
          borderRadius:'58% 42% 52% 48%/50% 55% 45% 50%',
          background:'rgba(107,144,74,0.10)', filter:'blur(100px)' }} />
        {/* Warm ochre — upper-right corner */}
        <div style={{ position:'absolute', top:'-4%', right:'-10%', width:580, height:480,
          borderRadius:'45% 55% 42% 58%',
          background:'rgba(195,168,110,0.08)', filter:'blur(90px)' }} />
        {/* Stone grey — lower-left (ties into pebble zone) */}
        <div style={{ position:'absolute', bottom:'0%', left:'-5%', width:420, height:360,
          borderRadius:'55% 45% 60% 40%',
          background:'rgba(150,140,125,0.09)', filter:'blur(80px)' }} />
        {/* Honey accent — mid-right */}
        <div style={{ position:'absolute', top:'35%', right:'5%', width:340, height:280,
          borderRadius:'50%', background:'rgba(195,158,85,0.06)', filter:'blur(70px)' }} />
        {/* Soft green wash — centre */}
        <div style={{ position:'absolute', top:'20%', left:'30%', width:600, height:400,
          borderRadius:'50%', background:'rgba(120,150,95,0.05)', filter:'blur(110px)' }} />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          LAYER 2 — organic SVG texture (rings, stones, botanicals)
      ════════════════════════════════════════════════════════════════ */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <svg className="w-full h-full" viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice" fill="none"
          xmlns="http://www.w3.org/2000/svg">

          {/* ── Botanical leaf shapes (upper-right) ── */}
          <path d="M1130 55 C1205 18 1262 68 1238 155 C1214 242 1118 228 1108 145 C1101 97 1112 72 1130 55Z"
            fill="rgba(95,128,68,0.12)"/>
          <path d="M1272 130 C1322 96 1358 135 1342 192 C1326 249 1272 252 1262 198 C1255 168 1258 152 1272 130Z"
            fill="rgba(105,138,74,0.09)"/>
          <path d="M1062 185 C1098 154 1122 172 1116 218 C1110 264 1070 268 1058 222 C1050 196 1051 200 1062 185Z"
            fill="rgba(88,120,62,0.08)"/>
          <path d="M1195 72 C1218 52 1238 65 1230 98 C1222 131 1192 135 1184 102 C1179 83 1183 84 1195 72Z"
            fill="rgba(100,135,70,0.07)"/>

          {/* ── Main organic concentric rings (centre-right emanation) ── */}
          {/* These simulate the topographic/tree-ring pattern from the mockup */}
          <g stroke="rgba(95,82,58,0.14)" strokeWidth="0.65">
            {[55,102,154,211,274,342,416,496,582,674,772,876,986,1102,1224].map((r, i) => (
              <ellipse key={`m${i}`}
                cx={1080} cy={420}
                rx={r} ry={r * 0.71}
                transform={`rotate(${-6 + i * 0.62} 1080 420)`}/>
            ))}
          </g>

          {/* ── Secondary ring system (lower-left emanation) ── */}
          <g stroke="rgba(82,100,62,0.09)" strokeWidth="0.55">
            {[65,122,190,268,356,454,562,680,808].map((r, i) => (
              <ellipse key={`s${i}`}
                cx={140} cy={840}
                rx={r} ry={r * 0.86}
                transform={`rotate(${24 + i * 1.3} 140 840)`}/>
            ))}
          </g>

          {/* ── Tertiary rings (upper-right corner) ── */}
          <g stroke="rgba(100,118,75,0.07)" strokeWidth="0.5">
            {[55,105,165,234,312].map((r, i) => (
              <ellipse key={`t${i}`}
                cx={1420} cy={80}
                rx={r} ry={r * 0.78}
                transform={`rotate(${-18 + i * 2} 1420 80)`}/>
            ))}
          </g>

          {/* ── River-stone pebbles (lower-left cluster) ── */}
          <g opacity="0.48">
            {([
              [82,  582, 33, 22, -22, 'rgba(148,138,122,0.44)'],
              [138, 618, 28, 18,  16, 'rgba(132,122,108,0.40)'],
              [194, 604, 36, 25,  -9, 'rgba(155,145,130,0.42)'],
              [165, 562, 23, 15,  27, 'rgba(126,116,104,0.37)'],
              [110, 550, 27, 18,  -4, 'rgba(142,132,118,0.38)'],
              [246, 628, 31, 21,   9, 'rgba(136,126,112,0.40)'],
              [215, 580, 25, 17, -18, 'rgba(150,140,124,0.42)'],
              [ 74, 642, 21, 14,  13, 'rgba(122,114,100,0.36)'],
              [178, 654, 29, 20,  -7, 'rgba(140,130,116,0.39)'],
              [130, 676, 26, 17,  21, 'rgba(128,118,104,0.37)'],
              [270, 600, 23, 16, -13, 'rgba(135,125,112,0.38)'],
              [ 60, 560, 18, 12,   6, 'rgba(120,112, 98,0.35)'],
              [295, 648, 27, 18,  -5, 'rgba(130,120,106,0.38)'],
              [ 95, 605, 20, 13,  18, 'rgba(118,110, 96,0.34)'],
            ] as [number,number,number,number,number,string][]).map(([cx,cy,rx,ry,r,fill], i) => (
              <ellipse key={`p${i}`} cx={cx} cy={cy} rx={rx} ry={ry}
                fill={fill} transform={`rotate(${r} ${cx} ${cy})`}/>
            ))}
          </g>

          {/* ── Wispy cloud forms (soft diffused ovals) ── */}
          <ellipse cx={600} cy={175} rx={230} ry={88}
            fill="rgba(215,208,192,0.28)" style={{ filter:'blur(38px)' }}/>
          <ellipse cx={820} cy={290} rx={175} ry={66}
            fill="rgba(205,198,182,0.22)" style={{ filter:'blur(32px)' }}/>
        </svg>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          NAVBAR  —  RTL: Logo(right) | Links(centre) | Globe+CTA(left)
      ════════════════════════════════════════════════════════════════ */}
      <nav className="relative z-40 flex items-center justify-between px-8 py-3.5"
        style={{
          background: 'rgba(234,229,218,0.84)',
          backdropFilter: 'blur(18px)',
          borderBottom: '1px solid rgba(190,175,154,0.38)',
          boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
        }}>

        {/* RIGHT (RTL start) — Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <LogoMark size={32} />
          <span className="font-bold text-xl text-slate-900 tracking-tight">U-Note</span>
        </div>

        {/* CENTRE — Hebrew nav links */}
        <div className="hidden md:flex items-center gap-7 text-sm font-medium">
          {navItems.map((label, i) => (
            <button key={label}
              onClick={i === navItems.length - 1 ? () => setView('auth') : undefined}
              className={`transition-colors ${
                i === 0 ? 'text-[#6B904A] font-semibold' : 'text-slate-700 hover:text-slate-950'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* LEFT (RTL end) — Globe toggle + CTA */}
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => setLang(l => l === 'he' ? 'en' : 'he')}
            aria-label="Switch language"
            className="p-1.5 text-slate-500 hover:text-slate-800 transition-colors rounded-lg hover:bg-stone-200/50">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          </button>
          <button onClick={() => setView('auth')}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: '#6B904A', boxShadow: '0 2px 12px rgba(107,144,74,0.28)' }}>
            {isHe ? 'התחל עכשיו' : 'Get Started'}
          </button>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════════════
          HERO SECTION
          — Text content physically LEFT (RTL logical "end")
          — Profile pills physically RIGHT (RTL logical "start")
      ════════════════════════════════════════════════════════════════ */}
      <section className="relative z-10" style={{ minHeight: 'calc(100vh - 56px)' }}>

        {/* ── Hero text — absolute left side ── */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '5%',
          transform: 'translateY(-52%)',
          width: '44%',
          minWidth: 340,
        }}>
          {/* "AI platform" small label */}
          <p className="text-sm font-medium text-slate-500 mb-5 tracking-wide">
            AI platform
          </p>

          {/* Main headline — verbatim from the mockup */}
          <h1 className="font-black text-slate-900 leading-[1.08] mb-1"
            style={{ fontSize: 'clamp(2rem, 3.8vw, 3.25rem)' }}>
            {isHe ? 'פתרו כל אתגר אקדמי,' : 'Solve Every Academic Challenge,'}
          </h1>
          <h1 className="font-black text-slate-800 leading-[1.08] mb-9"
            style={{ fontSize: 'clamp(2rem, 3.8vw, 3.25rem)' }}>
            {isHe ? 'ביעילות חסרת תקדים' : 'With Unmatched Efficiency'}
          </h1>

          {/* CTA button */}
          <button onClick={() => setView('auth')}
            className="inline-flex items-center gap-2 text-base font-bold text-white transition-all hover:opacity-90 hover:scale-[1.025] active:scale-100"
            style={{
              background: '#6B904A',
              padding: '14px 32px',
              borderRadius: 12,
              boxShadow: '0 6px 24px rgba(107,144,74,0.30)',
            }}>
            <span>{isHe ? 'התחל עכשיו' : 'Get Started'}</span>
            <span className="text-xl leading-none">›</span>
          </button>
        </div>

        {/* ── Profile pills — absolute right side with connector ── */}
        <div style={{
          position: 'absolute',
          top: '50%',
          right: '7%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
          zIndex: 20,
        }}>
          {/* Upper pill */}
          <ProfilePill name="Shmuel Levy" sub="סטודנט" delay={0} />

          {/* Connecting line with integrated ring-arc visual */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div style={{ width: 1, height: 20,
              background: 'linear-gradient(to bottom, rgba(107,144,74,0.5), rgba(107,144,74,0.25))' }} />
            {/* Small decorative mid-node */}
            <div style={{ width: 6, height: 6, borderRadius: '50%',
              background: 'rgba(107,144,74,0.35)', border: '1px solid rgba(107,144,74,0.5)' }} />
            <div style={{ width: 1, height: 20,
              background: 'linear-gradient(to bottom, rgba(107,144,74,0.25), rgba(107,144,74,0.08))' }} />
          </div>

          {/* Lower pill */}
          <ProfilePill name="Shmuel Levy" sub="סטודנט" delay={1.8} />
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          FOOTER — Globe(right/RTL-start) | GitHub(left/RTL-end)
      ════════════════════════════════════════════════════════════════ */}
      <footer className="relative z-20 flex items-center justify-between px-8 py-3 text-xs text-slate-400"
        style={{
          borderTop: '1px solid rgba(185,170,150,0.32)',
          background: 'rgba(230,225,214,0.72)',
          backdropFilter: 'blur(10px)',
        }}>

        {/* RIGHT (RTL start) — Language */}
        <div className="flex items-center gap-1.5">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
          <span className="hover:text-slate-600 cursor-pointer transition-colors"
            onClick={() => setLang(l => l === 'he' ? 'en' : 'he')}>
            {isHe ? 'שינוי שפה' : 'Change Language'}
          </span>
        </div>

        {/* LEFT (RTL end) — GitHub */}
        <div className="flex items-center gap-1.5">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.69C6.73 19.91 6.14 17.97 6.14 17.97c-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12C22 6.48 17.52 2 12 2z"/>
          </svg>
          <span>GitHub</span>
        </div>
      </footer>

      {/* ── Auth modal ─────────────────────────────────────────────────── */}
      {view === 'auth' && (
        <AuthModal
          lang={lang}
          onClose={() => setView('landing')}
          onSuccess={() => router.push('/')}
        />
      )}
    </div>
  );
}
