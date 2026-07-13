import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo />
        <h1 className="mt-5 text-[28px] font-extrabold tracking-[-0.02em] text-ink">Cookdex</h1>
        <p className="mt-1 text-sm font-semibold text-ink-2">Save it. Cook it.</p>
      </div>
      {children}
    </main>
  );
}
