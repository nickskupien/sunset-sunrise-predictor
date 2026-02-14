"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { appNavItems, routes } from "@/config/routes";
import { readStoredForecastLocationId } from "@/lib/forecast-location-storage";
import { cn } from "@/lib/utils";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleForecastNavClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    const storedLocationId = await readStoredForecastLocationId();
    const href =
      storedLocationId != null
        ? `${routes.forecasts}?locationId=${String(storedLocationId)}`
        : routes.forecasts;
    router.push(href);
  }

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href={routes.home} className="text-sm font-semibold tracking-tight">
          Sunset Predictor
        </Link>
        <nav className="flex items-center gap-1">
          {appNavItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={item.href === routes.forecasts ? handleForecastNavClick : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive && "bg-muted text-foreground"
                )}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
