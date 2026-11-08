// All child bodies are built at their own proximal joint origin. mm, degrees.
function xJournal(length, radius, z = 0) {
  return cylinder(length, radius).rotateY(90).translate(-length / 2, 0, z);
}
function yJournal(length, radius, z = 0) {
  return cylinder(length, radius).rotateX(-90).translate(0, -length / 2, z);
}
function jointPort(origin, axis, up = [0, 0, 1], gender = 'female') {
  const config = { origin, axis, up, kind: 'revolute' };
  return gender === 'male' ? connector.male('study-pivot', config) : connector.female('study-pivot', config);
}
// Reference-led body: full rounded breast, arched back, and a short rounded rear.
function torsoProfile(d) {
  const h=d.torsoHeight/88, l=d.torsoDepth/155;
  return path().moveTo(-76*l,0)
    .bezierTo(-76*l,24*h,-39*l,45*h,6*l,40*h)
    .bezierTo(38*l,37*h,70*l,25*h,76*l,11*h)
    .bezierTo(80*l,1*h,63*l,-14*h,33*l,-25*h)
    .bezierTo(-3*l,-38*h,-43*l,-37*h,-65*l,-20*h)
    .bezierTo(-73*l,-13*h,-76*l,-6*h,-76*l,0).close();
}
function crossBody(profile,width,x) {
  return profile.extrude(width).rotateX(90).rotateZ(90).translate(x,0,0);
}
function panelRelief(d) {
  // Broad arched opening below the fairing; no closed skirt over the thigh.
  return crossBody(path().moveTo(-48-d.hipForward,-70).lineTo(34-d.hipForward,-70)
    .lineTo(34-d.hipForward,-15).bezierTo(31-d.hipForward,9,-40-d.hipForward,9,-48-d.hipForward,-15).close(),d.torsoWidth+30,-d.torsoWidth/2-15);
}
// A shaped frontal section removes the barrel-like constant-width breast.
function breastVolume(d,inset=0) {
  const profile=path().moveTo(-24,-40)
    .bezierTo(-39,-35,-48,-12,-50,7)
    .bezierTo(-53,28,-49,40,-35,43)
    .bezierTo(-17,47,17,47,35,43)
    .bezierTo(49,40,53,28,50,7)
    .bezierTo(48,-12,39,-35,24,-40)
    .bezierTo(10,-44,-10,-44,-24,-40).close()
    .scale([(d.torsoWidth-2*inset)/104,(d.torsoHeight-2*inset)/88]);
  return profile.extrude(d.torsoDepth+40).rotateX(90).translate(0,d.torsoDepth/2+20,0);
}
function hipRecesses(d) {
  if(d.hiddenHip)return [-1,1].map(side=>crossBody(roundedRect(38,48,14).translate(-d.hipForward,8),38,side*d.hipSpacing/2-19));
  return [-1,1].map(side=>yJournal(34,11.5,-d.rollBelow).translate(side*d.hipSpacing/2,-d.hipForward,0));
}
function completeBodyShell(d) {
  const outer=intersection(crossBody(torsoProfile(d),d.torsoWidth+4,-d.torsoWidth/2-2),breastVolume(d));
  const inner=intersection(crossBody(torsoProfile(d).offset(-d.wall),d.torsoWidth+8,-d.torsoWidth/2-4),breastVolume(d,d.wall));
  const access=[];
  const f=(d.motorAccess||0)/100;
  if(f>0)for(const sign of [-1,1])access.push(roundedRect(16*f,22*f,3*f).extrude(40).translate(sign*(d.hipSpacing/2-d.rollInset),-d.hipForward,24));
  return {outer,shell:difference(outer,inner,panelRelief(d),...hipRecesses(d),...access)};
}
function torsoBody(d) {
  const body=completeBodyShell(d);
  const fairing=intersection(body.shell,box(66,d.torsoDepth+50,120).translate(0,0,-50));
  const neckRails=[-1,1].map(side=>roundedRect(6,14,2).extrude(30).rotateX(62).translate(side*12,-56,29));
  const ears=[],bores=[];
  const crossmembers=[-1,1].map(fore=>box(d.hipSpacing+20,6,6).translate(0,fore*19-d.hipForward,-4));
  for(const side of [-1,1]) {
    for(const fore of [-1,1]) ears.push(roundedRect(18,18,4).extrude(4).rotateX(90).translate(side*d.hipSpacing/2,fore*19-d.hipForward+2,-d.rollBelow));
    bores.push(yJournal(46,d.pinRadius+d.pivotClearance,-d.rollBelow).translate(side*d.hipSpacing/2,-d.hipForward,0));
  }
  const solid=difference(union(fairing,...neckRails,...crossmembers,...ears),...bores).color('#eee5d1').withConnectors({
    left_roll:jointPort([-d.hipSpacing/2,-d.hipForward,-d.rollBelow],[0,-1,0]),
    right_roll:jointPort([d.hipSpacing/2,-d.hipForward,-d.rollBelow],[0,-1,0]),
  });
  return {shape:solid,fairing,pieces:{fairing_proxy:body.outer,neckRails,crossmembers,hip_ears:ears},clearances:[{name:'electronics_envelope',shape:box(38,50,16).translate(0,-7,0)}]};
}
function sidePanel(d,side) {
  const shell=completeBodyShell(d).shell;
  // Curved wraparound panels; 1 mm seams on either side of the 66 mm centre section.
  const slab=box(40,d.torsoDepth+50,120).translate(side*54,0,-50);
  return intersection(shell,slab).color('#e6decb')
    .withAssemblyStep({direction:'x',title:'Fit the independent curved side panel',note:'Curved side access panel with recessed hip clearance; attachment details are deferred.'});
}

