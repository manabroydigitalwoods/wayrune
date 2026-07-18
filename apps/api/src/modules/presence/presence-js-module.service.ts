import { Injectable } from '@nestjs/common';
import vm from 'node:vm';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class PresenceJsModuleService {
  render(moduleSource: string, context: { props: Record<string, unknown>; theme: Record<string, unknown> }) {
    const source = (moduleSource || '').slice(0, 50_000);
    const sandbox = {
      props: context.props,
      theme: context.theme,
      escapeHtml,
      console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    const wrapped = `
      "use strict";
      var module = { exports: {} };
      var exports = module.exports;
      ${source}
      if (typeof render === 'function') { module.exports = render; }
      module.exports;
    `;
    const result = vm.runInContext(wrapped, sandbox, {
      timeout: 100,
      displayErrors: true,
    });
    if (typeof result === 'function') {
      const html = result(context.props, context.theme, escapeHtml);
      return String(html ?? '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .slice(0, 200_000);
    }
    if (typeof result === 'string') {
      return result.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').slice(0, 200_000);
    }
    return '<!-- js_module did not export render(props, theme, escapeHtml) -->';
  }
}
