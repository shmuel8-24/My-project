/* ── PPTX export for the AI Presentation Agent (/presentation-generator) ──
   Maps DeckSlide JSON (see SlideViewer.tsx) onto native PowerPoint shapes/
   text/charts via pptxgenjs, mirroring the on-screen "Matcha Executive Light"
   deck theme: pale off-white background, near-black text, matcha-green
   accents, with RTL alignment for Hebrew decks. pptxgenjs is imported
   dynamically so it never loads during SSR — only when the user clicks
   "Download as PPTX". */

import type PptxGenJS from 'pptxgenjs';
import type { DeckSlide } from './SlideViewer';

/* "Matcha Executive Light" palette — pptxgenjs hex colors have no leading '#' */
const EXEC_BG        = 'F8FAF5';
const EXEC_ACCENT    = '8BAF84';
const EXEC_ACCENT_DK = '517B3E';
const EXEC_TEXT      = '1C3329';
const EXEC_CREAM     = '527061';

/* "architecture" per-layer accent colors, mirrors LAYER_COLORS in SlideViewer.tsx
   — darkened for contrast against the light slide background */
const LAYER_COLORS = ['A8623E', '3D5A6C', '5C6470', '3F7A56'];

const FONT = 'Arial';

/* LAYOUT_WIDE = 13.333" x 7.5" — same 16:9 aspect ratio as the on-screen 1280x720 slide rect */
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

function toBullets(content: DeckSlide['content']): string[] {
  if (content == null) return [];
  return Array.isArray(content)
    ? content.map(String)
    : String(content).split('\n').map(b => b.trim()).filter(Boolean);
}

function toText(content: DeckSlide['content']): string {
  if (content == null) return '';
  return Array.isArray(content) ? content.join(' ') : String(content);
}

function addHeading(slide: PptxGenJS.Slide, title: string, isHe: boolean) {
  slide.addText(title, {
    x: 0.6, y: 0.45, w: SLIDE_W - 1.2, h: 0.9,
    fontFace: FONT, fontSize: 24, bold: true, color: EXEC_TEXT,
    align: isHe ? 'right' : 'left', valign: 'middle', rtlMode: isHe,
  });
}

/* Draws a straight connector line between two points using a "line" shape's
   bounding box — flipV picks whether the diagonal runs TL->BR or BL->TR. */
function addConnectorLine(
  pptx: PptxGenJS, slide: PptxGenJS.Slide,
  x1: number, y1: number, x2: number, y2: number,
) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.max(Math.abs(x2 - x1), 0.01);
  const h = Math.max(Math.abs(y2 - y1), 0.01);
  const flipV = (x1 < x2) !== (y1 < y2);
  slide.addShape(pptx.ShapeType.line, {
    x, y, w, h, flipV,
    line: { color: EXEC_ACCENT, width: 1.25, transparency: 35 },
  });
}

function buildBulletsBlock(
  pptx: PptxGenJS, slide: PptxGenJS.Slide, bullets: string[], isHe: boolean,
  x: number, y: number, w: number, h: number,
) {
  slide.addText(
    bullets.map(b => ({
      text: b,
      options: {
        bullet: { code: '25CF', indent: 18 },
        color: EXEC_TEXT, fontSize: 14, fontFace: FONT,
        align: isHe ? 'right' as const : 'left' as const,
        breakLine: true, paraSpaceAfter: 10,
      },
    })),
    { x, y, w, h, valign: 'middle', rtlMode: isHe },
  );
}

