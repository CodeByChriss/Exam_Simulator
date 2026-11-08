const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExamVCE = require('./dist/vce-import.js');
const ExamCatalog = require('./dist/catalog.js');

const bytes = (...values) => new Uint8Array(values);

const choice = (overrides = {}) => ({
  id: 1,
  type: 'single_choice',
  rawType: 0,
  question: {text:'¿Cuál es la respuesta? {{image:0}}', html:'', images:[{mime:'image/png', base64:'AA=='}]},
  options: [
    {letter:'A', text:'Uno', images:[]},
    {letter:'B', text:'Dos', images:[]}
  ],
  correctAnswers: ['A'],
  explanation: {text:'Q01 T01\n\nPorque sí.', html:'', images:[]},
  caseStudy: null,
  ...overrides
});

const file = (questions, overrides = {}) => ({
  format: 'vce',
  version: 34,
  number: '000-001',
  title: 'Test VCE',
  passingScore: 800,
  timeLimit: 90,
  exams: [{name:'Exam A', questions}],
  ...overrides
});

test('detecta la cabecera v34', () => {
  assert.deepEqual(ExamVCE.detect(bytes(0x85, 0xa8, 0x03, 0x04)), {ok:true, version:34});
});

test('rechaza otras versiones de .vce', () => {
  const result = ExamVCE.detect(bytes(0x85, 0xa8, 0x03, 0x01));
  assert.equal(result.ok, false);
  assert.equal(result.version, 31);
  assert.match(result.message, /Versión 31/);
});

test('rechaza ficheros sin la firma .vce', () => {
  assert.equal(ExamVCE.detect(bytes(0x00, 0x00, 0x03, 0x04)).ok, false);
  assert.equal(ExamVCE.detect(bytes()).ok, false);
});

test('comprueba que el contenido parece un v34 legible', () => {
  assert.equal(ExamVCE.contentLooksValid({number:'000-001', title:''}), true);
  assert.equal(ExamVCE.contentLooksValid({number:'raro', title:'Examen legible'}), true);
  assert.equal(ExamVCE.contentLooksValid({number:'raro', title:''}), false);
});

test('convierte una pregunta de elección única al banco de ExamStudio', async () => {
  const {banks, report} = await ExamVCE.toBank(file([choice()]), {fileName:'test.vce'});
  assert.equal(report.imported, 1);
  assert.equal(report.imagesSkipped, 1);
  const bank = ExamCatalog.normalize(banks[0]);
  assert.equal(bank.meta.title, 'Test VCE');
  assert.equal(bank.meta.minutes, 90);
  assert.equal(bank.meta.passingScore, 800);
  const question = bank.questions[0];
  assert.equal(question.type, 'single');
  assert.deepEqual(question.body, [{kind:'text', text:'¿Cuál es la respuesta?'}]);
  assert.deepEqual(question.options.map(option => option.id), ['A', 'B']);
  assert.deepEqual(question.correct, ['A']);
  assert.deepEqual(question.solution, [{kind:'text', text:'Porque sí.'}]);
});

test('convierte una pregunta múltiple y conserva el conjunto exacto', async () => {
  const multiple = choice({
    id: 2,
    type: 'multiple_choice',
    rawType: 1,
    correctAnswers: ['A', 'B'],
    question: {text:'Elige dos.', html:'', images:[]},
    explanation: {text:'Justificación.', html:'', images:[]}
  });
  const {banks} = await ExamVCE.toBank(file([multiple]));
  const bank = ExamCatalog.normalize(banks[0]);
  assert.equal(bank.questions[0].type, 'multiple');
  assert.deepEqual(bank.questions[0].correct, ['A', 'B']);
  assert.equal(bank.questions[0].points, 1);
});

test('omite hot area y drag & drop con un motivo', async () => {
  const hot = choice({id:3, type:'hot_area', rawType:9});
  const drag = choice({id:4, type:'drag_and_drop', rawType:2});
  const {banks, report} = await ExamVCE.toBank(file([hot, drag]));
  assert.equal(report.imported, 0);
  assert.equal(report.skipped.length, 2);
  assert.match(report.skipped[0].reason, /Hot area/);
  assert.match(report.skipped[1].reason, /Drag/);
  const only = await ExamVCE.toBank(file([hot]));
  assert.equal(only.banks.length, 0);
  assert.equal(only.report.skipped.length, 1);
  await assert.rejects(ExamVCE.toBank(file([])), /no contiene preguntas/i);
});

test('omite preguntas sin respuesta o con demasiadas opciones', async () => {
  const noCorrect = choice({id:5, correctAnswers:[]});
  const many = choice({id:6, options:Array.from({length:21}, (_, i) => ({letter:String.fromCharCode(65 + i), text:'O' + i})), correctAnswers:['A']});
  const {report} = await ExamVCE.toBank(file([choice({id:1}), noCorrect, many]));
  assert.equal(report.imported, 1);
  assert.equal(report.skipped.length, 2);
  assert.match(report.skipped[0].reason, /Sin respuesta correcta/);
  assert.match(report.skipped[1].reason, /20 opciones/);
});

test('normaliza los metadatos del VCE', async () => {
  const {banks} = await ExamVCE.toBank(file([choice()], {passingScore:0, timeLimit:0}));
  assert.equal(banks[0].meta.passingScore, 700);
  assert.equal(banks[0].meta.minutes, 120);
});

test('crea un banco por cada examen del fichero', async () => {
  const json = file([choice()], {exams:[{name:'Uno', questions:[choice()]}, {name:'Dos', questions:[choice({id:2})]}]});
  const {banks, report} = await ExamVCE.toBank(json);
  assert.equal(banks.length, 2);
  assert.equal(report.imported, 2);
  assert.deepEqual(banks.map(bank => bank.meta.title), ['Uno', 'Dos']);
});

test('usa el título del documento y numera los exámenes sin nombre', async () => {
  const single = await ExamVCE.toBank(file([choice()]));
  assert.equal(single.banks[0].meta.title, 'Test VCE');
  const multi = await ExamVCE.toBank(file([choice()], {title:'Batería', exams:[
    {name:'', questions:[choice()]},
    {name:'', questions:[choice({id:2})]}
  ]}));
  assert.deepEqual(multi.banks.map(bank => bank.meta.title), ['Batería · 1', 'Batería · 2']);
});

test('adapta el caso de estudio', async () => {
  const withCase = choice({caseStudy:{title:'Caso', text:'Contexto {{image:0}}', images:[{mime:'image/png', base64:'AA=='}]}});
  const {banks} = await ExamVCE.toBank(file([withCase]));
  const bank = ExamCatalog.normalize(banks[0]);
  assert.deepEqual(bank.questions[0].caseStudy, [{kind:'text', text:'Caso\n\nContexto'}]);
});

test('la copia del conversor en dist está sincronizada', () => {
  const source = fs.readFileSync(path.join(__dirname, 'vce-converter-python', 'vce34_to_json.py'));
  const copy = fs.readFileSync(path.join(__dirname, 'dist', 'vendor', 'vce34_to_json.py'));
  assert.ok(source.equals(copy), 'Ejecuta npm run build para copiar vce34_to_json.py a dist/vendor.');
});
