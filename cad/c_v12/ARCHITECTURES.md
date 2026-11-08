# A / B / C architecture comparison

These are design concepts, not manufacturing releases. They use the same eight XL330 actuator references and the same body/head design. The stock STEP is retained locally; lightweight mesh versions are used in ForgeCAD for viewing. Mesh simplification keeps the measured case bounds, but fine features are not manufacturing references.

All three move hip pitch into a moving hip-roll cradle. Its motor case follows hip roll; its output drives the thigh. The two hip axes are at the same nominal height with a lateral offset. This changes the mechanism and mass distribution rather than merely covering a thigh-mounted motor. The body width is 118 mm, hip-pitch spacing 96 mm, and roll-axis-to-pitch-axis lateral offset 30 mm. Their packaging needs interference and cable checks through the complete motion.

## A — compact direct drive

One knee motor is carried by each thigh, with its output at the knee hinge. Rear carrier plates remain visible for inspection. This is the mechanically simpler baseline and makes the case and joint interfaces easy to see. No belt is added.

## B — remote knee hinge

The knee motor is moved above and behind the knee in a larger curved haunch. Two equal pulley envelopes and a closed belt loop connect it to a smaller supported knee hinge. The source pulley follows the knee coordinate 1:1 for kinematic display. This is not a physical belt simulation.

The packaging assumption is two 28-tooth pulleys at 2 mm pitch, with 22 mm centre spacing, giving a nominal 100 mm pitch-length loop. The pulley radius is 8.91 mm. At 0.52 N m the difference in belt-span force is about 58 N, before dynamic factors. No belt capacity, tooth form, pretension, tension adjustment, shaft retention, bearing fit or fatigue approval is established. Pulley envelopes have no fabrication-ready teeth. Extra mechanism masses are estimates. A selected supplier belt/pulley system must replace these envelopes before fabrication.

## C — flush direct drive

The same simple direct knee drive as A is placed inside a continuous shaped thigh housing. A curved shin housing contains the ankle actuator. Narrower hips, a wider body and concealed pitch motors reduce the exposed stacked-box appearance. There is no remote transmission or added linkage.

The housings are original concept geometry, not resized servo references. Their service splits, fasteners, bearing retention and cooling openings still need detailing. The stock output/idler references keep their own part identities and follow the appropriate links.

## Materials and mass

Eight motor assemblies contribute the specified 144 g total. For this allocation, case references carry 17.4 g and output references 0.6 g per motor; that split is an estimate, while their sum matches the catalog motor mass. Optional idlers are estimated separately. Printed components use an assumed 1240 kg/m³ solid-material density applied to their modelled volume. An explicit 120 g allowance covers unselected battery, electronics, wiring and hardware. These are planning estimates; slicer settings, actual materials, purchased hardware and measurements must replace them.

## Validation interpretation

Build checks establish geometry, connected carrier bodies, sole placement, hip spacing and a usable eight-joint tree. A standing-pose interference report is logged as `ARCHITECTURE_STAND_CONTACTS`. A passing report-availability check does not mean the list of interferences is empty. C additionally checks that the default standing report is empty. That report covers the carriers, conservative motor-case boxes and retainers against each other, the torso centre shell, pelvis and fixed roll cases. It excludes the separate side panels, wings and hip socket covers, and does not check all hardware interfaces or continuous movement. Earlier motor-free knee/hip limits and animations are retained for exploration, not certified for these layouts. The three concepts require a new motion-envelope study, especially at the hip shells, knees and ankle covers. None demonstrates balance, walking, running, jumping or self-righting.

Relevant design guidance: the [ROBOTIS motor drawing](https://www.robotis.com/service/download.php?no=1986) defines the actuator attachment; [SDP/SI belt design guidance](https://sdp-si.com/resources/beltdesignoperations.php) discusses tooth engagement and small-pulley tradeoffs. The selected belt profile and capacity remain open.

## C checkpoint — 8 November 2026

The browser local-Manifold build passes 27 authored checks, including connected carriers/pelvis, soles on the floor, 96 mm hip spacing and zero overlap in the explicitly scoped standing report. The estimated assembled mass is 543 g, including a provisional 120 g electronics/hardware allowance. This is a packaging and silhouette checkpoint. No full-range clearance, strength, motor performance, stability or manufacturing claim follows from these checks.
