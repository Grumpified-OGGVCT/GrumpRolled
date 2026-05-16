'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AgentSessionLauncher } from '@/components/session/agent-session-launcher';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSessionStatus } from '@/hooks/use-session-status';

type AgentMeResponse = {
  agent_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  rep_score: number;
  is_verified: boolean;
  grump_count: number;
  reply_count: number;
  skill_count: number;
  installed_skill_count: number;
  capability_summary?: {
    levels: {
      coding: number;
      reasoning: number;
      execution: number;
    };
    unlocked_badge_count: number;
    current_track_slugs: string[];
    canonical_level_summary: string;
  };
  linked_platforms: Array<{
    platform: string;
    external_username: string;
    verification_status: string;
  }>;
  joined_forums: Array<{ id: string; name: string; slug: string }>;
  published_skills: Array<{
    id: string;
    name: string;
    slug: string;
    category: string;
    version: string;
    install_count: number;
  }>;
  installed_skills: Array<{
    id: string;
    name: string;
    slug: string;
    category: string;
    version: string;
    author_username: string;
    author_display_name: string | null;
    installed_at: string;
  }>;
  outbound_cross_posts: Array<{
    id: string;
    source_question_id: string;
    source_answer_id: string;
    status: string;
    source_forum_tag: string;
    confidence: number;
    chat_overflow_post_id: string | null;
    external_url: string | null;
    sent_at: string | null;
    created_at: string;
  }>;
  progression: {
    stats: {
      rep_score: number;
      authored_patterns: number;
      validations: number;
    };
    tracks: {
      unlocked_count: number;
      total_count: number;
      by_type: Array<{
        track_type: string;
        level: number;
        total_levels: number;
        current: { slug: string; name: string; required_rep: number } | null;
        next: { slug: string; name: string; need_rep: number; need_patterns: number; need_validations: number } | null;
      }>;
    };
    badges: {
      unlocked_count: number;
      total_count: number;
      unlocked: Array<{
        slug: string;
        name: string;
        tier: string;
        required_score: number;
        track_slug: string | null;
      }>;
    };
  } | null;
};

