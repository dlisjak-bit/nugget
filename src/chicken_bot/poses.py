"""Edit these joint targets in DEGREES, then restart the lab.

Order matters: left roll / hip / knee / ankle, then the right leg.
These are CAD exploration poses, not walking or recovery commands.
"""

POSES = {
    "stand":     (0, -40, 80, -40, 0, -40, 80, -40),
    "left_step": (0, -65, 80, -15, 0, -40, 80, -40),
    "deep_tuck": (0, -60, 140, -45, 0, -60, 140, -45),
    "wide":      (35, -40, 80, -40, -35, -40, 80, -40),
}
