import { Card, CardContent } from '@/components/ui/card';

export default function ForgeLoading() {
  return (
    <div className="container-responsive py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded-md" />
          <div className="h-4 w-72 bg-muted animate-pulse rounded-md" />
        </div>
        <div className="h-9 w-36 bg-muted animate-pulse rounded-md" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
                <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
              </div>
              <div className="h-5 w-full bg-muted animate-pulse rounded-md" />
              <div className="h-5 w-3/4 bg-muted animate-pulse rounded-md" />
              <div className="flex items-center justify-between">
                <div className="h-3 w-24 bg-muted animate-pulse rounded-md" />
                <div className="h-3 w-16 bg-muted animate-pulse rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
