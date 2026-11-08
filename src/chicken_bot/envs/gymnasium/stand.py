import mujoco
import numpy as np
from gymnasium import utils
from gymnasium.envs.mujoco import MujocoEnv
from gymnasium.spaces import Box
from chicken_bot.robot import SCENE
from chicken_bot.poses import set_standing_pose

# Trying to implement a custom mujoco environment here for Gymnasium:


class NuggetStandEnv(MujocoEnv, utils.EzPickle):
    metadata = {
        "render_modes": [
            "human",
            "rgb_array",
            "depth_array",
        ],
        "render_fps": 100,
    }

    def __init__(self, episode_len=500, **kwargs):
        utils.EzPickle.__init__(self, episode_len=episode_len, **kwargs)
        # Free root: xyz + quaternion; eight leg joints.
        # Omit world x/y: height (1) + orientation (4) + joints (8)
        # + root linear/angular velocities (6) + joint velocities (8).
        dim_obs = 27
        observation_space = Box(low=-np.inf, high=np.inf, shape=(dim_obs,), dtype=np.float64)
        # Free camera: pulled back, looking from the front and slightly to one side.
        kwargs.setdefault("default_camera_config", {
            "distance": 0.65,  # metres
            "azimuth": 235.0,  # degrees around the robot; front is -Y
            "elevation": -15.0,
            "lookat": np.array([0.0, -0.015, 0.10]),
        })
        # load your MJCF model with env and choose frames count between actions
        MujocoEnv.__init__(
            self,
            str(SCENE),
            5,
            observation_space=observation_space,
            **kwargs
        )
        self.step_number = 0
        self.episode_len = episode_len
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
        self.do_simulation(a, self.frame_skip)
        # Refresh position-dependent quantities after the final integration step.
        mujoco.mj_forward(self.model, self.data)
        self.step_number += 1
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
        body_contacts = [name for name in nonfoot_contacts
                         if self.model.geom(name).bodyid[0] == self.torso_id]
        reason = ("body_floor_contact" if body_contacts else
                  "low_com" if height < cfg["fall_height_m"] else
                  "excessive_tilt" if tilt > cfg["fall_tilt_rad"] else None)
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
        return obs, float(sum(terms.values())), bool(terminated), self.step_number >= self.episode_len, info



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
        return self._get_obs()


    def _get_obs(self):
        # qpos: [root xyz, root quaternion (wxyz), eight joint angles].
        # qvel: [root linear velocity, root angular velocity, eight joint speeds].
        # Exclude horizontal position so standing works anywhere on the floor.
        return np.concatenate((self.data.qpos[2:], self.data.qvel)).copy()
