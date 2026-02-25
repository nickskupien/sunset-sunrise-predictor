"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  readStoredForecastLocationId,
  writeStoredForecastLocationId,
} from "@/lib/forecast-location-storage";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ForecastLocationPickerProps = {
  options: Array<{ id: number; label: string }>;
  selectedId: number;
  extraAction?: ReactNode;
};

const REFRESH_FORECAST_DAYS = 7;
const REFRESH_KINDS = ["sunset", "sunrise"] as const;
const REFRESH_POLL_INTERVAL_MS = 2_000;
const REFRESH_MAX_WAIT_MS = 10 * 60 * 1000;

type RefreshJobStatus = "queued" | "running" | "retrying" | "succeeded" | "dead";

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function ForecastLocationPicker({
  options,
  selectedId,
  extraAction,
}: ForecastLocationPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const selectableLocationIds = useMemo(() => new Set(options.map((item) => item.id)), [options]);

  useEffect(() => {
    void writeStoredForecastLocationId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;

    async function applyStoredLocation() {
      const queryLocationId = searchParams.get("locationId");
      if (queryLocationId) return;

      const storedLocationId = await readStoredForecastLocationId();
      if (cancelled) return;
      if (storedLocationId == null) return;
      if (!selectableLocationIds.has(storedLocationId)) return;
      if (storedLocationId === selectedId) return;

      const params = new URLSearchParams(searchParams.toString());
      params.set("locationId", String(storedLocationId));
      router.replace(`${pathname}?${params.toString()}`);
      router.refresh();
    }

    void applyStoredLocation();
    return () => {
      cancelled = true;
    };
  }, [searchParams, selectableLocationIds, selectedId, pathname, router]);

  function handleChange(nextIdRaw: string) {
    const nextId = Number(nextIdRaw);
    if (!Number.isSafeInteger(nextId) || nextId <= 0) return;
    if (!selectableLocationIds.has(nextId)) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("locationId", String(nextId));
    void writeStoredForecastLocationId(nextId);
    router.replace(`${pathname}?${params.toString()}`);
    router.refresh();
  }

  async function waitForRefreshCompletion(
    locationId: number,
    requestId: number,
    minComputedAtMs: number,
  ) {
    const deadline = Date.now() + REFRESH_MAX_WAIT_MS;
    let rootJobDone = false;

    while (Date.now() < deadline) {
      if (!rootJobDone) {
        setRefreshProgress("Refreshing forecast data...");
        const jobResponse = await fetch(`/api/jobs/${requestId}`, { cache: "no-store" });
        let jobData: unknown = null;
        try {
          jobData = await jobResponse.json();
        } catch {
          jobData = null;
        }

        const jobPayload = jobData as {
          ok?: boolean;
          error?: string;
          job?: { status?: RefreshJobStatus; lastError?: string | null };
        } | null;

        if (!jobResponse.ok || !jobPayload?.ok || !jobPayload.job?.status) {
          throw new Error(
            typeof jobPayload?.error === "string"
              ? jobPayload.error
              : "Failed to read refresh job status.",
          );
        }

        if (jobPayload.job.status === "dead") {
          throw new Error(jobPayload.job.lastError ?? "Forecast refresh job failed.");
        }

        rootJobDone = jobPayload.job.status === "succeeded";
      }

      if (rootJobDone) {
        setRefreshProgress("Computing sunrise and sunset scores...");
        const params = new URLSearchParams();
        params.set("forecastDays", String(REFRESH_FORECAST_DAYS));
        params.set("kinds", REFRESH_KINDS.join(","));
        params.set("minComputedAtMs", String(minComputedAtMs));
        const response = await fetch(`/api/scores/status/${locationId}?${params.toString()}`, {
          cache: "no-store",
        });

        let data: unknown = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        const payload = data as { ok?: boolean; status?: string; error?: string } | null;
        if (response.ok && payload?.ok && payload.status === "ready") return;
        if (payload?.status === "pending_timezone") {
          throw new Error("Location timezone is not ready yet. Try again in a minute.");
        }
        if (!response.ok && typeof payload?.error === "string") {
          throw new Error(payload.error);
        }
      }

      await delay(REFRESH_POLL_INTERVAL_MS);
    }

    throw new Error("Timed out waiting for refresh jobs to finish.");
  }

  async function handleRefresh() {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setRefreshProgress("Queueing refresh job...");
    setRefreshError(null);

    try {
      const response = await fetch(`/api/scores/prepare/${selectedId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          forecastDays: REFRESH_FORECAST_DAYS,
          kinds: REFRESH_KINDS,
        }),
      });

      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      const payload = data as { ok?: boolean; error?: string; requestId?: number; acceptedAtMs?: number } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(
          typeof payload?.error === "string" ? payload.error : "Failed to queue forecast refresh.",
        );
      }

      const requestIdRaw = payload.requestId;
      if (typeof requestIdRaw !== "number" || !Number.isSafeInteger(requestIdRaw) || requestIdRaw <= 0) {
        throw new Error("Refresh request did not return a valid job id.");
      }
      const requestId = requestIdRaw;

      const minComputedAtMs =
        typeof payload.acceptedAtMs === "number" && Number.isFinite(payload.acceptedAtMs)
          ? payload.acceptedAtMs
          : Date.now();

      await waitForRefreshCompletion(selectedId, requestId, minComputedAtMs);
      setRefreshProgress("Finalizing view...");
      router.refresh();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Failed to refresh forecasts.");
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(null);
    }
  }

  return (
    <div className="w-full space-y-2">
      <label htmlFor="locationId" className="text-sm font-medium">
        Location
      </label>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select
            value={String(selectedId)}
            disabled={isRefreshing}
            onValueChange={(value) => {
              handleChange(value);
            }}
          >
            <SelectTrigger id="locationId" className="w-full">
              <SelectValue placeholder="Select a location" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Locations</SelectLabel>
                {options.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void handleRefresh();
          }}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
        {extraAction ? <div className="ml-auto">{extraAction}</div> : null}
      </div>
      {isRefreshing && refreshProgress ? (
        <p className="text-sm text-muted-foreground">{refreshProgress}</p>
      ) : null}
      {refreshError ? <p className="text-sm text-destructive">{refreshError}</p> : null}
    </div>
  );
}
