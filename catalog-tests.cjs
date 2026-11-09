const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Catalog=require('./dist/catalog.js'),C=require('./dist/core.js');
const builtin=JSON.parse(fs.readFileSync(__dirname+'/dist/questions.json','utf8'));
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
const question=()=>({id:1,type:'single',body:[{kind:'text',text:'Pregunta'}],solution:[{kind:'text',text:'Porque es correcta.'}],options:[{id:'A',text:'Primera'},{id:'B',text:'Segunda'}],correct:['B'],points:1,pages:[],notes:[]});
const bank=()=>({meta:{title:'Examen nuevo',minutes:30,passingScore:650},questions:[question()]});
test('Create, edit, reload and select independent exams without altering the original',()=>{
 const storage=memory(),lib=Catalog.create(storage,builtin),hash=JSON.stringify(builtin),a=lib.add(bank()),b=lib.add({...bank(),meta:{title:'Otro',minutes:60,passingScore:800}});
 const changed=lib.get(a).bank;changed.questions.push({...question(),id:2});lib.update(a,changed);lib.select(a);
 const restored=Catalog.create(storage,builtin);assert.equal(restored.selected(),a);assert.equal(restored.get(a).bank.questions.length,2);assert.equal(restored.get(b).bank.questions.length,1);assert.equal(JSON.stringify(builtin),hash);
 assert.throws(()=>lib.update(Catalog.BASE,bank()));assert.throws(()=>lib.remove(Catalog.BASE));
});
test('Duplicate original and export/import preserve all six native interaction types and solutions',()=>{
 const lib=Catalog.create(memory(),builtin),id=lib.duplicate(Catalog.BASE);assert.equal(lib.get(id).bank.questions.length,101);
 const copy=lib.import(lib.export(id));assert.notEqual(copy,id);assert.deepEqual(lib.get(copy).bank.questions,lib.get(id).bank.questions);
});
test('Invalid answer keys and incomplete response targets are rejected before saving',()=>{
 const lib=Catalog.create(memory(),builtin),bad=bank();bad.questions[0].correct=['Z'];assert.throws(()=>lib.add(bad));
 const dropdown={id:2,type:'dropdown',body:[{kind:'text',text:'Completa'}],solution:[],pools:[['a','b'],['c','d']],correct:[0,1],points:2,template:'{{0}} {{0}}'};
 assert.throws(()=>lib.add({...bank(),questions:[dropdown]}));dropdown.template='{{0}} {{1}}';assert.doesNotThrow(()=>lib.add({...bank(),questions:[dropdown]}));
});
test('Import rejects unknown formats, invalid source paths and duplicate question IDs',()=>{
 const lib=Catalog.create(memory(),builtin);assert.throws(()=>lib.import('{invalid'));assert.throws(()=>lib.import('{}'));
 const b=bank();b.questions.push(question());assert.throws(()=>lib.add(b));b.questions.pop();b.questions[0].solution=[{kind:'image',src:'https://example.org/track.png'}];assert.throws(()=>lib.add(b));
});
test('Failed storage writes leave saved state unchanged',()=>{
 let full=false;const m=memory(),storage={getItem:m.getItem,setItem:(k,v)=>{if(full)throw Error('Quota');m.setItem(k,v);}},lib=Catalog.create(storage,builtin),id=lib.add(bank());
 full=true;const b=lib.get(id).bank;b.meta.title='No debe guardarse';assert.throws(()=>lib.update(id,b));assert.equal(lib.get(id).bank.meta.title,'Examen nuevo');
});
test('Hot area and image drag banks validate their image, zones, items and assignments',()=>{
 const lib=Catalog.create(memory(),builtin),asset='/assets/'+'a'.repeat(64)+'.png';
 const image={src:asset,mime:'image/png',width:100,height:80};
 const hot={id:1,type:'hotarea',body:[{kind:'text',text:'Marca'}],solution:[{kind:'text',text:'Razón'}],image:{...image},areas:[{id:0,x:1,y:2,width:10,height:10},{id:1,x:20,y:20,width:15,height:15}],correct:[1],points:1,notes:[],pages:[]};
 assert.doesNotThrow(()=>lib.add({meta:{title:'Hot',minutes:30,passingScore:700},questions:[hot]}));
 const drag={id:1,type:'imagedrag',body:[{kind:'text',text:'Arrastra'}],solution:[{kind:'text',text:'Razón'}],image:{...image,width:200,height:100},items:[{id:0,rect:{x:1,y:2,width:20,height:10},image:{...image}}],targets:[{id:0,x:100,y:20,width:40,height:20}],correct:[0],points:1,notes:[],pages:[]};
 assert.doesNotThrow(()=>lib.add({meta:{title:'Drag',minutes:30,passingScore:700},questions:[drag]}));
 const outside={...hot,areas:[{id:0,x:95,y:2,width:20,height:10}]};assert.throws(()=>lib.add({meta:{title:'Fuera',minutes:30,passingScore:700},questions:[outside]}),/sale de la imagen/);
 const duplicate={...drag,targets:[{id:0,x:10,y:10,width:10,height:10},{id:0,x:20,y:20,width:10,height:10}],correct:[0,null]};assert.throws(()=>lib.add({meta:{title:'Duplicado',minutes:30,passingScore:700},questions:[duplicate]}),/identificadores únicos/);
});

test('Personal exam duration, cutoff and active question snapshot are honored',()=>{
 const b=Catalog.normalize(bank()),s=C.createSession(b.questions,{timed:true,now:100,minutes:b.meta.minutes,passingScore:b.meta.passingScore});s.bankSnapshot=JSON.parse(JSON.stringify(b));
 assert.equal(s.deadline,1800100);assert.equal(s.passingScore,650);b.questions[0].correct=['A'];s.answers[1]=['B'];
 assert.equal(C.results(s,s.bankSnapshot.questions).score,1000);assert(C.validSession(JSON.parse(JSON.stringify(s)),s.bankSnapshot.questions));
});
test('A personal cutoff changes pass/fail at the same score',()=>{
 const qs=Array.from({length:10},(_,i)=>({...question(),id:i+1})),s=C.createSession(qs,{passingScore:800});
 qs.slice(0,7).forEach(q=>s.answers[q.id]=['B']);assert.equal(C.results(s,qs).score,700);assert(!C.results(s,qs).passed);
 s.passingScore=650;assert(C.results(s,qs).passed);
});
