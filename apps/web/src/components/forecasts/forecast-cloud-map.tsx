"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cloudCoverageColor } from "@/lib/cloud-color-scale";

type Kind = "sunrise" | "sunset";
type CloudLayer = "total" | "low" | "mid" | "high";

type DayOption = {
  label: string;
  day: string;
};

type CloudCell = {
  gridI: number;
  gridJ: number;
  pointId: number;
  lat: number;
  lon: number;
  timeMs: number;
  cloudCover: number;
  cloudCoverLow: number;
  cloudCoverMid: number;
  cloudCoverHigh: number;
};

type CloudMapResponse = {
  ok: boolean;
  matchedTimeMs: number;
  targetMs: number;
  availableTimeMs: number[];
  cells: CloudCell[];
};

type ForecastCloudMapProps = {
  locationId: number;
  defaultCenter: { lat: number; lon: number };
  timeZone: string | null;
  dayOptions: DayOption[];
  initialDay: string;
  initialKind?: Kind;
};

const ForecastCloudLeafletMap = dynamic(
  () =>
    import("./forecast-cloud-leaflet-map").then((mod) => ({
      default: mod.ForecastCloudLeafletMap,
    })),
  { ssr: false },
);

const LEGEND_STOPS = [0, 20, 40, 60, 80, 100] as const;

function formatHour(ms: number, timeZone?: string | null) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function findNearestHourIndex(times: number[], targetMs: number) {
  if (times.length === 0) return -1;
  let bestIndex = 0;
  let bestDistance = Math.abs(times[0]! - targetMs);
  for (let i = 1; i < times.length; i += 1) {
    const distance = Math.abs(times[i]! - targetMs);
    if (distance < bestDistance) {
      bestIndex = i;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

export function ForecastCloudMap({
  locationId,
  defaultCenter,
  timeZone,
  dayOptions,
  initialDay,
  initialKind = "sunset",
}: ForecastCloudMapProps) {
  const [day, setDay] = useState(initialDay);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [layer, setLayer] = useState<CloudLayer>("total");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CloudMapResponse | null>(null);
  const [scrubTimeMs, setScrubTimeMs] = useState<number | null>(null);
  const [useCustomHour, setUseCustomHour] = useState(false);
  const requestedTargetMs = useCustomHour ? scrubTimeMs : null;

  useEffect(() => {
    setDay(initialDay);
    setScrubTimeMs(null);
    setUseCustomHour(false);
  }, [initialDay, locationId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          locationId: String(locationId),
          day,
          kind,
        });
        if (requestedTargetMs) {
          params.set("targetMs", String(requestedTargetMs));
        }

        const response = await fetch(`/api/forecast/cloud-map?${params.toString()}`, {
          cache: "no-store",
        });

        const json = (await response.json()) as Partial<CloudMapResponse> & { error?: string };
        if (!response.ok || !json?.ok) {
          const message = json?.error ? `Unable to load map: ${json.error}` : "Unable to load map.";
          if (!cancelled) {
            setData(null);
            setError(message);
          }
          return;
        }

        if (!cancelled) {
          const next = json as CloudMapResponse;
          setData(next);

          if (!useCustomHour) {
            const nearestIndex = findNearestHourIndex(
              next.availableTimeMs ?? [],
              next.matchedTimeMs,
            );
            if (nearestIndex >= 0) setScrubTimeMs(next.availableTimeMs[nearestIndex]!);
          }
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setError("Unable to load cloud coverage map.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [locationId, day, kind, requestedTargetMs, useCustomHour]);

  const center = useMemo(() => {
    if (!data?.cells?.length) return defaultCenter;
    const lat = data.cells.reduce((sum, cell) => sum + cell.lat, 0) / data.cells.length;
    const lon = data.cells.reduce((sum, cell) => sum + cell.lon, 0) / data.cells.length;
    return { lat, lon };
  }, [data, defaultCenter]);

  const layerLabel =
    layer === "low"
      ? "Low clouds"
      : layer === "mid"
        ? "Mid clouds"
        : layer === "high"
          ? "High clouds"
          : "Total cloud cover";
  const timeline = data?.availableTimeMs ?? [];
  const activeTimeMs = useCustomHour ? scrubTimeMs : (data?.matchedTimeMs ?? scrubTimeMs);
  const activeHourIndex = activeTimeMs ? findNearestHourIndex(timeline, activeTimeMs) : -1;
  const sliderIndex = activeHourIndex >= 0 ? activeHourIndex : 0;

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Cloud Coverage Map</h2>
        <p className="text-sm text-muted-foreground">
          Coverage nearest to selected sunrise/sunset event.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium">Day</label>
          <Select
            value={day}
            onValueChange={(value) => {
              setDay(value);
              setScrubTimeMs(null);
              setUseCustomHour(false);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select day" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Days</SelectLabel>
                {dayOptions.map((option) => (
                  <SelectItem key={option.day} value={option.day}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Event</label>
          <Select
            value={kind}
            onValueChange={(value) => {
              setKind(value as Kind);
              setScrubTimeMs(null);
              setUseCustomHour(false);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select event" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Events</SelectLabel>
                <SelectItem value="sunrise">Sunrise</SelectItem>
                <SelectItem value="sunset">Sunset</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2 md:max-w-sm">
        <label className="text-sm font-medium">Cloud layer</label>
        <Select value={layer} onValueChange={(value) => setLayer(value as CloudLayer)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select layer" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Layers</SelectLabel>
              <SelectItem value="total">Total cloud cover</SelectItem>
              <SelectItem value="low">Low clouds</SelectItem>
              <SelectItem value="mid">Mid clouds</SelectItem>
              <SelectItem value="high">High clouds</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Color scale for {layerLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          {LEGEND_STOPS.map((stop, index) => (
            <div
              key={stop}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <span
                className="inline-block size-3 rounded-sm border"
                style={{ backgroundColor: cloudCoverageColor(stop) }}
                aria-hidden
              />
              <span>
                {index === LEGEND_STOPS.length - 1
                  ? `${stop}%`
                  : `${stop}-${LEGEND_STOPS[index + 1]}%`}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ForecastCloudLeafletMap
        locationId={locationId}
        center={center}
        layer={layer}
        cells={data?.cells ?? []}
        timeZone={timeZone}
        loading={loading}
      />

      {timeline.length > 1 ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatHour(timeline[0]!, timeZone)}</span>
            <span>{formatHour(timeline[timeline.length - 1]!, timeZone)}</span>
          </div>
          <Slider
            min={0}
            max={timeline.length - 1}
            step={1}
            value={[sliderIndex]}
            onValueChange={(value) => {
              const nextIndex = value[0];
              if (typeof nextIndex !== "number" || !Number.isFinite(nextIndex)) return;
              const nextTime = timeline[nextIndex];
              if (!nextTime) return;
              setScrubTimeMs(nextTime);
              setUseCustomHour(true);
            }}
            aria-label="Hour scrubber timeline"
          />
          <p className="text-xs text-muted-foreground">
            Selected hour: {activeTimeMs ? formatHour(activeTimeMs, timeZone) : "No hour selected"}
          </p>
        </div>
      ) : null}
    </section>
  );
}
