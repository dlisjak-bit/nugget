"""Train a standing policy with REINFORCE and batched MuJoCo physics."""

from __future__ import annotations

import argparse
from collections import deque
import csv
from dataclasses import dataclass, field
from datetime import datetime
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.distributions.normal import Normal

import gymnasium as gym
import mujoco
from mujoco.batch import Batch

from nugget.envs.gymnasium.stand import NuggetStandEnv
from nugget.robot import PROJECT_ROOT, JOINTS


# Set this to a checkpoint from standing without pushes to initialize the policy
# and train with pushes enabled. None starts a fresh standing run.
PREVIOUS_WEIGHTS: Path | None = None

COMPONENT_NAMES = ("height", "upright", "velocity", "fall")
DIAGNOSTIC_NAMES = ("com_height_m", "tilt_rad", "com_speed_xy_m_s", "nonfoot_floor_contact")


@dataclass
class Rollout:
    reset_seed: int
    rewards: list[float] = field(default_factory=list)
    log_probs: list[torch.Tensor] = field(default_factory=list)
    component_rows: list[list[float]] = field(default_factory=list)
    info: dict = field(default_factory=dict)
    truncated: bool = False


class Policy_Network(nn.Module):
    """Predict joint targets as corrections around the standing pose."""

    def __init__(self, obs_space_dims: int, action_space_dims: int):
        super().__init__()
        if action_space_dims != len(JOINTS):
            raise ValueError("This policy expects Nugget's eight leg actuators.")

        self.shared_net = nn.Sequential(
            nn.Linear(obs_space_dims, 32),
            nn.Tanh(),
            nn.Linear(32, 128),
            nn.Tanh(),
            nn.Linear(128, 256),
            nn.Tanh(),
            nn.Linear(256, 128),
            nn.Tanh(),
        )
        self.policy_mean_net = nn.Sequential(nn.Linear(128, action_space_dims))

        # Zero corrections initially: the mean policy starts by holding stand.
        nn.init.zeros_(self.policy_mean_net[0].weight)
        nn.init.zeros_(self.policy_mean_net[0].bias)
        # Eight trainable noise scales, independent of the observation.
        self.log_std = nn.Parameter(
            torch.full((action_space_dims,), float(np.log(np.deg2rad(0.5))))
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Return Gaussian means and per-joint exploration scales."""
        means = torch.pi * torch.tanh(self.policy_mean_net(self.shared_net(x)))
        return means, self.log_std.exp().expand_as(means)


class REINFORCE:
    """Sample joint offsets and update the policy from complete episodes."""

    def __init__(
        self,
        obs_space_dims: int,
        action_space_dims: int,
        lr: float = 1e-5,
        gamma: float = 0.99,
    ):
        self.policy_network = Policy_Network(obs_space_dims, action_space_dims)
        self.optimizer = torch.optim.AdamW(self.policy_network.parameters(), lr=lr)
        self.gamma = gamma

    def sample_actions(self, observations: np.ndarray) -> tuple[np.ndarray, torch.Tensor]:
        """Sample actions and joint log probabilities for all active episodes."""
        states = torch.as_tensor(observations, dtype=torch.float32)
        action_means, action_stddevs = self.policy_network(states)
        action_distribution = Normal(action_means, action_stddevs)
        actions = action_distribution.sample()
        # Independent joint probabilities multiply, so their log probabilities add.
        log_probs = action_distribution.log_prob(actions).sum(dim=-1)
        return actions.numpy(), log_probs

    def update(self, rollouts: list[Rollout]):
        """Backpropagate the mean episode loss and update the policy once."""
        losses = []
        for rollout in rollouts:
            discounted = 0.0
            returns = []
            for reward in reversed(rollout.rewards):
                discounted = reward + self.gamma * discounted
                returns.append(discounted)
            returns.reverse()
            weights = torch.tensor(returns, dtype=torch.float32)
            losses.append(-(torch.stack(rollout.log_probs) * weights).sum())
        torch.stack(losses).mean().backward()
        self.optimizer.step()
        self.optimizer.zero_grad()


def collect_rollouts(agent, env, reset_seeds, batch):
    """Advance the active simulations in MuJoCo and score them with the stand task."""
    rollouts = [Rollout(seed) for seed in reset_seeds]
    active = list(range(len(rollouts)))
    observations = []
    schedules = []
    torso = env.torso_id
    batch.reset(ids=active, stage=mujoco.mjtStage.mjSTAGE_NONE)
    for i, seed in enumerate(reset_seeds):
        obs, _ = env.reset(seed=seed)
        observations.append(obs)
        schedules.append(env.push_schedule)
        mujoco.mj_getState(env.model, env.data, batch.state[i], mujoco.mjtState.mjSTATE_INTEGRATION)
        wrench = env.push_wrench(schedules[i], 0)
        if wrench is not None:
            batch.xfrc_applied[i, torso] = wrench

    low, high = env.action_space.low, env.action_space.high
    step_number = 0
    while active:
        actions, log_probs = agent.sample_actions(np.stack([observations[i] for i in active]))
        # Score the sampled actions and clip the commands sent to the actuators.
        batch.ctrl[active] = env.standing_ctrl + np.clip(actions, low, high)
        batch.step(ids=active, nstep=env.frame_skip, stage=mujoco.mjtStage.mjSTAGE_ACC)
        step_number += 1
        next_active = []
        for i, log_prob in zip(active, log_probs.unbind()):
            # Reuse one environment to score each simulation's contacts and COM.
            batch.get_data(i, env.data)
            observations[i], reward, terminated, truncated, info = env._step_result(step_number)
            rollout = rollouts[i]
            rollout.rewards.append(float(reward))
            rollout.log_probs.append(log_prob)
            if "reward_terms" in info:
                rollout.component_rows.append(
                    [info["reward_raw"][n] for n in COMPONENT_NAMES]
                    + [info["reward_terms"][n] for n in COMPONENT_NAMES]
                    + [info[n] for n in DIAGNOSTIC_NAMES]
                )
            if terminated or truncated:
                rollout.info = info
                rollout.truncated = truncated
            else:
                if env.pushes:
                    # env.data holds this simulation's state at the start of its next step.
                    wrench = env.push_wrench(schedules[i], step_number)
                    batch.xfrc_applied[i, torso] = 0.0 if wrench is None else wrench
                next_active.append(i)
        active = next_active
    return rollouts


def record_checkpoint_video(agent, video_dir, episode, episode_len, seed, pushes=False):
    """Evaluate mean actions without changing training buffers or RNG state."""
    env = gym.wrappers.RecordVideo(
        NuggetStandEnv(episode_len=episode_len, pushes=pushes, render_mode="rgb_array"),
        video_folder=str(video_dir / f"episode_{episode:06d}"),
        episode_trigger=lambda _: True,
        name_prefix=f"episode_{episode:06d}",
    )
    network = agent.policy_network
    was_training = network.training
    try:
        network.eval()
        with torch.no_grad():
            obs, _ = env.reset(seed=seed)
            done = False
            while not done:
                mean, _ = network(torch.as_tensor(obs, dtype=torch.float32))
                action = np.clip(mean.numpy(), env.action_space.low, env.action_space.high)
                obs, _, terminated, truncated, _ = env.step(action)
                done = terminated or truncated
    finally:
        env.close()  # Flush the MP4, including a short terminated episode.
        network.train(was_training)


def train(episodes=5000, seed=1, checkpoint_every=100, episode_len=500, videos=True,
          batch_size=16, rollouts_per_reset=4, workers=4, previous_weights=PREVIOUS_WEIGHTS):
    """Run one training seed; save metrics and periodic policy checkpoints."""
    if batch_size < 1 or rollouts_per_reset < 1 or batch_size % rollouts_per_reset:
        raise ValueError("batch_size must be a positive multiple of rollouts_per_reset")
    if min(episodes, checkpoint_every, episode_len, workers) < 1:
        raise ValueError("episodes, checkpoint_every, episode_len and workers must be positive")
    pushes = previous_weights is not None
    if pushes:
        initial_policy = torch.load(previous_weights, map_location="cpu", weights_only=True)["policy"]
    torch.manual_seed(seed)
    run_dir = PROJECT_ROOT / "runs" / "stand_reinforce" / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    checkpoint_dir = run_dir / "checkpoints"
    checkpoint_dir.mkdir(parents=True)
    extra_columns = ([f"raw_{n}_mean" for n in COMPONENT_NAMES]
                     + [f"weighted_{n}_mean" for n in COMPONENT_NAMES]
                     + [f"{n}_mean" for n in DIAGNOSTIC_NAMES])
    print(f"Saving run to {run_dir}")
    if pushes:
        print(f"Push curriculum: initializing policy from {previous_weights}")
    print(f"Rollout batch: {batch_size // rollouts_per_reset} reset states x "
          f"{rollouts_per_reset} rollouts = {batch_size} episodes/update, {workers} step workers")
    recent_returns = deque(maxlen=50)
    with (
        NuggetStandEnv(episode_len=episode_len, pushes=pushes) as env,
        (run_dir / "metrics.csv").open("w", newline="") as metrics_file,
    ):
        batch = Batch(env.model, min(batch_size, episodes), nthread=workers, persistent=True)
        agent = REINFORCE(env.observation_space.shape[0], env.action_space.shape[0])
        if pushes:
            agent.policy_network.load_state_dict(initial_policy)
        (run_dir / "reward_config.json").write_text(json.dumps(env.reward_config, indent=2) + "\n")
        writer = csv.writer(metrics_file)
        writer.writerow(["episode", "reward", "length", "average_reward_50", "termination_reason",
                         "nonfoot_floor_geoms", "reset_seed"] + extra_columns)
        for first in range(1, episodes + 1, batch_size):
            last = min(first + batch_size - 1, episodes)
            # Episodes share reset seeds in groups, with fresh policy noise for each rollout.
            reset_seeds = [seed + (episode - 1) // rollouts_per_reset
                           for episode in range(first, last + 1)]
            rollouts = collect_rollouts(agent, env, reset_seeds, batch)
            for episode, rollout in enumerate(rollouts, start=first):
                if episode == last:
                    agent.update(rollouts)
                reward = sum(rollout.rewards)
                recent_returns.append(reward)
                average = float(np.mean(recent_returns))
                info = rollout.info
                reason = info.get("termination_reason") or ("time_limit" if rollout.truncated else "unknown")
                writer.writerow([episode, reward, len(rollout.rewards), average, reason,
                                 "|".join(info.get("nonfoot_floor_geoms", [])), rollout.reset_seed]
                                + (np.mean(rollout.component_rows, axis=0).tolist() if rollout.component_rows
                                   else [float("nan")] * len(extra_columns)))
                metrics_file.flush()
                if episode == 1 or episode % 10 == 0:
                    print(f"Episode {episode}: average reward (last 50) = {average:.2f}")
                if episode % checkpoint_every == 0 or episode == episodes:
                    torch.save({
                        "episode": episode,
                        "policy": agent.policy_network.state_dict(),
                        "optimizer": agent.optimizer.state_dict(),
                        "obs_dims": env.observation_space.shape[0],
                        "action_dims": env.action_space.shape[0],
                        "seed": seed,
                        "batch_size": batch_size,
                        "rollouts_per_reset": rollouts_per_reset,
                        "workers": workers,
                        "pushes": pushes,
                        "previous_weights": str(previous_weights) if pushes else None,
                        "gamma": agent.gamma,
                        "episode_len": episode_len,
                        "reward_config": env.reward_config,
                    }, checkpoint_dir / f"episode_{episode:06d}.pt")
                    if videos:
                        record_checkpoint_video(agent, run_dir / "videos", episode,
                                                episode_len, seed, pushes=pushes)
    return run_dir


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Nugget with basic REINFORCE.")
    parser.add_argument("--episodes", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--checkpoint-every", type=int, default=100)
    parser.add_argument("--episode-len", type=int, default=500)
    parser.add_argument("--batch-size", type=int, default=16, help="episodes averaged per policy update")
    parser.add_argument("--rollouts-per-reset", type=int, default=4, help="rollouts sharing each randomized starting state")
    parser.add_argument("--workers", type=int, default=4, help="environment-step workers (1 steps environments serially)")
    parser.add_argument("--no-video", action="store_true", help="Skip checkpoint videos.")
    parser.add_argument("--previous-weights", type=Path, default=PREVIOUS_WEIGHTS,
                        help="standing checkpoint to initialize the policy and enable pushes")
    args = parser.parse_args()
    if min(args.episodes, args.checkpoint_every, args.episode_len, args.batch_size,
           args.rollouts_per_reset, args.workers) < 1:
        parser.error("all counts, including workers, must be positive")
    if args.batch_size % args.rollouts_per_reset:
        parser.error("--batch-size must be a multiple of --rollouts-per-reset")
    train(args.episodes, args.seed, args.checkpoint_every, args.episode_len,
          videos=not args.no_video, batch_size=args.batch_size, rollouts_per_reset=args.rollouts_per_reset,
          workers=args.workers, previous_weights=args.previous_weights)
