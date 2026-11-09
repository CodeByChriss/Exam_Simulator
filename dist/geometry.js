/* Geometría pura del editor de imágenes: coordenadas en píxeles de la imagen. */
(function(root){
 'use strict';
 const MIN = 4;

 function finite(value){return typeof value === 'number' && Number.isFinite(value);}
 function validRect(rect){return !!rect && [rect.x,rect.y,rect.width,rect.height].every(finite) && rect.width > 0 && rect.height > 0;}
 function copyRect(rect){return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};}
 function roundRect(rect){return {x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)};}
 function clamp(value,min,max){return Math.min(max,Math.max(min,value));}

 function normalizeRect(start,end,bounds){
  const x1=clamp(Math.min(start.x,end.x),0,bounds.width);
  const y1=clamp(Math.min(start.y,end.y),0,bounds.height);
  const x2=clamp(Math.max(start.x,end.x),0,bounds.width);
  const y2=clamp(Math.max(start.y,end.y),0,bounds.height);
  return {x:x1,y:y1,width:x2-x1,height:y2-y1};
 }

 function clampRect(rect,bounds,min=MIN){
  const width=clamp(rect.width,min,bounds.width);
  const height=clamp(rect.height,min,bounds.height);
  return {
   x:clamp(rect.x,0,Math.max(0,bounds.width-width)),
   y:clamp(rect.y,0,Math.max(0,bounds.height-height)),
   width,height
  };
 }

 function moveRect(rect,dx,dy,bounds){
  return clampRect({...rect,x:rect.x+dx,y:rect.y+dy},bounds,Math.min(MIN,rect.width,rect.height));
 }

 function resizeRect(rect,handle,dx,dy,bounds,min=MIN){
  let left=rect.x,top=rect.y,right=rect.x+rect.width,bottom=rect.y+rect.height;
  if(handle.includes('w'))left=clamp(left+dx,0,right-min);
  if(handle.includes('e'))right=clamp(right+dx,left+min,bounds.width);
  if(handle.includes('n'))top=clamp(top+dy,0,bottom-min);
  if(handle.includes('s'))bottom=clamp(bottom+dy,top+min,bounds.height);
  return {x:left,y:top,width:right-left,height:bottom-top};
 }

 function contains(rect,x,y){return x>=rect.x&&x<=rect.x+rect.width&&y>=rect.y&&y<=rect.y+rect.height;}

 function scaleRect(rect,from,to){
  if(!rect||!from||!to||from.width<=0||from.height<=0)return copyRect(rect||{x:0,y:0,width:1,height:1});
  return {
   x:rect.x*to.width/from.width,
   y:rect.y*to.height/from.height,
   width:rect.width*to.width/from.width,
   height:rect.height*to.height/from.height
  };
 }

 function percent(rect,bounds){
  if(!bounds||!bounds.width||!bounds.height)return {left:'0%',top:'0%',width:'0%',height:'0%'};
  return {
   left:(rect.x/bounds.width*100)+'%',
   top:(rect.y/bounds.height*100)+'%',
   width:(rect.width/bounds.width*100)+'%',
   height:(rect.height/bounds.height*100)+'%'
  };
 }

 function insideImage(rect,bounds){return !!rect&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=bounds.width+0.001&&rect.y+rect.height<=bounds.height+0.001;}

 const api={MIN,validRect,copyRect,roundRect,normalizeRect,clampRect,moveRect,resizeRect,contains,scaleRect,percent,insideImage};
 root.ExamGeometry=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
