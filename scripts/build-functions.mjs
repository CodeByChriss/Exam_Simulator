import {build} from 'esbuild';
import {copyFileSync, mkdirSync} from 'node:fs';
await build({entryPoints:['netlify/functions/exams.mjs'],outfile:'functions-built/exams.mjs',bundle:true,platform:'node',target:'node22',format:'esm',banner:{js:'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'}});
mkdirSync('dist/vendor',{recursive:true});
copyFileSync('vce-converter-python/vce34_to_json.py','dist/vendor/vce34_to_json.py');
console.log('Función Netlify empaquetada y conversor VCE copiado.');
