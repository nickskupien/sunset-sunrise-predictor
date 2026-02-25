export type ScoreVisual = {
  score: number;
  ring: string;
  badgeText: string;
  badgeBg: string;
  glow: string;
  wash: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function toQualityScore(type: string, score: number) {
  const clamped = clamp(score, 0, 100);
  return type === "hazy" ? 100 - clamped : clamped;
}

export function scoreVisual(score: number): ScoreVisual {
  const normalized = clamp(score, 0, 100) / 100;
  // const hue = 6 + normalized * 190;
  const hue = 120;
  const saturation = normalized * 100;
  const lightness = 44 + normalized * 8;

  return {
    score: Math.round(clamp(score, 0, 100)),
    ring: `hsl(${hue}deg ${saturation}% ${Math.max(30, lightness - 12)}% / 0.4)`,
    badgeText: `hsl(${hue}deg ${saturation}% 18%)`,
    badgeBg: `hsl(${hue}deg ${saturation}% 90%)`,
    glow: `hsl(${hue}deg ${saturation}% 66% / 0.82)`,
    wash: `hsl(${hue}deg ${saturation}% 95% / 0.64)`,
  };
}
