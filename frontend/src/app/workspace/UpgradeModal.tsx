'use client';

import { useState, useEffect } from 'react';

type Lang = 'he' | 'en';

type PlanKey = 'pro_monthly' | 'semester';

interface Plan {
  key: PlanKey;
  title: { he: string; en: string };
  price: { he: string; en: string };
  period: { he: string; en: string };
  badge: { he: string; en: string };
  features: { he: string; en: string }[];
}

const PLANS: Plan[] = [
  {
    key: 'pro_monthly',
    title:  { he: 'Pro חודשי',    en: 'Pro Monthly' },
    price:  { he: '₪29',          en: '₪29' },
    period: { he: 'לחודש',        en: '/ month' },
    badge:  { he: 'חיוב חוזר',   en: 'Recurring' },
    features: [
      { he: 'גישה מלאה לכל תכונות ה-Pro', en: 'Full access to all Pro features' },
      { he: 'העלאת מסמכים ללא הגבלה',     en: 'Unlimited document uploads' },
      { he: 'שאלות ללא הגבלה בחודש',      en: 'Unlimited questions per month' },
      { he: 'תמיכה מועדפת',               en: 'Priority support' },
    ],
  },
  {
    key: 'semester',
    title:  { he: 'סמסטר (4 חודשים)',  en: 'Semester (4 months)' },
    price:  { he: '₪100',              en: '₪100' },
    period: { he: 'תשלום חד פעמי',    en: 'one-time payment' },
    badge:  { he: 'ללא חיוב חוזר',    en: 'No recurring charges' },
    features: [
      { he: 'מושלם לתקופת המבחנים',        en: 'Perfect for exam season' },
      { he: 'גישה מלאה לכל תכונות ה-Pro', en: 'Full access to all Pro features' },
      { he: 'העלאת מסמכים ללא הגבלה',     en: 'Unlimited document uploads' },
      { he: 'שאלות ללא הגבלה',            en: 'Unlimited questions' },
    ],
  },
];

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="10" fill="#517B3E" />
      <path d="M5.5 10.5L8.5 13.5L14.5 7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="9" stroke="#C8BFB0" strokeWidth="1.5" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

interface UpgradeModalProps {
  lang: Lang;
  onClose: () => void;
}

export function UpgradeModal({ lang, onClose }: UpgradeModalProps) {
  const [selected, setSelected] = useState<PlanKey>('pro_monthly');
  const isRtl = lang === 'he';

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = {
    heading:  { he: 'בחר תכנית',               en: 'Choose your plan' },
    sub:      { he: 'שדרג ותחקור ללא גבולות',  en: 'Upgrade and research without limits' },
    cta:      { he: 'המשך לתשלום',              en: 'Continue to Payment' },
    dismiss:  { he: 'אולי מאוחר יותר',          en: 'Maybe later' },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(20,30,15,0.55)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-slide-up-fade"
        style={{
          background: '#FAFAF7',
          border: '1px solid rgba(157,192,139,0.35)',
          boxShadow: '0 24px 64px rgba(40,70,30,0.18)',
        }}
      >
        {/* ── Header ── */}
        <div className="relative px-8 pt-8 pb-5 text-center"
          style={{ borderBottom: '1px solid rgba(157,192,139,0.25)' }}>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 end-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/8 transition-colors text-[#7a9268] hover:text-[#2d3b25]"
          >
            <IconX className="w-4 h-4" />
          </button>

          {/* Matcha leaf badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-4"
            style={{ background: 'rgba(81,123,62,0.10)', border: '1px solid rgba(81,123,62,0.22)', color: '#517B3E' }}>
            <span>🍵</span>
            <span>U-Note Pro</span>
          </div>

          <h2 className="text-xl font-bold text-[#1e2d18] mb-1">
            {copy.heading[lang]}
          </h2>
          <p className="text-sm text-[#7a9268]">
            {copy.sub[lang]}
          </p>
        </div>

        {/* ── Plan cards ── */}
        <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto w-full">
          {PLANS.map(plan => {
            const isSelected = selected === plan.key;
            return (
              <button
                key={plan.key}
                onClick={() => setSelected(plan.key)}
                className="relative text-start rounded-2xl p-4 flex flex-col gap-3 transition-all duration-200 cursor-pointer w-full"
                style={{
                  background: isSelected
                    ? 'rgba(81,123,62,0.06)'
                    : 'rgba(255,255,255,0.70)',
                  border: isSelected
                    ? '2.5px solid #517B3E'
                    : '1.5px solid rgba(157,192,139,0.45)',
                  boxShadow: isSelected
                    ? '0 4px 20px rgba(81,123,62,0.12)'
                    : '0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                {/* Selection indicator */}
                <div className="absolute top-3 end-3">
                  {isSelected
                    ? <IconCheck className="w-5 h-5" />
                    : <IconCircle className="w-5 h-5" />}
                </div>

                {/* Badge */}
                <span className="self-start px-2 py-0.5 text-[10px] font-bold rounded-full"
                  style={{ background: '#517B3E', color: 'white', letterSpacing: '0.02em' }}>
                  {plan.badge[lang]}
                </span>

                {/* Title */}
                <div>
                  <p className="font-bold text-[#2d3b25] text-sm leading-snug">
                    {plan.title[lang]}
                  </p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-extrabold text-[#1e2d18]">
                      {plan.price[lang]}
                    </span>
                    <span className="text-[10px] text-[#7a9268] leading-tight" style={{ maxWidth: '5rem' }}>
                      {plan.period[lang]}
                    </span>
                  </div>
                </div>

                {/* Feature bullets */}
                <ul className="flex flex-col gap-1.5 mt-auto">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-[3px] shrink-0 text-[#517B3E] text-[10px] font-bold leading-none">✓</span>
                      <span className="text-[11px] text-[#4a5e3a] leading-snug">{f[lang]}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* ── Footer / CTA ── */}
        <div className="px-6 pb-7 flex flex-col items-center gap-3"
          style={{ borderTop: '1px solid rgba(157,192,139,0.18)' }}>
          <div className="pt-5 w-full">
            <button
              className="w-full py-3 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ background: 'linear-gradient(135deg, #6aaa52, #3d6b2a)', boxShadow: '0 4px 16px rgba(81,123,62,0.30)' }}
              onClick={() => {
                /* TODO: wire to payment flow for plan: selected */
              }}
            >
              {copy.cta[lang]}
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-[#9aaf8a] hover:text-[#517B3E] transition-colors bg-transparent border-none cursor-pointer"
          >
            {copy.dismiss[lang]}
          </button>
        </div>
      </div>
    </div>
  );
}
