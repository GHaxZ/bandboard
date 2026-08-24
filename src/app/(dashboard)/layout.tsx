import Link from "next/link";
import { AudioLines } from "lucide-react";
import { NavTabs, MobileTabBar } from "@/components/NavLinks";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/rehearsals" className="flex items-center gap-2.5 hover:opacity-90">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent-text text-primary-foreground flex items-center justify-center shadow-md shadow-primary/20">
            <AudioLines className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-heading font-bold tracking-tight text-foreground leading-none">
            BandBoard
          </h1>
        </Link>

        <NavTabs />
      </header>

      <main className="flex-1 w-full max-w-none px-4 md:px-8 py-6 pb-16 md:pb-6 space-y-6">
        {children}
      </main>

      <MobileTabBar />
    </div>
  );
}
