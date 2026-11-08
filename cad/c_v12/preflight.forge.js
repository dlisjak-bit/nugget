// C packaging preparation: service ports and finite swept movement relief.
function attachLeg(rig,side) {
  const s=side.sign,k=side.key,w=side.word;
  const servo={type:'revolute',driven:true,effort:.52,velocity:618,drive:Sim.drive.passive({damping:.003,friction:0})};
  rig.connect('Torso.'+w+'_roll',k+'_HipRoll.roll',{...servo,as:w+'_hip_roll',min:s<0?-15:-45,max:s<0?45:15,default:0});
  rig.connect(k+'_HipRoll.pitch',k+'_Thigh.proximal',{...servo,as:w+'_hip_pitch',min:-65,max:45,default:-40});
  rig.connect(k+'_Thigh.distal',k+'_Shin.proximal',{...servo,as:w+'_knee',min:0,max:150,default:80});
  rig.connect(k+'_Shin.distal',k+'_Foot.ankle',{...servo,as:w+'_ankle_pitch',min:-45,max:45,default:-40});
}
function prepare({d,motor,api,parts,legs,legacy,motion}) {
  const records=[];
  for(const side of [{key:'L',word:'left',sign:-1},{key:'R',word:'right',sign:1}]) {
    const thigh=legs.thigh(d,motor,api),shin=legs.shin(d,motor,api),foot=legacy.foot(d,api),roll=legs.rollCradle(d,motor,api,side.sign);
    const solePocket=box(d.footWidth+1,d.footLength-5,6).translate(0,-11.75,-d.ankleHeight-.7);
    const soleSweep=[];for(let a=-45;a<=45;a+=5)soleSweep.push(solePocket.rotateX(a).translate(0,0,-d.shinLength));
    shin.shape=difference(shin.shape,...soleSweep,shin.envelope);
    thigh.shape=difference(thigh.shape,...thigh.envelopes);
    records.push({side,thigh,shin,foot,roll});
  }
  const stand={left_hip_roll:0,left_hip_pitch:-40,left_knee:80,left_ankle_pitch:-40,right_hip_roll:0,right_hip_pitch:-40,right_knee:80,right_ankle_pitch:-40};
  const fixture=assembly('C clearance fixture');
  const port=(origin,axis,gender='female')=>connector[gender]('xl330-axis',{origin,axis,up:[0,0,1],kind:'revolute'});
  const small=box(1,1,1);
  fixture.addPart('Torso',small.withConnectors({left_roll:port([-(d.hipSpacing/2-d.rollInset),-d.hipForward,0],[0,-1,0]),right_roll:port([(d.hipSpacing/2-d.rollInset),-d.hipForward,0],[0,-1,0])}));
  for(const r of records) {
    const k=r.side.key;
    fixture.addPart(k+'_HipRoll',small.withConnectors({roll:port([0,0,0],[0,1,0],'male'),pitch:port([r.side.sign*d.rollInset,0,-d.pitchDrop],[-1,0,0])}));
    fixture.addPart(k+'_Thigh',small.withConnectors({proximal:port([0,0,0],[1,0,0],'male'),distal:port([0,0,-d.thighLength],[-1,0,0])}));
    fixture.addPart(k+'_Shin',small.withConnectors({proximal:port([0,0,0],[1,0,0],'male'),distal:port([0,0,-d.shinLength],[-1,0,0])}));
    fixture.addPart(k+'_Foot',small.withConnectors({ankle:port([0,0,0],[1,0,0],'male')}));
    attachLeg(fixture,r.side);
  }
  fixture.addPose('Stand',stand);
  fixture.addPose('Left step',{...stand,left_hip_pitch:-65,left_knee:80,left_ankle_pitch:-15});
  fixture.addPose('Right step',{...stand,right_hip_pitch:-65,right_knee:80,right_ankle_pitch:-15});
  fixture.addPose('Deep tuck',{...stand,left_hip_pitch:-60,left_knee:140,left_ankle_pitch:-45,right_hip_pitch:-60,right_knee:140,right_ankle_pitch:-45});
  const library=motion.installChikenMotions(fixture,stand);
  const states=[],seen=new Set();
  function add(state) {const key=JSON.stringify(state);if(!seen.has(key)){seen.add(key);states.push(state);}}
  for(const pose of Object.values(library.poses))for(let j=0;j<=4;j++) {
    const t=j/4,state={};for(const key of Object.keys(stand))state[key]=stand[key]+(pose[key]-stand[key])*t;add(state);
  }
  // The cosmetic shell receives filled, padded box envelopes. The same
  // deterministic fixture and connectors place them as the displayed robot.
  const templates=[];
  for(const r of records) {
    const k=r.side.key;
    for(const [name,shape]of [
      [k+'_HipRoll',union(r.roll.shape,r.roll.envelope,r.roll.retainer,r.roll.cap)],
      [k+'_Thigh',union(r.thigh.shape,...r.thigh.envelopes,...r.thigh.retainers)],
      [k+'_Shin',union(r.shin.shape,r.shin.envelope,r.shin.retainer)],
      [k+'_Foot',r.foot.shape]]) {
      const b=shape.boundingBox(),gap=.8;
      const env=box(b.max[0]-b.min[0]+2*gap,b.max[1]-b.min[1]+2*gap,b.max[2]-b.min[2]+2*gap)
        .translate((b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,b.min[2]-gap);
      templates.push({name,env});
    }
  }
  const cuts=[];
  for(const state of states) {
    const solved=fixture.solve(state);
    for(const {name,env}of templates) {
      const placed=env.transform(solved.getTransform(name)),eb=placed.boundingBox();
      if(eb.max[2]>-36&&eb.min[2]<48)cuts.push(placed);
    }
  }
  const shellRelief=union(...cuts);
  console.log('C_RELIEF_SAMPLES '+states.length);
  return {records,stand,states,shellRelief};
}
return {prepare,attachLeg};
