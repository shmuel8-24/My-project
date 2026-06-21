'use client';

import React, { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

/* ════════════════════════════════════════════════════════════════════════════
   Types
════════════════════════════════════════════════════════════════════════════ */

interface ChartSeries {
  key:    string;
  label:  string;
  color?: string;
}

export interface ChartData {
  type:   'bar' | 'line' | 'area';
  title:  string;
  xKey:   string;
  series: ChartSeries[];
  data:   Record<string, string | number>[];
}

interface ChatMsg {
  id:         string;
  role:       'user' | 'assistant';
  content:    string;
  chartData?: ChartData | null;
}

export interface AiAccountantStats {
  report_date:    string;
  total_users:    number;
  plan_breakdown: { basic: number; pro: number; semester: number };
  active_users:   number;
  total_messages: number;
  total_sessions: number;
}

interface Props {
  api: string;
  stats: AiAccountantStats;
  preloadMessage?: string;
  onPreloadConsumed?: () => void;
}

/* ════════════════════════════════════════════════════════════════════════════
   Module-level constants  (outside component to keep deps stable)
════════════════════════════════════════════════════════════════════════════ */

const LOADING_PHRASES = [
  'מנתח נתונים פיננסיים...',
  'מריץ שאילתות על מסד הנתונים...',
  'מחשב מדדים...',
  'מסכם ממצאים...',
] as const;

const REPORT_ACTIONS: { label: string; prompt: string }[] = [
  {
    label:  '📊 דוח שבועי',
    prompt: 'תוציא לי דוח פיננסי שבועי מפורט הכולל הכנסות והוצאות',
  },
  {
    label:  '📈 דוח חודשי',
    prompt: 'תוציא לי דוח פיננסי חודשי מפורט הכולל הכנסות, MRR ותחזית',
  },
  {
    label:  '📉 דוח רבעוני',
    prompt: 'תוציא לי דוח פיננסי רבעוני מפורט הכולל מדדי צמיחה וחבויות מס מוערכות',
  },
  {
    label:  '🗓️ דוח שנתי',
    prompt: 'תוציא לי דוח פיננסי שנתי מלא ומקיף של כל הפעילות בעסק ותחזית ARR',
  },
];

const QUICK_ACTIONS: { label: string; prompt: string }[] = [
  {
    label:  '📊 דוח הכנסות',
    prompt: 'הפק דוח הכנסות מפורט עם MRR, ARR, פיצול לפי תוכניות מנוי ותחזית לרבעון הבא.',
  },
  {
    label:  '📈 תחזית צמיחה',
    prompt: 'הצג טרנד צמיחת המשתמשים ב-6 חודשים האחרונים והמלצות להאצת הצמיחה.',
  },
  {
    label:  '💹 ניתוח רווחיות',
    prompt: 'נתח את רווחיות הפלטפורמה: יחס משלמים לחינמיים, ARPU, והמלצות לשיפור LTV.',
  },
  {
    label:  '🧾 סיכום מע"מ',
    prompt: 'חשב את חבויות המע"מ ומס ההכנסה לשנה הנוכחית עבור עוסק פטור בישראל.',
  },
];

const CHART_COLORS = ['#517B3E', '#6B904A', '#2A3B22', '#8DB56B', '#4a7a36'];

/* ════════════════════════════════════════════════════════════════════════════
   Auth helper
════════════════════════════════════════════════════════════════════════════ */

function authFetch(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      ...((init.headers as Record<string, string>) ?? {}),
      'Content-Type': 'application/json',
    },
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   Chart normaliser  (handles old {label,value} and new {xKey, series} shapes)
════════════════════════════════════════════════════════════════════════════ */

function normalizeChart(raw: unknown): ChartData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.data) || r.data.length === 0) return null;

  // Already the new format
  if (typeof r.xKey === 'string' && Array.isArray(r.series)) {
    return raw as ChartData;
  }

  // Old MiniBarChart format: data is [{label, value}]
  const first = r.data[0] as Record<string, unknown>;
  if ('label' in first && 'value' in first) {
    return {
      type:   (r.type as ChartData['type']) ?? 'bar',
      title:  String(r.title ?? ''),
      xKey:   'label',
      series: [{ key: 'value', label: String(r.unit ?? 'ערך'), color: '#517B3E' }],
      data:   r.data as Record<string, string | number>[],
    };
  }

  return null;
}

/* ════════════════════════════════════════════════════════════════════════════
   Download / print report
════════════════════════════════════════════════════════════════════════════ */

