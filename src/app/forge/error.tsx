'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function ForgeError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('Forge lane error:', error);
  }, [error]);

  return (
    <div className="container-responsive py-8">
      <Card className="border-destructive/30">
        <CardContent className="p-8 text-center space-y-4">
          <AlertTriangle className="size-10 mx-auto text-destructive" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Failed to load Forge Lane</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {error.message || 'An unexpected error occurred while loading proposals.'}
            </p>
          </div>
          <Button onClick={reset} variant="outline">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
