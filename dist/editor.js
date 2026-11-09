(function(root){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const names={single:'Elección única',multiple:'Elección múltiple',binary:'Yes / No simple',yesno:'Triple Yes / No',drag:'Drag-and-drop',dropdown:'Desplegables',hotarea:'Hot area sobre imagen',imagedrag:'Drag & drop sobre imagen'};
 const $=s=>document.querySelector(s);let ctx=null,screen='library',examId=null,draft=null,original=null,originalDraft=null,originalParts=null,dirty=false,saving=false;
 const clone=x=>JSON.parse(JSON.stringify(x)), lines=s=>/^---\s*$/m.test(String(s||''))?String(s).split(/^---\s*$/m).map(x=>x.replace(/^\n|\n$/g,'')).filter(x=>x.trim()):String(s||'').split('\n').map(x=>x.trim()).filter(Boolean);
 const textOf=parts=>(parts||[]).filter(p=>typeof p.text==='string').map(p=>p.text).join('\n\n');
 const imagesOf=parts=>(parts||[]).filter(p=>p&&p.kind==='image'&&(p.image||p.src)).map(p=>p.image||{src:p.src});
 function imageSrc(image){if(!image)return '';if(typeof image.src==='string'&&image.src)return image.src;if(typeof ExamAssets!=='undefined'){if(image.key&&image.mime)return ExamAssets.assetSrc(image.key,image.mime);return ExamAssets.imageSrc(image);}return image.mime&&image.base64?`data:${image.mime};base64,${image.base64}`:'';}
 function mergeParts(text,images,markdown,previous){
  const value=String(text||''),list=(images||[]).filter(Boolean),prev=Array.isArray(previous)?previous:[];
  if(prev.length&&textOf(prev)===value&&JSON.stringify(imagesOf(prev))===JSON.stringify(list))return clone(prev);
  const parts=[];
  if(value.trim())parts.push({kind:markdown?'markdown':'text',text:markdown?value:value.trim()});
  for(const image of list)parts.push(image&&typeof image.src==='string'&&/^solutions\//.test(image.src)&&!image.key&&!image.mime&&!image.base64?{kind:'image',src:image.src}:{kind:'image',image:clone(image)});
  return parts;
 }
 function imageStrip(images,field,choice){
  const list=images||[],choiceAttr=choice===undefined?'':` data-choice="${choice}"`;
  return `<div class="editor-image-strip">${list.map((image,index)=>`<figure><img src="${esc(imageSrc(image))}" alt="Imagen ${index+1}" loading="lazy"><button type="button" class="text-delete" data-editor-action="remove-image" data-field="${field}" data-index="${index}"${choiceAttr} aria-label="Eliminar imagen ${index+1}">×</button></figure>`).join('')}<label class="secondary image-add">+ Imagen<input type="file" accept="image/jpeg,image/png,image/gif,image/bmp,image/webp" data-image-add="${field}"${choiceAttr} hidden></label></div>`;
 }
 function title(){return ctx.catalog.get(examId).bank.meta.title;}
 function frame(content){$('#app').innerHTML=`<header class="topbar"><button class="brand" data-editor-action="exit"><img src="icon.svg" alt=""><span>Exam<span class="brand-light">Studio</span><small>BIBLIOTECA Y EDITOR</small></span></button><button class="secondary" data-editor-action="exit">Volver a practicar →</button></header><main class="manager-wrap">${content}<p class="local-save-note">Los exámenes y preguntas se guardan en la biblioteca compartida. Cualquier persona con el enlace puede verlos y editarlos. Tu progreso y tus notas se guardan solo en este navegador.</p><div id="manager-status" role="status"></div></main>`;window.scrollTo(0,0);}
 function status(text,error=false){const el=$('#manager-status');if(el){el.className=error?'notice':'manager-success';el.textContent=text;el.scrollIntoView({block:'nearest'});}}
 function confirm(title,text,go){const m=$('#modal');m.innerHTML=`<form method="dialog"><button class="close-modal" aria-label="Cerrar">×</button><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="modal-actions"><button class="secondary" value="cancel">Cancelar</button><button type="button" class="primary" id="manager-confirm">Confirmar</button></div></form>`;m.showModal();$('#manager-confirm').onclick=()=>{m.close();go();};}
 function leave(go){if(dirty)confirm('¿Descartar los cambios sin guardar?','La pregunta guardada no se modificará.',()=>{dirty=false;go();});else go();}
 function library(){screen='library';dirty=false;const exams=ctx.catalog.list();frame(`<div class="manager-heading"><div><span class="eyebrow">TU ESPACIO DE ESTUDIO</span><h1>Biblioteca de exámenes</h1><p>Crea tus propias baterías y practica con las mismas herramientas.</p></div><div class="manager-actions"><button class="secondary" data-editor-action="refresh">Actualizar biblioteca</button>${ctx.catalog.localCount?.()?`<button class="secondary" data-editor-action="publish-local">Compartir exámenes locales (${ctx.catalog.localCount()})</button>`:""}<button class="secondary" data-editor-action="import">Importar copia (JSON)</button><button class="secondary" data-editor-action="import-vce">Importar VCE</button><button class="primary" data-editor-action="new-exam">+ Crear examen</button><input id="exam-import" type="file" accept=".json,application/json" hidden></div></div><div class="exam-library-grid">${exams.map(e=>`<article class="library-card"><span class="pill ${e.builtin?'neutral':'pass'}">${e.builtin?'Original del PDF':'Examen compartido'}</span><h2>${esc(e.bank.meta.title)}</h2><p>${e.bank.questions.length} preguntas · ${e.bank.meta.totalPoints} puntos</p><p>Corte ${e.bank.meta.passingScore}/1000 · ${e.bank.meta.minutes} min opcionales</p><div class="library-card-actions"><button class="primary" data-editor-action="practice" data-exam="${esc(e.id)}" ${e.bank.questions.length?'':'disabled'}>Practicar →</button><button class="secondary" data-editor-action="detail" data-exam="${esc(e.id)}">${e.builtin?'Ver preguntas':'Editar examen'}</button></div><div class="library-small-actions"><button data-editor-action="duplicate" data-exam="${esc(e.id)}">Duplicar</button><button data-editor-action="share" data-exam="${esc(e.id)}">Copiar enlace</button><button data-editor-action="export" data-exam="${esc(e.id)}">Exportar copia</button>${e.builtin?'':`<button data-editor-action="delete-exam" data-exam="${esc(e.id)}">Eliminar</button>`}</div></article>`).join('')}</div>`);}
 function newExam(){const m=$('#modal');m.innerHTML=`<form id="new-exam-form"><button class="close-modal" type="button" data-editor-action="close-modal" aria-label="Cerrar">×</button><h2>Crear examen</h2><label class="editor-field">Nombre del examen<input name="title" required maxlength="150" placeholder="Ej.: Mi examen de SQL"></label><div class="editor-two-cols"><label class="editor-field">Duración en minutos<input name="minutes" type="number" min="1" max="1440" value="120" required></label><label class="editor-field">Corte sobre 1000<input name="passingScore" type="number" min="0" max="1000" value="700" required></label></div><p>El temporizador seguirá siendo opcional al iniciar la sesión.</p><p id="new-exam-error" role="alert"></p><div class="modal-actions"><button class="primary" type="submit">Crear examen</button></div></form>`;m.showModal();$('#new-exam-form').onsubmit=async e=>{e.preventDefault();const submit=e.target.querySelector('[type=submit]');submit.disabled=true;saving=true;try{const f=new FormData(e.target);examId=await ctx.catalog.add({meta:{title:f.get('title'),minutes:Number(f.get('minutes')),passingScore:Number(f.get('passingScore'))},questions:[]});m.close();detail(examId);}catch(err){$('#new-exam-error').textContent=err.message;}finally{saving=false;if(submit.isConnected)submit.disabled=false;}};}
 function detail(id){examId=id;screen='detail';dirty=false;const e=ctx.catalog.get(id),b=e.bank;frame(`<button class="back-link" data-editor-action="library">← Biblioteca</button><div class="manager-heading"><div><span class="eyebrow">${e.builtin?'ORIGINAL PROTEGIDO':'EXAMEN COMPARTIDO'}</span><h1>${esc(b.meta.title)}</h1><p>${b.questions.length} preguntas · ${b.meta.totalPoints} puntos</p></div><button class="primary" data-editor-action="${e.builtin?'duplicate':'new-question'}" data-exam="${esc(id)}">${e.builtin?'Duplicar para editar':'+ Añadir pregunta'}</button></div>${e.builtin?'<p class="notice">Este examen conserva la transcripción original del PDF. Duplícalo para añadir preguntas o modificar su contenido en tu copia personal.</p>':`<form id="exam-settings" class="exam-settings"><label class="editor-field">Nombre<input name="title" required maxlength="150" value="${esc(b.meta.title)}"></label><label class="editor-field">Minutos<input name="minutes" type="number" min="1" max="1440" required value="${b.meta.minutes}"></label><label class="editor-field">Corte /1000<input name="passingScore" type="number" min="0" max="1000" required value="${b.meta.passingScore}"></label><button class="secondary" type="submit">Guardar ajustes</button></form>`}<div class="manager-question-list">${b.questions.length?b.questions.map(q=>`<div class="manager-question-row"><span class="question-badge">${q.id}</span><div>${q.editorTitle?`<strong>${esc(q.editorTitle)}</strong><small class="question-excerpt">${esc(q.body.map(p=>p.text).join(' ').replace(/\[\[INTERACTION\]\]/g,'').slice(0,160))}</small>`:`<strong>${esc(q.body.map(p=>p.text).join(' ').replace(/\[\[INTERACTION\]\]/g,'').slice(0,160))}</strong>`}<small>${names[q.type]} · ${q.points} punto${q.points===1?'':'s'}</small></div>${e.builtin?'':`<button class="secondary" data-editor-action="edit-question" data-question="${q.id}">Editar</button><button class="text-delete" data-editor-action="delete-question" data-question="${q.id}">Eliminar</button>`}</div>`).join(''):'<div class="empty-history">Añade tu primera pregunta para empezar a practicar.</div>'}</div>`);const form=$('#exam-settings');if(form)form.onsubmit=async ev=>{ev.preventDefault();const submit=form.querySelector("[type=submit]");submit.disabled=true;saving=true;try{const f=new FormData(form);b.meta.title=f.get('title');b.meta.minutes=Number(f.get('minutes'));b.meta.passingScore=Number(f.get('passingScore'));await ctx.catalog.update(id,b);detail(id);status('Ajustes guardados.');}catch(err){status(err.message,true);}finally{saving=false;if(submit.isConnected)submit.disabled=false;}};}
 function seed(type='single'){
  const base={type,editorTitle:'',body:'',caseStudy:'',explanation:'',markdown:true,bodyImages:[],caseStudyImages:[],solutionImages:[],choices:type==='binary'?[{text:'Yes',correct:false,images:[]},{text:'No',correct:false,images:[]}]:[{text:'',correct:false,images:[]},{text:'',correct:false,images:[]},{text:'',correct:false,images:[]},{text:'',correct:false,images:[]}],pool:'',template:'',targets:Array.from({length:type==='yesno'?3:2},(_,i)=>({label:'',options:'',correct:''}))};
  if(type==='hotarea')return {...base,image:null,areas:[],correct:[]};
  if(type==='imagedrag')return {...base,image:null,items:[],targets:[],correct:[]};
  return base;
 }
 function question(id=null){
  screen='question';
  original=id===null?null:ctx.catalog.get(examId).bank.questions.find(q=>q.id===id);
  draft=seed(original?.type);
  originalParts=null;
  if(original){
   const q=original;
   draft.editorTitle=q.editorTitle||'';
   const separated=ExamCaseStudy.split(q);
   draft.markdown=q.answerMarkdown??(q.body.some(p=>p.kind==='markdown')||q.solution.some(p=>p.kind==='markdown')||(q.caseStudy||[]).some(p=>p.kind==='markdown'));
   draft.caseStudy=textOf(separated.context);
   draft.body=textOf(separated.question).replace(/\[\[INTERACTION\]\]/g,'');
   draft.explanation=textOf(q.solution);
   draft.caseStudyImages=imagesOf(separated.context).map(clone);
   draft.bodyImages=imagesOf(separated.question).map(clone);
   draft.solutionImages=imagesOf(q.solution).map(clone);
   originalParts={body:separated.question,caseStudy:separated.context,solution:q.solution};
   if(q.options){
    draft.choices=q.options.map(o=>({text:o.text,correct:q.correct.includes(o.id),images:clone(o.images||[])}));
   }else if(q.type==='hotarea'){
    draft.image=q.image?clone(q.image):null;
    draft.areas=clone(q.areas||[]);
    draft.correct=clone(q.correct||[]);
   }else if(q.type==='imagedrag'){
    draft.image=q.image?clone(q.image):null;
    draft.items=clone(q.items||[]);
    draft.targets=clone(q.targets||[]);
    draft.correct=clone(q.correct||[]);
   }else{
    draft.template=q.type==='yesno'?'':q.template.replace(/\{\{(\d+)\}\}/g,(_,i)=>'['+(Number(i)+1)+']');
    draft.pool=q.type==='drag'?q.pools[0].join(q.pools[0].some(x=>x.includes('\n'))?'\n---\n':'\n'):'';
    draft.targets=q.pools.map((p,i)=>({label:q.type==='yesno'?q.template.split('\n')[i]:'Apartado '+(i+1),options:p.join(p.some(x=>x.includes('\n'))?'\n---\n':'\n'),correct:String(q.correct[i])}));
   }
  }
  dirty=false;questionForm();readDraft();originalDraft=JSON.stringify({...draft,editorTitle:''});
 }
 function readDraft(){
  const f=$('#question-form');if(!f)return;
  draft.editorTitle=f.elements.editorTitle.value;
  draft.body=f.elements.body.value;
  draft.caseStudy=f.elements.caseStudy.value;
  draft.explanation=f.elements.explanation.value;
  draft.markdown=f.elements.markdown.checked;
  if(f.elements.template)draft.template=f.elements.template.value;
  if(f.elements.pool)draft.pool=f.elements.pool.value;
  draft.choices=[...f.querySelectorAll('[data-choice-row]')].map((row,index)=>({text:row.querySelector('textarea').value,correct:row.querySelector('input').checked,images:clone(draft.choices[index]?.images||[])}));
  if(draft.type!=='hotarea'&&draft.type!=='imagedrag')draft.targets=[...f.querySelectorAll('[data-target-row]')].map(row=>({label:row.querySelector('[data-target-label]').value,options:row.querySelector('[data-target-options]')?.value||'Yes\nNo',correct:row.querySelector('[data-target-correct]').value}));
 }
 function selectOptions(options,value){return '<option value="">Elige la correcta…</option>'+options.map((o,i)=>`<option value="${i}" ${String(i)===String(value)?'selected':''}>${esc(o)}</option>`).join('');}
 function interactions(){
  const d=draft;
  if(d.type==='hotarea'||d.type==='imagedrag')return `<section class="editor-section geometry-section"><h2>Imagen y zonas</h2><p>${d.type==='hotarea'?'Dibuja las zonas seleccionables sobre la imagen y marca las correctas.':'Dibuja los destinos sobre la imagen, asigna cada uno a un ítem y ajusta el recorte del que se extrae cada miniatura.'}</p><div id="geometry-editor" class="geometry-host"></div></section>`;
  if(['single','multiple','binary'].includes(d.type))return `<section class="editor-section"><h2>Opciones y respuesta correcta</h2><p>${d.type==='multiple'?'Marca todas las opciones correctas. Se exigirá el conjunto exacto al responder.':'Marca una sola opción correcta.'} ${d.type==='binary'?'Las dos opciones saldrán en orden aleatorio.':''}</p><div class="editor-options">${d.choices.map((o,i)=>`<div class="editor-option" data-choice-row><label><input type="${d.type==='multiple'?'checkbox':'radio'}" name="correct-choice" ${o.correct?'checked':''} aria-label="Opción ${i+1} correcta"><span>${String.fromCharCode(65+i)}</span></label><textarea rows="2" aria-label="Texto de opción ${i+1}" placeholder="Escribe esta opción…" required>${esc(o.text)}</textarea>${imageStrip(o.images,'choice',i)}${d.type!=='binary'?`<button type="button" class="text-delete" data-editor-action="remove-choice" data-index="${i}" aria-label="Eliminar opción ${i+1}">×</button>`:''}</div>`).join('')}</div>${d.type!=='binary'?'<button type="button" class="secondary" data-editor-action="add-choice">+ Añadir opción</button>':''}</section>`;
  return `<section class="editor-section"><h2>${d.type==='yesno'?'Afirmaciones y soluciones':'Zona de respuesta'}</h2><p>${d.type==='yesno'?'Escribe las tres afirmaciones y selecciona Yes o No para cada una.':'Los apartados y sus opciones conservarán el orden que escribas.'}</p>${d.type==='drag'?`<label class="editor-field">Valores disponibles, uno por línea<textarea name="pool" rows="5" data-pool required placeholder="Primer valor&#10;Segundo valor">${esc(d.pool)}</textarea><small>Puedes reutilizar valores. Para opciones Markdown de varias líneas, separa cada valor con una línea que contenga solo --- .</small></label>`:''}<div class="editor-targets">${d.targets.map((t,i)=>`<fieldset data-target-row><legend>${d.type==='yesno'?'Afirmación':'Apartado'} ${i+1}</legend><label class="editor-field">${d.type==='yesno'?'Afirmación':'Etiqueta del apartado'}<${d.type==='yesno'?'textarea rows="2"':'input'} data-target-label ${d.type==='yesno'?'required':''} ${d.type==='yesno'?'':`value="${esc(t.label)}"`}>${d.type==='yesno'?esc(t.label)+'</textarea>':''}</label>${d.type==='dropdown'?`<label class="editor-field">Opciones: una por línea, o separadas con --- si contienen varias líneas<textarea rows="4" data-target-options required>${esc(t.options)}</textarea></label>`:''}<label class="editor-field">Respuesta correcta<select data-target-correct required>${selectOptions(d.type==='yesno'?['Yes','No']:d.type==='drag'?lines(d.pool):lines(t.options),t.correct)}</select></label>${d.type!=='yesno'?`<button type="button" class="text-delete" data-editor-action="remove-target" data-index="${i}">Eliminar apartado</button>`:''}</fieldset>`).join('')}</div>${d.type!=='yesno'?`<button type="button" class="secondary" data-editor-action="add-target">+ Añadir apartado</button><label class="editor-field">Texto o código de la zona de respuesta (opcional)<textarea name="template" rows="7" placeholder="Ejemplo: SELECT [1] FROM [2]">${esc(d.template)}</textarea><small>Coloca [1], [2]… en la posición exacta de cada hueco. Puedes incluirlos dentro de bloques Markdown con lenguaje (sql, python, etc.). Si lo dejas vacío, se usarán las etiquetas anteriores.</small></label>`:''}</section>`;
 }
 function questionForm(){frame(`<button class="back-link" data-editor-action="detail-back">← ${esc(title())}</button><div class="manager-heading"><div><span class="eyebrow">EDITOR DE PREGUNTAS</span><h1>${original?'Editar pregunta '+original.id:'Nueva pregunta'}</h1><p>Define el enunciado, la interacción y su solución.</p></div></div><form id="question-form"><label class="editor-field">Título de la pregunta (opcional)<input name="editorTitle" maxlength="150" placeholder="Ej.: Consultas con JOIN" value="${esc(draft.editorTitle)}"><small>Solo se muestra en la lista de preguntas del editor; no aparece durante el examen ni en su revisión.</small></label><label class="editor-field type-field">Tipo de pregunta<select id="question-type">${Object.entries(names).map(([k,v])=>`<option value="${k}" ${draft.type===k?'selected':''}>${v}</option>`).join('')}</select></label><div class="markdown-toolbar"><label><input type="checkbox" name="markdown" id="use-markdown" ${draft.markdown?'checked':''}> Interpretar enunciado, respuestas y justificación como Markdown</label><p>Admite tablas, títulos, listas, negrita, enlaces y bloques de código.</p><button type="button" class="secondary" data-editor-action="load-markdown">Cargar enunciado .md</button><input id="markdown-import" type="file" accept=".md,.markdown,text/markdown,text/plain" hidden><span id="markdown-file-status" role="status"></span></div><label class="editor-field">Caso de estudio (opcional)<textarea name="caseStudy" rows="6" placeholder="Contexto, requisitos, tablas y datos comunes del caso…">${esc(draft.caseStudy)}</textarea>${imageStrip(draft.caseStudyImages,'caseStudy')}<small>Se mostrará plegado durante el examen. La pregunta se escribe aparte, en Enunciado.</small></label><details class="markdown-preview"><summary>Vista previa del caso de estudio</summary><div id="caseStudy-preview"></div></details><label class="editor-field">Enunciado<textarea name="body" rows="7" ${draft.type==='hotarea'||draft.type==='imagedrag'?'':'required'} placeholder="Escribe la pregunta, los datos del caso y el código necesario…">${esc(draft.body)}</textarea>${imageStrip(draft.bodyImages,'body')}</label><details class="markdown-preview" open><summary>Vista previa del enunciado</summary><div id="body-preview"></div></details>${interactions()}<label class="editor-field">Justificación de la respuesta correcta<textarea name="explanation" rows="6" required placeholder="Explica por qué esta es la solución correcta…">${esc(draft.explanation)}</textarea>${imageStrip(draft.solutionImages,'solution')}</label><details class="markdown-preview" open><summary>Vista previa de la justificación</summary><div id="explanation-preview"></div></details>${original?.solution.some(p=>p.kind==='image')?'<p class="notice">Esta pregunta incluye capturas de solución heredadas del PDF. Al guardar esta edición se usará la justificación de texto del editor; la pregunta original del PDF permanece protegida.</p>':''}<p id="question-error" class="editor-error" role="alert"></p><div class="editor-save-bar"><button class="secondary" type="button" data-editor-action="detail-back">Cancelar</button><button class="primary" type="submit">Guardar pregunta</button></div></form>`);$('#question-form').onsubmit=saveQuestion;refreshPreviews();mountGeometry();}
 function mountGeometry(){
  if(!(draft.type==='hotarea'||draft.type==='imagedrag')||typeof ExamGeometryEditor==='undefined')return;
  const host=$('#geometry-editor');if(!host)return;
  ExamGeometryEditor.mount(host,{type:draft.type,image:draft.image,areas:draft.areas,items:draft.items,targets:draft.targets,correct:draft.correct,onChange:value=>{draft.image=value.image;draft.areas=value.areas;draft.items=value.items;draft.targets=value.targets;draft.correct=value.correct;dirty=true;}});
 }
 async function saveQuestion(ev){
  ev.preventDefault();readDraft();
  const submit=ev.target.querySelector("[type=submit]");submit.disabled=true;saving=true;
  try{
   const bank=ctx.catalog.get(examId).bank,d=draft,id=original?.id??Math.max(0,...bank.questions.map(q=>q.id))+1;
   if(original&&JSON.stringify({...d,editorTitle:''})===originalDraft){
    const kept=clone(original);
    if(d.editorTitle.trim())kept.editorTitle=d.editorTitle.trim();else delete kept.editorTitle;
    bank.questions[bank.questions.findIndex(p=>p.id===id)]=kept;
    await ctx.catalog.update(examId,bank);dirty=false;detail(examId);status('Título guardado.');return;
   }
   const body=mergeParts(d.body,d.bodyImages,d.markdown,originalParts?.body);
   const solution=mergeParts(d.explanation,d.solutionImages,d.markdown,originalParts?.solution);
   const caseStudy=mergeParts(d.caseStudy,d.caseStudyImages,d.markdown,originalParts?.caseStudy);
   const q={id,type:d.type,answerMarkdown:d.markdown,body,solution:solution.length?solution:[{kind:'text',text:'(Sin justificación en el fichero VCE original.)'}],pages:clone(original?.pages||[]),notes:clone(original?.notes||[]),sourceImages:clone(original?.sourceImages||[]),source:original?.source||'manual'};
   if(d.editorTitle.trim())q.editorTitle=d.editorTitle.trim();
   if(caseStudy.length)q.caseStudy=caseStudy;
   if(!body.some(part=>part.kind==='image'||(typeof part.text==='string'&&part.text.trim()))&&!['hotarea','imagedrag'].includes(d.type))throw Error('Completa el enunciado y su justificación.');
   if(!d.explanation.trim()&&!d.solutionImages.length)throw Error('Completa el enunciado y su justificación.');
   if(['single','multiple','binary'].includes(d.type)){
    q.options=d.choices.map((o,i)=>({id:String.fromCharCode(65+i),text:d.markdown?o.text:o.text.trim(),...(o.images&&o.images.length?{images:clone(o.images)}:{})}));
    q.correct=d.choices.flatMap((o,i)=>o.correct?[q.options[i].id]:[]);q.points=1;
    if(!q.correct.length)throw Error('Marca al menos una respuesta correcta.');
   }else if(d.type==='hotarea'){
    if(!d.image)throw Error('Selecciona la imagen de la interacción.');
    if(!d.areas.length)throw Error('Dibuja al menos una zona hot area.');
    if(!d.correct.length)throw Error('Marca al menos una zona correcta.');
    q.image=clone(d.image);q.areas=clone(d.areas);q.correct=[...new Set(d.correct.map(Number))];q.points=1;
   }else if(d.type==='imagedrag'){
    if(!d.image)throw Error('Selecciona la imagen de la interacción.');
    if(!d.items.length)throw Error('Añade al menos un ítem arrastrable.');
    if(!d.targets.length)throw Error('Dibuja al menos un destino.');
    q.image=clone(d.image);
    q.items=clone(d.items).map(item=>({id:item.id,rect:item.rect,image:item.image||null}));
    q.targets=clone(d.targets);
    q.correct=d.targets.map((_,i)=>d.correct[i]===null||d.correct[i]===undefined?null:Number(d.correct[i]));
    q.points=q.targets.length;
   }else{
    q.pools=d.targets.map(t=>d.type==='yesno'?['Yes','No']:d.type==='drag'?lines(d.pool):lines(t.options));
    q.correct=d.targets.map(t=>t.correct===''?-1:Number(t.correct));
    q.points=d.targets.length;
    q.template=d.type==='yesno'?d.targets.map(t=>t.label.trim().replace(/\n/g,' ')).join('\n'):d.template.trim()?d.template.replace(/\[(\d+)\]/g,(_,n)=>'{{'+(Number(n)-1)+'}}'):d.targets.map((t,i)=>(t.label.trim()||'Apartado '+(i+1))+': {{'+i+'}}').join('\n');
    if(d.type==='yesno'&&d.targets.some(t=>!t.label.trim()))throw Error('Completa las tres afirmaciones.');
   }
   const index=bank.questions.findIndex(p=>p.id===id);
   if(index<0)bank.questions.push(q);else bank.questions[index]=q;
   await ctx.catalog.update(examId,bank);dirty=false;detail(examId);status('Pregunta guardada. Ya está disponible para practicar.');
  }catch(err){$('#question-error').textContent=err.message;$('#question-error').scrollIntoView({block:'center'});}
  finally{saving=false;if(submit.isConnected)submit.disabled=false;}
 }
 function refreshPreviews(){
  const f=$('#question-form');if(!f)return;
  for(const key of ['body','caseStudy','explanation']){
   const value=f.elements[key].value,target=$('#'+key+'-preview');
   target.innerHTML=!value.trim()?'<p class="preview-empty">La vista previa aparecerá aquí mientras escribes.</p>':f.elements.markdown.checked?ExamMarkdown.render(value):'<div class="prose">'+esc(value)+'</div>';
  }
  let answers=$('#answers-preview');if(!answers){const section=$('#question-form .editor-section');if(section){answers=document.createElement('div');answers.id='answers-preview';answers.className='answers-preview';section.appendChild(answers);}}
  if(answers){const fields=[...f.querySelectorAll('[data-choice-row] textarea,[data-pool],[data-target-options],[data-target-label]')];answers.innerHTML='<h3>Vista previa de respuestas</h3>'+fields.filter(x=>x.value.trim()).map(x=>'<div class="answer-preview-item">'+(f.elements.markdown.checked?ExamMarkdown.render(x.value):'<div class="prose">'+esc(x.value)+'</div>')+'</div>').join('');}
 }
 function refreshAnswers(){if(!draft)return;const pool=$('[data-pool]');document.querySelectorAll('[data-target-row]').forEach(row=>{const s=row.querySelector('[data-target-correct]'),val=s.value;const opts=pool?lines(pool.value):row.querySelector('[data-target-options]')?lines(row.querySelector('[data-target-options]').value):['Yes','No'];s.innerHTML=selectOptions(opts,Number(val)<opts.length?val:'');});}
 document.addEventListener('input',ev=>{if(!ctx||screen!=='question'||!ev.target.closest('#question-form'))return;dirty=true;refreshPreviews();if(ev.target.matches('[data-pool],[data-target-options]'))refreshAnswers();});
 document.addEventListener('change',async ev=>{if(!ctx)return;if(ev.target.id==='question-type'){readDraft();const common={editorTitle:draft.editorTitle,body:draft.body,caseStudy:draft.caseStudy,explanation:draft.explanation,markdown:draft.markdown,bodyImages:clone(draft.bodyImages||[]),caseStudyImages:clone(draft.caseStudyImages||[]),solutionImages:clone(draft.solutionImages||[])};draft={...seed(ev.target.value),...common};dirty=true;questionForm();}else if(ev.target.closest('#question-form'))dirty=true;if(ev.target.id==='use-markdown')refreshPreviews();
 if(ev.target.id==='markdown-import'&&ev.target.files[0]){
  try{
   const file=ev.target.files[0];if(!/\.(md|markdown)$/i.test(file.name))throw Error('Selecciona un archivo .md o .markdown.');
   if(file.size>1024*1024)throw Error('El enunciado Markdown no puede superar 1 MB.');
   const text=(await file.text()).replace(/^\uFEFF/,'');
   if(!ctx||screen!=='question')return;
   const apply=()=>{$('[name=body]').value=text;$('#use-markdown').checked=true;dirty=true;refreshPreviews();$('#body-preview').parentElement.open=true;$('#markdown-file-status').textContent='Enunciado cargado: '+file.name+'. Las opciones y la solución se completan en el editor.';};
   if($('[name=body]').value.trim())confirm('¿Sustituir el enunciado actual?','Solo se reemplaza el enunciado. Se conservan las opciones y la justificación.',apply);else apply();
  }catch(err){status(err.message,true);}finally{ev.target.value='';}
 }
 const imageInput=ev.target.closest('[data-image-add]');
 if(imageInput&&imageInput.files&&imageInput.files[0]){
  const chosen=imageInput.files[0];
  try{
   if(typeof ExamAssets==='undefined')throw Error('El módulo de imágenes no está disponible. Recarga la página.');
   const image=await ExamAssets.uploadFile(chosen);
   readDraft();
   const field=imageInput.dataset.imageAdd;
   if(field==='choice'){
    const index=Number(imageInput.dataset.choice);
    draft.choices[index].images=[...(draft.choices[index].images||[]),image];
   }else{
    const key=field+'Images';draft[key]=[...(draft[key]||[]),image];
   }
   dirty=true;questionForm();status('Imagen añadida.');
  }catch(err){status(err.message,true);}
  finally{imageInput.value='';}
 }
 if(ev.target.id==='exam-import'&&ev.target.files[0]){try{const f=ev.target.files[0];if(f.size>5*1024*1024)throw Error('La copia supera 5 MB.');const id=await ctx.catalog.import(await f.text());detail(id);status('Copia importada como un examen nuevo.');}catch(err){status(err.message,true);}}});
 document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-editor-action]');if(!ctx||!b||saving)return;ev.preventDefault();const a=b.dataset.editorAction,id=b.dataset.exam;b.disabled=true;try{
  if(a==='refresh'){await ctx.catalog.refresh?.();library();status('Biblioteca actualizada.');}
  if(a==='publish-local'){const n=await ctx.catalog.publishLocal();library();status(n+' exámenes incorporados a la biblioteca compartida.');}
  if(a==='share'){const url=new URL(location.href);url.search='';url.searchParams.set('exam',id);const input=document.createElement('input');input.value=url.href;input.readOnly=true;const el=$('#manager-status');el.replaceChildren(input);input.select();try{await navigator.clipboard.writeText(url.href);status('Enlace copiado: '+url.href);}catch{input.setAttribute('aria-label','Enlace del examen');}}
  if(a==='exit')leave(()=>{const cb=ctx.onExit;ctx=null;cb();});
  if(a==='library')leave(library);
  if(a==='new-exam')newExam();
  if(a==='close-modal')$('#modal').close();
  if(a==='detail')detail(id);
  if(a==='detail-back')leave(()=>detail(examId));
  if(a==='practice'){ctx.catalog.select(id);const cb=ctx.onSelect;ctx=null;cb(id);}
  if(a==='new-question')question();
  if(a==='edit-question')question(Number(b.dataset.question));
  if(a==='duplicate'){const newId=await ctx.catalog.duplicate(id);detail(newId);status('Copia compartida creada. Puedes añadir y editar preguntas.');}
  if(a==='delete-exam')confirm('¿Eliminar este examen compartido?','Se eliminará de la biblioteca para todos. Exporta una copia si quieres conservarlo.',async()=>{try{await ctx.catalog.remove(id);library();}catch(e){status(e.message,true);}});
  if(a==='delete-question')confirm('¿Eliminar esta pregunta?','Las sesiones ya iniciadas conservarán su versión anterior.',async()=>{try{const bank=ctx.catalog.get(examId).bank;bank.questions=bank.questions.filter(q=>q.id!==Number(b.dataset.question));await ctx.catalog.update(examId,bank);detail(examId);}catch(e){status(e.message,true);}});
  if(a==='export'){const data=ctx.catalog.export(id),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=ctx.catalog.get(id).bank.meta.title.replace(/[^a-zA-Z0-9áéíóúñ_-]/g,'_')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Copia exportada. Guárdala para recuperar este examen.');}
  if(a==='import')$('#exam-import').click();
  if(a==='import-vce')vceImport();
  if(a==='load-markdown')$('#markdown-import').click();
  if(a==='add-choice'||a==='remove-choice'){readDraft();if(a==='add-choice'){if(draft.choices.length>=20)throw Error('Se admiten hasta 20 opciones.');draft.choices.push({text:'',correct:false,images:[]});}else{if(draft.choices.length<=2)throw Error('Conserva al menos dos opciones.');draft.choices.splice(Number(b.dataset.index),1);}dirty=true;questionForm();}
  if(a==='remove-image'){readDraft();const field=b.dataset.field,index=Number(b.dataset.index);if(field==='choice')draft.choices[Number(b.dataset.choice)].images.splice(index,1);else draft[field+'Images'].splice(index,1);dirty=true;questionForm();}
  if(a==='add-target'||a==='remove-target'){readDraft();if(a==='add-target'){if(draft.targets.length>=20)throw Error('Se admiten hasta 20 apartados.');draft.targets.push({label:'',options:'',correct:''});}else{if(draft.targets.length<=1)throw Error('Conserva al menos un apartado.');draft.targets.splice(Number(b.dataset.index),1);}dirty=true;questionForm();}
 }catch(err){status(err.message,true);}finally{if(b.isConnected)b.disabled=false;}});
 function vceImport(){
  screen='vce';dirty=false;
  if(typeof ExamVCE==='undefined'){frame('<button class="back-link" data-editor-action="library">← Biblioteca</button><p class="notice">No se ha podido cargar el módulo de importación VCE. Recarga la página.</p>');return;}
  const local=location.protocol==='file:';
  frame(`<button class="back-link" data-editor-action="library">← Biblioteca</button>
  <div class="manager-heading"><div><span class="eyebrow">IMPORTAR EXAMEN</span><h1>Importar VCE</h1><p>Convierte un examen de VCE Studio (versión 34), revisa el informe y guarda las imágenes en la nube.</p></div></div>
  <div class="vce-warning" role="note"><strong>Usa el Designer VERDE de la carpeta Player (versión portable). No uses el Designer azul de clase.</strong><p>Si tienes un .vce creado con el Designer azul, ábrelo con el Designer verde y pulsa <b>Guardar</b>: se convierte automáticamente a v34 (cabecera 85 A8 03 04).</p></div>
  ${local?'<p class="notice">La importación VCE necesita la web publicada o <code>netlify dev</code>: el conversor de Python y las imágenes no pueden cargarse desde <code>file://</code>.</p>':''}
  <div id="vce-drop" class="vce-drop" role="button" tabindex="0" aria-label="Arrastra un fichero .vce o pulsa para elegirlo"><span class="vce-drop-icon" aria-hidden="true">⇩</span><strong>Arrastra un .vce aquí</strong><span>o pulsa para elegir un fichero</span><input id="vce-file" type="file" accept=".vce,application/octet-stream" hidden></div>
  <div id="vce-file-status" class="vce-file" role="status" aria-live="polite"></div>
  <div class="editor-save-bar"><button class="secondary" type="button" data-editor-action="library">Cancelar</button><button class="primary" id="vce-convert" type="button" disabled>Convertir y revisar</button></div>
  <div id="vce-report" class="vce-report" aria-live="polite"></div>`);
  const drop=$('#vce-drop'),input=$('#vce-file'),statusEl=$('#vce-file-status'),convert=$('#vce-convert'),report=$('#vce-report');
  let file=null,valid=false,busy=false,prepared=null;
  const size=n=>n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
  function setStatus(name,detail,cls){statusEl.className='vce-file'+(cls?' '+cls:'');statusEl.innerHTML='<strong>'+esc(name)+'</strong><span>'+esc(detail)+'</span>';}
  function setProgress(text){report.innerHTML='<p class="vce-progress">'+esc(text)+'</p>';}
  function reportHtml(info,error){
   const skipped=info.skipped||[],warnings=info.warnings||[],images=info.imagesImported||0;
   const exams=info.exams||info.examCount||1;
   return `<div class="vce-report-card">
    <div class="vce-report-head"><span class="pill ${skipped.length?'':'pass'}">${skipped.length?'Revisión necesaria':'Importación preparada'}</span><strong>${info.imported} pregunta${info.imported===1?'':'s'} lista${info.imported===1?'':'s'}</strong></div>
    <p>${exams} examen${exams===1?'':'es'} · ${images} imagen${images===1?'':'es'}${info.imageBytes?' ('+size(info.imageBytes)+')':''}</p>
    ${error?`<p class="vce-report-error" role="alert">${esc(error)}</p>`:''}
    ${skipped.length?`<div class="vce-report-block"><h3>Preguntas omitidas (${skipped.length})</h3><p>Pulsa una entrada para ver el número de pregunta, el tipo, el motivo y los detalles del fichero original.</p><ul class="vce-issues">${skipped.map((issue,index)=>`<li><button type="button" class="vce-issue" data-vce-issue="${index}"><span>Pregunta ${esc(issue.id ?? issue.question ?? '—')} · ${esc(issue.typeLabel||issue.type||'—')}</span><small>${esc(issue.reason||'Sin detalle')}</small></button></li>`).join('')}</ul></div>`:'<p class="vce-report-ok">No se ha omitido ninguna pregunta.</p>'}
    ${warnings.length?`<div class="vce-report-block"><h3>Avisos (${warnings.length})</h3><ul class="vce-warning-list">${warnings.map(warning=>`<li>${esc(warning)}</li>`).join('')}</ul></div>`:''}
    <div class="vce-report-actions"><button class="primary" type="button" data-vce-create ${prepared&&prepared.banks.length?'':'disabled'}>${images?'Subir '+images+' imagen'+(images===1?'':'es')+' y crear examen':'Crear examen'}</button></div>
    <div id="vce-upload-progress" class="vce-upload-progress" role="status"></div>
   </div>`;
  }
  function issueDetails(issue){
   const d=issue.details||{};
   const rows=[
    ['Examen',d.exam||issue.exam||'—'],
    ['Pregunta VCE',d.question??issue.id??'—'],
    ['Tipo',d.typeLabel||d.type||issue.typeLabel||issue.type||'—'],
    ['Motivo',d.reason||issue.reason||'—'],
    ['Respuestas correctas',Array.isArray(d.correctAnswers)?d.correctAnswers.join(', '):(d.correctAnswers??'—')],
    ['Opciones',d.options??'—'],
    ['Zonas hot area',d.areas??'—'],
    ['Ítems arrastrables',d.items??'—'],
    ['Destinos',d.targets??'—'],
    ['Imágenes en el enunciado',d.bodyImages??'—']
   ];
   return `<div class="vce-detail">${d.bodyText?`<div class="vce-detail-text"><h3>Enunciado original</h3><pre>${esc(d.bodyText)}</pre></div>`:''}<dl>${rows.map(([name,value])=>`<dt>${esc(name)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>${Array.isArray(d.warnings)&&d.warnings.length?`<div class="vce-detail-text"><h3>Avisos de la pregunta</h3><ul>${d.warnings.map(warning=>`<li>${esc(warning)}</li>`).join('')}</ul></div>`:''}</div>`;
  }
  function openIssue(index){
   const issue=prepared&&prepared.report.skipped?prepared.report.skipped[index]:null;
   if(!issue)return;
   const modal=$('#modal');
   modal.innerHTML=`<form method="dialog"><button class="close-modal" aria-label="Cerrar">×</button><h2>Detalle de la pregunta omitida</h2><p>Estos datos vienen del fichero VCE original.</p>${issueDetails(issue)}<div class="modal-actions"><button class="secondary" value="close">Cerrar</button></div></form>`;
   modal.showModal();
  }
  function showUpload(done,total,bytes){
   const el=report.querySelector('#vce-upload-progress');if(!el)return;
   const pct=total?Math.round(done/total*100):0;
   el.innerHTML=`<div class="vce-progress-track"><span style="width:${pct}%"></span></div><p>Subiendo imágenes: ${done}/${total} · ${size(bytes)}</p>`;
  }
  async function accept(candidate){
   if(busy||!candidate)return;
   report.innerHTML='';prepared=null;
   try{
    const head=await candidate.slice(0,4).arrayBuffer();
    const result=ExamVCE.detect(new Uint8Array(head));
    file=candidate;
    if(result.ok){valid=true;convert.disabled=false;drop.classList.add('valid');drop.classList.remove('invalid');setStatus(candidate.name,'v34 detectada · '+size(candidate.size),'valid');}
    else{valid=false;convert.disabled=true;drop.classList.add('invalid');drop.classList.remove('valid');setStatus(candidate.name,result.message,'invalid');}
   }catch(err){file=null;valid=false;convert.disabled=true;prepared=null;drop.classList.add('invalid');drop.classList.remove('valid');setStatus(candidate.name,'No se ha podido leer el fichero.','invalid');}
  }
  async function createExam(){
   if(!prepared||!prepared.banks.length||busy)return;
   busy=true;
   const button=report.querySelector('[data-vce-create]');if(button)button.disabled=true;
   try{
    const keys=prepared.report.imageKeys||[];
    if(keys.length){
     if(typeof ExamAssets==='undefined')throw Error('El módulo de imágenes no está disponible. Recarga la página.');
     showUpload(0,keys.length,0);
     await ExamAssets.uploadImages(prepared.images,keys,{onProgress:({done,total,bytes})=>showUpload(done,total,bytes)});
    }
    const ids=[];
    for(const bank of prepared.banks)ids.push(await ctx.catalog.add(bank));
    const info=prepared.report;
    prepared=null;
    detail(ids[0]);
    status('Examen importado: '+info.imported+' preguntas'+(info.skipped.length?' · '+info.skipped.length+' omitidas':' · sin omisiones')+'.');
   }catch(err){
    busy=false;
    if(prepared)report.innerHTML=reportHtml(prepared.report,err.message||String(err));
   }finally{busy=false;}
  }
  drop.addEventListener('click',()=>{if(!busy)input.click();});
  drop.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&!busy){event.preventDefault();input.click();}});
  input.addEventListener('click',event=>event.stopPropagation());
  input.addEventListener('change',()=>{const chosen=input.files[0];input.value='';if(chosen)accept(chosen);});
  ['dragenter','dragover'].forEach(name=>drop.addEventListener(name,event=>{event.preventDefault();if(!busy)drop.classList.add('dragover');}));
  ['dragleave','drop'].forEach(name=>drop.addEventListener(name,event=>{event.preventDefault();drop.classList.remove('dragover');}));
  drop.addEventListener('drop',event=>{const chosen=event.dataTransfer&&event.dataTransfer.files&&event.dataTransfer.files[0];if(chosen)accept(chosen);});
  report.addEventListener('click',async event=>{
   const issueButton=event.target.closest('[data-vce-issue]');
   if(issueButton){openIssue(Number(issueButton.dataset.vceIssue));return;}
   if(event.target.closest('[data-vce-create]'))await createExam();
  });
  convert.addEventListener('click',async()=>{
   if(!file||!valid||busy)return;
   busy=true;convert.disabled=true;drop.classList.add('busy');prepared=null;
   try{
    if(location.protocol==='file:')throw Error('La importación VCE necesita la web publicada o netlify dev.');
    setProgress('Cargando el conversor de Python (solo la primera vez)…');
    const data=await ExamVCE.convert(file,stage=>setProgress(stage==='convert'?'Convirtiendo el fichero VCE…':'Cargando el conversor de Python (solo la primera vez)…'));
    setProgress('Preparando el examen…');
    const result=await ExamVCE.toBank(data.json,{fileName:file.name});
    data.images=Array.isArray(data.images)?data.images:[];
    result.report.imagesImported=result.report.imageKeys.length;
    result.report.examCount=result.banks.length;
    result.report.imageBytes=data.images.reduce((total,image)=>total+(image.bytes&&image.bytes.byteLength||0),0);
    if(!ExamVCE.contentLooksValid(data.json))result.report.warnings.unshift('La cabecera dice v34, pero el número o el título no parecen legibles. Puede ser una variante distinta de v34; revisa el examen después de crearlo.');
    prepared={banks:result.banks,report:result.report,images:data.images};
    report.innerHTML=reportHtml(result.report,result.banks.length?'':'No se ha podido crear ningún examen.');
   }catch(err){prepared=null;report.innerHTML='<p class="notice">'+esc(err.message||String(err))+'</p>';}
   finally{busy=false;convert.disabled=!valid;drop.classList.remove('busy');}
  });
 }

 root.ExamEditor={open(options){ctx=options;screen='library';dirty=false;library();}};
})(globalThis);