function handleDownload(msgId: string): void {
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @page { size: A4 portrait; margin: 15mm; }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { visibility: hidden !important; background: white !important; }
      #cfo-report-${msgId} {
        visibility: visible !important;
        position: fixed !important; inset: 0 !important;
        background: white !important;
        padding: 28px 32px !important;
        direction: rtl !important;
        font-family: system-ui, -apple-system, 'Heebo', sans-serif !important;
        z-index: 999999 !important;
      }
      #cfo-report-${msgId} * { visibility: visible !important; }
      #cfo-report-${msgId} .cfo-no-print { display: none !important; }
    }
  `;
  document.head.appendChild(styleEl);
  window.print();
  window.addEventListener('afterprint', () => styleEl.remove(), { once: true });
}

/* ════════════════════════════════════════════════════════════════════════════
   FinancialChart  (Recharts)
════════════════════════════════════════════════════════════════════════════ */

interface TooltipPayload { name?: string; value?: number; color?: string }
interface ChartTooltipProps {
  active?:     boolean;
  payload?:    TooltipPayload[];
  label?:      string;
  isCurrency?: boolean;
}

function ChartTooltip({ active, payload, label, isCurrency }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background:   'rgba(253,252,248,0.97)',
      border:       '1px solid rgba(107,144,74,0.22)',
      borderRadius: 10,
      padding:      '8px 14px',
      boxShadow:    '0 4px 16px rgba(0,0,0,0.09)',
      direction:    'rtl',
      fontFamily:   'inherit',
      minWidth:     120,
    }}>
      <p style={{ fontWeight: 700, color: '#1e2a45', marginBottom: 4, fontSize: 12 }}>
        {label}
      </p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? '#517B3E', fontWeight: 600, fontSize: 11, margin: 0 }}>
          {p.name}:{' '}
          {isCurrency
            ? `₪${Number(p.value ?? 0).toLocaleString('he-IL')}`
            : Number(p.value ?? 0).toLocaleString('he-IL')}
        </p>
      ))}
    </div>
  );
}

function FinancialChart({ chart }: { chart: ChartData }) {
  if (!chart.data?.length) return null;

  const isCurrency = chart.series.some(s =>
    ['revenue', 'amount', 'income'].includes(s.key),
  );

  const yFmt = (v: number) =>
    isCurrency
      ? v >= 1000 ? `₪${(v / 1000).toFixed(1)}k` : `₪${v}`
      : String(v);

  const sharedChartProps = {
    data:   chart.data,
    margin: { top: 10, right: 10, left: isCurrency ? 10 : 0, bottom: 0 },
  };

  const grid   = <CartesianGrid strokeDasharray="3 3" stroke="rgba(200,190,170,0.18)" vertical={false} />;
  const xAxis  = (
    <XAxis
      dataKey={chart.xKey}
      tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'inherit' }}
      axisLine={false} tickLine={false}
    />
  );
  const yAxis  = (
    <YAxis
      tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'inherit' }}
      axisLine={false} tickLine={false}
      tickFormatter={yFmt}
      width={isCurrency ? 54 : 30}
    />
  );
  const tooltip = (
    <Tooltip
      content={(props) => (
        <ChartTooltip
          active={props.active}
          payload={props.payload as unknown as TooltipPayload[]}
          label={String(props.label ?? '')}
          isCurrency={isCurrency}
        />
      )}
      cursor={{ fill: 'rgba(81,123,62,0.06)' }}
    />
  );

  /* Bar chart */
  if (chart.type === 'bar') {
    return (
      <div style={{ width: '100%', height: 210 }}>
        <ResponsiveContainer>
          <BarChart {...sharedChartProps}>
            {grid}{xAxis}{yAxis}{tooltip}
            {chart.series.map((s, si) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color ?? CHART_COLORS[si % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={52}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  /* Area / line chart */
  const gradId = `cfo-grad-${chart.series[0]?.key ?? 'v'}`;
  const strokeColor = chart.series[0]?.color ?? CHART_COLORS[0];
  return (
    <div style={{ width: '100%', height: 210 }}>
      <ResponsiveContainer>
        <AreaChart {...sharedChartProps}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={strokeColor} stopOpacity={0.28} />
              <stop offset="95%" stopColor={strokeColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {grid}{xAxis}{yAxis}{tooltip}
          {chart.series.map((s, si) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? CHART_COLORS[si % CHART_COLORS.length]}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
              dot={{ r: 4, fill: s.color ?? CHART_COLORS[si], strokeWidth: 0 }}
              activeDot={{ r: 5, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Icons
════════════════════════════════════════════════════════════════════════════ */

function BriefcaseIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  );
}

function ToolIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l5.654-4.654m5.598-2.392 3.03-2.496c.14-.468.382-.89.766-1.208l-.001-.001A2.653 2.653 0 0 0 17.25 3.75L15 6l3 3-2.25 2.25Z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

/* ── Typing indicator ─────────────────────────────────────────────────────── */

function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-label="מנתח...">
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
          background: '#6B904A', opacity: 0.7,
          animation: `cfo-bounce 1.1s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Welcome message constant
