(function(root){
 'use strict';
 const useful=parts=>(parts||[]).filter(p=>p&&(p.kind==='image'||(typeof p.text==='string'&&p.text.replace(/\[\[INTERACTION\]\]/g,'').trim())));
 function at(parts,point){
  const p=parts[point.i];
  if(!p||typeof p.text!=='string')return [parts.slice(0,point.i),parts.slice(point.i)];
  const left=parts.slice(0,point.i),right=parts.slice(point.i+1);
  if(point.at>0)left.push({...p,text:p.text.slice(0,point.at)});
  if(point.at<p.text.length)right.unshift({...p,text:p.text.slice(point.at)});
  return [left,right];
 }
 function find(parts,expression,last=false){
  let found=null;
  for(let i=0;i<parts.length;i++){
   if(typeof parts[i].text!=='string')continue;
   const re=new RegExp(expression.source,'gm'+(expression.ignoreCase?'i':''));
   for(const m of parts[i].text.matchAll(re)){
    found={i,at:m.index};if(!last)return found;
   }
  }
  return found;
 }
 function markdownHeadings(parts){
  let study=null,question=null,fence=null;
  for(let i=0;i<parts.length;i++){
   if(typeof parts[i].text!=='string')continue;
   let pos=0;
   for(const line of parts[i].text.split('\n')){
    const marker=line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if(marker){if(!fence)fence=marker[1];else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length)fence=null;}
    else if(!fence){
     if(/^\s{0,3}#{1,6}\s+(?:Case study|Caso(?: de estudio| práctico)?|Contexto)\s*[:\-–—#]*\s*$/i.test(line)&&!study)study={i,at:pos};
     if(/^\s{0,3}#{1,6}\s+(?:Question|Pregunta)\s*[:\-–—#]*\s*$/i.test(line)&&!question)question={i,at:pos};
    }
    pos+=line.length+1;
   }
  }
  return {study,question};
 }
 function split(q){
  const parts=useful(q.body),explicit=useful(q.caseStudy);
  if(explicit.length)return {context:explicit,question:parts};
  if(!parts.some(p=>typeof p.text==='string'&&p.text.trim()))return {context:[],question:parts};
  if(parts.some(p=>p.kind==='markdown')){
   const h=markdownHeadings(parts);
   if(!h.study||!h.question)return {context:[],question:parts};
   if(h.question.i<h.study.i||(h.question.i===h.study.i&&h.question.at<h.study.at)){
    const [question,context]=at(parts,h.study);return {context,question};
   }
   const [context,question]=at(parts,h.question);return {context,question};
  }
  const title=find(parts,/Case Study Title\s*\(Case Study\)\s*:/i);
  if(title){const [question,context]=at(parts,title);if(useful(question).length)return {context:useful(context),question:useful(question)};}
  const start=find(parts,/(?:^|\n)\s*Case Study\b|This is a case study\./i);
  if(!start)return {context:[],question:parts};
  const [prefix,caseParts]=at(parts,start);
  let boundary=find(caseParts,/^Question\s*\n(?=You create)/);
  if(!boundary)boundary=find(caseParts,/You are creating a table that will store customer profiles\.|You are evaluating the DAB configuration\./);
  if(!boundary)boundary=find(caseParts,/Question(?=You need to)|You need to /,true);
  if(!boundary)return useful(prefix).length?{context:caseParts,question:prefix}:{context:[],question:parts};
  let [context,question]=at(caseParts,boundary);
  // Q30 repeats the options inside its prose; keep that source text in the
  // expandable context while the actual answer controls remain visible.
  if((q.notes||[]).some(n=>/repite las opciones/i.test(n))){
   const duplicated=find(question,/\s+A\. Create a clustered index/);
   if(duplicated){const [task,extra]=at(question,duplicated);question=task;context=context.concat(extra);}
  }
  const prefixText=prefix.map(p=>typeof p.text==='string'?p.text:'').join('').replace(/HOTSPOT|DRAG\s*DROP|[\s-]/gi,'');
  if(prefixText.trim())question=question.concat(prefix);else context=prefix.concat(context);
  return {context:useful(context),question:useful(question)};
 }
 const api={split};root.ExamCaseStudy=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
