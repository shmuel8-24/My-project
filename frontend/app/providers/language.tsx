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
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'he';
    return localStorage.getItem('levy_ai_lang') === 'en' ? 'en' : 'he';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir  = lang === 'he' ? 'rtl' : 'ltr';
    localStorage.setItem('levy_ai_lang', lang);
  }, [lang]);

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
