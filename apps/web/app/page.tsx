import { DbHealthSchema, HealthSchema } from "@sunset/contracts";
import { Button } from "@/components/ui/button";
import { getEnv } from "@/config/env";

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return data;
}

export default async function Home() {
  const env = getEnv();
  const base = env.API_BASE_URL;

  const healthRaw = await fetchJson(`${base}/health`);
  const dbRaw = await fetchJson(`${base}/db/health`);

  const health = HealthSchema.parse(healthRaw);
  const db = DbHealthSchema.parse(dbRaw);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-3xl font-semibold">Sunset Predictor</h1>
      <p className="mb-6 text-muted-foreground">
        SSR smoke test page. If you see this, SSR is working.
      </p>

      <div className="mb-8 flex items-center gap-3">
        <Button>Primary action</Button>
        <Button variant="outline">Secondary action</Button>
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-xl font-medium">API Health</h2>
        <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm">
          {JSON.stringify(health, null, 2)}
        </pre>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-xl font-medium">DB Health (API → Postgres)</h2>
        <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-sm">
          {JSON.stringify(db, null, 2)}
        </pre>
      </section>

      <p className="text-sm text-muted-foreground">
        Next: wire up worker ingestion + scoring, then display real scores here.
      </p>
    </main>
  );
}
