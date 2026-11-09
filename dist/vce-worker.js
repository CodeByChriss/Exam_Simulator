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
  self.postMessage({type:'progress', stage:'pillow'});
  await pyodide.loadPackage('pillow');
  pyodide.FS.writeFile('/tmp/vce34_to_json.py', script);
  pyodide.FS.writeFile('/tmp/input.vce', new Uint8Array(event.data.buffer));
  self.postMessage({type:'progress', stage:'convert'});
  await pyodide.runPythonAsync(`
import sys, json, os
sys.path.insert(0, '/tmp')
import vce34_to_json as converter
data = open('/tmp/input.vce', 'rb').read()
result = converter.parse(data)
with open('/tmp/output.json', 'w', encoding='utf-8') as handle:
    json.dump(result, handle, ensure_ascii=False)
os.makedirs('/tmp/vce-images', exist_ok=True)
meta = []
for key, info in converter.IMAGE_REGISTRY.items():
    ext = converter.IMAGE_EXT.get(info['mime'], 'bin')
    path = '/tmp/vce-images/' + key + '.' + ext
    with open(path, 'wb') as handle:
        handle.write(info['data'])
    meta.append({'key': key, 'mime': info['mime'], 'width': info['width'],
                 'height': info['height'], 'path': path})
with open('/tmp/vce-images/meta.json', 'w', encoding='utf-8') as handle:
    json.dump(meta, handle, ensure_ascii=False)
`);
  const json = pyodide.FS.readFile('/tmp/output.json', {encoding:'utf8'});
  const meta = JSON.parse(pyodide.FS.readFile('/tmp/vce-images/meta.json', {encoding:'utf8'}));
  const images = meta.map(item => ({
   key:item.key, mime:item.mime, width:item.width, height:item.height,
   bytes:pyodide.FS.readFile(item.path)
  }));
  const transfer = images.map(image => image.bytes.buffer);
  try {
   for (const item of meta) pyodide.FS.unlink(item.path);
   pyodide.FS.unlink('/tmp/vce-images/meta.json');
   pyodide.FS.unlink('/tmp/input.vce');
   pyodide.FS.unlink('/tmp/output.json');
  } catch (err) {}
  self.postMessage({type:'result', json, images}, transfer);
 } catch (err) {
  self.postMessage({type:'error', message:String(err && err.message || err)});
 }
};
