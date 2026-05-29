import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { LanguageProvider }        from "./providers/language";
import { AuthProvider }            from "./providers/auth";
import { CourseProvider }          from "./providers/course";
import { CommandPaletteProvider }  from "./providers/command-palette";
import CommandPalette              from "../components/CommandPalette";
import FloatingZenTimer            from "../components/FloatingZenTimer";
import CharleyLottieMascot         from "../components/CharleyLottieMascot";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-heebo",
});

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  viewportFit:  'cover',
};

export const metadata: Metadata = {
  title: "U-Note – שותף המחקר החכם שלך",
  description: "פלטפורמת AI אקדמית – ניתוח מסמכים, שאלות-תשובות וכתיבה מדעית",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-full flex flex-col">
        {/* ── Ambient mesh background orbs ──────────────────────────── */}
        <div
          className="fixed inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
          style={{ zIndex: 0 }}
        >
          {/* Top-left sage orb — slow pulse */}
          <div
            className="absolute rounded-full mix-blend-multiply animate-pulse"
            style={{
              top: '-10%', left: '-10%',
              width: '40vw', height: '40vw',
              background: 'rgba(209,230,217,0.28)',
              filter: 'blur(120px)',
              animationDuration: '10000ms',
              willChange: 'opacity',
            }}
          />
          {/* Bottom-right lime orb — static */}
          <div
            className="absolute rounded-full mix-blend-multiply"
            style={{
              bottom: '-10%', right: '-10%',
              width: '30vw', height: '30vw',
              background: 'rgba(134,239,172,0.18)',
              filter: 'blur(100px)',
              willChange: 'transform',
            }}
          />
        </div>

        <LanguageProvider>
          <CourseProvider>
            <AuthProvider>
              <CommandPaletteProvider>
                {children}
                <CommandPalette />
                <FloatingZenTimer />
                <CharleyLottieMascot />
              </CommandPaletteProvider>
            </AuthProvider>
          </CourseProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
