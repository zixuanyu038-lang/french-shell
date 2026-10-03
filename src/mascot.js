import { mascotDefaults, mascotSkins, mascotStates, mascotActionLabel, mascotPose, posePosition, normalizeMascotSettings } from './mascot-assets.js';
import { loadSettings, saveSettings } from './settings.js';

const busyStates=new Set(['thinking','speaking','error']);

export class Mascot {
  constructor(elements,{storage,imageFactory=()=>new Image(),motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)'),page=document,clock={now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)}}={}) {
    this.elements=elements; this.storage=storage; this.imageFactory=imageFactory;
    this.motionQuery=motionQuery; this.page=page; this.clock=clock;
    this.settings=normalizeMascotSettings(loadSettings(storage,'french-shell-mascot-settings',mascotDefaults));
    this.state='idle'; this.view='search'; this.frame=0; this.ready=false; this.actualSkin='hd';
    this.stateVersion=0; this.poseVersion=0; this.pokeVersion=0;
    this.loaded=new Map(); this.assetsReady=new Set(); this.failures=new Set(); this.pendingLoads=new Set();
    this.motionChanged=()=>this.render();
    this.visibilityChanged=()=>this.render();
    this.collapseClicked=()=>{
      this.settings.collapsed=!this.settings.collapsed; this.persist(); this.render();
    };
    motionQuery.addEventListener?.('change',this.motionChanged);
    page.addEventListener?.('visibilitychange',this.visibilityChanged);
    elements.collapse.addEventListener('click',this.collapseClicked);
    this.render();
  }
  clearTimer(name) {this.clock.clearTimeout(this[name]);this[name]=undefined;}
  persist() {
    try {saveSettings(this.storage,'french-shell-mascot-settings',this.settings,mascotDefaults);return true;}
    catch {return false;}
  }
  apply(settings) {
    this.settings=normalizeMascotSettings({...this.settings,...settings});
    const persisted=this.persist();
    if(this.failures.size) {
      for(const path of this.failures) {this.loaded.delete(path);this.assetsReady.delete(path);}
      this.failures.clear();this.requestedPoseKey=undefined;this.loadingPose=undefined;this.poseVersion++;
    }
    this.render();return persisted;
  }
  setView(view) {this.view=view;this.render();}
  setState(state,message,caption='D指导说') {
    this.stateVersion++;this.cancelPoke();
    this.state=mascotStates[state] ? state : 'idle';
    if(message!==undefined) this.elements.message.textContent=message;
    this.elements.caption.textContent=caption;this.render();
  }
  isVisible() {return this.settings.enabled&&!this.settings.collapsed&&!this.page.hidden&&this.view==='search'&&!this.disposed;}
  nudge() {return this.playAction('hello');}
  playAction(action) {
    if(action!=='hello'||!this.isVisible()||!this.ready||this.loadingPose||busyStates.has(this.state)) return false;
    this.cancelPoke();this.overlay={state:'hello',kind:'manual'};
    const duration=mascotPose('hd','hello').durationMs;
    this.remainingMs=Number.isFinite(duration)&&duration>=0 ? duration : 1500;
    this.render();return true;
  }
  cancelPoke() {
    this.pokeVersion++;this.clearTimer('temporaryTimer');
    this.overlay=undefined;this.remainingMs=undefined;this.pokeDeadline=undefined;
  }
  syncPokeTimer() {
    if(!this.overlay) return;
    if(!this.isVisible()||!this.ready||this.loadingPose) {
      if(this.temporaryTimer!==undefined) {
        this.remainingMs=Math.max(0,this.pokeDeadline-this.clock.now());
        this.clearTimer('temporaryTimer');this.pokeDeadline=undefined;
      }
      return;
    }
    if(this.temporaryTimer!==undefined) return;
    if(this.remainingMs<=0) {this.cancelPoke();this.render();return;}
    const version=this.pokeVersion;
    this.pokeDeadline=this.clock.now()+this.remainingMs;
    this.temporaryTimer=this.clock.setTimeout(()=>{
      if(version!==this.pokeVersion||this.disposed) return;
      this.cancelPoke();this.render();
    },this.remainingMs);
  }
  loadAsset(pose) {
    if(this.loaded.has(pose.path)) return this.loaded.get(pose.path);
    const image=this.imageFactory();
    const promise=new Promise((resolve,reject)=>{
      let finished=false;
      const finish=error=>{
        if(finished) return;finished=true;
        this.clock.clearTimeout(timer);this.pendingLoads.delete(cancel);image.onload=image.onerror=null;
        if(error) reject(error);else {this.assetsReady.add(pose.path);resolve();}
      };
      const cancel=()=>finish(new Error('Image load cancelled'));
      const timer=this.clock.setTimeout(()=>finish(new Error('Image timeout')),5000);
      this.pendingLoads.add(cancel);
      image.onload=()=>image.naturalWidth!==pose.width||image.naturalHeight!==pose.height ? finish(new Error('Unexpected atlas dimensions')) : finish();
      image.onerror=()=>finish(new Error('Image unavailable'));image.src=pose.path;
    });
    this.loaded.set(pose.path,promise);
    promise.catch(()=>{if(this.loaded.get(pose.path)===promise) this.loaded.delete(pose.path);});
    return promise;
  }
  ensurePose(pose,key) {
    if(this.activePoseKey===key&&this.ready) {
      if(this.loadingPose) {this.poseVersion++;this.loadingPose=undefined;this.requestedPoseKey=key;}
      return;
    }
    if(this.requestedPoseKey===key&&this.loadingPose) return;
    const version=++this.poseVersion;
    this.requestedPoseKey=key;this.requestedPath=pose.path;this.loadingPose=key;
    if(this.assetsReady.has(pose.path)) {this.activatePose(pose,key);return;}
    this.loadAsset(pose).then(()=>{
      if(version!==this.poseVersion||this.disposed) return;
      this.activatePose(pose,key);this.render();
    }).catch(()=>{
      if(version!==this.poseVersion||this.disposed) return;
      this.failures.add(pose.path);this.loadingPose=undefined;this.ready=false;
      this.elements.unavailable.textContent='角色素材没加载出来。重新应用角色设置可重试。';
      this.elements.unavailable.hidden=false;this.render();
    });
  }
  activatePose(pose,key) {
    this.activePose=pose;this.activePoseKey=key;this.loadingPose=undefined;this.ready=true;this.frame=pose.still||0;
    if(this.elements.source) this.elements.source.href=mascotSkins.hd.source;
    this.elements.unavailable.hidden=true;
  }
  render() {
    const {root,collapse,sprite,nudge}=this.elements;
    root.hidden=!this.settings.enabled;root.dataset.collapsed=String(this.settings.collapsed);root.dataset.state=this.state;root.dataset.skin='hd';
    const visualState=this.overlay?.state||this.state;root.dataset.pose=visualState;
    collapse.textContent=this.settings.collapsed ? '展开' : '收起';collapse.setAttribute('aria-expanded',String(!this.settings.collapsed));
    root.parentElement?.classList.toggle('no-companion',!this.settings.enabled);
    const pose=mascotPose('hd',visualState);
    const key=JSON.stringify([pose.path,pose.frames,pose.still,pose.columns,pose.rows,pose.cellWidth,pose.cellHeight]);
    if(this.isVisible()&&!this.failures.has(pose.path)) this.ensurePose(pose,key);
    sprite.hidden=!this.ready;
    if(this.ready&&this.activePose) {
      const current=this.activePose;
      const background='url("'+current.path+'")';
      if(sprite.style.backgroundImage!==background) sprite.style.backgroundImage=background;
      sprite.style.backgroundSize=current.columns*100+'% '+current.rows*100+'%';
      sprite.style.aspectRatio=current.cellWidth+' / '+current.cellHeight;
      const position=posePosition(current,this.frame);
      if(sprite.style.backgroundPosition!==position) sprite.style.backgroundPosition=position;
      if(this.activePoseKey===key&&!this.loadingPose) sprite.setAttribute('aria-label','D指导：'+mascotActionLabel('hd',visualState));
    }
    if(this.elements.actionStatus) this.elements.actionStatus.textContent=this.loadingPose ? '加载素材中…' : this.overlay ? mascotActionLabel('hd','hello') : '';
    if(nudge) nudge.disabled=!this.isVisible()||!this.ready||Boolean(this.loadingPose)||busyStates.has(this.state);
    this.syncPokeTimer();
  }
  dispose() {
    this.disposed=true;this.poseVersion++;this.cancelPoke();
    for(const cancel of this.pendingLoads) cancel();
    this.motionQuery.removeEventListener?.('change',this.motionChanged);
    this.page.removeEventListener?.('visibilitychange',this.visibilityChanged);
    this.elements.collapse.removeEventListener?.('click',this.collapseClicked);
    if(this.elements.nudge) this.elements.nudge.disabled=true;
  }
}
