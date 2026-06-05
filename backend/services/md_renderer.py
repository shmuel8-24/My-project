"""
Markdown → HTML renderer for the U-Note backend.

Uses:
  • Python-Markdown with three extensions:
      – mdx_math          : $…$ / $$…$$ → <script type="math/tex"> tags for KaTeX
      – fenced_code       : ``` fenced code blocks
      – CodeHiliteExtension : Pygments token-level syntax highlighting (monokai inline CSS)
"""

import markdown
from markdown.extensions.codehilite import CodeHiliteExtension
from markdown.extensions.fenced_code import FencedCodeExtension


def render_markdown_html(text: str, pygments_style: str = 'monokai') -> str:
    """
    Convert a Markdown string to an HTML fragment.

    • Code blocks are syntax-highlighted with Pygments (inline CSS via
      noclasses=True — no external stylesheet required).
    • Math expressions ($…$ and $$…$$) are converted to
      <script type="math/tex"> / <script type="math/tex; mode=display">
      tags via mdx_math, which KaTeX's mathtex-script-type extension
      renders on the client side.

    Args:
        text:           Markdown source text.
        pygments_style: A Pygments style name (default: 'monokai').

    Returns:
        An HTML fragment string (no <html>/<head>/<body> wrapper).
    """
    md = markdown.Markdown(
        extensions=[
            'mdx_math',
            FencedCodeExtension(),
            CodeHiliteExtension(
                noclasses=True,          # embed inline CSS — no Pygments stylesheet needed
                guess_lang=True,
                pygments_style=pygments_style,
                css_class='highlight',
                linenums=False,
            ),
            'markdown.extensions.tables',
            'markdown.extensions.sane_lists',
            'markdown.extensions.nl2br',
        ],
        extension_configs={
            'mdx_math': {'enable_dollar_delimiter': True},
        },
    )
    return md.convert(text)
