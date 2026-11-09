(function(root){
 'use strict';
 const BASE='dp800-bateria4',KEY='examstudio-library-v1',TYPES=['single','multiple','binary','yesno','drag','dropdown','hotarea','imagedrag'];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const IMAGE_MIMES=['image/jpeg','image/png','image/gif','image/bmp','image/webp'];
 const ASSET_RE=/^\/assets\/([a-f0-9]{64})\.(jpg|png|gif|bmp|webp)$/;
 const ASSET_ABS_RE=/^https:\/\/[^/\s]+\/assets\/([a-f0-9]{64})\.(jpg|png|gif|bmp|webp)$/;
 const SOLUTION_RE=/^(?:solutions\/[a-zA-Z0-9-]+\.png|\/assets\/[a-f0-9]{64}\.(?:jpg|png|gif|bmp|webp))$/;
 function validImage(image,label){
  if(!image||typeof image!=='object')throw Error('La imagen '+label+' no tiene un formato válido.');
  if(image.src!==undefined){
   if(typeof image.src!=='string'||(!ASSET_RE.test(image.src)&&!ASSET_ABS_RE.test(image.src)))throw Error('La imagen '+label+' no apunta a un recurso válido.');
  }else if(typeof image.base64==='string'&&image.base64.trim()){
   if(!IMAGE_MIMES.includes(image.mime))throw Error('La imagen '+label+' no tiene un formato válido.');
   if(image.base64.length>3000000)throw Error('La imagen '+label+' supera el tamaño máximo permitido.');
  }else throw Error('La imagen '+label+' no tiene un formato válido.');
  if(image.mime!==undefined&&!IMAGE_MIMES.includes(image.mime))throw Error('La imagen '+label+' no tiene un formato válido.');
  if(image.width!==undefined&&(!Number.isInteger(image.width)||image.width<1||image.width>10000))throw Error('El ancho de la imagen '+label+' no es válido.');
  if(image.height!==undefined&&(!Number.isInteger(image.height)||image.height<1||image.height>10000))throw Error('La altura de la imagen '+label+' no es válida.');
  if(image.key!==undefined&&(typeof image.key!=='string'||!/^[a-f0-9]{64}$/i.test(image.key)))throw Error('El identificador de la imagen '+label+' no es válido.');
 }
 function validRect(rect,label){
  if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0||rect.x<0||rect.y<0)throw Error('La geometría de '+label+' no es válida.');
 }
 function insideImage(rect,image,label){
  if(rect.x+rect.width>image.width||rect.y+rect.height>image.height)throw Error('La geometría de '+label+' sale de la imagen.');
 }
 function validateParts(parts,label){
  if(!Array.isArray(parts))throw Error('El '+label+' no es una lista de contenidos.');
  parts.forEach((part,i)=>{
   if(!part||typeof part!=='object')throw Error('El '+label+' contiene un formato no permitido.');
   if(part.kind==='image')validImage(part.image,label+' ('+(i+1)+')');
   else if(!['text','transcription','markdown'].includes(part.kind)||typeof part.text!=='string')throw Error('El '+label+' contiene un formato no permitido.');
  });
 }
 function validateSolution(parts){
  if(!Array.isArray(parts))throw Error('La justificación no es una lista de contenidos.');
  parts.forEach((part,i)=>{
   if(!part||typeof part!=='object')throw Error('La justificación contiene un formato no permitido.');
   if(part.kind==='image'){
    if(part.src!==undefined){if(typeof part.src!=='string'||!SOLUTION_RE.test(part.src))throw Error('La justificación contiene una imagen no permitida.');}
    else validImage(part.image,'de la justificación ('+(i+1)+')');
   }else if(!['text','markdown'].includes(part.kind)||typeof part.text!=='string')throw Error('La justificación contiene un formato no permitido.');
  });
 }
 function validateImageQuestion(q){
  validImage(q.image,'principal');
  if(!Number.isInteger(q.image.width)||!Number.isInteger(q.image.height))throw Error('La imagen de la interacción necesita ancho y alto.');
  if(q.type==='hotarea'){
   if(!Array.isArray(q.areas)||!q.areas.length||q.areas.length>200||!Array.isArray(q.correct)||!q.correct.length)throw Error('La pregunta hot area necesita zonas y respuestas.');
   const ids=new Set();q.areas.forEach((area,i)=>{if(!Number.isInteger(area.id)||ids.has(area.id))throw Error('Las zonas hot area deben tener identificadores únicos.');ids.add(area.id);validRect(area,'la zona '+(i+1));insideImage(area,q.image,'la zona '+(i+1));});
   if(q.correct.some(id=>!ids.has(id))||new Set(q.correct).size!==q.correct.length)throw Error('Las zonas correctas de hot area no son válidas.');
   if(q.points!==1)throw Error('Hot area vale un punto.');
  }else{
   if(!Array.isArray(q.items)||!q.items.length||q.items.length>100||!Array.isArray(q.targets)||!q.targets.length||q.targets.length>100||!Array.isArray(q.correct)||q.correct.length!==q.targets.length)throw Error('La pregunta imagedrag necesita ítems, destinos y respuestas.');
   const itemIds=new Set();q.items.forEach((item,i)=>{if(!Number.isInteger(item.id)||itemIds.has(item.id))throw Error('Los ítems imagedrag deben tener identificadores únicos.');itemIds.add(item.id);if(item.image)validImage(item.image,'del ítem '+(i+1));if(item.rect!==undefined){validRect(item.rect,'el recorte del ítem '+(i+1));insideImage(item.rect,q.image,'el recorte del ítem '+(i+1));}});
   const targetIds=new Set();q.targets.forEach((target,i)=>{if(!Number.isInteger(target.id)||targetIds.has(target.id))throw Error('Los destinos imagedrag deben tener identificadores únicos.');targetIds.add(target.id);validRect(target,'el destino '+(i+1));insideImage(target,q.image,'el destino '+(i+1));});
   if(q.correct.some(id=>id!==null&&(!Number.isInteger(id)||!itemIds.has(id)))||q.points!==q.targets.length)throw Error('Las asignaciones imagedrag no son válidas.');
  }
 }
 function validate(bank){
  if(!bank||!bank.meta||typeof bank.meta.title!=='string'||!bank.meta.title.trim()||bank.meta.title.length>150)throw Error('Escribe un nombre de hasta 150 caracteres para el examen.');
  if(!Array.isArray(bank.questions)||bank.questions.length>1000)throw Error('El examen admite hasta 1000 preguntas.');
  if(!Number.isInteger(bank.meta.minutes)||bank.meta.minutes<1||bank.meta.minutes>1440)throw Error('La duración debe estar entre 1 y 1440 minutos.');
  if(!Number.isInteger(bank.meta.passingScore)||bank.meta.passingScore<0||bank.meta.passingScore>1000)throw Error('El corte debe estar entre 0 y 1000.');
  const ids=new Set();
  for(const q of bank.questions){
   if(!Number.isInteger(q.id)||q.id<1||ids.has(q.id))throw Error('Cada pregunta debe tener un número único.');ids.add(q.id);
   if(q.editorTitle!==undefined&&(typeof q.editorTitle!=='string'||q.editorTitle.length>150))throw Error('El título de la pregunta debe ser un texto de hasta 150 caracteres.');
   if(q.answerMarkdown!==undefined&&typeof q.answerMarkdown!=='boolean')throw Error('Formato de respuestas no válido.');
   if(!TYPES.includes(q.type))throw Error('Revisa el tipo de la pregunta '+q.id+'.');
   validateParts(q.body,'enunciado de la pregunta '+q.id);
   const hasBody=q.body.some(part=>part.kind==='image'||(typeof part.text==='string'&&part.text.trim()));
   if(!hasBody&&q.type!=='hotarea'&&q.type!=='imagedrag')throw Error('Revisa el enunciado de la pregunta '+q.id+'.');
   if(q.caseStudy!==undefined)validateParts(q.caseStudy,'caso de estudio de la pregunta '+q.id);
   validateSolution(q.solution);
   if(q.type==='hotarea'||q.type==='imagedrag'){validateImageQuestion(q);continue;}
   if(!Array.isArray(q.correct)||!q.correct.length)throw Error('Indica la respuesta correcta de la pregunta '+q.id+'.');
   if(['single','multiple','binary'].includes(q.type)){
    if(q.pools||!Array.isArray(q.options)||q.options.length<2||q.options.length>20||new Set(q.options.map(o=>o.id)).size!==q.options.length||q.options.some(o=>typeof o.id!=='string'||!/^[A-T]$/.test(o.id)||typeof o.text!=='string'||!o.text.trim()))throw Error('Añade al menos dos opciones válidas a la pregunta '+q.id+'.');
    q.options.forEach((option,i)=>{if(option.images!==undefined){if(!Array.isArray(option.images))throw Error('Las imágenes de la opción '+(i+1)+' no son válidas.');option.images.forEach((image,j)=>validImage(image,'de la opción '+(i+1)+' ('+(j+1)+')'));}});
    if(q.correct.some(c=>!q.options.some(o=>o.id===c))||new Set(q.correct).size!==q.correct.length||(q.type!=='multiple'&&q.correct.length!==1))throw Error('Selecciona la respuesta correcta de la pregunta '+q.id+'.');
    if(q.type==='binary'&&q.options.length!==2)throw Error('Yes/No simple necesita dos opciones.');
    if(q.points!==1)throw Error('La elección única o múltiple vale un punto.');
   }else{
    if(q.options||typeof q.template!=='string'||!Array.isArray(q.pools)||!q.pools.length||q.pools.length>20||q.correct.length!==q.pools.length||q.points!==q.pools.length||q.pools.some((p,i)=>!Array.isArray(p)||p.length<2||p.length>30||p.some(v=>typeof v!=='string'||!v.trim())||!Number.isInteger(q.correct[i])||q.correct[i]<0||q.correct[i]>=p.length))throw Error('Revisa las opciones y soluciones de cada apartado de la pregunta '+q.id+'.');
    if(q.type==='yesno'){
     if(q.pools.length!==3||q.template.split('\n').length!==3||q.pools.some(p=>p.join('|')!=='Yes|No'))throw Error('Triple Yes/No necesita tres afirmaciones.');
    }else{
     const slots=[...q.template.matchAll(/\{\{(\d+)\}\}/g)].map(m=>Number(m[1])).sort((a,b)=>a-b);
     if(slots.length!==q.pools.length||slots.some((n,i)=>n!==i))throw Error('Usa una vez cada hueco [1], [2]… en el texto de respuesta.');
     if(q.type==='drag'&&q.pools.some(p=>JSON.stringify(p)!==JSON.stringify(q.pools[0])))throw Error('Drag-and-drop utiliza la misma lista de valores en todos los huecos.');
    }
   }
  }
  return bank;
 }
 function normalize(bank){const b=clone(validate(bank));for(const q of b.questions){q.notes=Array.isArray(q.notes)?q.notes.filter(n=>typeof n==='string'):[];q.pages=Array.isArray(q.pages)&&q.pages.length===2&&q.pages.every(n=>Number.isInteger(n)&&n>0)?q.pages:[];}b.meta.title=b.meta.title.trim();b.meta.questions=b.questions.length;b.meta.totalPoints=b.questions.reduce((n,q)=>n+q.points,0);b.meta.types=Object.fromEntries(TYPES.map(t=>[t,b.questions.filter(q=>q.type===t).length]));b.meta.scoring='Un punto por respuesta de elección correcta (conjunto exacto en múltiple) y un punto por subapartado correcto. Nota = puntos obtenidos / puntos posibles × 1000.';return b;}
 function create(storage,builtin){
  let state={selected:BASE,exams:[]};
  try{const saved=JSON.parse(storage?.getItem(KEY)||'null');if(saved&&Array.isArray(saved.exams)){state.exams=saved.exams.filter(e=>{try{return e.id!==BASE&&typeof e.id==='string'&&!!validate(e.bank);}catch{return false;}});state.selected=[BASE,...state.exams.map(e=>e.id)].includes(saved.selected)?saved.selected:BASE;}}catch{}
  function commit(next){try{if(!storage)throw Error();storage.setItem(KEY,JSON.stringify(next));}catch{throw Error('No se ha podido guardar. Exporta una copia de tus exámenes y libera espacio en este navegador.');}state=next;}
  function list(){return [{id:BASE,builtin:true,bank:builtin},...state.exams].map(clone);}
  function get(id){const e=list().find(e=>e.id===id);if(!e)throw Error('No se encuentra este examen.');return e;}
  function add(bank){const b=normalize(bank),id='exam-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);commit({...state,selected:id,exams:[...state.exams,{id,bank:b}]});return id;}
  return {BASE,get,list,selected:()=>state.selected,
   select(id){get(id);commit({...state,selected:id});},
   add,
   update(id,bank){if(id===BASE)throw Error('Duplica el examen original para modificarlo.');get(id);const b=normalize(bank);commit({...state,exams:state.exams.map(e=>e.id===id?{id,bank:b}:e)});},
   duplicate(id){const b=get(id).bank;b.meta.title+=' · copia';return add(b);},
   remove(id){if(id===BASE)throw Error('El examen original está protegido.');get(id);commit({...state,selected:state.selected===id?BASE:state.selected,exams:state.exams.filter(e=>e.id!==id)});try{storage.removeItem?.('examstudio-session-'+id);storage.removeItem?.('examstudio-session-'+id+'-history');}catch{}},
   export(id){return JSON.stringify({format:'examstudio-exam',version:1,bank:get(id).bank},null,2);},
   import(text){if(text.length>5*1024*1024)throw Error('La copia supera el tamaño admitido.');let data;try{data=JSON.parse(text);}catch{throw Error('No se ha podido leer la copia del examen.');}if(data.format!=='examstudio-exam'||data.version!==1)throw Error('Selecciona una copia exportada desde ExamStudio.');return add(data.bank);}
  };
 }
 const api={BASE,KEY,TYPES,validate,normalize,create};root.ExamCatalog=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