function wingShape(d,side) {
  const profile=path().moveTo(25.2,24).bezierTo(28.8,40,51.6,39,72,28)
    .bezierTo(78,24,72,19,63,17).lineTo(39.6,11)
    .bezierTo(30,10,22.8,13,25.2,24).close();
  const x=side<0?-d.torsoWidth/2-7:d.torsoWidth/2+2;
  const blade=crossBody(profile,5,x);
  const boss=xJournal(14,8,25).translate(side*(d.torsoWidth/2+2),33,0);
  return union(blade,boss).color('#eee5d1').withAssemblyStep({direction:'x',title:'Fit the swept wing at its side pivot',note:'Fixed for this silhouette study; wing actuation is not designed.'});
}
function wingAccent(d,side) {
  const profile=path().moveTo(33,29).bezierTo(40.2,33,51,31,55.8,25)
    .bezierTo(58.8,19,52.2,17,46.2,20).lineTo(33.6,24).bezierTo(31.2,25,31.2,28,33,29).close();
  return fillet(crossBody(profile,1.5,side<0?-d.torsoWidth/2-8.5:d.torsoWidth/2+7),0.6,{convex:true}).color('#ef8a32');
}

function rollCarrier(d,color) {
  const hub=yJournal(28,9);
  const shaft=yJournal(44,d.pinRadius);
  // Rear bridge leaves the forward-swinging thigh shoulder free.
  const bridge=box(d.forkOuter,8,6).translate(0,9,-d.pitchDrop+11);
  const cheeks=[-1,1].map(side=>xJournal(4,10,-d.pitchDrop).translate(side*(d.forkInner/2+2),0,0));
  const arms=[-1,1].map(side=>box(4,8,13).translate(side*(d.forkInner/2+2),9,-d.pitchDrop+5));
  const neck=box(16,8,d.pitchDrop-10).translate(0,5,-d.pitchDrop+11);
  const solid=difference(union(hub,shaft,bridge,neck,...cheeks,...arms),xJournal(d.forkOuter+4,d.pinRadius+d.pivotClearance,-d.pitchDrop)).color(color).withConnectors({
    roll:jointPort([0,0,0],[0,1,0],[0,0,1],'male'),
    pitch:jointPort([0,0,-d.pitchDrop],[-1,0,0]),
  }).withAssemblyStep({direction:'y',title:'Fit the roll carrier with rear-set pitch bridge'});
  return {shape:solid,pieces:{hub,shaft,bridge,neck,cheeks,arms},clearances:[]};
}
function legSegment(d,length,color,role) {
  const hub=xJournal(d.linkWidth,8);
  const shaft=xJournal(d.forkOuter+4,d.pinRadius);
  // Forward-set C links avoid face-to-face overlap when the shin folds back.
  // Rails end 12 mm above the distal pivot, clear of the next 8 mm radius hub.
  const rails=[-1,1].map(side=>roundedRect(length-18,14,6).extrude(d.wall).rotateY(90).translate(side*(d.servoWidth+d.wall)/2-d.wall/2,-10,(-length+6)/2));
  const shoulders=[-1,1].map(side=>box(d.wall,12,6).translate(side*(d.servoWidth+d.wall)/2,-5,-10));
  const bridge=box(d.forkOuter,12,6).translate(0,-13,-length+11);
  const cheeks=[-1,1].map(side=>xJournal(4,10,-length).translate(side*(d.forkInner/2+2),0,0));
  const arms=[-1,1].map(side=>box(4,12,13).translate(side*(d.forkInner/2+2),-10,-length+5));
  const solid=difference(union(hub,shaft,...rails,...shoulders,bridge,...cheeks,...arms),xJournal(d.forkOuter+4,d.pinRadius+d.pivotClearance,-length)).color(color).withConnectors({
    proximal:jointPort([0,0,0],[1,0,0],[0,0,1],'male'),
    distal:jointPort([0,0,-length],[-1,0,0]),
  }).withAssemblyStep({direction:'x',title:'Fit the '+role+' into the open-backed folding fork',note:'The joint is a range study. Motor mounting and structural sizing are deferred.'});
  const motorSpace=box(d.servoWidth-2,16,d.servoHeight-2).translate(0,-30,-length/2-(d.servoHeight-2)/2);
  return {shape:solid,pieces:{hub,shaft,rails,shoulders,bridge,cheeks,arms},clearances:[{name:'external_actuator_study_space',shape:motorSpace}]};
}

