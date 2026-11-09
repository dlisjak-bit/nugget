"""Native MuJoCo plots of measured joint angles and commanded targets."""
from collections import deque

import mujoco
import numpy as np

from nugget.robot import JOINTS


class JointPlots:
    def __init__(self, model, dt):
        self.addresses = [int(model.joint(name).qposadr[0]) for name in JOINTS]
        self.actuators = [model.actuator(name).id for name in JOINTS]
        self.history = deque(maxlen=min(1000, int(5 / dt) + 1))
        self.figures = []
        for name in JOINTS:
            figure = mujoco.MjvFigure()
            figure.title = name.replace("left_", "L ").replace("right_", "R ").replace("_", " ") + " (deg)"
            figure.xlabel = "time (s)"
            figure.linename[0], figure.linename[1] = "angle", "target"
            figure.linergb[0], figure.linergb[1] = (0.25, 0.8, 1), (1, 0.65, 0.2)
            figure.flg_extend = 0
            figure.gridsize[:] = (3, 3)
            figure.yformat = "%.2f"
            figure.xformat = "%.1f"
            figure.linewidth = 2
            self.figures.append(figure)

    def reset(self, data):
        self.history.clear()
        self.append(data)

    def append(self, data):
        self.history.append((data.time, np.rad2deg(data.qpos[self.addresses]),
                             np.rad2deg(data.ctrl[self.actuators])))
        times, angles, targets = map(np.asarray, zip(*self.history))
        for joint, figure in enumerate(self.figures):
            figure.range[0] = (max(0, times[-1] - 5), max(5, times[-1]))
            values = np.concatenate((angles[:, joint], targets[:, joint]))
            center = values.mean()
            radius = max(0.05, np.abs(values - center).max() * 1.15)
            figure.range[1] = (center - radius, center + radius)
            for line, values in enumerate((angles[:, joint], targets[:, joint])):
                figure.linepnt[line] = len(times)
                points = figure.linedata[line, :2 * len(times)].reshape(-1, 2)
                points[:, 0], points[:, 1] = times, values

    def show(self, viewer):
        viewport = viewer.viewport
        width, height = int(viewport.width * 0.23), viewport.height // 4
        left = viewport.left + viewport.width - 2 * width
        viewer.set_figures([
            (mujoco.MjrRect(left + (i // 4) * width,
                            viewport.bottom + (3 - i % 4) * height, width, height), figure)
            for i, figure in enumerate(self.figures)
        ])
