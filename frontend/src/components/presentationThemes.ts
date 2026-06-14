/* ── Theme system for the AI Presentation Agent's SlideViewer (/presentation-generator) ──
   5 light-background "Matcha Executive Light"-family themes, each with its own
   accent-color hue, so every generated deck gets a distinct visual identity while
   staying within the app's bright, high-contrast design language: a pale
   off-white background, near-black body text, and a single saturated accent
   color used only for borders, icons, and highlighted numbers/dates (never as
   a slide background). */

'use client';

import { createContext, useContext } from 'react';

export interface PresentationTheme {
  id:          string;
  label:       { he: string; en: string };
  bg:          string;
  accent:      string;
  accentDark:  string;
  text:        string;
  cream:       string;
  layerColors: string[]; // 4, used by the "architecture" layout
  pieColors:   string[]; // 6, used by ChartSlide's donut chart
}

export const PRESENTATION_THEMES: PresentationTheme[] = [
  {
    id: 'matcha',
    label: { he: 'מאצ\'ה ניהולי', en: 'Matcha Executive' },
    bg:          '#F9FAF5',
    accent:      '#8BAF84',
    accentDark:  '#517B3E',
    text:        '#1A2B23',
    cream:       '#527061',
    layerColors: ['#517B3E', '#9C5A38', '#5C6470', '#3D5A6C'],
    pieColors:   ['#8BAF84', '#517B3E', '#A8C9A1', '#3F5C39', '#6FA888', '#2A3B22'],
  },
  {
    id: 'steel',
    label: { he: 'כחול פלדה', en: 'Steel Blue' },
    bg:          '#F4F8FB',
    accent:      '#7FAFD4',
    accentDark:  '#2D6390',
    text:        '#16242E',
    cream:       '#5A7488',
    layerColors: ['#2D6390', '#9C5A38', '#5C6470', '#3F7A56'],
    pieColors:   ['#7FAFD4', '#2D6390', '#AED1EA', '#1C3F5C', '#5B93B8', '#163245'],
  },
  {
    id: 'violet',
    label: { he: 'סגול מלכותי', en: 'Royal Violet' },
    bg:          '#F8F6FB',
    accent:      '#A98ED1',
    accentDark:  '#5E3F8E',
    text:        '#241B33',
    cream:       '#6E5E85',
    layerColors: ['#5E3F8E', '#9C5A38', '#5C6470', '#3F7A56'],
    pieColors:   ['#A98ED1', '#5E3F8E', '#D6C6EE', '#46306C', '#8E72BA', '#2E2046'],
  },
  {
    id: 'amber',
    label: { he: 'ענבר חם', en: 'Ember Amber' },
    bg:          '#FBF8F2',
    accent:      '#E3A85C',
    accentDark:  '#985C19',
    text:        '#2E2415',
    cream:       '#7A6650',
    layerColors: ['#985C19', '#5C6470', '#3F7A56', '#3D5A6C'],
    pieColors:   ['#E3A85C', '#A6651E', '#F4CD96', '#7A4A12', '#D08C3F', '#5C390E'],
  },
  {
    id: 'teal',
    label: { he: 'טורקיז אוקיינוס', en: 'Ocean Teal' },
    bg:          '#F2FAF9',
    accent:      '#6FC2B9',
    accentDark:  '#247A70',
    text:        '#16302C',
    cream:       '#52786F',
    layerColors: ['#247A70', '#9C5A38', '#5C6470', '#3D5A6C'],
    pieColors:   ['#6FC2B9', '#247A70', '#AEE3DC', '#13473F', '#4FA399', '#0E332D'],
  },
];

/* hex (#RRGGBB) -> "rgba(r, g, b, a)", for translucent borders/fills/shadows
   derived from the active theme's base colors. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* Deterministic pick from deck content so a given generated deck always opens
   with the same theme (until the user hits "shuffle theme"). */
export function pickThemeForDeck(slides: { title: string }[]): PresentationTheme {
  const str = slides.map(s => s.title).join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return PRESENTATION_THEMES[Math.abs(hash) % PRESENTATION_THEMES.length];
}

const DeckThemeContext = createContext<PresentationTheme>(PRESENTATION_THEMES[0]);
export const DeckThemeProvider = DeckThemeContext.Provider;
export function useDeckTheme(): PresentationTheme {
  return useContext(DeckThemeContext);
}
