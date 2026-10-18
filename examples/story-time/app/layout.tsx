import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppMain } from "@/components/blocks/app-shell";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Story time",
  description: "Interactive stories read by a cast of Cartesia Sonic voices. You choose what happens next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} font-sans`} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SiteHeader />
          <AppMain width="narrow">{children}</AppMain>
        </ThemeProvider>
      </body>
    </html>
  );
}
