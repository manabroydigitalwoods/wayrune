/** Shared presence style helpers used by runtime (and mirrored by live canvas). */

export type StyleProps = {
  display?: string;
  padding?: string;
  margin?: string;
  background?: string;
  textColor?: string;
  borderRadius?: string;
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;
  boxShadow?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  cssClass?: string;
  gap?: string;
  flexDirection?: string;
  alignItems?: string;
  justifyContent?: string;
  flexWrap?: string;
  gridTemplateColumns?: string;
};

function strProp(props: Record<string, unknown>, key: string): string | undefined {
  const value = props[key];
  return typeof value === 'string' && value ? value : undefined;
}

export function stylePropsFromRecord(props: Record<string, unknown>): StyleProps {
  return {
    padding: strProp(props, 'padding'),
    margin: strProp(props, 'margin'),
    background: strProp(props, 'background'),
    textColor: strProp(props, 'textColor'),
    borderRadius: strProp(props, 'borderRadius'),
    borderWidth: strProp(props, 'borderWidth'),
    borderStyle: strProp(props, 'borderStyle'),
    borderColor: strProp(props, 'borderColor'),
    boxShadow: strProp(props, 'boxShadow'),
    fontSize: strProp(props, 'fontSize'),
    fontWeight: strProp(props, 'fontWeight'),
    lineHeight: strProp(props, 'lineHeight'),
    letterSpacing: strProp(props, 'letterSpacing'),
    textAlign: strProp(props, 'textAlign'),
    cssClass: strProp(props, 'cssClass'),
    gap: strProp(props, 'gap'),
    flexDirection: strProp(props, 'flexDirection'),
    alignItems: strProp(props, 'alignItems'),
    justifyContent: strProp(props, 'justifyContent'),
    flexWrap: strProp(props, 'flexWrap'),
    gridTemplateColumns: strProp(props, 'gridTemplateColumns'),
  };
}

export function inlineStyleAttr(style: StyleProps) {
  const parts: string[] = [];
  if (style.display) parts.push(`display:${style.display}`);
  if (style.padding) parts.push(`padding:${style.padding}`);
  if (style.margin) parts.push(`margin:${style.margin}`);
  if (style.background) parts.push(`background:${style.background}`);
  if (style.textColor) parts.push(`color:${style.textColor}`);
  // Module CSS (hero, cta, …) can force colors; expose vars so Styles panel overrides win.
  if (style.background) parts.push(`--presence-section-bg:${style.background}`);
  if (style.textColor) parts.push(`--presence-section-color:${style.textColor}`);
  if (style.borderRadius) parts.push(`border-radius:${style.borderRadius}`);
  if (style.borderWidth) parts.push(`border-width:${style.borderWidth}`);
  if (style.borderStyle) parts.push(`border-style:${style.borderStyle}`);
  if (style.borderColor) parts.push(`border-color:${style.borderColor}`);
  if (style.boxShadow) parts.push(`box-shadow:${style.boxShadow}`);
  if (style.fontSize) parts.push(`font-size:${style.fontSize}`);
  if (style.fontWeight) parts.push(`font-weight:${style.fontWeight}`);
  if (style.lineHeight) parts.push(`line-height:${style.lineHeight}`);
  if (style.letterSpacing) parts.push(`letter-spacing:${style.letterSpacing}`);
  if (style.textAlign) parts.push(`text-align:${style.textAlign}`);
  if (style.gap) parts.push(`gap:${style.gap}`);
  if (style.flexDirection) parts.push(`flex-direction:${style.flexDirection}`);
  if (style.alignItems) parts.push(`align-items:${style.alignItems}`);
  if (style.justifyContent) parts.push(`justify-content:${style.justifyContent}`);
  if (style.flexWrap) parts.push(`flex-wrap:${style.flexWrap}`);
  if (style.gridTemplateColumns) parts.push(`grid-template-columns:${style.gridTemplateColumns}`);
  return parts.length ? ` style="${parts.join(';')}"` : '';
}

export function classAttr(style: StyleProps, base = '') {
  const cls = [base, style.cssClass].filter(Boolean).join(' ').trim();
  return cls ? ` class="${cls}"` : base ? ` class="${base}"` : '';
}

