import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppHeader } from "@/components/blocks/app-shell";
import { ModeToggle } from "@/components/mode-toggle";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Voice chat",
  description: "Talk to a Cartesia Managed Agent in the browser and interrupt it mid-sentence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} font-sans`} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AppHeader name="Voice chat" width="narrow">
            <ModeToggle />
          </AppHeader>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
