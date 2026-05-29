'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../app/providers/auth';

const POMODORO = 25 * 60; // 1500 seconds

function fmt(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function FloatingZenTimer() {
  const { user: authUser } = useAuth();

  const [seconds,  setSeconds]  = useState(POMODORO);
  const [running,  setRunning]  = useState(false);
  const [pos,      setPos]      = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const dragOffset = useRef({ x: 0, y: 0 });

  /* Set initial position after mount (avoids SSR mismatch) */
  useEffect(() => {
    Promise.resolve(null).then(() =>
      setPos({ x: window.innerWidth - 224, y: window.innerHeight - 76 })
    );
  }, []);

  /* Countdown interval */
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSeconds(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  /* Stop automatically when countdown reaches zero */
  useEffect(() => {
    if (seconds === 0 && running) {
      Promise.resolve(null).then(() => setRunning(false));
    }
  }, [seconds, running]);

  /* Global mouse-move / mouse-up while dragging */
  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 200, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60,  e.clientY - dragOffset.current.y)),
      });
    }
    function onUp() { setDragging(false); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [dragging]);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (!pos) return;
    e.preventDefault();
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setDragging(true);
  }, [pos]);

  const reset = useCallback(() => {
    setRunning(false);
    setSeconds(POMODORO);
  }, []);

  if (!authUser) return null;

  const done    = seconds === 0;
  const pct     = (POMODORO - seconds) / POMODORO; // 0→1 as time passes
  const dotColor = done ? '#ef4444' : running ? '#4ADE80' : '#D1E6D9';
  const dotGlow  = running ? '0 0 0 3px rgba(74,222,128,0.22)' : 'none';

  return (
    <div
      className="fixed z-[100] select-none"
      style={{
        ...(pos ? { left: pos.x, top: pos.y } : { right: '2rem', bottom: '2rem' }),
        display:              'flex',
        alignItems:           'center',
        gap:                  12,
        padding:              '10px 18px',
        borderRadius:         '999px',
        background:           'rgba(255,255,255,0.88)',
        backdropFilter:       'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border:               '1px solid #E8F0EB',
        boxShadow:            '0 8px 32px rgba(28,51,41,0.12)',
        cursor:               dragging ? 'grabbing' : 'grab',
        userSelect:           'none',
      }}
      onMouseDown={onDragStart}
    >
      {/* Glowing status dot */}
      <span
        className={running ? 'animate-pulse' : ''}
        style={{
          width:        8,
          height:       8,
          borderRadius: '50%',
          flexShrink:   0,
          background:   dotColor,
          boxShadow:    dotGlow,
          transition:   'background 0.3s ease, box-shadow 0.3s ease',
        }}
      />

      {/* Time display */}
      <span
        className="font-mono font-bold tabular-nums"
        style={{
          color:         done ? '#ef4444' : '#1C3329',
          fontSize:      '1.05rem',
          letterSpacing: '0.04em',
          minWidth:      '4.4ch',
          textAlign:     'center',
          transition:    'color 0.3s ease',
        }}
      >
        {fmt(seconds)}
      </span>

      {/* Thin progress ring (SVG arc) */}
      <svg
        width="22" height="22"
        viewBox="0 0 22 22"
        style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}
      >
        <circle cx="11" cy="11" r="9" fill="none" stroke="#E8F0EB" strokeWidth="2" />
        <circle
          cx="11" cy="11" r="9"
          fill="none"
          stroke={done ? '#ef4444' : '#4ADE80'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 9}`}
          strokeDashoffset={`${2 * Math.PI * 9 * (1 - pct)}`}
          style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.3s ease' }}
        />
      </svg>

      {/* Play / Pause / Reset button */}
      <button
        type="button"
        onMouseDown={e => e.stopPropagation()}
        onClick={done ? reset : () => setRunning(r => !r)}
        className="flex items-center justify-center rounded-full active:scale-95 transition-all duration-150"
        style={{
          width:      28,
          height:     28,
          flexShrink: 0,
          background: done
            ? 'rgba(239,68,68,0.10)'
            : running
              ? 'rgba(28,51,41,0.07)'
              : 'rgba(81,123,62,0.10)',
          border: `1.5px solid ${done ? 'rgba(239,68,68,0.25)' : running ? 'rgba(28,51,41,0.15)' : 'rgba(81,123,62,0.25)'}`,
          color:      done ? '#ef4444' : running ? '#1C3329' : '#517B3E',
          cursor:     'pointer',
        }}
        title={done ? 'Reset' : running ? 'Pause' : 'Start focus session'}
      >
        {done ? (
          /* Reset */
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        ) : running ? (
          /* Pause */
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6"  y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          /* Play */
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Subtle reset button when paused mid-session */}
      {!running && seconds !== POMODORO && !done && (
        <button
          type="button"
          onMouseDown={e => e.stopPropagation()}
          onClick={reset}
          className="flex items-center justify-center transition-opacity duration-150 hover:opacity-100"
          style={{ width: 16, height: 16, background: 'none', border: 'none', color: '#A8C4B4', cursor: 'pointer', opacity: 0.65, flexShrink: 0 }}
          title="Reset timer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      )}
    </div>
  );
}
