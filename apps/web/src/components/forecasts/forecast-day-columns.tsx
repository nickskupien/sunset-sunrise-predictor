"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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

type ForecastDayColumn = {
  label: string;
  displayDate: string;
  sunrise: SectionData;
  sunset: SectionData;
};

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractNearestForecast(inputs: Record<string, unknown> | null | undefined) {
  if (!inputs) return null;

  return {
    matchedTimeMs: toNumber(inputs.matchedTimeMs),
    avgTemp: toNumber(inputs.avgTemp),
    avgHumidity: toNumber(inputs.avgHumidity),
    avgPrecipProb: toNumber(inputs.avgPrecipProb),
    avgVisibility: toNumber(inputs.avgVisibility),
    avgTotal: toNumber(inputs.avgTotal),
    avgLow: toNumber(inputs.avgLow),
    avgMid: toNumber(inputs.avgMid),
    avgHigh: toNumber(inputs.avgHigh),
  };
}

function formatHour(ms: number, timeZone?: string | null) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function ScoreSection({
  title,
  section,
  timeZone,
}: {
  title: string;
  section: SectionData;
  timeZone?: string | null;
}) {
  if (section.state !== "ready") {
    return (
      <div className="space-y-2 rounded-lg border p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
        <p className="text-sm text-muted-foreground">{section.message ?? "No data."}</p>
      </div>
    );
  }

  const topScores = [...section.scores].sort((a, b) => b.score - a.score).slice(0, 4);
  const nearest = extractNearestForecast(section.scores[0]?.inputs);

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
      <ul className="space-y-1 text-sm">
        {topScores.map((score) => (
          <li key={score.type} className="flex items-center justify-between">
            <span className="capitalize">{score.type.replaceAll("_", " ")}</span>
            <span className="font-medium">{score.score}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Nearest-hour forecast</p>
        <p>
          Hour:{" "}
          {nearest?.matchedTimeMs != null
            ? formatHour(nearest.matchedTimeMs, timeZone)
            : "Unavailable"}
        </p>
        <p>
          Temp: {nearest?.avgTemp != null ? `${nearest.avgTemp.toFixed(1)} C` : "Unavailable"} | RH:{" "}
          {nearest?.avgHumidity != null ? `${Math.round(nearest.avgHumidity)}%` : "Unavailable"}
        </p>
        <p>
          Cloud: {nearest?.avgTotal != null ? `${Math.round(nearest.avgTotal)}%` : "Unavailable"} (L/M/H{" "}
          {nearest?.avgLow != null ? Math.round(nearest.avgLow) : "-"} /{" "}
          {nearest?.avgMid != null ? Math.round(nearest.avgMid) : "-"} /{" "}
          {nearest?.avgHigh != null ? Math.round(nearest.avgHigh) : "-"})
        </p>
        <p>
          Precip:{" "}
          {nearest?.avgPrecipProb != null ? `${Math.round(nearest.avgPrecipProb)}%` : "Unavailable"} |
          Visibility:{" "}
          {nearest?.avgVisibility != null
            ? `${Math.round(nearest.avgVisibility / 1000)} km`
            : "Unavailable"}
        </p>
      </div>
    </div>
  );
}

export function ForecastDayColumns({
  days,
  timeZone,
}: {
  days: ForecastDayColumn[];
  timeZone?: string | null;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setShowDetails((prev) => !prev);
          }}
        >
          {showDetails ? "Hide details" : "Show details"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {days.map((column) => (
          <article
            key={column.label}
            className={`space-y-3 rounded-xl border p-4 ${
              column.label === "Yesterday" ? "bg-muted/30 opacity-70" : ""
            }`}
          >
            <header className="space-y-1">
              <h2 className="text-lg font-semibold">{column.label}</h2>
              <p className="text-sm text-muted-foreground">{column.displayDate}</p>
            </header>

            {showDetails ? (
              <>
                <ScoreSection title="Sunrise scores" section={column.sunrise} timeZone={timeZone} />
                <ScoreSection title="Sunset scores" section={column.sunset} timeZone={timeZone} />
              </>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
