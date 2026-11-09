process.env.EXAMSTUDIO_PASSWORD='clave-assets';
process.env.EXAMSTUDIO_SESSION_SECRET='secreto-assets-solo-para-pruebas';
const test=require('node:test'),assert=require('node:assert/strict');
const origin='https://exam.example';
const request=(path,init)=>new Request(origin+path,init);
const login=()=>request('/__access/login?next=/',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:'clave-assets'})});
const hex=bytes=>[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
const digest=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
function memory(){const data=new Map();return {data,async get(key){return data.get(key)??null;},async set(key,value){data.set(key,value);}};}
async function setup(){const {createHandler}=await import('./server/assets.mjs');const store=memory(),handler=createHandler(store);const cookie=(await (await import('./server/access.mjs')).access(login(),()=>new Response(null,{status:204}))).headers.get('set-cookie').split(';')[0];return {handler,store,cookie};}

test('Asset reads are public and immutable; missing or invalid keys return 404',async()=>{
 const {handler}=await setup();
 const bytes=new TextEncoder().encode('imagen de prueba'),key=await digest(bytes)+'.png';
 const upload=await handler(request('/.netlify/functions/assets?key='+key,{method:'POST',headers:{origin,'content-type':'image/png'},body:bytes}));
 assert.equal(upload.status,401);
 const missing=await handler(request('/.netlify/functions/assets?key='+key));
 assert.equal(missing.status,404);
 const invalid=await handler(request('/assets/not-a-key.png'));
 assert.equal(invalid.status,404);
});

test('Authenticated uploads verify the SHA-256 key and serve permanent URLs with ETag support',async()=>{
 const {handler,store,cookie}=await setup();
 const bytes=new TextEncoder().encode('contenido binario'),hash=await digest(bytes),key=hash+'.webp';
 const upload=await handler(request('/.netlify/functions/assets?key='+key,{method:'POST',headers:{origin,cookie,'content-type':'image/webp'},body:bytes}));
 assert.equal(upload.status,201);
 const created=await upload.json();
 assert.equal(created.src,'/assets/'+key);
 assert.equal(store.data.has('assets/'+key),true);
 const get=await handler(request('/assets/'+key));
 assert.equal(get.status,200);
 assert.equal(get.headers.get('content-type'),'image/webp');
 assert.match(get.headers.get('cache-control'),/immutable/);
 assert.deepEqual(new Uint8Array(await get.arrayBuffer()),bytes);
 const cached=await handler(request('/.netlify/functions/assets?key='+key,{headers:{'if-none-match':'"'+key+'"'}}));
 assert.equal(cached.status,304);
 const head=await handler(request('/.netlify/functions/assets?key='+key,{method:'HEAD'}));
 assert.equal(head.status,200);
 assert.equal(head.headers.get('content-length'),String(bytes.length));
});

test('Uploads reject mismatched hashes, extensions, origins and oversized bodies',async()=>{
 const {handler,cookie}=await setup();
 const bytes=new TextEncoder().encode('abc'),hash=await digest(bytes);
 const mismatch=await handler(request('/.netlify/functions/assets?key='+'0'.repeat(64)+'.png',{method:'POST',headers:{origin,cookie,'content-type':'image/png'},body:bytes}));
 assert.equal(mismatch.status,400);
 const badType=await handler(request('/.netlify/functions/assets?key='+hash+'.png',{method:'POST',headers:{origin,cookie,'content-type':'image/jpeg'},body:bytes}));
 assert.equal(badType.status,415);
 const badOrigin=await handler(request('/.netlify/functions/assets?key='+hash+'.png',{method:'POST',headers:{origin:'https://attacker.test',cookie,'content-type':'image/png'},body:bytes}));
 assert.equal(badOrigin.status,403);
 const tooLarge=await handler(request('/.netlify/functions/assets?key='+hash+'.png',{method:'POST',headers:{origin,cookie,'content-type':'image/png','content-length':String(6*1024*1024)},body:bytes}));
 assert.equal(tooLarge.status,413);
 const method=await handler(request('/.netlify/functions/assets?key='+hash+'.png',{method:'DELETE',headers:{origin,cookie}}));
 assert.equal(method.status,405);
});
