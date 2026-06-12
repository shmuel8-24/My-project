/* ── Chart slide for the AI Presentation Agent's "barChart" layout ──
   Renders chartData ({label, percentage}[]) as a Recharts horizontal bar
   chart paired with a donut chart, both themed to the "Matcha Executive"
   deck palette (see SlideViewer.tsx).

   RTL: the bar chart's category axis sits on the right (orientation="right")
   and its value axis is reversed so bars grow right-to-left, matching the
   Hebrew slide content rendered by the rest of the deck. */

'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
} from 'recharts';
import type { DeckChartItem } from './SlideViewer';

const EXEC = {
  bg:     '#0c120e',
  accent: '#8BAF84',
  text:   '#f5f5f5',
  cream:  '#daffde',
};

const HEADING_FONT = 'var(--font-urbanist), var(--font-assistant), sans-serif';
const BODY_FONT    = 'var(--font-assistant), sans-serif';

/* Matcha-toned palette for pie slices, cycled if >6 items */
const PIE_COLORS = ['#8BAF84', '#DAFFDE', '#5E9C72', '#C4DCC0', '#3F5C39', '#A8C9A1'];

interface TooltipPayloadItem { value?: number; payload?: DeckChartItem }
interface ChartTooltipProps { active?: boolean; payload?: TooltipPayloadItem[] }

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div style={{
      background:   EXEC.bg,
      border:       `1px solid ${EXEC.accent}`,
      borderRadius: 8,
      padding:      '6px 12px',
      direction:    'rtl',
      fontFamily:   BODY_FONT,
    }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: EXEC.text }}>{item.payload?.label}</p>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: EXEC.accent }}>{item.value}%</p>
    </div>
  );
}

function BarPanel({ data }: { data: DeckChartItem[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="rgba(245,245,245,0.08)" horizontal={false} />
        <XAxis
          type="number" domain={[0, 100]} reversed
          tick={{ fill: EXEC.cream, fontSize: 11, fontFamily: BODY_FONT }}
          axisLine={{ stroke: 'rgba(139,175,132,0.25)' }} tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category" dataKey="label" orientation="right"
          tick={{ fill: EXEC.text, fontSize: 13, fontWeight: 600, fontFamily: BODY_FONT }}
          axisLine={false} tickLine={false} width={120}
        />
        <Tooltip
          content={(props) => (
            <ChartTooltip active={props.active} payload={props.payload as unknown as TooltipPayloadItem[]} />
          )}
          cursor={{ fill: 'rgba(139,175,132,0.08)' }}
        />
        <Bar dataKey="percentage" fill={EXEC.accent} radius={[6, 0, 0, 6]} barSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PiePanel({ data }: { data: DeckChartItem[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data} dataKey="percentage" nameKey="label"
          cx="50%" cy="44%" innerRadius="48%" outerRadius="78%"
          paddingAngle={2} stroke={EXEC.bg} strokeWidth={2}
        >
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip
          content={(props) => (
            <ChartTooltip active={props.active} payload={props.payload as unknown as TooltipPayloadItem[]} />
          )}
        />
        <Legend
          layout="horizontal" verticalAlign="bottom" align="center"
          iconSize={10}
          wrapperStyle={{ direction: 'rtl' }}
          formatter={(value: string) => (
            <span style={{ color: EXEC.text, fontFamily: BODY_FONT, fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function ChartSlide({ title, data }: { title: string; data: DeckChartItem[] }) {
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-6">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: EXEC.text, fontFamily: HEADING_FONT }}>{title}</h2>
      <div className="flex-1 flex gap-8 min-h-0">
        <div className="flex-1 min-w-0"><BarPanel data={data} /></div>
        <div className="flex-1 min-w-0"><PiePanel data={data} /></div>
      </div>
    </div>
  );
}
