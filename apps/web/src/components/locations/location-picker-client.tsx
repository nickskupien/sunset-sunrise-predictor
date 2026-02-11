"use client";

import dynamic from "next/dynamic";

const LocationPickerMap = dynamic(
  () => import("@/components/locations/location-picker-map").then((mod) => mod.LocationPickerMap),
  {
    ssr: false,
    loading: () => (
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Locations</h1>
        <p className="text-muted-foreground">Loading map...</p>
      </section>
    ),
  },
);

export function LocationPickerClient() {
  return <LocationPickerMap />;
}
