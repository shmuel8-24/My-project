// KaTeX ships its own type declarations for the main module ("katex"), but not
// for the deep `dist/contrib/*` build artifacts that academic-writing/page.tsx
// dynamically imports for math rendering — TypeScript otherwise reports
// "Could not find a declaration file for module ...".

declare module 'katex/dist/contrib/mathtex-script-type.mjs' {
  const render: (el: HTMLElement) => void;
  export default render;
}

declare module 'katex/contrib/auto-render' {
  interface AutoRenderOptions {
    delimiters?: Array<{ left: string; right: string; display: boolean }>;
    throwOnError?: boolean;
  }
  const renderMathInElement: (el: HTMLElement, options?: AutoRenderOptions) => void;
  export default renderMathInElement;
}