/** Layout flex/grid props for container / columns modules. */
export function layoutBoxStyleFromProps(type: string, props: Record<string, unknown>): StyleProps {
  const gap = typeof props.gap === 'string' && props.gap ? props.gap : undefined;
  if (type === 'container') {
    return {
      display: 'flex',
      gap: gap || '1rem',
      flexDirection:
        props.flexDirection === 'row' ||
        props.flexDirection === 'row-reverse' ||
        props.flexDirection === 'column-reverse'
          ? String(props.flexDirection)
          : 'column',
      alignItems:
        typeof props.alignItems === 'string' && props.alignItems
          ? String(props.alignItems)
          : undefined,
      justifyContent:
        typeof props.justifyContent === 'string' && props.justifyContent
          ? String(props.justifyContent)
          : undefined,
      flexWrap:
        props.flexWrap === 'wrap' || props.flexWrap === 'wrap-reverse'
          ? String(props.flexWrap)
          : 'nowrap',
    };
  }
  if (type === 'two_column') {
    return {
      display: 'grid',
      gap: gap || '1.5rem',
      gridTemplateColumns: '1fr 1fr',
    };
  }
  if (type === 'columns') {
    const count = clampColumnCount(props.columnCount);
    return {
      display: 'grid',
      gap: gap || '1.25rem',
      gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
    };
  }
  return {};
}

export function clampColumnCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.min(6, Math.max(2, Math.round(n)));
}

export function columnSlotKeys(columnCount: unknown): string[] {
  return Array.from({ length: clampColumnCount(columnCount) }, (_, i) => `col-${i}`);
}

export function defaultLayoutSlotKey(
  type: string,
  _props?: Record<string, unknown> | null,
): string | null {
  if (type === 'two_column') return 'left';
  if (type === 'columns') return 'col-0';
  return null;
}

const RESPONSIVE_STYLE_KEYS = [
  'padding',
  'margin',
  'background',
  'textColor',
  'borderRadius',
  'borderWidth',
  'borderStyle',
  'borderColor',
  'boxShadow',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'hidden',
] as const;

export function responsiveBucketOf(
  props: Record<string, unknown>,
  device: 'tablet' | 'mobile',
): Record<string, unknown> {
  const responsive =
    props.responsive && typeof props.responsive === 'object' && !Array.isArray(props.responsive)
      ? (props.responsive as Record<string, unknown>)
      : {};
  const bucket = responsive[device];
  return bucket && typeof bucket === 'object' && !Array.isArray(bucket)
    ? (bucket as Record<string, unknown>)
    : {};
}

/** Emit @media rules for a section's responsive overrides (keyed by data-presence-section-id). */
export function responsiveCssForSection(sectionId: string, props: Record<string, unknown>): string {
  const parts: string[] = [];
  const tablet = responsiveBucketOf(props, 'tablet');
  const mobile = responsiveBucketOf(props, 'mobile');
  const toDecls = (bucket: Record<string, unknown>) => {
    const decls: string[] = [];
    const push = (cssKey: string, propKey: string) => {
      const value = bucket[propKey];
      if (typeof value === 'string' && value) decls.push(`${cssKey}:${value}`);
    };
    push('padding', 'padding');
    push('margin', 'margin');
    push('background', 'background');
    push('color', 'textColor');
    push('border-radius', 'borderRadius');
    push('border-width', 'borderWidth');
    push('border-style', 'borderStyle');
    push('border-color', 'borderColor');
    push('box-shadow', 'boxShadow');
    push('font-size', 'fontSize');
    push('font-weight', 'fontWeight');
    push('line-height', 'lineHeight');
    push('letter-spacing', 'letterSpacing');
    push('text-align', 'textAlign');
    if (bucket.hidden === true) decls.push('display:none');
    return decls.join(';');
  };
  const tabletDecls = toDecls(tablet);
  const mobileDecls = toDecls(mobile);
  const sel = `[data-presence-section-id="${sectionId}"]`;
  if (tabletDecls) {
    parts.push(`@media (max-width:768px){${sel}{${tabletDecls}}}`);
  }
  if (mobileDecls) {
    parts.push(`@media (max-width:480px){${sel}{${mobileDecls}}}`);
  }
  void RESPONSIVE_STYLE_KEYS;
  return parts.join('\n');
}

export type FreeformFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  unit?: 'px' | '%';
  tablet?: Partial<Pick<FreeformFrame, 'x' | 'y' | 'w' | 'h' | 'z' | 'unit'>>;
  mobile?: Partial<Pick<FreeformFrame, 'x' | 'y' | 'w' | 'h' | 'z' | 'unit'>>;
  mobileScale?: number;
};

function asFramePartial(value: unknown): FreeformFrame['mobile'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const out: NonNullable<FreeformFrame['mobile']> = {};
  if (typeof row.x === 'number') out.x = row.x;
  if (typeof row.y === 'number') out.y = row.y;
  if (typeof row.w === 'number') out.w = row.w;
  if (typeof row.h === 'number') out.h = row.h;
  if (typeof row.z === 'number') out.z = row.z;
  if (row.unit === '%' || row.unit === 'px') out.unit = row.unit;
  return Object.keys(out).length ? out : undefined;
}

