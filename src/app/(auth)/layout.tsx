export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">Romy&apos;s Kitchen</h1>
        <p className="mt-1 text-sm text-ink-2">Every recipe you love, in one place.</p>
      </div>
      {children}
    </main>
  );
}
