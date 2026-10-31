import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { TopNav } from "@/components/shell/TopNav";
import { ThemeInit } from "@/components/shell/ThemeInit";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "MrMoney", template: "%s · MrMoney" },
  description: "A calm day-by-day money plan that lasts the whole term.",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#f7f8fb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeInit />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-grad-primary focus:px-4 focus:py-2"
        >
          Skip to content
        </a>
        <TopNav />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
