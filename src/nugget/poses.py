"""Edit these joint targets in DEGREES, then restart the lab.

Order matters: left roll / hip / knee / ankle, then the right leg.
These are CAD exploration poses, not walking or recovery commands.
"""

POSES = {
    "stand":     (0, -57.5, 75, -20, 0, -57.5, 75, -20),
    "left_step": (0, -65, 80, -15, 0, -40, 80, -40),
    "deep_tuck": (0, -60, 140, -45, 0, -60, 140, -45),
    "wide":      (35, -40, 80, -40, -35, -40, 80, -40),
}


def set_standing_pose(model, data):
    """Apply shared targets and place a floating robot just above its soles."""
    import mujoco
    import numpy as np
    from nugget.robot import JOINTS

    for name, angle in zip(JOINTS, np.deg2rad(POSES["stand"])):
        data.qpos[model.joint(name).qposadr[0]] = angle
        data.ctrl[model.actuator(name).id] = angle
    mujoco.mj_forward(model, data)
    if model.nq > len(JOINTS):
        soles = [model.geom(f"collision_{side}_foot_toe_{toe}").id
                 for side in ("l", "r") for toe in ("a", "b")]
        lowest = min(data.geom_xpos[g, 2]
                     - np.abs(data.geom_xmat[g].reshape(3, 3)[2]) @ model.geom_size[g]
                     for g in soles)
        data.qpos[2] += 0.0001 - lowest
        mujoco.mj_forward(model, data)
