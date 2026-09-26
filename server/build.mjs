// Bundles the server plus @pc/shared sources into dist/; other npm deps stay external.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@pc/shared');
const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external,
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
};
await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' });
await build({ ...common, entryPoints: ['src/scripts/fetchPhotos.ts'], outfile: 'dist/fetchPhotos.js' });
console.log('server built -> dist/');
