// Nugget C: motor service openings and finite-pose mobility checks.
// Shell, head and cosmetic accents are proportion placeholders, not finished housings.
const nuggetParts = require('./parts.forge.js');
const nuggetXL = require('./xl330.forge.js');
const nuggetLegacyLegs = require('./xl330-legs.forge.js');
const nuggetLegs = require('./architecture.forge.js');
const nuggetArchitecture='C - flush direct drive';
const nuggetMotor = nuggetXL.reference();
const nuggetDim = {
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
nuggetDim.arch=nuggetArchitecture.charAt(0);
nuggetDim.hiddenHip=true;
nuggetDim.linkWidth=nuggetDim.servoWidth+2*nuggetDim.wall;
nuggetDim.forkInner=nuggetDim.linkWidth+2;
nuggetDim.forkOuter=nuggetDim.forkInner+8;
const nuggetBaseMode=Param.choice('Simulation base','Fixed torso',['Fixed torso','Free body']);
const nuggetTorsoZ=nuggetDim.rollBelow+nuggetDim.pitchDrop+(nuggetDim.thighLength+nuggetDim.shinLength)*Math.cos(40*Math.PI/180)+nuggetDim.ankleHeight;
const nuggetPlastic=Sim.material('Prototype plastic',{densityKgM3:1240,staticFriction:0.6,dynamicFriction:0.5,restitution:0});
const nuggetRubber=Sim.material('Foot contact proxy',{densityKgM3:1100,staticFriction:0.9,dynamicFriction:0.8,restitution:0});
const nuggetRig=assembly('Nugget torso and legs');
function addNuggetBody(name,part,mass,root=false,foot=false) {
  const nuggetBodyOptions={massKg:mass,material:foot?nuggetRubber:nuggetPlastic,collider:Sim.collider.pieces(part.pieces),clearances:Object.fromEntries(part.clearances.map(item=>[item.name,item.shape]))};
  if(root) nuggetBodyOptions.motion=nuggetBaseMode==='Fixed torso'?Sim.motion.static():Sim.motion.dynamic();
  nuggetRig.addPart(name,part.shape,{...(root?{transform:Transform.translation(0,0,nuggetTorsoZ)}:{}),sim:Sim.body(nuggetBodyOptions),metadata:{massKg:mass,tags:root?'torso':(foot?'feet':'legs')}});
}
const nuggetPrepared=require('./preflight.forge.js').prepare({d:nuggetDim,motor:nuggetMotor,api:nuggetXL,parts:nuggetParts,legs:nuggetLegs,legacy:nuggetLegacyLegs,motion:require('./motion.forge.js')});
const nuggetTorso=nuggetParts.torsoSkin(nuggetDim);
nuggetTorso.shape=difference(nuggetTorso.shape,nuggetPrepared.shellRelief);
nuggetTorso.pieces={shell:nuggetTorso.shape};
const nuggetPrinted=PhysicalMaterial.define('Printed PLA - density estimate',{densityKgM3:1240});
const nuggetShellView=Param.choice('Body view','Shells',['Shells','Transparent shells'],{combination:false});
const nuggetOpacity=nuggetShellView==='Transparent shells'?0.16:1;
const nuggetAllowance=Param.number('Electronics and hardware allowance',120,{min:0,max:250,unit:'g'});
const nuggetMassRows=[];
function nuggetPrintMass(shape){return shape.volume()*1.24e-6;}
addNuggetBody('Torso',nuggetTorso,nuggetPrintMass(nuggetTorso.shape)+nuggetAllowance/1000,true);
nuggetMassRows.push({name:'Torso + unselected hardware allowance',massKg:nuggetPrintMass(nuggetTorso.shape)+nuggetAllowance/1000});
// Fixed visual cues are separately named and editable; they follow the torso.
function addNuggetAccent(name,shape,mass) {
  mass=nuggetPrintMass(shape);
  nuggetMassRows.push({name,massKg:mass});
  shape=shape.withPhysicalMaterial(nuggetPrinted);
  if(name.includes('side_panel'))shape=shape.material({opacity:nuggetOpacity});
  nuggetRig.withConnectors('Torso',{[name]:connector({origin:[0,0,0],axis:[0,0,1],up:[0,1,0],kind:'fixed'})});
  const accentShape=shape.withConnectors({mount:connector({origin:[0,0,0],axis:[0,0,-1],up:[0,1,0],kind:'fixed'})});
  nuggetRig.addPart(name,accentShape,{sim:Sim.body({massKg:mass,material:nuggetPlastic,collider:Sim.collider.convexHull()}),metadata:{tags:'silhouette'}});
  nuggetRig.connect('Torso.'+name,name+'.mount',{type:'fixed'});
}
// One shared pivot keeps the whole face aligned for the small curious head tilt.
const nuggetHeadRoll=Param.number('Curious head tilt',5,{min:-12,max:12,unit:'deg'});
function nuggetHeadTilt(shape) {
  return shape.translate(0,103.5,-58).rotateX(-5).rotateY(nuggetHeadRoll).translate(0,-103.5,58);
}
const nuggetHeadBlank=difference(roundedRect(70,32,12).extrude(42),roundedRect(66,28,10).extrude(42).translate(0,0,2));
const nuggetHead=nuggetHeadTilt(nuggetHeadBlank.rotateX(90).translate(0,-82.5,58)).color('#eee5d1');
addNuggetAccent('Head',nuggetHead,0.025);
addNuggetAccent('Face_panel',nuggetHeadTilt(roundedRect(66,28,10).extrude(2).rotateX(90).translate(0,-124.5,58)).color('#27343d'),0.003);
for(const eyeSide of [-1,1]) {
  addNuggetAccent(eyeSide<0?'Left_eye':'Right_eye',nuggetHeadTilt(sphere(4.8,28).scale([1,0.35,1.12]).translate(eyeSide*16,-127.5,59)).color('#78d4e7'),0.001);
}
const nuggetShellObstacles=[nuggetTorso.shape];
const nuggetNamedShells=[];
for(const fairingSide of [-1,1]) {
  const panel=difference(nuggetParts.sidePanel(nuggetDim,fairingSide),nuggetPrepared.shellRelief);
  const wing=nuggetParts.wingShape(nuggetDim,fairingSide).translate(0,2,0);
  const patch=nuggetParts.wingAccent(nuggetDim,fairingSide).translate(0,2,0);
  const prefix=fairingSide<0?'Left':'Right';
  const front=panel.trimByPlane([0,-1,0],0),rear=panel.trimByPlane([0,1,0],0);
  for(const [section,shape]of [['front',front],['rear',rear]]) {
    addNuggetAccent(prefix+'_side_panel_'+section,shape,.012);
    verify.equal(prefix+' '+section+' panel is one solid',()=>shape.numBodies(),1);
    nuggetNamedShells.push({name:prefix+' '+section+' panel',shape});
    nuggetShellObstacles.push(shape);
  }
  addNuggetAccent(prefix+'_wing',wing,.012);
  verify.equal(prefix+' wing is one solid',()=>wing.numBodies(),1);
  addNuggetAccent(prefix+'_wing_inlay',patch,.002);
  verify.equal(prefix+' wing inlay is one solid',()=>patch.numBodies(),1);
  nuggetNamedShells.push({name:prefix+' wing',shape:wing},{name:prefix+' wing inlay',shape:patch});
  nuggetShellObstacles.push(wing,patch);
}
addNuggetAccent('Neck_upper_pivot',cylinder(30,6).rotateY(90).translate(-15,-82.5,44).color('#344149'),0.004);
// All hardware children inherit their carrier's frame through a fixed connection.
function nuggetFixed(parent,name,shape,mass,tags='hardware') {
  if(tags==='covers'&&nuggetShellView==='Transparent shells')shape=shape.material({opacity:.16});
  const portName='fix_'+name;
  nuggetRig.withConnectors(parent,{[portName]:connector({origin:[0,0,0],axis:[0,0,1],up:[0,1,0],kind:'fixed'})});
  nuggetRig.addPart(name,shape.withConnectors({mount:connector({origin:[0,0,0],axis:[0,0,-1],up:[0,1,0],kind:'fixed'})}),{
    sim:Sim.body({massKg:mass,collider:Sim.collider.none('Fixed carrier hardware; carrier collision geometry is used in this packaging study.')}),
    metadata:{massKg:mass,tags},
  });
  nuggetRig.connect(parent+'.'+portName,name+'.mount',{type:'fixed'});
  nuggetMassRows.push({name,massKg:mass});
}
function nuggetCarrier(name,shape) {
  const mass=nuggetPrintMass(shape);
  if(nuggetShellView==='Transparent shells')shape=shape.material({opacity:.16});
  nuggetRig.addPart(name,shape.withPhysicalMaterial(nuggetPrinted),{sim:Sim.body({massKg:mass,material:nuggetPlastic,collider:Sim.collider.visualMesh()}),metadata:{massKg:mass,tags:'carriers'}});
  nuggetMassRows.push({name,massKg:mass});
}
const nuggetPelvis=nuggetLegs.pelvis(nuggetDim,nuggetMotor,nuggetXL);
nuggetFixed('Torso','Pelvis',nuggetPelvis.shape,nuggetPrintMass(nuggetPelvis.shape),'carriers');
const nuggetLegRecords=nuggetPrepared.records;
for(const rec of nuggetLegRecords) {
  const {side,thigh,shin,foot,roll}=rec;
  const s=side.sign;
  nuggetCarrier(side.key+'_HipRoll',roll.shape);
  nuggetCarrier(side.key+'_Thigh',thigh.shape);
  nuggetCarrier(side.key+'_Shin',shin.shape);
  nuggetCarrier(side.key+'_Foot',foot.shape);
  require('./preflight.forge.js').attachLeg(nuggetRig,side);
  nuggetRig.probe(side.word+'_sole',side.key+'_Foot',[0,-10,-nuggetDim.ankleHeight]);
  const index=s<0?0:1;
  nuggetFixed('Torso',side.key+'_Roll_XL330_case',nuggetPelvis.cases[index],nuggetMotor.caseMassKg,'actuators');
  nuggetFixed('Torso',side.key+'_Roll_retainer',nuggetPelvis.retainers[index],nuggetPrintMass(nuggetPelvis.retainers[index]),'retainers');
  const rollPlace=shape=>shape.rotateZ(90);
  nuggetFixed(side.key+'_HipRoll',side.key+'_Roll_output',rollPlace(nuggetMotor.output),nuggetMotor.outputMassKg,'outputs');
  nuggetFixed(side.key+'_HipRoll',side.key+'_Roll_idler',rollPlace(nuggetMotor.idler),nuggetMotor.idlerMassKg,'idlers');
  nuggetFixed(side.key+'_HipRoll',side.key+'_HipPitch_XL330_case',roll.caseShape,nuggetMotor.caseMassKg,'actuators');
  nuggetFixed(side.key+'_HipRoll',side.key+'_HipPitch_retainer',roll.retainer,nuggetPrintMass(roll.retainer),'retainers');
  nuggetFixed(side.key+'_HipRoll',side.key+'_Hip_socket_cover',roll.cap,nuggetPrintMass(roll.cap),'covers');
  nuggetFixed(side.key+'_Thigh',side.key+'_Knee_XL330_case',thigh.cases[0],nuggetMotor.caseMassKg,'actuators');
  nuggetFixed(side.key+'_Thigh',side.key+'_Knee_retainer',thigh.retainers[0],nuggetPrintMass(thigh.retainers[0]),'retainers');
  nuggetFixed(side.key+'_Thigh',side.key+'_HipPitch_output',nuggetMotor.output,nuggetMotor.outputMassKg,'outputs');
  nuggetFixed(side.key+'_Thigh',side.key+'_HipPitch_idler',nuggetMotor.idler,nuggetMotor.idlerMassKg,'idlers');
  if(thigh.remote)nuggetLegs.installRemote({rig:nuggetRig,side,thigh,d:nuggetDim,motor:nuggetMotor,api:nuggetXL,fixed:nuggetFixed,massRows:nuggetMassRows});
  else {
    nuggetFixed(side.key+'_Shin',side.key+'_Knee_output',nuggetMotor.output,nuggetMotor.outputMassKg,'outputs');
    nuggetFixed(side.key+'_Shin',side.key+'_Knee_idler',nuggetMotor.idler,nuggetMotor.idlerMassKg,'idlers');
  }
  nuggetFixed(side.key+'_Shin',side.key+'_Ankle_XL330_case',shin.caseShape,nuggetMotor.caseMassKg,'actuators');
  nuggetFixed(side.key+'_Shin',side.key+'_Ankle_retainer',shin.retainer,nuggetPrintMass(shin.retainer),'retainers');
  nuggetFixed(side.key+'_Foot',side.key+'_Ankle_output',nuggetMotor.output,nuggetMotor.outputMassKg,'outputs');
  nuggetFixed(side.key+'_Foot',side.key+'_Ankle_idler',nuggetMotor.idler,nuggetMotor.idlerMassKg,'idlers');
}
const nuggetStand={left_hip_roll:0,left_hip_pitch:-40,left_knee:80,left_ankle_pitch:-40,right_hip_roll:0,right_hip_pitch:-40,right_knee:80,right_ankle_pitch:-40};
nuggetRig.addPose('Stand',nuggetStand);
nuggetRig.addPose('Tall stance',{...nuggetStand,left_hip_pitch:-35,left_knee:70,left_ankle_pitch:-35,right_hip_pitch:-35,right_knee:70,right_ankle_pitch:-35});
nuggetRig.addPose('Left step',{...nuggetStand,left_hip_pitch:-65,left_knee:80,left_ankle_pitch:-15});
nuggetRig.addPose('Right step',{...nuggetStand,right_hip_pitch:-65,right_knee:80,right_ankle_pitch:-15});
nuggetRig.addPose('Deep tuck',{...nuggetStand,left_hip_pitch:-60,left_knee:140,left_ankle_pitch:-45,right_hip_pitch:-60,right_knee:140,right_ankle_pitch:-45});
nuggetRig.addPose('Wide stance',{...nuggetStand,left_hip_roll:35,right_hip_roll:-35});
nuggetRig.addAnimation('Step pose exploration',{duration:6,loop:true,keyframes:[{pose:'Stand'},{pose:'Left step'},{pose:'Stand'},{pose:'Right step'},{pose:'Stand'}]});
const nuggetMotionLibrary=require('./motion.forge.js').installNuggetMotions(nuggetRig,nuggetStand);
nuggetRig.withSimulation({rootPart:'Torso'});
const nuggetHome=nuggetRig.solve('Stand');
verify.equal('Left sole starts on floor',()=>nuggetHome.probe('left_sole')[2],0,.01);
verify.equal('Right sole starts on floor',()=>nuggetHome.probe('right_sole')[2],0,.01);
verify.equal('Eight selected XL330 assemblies total 144 g',8*(nuggetMotor.caseMassKg+nuggetMotor.outputMassKg),.144,.000001);
verify.equal('Pelvis support is connected',()=>nuggetPelvis.shape.numBodies(),1);
verify.equal('Hip spacing retained at stand',()=>Math.abs(nuggetHome.probe('left_sole')[0]-nuggetHome.probe('right_sole')[0]),nuggetDim.hipSpacing,.01);
function nuggetOverlap(a,b) {
  const aa=a.boundingBox(),bb=b.boundingBox();
  if(![0,1,2].every(i=>aa.min[i]<bb.max[i]-.001&&bb.min[i]<aa.max[i]-.001))return 0;
  return intersection(a,b).volume();
}
for(const rec of nuggetLegRecords) {
  for(const [role,shape]of [['roll cradle',rec.roll.shape],['thigh carrier',rec.thigh.shape],['shin carrier',rec.shin.shape],['foot',rec.foot.shape]]) {
    verify.notEmpty(rec.side.word+' '+role+' has geometry',shape);
    verify.equal(rec.side.word+' '+role+' is connected',()=>shape.numBodies(),1);
  }
  verify.notEmpty(rec.side.word+' selected knee motor reference',rec.thigh.cases[0]);
}
// Geometry checks use conservative case boxes and retainers; vendor screw/rotor
// details inside each motor are intentionally not separate collision pairs.
const nuggetClearanceCache=new Map();
function nuggetPackagingCheck(state) {
  const key=JSON.stringify(state);if(nuggetClearanceCache.has(key))return nuggetClearanceCache.get(key);
  const solved=nuggetRig.solve(state),findings=[];
  const all=[];
  for(const rec of nuggetLegRecords) {
    const k=rec.side.key;
    const volumes=[
      {name:k+'_HipRoll',shape:union(rec.roll.shape,rec.roll.envelope,rec.roll.retainer)},
      {name:k+'_Thigh',shape:union(rec.thigh.shape,...rec.thigh.envelopes,...rec.thigh.retainers)},
      {name:k+'_Shin',shape:union(rec.shin.shape,rec.shin.envelope,rec.shin.retainer)},
      {name:k+'_Foot',shape:rec.foot.shape},
    ].map(v=>({...v,shape:v.shape.transform(solved.getTransform(v.name))}));
    for(let i=0;i<volumes.length;i++)for(let j=i+1;j<volumes.length;j++) {
      const v=nuggetOverlap(volumes[i].shape,volumes[j].shape);
      if(v>.01)findings.push({a:volumes[i].name,b:volumes[j].name,volume:v,bounds:intersection(volumes[i].shape,volumes[j].shape).boundingBox()});
    }
    const shell=nuggetTorso.shape.transform(solved.getTransform('Torso'));
    const pelvis=nuggetPelvis.shape.transform(solved.getTransform('Torso'));
    const fixedCases=nuggetPelvis.envelopes.map(x=>x.transform(solved.getTransform('Torso')));
    for(const part of volumes)for(const [name,shape]of [['Torso',shell],['Pelvis',pelvis],...fixedCases.map((x,i)=>['Roll motor '+i,x])]) {
      const v=nuggetOverlap(part.shape,shape);if(v>.01)findings.push({a:part.name,b:name,volume:v});
    }
    all.push(volumes);
  }
  for(const a of all[0])for(const b of all[1]) {const v=nuggetOverlap(a.shape,b.shape);if(v>.01)findings.push({a:a.name,b:b.name,volume:v});}
  nuggetClearanceCache.set(key,findings);return findings;
}
// Scope: case/carrier/torso pairs at the default stand only.
if(nuggetDim.arch==='C')verify.equal('C standing carrier and case pairs have no overlap',()=>nuggetPackagingCheck(nuggetStand).length,0);
// Concept comparison: interference is reported, not a manufacturing release check.
verify.that('Architecture interference report is available',()=>{
  console.log('ARCHITECTURE_CONTACTS '+JSON.stringify(nuggetPackagingCheck(nuggetStand)));return true;
});
for(const rec of nuggetLegRecords) {
  const side=rec.side.word;
  nuggetRig.addMotionStudy(side+' XL330 knee fold',{joint:side+'_knee',from:0,to:150,steps:75,paths:[side+'_sole'],gaps:[[rec.side.key+'_Thigh',rec.side.key+'_Shin']]});
}
console.log('ARCHITECTURE_STAND_CONTACTS '+JSON.stringify(nuggetPackagingCheck(nuggetStand)));
console.log('XL330_MASS_ESTIMATE '+JSON.stringify({totalKg:nuggetMassRows.reduce((a,r)=>a+r.massKg,0),selectedMotorMassKg:.144,unselectedHardwareAllowanceKg:nuggetAllowance/1000,printedDensityKgM3:1240,rows:nuggetMassRows}));
for(const rec of nuggetLegRecords) {
  verify.equal(rec.side.word+' hip cover is connected',()=>rec.roll.cap.numBodies(),1);
}
verify.that('C wings clear all named poses',()=>{
  const obstacles=nuggetNamedShells.filter(o=>o.name.includes('wing'));
  const links=[];
  for(const r of nuggetLegRecords) {
    const k=r.side.key;
    links.push({name:k+'_HipRoll',shape:union(r.roll.shape,r.roll.envelope,r.roll.retainer,r.roll.cap)},
      {name:k+'_Thigh',shape:union(r.thigh.shape,...r.thigh.envelopes,...r.thigh.retainers)},
      {name:k+'_Shin',shape:union(r.shin.shape,r.shin.envelope,r.shin.retainer)},
      {name:k+'_Foot',shape:r.foot.shape});
  }
  const hits=[];
  for(const [pose,state]of Object.entries(nuggetMotionLibrary.poses)) {
    const solved=nuggetRig.solve(state);
    for(const link of links)for(const o of obstacles) {
      const v=nuggetOverlap(link.shape.transform(solved.getTransform(link.name)),o.shape.transform(solved.getTransform('Torso')));
      if(v>.01)hits.push({pose,a:link.name,b:o.name,mm3:v});
    }
  }
  console.log('C_WING_AUDIT '+JSON.stringify(hits));return hits.length===0;
});
function nuggetRunMobilityStudy() {
  const nuggetAudit=require('./mobility.forge.js').inspectMobility({rig:nuggetRig,records:nuggetLegRecords,torso:nuggetTorso,pelvis:nuggetPelvis,shells:nuggetNamedShells,stand:nuggetStand,poses:nuggetMotionLibrary.poses});
  
  const nuggetPoseReports=nuggetAudit.poseNames.map(name=>({name,...nuggetAudit.named(name)}));
  console.log('C_POSE_AUDIT '+JSON.stringify(nuggetPoseReports));
  for(const r of nuggetPoseReports) {
    verify.equal('C pose '+r.name+' has no reported interference',r.hits.length,0);
    verify.equal('C pose '+r.name+' has no motor-case collision',r.hard.length,0);
  }
  const nuggetKneeSweep=(()=>{
    const findings=[];
    for(const rec of nuggetLegRecords) {
      const parent=union(rec.thigh.shape,...rec.thigh.envelopes,...rec.thigh.retainers);
      const child=union(rec.shin.shape,rec.shin.envelope,rec.shin.retainer);
      for(let a=0;a<=150;a+=5) {
        const v=nuggetOverlap(parent,child.rotateX(a).translate(0,0,-nuggetDim.thighLength));
        if(v>.01)findings.push({side:rec.side.word,angle:a,mm3:v});
      }
    }
    console.log('C_KNEE_SWEEP '+JSON.stringify(findings));return findings;
  })();
  verify.equal('C sampled knee sweep 0 to 150 is clear',nuggetKneeSweep.length,0);
  const nuggetRollSweep=(()=>{
    const findings=[];
    for(const rec of nuggetLegRecords) {
      const low=rec.side.sign<0?-15:-45,high=rec.side.sign<0?45:15;
      for(let a=low;a<=high;a+=5) {
        const result=nuggetAudit.scan({...nuggetStand,[rec.side.word+'_hip_roll']:a});
        if(result.hits.length||result.hard.length)findings.push({side:rec.side.word,angle:a,...result});
      }
    }
    console.log('C_ROLL_SWEEP '+JSON.stringify(findings));return findings;
  })();
  verify.equal('C sampled hip roll at standing leg shape is clear',nuggetRollSweep.length,0);
  
  return {poses:nuggetPoseReports,knee:nuggetKneeSweep,roll:nuggetRollSweep};
}
if(require.main===module)return nuggetRig;
return {rig:nuggetRig,runStudy:nuggetRunMobilityStudy};
