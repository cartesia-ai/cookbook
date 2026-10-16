import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

export const WIDGET_ENTRY = join(import.meta.dirname, '..', 'widget', 'src', 'index.ts');
export const WIDGET_OUT = join(import.meta.dirname, '..', 'dist', 'widget.js');

export async function bundleWidget(opts: { minify: boolean; outfile?: string }): Promise<string> {
  const result = await build({
    entryPoints: [WIDGET_ENTRY],
    bundle: true,
    format: 'iife',
    target: ['es2022', 'chrome111', 'safari16.4', 'firefox115'],
    minify: opts.minify,
    legalComments: 'none',
    write: Boolean(opts.outfile),
    outfile: opts.outfile ?? 'widget.js',
    logLevel: 'silent',
  });
  if (opts.outfile) return readFile(opts.outfile, 'utf8');
  return result.outputFiles![0]!.text;
}

export function widgetSource(production: boolean): () => Promise<string> {
  if (!production) return () => bundleWidget({ minify: false });
  let cached: Promise<string> | null = null;
  return () =>
    (cached ??= readFile(WIDGET_OUT, 'utf8').catch(() => {
      cached = null;
      throw new Error('dist/widget.js is missing. Run npm run build first.');
    }));
}
