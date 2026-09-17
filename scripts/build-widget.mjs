import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const result = await build({
  entryPoints: [resolve(projectRoot, 'widget/widget.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  write: false,
  minify: true,
});
const script = result.outputFiles[0]?.text;
if (!script) throw new Error('Widget bundle was empty');

const template = await readFile(resolve(projectRoot, 'widget/template.html'), 'utf8');
await mkdir(resolve(projectRoot, 'dist'), { recursive: true });
await writeFile(resolve(projectRoot, 'dist/widget.html'), template.replace('/*__WIDGET_JS__*/', script));
console.log('Built dist/widget.html');
