"""Play a REINFORCE checkpoint or zero offsets in the training environment."""
import argparse
from contextlib import nullcontext
from queue import SimpleQueue
import time

import mujoco
import mujoco.viewer
import numpy as np
import torch

from nugget.envs.gymnasium.stand import NuggetStandEnv
from nugget.evaluation.joint_plots import JointPlots
from nugget.training.reinforce import Policy_Network


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--policy", required=True, help="checkpoint .pt path, or 'zero' for zero offsets")
    parser.add_argument("--sample", action="store_true", help="sample policy noise instead of using its mean")
    parser.add_argument("--no-reset-noise", action="store_true", help="start at the exact standing pose")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--episode-len", type=int, help="override checkpoint duration (default 500 steps)")
    parser.add_argument("--headless", action="store_true", help="evaluate one episode without a window")
    parser.add_argument("--seconds", type=float, help="close after this many wall seconds")
    args = parser.parse_args()
    if args.sample and args.policy == "zero":
        parser.error("--sample requires a checkpoint")
    checkpoint = None if args.policy == "zero" else torch.load(
        args.policy, map_location="cpu", weights_only=True
    )
    episode_len = args.episode_len if args.episode_len is not None else (
        checkpoint.get("episode_len", 500) if checkpoint else 500
    )
    if episode_len < 1:
        parser.error("--episode-len must be positive")
    torch.manual_seed(args.seed)
    with NuggetStandEnv(episode_len=episode_len) as env:
        policy = None
        if checkpoint:
            policy = Policy_Network(env.observation_space.shape[0], env.action_space.shape[0])
            policy.load_state_dict(checkpoint["policy"])
            policy.eval()
            env.reward_config.update(checkpoint.get("reward_config", {}))

        def reset():
            obs, _ = env.reset(seed=args.seed)
            if args.no_reset_noise:
                env.set_state(env.init_qpos.copy(), env.init_qvel.copy())
                obs = env._get_obs()
            return obs

        obs = reset()
        plots = None if args.headless else JointPlots(env.model, env.dt)
        if plots:
            plots.reset(env.data)
        show_plots = True
        events = SimpleQueue()
        context = nullcontext(None) if args.headless else mujoco.viewer.launch_passive(
            env.model, env.data, key_callback=events.put, show_left_ui=False, show_right_ui=False
        )
        print(f"Policy: {args.policy} | {'sampled' if args.sample else 'mean / zero offsets'} | "
              f"reset noise: {not args.no_reset_noise}", flush=True)
        with context as viewer, torch.inference_mode():
            if viewer:
                with viewer.lock():
                    viewer.cam.lookat[:] = [0, -0.015, 0.10]
                    viewer.cam.distance = 0.65
                    viewer.cam.azimuth = 235
                    viewer.cam.elevation = -15
                    # Frame the robot in the left pane beside the joint plots.
                    azimuth = np.deg2rad(viewer.cam.azimuth)
                    aspect = viewer.viewport.width / max(1, viewer.viewport.height)
                    shift = viewer.cam.distance * np.tan(np.deg2rad(env.model.vis.global_.fovy / 2)) * aspect * 0.46
                    viewer.cam.lookat[:2] += shift * np.array([np.sin(azimuth), -np.cos(azimuth)])
                print("Space: pause | R: repeat same reset | P: joint plots | Close window: quit. Pauses at episode end.", flush=True)
            paused = done = False
            total = 0.0
            started = time.perf_counter()
            while viewer is None or viewer.is_running():
                tick = time.perf_counter()
                if args.seconds is not None and tick - started >= args.seconds:
                    break
                while not events.empty():
                    key = events.get()
                    if key == ord("R"):
                        obs = reset()
                        if plots:
                            plots.reset(env.data)
                        total, paused, done = 0.0, False, False
                    elif key == 32:
                        paused = not paused
                    elif key == ord("P"):
                        show_plots = not show_plots
                        if not show_plots:
                            viewer.clear_figures()
                if not paused and not done:
                    action = np.zeros(env.model.nu)
                    if policy is not None:
                        mean, std = policy(torch.as_tensor(obs, dtype=torch.float32))
                        action = (mean + std * torch.randn_like(mean) if args.sample else mean).numpy()
                    action = np.clip(action, env.action_space.low, env.action_space.high)
                    obs, reward, terminated, truncated, info = env.step(action)
                    if plots:
                        plots.append(env.data)
                    total += reward
                    done = terminated or truncated
                    if done:
                        print(f"Steps: {env.step_number} | return: {total:.2f} | "
                              f"end: {info['termination_reason'] or 'time_limit'} | "
                              f"COM: {info['com_height_m']:.4f} m | tilt: {np.rad2deg(info['tilt_rad']):.1f} deg",
                              flush=True)
                        if viewer is None:
                            break
                if viewer:
                    if show_plots:
                        plots.show(viewer)
                    viewer.sync()
                    time.sleep(max(0, env.dt - (time.perf_counter() - tick)))


if __name__ == "__main__":
    main()
