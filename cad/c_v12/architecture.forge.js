// Architecture studies: A exposed direct drive, B remote knee, C flush direct drive.
// Motor cases are vendor meshes. Covers are original removable packaging concepts.
function birdPort(origin,axis,gender='female') {return connector[gender]('xl330-axis',{origin,axis,up:[0,0,1],kind:'revolute'});}
function birdAt(shape,angle,y,z) {return shape.rotateX(angle).translate(0,y,z);}
function birdPlate(api,profile,x,t=1.8) {return api.alongX(profile.extrude(t)).translate(x,0,0);}
function birdThighProfile(d,remote=false) {
  const l=d.thighLength;
  if(remote)return path().moveTo(-8,5).bezierTo(-13,-4,-13,-18,-12,-29)
    .lineTo(-10,-l).bezierTo(-10,-l-12,10,-l-12,11,-l)
    .bezierTo(19,-l+3,42,-l+9,40,-l+21).bezierTo(38,-15,24,-7,9,5).close();
  return path().moveTo(-8,5).bezierTo(-12,0,-9,-12,-11,-20)
    .bezierTo(-15,-25,-15,-34,-14,-l-7).bezierTo(-14,-l-15,14,-l-15,14,-l-7)
    .bezierTo(15,-34,15,-25,11,-20).bezierTo(9,-12,12,0,8,5).close();
}
function birdHousing(api,profile,reliefs,joinY=-7) {
  const sideA=birdPlate(api,profile,-13.5,1.8);
  const sideB=birdPlate(api,profile,11.7,1.8);
  const rim=difference2d(profile,profile.offset(-1.8));
  const wall=birdPlate(api,rim,-11.7,23.4);
  const upperClearance=cylinder(40,28).rotateY(90).translate(-20,0,0);
  const shell=difference(union(sideA,sideB,wall),upperClearance,...reliefs);
  const upper=path().moveTo(-11,0).bezierTo(-11,10,11,10,11,0)
    .bezierTo(11,-10,1,-18,0,-34).lineTo(-16,-34).bezierTo(-15,-18,-11,-10,-11,0).close();
  const forkProfile=upper.offset(-.6);
  const forks=[birdPlate(api,forkProfile,14.5,2.4),birdPlate(api,forkProfile,-16.9,2.4)];
  const posts=[-1,1].map(s=>box(5,5,7).translate(s*14.4,joinY,-34));
  return difference(union(shell,...forks,...posts),cylinder(40,3.1).rotateY(90).translate(-20,0,0),...reliefs);
}

function birdServiceCuts(d,api,angle=0,y=0,z=0) {
  const f=(d.motorAccess||0)/100;
  if(f<=0)return [];
  const centre=birdPlate(api,roundedRect(12*f,13*f,Math.min(2*f,2)).translate(0,-16),-25,50);
  const plug=birdPlate(api,roundedRect(12*f,6*f,Math.min(1.5*f,1.5)).translate(0,-24.3),-25,50);
  const vents=api.holes(-25,50,[[-8,-14],[8,-14]],1.8*f);
  return [centre,plug,...vents].map(sh=>birdAt(sh,angle,y,z));
}

