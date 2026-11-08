// Chiken C: motor service openings and finite-pose mobility checks.
// Shell, head and cosmetic accents are proportion placeholders, not finished housings.
const chikenParts = require('./parts.forge.js');
const chikenXL = require('./xl330.forge.js');
const chikenLegacyLegs = require('./xl330-legs.forge.js');
const chikenLegs = require('./architecture.forge.js');
const chikenArchitecture='C - flush direct drive';
const chikenMotor = chikenXL.reference();
const chikenDim = {
  torsoWidth:Param.number('Torso width',118,{min:100,max:128,unit:'mm'}),
  torsoDepth:Param.number('Torso depth',155,{min:145,max:170,unit:'mm'}),
  torsoHeight:Param.number('Torso height',88,{min:80,max:98,unit:'mm'}),
  motorAccess:Param.number('Motor access openings',100,{min:0,max:100,step:10,unit:'%'}),
  hipSpacing:Param.number('Hip spacing',106,{min:80,max:110,unit:'mm'}),
  thighLength:Param.number('Thigh length',48,{min:44,max:65,unit:'mm'}),
  shinLength:Param.number('Shin length',50,{min:48,max:68,unit:'mm'}),
  footWidth:Param.number('Foot width',40,{min:38,max:50,unit:'mm'}),
  footLength:Param.number('Foot length',70,{min:65,max:80,unit:'mm'}),
  servoWidth:14,servoDepth:20,servoHeight:20,wall:2.5,
  pinRadius:1.5,pivotClearance:0.3,hipForward:Param.number('Hip forward offset',8,{min:0,max:20,unit:'mm'}),rollBelow:0,rollInset:41,pitchDrop:0,ankleHeight:24,
};
chikenDim.arch=chikenArchitecture.charAt(0);
chikenDim.hiddenHip=true;
chikenDim.linkWidth=chikenDim.servoWidth+2*chikenDim.wall;
chikenDim.forkInner=chikenDim.linkWidth+2;
chikenDim.forkOuter=chikenDim.forkInner+8;
const chikenBaseMode=Param.choice('Simulation base','Fixed torso',['Fixed torso','Free body']);
const chikenTorsoZ=chikenDim.rollBelow+chikenDim.pitchDrop+(chikenDim.thighLength+chikenDim.shinLength)*Math.cos(40*Math.PI/180)+chikenDim.ankleHeight;
const chikenPlastic=Sim.material('Prototype plastic',{densityKgM3:1240,staticFriction:0.6,dynamicFriction:0.5,restitution:0});
const chikenRubber=Sim.material('Foot contact proxy',{densityKgM3:1100,staticFriction:0.9,dynamicFriction:0.8,restitution:0});
const chikenRig=assembly('Chiken torso and legs');
function addChikenBody(name,part,mass,root=false,foot=false) {
  const chikenBodyOptions={massKg:mass,material:foot?chikenRubber:chikenPlastic,collider:Sim.collider.pieces(part.pieces),clearances:Object.fromEntries(part.clearances.map(item=>[item.name,item.shape]))};
  if(root) chikenBodyOptions.motion=chikenBaseMode==='Fixed torso'?Sim.motion.static():Sim.motion.dynamic();
  chikenRig.addPart(name,part.shape,{...(root?{transform:Transform.translation(0,0,chikenTorsoZ)}:{}),sim:Sim.body(chikenBodyOptions),metadata:{massKg:mass,tags:root?'torso':(foot?'feet':'legs')}});
}
const chikenPrepared=require('./preflight.forge.js').prepare({d:chikenDim,motor:chikenMotor,api:chikenXL,parts:chikenParts,legs:chikenLegs,legacy:chikenLegacyLegs,motion:require('./motion.forge.js')});
const chikenTorso=chikenParts.torsoSkin(chikenDim);
chikenTorso.shape=difference(chikenTorso.shape,chikenPrepared.shellRelief);
chikenTorso.pieces={shell:chikenTorso.shape};
const chikenPrinted=PhysicalMaterial.define('Printed PLA - density estimate',{densityKgM3:1240});
const chikenShellView=Param.choice('Body view','Shells',['Shells','Transparent shells'],{combination:false});
const chikenOpacity=chikenShellView==='Transparent shells'?0.16:1;
const chikenAllowance=Param.number('Electronics and hardware allowance',120,{min:0,max:250,unit:'g'});
const chikenMassRows=[];
function chikenPrintMass(shape){return shape.volume()*1.24e-6;}
addChikenBody('Torso',chikenTorso,chikenPrintMass(chikenTorso.shape)+chikenAllowance/1000,true);
chikenMassRows.push({name:'Torso + unselected hardware allowance',massKg:chikenPrintMass(chikenTorso.shape)+chikenAllowance/1000});
// Fixed visual cues are separately named and editable; they follow the torso.
function addChikenAccent(name,shape,mass) {
  mass=chikenPrintMass(shape);
  chikenMassRows.push({name,massKg:mass});
  shape=shape.withPhysicalMaterial(chikenPrinted);
  if(name.includes('side_panel'))shape=shape.material({opacity:chikenOpacity});
  chikenRig.withConnectors('Torso',{[name]:connector({origin:[0,0,0],axis:[0,0,1],up:[0,1,0],kind:'fixed'})});
  const accentShape=shape.withConnectors({mount:connector({origin:[0,0,0],axis:[0,0,-1],up:[0,1,0],kind:'fixed'})});
  chikenRig.addPart(name,accentShape,{sim:Sim.body({massKg:mass,material:chikenPlastic,collider:Sim.collider.convexHull()}),metadata:{tags:'silhouette'}});
  chikenRig.connect('Torso.'+name,name+'.mount',{type:'fixed'});
}
// One shared pivot keeps the whole face aligned for the small curious head tilt.
const chikenHeadRoll=Param.number('Curious head tilt',5,{min:-12,max:12,unit:'deg'});
function chikenHeadTilt(shape) {
  return shape.translate(0,103.5,-58).rotateX(-5).rotateY(chikenHeadRoll).translate(0,-103.5,58);
}
const chikenHeadBlank=difference(roundedRect(70,32,12).extrude(42),roundedRect(66,28,10).extrude(42).translate(0,0,2));
const chikenHead=chikenHeadTilt(chikenHeadBlank.rotateX(90).translate(0,-82.5,58)).color('#eee5d1');
addChikenAccent('Head',chikenHead,0.025);
addChikenAccent('Face_panel',chikenHeadTilt(roundedRect(66,28,10).extrude(2).rotateX(90).translate(0,-124.5,58)).color('#27343d'),0.003);
for(const eyeSide of [-1,1]) {
  addChikenAccent(eyeSide<0?'Left_eye':'Right_eye',chikenHeadTilt(sphere(4.8,28).scale([1,0.35,1.12]).translate(eyeSide*16,-127.5,59)).color('#78d4e7'),0.001);
}
const chikenShellObstacles=[chikenTorso.shape];
const chikenNamedShells=[];
for(const fairingSide of [-1,1]) {
  const panel=difference(chikenParts.sidePanel(chikenDim,fairingSide),chikenPrepared.shellRelief);
  const wing=chikenParts.wingShape(chikenDim,fairingSide).translate(0,2,0);
  const patch=chikenParts.wingAccent(chikenDim,fairingSide).translate(0,2,0);
  const prefix=fairingSide<0?'Left':'Right';
  const front=panel.trimByPlane([0,-1,0],0),rear=panel.trimByPlane([0,1,0],0);
  for(const [section,shape]of [['front',front],['rear',rear]]) {
    addChikenAccent(prefix+'_side_panel_'+section,shape,.012);
    verify.equal(prefix+' '+section+' panel is one solid',()=>shape.numBodies(),1);
    chikenNamedShells.push({name:prefix+' '+section+' panel',shape});
    chikenShellObstacles.push(shape);
  }
  addChikenAccent(prefix+'_wing',wing,.012);
  verify.equal(prefix+' wing is one solid',()=>wing.numBodies(),1);
  addChikenAccent(prefix+'_wing_inlay',patch,.002);
  verify.equal(prefix+' wing inlay is one solid',()=>patch.numBodies(),1);
  chikenNamedShells.push({name:prefix+' wing',shape:wing},{name:prefix+' wing inlay',shape:patch});
  chikenShellObstacles.push(wing,patch);
}
addChikenAccent('Neck_upper_pivot',cylinder(30,6).rotateY(90).translate(-15,-82.5,44).color('#344149'),0.004);
// All hardware children inherit their carrier's frame through a fixed connection.
function chikenFixed(parent,name,shape,mass,tags='hardware') {
  if(tags==='covers'&&chikenShellView==='Transparent shells')shape=shape.material({opacity:.16});
  const portName='fix_'+name;
  chikenRig.withConnectors(parent,{[portName]:connector({origin:[0,0,0],axis:[0,0,1],up:[0,1,0],kind:'fixed'})});
  chikenRig.addPart(name,shape.withConnectors({mount:connector({origin:[0,0,0],axis:[0,0,-1],up:[0,1,0],kind:'fixed'})}),{
    sim:Sim.body({massKg:mass,collider:Sim.collider.none('Fixed carrier hardware; carrier collision geometry is used in this packaging study.')}),
    metadata:{massKg:mass,tags},
  });
  chikenRig.connect(parent+'.'+portName,name+'.mount',{type:'fixed'});
  chikenMassRows.push({name,massKg:mass});
}
function chikenCarrier(name,shape) {
  const mass=chikenPrintMass(shape);
  if(chikenShellView==='Transparent shells')shape=shape.material({opacity:.16});
  chikenRig.addPart(name,shape.withPhysicalMaterial(chikenPrinted),{sim:Sim.body({massKg:mass,material:chikenPlastic,collider:Sim.collider.visualMesh()}),metadata:{massKg:mass,tags:'carriers'}});
  chikenMassRows.push({name,massKg:mass});
}
const chikenPelvis=chikenLegs.pelvis(chikenDim,chikenMotor,chikenXL);
chikenFixed('Torso','Pelvis',chikenPelvis.shape,chikenPrintMass(chikenPelvis.shape),'carriers');
const chikenLegRecords=chikenPrepared.records;
for(const rec of chikenLegRecords) {
  const {side,thigh,shin,foot,roll}=rec;
  const s=side.sign;
  chikenCarrier(side.key+'_HipRoll',roll.shape);
  chikenCarrier(side.key+'_Thigh',thigh.shape);
  chikenCarrier(side.key+'_Shin',shin.shape);
  chikenCarrier(side.key+'_Foot',foot.shape);
  require('./preflight.forge.js').attachLeg(chikenRig,side);
  chikenRig.probe(side.word+'_sole',side.key+'_Foot',[0,-10,-chikenDim.ankleHeight]);
  const index=s<0?0:1;
  chikenFixed('Torso',side.key+'_Roll_XL330_case',chikenPelvis.cases[index],chikenMotor.caseMassKg,'actuators');
  chikenFixed('Torso',side.key+'_Roll_retainer',chikenPelvis.retainers[index],chikenPrintMass(chikenPelvis.retainers[index]),'retainers');
  const rollPlace=shape=>shape.rotateZ(90);
  chikenFixed(side.key+'_HipRoll',side.key+'_Roll_output',rollPlace(chikenMotor.output),chikenMotor.outputMassKg,'outputs');
  chikenFixed(side.key+'_HipRoll',side.key+'_Roll_idler',rollPlace(chikenMotor.idler),chikenMotor.idlerMassKg,'idlers');
  chikenFixed(side.key+'_HipRoll',side.key+'_HipPitch_XL330_case',roll.caseShape,chikenMotor.caseMassKg,'actuators');
  chikenFixed(side.key+'_HipRoll',side.key+'_HipPitch_retainer',roll.retainer,chikenPrintMass(roll.retainer),'retainers');
  chikenFixed(side.key+'_HipRoll',side.key+'_Hip_socket_cover',roll.cap,chikenPrintMass(roll.cap),'covers');
  chikenFixed(side.key+'_Thigh',side.key+'_Knee_XL330_case',thigh.cases[0],chikenMotor.caseMassKg,'actuators');
  chikenFixed(side.key+'_Thigh',side.key+'_Knee_retainer',thigh.retainers[0],chikenPrintMass(thigh.retainers[0]),'retainers');
  chikenFixed(side.key+'_Thigh',side.key+'_HipPitch_output',chikenMotor.output,chikenMotor.outputMassKg,'outputs');
  chikenFixed(side.key+'_Thigh',side.key+'_HipPitch_idler',chikenMotor.idler,chikenMotor.idlerMassKg,'idlers');
  if(thigh.remote)chikenLegs.installRemote({rig:chikenRig,side,thigh,d:chikenDim,motor:chikenMotor,api:chikenXL,fixed:chikenFixed,massRows:chikenMassRows});
  else {
    chikenFixed(side.key+'_Shin',side.key+'_Knee_output',chikenMotor.output,chikenMotor.outputMassKg,'outputs');
    chikenFixed(side.key+'_Shin',side.key+'_Knee_idler',chikenMotor.idler,chikenMotor.idlerMassKg,'idlers');
  }
  chikenFixed(side.key+'_Shin',side.key+'_Ankle_XL330_case',shin.caseShape,chikenMotor.caseMassKg,'actuators');
  chikenFixed(side.key+'_Shin',side.key+'_Ankle_retainer',shin.retainer,chikenPrintMass(shin.retainer),'retainers');
  chikenFixed(side.key+'_Foot',side.key+'_Ankle_output',chikenMotor.output,chikenMotor.outputMassKg,'outputs');
  chikenFixed(side.key+'_Foot',side.key+'_Ankle_idler',chikenMotor.idler,chikenMotor.idlerMassKg,'idlers');
}
const chikenStand={left_hip_roll:0,left_hip_pitch:-40,left_knee:80,left_ankle_pitch:-40,right_hip_roll:0,right_hip_pitch:-40,right_knee:80,right_ankle_pitch:-40};
chikenRig.addPose('Stand',chikenStand);
chikenRig.addPose('Tall stance',{...chikenStand,left_hip_pitch:-35,left_knee:70,left_ankle_pitch:-35,right_hip_pitch:-35,right_knee:70,right_ankle_pitch:-35});
chikenRig.addPose('Left step',{...chikenStand,left_hip_pitch:-65,left_knee:80,left_ankle_pitch:-15});
chikenRig.addPose('Right step',{...chikenStand,right_hip_pitch:-65,right_knee:80,right_ankle_pitch:-15});
chikenRig.addPose('Deep tuck',{...chikenStand,left_hip_pitch:-60,left_knee:140,left_ankle_pitch:-45,right_hip_pitch:-60,right_knee:140,right_ankle_pitch:-45});
chikenRig.addPose('Wide stance',{...chikenStand,left_hip_roll:35,right_hip_roll:-35});
chikenRig.addAnimation('Step pose exploration',{duration:6,loop:true,keyframes:[{pose:'Stand'},{pose:'Left step'},{pose:'Stand'},{pose:'Right step'},{pose:'Stand'}]});
const chikenMotionLibrary=require('./motion.forge.js').installChikenMotions(chikenRig,chikenStand);
chikenRig.withSimulation({rootPart:'Torso'});
const chikenHome=chikenRig.solve('Stand');
verify.equal('Left sole starts on floor',()=>chikenHome.probe('left_sole')[2],0,.01);
verify.equal('Right sole starts on floor',()=>chikenHome.probe('right_sole')[2],0,.01);
verify.equal('Eight selected XL330 assemblies total 144 g',8*(chikenMotor.caseMassKg+chikenMotor.outputMassKg),.144,.000001);
verify.equal('Pelvis support is connected',()=>chikenPelvis.shape.numBodies(),1);
verify.equal('Hip spacing retained at stand',()=>Math.abs(chikenHome.probe('left_sole')[0]-chikenHome.probe('right_sole')[0]),chikenDim.hipSpacing,.01);
function chikenOverlap(a,b) {
  const aa=a.boundingBox(),bb=b.boundingBox();
  if(![0,1,2].every(i=>aa.min[i]<bb.max[i]-.001&&bb.min[i]<aa.max[i]-.001))return 0;
  return intersection(a,b).volume();
}
for(const rec of chikenLegRecords) {
  for(const [role,shape]of [['roll cradle',rec.roll.shape],['thigh carrier',rec.thigh.shape],['shin carrier',rec.shin.shape],['foot',rec.foot.shape]]) {
    verify.notEmpty(rec.side.word+' '+role+' has geometry',shape);
    verify.equal(rec.side.word+' '+role+' is connected',()=>shape.numBodies(),1);
  }
  verify.notEmpty(rec.side.word+' selected knee motor reference',rec.thigh.cases[0]);
}
// Geometry checks use conservative case boxes and retainers; vendor screw/rotor
// details inside each motor are intentionally not separate collision pairs.
const chikenClearanceCache=new Map();
function chikenPackagingCheck(state) {
  const key=JSON.stringify(state);if(chikenClearanceCache.has(key))return chikenClearanceCache.get(key);
  const solved=chikenRig.solve(state),findings=[];
  const all=[];
  for(const rec of chikenLegRecords) {
    const k=rec.side.key;
    const volumes=[
      {name:k+'_HipRoll',shape:union(rec.roll.shape,rec.roll.envelope,rec.roll.retainer)},
      {name:k+'_Thigh',shape:union(rec.thigh.shape,...rec.thigh.envelopes,...rec.thigh.retainers)},
      {name:k+'_Shin',shape:union(rec.shin.shape,rec.shin.envelope,rec.shin.retainer)},
      {name:k+'_Foot',shape:rec.foot.shape},
    ].map(v=>({...v,shape:v.shape.transform(solved.getTransform(v.name))}));
    for(let i=0;i<volumes.length;i++)for(let j=i+1;j<volumes.length;j++) {
      const v=chikenOverlap(volumes[i].shape,volumes[j].shape);
      if(v>.01)findings.push({a:volumes[i].name,b:volumes[j].name,volume:v,bounds:intersection(volumes[i].shape,volumes[j].shape).boundingBox()});
    }
    const shell=chikenTorso.shape.transform(solved.getTransform('Torso'));
    const pelvis=chikenPelvis.shape.transform(solved.getTransform('Torso'));
    const fixedCases=chikenPelvis.envelopes.map(x=>x.transform(solved.getTransform('Torso')));
    for(const part of volumes)for(const [name,shape]of [['Torso',shell],['Pelvis',pelvis],...fixedCases.map((x,i)=>['Roll motor '+i,x])]) {
      const v=chikenOverlap(part.shape,shape);if(v>.01)findings.push({a:part.name,b:name,volume:v});
    }
    all.push(volumes);
  }
  for(const a of all[0])for(const b of all[1]) {const v=chikenOverlap(a.shape,b.shape);if(v>.01)findings.push({a:a.name,b:b.name,volume:v});}
  chikenClearanceCache.set(key,findings);return findings;
}
// Scope: case/carrier/torso pairs at the default stand only.
if(chikenDim.arch==='C')verify.equal('C standing carrier and case pairs have no overlap',()=>chikenPackagingCheck(chikenStand).length,0);
// Concept comparison: interference is reported, not a manufacturing release check.
verify.that('Architecture interference report is available',()=>{
  console.log('ARCHITECTURE_CONTACTS '+JSON.stringify(chikenPackagingCheck(chikenStand)));return true;
});
for(const rec of chikenLegRecords) {
  const side=rec.side.word;
  chikenRig.addMotionStudy(side+' XL330 knee fold',{joint:side+'_knee',from:0,to:150,steps:75,paths:[side+'_sole'],gaps:[[rec.side.key+'_Thigh',rec.side.key+'_Shin']]});
}
console.log('ARCHITECTURE_STAND_CONTACTS '+JSON.stringify(chikenPackagingCheck(chikenStand)));
console.log('XL330_MASS_ESTIMATE '+JSON.stringify({totalKg:chikenMassRows.reduce((a,r)=>a+r.massKg,0),selectedMotorMassKg:.144,unselectedHardwareAllowanceKg:chikenAllowance/1000,printedDensityKgM3:1240,rows:chikenMassRows}));
for(const rec of chikenLegRecords) {
  verify.equal(rec.side.word+' hip cover is connected',()=>rec.roll.cap.numBodies(),1);
}
verify.that('C wings clear all named poses',()=>{
  const obstacles=chikenNamedShells.filter(o=>o.name.includes('wing'));
  const links=[];
  for(const r of chikenLegRecords) {
    const k=r.side.key;
    links.push({name:k+'_HipRoll',shape:union(r.roll.shape,r.roll.envelope,r.roll.retainer,r.roll.cap)},
      {name:k+'_Thigh',shape:union(r.thigh.shape,...r.thigh.envelopes,...r.thigh.retainers)},
      {name:k+'_Shin',shape:union(r.shin.shape,r.shin.envelope,r.shin.retainer)},
      {name:k+'_Foot',shape:r.foot.shape});
  }
  const hits=[];
  for(const [pose,state]of Object.entries(chikenMotionLibrary.poses)) {
    const solved=chikenRig.solve(state);
    for(const link of links)for(const o of obstacles) {
      const v=chikenOverlap(link.shape.transform(solved.getTransform(link.name)),o.shape.transform(solved.getTransform('Torso')));
      if(v>.01)hits.push({pose,a:link.name,b:o.name,mm3:v});
    }
  }
  console.log('C_WING_AUDIT '+JSON.stringify(hits));return hits.length===0;
});
function chikenRunMobilityStudy() {
  const chikenAudit=require('./mobility.forge.js').inspectMobility({rig:chikenRig,records:chikenLegRecords,torso:chikenTorso,pelvis:chikenPelvis,shells:chikenNamedShells,stand:chikenStand,poses:chikenMotionLibrary.poses});
  
  const chikenPoseReports=chikenAudit.poseNames.map(name=>({name,...chikenAudit.named(name)}));
  console.log('C_POSE_AUDIT '+JSON.stringify(chikenPoseReports));
  for(const r of chikenPoseReports) {
    verify.equal('C pose '+r.name+' has no reported interference',r.hits.length,0);
    verify.equal('C pose '+r.name+' has no motor-case collision',r.hard.length,0);
  }
  const chikenKneeSweep=(()=>{
    const findings=[];
    for(const rec of chikenLegRecords) {
      const parent=union(rec.thigh.shape,...rec.thigh.envelopes,...rec.thigh.retainers);
      const child=union(rec.shin.shape,rec.shin.envelope,rec.shin.retainer);
      for(let a=0;a<=150;a+=5) {
        const v=chikenOverlap(parent,child.rotateX(a).translate(0,0,-chikenDim.thighLength));
        if(v>.01)findings.push({side:rec.side.word,angle:a,mm3:v});
      }
    }
    console.log('C_KNEE_SWEEP '+JSON.stringify(findings));return findings;
  })();
  verify.equal('C sampled knee sweep 0 to 150 is clear',chikenKneeSweep.length,0);
  const chikenRollSweep=(()=>{
    const findings=[];
    for(const rec of chikenLegRecords) {
      const low=rec.side.sign<0?-15:-45,high=rec.side.sign<0?45:15;
      for(let a=low;a<=high;a+=5) {
        const result=chikenAudit.scan({...chikenStand,[rec.side.word+'_hip_roll']:a});
        if(result.hits.length||result.hard.length)findings.push({side:rec.side.word,angle:a,...result});
      }
    }
    console.log('C_ROLL_SWEEP '+JSON.stringify(findings));return findings;
  })();
  verify.equal('C sampled hip roll at standing leg shape is clear',chikenRollSweep.length,0);
  
  return {poses:chikenPoseReports,knee:chikenKneeSweep,roll:chikenRollSweep};
}
if(require.main===module)return chikenRig;
return {rig:chikenRig,runStudy:chikenRunMobilityStudy};
