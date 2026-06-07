'use client';

import { useRouter, usePathname } from 'next/navigation';

interface SidebarDocumentsLinkProps {
  lang: 'he' | 'en';
  onNavigate?: () => void;
}

// "המסמכים שלי" / "My Documents" sidebar nav item — points to /workspace/documents.
// Rendered inside the inline Sidebar of workspace/page.tsx (no shared <Sidebar>
// shell exists in this codebase; each page owns its own — see CLAUDE.md).
export function SidebarDocumentsLink({ lang, onNavigate }: SidebarDocumentsLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const active = pathname === '/workspace/documents';

  return (
    <button
      onClick={() => { router.push('/workspace/documents'); onNavigate?.(); }}
      className={['w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all', active ? 'font-bold' : 'hover:bg-white/5'].join(' ')}
      style={active ? { backgroundColor: '#D1E6D9', color: '#183025', fontWeight: 700 } : { color: '#1C3329' }}
    >
      <span className="text-base leading-none shrink-0">📚</span>
      {lang === 'he' ? 'המסמכים שלי' : 'My Documents'}
    </button>
  );
}
