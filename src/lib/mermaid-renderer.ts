// Extracted and adapted from grumpified_discussion_forum_by_GRUMPIFIED_OGGVCT
// Mermaid diagram detection, safe rendering, and Zoom/Save/Pop-out controls

export const VALID_MERMAID_TYPES = [
  'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'erDiagram', 'journey', 'gantt', 'pie', 'gitGraph', 'mindmap', 'timeline',
  'quadrantChart', 'xychart', 'block', 'packet', 'architecture',
] as const;

export function isValidMermaidDiagram(code: string): boolean {
  const trimmed = code.trim().toLowerCase();
  return VALID_MERMAID_TYPES.some((t) => trimmed.startsWith(t.toLowerCase()));
}

// Convert ```mermaid ... ``` blocks to interactive container HTML
// Safe: preserves non-mermaid fenced code blocks as plain text
export function convertMermaidMarkdown(text: string): string {
  return text.replace(/```mermaid([\s\S]*?)```/g, (_match, diagramCode: string) => {
    const code = diagramCode.trim();
    if (!isValidMermaidDiagram(code)) {
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
    const escaped = escapeHtml(code);
    return `
<div class="mermaid-container" data-diagram="${escaped}">
  <div class="mermaid">${code}</div>
  <div class="mermaid-controls">
    <button class="mermaid-btn zoom-btn" type="button" title="Zoom">Zoom</button>
    <button class="mermaid-btn save-btn" type="button" title="Save as SVG">Save</button>
    <button class="mermaid-btn popout-btn" type="button" title="Pop Out">Pop Out</button>
  </div>
</div>`;
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Client-side event handlers (attach once per page) ───────────────────────
// Call this in a useEffect after rendering mermaid content.

export function attachMermaidControls(container: HTMLElement): void {
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const mermaidContainer = target.closest('.mermaid-container') as HTMLElement | null;
    if (!mermaidContainer) return;

    const svgEl = mermaidContainer.querySelector('svg');

    if (target.classList.contains('zoom-btn') && svgEl) {
      const current = svgEl.style.transform;
      svgEl.style.transform = current === 'scale(1.5)' ? 'scale(1)' : 'scale(1.5)';
      svgEl.style.transition = 'transform 0.2s ease';
    }

    if (target.classList.contains('save-btn') && svgEl) {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mermaid_chart.svg';
      a.click();
      URL.revokeObjectURL(url);
    }

    if (target.classList.contains('popout-btn') && svgEl) {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const win = window.open('', '_blank', 'width=900,height=700');
      if (win) {
        win.document.write(`<!DOCTYPE html>
<html><head><title>Mermaid Chart</title>
<style>body{background:#0f172a;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}svg{max-width:100%;height:auto}</style>
</head><body>${svgData}</body></html>`);
        win.document.close();
      }
    }
  });
}

// ─── Safe mermaid init helper ─────────────────────────────────────────────────
// Call this client-side after mounting mermaid content.

export async function renderMermaidDiagrams(container: HTMLElement): Promise<void> {
  if (typeof window === 'undefined') return;
  const mermaid = (window as Window & {
    mermaid?: {
      init: (config: unknown, nodes: Element | NodeListOf<Element> | HTMLElement) => Promise<void> | void;
    };
  }).mermaid;
  if (!mermaid) return;
  const elements = container.querySelectorAll<HTMLElement>('.mermaid');
  for (const el of elements) {
    const code = el.textContent || '';
    if (!isValidMermaidDiagram(code)) continue;
    try {
      await mermaid.init(undefined, el);
    } catch (err) {
      console.error('Mermaid init error:', err);
    }
  }
}
