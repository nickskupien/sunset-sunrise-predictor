import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { appNavItems, routes } from "@/config/routes";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-start justify-center gap-8 px-6 py-16">
      <section className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Sunset Predictor</h1>
        <p className="max-w-2xl text-muted-foreground">
          Predict unique, rare, and photogenic weather conditions in advance.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={routes.dashboard} className={buttonVariants()}>
          Open Dashboard
        </Link>
      </div>

      <section className="w-full space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Core Pages
        </h2>
        <ul className="grid gap-2">
          {appNavItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
