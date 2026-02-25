import { getEnv } from "@/config/env";
import { ForecastCloudMap } from "@/components/forecasts/forecast-cloud-map";
import { ForecastsContent } from "@/components/forecasts/forecasts-content";

export const dynamic = "force-dynamic";

type Location = {
  id: number;
  name: string | null;
  key: string;
  lat: number;
  lon: number;
  tz: string | null;
};

type ScoreRow = {
  type: string;
  score: number;
  inputs?: Record<string, unknown> | null;
};

type SectionState = "ready" | "missing" | "pending" | "error";

type SectionData = {
  state: SectionState;
  scores: ScoreRow[];
  message?: string;
};

const DAY_COLUMNS = [
  { label: "Yesterday", offsetDays: -1 },
  { label: "Today", offsetDays: 0 },
  { label: "Tomorrow", offsetDays: 1 },
] as const;

const KINDS = ["sunrise", "sunset"] as const;

function formatYmd(date: Date, timeZone?: string | null) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDate(base: Date, days: number) {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDisplayDate(ymd: string, timeZone?: string | null) {
  const [year, month, day] = ymd.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? undefined,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(utcDate);
}

function parseLocationId(raw: string | undefined) {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function getLocationLabel(location: Location) {
  const name = location.name?.trim();
  return name && name.length > 0 ? name : location.key;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data };
}

async function fetchLocations(baseUrl: string): Promise<Location[]> {
  const { response, data } = await fetchJson(`${baseUrl}/locations?limit=50`);
  if (!response.ok || !data || typeof data !== "object") return [];

  const locationsRaw = (data as { locations?: unknown }).locations;
  if (!Array.isArray(locationsRaw)) return [];

  return locationsRaw.filter(
    (item): item is Location =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Location).id === "number" &&
      typeof (item as Location).key === "string" &&
      typeof (item as Location).lat === "number" &&
      typeof (item as Location).lon === "number" &&
      (typeof (item as Location).name === "string" || (item as Location).name === null) &&
      (typeof (item as Location).tz === "string" || (item as Location).tz === null),
  );
}

async function fetchSection(
  baseUrl: string,
  locationId: number,
  day: string,
  kind: "sunrise" | "sunset",
): Promise<SectionData> {
  const { response, data } = await fetchJson(`${baseUrl}/scores/${locationId}/${day}/${kind}`);
  if (!data || typeof data !== "object") {
    return { state: "error", scores: [], message: "Unexpected API response." };
  }

  const payload = data as { status?: string; scores?: unknown };
  const scores = Array.isArray(payload.scores)
    ? payload.scores.filter(
        (item): item is ScoreRow =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as ScoreRow).type === "string" &&
          typeof (item as ScoreRow).score === "number",
      )
    : [];

  if (response.status === 202 || payload.status === "pending") {
    return {
      state: "pending",
      scores,
      message: "Scores are being computed. Refresh shortly.",
    };
  }

  if (!response.ok) {
    return {
      state: "error",
      scores: [],
      message: `Failed to load ${kind} data.`,
    };
  }

  if (scores.length === 0) {
    return { state: "missing", scores: [], message: "No scores available." };
  }

  return { state: "ready", scores };
}

export default async function ForecastsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const env = getEnv();
  const locations = await fetchLocations(env.API_BASE_URL);
  const resolvedSearchParams = (await searchParams) ?? {};
  const rawLocationId = resolvedSearchParams.locationId;
  const selectedLocationId = parseLocationId(
    Array.isArray(rawLocationId) ? rawLocationId[0] : rawLocationId,
  );
  const location =
    (selectedLocationId != null
      ? locations.find((item) => item.id === selectedLocationId)
      : undefined) ??
    locations[0] ??
    null;

  if (!location) {
    return (
      <section className="glass-card space-y-2 rounded-2xl p-6">
        <h1 className="section-title-gradient text-3xl font-semibold tracking-tight">Forecasts</h1>
        <p className="text-slate-600">
          No locations found. Add a location first on the Locations page.
        </p>
      </section>
    );
  }

  const now = new Date();
  const columns = DAY_COLUMNS.map((column) => {
    const day = formatYmd(shiftDate(now, column.offsetDays), location.tz);
    return { ...column, day };
  });

  const sections = await Promise.all(
    columns.map(async (column) => {
      const [sunrise, sunset] = await Promise.all(
        KINDS.map((kind) => fetchSection(env.API_BASE_URL, location.id, column.day, kind)),
      );

      return {
        ...column,
        sunrise,
        sunset,
      };
    }),
  );

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Forecasts</h1>
        <p className="text-muted-foreground">
          Showing {location.name?.trim() || "selected location"} ({location.key}).
        </p>
      </div>

      <ForecastsContent
        selectedLocationId={location.id}
        locationOptions={locations.map((item) => ({
          id: item.id,
          label: getLocationLabel(item),
        }))}
        days={sections.map((column) => ({
          label: column.label,
          displayDate: formatDisplayDate(column.day, location.tz),
          sunrise: column.sunrise,
          sunset: column.sunset,
        }))}
        timeZone={location.tz}
      />

      <ForecastCloudMap
        key={`forecast-cloud-map-${location.id}`}
        locationId={location.id}
        defaultCenter={{ lat: location.lat, lon: location.lon }}
        timeZone={location.tz}
        dayOptions={sections.map((column) => ({
          day: column.day,
          label: `${column.label} (${formatDisplayDate(column.day, location.tz)})`,
        }))}
        initialDay={
          sections.find((column) => column.label === "Today")?.day ??
          sections[1]?.day ??
          sections[0]!.day
        }
        initialKind="sunset"
      />
    </section>
  );
}
