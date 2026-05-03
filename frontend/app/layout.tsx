import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-heebo",
});

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
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`}>
      <body className="font-sans antialiased min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
