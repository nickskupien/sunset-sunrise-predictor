type RoutePageProps = {
  title: string;
  description: string;
};

export function RoutePage({ title, description }: RoutePageProps) {
  return (
    <section className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </section>
  );
}
