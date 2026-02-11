export const routes = {
  home: "/",
  dashboard: "/dashboard",
  forecasts: "/forecasts",
  locations: "/locations",
  settings: "/settings",
} as const;

export const appNavItems = [
  { title: "Dashboard", href: routes.dashboard },
  { title: "Forecasts", href: routes.forecasts },
  { title: "Locations", href: routes.locations },
  { title: "Settings", href: routes.settings },
] as const;
