// Public image assets stored in Netlify Blobs. Reads are public; writes need the
// same signed access cookie as the rest of the editor.
import {isAuthorized, lockedAPI} from './access.mjs';

const MAX = 5 * 1024 * 1024;
const EXT_MIME = {jpg:'image/jpeg', png:'image/png', gif:'image/gif', bmp:'image/bmp', webp:'image/webp'};
const KEY_RE = /^([a-f0-9]{64})\.(jpg|png|gif|bmp|webp)$/;
const json = (data, status = 200) => new Response(JSON.stringify(data), {
 status,
 headers:{'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}
});

function assetHeaders(key, mime, size) {
 return {
  'Content-Type':mime,
  'Content-Length':String(size),
  'Cache-Control':'public, max-age=31536000, immutable',
  'ETag':'"' + key + '"',
  'X-Content-Type-Options':'nosniff'
 };
}

function hex(bytes) {
 return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(bytes) {
 return hex(await crypto.subtle.digest('SHA-256', bytes));
}

function normalizeBytes(value) {
 if (!value) return null;
 if (value instanceof Uint8Array) return value;
 if (value instanceof ArrayBuffer) return new Uint8Array(value);
 if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
 return null;
}

function notFound() {
 return new Response('Imagen no encontrada.', {
  status:404,
  headers:{'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}
 });
}

export function createHandler(store) {
 async function readAsset(key) {
  try { return normalizeBytes(await store.get('assets/' + key, {type:'arrayBuffer'})); }
  catch { return null; }
 }

 async function publicAsset(request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || url.pathname.split('/').filter(Boolean).pop() || '';
  const match = KEY_RE.exec(key);
  if (!match) return notFound();
  const bytes = await readAsset(key);
  if (!bytes) return notFound();
  const headers = assetHeaders(key, EXT_MIME[match[2]], bytes.byteLength);
  const inm = request.headers.get('if-none-match');
  if (inm && inm.split(',').map(value => value.trim()).includes(headers.ETag)) {
   return new Response(null, {status:304, headers});
  }
  return new Response(request.method === 'HEAD' ? null : bytes, {status:200, headers});
 }

 async function writeAsset(request) {
  if (!(await isAuthorized(request))) return lockedAPI();
  const url = new URL(request.url);
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) {
   return json({error:'Utiliza el editor de esta web.'}, 403);
  }
  const key = url.searchParams.get('key') || '';
  const match = KEY_RE.exec(key);
  if (!match) return json({error:'Clave de imagen no válida.'}, 400);
  if (Number(request.headers.get('content-length')) > MAX) return json({error:'La imagen supera 5 MB.'}, 413);
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const expected = EXT_MIME[match[2]];
  if (type && type !== expected && type !== 'application/octet-stream') {
   return json({error:'El formato de la imagen no coincide con la clave.'}, 415);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) return json({error:'La imagen está vacía.'}, 400);
  if (bytes.byteLength > MAX) return json({error:'La imagen supera 5 MB.'}, 413);
  if (await sha256(bytes) !== match[1]) return json({error:'La imagen no coincide con su identificador.'}, 400);
  try {
   await store.set('assets/' + key, bytes, {metadata:{mime:expected, size:String(bytes.byteLength)}});
  } catch (error) {
   console.error('Assets:', error.message);
   return json({error:'No se ha podido guardar la imagen. Inténtalo de nuevo.'}, 503);
  }
  return json({key, src:'/assets/' + key, mime:expected, size:bytes.byteLength}, 201);
 }

 return async request => {
  try {
   if (request.method === 'GET' || request.method === 'HEAD') return publicAsset(request);
   if (request.method === 'POST' || request.method === 'PUT') return writeAsset(request);
   return json({error:'Método no permitido.'}, 405);
  } catch (error) {
   console.error('Assets:', error.message);
   return json({error:'No se ha podido acceder a las imágenes.'}, 503);
  }
 };
}
