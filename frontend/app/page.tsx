'use client';

import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  return (
    <div dir="rtl" className="relative min-h-screen overflow-hidden" style={{ backgroundColor: '#e8e4d9', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* Organic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Base gradient */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #e2ddd0 0%, #d8d3c5 40%, #e5e0d5 100%)' }} />
        
        {/* Large navy blob top right */}
        <div className="absolute" style={{
          top: '-15%', right: '-8%',
          width: '55%', height: '65%',
          background: 'radial-gradient(ellipse at 60% 40%, #1e2a45 0%, #263354 50%, transparent 80%)',
          borderRadius: '40% 60% 60% 40% / 40% 40% 60% 60%',
          opacity: 0.9,
        }} />
        
        {/* Sage green blob left */}
        <div className="absolute" style={{
          top: '25%', left: '-12%',
          width: '40%', height: '55%',
          background: 'radial-gradient(ellipse at 40% 60%, #6a8f5e 0%, #5a7e4e 60%, transparent 85%)',
          borderRadius: '60% 40% 40% 60% / 60% 60% 40% 40%',
          opacity: 0.75,
        }} />
        
        {/* Sage green blob bottom left */}
        <div className="absolute" style={{
          bottom: '-15%', left: '0%',
          width: '38%', height: '45%',
          background: 'radial-gradient(ellipse at 30% 30%, #7a9e6e 0%, #5a7e4e 70%, transparent 90%)',
          borderRadius: '50% 70% 70% 30% / 30% 30% 70% 70%',
          opacity: 0.65,
        }} />
        
        {/* Large tan/cream center blob */}
        <div className="absolute" style={{
          top: '15%', left: '15%',
          width: '60%', height: '70%',
          background: 'radial-gradient(ellipse at 50% 50%, #ccc7b3 0%, #c0baa6 60%, transparent 85%)',
          borderRadius: '55% 45% 45% 55% / 45% 55% 45% 55%',
          opacity: 0.45,
        }} />

        {/* Navy accent bottom right */}
        <div className="absolute" style={{
          bottom: '0%', right: '5%',
          width: '30%', height: '40%',
          background: 'radial-gradient(ellipse at 60% 70%, #1e2a45 0%, #263354 60%, transparent 85%)',
          borderRadius: '70% 30% 30% 70% / 30% 70% 30% 70%',
          opacity: 0.8,
        }} />

        {/* Concentric rings top right (wood/pebble aesthetic) */}
        <svg className="absolute" style={{ top: '3%', right: '12%', width: '280px', height: '280px', opacity: 0.12 }} viewBox="0 0 280 280" fill="none">
          {[25,48,71,94,117,135].map((r, i) => (
            <circle key={i} cx="140" cy="140" r={r} stroke="#c8b890" strokeWidth="1.2"/>
          ))}
        </svg>
        
        {/* Concentric rings bottom left */}
        <svg className="absolute" style={{ bottom: '5%', left: '12%', width: '220px', height: '220px', opacity: 0.18 }} viewBox="0 0 220 220" fill="none">
          {[20,40,60,80,100].map((r, i) => (
            <circle key={i} cx="110" cy="110" r={r} stroke="#9a8868" strokeWidth="1.5"/>
          ))}
        </svg>

        {/* Leaf/plant shape left edge */}
        <svg className="absolute" style={{ top: '38%', left: '3%', width: '100px', height: '160px', opacity: 0.55 }} viewBox="0 0 100 160" fill="none">
          <ellipse cx="50" cy="80" rx="32" ry="72" fill="#6a9058" transform="rotate(-15 50 80)"/>
          <ellipse cx="50" cy="80" rx="14" ry="60" fill="#5a7e48" transform="rotate(-15 50 80)"/>
          <line x1="50" y1="15" x2="50" y2="145" stroke="#4a6e38" strokeWidth="1.5" transform="rotate(-15 50 80)"/>
          <line x1="50" y1="50" x2="30" y2="35" stroke="#4a6e38" strokeWidth="1" transform="rotate(-15 50 80)"/>
          <line x1="50" y1="70" x2="70" y2="58" stroke="#4a6e38" strokeWidth="1" transform="rotate(-15 50 80)"/>
          <line x1="50" y1="90" x2="28" y2="80" stroke="#4a6e38" strokeWidth="1" transform="rotate(-15 50 80)"/>
        </svg>

        {/* Small pebble dots */}
        {[[10, 22, '#b8a880'], [14, 20, '#a89870'], [8, 18, '#c8b890']].map(([w, h, c], i) => (
          <div key={i} className="absolute" style={{ 
            top: `${16 + i*1.5}%`, right: `${44 - i*2}%`,
            width: `${w}px`, height: `${h}px`,
            background: c, borderRadius: '50%', opacity: 0.55 
          }} />
        ))}

        {/* Cloud-like shapes */}
        <div className="absolute" style={{
          top: '52%', left: '-3%',
          width: '22%', height: '14%',
          background: 'rgba(255,255,255,0.55)',
          borderRadius: '50% 70% 70% 30% / 30% 50% 70% 50%',
          filter: 'blur(10px)',
        }} />
        <div className="absolute" style={{
          bottom: '22%', right: '22%',
          width: '18%', height: '11%',
          background: 'rgba(255,255,255,0.45)',
          borderRadius: '70% 30% 50% 50% / 50% 70% 30% 50%',
          filter: 'blur(8px)',
        }} />
        <div className="absolute" style={{
          top: '8%', left: '35%',
          width: '12%', height: '8%',
          background: 'rgba(255,255,255,0.4)',
          borderRadius: '50%',
          filter: 'blur(6px)',
        }} />
      </div>

      {/* ─── HEADER ─── */}
      <header
        className="relative z-20 flex items-center justify-between px-8 py-3"
        style={{
          backgroundColor: 'rgba(235, 231, 220, 0.88)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(170,160,140,0.25)',
        }}
      >
        {/* Logo (right side in RTL) */}
        <div className="flex items-center gap-2 order-last">
          <svg width="34" height="34" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="8" fill="#1e2a45"/>
            <path d="M10 30 L20 12 L30 30" stroke="white" strokeWidth="2.5" fill="none" strokeLinejoin="round"/>
            <path d="M14 22 L26 22" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="30" cy="10" r="5" fill="#f5c842"/>
            <path d="M27.5 10 L29.5 12 L33 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1e2a45', letterSpacing: '-0.02em' }}>U-Note</span>
        </div>

        {/* Nav links (center in RTL) */}
        <nav className="flex items-center gap-7 order-2">
          <a href="#" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#5a8a4a' }}>בית</a>
          <a href="#" style={{ fontSize: '0.875rem', fontWeight: 400, color: '#555' }}>פתרונות</a>
          <a href="#" style={{ fontSize: '0.875rem', fontWeight: 400, color: '#555' }}>בלוג</a>
          <a href="#" style={{ fontSize: '0.875rem', fontWeight: 400, color: '#555' }}>תמחור</a>
          <a href="#" style={{ fontSize: '0.875rem', fontWeight: 400, color: '#555' }}>התחבר</a>
        </nav>

        {/* Left side (in RTL) - CTA + icons */}
        <div className="flex items-center gap-3 order-first">
          <button style={{ padding: '6px', color: '#666', background: 'none', border: 'none', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </button>
          <button style={{ padding: '4px 6px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500 }}>א/A</button>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'white',
              backgroundColor: '#1e2a45',
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
          >
            התחל עכשיו
          </button>
        </div>
      </header>

      {/* ─── HERO SECTION ─── */}
      <main
        className="relative z-10 flex items-center justify-center"
        style={{ minHeight: 'calc(100vh - 116px)', padding: '40px 24px' }}
      >
        {/* Central Card */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '520px',
            background: 'rgba(255, 255, 255, 0.68)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            borderRadius: '24px',
            padding: '52px 44px 44px',
            boxShadow: '0 8px 48px rgba(30, 42, 69, 0.10), 0 1px 8px rgba(30,42,69,0.06)',
            border: '1px solid rgba(255,255,255,0.85)',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#8899aa', letterSpacing: '0.04em', marginBottom: '16px' }}>
            AI platform
          </p>
          
          <h1
            style={{
              fontSize: 'clamp(2rem, 5vw, 2.7rem)',
              fontWeight: 800,
              color: '#1a2540',
              lineHeight: 1.22,
              marginBottom: '36px',
              fontFamily: 'Georgia, serif',
            }}
          >
            פתרו כל אתגר אקדמי,<br />
            ביעילות חסרת תקדים
          </h1>

          <button
            onClick={() => router.push('/login')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '13px 32px',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: 600,
              color: 'white',
              backgroundColor: '#5a8a42',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(90,138,66,0.35)',
              transition: 'opacity 0.2s, transform 0.1s',
            }}
          >
            התחל עכשיו
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 3 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* Profile Pill 1 - Upper Right */}
        <div
          style={{
            position: 'absolute',
            top: '22%',
            right: '6%',
            background: 'rgba(255, 255, 255, 0.90)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderRadius: '50px',
            padding: '9px 14px 9px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 20px rgba(30,42,69,0.10)',
            border: '1px solid rgba(255,255,255,0.95)',
          }}
        >
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e2a45' }}>Shmuel Levy</span>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #c5d8be 0%, #9ab898 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '2px solid rgba(255,255,255,0.8)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4a7a4a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>

        {/* Connector dot */}
        <div
          style={{
            position: 'absolute',
            top: '49%',
            right: '10%',
            width: '9px',
            height: '9px',
            background: '#8aaa70',
            borderRadius: '50%',
            boxShadow: '0 0 0 3px rgba(138,170,112,0.25)',
          }}
        />

        {/* Profile Pill 2 - Lower Right */}
        <div
          style={{
            position: 'absolute',
            top: '58%',
            right: '6%',
            background: 'rgba(255, 255, 255, 0.90)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderRadius: '50px',
            padding: '9px 14px 9px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 20px rgba(30,42,69,0.10)',
            border: '1px solid rgba(255,255,255,0.95)',
          }}
        >
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e2a45' }}>Shmuel Levy</span>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #d8cdb8 0%, #b8a888 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '2px solid rgba(255,255,255,0.8)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7a6a48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>
      </main>

      {/* ─── FOOTER ─── */}
      <footer
        className="relative z-20 flex items-center justify-between px-8 py-3"
        style={{
          borderTop: '1px solid rgba(180,170,150,0.25)',
          backgroundColor: 'rgba(232,228,217,0.65)',
        }}
      >
        <div className="flex items-center gap-5">
          <a href="#" className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', color: '#777', textDecoration: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            תמחור כפוחלים
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', color: '#777', textDecoration: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            התחבר
          </a>
          <a href="#" className="flex items-center gap-1.5" style={{ fontSize: '0.75rem', color: '#777', textDecoration: 'none' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            העחוניין
          </a>
        </div>
      </footer>
    </div>
  );
}
