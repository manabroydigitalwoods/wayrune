import { useDraggable } from '@dnd-kit/core';
import { useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Columns2,
  Columns3,
  FormInput,
  GripVertical,
  HelpCircle,
  Image,
  LayoutTemplate,
  MessageSquareQuote,
  MousePointerClick,
  Search,
  Sparkles,
  SquareStack,
  Type,
  Code2,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Contact,
  Film,
  Footprints,
  GalleryHorizontal,
  Grid3x3,
  Heading,
  Hotel,
  Images,
  LayoutGrid,
  ListTree,
  Mail,
  Map as MapIcon,
  MapPin,
  Megaphone,
  Minus,
  Newspaper,
  PanelTop,
  Route,
  Scale,
  ShieldCheck,
  Table2,
  Users,
  Video,
  Puzzle,
} from 'lucide-react';
import { Input, cn } from '@wayrune/ui';
import type { ModuleDef } from './types';
import { categoryLabel, PRESENCE_CATEGORY_ORDER } from '../catalogMeta';

const MODULE_ICONS: Record<string, typeof Type> = {
  hero: Sparkles,
  rich_text: Type,
  faq: HelpCircle,
  gallery: Image,
  form: FormInput,
  testimonials: MessageSquareQuote,
  cta: MousePointerClick,
  widget_cta: MessageSquareQuote,
  container: SquareStack,
  two_column: Columns2,
  columns: Columns3,
  liquid: Code2,
  js_module: Code2,
  package: Code2,
  logo_cloud: Building2,
  stats: CircleDollarSign,
  feature_grid: LayoutGrid,
  feature_split: Columns2,
  pricing: CircleDollarSign,
  team: Users,
  logo_header_strip: Megaphone,
  blog_cards: Newspaper,
  contact_block: Contact,
  newsletter: Mail,
  divider: Minus,
  embed: Film,
  page_header: Heading,
  tabs_content: PanelTop,
  accordion: ListTree,
  timeline: Footprints,
  comparison_table: Table2,
  image_text_list: Images,
  video_feature: Video,
  map_block: MapIcon,
  footer_columns: Columns3,
  legal_text: Scale,
  cards_carousel: GalleryHorizontal,
  banner_slim: Megaphone,
  destination_grid: MapPin,
  package_cards: CalendarDays,
  itinerary: ListTree,
  hotel_highlight: Hotel,
  trip_search_cta: Search,
  season_promo: Sparkles,
  trust_badges: ShieldCheck,
  enquiry_split: FormInput,
  gallery_masonry: Grid3x3,
  route_map: Route,
};

function DraggableModuleRow({
  moduleDef,
  canDrag,
  onAdd,
}: {
  moduleDef: ModuleDef;
  canDrag: boolean;
  onAdd: (moduleDef: ModuleDef) => void;
}) {
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `module:${moduleDef.id}`,
    data: { kind: 'module', moduleId: moduleDef.id },
    disabled: !canDrag,
  });
  const Icon = MODULE_ICONS[moduleDef.rendererKey] || LayoutTemplate;

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition',
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging ? 'opacity-40 ring-1 ring-primary/40' : 'hover:bg-muted/80',
      )}
      title={canDrag ? 'Drag onto the canvas, or click to add' : `Add ${moduleDef.name}`}
      onPointerDown={(event) => {
        pointerOrigin.current = { x: event.clientX, y: event.clientY };
      }}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      onClick={(event) => {
        const origin = pointerOrigin.current;
        pointerOrigin.current = null;
        if (
          origin &&
          Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 6
        ) {
          return;
        }
        onAdd(moduleDef);
      }}
    >
      {canDrag ? (
        <span className="shrink-0 text-muted-foreground" aria-hidden>
          <GripVertical className="size-3.5" />
        </span>
      ) : null}
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{moduleDef.name}</span>
    </button>
  );
}

export function DraggableSavedComponentRow({
  component,
  canDrag,
  onAdd,
}: {
  component: { id: string; name: string };
  canDrag: boolean;
  onAdd: () => void;
}) {
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `saved-component:${component.id}`,
    data: { kind: 'savedComponent', componentId: component.id },
    disabled: !canDrag,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition',
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging ? 'opacity-40 ring-1 ring-primary/40' : 'hover:border-primary/40 hover:bg-primary/5',
      )}
      title={canDrag ? 'Drag onto the canvas, or click to add' : `Add ${component.name}`}
      onPointerDown={(event) => {
        pointerOrigin.current = { x: event.clientX, y: event.clientY };
      }}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      onClick={(event) => {
        const origin = pointerOrigin.current;
        pointerOrigin.current = null;
        if (
          origin &&
          Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 6
        ) {
          return;
        }
        onAdd();
      }}
      disabled={!canDrag}
    >
      {canDrag ? (
        <span className="shrink-0 text-muted-foreground" aria-hidden>
          <GripVertical className="size-3.5" />
        </span>
      ) : null}
      <Puzzle className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{component.name}</span>
    </button>
  );
}

export function BuilderModuleLibrary({
  modules,
  onAdd,
  fillHeight,
  canDrag = true,
}: {
  modules: ModuleDef[];
  onAdd: (moduleDef: ModuleDef) => void;
  fillHeight?: boolean;
  canDrag?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = modules.filter((module) => {
      if (!q) return true;
      return (
        module.name.toLowerCase().includes(q) ||
        module.category.toLowerCase().includes(q) ||
        module.rendererKey.toLowerCase().includes(q)
      );
    });
    const map = new Map<string, ModuleDef[]>();
    for (const module of filtered) {
      const key = module.category || 'content';
      const list = map.get(key) || [];
      list.push(module);
      map.set(key, list);
    }
    const order = [...PRESENCE_CATEGORY_ORDER] as string[];
    return [...map.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a[0].localeCompare(b[0]);
    });
  }, [modules, query]);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden',
        fillHeight ? 'min-h-0 flex-1' : 'max-h-[42%] shrink-0 border-t',
      )}
    >
      <div className="shrink-0 space-y-2 border-b px-3 py-2.5">
        <div className="text-sm font-medium">Components</div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-sm"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {canDrag ? (
          <p className="text-[10px] text-muted-foreground">
            Drag from anywhere on a row, or click to add at the end
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2">
        {grouped.map(([category, items]) => {
          const isCollapsed = collapsed[category] === true;
          return (
            <div key={category} className="space-y-1">
              <button
                type="button"
                className="flex w-full items-center justify-between px-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }))
                }
              >
                <span>
                  {categoryLabel(category)} ({items.length})
                </span>
                <ChevronDown
                  className={cn('size-3 transition', isCollapsed ? '-rotate-90' : '')}
                />
              </button>
              {!isCollapsed ? (
                <div className="space-y-0.5">
                  {items.map((moduleDef) => (
                    <DraggableModuleRow
                      key={moduleDef.id}
                      moduleDef={moduleDef}
                      canDrag={canDrag}
                      onAdd={onAdd}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {!grouped.length ? (
          <p className="px-1 text-xs text-muted-foreground">No modules match.</p>
        ) : null}
      </div>
    </div>
  );
}