════════════════════════════════════════════════════════════════════════════ */

const WELCOME: ChatMsg = {
  id:   'welcome',
  role: 'assistant',
  content:
    'שלום! אני רואה החשבון ה-AI שלכם — CFO וירטואלי מוסמך.\n\n' +
    'כעת אני מחובר לנתוני הפלטפורמה בזמן אמת ויכול לסייע בדוחות הכנסות, ' +
    'ניתוח רווחיות, חישוב מס (עוסק פטור), ותחזיות עסקיות.\n\n' +
    'השתמש בכפתורי הפעולה המהירה, או שאל כל שאלה פיננסית.',
};

/* ════════════════════════════════════════════════════════════════════════════
   Markdown component renderers — financial report styling (RTL / Matcha)
════════════════════════════════════════════════════════════════════════════ */

const CFO_MD_COMPONENTS: Components = {
  // ── Headers ──────────────────────────────────────────────────────────────
  h1: ({ children }) => (
    <h1 style={{
      fontSize: '1.05rem', fontWeight: 800, color: '#2A3B22', lineHeight: 1.35,
      borderBottom: '2px solid rgba(81,123,62,0.22)',
      paddingBottom: '6px', marginTop: '4px', marginBottom: '12px',
    }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{
      fontSize: '0.95rem', fontWeight: 700, color: '#3d6030', lineHeight: 1.35,
      borderRight: '3px solid #517B3E', paddingRight: '9px',
      marginTop: '18px', marginBottom: '9px',
    }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{
      fontSize: '0.875rem', fontWeight: 700, color: '#517B3E', lineHeight: 1.35,
      marginTop: '14px', marginBottom: '7px',
    }}>{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 style={{
      fontSize: '0.83rem', fontWeight: 600, color: '#4a7a36',
      marginTop: '12px', marginBottom: '5px',
    }}>{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 style={{
      fontSize: '0.8rem', fontWeight: 600, color: '#517B3E',
      marginTop: '10px', marginBottom: '4px',
    }}>{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 style={{
      fontSize: '0.78rem', fontWeight: 600, color: '#6b8f50',
      marginTop: '8px', marginBottom: '4px',
    }}>{children}</h6>
  ),

  // ── Paragraphs ────────────────────────────────────────────────────────────
  p: ({ children }) => (
    <p style={{ margin: '0 0 9px 0', lineHeight: 1.65 }}>{children}</p>
  ),

  // ── Inline emphasis ───────────────────────────────────────────────────────
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700, color: '#1e2a45' }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ fontStyle: 'italic', color: '#4a5568' }}>{children}</em>
  ),

  // ── Lists ─────────────────────────────────────────────────────────────────
  ul: ({ children }) => (
    <ul style={{
      margin: '5px 0 10px 0',
      paddingRight: '20px', paddingLeft: 0,
      listStyleType: 'disc',
    }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{
      margin: '5px 0 10px 0',
      paddingRight: '20px', paddingLeft: 0,
    }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{ marginBottom: '5px', lineHeight: 1.6 }}>{children}</li>
  ),

  // ── Code ─────────────────────────────────────────────────────────────────
  pre: ({ children }) => (
    <pre style={{
      margin: '10px 0', borderRadius: '8px', overflow: 'hidden',
      background: '#1e2a45', border: '1px solid rgba(0,0,0,0.15)',
    }}>{children}</pre>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? '');
    if (isBlock) {
      return (
        <code style={{
          display: 'block', direction: 'ltr', textAlign: 'left',
          color: '#e2e8f0', padding: '12px 14px', fontSize: '0.78rem',
          fontFamily: 'monospace', overflowX: 'auto', lineHeight: 1.6,
        }}>{children}</code>
      );
    }
    return (
      <code style={{
        background: 'rgba(81,123,62,0.1)', color: '#2A3B22',
        padding: '1px 5px', borderRadius: '4px',
        fontSize: '0.85em', fontFamily: 'monospace',
        border: '1px solid rgba(81,123,62,0.18)',
      }}>{children}</code>
    );
  },

  // ── Financial data tables ─────────────────────────────────────────────────
  table: (({ children }) => (
    <div style={{
      overflowX: 'auto', margin: '14px 0',
      borderRadius: '10px', border: '1px solid rgba(81,123,62,0.18)',
      boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
    }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        fontSize: '0.8rem', minWidth: 260,
      }}>{children}</table>
    </div>
  )) as Components['table'],
  thead: ({ children }) => (
    <thead style={{ background: 'rgba(81,123,62,0.1)' }}>{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr style={{ borderBottom: '1px solid rgba(200,190,170,0.35)' }}>{children}</tr>
  ),
  th: ({ children }) => (
    <th style={{
      padding: '8px 12px', textAlign: 'right',
      fontWeight: 700, color: '#2A3B22', whiteSpace: 'nowrap',
      borderBottom: '1.5px solid rgba(81,123,62,0.22)',
      fontSize: '0.78rem', letterSpacing: '0.01em',
    }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{
      padding: '7px 12px', textAlign: 'right',
      color: '#374151', verticalAlign: 'top', lineHeight: 1.5,
    }}>{children}</td>
  ),

  // ── Blockquote — CFO insight callout ─────────────────────────────────────
  blockquote: ({ children }) => (
    <blockquote style={{
      borderRight: '3px solid #517B3E',
      margin: '12px 0', padding: '8px 12px',
      color: '#4a5568', background: 'rgba(81,123,62,0.05)',
      borderRadius: '0 8px 8px 0', fontSize: '0.875rem',
    }}>{children}</blockquote>
  ),

  // ── HR separator ─────────────────────────────────────────────────────────
  hr: () => (
    <hr style={{
      border: 'none', borderTop: '1px solid rgba(81,123,62,0.18)',
      margin: '14px 0',
    }} />
  ),
};