function birdApplyService(shape,d,api,angle=0,y=0,z=0) {
  const cuts=birdServiceCuts(d,api,angle,y,z);
  return cuts.length?difference(shape,...cuts):shape;
}
function birdThigh(d,motor,api) {
  const remote=d.arch==='B';
  const kneeAngle=remote?90:180;
  const motorY=remote?12:0;
  const motorZ=remote?-d.thighLength+Math.sqrt(22*22-12*12):-d.thighLength;
  const caseShape=birdAt(motor.caseShape,kneeAngle,motorY,motorZ);
  const envelope=birdAt(motor.caseEnvelope,kneeAngle,motorY,motorZ);
  const retainer=birdAt(motor.retainer,kneeAngle,motorY,motorZ);
  const mount=birdAt(motor.cradle,kneeAngle,motorY,motorZ);
  const prof=birdThighProfile(d,remote);
  const holes=[cylinder(40,3.1).rotateY(90).translate(-20,0,0),
    cylinder(40,remote?5.2:(d.arch==='A'?8.5:11.2)).rotateY(90).translate(-20,0,-d.thighLength)];
  const core=birdPlate(api,prof,-17.5,1.8);
  const posts=api.holes(-15.7,2.2,motor.casePattern.map(([y,z])=>{
    const a=kneeAngle*Math.PI/180;return[y*Math.cos(a)-z*Math.sin(a)+motorY,y*Math.sin(a)+z*Math.cos(a)+motorZ];
  }),2.1);
  const join=box(34,5,4).translate(0,0,-d.thighLength-12);
  const rearWeb=birdAt(birdPlate(api,roundedRect(22,36,2),-15.9,2.5).translate(0,0,-7.5),kneeAngle,motorY,motorZ);
  let shape=d.arch==='A'?difference(union(core,mount,rearWeb,...posts),...holes,...api.holes(-18,7,motor.casePattern.map(([y,z])=>[-y,-z-d.thighLength]))):birdHousing(api,prof,holes);
  if(remote) {
    const stays=[-1,1].map(s=>box(2.4,5,13).translate(s*15.7,7,-d.thighLength+4));
    const tie=box(33.8,5,3).translate(0,7,-d.thighLength+4);
    const sideRibs=[-1,1].map(v=>box(5.2,4,25).translate(v*14.3,7,-d.thighLength+3));
    const rearBridge=difference(birdPlate(api,prof,-16.9,4.4),cylinder(7,15).rotateY(90).translate(-18,0,0),...holes);
    shape=union(shape,...stays,tie,...sideRibs,rearBridge);
  }
  // B and C have complete flush housings; internal carrier retention is still a concept.
  shape=birdApplyService(shape,d,api,kneeAngle,motorY,motorZ).color('#e5dece').withConnectors({proximal:birdPort([0,0,0],[1,0,0],'male'),distal:birdPort([0,0,-d.thighLength],[-1,0,0])})
    .withAssemblyStep({direction:'x',title:'Fit the integrated thigh housing and direct-drive or remote knee module'});
  return {shape,cases:[caseShape],retainers:[retainer],envelopes:[envelope],motorY,motorZ,kneeAngle,remote};
}
function birdShin(d,motor,api) {
  const angle=250,l=d.shinLength;
  const caseShape=birdAt(motor.caseShape,angle,0,-l);
  const retainer=birdAt(motor.retainer,angle,0,-l);
  const envelope=birdAt(motor.caseEnvelope,angle,0,-l);
  const prof=path().moveTo(-8,4).bezierTo(-14,-5,-15,-15,-20,-l+14)
    .bezierTo(-32,-l+4,-31,-l-9,-20,-l-13).bezierTo(-10,-l-17,10,-l-12,12,-l-5)
    .bezierTo(15,-l+4,9,-l+15,7,-l+22).lineTo(8,4).close();
  const holes=[cylinder(40,3.1).rotateY(90).translate(-20,0,0),cylinder(40,11.2).rotateY(90).translate(-20,0,-l)];
  const shape=birdApplyService(birdHousing(api,prof,holes,-7),d,api,angle,0,-l).color('#d8d0c0').withConnectors({proximal:birdPort([0,0,0],[1,0,0],'male'),distal:birdPort([0,0,-l],[-1,0,0])})
    .withAssemblyStep({direction:'x',title:'Fit the curved shin shell around the ankle motor'});
  return {shape,caseShape,retainer,envelope,ankleAngle:angle};
}
function birdRollCradle(d,motor,api,side) {
  const off=side*d.rollInset;
  const mount=side>0?motor.cradle:motor.retainer;
  const fixedPlate=birdAt(mount,90,0,0).translate(off,0,-d.pitchDrop);
  const closeX=side*(d.rollInset-12.5);
  const ends=[api.outputCheek(14.5),api.outputCheek(-16.9)].map(s=>s.rotateZ(90));
  const arms=[16.9,-14.5].map(y=>stroke([[0,0],[closeX*.5,8],[closeX,10]],5.5,'Round').extrude(2.4).rotateX(90).translate(0,y,0));
  const tabs=[box(2.4,42,4).translate(closeX,5,8)];
  const shape=union(fixedPlate,...ends,...arms,...tabs).color('#44515b').withConnectors({roll:birdPort([0,0,0],[0,1,0],'male'),pitch:birdPort([off,0,-d.pitchDrop],[-1,0,0])})
    .withAssemblyStep({direction:'y',title:'Fit the in-body hip pitch case to the moving hip-roll cradle'});
  const place=s=>birdAt(s,90,0,0).translate(off,0,-d.pitchDrop);
  const capProf=roundedRect(50,28,10).translate(7.5,0);
  const capX=off+(side>0?17.8:-19.6);
  const cap=difference(birdPlate(api,capProf,capX,1.8),cylinder(44,12.2).rotateY(90).translate(off-22,0,0),...birdServiceCuts(d,api,90,0,0).map(sh=>sh.translate(off,0,0))).color('#e5dece');
  return {shape,caseShape:place(motor.caseShape),envelope:place(motor.caseEnvelope),retainer:place(side>0?motor.retainer:motor.cradle),cap};
}
function birdPelvis(d,motor,api) {
  const at=(sh,s)=>sh.rotateX(180).rotateZ(90).translate(s*(d.hipSpacing/2-d.rollInset),-d.hipForward,0);
  const cases=[-1,1].map(s=>at(motor.caseShape,s));
  const clamps=[-1,1].map(s=>at(motor.cradle,s));
  const span=d.hipSpacing-2*d.rollInset;
  const bars=[-1,1].map(s=>box(span+22,5,5).translate(0,-d.hipForward+s*12.5,34));
  const spine=box(8,30,3).translate(0,-d.hipForward,38);
  const risers=[-1,1].map(s=>box(5,2,15).translate(s*span/2,-d.hipForward-12.5,23));
  const shape=difference(union(...clamps,...bars,spine,...risers),...[-1,1].map(s=>at(motor.fitEnvelope,s))).color('#44515b');
  return {shape,cases,retainers:[-1,1].map(s=>at(motor.retainer,s)),envelopes:[-1,1].map(s=>at(motor.caseEnvelope,s))};
}
function birdPulley(api) {
  // Packaging envelope for a 28-tooth, 2 mm pitch, 6 mm wide timing pulley.
  // Tooth form, tensioning and bearing detail are deliberately not fabrication geometry.
  const r=28*2/(2*Math.PI);
  return union(api.ring(14.5,10.2,2.05,.8),api.ring(15.3,r,2.05,6),api.ring(21.3,10.2,2.05,.8)).color('#59656e');
}
function birdBelt(d,thigh,api) {
  const p0=[thigh.motorY,thigh.motorZ],p1=[0,-d.thighLength];
  const r=28*2/(2*Math.PI),dx=p1[0]-p0[0],dy=p1[1]-p0[1],ang=Math.atan2(dy,dx)*180/Math.PI-90;
  const centre=[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2];
  const outline=slot(22+2*(r+1),2*(r+1)).rotateAround(ang+90,[0,0]).translate(...centre);
  const inner=slot(22+2*(r-.2),2*(r-.2)).rotateAround(ang+90,[0,0]).translate(...centre);
  return birdPlate(api,difference2d(outline,inner),15.4,5.8).color('#27313a');
}
function birdRemoteDrive({rig,side,thigh,d,motor,api,fixed,massRows}) {
  const pulley=birdPulley(api),k=side.key;
  rig.withConnectors(k+'_Thigh',{remote:connector({origin:[0,thigh.motorY,thigh.motorZ],axis:[-1,0,0],up:[0,0,1],kind:'revolute'})});
  rig.addPart(k+'_Knee_drive_pulley',pulley.withConnectors({axis:connector({origin:[0,0,0],axis:[1,0,0],up:[0,0,1],kind:'revolute'})}),{sim:Sim.body({massKg:.002,collider:Sim.collider.none('Transmission packaging concept.')}),metadata:{massKg:.002,tags:'transmission'}});
  rig.connect(k+'_Thigh.remote',k+'_Knee_drive_pulley.axis',{type:'revolute',as:side.word+'_remote_knee_shaft',follows:{joint:side.word+'_knee',ratio:1}});
  massRows.push({name:k+'_Knee_drive_pulley',massKg:.002});
  fixed(k+'_Knee_drive_pulley',k+'_Knee_output',motor.output,motor.outputMassKg,'outputs');
  fixed(k+'_Knee_drive_pulley',k+'_Knee_idler',motor.idler,motor.idlerMassKg,'idlers');
  fixed(k+'_Shin',k+'_Knee_driven_pulley',pulley,.002,'transmission');
  fixed(k+'_Thigh',k+'_Knee_belt',birdBelt(d,thigh,api),.001,'transmission');
  fixed(k+'_Shin',k+'_Knee_shaft',cylinder(34,2).rotateY(90).translate(-17,0,0).color('#77838c'),.003,'transmission');
}
return {thigh:birdThigh,shin:birdShin,rollCradle:birdRollCradle,pelvis:birdPelvis,pulley:birdPulley,belt:birdBelt,installRemote:birdRemoteDrive};
