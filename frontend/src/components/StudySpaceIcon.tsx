/*
 * StudySpaceIcon — isometric "Study Space" illustration
 * Brand palette: soft matcha greens (#517B3E / #8BAF84), warm neutrals, clean whites.
 * ViewBox 400×400, fully scalable. Safe to inline; gradient IDs prefixed "ssi-".
 */

type Props = {
  size?: number;
  className?: string;
};

export function StudySpaceIcon({ size = 400, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 400 400"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Study Space"
    >
      <defs>
        {/* ── Radial background glow ── */}
        <radialGradient id="ssi-bg" cx="50%" cy="62%" r="54%">
          <stop offset="0%"   stopColor="#A0CC90" stopOpacity="0.58" />
          <stop offset="55%"  stopColor="#C4E4B4" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#EEF6EA" stopOpacity="0"    />
        </radialGradient>

        {/* ── Desk-foot shadow ── */}
        <radialGradient id="ssi-gnd" cx="50%" cy="30%" r="50%">
          <stop offset="0%"   stopColor="#1E4812" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1E4812" stopOpacity="0"    />
        </radialGradient>

        {/* ── Tablet screen gradient ── */}
        <linearGradient id="ssi-scr" x1="5%" y1="5%" x2="95%" y2="95%">
          <stop offset="0%"   stopColor="#CCE8BC" />
          <stop offset="100%" stopColor="#A4D08E" />
        </linearGradient>

        {/* ── Screen corner highlight ── */}
        <linearGradient id="ssi-hi" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.32)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)"    />
        </linearGradient>

        {/* ── Drop shadow: desk body ── */}
        <filter id="ssi-ds" x="-12%" y="-8%" width="124%" height="148%">
          <feDropShadow
            dx="0" dy="12" stdDeviation="10"
            floodColor="#1A4010" floodOpacity="0.14"
          />
        </filter>

        {/* ── Drop shadow: objects on desk ── */}
        <filter id="ssi-os" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow
            dx="1" dy="5" stdDeviation="4"
            floodColor="#1A4010" floodOpacity="0.18"
          />
        </filter>
      </defs>

      {/* ═══════════════════════════════════════
          BACKGROUND
      ═══════════════════════════════════════ */}
      <rect width="400" height="400" rx="44" fill="#EBF5E6" />
      <ellipse cx="200" cy="230" rx="190" ry="164" fill="url(#ssi-bg)" />

      {/* ═══════════════════════════════════════
          DESK GROUND SHADOW
          (soft ellipse beneath the desk)
      ═══════════════════════════════════════ */}
      <ellipse cx="200" cy="320" rx="128" ry="13" fill="url(#ssi-gnd)" />

      {/* ═══════════════════════════════════════
          DESK BODY
          Iso basis: right vec = (108,−62), depth vec = (−108,−62)
          Front F(200,286) · Right R(308,224) · Back B(200,162) · Left L(92,224)
          Desk height 30 px straight down
      ═══════════════════════════════════════ */}

      {/* Left face  F→F_bot→L_bot→L */}
      <polygon
        points="200,286 200,316 92,254 92,224"
        fill="#BFCFB4"
        filter="url(#ssi-ds)"
      />
      {/* Right face  F→R→R_bot→F_bot */}
      <polygon
        points="200,286 308,224 308,254 200,316"
        fill="#AABF9C"
        filter="url(#ssi-ds)"
      />
      {/* Top surface  F→R→B→L */}
      <polygon
        points="200,286 308,224 200,162 92,224"
        fill="#DEECD6"
        filter="url(#ssi-ds)"
      />

      {/* Subtle inner reflection on desk top */}
      <ellipse cx="200" cy="222" rx="74" ry="37" fill="white" fillOpacity="0.13" />

      {/* Top-edge highlight  L→B→R */}
      <polyline
        points="92,224 200,162 308,224"
        fill="none"
        stroke="rgba(255,255,255,0.88)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Bottom-edge subtle accent */}
      <polyline
        points="92,254 200,316 308,254"
        fill="none"
        stroke="rgba(80,130,55,0.25)"
        strokeWidth="1"
      />

      {/* ═══════════════════════════════════════
          SUCCULENT PLANT
          Drawn first so notebook/tablet sit in front of it.
          Base at P(0.78,0.62) ≈ (219,200)
      ═══════════════════════════════════════ */}

      {/* Shadow dot on desk surface */}
      <ellipse cx="220" cy="206" rx="11" ry="4.5" fill="#1A4010" fillOpacity="0.09" />

      {/* Pot body (trapezoid) */}
      <path
        d="M 214,208 C 213,215 229,215 228,208 L 226,198 C 226,193 212,193 212,198 Z"
        fill="#88AB80"
      />
      {/* Pot rim */}
      <ellipse cx="219" cy="198" rx="8.5" ry="4.2" fill="#9BBF92" stroke="#72985E" strokeWidth="0.9" />
      {/* Soil */}
      <ellipse cx="219" cy="198" rx="6.5" ry="3" fill="#3A2712" />

      {/* Lower outer leaves */}
      <path d="M 219,193 C 210,188 207,181 211,178 C 215,175 218,184 219,189 Z" fill="#4A7430" />
      <path d="M 219,193 C 228,188 231,181 227,178 C 223,175 220,184 219,189 Z" fill="#558040" />
      <path d="M 219,193 C 208,191 205,183 209,180 C 212,177 217,185 218,190 Z" fill="#5E8C48" />
      <path d="M 219,193 C 230,191 233,183 229,180 C 226,177 221,185 220,190 Z" fill="#5E8C48" />

      {/* Middle leaves */}
      <path d="M 219,190 C 212,184 211,177 216,175 C 219,173 219,182 219,186 Z" fill="#3D6428" />
      <path d="M 219,190 C 226,184 227,177 222,175 C 219,173 219,182 219,186 Z" fill="#487030" />

      {/* Rosette center */}
      <ellipse cx="219" cy="182" rx="6" ry="5.2" fill="#62943A" />
      <circle  cx="219" cy="181" r="3.4" fill="#78A850" />
      <circle  cx="219" cy="180" r="1.7" fill="#90BC68" />

      {/* ═══════════════════════════════════════
          TABLET / DEVICE
          u∈[0.05,0.44], v∈[0.08,0.58] · height 5 px
          Screen top: (197,273)(239,249)(185,218)(143,242)
      ═══════════════════════════════════════ */}

      {/* Left face   L_top→L_bot→F_bot→F_top */}
      <polygon points="143,242 143,247 197,278 197,273" fill="#0B1A10" />
      {/* Right face  R_top→R_bot→B_bot→B_top */}
      <polygon points="239,249 239,254 185,223 185,218" fill="#1C3020" />
      {/* Front face  F_top→R_top→R_bot→F_bot */}
      <polygon points="197,273 239,249 239,254 197,278" fill="#152815" />

      {/* Screen (top face) */}
      <polygon
        points="197,273 239,249 185,218 143,242"
        fill="url(#ssi-scr)"
        filter="url(#ssi-os)"
      />

      {/* Screen corner highlight */}
      <polygon
        points="151,244 172,234 167,226 147,237"
        fill="url(#ssi-hi)"
        fillOpacity="0.55"
      />

      {/* ── Bar chart on screen ──
          Bars: parallelograms standing on screen baseline.
          Each bar: (x, y_base)(x+4, y_base−2)(x+4, y_top−2)(x, y_top)
          Bar bases confirmed inside screen quad at those x positions.     */}
      {/* Bar 1 — tall, dark sage */}
      <polygon points="156,248 160,246 160,234 156,236" fill="#2A5A1C" />
      {/* Bar 2 — medium, mid sage */}
      <polygon points="162,251 166,249 166,241 162,243" fill="#468030" />
      {/* Bar 3 — short, light sage */}
      <polygon points="168,254 172,252 172,247 168,249" fill="#68A048" />

      {/* Chart baseline */}
      <line
        x1="154" y1="249" x2="175" y2="254"
        stroke="#1C3329" strokeWidth="0.8" strokeOpacity="0.45"
      />

      {/* Trend line connecting bar tops */}
      <polyline
        points="158,236 164,243 170,249"
        fill="none"
        stroke="#1C3329"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.60"
      />
      {/* Trend dots */}
      <circle cx="158" cy="236" r="1.9" fill="#1C3329" fillOpacity="0.65" />
      <circle cx="164" cy="243" r="1.9" fill="#1C3329" fillOpacity="0.65" />
      <circle cx="170" cy="249" r="1.9" fill="#1C3329" fillOpacity="0.65" />

      {/* Bezel gleam */}
      <line
        x1="143" y1="242" x2="197" y2="273"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1"
      />

      {/* ═══════════════════════════════════════
          NOTEBOOK
          u∈[0.50,0.88], v∈[0.08,0.42] · height 8 px
          Cover top: (245,242)(286,218)(250,197)(209,221)
      ═══════════════════════════════════════ */}

      {/* Right face  NB_R_top→NB_R_bot→NB_B_bot→NB_B_top */}
      <polygon
        points="286,218 286,226 250,205 250,197"
        fill="#BA9A5A"
        filter="url(#ssi-os)"
      />
      {/* Front face  NB_F_top→NB_R_top→NB_R_bot→NB_F_bot */}
      <polygon points="245,242 286,218 286,226 245,250" fill="#C8A866" />

      {/* Cover (amber/warm leather) */}
      <polygon
        points="245,242 286,218 250,197 209,221"
        fill="#D6B46C"
        filter="url(#ssi-os)"
      />

      {/* Open pages (cream) */}
      <polygon
        points="246,241 285,217 250,196 210,220"
        fill="#FEFAF0"
        stroke="#E8D89A"
        strokeWidth="0.7"
      />

      {/* Spine / left-edge hint on cover */}
      <line
        x1="209" y1="221" x2="245" y2="242"
        stroke="#B89448"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeOpacity="0.55"
      />

      {/* Ruled lines on open page
          Direction: iso-right vec (108,−62) scaled to 0.30 units → ~(32,−19)
          Lines at v = 0.22, 0.27, 0.32 within notebook v-range [0.08,0.42]
          P(0.52,0.22)=(232,240) → P(0.82,0.22)=(265,222)
          P(0.52,0.27)=(227,237) → P(0.82,0.27)=(259,218)
          P(0.52,0.32)=(222,234) → P(0.82,0.32)=(254,215)           */}
      <line x1="232" y1="240" x2="265" y2="222" stroke="#D4BC70" strokeWidth="0.9" strokeOpacity="0.62" />
      <line x1="227" y1="237" x2="259" y2="218" stroke="#D4BC70" strokeWidth="0.9" strokeOpacity="0.52" />
      <line x1="222" y1="234" x2="254" y2="215" stroke="#D4BC70" strokeWidth="0.9" strokeOpacity="0.42" />

      {/* Page-corner fold (small triangle at bottom-right of open page) */}
      <polygon
        points="278,212 283,213 278,218"
        fill="#E4C870"
        fillOpacity="0.65"
      />

      {/* ═══════════════════════════════════════
          DECORATIVE SPARKLES
      ═══════════════════════════════════════ */}

      {/* Top-right cluster */}
      <circle cx="338" cy="122" r="3.2" fill="#8BAF84" fillOpacity="0.50" />
      <circle cx="352" cy="140" r="1.9" fill="#6B9F55" fillOpacity="0.38" />
      <circle cx="328" cy="140" r="1.5" fill="#A8C896" fillOpacity="0.44" />

      {/* Top-left cluster */}
      <circle cx="63"  cy="156" r="2.8" fill="#8BAF84" fillOpacity="0.44" />
      <circle cx="76"  cy="173" r="1.7" fill="#6B9F55" fillOpacity="0.34" />
      <circle cx="55"  cy="172" r="1.4" fill="#A8C896" fillOpacity="0.38" />

      {/* Top-centre hint */}
      <circle cx="200" cy="110" r="2.2" fill="#517B3E" fillOpacity="0.28" />
      <circle cx="187" cy="126" r="1.4" fill="#8BAF84" fillOpacity="0.24" />
      <circle cx="213" cy="124" r="1.2" fill="#8BAF84" fillOpacity="0.24" />

      {/* 4-point star — top right */}
      <path
        d="M 360,107 L 360,101 M 357,104 L 363,104"
        stroke="#8BAF84"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeOpacity="0.54"
      />
      {/* 4-point star — top left */}
      <path
        d="M 42,143 L 42,137 M 39,140 L 45,140"
        stroke="#8BAF84"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeOpacity="0.48"
      />

      {/* Bottom corner whiskers */}
      <circle cx="114" cy="342" r="1.8" fill="#8BAF84" fillOpacity="0.22" />
      <circle cx="286" cy="342" r="1.8" fill="#8BAF84" fillOpacity="0.22" />
    </svg>
  );
}
