"""C v12 physics lab. Run with: .venv/bin/python run_lab.py

Default: floating robot, gravity, coarse floor contact and servo pose targets.
--bench preserves the fixed-torso joint explorer. F6 toggles direct POSE mode.
There is no balance or self-righting controller, or robot self-contact yet.
"""
from __future__ import annotations

import argparse
from queue import SimpleQueue
import time

import mujoco
import mujoco.viewer
import numpy as np

from nugget.poses import POSES, set_standing_pose
from nugget.robot import BENCH, JOINTS, SCENE


def robot_com(model, data):
    """Mass-weighted COM of the whole torso subtree, in world metres."""
    return data.subtree_com[model.body("Torso").id].copy()


def draw_com(viewer, position, visible):
    """Viewer-only markers; these never add mass or participate in contact."""
    scene = viewer.user_scn
    if scene is None:
        return
    scene.ngeom = 0
    if not visible:
        return
    floor = np.array([position[0], position[1], 0.001])
    identity = np.eye(3).ravel()
    for point, radius in ((position, 0.004), (floor, 0.003)):
        geom = scene.geoms[scene.ngeom]
        mujoco.mjv_initGeom(geom, mujoco.mjtGeom.mjGEOM_SPHERE,
                           np.full(3, radius), point, identity,
                           np.array([1.0, 0.8, 0.05, 1.0], dtype=np.float32))
        scene.ngeom += 1
    geom = scene.geoms[scene.ngeom]
    mujoco.mjv_initGeom(geom, mujoco.mjtGeom.mjGEOM_CAPSULE,
                       np.zeros(3), np.zeros(3), identity,
                       np.array([1.0, 0.8, 0.05, 0.65], dtype=np.float32))
    mujoco.mjv_connector(geom, mujoco.mjtGeom.mjGEOM_CAPSULE, 0.0006, floor, position)
    scene.ngeom += 1


def apply_pose(model, data, name: str, *, place_joints: bool = False):
    """Targets are degrees in poses.py; MuJoCo's runtime angles are radians."""
    values = np.deg2rad(POSES[name])
    for joint, value in zip(JOINTS, values, strict=True):
        data.ctrl[model.actuator(joint).id] = value
        if place_joints:
            data.qpos[model.joint(joint).qposadr[0]] = value
    if place_joints:
        data.qvel[:] = 0
        mujoco.mj_forward(model, data)


