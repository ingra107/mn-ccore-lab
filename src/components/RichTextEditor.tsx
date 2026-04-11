import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { useCallback, useEffect, useRef } from 'react'
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Heading2 } from 'lucide-react'

interface RichTextEditorProps {
  content: string | null
  plainTextFallback?: string | null
  onUpdate?: (json: string) => void
  readOnly?: boolean
  placeholder?: string
}

function parseContent(json: string | null, plainText?: string | null): any {
  if (json) {
    try { return JSON.parse(json) } catch { /* fall through */ }
  }
  if (plainText) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: plainText }] }] }
  }
  return { type: 'doc', content: [] }
}

export default function RichTextEditor({
  content,
  plainTextFallback,
  onUpdate,
  readOnly = false,
  placeholder = 'Add a description...',
}: RichTextEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { style: 'color: var(--teal); text-decoration: underline;' },
      }),
    ],
    content: parseContent(content, plainTextFallback),
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      if (onUpdate) {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
          onUpdate(JSON.stringify(ed.getJSON()))
        }, 500)
      }
    },
  })

  useEffect(() => {
    if (editor && readOnly) {
      const newContent = parseContent(content, plainTextFallback)
      if (JSON.stringify(editor.getJSON()) !== JSON.stringify(newContent)) {
        editor.commands.setContent(newContent)
      }
    }
  }, [content, plainTextFallback, readOnly, editor])

  const setLink = useCallback(() => {
    if (!editor) return
    const url = window.prompt('URL')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }, [editor])

  if (!editor) return null

  return (
    <div
      className="rich-text-editor"
      style={{
        border: readOnly ? 'none' : '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        minHeight: readOnly ? undefined : '80px',
      }}
    >
      {!readOnly && (
        <div
          className="flex items-center gap-0.5 px-2 py-1"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={14} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={14} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('heading')} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 size={14} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={14} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={14} />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('link')} onClick={setLink}>
            <LinkIcon size={14} />
          </ToolbarButton>
        </div>
      )}
      <EditorContent
        editor={editor}
        style={{
          padding: readOnly ? 0 : '8px 12px',
          fontSize: '13px',
          lineHeight: '1.6',
          color: 'var(--ink)',
        }}
      />
    </div>
  )
}

function ToolbarButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? 'var(--teal-emphasis)' : 'transparent',
        color: active ? 'var(--teal)' : 'var(--slate)',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        padding: '4px 6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {children}
    </button>
  )
}
