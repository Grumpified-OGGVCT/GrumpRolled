'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

const COLORS = [
  '#dc2626','#ea580c','#d97706','#ca8a04','#65a30d',
  '#16a34a','#059669','#0891b2','#0284c7','#2563eb',
  '#4f46e5','#7c3aed','#9333ea','#c026d3','#db2777',
  '#e11d48','#ffffff','#9ca3af','#374151','#000000',
];

const EMOJIS = [
  '😀','😂','🤣','😊','😍','🤔','😎','🤯','😤','😡',
  '🔥','💯','👍','👎','💪','🤘','✌️','👏','🙌','🎉',
  '💻','⚡','🚀','🎯','💡','⚙️','🔧','🛠️','📱','💾',
];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Start writing...',
  minHeight = '200px',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Sync external value into contentEditable only on mount / when value
  // changes externally (not on every keystroke to avoid cursor jumps)
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const updateContent = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const format = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    editorRef.current?.focus();
    updateContent();
  }, [updateContent]);

  const insertLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) format('createLink', url);
  };

  const insertImage = () => {
    const url = window.prompt('Enter image URL:');
    if (url) format('insertImage', url);
  };

  const insertCodeBlock = () => {
    const code = window.prompt('Paste code:');
    if (code) {
      const escaped = code.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      format('insertHTML', `<pre class="code-block"><code>${escaped}</code></pre>`);
    }
  };

  const closeDropdowns = () => {
    setShowEmojiPicker(false);
    setShowColorPicker(false);
  };

  return (
    <div className="rich-editor-wrapper border border-gray-700 rounded-lg overflow-hidden bg-gray-900">
      {/* Toolbar */}
      <div className="rich-editor-toolbar flex flex-wrap gap-1 p-2 border-b border-gray-700 bg-gray-800">

        {/* Basic formatting */}
        <ToolbarGroup>
          <ToolBtn title="Bold"          onClick={() => format('bold')}><strong>B</strong></ToolBtn>
          <ToolBtn title="Italic"        onClick={() => format('italic')}><em>I</em></ToolBtn>
          <ToolBtn title="Underline"     onClick={() => format('underline')}><u>U</u></ToolBtn>
          <ToolBtn title="Strikethrough" onClick={() => format('strikeThrough')}><s>S</s></ToolBtn>
        </ToolbarGroup>

        {/* Headers */}
        <ToolbarGroup>
          {(['h1','h2','h3','p'] as const).map((tag) => (
            <ToolBtn key={tag} title={`Format as ${tag.toUpperCase()}`} onClick={() => format('formatBlock', tag)}>
              {tag.toUpperCase()}
            </ToolBtn>
          ))}
        </ToolbarGroup>

        {/* Color picker */}
        <ToolbarGroup>
          <div className="relative">
            <ToolBtn title="Text colour" onClick={() => { setShowColorPicker(v => !v); setShowEmojiPicker(false); }}>
              🎨
            </ToolBtn>
            {showColorPicker && (
              <div className="color-picker-dropdown absolute top-full left-0 mt-1 z-50 bg-gray-800 border border-gray-600 rounded p-2 grid grid-cols-5 gap-1 shadow-xl">
                {COLORS.map((c) => (
                  <button
                    key={c} type="button"
                    className="w-5 h-5 rounded-sm border border-gray-600 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                    title={c}
                    onClick={() => { format('foreColor', c); closeDropdowns(); }}
                  />
                ))}
              </div>
            )}
          </div>
        </ToolbarGroup>

        {/* Lists */}
        <ToolbarGroup>
          <ToolBtn title="Bullet list"    onClick={() => format('insertUnorderedList')}>• List</ToolBtn>
          <ToolBtn title="Numbered list"  onClick={() => format('insertOrderedList')}>1. List</ToolBtn>
        </ToolbarGroup>

        {/* Alignment */}
        <ToolbarGroup>
          <ToolBtn title="Align left"   onClick={() => format('justifyLeft')}>⬅</ToolBtn>
          <ToolBtn title="Align center" onClick={() => format('justifyCenter')}>↔</ToolBtn>
          <ToolBtn title="Align right"  onClick={() => format('justifyRight')}>➡</ToolBtn>
        </ToolbarGroup>

        {/* Insert */}
        <ToolbarGroup>
          <ToolBtn title="Insert link"       onClick={insertLink}>🔗</ToolBtn>
          <ToolBtn title="Insert image"      onClick={insertImage}>🖼️</ToolBtn>
          <ToolBtn title="Insert code block" onClick={insertCodeBlock}>&lt;/&gt;</ToolBtn>
        </ToolbarGroup>

        {/* Emoji picker */}
        <ToolbarGroup>
          <div className="relative">
            <ToolBtn title="Insert emoji" onClick={() => { setShowEmojiPicker(v => !v); setShowColorPicker(false); }}>
              😀
            </ToolBtn>
            {showEmojiPicker && (
              <div className="emoji-picker-dropdown absolute top-full left-0 mt-1 z-50 bg-gray-800 border border-gray-600 rounded p-2 grid grid-cols-6 gap-1 shadow-xl">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji} type="button"
                    className="text-lg hover:bg-gray-700 rounded p-0.5 transition-colors"
                    onClick={() => { format('insertText', emoji); closeDropdowns(); }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ToolbarGroup>

        {/* Brand effects */}
        <ToolbarGroup>
          <ToolBtn title="Glow effect"  onClick={() => format('insertHTML', '<span class="text-glow">Glowing Text</span>')}>✨</ToolBtn>
          <ToolBtn title="Blink effect" onClick={() => format('insertHTML', '<span class="blink">⚡ Blinking</span>')}>⚡</ToolBtn>
        </ToolbarGroup>
      </div>

      {/* Content-editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="rich-editor-content p-4 text-gray-100 focus:outline-none"
        style={{ minHeight }}
        onInput={updateContent}
        onBlur={updateContent}
        data-placeholder={placeholder}
        onClick={closeDropdowns}
      />

      <style>{`
        .rich-editor-content:empty:before {
          content: attr(data-placeholder);
          color: #6b7280;
          pointer-events: none;
        }
        .rich-editor-content pre.code-block {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 6px;
          padding: 12px;
          overflow-x: auto;
          font-family: ui-monospace, monospace;
          font-size: 0.875rem;
          color: #e2e8f0;
        }
        .text-glow {
          text-shadow: 0 0 10px currentColor;
        }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .blink { animation: blink 1s step-start infinite; }
      `}</style>
    </div>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-0.5 items-center border-r border-gray-700 pr-1 last:border-0">
      {children}
    </div>
  );
}

function ToolBtn({
  children, title, onClick,
}: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="px-1.5 py-1 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded transition-colors min-w-[1.75rem] text-center"
    >
      {children}
    </button>
  );
}
