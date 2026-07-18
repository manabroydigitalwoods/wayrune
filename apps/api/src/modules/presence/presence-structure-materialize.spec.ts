import { describe, expect, it } from 'vitest';
import {
  normalizeTemplateSections,
  serializeSectionsForTemplate,
} from './presence-structure-materialize';

describe('normalizeTemplateSections', () => {
  it('preserves parentRef, slotKey, moduleKey, and frame in propsJson', () => {
    const rows = normalizeTemplateSections([
      {
        ref: 'hero',
        type: 'hero',
        moduleKey: 'hero_banner',
        propsJson: { frame: { x: 10, y: 20, w: 400, h: 200, z: 2 } },
        position: 0,
      },
      {
        ref: 'col',
        parentRef: 'hero',
        slotKey: 'main',
        type: 'columns',
        moduleKey: 'columns_2',
        propsJson: {},
        position: 1,
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ref: 'hero',
      parentRef: null,
      moduleKey: 'hero_banner',
      propsJson: { frame: { x: 10, y: 20, w: 400, h: 200, z: 2 } },
    });
    expect(rows[1]).toMatchObject({
      ref: 'col',
      parentRef: 'hero',
      slotKey: 'main',
      moduleKey: 'columns_2',
    });
  });
});

describe('serializeSectionsForTemplate', () => {
  it('maps parentId to parentRef and prefers module definition key', () => {
    const out = serializeSectionsForTemplate([
      {
        id: 'a',
        type: 'hero',
        propsJson: { frame: { x: 1, y: 2, w: 3, h: 4, z: 1 } },
        position: 0,
        slotKey: null,
        parentId: null,
        moduleDefinitionId: 'm1',
        moduleDefinition: { key: 'hero_banner' },
      },
      {
        id: 'b',
        type: 'rich_text',
        propsJson: { body: 'Hi' },
        position: 1,
        slotKey: 'main',
        parentId: 'a',
        moduleDefinitionId: 'm2',
        moduleDefinition: { key: 'rich_text' },
      },
    ]);
    expect(out[0]).toMatchObject({
      ref: 's0',
      parentRef: null,
      moduleKey: 'hero_banner',
      propsJson: { frame: { x: 1, y: 2, w: 3, h: 4, z: 1 } },
    });
    expect(out[1]).toMatchObject({
      ref: 's1',
      parentRef: 's0',
      slotKey: 'main',
      moduleKey: 'rich_text',
    });
  });
});
