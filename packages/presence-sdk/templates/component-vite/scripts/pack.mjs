import { packComponentDirectory } from '../../../dist/cli/pack-component.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { outPath, bytes } = await packComponentDirectory({
  dir: root,
  out: join(root, 'out', 'my-promo-banner.zip'),
});
console.log(`Wrote ${outPath} (${(bytes / 1024).toFixed(0)} KB)`);
