// One shared password for entering the site; it does not create user roles.
// Configura estas variables fuera del repositorio (ámbito Functions en Netlify).
function settings(){
 const get=name=>typeof Netlify!=='undefined'?Netlify.env.get(name):typeof process!=='undefined'?process.env[name]:undefined;
 return {password:get('EXAMSTUDIO_PASSWORD'),secret:get('EXAMSTUDIO_SESSION_SECRET')};
}
async function signingKey(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const COOKIE='examstudio_access',DURATION=24*60*60;
const encoder=new TextEncoder();
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function destination(value){return typeof value==='string'&&value.startsWith('/')&&!/^\/[\/\\]/.test(value)&&!/[\u0000-\u001f\u007f]/.test(value)&&!value.startsWith('/__access/')?value:'/';}
function cookie(request,value,maxAge){return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function isAuthorized(request,now=Date.now()){
 const {password,secret}=settings();if(!password||!secret)return false;
 const value=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!value||value.length>150)return false;
 const [expires,signature,...extra]=value.split('.');
 if(extra.length||!/^\d{10,11}$/.test(expires)||!signature||!/^[\w-]{43}$/.test(signature)||Number(expires)<=Math.floor(now/1000)||Number(expires)>Math.floor(now/1000)+DURATION+60)return false;
 try{const raw=Uint8Array.from(atob(signature.replace(/-/g,'+').replace(/_/g,'/')+'='),c=>c.charCodeAt(0));return await crypto.subtle.verify('HMAC',await signingKey(secret),raw,encoder.encode(expires));}catch{return false;}
}
export function lockedAPI(){return Response.json({error:'Introduce la contraseña para entrar. Recarga la página si tu acceso ha caducado.'},{status:401,headers:{'Cache-Control':'no-store'}});}
function screen(request,error=false){
 const url=new URL(request.url),next=destination(url.pathname==='/__access/login'?url.searchParams.get('next'):url.pathname+url.search);
 const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#135c53"><title>Acceso · ExamStudio</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f7f8f3;color:#203d36;font:16px system-ui,sans-serif}.card{width:100%;max-width:430px;background:white;padding:38px;border:1px solid #dce3d6;border-radius:18px;box-shadow:0 12px 45px #203d3609}.brand{color:#135c53;font-size:23px;font-weight:750;margin-bottom:34px}.brand span{font-weight:400}.eyebrow{color:#698077;text-transform:uppercase;font-size:10px;letter-spacing:2px}h1{font:normal 38px Georgia,serif;margin:12px 0}p{color:#6b7b73;font-size:14px;line-height:1.7}label{display:block;font-size:13px;font-weight:600;margin:28px 0 8px}input{display:block;width:100%;font:inherit;padding:13px;border:1px solid #c9d6cc;border-radius:8px}input:focus{outline:3px solid #a8c98c;outline-offset:2px}button{margin-top:20px;width:100%;padding:14px;background:#135c53;color:white;border:0;border-radius:8px;font:600 15px system-ui;cursor:pointer}button:hover{background:#0b4841}.error{color:#9b3d32;background:#fff3ef;border-radius:7px;padding:10px;margin-top:16px}.note{font-size:11px;margin-top:24px}@media(max-width:430px){.card{padding:28px}}</style><main class="card"><div class="brand">Exam<span>Studio</span></div><div class="eyebrow">Tu espacio de estudio</div><h1>Bienvenido de nuevo.</h1><p>Introduce la contraseña para acceder a los exámenes.</p><form method="post" action="/__access/login?next=${escape(encodeURIComponent(next))}"><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus maxlength="200" ${error?'aria-invalid="true" aria-describedby="access-error"':''}>${error?'<p class="error" id="access-error" role="alert">Contraseña incorrecta. Vuelve a intentarlo.</p>':''}<button type="submit">Entrar →</button></form><p class="note">El acceso se recuerda durante 24 horas en este navegador.</p></main></html>`;
 return new Response(html,{status:error?401:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'"}});
}
export async function access(request,next){
 const url=new URL(request.url);
 // The hashed image URLs are not enumerable and are referenced by shared
 // exams, so their reads stay public. Uploads still require the cookie.
 if((request.method==='GET'||request.method==='HEAD')&&(url.pathname.startsWith('/assets/')||url.pathname==='/.netlify/functions/assets'))return next();
 const {password,secret}=settings();
 if(!password||!secret)return new Response('Configura las variables de acceso en el servidor.',{status:503,headers:{'Cache-Control':'no-store'}});
 if(url.pathname==='/__access/login'&&request.method==='POST'){
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return new Response('Origen no permitido',{status:403});
  if(Number(request.headers.get('content-length'))>2048)return new Response('Solicitud demasiado grande',{status:413});
  const body=await request.text();if(body.length>2048)return new Response('Solicitud demasiado grande',{status:413});
  const supplied=new URLSearchParams(body).get('password')||'';
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(supplied)),crypto.subtle.digest('SHA-256',encoder.encode(password))]);
  let different=0;const one=new Uint8Array(a),two=new Uint8Array(b);for(let i=0;i<one.length;i++)different|=one[i]^two[i];
  if(different)return screen(request,true);
  const expiry=String(Math.floor(Date.now()/1000)+DURATION),signature=base64(await crypto.subtle.sign('HMAC',await signingKey(secret),encoder.encode(expiry)));
  return new Response(null,{status:303,headers:{Location:destination(url.searchParams.get('next')),'Set-Cookie':cookie(request,expiry+'.'+signature,DURATION),'Cache-Control':'no-store'}});
 }
 if(await isAuthorized(request)){
  const response=await next();const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }
 if(url.pathname.startsWith('/.netlify/functions/'))return lockedAPI();
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Introduce la contraseña para entrar.',{status:401,headers:{'Cache-Control':'no-store'}});
 return screen(request);
}
