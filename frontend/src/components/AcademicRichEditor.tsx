'use client';

/**
 * AcademicRichEditor
 *
 * A Markdown-based rich text editor backed by @uiw/react-md-editor.
 * Adds three custom toolbar commands: Insert Image, Insert Equation, Insert Code Block.
 * Renders math (KaTeX) and code (Prism) in the live preview pane.
 *
 * IMPORTANT: this file must always be imported with `dynamic({ ssr: false })`
 * because @uiw/react-md-editor accesses `window` at module evaluation time.
 */

import React, { useRef, useCallback } from 'react';
import MDEditor, { commands, type ICommand } from '@uiw/react-md-editor';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

/* ── Custom toolbar commands ─────────────────────────────────────────────── */

function SvgImage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      style={{ width: 14, height: 14 }}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5
           1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0
           0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5
           1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0
           1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  );
}

function SvgCode() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
      style={{ width: 14, height: 14 }}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
  );
}

/* ── Props ───────────────────────────────────────────────────────────────── */
export interface AcademicRichEditorProps {
  value: string;
  onChange: (value: string) => void;
  he?: boolean;
  placeholder?: string;
  minHeight?: number;
}

/* ── Component ───────────────────────────────────────────────────────────── */
export default function AcademicRichEditor({
  value,
  onChange,
  he = false,
  placeholder,
  minHeight = 220,
}: AcademicRichEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // We stash the API object from the "insert image" execute call so the async
  // file-reader callback can call replaceSelection after the dialog closes.
  const pendingApiRef = useRef<Parameters<NonNullable<ICommand['execute']>>[1] | null>(null);

  /* ── Insert Image ── */
  const insertImageCmd: ICommand = {
    name: 'insert-image',
    keyCommand: 'insert-image',
    buttonProps: { 'aria-label': he ? 'הוסף תמונה' : 'Insert Image', title: he ? 'הוסף תמונה' : 'Insert Image' },
    icon: <SvgImage />,
    execute(_state, api) {
      pendingApiRef.current = api;
      fileInputRef.current?.click();
    },
  };

  /* ── Insert Equation ── */
  const insertEquationCmd: ICommand = {
    name: 'insert-equation',
    keyCommand: 'insert-equation',
    buttonProps: { 'aria-label': he ? 'הוסף משוואה' : 'Insert Equation (LaTeX)', title: he ? 'הוסף משוואה (LaTeX)' : 'Insert Equation (LaTeX)' },
    icon: <span style={{ fontFamily: 'serif', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>∑</span>,
    execute(state, api) {
      const sel = state.selectedText.trim();
      if (sel) {
        api.replaceSelection(`$$${sel}$$`);
      } else {
        const template = '$$\n\\frac{d}{dx}f(x) = \\lim_{h \\to 0}\\frac{f(x+h)-f(x)}{h}\n$$';
        api.replaceSelection(template);
      }
    },
  };

  /* ── Insert Code Block ── */
  const insertCodeCmd: ICommand = {
    name: 'insert-code-block',
    keyCommand: 'insert-code-block',
    buttonProps: { 'aria-label': he ? 'הוסף בלוק קוד' : 'Insert Code Block', title: he ? 'הוסף בלוק קוד' : 'Insert Code Block' },
    icon: <SvgCode />,
    execute(state, api) {
      const sel = state.selectedText;
      api.replaceSelection(`\`\`\`python\n${sel || '# your code here'}\n\`\`\``);
    },
  };

  /* ── File reader for image ── */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const api = pendingApiRef.current;
      if (api) {
        api.replaceSelection(`![${file.name}](${dataUrl})`);
        pendingApiRef.current = null;
      } else {
        onChange(`${value}\n\n![${file.name}](${dataUrl})\n`);
      }
    };
    reader.readAsDataURL(file);
  }, [value, onChange]);

  /* ── Toolbar command list ── */
  const toolbarCommands: ICommand[] = [
    commands.bold,
    commands.italic,
    commands.strikethrough,
    commands.divider,
    commands.title1,
    commands.title2,
    commands.title3,
    commands.divider,
    commands.unorderedListCommand,
    commands.orderedListCommand,
    commands.checkedListCommand,
    commands.divider,
    commands.quote,
    commands.hr,
    commands.divider,
    insertEquationCmd,
    insertCodeCmd,
    insertImageCmd,
  ];

  const extraCommands: ICommand[] = [
    commands.codePreview,
    commands.fullscreen,
  ];

  return (
    <div
      className="academic-rich-editor"
      data-color-mode="light"
      style={{
        /* Override MDEditor's GitHub-palette with our matcha tokens */
        '--color-canvas-default':    'rgba(255,255,255,0.72)',
        '--color-canvas-subtle':     'rgba(232,239,229,0.95)',
        '--color-border-default':    'rgba(157,192,139,0.42)',
        '--color-border-muted':      'rgba(157,192,139,0.28)',
        '--color-fg-default':        '#1A2E26',
        '--color-fg-muted':          '#527061',
        '--color-accent-fg':         '#517B3E',
        '--color-btn-bg':            'rgba(232,239,229,0.92)',
        '--color-btn-hover-bg':      'rgba(209,230,217,0.9)',
        '--color-btn-border':        'rgba(157,192,139,0.38)',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1.5px solid rgba(157,192,139,0.42)',
        boxShadow: '0 2px 12px rgba(81,123,62,0.06)',
      } as React.CSSProperties}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? '')}
        height={minHeight}
        preview="edit"
        data-color-mode="light"
        textareaProps={{
          placeholder: placeholder ?? (he ? 'הזן טקסט...' : 'Enter text...'),
          dir: he ? 'rtl' : 'ltr',
          style: { fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7 },
        }}
        commands={toolbarCommands}
        extraCommands={extraCommands}
        previewOptions={{
          remarkPlugins: [remarkMath],
          rehypePlugins: [[rehypeKatex, { throwOnError: false, strict: false }]],
          style: {
            fontFamily: 'inherit',
            color: '#1A2E26',
            background: 'transparent',
            direction: he ? 'rtl' : 'ltr',
          },
          components: {
            /* Force code blocks and math to always render LTR */
            pre: ({ children, ...props }) => (
              <pre
                dir="ltr"
                style={{
                  direction: 'ltr',
                  textAlign: 'left',
                  background: '#1C3329',
                  borderRadius: 10,
                  padding: '12px 16px',
                  overflowX: 'auto',
                  fontSize: 12,
                  color: '#9DC08B',
                }}
                {...props}
              >
                {children}
              </pre>
            ),
          },
        }}
      />

      {/* Scoped style overrides — keeps toolbar and editor area on-brand */}
      <style>{`
        .academic-rich-editor .w-md-editor-toolbar {
          background: rgba(232,239,229,0.95) !important;
          border-bottom: 1px solid rgba(157,192,139,0.32) !important;
          padding: 4px 8px !important;
        }
        .academic-rich-editor .w-md-editor-toolbar li > button {
          color: #1C3329 !important;
          border-radius: 6px !important;
        }
        .academic-rich-editor .w-md-editor-toolbar li > button:hover {
          background: rgba(81,123,62,0.12) !important;
          color: #183025 !important;
        }
        .academic-rich-editor .w-md-editor-text-input,
        .academic-rich-editor .w-md-editor-text-pre > code {
          font-family: inherit !important;
          font-size: 13px !important;
          line-height: 1.7 !important;
          color: #1A2E26 !important;
        }
        .academic-rich-editor .w-md-editor-area {
          background: rgba(255,255,255,0.58) !important;
        }
        .academic-rich-editor .w-md-editor {
          background: rgba(255,255,255,0.58) !important;
          color: #1A2E26 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
        /* Math blocks — always LTR */
        .academic-rich-editor .katex-display {
          direction: ltr !important;
          text-align: center !important;
        }
        .academic-rich-editor .katex {
          direction: ltr !important;
        }
      `}</style>
    </div>
  );
}
