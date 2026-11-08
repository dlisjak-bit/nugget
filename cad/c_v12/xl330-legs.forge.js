// Thin carrier plates around manufacturer motor references. All dimensions mm.
function xlLegPort(origin,axis,gender='female') {
  return connector[gender]('xl330-axis',{origin,axis,up:[0,0,1],kind:'revolute'});
}
function xlPlace(shape,angle,z=0) {return shape.rotateX(angle).translate(0,0,z);}
function xlSideRail(api,points,width,x,thickness=2.4) {
  return api.alongX(stroke(points,width,'Round').extrude(thickness)).translate(x,0,0);
}
function xlThigh(d,motor,api) {
  const hipAngle=-35,kneeAngle=145;
  const spaces=[xlPlace(motor.fitEnvelope,hipAngle),xlPlace(motor.fitEnvelope,kneeAngle,-d.thighLength)];
  const mounts=[xlPlace(motor.cradle,hipAngle),xlPlace(motor.cradle,kneeAngle,-d.thighLength)];
  const angle=35*Math.PI/180;
  const bridge=xlSideRail(api,[[-7.5*Math.sin(angle),-7.5*Math.cos(angle)],[7.5*Math.sin(angle),-d.thighLength+7.5*Math.cos(angle)]],7,-13.5,2);
  const carrier=union(...mounts,bridge).color('#ddd7c9').withConnectors({
    proximal:xlLegPort([0,0,0],[1,0,0],'male'),
    distal:xlLegPort([0,0,-d.thighLength],[-1,0,0]),
  }).withAssemblyStep({direction:'x',title:'Bolt the paired XL330 cases to the thin thigh backplate'});
  return {shape:carrier,cases:[xlPlace(motor.caseShape,hipAngle),xlPlace(motor.caseShape,kneeAngle,-d.thighLength)],
    retainers:[xlPlace(motor.retainer,hipAngle),xlPlace(motor.retainer,kneeAngle,-d.thighLength)],
    envelopes:[xlPlace(motor.caseEnvelope,hipAngle),xlPlace(motor.caseEnvelope,kneeAngle,-d.thighLength)],
    hipAngle,kneeAngle,spaces};
}
function xlShin(d,motor,api) {
  const ankleAngle=245;
  const ankleMount=xlPlace(motor.cradle,ankleAngle,-d.shinLength);
  const knees=[api.outputCheek(14.5),api.outputCheek(-16.9)];
  const rails=[14.5,-16.9].map(x=>xlSideRail(api,[[0,0],[-17,-18],[-25,-d.shinLength+9]],5,x));
  const endTie=box(33.8,5,7).translate(0,-25,-d.shinLength+5.5);
  const lowerBridge=box(27,5,11).translate(-.5,-23,-d.shinLength+3);
  const caseSpace=xlPlace(motor.fitEnvelope,ankleAngle,-d.shinLength);
  const carrier=union(difference(union(...knees,...rails,endTie,lowerBridge),caseSpace),ankleMount).color('#d1cabd').withConnectors({
    proximal:xlLegPort([0,0,0],[1,0,0],'male'),
    distal:xlLegPort([0,0,-d.shinLength],[-1,0,0]),
  }).withAssemblyStep({direction:'x',title:'Fit the slender shin rails and ankle backplate'});
  return {shape:carrier,caseShape:xlPlace(motor.caseShape,ankleAngle,-d.shinLength),retainer:xlPlace(motor.retainer,ankleAngle,-d.shinLength),envelope:xlPlace(motor.caseEnvelope,ankleAngle,-d.shinLength),ankleAngle};
}
function xlFoot(d,api) {
  const soleBase=roundedRect(d.footWidth,30,9).extrude(4).translate(0,4,-d.ankleHeight);
  const toes=[-1,1].map(s=>roundedRect(d.footWidth/2-2,d.footLength-15,6).extrude(4).translate(s*d.footWidth/4,-15,-d.ankleHeight));
  const sole=union(soleBase,...toes);
  const cheeks=[api.outputCheek(14.5),api.outputCheek(-16.9)];
  const heels=[14.5,-16.9].map(x=>xlSideRail(api,[[0,0],[10,-d.ankleHeight+5]],5,x));
  const frame=union(sole,...cheeks,...heels).color('#ee8b3c').withConnectors({ankle:xlLegPort([0,0,0],[1,0,0],'male')})
    .withAssemblyStep({direction:'x',title:'Fit the low-profile foot supports to the output and rear idler'});
  return {shape:frame,sole};
}
function xlRollCradle(d,motor,api,side) {
  const off=side*d.rollInset;
  const rollEnds=[api.outputCheek(14.5),api.outputCheek(-16.9)].map(s=>s.rotateZ(90));
  const rollArms=[16.9,-14.5].map(y=>stroke([[0,0],[off/2,-12],[off,-d.pitchDrop]],6,'Round').extrude(2.4).rotateX(90).translate(0,y,0));
  const pitchEnds=[api.outputCheek(14.5),api.outputCheek(-16.9)].map(s=>s.translate(off,0,-d.pitchDrop));
  const pitchArms=[14.5,-16.9].map(x=>xlSideRail(api,[[0,-d.pitchDrop],[18.5,-d.pitchDrop+3]],5,x+off));
  const rearBridge=box(33.8,5,6).translate(off,18.5,-d.pitchDrop+1);
  const pitchSweep=[];
  for(let a=-65;a<=45;a+=5)pitchSweep.push(motor.fitEnvelope.rotateX(-35+a).translate(off,0,-d.pitchDrop));
  const frame=union(...rollEnds,difference(union(...rollArms,...pitchArms,rearBridge),...pitchSweep),...pitchEnds)
    .color('#44515b').withConnectors({roll:xlLegPort([0,0,0],[0,1,0],'male'),pitch:xlLegPort([off,0,-d.pitchDrop],[-1,0,0])})
    .withAssemblyStep({direction:'y',title:'Fit the compact roll cradle and pitch supports'});
  return {shape:frame};
}
function xlPelvis(d,motor,api) {
  const mount=(shape,s)=>shape.rotateX(180).rotateZ(90).translate(s*(d.hipSpacing/2-d.rollInset),-d.hipForward,0);
  const cases=[-1,1].map(s=>mount(motor.caseShape,s));
  const clamps=[-1,1].map(s=>mount(motor.cradle,s));
  const clearances=[-1,1].map(s=>mount(motor.fitEnvelope,s));
  const span=d.hipSpacing-2*d.rollInset;
  const crossbars=[-1,1].map(s=>box(span+22,5,5).translate(0,-d.hipForward+s*12.5,18));
  const tray=difference(box(46,36,2.5),box(30,23,5).translate(0,0,-1)).translate(0,-d.hipForward,4);
  const ribs=[-1,1].map(s=>box(5,30,16).translate(s*21,-d.hipForward,4));
  const shape=difference(union(...clamps,...crossbars,tray,...ribs),...clearances).color('#44515b');
  return {shape,cases,retainers:[-1,1].map(s=>mount(motor.retainer,s)),envelopes:[-1,1].map(s=>mount(motor.caseEnvelope,s))};
}
return {thigh:xlThigh,shin:xlShin,foot:xlFoot,rollCradle:xlRollCradle,pelvis:xlPelvis};
