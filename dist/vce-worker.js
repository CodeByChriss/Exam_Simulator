/* Ejecuta vce34_to_json.py dentro de Pyodide para convertir el .vce sin salir del navegador. */
import {loadPyodide} from 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs';

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
let runtimePromise = null;
let scriptPromise = null;

function runtime() {
 if (!runtimePromise) runtimePromise = loadPyodide({indexURL:PYODIDE_URL});
 return runtimePromise;
}

function converterScript() {
 if (!scriptPromise) {
  scriptPromise = fetch('vendor/vce34_to_json.py', {cache:'no-store', credentials:'same-origin'})
   .then(response => {
    if (!response.ok) throw Error('No se ha podido cargar el conversor de Python (' + response.status + ').');
    return response.text();
   });
 }
 return scriptPromise;
}

self.onmessage = async event => {
 try {
  self.postMessage({type:'progress', stage:'runtime'});
  const pyodide = await runtime();
  const script = await converterScript();
  pyodide.FS.writeFile('/tmp/vce34_to_json.py', script);
  pyodide.FS.writeFile('/tmp/input.vce', new Uint8Array(event.data.buffer));
  self.postMessage({type:'progress', stage:'convert'});
  await pyodide.runPythonAsync(`
import sys, json
sys.path.insert(0, '/tmp')
import vce34_to_json as converter
data = open('/tmp/input.vce', 'rb').read()
result = converter.parse(data)
with open('/tmp/output.json', 'w', encoding='utf-8') as handle:
    json.dump(result, handle, ensure_ascii=False)
`);
  const json = pyodide.FS.readFile('/tmp/output.json', {encoding:'utf8'});
  try { pyodide.FS.unlink('/tmp/input.vce'); pyodide.FS.unlink('/tmp/output.json'); } catch (err) {}
  self.postMessage({type:'result', json});
 } catch (err) {
  self.postMessage({type:'error', message:String(err && err.message || err)});
 }
};