function buildSlideContent(pptx: PptxGenJS, pptxSlide: PptxGenJS.Slide, slide: DeckSlide, isHe: boolean) {
  switch (slide.layout) {
    case 'bullets': {
      addHeading(pptxSlide, slide.title, isHe);
      buildBulletsBlock(pptx, pptxSlide, toBullets(slide.content), isHe, 0.8, 1.5, SLIDE_W - 1.6, SLIDE_H - 2.2);
      break;
    }

    case 'metric': {
      pptxSlide.addText(toText(slide.content), {
        x: 1, y: 2.1, w: SLIDE_W - 2, h: 2,
        fontFace: FONT, fontSize: 72, bold: true, color: EXEC_ACCENT_DK,
        align: 'center', valign: 'middle',
      });
      pptxSlide.addText(slide.title, {
        x: 1.5, y: 4.25, w: SLIDE_W - 3, h: 1,
        fontFace: FONT, fontSize: 20, bold: true, color: EXEC_TEXT,
        align: 'center', valign: 'top', rtlMode: isHe,
      });
      break;
    }

    case 'split-screen':
    case 'bleedImage': {
      addHeading(pptxSlide, slide.title, isHe);
      buildBulletsBlock(pptx, pptxSlide, toBullets(slide.content), isHe, 0.8, 1.5, SLIDE_W / 2 - 1, SLIDE_H - 2.2);
      pptxSlide.addShape(pptx.ShapeType.roundRect, {
        x: SLIDE_W / 2 + 0.2, y: 1.0, w: SLIDE_W / 2 - 0.8, h: SLIDE_H - 1.6,
        rectRadius: 0.06,
        fill: { color: EXEC_ACCENT, transparency: 88 },
        line: { color: EXEC_ACCENT, width: 1, transparency: 65 },
      });
      break;
    }

    case 'timeline': {
      addHeading(pptxSlide, slide.title, isHe);
      const items = slide.timelineData ?? [];
      const n = Math.max(items.length, 1);
      const areaX = 0.8, areaW = SLIDE_W - 1.6, lineY = 2.3;
      const colW = areaW / n;

      pptxSlide.addShape(pptx.ShapeType.line, {
        x: areaX, y: lineY, w: areaW, h: 0,
        line: { color: EXEC_ACCENT, width: 1, transparency: 60 },
      });

      items.forEach((item, i) => {
        const colX = areaX + colW * i;
        pptxSlide.addShape(pptx.ShapeType.ellipse, {
          x: colX + colW / 2 - 0.08, y: lineY - 0.08, w: 0.16, h: 0.16,
          fill: { color: EXEC_ACCENT }, line: { type: 'none' },
        });
        pptxSlide.addText(item.date, {
          x: colX + 0.05, y: lineY + 0.25, w: colW - 0.1, h: 0.4,
          fontFace: FONT, fontSize: 12, bold: true, color: EXEC_ACCENT_DK,
          align: 'center',
        });
        pptxSlide.addText(item.event, {
          x: colX + 0.05, y: lineY + 0.7, w: colW - 0.1, h: 1.5,
          fontFace: FONT, fontSize: 11, color: EXEC_TEXT,
          align: 'center', valign: 'top', rtlMode: isHe,
        });
      });
      break;
    }

    case 'barChart': {
      addHeading(pptxSlide, slide.title, isHe);
      const chartData = slide.chartData ?? [];
      pptxSlide.addChart(pptx.ChartType.bar, [{
        name:   slide.title,
        labels: chartData.map(c => c.label),
        values: chartData.map(c => c.percentage),
      }], {
        x: 0.8, y: 1.5, w: SLIDE_W - 1.6, h: SLIDE_H - 2.2,
        barDir: 'col',
        chartColors: [EXEC_ACCENT],
        showLegend: false,
        showValue: true,
        dataLabelColor: EXEC_TEXT,
        dataLabelFontSize: 11,
        catAxisLabelColor: EXEC_CREAM,
        catAxisLabelFontSize: 11,
        catAxisLineShow: false,
        valAxisHidden: true,
        valGridLine: { style: 'none' },
        plotArea: { fill: { type: 'none' }, border: { type: 'none' } },
      });
      break;
    }

    case 'tileGrid': {
      addHeading(pptxSlide, slide.title, isHe);
      const tiles = slide.tiles ?? [];
      const cols  = 3;
      const rows  = Math.max(Math.ceil(tiles.length / cols), 1);
      const gap   = 0.25;
      const areaX = 0.8, areaY = 1.5, areaW = SLIDE_W - 1.6, areaH = SLIDE_H - 2.2;
      const tileW = (areaW - gap * (cols - 1)) / cols;
      const tileH = (areaH - gap * (rows - 1)) / rows;

      tiles.forEach((tile, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = areaX + col * (tileW + gap);
        const y = areaY + row * (tileH + gap);
        pptxSlide.addShape(pptx.ShapeType.roundRect, {
          x, y, w: tileW, h: tileH, rectRadius: 0.06,
          fill: { color: EXEC_ACCENT, transparency: 90 },
          line: { color: EXEC_ACCENT, width: 1, transparency: 65 },
        });
        pptxSlide.addText([
          { text: tile.title, options: { bold: true, breakLine: true, fontSize: 13, color: EXEC_TEXT } },
          { text: tile.text,  options: { fontSize: 10, color: EXEC_CREAM } },
        ], {
          x: x + 0.15, y: y + 0.12, w: tileW - 0.3, h: tileH - 0.24,
          fontFace: FONT, valign: 'top', align: isHe ? 'right' : 'left', rtlMode: isHe,
        });
      });
      break;
    }

    case 'architecture': {
      const layers      = slide.layers ?? [];
      const archNodes   = slide.nodes ?? [];
      const connections = slide.connections ?? [];
      if (layers.length === 0 || archNodes.length === 0) {
        buildSlideContent(pptx, pptxSlide, { ...slide, layout: 'title' }, isHe);
        break;
      }

      addHeading(pptxSlide, slide.title, isHe);
      const areaX = 0.8, areaY = 1.5, areaW = SLIDE_W - 1.6, areaH = SLIDE_H - 2.2;
      const labelW = 1.6;
      const diagX  = areaX + labelW + 0.2;
      const diagW  = areaW - labelW - 0.2;
      const rowH   = areaH / layers.length;

      const rows = layers.map((_, idx) => archNodes.filter(n => n.layer === idx));
      const positions = new Map<string, { x: number; y: number }>();

      layers.forEach((name, i) => {
        pptxSlide.addText(name, {
          x: areaX, y: areaY + i * rowH, w: labelW, h: rowH,
          fontFace: FONT, fontSize: 11, bold: true,
          color: LAYER_COLORS[i % LAYER_COLORS.length],
          align: 'center', valign: 'middle',
        });
      });

      rows.forEach((rowNodes, layerIdx) => {
        const y     = areaY + (layerIdx + 0.5) * rowH;
        const color = LAYER_COLORS[layerIdx % LAYER_COLORS.length];
        rowNodes.forEach((node, i) => {
          const cx   = diagX + ((i + 0.5) / rowNodes.length) * diagW;
          const boxW = Math.min(1.8, diagW / rowNodes.length - 0.2);
          positions.set(node.id, { x: cx, y });
          pptxSlide.addShape(pptx.ShapeType.roundRect, {
            x: cx - boxW / 2, y: y - 0.3, w: boxW, h: 0.6, rectRadius: 0.08,
            fill: { color, transparency: 80 },
            line: { color, width: 1 },
          });
          pptxSlide.addText(node.label, {
            x: cx - boxW / 2, y: y - 0.3, w: boxW, h: 0.6,
            fontFace: FONT, fontSize: 10, bold: true, color: EXEC_TEXT,
            align: 'center', valign: 'middle', rtlMode: isHe,
          });
        });
      });

      connections.forEach(c => {
        const from = positions.get(c.from);
        const to   = positions.get(c.to);
        if (from && to) addConnectorLine(pptx, pptxSlide, from.x, from.y, to.x, to.y);
      });
      break;
    }

    case 'quote_focus': {
      const quote = toText(slide.content);
      pptxSlide.addText(slide.title, {
        x: 0.8, y: 0.5, w: SLIDE_W - 1.6, h: 0.5,
        fontFace: FONT, fontSize: 14, bold: true, color: EXEC_CREAM,
        align: 'center', valign: 'middle', rtlMode: isHe,
      });
      pptxSlide.addText(quote, {
        x: 1.2, y: 1.6, w: SLIDE_W - 2.4, h: 3.2,
        fontFace: FONT, fontSize: 30, bold: true, color: EXEC_TEXT,
        align: 'center', valign: 'middle', rtlMode: isHe,
      });
      if (slide.attribution) {
        pptxSlide.addText(`— ${slide.attribution}`, {
          x: 1.2, y: 5, w: SLIDE_W - 2.4, h: 0.6,
          fontFace: FONT, fontSize: 16, bold: true, color: EXEC_ACCENT_DK,
          align: 'center', valign: 'middle', rtlMode: isHe,
        });
      }
      break;
    }

    case 'formula_heavy': {
      addHeading(pptxSlide, slide.title, isHe);
      pptxSlide.addShape(pptx.ShapeType.roundRect, {
        x: 1.2, y: 1.5, w: SLIDE_W - 2.4, h: 1.8, rectRadius: 0.06,
        fill: { color: EXEC_ACCENT, transparency: 92 },
        line: { color: EXEC_ACCENT, width: 1, transparency: 65 },
      });
      /* pptxgenjs has no KaTeX renderer — render the raw LaTeX source as text
         in a math-leaning font (consistent precedent: slide.imagePrompt's
         AI-generated image is also not embedded in PPTX export and falls
         back to a simpler representation). */
      pptxSlide.addText(slide.latexFormula ?? '', {
        x: 1.4, y: 1.5, w: SLIDE_W - 2.8, h: 1.8,
        fontFace: 'Cambria Math', fontSize: 22, bold: true, color: EXEC_TEXT,
        align: 'center', valign: 'middle',
      });
      const formulaBullets = toBullets(slide.content);
      if (formulaBullets.length > 0) {
        buildBulletsBlock(pptx, pptxSlide, formulaBullets, isHe, 0.8, 3.5, SLIDE_W - 1.6, SLIDE_H - 4.0);
      }
      break;
    }

    case 'two_column': {
      addHeading(pptxSlide, slide.title, isHe);
      buildBulletsBlock(pptx, pptxSlide, toBullets(slide.content), isHe, 0.8, 1.5, SLIDE_W / 2 - 1, SLIDE_H - 2.2);

      const panelX = SLIDE_W / 2 + 0.2, panelY = 1.0, panelW = SLIDE_W / 2 - 0.8, panelH = SLIDE_H - 1.6;
      pptxSlide.addShape(pptx.ShapeType.roundRect, {
        x: panelX, y: panelY, w: panelW, h: panelH,
        rectRadius: 0.06,
        fill: { color: EXEC_ACCENT, transparency: 88 },
        line: { color: EXEC_ACCENT, width: 1, transparency: 65 },
      });
      const takeaway = slide.keyTakeaway;
      if (takeaway) {
        pptxSlide.addText([
          { text: takeaway.title, options: { bold: true, breakLine: true, fontSize: 20, color: EXEC_ACCENT_DK, paraSpaceAfter: 12 } },
          { text: takeaway.text,  options: { fontSize: 13, color: EXEC_TEXT } },
        ], {
          x: panelX + 0.3, y: panelY + 0.3, w: panelW - 0.6, h: panelH - 0.6,
          fontFace: FONT, align: 'center', valign: 'middle', rtlMode: isHe,
        });
      }
      break;
    }

    case 'title':
    default: {
      const subtitle = toText(slide.content);
      pptxSlide.addText(slide.title, {
        x: 0.8, y: 2.3, w: SLIDE_W - 1.6, h: 1.6,
        fontFace: FONT, fontSize: 40, bold: true, color: EXEC_TEXT,
        align: 'center', valign: 'middle', rtlMode: isHe,
      });
      pptxSlide.addShape(pptx.ShapeType.rect, {
        x: SLIDE_W / 2 - 0.4, y: 4.05, w: 0.8, h: 0.035,
        fill: { color: EXEC_ACCENT }, line: { type: 'none' },
      });
      if (subtitle) {
        pptxSlide.addText(subtitle, {
          x: 0.8, y: 4.25, w: SLIDE_W - 1.6, h: 0.7,
          fontFace: FONT, fontSize: 16, color: EXEC_CREAM,
          align: 'center', valign: 'top', rtlMode: isHe,
        });
      }
      break;
    }
  }
}

export async function exportToPPTX(slides: DeckSlide[], lang: 'he' | 'en', fileName = 'presentation'): Promise<void> {
  const isHe = lang === 'he';
  const { default: PptxGenJSCtor } = await import('pptxgenjs');
  const pptx = new PptxGenJSCtor();
  pptx.layout  = 'LAYOUT_WIDE';
  pptx.rtlMode = isHe;

  for (const slide of slides) {
    const pptxSlide = pptx.addSlide();
    pptxSlide.background = { color: EXEC_BG };
    buildSlideContent(pptx, pptxSlide, slide, isHe);
  }

  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}
