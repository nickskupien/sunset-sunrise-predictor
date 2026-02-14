"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { MapContainer, Popup, Rectangle, TileLayer } from "react-leaflet";
import { cloudCoverageColor } from "@/lib/cloud-color-scale";

type CloudLayer = "total" | "low" | "mid" | "high";

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

type ForecastCloudLeafletMapProps = {
  locationId: number;
  center: { lat: number; lon: number };
  layer: CloudLayer;
  cells: CloudCell[];
  timeZone: string | null;
  loading: boolean;
};

function getLayerValue(cell: CloudCell, layer: CloudLayer) {
  if (layer === "low") return cell.cloudCoverLow;
  if (layer === "mid") return cell.cloudCoverMid;
  if (layer === "high") return cell.cloudCoverHigh;
  return cell.cloudCover;
}

function formatHour(ms: number, timeZone?: string | null) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function variance(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function midpoint(a: number, b: number) {
  return (a + b) / 2;
}

function buildIndexMeans(
  cells: CloudCell[],
  pickIndex: (cell: CloudCell) => number,
  pickValue: (cell: CloudCell) => number,
) {
  const sums = new Map<number, { sum: number; count: number }>();
  for (const cell of cells) {
    const idx = pickIndex(cell);
    const value = pickValue(cell);
    const current = sums.get(idx);
    if (current) {
      current.sum += value;
      current.count += 1;
    } else {
      sums.set(idx, { sum: value, count: 1 });
    }
  }

  return new Map<number, number>(
    Array.from(sums.entries()).map(([idx, agg]) => [idx, agg.sum / agg.count]),
  );
}

function buildEdges(centerByIndex: Map<number, number>) {
  const sorted = Array.from(centerByIndex.entries()).sort((a, b) => a[1] - b[1]);
  const edges = new Map<number, { min: number; max: number }>();
  for (let i = 0; i < sorted.length; i += 1) {
    const [index, center] = sorted[i]!;
    const prev = sorted[i - 1]?.[1];
    const next = sorted[i + 1]?.[1];

    const min =
      prev !== undefined
        ? midpoint(prev, center)
        : center - (next !== undefined ? (next - center) / 2 : 0.05);
    const max =
      next !== undefined
        ? midpoint(center, next)
        : center + (prev !== undefined ? (center - prev) / 2 : 0.05);
    edges.set(index, { min, max });
  }
  return edges;
}

export function ForecastCloudLeafletMap({
  locationId,
  center,
  layer,
  cells,
  timeZone,
  loading,
}: ForecastCloudLeafletMapProps) {
  const boundsByPointId = useMemo(() => {
    if (cells.length === 0) return new Map<number, [[number, number], [number, number]]>();

    const lonByI = buildIndexMeans(
      cells,
      (cell) => cell.gridI,
      (cell) => cell.lon,
    );
    const lonByJ = buildIndexMeans(
      cells,
      (cell) => cell.gridJ,
      (cell) => cell.lon,
    );
    const latByI = buildIndexMeans(
      cells,
      (cell) => cell.gridI,
      (cell) => cell.lat,
    );
    const latByJ = buildIndexMeans(
      cells,
      (cell) => cell.gridJ,
      (cell) => cell.lat,
    );

    const lonUsesI = variance(Array.from(lonByI.values())) > variance(Array.from(lonByJ.values()));
    const latUsesI = variance(Array.from(latByI.values())) > variance(Array.from(latByJ.values()));

    const lonCenterByIndex = lonUsesI ? lonByI : lonByJ;
    const latCenterByIndex = latUsesI ? latByI : latByJ;

    const lonEdges = buildEdges(lonCenterByIndex);
    const latEdges = buildEdges(latCenterByIndex);

    const byPoint = new Map<number, [[number, number], [number, number]]>();
    for (const cell of cells) {
      const lonIndex = lonUsesI ? cell.gridI : cell.gridJ;
      const latIndex = latUsesI ? cell.gridI : cell.gridJ;
      const lon = lonEdges.get(lonIndex);
      const lat = latEdges.get(latIndex);
      if (!lon || !lat) continue;

      byPoint.set(cell.pointId, [
        [lat.min, lon.min],
        [lat.max, lon.max],
      ]);
    }
    return byPoint;
  }, [cells]);

  return (
    <div className="relative overflow-hidden rounded-lg border">
      <MapContainer
        key={`cloud-map-${locationId}`}
        center={[center.lat, center.lon]}
        zoom={9}
        className="h-[420px] w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {cells.map((cell) => (
          <Rectangle
            key={`${cell.gridI}-${cell.gridJ}-${cell.pointId}`}
            bounds={
              boundsByPointId.get(cell.pointId) ?? [
                [cell.lat - 0.02, cell.lon - 0.02],
                [cell.lat + 0.02, cell.lon + 0.02],
              ]
            }
            pathOptions={{
              color: "rgba(0, 0, 0, 0.05)",
              weight: 2,
              fillColor: cloudCoverageColor(getLayerValue(cell, layer)),
              fillOpacity: 0.5,
            }}
          >
            <Popup>
              <div className="space-y-1 text-xs">
                <p>
                  Layer cloud: <strong>{Math.round(getLayerValue(cell, layer))}%</strong>
                </p>
                <p>
                  L/M/H: {Math.round(cell.cloudCoverLow)} / {Math.round(cell.cloudCoverMid)} /{" "}
                  {Math.round(cell.cloudCoverHigh)}
                </p>
                <p>Hour: {formatHour(cell.timeMs, timeZone)}</p>
              </div>
            </Popup>
          </Rectangle>
        ))}
      </MapContainer>

      {loading ? (
        <div className="pointer-events-none absolute right-3 top-3 z-[500]">
          <div className="rounded-md border bg-background/90 px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
            Updating map...
          </div>
        </div>
      ) : null}
    </div>
  );
}
