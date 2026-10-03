// One existing HD character set; original artwork is unchanged. See ASSET_SOURCES.md.
const local = name => `/src/local-assets/deepseek-${name}`;
export const mascotDefaults = {enabled:true,motion:true,skin:'hd',collapsed:false,behaviorVersion:3};
export const mascotSkins = {
  hd:{kind:'atlas',path:local('actions.png'),source:'https://github.com/YunYueSama/codex-deepseek-pet',label:'高清小鱼',columns:4,rows:4,width:2048,height:2048,cellWidth:512,cellHeight:512}
};
const still = cell => ({frames:[cell],fps:0,still:0,loop:false});
// The dense wave sheet changes face/tail geometry between frames. Use the clean pose instead.
const wave = {...still(10),durationMs:1500};
// Querying and speaking use clear static poses, not endless animation or lip-sync.
export const mascotStates = {
  idle:still(0),thinking:still(2),result:still(5),saved:still(15),error:still(9),
  cancelled:still(0),review:still(2),speaking:still(5),hello:wave,nudge:wave
};
export const mascotActions = {hello:'挥个手'};
export function availableMascotActions() {return ['hello'];}
export function mascotActionLabel(_skinName,state) {
  return {idle:'在岗',thinking:'查词中',result:'讲解',saved:'保存成功',error:'查询需要检查',cancelled:'已取消',review:'复习',speaking:'朗读中',hello:'挥个手',nudge:'挥个手'}[state] || '在岗';
}
export function mascotPose(_skinName,state) {return {...mascotSkins.hd,...(mascotStates[state] || mascotStates.idle)};}
export function posePosition(pose,frame=0) {
  const index=Math.max(0,Math.min(pose.frames.length-1,Math.trunc(frame)||0));
  const cell=pose.frames[index];
  return `${cell % pose.columns / (pose.columns-1) * 100}% ${Math.floor(cell / pose.columns) / (pose.rows-1) * 100}%`;
}
export function spritePosition(state,frame=0) {return posePosition(mascotPose('hd',state),frame);}
export function normalizeMascotSettings(settings={}) {
  const next={...mascotDefaults};
  for(const key of ['enabled','motion','collapsed']) if(typeof settings[key]==='boolean') next[key]=settings[key];
  // Old skins, random idle/gaze preferences and arbitrary fields are intentionally discarded.
  return next;
}
