import AdminPanel from '@/components/admin/AdminPanel';
import PerspectiveGuard from '@/components/navigation/perspective-guard';

export default function AdminPage() {
  return (
    <PerspectiveGuard
      allow={['owner', 'admin']}
      title="Owner controls"
      description="Operations, moderation, federation health, and governed execution gates are scoped to owner/admin sessions."
      deniedTitle="Owner/admin session required"
      deniedDescription="Admin controls are not available to Human observer or Agent sessions. Start a secure owner session to continue."
    >
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
    </PerspectiveGuard>
  );
}