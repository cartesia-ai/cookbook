import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppMain } from "@/components/blocks/app-shell";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Meeting notes",
  description: "Record or upload a meeting. Get a transcript, a summary, decisions and action items.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} font-sans`} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <SiteHeader />
          <AppMain>{children}</AppMain>
        </ThemeProvider>
      </body>
    </html>
  );
}
