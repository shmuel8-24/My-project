'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '../app/providers/language';

function keyForDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `levy_ai_study_${y}-${m}-${day}`;
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Hebrew: Sunday=א׳…Saturday=ש׳ (traditional weekday numbering)
const HE_DAY = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const EN_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DayData {
  key: string;
  secs: number;
  label: string;
  isToday: boolean;
}

const BAR_MAX_H = 64; // px — maximum bar height

export default function ScreenTimeChart() {
  const { lang } = useLanguage();
  const he = lang === 'he';

  const [days, setDays] = useState<DayData[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      const result: DayData[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = keyForDate(d);
        const raw = localStorage.getItem(key);
        const secs = raw ? (parseInt(raw, 10) || 0) : 0;
        result.push({
          key,
          secs,
          label: (he ? HE_DAY : EN_DAY)[d.getDay()],
          isToday: i === 0,
        });
      }
      setDays(result);
    });
  }, [he]);

  // Suppress until localStorage is available (avoids SSR/hydration mismatch)
  if (days.length === 0) return null;

  const maxSecs = days.reduce((a, d) => Math.max(a, d.secs), 0);
  const safeMax = maxSecs === 0 ? 1 : maxSecs;
  const totalWeek = days.reduce((a, d) => a + d.secs, 0);
  const avgSecs = Math.round(totalWeek / 7);

  return (
    <div
      dir={he ? 'rtl' : 'ltr'}
      style={{
        background:   'linear-gradient(135deg, #1A2E26 0%, #1F3327 100%)',
        borderRadius: 20,
        padding:      '18px 18px 14px',
        border:       '1px solid rgba(74,222,128,0.12)',
        boxShadow:    '0 4px 20px rgba(0,0,0,0.16)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ fontSize:'0.9rem', lineHeight:1 }} aria-hidden="true">📱</span>
            <p style={{
              color:         'rgba(157,192,139,0.72)',
              fontSize:      '0.6125rem',
              fontWeight:    700,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              margin:        0,
            }}>
              {he ? 'זמן מסך' : 'Screen Time'}
            </p>
          </div>
          <p style={{ color:'rgba(157,192,139,0.40)', fontSize:'0.5875rem', margin:'3px 0 0', letterSpacing:'0.03em' }}>
            {he ? '7 ימים אחרונים' : 'Last 7 days'}
          </p>
        </div>

        <div style={{ textAlign: he ? 'start' : 'end' }}>
          <p style={{
            color:               '#4ADE80',
            fontSize:            '1.05rem',
            fontWeight:          800,
            fontVariantNumeric:  'tabular-nums',
            fontFamily:          'ui-monospace, "Cascadia Code", Menlo, Consolas, monospace',
            margin:              0,
            lineHeight:          1.2,
          }}>
            {fmtTime(avgSecs)}
          </p>
          <p style={{ color:'rgba(157,192,139,0.40)', fontSize:'0.5875rem', margin:'3px 0 0', letterSpacing:'0.03em' }}>
            {he ? 'ממוצע יומי' : 'daily avg'}
          </p>
        </div>
      </div>

      {/* ── Bar chart — dir="ltr" keeps oldest→newest left→right in both locales ── */}
      <div dir="ltr" style={{ display:'flex', gap:5, height: BAR_MAX_H + 22 }}>
        {days.map((day, i) => {
          const barH = day.secs === 0
            ? 3
            : Math.max(8, Math.round((day.secs / safeMax) * BAR_MAX_H));
          const isHov = hovered === i;

          return (
            <div
              key={day.key}
              style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', position:'relative', cursor:'default' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Tooltip — anchored just above the bar top */}
              {isHov && (
                <div style={{
                  position:      'absolute',
                  bottom:        barH + 20,
                  left:          '50%',
                  transform:     'translateX(-50%)',
                  background:    'rgba(255,255,255,0.97)',
                  borderRadius:  7,
                  padding:       '4px 8px',
                  whiteSpace:    'nowrap',
                  boxShadow:     '0 4px 14px rgba(0,0,0,0.20)',
                  zIndex:        10,
                  pointerEvents: 'none',
                }}>
                  <p style={{
                    color:              '#1C3329',
                    fontSize:           '0.6875rem',
                    fontWeight:         700,
                    margin:             0,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily:         'ui-monospace, Menlo, monospace',
                  }}>
                    {day.secs === 0 ? '—' : fmtTime(day.secs)}
                  </p>
                </div>
              )}

              {/* Spacer — pushes bar + label to the bottom of the column */}
              <div style={{ flex:1 }} />

              {/* Bar */}
              <div style={{
                width:        '100%',
                height:       barH,
                borderRadius: day.secs === 0 ? 2 : '5px 5px 3px 3px',
                background:   day.isToday
                  ? (isHov ? '#6EF09A' : '#4ADE80')
                  : day.secs === 0
                    ? 'rgba(74,222,128,0.06)'
                    : (isHov ? 'rgba(74,222,128,0.52)' : 'rgba(74,222,128,0.28)'),
                boxShadow:    day.isToday && !isHov ? '0 0 10px rgba(74,222,128,0.40)' : 'none',
                transition:   'background 0.15s ease, box-shadow 0.15s ease',
              }} />

              {/* Day label */}
              <p style={{
                color:         day.isToday ? '#4ADE80' : 'rgba(157,192,139,0.38)',
                fontSize:      '0.5625rem',
                fontWeight:    day.isToday ? 800 : 500,
                margin:        '5px 0 0',
                lineHeight:    1,
                letterSpacing: '0.02em',
              }}>
                {day.label}
              </p>
            </div>
          );
        })}
      </div>

      {/* ── Footer: weekly total ─────────────────────────────────────────── */}
      <div style={{
        marginTop:      12,
        paddingTop:     11,
        borderTop:      '1px solid rgba(74,222,128,0.08)',
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
      }}>
        <p style={{ color:'rgba(157,192,139,0.38)', fontSize:'0.5875rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', margin:0 }}>
          {he ? 'סה"כ השבוע' : 'Week total'}
        </p>
        <p style={{
          color:              'rgba(157,192,139,0.75)',
          fontSize:           '0.75rem',
          fontWeight:         700,
          fontVariantNumeric: 'tabular-nums',
          fontFamily:         'ui-monospace, "Cascadia Code", Menlo, Consolas, monospace',
          margin:             0,
        }}>
          {fmtTime(totalWeek)}
        </p>
      </div>
    </div>
  );
}
