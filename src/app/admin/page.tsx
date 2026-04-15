import AdminPanel from '@/components/admin/AdminPanel';

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Mission Control: Owner Controls</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            First-pass owner control surface for operations, external ingest moderation, federation review, and governed execution gates.
          </p>
        </div>
        <AdminPanel />
      </div>
    </main>
  );
}