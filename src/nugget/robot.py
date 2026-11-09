"""Shared model locations and joint conventions; no training-framework imports.

Use this project as an editable installation from its checkout. The versioned
model packages live at the project root rather than inside the Python wheel.
Numeric geometry, mass and actuator properties remain in the model/builder.
"""
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = PROJECT_ROOT / "models" / "c_v12"
SCENE = MODEL_DIR / "scene.xml"
BENCH = MODEL_DIR / "bench.xml"
CAD_URL = "https://forgecad.io/app/projects/39098efa-3bbf-41a2-9983-493faeace2fc/778999cf-bf78-4fe9-b662-cd1ae014b093"

# Left roll / hip / knee / ankle, then the right leg. Runtime angles are radians.
JOINTS = (
    "left_hip_roll", "left_hip_pitch", "left_knee", "left_ankle_pitch",
    "right_hip_roll", "right_hip_pitch", "right_knee", "right_ankle_pitch",
)
