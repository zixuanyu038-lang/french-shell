import { mascotSkins, mascotStates, mascotActionLabel, mascotPose, posePosition } from '../mascot-assets.js';

const poseSelect=document.querySelector('#pose'),frames=document.querySelector('#frames');
const states=Object.keys(mascotStates).filter(state=>state!=='nudge');
let version=0;
poseSelect.add(new Option('全部状态','all'));
for(const state of states) poseSelect.add(new Option(`${state} · ${mascotActionLabel('hd',state)}`,state));

function show(){
  const current=++version;
  frames.dataset.loaded='false';frames.replaceChildren();
  const shown=poseSelect.value==='all'?states:[poseSelect.value];
  const atlas=mascotSkins.hd;
  document.querySelector('#source').textContent=`唯一文件：${atlas.path}；预期 ${atlas.width} × ${atlas.height}，4 × 4；单格 ${atlas.cellWidth} × ${atlas.cellHeight}。`;
  for(const state of shown){
    const pose=mascotPose('hd',state),card=document.createElement('section'),art=document.createElement('div');
    card.className='frame';card.dataset.state=state;art.className='art';
    art.style.aspectRatio=`${pose.cellWidth}/${pose.cellHeight}`;
    art.style.backgroundImage=`url("${pose.path}")`;art.style.backgroundSize=`${pose.columns*100}% ${pose.rows*100}%`;
    art.style.backgroundPosition=posePosition(pose,0);
    const label=document.createElement('p');
    label.textContent=`${state} · ${mascotActionLabel('hd',state)} · 原格 ${pose.frames[0]}${pose.durationMs?' · '+pose.durationMs+'ms':''}`;
    card.append(art,label);frames.append(card);
  }
  const check=new Image();
  check.onload=()=>{
    if(current!==version)return;
    frames.dataset.loaded='true';document.querySelector('#source').textContent+=` 实际图片 ${check.naturalWidth} × ${check.naturalHeight}，已加载。`;
  };
  check.onerror=()=>{if(current===version){frames.dataset.loaded='error';document.querySelector('#source').textContent+=' 文件未加载。';}};
  check.src=atlas.path;
}
poseSelect.addEventListener('change',show);show();