/* ════════════════════════════════════════════════════════════════════════════
   AiAccountantChat  — main component
════════════════════════════════════════════════════════════════════════════ */

export default function AiAccountantChat({ api, preloadMessage, onPreloadConsumed }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([WELCOME]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [toolHint, setToolHint] = useState('');
  const hintTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  /* ── sendMessage ─────────────────────────────────────────────────────────── */
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: trimmed }]);
    setInput('');
    setLoading(true);
    setError('');

    /* Start cycling loading phrases */
    let phraseIdx = 0;
    setToolHint(LOADING_PHRASES[0]);
    hintTimerRef.current = setInterval(() => {
      phraseIdx = (phraseIdx + 1) % LOADING_PHRASES.length;
      setToolHint(LOADING_PHRASES[phraseIdx]);
    }, 2400);

    const history = messages
      .filter(m => m.id !== 'welcome')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await authFetch(`${api}/api/admin/ai-accountant/chat`, {
        method: 'POST',
        body:   JSON.stringify({ message: trimmed, history }),
      });

      let data: {
        response?: string; text?: string;
        chartData?: unknown; status?: string; error?: string;
      } = {};
      try { data = await res.json(); } catch { /* non-JSON */ }

      if (!res.ok || data.status === 'error') {
        throw new Error(data.response ?? data.error ?? `HTTP ${res.status}`);
      }

      const content   = (data.response ?? data.text ?? '').trim();
      const chartData = normalizeChart(data.chartData);

      setMessages(prev => [
        ...prev,
        {
          id:        `a-${Date.now()}`,
          role:      'assistant',
          content:   content || 'לא התקבלה תגובה מהסוכן.',
          chartData,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setMessages(prev => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', content: `⚠️ שגיאה: ${msg}` },
      ]);
    } finally {
      if (hintTimerRef.current) { clearInterval(hintTimerRef.current); hintTimerRef.current = null; }
      setLoading(false);
      setToolHint('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [api, messages, loading]);

  // Auto-send when an alert deep-links into the chat — runs after sendMessage is declared
  useEffect(() => {
    if (!preloadMessage) return;
    const id = window.setTimeout(() => {
      void sendMessage(preloadMessage);
      onPreloadConsumed?.();
    }, 150);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(input); }
  };

  const clearChat = () => {
    setMessages([{ ...WELCOME, id: `welcome-${Date.now()}` }]);
    setError('');
    setInput('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes cfo-bounce {
          0%, 80%, 100% { transform: translateY(0);   opacity: 0.4; }
          40%            { transform: translateY(-5px); opacity: 1;   }
        }
      `}</style>

      <div
        className="rounded-2xl overflow-hidden bg-[#FDFCF8] border border-stone-200 flex flex-col"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)', minHeight: 580 }}
      >
        {/* ── Header ──────────────────────────────────────────────────────────*/}
        <div
          className="px-6 py-4 flex items-center justify-between border-b border-stone-100 shrink-0"
          style={{ background: 'linear-gradient(135deg,rgba(107,144,74,0.08) 0%,rgba(245,243,237,0) 70%)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(107,144,74,0.13)',
                border: '1.5px solid rgba(107,144,74,0.28)',
                boxShadow: '0 2px 8px rgba(107,144,74,0.1)',
              }}
            >
              <BriefcaseIcon className="w-5 h-5 text-[#6B904A]" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800 tracking-tight">רואה חשבון AI</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.2)' }} />
                <p className="text-[11px] text-slate-400 font-medium">CFO Agent · גישה לנתונים בזמן אמת</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={e => { e.preventDefault(); clearChat(); }}
            className="cfo-no-print flex items-center gap-1.5 text-xs font-medium text-slate-400
                       hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg
                       hover:bg-red-50 border border-transparent hover:border-red-100"
          >
            <TrashIcon /> נקה
          </button>
        </div>

        {/* ── Tool-hint strip ─────────────────────────────────────────────────*/}
        {loading && toolHint && (
          <div
            className="px-5 py-1.5 flex items-center gap-2 border-b border-stone-50 shrink-0"
            style={{ background: 'rgba(107,144,74,0.05)' }}
          >
            <span className="text-[#6B904A]"><ToolIcon /></span>
            <span className="text-[11px] text-[#6B904A] font-medium">{toolHint}</span>
          </div>
        )}

        {/* ── Messages ────────────────────────────────────────────────────────*/}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5" style={{ minHeight: 320 }}>
          {messages.map(msg => (
            <div key={msg.id} className="flex flex-col gap-1.5">
              {/* Row: avatar + bubble + chart */}
              <div
                id={`cfo-report-${msg.id}`}
                className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* AI avatar */}
                {msg.role === 'assistant' && (
                  <div
                    className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center mb-0.5"
                    style={{ background: 'rgba(107,144,74,0.12)', border: '1px solid rgba(107,144,74,0.22)' }}
                  >
                    <BriefcaseIcon className="w-3.5 h-3.5 text-[#6B904A]" />
                  </div>
                )}

                {/* Bubble */}
                <div
                  dir="rtl"
                  className={`rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'rounded-tr-sm max-w-[78%] px-4 py-3'
                      : 'rounded-tl-sm max-w-[90%] px-4 pt-3 pb-4'
                  }`}
                  style={{
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #6B904A 0%, #4a7a36 100%)'
                      : '#F0EDE7',
                    color:      msg.role === 'user' ? 'white' : '#374151',
                    border:     msg.role === 'assistant' ? '1px solid rgba(0,0,0,0.05)' : 'none',
                    whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
                    wordBreak:  'break-word',
                    boxShadow:  msg.role === 'user'
                      ? '0 2px 10px rgba(107,144,74,0.25)'
                      : '0 1px 4px rgba(0,0,0,0.04)',
                  }}
                >
                  {msg.role === 'user' ? msg.content : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={CFO_MD_COMPONENTS}>
                      {msg.content}
                    </ReactMarkdown>
                  )}

                  {/* Chart rendered inside the bubble */}
                  {msg.role === 'assistant' && msg.chartData && (
                    <div
                      className="mt-4 pt-4"
                      style={{ borderTop: '1px solid rgba(107,144,74,0.15)' }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                        {msg.chartData.title}
                      </p>
                      <FinancialChart chart={msg.chartData} />
                    </div>
                  )}
                </div>
              </div>

              {/* Download button — only for AI messages with chart data */}
              {msg.role === 'assistant' && msg.chartData && (
                <div className="cfo-no-print flex ps-9">
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); handleDownload(msg.id); }}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg
                               transition-all hover:opacity-80"
                    style={{
                      background: 'rgba(81,123,62,0.07)',
                      color:      '#4a7a36',
                      border:     '1px solid rgba(81,123,62,0.18)',
                      cursor:     'pointer',
                    }}
                  >
                    <DownloadIcon /> הורד דוח פיננסי
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex items-end gap-2.5 flex-row">
              <div
                className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
                style={{ background: 'rgba(107,144,74,0.12)', border: '1px solid rgba(107,144,74,0.22)' }}
              >
                <BriefcaseIcon className="w-3.5 h-3.5 text-[#6B904A]" />
              </div>
              <div
                dir="rtl"
                className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2"
                style={{
                  background: '#F0EDE7',
                  border:     '1px solid rgba(0,0,0,0.05)',
                  boxShadow:  '0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                <TypingDots />
                {toolHint && (
                  <span className="text-[11px] text-slate-400 font-medium">{toolHint}</span>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div
            className="mx-4 mb-2 px-4 py-2 rounded-xl text-xs font-medium text-red-600 shrink-0"
            style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.14)' }}
          >
            {error}
          </div>
        )}

        {/* ── Input row ───────────────────────────────────────────────────────*/}
        <div
          className="cfo-no-print px-4 pt-3 pb-2 border-t border-stone-100 flex items-end gap-3 shrink-0"
          style={{ background: 'rgba(245,243,237,0.6)' }}
          dir="rtl"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="שאל שאלה פיננסית... (Enter לשליחה, Shift+Enter לשורה חדשה)"
            rows={2}
            disabled={loading}
            className="flex-1 resize-none text-sm text-slate-700 placeholder-slate-400
                       outline-none rounded-xl px-4 py-2.5 bg-white border border-stone-200
                       transition-shadow disabled:opacity-50"
            style={{ fontFamily: 'inherit', lineHeight: 1.55, maxHeight: 120 }}
            onFocus={e => { e.target.style.borderColor = '#6B904A'; e.target.style.boxShadow = '0 0 0 3px rgba(107,144,74,0.12)'; }}
            onBlur={e  => { e.target.style.borderColor = ''; e.target.style.boxShadow = ''; }}
          />
          <button
            type="button"
            onClick={e => { e.preventDefault(); void sendMessage(input); }}
            disabled={loading || !input.trim()}
            aria-label="שלח"
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
                       transition-opacity hover:opacity-85 disabled:opacity-35"
            style={{ background: '#6B904A', color: 'white', cursor: 'pointer' }}
          >
            <SendIcon />
          </button>
        </div>

        {/* ── Periodic report buttons ──────────────────────────────────────── */}
        <div
          className="cfo-no-print px-4 pt-2 pb-2 flex items-center gap-2 overflow-x-auto shrink-0"
          style={{
            background:    'rgba(81,123,62,0.04)',
            borderTop:     '1px solid rgba(81,123,62,0.1)',
            scrollbarWidth: 'none',
          }}
          dir="rtl"
        >
          <span className="text-[10px] font-bold text-slate-400 shrink-0 whitespace-nowrap uppercase tracking-wider">
            דוחות:
          </span>
          {REPORT_ACTIONS.map(action => (
            <button
              key={action.label}
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                setInput(action.prompt);
                setTimeout(() => { void sendMessage(action.prompt); }, 50);
              }}
              disabled={loading}
              className="shrink-0 text-[11px] font-bold px-3.5 py-1.5 rounded-lg whitespace-nowrap
                         transition-all hover:scale-[1.04] active:scale-[0.97] disabled:opacity-35"
              style={{
                background: 'white',
                color:      '#3d6030',
                border:     '1.5px solid rgba(81,123,62,0.3)',
                boxShadow:  '0 1px 4px rgba(81,123,62,0.12)',
                cursor:     'pointer',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background   = 'rgba(81,123,62,0.07)';
                e.currentTarget.style.borderColor  = 'rgba(81,123,62,0.5)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background   = 'white';
                e.currentTarget.style.borderColor  = 'rgba(81,123,62,0.3)';
              }}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* ── Quick actions ────────────────────────────────────────────────── */}
        <div
          className="cfo-no-print px-4 pb-4 pt-2 flex items-center gap-2 overflow-x-auto shrink-0"
          style={{ scrollbarWidth: 'none' }}
          dir="rtl"
        >
          <span className="text-[11px] text-slate-400 font-medium shrink-0 whitespace-nowrap">
            פעולות מהירות:
          </span>
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              type="button"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                setInput(action.prompt);
                setTimeout(() => { void sendMessage(action.prompt); }, 50);
              }}
              disabled={loading}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full
                         transition-all hover:opacity-80 disabled:opacity-35 whitespace-nowrap"
              style={{
                background: 'rgba(107,144,74,0.09)',
                color:      '#4a7a36',
                border:     '1px solid rgba(107,144,74,0.22)',
                cursor:     'pointer',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
