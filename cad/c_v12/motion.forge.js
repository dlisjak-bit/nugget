// Named kinematic motion library. The torso is fixed; these are not motor commands.
function installChikenMotions(rig,stand) {
  const state=patch=>({...stand,...patch});
  const poses={
    Stand:{...stand},
    'Tall stance':state({left_hip_pitch:-35,left_knee:70,left_ankle_pitch:-35,right_hip_pitch:-35,right_knee:70,right_ankle_pitch:-35}),
    'Wide stance':state({left_hip_roll:35,right_hip_roll:-35}),
    'Left step':state({left_hip_pitch:-65,left_knee:80,left_ankle_pitch:-15}),
    'Right step':state({right_hip_pitch:-65,right_knee:80,right_ankle_pitch:-15}),
    'Deep tuck':state({left_hip_pitch:-60,left_knee:140,left_ankle_pitch:-45,right_hip_pitch:-60,right_knee:140,right_ankle_pitch:-45}),
    'Maximum splay':state({left_hip_roll:45,right_hip_roll:-45}),
    'Roll left rehearsal':state({left_hip_roll:-15,right_hip_roll:-15}),
    'Roll right rehearsal':state({left_hip_roll:15,right_hip_roll:15}),
    'Left knee setup':state({left_hip_pitch:-60,left_knee:80,left_ankle_pitch:-45}),
    'Left knee straight':state({left_hip_pitch:-60,left_knee:0,left_ankle_pitch:-45}),
    'Left knee fully folded':state({left_hip_pitch:-60,left_knee:150,left_ankle_pitch:-45}),
    'Right knee setup':state({right_hip_pitch:-60,right_knee:80,right_ankle_pitch:-45}),
    'Right knee straight':state({right_hip_pitch:-60,right_knee:0,right_ankle_pitch:-45}),
    'Right knee fully folded':state({right_hip_pitch:-60,right_knee:150,right_ankle_pitch:-45}),
    'Left foot lifted':state({left_hip_pitch:-60,left_knee:110,left_ankle_pitch:-45}),
    'Right foot lifted':state({right_hip_pitch:-60,right_knee:110,right_ankle_pitch:-45}),
  };
  const existing=new Set(['Stand','Left step','Right step','Deep tuck','Tall stance','Wide stance']);
  for(const [name,values] of Object.entries(poses)) if(!existing.has(name)) rig.addPose(name,values);
  const frames=entries=>entries.map(([at,pose])=>({at,pose}));
  const tracks=[
    {name:'Deep tuck and unfold',duration:10,keyframes:frames([[0,'Stand'],[0.32,'Deep tuck'],[0.58,'Deep tuck'],[0.9,'Stand'],[1,'Stand']])},
    {name:'Left knee 0 to 150 - bench study',duration:12,keyframes:frames([[0,'Stand'],[0.14,'Left knee setup'],[0.32,'Left knee straight'],[0.4,'Left knee straight'],[0.66,'Left knee fully folded'],[0.76,'Left knee fully folded'],[0.9,'Left knee setup'],[1,'Stand']])},
    {name:'Right knee 0 to 150 - bench study',duration:12,keyframes:frames([[0,'Stand'],[0.14,'Right knee setup'],[0.32,'Right knee straight'],[0.4,'Right knee straight'],[0.66,'Right knee fully folded'],[0.76,'Right knee fully folded'],[0.9,'Right knee setup'],[1,'Stand']])},
    {name:'Hip roll - splay and return',duration:12,keyframes:frames([[0,'Stand'],[0.2,'Maximum splay'],[0.3,'Maximum splay'],[0.45,'Stand'],[0.6,'Roll left rehearsal'],[0.75,'Roll right rehearsal'],[0.9,'Stand'],[1,'Stand']])},
    {name:'Alternating steps - slow study',duration:12,keyframes:frames([[0,'Stand'],[0.12,'Left foot lifted'],[0.23,'Left step'],[0.3,'Left step'],[0.43,'Stand'],[0.55,'Right foot lifted'],[0.66,'Right step'],[0.73,'Right step'],[0.87,'Stand'],[1,'Stand']])},
    {name:'Motion tour - steps splay and tuck',duration:24,keyframes:frames([[0,'Stand'],[0.08,'Left foot lifted'],[0.15,'Left step'],[0.22,'Stand'],[0.3,'Right foot lifted'],[0.37,'Right step'],[0.44,'Stand'],[0.54,'Maximum splay'],[0.61,'Maximum splay'],[0.69,'Stand'],[0.8,'Deep tuck'],[0.88,'Deep tuck'],[0.96,'Stand'],[1,'Stand']])},
  ];
  for(const track of tracks) rig.addAnimation(track.name,{duration:track.duration,loop:true,keyframes:track.keyframes});
  return {poses,tracks};
}
return {installChikenMotions};
