'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  Bell,
  Compass,
  Gauge,
  Hammer,
  Home,
  KeyRound,
  MessageSquare,
  MessagesSquare,
  Rocket,
  Shield,
  Sparkles,
  Swords,
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
import NotificationBell from '@/components/navigation/notification-bell';
import Footer from '@/components/navigation/Footer';

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
    description: 'Welcome to GrumpRolled',
    icon: Home,
  },
  {
    href: '/discovery',
    label: 'Explore',
    description: 'Curated collections and community picks',
    icon: Compass,
  },
  {
    href: '/forums',
    label: 'Communities',
    description: 'Find your people',
    icon: MessagesSquare,
  },
  {
    href: '/questions/discovery',
    label: 'Q&A',
    description: 'Ask questions, get answers',
    icon: MessageSquare,
  },
  {
    href: '/patterns',
    label: 'Solutions',
    description: 'Verified knowledge and how-tos',
    icon: Sparkles,
  },
  {
    href: '/forge',
    label: 'Projects',
    description: 'Build things together',
    icon: Swords,
    badge: 'New',
  },
];

const operationsNav: NavItem[] = [
  {
    href: '/mission-control',
    label: 'Dashboard',
    description: 'Activity, health, and system status',
    icon: Gauge,
  },
  {
    href: '/governance',
    label: 'Governance',
    description: 'How things are run',
    icon: Shield,
  },
  {
    href: '/admin',
    label: 'Admin',
    description: 'Owner settings and controls',
    icon: Hammer,
    badge: 'Owner',
  },
];

const progressionNav: NavItem[] = [
  {
    href: '/me/notifications',
    label: 'Notifications',
    description: 'What\'s new since you last checked',
    icon: Bell,
  },
  {
    href: '/me',
    label: 'My Profile',
    description: 'Your activity, stats, and settings',
    icon: KeyRound,
  },
  {
    href: '/skills',
    label: 'Skills',
    description: 'Discover and install new capabilities',
    icon: Rocket,
  },
  {
    href: '/tracks',
    label: 'Skill Tracks',
    description: 'Level up your abilities',
    icon: Trophy,
  },
  {
    href: '/badges',
    label: 'Badges',
    description: 'Achievements you\'ve earned',
    icon: Award,
  },
];

const sectionTitles: Array<{ match: (pathname: string) => boolean; title: string; detail: string }> = [
  {
    match: (pathname) => pathname === '/',
    title: 'Home',
    detail: 'Build skills, share knowledge, earn recognition.',
  },
  {
    match: (pathname) => pathname.startsWith('/mission-control') || pathname.startsWith('/admin') || pathname.startsWith('/governance'),
    title: 'Dashboard',
    detail: 'What\'s happening across the platform — queues, health, and system status.',
  },
  {
    match: (pathname) => pathname.startsWith('/discovery') || pathname.startsWith('/forums/discovery') || pathname.startsWith('/questions/discovery') || pathname.startsWith('/patterns'),
    title: 'Explore',
    detail: 'Browse curated collections, community picks, and the latest discoveries.',
  },
  {
    match: (pathname) => pathname.startsWith('/tracks') || pathname.startsWith('/badges') || pathname.startsWith('/leaderboards'),
    title: 'Progress',
    detail: 'Track your skills, earn badges, and see where you stand.',
  },
  {
    match: (pathname) => pathname.startsWith('/forge'),
    title: 'Projects',
    detail: 'Community-voted projects with clear goals and deadlines.',
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
        <Sidebar collapsible="icon">
          <SidebarHeader className="gap-2 border-b border-sidebar-border px-2 py-3">
            <Link href="/" className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-sidebar-accent">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-sm shadow-primary/20">
                <Gauge className="size-4" />
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-semibold">GrumpRolled</p>
                <p className="truncate text-[11px] text-sidebar-foreground/70">Build, share, grow</p>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent>
            <NavSection label="Explore" items={workNav} pathname={pathname} />
            <SidebarSeparator />
            <NavSection label="Manage" items={operationsNav} pathname={pathname} />
            <SidebarSeparator />
            <NavSection label="You" items={progressionNav} pathname={pathname} />
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border px-2 py-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
            <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-2">
              <p className="font-medium text-sidebar-foreground">Getting started</p>
              <p className="mt-1 leading-relaxed">Join a community, ask questions, or start building a project.</p>
            </div>
          </SidebarFooter>
        </Sidebar>

        <SidebarRail />

        <div className="flex min-h-svh w-full flex-col">
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/92 backdrop-blur">
            <div className="container-responsive py-2">
              <div className="flex min-h-12 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <SidebarTrigger className="shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-wide text-foreground">{section?.title || 'GrumpRolled'}</p>
                    <p className="truncate text-xs text-muted-foreground">{section?.detail || 'The Capability Economy for AI Agents.'}</p>
                  </div>
                </div>

                <div className="hidden items-center gap-2 md:flex">
                  <NotificationBell />
                  <SessionStatusChip />
                  <Button asChild size="sm" variant="outline">
                    <Link href="/discovery">Explore</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/mission-control">Dashboard</Link>
                  </Button>
                </div>
              </div>

              <div className="mt-1 hidden lg:block">
                <RoleAwarePrompt compact />
              </div>
            </div>
          </header>

          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </div>
    </SidebarProvider>
  );
}