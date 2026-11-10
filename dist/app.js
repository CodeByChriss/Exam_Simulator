/* Protected PDF bank plus personal exams created with the local editor. */
(async()=>{
 'use strict';
 const C=ExamCore;
 let storageBackend;try{storageBackend=localStorage;}catch{storageBackend=null;}
 let catalog;
 try{catalog=location.protocol==='file:'?ExamCatalog.create(storageBackend,ExamBank):await ExamSharedCatalog.connect(storageBackend,ExamBank);}
 catch(err){const box=document.querySelector('#app');box.innerHTML='<main class="manager-wrap"><h1>No se puede abrir la biblioteca compartida</h1><p id="boot-error"></p><button class="primary" id="boot-retry">Reintentar</button><button class="secondary" id="boot-export">Exportar exámenes de este navegador</button></main>';document.querySelector('#boot-error').textContent=err.message;document.querySelector('#boot-retry').onclick=()=>location.reload();document.querySelector('#boot-export').onclick=()=>{const local=ExamCatalog.create(storageBackend,ExamBank);for(const e of local.list().filter(e=>!e.builtin)){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([local.export(e.id)],{type:'application/json'}));a.href=u;a.download=e.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}};return;}
 const linked=new URLSearchParams(location.search).get('exam');if(linked&&catalog.list().some(e=>e.id===linked))catalog.select(linked);
 let activeId=catalog.selected(),meta,questions,byId,KEY,HISTORY;
 function useBank(bank){meta=bank.meta;questions=bank.questions;byId=new Map(questions.map(q=>[q.id,q]));}
 function setKeys(){KEY=activeId===ExamCatalog.BASE?'dp800-bateria4-v1':'examstudio-session-'+activeId;HISTORY=KEY+'-history';}
 setKeys();useBank(activeId?catalog.get(activeId).bank:ExamBank);
 const $=s=>document.querySelector(s), app=$('#app'), modal=$('#modal');
 const names={single:'Elección única',multiple:'Elección múltiple',binary:'Yes / No',yesno:'Triple Yes / No',drag:'Drag & drop',dropdown:'Desplegables',hotarea:'Hot area',imagedrag:'Drag & drop sobre imagen'};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let storageOK=true;
 function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
 let session=read(KEY,null),history=read(HISTORY,[]),view='home',review=false,mode='trainer',timed=false,retryIds=null,retryBank=null,chosen=null,draggedAt=0;
 if(!Array.isArray(history))history=[];
 if(!C.validSession(session,session?.bankSnapshot?.questions||questions))session=null;
 if(session&&!session.bankSnapshot)session.bankSnapshot={meta,questions};
 function switchExam(id){
   persist();if(!id){activeId=null;library();return;}catalog.select(id);activeId=id;setKeys();useBank(catalog.get(id).bank);
   session=read(KEY,null);history=read(HISTORY,[]);if(!Array.isArray(history))history=[];
   if(!C.validSession(session,session?.bankSnapshot?.questions||questions))session=null;
   if(session&&!session.bankSnapshot)session.bankSnapshot={meta,questions};
   retryIds=null;retryBank=null;chosen=null;review=false;home();
   if(session&&!session.finishedAt&&C.remaining(session)===0)finish('timeout');
 }
 function library(){persist();view='library';ExamEditor.open({catalog,onSelect:switchExam,onExit:()=>switchExam(catalog.selected())});}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(session));localStorage.setItem(HISTORY,JSON.stringify(history.slice(0,20)));}catch{storageOK=false;$('#storage-notice')?.classList.remove('hidden');}}
 const say=t=>$('#announcer').textContent=t;
 function header(){return `<header class="topbar"><button class="brand" data-action="home" aria-label="Ir al inicio"><img src="icon.svg" alt=""><span>Exam<span class="brand-light">Studio</span><small>${esc(meta.title)}</small></span></button><div class="top-meta"><button class="secondary library-nav" data-action="library">Biblioteca / editor</button><span class="status-dot"></span> Tu espacio de práctica <span class="avatar">C</span></div></header>`;}
 function footer(){return `<footer class="site-footer"><span>${esc(meta.title)} · ${questions.length} preguntas</span><span>Progreso guardado en este navegador</span></footer>`;}
 function prettyDate(t){return new Date(t).toLocaleString('es-ES',{dateStyle:'short',timeStyle:'short'});}
 function home(){
  if(!activeId||!catalog.list().some(e=>e.id===activeId)){library();return;}review=false;view='home';useBank(retryBank||catalog.get(activeId).bank);
  const resume=session&&!session.finishedAt;
  const last=history[0];
  app.innerHTML=header()+`<main class="home-wrap"><div class="eyebrow"><span class="tiny-line"></span> APRENDE. PRACTICA. AVANZA.</div><div class="hero"><div><h1>Tu próximo paso,<br><em>más cerca.</em></h1><p>Prepara ${esc(meta.title)}.<br>Entrena a tu ritmo o pon a prueba lo que sabes.</p></div><div class="hero-seal"><span>EXAM</span><strong>${questions.length}</strong><small>PREGUNTAS</small><i>✦</i></div></div>
  <div class="stats-strip"><div><strong>${questions.length}</strong><span>preguntas disponibles</span></div><div><strong>${new Set(questions.map(q=>q.type)).size}</strong><span>tipos de interacción</span></div><div><strong>${meta.passingScore}<span class="denom"> / 1000</span></strong><span>puntuación para aprobar</span></div><div><strong>${meta.minutes}<span class="denom"> min</span></strong><span>temporizador opcional</span></div></div>
  <section class="exam-picker"><label for="active-exam">Examen seleccionado<select id="active-exam">${catalog.list().map(e=>`<option value="${esc(e.id)}" ${e.id===activeId?'selected':''}>${esc(e.bank.meta.title)} · ${e.bank.questions.length} preguntas</option>`).join('')}</select></label><button class="secondary" data-action="library">Crear o editar exámenes ↗</button></section>
  ${resume?`<section class="resume"><div><span class="mini-label">TIENES UNA SESIÓN EN CURSO</span><h3>${session.mode==='trainer'?'Trainer':'Examen normal'} · ${Object.keys(session.answers).length} de ${session.order.length} respondidas</h3><p>${session.timed?'El tiempo sigue contando mientras estás fuera.':'Continúa exactamente donde lo dejaste.'}</p></div><button class="primary" data-action="resume">Continuar sesión <span>↗</span></button></section>`:''}
  ${session?.finishedAt?'<div class="last-session-link"><button class="secondary" data-action="results">Ver resultado de la última sesión ↗</button></div>':''}
  <div class="workspace"><section><div class="section-title"><h2>Elige cómo practicar</h2><span>01 / MODO</span></div><div class="mode-cards">
   <button class="mode-card ${mode==='trainer'?'selected':''}" data-mode="trainer" aria-pressed="${mode==='trainer'}"><span class="mode-icon">✧</span><span class="selection-dot"></span><span class="tag">APRENDE A TU RITMO</span><h3>Trainer</h3><p>Responde, entiende el porqué y sigue mejorando con cada pregunta.</p><span class="card-detail">✓ Aciertos: avance automático<br>✓ Fallos: corrección y justificación</span></button>
   <button class="mode-card ${mode==='normal'?'selected':''}" data-mode="normal" aria-pressed="${mode==='normal'}"><span class="mode-icon normal-icon">▤</span><span class="selection-dot"></span><span class="tag">PONTE A PRUEBA</span><h3>Examen normal</h3><p>Concentra todo lo que sabes. Recibe la nota y las soluciones al terminar.</p><span class="card-detail">✓ Sin pistas durante el examen<br>✓ Revisión completa al finalizar</span></button>
  </div><div class="study-note"><span>↻</span><p><strong>Cada intento, una oportunidad nueva.</strong><br>Preguntas siempre aleatorias. Al terminar, podrás repetir solo las falladas, incluidas las parcialmente correctas.</p></div></section>
  <aside class="session-config"><span class="mini-label">TU SESIÓN</span><h2>${retryIds?'Vuelve a intentarlo':'Todo listo para empezar'}</h2><div class="config-row"><span>Contenido</span><strong>${retryIds?retryIds.length+' falladas':'Batería completa'}</strong></div><div class="config-row"><span>Preguntas</span><strong>${retryIds?retryIds.length:questions.length}</strong></div><div class="config-row"><span>Modo</span><strong>${mode==='trainer'?'Trainer':'Normal'}</strong></div><label class="timer-toggle"><span><strong>Activar temporizador</strong><small>${meta.minutes} min · entrega automática</small></span><input id="timed" type="checkbox" ${timed?'checked':''}><span class="switch" aria-hidden="true"></span></label><p class="config-help">${timed?'El reloj continúa aunque cierres la página. Al agotarse, se entrega la sesión.':'Sin límite de tiempo. Estudia con calma.'}</p><button class="primary start-button" data-action="start" ${questions.length?'':'disabled'}>${retryIds?'Reintentar falladas':'Empezar sesión'} <span>→</span></button>${retryIds?'<button class="text-button" data-action="cancel-retry">Volver a la batería completa</button>':''}<p class="privacy-note">◉ Guardado automático en este dispositivo</p></aside></div>
  <details class="rules"><summary>Cómo se calcula tu nota y qué contiene el banco <span>+</span></summary><p>${esc(meta.scoring)} La batería completa suma <strong>${meta.totalPoints} puntos</strong>. Se muestra la nota entera truncada; se aprueba con una proporción real de al menos ${meta.passingScore}/1000. Las no contestadas valen cero; no hay penalización adicional.</p><p>Elección única, múltiple y Yes/No simple: opciones aleatorias. Drag-and-drop, desplegables y triple Yes/No: orden fijo. En múltiple, pulsa «Enviar respuesta»; marcar todas las opciones no da crédito parcial.</p>${activeId===ExamCatalog.BASE?'<p>Las imágenes de enunciados están transcritas. Las zonas de respuesta son controles nativos; el drag-and-drop también se puede completar con clic, teclado o desplegable. Las soluciones y justificaciones conservan su idioma original.</p><p>Cuando el PDF discrepa consigo mismo, se prioriza la respuesta declarada en la justificación. Las discrepancias de las preguntas 16, 30, 36 y 60 están anotadas en la revisión. La puntuación es la del simulador, calculada con el criterio acordado.</p><a href="Examenpdf.pdf" target="_blank" rel="noopener">Abrir PDF original (234 páginas) ↗</a>':'<p>Puedes añadir y editar preguntas desde la biblioteca. Los exámenes se guardan en la biblioteca compartida y cualquiera con el enlace puede editarlos. Una sesión ya iniciada conserva las preguntas que tenía al empezar.</p>'}</details>
  <section class="history"><div class="section-title"><h2>Tus últimos intentos</h2><span>${history.length?history.length+' GUARDADOS':'EMPIEZA TU RACHA'}</span></div>${history.length?history.slice(0,5).map(h=>`<div class="history-row"><span class="history-icon">${h.passed?'✓':'↗'}</span><div><strong>${h.mode==='trainer'?'Trainer':'Examen normal'}${h.isRetry?' · Reintento':''}</strong><small>${prettyDate(h.finishedAt)} · ${h.count} preguntas</small></div><span class="history-score">${h.score}<small>/1000</small></span><span class="pill ${h.passed?'pass':'fail'}">${h.passed?'Aprobado':'Suspenso'}</span></div>`).join(''):'<div class="empty-history"><span>◷</span> Tu progreso empieza con la primera pregunta.</div>'}</section>
  <p id="storage-notice" class="notice ${storageOK?'hidden':''}">No se ha podido guardar en este navegador. Mantén esta página abierta para conservar la sesión.</p></main>`+footer();
 }
 function start(){
   const go=()=>{useBank(retryBank||catalog.get(activeId).bank);if(!questions.length)return;session=C.createSession(questions,{mode,timed,ids:retryIds,minutes:meta.minutes,passingScore:meta.passingScore});session.bankSnapshot=JSON.parse(JSON.stringify({meta,questions}));retryIds=null;retryBank=null;persist();review=false;view='exam';renderExam();window.scrollTo(0,0);};
   if(session&&!session.finishedAt)ask('¿Empezar una sesión nueva?','Se sustituirá la sesión en curso guardada en este navegador.',go,'Empezar nueva');else go();
 }
 function openSession(){if(session.bankSnapshot)useBank(session.bankSnapshot);view=session.finishedAt?'results':'exam';review=false;if(!session.finishedAt&&C.remaining(session)===0)finish('timeout');else render();}
 function render(){if(view==='home')home();else if(view==='results')renderResults();else renderExam();}
 function prose(t){
   t=t.replace(/\[\[INTERACTION\]\]/g,'').trim();if(!t)return '';
   return `<div class="prose" >${esc(t)}</div>`;
 }
 function imageSrc(image){if(!image)return '';if(typeof image.src==='string'&&image.src)return image.src;if(image.mime&&image.base64)return `data:${image.mime};base64,${image.base64}`;return '';}
 function renderEmbeddedImage(image,alt='',className='embedded-image'){const src=imageSrc(image);if(!src)return '';const dims=(Number.isInteger(image.width)?` width="${image.width}"`:'')+(Number.isInteger(image.height)?` height="${image.height}"`:'');return `<img class="${className}" loading="lazy" decoding="async"${dims} src="${esc(src)}" alt="${esc(alt||'Imagen del examen')}">`;}
 function pct(value,total){return total>0?`${value/total*100}%`:'0%';}
 function renderParts(parts){return parts.map(p=>p.kind==='image'?(p.image?renderEmbeddedImage(p.image,p.alt,'content-image'):`<a class="solution-image" href="${esc(p.src)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(p.src)}" alt="${esc(p.alt)}"></a>`):p.kind==='markdown'?ExamMarkdown.render(p.text):p.kind==='transcription'?renderTranscription(p.text):prose(p.text)).join('');}
 function renderTranscription(t){
   t=t.replace(/\[\[INTERACTION\]\]/g,'').trim();if(!t)return '';
   if(t.startsWith('Table names |')||t.startsWith('Tables |')||t.startsWith('Column |')||t.startsWith('Name |')){
     const rows=t.split('\n').map(r=>r.split(' | '));return `<div class="table-scroll"><table class="source-table" lang="en"><thead><tr>${rows[0].map(s=>`<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(r=>`<tr>${r.map(s=>`<td>${esc(s).replace(/; /g,'<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
   }
   return `<div class="transcription"><span class="transcription-label">TRANSCRIPCIÓN DEL PDF</span>${prose(t)}</div>`;
 }
 function body(q){
   const {context,question}=ExamCaseStudy.split(q);
   const open=!!session?.caseStudyOpen?.[q.id];
   return (context.length?`<details class="case-study" data-case-study="${q.id}" ${open?'open':''}><summary><strong>Caso de estudio</strong><span class="case-closed-label">Mostrar caso +</span><span class="case-open-label">Ocultar caso −</span></summary><div class="case-study-content">${renderParts(context)}</div></details>`:'')+`<div class="question-statement">${renderParts(question)}</div>`;
 }
 function correctAnswers(q){
  if(q.type==='hotarea')return `<li><span>Zonas correctas</span><div class="answer-correct-text">${q.correct.map(id=>'Zona '+(id+1)).join(', ')}</div></li>`;
  if(q.type==='imagedrag')return q.correct.map((id,i)=>`<li><span>Destino ${i+1}</span><div class="answer-correct-text">${id===null?'Sin asignar':'Ítem '+(id+1)}</div></li>`).join('');
   return q.pools?q.correct.map((v,i)=>`<li><span>Subapartado ${i+1}</span><div class="answer-correct-text">${ExamAnswers.render(q,q.pools[i][v])}</div></li>`).join(''):q.correct.map(id=>`<li><span>Opción ${id}${q.pages?.length?' del PDF':''}</span><div class="answer-correct-text">${ExamAnswers.render(q,q.options.find(o=>o.id===id).text)}</div></li>`).join('');
 }
 function feedback(q){
   const r=C.grade(q,session.answers[q.id]);
   return `<section class="feedback ${r.full?'correct':'incorrect'}" aria-label="Corrección"><div class="feedback-title"><span>${r.full?'✓':r.earned?'◐':'×'}</span><div><h3>${r.full?'Respuesta correcta':r.earned?'Parcialmente correcta':'Respuesta incorrecta'}</h3><p>${r.earned} de ${r.possible} punto${r.possible===1?'':'s'}</p></div></div><h4>Respuesta correcta</h4><ul class="correct-list">${correctAnswers(q)}</ul>${q.notes.map(t=>`<p class="notice">${esc(t)}</p>`).join('')}<details class="explanation" open><summary>Justificación del PDF</summary>${renderParts(q.solution)}</details>${q.pages?.length?`<a class="source-link" href="Examenpdf.pdf#page=${q.pages[0]}" target="_blank" rel="noopener">Cotejar con el PDF · páginas ${q.pages.join('–')} ↗</a>`:''}</section>`;
 }
 function controls(q,locked){
   const a=session.answers[q.id]||[], grade=C.grade(q,a),show=locked;
  if(q.options){return `<div class="choices" role="group" aria-label="Opciones de respuesta">${session.optionOrder[q.id].map((id,i)=>{const o=q.options.find(o=>o.id===id),checked=a.includes(id);let cl=checked?' chosen':'';if(show){if(q.correct.includes(id))cl+=' right';else if(checked)cl+=' wrong';}return `<label class="choice${cl}"><input type="${q.type==='multiple'?'checkbox':'radio'}" name="choice" data-choice="${id}" ${checked?'checked':''} ${locked?'disabled':''}><span class="choice-letter">${String.fromCharCode(65+i)}</span><div class="choice-text">${ExamAnswers.render(q,o.text)}${(o.images||[]).map(image=>renderEmbeddedImage(image,'Imagen de la opción','choice-image')).join('')}</div><span class="choice-check">${show&&q.correct.includes(id)?'✓':show&&checked?'×':''}</span></label>`;}).join('')}</div>`;}
  if(q.type==='hotarea'){
   const selected=new Set(a);
   return `<div class="image-question hotarea-question"><div class="image-board" style="--image-width:${q.image.width||1};--image-height:${q.image.height||1}">${renderEmbeddedImage(q.image,'Imagen de hot area','image-board-image')}${q.areas.map(area=>{const active=selected.has(area.id),right=show&&q.correct.includes(area.id),wrong=show&&active&&!right;return `<button type="button" class="image-zone ${active?'selected':''} ${right?'right':''} ${wrong?'wrong':''}" data-hot-area="${area.id}" style="left:${pct(area.x,q.image.width)};top:${pct(area.y,q.image.height)};width:${pct(area.width,q.image.width)};height:${pct(area.height,q.image.height)}" aria-pressed="${active}" ${locked?'disabled':''}>${area.id+1}</button>`;}).join('')}</div><p class="image-help">Selecciona todas las zonas que respondan al enunciado.</p></div>`;
  }
  if(q.type==='imagedrag'){
   const assignments=a||[];
   return `<div class="image-question imagedrag-question"><div class="image-item-bank">${q.items.map(item=>`<button type="button" class="image-item ${assignments.includes(item.id)?'assigned':''} ${chosen===item.id?'active':''}" data-image-item="${item.id}" ${locked?'disabled':''}>${renderEmbeddedImage(item.image,'Ítem arrastrable','item-image')}<span>Ítem ${item.id+1}</span></button>`).join('')}</div><div class="image-board" style="--image-width:${q.image.width||1};--image-height:${q.image.height||1}">${renderEmbeddedImage(q.image,'Imagen de destino','image-board-image')}${q.targets.map((target,i)=>{const value=assignments[i],right=show&&value===q.correct[i],wrong=show&&value!==q.correct[i];return `<button type="button" class="image-target ${right?'right':''} ${wrong?'wrong':''}" data-image-target="${i}" style="left:${pct(target.x,q.image.width)};top:${pct(target.y,q.image.height)};width:${pct(target.width,q.image.width)};height:${pct(target.height,q.image.height)}" ${locked?'disabled':''}>${value===undefined?'Destino '+(i+1):'Ítem '+(value+1)}</button>`;}).join('')}</div><p class="image-help">Selecciona un ítem y después pulsa su destino.</p></div>`;
  }
   if(q.type==='yesno'){return `<div class="yn-table"><div class="yn-heading"><span>Statement</span><span>Yes</span><span>No</span></div>${q.template.split('\n').map((t,i)=>`<div class="yn-row ${show?(grade.parts[i]?'right':'wrong'):''}"><div>${ExamAnswers.render(q,t)}</div>${['Yes','No'].map((v,j)=>`<label aria-label="${esc(t)} — ${v}"><input type="radio" name="part-${i}" data-part="${i}" value="${j}" ${a[i]===j?'checked':''} ${locked?'disabled':''}><span>${v}</span></label>`).join('')}</div>`).join('')}</div>`;}
   const select=i=>{
    const value=a[i],filled=value!==null&&value!==undefined,label=filled?(ExamAnswers.enabled(q)?ExamMarkdown.label(q.pools[i][value]):q.pools[i][value]):'Elegir…';
    const state=show?(grade.parts[i]?'right':'wrong'):'';
    const width=Math.max(9,Math.min(40,label.length+4));
    return `<span class="answer-slot inline-slot ${state}" data-slot="${i}"><span class="slot-number">${i+1}</span>${ExamAnswers.enabled(q)?locked?`<span class="answer-selection" title="${esc(label)}">${esc(label)}</span>`:`<button type="button" class="answer-trigger" data-open-part="${i}" data-part-focus="${i}" aria-label="Subapartado ${i+1}: ${esc(label)}" aria-haspopup="dialog" aria-expanded="false" aria-controls="answer-options-${q.id}-${i}" title="${esc(label)}">${esc(label)}<span aria-hidden="true">▾</span></button>`:`<select aria-label="Subapartado ${i+1}" data-part="${i}" style="width:${width}ch" ${locked?'disabled':''}><option value="">Elegir…</option>${q.pools[i].map((o,j)=>`<option value="${j}" ${value===j?'selected':''}>${esc(o)}</option>`).join('')}</select>`}</span>`;
   };
   const popups=ExamAnswers.enabled(q)&&!locked?q.pools.map((pool,i)=>`<div class="answer-popup" id="answer-options-${q.id}-${i}" popover="auto" hidden role="dialog" aria-label="Opciones del subapartado ${i+1}">${pool.map((o,j)=>`<button type="button" data-pick-part="${i}" data-pick-value="${j}" aria-pressed="${a[i]===j}">${ExamAnswers.render(q,o)}</button>`).join('')}</div>`).join(''):'';
   const bank=q.type==='drag'?`<div class="drag-bank"><span class="mini-label">VALORES · ORDEN ORIGINAL</span><p>Arrastra a un hueco o selecciona un valor y pulsa el hueco. También puedes usar sus desplegables.</p>${q.pools[0].map((o,j)=>`<button class="drag-value ${chosen===j?'active':''}" draggable="${!locked}" data-drag="${j}" ${locked?'disabled':''}><span>⠿</span><div>${ExamAnswers.render(q,o)}</div></button>`).join('')}</div>`:'';
   return `<div class="interaction ${q.type==='drag'?'drag-layout':''}">${bank}<div class="answer-template" lang="en">${ExamAnswers.template(q,select)}</div></div>${popups}`;
 }
 function renderExam(){
   view='exam'; const q=byId.get(session.order[session.position]),done=!!session.submitted[q.id],locked=review||(session.mode==='trainer'&&done), answered=session.order.filter(id=>C.complete(byId.get(id),session.answers[id])).length;
   app.innerHTML=header()+`<main class="exam-wrap"><div class="exam-topline"><button class="back-link" data-action="${review?'results':'save-exit'}">← ${review?'Volver al resultado':'Guardar y salir'}</button><div class="session-indicators"><span class="pill neutral">${review?'Revisión':session.mode==='trainer'?'✧ Trainer':'▤ Normal'}</span><span class="timer ${session.timed?'':'untimed'}" id="clock"></span></div></div><div class="exam-layout"><aside class="navigator"><div class="nav-title"><h2>Tu recorrido</h2><span>${answered}/${session.order.length}</span></div><div class="progress-track"><i style="width:${answered/session.order.length*100}%"></i></div><p class="nav-hint">${review?'Revisa respuestas y explicaciones.':'Avanza a tu ritmo, pregunta a pregunta.'}</p><div class="question-grid">${session.order.map((id,i)=>{let cl=i===session.position?'current ':'';if(review){const r=C.grade(byId.get(id),session.answers[id]);cl+=r.full?'correct':r.earned?'partial':'incorrect';}else if(session.mode==='trainer'&&session.submitted[id])cl+=C.grade(byId.get(id),session.answers[id]).full?'correct':'incorrect';else if(C.complete(byId.get(id),session.answers[id]))cl+='answered';if(session.flagged.includes(id))cl+=' flagged';return `<button class="nav-question ${cl}" data-goto="${i}" aria-label="Pregunta ${i+1}${session.flagged.includes(id)?', marcada':''}" ${i===session.position?'aria-current="step"':''}>${i+1}</button>`;}).join('')}</div><div class="legend"><span><i class="legend-dot answered"></i>Respondida</span><span><i class="legend-dot flagged-dot"></i>Marcada</span></div>${!review?'<button class="finish-nav" data-action="finish">Finalizar sesión ↗</button>':''}</aside>
   <section class="question-panel" aria-label="Pregunta actual"><div class="question-toolbar"><span class="eyebrow">PREGUNTA ${String(session.position+1).padStart(2,'0')} <span class="muted">/ ${session.order.length}</span></span><button class="flag-button ${session.flagged.includes(q.id)?'active':''}" data-action="flag" aria-pressed="${session.flagged.includes(q.id)}">⚑ ${session.flagged.includes(q.id)?'Marcada':'Marcar'}</button></div><div class="question-meta"><span>${names[q.type]}</span><span>${q.points} punto${q.points===1?'':'s'}</span><span>${q.pages?.length?'PDF #'+String(q.id).padStart(3,'0')+' · pág. '+q.pages[0]:'Pregunta personal #'+q.id}</span></div><article class="question-body">${body(q)}</article><div class="answer-heading"><h3>Tu respuesta</h3><span>${q.type==='multiple'?`Selecciona ${q.correct.length} opciones`:q.type==='single'||q.type==='binary'?'Selecciona una opción':q.type==='hotarea'?'Selecciona todas las zonas correctas':q.type==='imagedrag'?'Asigna cada ítem a su destino':'Completa todos los subapartados'}</span></div>${controls(q,locked)}<div class="submission-row"><p id="answer-hint">${locked?'Respuesta registrada.':session.mode==='trainer'&&(q.type==='single'||q.type==='binary')?'La selección se corrige inmediatamente.':session.mode==='trainer'?'Revisa tu selección y envíala para ver la corrección.':'Tu respuesta se guarda automáticamente. La corrección se mostrará al finalizar.'}</p>${session.mode==='trainer'&&!locked&&!(q.type==='single'||q.type==='binary')?`<button class="primary" data-action="submit" ${C.complete(q,session.answers[q.id])?'':'disabled'}>Enviar respuesta →</button>`:''}</div>${locked?feedback(q):''}<div class="question-bottom"><button class="secondary" data-action="prev" ${session.position===0?'disabled':''}>← Anterior</button><span>${session.position+1} de ${session.order.length}</span>${session.position===session.order.length-1?`<button class="primary" data-action="${review?'results':'finish'}">${review?'Ver resultado':'Finalizar sesión'} ↗</button>`:'<button class="primary" data-action="next">Siguiente →</button>'}</div><p id="storage-notice" class="notice ${storageOK?'hidden':''}">No se puede guardar el progreso. Mantén esta página abierta.</p></section></div></main>`+footer();
   updateClock();bindDrag(q,locked);bindAnswerPopups();
 }
 function bindAnswerPopups(){
  document.querySelectorAll('.answer-popup').forEach(p=>{
   p.addEventListener('toggle',e=>{const button=document.querySelector(`[aria-controls="${p.id}"]`);button?.setAttribute('aria-expanded',String(e.newState==='open'));if(e.newState==='closed')p.hidden=true;});
   p.addEventListener('keydown',e=>{const buttons=[...p.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(e.key==='Escape'){p.hidePopover?.();p.hidden=true;document.querySelector(`[aria-controls="${p.id}"]`)?.focus();}});
  });
 }
 function openAnswerPopup(button){
  const p=document.getElementById(button.getAttribute('aria-controls'));if(!p)return;
  if(!p.hidden){p.hidePopover?.();p.hidden=true;button.setAttribute('aria-expanded','false');return;}
  document.querySelectorAll('.answer-popup:not([hidden])').forEach(other=>{other.hidePopover?.();other.hidden=true;});
  p.hidden=false;p.showPopover?.();button.setAttribute('aria-expanded','true');
  const b=button.getBoundingClientRect(),box=p.getBoundingClientRect(),height=window.visualViewport?.height||innerHeight;
  p.style.left=Math.max(12,Math.min(b.left,innerWidth-box.width-12))+'px';p.style.top=(b.bottom+box.height+8<=height?b.bottom+5:Math.max(12,b.top-box.height-5))+'px';
  (p.querySelector('[aria-pressed="true"]')||p.querySelector('button'))?.focus({preventScroll:true});
 }
 function bindDrag(q,locked){if(q.type!=='drag'||locked)return;
   document.querySelectorAll('[data-drag]').forEach(el=>{
     // Pointer-based dragging supports mouse, touch and pen consistently.
     el.draggable=false;
     el.addEventListener('pointerdown',e=>{
       if(e.button!==0)return;
       const x=e.clientX,y=e.clientY;let moved=false,ghost=null,over=null;
        // Conserva el punto por el que se agarró el bloque para que el fantasma
        // no salte al cursor y siga exactamente el movimiento del ratón.
        const box=el.getBoundingClientRect(),grabX=e.clientX-box.left,grabY=e.clientY-box.top;
       el.setPointerCapture(e.pointerId);
       function move(ev){
         if(!moved&&Math.hypot(ev.clientX-x,ev.clientY-y)>5){moved=true;ghost=document.createElement('div');ghost.className='drag-ghost';ghost.innerHTML=ExamAnswers.render(q,q.pools[0][Number(el.dataset.drag)]);document.body.appendChild(ghost);}
         if(!moved)return;
         ghost.style.left=(ev.clientX-grabX)+'px';ghost.style.top=(ev.clientY-grabY)+'px';
         const next=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('[data-slot]');
         if(over!==next){over?.classList.remove('drag-over');next?.classList.add('drag-over');over=next;}
       }
       function end(ev){
         el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',cancel);
         ghost?.remove();over?.classList.remove('drag-over');
         if(moved){draggedAt=Date.now();if(over)setPart(q,Number(over.dataset.slot),Number(el.dataset.drag));}
       }
       function cancel(ev){over=null;end(ev);}
       el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',cancel);
     });
   });
   document.querySelectorAll('[data-slot]').forEach(el=>{
     el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over');});
     el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
     el.addEventListener('drop',e=>{e.preventDefault();const v=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(v)&&v>=0&&v<q.pools[Number(el.dataset.slot)].length)setPart(q,Number(el.dataset.slot),v);});
     el.addEventListener('click',e=>{if(chosen!==null&&!e.target.closest('select')){e.preventDefault();e.stopPropagation();setPart(q,Number(el.dataset.slot),chosen);}});
   });
 }
 function setPart(q,i,v){const a=[...(session.answers[q.id]||[])];a[i]=v;session.answers[q.id]=a;chosen=null;persist();renderExam();document.querySelector(`[data-part="${i}"],[data-part-focus="${i}"]`)?.focus({preventScroll:true});say(`Subapartado ${i+1} guardado.`);}
 function setHotArea(q,id){const selected=new Set(session.answers[q.id]||[]);if(selected.has(id))selected.delete(id);else selected.add(id);session.answers[q.id]=[...selected].sort((a,b)=>a-b);persist();renderExam();say(`Zona ${id+1} ${selected.has(id)?'seleccionada':'deseleccionada'}.`);}
 function setImageTarget(q,target,item){const answer=[...(session.answers[q.id]||[])];answer[target]=item;session.answers[q.id]=answer;chosen=null;persist();renderExam();say(`Ítem asignado al destino ${target+1}.`);}
 function submit(){
   const q=byId.get(session.order[session.position]);
   if(!C.complete(q,session.answers[q.id]))return;
   session.submitted[q.id]=true;
   if(session.mode==='trainer'&&C.grade(q,session.answers[q.id]).full){
     chosen=null;
     if(session.position<session.order.length-1)session.position++;
     else {
       const pending=session.order.findIndex(id=>!session.submitted[id]);
       if(pending===-1){finish('submitted');return;}
       session.position=pending;
     }
     persist();renderExam();window.scrollTo(0,0);
     say('Respuesta correcta. Siguiente pregunta.');
     return;
   }
   persist();renderExam();
   say('Respuesta incorrecta o parcialmente correcta. Consulta la justificación.');
   $('#answer-hint')?.scrollIntoView({behavior:'smooth',block:'center'});
 }
 function ask(title,text,go,label='Confirmar'){
   modal.innerHTML=`<form method="dialog"><button class="close-modal" aria-label="Cerrar">×</button><span class="modal-symbol">↗</span><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="modal-actions"><button class="secondary" value="cancel">Volver</button><button class="primary" id="confirm-modal" type="button">${esc(label)}</button></div></form>`;modal.showModal();$('#confirm-modal').onclick=()=>{modal.close();go();};
 }
 function requestFinish(){
   const unanswered=session.order.filter(id=>!C.complete(byId.get(id),session.answers[id])).length;
   ask('¿Entregar esta sesión?',unanswered?`Quedan ${unanswered} preguntas sin completar. Sus partes sin responder valdrán cero. Podrás revisar y reintentar las falladas después.`:'Ya has respondido todas las preguntas. Verás tu puntuación y la revisión completa.',()=>finish('submitted'),'Entregar y ver resultado');
 }
 function finish(reason){
   const keepEditor=view==='library';if(session.bankSnapshot)useBank(session.bankSnapshot);
   session=C.finish(session,reason);const r=C.results(session,questions);
   if(!history.some(h=>h.id===session.id))history.unshift({id:session.id,mode:session.mode,isRetry:session.isRetry,finishedAt:session.finishedAt,count:session.order.length,score:r.score,passed:r.passed});
   persist();if(keepEditor){say('Ha finalizado la sesión cronometrada. Su resultado se ha guardado.');return;}modal.open&&modal.close();review=false;view='results';renderResults();window.scrollTo(0,0);say(reason==='timeout'?'Tiempo agotado. La sesión se ha entregado automáticamente.':'Sesión finalizada.');
 }
 function renderResults(){
   view='results';const r=C.results(session,questions),minutes=Math.floor((session.finishedAt-session.startedAt)/60000);
   app.innerHTML=header()+`<main class="results-wrap"><button class="back-link" data-action="home">← Volver al inicio</button><div class="result-intro"><div><span class="eyebrow">SESIÓN COMPLETADA</span><h1>${r.passed?'Un paso más<br><em>hacia tu objetivo.</em>':'Cada intento<br><em>te hace avanzar.</em>'}</h1><p>${session.finishReason==='timeout'?'Se han agotado los ${meta.minutes} minutos. Tu sesión se ha entregado automáticamente.':r.passed?'Has superado el corte de esta batería. Sigue consolidando lo aprendido.':'Revisa el porqué de cada respuesta y vuelve a intentarlo.'}</p><span class="pill ${r.passed?'pass':'fail'}">${r.passed?'✓ Aprobado':'Suspenso'} · corte ${session.passingScore??meta.passingScore}</span></div><div class="score-ring" style="--score:${r.score/10}%"><div><strong>${r.score}</strong><span>DE 1000 PUNTOS</span></div></div></div><div class="result-stats"><div><strong>${r.correct}<small> / ${session.order.length}</small></strong><span>preguntas correctas</span></div><div><strong>${r.partial}</strong><span>parcialmente correctas</span></div><div><strong>${r.unanswered}</strong><span>sin completar</span></div><div><strong>${minutes}<small> min</small></strong><span>tiempo empleado</span></div></div><div class="result-actions"><button class="primary" data-action="retry" ${r.missed.length?'':'disabled'}>Reintentar ${r.missed.length} falladas ↻</button><button class="secondary" data-action="review-all">Revisar todas las respuestas</button></div><p class="score-note">${r.earned} de ${r.possible} puntos obtenidos · nota = ⌊${r.earned} / ${r.possible} × 1000⌋. Las parcialmente correctas también se incluyen en el reintento.</p><div class="section-title"><h2>Tu sesión, pregunta a pregunta</h2><span>${session.mode==='trainer'?'TRAINER':'NORMAL'}${session.isRetry?' · REINTENTO':''}</span></div><div class="review-list">${r.rows.map((row,i)=>{const q=byId.get(row.id);return `<button class="review-row" data-review="${i}"><span class="review-symbol ${row.full?'pass':'fail'}">${row.full?'✓':row.earned?'◐':'×'}</span><div><strong>Pregunta ${i+1} <span class="muted">· ${q.pages?.length?'PDF #':'#'}${String(q.id).padStart(3,'0')}</span></strong><small>${names[q.type]} · ${row.answered?'Respondida':'Sin completar'}</small></div><span>${row.earned}/${row.possible} pt</span><span>↗</span></button>`;}).join('')}</div></main>`+footer();
 }
 function updateClock(){const el=$('#clock');if(!el||!session)return;
   const remaining=C.remaining(session,session.finishedAt||Date.now());
   if(remaining===null){el.textContent='◷ Sin límite';return;}
   const seconds=Math.ceil(remaining/1000),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
   el.textContent=`◷ ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;el.classList.toggle('urgent',seconds<300);
 }
 setInterval(async()=>{if(session&&!session.finishedAt&&C.remaining(session)===0)finish('timeout');else updateClock();},1000);
 document.addEventListener('toggle',e=>{
   if(view!=='exam'||!session||!e.target.matches('details[data-case-study]'))return;
   session.caseStudyOpen??={};session.caseStudyOpen[e.target.dataset.caseStudy]=e.target.open;persist();
 },true);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session&&!session.finishedAt&&C.remaining(session)===0)finish('timeout');});
 document.addEventListener('change',e=>{
   const t=e.target;if(t.id==='active-exam'){try{switchExam(t.value);}catch(err){say(err.message);}return;}if(t.id==='timed'){timed=t.checked;home();return;}
   if(view!=='exam'||review||!session||session.finishedAt)return;
   const q=byId.get(session.order[session.position]);if(session.mode==='trainer'&&session.submitted[q.id])return;
   if(t.dataset.choice){const id=t.dataset.choice;let a=session.answers[q.id]||[];a=q.type==='multiple'?(t.checked?[...a,id]:a.filter(x=>x!==id)):[id];session.answers[q.id]=a;persist();if(session.mode==='trainer'&&q.type!=='multiple')submit();else {renderExam();document.querySelector(`[data-choice="${id}"]`)?.focus({preventScroll:true});}}
   if(t.dataset.part!==undefined){const i=Number(t.dataset.part),v=t.value===''?null:Number(t.value);setPart(q,i,v);}
 });
 document.addEventListener('click',e=>{
   const t=e.target.closest('button');if(!t||t.disabled)return;
   if(t.dataset.mode){mode=t.dataset.mode;home();return;}
   if(t.dataset.goto!==undefined){session.position=Number(t.dataset.goto);chosen=null;persist();renderExam();return;}
   if(t.dataset.review!==undefined){session.position=Number(t.dataset.review);review=true;renderExam();window.scrollTo(0,0);return;}
   if(t.dataset.openPart!==undefined){openAnswerPopup(t);return;}
   if(t.dataset.pickPart!==undefined){if(view!=='exam'||review||session.finishedAt)return;const q=byId.get(session.order[session.position]);if(session.mode==='trainer'&&session.submitted[q.id])return;setPart(q,Number(t.dataset.pickPart),Number(t.dataset.pickValue));return;}
  if(t.dataset.hotArea!==undefined){if(view!=='exam'||review||session.finishedAt)return;const q=byId.get(session.order[session.position]);if(q.type==='hotarea')setHotArea(q,Number(t.dataset.hotArea));return;}
  if(t.dataset.imageItem!==undefined){if(view!=='exam'||review||session.finishedAt)return;chosen=Number(t.dataset.imageItem);renderExam();return;}
  if(t.dataset.imageTarget!==undefined){if(view!=='exam'||review||session.finishedAt||chosen===null)return;const q=byId.get(session.order[session.position]);if(q.type==='imagedrag')setImageTarget(q,Number(t.dataset.imageTarget),chosen);return;}
   if(t.dataset.drag!==undefined){if(Date.now()-draggedAt<350)return;chosen=Number(t.dataset.drag);renderExam();return;}
   const a=t.dataset.action;
   if(a==='library'){library();return;}
   if(a==='home'||a==='save-exit'){persist();home();window.scrollTo(0,0);}
   if(a==='start')start();
   if(a==='resume')openSession();
   if(a==='submit')submit();
   if(a==='finish')requestFinish();
   if(a==='next'||a==='prev'){session.position+=a==='next'?1:-1;chosen=null;persist();renderExam();window.scrollTo(0,0);$('.question-panel')?.focus();}
   if(a==='flag'){const id=session.order[session.position];session.flagged=session.flagged.includes(id)?session.flagged.filter(x=>x!==id):[...session.flagged,id];persist();renderExam();}
   if(a==='results'){if(session.bankSnapshot)useBank(session.bankSnapshot);review=false;view='results';renderResults();window.scrollTo(0,0);}
   if(a==='retry'){retryIds=C.results(session,questions).missed;retryBank=session.bankSnapshot||{meta,questions};mode=session.mode;timed=false;home();window.scrollTo(0,0);}
   if(a==='cancel-retry'){retryIds=null;retryBank=null;home();}
   if(a==='review-all'){if(session.bankSnapshot)useBank(session.bankSnapshot);session.position=0;review=true;renderExam();window.scrollTo(0,0);}
 });
 home();
 if(session&&!session.finishedAt&&C.remaining(session)===0)finish('timeout');
})();
