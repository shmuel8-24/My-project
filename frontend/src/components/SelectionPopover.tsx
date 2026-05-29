'use client';

import { useState, useEffect, useRef } from 'react';

type SelectionAction = 'explain' | 'summarize' | 'quiz';

interface PopoverState {
  x:    number;
  y:    number;
  text: string;
}

interface SelectionPopoverProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onAction:     (action: SelectionAction, text: string) => void;
  lang:         'he' | 'en';
}

export default function SelectionPopover({ containerRef, onAction, lang }: SelectionPopoverProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const selfRef = useRef<HTMLDivElement>(null);
  const he = lang === 'he';

  useEffect(() => {
    function onMouseUp() {
      setTimeout(() => {
        const sel  = window.getSelection();
        const text = sel?.toString().trim() ?? '';

        if (!text || text.length < 4) {
          setPopover(null);
          return;
        }

        const range     = sel?.getRangeAt(0);
        const container = containerRef.current;

        if (!range || !container || !container.contains(range.commonAncestorContainer)) {
          setPopover(null);
          return;
        }

        const rect = range.getBoundingClientRect();
        setPopover({
          x: rect.left + rect.width / 2,
          y: rect.top,
          text,
        });
      }, 20);
    }

    function onMouseDown(e: MouseEvent) {
      if (selfRef.current?.contains(e.target as Node)) return;
      if (!window.getSelection()?.toString().trim()) setPopover(null);
    }

    document.addEventListener('mouseup',   onMouseUp);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('mouseup',   onMouseUp);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [containerRef]);

  if (!popover) return null;

  const ACTIONS: { icon: string; labelHe: string; labelEn: string; action: SelectionAction }[] = [
    { icon: '✨', labelHe: 'הסבר',    labelEn: 'Explain',    action: 'explain'   },
    { icon: '📝', labelHe: 'תמצת',    labelEn: 'Summarize',  action: 'summarize' },
    { icon: '❓', labelHe: 'בחן אותי', labelEn: 'Quiz me',    action: 'quiz'      },
  ];

  return (
    <div
      ref={selfRef}
      dir={he ? 'rtl' : 'ltr'}
      className="fixed z-[200] animate-popover-in"
      style={{
        left:      `${popover.x}px`,
        top:       `${popover.y}px`,
        transform: 'translate(-50%, -100%)',
        marginTop: '-8px',
      }}
    >
      {/* Action buttons */}
      <div
        className="flex gap-1 p-1.5 rounded-xl shadow-xl border border-white/10"
        style={{ background: 'rgba(28,51,41,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        {ACTIONS.map(({ icon, labelHe, labelEn, action }) => (
          <button
            key={action}
            type="button"
            onMouseDown={e => e.preventDefault()} /* keep text selected */
            onClick={() => {
              onAction(action, popover.text);
              setPopover(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white/90 text-sm font-medium rounded-lg hover:bg-white/20 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>{icon}</span>
            <span>{he ? labelHe : labelEn}</span>
          </button>
        ))}
      </div>

      {/* Downward caret */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          bottom:      0,
          transform:   'translate(-50%, 100%)',
          width:       0,
          height:      0,
          borderLeft:  '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop:   '5px solid rgba(28,51,41,0.92)',
        }}
      />
    </div>
  );
}
