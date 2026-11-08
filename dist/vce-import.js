/* Importación de exámenes VCE v34: cabecera, conversor Python (Pyodide) y adaptador al banco de ExamStudio. */
(function(root){
 'use strict';
 const PYODIDE_VERSION = '314.0.7';
 const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/';
 const TYPE_NAMES = {0:'single_choice',1:'multiple_choice',2:'drag_and_drop',3:'point_and_shoot',
  4:'create_a_tree',5:'build_list_and_reorder',6:'drop_and_connect',7:'multiple_choice',9:'hot_area'};
 const CHOICE_TYPES = ['single_choice', 'multiple_choice'];
 const UNSUPPORTED = {
  hot_area:'Hot area (se añadirá en la siguiente entrega)',
  drag_and_drop:'Drag & drop sobre imagen (se añadirá en la siguiente entrega)',
  point_and_shoot:'Point and shoot',
  create_a_tree:'Create a tree',
  build_list_and_reorder:'Build list and reorder',
  drop_and_connect:'Drop and connect'
 };

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

 function imagesOf(rich) {
  return Array.isArray(rich && rich.images) ? rich.images.length : 0;
 }

 function stripAnswerHeader(text) {
  return cleanText(text).replace(/^Q\d+\s+T\d+\s*\n+/i, '').replace(/\n{3,}/g, '\n\n');
 }

 function bodyParts(rich) {
  const text = withoutMarkers(rich && rich.text);
  return text ? [{kind:'text', text}] : [];
 }

 function solutionParts(rich) {
  const text = stripAnswerHeader(withoutMarkers(rich && rich.text));
  return [{kind:'text', text:text || '(Sin justificación en el fichero VCE original.)'}];
 }

 function caseParts(rich, title) {
  const text = withoutMarkers(rich && rich.text);
  const heading = cleanText(title);
  const full = heading && !/^case study title$/i.test(heading) ? heading + '\n\n' + text : text;
  return full ? [{kind:'text', text:full}] : [];
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
  const report = {imported:0, skipped:[], imagesSkipped:0, warnings:[]};
  if (!json || typeof json !== 'object') throw Error('El conversor no devolvió un JSON válido.');
  if (json.error) report.warnings.push('El conversor no pudo leer todo el fichero: ' + json.error);
  const exams = Array.isArray(json.exams) ? json.exams : [];
  if (!exams.length) throw Error('El fichero no contiene exámenes.');
  const banks = [];
  let total = 0;
  for (let e = 0; e < exams.length; e++) {
   const exam = exams[e];
   const bank = {meta:metaFor(json, exam, fileName, exams.length > 1, e), questions:[]};
   const questions = Array.isArray(exam.questions) ? exam.questions : [];
   total += questions.length;
   for (const raw of questions) {
    const qtype = TYPE_NAMES[raw && raw.rawType] || (raw && raw.type) || 'desconocido';
    const id = bank.questions.length + 1;
    report.imagesSkipped += imagesOf(raw.question) + imagesOf(raw.explanation) + imagesOf(raw.caseStudy) + (raw.areaImage ? 1 : 0);
    const skip = reason => report.skipped.push({id:raw && raw.id != null ? raw.id : id, type:qtype, reason});
    if (!CHOICE_TYPES.includes(qtype)) { skip(UNSUPPORTED[qtype] || ('Tipo ' + qtype + ' no soportado')); continue; }
    const body = bodyParts(raw.question);
    if (!body.length) { skip('Sin enunciado de texto (solo imagen o vacío)'); continue; }
    const options = (raw.options || []).map((o, i) => ({
      id:String.fromCharCode(65 + i),
      text:withoutMarkers(o && o.text) || ('Opción ' + (i + 1))
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
      pages:[]
    };
    if (raw.caseStudy) {
      const study = caseParts(raw.caseStudy, raw.caseStudy.title);
      if (study.length) q.caseStudy = study;
    }
    bank.questions.push(q);
   }
   if (!bank.questions.length) {
    if (!questions.length) report.skipped.push({id:'-', type:'examen', reason:'El examen no tiene preguntas'});
    continue;
   }
   banks.push(bank);
   report.imported += bank.questions.length;
  }
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
     try { finish(resolve, JSON.parse(message.json)); }
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

 const api = {detect, toBank, convert, contentLooksValid, PYODIDE_VERSION, PYODIDE_URL};
 root.ExamVCE = api;
 if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
