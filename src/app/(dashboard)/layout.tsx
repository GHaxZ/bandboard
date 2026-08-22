import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/rehearsals" className="flex items-center gap-2 hover:opacity-90">
          <div className="w-8 h-8 rounded-xl bg-btn-bg border border-dialog-border flex items-center justify-center text-foreground font-black text-sm">
            BB
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-foreground leading-none">
              BandBoard
            </h1>
            <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5b80a5] animate-ping" /> Live
              Setlist Sync
            </span>
          </div>
        </Link>

        <NavLinks />
      </header>

      <main className="flex-1 w-full max-w-none px-4 md:px-8 py-6 pb-16 md:pb-6 space-y-6">
        {children}
      </main>
    </div>
  );
}
