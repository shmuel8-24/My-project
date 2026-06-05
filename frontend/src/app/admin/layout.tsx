'use client';

import { usePathname, useRouter } from 'next/navigation';

/* ── Design tokens (Creamy Matcha, enterprise variant) ─────────────────────── */
const S = {
  sidebar:     '#FFFFFF',
  border:      '#E8F0EB',
  bgPage:      '#F6F9F7',
  textPrimary: '#1C3329',
  textSec:     '#527061',
  textMuted:   '#8FB3A0',
  activeNav:   '#D1E6D9',
  activeTxt:   '#183025',
  hoverNav:    '#EEF5F0',
  accentDot:   '#517B3E',
};

const NAV_ITEMS: Array<{
  label: string;
  labelHe: string;
  href: string;
  icon: React.ReactNode;
  soon?: true;
}> = [
  {
    label:   'Overview',
    labelHe: 'סקירה כללית',
    href:    '/admin',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
  },
  {
    label:   'User Management',
    labelHe: 'ניהול משתמשים',
    href:    '/admin/users',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    label:   'Course Assignments',
    labelHe: 'שיוך קורסים',
    href:    '/admin/course-assignments',
    soon:    true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-1.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
      </svg>
    ),
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();

  return (
    <div className="flex min-h-screen" style={{ background: S.bgPage }}>

      {/* ═══════════════════ SIDEBAR ═══════════════════ */}
      <aside
        className="shrink-0 flex flex-col"
        style={{
          width: 232,
          background:     S.sidebar,
          borderInlineEnd: `1px solid ${S.border}`,
          boxShadow:      '2px 0 16px rgba(28,51,41,0.04)',
        }}
      >
        {/* Logo + label */}
        <div className="px-5 py-5 flex items-center gap-3"
          style={{ borderBottom: `1px solid ${S.border}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.PNG" alt="U-Note" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 800, color: S.textPrimary, letterSpacing: '-0.01em' }}>
              U-Note
            </p>
            <p style={{ fontSize: '0.625rem', fontWeight: 600, color: S.accentDot, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Admin Panel
            </p>
          </div>
        </div>

        {/* Section label */}
        <p className="px-5 pt-5 pb-2"
          style={{ fontSize: '0.625rem', fontWeight: 700, color: S.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Navigation
        </p>

        {/* Nav items */}
        <nav className="flex-1 px-3 flex flex-col gap-0.5">
          {NAV_ITEMS.map(item => {
            const exact  = item.href === '/admin';
            const active = exact ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <button
                key={item.href}
                disabled={item.soon}
                onClick={() => { if (!item.soon) router.push(item.href); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full text-start transition-all duration-150"
                style={{
                  background:  active ? S.activeNav : 'transparent',
                  color:       active ? S.activeTxt : S.textSec,
                  fontWeight:  active ? 700 : 500,
                  cursor:      item.soon ? 'default' : 'pointer',
                  opacity:     item.soon ? 0.45 : 1,
                }}
                onMouseEnter={e => { if (!active && !item.soon) (e.currentTarget as HTMLButtonElement).style.background = S.hoverNav; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span className="shrink-0" style={{ color: active ? S.accentDot : S.textMuted }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.soon && (
                  <span className="ms-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: '#EEF5F0', color: S.textMuted }}>
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 pb-4 flex flex-col gap-0.5" style={{ borderTop: `1px solid ${S.border}`, paddingTop: 12 }}>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm w-full text-start transition-all duration-150"
            style={{ color: S.textSec, fontWeight: 500 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = S.hoverNav; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Workspace
          </button>
        </div>
      </aside>

      {/* ═══════════════════ CONTENT ═══════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col">
        {children}
      </div>

    </div>
  );
}
