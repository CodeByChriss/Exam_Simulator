(function(root) {
  'use strict';
  const VERSION = 1;
  function shuffle(items, random = Math.random) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function createSession(questions, {mode='trainer', timed=false, now=Date.now(), ids=null, minutes=120, passingScore=700}={}) {
    const selected = ids ? questions.filter(q => ids.includes(q.id)) : questions;
    if (!selected.length) throw new Error('No hay preguntas para esta sesión.');
    return {version:VERSION, id:String(now)+'-'+Math.random().toString(36).slice(2),
      mode, timed, passingScore, startedAt:now, deadline:timed ? now+minutes*60000 : null,
      order:shuffle(selected.map(q=>q.id)), position:0, answers:{}, submitted:{}, flagged:[],
      optionOrder:Object.fromEntries(selected.filter(q=>q.options).map(q=>[q.id,shuffle(q.options.map(o=>o.id))])),
      finishedAt:null, finishReason:null, isRetry:!!ids};
  }
  function grade(q, answer) {
    const a=Array.isArray(answer)?answer:[];
    if(q.type==='hotarea'){
      const expected=new Set(q.correct),selected=new Set(a);
      const exact=selected.size===expected.size&&[...expected].every(id=>selected.has(id));
      return {earned:exact?1:0,possible:1,full:exact,parts:[exact]};
    }
    if(q.type==='imagedrag'){
      const parts=q.correct.map((value,i)=>a[i]===value);
      const earned=parts.filter(Boolean).length;
      return {earned,possible:q.points,full:earned===q.points,parts};
    }
    if (q.pools) {
      const parts=q.correct.map((v,i)=>a[i]===v);
      const earned=parts.filter(Boolean).length;
      return {earned, possible:q.points, full:earned===q.points, parts};
    }
    const exact=a.length===q.correct.length && new Set(a).size===a.length && q.correct.every(v=>a.includes(v));
    return {earned:exact?1:0,possible:1,full:exact,parts:[exact]};
  }
  function complete(q, a) {
    if (!Array.isArray(a)) return false;
    if(q.type==='hotarea')return a.length>0&&new Set(a).size===a.length;
    if(q.type==='imagedrag')return a.length===q.targets.length&&a.every(Number.isInteger);
    if (q.pools) return q.pools.every((p,i)=>Number.isInteger(a[i]) && a[i]>=0 && a[i]<p.length);
    return a.length>0;
  }
  function results(session, questions) {
    const map=new Map(questions.map(q=>[q.id,q]));
    const rows=session.order.map(id=>({id,...grade(map.get(id),session.answers[id]),answered:complete(map.get(id),session.answers[id])}));
    const earned=rows.reduce((n,r)=>n+r.earned,0), possible=rows.reduce((n,r)=>n+r.possible,0);
    const rawScore=earned/possible*1000;
    return {rows,earned,possible,score:Math.floor(rawScore),passed:rawScore>=(session.passingScore??700),
      correct:rows.filter(r=>r.full).length,partial:rows.filter(r=>!r.full&&r.earned>0).length,
      unanswered:rows.filter(r=>!r.answered).length,missed:rows.filter(r=>!r.full).map(r=>r.id)};
  }
  function remaining(session, now=Date.now()) {return session.deadline===null?null:Math.max(0,session.deadline-now);}
  function finish(session, reason='submitted', now=Date.now()) {
    const ended=reason==='timeout'&&session.deadline!==null?Math.min(now,session.deadline):now;
    return {...session,finishedAt:session.finishedAt||ended,finishReason:session.finishReason||reason};
  }
  function validSession(s, questions) {
    if (!s || s.version!==VERSION || !['normal','trainer'].includes(s.mode) || !Array.isArray(s.order) || !s.order.length) return false;
    const ids=new Set(questions.map(q=>q.id));
    return new Set(s.order).size===s.order.length && s.order.every(id=>ids.has(id)) &&
      Number.isInteger(s.position) && s.position>=0 && s.position<s.order.length &&
      s.answers && s.submitted && s.optionOrder && Array.isArray(s.flagged) &&
      Number.isFinite(s.startedAt) && (s.deadline===null||Number.isFinite(s.deadline));
  }
  const api={VERSION,shuffle,createSession,grade,complete,results,remaining,finish,validSession};
  if(typeof module!=='undefined') module.exports=api;
  root.ExamCore=api;
})(globalThis);
