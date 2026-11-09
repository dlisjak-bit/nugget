"""Existing headless model checks, discoverable with the standard-library runner."""
import json
import unittest

import mujoco
import numpy as np

from nugget.robot import JOINTS, MODEL_DIR
from nugget.viewer import apply_pose, draw_com, robot_com


class ModelChecks(unittest.TestCase):
    def test_import_controller_contacts_and_com(self):
        folder = MODEL_DIR
        model = mujoco.MjModel.from_xml_path(str(folder / "bench.xml"))
        data = mujoco.MjData(model)
        reference = json.loads((folder / "provenance.json").read_text())
        apply_pose(model, data, "stand", place_joints=True)
        assert model.nq == model.nv == model.nu == 8
        assert np.isclose(model.body_mass.sum(), reference["mass_kg"], atol=1e-9)

        # A misplaced hinge, an incorrect reference angle, a wrong unit or an up-axis
        # conversion error must fail this comparison against every source CAD part.
        max_error = 0.0
        for name, expected in reference["cad_home_bounds_m"].items():
            geom = model.geom(name).id
            mesh = model.geom_dataid[geom]
            start, count = model.mesh_vertadr[mesh], model.mesh_vertnum[mesh]
            vertices = model.mesh_vert[start:start+count].astype(float)
            world = vertices @ data.geom_xmat[geom].reshape(3, 3).T + data.geom_xpos[geom]
            bounds = np.array([world.min(axis=0), world.max(axis=0)])
            error = float(np.abs(bounds - expected).max())
            max_error = max(max_error, error)
            assert error < 2e-6, (name, error)
        for name in ("left_sole", "right_sole"):
            assert abs(data.site(name).xpos[2]) < 1e-8

        # Actually move a leg through the controller; merely loading a model is not a
        # useful check of actuation. Root remains fixed and contact remains disabled.
        apply_pose(model, data, "left_step")
        peak_torque = 0.0
        for _ in range(1000):
            mujoco.mj_step(model, data)
            peak_torque = max(peak_torque, float(np.abs(data.actuator_force).max()))
        assert np.isfinite(data.qpos).all() and np.isfinite(data.qvel).all()
        actual = np.array([data.qpos[model.joint(n).qposadr[0]] for n in JOINTS])
        assert np.abs(actual - data.ctrl).max() < 0.02
        assert peak_torque <= 0.120001
        print(f"PASS: {len(reference['cad_home_bounds_m'])} CAD visuals match home within {max_error*1e6:.3f} micrometres")
        print(f"PASS: 8 joints, 8 controls, {model.body_mass.sum():.3f} kg estimated; both soles on z=0")
        print(f"PASS: bench servo tracks left-step target; peak capped torque {peak_torque:.3f} N m")

        floating = mujoco.MjModel.from_xml_path(str(folder / "scene.xml"))
        assert (floating.nq, floating.nv, floating.nu) == (15, 14, 8)
        assert floating.joint("root").type == mujoco.mjtJoint.mjJNT_FREE
        assert np.isclose(floating.body_mass.sum(), model.body_mass.sum())

        def reset_drop(height=0.05):
            trial = mujoco.MjData(floating)
            trial.qpos[2] += height
            apply_pose(floating, trial, "stand", place_joints=True)
            return trial

        # An actual ballistic interval catches pinned bases, disabled gravity, a wrong
        # vertical axis, and stale freejoint/keyframe coordinates.
        trial = reset_drop()
        start_height = trial.qpos[2]
        assert trial.ncon == 0
        for _ in range(20):
            mujoco.mj_step(floating, trial)
        assert trial.ncon == 0
        assert abs(trial.qvel[2] - (-9.81 * trial.time)) < 1e-5
        expected_drop = 0.5 * 9.81 * trial.time**2
        assert abs(start_height - trial.qpos[2] - expected_drop) < 0.0005
        print(f"PASS: floating base falls ballistically under gravity ({trial.time:.3f} s before contact)")

        # Drop the robot from three orientations and run for five simulated seconds.
        # These verify external contact stability, not the accuracy of the envelopes.
        floor_id = floating.geom("floor").id
        for angle in (0, 60, -60):
            trial = reset_drop(0.10 if angle else 0.05)
            half_angle = np.deg2rad(angle) / 2
            trial.qpos[3:7] = (np.cos(half_angle), np.sin(half_angle), 0, 0)
            mujoco.mj_forward(floating, trial)
            peak_contacts = 0
            peak_torque = 0.0
            for _ in range(2500):
                mujoco.mj_step(floating, trial)
                peak_contacts = max(peak_contacts, trial.ncon)
                peak_torque = max(peak_torque, float(np.abs(trial.actuator_force).max()))
                assert np.isfinite(trial.qpos).all() and np.isfinite(trial.qvel).all()
                assert trial.qpos[2] > -0.01  # torso must not fall through the ground
                for contact in trial.contact:
                    assert floor_id in (contact.geom1, contact.geom2)
            mujoco.mj_forward(floating, trial)
            assert peak_contacts > 0 and trial.ncon > 0
            assert np.min(trial.contact.dist) > -0.002  # soft solver tolerance at rest
            assert np.abs(trial.qvel).max() < 0.05
            assert peak_torque <= 0.120001
            assert not trial.warning.number.any(), trial.warning.number
            weighted = (floating.body_mass[:, None] * trial.xipos).sum(axis=0) / floating.body_mass.sum()
            assert np.allclose(robot_com(floating, trial), weighted, atol=1e-10)
            print(f"PASS: {angle:+d} degree drop reaches floor, settles, respects torque cap; no solver warnings")

        # Native marker geometry can be checked without opening a graphics window.
        class Display:
            user_scn = mujoco.MjvScene(floating, maxgeom=10)

        display = Display()
        draw_com(display, robot_com(floating, trial), True)
        assert display.user_scn.ngeom == 3
        assert np.allclose(display.user_scn.geoms[0].pos, robot_com(floating, trial))
        draw_com(display, robot_com(floating, trial), False)
        assert display.user_scn.ngeom == 0
        print("PASS: whole-robot COM equals mass-weighted body COMs; marker can be toggled")
        print("Scope: coarse floor contact only. Self-contact, balance, recovery and calibrated actuator/material behavior remain unvalidated.")


if __name__ == "__main__":
    unittest.main()