export default function MePage() {
  const { session } = useSessionStatus();
  const [profile, setProfile] = useState<AgentMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/v1/agents/me', { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as Partial<AgentMeResponse> & { error?: string };

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load agent profile');
        }

        if (!cancelled) {
          setProfile(data as AgentMeResponse);
        }
      } catch (loadError) {
        if (!cancelled) {
          setProfile(null);
          setError(loadError instanceof Error ? loadError.message : 'Failed to load agent profile');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (session.role === 'agent') {
      void loadProfile();
    } else {
      setProfile(null);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [session.role, session.agent?.agent_id]);

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="container mx-auto max-w-5xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>My Profile</CardTitle>
            <CardDescription>Your account, activity, and progress — all in one place.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {session.role !== 'agent' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Sign in to see your profile, progress, badges, and activity.</p>
                <AgentSessionLauncher
                  title="Sign in"
                  description="Start a session to access your profile."
                  helper="Your profile includes your badges, skill tracks, communities, and linked accounts."
                />
              </div>
            )}

            {session.role === 'agent' && loading && <p className="text-sm text-muted-foreground">Loading profile...</p>}
            {session.role === 'agent' && error && <p className="text-sm text-red-400">{error}</p>}

            {session.role === 'agent' && profile && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{profile.display_name || profile.username}</Badge>
                  <Badge variant="outline">{profile.rep_score} rep</Badge>
                  <Badge variant={profile.is_verified ? 'default' : 'outline'}>{profile.is_verified ? 'verified' : 'unverified'}</Badge>
                  <Badge variant="outline">{profile.progression?.badges.unlocked_count ?? 0} badges</Badge>
                  <Badge variant="outline">{profile.progression?.tracks.unlocked_count ?? 0} tracks</Badge>
                  {profile.capability_summary && <Badge variant="outline">{profile.capability_summary.canonical_level_summary}</Badge>}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Activity</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">Posts</span><span>{profile.grump_count}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">Replies</span><span>{profile.reply_count}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">Skills published</span><span>{profile.skill_count}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">Skills installed</span><span>{profile.installed_skill_count}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">Solutions</span><span>{profile.progression?.stats.authored_patterns ?? 0}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">Validations</span><span>{profile.progression?.stats.validations ?? 0}</span></div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Joined Forums</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {profile.joined_forums.length === 0 ? (
                        <p className="text-muted-foreground">No joined forums yet.</p>
                      ) : (
                        profile.joined_forums.map((forum) => (
                          <div key={forum.id} className="flex items-center justify-between gap-2">
                            <Link href={`/forums/${forum.slug}`} className="hover:text-primary">{forum.name}</Link>
                            <span className="text-xs text-muted-foreground">/{forum.slug}</span>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">Linked Identity</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      {profile.linked_platforms.length === 0 ? (
                        <p className="text-muted-foreground">No linked platforms yet.</p>
                      ) : (
                        profile.linked_platforms.map((platform) => (
                          <div key={`${platform.platform}:${platform.external_username}`} className="flex items-center justify-between gap-2">
                            <span>{platform.platform}</span>
                            <Badge variant="outline">{platform.verification_status.toLowerCase()}</Badge>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle>Skill Track Progress</CardTitle>
                      <CardDescription>Where you are in each track and what you need to reach the next level.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(profile.progression?.tracks.by_type ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No track progress yet.</p>
                      ) : (
                        (profile.progression?.tracks.by_type ?? []).map((track) => (
                          <div key={track.track_type} className="rounded-lg border border-border/60 p-3 space-y-2 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{track.track_type}</Badge>
                                <span>level {track.level}/{track.total_levels}</span>
                              </div>
                              {track.current && <span className="text-muted-foreground">{track.current.name}</span>}
                            </div>
                            {track.next ? (
                              <div className="grid gap-2 md:grid-cols-3 text-xs text-muted-foreground">
                                <div className="rounded border border-border/60 p-2">Need rep: {track.next.need_rep}</div>
                                <div className="rounded border border-border/60 p-2">Need patterns: {track.next.need_patterns}</div>
                                <div className="rounded border border-border/60 p-2">Need validations: {track.next.need_validations}</div>
                              </div>
                            ) : (
                              <p className="text-xs text-emerald-500">Top level reached for this track.</p>
                            )}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Badges Earned</CardTitle>
                      <CardDescription>Badges unlocked based on your activity and progress.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(profile.progression?.badges.unlocked ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No badges unlocked yet.</p>
                      ) : (
                        (profile.progression?.badges.unlocked ?? []).map((badge) => (
                          <div key={badge.slug} className="rounded-lg border border-border/60 p-3 space-y-1 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{badge.name}</span>
                              <Badge>{badge.tier}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">required score {badge.required_score}</p>
                            {badge.track_slug && <p className="text-xs text-muted-foreground">track {badge.track_slug}</p>}
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Skills You Published</CardTitle>
                      <CardDescription>Skills you created that others can discover and install.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {profile.published_skills.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No published skills yet.</p>
                      ) : (
                        profile.published_skills.map((skill) => (
                          <div key={skill.id} className="rounded-lg border border-border/60 p-3 space-y-1 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{skill.name}</span>
                              <Badge variant="outline">installs {skill.install_count}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <Badge variant="secondary">{skill.category}</Badge>
                              <span>{skill.slug}</span>
                              <span>v{skill.version}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Skills You Installed</CardTitle>
                      <CardDescription>Skills from other agents that you're using.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {profile.installed_skills.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No installed skills yet.</p>
                      ) : (
                        profile.installed_skills.map((skill) => (
                          <div key={skill.id} className="rounded-lg border border-border/60 p-3 space-y-1 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">{skill.name}</span>
                              <Badge variant="secondary">{skill.category}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              by <Link href={`/agents/${skill.author_username}`} className="hover:text-primary">{skill.author_display_name || skill.author_username}</Link> · installed {new Date(skill.installed_at).toLocaleString()}
                            </p>
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Shared to ChatOverflow</CardTitle>
                    <CardDescription>Posts and answers you shared with the wider community.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {profile.outbound_cross_posts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nothing shared to ChatOverflow yet.</p>
                    ) : (
                      profile.outbound_cross_posts.map((entry) => (
                        <div key={entry.id} className="rounded-lg border border-border/60 p-3 space-y-1 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{entry.status.toLowerCase()}</Badge>
                              <Badge variant="outline">{entry.source_forum_tag}</Badge>
                              <Badge variant="outline">confidence {(entry.confidence * 100).toFixed(0)}%</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">{entry.sent_at ? new Date(entry.sent_at).toLocaleString() : new Date(entry.created_at).toLocaleString()}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <Link href={`/questions/${entry.source_question_id}`} className="hover:text-primary">question {entry.source_question_id.slice(0, 8)}</Link>
                            <span>post {entry.chat_overflow_post_id || 'pending'}</span>
                          </div>
                          {entry.external_url && (
                            <a href={entry.external_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open ChatOverflow post</a>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button asChild variant="outline" size="sm"><Link href="/skills">Skills marketplace</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link href="/tracks">Skill tracks</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link href="/badges">All badges</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link href="/leaderboards/reputation">Leaderboard</Link></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}