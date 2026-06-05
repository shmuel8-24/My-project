'use client';

import { useState } from 'react';
import React from 'react';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/* ── CodeBlockPre ─────────────────────────────────────────────────────────
 * Drop this in as the `pre:` component inside ReactMarkdown's `components`
 * prop. It extracts the language + code text from its code-element child and
 * renders a dark-matcha block with a copy-to-clipboard button.
 * ─────────────────────────────────────────────────────────────────────────── */
export function CodeBlockPre({ children }: { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  // react-markdown always wraps block code in <pre><code …>…</code></pre>.
  // Grab that single <code> child to extract language and raw text.
  const all    = React.Children.toArray(children ?? []);
  const codeEl = all.length > 0 && React.isValidElement(all[0])
    ? (all[0] as React.ReactElement<{ className?: string; children?: React.ReactNode }>)
    : null;

  const lang     = (codeEl?.props.className ?? '').replace('language-', '') || 'code';
  const codeText = extractText(codeEl?.props.children ?? '').replace(/\n$/, '');

  function copy() {
    navigator.clipboard.writeText(codeText)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }

  return (
    <div
      dir="ltr"
      className="my-3 rounded-xl overflow-hidden text-sm"
      style={{
        background: '#1C3329',
        border:     '1px solid rgba(81,123,62,0.22)',
        boxShadow:  '0 4px 18px rgba(28,51,41,0.14)',
        direction:  'ltr',
        unicodeBidi: 'isolate',
      }}
    >
      {/* Header: language label + copy button */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.18)' }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-widest select-none"
          style={{ color: 'rgba(157,192,139,0.65)' }}
        >
          {lang}
        </span>

        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200 cursor-pointer active:scale-95"
          style={{
            background: copied ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)',
            color:      copied ? '#4ADE80'                : 'rgba(209,230,217,0.60)',
            border:     `1px solid ${copied ? 'rgba(74,222,128,0.28)' : 'rgba(255,255,255,0.07)'}`,
          }}
        >
          {copied ? (
            <>
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <pre
        dir="ltr"
        className="px-4 py-4 overflow-x-auto font-mono leading-relaxed"
        style={{
          margin:      0,
          color:       '#E8F0EB',
          direction:   'ltr',
          textAlign:   'left',
          unicodeBidi: 'embed',
          fontSize:    '0.72rem',
        }}
      >
        {children}
      </pre>
    </div>
  );
}

/* ── InlineCode ───────────────────────────────────────────────────────────
 * Subtle green-tinted inline code for ReactMarkdown's `code:` component
 * when there is no language className (i.e., it's inline, not a block).
 * ─────────────────────────────────────────────────────────────────────────── */
export function InlineCode({ children }: { children?: React.ReactNode }) {
  return (
    <code
      dir="ltr"
      className="px-1.5 py-0.5 rounded text-[11px] font-mono inline-block"
      style={{
        background:  'rgba(209,230,217,0.40)',
        color:       '#2A3B22',
        direction:   'ltr',
        textAlign:   'left',
        unicodeBidi: 'embed',
      }}
    >
      {children}
    </code>
  );
}
