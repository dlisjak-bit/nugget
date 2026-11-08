# XL330 packaging pass

## Use case and scope
Integrate eight XL330-M288-T actuator references into the existing cute chicken silhouette. Keep named parts, four independently posed joints per leg and the torso/head style. Deliver a motor-backed packaging study with supported attachment interfaces and sampled clearance evidence. Manufacturing release, strength approval, cable-fatigue validation and walking control remain outside this iteration.

## Entities and boundaries
The user inspects and poses the robot. An internal pelvis carries the fixed hip-roll cases. Each roll cradle carries the hip-pitch output support. Each thigh carries two cases: hip pitch and knee. Each shin carries the ankle case. Each foot carries the ankle output support and ground contact. Actuator output disks belong to the link opposite their cases; they must move independently. Factory idlers and custom support cheeks provide an opposing support datum. Side panels and wings are separate from the structural motor carriers for motion and servicing. Fasteners, power and data cables are neighbouring purchased components; their access/route spaces must be reserved.

## Relations and constraints
Each leg is torso -> roll cradle -> thigh -> shin -> foot. Roll is about the fore/aft axis. The remaining three joints are about the transverse axis. Every hinge removes three translations and two rotations. Fixed connections remove all relative DOF. Cases are fixed to carriers, while output disks attach to the opposite link. They do not receive a second independent joint. CAD is grounded for inspection; a fixed torso is not evidence of balance. Eight motor cases contribute eight times the specified unit mass; carrier and fastener masses are separate estimates.

The case mounting face transmits reaction torque to a carrier. The output attachment transmits drive torque to the adjacent link. Side loads return through the yoke/support arrangement into the pelvis, then through a supported leg to the floor. A rear bridge must leave room for the folded shin and the moving motor corners. Printed supports must be connected solids or separately retained components, not floating rails.

## Quantitative screening
Selected motor catalog mass: 18 g, hence 144 g of actuators before carriers and electronics. At the 5 V catalog stall torque of 0.52 N m and a 6 mm output bolt-circle radius, the total tangential reaction is approximately 86.7 N. Ideal equal sharing across four output screws is 21.7 N each; real sharing and plastic pull-out are not established. A 150 g distal assembly with a 40 mm gravity lever gives 0.0589 N m in a supported fixture, excluding inertia and impact. These are screening loads, not structural acceptance or continuous torque ratings.

## Conflicts
Compact links compete with motor-corner clearance in deep flexion. Lateral motor staggering can preserve link length but increases thickness and hip spacing. Supporting both sides improves the load path but can bind if the printed seats are misaligned. Closed covers preserve the silhouette but hinder inspection and cooling. This pass keeps the mechanism accessible and records dimension changes rather than hiding overlap in a shell.

## Acceptance and limits
Use manufacturer-derived external motor geometry or explicitly identified drawing-derived references; correct shaft offset, case envelope, output disk pattern and idler separation. Preserve case/output part identity and correct carrier assignment. Check construction connectivity, motor-to-carrier fit, motor-to-motor interference, adjacent-link folding, body/panel/wing contacts and opposite-leg contact in representative states. Report the first failing angle if a requested range cannot be retained. Keep the authored animation library only where its sampled motion clears. Retain a usable local/browser build and a saved ForgeCAD version. Positive strength, complete assembly paths, cable fatigue and a validated MuJoCo twin must not be claimed from these geometric checks.
