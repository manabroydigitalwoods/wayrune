import { describe, expect, it } from 'vitest';
import {
  freeformResponsiveCss,
  inlineStyleAttr,
  parseFreeformFrame,
  resolveFreeformFrame,
  responsiveCssForSection,
  stylePropsFromRecord,
} from './presence-style';

describe('resolveFreeformFrame', () => {
  it('applies mobile override and mobileScale fallback', () => {
    const frame = parseFreeformFrame({
      x: 100,
      y: 50,
      w: 400,
      h: 200,
      z: 2,
      mobile: { x: 10, w: 300 },
      mobileScale: 0.5,
    })!;
    expect(resolveFreeformFrame(frame, 'mobile')).toMatchObject({ x: 10, w: 300, y: 50, h: 200 });
    const scaled = parseFreeformFrame({
      x: 100,
      y: 50,
      w: 400,
      h: 200,
      mobileScale: 0.5,
    })!;
    expect(resolveFreeformFrame(scaled, 'mobile')).toMatchObject({
      x: 50,
      y: 25,
      w: 200,
      h: 100,
    });
  });
});

describe('freeformResponsiveCss', () => {
  it('emits tablet and mobile media queries', () => {
    const css = freeformResponsiveCss(
      'sec1',
      parseFreeformFrame({
        x: 0,
        y: 0,
        w: 400,
        h: 200,
        tablet: { w: 360 },
        mobile: { w: 300 },
      }),
    );
    expect(css).toContain('@media (max-width:768px)');
    expect(css).toContain('@media (max-width:480px)');
    expect(css).toContain('width:360px');
    expect(css).toContain('width:300px');
  });
});

describe('advanced style props', () => {
  it('emits typography, border, and shadow in inline style', () => {
    const style = stylePropsFromRecord({
      padding: '1rem',
      fontSize: '1.25rem',
      fontWeight: '600',
      textAlign: 'center',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: '#0f766e',
      boxShadow: '0 4px 14px rgba(15,23,42,.08)',
    });
    const attr = inlineStyleAttr(style);
    expect(attr).toContain('padding:1rem');
    expect(attr).toContain('font-size:1.25rem');
    expect(attr).toContain('font-weight:600');
    expect(attr).toContain('text-align:center');
    expect(attr).toContain('border-width:1px');
    expect(attr).toContain('border-style:solid');
    expect(attr).toContain('border-color:#0f766e');
    expect(attr).toContain('box-shadow:0 4px 14px rgba(15,23,42,.08)');
  });

  it('emits responsive typography and surface overrides', () => {
    const css = responsiveCssForSection('sec-adv', {
      responsive: {
        mobile: {
          fontSize: '0.9rem',
          boxShadow: 'none',
          textAlign: 'left',
        },
      },
    });
    expect(css).toContain('@media (max-width:480px)');
    expect(css).toContain('font-size:0.9rem');
    expect(css).toContain('box-shadow:none');
    expect(css).toContain('text-align:left');
  });
});
