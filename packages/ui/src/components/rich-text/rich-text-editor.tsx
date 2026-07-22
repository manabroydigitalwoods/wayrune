import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  Paperclip,
  Redo2,
  Undo2,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { sanitizeRichHtml } from '../../lib/sanitize-html';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type UploadedImage = { id: string; contentUrl: string };

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Tighter toolbar + shorter editor for inline timeline edits */
  compact?: boolean;
  /**
   * Editor surface height. `composer` ≈ 160–220px default for activity logs;
   * `compact` stays short for inline edits.
   */
  size?: 'default' | 'composer' | 'compact';
  /**
   * `basic` — bold/italic/underline/strike, lists, link, undo/redo.
   * `full` — same basics (reserved for future extras).
   * `minimal` — alias of `basic` (back-compat).
   */
  toolbar?: 'full' | 'basic' | 'minimal';
  /** Upload inline image (paste / drop / optional); return content URL for img src */
  onUploadImage?: (file: File) => Promise<UploadedImage>;
  /** Paperclip attachments (not inlined) */
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
  maxAttachments?: number;
  /** Document ids created via paste/drop so callers can reassociate */
  onInlineDocumentIdsChange?: (ids: string[]) => void;
};

function ToolbarButton({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className={cn(
        'size-6 shrink-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground [&_svg]:size-3.5',
        active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden
      className="mx-0.5 h-4 w-px shrink-0 self-center bg-border/70"
    />
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something…',
  className,
  disabled,
  compact,
  size,
  toolbar: _toolbar = 'full',
  onUploadImage,
  attachments = [],
  onAttachmentsChange,
  maxAttachments = 5,
  onInlineDocumentIdsChange,
}: RichTextEditorProps) {
  const inlineIdsRef = useRef<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suppressSync = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const surface =
    size ?? (compact ? 'compact' : 'default');
  const editorHeightClass =
    surface === 'composer'
      ? 'min-h-[180px] max-h-[280px] px-3'
      : surface === 'compact'
        ? 'min-h-[88px] max-h-[220px]'
        : 'min-h-[120px] max-h-[280px] px-3';

  const pushInlineId = useCallback(
    (id: string) => {
      if (inlineIdsRef.current.includes(id)) return;
      inlineIdsRef.current = [...inlineIdsRef.current, id];
      onInlineDocumentIdsChange?.(inlineIdsRef.current);
    },
    [onInlineDocumentIdsChange],
  );

  const uploadInline = useCallback(
    async (file: File) => {
      if (!onUploadImage) return null;
      if (!IMAGE_TYPES.has(file.type)) {
        throw new Error('Images must be PNG, JPEG, WebP, or GIF');
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error('Images must be 5MB or smaller');
      }
      setUploading(true);
      try {
        const doc = await onUploadImage(file);
        pushInlineId(doc.id);
        return doc;
      } finally {
        setUploading(false);
      }
    },
    [onUploadImage, pushInlineId],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Image.configure({ allowBase64: false }),
    ],
    content: value || '',
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          'overflow-y-auto px-2.5 py-2 text-sm outline-none',
          editorHeightClass,
          'prose prose-sm max-w-none [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_img]:my-2 [&_img]:max-h-48 [&_img]:rounded-md',
        ),
        'data-placeholder': placeholder,
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items || !onUploadImage) return false;
        const files: File[] = [];
        for (const item of Array.from(items)) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
        if (!files.length) return false;
        event.preventDefault();
        void (async () => {
          for (const file of files) {
            try {
              const doc = await uploadInline(file);
              if (doc) {
                editorRef.current
                  ?.chain()
                  .focus()
                  .setImage({ src: doc.contentUrl, alt: file.name })
                  .run();
              }
            } catch {
              /* caller toasts */
            }
          }
        })();
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith('image/'),
        );
        if (!files.length || !onUploadImage) return false;
        event.preventDefault();
        void (async () => {
          for (const file of files) {
            try {
              const doc = await uploadInline(file);
              if (doc) {
                editorRef.current
                  ?.chain()
                  .focus()
                  .setImage({ src: doc.contentUrl, alt: file.name })
                  .run();
              }
            } catch {
              /* ignore */
            }
          }
        })();
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      suppressSync.current = true;
      onChange(sanitizeRichHtml(ed.getHTML()));
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (suppressSync.current) {
      suppressSync.current = false;
      return;
    }
    const current = editor.getHTML();
    const next = value?.trim() ? value : '';
    const currentNormalized = current === '<p></p>' ? '' : current;
    if (next !== currentNormalized) {
      editor.commands.setContent(next || '<p></p>', { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const setLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', prev || 'https://');
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const addAttachments = (files: FileList | null) => {
    if (!files || !onAttachmentsChange) return;
    const next = [...attachments];
    for (const file of Array.from(files)) {
      if (next.length >= maxAttachments) break;
      if (file.size > MAX_ATTACHMENT_BYTES) continue;
      next.push(file);
    }
    onAttachmentsChange(next.slice(0, maxAttachments));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    if (!onAttachmentsChange) return;
    onAttachmentsChange(attachments.filter((_, i) => i !== index));
  };

  return (
    <div className={cn('overflow-hidden rounded-xl border border-border/60 glass', className)}>
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex flex-wrap items-center gap-px border-b border-border/60 bg-muted/25 px-0.5 py-0.5 dark:bg-muted/15"
      >
        <ToolbarButton
          label="Undo"
          disabled={disabled || !editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton
          label="Redo"
          disabled={disabled || !editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Bold"
          disabled={disabled || !editor}
          active={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          disabled={disabled || !editor}
          active={editor?.isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          disabled={disabled || !editor}
          active={editor?.isActive('underline')}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          disabled={disabled || !editor}
          active={editor?.isActive('strike')}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <Strikethrough />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Bullet list"
          disabled={disabled || !editor}
          active={editor?.isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          disabled={disabled || !editor}
          active={editor?.isActive('orderedList')}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton
          label="Link"
          disabled={disabled || !editor}
          active={editor?.isActive('link')}
          onClick={setLink}
        >
          <Link2 />
        </ToolbarButton>
        {onAttachmentsChange ? (
          <>
            <ToolbarDivider />
            <ToolbarButton
              label="Attach files"
              disabled={disabled || attachments.length >= maxAttachments}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </ToolbarButton>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => addAttachments(e.target.files)}
            />
          </>
        ) : null}
        {uploading ? (
          <span className="ml-1.5 text-[length:var(--control-text-sm)] text-muted-foreground">
            Uploading…
          </span>
        ) : null}
      </div>
      <EditorContent editor={editor} />
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 border-t border-border/60 px-2 py-1.5">
          {attachments.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/60 px-1.5 py-0.5 text-[length:var(--control-text-sm)] text-foreground"
            >
              <Paperclip className="size-3 text-muted-foreground" />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => removeAttachment(i)}
                aria-label={`Remove ${file.name}`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { MAX_ATTACHMENT_BYTES, MAX_IMAGE_BYTES, IMAGE_TYPES };
