import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { fetchUsageRows, fetchLifetimeCostMicroUsd, applyFilters, filterOptions, serverNowMs, type UsageFilters } from "@/lib/import/usage-queries";
import { computeUsage, formatMicroUsd } from "@/lib/import/usage";

export const dynamic = "force-dynamic";

const WINDOWS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "1y", days: 365 },
];

export default async function ImportUsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // AC4 — admin only. A non-admin gets a 404: the route behaves as if it does
  // not exist. The ledger tables also grant nothing to `authenticated`, so the
  // data is unreachable via the API regardless of this gate.
  const user = await currentUser();
  if (!isAdmin(user)) notFound();

  const sp = await searchParams;
  const sinceDays = Number(sp.days) || 365;
  const filters: UsageFilters = {
    sinceDays,
    sourceKind: sp.source || undefined,
    state: sp.state || undefined,
    failureReason: sp.failure || undefined,
    resolver: sp.resolver || undefined,
    provider: sp.provider || undefined,
    model: sp.model || undefined,
  };

  const [raw, lifetimeCost] = await Promise.all([fetchUsageRows(sinceDays), fetchLifetimeCostMicroUsd()]);
  const options = filterOptions(raw);
  const rows = applyFilters(raw, filters);
  const u = computeUsage(rows, serverNowMs(), lifetimeCost);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <main className="mx-auto max-w-[900px] px-4 py-8">
      <header className="mb-6">
        <h1 className="text-[22px] font-bold text-ink">Import usage</h1>
        <p className="text-[13px] text-ink-3">Cost and resolver performance across recipe imports.</p>
      </header>

      {/* Cost windows */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Today" value={formatMicroUsd(u.costToday)} />
        <Stat label="7 days" value={formatMicroUsd(u.cost7d)} />
        <Stat label="30 days" value={formatMicroUsd(u.cost30d)} />
        <Stat label="Lifetime" value={formatMicroUsd(u.costLifetime)} />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Imports" value={String(u.importCount)} />
        <Stat label="Successful" value={String(u.successCount)} />
        <Stat label="Avg / import" value={formatMicroUsd(u.avgCostPerImport)} />
        <Stat label="Per success" value={formatMicroUsd(u.costPerSuccess)} />
      </section>

      {/* Filters */}
      <form className="mb-6 flex flex-wrap items-end gap-2 rounded-card border border-line bg-surface p-3">
        <FilterWindow current={sinceDays} params={sp} />
        <Select name="source" label="Source" value={sp.source} options={options.sources} />
        <Select name="state" label="State" value={sp.state} options={options.states} />
        <Select name="failure" label="Failure" value={sp.failure} options={options.failures} />
        <Select name="resolver" label="Resolver" value={sp.resolver} options={options.resolvers} />
        <Select name="provider" label="Provider" value={sp.provider} options={options.providers} />
        <Select name="model" label="Model" value={sp.model} options={options.models} />
        <input type="hidden" name="days" value={String(sinceDays)} />
        <button type="submit" className="rounded-sm bg-basil px-3 py-1.5 text-[12px] font-semibold text-white">
          Apply
        </button>
      </form>

      {/* Cost by category */}
      <Panel title="Cost by category">
        <Row k="Direct retrieval" v={formatMicroUsd(u.categories.directRetrieval)} />
        <Row k="URL context" v={formatMicroUsd(u.categories.urlContext)} />
        <Row k="Apify" v={formatMicroUsd(u.categories.apify)} />
        <Row k="Recipe extraction" v={formatMicroUsd(u.categories.recipeExtraction)} />
        <Row k="Corrections" v={formatMicroUsd(u.categories.correction)} />
        <Row k="Retries" v={formatMicroUsd(u.categories.retry)} />
        <Row k="No-AI imports" v={String(u.noAiImports)} />
      </Panel>

      {/* Instagram panel */}
      <Panel title="Instagram">
        <Row k="Attempted" v={String(u.instagram.attempted)} />
        <Row k="Direct succeeded" v={String(u.instagram.directSucceeded)} />
        <Row k="Direct partial" v={String(u.instagram.directPartial)} />
        <Row k="URL context attempted" v={String(u.instagram.urlContextAttempted)} />
        <Row k="URL context succeeded" v={String(u.instagram.urlContextSucceeded)} />
        <Row k="Apify calls made" v={String(u.instagram.apifyCalls)} />
        <Row k="Apify calls avoided" v={String(u.instagram.apifyAvoided)} />
        <Row k="Manual fallback" v={String(u.instagram.manualFallback)} />
        <Row k="Avg cost / IG import" v={formatMicroUsd(u.instagram.avgTotalCostMicroUsd)} />
      </Panel>

      {/* Rates */}
      <Panel title="Resolver rates">
        <Row k="Direct fetch success" v={pct(u.directSuccessRate)} />
        <Row k="URL context success" v={pct(u.urlContextSuccessRate)} />
        <Row k="Apify fallback rate" v={pct(u.apifyFallbackRate)} />
        <Row k="User fallback rate" v={pct(u.userFallbackRate)} />
      </Panel>

      {/* By source */}
      <Panel title="Success rate by source">
        {u.successRateBySource.map((s) => (
          <Row key={s.source} k={s.source} v={`${s.success}/${s.total} · ${pct(s.rate)}`} />
        ))}
      </Panel>

      {/* Quality by resolver */}
      <Panel title="Quality score by resolver route">
        {u.qualityByResolver.map((q) => (
          <Row key={q.resolver} k={q.resolver} v={`${q.avgQuality}/100 · ${q.count} import${q.count === 1 ? "" : "s"}`} />
        ))}
        {u.qualityByResolver.length === 0 && <Row k="—" v="no successful imports yet" />}
      </Panel>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.03em] text-ink-3">{label}</div>
      <div className="mt-1 text-[19px] font-bold text-ink">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 overflow-hidden rounded-card border border-line bg-surface">
      <h2 className="border-b border-line-2 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.03em] text-ink-2">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line-2 px-4 py-2.5 text-[13.5px] last:border-b-0">
      <span className="text-ink-2">{k}</span>
      <span className="font-semibold text-ink">{v}</span>
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: string[] }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-ink-3">
      {label}
      <select name={name} defaultValue={value ?? ""} className="rounded-sm border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterWindow({ current, params }: { current: number; params: Record<string, string | undefined> }) {
  return (
    <div className="flex flex-col gap-0.5 text-[11px] font-semibold text-ink-3">
      Window
      <div className="flex overflow-hidden rounded-sm border border-line">
        {WINDOWS.map((w) => {
          const qs = new URLSearchParams({ ...cleanParams(params), days: String(w.days) }).toString();
          const active = current === w.days;
          return (
            <a
              key={w.days}
              href={`?${qs}`}
              className={`px-2.5 py-1 text-[12px] ${active ? "bg-basil text-white" : "bg-surface-2 text-ink-2"}`}
            >
              {w.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function cleanParams(params: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>;
}
