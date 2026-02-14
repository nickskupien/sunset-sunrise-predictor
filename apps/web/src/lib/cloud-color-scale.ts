type Rgb = { r: number; g: number; b: number };

type ColorStop = {
  position: number;
  rgb: Rgb;
};

const CIVIDIS_STOPS: ColorStop[] = [
  { position: 0, rgb: { r: 0, g: 32, b: 76 } },
  { position: 0.25, rgb: { r: 51, g: 74, b: 124 } },
  { position: 0.5, rgb: { r: 104, g: 111, b: 120 } },
  { position: 0.75, rgb: { r: 162, g: 151, b: 130 } },
  { position: 1, rgb: { r: 253, g: 231, b: 170 } },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function mixRgb(start: Rgb, end: Rgb, t: number): Rgb {
  return {
    r: Math.round(lerp(start.r, end.r, t)),
    g: Math.round(lerp(start.g, end.g, t)),
    b: Math.round(lerp(start.b, end.b, t)),
  };
}

export function cloudCoverageColor(coverPercent: number) {
  const x = Math.max(0, Math.min(100, coverPercent)) / 100;

  for (let i = 0; i < CIVIDIS_STOPS.length - 1; i += 1) {
    const start = CIVIDIS_STOPS[i]!;
    const end = CIVIDIS_STOPS[i + 1]!;
    if (x >= start.position && x <= end.position) {
      const segmentT = (x - start.position) / (end.position - start.position);
      const rgb = mixRgb(start.rgb, end.rgb, segmentT);
      return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    }
  }

  const last = CIVIDIS_STOPS[CIVIDIS_STOPS.length - 1]!.rgb;
  return `rgb(${last.r}, ${last.g}, ${last.b})`;
}
