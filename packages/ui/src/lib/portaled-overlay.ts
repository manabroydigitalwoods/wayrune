/**
 * Portaled Radix/cmdk layers render under `document.body`, so a Dialog/Sheet
 * treats clicks on them as "outside". Ignore those so nested Combobox/Select/Menu work.
 */
export function isPortaledOverlayTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        '[data-radix-popper-content-wrapper]',
        '[data-radix-select-content]',
        '[data-radix-dropdown-menu-content]',
        '[data-radix-context-menu-content]',
        '[data-wayrune-portaled-overlay]',
        '[cmdk-root]',
        '[role="listbox"]',
      ].join(', '),
    ),
  );
}
