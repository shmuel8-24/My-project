'use client';

/**
 * Shared abstract organic background — beige base, navy/green blobs, leaf
 * silhouette, and concentric-circle accents. Extracted from the landing
 * page so any other full-bleed surface (e.g. InteractiveHero's expanded
 * panel) can render the identical graphic instead of duplicating it.
 */
export function OrganicBackground() {
  return (
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
  );
}
