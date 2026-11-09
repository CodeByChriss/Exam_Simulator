const test=require('node:test'),assert=require('node:assert/strict');
const G=require('./dist/geometry.js');
const bounds={width:200,height:100};

test('Normalizes a drag rectangle inside the image regardless of direction',()=>{
 assert.deepEqual(G.normalizeRect({x:150,y:80},{x:20,y:10},bounds),{x:20,y:10,width:130,height:70});
 assert.deepEqual(G.normalizeRect({x:-20,y:-5},{x:300,y:150},bounds),{x:0,y:0,width:200,height:100});
});

test('Moving and resizing keep zones inside the image and enforce a minimum size',()=>{
 assert.deepEqual(G.moveRect({x:10,y:10,width:20,height:20},-50,-50,bounds),{x:0,y:0,width:20,height:20});
 assert.deepEqual(G.moveRect({x:180,y:80,width:20,height:20},50,50,bounds),{x:180,y:80,width:20,height:20});
 assert.deepEqual(G.resizeRect({x:10,y:10,width:40,height:30},'nw',-20,-20,bounds),{x:0,y:0,width:50,height:40});
 const tiny=G.resizeRect({x:10,y:10,width:40,height:30},'se',-100,-100,bounds);
 assert.equal(tiny.width,G.MIN);assert.equal(tiny.height,G.MIN);
});

test('Scales geometry when the interaction image is replaced',()=>{
 assert.deepEqual(G.scaleRect({x:10,y:20,width:30,height:40},{width:100,height:100},{width:200,height:50}),{x:20,y:10,width:60,height:20});
});

test('Percentages and bounds checks match the rendered image box',()=>{
 assert.deepEqual(G.percent({x:20,y:10,width:50,height:25},bounds),{left:'10%',top:'10%',width:'25%',height:'25%'});
 assert.equal(G.insideImage({x:0,y:0,width:200,height:100},bounds),true);
 assert.equal(G.insideImage({x:190,y:0,width:20,height:10},bounds),false);
 assert.equal(G.contains({x:10,y:10,width:20,height:20},20,20),true);
 assert.equal(G.contains({x:10,y:10,width:20,height:20},31,20),false);
});