def reset_to_stand(model, data, drop_height=0.0):
    """Same reference stance as training, without random reset perturbations."""
    mujoco.mj_resetData(model, data)
    set_standing_pose(model, data)
    if model.nq > len(JOINTS):
        data.qpos[2] += drop_height
        mujoco.mj_forward(model, data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bench", action="store_true", help="use the original pinned-torso model without contacts")
    parser.add_argument("--servo", action=argparse.BooleanOptionalAction, default=None, help="servo physics (default on, off for --bench)")
    parser.add_argument("--gravity", action=argparse.BooleanOptionalAction, default=None, help="gravity (default on, off for --bench)")
    parser.add_argument("--pose", action="store_true", help="start in direct joint-placement mode without stepping physics")
    parser.add_argument("--drop-height", type=float, default=None, help="start this many metres above home (default 0: grounded standing pose)")
    parser.add_argument("--seconds", type=float, help="close after this many wall seconds (optional smoke test)")
    args = parser.parse_args()
    scene_path = BENCH if args.bench else SCENE
    if not scene_path.exists():
        raise SystemExit("Missing generated model. Run: uv run python scripts/build_model.py")
    model = mujoco.MjModel.from_xml_path(str(scene_path))
    data = mujoco.MjData(model)
    drop_height = args.drop_height if args.drop_height is not None else 0.0
    if drop_height < 0 or not np.isfinite(drop_height):
        parser.error("--drop-height must be a finite nonnegative number")
    if args.bench and drop_height:
        parser.error("--drop-height requires the floating model; omit --bench")

    def reset():
        reset_to_stand(model, data, drop_height)

    reset()
    addresses = [int(model.joint(name).qposadr[0]) for name in JOINTS]
    actuator_ids = [model.actuator(name).id for name in JOINTS]
    events = SimpleQueue()
    servo = (not args.bench if args.servo is None else args.servo) and not args.pose
    gravity = not args.bench if args.gravity is None else args.gravity
    paused, show_com = False, True
    setup = "Torso pinned | contacts OFF" if args.bench else "FREE torso | floor contact ON | self-contact OFF"
    model.opt.gravity[:] = (0, 0, -9.81 if gravity else 0)

    def announce():
        mode = "SERVO: integrates forces" if servo else "POSE: places joints directly"
        print(f"\n{mode} | {'paused' if paused else 'running'} | gravity {'on' if gravity else 'off'}", flush=True)
        print(setup, flush=True)

    print("\nNUGGET C v12 — MUJOCO PHYSICS LAB", flush=True)
    print("Open the right-hand Control section and move its sliders (radians).", flush=True)
    print("6 Stand   7 Left step   8 Deep tuck   9 Wide", flush=True)
    print("F6 Pose/Servo   Space Pause   F8 Reset   F7 Gravity   J Joint axes", flush=True)
    print("F9 Whole-robot COM   F10 Collision proxies   M Native subtree COMs   C Contacts   F Contact forces", flush=True)
    print("Mac: hold Fn if the function keys control brightness/media.", flush=True)
    print("Mouse: left-drag orbit, right-drag pan, scroll zoom. Close the window to stop.", flush=True)
    print("Servo gains/inertias/torque cap are teaching assumptions, not a calibrated XL330 model.", flush=True)
    print("Starts in the validated standing pose; no active balance controller. Yellow dot = estimated COM; line = floor projection.", flush=True)
    announce()

    with mujoco.viewer.launch_passive(
        model, data, key_callback=events.put, show_left_ui=False, show_right_ui=True
    ) as viewer:
        with viewer.lock():
            viewer.cam.lookat[:] = [0, -0.015, 0.09]
            viewer.cam.distance = 0.40
            viewer.cam.azimuth = -60
            viewer.cam.elevation = -15
            viewer.opt.geomgroup[3] = 0  # collision proxies hidden initially
        started = time.perf_counter()
        frame_seconds = 8 * model.opt.timestep
        while viewer.is_running():
            frame_start = time.perf_counter()
            if args.seconds is not None and frame_start - started >= args.seconds:
                break
            viewer.sync()  # Receive the native Control slider values.
            with viewer.lock():
                while not events.empty():
                    key = events.get()
                    # 0–5 toggle geom visibility in MuJoCo; M/G/R also have
                    # native rendering actions. Keep our controls separate.
                    if key in (54, 55, 56, 57):
                        name = tuple(POSES)[key - 54]
                        apply_pose(model, data, name, place_joints=not servo)
                        print(f"Pose target: {name} (degrees: {POSES[name]})", flush=True)
                    elif key == 295:  # GLFW F6
                        servo = not servo
                        data.qvel[:] = 0
                        announce()
                    elif key == 32:
                        paused = not paused
                        announce()
                    elif key == 297:  # GLFW F8
                        reset()
                        viewer.opt.geomgroup[0] = 1
                        viewer.opt.geomgroup[2] = 1
                        print("Reset to stand", flush=True)
                    elif key == 296:  # GLFW F7
                        gravity = not gravity
                        announce()
                    elif key == 298:  # GLFW F9
                        show_com = not show_com
                    elif key == 299:  # GLFW F10
                        viewer.opt.geomgroup[3] = not viewer.opt.geomgroup[3]
                    # J already toggles axes in the native viewer.
                model.opt.gravity[:] = (0, 0, -9.81 if gravity else 0)
                data.ctrl[:] = np.clip(data.ctrl, model.actuator_ctrlrange[:, 0], model.actuator_ctrlrange[:, 1])
                if not paused:
                    if servo:
                        for _ in range(8):
                            mujoco.mj_step(model, data)
                        mujoco.mj_forward(model, data)  # current contact/COM display
                    else:
                        data.qpos[addresses] = data.ctrl[actuator_ids]
                        data.qvel[:] = 0
                        mujoco.mj_forward(model, data)
                com = robot_com(model, data)
                draw_com(viewer, com, show_com)
            viewer.sync()
            gravity_status = "ON (-9.81 m/s²)" if gravity else "OFF"
            if gravity and not servo:
                gravity_status += " — switch to SERVO for motion"
            viewer.set_texts((
                mujoco.mjtFontScale.mjFONTSCALE_100,
                mujoco.mjtGridPos.mjGRID_TOPLEFT,
                "Mode\nGravity\nSetup\nCOM (mm)\nContacts\nPoses\nControls\nInspect",
                f"{'SERVO' if servo else 'POSE'} | {'PAUSED' if paused else 'RUNNING'}\n"
                f"{gravity_status}\n{setup}\n"
                f"x {com[0]*1000:.1f} | y {com[1]*1000:.1f} | z {com[2]*1000:.1f}\n"
                f"{data.ncon} candidate points | masses estimated\n"
                "6 stand | 7 step | 8 tuck | 9 wide\n"
                "F6 mode | F7 gravity | F8 reset | Space pause\n"
                "F9 COM | F10 colliders | J joints | C contacts | F forces",
            ))
            time.sleep(max(0, frame_seconds - (time.perf_counter() - frame_start)))


if __name__ == "__main__":
    main()
