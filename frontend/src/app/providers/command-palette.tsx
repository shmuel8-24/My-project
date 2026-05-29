'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface CommandPaletteContextValue {
  isOpen: boolean;
  open:   () => void;
  close:  () => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  isOpen: false,
  open:   () => {},
  close:  () => {},
  toggle: () => {},
});

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  /* Global Cmd+K / Ctrl+K listener */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const open   = useCallback(() => setIsOpen(true),          []);
  const close  = useCallback(() => setIsOpen(false),         []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  return (
    <CommandPaletteContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  return useContext(CommandPaletteContext);
}
