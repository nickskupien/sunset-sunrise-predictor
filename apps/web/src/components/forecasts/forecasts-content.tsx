"use client";

import { useState } from "react";
import { ForecastLocationPicker } from "@/components/forecasts/forecast-location-picker";
import { ForecastDayCards } from "@/components/forecasts/forecast-day-cards";
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

type ForecastDayCardData = {
  label: string;
  displayDate: string;
  sunrise: SectionData;
  sunset: SectionData;
};

export function ForecastsContent({
  selectedLocationId,
  locationOptions,
  days,
  timeZone,
}: {
  selectedLocationId: number;
  locationOptions: Array<{ id: number; label: string }>;
  days: ForecastDayCardData[];
  timeZone?: string | null;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <ForecastLocationPicker
        selectedId={selectedLocationId}
        options={locationOptions}
        extraAction={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowDetails((prev) => !prev);
            }}
          >
            {showDetails ? "Hide details" : "Show details"}
          </Button>
        }
      />

      <ForecastDayCards days={days} timeZone={timeZone} showDetails={showDetails} />
    </>
  );
}
