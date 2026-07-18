import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { PresenceThemePackageService } from './presence-theme-package.service';

describe('exportComponentToZip', () => {
  it('includes hosted JS from assetsJson.files (not a stub)', async () => {
    const jsContent =
      "window.PresenceMount=function(el,props){el.textContent=props.title||'ok';};";
    const prisma = {
      presenceModuleDefinition: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'm1',
          key: 'promo',
          name: 'Promo',
          category: 'content',
          schemaJson: [],
          defaultPropsJson: { title: 'Hello' },
          assetsJson: {
            version: '1.0.0',
            description: 'Promo block',
            entry: { html: 'index.html', css: ['styles.css'], js: ['index.js'] },
            packageHtml: '<div id="root"></div>',
            packageCss: '.promo{}',
            files: [
              { path: 'component.json', documentId: 'd0' },
              { path: 'index.html', documentId: 'd1' },
              { path: 'styles.css', documentId: 'd2' },
              { path: 'index.js', documentId: 'd3' },
            ],
          },
        }),
      },
    };
    const files = {
      readBuffer: vi.fn(async (_org: string, documentId: string) => {
        const map: Record<string, string> = {
          d0: JSON.stringify({
            key: 'promo',
            name: 'Promo',
            version: '1.0.0',
            entry: { html: 'index.html', css: ['styles.css'], js: ['index.js'] },
          }),
          d1: '<div id="root"></div>',
          d2: '.promo{padding:1rem}',
          d3: jsContent,
        };
        return {
          buffer: Buffer.from(map[documentId] || '', 'utf8'),
          mimeType: 'text/plain',
          fileName: documentId,
        };
      }),
    };

    const svc = new PresenceThemePackageService(prisma as never, files as never);
    const buf = await svc.exportComponentToZip('org1', 'm1');
    const zip = await JSZip.loadAsync(buf);
    const js = await zip.file('index.js')!.async('string');
    expect(js).toBe(jsContent);
    expect(js).not.toContain('el.innerHTML=el.innerHTML');
    expect(files.readBuffer).toHaveBeenCalledWith('org1', 'd3');
  });
});
