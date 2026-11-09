const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExamVCE = require('./dist/vce-import.js');
const ExamCatalog = require('./dist/catalog.js');

const bytes = (...values) => new Uint8Array(values);
const descriptor = (key = 'a'.repeat(64), extra = {}) => ({key, mime:'image/png', width:10, height:10, ...extra});

const choice = (overrides = {}) => ({
  id: 1,
  type: 'single_choice',
  rawType: 0,
  question: {text:'¿Cuál es la respuesta? {{image:0}}', html:'', images:[descriptor()]},
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
  assert.equal(report.imagesImported, 1);
  assert.deepEqual(report.imageKeys, ['a'.repeat(64)]);
  const bank = ExamCatalog.normalize(banks[0]);
  assert.equal(bank.meta.title, 'Test VCE');
  assert.equal(bank.meta.minutes, 90);
  assert.equal(bank.meta.passingScore, 800);
  const question = bank.questions[0];
  assert.equal(question.type, 'single');
  assert.equal(question.body[0].text, '¿Cuál es la respuesta?');
  assert.equal(question.body[1].kind, 'image');
  assert.equal(question.body[1].image.src, '/assets/' + 'a'.repeat(64) + '.png');
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

test('importa hot area y drag & drop sobre imagen con su geometría', async () => {
  const hot = {
    id:3, type:'hot_area', rawType:9,
    question:{text:'Marca la zona correcta.', html:'', images:[]},
    areaImage:descriptor('b'.repeat(64), {width:100, height:80}),
    hotArea:{areas:[
      {index:0, rect:{x:1,y:2,width:10,height:12}},
      {index:1, rect:{x:20,y:30,width:10,height:10}}
    ]},
    correctAreas:[1],
    explanation:{text:'La segunda zona.', html:'', images:[]}
  };
  const drag = {
    id:4, type:'drag_and_drop', rawType:2,
    question:{text:'Arrastra cada valor.', html:'', images:[]},
    areaImage:descriptor('c'.repeat(64), {width:200, height:100}),
    dragAndDrop:{
      items:[
        {index:0, rect:{x:1,y:2,width:20,height:10}, image:descriptor('d'.repeat(64))},
        {index:1, rect:{x:30,y:2,width:20,height:10}, image:descriptor('e'.repeat(64))}
      ],
      targets:[
        {index:0, rect:{x:100,y:20,width:40,height:20}},
        {index:1, rect:{x:100,y:60,width:40,height:20}}
      ]
    },
    correctAnswers:[0,1],
    explanation:{text:'Asignación correcta.', html:'', images:[]}
  };
  const {banks, report} = await ExamVCE.toBank(file([hot, drag]));
  assert.equal(report.imported, 2);
  assert.equal(report.skipped.length, 0);
  const bank = ExamCatalog.normalize(banks[0]);
  const hotQuestion = bank.questions.find(question => question.id === 1);
  assert.equal(hotQuestion.type, 'hotarea');
  assert.equal(hotQuestion.image.src, '/assets/' + 'b'.repeat(64) + '.png');
  assert.deepEqual(hotQuestion.areas.map(area => area.id), [0, 1]);
  assert.deepEqual(hotQuestion.correct, [1]);
  assert.equal(hotQuestion.points, 1);
  const dragQuestion = bank.questions.find(question => question.id === 2);
  assert.equal(dragQuestion.type, 'imagedrag');
  assert.deepEqual(dragQuestion.targets.map(target => target.id), [0, 1]);
  assert.deepEqual(dragQuestion.items.map(item => item.id), [0, 1]);
  assert.deepEqual(dragQuestion.correct, [0, 1]);
  assert.equal(dragQuestion.points, 2);
  assert.equal(report.imagesImported, 4);
});

test('las preguntas omitidas incluyen número, tipo, motivo y detalles clicables', async () => {
  const broken = {id:7, type:'hot_area', rawType:9, question:{text:'Sin imagen', html:'', images:[]}, correctAreas:[0]};
  const {banks, report} = await ExamVCE.toBank(file([choice(), broken]));
  assert.equal(banks.length, 1);
  assert.equal(report.skipped.length, 1);
  const issue = report.skipped[0];
  assert.equal(issue.id, 7);
  assert.equal(issue.type, 'hot_area');
  assert.equal(issue.typeLabel, 'Hot area');
  assert.match(issue.reason, /imagen/i);
  assert.equal(issue.details.question, 7);
  assert.equal(issue.details.reason, issue.reason);
  assert.equal(issue.details.bodyText, 'Sin imagen');
  assert.equal(issue.details.areaImage, null);
});

test('rechaza ficheros sin preguntas', async () => {
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

test('adapta el caso de estudio y conserva sus imágenes', async () => {
  const withCase = choice({caseStudy:{title:'Caso', text:'Contexto {{image:0}}', images:[descriptor('f'.repeat(64))]}});
  const {banks, report} = await ExamVCE.toBank(file([withCase]));
  const bank = ExamCatalog.normalize(banks[0]);
  const study = bank.questions[0].caseStudy;
  assert.equal(study.filter(part => part.kind === 'text').map(part => part.text).join(' '), 'Caso Contexto');
  assert.equal(study.find(part => part.kind === 'image').image.src, '/assets/' + 'f'.repeat(64) + '.png');
  assert.equal(report.imagesImported, 2);
});

test('la copia del conversor en dist está sincronizada', () => {
  const source = fs.readFileSync(path.join(__dirname, 'vce-converter-python', 'vce34_to_json.py'));
  const copy = fs.readFileSync(path.join(__dirname, 'dist', 'vendor', 'vce34_to_json.py'));
  assert.ok(source.equals(copy), 'Ejecuta npm run build para copiar vce34_to_json.py a dist/vendor.');
});