function footBody(d,color) {
  const heel=roundedRect(d.footWidth,30,10).extrude(6).translate(0,7,-d.ankleHeight);
  const toes=[-1,1].map(side=>roundedRect(d.footWidth/2-2,d.footLength-15,7).extrude(6).translate(side*d.footWidth/4,-15,-d.ankleHeight));
  const sole=union(heel,...toes);
  const neck = box(20,20,d.ankleHeight-6).translate(0,0,-d.ankleHeight+4);
  const hub = xJournal(d.linkWidth,9);
  const shaft = xJournal(d.forkOuter+4,d.pinRadius);
  const solid=union(sole,neck,hub,shaft).color(color).withConnectors({
    ankle:jointPort([0,0,0],[1,0,0],[0,0,1],'male'),
  }).withAssemblyStep({direction:'x',title:'Insert the foot journal into the shin fork'});
  return {shape:solid,pieces:{sole,neck,hub,shaft},clearances:[]};
}
function torsoSkin(d) {
  const body=completeBodyShell(d);
  const fairing=intersection(body.shell,box(66,d.torsoDepth+50,120).translate(0,0,-50));
  const neckRails=[-1,1].map(side=>roundedRect(6,14,2).extrude(30).rotateX(62).translate(side*12,-56,29));
  const shape=union(fairing,...neckRails).color('#eee5d1').withConnectors({
    left_roll:connector.female('xl330-axis',{origin:[-(d.hipSpacing/2-d.rollInset),-d.hipForward,0],axis:[0,-1,0],up:[0,0,1],kind:'revolute'}),
    right_roll:connector.female('xl330-axis',{origin:[(d.hipSpacing/2-d.rollInset),-d.hipForward,0],axis:[0,-1,0],up:[0,0,1],kind:'revolute'}),
  });
  return {shape,pieces:{fairing_proxy:body.outer,neckRails},clearances:[]};
}
return {torsoBody,torsoSkin,sidePanel,wingShape,wingAccent,rollCarrier,legSegment,footBody};
