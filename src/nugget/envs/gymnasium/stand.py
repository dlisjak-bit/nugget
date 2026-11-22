from dataclasses import dataclass
import math

import mujoco
import numpy as np
from gymnasium import utils
from gymnasium.envs.mujoco import MujocoEnv
from gymnasium.spaces import Box

from nugget.poses import set_standing_pose
from nugget.robot import SCENE


@dataclass(frozen=True)
class Push:
    """A horizontal world-frame force. Direction is in radians from +X toward +Y."""

    start_step: int
    duration_steps: int
    magnitude_n: float
    direction_rad: float

    def active_at(self, step: int) -> bool:
        return self.start_step <= step < self.start_step + self.duration_steps

    def force(self) -> np.ndarray:
        return self.magnitude_n * np.array(
            [math.cos(self.direction_rad), math.sin(self.direction_rad), 0.0]
        )


class NuggetStandEnv(MujocoEnv, utils.EzPickle):
    """Stand in place, optionally with seeded pushes at the robot's COM."""

    metadata = {
        "render_modes": [
            "human",
            "rgb_array",
            "depth_array",
        ],
        "render_fps": 100,
    }

    def __init__(self, episode_len=500, *, pushes: bool = False, **kwargs):
        utils.EzPickle.__init__(self, episode_len=episode_len, pushes=pushes, **kwargs)
        observation_space = Box(-np.inf, np.inf, shape=(27,), dtype=np.float64)
        kwargs.setdefault("default_camera_config", {
            "distance": 0.65,  # metres
            "azimuth": 235.0,  # degrees around the robot; front is -Y
            "elevation": -15.0,
            "lookat": np.array([0.0, -0.015, 0.10]),
        })
        super().__init__(str(SCENE), frame_skip=5, observation_space=observation_space, **kwargs)
        self.step_number = 0
        self.episode_len = episode_len
        self.pushes = pushes
        self.push_schedule: tuple[Push, ...] = ()
        self.torso_id = self.model.body("Torso").id
        self.floor_id = self.model.geom("floor").id
        # Only the split-toe sole boxes are allowed to support standing.
        self.sole_ids = {
            self.model.geom(f"collision_{side}_foot_toe_{toe}").id
            for side in ("l", "r") for toe in ("a", "b")
        }
        # Use the validated shared stance, grounded as in find_balance.
        reference = mujoco.MjData(self.model)
        set_standing_pose(self.model, reference)
        self.init_qpos = reference.qpos.copy()
        self.init_qvel = reference.qvel.copy()
        self.standing_ctrl = reference.ctrl.copy()
        # Actions are joint-angle offsets (radians) from the stable stance.
        self.action_space = Box(
            (self.action_space.low - self.standing_ctrl).astype(np.float32),
            (self.action_space.high - self.standing_ctrl).astype(np.float32),
            dtype=np.float32,
        )
        self.reward_config = {
            "target_height_m": float(reference.subtree_com[self.torso_id, 2]),
            "height_scale_m": 0.010,
            "tilt_scale_rad": float(np.deg2rad(20)),
            "speed_scale_m_s": 0.1,
            "height_weight": 1.0,
            "upright_weight": 1.0,
            "velocity_weight": 0.1,
            "fall_penalty": 20.0,
            "fall_height_m": 0.055,
            "fall_tilt_rad": float(np.deg2rad(60)),
        }
        self._com_jac = np.zeros((3, self.model.nv))

    def step(self, a):
        command = self.standing_ctrl + a
        push_force = None
        if self.pushes:
            push_force = self._step_with_push(command)
        else:
            self.do_simulation(command, self.frame_skip)
        # Refresh position-dependent quantities after the final integration step.
        mujoco.mj_forward(self.model, self.data)
        self.step_number += 1
        obs, reward, terminated, truncated, info = self._step_result(self.step_number)
        if self.pushes:
            info["push_force_world_n"] = push_force
        return obs, reward, terminated, truncated, info

    def _step_result(self, step_number: int):
        """Score the current state for the given episode step."""
        obs = self._get_obs()
        if not np.isfinite(obs).all():
            return obs, 0.0, True, False, {"termination_reason": "nonfinite"}

        cfg = self.reward_config
        height = float(self.data.subtree_com[self.torso_id, 2])
        up_z = self.data.xmat[self.torso_id].reshape(3, 3)[2, 2]
        tilt = float(np.arccos(np.clip(up_z, -1.0, 1.0)))
        # Jacobian includes leg motion: root velocity alone is not COM velocity.
        mujoco.mj_jacSubtreeCom(self.model, self.data, self._com_jac, self.torso_id)
        velocity = self._com_jac @ self.data.qvel
        speed = float(np.linalg.norm(velocity[:2]))
        raw = {
            "height": float(np.exp(-((height - cfg["target_height_m"]) / cfg["height_scale_m"]) ** 2)),
            "upright": float(np.exp(-(tilt / cfg["tilt_scale_rad"]) ** 2)),
            "velocity": -(speed / cfg["speed_scale_m_s"]) ** 2,
        }
        terms = {name: value * cfg[f"{name}_weight"] for name, value in raw.items()}
        nonfoot_contacts = self._nonfoot_floor_contacts()
        # Leg proxy boxes currently intersect the floor in the CAD home pose.
        # Log those, but only trust torso-attached contacts for fall termination.
        if any(self.model.geom(name).bodyid[0] == self.torso_id for name in nonfoot_contacts):
            reason = "body_floor_contact"
        elif height < cfg["fall_height_m"]:
            reason = "low_com"
        elif tilt > cfg["fall_tilt_rad"]:
            reason = "excessive_tilt"
        else:
            reason = None
        terminated = reason is not None
        # A one-time penalty on the terminating physical-fall step only.
        raw["fall"] = -float(terminated)
        terms["fall"] = raw["fall"] * cfg["fall_penalty"]
        info = {
            "nonfoot_floor_contact": bool(nonfoot_contacts),
            "nonfoot_floor_geoms": nonfoot_contacts,
            "termination_reason": reason,
            "reward_raw": raw,
            "reward_terms": terms,
            "com_height_m": height,
            "tilt_rad": tilt,
            "com_speed_xy_m_s": speed,
        }
        return obs, float(sum(terms.values())), terminated, step_number >= self.episode_len, info

    def _sample_push_schedule(self) -> tuple[Push, ...]:
        """After a quiet first second, sample one 100 ms push per second."""
        interval = round(1.0 / self.dt)
        duration = max(1, round(0.1 / self.dt))
        schedule = []
        for window_start in range(interval, self.episode_len - duration + 1, interval):
            window_end = min(window_start + interval, self.episode_len)
            schedule.append(Push(
                start_step=int(self.np_random.integers(window_start, window_end - duration + 1)),
                duration_steps=duration,
                magnitude_n=float(self.np_random.uniform(0.5, 2.0)),
                direction_rad=float(self.np_random.uniform(0, math.tau)),
            ))
        return tuple(schedule)

    def push_wrench(self, schedule: tuple[Push, ...], step_number: int) -> np.ndarray | None:
        """Return the force and torque to apply at the torso COM."""
        push = next((p for p in schedule if p.active_at(step_number)), None)
        if push is None:
            return None

        force = push.force()
        # MuJoCo applies xfrc at the torso COM. Shift that wrench to the whole-robot COM.
        offset = self.data.subtree_com[self.torso_id] - self.data.xipos[self.torso_id]
        return np.concatenate((force, np.cross(offset, force)))

    def _step_with_push(self, command: np.ndarray) -> np.ndarray | None:
        wrench = self.push_wrench(self.push_schedule, self.step_number)
        if wrench is None:
            self.do_simulation(command, self.frame_skip)
            return None

        applied = self.data.xfrc_applied[self.torso_id]
        previous = applied.copy()
        applied[:] += wrench
        try:
            self.do_simulation(command, self.frame_skip)
        finally:
            applied[:] = previous
        return wrench[:3]

    def _nonfoot_floor_contacts(self):
        """Ignore separated proximity contacts; allow only actual sole contact."""
        names = set()
        for contact in self.data.contact:
            if contact.dist > 0:
                continue
            pair = (int(contact.geom1), int(contact.geom2))
            if self.floor_id not in pair:
                continue
            other = pair[1] if pair[0] == self.floor_id else pair[0]
            if other not in self.sole_ids:
                names.add(mujoco.mj_id2name(self.model, mujoco.mjtObj.mjOBJ_GEOM, other))
        return sorted(names)

    def reset_model(self):
        self.step_number = 0

        qpos = self.init_qpos.copy()
        # Small joint perturbations; keep the grounded base and quaternion fixed.
        qpos[7:] += self.np_random.uniform(-0.01, 0.01, self.model.nq - 7)
        qvel = self.init_qvel + self.np_random.uniform(
            size=self.model.nv, low=-0.01, high=0.01
        )
        self.set_state(qpos, qvel)
        self.data.ctrl[:] = self.standing_ctrl
        self.push_schedule = self._sample_push_schedule() if self.pushes else ()
        return self._get_obs()

    def _get_obs(self):
        # qpos: [root xyz, root quaternion (wxyz), eight joint angles].
        # qvel: [root linear velocity, root angular velocity, eight joint speeds].
        # Exclude horizontal position so standing works anywhere on the floor.
        return np.concatenate((self.data.qpos[2:], self.data.qvel))
