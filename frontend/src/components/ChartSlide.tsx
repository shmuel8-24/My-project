/* ── Chart slide for the AI Presentation Agent's "barChart" layout ──
   Renders chartData ({label, percentage}[]) as a Recharts horizontal bar
   chart paired with a donut chart, themed via the active deck theme from
   presentationThemes.ts (DeckThemeProvider, set up in SlideViewer.tsx):
   pale background, dark text, theme-accent bars/slices, faint gray grid lines.

   RTL: the bar chart's category axis sits on the right (orientation="right")
   and its value axis is reversed so bars grow right-to-left, matching the
   Hebrew slide content rendered by the rest of the deck. */

'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, ResponsiveContainer,
} from 'recharts';
import type { DeckChartItem } from './SlideViewer';
import { useDeckTheme, hexToRgba } from './presentationThemes';

const HEADING_FONT = 'var(--font-urbanist), var(--font-assistant), sans-serif';
const BODY_FONT    = 'var(--font-assistant), sans-serif';

interface TooltipPayloadItem { value?: number; payload?: DeckChartItem }
interface ChartTooltipProps { active?: boolean; payload?: TooltipPayloadItem[] }

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  const theme = useDeckTheme();
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div style={{
      background:   theme.bg,
      border:       `1px solid ${theme.accent}`,
      borderRadius: 8,
      padding:      '6px 12px',
      boxShadow:    `0 4px 16px ${hexToRgba(theme.text, 0.12)}`,
      direction:    'rtl',
      fontFamily:   BODY_FONT,
    }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: theme.text }}>{item.payload?.label}</p>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: theme.accentDark }}>{item.value}%</p>
    </div>
  );
}

function BarPanel({ data }: { data: DeckChartItem[] }) {
  const theme = useDeckTheme();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
        <CartesianGrid stroke="#E2EBE5" horizontal={false} />
        <XAxis
          type="number" domain={[0, 100]} reversed
          tick={{ fill: theme.cream, fontSize: 11, fontFamily: BODY_FONT }}
          axisLine={{ stroke: hexToRgba(theme.accent, 0.25) }} tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category" dataKey="label" orientation="right"
          tick={{ fill: theme.text, fontSize: 13, fontWeight: 600, fontFamily: BODY_FONT }}
          axisLine={false} tickLine={false} width={120}
        />
        <Tooltip
          content={(props) => (
            <ChartTooltip active={props.active} payload={props.payload as unknown as TooltipPayloadItem[]} />
          )}
          cursor={{ fill: hexToRgba(theme.accent, 0.08) }}
        />
        <Bar dataKey="percentage" fill={theme.accent} radius={[6, 0, 0, 6]} barSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PiePanel({ data }: { data: DeckChartItem[] }) {
  const theme = useDeckTheme();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data} dataKey="percentage" nameKey="label"
          cx="50%" cy="44%" innerRadius="48%" outerRadius="78%"
          paddingAngle={2} stroke={theme.bg} strokeWidth={2}
        >
          {data.map((_, i) => <Cell key={i} fill={theme.pieColors[i % theme.pieColors.length]} />)}
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
            <span style={{ color: theme.text, fontFamily: BODY_FONT, fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function ChartSlide({ title, data }: { title: string; data: DeckChartItem[] }) {
  const theme = useDeckTheme();
  return (
    <div className="w-full h-full flex flex-col px-16 py-14 gap-6">
      <h2 className="text-2xl md:text-3xl font-extrabold leading-snug shrink-0" style={{ color: theme.text, fontFamily: HEADING_FONT }}>{title}</h2>
      <div className="flex-1 flex gap-8 min-h-0">
        <div className="flex-1 min-w-0"><BarPanel data={data} /></div>
        <div className="flex-1 min-w-0"><PiePanel data={data} /></div>
      </div>
    </div>
  );
}