export function parseFreeformFrame(raw: unknown): FreeformFrame | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const frame = raw as Record<string, unknown>;
  return {
    x: Number(frame.x || 0),
    y: Number(frame.y || 0),
    w: Number(frame.w || 320),
    h: Number(frame.h || 180),
    z: Number(frame.z || 1),
    unit: frame.unit === '%' ? '%' : 'px',
    tablet: asFramePartial(frame.tablet),
    mobile: asFramePartial(frame.mobile),
    mobileScale: typeof frame.mobileScale === 'number' ? frame.mobileScale : undefined,
  };
}

export function resolveFreeformFrame(
  frame: FreeformFrame,
  breakpoint: 'desktop' | 'tablet' | 'mobile' = 'desktop',
): FreeformFrame {
  if (breakpoint === 'desktop') return frame;
  const override = breakpoint === 'mobile' ? frame.mobile : frame.tablet;
  if (override) {
    return {
      ...frame,
      x: override.x ?? frame.x,
      y: override.y ?? frame.y,
      w: override.w ?? frame.w,
      h: override.h ?? frame.h,
      z: override.z ?? frame.z,
      unit: override.unit ?? frame.unit,
    };
  }
  if (breakpoint === 'mobile' && typeof frame.mobileScale === 'number' && frame.mobileScale > 0) {
    const s = frame.mobileScale;
    return {
      ...frame,
      x: Math.round(frame.x * s),
      y: Math.round(frame.y * s),
      w: Math.round(frame.w * s),
      h: Math.round(frame.h * s),
    };
  }
  return frame;
}

export function freeformFrameStyle(frame: FreeformFrame | null | undefined) {
  if (!frame) return '';
  const unit = frame.unit || 'px';
  // min-height lets content (e.g. hero CTAs) grow; overflow visible avoids clipping.
  return `position:absolute;left:${frame.x}${unit};top:${frame.y}${unit};width:${frame.w}${unit};min-height:${frame.h}${unit};height:auto;overflow:visible;z-index:${frame.z ?? 1};`;
}

/** Media-query overrides for freeform roots (tablet/mobile). Desktop style stays inline. */
export function freeformResponsiveCss(sectionId: string, frame: FreeformFrame | null | undefined) {
  if (!frame) return '';
  const sel = `[data-presence-section-id="${sectionId}"]`;
  const parts: string[] = [];
  if (frame.tablet) {
    const resolved = resolveFreeformFrame(frame, 'tablet');
    parts.push(`@media (max-width:768px){${sel}{${freeformFrameStyle(resolved)}}}`);
  }
  if (frame.mobile || (typeof frame.mobileScale === 'number' && frame.mobileScale > 0)) {
    const resolved = resolveFreeformFrame(frame, 'mobile');
    parts.push(`@media (max-width:480px){${sel}{${freeformFrameStyle(resolved)}}}`);
  }
  return parts.join('\n');
}

export const SHARED_STYLE_FIELDS = [
  {
    key: 'boxWidth',
    label: 'Box width',
    type: 'select',
    options: [
      { value: 'content', label: 'Content (narrow)' },
      { value: 'wide', label: 'Wide' },
      { value: 'full', label: 'Full width' },
    ],
  },
  {
    key: 'contentAlign',
    label: 'Content position',
    type: 'select',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ],
  },
  { key: 'padding', label: 'Padding', type: 'text' },
  { key: 'margin', label: 'Margin', type: 'text' },
  { key: 'background', label: 'Background', type: 'color' },
  { key: 'textColor', label: 'Text color', type: 'color' },
  { key: 'borderRadius', label: 'Border radius', type: 'text' },
  { key: 'borderWidth', label: 'Border width', type: 'text' },
  {
    key: 'borderStyle',
    label: 'Border style',
    type: 'select',
    options: [
      { value: 'none', label: 'None' },
      { value: 'solid', label: 'Solid' },
      { value: 'dashed', label: 'Dashed' },
      { value: 'dotted', label: 'Dotted' },
    ],
  },
  { key: 'borderColor', label: 'Border color', type: 'color' },
  { key: 'boxShadow', label: 'Shadow', type: 'text' },
  { key: 'fontSize', label: 'Font size', type: 'text' },
  {
    key: 'fontWeight',
    label: 'Font weight',
    type: 'select',
    options: [
      { value: '400', label: 'Regular' },
      { value: '500', label: 'Medium' },
      { value: '600', label: 'Semibold' },
      { value: '700', label: 'Bold' },
    ],
  },
  { key: 'lineHeight', label: 'Line height', type: 'text' },
  { key: 'letterSpacing', label: 'Letter spacing', type: 'text' },
  {
    key: 'textAlign',
    label: 'Text align',
    type: 'select',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
      { value: 'justify', label: 'Justify' },
    ],
  },
  { key: 'cssClass', label: 'CSS class', type: 'text' },
] as const;
