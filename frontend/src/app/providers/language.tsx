'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type Lang = 'he' | 'en';

interface LanguageContextValue {
  lang: Lang;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'he',
  toggleLanguage: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always initialize to the server default ('he') so the first client render
  // matches the server HTML (layout.tsx: <html lang="he" dir="rtl">).
  // localStorage is only read after mount to avoid hydration mismatches.
  const [lang, setLang] = useState<Lang>('he');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('levy_ai_lang');
    if (stored === 'en') setLang('en');
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.lang = lang;
    document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
    localStorage.setItem('levy_ai_lang', lang);
  }, [lang, mounted]);

  const toggleLanguage = () => setLang(l => (l === 'he' ? 'en' : 'he'));

  return (
    <LanguageContext.Provider value={{ lang, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
