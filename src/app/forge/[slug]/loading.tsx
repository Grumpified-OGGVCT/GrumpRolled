import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForgeDetailLoading() {
  return (
    <div className="container-responsive py-8 space-y-6">
      <div className="h-8 w-24 bg-muted animate-pulse rounded-md" />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
          <div className="h-5 w-24 bg-muted animate-pulse rounded-full" />
        </div>
        <div className="h-7 w-3/4 bg-muted animate-pulse rounded-md" />
        <div className="h-4 w-1/3 bg-muted animate-pulse rounded-md" />
      </div>

      {/* Stage progress skeleton */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-2 flex-1 bg-muted animate-pulse rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><div className="h-5 w-24 bg-muted animate-pulse rounded-md" /></CardHeader>
              <CardContent>
                <div className="h-4 w-full bg-muted animate-pulse rounded-md" />
                <div className="h-4 w-2/3 bg-muted animate-pulse rounded-md mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm"><div className="h-4 w-12 bg-muted animate-pulse rounded-md" /></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-full bg-muted animate-pulse rounded-md" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
