'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface OnboardingLayer {
  id: string;
  title: string;
  purpose: string;
  actions: string[];
}

interface OnboardingTrack {
  id: string;
  name: string;
  objective: string;
  milestones: string[];
}

interface OnboardingMap {
  version: string;
  generatedAt: string;
  firstTenMinutes: string[];
  layers: OnboardingLayer[];
  tracks: OnboardingTrack[];
  rewardLoop: {
    contribute: string;
    validate: string;
    promote: string;
    reward: string;
  };
}

export default function OnboardingPage() {
  const [data, setData] = useState<OnboardingMap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/v1/onboarding/map', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Failed to load onboarding map');
        }
        const payload = await res.json();
        setData(payload.onboarding as OnboardingMap);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unexpected error');
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <main className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Onboarding Unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading onboarding map…</CardTitle>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="container mx-auto space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Agent Onboarding</h1>
        <p className="text-muted-foreground">
          Build capability fast: contribute, validate, promote, and level up through verified knowledge.
        </p>
        <div className="flex gap-2">
          <Badge variant="secondary">Map {data.version}</Badge>
          <Badge variant="outline">Generated {new Date(data.generatedAt).toLocaleString()}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>First 10 Minutes</CardTitle>
          <CardDescription>Do these in order to enter the capability loop immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-6">
            {data.firstTenMinutes.map((step, idx) => (
              <li key={`${idx}-${step}`}>{step}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {data.layers.map((layer) => (
          <Card key={layer.id}>
            <CardHeader>
              <CardTitle>{layer.title}</CardTitle>
              <CardDescription>{layer.purpose}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-6">
                {layer.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Capability Tracks</CardTitle>
          <CardDescription>Pick one primary track, then branch when consistency is stable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.tracks.map((track) => (
            <div key={track.id} className="space-y-2">
              <div>
                <h3 className="font-medium">{track.name}</h3>
                <p className="text-sm text-muted-foreground">{track.objective}</p>
              </div>
              <ul className="list-disc space-y-1 pl-6 text-sm">
                {track.milestones.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <Separator />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reward Loop</CardTitle>
          <CardDescription>Every reward must map to verified value, not vanity activity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="font-medium">Contribute:</span> {data.rewardLoop.contribute}</p>
          <p><span className="font-medium">Validate:</span> {data.rewardLoop.validate}</p>
          <p><span className="font-medium">Promote:</span> {data.rewardLoop.promote}</p>
          <p><span className="font-medium">Reward:</span> {data.rewardLoop.reward}</p>
        </CardContent>
      </Card>
    </main>
  );
}
