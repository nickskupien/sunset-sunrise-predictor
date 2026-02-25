"use client";
import { scoreVisual, toQualityScore } from "@/lib/score-style";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

type ForecastDayCardData = {
  label: string;
  displayDate: string;
  sunrise: SectionData;
  sunset: SectionData;
};

function isHazyScore(row: ScoreRow) {
  return row.type === "hazy";
}

function topScore(section: SectionData) {
  if (section.state !== "ready" || section.scores.length === 0) return null;
  const skyScores = section.scores.filter((row) => !isHazyScore(row));
  if (skyScores.length === 0) return null;
  return Math.max(...skyScores.map((row) => toQualityScore(row.type, row.score)));
}

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
      <div className="space-y-2 rounded-xl border border-slate-200/70 bg-white/60 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
        <p className="text-sm text-slate-600">{section.message ?? "No data."}</p>
      </div>
    );
  }

  const topScores = [...section.scores.filter((row) => !isHazyScore(row))].slice(0, 4);
  const hazyScore = section.scores.find((row) => isHazyScore(row));
  const nearest = extractNearestForecast(section.scores[0]?.inputs);

  return (
    <div className="space-y-3 rounded-xl bg-white/70 p-4 pl-0 pr-0">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
      <ul className="space-y-1 text-sm">
        {topScores.map((score) => {
          const rowColor = scoreVisual(toQualityScore(score.type, score.score));
          return (
            <li
              key={score.type}
              className="flex items-center justify-between rounded-lg px-2 py-1.5"
              style={{ background: rowColor.wash }}
            >
              <span className="capitalize">{score.type.replaceAll("_", " ")}</span>
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                style={{
                  color: rowColor.badgeText,
                  background: rowColor.badgeBg,
                  borderColor: rowColor.ring,
                }}
              >
                {Math.round(score.score)}
              </span>
            </li>
          );
        })}
      </ul>

      {hazyScore ? (
        <div className="space-y-1 rounded-lg border border-slate-200/90 bg-slate-50/80 p-2 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other Stats</p>
          <div className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1.5">
            <span className="text-slate-700">Hazy</span>
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {Math.round(hazyScore.score)}
            </span>
          </div>
        </div>
      ) : null}

      <div className="space-y-1 border-t border-slate-200/80 pt-3 text-xs text-slate-600">
        <p className="font-medium text-slate-800">Nearest-hour forecast</p>
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
          {nearest?.avgPrecipProb != null ? `${Math.round(nearest.avgPrecipProb)}%` : "Unavailable"} | Visibility:{" "}
          {nearest?.avgVisibility != null
            ? `${Math.round(nearest.avgVisibility / 1000)} km`
            : "Unavailable"}
        </p>
      </div>
    </div>
  );
}

function buildSectionTooltipLines(section: SectionData, timeZone?: string | null) {
  if (section.state !== "ready") return [section.message ?? "No data."];

  const topScores = section.scores.filter((row) => !isHazyScore(row)).slice(0, 4);
  const hazyScore = section.scores.find((row) => isHazyScore(row));
  const nearest = extractNearestForecast(section.scores[0]?.inputs);

  const lines = [
    ...topScores.map((row) => `${row.type.replaceAll("_", " ")}: ${Math.round(row.score)}`),
  ];

  if (hazyScore) lines.push(`hazy: ${Math.round(hazyScore.score)}`);

  lines.push(
    `hour: ${nearest?.matchedTimeMs != null ? formatHour(nearest.matchedTimeMs, timeZone) : "Unavailable"}`,
    `temp: ${nearest?.avgTemp != null ? `${nearest.avgTemp.toFixed(1)} C` : "Unavailable"}`,
    `humidity: ${nearest?.avgHumidity != null ? `${Math.round(nearest.avgHumidity)}%` : "Unavailable"}`,
    `cloud: ${nearest?.avgTotal != null ? `${Math.round(nearest.avgTotal)}%` : "Unavailable"}`,
    `precip: ${nearest?.avgPrecipProb != null ? `${Math.round(nearest.avgPrecipProb)}%` : "Unavailable"}`,
    `visibility: ${
      nearest?.avgVisibility != null ? `${Math.round(nearest.avgVisibility / 1000)} km` : "Unavailable"
    }`,
  );

  return lines;
}

export function ForecastDayCards({
  days,
  timeZone,
  showDetails,
}: {
  days: ForecastDayCardData[];
  timeZone?: string | null;
  showDetails: boolean;
}) {
  return (
    <TooltipProvider>
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {days.map((column) => {
            const sunriseLead = topScore(column.sunrise);
            const sunsetLead = topScore(column.sunset);
            const sunriseColor = scoreVisual(sunriseLead ?? 50);
            const sunsetColor = scoreVisual(sunsetLead ?? 50);
            const sunriseTooltipLines = buildSectionTooltipLines(column.sunrise, timeZone);
            const sunsetTooltipLines = buildSectionTooltipLines(column.sunset, timeZone);

            return (
              <article
                key={column.label}
                className={`space-y-3 rounded-2xl border p-4 ${
                  column.label === "Yesterday" ? "opacity-60" : ""
                }`}
              >
                <header className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-800">{column.label}</h2>
                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                            style={{
                              color: sunriseColor.badgeText,
                              background: sunriseColor.badgeBg,
                              borderColor: sunriseColor.ring,
                              boxShadow: `0 18px 28px -24px ${sunriseColor.glow}`,
                            }}
                          >
                            Sunrise {sunriseLead == null ? "N/A" : sunriseColor.score}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-0.5">
                            {sunriseTooltipLines.map((line) => (
                              <p key={`${column.label}-sunrise-${line}`}>{line}</p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                            style={{
                              color: sunsetColor.badgeText,
                              background: sunsetColor.badgeBg,
                              borderColor: sunsetColor.ring,
                              boxShadow: `0 18px 28px -24px ${sunsetColor.glow}`,
                            }}
                          >
                            Sunset {sunsetLead == null ? "N/A" : sunsetColor.score}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-0.5">
                            {sunsetTooltipLines.map((line) => (
                              <p key={`${column.label}-sunset-${line}`}>{line}</p>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">{column.displayDate}</p>
                </header>

                {showDetails ? (
                  <>
                    <ScoreSection title="Sunrise scores" section={column.sunrise} timeZone={timeZone} />
                    <hr className="border-slate-200/80" />
                    <ScoreSection title="Sunset scores" section={column.sunset} timeZone={timeZone} />
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </TooltipProvider>
  );
}
