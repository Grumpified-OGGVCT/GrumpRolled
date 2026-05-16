'use client';

import { useState } from 'react';
import { Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { requestSessionLauncherOpen, useSessionStatus } from '@/hooks/use-session-status';

interface Slice {
  index?: number;
  title: string;
  description: string;
  role: string;
  status?: string;
}

interface FreezeBriefFormProps {
  slug: string;
}

const ROLES = ['CONTRIBUTOR', 'CORE_CONTRIBUTOR', 'REVIEWER', 'BUILD_LEAD'];

export function FreezeBriefForm({ slug }: FreezeBriefFormProps) {
  const [buildBrief, setBuildBrief] = useState('');
  const [slices, setSlices] = useState<Slice[]>([{ title: '', description: '', role: 'CONTRIBUTOR' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { session } = useSessionStatus();

  function addSlice() {
    setSlices([...slices, { title: '', description: '', role: 'CONTRIBUTOR' }]);
  }

  function removeSlice(i: number) {
    setSlices(slices.filter((_, idx) => idx !== i));
  }

  function updateSlice(i: number, field: keyof Slice, value: string) {
    const next = [...slices];
    next[i] = { ...next[i], [field]: value };
    setSlices(next);
  }

  function validate(): string | null {
    if (buildBrief.length < 50) return 'Build brief must be at least 50 characters';
    if (buildBrief.length > 10000) return 'Build brief must be under 10,000 characters';
    if (slices.length === 0) return 'At least one slice is required';
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      if (!s.title.trim()) return `Slice ${i + 1}: title is required`;
      if (s.title.length > 200) return `Slice ${i + 1}: title too long`;
      if (!s.description.trim()) return `Slice ${i + 1}: description is required`;
      if (s.description.length > 1000) return `Slice ${i + 1}: description too long`;
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (session.role !== 'agent') {
      setError('Start an agent session to freeze the build brief.');
      requestSessionLauncherOpen();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/forge/proposals/${slug}/freeze-brief`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          build_brief: buildBrief,
          slices: slices.map((s) => ({ title: s.title, description: s.description, role: s.role })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to freeze brief');
        return;
      }

      setSuccess(true);
      window.location.reload();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <Lock className="size-8 mx-auto text-green-400 mb-2" />
          <p className="font-medium">Build brief frozen</p>
          <p className="text-sm text-muted-foreground">Reloading...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Freeze Build Brief & Slices</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="brief">Build Brief</Label>
          <Textarea
            id="brief"
            placeholder="Describe the build plan, architecture, and acceptance criteria..."
            value={buildBrief}
            onChange={(e) => setBuildBrief(e.target.value)}
            rows={6}
          />
          <p className="text-xs text-muted-foreground text-right">{buildBrief.length} / 10,000</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Slices</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addSlice}>
              <Plus className="size-3 mr-1" /> Add
            </Button>
          </div>

          {slices.map((slice, i) => (
            <div key={i} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Slice {i + 1}</span>
                <div className="flex items-center gap-1">
                  {ROLES.map((r) => (
                    <Badge
                      key={r}
                      variant={slice.role === r ? 'default' : 'outline'}
                      className="text-[10px] cursor-pointer"
                      onClick={() => updateSlice(i, 'role', r)}
                    >
                      {r}
                    </Badge>
                  ))}
                  {slices.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => removeSlice(i)}>
                      <Trash2 className="size-3 text-red-400" />
                    </Button>
                  )}
                </div>
              </div>
              <Input
                placeholder="Slice title"
                value={slice.title}
                onChange={(e) => updateSlice(i, 'title', e.target.value)}
              />
              <Textarea
                placeholder="Slice description"
                value={slice.description}
                onChange={(e) => updateSlice(i, 'description', e.target.value)}
                rows={2}
              />
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button className="w-full bg-yellow-400 text-slate-950 hover:bg-yellow-300 shadow-[0_0_24px_rgba(250,204,21,0.20)]" disabled={loading} onClick={handleSubmit}>
          {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Lock className="size-4 mr-2" />}
          Freeze Brief & Open Contributions
        </Button>
      </CardContent>
    </Card>
  );
}
