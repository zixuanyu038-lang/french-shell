import test from 'node:test';
import assert from 'node:assert/strict';
import { Mascot } from '../src/mascot.js';
import { mascotDefaults, mascotSkins, mascotStates, normalizeMascotSettings, mascotPose, posePosition, availableMascotActions } from '../src/mascot-assets.js';

function node() {
  const listeners=new Map(),classes=new Set();
  return {hidden:true,textContent:'',style:{},dataset:{},attributes:{},listeners,
    classList:{toggle(name,enabled) { if (enabled) classes.add(name); else classes.delete(name); },contains:name=>classes.has(name)},
    addEventListener(type,listener) { listeners.set(type,listener); },removeEventListener(type) { listeners.delete(type); },
    setAttribute(name,value) { this.attributes[name]=value; },click() { listeners.get('click')?.(); },
    emit(type,event={}) { listeners.get(type)?.(event); },getBoundingClientRect() { return {left:0,top:0,width:100,height:100}; }
  };
}
function fakeClock() {
  let now=0,nextId=0; const tasks=new Map();
  return {now:()=>now,setTimeout(fn,ms) { const id=++nextId; tasks.set(id,{fn,at:now+Math.max(0,ms)}); return id; },
    clearTimeout:id=>tasks.delete(id),get pending() { return tasks.size; },
    tick(ms) {
      const target=now+ms; let count=0;
      while (true) {
        const next=[...tasks.entries()].filter(([,task])=>task.at<=target).sort((a,b)=>a[1].at-b[1].at || a[0]-b[0])[0];
        if (!next) break;
        assert.ok(++count<10000,'fake clock detected an infinite timer loop');
        const [id,task]=next; tasks.delete(id); now=task.at; task.fn();
      }
      now=target;
    }
  };
}
// These plain-object mocks test ownership and time, not CSS or real pixels.
// The browser checks independently cover rendered visibility, scale and artwork.
function setup(t,{autoLoad=true,broken=false,settings={},rawSettings}={}) {
  const elements=Object.fromEntries(['root','image','sprite','unavailable','collapse','source','message','caption','actionStatus'].map(key=>[key,node()]));
  elements.root.parentElement=node();
  const values=new Map(),storage={getItem:key=>values.get(key) ?? null,setItem:(key,value)=>values.set(key,value)};
  storage.setItem('french-shell-mascot-settings',JSON.stringify(rawSettings ?? {...mascotDefaults,...settings}));
  const motion={...node(),matches:false},page={...node(),hidden:false},clock=fakeClock(),paths=[],requests=[];
  const imageFactory=()=>({set src(path) {
    paths.push(path); const size=mascotPose('hd','idle');
    this.naturalWidth=size.width; this.naturalHeight=size.height;
    const request={path,image:this,settled:false,finish:({error=false,width,height}={})=>{
      request.settled=true;
      if (width!==undefined) this.naturalWidth=width;
      if (height!==undefined) this.naturalHeight=height;
      if (error) this.onerror?.(); else this.onload?.();
    }};
    requests.push(request);
    if (autoLoad) queueMicrotask(()=>request.finish({error:broken}));
  }});
  const mascot=new Mascot(elements,{storage,motionQuery:motion,page,imageFactory,clock});
  t.after(()=>mascot.dispose());
  const finish=(options)=>{
    const request=requests.find(item=>!item.settled); assert.ok(request,'no pending HD image'); request.finish(options);
  };
  return {mascot,elements,storage,motion,page,clock,paths,requests,finish};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function assertArtwork(elements,visible=true) {
  assert.equal(elements.image.hidden,true,'removed classic artwork must never become visible');
  assert.equal(elements.sprite.hidden,!visible);
  assert.ok([elements.image,elements.sprite].filter(element=>!element.hidden).length<=1);
}
const expectedCells={idle:0,thinking:2,result:5,speaking:5,error:9,saved:15,review:2,cancelled:0,hello:10,nudge:10};

test('only HD and one shared square atlas remain; all production states are static cells',()=>{
  assert.deepEqual(Object.keys(mascotSkins),['hd']);
  assert.equal(mascotDefaults.skin,'hd'); assert.equal(mascotDefaults.behaviorVersion,3);
  assert.equal(mascotDefaults.automatic,undefined); assert.equal(mascotDefaults.lookAtPointer,undefined);
  const atlas=mascotPose('hd','idle');
  assert.match(atlas.path,/\/deepseek-actions\.png$/);
  assert.equal(atlas.columns,4); assert.equal(atlas.rows,4);
  for (const [state,cell] of Object.entries(expectedCells)) {
    const pose=mascotPose('hd',state);
    assert.equal(pose.path,atlas.path); assert.equal(pose.kind,'atlas');
    assert.deepEqual(pose.frames,[cell]); assert.equal(pose.fps,0); assert.equal(pose.loop,false);
    assert.equal(pose.width,pose.columns*pose.cellWidth); assert.equal(pose.height,pose.rows*pose.cellHeight);
    assert.equal(pose.cellWidth,pose.cellHeight); assert.equal(pose.still,0);
    for (const frame of [-999,0,999,NaN]) {
      const position=posePosition(pose,frame).split(' ').map(parseFloat);
      assert.ok(position.every(value=>Number.isFinite(value) && value>=0 && value<=100));
    }
  }
  assert.equal(mascotPose('hd','hello').durationMs,1500);
  assert.deepEqual(availableMascotActions('hd'),['hello']);
});
test('legacy preferences migrate to HD and preserve visibility, motion and collapse but drop removed settings',async t=>{
  const legacy={skin:'sprite',enabled:false,motion:false,collapsed:true,automatic:true,lookAtPointer:true,behaviorVersion:2,apiKey:'never-save'};
  const expected={...mascotDefaults,skin:'hd',enabled:false,motion:false,collapsed:true};
  for (const skin of ['sprite','classic','anime','hd']) assert.deepEqual(normalizeMascotSettings({...legacy,skin}),expected);
  assert.deepEqual(normalizeMascotSettings({...legacy,behaviorVersion:1}),expected);
  const {mascot,storage,elements}=setup(t,{rawSettings:legacy});
  assert.deepEqual(mascot.settings,expected); assert.equal(elements.root.hidden,true);
  mascot.apply({enabled:true,collapsed:false,automatic:true,lookAtPointer:true,apiKey:'never-save'}); await flush();
  const saved=JSON.parse(storage.getItem('french-shell-mascot-settings'));
  assert.deepEqual(Object.keys(saved).sort(),Object.keys(mascotDefaults).sort());
  assert.equal(saved.skin,'hd'); assert.equal(saved.behaviorVersion,3);
  assert.ok(!JSON.stringify(saved).includes('never-save'));
});

test('default HD never animates or tracks the pointer and only loads its shared business atlas',async t=>{
  const {mascot,elements,clock,page,paths}=setup(t); await flush();
  assertArtwork(elements); const position=elements.sprite.style.backgroundPosition;
  page.emit('pointermove',{clientX:150,clientY:50}); page.emit('pointerdown'); page.emit('keydown');
  clock.tick(120000); mascot.render();
  assert.equal(mascot.overlay,undefined); assert.equal(elements.sprite.style.backgroundPosition,position);
  assert.equal(clock.pending,0); assert.deepEqual(paths,[mascotPose('hd','idle').path]);
  assert.ok(!page.listeners.has('pointermove'));
});

test('business states are exact snapshots and repeated renders or equal states never start timers',async t=>{
  const {mascot,elements,clock,paths}=setup(t); await flush();
  for (const state of ['idle','thinking','result','saved','speaking','error','cancelled','review']) {
    mascot.setState(state,state+' 的业务文本','业务说明'); await flush();
    const expected=posePosition(mascotPose('hd',state),0);
    assertArtwork(elements); assert.equal(elements.sprite.style.backgroundPosition,expected);
    mascot.render(); mascot.render(); mascot.setState(state,state+' 的业务文本','业务说明');
    clock.tick(50000);
    assert.equal(elements.sprite.style.backgroundPosition,expected); assert.equal(elements.message.textContent,state+' 的业务文本');
    assert.equal(elements.caption.textContent,'业务说明'); assert.equal(mascot.overlay,undefined); assert.equal(clock.pending,0);
  }
  assert.equal(paths.length,1);
});

test('poke shows the static hello pose for 1500 ms and restores the unchanged business snapshot',async t=>{
  const {mascot,elements,clock}=setup(t); await flush(); mascot.setState('saved','词已经保存','保存成功');
  const business=elements.sprite.style.backgroundPosition;
  assert.equal(mascot.nudge(),true); await flush();
  assert.equal(mascot.overlay.state,'hello'); assert.equal(mascot.overlay.kind,'manual');
  assert.equal(elements.sprite.style.backgroundPosition,posePosition(mascotPose('hd','hello'),0));
  assert.equal(mascot.animationTimer,undefined); assert.equal(clock.pending,1);
  mascot.render(); mascot.render(); clock.tick(1499);
  assert.equal(mascot.overlay.state,'hello'); assert.equal(elements.message.textContent,'词已经保存');
  clock.tick(1); await flush();
  assert.equal(mascot.overlay,undefined); assert.equal(elements.sprite.style.backgroundPosition,business);
  assert.equal(elements.message.textContent,'词已经保存'); assert.equal(elements.caption.textContent,'保存成功'); assert.equal(clock.pending,0);
});

test('repeated pokes always use hello and only the latest 1500 ms restoration survives',async t=>{
  const {mascot,elements,clock}=setup(t); await flush(); mascot.setState('result','词卡提示');
  mascot.nudge(); await flush(); clock.tick(1000); mascot.nudge(); await flush();
  assert.equal(mascot.overlay.state,'hello'); assert.equal(clock.pending,1);
  clock.tick(501); assert.equal(mascot.overlay.kind,'manual');
  clock.tick(999); await flush(); assert.equal(mascot.overlay,undefined);
  assert.equal(elements.message.textContent,'词卡提示'); assert.equal(clock.pending,0);
});

test('a new query cancels poke restoration even if it updates the same business state',async t=>{
  const {mascot,elements,clock}=setup(t); await flush(); mascot.setState('result','旧词卡');
  mascot.nudge(); clock.tick(500); mascot.setState('result','新词卡','新结果');
  assert.equal(mascot.overlay,undefined); clock.tick(2000); await flush();
  assert.equal(elements.message.textContent,'新词卡'); assert.equal(elements.caption.textContent,'新结果');
  assert.equal(elements.sprite.style.backgroundPosition,posePosition(mascotPose('hd','result'),0)); assert.equal(clock.pending,0);
});

test('busy or error states reject pokes and an old restoration cannot overwrite their feedback',async t=>{
  for (const state of ['thinking','speaking','error']) {
    const {mascot,elements,clock,page}=setup(t); await flush(); mascot.nudge(); clock.tick(100);
    mascot.setState(state,'新的业务提示','业务状态'); assert.equal(mascot.nudge(),false); assert.equal(mascot.overlay,undefined);
    page.emit('pointermove',{clientX:150,clientY:50}); clock.tick(10000); await flush();
    assert.equal(mascot.state,state); assert.equal(elements.root.dataset.pose,state);
    assert.equal(elements.message.textContent,'新的业务提示'); assert.equal(elements.caption.textContent,'业务状态');
    assert.equal(elements.sprite.style.backgroundPosition,posePosition(mascotPose('hd',state),0)); assert.equal(clock.pending,0); mascot.dispose();
  }
});

test('delayed loading publishes only the latest query pose and keeps image and sprite mutually exclusive',async t=>{
  const {mascot,elements,paths,finish}=setup(t,{autoLoad:false});
  assertArtwork(elements,false); mascot.nudge(); mascot.setState('thinking','新查询','查词中'); mascot.setState('result','最新词卡','最新结果');
  assertArtwork(elements,false); finish(); await flush(); assertArtwork(elements);
  assert.equal(mascot.activePose.path,mascotPose('hd','result').path); assert.equal(mascot.overlay,undefined);
  assert.equal(elements.sprite.style.backgroundPosition,posePosition(mascotPose('hd','result'),0));
  assert.equal(elements.message.textContent,'最新词卡'); assert.equal(paths.length,1);
  mascot.nudge(); await flush(); assert.equal(paths.length,1);
});

test('missing, incorrectly sized and timed-out HD assets show text without loading removed skins',async t=>{
  for (const failure of ['missing','size','timeout']) {
    const {mascot,elements,paths,finish,clock}=setup(t,{autoLoad:false});
    if (failure==='missing') finish({error:true});
    if (failure==='size') finish({width:10,height:10});
    if (failure==='timeout') clock.tick(5001);
    await flush(); assert.equal(mascot.ready,false); assertArtwork(elements,false); assert.equal(elements.unavailable.hidden,false);
    assert.deepEqual(paths,[mascotPose('hd','idle').path]);
    mascot.setState('error','词卡错误照常显示','查词失败'); clock.tick(60000); await flush();
    if (failure==='timeout') {
      finish(); await flush();
      assert.equal(mascot.ready,false); assertArtwork(elements,false);
      assert.equal(elements.unavailable.hidden,false);
    }
    assert.equal(paths.length,1); assert.equal(clock.pending,0); assert.equal(elements.message.textContent,'词卡错误照常显示');
    assert.equal(elements.caption.textContent,'查词失败'); mascot.dispose();
  }
});

test('reapplying settings may retry one failed HD asset but does not create an automatic retry loop',async t=>{
  const {mascot,elements,paths,finish,clock}=setup(t,{autoLoad:false});
  finish({error:true}); await flush(); clock.tick(60000); assert.equal(paths.length,1);
  mascot.apply({}); finish(); await flush(); assertArtwork(elements);
  assert.equal(paths.length,2); assert.equal(clock.pending,0); assert.equal(mascot.settings.skin,'hd');
});

test('disabled, collapsed, hidden and other views pause the single poke deadline and resume only its remainder',async t=>{
  for (const mode of ['disabled','collapsed','hidden','settings']) {
    const {mascot,elements,clock,page}=setup(t); await flush(); mascot.setState('result','相同词卡'); mascot.nudge(); clock.tick(500);
    if (mode==='disabled') mascot.apply({enabled:false});
    if (mode==='collapsed') elements.collapse.click();
    if (mode==='hidden') { page.hidden=true; page.emit('visibilitychange'); }
    if (mode==='settings') mascot.setView('settings');
    assert.equal(mascot.nudge(),false); clock.tick(60000); assert.equal(clock.pending,0);
    if (mode==='disabled') mascot.apply({enabled:true});
    if (mode==='collapsed') elements.collapse.click();
    if (mode==='hidden') { page.hidden=false; page.emit('visibilitychange'); }
    if (mode==='settings') mascot.setView('search');
    assert.equal(mascot.overlay.state,'hello');
    assert.equal(elements.sprite.style.backgroundPosition,posePosition(mascotPose('hd','hello'),0));
    assert.equal(clock.pending,1); clock.tick(999); assert.equal(mascot.overlay.state,'hello');
    clock.tick(1); assert.equal(mascot.overlay,undefined);
    assert.equal(elements.sprite.style.backgroundPosition,posePosition(mascotPose('hd','result'),0));
    assert.equal(elements.message.textContent,'相同词卡'); assert.equal(clock.pending,0); mascot.dispose();
  }
});

test('reduced motion and disabled motion never create frame timers or automatic replays',async t=>{
  for (const mode of ['reduced','disabledMotion']) {
    const {mascot,elements,clock,motion}=setup(t); await flush();
    if (mode==='reduced') { motion.matches=true; motion.emit('change'); } else mascot.apply({motion:false});
    mascot.setState('saved','已保存'); mascot.nudge(); await flush();
    assert.equal(mascot.animationTimer,undefined); assert.equal(elements.sprite.style.backgroundPosition,posePosition(mascotPose('hd','hello'),0));
    clock.tick(1500); assert.equal(elements.sprite.style.backgroundPosition,posePosition(mascotPose('hd','saved'),0)); assert.equal(clock.pending,0);
    if (mode==='reduced') { motion.matches=false; motion.emit('change'); } else mascot.apply({motion:true});
    clock.tick(10000); assert.equal(mascot.overlay,undefined); assert.equal(clock.pending,0); mascot.dispose();
  }
});

test('a new query while hidden cancels the paused poke instead of restoring it on return',async t=>{
  const {mascot,elements,clock,page}=setup(t); await flush(); mascot.setState('result','旧词卡'); mascot.nudge(); clock.tick(500);
  page.hidden=true; page.emit('visibilitychange'); clock.tick(60000);
  mascot.setState('thinking','后台正在查新词','正在查询');
  page.hidden=false; page.emit('visibilitychange'); clock.tick(10000);
  assert.equal(mascot.overlay,undefined); assert.equal(elements.message.textContent,'后台正在查新词');
  assert.equal(elements.caption.textContent,'正在查询');
  assert.equal(elements.sprite.style.backgroundPosition,posePosition(mascotPose('hd','thinking'),0)); assert.equal(clock.pending,0);
});

test('dispose removes listeners, cancels restoration and invalidates pending image callbacks',async t=>{
  const {mascot,elements,motion,page,clock}=setup(t); await flush(); mascot.nudge(); mascot.dispose();
  assert.equal(clock.pending,0); assert.equal(elements.collapse.listeners.size,0); assert.equal(motion.listeners.size,0); assert.equal(page.listeners.size,0);
  const position=elements.sprite.style.backgroundPosition; clock.tick(120000); await flush(); assert.equal(elements.sprite.style.backgroundPosition,position);
  const pending=setup(t,{autoLoad:false}); pending.mascot.dispose(); assert.equal(pending.clock.pending,0);
  for (const request of pending.requests) { assert.equal(request.image.onload,null); assert.equal(request.image.onerror,null); }
  pending.finish(); await flush(); assert.equal(pending.mascot.ready,false); assertArtwork(pending.elements,false);
});
