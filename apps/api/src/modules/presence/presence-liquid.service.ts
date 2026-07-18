import { Injectable } from '@nestjs/common';
import { Liquid } from 'liquidjs';

const engine = new Liquid({
  cache: false,
  dynamicPartials: false,
  strictFilters: false,
  strictVariables: false,
});

function stripScripts(html: string) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(["'])[\s\S]*?\1/gi, '');
}

@Injectable()
export class PresenceLiquidService {
  async render(templateSource: string, context: Record<string, unknown>) {
    const source = (templateSource || '').slice(0, 100_000);
    const html = await Promise.race([
      engine.parseAndRender(source, context),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Liquid render timeout')), 1500),
      ),
    ]);
    return stripScripts(String(html));
  }
}
