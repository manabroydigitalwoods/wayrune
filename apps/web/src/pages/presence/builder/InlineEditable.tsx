import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type ElementType,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '@wayrune/ui';

function readText(el: HTMLElement | null) {
  return (el?.innerText ?? '').replace(/\u00a0/g, ' ');
}

/**
 * Click-to-edit text on the live canvas. When `enabled`, the field is contentEditable.
 * Emits `onChange` while typing so the inspector stays in sync; finalizes on blur / Enter.
 * Text is owned via the DOM while focused (no React children) so the caret does not jump.
 */
export function InlineEditable({
  value,
  enabled,
  multiline = false,
  as: Tag = 'span',
  className,
  style,
  placeholder,
  onChange,
  children,
}: {
  value: string;
  enabled: boolean;
  multiline?: boolean;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  onChange: (next: string) => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const display = value || placeholder || '';

  // Sync from props when not editing (inspector → canvas).
  useEffect(() => {
    if (editing) return;
    const el = ref.current;
    if (!el) return;
    if (el.textContent !== display) el.textContent = display;
  }, [display, editing, enabled]);

  if (!enabled) {
    if (!value && children == null) return null;
    return (
      <Tag className={className} style={style}>
        {children ?? value}
      </Tag>
    );
  }

  const emit = (raw: string, trimEnd: boolean) => {
    const next = trimEnd ? raw.trimEnd() : raw;
    if (next !== value) onChange(next);
  };

  const commit = () => {
    const next = readText(ref.current).trimEnd();
    setEditing(false);
    emit(next, false);
    if (ref.current && ref.current.textContent !== (next || placeholder || '')) {
      ref.current.textContent = next || placeholder || '';
    }
  };

  const onInput = (event: FormEvent) => {
    event.stopPropagation();
    setEditing(true);
    // Keep trailing spaces while typing so the caret does not snap back.
    emit(readText(ref.current), false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (!multiline && event.key === 'Enter') {
      event.preventDefault();
      ref.current?.blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (ref.current) ref.current.textContent = value || placeholder || '';
      setEditing(false);
      onChange(value);
      ref.current?.blur();
    }
  };

  return (
    <Tag
      ref={ref}
      className={cn(
        'presence-inline-edit',
        editing ? 'presence-inline-edit--active' : '',
        !value && placeholder ? 'presence-inline-edit--placeholder' : '',
        className,
      )}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline={multiline || undefined}
      data-placeholder={placeholder || undefined}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        setEditing(true);
      }}
      onFocus={(event: FocusEvent) => {
        event.stopPropagation();
        setEditing(true);
      }}
      onBlur={commit}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={(event: ClipboardEvent) => {
        if (multiline) return;
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain').replace(/\s+/g, ' ');
        document.execCommand('insertText', false, text);
      }}
    />
  );
}
