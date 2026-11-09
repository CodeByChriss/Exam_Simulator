/* Importación de exámenes VCE v34: cabecera, conversor Python (Pyodide) y adaptador al banco de ExamStudio. */
(function(root){
 'use strict';
 const PYODIDE_VERSION = '314.0.7';
 const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/';
 const TYPE_NAMES = {0:'single_choice',1:'multiple_choice',2:'drag_and_drop',3:'point_and_shoot',
  4:'create_a_tree',5:'build_list_and_reorder',6:'drop_and_connect',7:'multiple_choice',9:'hot_area'};
 const TYPE_LABELS = {single_choice:'Elección única',multiple_choice:'Elección múltiple',
  drag_and_drop:'Drag & drop sobre imagen',point_and_shoot:'Point and shoot',
  create_a_tree:'Create a tree',build_list_and_reorder:'Build list and reorder',
  drop_and_connect:'Drop and connect',hot_area:'Hot area'};
 const CHOICE_TYPES = ['single_choice', 'multiple_choice'];
 const IMAGE_TYPE_MAP = {hot_area:'hotarea', point_and_shoot:'hotarea',
  drag_and_drop:'imagedrag', create_a_tree:'imagedrag',
  build_list_and_reorder:'imagedrag', drop_and_connect:'imagedrag'};
 const IMAGE_EXT = {'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/bmp':'bmp','image/webp':'webp'};

 function detect(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (bytes.length < 4) return {ok:false, message:'El fichero está vacío o es demasiado corto.'};
  if (bytes[0] !== 0x85 || bytes[1] !== 0xa8) return {ok:false, message:'No es un fichero .vce (falta la firma 85 A8).'};
  const version = bytes[2] * 10 + bytes[3];
  if (version !== 34) return {ok:false, version, message:'Versión ' + version + ' detectada. Solo se admite v34 (cabecera 85 A8 03 04).'};
  return {ok:true, version:34};
 }

 function contentLooksValid(json) {
  const number = String(json && json.number || '').trim();
  const title = String(json && json.title || '').trim();
  if (/^\d{3}-\d{3}$/.test(number)) return true;
  return !!title && /[\p{L}\p{N}]/u.test(title);
 }

 function cleanText(value) {
  return String(value == null ? '' : value).replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
 }

 function withoutMarkers(value) {
  return cleanText(String(value == null ? '' : value).replace(/\{\{image:\d+\}\}/g, '').replace(/\n{3,}/g, '\n\n'));
 }

 function stripAnswerHeader(text) {
  return cleanText(text).replace(/^Q\d+\s+T\d+\s*\n+/i, '').replace(/\n{3,}/g, '\n\n');
 }

 function extForMime(mime) {
  return IMAGE_EXT[mime] || 'bin';
 }

 function assetSrc(key, mime) {
  return '/assets/' + key + '.' + extForMime(mime);
 }

 function imagePart(image, alt) {
  if (!image || !(image.src || image.key || image.base64)) return null;
  return {kind:'image', image, alt:cleanText(alt) || 'Imagen del examen'};
 }

 function contentParts(rich, stripHeader) {
  if (!rich) return [];
  let text = cleanText(rich.text);
  if (stripHeader) text = stripAnswerHeader(text);
  const images = Array.isArray(rich.images) ? rich.images : [];
  const parts = [], used = new Set(), pattern=/\{\{image:(\d+)\}\}/g;
  let cursor=0, match;
  while ((match=pattern.exec(text))) {
   const before=cleanText(text.slice(cursor,match.index));
   if (before) parts.push({kind:'text',text:before});
   const index=Number(match[1]);
   used.add(index);
   const part=imagePart(images[index],'Imagen del examen');
   if (part) parts.push(part);
   cursor=match.index+match[0].length;
  }
  const rest=cleanText(text.slice(cursor));
  if (rest) parts.push({kind:'text',text:rest});
  // Las imágenes sin marcador también forman parte del enunciado: preguntas
  // que son solo una imagen o que llevan varias imágenes seguidas.
  images.forEach((image,index) => {
   if (used.has(index)) return;
   const part=imagePart(image,'Imagen del examen');
   if (part) parts.push(part);
  });
  return parts;
 }

 function bodyParts(rich) {
  return contentParts(rich,false);
 }

 function solutionParts(rich) {
  const parts=contentParts(rich,true);
  return parts.length ? parts : [{kind:'text', text:'(Sin justificación en el fichero VCE original.)'}];
 }

 function caseParts(rich, title) {
  const parts=contentParts(rich,false);
  const heading = cleanText(title);
  if (heading && !/^case study title\b/i.test(heading)) parts.unshift({kind:'text',text:heading});
  return parts;
 }

 function isDescriptor(value) {
  return !!(value && typeof value === 'object' &&
   typeof value.key === 'string' && /^[a-f0-9]{64}$/i.test(value.key) &&
   typeof value.mime === 'string');
 }

 function materialize(value, keys) {
  if (Array.isArray(value)) return value.map(item => materialize(item, keys));
  if (value && typeof value === 'object') {
   const out = {};
   for (const [key, nested] of Object.entries(value)) out[key] = materialize(nested, keys);
   if (isDescriptor(out)) {
    if (!out.src) out.src = assetSrc(out.key, out.mime);
    if (keys) keys.add(out.key);
   }
   return out;
  }
  return value;
 }

 function skipDetails(raw, qtype, reason, examName) {
  const body = raw && raw.question || {};
  const options = Array.isArray(raw && raw.options) ? raw.options : [];
  const dnd = raw && raw.dragAndDrop || {};
  return {
   exam: examName,
   question: raw && raw.id != null ? raw.id : null,
   rawType: raw && raw.rawType,
   type: qtype,
   typeLabel: TYPE_LABELS[qtype] || qtype,
   reason,
   bodyText: cleanText(body.text).slice(0, 600),
   bodyImages: Array.isArray(body.images) ? body.images.length : 0,
   options: options.length,
   correctAnswers: raw && raw.correctAnswers,
   areaImage: raw && raw.areaImage
    ? {mime:raw.areaImage.mime, width:raw.areaImage.width, height:raw.areaImage.height}
    : null,
   areas: Array.isArray(raw && raw.hotArea && raw.hotArea.areas) ? raw.hotArea.areas.length : 0,
   items: Array.isArray(dnd.items) ? dnd.items.length : 0,
   targets: Array.isArray(dnd.targets) ? dnd.targets.length : 0,
   warnings: Array.isArray(raw && raw.warnings) ? raw.warnings : []
  };
 }

 function metaFor(json, exam, fileName, multi, index) {
  const fileTitle = cleanText(String(fileName || '').replace(/\.[^.]+$/, ''));
  const docTitle = cleanText(json && json.title);
  const examName = cleanText(exam && exam.name);
  const title = multi
   ? (examName || [docTitle || fileTitle, index + 1].filter(Boolean).join(' · '))
   : (docTitle || examName || fileTitle || 'Examen VCE');
  let minutes = Number(json && json.timeLimit);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) minutes = 120;
  let passing = Number(json && json.passingScore);
  if (!Number.isFinite(passing) || passing <= 0 || passing > 1000) passing = 700;
  return {title:title.slice(0, 150), minutes, passingScore:Math.round(passing)};
 }

 async function toBank(json, options) {
  options = options || {};
  const fileName = options.fileName || 'examen.vce';
  const report = {imported:0, skipped:[], imagesImported:0, imageBytes:Number(options.imageBytes)||0,
   warnings:[], imageKeys:[]};
  if (!json || typeof json !== 'object') throw Error('El conversor no devolvió un JSON válido.');
  if (json.error) {
   report.warnings.push('El conversor no pudo leer todo el fichero: ' + json.error);
   report.skipped.push({id:'-', type:'archivo', typeLabel:'Archivo', reason:json.error, exam:'',
    details:{exam:'', question:null, type:'archivo', typeLabel:'Archivo', reason:json.error}});
  }
  const exams = Array.isArray(json.exams) ? json.exams : [];
  if (!exams.length) throw Error('El fichero no contiene exámenes.');
  const rawBanks = [];
  let total = 0;
  for (let e = 0; e < exams.length; e++) {
   const exam = exams[e];
   const examName = cleanText(exam && exam.name) || ('Examen ' + (e + 1));
   const bank = {meta:metaFor(json, exam, fileName, exams.length > 1, e), questions:[]};
   const questions = Array.isArray(exam.questions) ? exam.questions : [];
   total += questions.length;
   for (const raw of questions) {
    const qtype = TYPE_NAMES[raw && raw.rawType] || (raw && raw.type) || 'desconocido';
    const id = bank.questions.length + 1;
    const skip = reason => report.skipped.push({
     id: raw && raw.id != null ? raw.id : id,
     type: qtype,
     typeLabel: TYPE_LABELS[qtype] || qtype,
     reason,
     exam: examName,
     details: skipDetails(raw, qtype, reason, examName)
    });
    const targetType = IMAGE_TYPE_MAP[qtype];
    if (!CHOICE_TYPES.includes(qtype) && !targetType) {
     skip('Tipo ' + qtype + ' no soportado');
     continue;
    }
    const body = bodyParts(raw.question);
    if (!body.length && !(targetType && raw.areaImage)) {
     skip('Sin enunciado ni imagen de interacción');
     continue;
    }
    if (targetType === 'hotarea') {
     if (!raw.areaImage) { skip('Sin imagen principal para la interacción'); continue; }
     const areas = ((raw.hotArea && raw.hotArea.areas) || []).map(area =>
      ({id:Number(area.index), ...area.rect}));
     const correct = (raw.correctAreas || []).map(Number);
     if (!areas.length) { skip('Sin zonas hot area'); continue; }
     if (!correct.length) { skip('Sin respuesta correcta hot area'); continue; }
     const q = {id, type:'hotarea', body, solution:solutionParts(raw.explanation),
      image:raw.areaImage, areas, correct, points:1, notes:[], pages:[], source:'vce'};
     if (raw.extraText && raw.extraText.length) q.body.push(...raw.extraText.flatMap(x => contentParts(x,false)));
     if (raw.caseStudy) q.caseStudy = caseParts(raw.caseStudy, raw.caseStudy.title);
     if (raw.warnings && raw.warnings.length) report.warnings.push('Pregunta ' + raw.id + ': ' + raw.warnings.join(' '));
     if (qtype !== 'hot_area') report.warnings.push('Pregunta ' + raw.id + ': ' +
      (TYPE_LABELS[qtype] || qtype) + ' importada como hot area.');
     bank.questions.push(q);
     continue;
    }
    if (targetType === 'imagedrag') {
     if (!raw.areaImage) { skip('Sin imagen principal para la interacción'); continue; }
     const items = ((raw.dragAndDrop && raw.dragAndDrop.items) || []).map(item =>
      ({id:Number(item.index), rect:item.rect, image:item.image || null}));
     const targets = ((raw.dragAndDrop && raw.dragAndDrop.targets) || []).map(target =>
      ({id:Number(target.index), ...target.rect}));
     const correct = (raw.correctAnswers || []).map(value => value == null ? null : Number(value));
     if (!items.length) { skip('Sin ítems arrastrables'); continue; }
     if (!targets.length) { skip('Sin destinos'); continue; }
     if (correct.length !== targets.length) { skip('Las asignaciones no cubren todos los destinos'); continue; }
     const q = {id, type:'imagedrag', body, solution:solutionParts(raw.explanation),
      image:raw.areaImage, items, targets, correct, points:targets.length, notes:[], pages:[], source:'vce'};
     if (raw.extraText && raw.extraText.length) q.body.push(...raw.extraText.flatMap(x => contentParts(x,false)));
     if (raw.caseStudy) q.caseStudy = caseParts(raw.caseStudy, raw.caseStudy.title);
     if (items.some(item => !item.image)) report.warnings.push('Pregunta ' + raw.id +
      ': hay ítems sin miniatura recortada; el editor puede regenerarlas.');
     if (raw.warnings && raw.warnings.length) report.warnings.push('Pregunta ' + raw.id + ': ' + raw.warnings.join(' '));
     if (qtype !== 'drag_and_drop') report.warnings.push('Pregunta ' + raw.id + ': ' +
      (TYPE_LABELS[qtype] || qtype) + ' importada como drag & drop sobre imagen.');
     bank.questions.push(q);
     continue;
    }
    const options = (raw.options || []).map((o, i) => ({
     id:String.fromCharCode(65 + i),
     text:withoutMarkers(o && o.text) || ('Opción ' + (i + 1)),
     images:Array.isArray(o && o.images) ? o.images : []
    }));
    if (options.length < 2 || options.length > 20) {
     skip(options.length > 20 ? 'Más de 20 opciones' : ('Solo ' + options.length + ' opciones'));
     continue;
    }
    const letters = (raw.correctAnswers || []).map(String).filter(c => /^[A-T]$/.test(c));
    if (!letters.length) { skip('Sin respuesta correcta'); continue; }
    if (letters.some(c => !options.some(o => o.id === c))) { skip('La respuesta correcta no coincide con las opciones'); continue; }
    let type = qtype === 'single_choice' ? 'single' : 'multiple';
    if (type === 'single' && letters.length > 1) {
     type = 'multiple';
     report.warnings.push('La pregunta ' + raw.id + ' era de elección única con varias respuestas; se importa como múltiple.');
    }
    const q = {
     id, type,
     body,
     solution:solutionParts(raw.explanation),
     options,
     correct:[...new Set(letters)],
     points:1,
     notes:[],
     pages:[],
     source:'vce'
    };
    if (raw.caseStudy) {
     const study = caseParts(raw.caseStudy, raw.caseStudy.title);
     if (study.length) q.caseStudy = study;
    }
    if (raw.warnings && raw.warnings.length) report.warnings.push('Pregunta ' + raw.id + ': ' + raw.warnings.join(' '));
    bank.questions.push(q);
   }
   if (!bank.questions.length) {
    if (!questions.length) report.skipped.push({id:'-', type:'examen', typeLabel:'Examen',
     reason:'El examen no tiene preguntas', exam:examName,
     details:{exam:examName, question:null, type:'examen', typeLabel:'Examen', reason:'El examen no tiene preguntas'}});
    continue;
   }
   rawBanks.push(bank);
  }
  const keys = new Set();
  const banks = rawBanks.map(bank => materialize(bank, keys));
  report.imageKeys = [...keys];
  report.imagesImported = keys.size;
  report.imported = banks.reduce((n, b) => n + b.questions.length, 0);
  if (!banks.length && !total) throw Error('El fichero no contiene preguntas.');
  return {banks, report};
 }

 function convert(file, onProgress) {
  return new Promise((resolve, reject) => {
   let worker;
   try { worker = new Worker('vce-worker.js', {type:'module'}); }
   catch (err) { reject(Error('No se ha podido iniciar el conversor de Python en este navegador.')); return; }
   let settled = false;
   const finish = (fn, value) => {
    if (settled) return;
    settled = true;
    try { worker.terminate(); } catch (err) {}
    fn(value);
   };
   worker.onmessage = ev => {
    const message = ev.data || {};
    if (message.type === 'progress') { if (onProgress) onProgress(message.stage); return; }
    if (message.type === 'result') {
     try {
      finish(resolve, {
       json:JSON.parse(message.json),
       images:Array.isArray(message.images) ? message.images : []
      });
     }
     catch (err) { finish(reject, Error('El conversor devolvió un JSON no válido.')); }
     return;
    }
    if (message.type === 'error') finish(reject, Error(message.message || 'No se ha podido convertir el fichero.'));
   };
   worker.onerror = ev => finish(reject, Error(
    'No se ha podido cargar el conversor de Python. Comprueba tu conexión e inténtalo de nuevo.' +
    (ev && ev.message ? ' (' + ev.message + ')' : '')
   ));
   file.arrayBuffer()
    .then(buffer => worker.postMessage({buffer}, [buffer]))
    .catch(err => finish(reject, err));
  });
 }

 const api = {detect, toBank, convert, contentLooksValid, assetSrc, extForMime, PYODIDE_VERSION, PYODIDE_URL};
 root.ExamVCE = api;
 if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
