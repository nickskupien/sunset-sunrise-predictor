"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; locationId: number; requestId: number }
  | { status: "error"; message: string };

type ExistingLocation = {
  id: number;
  key: string;
  name: string | null;
  lat: number;
  lon: number;
  tz: string | null;
};

const DEFAULT_CENTER = { lat: 39.8283, lon: -98.5795 };
const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LON = -180;
const MAX_LON = 180;
const CUSTOM_LOCATION_NAME_VALUE = "__custom_location_name__";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function LocationSelectionEvents({ onSelect }: { onSelect: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function MapViewUpdater({ lat, lon, zoom }: { lat: number; lon: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lon], zoom);
  }, [lat, lon, zoom, map]);
  return null;
}

function toFixedCoord(value: number) {
  return value.toFixed(3);
}

function getLocationName(location: ExistingLocation) {
  const name = location.name?.trim();
  return name && name.length > 0 ? name : null;
}

export function LocationPickerMap() {
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [locationNameSelection, setLocationNameSelection] = useState<string>(
    CUSTOM_LOCATION_NAME_VALUE,
  );
  const [customLocationNameInput, setCustomLocationNameInput] = useState("");
  const [existingLocations, setExistingLocations] = useState<ExistingLocation[]>([]);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function fetchExistingLocations() {
      try {
        const response = await fetch(`/api/locations?limit=200`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!data?.ok || !Array.isArray(data.locations)) return;

        const locations = data.locations
          .filter(
            (item: unknown): item is ExistingLocation =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as ExistingLocation).id === "number" &&
              typeof (item as ExistingLocation).key === "string" &&
              (typeof (item as ExistingLocation).name === "string" ||
                (item as ExistingLocation).name === null) &&
              typeof (item as ExistingLocation).lat === "number" &&
              typeof (item as ExistingLocation).lon === "number",
          )
          .slice(0, 200);

        if (!cancelled) setExistingLocations(locations);
      } catch {
        if (!cancelled) setExistingLocations([]);
      }
    }

    void fetchExistingLocations();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => {
    if (lat == null || lon == null) return null;
    return { lat, lon };
  }, [lat, lon]);

  const namedLocations = useMemo(
    () => existingLocations.filter((item) => getLocationName(item) !== null),
    [existingLocations],
  );

  const selectedExistingLocation = useMemo(() => {
    const selectedId = Number(locationNameSelection);
    if (!Number.isSafeInteger(selectedId) || selectedId <= 0) return null;
    return namedLocations.find((item) => item.id === selectedId) ?? null;
  }, [locationNameSelection, namedLocations]);

  async function saveLocation() {
    const hasExistingSelection = selectedExistingLocation !== null;
    const locationName = hasExistingSelection
      ? (getLocationName(selectedExistingLocation) ?? "").trim()
      : customLocationNameInput.trim();

    if (!locationName) {
      setSaveState({ status: "error", message: "Enter a location name." });
      return;
    }

    if (!hasExistingSelection && !selected) {
      setSaveState({
        status: "error",
        message: "Pick coordinates on the map to create a new named location.",
      });
      return;
    }

    try {
      setSaveState({ status: "saving" });

      const response = await fetch(
        hasExistingSelection
          ? `/api/scores/prepare/${selectedExistingLocation.id}`
          : `/api/scores/prepare`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            hasExistingSelection
              ? {
                  forecastDays: 7,
                  kinds: ["sunset", "sunrise"],
                }
              : {
                  name: locationName,
                  lat: selected!.lat,
                  lon: selected!.lon,
                  forecastDays: 7,
                  kinds: ["sunset", "sunrise"],
                },
          ),
        },
      );

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        const message = typeof data?.error === "string" ? data.error : "Failed to save location.";
        setSaveState({ status: "error", message });
        return;
      }

      if (typeof data.locationId !== "number" || typeof data.requestId !== "number") {
        setSaveState({ status: "error", message: "Unexpected response from server." });
        return;
      }

      setSaveState({ status: "success", locationId: data.locationId, requestId: data.requestId });
    } catch {
      setSaveState({ status: "error", message: "Network error while saving location." });
    }
  }

  function selectLocation(nextLat: number, nextLon: number) {
    setLat(clamp(nextLat, MIN_LAT, MAX_LAT));
    setLon(clamp(nextLon, MIN_LON, MAX_LON));
    setSaveState({ status: "idle" });
  }

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setSaveState({ status: "error", message: "Geolocation is not available in this browser." });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        selectLocation(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setSaveState({ status: "error", message: "Unable to retrieve your current location." });
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function populateCoordsFromLocation() {
    if (!selectedExistingLocation) {
      setSaveState({
        status: "error",
        message: "Location not found in existing values. Pick one from the list.",
      });
      return;
    }

    setLat(selectedExistingLocation.lat);
    setLon(selectedExistingLocation.lon);
    setSaveState({ status: "idle" });
  }

  const mapCenter = selected ?? DEFAULT_CENTER;
  const mapZoom = selected ? 10 : 4;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Locations</h1>
        <p className="text-muted-foreground">
          Select an existing location or pick coordinates to create a new saved location.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lon]}
          zoom={mapZoom}
          className="h-[420px] w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapViewUpdater lat={mapCenter.lat} lon={mapCenter.lon} zoom={mapZoom} />
          <LocationSelectionEvents onSelect={selectLocation} />
          {selected ? (
            <CircleMarker
              center={[selected.lat, selected.lon]}
              radius={10}
              pathOptions={{ color: "#ef4444" }}
            >
              <Popup>
                {toFixedCoord(selected.lat)}, {toFixedCoord(selected.lon)}
              </Popup>
            </CircleMarker>
          ) : null}
        </MapContainer>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Latitude</span>
          <input
            type="number"
            min={MIN_LAT}
            max={MAX_LAT}
            step="0.00001"
            value={lat ?? ""}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isNaN(value)) {
                setLat(null);
                return;
              }
              selectLocation(value, lon ?? DEFAULT_CENTER.lon);
            }}
            className="h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="e.g. 34.052"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">Longitude</span>
          <input
            type="number"
            min={MIN_LON}
            max={MAX_LON}
            step="0.00001"
            value={lon ?? ""}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isNaN(value)) {
                setLon(null);
                return;
              }
              selectLocation(lat ?? DEFAULT_CENTER.lat, value);
            }}
            className="h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="e.g. -118.243"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">Location</span>
          <Select
            value={locationNameSelection}
            onValueChange={(value) => {
              setLocationNameSelection(value);
              setSaveState({ status: "idle" });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a location" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Location</SelectLabel>
                <SelectItem value={CUSTOM_LOCATION_NAME_VALUE}>Add new location</SelectItem>
                {namedLocations.map((location) => (
                  <SelectItem key={location.id} value={String(location.id)}>
                    {getLocationName(location)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {locationNameSelection === CUSTOM_LOCATION_NAME_VALUE ? (
            <input
              type="text"
              value={customLocationNameInput}
              onChange={(event) => {
                setCustomLocationNameInput(event.target.value);
                setSaveState({ status: "idle" });
              }}
              className="h-9 w-full rounded-md border bg-background px-3 py-1 text-sm shadow-xs outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={
                namedLocations.length > 0
                  ? `e.g. ${getLocationName(namedLocations[0])}`
                  : "Enter location name"
              }
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            Edit an existing location or create a new one.
          </p>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium invisible">Read saved values</span>
          <div className="flex">
            <Button
              type="button"
              variant="outline"
              onClick={populateCoordsFromLocation}
              className="w-auto"
              disabled={!selectedExistingLocation}
            >
              Read saved values
            </Button>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={useCurrentLocation}>
          Use current location
        </Button>
        <Button
          type="button"
          onClick={saveLocation}
          disabled={saveState.status === "saving"}
          title="Queue jobs for this location"
        >
          {saveState.status === "saving" ? "Saving..." : "Save location"}
        </Button>
      </div>

      <div className="min-h-6 text-sm">
        {saveState.status === "success" ? (
          <p className="text-emerald-600">
            Location saved. Forecast job queued (request #{saveState.requestId}).
          </p>
        ) : null}
        {saveState.status === "error" ? (
          <p className="text-destructive">{saveState.message}</p>
        ) : null}
      </div>
    </section>
  );
}
