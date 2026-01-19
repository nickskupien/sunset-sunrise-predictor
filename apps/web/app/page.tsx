import { DbHealthSchema, HealthSchema } from "@sunset/contracts";

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return data;
}

export default async function Home() {
  const base = process.env.API_BASE_URL ?? "http://localhost:3001";

  const healthRaw = await fetchJson(`${base}/health`);
  const dbRaw = await fetchJson(`${base}/db/health`);

  const health = HealthSchema.parse(healthRaw);
  const db = DbHealthSchema.parse(dbRaw);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 800 }}>
      <h1>Sunset Predictor</h1>
      <p>SSR smoke test page. If you see this, SSR is working.</p>

      <h2>API Health</h2>
      <pre>{JSON.stringify(health, null, 2)}</pre>

      <h2>DB Health (API → Postgres)</h2>
      <pre>{JSON.stringify(db, null, 2)}</pre>

      <p style={{ marginTop: 24, opacity: 0.7 }}>
        Next: wire up worker ingestion + scoring, then display real scores here.
      </p>
    </main>
  );
}
