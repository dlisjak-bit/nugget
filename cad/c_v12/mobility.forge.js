// Read-only kinematic collision audit. Conservative case envelopes; mm3.
function inspectMobility({rig,records,torso,pelvis,shells,stand,poses}) {
  function overlap(a,b) {const aa=a.bounds,bb=b.bounds;if(![0,1,2].every(i=>aa.min[i]<bb.max[i]-.001&&bb.min[i]<aa.max[i]-.001))return 0;return intersection(a.shape,b.shape).volume();}
  function placed(v,tf) {const b=v.bounds,pts=[];for(const x of [b.min[0],b.max[0]])for(const y of [b.min[1],b.max[1]])for(const z of [b.min[2],b.max[2]])pts.push(tf.point([x,y,z]));return {...v,shape:v.shape.transform(tf),bounds:{min:[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...pts.map(p=>p[i])))}};}
  const moving=[];
  const fixed=[{name:'Torso centre',shape:torso.shape},{name:'Pelvis',shape:pelvis.shape},...shells];
  const cases=[];
  for(const [index,rec] of records.entries()) {
    const k=rec.side.key;
    moving.push({name:k+'_HipRoll',shape:union(rec.roll.shape,rec.roll.envelope,rec.roll.retainer,rec.roll.cap)},
      {name:k+'_Thigh',shape:union(rec.thigh.shape,...rec.thigh.envelopes,...rec.thigh.retainers)},
      {name:k+'_Shin',shape:union(rec.shin.shape,rec.shin.envelope,rec.shin.retainer)},
      {name:k+'_Foot',shape:rec.foot.shape});
    fixed.push({name:k+'_fixed_roll_case',shape:pelvis.envelopes[index]});
    cases.push({name:k+' roll case',parent:'Torso',shape:pelvis.cases[index]},
      {name:k+' pitch case',parent:k+'_HipRoll',shape:rec.roll.caseShape},
      {name:k+' knee case',parent:k+'_Thigh',shape:rec.thigh.cases[0]},
      {name:k+' ankle case',parent:k+'_Shin',shape:rec.shin.caseShape});
  }
  for(const v of [...moving,...fixed,...cases])v.bounds=v.shape.boundingBox();
  const cache=new Map();
  function scan(state) {
    const key=JSON.stringify(state);if(cache.has(key))return cache.get(key);
    const solved=rig.solve(state),root=solved.getTransform('Torso'),hits=[],hard=[];
    const ms=moving.map(v=>placed(v,solved.getTransform(v.name)));
    const fs=fixed.map(v=>placed(v,root));
    for(let i=0;i<ms.length;i++) {
      for(let j=i+1;j<ms.length;j++) {const v=overlap(ms[i],ms[j]);if(v>.01)hits.push({a:ms[i].name,b:ms[j].name,mm3:+v.toFixed(2)});}
      for(const f of fs) {const v=overlap(ms[i],f);if(v>.01)hits.push({a:ms[i].name,b:f.name,mm3:+v.toFixed(2)});}
    }
    const cs=cases.map(v=>placed(v,solved.getTransform(v.parent)));
    for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++)if(cs[i].parent!==cs[j].parent) {
      const v=overlap(cs[i],cs[j]);if(v>.01)hard.push({a:cs[i].name,b:cs[j].name,mm3:+v.toFixed(2)});
    }
    const result={hits,hard};cache.set(key,result);return result;
  }
  const names=Object.keys(poses);
  return {scan,poseNames:names,named:name=>scan(poses[name]||stand)};
}
return {inspectMobility};
