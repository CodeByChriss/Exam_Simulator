/* Utilidades de imágenes: SHA-256, subida a Netlify Blobs y recortes en el navegador. */
(function(root){
 'use strict';
 const MIME_EXT={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/bmp':'bmp','image/webp':'webp'};
 const EXT_MIME={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',bmp:'image/bmp',webp:'image/webp'};
 const MAX=5*1024*1024;
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

 function extForMime(mime){return MIME_EXT[mime]||'bin';}
 function mimeForExt(ext){return EXT_MIME[String(ext||'').toLowerCase()]||'';}
 function assetSrc(key,mime){return '/assets/'+key+'.'+extForMime(mime);}
 function imageSrc(image){
  if(!image)return '';
  if(typeof image.src==='string'&&image.src)return image.src;
  if(image.mime&&image.base64)return `data:${image.mime};base64,${image.base64}`;
  return '';
 }
 async function sha256Hex(bytes){
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const digest=await crypto.subtle.digest('SHA-256',data);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
 }
 async function bitmapFromBlob(blob){
  if(typeof createImageBitmap==='function')return createImageBitmap(blob);
  const url=URL.createObjectURL(blob);
  try{
   const image=await new Promise((resolve,reject)=>{
    const element=new Image();
    element.onload=()=>resolve(element);
    element.onerror=()=>reject(Error('No se ha podido leer la imagen.'));
    element.src=url;
   });
   return image;
  }finally{URL.revokeObjectURL(url);}
 }
 async function dimensions(blob){
  const bitmap=await bitmapFromBlob(blob);
  const size={width:bitmap.width||bitmap.naturalWidth,height:bitmap.height||bitmap.naturalHeight};
  bitmap.close?.();
  return size;
 }
 function fileMime(file){
  return file.type||mimeForExt(String(file.name||'').split('.').pop());
 }
 async function readFile(file){
  if(!file)throw Error('Selecciona una imagen.');
  const mime=fileMime(file);
  if(!MIME_EXT[mime])throw Error('Formato de imagen no admitido. Usa JPEG, PNG, GIF, BMP o WebP.');
  if(file.size>MAX)throw Error('La imagen supera 5 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const size=await dimensions(file);
  return {bytes,mime,width:size.width,height:size.height};
 }
 async function uploadBytes(bytes,mime,key,options){
  options=options||{};
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(!MIME_EXT[mime])throw Error('Formato de imagen no admitido.');
  if(data.byteLength>MAX)throw Error('La imagen supera 5 MB.');
  const hash=key||await sha256Hex(data);
  const src=assetSrc(hash,mime);
  const endpoint='/.netlify/functions/assets?key='+encodeURIComponent(hash+'.'+extForMime(mime));
  const fetchImpl=options.fetchImpl||fetch;
  let last=null;
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await fetchImpl(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':mime},body:data});
    if(response.ok){
     const result=await response.json().catch(()=>({}));
     return {key:hash,src:result.src||src,mime,width:options.width,height:options.height};
    }
    let message='No se ha podido subir la imagen ('+response.status+').';
    try{const body=await response.json();if(body&&body.error)message=body.error;}catch{}
    if(response.status<500)throw Error(message);
    last=Error(message);
   }catch(err){last=err;}
   if(attempt<2)await delay(250*(attempt+1));
  }
  throw last||Error('No se ha podido subir la imagen.');
 }
 async function uploadImages(images,keys,options){
  options=options||{};
  const byKey=new Map((images||[]).map(image=>[image.key,image]));
  const unique=[...new Set(keys||[])];
  const total=unique.length;
  let done=0,bytes=0,cursor=0;
  const concurrency=Math.max(1,Math.min(6,options.concurrency||4));
  const report=()=>{if(options.onProgress)options.onProgress({done,total,bytes});};
  report();
  async function worker(){
   while(cursor<unique.length){
    const key=unique[cursor++];
    const image=byKey.get(key);
    if(!image)throw Error('Falta el contenido de una imagen del examen.');
    const result=await uploadBytes(image.bytes,image.mime,key,{width:image.width,height:image.height});
    done++;
    bytes+=image.bytes.byteLength||image.bytes.length||0;
    report();
    options.onUploaded?.(result);
   }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,total)},()=>worker()));
  return {done,total,bytes};
 }
 async function fetchBlob(src){
  const response=await fetch(src,{credentials:'same-origin'});
  if(!response.ok)throw Error('No se ha podido cargar la imagen para recortarla.');
  return response.blob();
 }
 async function cropImage(src,rect){
  const blob=await fetchBlob(src);
  const bitmap=await bitmapFromBlob(blob);
  const width=Math.max(1,Math.round(rect.width));
  const height=Math.max(1,Math.round(rect.height));
  const x=Math.max(0,Math.round(rect.x));
  const y=Math.max(0,Math.round(rect.y));
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');
  context.drawImage(bitmap,x,y,width,height,0,0,width,height);
  bitmap.close?.();
  const output=canvas.convertToBlob
   ?await canvas.convertToBlob({type:'image/png'})
   :await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('No se ha podido recortar la imagen.')),'image/png'));
  return {bytes:new Uint8Array(await output.arrayBuffer()),mime:'image/png',width,height};
 }
 async function uploadFile(file,options){
  const info=await readFile(file);
  const result=await uploadBytes(info.bytes,info.mime,null,{width:info.width,height:info.height,...(options||{})});
  return {key:result.key,src:result.src,mime:info.mime,width:info.width,height:info.height};
 }
 const api={extForMime,mimeForExt,assetSrc,imageSrc,sha256Hex,readFile,dimensions,uploadBytes,uploadImages,cropImage,uploadFile,MAX};
 root.ExamAssets=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
