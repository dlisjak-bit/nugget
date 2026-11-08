# Nugget

A hobby robotics project.

![Chicken bot prototype render](docs/images/proto_render.png)

## Quick blog

Robotics is getting accessible, so designing one is now a weekend side challenge.

Inspiration: All those cute robots
Goal: Make a chicken that runs as fast as possible
CAD: ForgeCAD + Codex + Eyes
Model and physics: MuJoCo
Learning Env: Gymnasium (for now)
Brains: TBD 


## Dev guide

### Quickstart

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then run
from this folder:

```sh
uv sync --locked
uv run chicken-viewer
```

Use `uv run chicken-viewer --bench` for the pinned joint explorer. In the
viewer: **6–9** select poses, **F6** switches pose/physics mode, **F8** resets,
and **F9/F10** toggle center of mass/collision shapes. On Mac, hold **Fn** if needed.

Run checks with `uv run python -m unittest discover -s tests -v`.
Physics and mass properties are approximate; training is not implemented yet.

### Repo structure

```text
cad/                   ForgeCAD source snapshots
models/                MJCF models, meshes and provenance
src/chicken_bot/       Robot conventions, manual poses and interactive viewer
  envs/                Gymnasium/mjlab placeholders
  training/            Training-runner placeholders
  evaluation/          Evaluation placeholders
configs/               Empty task and training configuration files
scripts/               Current model-building script
tests/                 Model import and physics checks
docs/images/           Renders and README images
runs/                  Training outputs (ignored by Git)
```

The current model uses a saved CAD export and a local conversion script;
native ForgeCAD MJCF export is still to be tested.
