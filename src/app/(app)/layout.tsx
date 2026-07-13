import { BottomNav } from "@/components/nav/bottom-nav";
import { PageTransition } from "@/components/motion/page-transition";
import { ToastProvider } from "@/components/ui/toast";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="mx-auto min-h-dvh w-full max-w-[var(--width-app)]">
        <main id="main" className="px-[18px] pb-[100px] pt-2">
          <PageTransition>{children}</PageTransition>
        </main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
