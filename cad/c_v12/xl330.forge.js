// XL330-M288 reference, shaft +X, case depth midpoint X=0.
// Manufacturer STEP geometry is split into case, moving output, and rear idler.
const xlCaseMesh=Import.mesh('./vendor/xl330-case.stl');
const xlOutputMesh=Import.mesh('./vendor/xl330-output.stl');
const xlIdlerMesh=Import.mesh('./vendor/xl330-idler.stl');
function xlAlongX(shape) { return shape.rotateY(90).rotateX(90); }
function xlRing(x,outer,inner,thickness) {
  return difference(cylinder(thickness,outer),cylinder(thickness+2,inner).translate(0,0,-1)).rotateY(90).translate(x,0,0);
}
function xlHoles(x,depth,positions,radius=1.1) {
  return positions.map(([y,z])=>cylinder(depth,radius).rotateY(90).translate(x,y,z));
}
const xlCasePattern=[[-8,7.5],[8,7.5],[-8,-22.5],[8,-22.5]];
const xlOutputPattern=[[6,0],[0,6],[-6,0],[0,-6]];
function xlRetainer() {
  const rim=difference2d(roundedRect(22,36,3.5),roundedRect(15,28,1));
  const plate=xlAlongX(rim.extrude(1.8)).translate(11.5,0,-7.5);
  return difference(plate,cylinder(5,8.5).rotateY(90).translate(10.5,0,0),...xlHoles(10.5,5,xlCasePattern)).color('#c9c4b9')
    .withAssemblyStep({direction:'x',title:'Fit the removable XL330 front retainer',note:'Use M2 tapping screws with engagement checked against the factory drawing.'});
}
function xlCaseCradle() {
  const rim=difference2d(roundedRect(22,36,2),roundedRect(15,28,1));
  const raw=xlAlongX(rim.extrude(2)).translate(-13.5,0,-7.5);
  const rearRelief=cylinder(5,8.5).rotateY(90).translate(-14.5,0,0);
  return difference(raw,rearRelief,...xlHoles(-14.5,5,xlCasePattern));
}
function xlReference() {
  return {
    caseShape:xlCaseMesh.color('#29343f').withAssemblyStep({direction:'x',title:'Slide the XL330 case into its open carrier'}),
    output:xlOutputMesh.color('#56616b').withAssemblyStep({direction:'x',title:'Attach the driven link to the factory output disk'}),
    idler:xlIdlerMesh.color('#72818b').withAssemblyStep({direction:[-1,0,0],title:'Fit and retain the passive rear idler'}),
    caseEnvelope:box(23,20,34).translate(0,0,-24.5),
    fitEnvelope:box(23.8,20.8,34.8).translate(0,0,-24.9),
    plugEnvelope:box(15,30,14).translate(-1,0,-15),
    cradle:xlCaseCradle(),retainer:xlRetainer(),
    caseMassKg:.0174,outputMassKg:.0006,idlerMassKg:.0005,
    casePattern:xlCasePattern,outputPattern:xlOutputPattern,
  };
}
function xlOutputCheek(x,thickness=2.4) {
  const disk=xlRing(x,9.5,3.1,thickness);
  return difference(disk,...xlHoles(x-1,thickness+2,xlOutputPattern,1.1));
}
return {reference:xlReference,alongX:xlAlongX,ring:xlRing,holes:xlHoles,outputCheek:xlOutputCheek};
