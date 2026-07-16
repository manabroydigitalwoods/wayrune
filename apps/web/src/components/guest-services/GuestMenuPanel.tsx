import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  ImagePlus,
  Pencil,
  Plus,
  Settings2,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  Button,
  Card,
  Combobox,
  Input,
  PriceField,
  SimpleFormField as FormField,
  Textarea,
  toastError,
  toastSuccess,
  formatCurrency,
} from '@travel/ui';
import { api } from '../../api';
import { CAP } from '../../lib/capabilities';
import { reportError } from '../../lib/errors';
import { usePermissions } from '../../lib/permissions';
import { studioProcessImageFile } from './photoStudio';

export type GsOffering = {
  id: string;
  name: string;
  category: string;
  kind: string;
  unitPrice: number | string;
  currency: string;
  isActive: boolean;
  stopSell: boolean;
  description?: string | null;
  imageUrl?: string | null;
  prepMinutes?: number | null;
  dietaryLabels?: string[] | null;
  modifiersJson?: ModifierGroup[] | null;
  modifiers?: ModifierGroup[] | null;
};

type MenuListFilter =
  | 'all'
  | 'visible'
  | 'hidden'
  | 'popular'
  | 'special'
  | 'has_mod'
  | 'no_photo';

type MenuCategory = {
  key: string;
  label: string;
  emoji?: string | null;
  itemCount: number;
};

type MenuSpecial = {
  type:
    | 'chef'
    | 'festival'
    | 'seasonal'
    | 'limited'
    | 'weekend'
    | 'rainy'
    | 'winter'
    | 'today';
  title: string;
  offeringId: string;
  blurb?: string | null;
};

type MenuCombo = {
  id: string;
  name: string;
  offeringIds: string[];
  price: number;
  saveAmount?: number;
  currency?: string;
};

const SPECIAL_TYPES: MenuSpecial['type'][] = [
  'today',
  'chef',
  'festival',
  'seasonal',
  'limited',
  'weekend',
  'rainy',
  'winter',
];

const SPECIAL_TYPE_LABELS: Record<MenuSpecial['type'], string> = {
  today: 'Today',
  chef: 'Chef pick',
  festival: 'Festival',
  seasonal: 'Seasonal',
  limited: 'Limited',
  weekend: 'Weekend',
  rainy: 'Rainy day',
  winter: 'Winter',
};

/** Food & drink category icons (Unicode Food & Drink + related produce/seafood). */
const CATEGORY_EMOJIS = [
  // Produce
  '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈',
  '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🫒', '🥑', '🍆',
  '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅',
  '🍄', '🥜', '🫘', '🌰',
  // Bakery & dairy
  '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🧀', '🥚',
  '🧈', '🥛',
  // Meat & mains
  '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮',
  '🌯', '🫔', '🥙', '🧆', '🍳', '🥘', '🍲', '🫕', '🥣', '🥗',
  '🍿', '🧂', '🥫',
  // Asian & regional
  '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣',
  '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡',
  // Seafood
  '🦀', '🦞', '🦐', '🦑', '🦪', '🐟',
  // Sweets
  '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫',
  '🍬', '🍭', '🍮', '🍯',
  // Drinks
  '🍼', '☕', '🫖', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺',
  '🍻', '🥂', '🥃', '🥤', '🧋', '🧃', '🧉', '🧊',
  // Service
  '🍽️', '🍴', '🥄', '🥢', '🔪', '🫙',
];

type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: Array<{ id: string; name: string; priceDelta: number }>;
};

