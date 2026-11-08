# C — service openings and mobility review

This checkpoint develops C from v10. The old v10 animations were inherited from the motor-free rig; v10 only accepted a restricted standing-pose check. It did not establish that the poses or motor housings were compatible.

## Motor access control

Motor access openings is a 0–100% slider, default 100. It changes original printed geometry, not vendor motor meshes:
- Central side windows in the thigh and shin expose motor cases.
- Smaller ports near the cable ends provide inspection and plug access.
- Openings in the hip covers expose the concealed pitch motor.
- Two upper body ports provide access above the fixed roll motors.

The windows avoid the nominal case mounting-hole locations and leave the drive-axis holes. They are inspection/tool/plug openings, not a demonstrated full motor-removal path. Mount screw engagement, driver clearance, wiring bends and complete disassembly still need fit coupons and hardware checks. Movement relief is mandatory and remains when the service slider is zero.

## Mechanical changes

Hip pitch remains concealed and direct drive. Its motor case is clocked horizontally at 90 degrees rather than pointing upward. The pitch axes are 106 mm apart and each is offset 41 mm laterally from its roll axis; the fixed roll axes remain 24 mm apart. Body dimensions remain 118 by 155 by 88 mm. The pelvis bridge is higher, clear of the moving cradles.

The printed fork stems have an 8 mm setback near their ends, a 0.6 mm inward trim of the outer fork profile, and their joining ribs are on the opposite side from the original C. This lets the folded thigh and shin forks pass each other without a belt, linkage or extra actuator. The ankle motor case is clocked at 250 degrees. The original custom front retainer gets a 3.5 mm outer corner radius instead of 2 mm; its pilot positions remain unchanged. Vendor motor case/output/idler meshes are unchanged.

The shell relief is made from padded moving-body envelopes placed by the same connector frames as the displayed robot. The side cover becomes front and rear pieces on each side of the hip opening; each is a separately named solid. Wings are shorter and farther rearward to leave the hip workspace free. They remain whole parts; they are not cut by the broad body relief. Their Bezier outline is retained without the optional edge blend that produced disconnected fragments in the local mesh backend. Fastening and structural analysis remain unfinished.

## Why body holes alone were insufficient

The expanded audit of v10 found about 618 and 402 cubic millimetres of actual left/right hip motor-case intersection at its 45-degree outward-roll pose. Cutting printed covers cannot fix intersecting purchased motor cases. The old hip covers also intersected the wings even in Stand. Lifting a leg hit a side panel, and deep folding made the two printed forks intersect.

The revised case clocking and axis spacing address the motor layout. The fork setback addresses adjacent-link geometry. Shell openings then clear the remaining cosmetic obstruction. Service windows address a separate maintenance need.

## Validation scope

The model contains explicit checks for all 17 named poses (including Tall stance and Wide stance), a knee sweep sampled every 5 degrees from 0 to 150 on each leg, and individual hip-roll sweeps every 5 degrees in the standing leg configuration. The roll ranges are 45 degrees outward and 15 inward. Named-pose and roll checks include carriers, conservative motor-case boxes, custom retainers and hip covers against the torso centre, separate front/rear panels, wings, wing inlays, pelvis and fixed roll cases. Opposite legs are compared. Actual vendor case meshes are also compared against each other.

The source uses a 0.01 cubic millimetre overlap-report threshold; this is a numerical CAD test, not a manufacturing tolerance or positive running clearance. The shell cutout generator uses padded boxes over finite stand-to-pose samples. The tests do not certify every joint combination, continuous animation curves between samples, arbitrary dimensions, cables, fasteners, bearing fits, strength, cooling or impacts. Head/face/neck-to-ground contact is outside this collision test.

The interactive model is main.usda / main.forge.js. Its 36 checks cover geometry, separate cover solids, connected carriers/pelvis/hip covers, sole placement, nominal spacing/motor mass, standing packaging and wing clearance across all named poses. The expensive full study is separated into mobility-study.forge.js so the access slider remains responsive. Open it in Files and choose Show in viewport to compute the report; Console contains C_POSE_AUDIT, C_KNEE_SWEEP and C_ROLL_SWEEP. Its extra verification declarations are available through Run tests.

On 8 November 2026, the full report with service openings CLOSED (0%) returned no reported contacts in all 17 named poses, all 62 sampled adjacent-knee states, and all 26 sampled individual hip-roll states. All vendor-case collision lists were empty. The closed-window result establishes that the required clearance is independent of a service window. Source windows remove material and retain the mandatory relief.

The interactive 36-check suite is checked at both 0% and 100% service access. This does not certify the other dimension sliders or every coupled configuration. The numeric full-study report is distinct from a completed full-suite Run tests status.

## Self-righting strategy

Keep the eight-actuator direct-drive architecture for now. First target recovery from the back into a crouch and then standing; assess side and front falls separately. A useful recovery design needs a reachable sequence of ground contacts, feet that can get under the body, a centre of mass that can pass into the support region, sufficient actuator torque/current/temperature margin, and survivable contact surfaces. A fixed-torso pose animation demonstrates none of those.

Next: update collision proxies and inertias for these actual parts, preserving the openings rather than closing them with whole-body convex hulls; run a free-base contact simulation with actuator limits from back, side and front initial orientations. The head, neck, wings and shell must be included as contact geometry. Then validate the result on a restrained physical prototype.

The XL330-M288 figure of 0.52 N m at 5 V is a stall specification, not an established continuous operating torque for this build: [ROBOTIS specification](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/). Pollen's [Microduck page](https://pollen-robotics.com/microduck/) demonstrates back-to-stand recovery as a useful behavior reference; it is not evidence that this different robot can do it.

No self-righting, walking, running, strength or manufacturing release is claimed.

