"""Show episode duration and reward for a standing run."""

import argparse
import csv
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from nugget.envs.gymnasium.stand import NuggetStandEnv
from nugget.robot import PROJECT_ROOT


def rolling_mean(values, window=50):
    end = np.arange(1, len(values) + 1)
    start = np.maximum(0, end - window)
    cumulative = np.r_[0.0, np.cumsum(values)]
    return (cumulative[end] - cumulative[start]) / (end - start)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", nargs="?", type=Path,
                        help="run directory (default: latest stand_reinforce run)")
    args = parser.parse_args()

    if args.run is None:
        runs = PROJECT_ROOT / "runs" / "stand_reinforce"
        metrics = max(runs.glob("*/metrics.csv"), default=None)
        if metrics is None:
            parser.error(f"no run metrics found in {runs}")
    else:
        metrics = args.run / "metrics.csv"
    if not metrics.is_file():
        parser.error(f"metrics file not found: {metrics}")
    with metrics.open(newline="") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        parser.error(f"no episodes in {metrics}")

    with NuggetStandEnv() as env:
        dt = env.dt
    episodes = [int(row["episode"]) for row in rows]
    durations = [int(row["length"]) * dt for row in rows]
    rewards = [float(row["reward"]) for row in rows]

    plt.rcParams.update({"font.family": "STIXGeneral", "axes.spines.top": False,
                         "axes.spines.right": False})
    fig, (duration_ax, reward_ax) = plt.subplots(1, 2, figsize=(9, 4), layout="constrained")
    fig.suptitle("Standing training (trailing 50-episode mean)")
    for ax, values, title, ylabel in (
        (duration_ax, durations, "Episode duration", "Duration (s)"),
        (reward_ax, rewards, "Episode reward", "Sum of step rewards"),
    ):
        ax.plot(episodes, rolling_mean(values), color="black", linewidth=0.9)
        ax.set(title=title, xlabel="Training episode", ylabel=ylabel)
        ax.grid(axis="y", color="0.9")
        ax.set_axisbelow(True)

    limit = max((duration for row, duration in zip(rows, durations)
                 if row.get("termination_reason") == "time_limit"), default=0.0)
    if limit:
        duration_ax.axhline(limit, color="0.45", linestyle="--", linewidth=0.8,
                            label=f"{limit:g} s training limit")
        duration_ax.legend(loc="lower right", frameon=False)
    plt.show()


if __name__ == "__main__":
    main()
