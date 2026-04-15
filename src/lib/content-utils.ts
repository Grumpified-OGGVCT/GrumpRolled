// Extracted and adapted from grumpified_blog_by_GRUMPIFIED_OGGVCT
// Slug generation, reading time, brand templates, and category constants

// ─── Slug ─────────────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Reading time ──────────────────────────────────────────────────────────────

export function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const wordCount = content
    .replace(/<[^>]*>/g, '') // strip HTML tags
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

// ─── Brand categories (from blog legacy — seed into forum tags) ───────────────

export const BRAND_CATEGORIES = [
  { slug: 'rage-coding',      label: 'Rage Coding',      emoji: '🔥', repWeight: 1.5 },
  { slug: 'ai-technology',    label: 'AI & Technology',   emoji: '🤖', repWeight: 1.3 },
  { slug: 'critical-thinking',label: 'Critical Thinking', emoji: '🧠', repWeight: 1.2 },
  { slug: 'rants-reality',    label: 'Rants & Reality',   emoji: '😤', repWeight: 1.0 },
  { slug: 'viral-content',    label: 'Viral Content',     emoji: '📈', repWeight: 0.8 },
] as const;

export type BrandCategorySlug = (typeof BRAND_CATEGORIES)[number]['slug'];

// ─── Quick-insert post templates (ported from blog legacy toolbar) ────────────

export const POST_TEMPLATES: Record<string, { label: string; emoji: string; html: string }> = {
  'rage-intro': {
    label: 'Rage Intro',
    emoji: '🔥',
    html: '<h2>🔥 Rage Alert! 🔥</h2><p>Buckle up, because we\'re about to dive into some serious grumpiness...</p>',
  },
  'code-block': {
    label: 'Code Block',
    emoji: '💻',
    html: '<pre><code>// Your rage-inducing code here\nconst problem = "why does this even exist?";\nconsole.log(problem);</code></pre>',
  },
  'hot-take': {
    label: 'Hot Take',
    emoji: '🌶️',
    html: '<blockquote>🌶️ <strong>Hot Take:</strong> [Your controversial opinion here]</blockquote>',
  },
  'grump-rating': {
    label: 'Grump Rating',
    emoji: '😤',
    html: '<div><p><strong>Grump Level:</strong> 😤😤😤😤😤 (5/5)</p><p><strong>Verdict:</strong> [Your verdict here]</p></div>',
  },
  'tldr': {
    label: 'TL;DR',
    emoji: '📋',
    html: '<p><strong>TL;DR:</strong> [Your one-liner summary here]</p>',
  },
  'warning': {
    label: 'Warning Box',
    emoji: '⚠️',
    html: '<div class="warning-box">⚠️ <strong>Warning:</strong> [Critical information goes here]</div>',
  },
};

// ─── Excerpt generation ────────────────────────────────────────────────────────

export function generateExcerpt(html: string, maxLength = 160): string {
  const text = html.replace(/<[^>]*>/g, '').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s+\S*$/, '') + '…';
}

// ─── SEO title fallback ────────────────────────────────────────────────────────

export function generateSeoTitle(title: string, siteName = 'GrumpRolled'): string {
  return `${title} | ${siteName}`;
}
