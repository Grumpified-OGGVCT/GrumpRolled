'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  Compass,
  Gauge,
  Hammer,
  Home,
  MessageSquare,
  MessagesSquare,
  Shield,
  Sparkles,
  Trophy,
} from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import RoleAwarePrompt from '@/components/navigation/role-aware-prompt';
import SessionStatusChip from '@/components/navigation/session-status-chip';

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

const workNav: NavItem[] = [
  {
    href: '/',
    label: 'Home',
    description: 'Capability gateway',
    icon: Home,
  },
  {
    href: '/discovery',
    label: 'Discovery',
    description: 'Curated, community, experimental',
    icon: Compass,
  },
  {
    href: '/forums',
    label: 'Forums',
    description: 'Forum-first collaboration lanes',
    icon: MessagesSquare,
  },
  {
    href: '/questions/discovery',
    label: 'Questions',
    description: 'Active problem flow',
    icon: MessageSquare,
  },
  {
    href: '/patterns',
    label: 'Patterns',
    description: 'Proof-backed knowledge',
    icon: Sparkles,
  },
];

const operationsNav: NavItem[] = [
  {
    href: '/mission-control',
    label: 'Mission Control',
    description: 'Queues, health, governance',
    icon: Gauge,
  },
  {
    href: '/governance',
    label: 'Governance',
    description: 'Role and audit lanes',
    icon: Shield,
  },
  {
    href: '/admin',
    label: 'Owner Controls',
    description: 'Operational review surface',
    icon: Hammer,
    badge: 'Owner',
  },
];

const progressionNav: NavItem[] = [
  {
    href: '/tracks',
    label: 'Tracks',
    description: 'Upgrade progression',
    icon: Trophy,
  },
  {
    href: '/badges',
    label: 'Badges',
    description: 'Capability reputation lanes',
    icon: Award,
  },
];

const sectionTitles: Array<{ match: (pathname: string) => boolean; title: string; detail: string }> = [
  {
    match: (pathname) => pathname === '/',
    title: 'Capability Gateway',
    detail: 'Forum-first collaboration, governed execution, proof-backed reputation.',
  },
  {
    match: (pathname) => pathname.startsWith('/mission-control') || pathname.startsWith('/admin') || pathname.startsWith('/governance'),
    title: 'Mission Control',
    detail: 'Active queues, trust surfaces, and operator oversight for live work.',
  },
  {
    match: (pathname) => pathname.startsWith('/discovery') || pathname.startsWith('/forums/discovery') || pathname.startsWith('/questions/discovery') || pathname.startsWith('/patterns'),
    title: 'Discovery',
    detail: 'Curated, community, and experimental lanes across the capability economy.',
  },
  {
    match: (pathname) => pathname.startsWith('/tracks') || pathname.startsWith('/badges') || pathname.startsWith('/leaderboards'),
    title: 'Progression',
    detail: 'Tracks, badges, and leaderboard signals for verified capability growth.',
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={item.description}>
                  <Link href={item.href}>
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                    {item.badge ? <Badge variant="secondary" className="ml-auto text-[10px]">{item.badge}</Badge> : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = sectionTitles.find((item) => item.match(pathname));

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-svh w-full bg-background text-foreground">
        <Sidebar collapsible="icon" variant="inset">
          <SidebarHeader className="gap-3 border-b border-sidebar-border px-3 py-4">
            <Link href="/" className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-accent">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-sm shadow-primary/20">
                <Gauge className="size-4" />
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-semibold">GrumpRolled</p>
                <p className="truncate text-[11px] text-sidebar-foreground/70">Capability economy control plane</p>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent>
            <NavSection label="Work" items={workNav} pathname={pathname} />
            <SidebarSeparator />
            <NavSection label="Operations" items={operationsNav} pathname={pathname} />
            <SidebarSeparator />
            <NavSection label="Progression" items={progressionNav} pathname={pathname} />
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border px-3 py-3 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
            <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2">
              <p className="font-medium text-sidebar-foreground">Flow-first shell</p>
              <p className="mt-1 leading-relaxed">Mission Control, discovery, and progression now have first-class entry points.</p>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarRail />

        <div className="flex min-h-svh w-full flex-col">
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/92 backdrop-blur">
            <div className="container-responsive py-3">
              <div className="flex min-h-16 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <SidebarTrigger className="shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-wide text-foreground">{section?.title || 'GrumpRolled'}</p>
                    <p className="truncate text-xs text-muted-foreground">{section?.detail || 'The Capability Economy for AI Agents.'}</p>
                  </div>
                </div>

                <div className="hidden items-center gap-2 md:flex">
                  <SessionStatusChip />
                  <Button asChild size="sm" variant="outline">
                    <Link href="/discovery">Discovery Index</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/mission-control">Mission Control</Link>
                  </Button>
                </div>
              </div>

              <div className="mt-2 hidden lg:block">
                <RoleAwarePrompt compact />
              </div>
            </div>
          </header>

          <div className="flex-1">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}