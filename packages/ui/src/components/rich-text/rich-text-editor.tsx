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
  List,
  ListOrdered,
  Link2,
  Paperclip,
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
      size="icon"
      variant="ghost"
      className={cn('size-7 rounded-md', active && 'bg-primary/10 text-primary')}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something…',
  className,
  disabled,
  compact,
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
          compact ? 'min-h-[88px] max-h-[220px]' : 'min-h-[120px] max-h-[280px] px-3',
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
    <div className={cn('overflow-hidden rounded-xl border glass', className)}>
      <div className="flex flex-wrap items-center gap-0 border-b border-white/40 px-1 py-0.5 dark:border-white/10">
        <ToolbarButton
          label="Bold"
          disabled={disabled || !editor}
          active={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          disabled={disabled || !editor}
          active={editor?.isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          disabled={disabled || !editor}
          active={editor?.isActive('underline')}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet list"
          disabled={disabled || !editor}
          active={editor?.isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          disabled={disabled || !editor}
          active={editor?.isActive('orderedList')}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton label="Link" disabled={disabled || !editor} onClick={setLink}>
          <Link2 className="size-3.5" />
        </ToolbarButton>
        {onAttachmentsChange ? (
          <>
            <ToolbarButton
              label="Attach files"
              disabled={disabled || attachments.length >= maxAttachments}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-3.5" />
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
          <span className="ml-1.5 text-[11px] text-muted-foreground">Uploading…</span>
        ) : null}
      </div>
      <EditorContent editor={editor} />
      {attachments.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 border-t border-white/40 px-2 py-1.5 dark:border-white/10">
          {attachments.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px]"
            >
              <Paperclip className="size-3" />
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
