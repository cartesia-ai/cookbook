import { gzipSync } from 'node:zlib';
import { WIDGET_OUT, bundleWidget } from '../server/widget-bundle';

const js = await bundleWidget({ minify: true, outfile: WIDGET_OUT });
console.log(`dist/widget.js  ${(js.length / 1024).toFixed(1)} KB, ${(gzipSync(js).length / 1024).toFixed(1)} KB gzipped`);