function FoodEmojiPicker({
  value,
  open,
  onOpenChange,
  onSelect,
  placement = 'bottom',
}: {
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string) => void;
  placement?: 'top' | 'bottom';
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        title={open ? 'Close icon picker' : 'Choose icon'}
        className="flex h-10 w-10 items-center justify-center border border-border bg-muted/30 text-lg transition hover:border-foreground"
        onClick={() => onOpenChange(!open)}
      >
        {value || '🍽️'}
      </button>
      {open ? (
        <div
          className={`absolute left-0 z-30 w-[17.5rem] border border-border bg-background p-2 shadow-lg ${
            placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          role="listbox"
          aria-label="Food category icons"
        >
          <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATEGORY_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                role="option"
                aria-selected={value === em}
                title={em}
                className={`flex h-8 w-8 items-center justify-center rounded-sm text-base ${
                  value === em ? 'bg-foreground text-background' : 'hover:bg-muted'
                }`}
                onClick={() => {
                  onSelect(em);
                  onOpenChange(false);
                }}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function slugKey(label: string) {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'other'
  );
}

export function GuestMenuPanel({
  assetId,
  offerings,
  onChanged,
}: {
  assetId: string;
  offerings: GsOffering[];
  onChanged: () => Promise<void>;
}) {
  const { hasAny } = usePermissions();
  const canWrite = hasAny(CAP.guestServicesWrite);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState('');
  /** Which emoji picker popover is open: category key, `'new'`, or null */
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [offName, setOffName] = useState('');
  const [offPrice, setOffPrice] = useState('');
  const [offDesc, setOffDesc] = useState('');
  const [offCategory, setOffCategory] = useState('');
  const [offImage, setOffImage] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [newCatEmoji, setNewCatEmoji] = useState('🍛');

  const [editId, setEditId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [modId, setModId] = useState<string | null>(null);
  const [modDraft, setModDraft] = useState<ModifierGroup[]>([]);

  const [specials, setSpecials] = useState<MenuSpecial[]>([]);
  const [combos, setCombos] = useState<MenuCombo[]>([]);
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [listFilter, setListFilter] = useState<MenuListFilter>('all');
  const [promoOpen, setPromoOpen] = useState(false);
  const [spTitle, setSpTitle] = useState('');
  const [spType, setSpType] = useState<MenuSpecial['type']>('today');
  const [spOfferingId, setSpOfferingId] = useState('');
  const [spBlurb, setSpBlurb] = useState('');
  const [cbName, setCbName] = useState('');
  const [cbPrice, setCbPrice] = useState('');
  const [cbSave, setCbSave] = useState('');
  const [cbOfferingIds, setCbOfferingIds] = useState<string[]>([]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api<{ categories: MenuCategory[] }>(
        `/guest-services/assets/${assetId}/menu-categories`,
      );
      setCategories(res.categories);
      setActiveKey((prev) => {
        if (prev && res.categories.some((c) => c.key === prev)) return prev;
        return res.categories[0]?.key ?? null;
      });
      setOffCategory((prev) => prev || res.categories[0]?.key || '');
    } catch (e) {
      reportError(e, 'Could not load categories');
    }
  }, [assetId]);

  const loadGuestMenuPromo = useCallback(async () => {
    try {
      const res = await api<{
        specials: MenuSpecial[];
        combos: MenuCombo[];
        featuredOfferingIds?: string[];
      }>(`/guest-services/assets/${assetId}/guest-menu`);
      setSpecials(res.specials || []);
      setCombos(res.combos || []);
      setFeaturedIds(res.featuredOfferingIds || []);
    } catch {
      /* optional until seed/config present */
    }
  }, [assetId]);

  useEffect(() => {
    void loadCategories();
    void loadGuestMenuPromo();
  }, [loadCategories, loadGuestMenuPromo, offerings.length]);

  async function persistPromo(nextSpecials: MenuSpecial[], nextCombos: MenuCombo[]) {
    await api(`/guest-services/assets/${assetId}/guest-menu`, {
      method: 'PUT',
      body: JSON.stringify({ specials: nextSpecials, combos: nextCombos }),
    });
    setSpecials(nextSpecials);
    setCombos(nextCombos);
  }

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.key, label: c.label })),
    [categories],
  );

  const specialOfferingIds = useMemo(
    () => new Set(specials.map((s) => s.offeringId)),
    [specials],
  );

  const filtered = useMemo(() => {
    let list = !activeKey
      ? offerings
      : offerings.filter((o) => (o.category || 'other') === activeKey);
    switch (listFilter) {
      case 'visible':
        list = list.filter((o) => !o.stopSell && o.isActive !== false);
        break;
      case 'hidden':
        list = list.filter((o) => o.stopSell || o.isActive === false);
        break;
      case 'popular':
        list = list.filter((o) => featuredIds.includes(o.id));
        break;
      case 'special':
        list = list.filter((o) => specialOfferingIds.has(o.id));
        break;
      case 'has_mod':
        list = list.filter((o) => {
          const mods = (o.modifiers || o.modifiersJson || []) as ModifierGroup[];
          return mods.length > 0;
        });
        break;
      case 'no_photo':
        list = list.filter((o) => !o.imageUrl);
        break;
      default:
        break;
    }
    return list;
  }, [offerings, activeKey, listFilter, featuredIds, specialOfferingIds]);

  const activeLabel =
    categories.find((c) => c.key === activeKey)?.label || 'Menu';

  async function persistOrder(
    next: Array<{ key: string; label: string; emoji?: string | null }>,
  ) {
    await api(`/guest-services/assets/${assetId}/menu-categories`, {
      method: 'PUT',
      body: JSON.stringify({ categories: next }),
    });
    await loadCategories();
  }

  async function addCategory() {
    const label = newCatLabel.trim();
    if (!label) {
      toastError('Category name required');
      return;
    }
    const key = slugKey(label);
    if (categories.some((c) => c.key === key)) {
      toastError('That category already exists');
      return;
    }
    try {
      await persistOrder([
        ...categories.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji })),
        { key, label, emoji: newCatEmoji },
      ]);
      setNewCatLabel('');
      setActiveKey(key);
      setOffCategory(key);
      toastSuccess('Category added');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not add category');
    }
  }

  async function setCategoryEmoji(key: string, emoji: string) {
    try {
      await persistOrder(
        categories.map((c) =>
          c.key === key
            ? { key: c.key, label: c.label, emoji }
            : { key: c.key, label: c.label, emoji: c.emoji },
        ),
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not update emoji');
    }
  }

  async function saveRename() {
    if (!renameKey || !renameLabel.trim()) return;
    try {
      await api(`/guest-services/assets/${assetId}/menu-categories/rename`, {
        method: 'POST',
        body: JSON.stringify({
          fromKey: renameKey,
          toKey: slugKey(renameLabel),
          label: renameLabel.trim(),
        }),
      });
      toastSuccess('Category updated — dishes moved with it');
      setRenameKey(null);
      await loadCategories();
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Rename failed');
    }
  }

  async function removeCategory(key: string) {
    const cat = categories.find((c) => c.key === key);
    if (!cat) return;
    if (cat.itemCount > 0) {
      toastError('Move or reassign dishes before deleting this category');
      return;
    }
    try {
      await persistOrder(
        categories
          .filter((c) => c.key !== key)
          .map((c) => ({ key: c.key, label: c.label, emoji: c.emoji })),
      );
      toastSuccess('Category removed');
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Remove failed');
    }
  }

  async function moveCategory(key: string, dir: -1 | 1) {
    const idx = categories.findIndex((c) => c.key === key);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= categories.length) return;
    const next = [...categories];
    const a = next[idx]!;
    next[idx] = next[swap]!;
    next[swap] = a;
    try {
      await persistOrder(
        next.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji })),
      );
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Reorder failed');
    }
  }

  async function addOffering() {
    if (!offName.trim() || !offPrice) {
      toastError('Name and price required');
      return;
    }
    if (!offCategory) {
      toastError('Choose a category first — use Manage categories if none exist');
      return;
    }
    try {
      await api('/guest-services/offerings', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          name: offName.trim(),
          category: offCategory,
          kind: 'food',
          unitPrice: Number(offPrice),
          description: offDesc.trim() || null,
          imageUrl: offImage,
        }),
      });
      toastSuccess('Dish added');
      setOffName('');
      setOffPrice('');
      setOffDesc('');
      setOffImage(null);
      setComposerOpen(false);
      setActiveKey(offCategory);
      await onChanged();
      await loadCategories();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/guest-services/offerings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      await onChanged();
      await loadCategories();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  function openModifiers(o: GsOffering) {
    const mods = (o.modifiers || o.modifiersJson || []) as ModifierGroup[];
    setModId(o.id);
    setModDraft(
      mods.length
        ? structuredClone(mods)
        : [
            {
              id: newId('g'),
              name: 'Options',
              minSelect: 0,
              maxSelect: 1,
              options: [{ id: newId('o'), name: 'Standard', priceDelta: 0 }],
            },
          ],
    );
  }

  async function saveModifiers() {
    if (!modId) return;
    try {
      await api(`/guest-services/offerings/${modId}`, {
        method: 'PATCH',
        body: JSON.stringify({ modifiers: modDraft }),
      });
      toastSuccess('Modifiers saved');
      setModId(null);
      await onChanged();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <div className="space-y-4">
      {canWrite ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setManageOpen(true)}
          >
            <Settings2 className="mr-1.5 h-3.5 w-3.5" />
            Manage categories
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void loadGuestMenuPromo();
              setPromoOpen(true);
              setSpOfferingId(offerings[0]?.id || '');
            }}
          >
            Specials &amp; combos
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setComposerOpen(true);
              setOffCategory(activeKey || categories[0]?.key || '');
            }}
            disabled={!categories.length}
          >
            <Plus className="mr-1 h-4 w-4" /> Add dish
          </Button>
        </div>
      ) : null}

      {!categories.length ? (
        <div className="border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <FolderPlus className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Create your first category</p>
          <p className="mt-1 text-xs text-muted-foreground">
            e.g. Starters, Mains, Drinks — then add dishes into each section.
          </p>
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              className="mt-4"
              onClick={() => setManageOpen(true)}
            >
              Manage categories
            </Button>
          ) : null}
        </div>
      ) : (
        <Card className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
          <aside className="border-b border-border bg-muted/30 lg:border-b-0 lg:border-r">
            <p className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Categories
            </p>
            <ul>
              {categories.map((c) => {
                const on = activeKey === c.key;
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => setActiveKey(c.key)}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm transition ${
                        on
                          ? 'border-l-2 border-foreground bg-background font-semibold'
                          : 'border-l-2 border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'
                      }`}
                    >
                      <span className="truncate">
                        {c.emoji ? `${c.emoji} ` : ''}
                        {c.label}
                      </span>
                      <span className="ml-2 tabular-nums text-[11px] opacity-70">
                        {c.itemCount}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h4 className="font-semibold">{activeLabel}</h4>
              <span className="text-xs text-muted-foreground">
                {filtered.length} item{filtered.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(
                [
                  ['all', 'All'],
                  ['visible', 'Visible'],
                  ['hidden', 'Hidden'],
                  ['popular', 'Popular'],
                  ['special', "Today's special"],
                  ['has_mod', 'Has modifier'],
                  ['no_photo', 'No photo'],
                ] as Array<[MenuListFilter, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setListFilter(id)}
                  className={`shrink-0 border px-2.5 py-1 text-[11px] font-semibold ${
                    listFilter === id
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {!filtered.length ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                No dishes match this filter.
                {canWrite ? (
                  <button
                    type="button"
                    className="ml-1 font-semibold text-foreground underline"
                    onClick={() => {
                      setComposerOpen(true);
                      setOffCategory(activeKey || '');
                    }}
                  >
                    Add one
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((o) => {
                  const mods = (o.modifiers || o.modifiersJson || []) as ModifierGroup[];
                  const optionCount = mods.reduce((n, g) => n + (g.options?.length || 0), 0);
                  const visible = !o.stopSell && o.isActive !== false;
                  const archived = o.isActive === false;
                  return (
                    <li
                      key={o.id}
                      className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${
                        !visible ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 gap-3">
                        <div
                          className="h-14 w-14 shrink-0 border border-border bg-muted"
                          style={
                            o.imageUrl
                              ? {
                                  backgroundImage: `url(${o.imageUrl})`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                }
                              : undefined
                          }
                        >
                          {!o.imageUrl ? (
                            <span className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                              No photo
                            </span>
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold">{o.name}</span>
                            <span
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                archived
                                  ? 'border-border text-muted-foreground'
                                  : visible
                                    ? 'border-border bg-muted/60 text-foreground'
                                    : 'border-border bg-muted/30 text-muted-foreground'
                              }`}
                            >
                              {archived ? 'Archived' : visible ? 'Visible' : 'Hidden'}
                            </span>
                            {featuredIds.includes(o.id) ? (
                              <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold">
                                ★ Bestseller
                              </span>
                            ) : null}
                            {specialOfferingIds.has(o.id) ? (
                              <span className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-bold">
                                Today&apos;s special
                              </span>
                            ) : null}
                          </div>
                          {o.description ? (
                            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {o.description}
                            </p>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-baseline gap-2">
                            <span className="text-base font-bold tabular-nums">
                              {formatCurrency(Number(o.unitPrice), o.currency)}
                            </span>
                            {optionCount ? (
                              <span className="text-[11px] text-muted-foreground">
                                {optionCount} option{optionCount === 1 ? '' : 's'}
                              </span>
                            ) : null}
                            {o.prepMinutes ? (
                              <span className="text-[11px] text-muted-foreground">
                                {o.prepMinutes} min
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {canWrite ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {editId === o.id ? (
                            <>
                              <PriceField value={editPrice} onChange={setEditPrice} />
                              <Button
                                size="sm"
                                onClick={() =>
                                  void patch(o.id, { unitPrice: Number(editPrice) }).then(
                                    () => {
                                      setEditId(null);
                                      toastSuccess('Price updated');
                                    },
                                  )
                                }
                              >
                                Save
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditId(o.id);
                                setEditPrice(String(Number(o.unitPrice)));
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Combobox
                            options={categoryOptions}
                            value={o.category}
                            onChange={(v) =>
                              void patch(o.id, { category: v }).then(() =>
                                toastSuccess('Moved to category'),
                              )
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openModifiers(o)}
                          >
                            <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                            Options
                          </Button>
                          <Button
                            size="sm"
                            variant={o.stopSell ? 'default' : 'outline'}
                            onClick={() =>
                              void patch(o.id, { stopSell: !o.stopSell }).then(() =>
                                toastSuccess(
                                  o.stopSell ? 'Visible again' : 'Hidden from guests',
                                ),
                              )
                            }
                          >
                            {o.stopSell ? 'Hidden' : 'Visible'}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        </Card>
      )}

      {/* Specials & combos */}
      {promoOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold tracking-tight">Specials &amp; combos</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Promote a dish (chef pick, festival, limited…) or build a save-money combo
                guests can upgrade to at the table.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Active specials
                  </p>
                  {specials.length ? (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {specials.length}
                    </span>
                  ) : null}
                </div>

                {specials.length ? (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {specials.map((s, i) => {
                      const o = offerings.find((x) => x.id === s.offeringId);
                      return (
                        <li
                          key={`${s.offeringId}-${i}`}
                          className="flex items-start gap-2 px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{s.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {SPECIAL_TYPE_LABELS[s.type]} · {o?.name || s.offeringId}
                            </p>
                            {s.blurb ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">{s.blurb}</p>
                            ) : null}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const next = specials.filter((_, j) => j !== i);
                              void persistPromo(next, combos)
                                .then(() => toastSuccess('Special removed'))
                                .catch((e) =>
                                  toastError(
                                    e instanceof Error ? e.message : 'Save failed',
                                  ),
                                );
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground">
                    No specials yet
                  </div>
                )}

                <div className="space-y-3 rounded-lg border border-border bg-muted/15 p-3.5">
                  <FormField label="Title" className="mb-0">
                    <Input
                      value={spTitle}
                      onChange={(e) => setSpTitle(e.target.value)}
                      placeholder="e.g. Chef’s Dal Baati"
                    />
                  </FormField>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Occasion" className="mb-0">
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-card/85 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={spType}
                        onChange={(e) => setSpType(e.target.value as MenuSpecial['type'])}
                      >
                        {SPECIAL_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {SPECIAL_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Dish" className="mb-0">
                      <Combobox
                        options={offerings.map((o) => ({ value: o.id, label: o.name }))}
                        value={spOfferingId}
                        onChange={setSpOfferingId}
                        placeholder="Select dish"
                      />
                    </FormField>
                  </div>
                  <FormField label="Blurb" description="Optional — shown under the special" className="mb-0">
                    <Input
                      value={spBlurb}
                      onChange={(e) => setSpBlurb(e.target.value)}
                      placeholder="One line guests read"
                    />
                  </FormField>
                  <Button
                    className="w-full"
                    disabled={!spTitle.trim() || !spOfferingId}
                    onClick={() => {
                      const next: MenuSpecial[] = [
                        ...specials,
                        {
                          type: spType,
                          title: spTitle.trim(),
                          offeringId: spOfferingId,
                          blurb: spBlurb.trim() || null,
                        },
                      ];
                      void persistPromo(next, combos)
                        .then(() => {
                          setSpTitle('');
                          setSpBlurb('');
                          toastSuccess('Special added');
                        })
                        .catch((e) =>
                          toastError(e instanceof Error ? e.message : 'Save failed'),
                        );
                    }}
                  >
                    Add special
                  </Button>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Combos
                  </p>
                  {combos.length ? (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {combos.length}
                    </span>
                  ) : null}
                </div>

                {combos.length ? (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {combos.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {c.offeringIds
                              .map((id) => offerings.find((o) => o.id === id)?.name || id)
                              .join(' + ')}
                          </p>
                          <p className="mt-0.5 text-xs font-medium tabular-nums">
                            {formatCurrency(c.price, c.currency || 'INR')}
                            {c.saveAmount
                              ? ` · save ${formatCurrency(c.saveAmount, c.currency || 'INR')}`
                              : ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const next = combos.filter((x) => x.id !== c.id);
                            void persistPromo(specials, next)
                              .then(() => toastSuccess('Combo removed'))
                              .catch((e) =>
                                toastError(
                                  e instanceof Error ? e.message : 'Save failed',
                                ),
                              );
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground">
                    No combos yet
                  </div>
                )}

                <div className="space-y-3 rounded-lg border border-border bg-muted/15 p-3.5">
                  <FormField label="Combo name" className="mb-0">
                    <Input
                      value={cbName}
                      onChange={(e) => setCbName(e.target.value)}
                      placeholder="e.g. Rajasthani thali"
                    />
                  </FormField>
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium leading-5">Dishes</p>
                      <p className="text-[11px] text-muted-foreground">
                        {cbOfferingIds.length}/6 · pick at least 2
                      </p>
                    </div>
                    <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border/80 bg-background p-2">
                      {offerings.slice(0, 24).map((o) => {
                        const on = cbOfferingIds.includes(o.id);
                        return (
                          <button
                            key={o.id}
                            type="button"
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition ${
                              on
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                            }`}
                            onClick={() =>
                              setCbOfferingIds((prev) =>
                                on
                                  ? prev.filter((id) => id !== o.id)
                                  : [...prev, o.id].slice(0, 6),
                              )
                            }
                          >
                            {on ? <Check className="h-3 w-3" /> : null}
                            {o.name}
                          </button>
                        );
                      })}
                      {!offerings.length ? (
                        <p className="px-1 py-2 text-xs text-muted-foreground">
                          Add dishes to the menu first.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Combo price" className="mb-0">
                      <PriceField value={cbPrice} onChange={setCbPrice} />
                    </FormField>
                    <FormField
                      label="Guest saves"
                      description="Optional"
                      className="mb-0"
                    >
                      <PriceField
                        value={cbSave}
                        onChange={setCbSave}
                        placeholder="0"
                      />
                    </FormField>
                  </div>
                  <Button
                    className="w-full"
                    disabled={!cbName.trim() || cbOfferingIds.length < 2 || !cbPrice}
                    onClick={() => {
                      const price = Number(cbPrice);
                      if (!Number.isFinite(price) || price < 0) {
                        toastError('Enter a valid combo price');
                        return;
                      }
                      const saveAmount = cbSave.trim() ? Number(cbSave) : undefined;
                      const next: MenuCombo[] = [
                        ...combos,
                        {
                          id: newId('combo'),
                          name: cbName.trim(),
                          offeringIds: cbOfferingIds,
                          price,
                          saveAmount:
                            saveAmount != null && Number.isFinite(saveAmount)
                              ? saveAmount
                              : undefined,
                          currency: 'INR',
                        },
                      ];
                      void persistPromo(specials, next)
                        .then(() => {
                          setCbName('');
                          setCbPrice('');
                          setCbSave('');
                          setCbOfferingIds([]);
                          toastSuccess('Combo added');
                        })
                        .catch((e) =>
                          toastError(e instanceof Error ? e.message : 'Save failed'),
                        );
                    }}
                  >
                    Add combo
                  </Button>
                </div>
              </section>
            </div>

            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button type="button" onClick={() => setPromoOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Manage categories — compact rows; emoji popover instead of per-row grids */}
      {manageOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold tracking-tight">Menu categories</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Order matches guest menu tabs. Renaming moves every dish in that section.
              </p>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {categories.map((c, i) => (
                <li
                  key={c.key}
                  className="relative flex items-center gap-2 rounded-md px-2 py-2.5 hover:bg-muted/40"
                >
                  {renameKey === c.key ? (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <Input
                        className="min-w-[140px] flex-1"
                        value={renameLabel}
                        onChange={(e) => setRenameLabel(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveRename();
                          if (e.key === 'Escape') setRenameKey(null);
                        }}
                      />
                      <Button size="sm" onClick={() => void saveRename()}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRenameKey(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <FoodEmojiPicker
                        value={c.emoji || '🍽️'}
                        open={emojiPickerFor === c.key}
                        onOpenChange={(open) =>
                          setEmojiPickerFor(open ? c.key : null)
                        }
                        onSelect={(em) => void setCategoryEmoji(c.key, em)}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold leading-tight">{c.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {c.itemCount} dish{c.itemCount === 1 ? '' : 'es'}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={i === 0}
                          title="Move up"
                          onClick={() => void moveCategory(c.key, -1)}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={i === categories.length - 1}
                          title="Move down"
                          onClick={() => void moveCategory(c.key, 1)}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs font-semibold"
                          onClick={() => {
                            setEmojiPickerFor(null);
                            setRenameKey(c.key);
                            setRenameLabel(c.label);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Delete"
                          onClick={() => void removeCategory(c.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
              {!categories.length ? (
                <li className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No categories yet — add your first below.
                </li>
              ) : null}
            </ul>

            <div className="border-t border-border bg-muted/20 px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Add category
              </p>
              <div className="mt-2 flex items-center gap-2">
                <FoodEmojiPicker
                  value={newCatEmoji}
                  open={emojiPickerFor === 'new'}
                  onOpenChange={(open) => setEmojiPickerFor(open ? 'new' : null)}
                  onSelect={setNewCatEmoji}
                  placement="top"
                />
                <Input
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value)}
                  placeholder="e.g. House mains"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void addCategory();
                  }}
                />
                <Button type="button" onClick={() => void addCategory()}>
                  Add
                </Button>
              </div>
            </div>

            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button
                type="button"
                onClick={() => {
                  setEmojiPickerFor(null);
                  setRenameKey(null);
                  setManageOpen(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Add dish */}
      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold tracking-tight">Add dish</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Appears in Guest Companion under the category you choose.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <FormField label="Name" required>
                <Input
                  value={offName}
                  onChange={(e) => setOffName(e.target.value)}
                  placeholder="Dal Baati Churma"
                  autoFocus
                />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Category" required>
                  <Combobox
                    options={categoryOptions}
                    value={offCategory}
                    onChange={setOffCategory}
                    placeholder="Select category"
                  />
                </FormField>
                <FormField label="Price" required>
                  <PriceField value={offPrice} onChange={setOffPrice} />
                </FormField>
              </div>
              <FormField
                label="Short description"
                description="One line guests see on the menu"
              >
                <Textarea
                  value={offDesc}
                  onChange={(e) => setOffDesc(e.target.value)}
                  placeholder="Slow-cooked lentils with baked baati and sweet churma"
                  rows={2}
                  className="min-h-[72px] resize-none"
                />
              </FormField>
              <FormField
                label="Photo"
                description="1:1 studio crop — guests see a consistent square"
                className="mb-0"
              >
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    setPhotoBusy(true);
                    void studioProcessImageFile(file)
                      .then((url) => {
                        setOffImage(url);
                        toastSuccess('Photo cropped to square');
                      })
                      .catch((err) =>
                        toastError(err instanceof Error ? err.message : 'Photo failed'),
                      )
                      .finally(() => setPhotoBusy(false));
                  }}
                />
                {offImage ? (
                  <div className="relative inline-block">
                    <img
                      src={offImage}
                      alt="Dish preview"
                      className="h-28 w-28 rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      title="Remove photo"
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground"
                      onClick={() => setOffImage(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="mt-2 block text-xs font-semibold text-foreground underline-offset-2 hover:underline"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoBusy}
                    >
                      Replace photo
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={photoBusy}
                    onClick={() => photoInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-7 text-center transition hover:border-foreground/30 hover:bg-muted/35 disabled:opacity-60"
                  >
                    <ImagePlus className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {photoBusy ? 'Cropping…' : 'Upload square photo'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      JPEG, PNG, or WebP
                    </span>
                  </button>
                )}
              </FormField>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setComposerOpen(false);
                  setOffImage(null);
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={() => void addOffering()}>
                Save dish
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {modId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold tracking-tight">Modifiers</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Guests pick these before adding the dish
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {modDraft.map((g, gi) => (
                <div key={g.id} className="rounded-lg border border-border bg-muted/15 p-3.5">
                  <Input
                    className="mb-2"
                    value={g.name}
                    onChange={(e) => {
                      const next = [...modDraft];
                      next[gi] = { ...g, name: e.target.value };
                      setModDraft(next);
                    }}
                    placeholder="Group name"
                  />
                  <div className="mb-2 flex gap-2">
                    <Input
                      type="number"
                      value={g.minSelect}
                      onChange={(e) => {
                        const next = [...modDraft];
                        next[gi] = { ...g, minSelect: Number(e.target.value) || 0 };
                        setModDraft(next);
                      }}
                      placeholder="Min"
                    />
                    <Input
                      type="number"
                      value={g.maxSelect}
                      onChange={(e) => {
                        const next = [...modDraft];
                        next[gi] = { ...g, maxSelect: Number(e.target.value) || 1 };
                        setModDraft(next);
                      }}
                      placeholder="Max"
                    />
                  </div>
                  {g.options.map((opt, oi) => (
                    <div key={opt.id} className="mb-1 flex gap-2">
                      <Input
                        value={opt.name}
                        onChange={(e) => {
                          const next = structuredClone(modDraft);
                          next[gi]!.options[oi]!.name = e.target.value;
                          setModDraft(next);
                        }}
                        placeholder="Option"
                      />
                      <PriceField
                        value={String(opt.priceDelta)}
                        onChange={(v) => {
                          const next = structuredClone(modDraft);
                          next[gi]!.options[oi]!.priceDelta = Number(v) || 0;
                          setModDraft(next);
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={() => {
                      const next = structuredClone(modDraft);
                      next[gi]!.options.push({
                        id: newId('o'),
                        name: 'New option',
                        priceDelta: 0,
                      });
                      setModDraft(next);
                    }}
                  >
                    + Option
                  </Button>
                </div>
              ))}
              {!modDraft.length ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">
                  No modifier groups yet — add one below.
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setModDraft((d) => [
                    ...d,
                    {
                      id: newId('g'),
                      name: 'New group',
                      minSelect: 0,
                      maxSelect: 1,
                      options: [{ id: newId('o'), name: 'Choice', priceDelta: 0 }],
                    },
                  ])
                }
              >
                + Group
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setModId(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void saveModifiers()}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
