import {build} from 'esbuild';
import {copyFileSync, mkdirSync, rmSync} from 'node:fs';
rmSync('functions-built', {recursive:true, force:true});
await build({
 entryPoints:{exams:'netlify/functions/exams.mjs', assets:'netlify/functions/assets.mjs'},
 outdir:'functions-built',
 outExtension:{'.js':'.mjs'},
 bundle:true,
 platform:'node',
 target:'node22',
 format:'esm',
 banner:{js:'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);'}
});
mkdirSync('dist/vendor', {recursive:true});
copyFileSync('vce-converter-python/vce34_to_json.py', 'dist/vendor/vce34_to_json.py');
console.log('Funciones Netlify empaquetadas y conversor VCE copiado.');
