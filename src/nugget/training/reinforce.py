# https://gymnasium.farama.org/tutorials/training_agents/mujoco_reinforce/
# This is a simple test of the stand.py gymnasium environment.

from __future__ import annotations

import argparse
import csv
import json
from datetime import datetime
import random

import numpy as np
import torch
import torch.nn as nn
from torch.distributions.normal import Normal

import gymnasium as gym

from nugget.envs.gymnasium.stand import NuggetStandEnv
from nugget.robot import PROJECT_ROOT, JOINTS


class Policy_Network(nn.Module):
    """Predict joint targets as corrections around the standing pose."""

    def __init__(self, obs_space_dims: int, action_space_dims: int):
        """Initializes observation-dependent mean corrections and learned joint noise.

        Args:
            obs_space_dims: Dimension of the observation space
            action_space_dims: Dimension of the action space
        """
        super().__init__()

        hidden_space1 = 32 
        hidden_space2 = 128
        hidden_space3 = 256
        hidden_space4 = 128

        self.shared_net = nn.Sequential(
            nn.Linear(obs_space_dims, hidden_space1),
            nn.Tanh(),
            nn.Linear(hidden_space1, hidden_space2),
            nn.Tanh(),
            nn.Linear(hidden_space2, hidden_space3),
            nn.Tanh(),
            nn.Linear(hidden_space3, hidden_space4),
            nn.Tanh(),
        )

        self.policy_mean_net = nn.Sequential(
            nn.Linear(hidden_space4, action_space_dims),
        )

        if action_space_dims != len(JOINTS):
            raise ValueError("This policy expects Nugget's eight leg actuators.")
        # Zero corrections initially: the mean policy starts by holding stand.
        nn.init.zeros_(self.policy_mean_net[0].weight)
        nn.init.zeros_(self.policy_mean_net[0].bias)
        # Eight trainable noise scales, independent of the observation.
        self.log_std = nn.Parameter(
            torch.full((action_space_dims,), float(np.log(np.deg2rad(0.5))))
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Conditioned on the observation, returns the mean and standard deviation
         of a normal distribution from which an action is sampled from.

        Args:
            x: Observation from the environment

        Returns:
            action_means: predicted mean of the normal distribution
            action_stddevs: predicted standard deviation of the normal distribution
        """

        shared_features = self.shared_net(x)
        action_means = torch.pi * torch.tanh(self.policy_mean_net(shared_features))
        action_stddevs = self.log_std.exp().expand_as(action_means)
        return action_means, action_stddevs


class REINFORCE:
    """
    Fun Fact: REINFORCE is an acronym for “ 'RE'ward 'I'ncrement 'N'on-negative 'F'actor times 'O'ffset 'R'einforcement times 'C'haracteristic 'E'ligibility
    """

    def __init__(
            self,
            obs_space_dims: int,
            action_space_dims: int,
            lr: float = 1e-5,
            gamma: float = 0.99,
    ):
        """Initializes the REINFORCE algorithm.

        Args:
            obs_space_dims: Dimension of the observation space
            action_space_dims: Dimension of the action space
            lr: Learning rate for the optimizer
            gamma: Discount factor for future rewards
        """
        self.policy_network = Policy_Network(obs_space_dims, action_space_dims)
        self.optimizer = torch.optim.AdamW(self.policy_network.parameters(), lr=lr)
        self.gamma = gamma
        self.probs = []
        self.rewards = []
        self.batch_episodes = 0

    def sample_action(self, state: np.ndarray) -> np.ndarray:
        """Samples an action from the policy network given the current state.

        Args:
            state: Current state of the environment
        Returns:
            action: Sampled action to take in the environment
        """
        state = torch.tensor(np.array([state]), dtype=torch.float32)
        action_means, action_stddevs = self.policy_network(state)
        action_distribution = Normal(action_means, action_stddevs)
        action = action_distribution.sample()
        # Independent joint probabilities multiply, so their log probabilities add.
        prob = action_distribution.log_prob(action).sum(dim=-1).squeeze(0)
        action = action.detach().numpy()[0]
        self.probs.append(prob)
        return action

    def finish_episode(self):
        """Accumulate this episode's gradient without changing the policy."""
        running_g = 0
        gs = []

        # Discounted return (backwards) - [::-1] will return an array in reverse
        for R in self.rewards[::-1]:
            running_g = R + self.gamma * running_g
            gs.insert(0, running_g)

        deltas = torch.tensor(gs, dtype=torch.float32)

        log_probs = torch.stack(self.probs)  # Joint dimensions were summed in sample_action.

        # Weight each timestep's joint-action log probability by its return.
        loss = -torch.sum(log_probs * deltas)

        loss.backward()
        self.batch_episodes += 1

        # Empty / zero out all episode-centric/related variables
        self.probs = []
        self.rewards = []

    def update(self):
        """Apply the mean gradient across the collected episodes."""
        for parameter in self.policy_network.parameters():
            if parameter.grad is not None:
                parameter.grad.div_(self.batch_episodes)
        self.optimizer.step()
        self.optimizer.zero_grad()
        self.batch_episodes = 0


def record_checkpoint_video(agent, video_dir, episode, episode_len, seed):
    """Evaluate mean actions without changing training buffers or RNG state."""
    env = gym.wrappers.RecordVideo(
        NuggetStandEnv(episode_len=episode_len, render_mode="rgb_array"),
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
          batch_size=16, rollouts_per_reset=4):
    """Run one training seed; save metrics and periodic policy checkpoints."""
    if batch_size < 1 or rollouts_per_reset < 1 or batch_size % rollouts_per_reset:
        raise ValueError("batch_size must be a positive multiple of rollouts_per_reset")
    torch.manual_seed(seed)
    random.seed(seed)
    np.random.seed(seed)
    run_dir = PROJECT_ROOT / "runs" / "stand_reinforce" / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    checkpoint_dir = run_dir / "checkpoints"
    checkpoint_dir.mkdir(parents=True)
    env = gym.wrappers.RecordEpisodeStatistics(
        NuggetStandEnv(episode_len=episode_len), buffer_length=50
    )
    agent = REINFORCE(env.observation_space.shape[0], env.action_space.shape[0])
    (run_dir / "reward_config.json").write_text(
        json.dumps(env.unwrapped.reward_config, indent=2) + "\n"
    )
    component_names = ["height", "upright", "velocity", "fall"]
    diagnostic_names = ["com_height_m", "tilt_rad", "com_speed_xy_m_s", "nonfoot_floor_contact"]
    extra_columns = ([f"raw_{n}_mean" for n in component_names]
                     + [f"weighted_{n}_mean" for n in component_names]
                     + [f"{n}_mean" for n in diagnostic_names])
    print(f"Saving run to {run_dir}")
    print(f"Rollout batch: {batch_size // rollouts_per_reset} reset states x "
          f"{rollouts_per_reset} rollouts = {batch_size} episodes/update")
    try:
        with (run_dir / "metrics.csv").open("w", newline="") as metrics_file:
            writer = csv.writer(metrics_file)
            writer.writerow(["episode", "reward", "length", "average_reward_50", "termination_reason", "nonfoot_floor_geoms", "reset_seed"] + extra_columns)
            for episode in range(1, episodes + 1):
                # Repeat each random starting state, with fresh policy action noise.
                reset_seed = seed + (episode - 1) // rollouts_per_reset
                obs, info = env.reset(seed=reset_seed)
                done = False
                component_rows = []
                while not done:
                    action = agent.sample_action(obs)
                    # Keep the sampled action's log probability for REINFORCE;
                    # clip only the command sent to the bounded position actuators.
                    command = np.clip(action, env.action_space.low, env.action_space.high)
                    obs, reward, terminated, truncated, info = env.step(command)
                    if "reward_terms" in info:
                        component_rows.append(
                            [info["reward_raw"][n] for n in component_names]
                            + [info["reward_terms"][n] for n in component_names]
                            + [info[n] for n in diagnostic_names]
                        )
                    agent.rewards.append(float(reward))
                    done = terminated or truncated
                agent.finish_episode()
                if episode % batch_size == 0 or episode == episodes:
                    agent.update()
                average = float(np.mean(env.return_queue))
                writer.writerow([episode, float(env.return_queue[-1]),
                                 int(env.length_queue[-1]), average,
                                 info.get("termination_reason") or ("time_limit" if truncated else "unknown"),
                                 "|".join(info.get("nonfoot_floor_geoms", [])), reset_seed]
                                + (np.mean(component_rows, axis=0).tolist() if component_rows
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
                        "gamma": agent.gamma,
                        "episode_len": episode_len,
                        "reward_config": env.unwrapped.reward_config,
                    }, checkpoint_dir / f"episode_{episode:06d}.pt")
                    if videos:
                        record_checkpoint_video(agent, run_dir / "videos", episode,
                                                episode_len, seed)
    finally:
        env.close()
    return run_dir


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Nugget with basic REINFORCE.")
    parser.add_argument("--episodes", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--checkpoint-every", type=int, default=100)
    parser.add_argument("--episode-len", type=int, default=500)
    parser.add_argument("--batch-size", type=int, default=16, help="episodes averaged per policy update")
    parser.add_argument("--rollouts-per-reset", type=int, default=4, help="rollouts sharing each randomized starting state")
    parser.add_argument("--no-video", action="store_true", help="Skip checkpoint videos.")
    args = parser.parse_args()
    if min(args.episodes, args.checkpoint_every, args.episode_len, args.batch_size, args.rollouts_per_reset) < 1:
        parser.error("episode counts, checkpoint interval, batch size and rollouts per reset must be positive")
    if args.batch_size % args.rollouts_per_reset:
        parser.error("--batch-size must be a multiple of --rollouts-per-reset")
    train(args.episodes, args.seed, args.checkpoint_every, args.episode_len,
          videos=not args.no_video, batch_size=args.batch_size, rollouts_per_reset=args.rollouts_per_reset)
