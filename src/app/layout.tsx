import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AnonymousUserProvider } from "@/components/AnonymousUserProvider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BandBoard - Live Setlist Sync",
  description: "Minimal-friction band rehearsals, song lists, and automated notation aggregation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AnonymousUserProvider>
          {children}
          <Toaster />
        </AnonymousUserProvider>
      </body>
    </html>
  );
}

