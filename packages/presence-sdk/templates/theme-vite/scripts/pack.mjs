import { packThemeDirectory } from '../../../dist/cli/pack.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { outPath, bytes } = await packThemeDirectory({
  dir: root,
  out: join(root, 'out', 'coastal-starter-theme.zip'),
});
console.log(`Wrote ${outPath} (${(bytes / 1024).toFixed(0)} KB)`);
