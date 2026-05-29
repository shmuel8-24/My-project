'use client';

interface Props {
  phase:           'thinking' | 'searching_web' | 'running_code';
  searchingText:   string;
  runningCodeText: string;
}

/**
 * Premium AI thinking state — replaces the basic spinner inside the chat.
 * Matches the existing AI bubble style and upgrades the dot animation.
 */
export default function AIThinkingIndicator({ phase, searchingText, runningCodeText }: Props) {
  return (
    <div
      className="rounded-2xl rounded-tl-sm w-fit"
      style={{
        background: 'rgba(255,255,255,0.92)',
        border:     '1px solid rgba(157,192,139,0.30)',
        boxShadow:  '0 2px 8px rgba(60,90,40,0.07)',
        padding:    phase === 'thinking' ? '14px 18px' : '10px 14px',
      }}
    >
      {phase === 'searching_web' ? (
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-[#9DC08B]/30 border-t-[#517B3E] animate-spin shrink-0 block" />
          <span className="text-xs font-medium" style={{ color: '#517B3E' }}>{searchingText}</span>
        </div>
      ) : phase === 'running_code' ? (
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-[#9DC08B]/30 border-t-[#517B3E] animate-spin shrink-0 block" />
          <span style={{ fontSize: '0.7rem' }}>⌨️</span>
          <span className="text-xs font-medium" style={{ color: '#517B3E' }}>{runningCodeText}</span>
        </div>
      ) : (
        /* Premium thinking dots — staggered bounce wave */
        <div className="flex items-center gap-1.5" aria-label="AI is thinking">
          {[0, 150, 300].map((delay, i) => (
            <span
              key={i}
              className="block w-2 h-2 rounded-full animate-bounce"
              style={{
                background:        '#4ADE80',
                opacity:           0.72,
                animationDelay:    `${delay}ms`,
                animationDuration: '1s',
                boxShadow:         '0 0 7px rgba(74,222,128,0.60)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
