"""Convert the pinned C v12 visual snapshot into editable MJCF models.

This is NOT a native ForgeCAD physics export. The 57 named visual parts come
from the real CAD export; the joint tree follows the pinned CAD source.
Masses are CAD estimates. Inertias and floor-contact proxies are approximate.
scene.xml has a floating base; bench.xml preserves the pinned joint experiment.
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

import numpy as np
import trimesh

from nugget.poses import POSES, set_standing_pose
from nugget.robot import CAD_URL, JOINTS, MODEL_DIR
XML_PATH = MODEL_DIR / "scene.xml"
BENCH_PATH = MODEL_DIR / "bench.xml"
CAD_SOURCE = MODEL_DIR / "cad.glb.gz"

# Metres, radians internally. These dimensions are from C v12, not the old v2 XML.
THIGH = 0.048
SHIN = 0.050
ANKLE_HEIGHT = 0.024
HIP_SPACING = 0.106
ROLL_OFFSET = 0.041
HIP_FORWARD = 0.008
TORSO_Z = (THIGH + SHIN) * math.cos(math.radians(40)) + ANKLE_HEIGHT


def rx(degrees: float) -> np.ndarray:
    a = math.radians(degrees)
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1.0]])


def translation(x: float, y: float, z: float) -> np.ndarray:
    matrix = np.eye(4)
    matrix[:3, 3] = (x, y, z)
    return matrix


def home_frames() -> dict[str, np.ndarray]:
    frames = {"Torso": translation(0, 0, TORSO_Z)}
    for side, sign in (("L", -1), ("R", 1)):
        frames[side + "_HipRoll"] = frames["Torso"] @ translation(
            sign * (HIP_SPACING / 2 - ROLL_OFFSET), -HIP_FORWARD, 0
        )
        frames[side + "_Thigh"] = frames[side + "_HipRoll"] @ translation(sign * ROLL_OFFSET, 0, 0) @ rx(-40)
        frames[side + "_Shin"] = frames[side + "_Thigh"] @ translation(0, 0, -THIGH) @ rx(80)
        frames[side + "_Foot"] = frames[side + "_Shin"] @ translation(0, 0, -SHIN) @ rx(-40)
    return frames


def owner(name: str) -> str:
    if not name.startswith(("L_", "R_")):
        return "Torso"
    side, suffix = name[:1], name[2:]
    if suffix in ("HipRoll", "Thigh", "Shin", "Foot"):
        return name
    groups = {
        "Torso": ("Roll_XL330_case", "Roll_retainer"),
        "HipRoll": ("Roll_output", "Roll_idler", "HipPitch_XL330_case", "HipPitch_retainer", "Hip_socket_cover"),
        "Thigh": ("Knee_XL330_case", "Knee_retainer", "HipPitch_output", "HipPitch_idler"),
        "Shin": ("Knee_output", "Knee_idler", "Ankle_XL330_case", "Ankle_retainer"),
        "Foot": ("Ankle_output", "Ankle_idler"),
    }
    for body, members in groups.items():
        if suffix in members:
            return body if body == "Torso" else side + "_" + body
    raise ValueError(f"No rigid-body assignment for {name}")


def numbers(values) -> str:
    return " ".join(f"{float(v):.12g}" for v in values)


def estimated_inertia(parts: list[dict]) -> tuple[float, np.ndarray, np.ndarray]:
    """Per-part box inertias and parallel-axis theorem; explicitly approximate."""
    mass = sum(part["mass"] for part in parts)
    com = sum(part["mass"] * part["centre"] for part in parts) / mass
    tensor = np.zeros((3, 3))
    for part in parts:
        m = part["mass"]
        x, y, z = np.maximum(part["extent"], 0.0001)
        own = np.diag([m * (y*y + z*z) / 12, m * (x*x + z*z) / 12, m * (x*x + y*y) / 12])
        r = part["centre"] - com
        tensor += own + m * (np.dot(r, r) * np.eye(3) - np.outer(r, r))
    return mass, com, tensor


def add_colliders(bodies, visuals):
    """Coarse external envelopes, not CAD interference/self-collision geometry.

    Bit masks allow robot vs floor, but not robot vs robot. All body inertias
    remain explicit: adding a collider does not add mass a second time.
    """
    parts = {part["name"]: part for part in visuals}
    specs = []

    def add(body, label, kind, **attributes):
        specs.append({"body": body, "name": label, "type": kind, **attributes})
        ET.SubElement(bodies[body], "geom", name=label, type=kind,
                      group="3", contype="1", conaffinity="2", condim="3",
                      friction="0.8 0.005 0.0001", solref="0.01 1",
                      solimp="0.9 0.95 0.001", rgba="0.1 0.8 1 0.3",
                      **{key: numbers(value) for key, value in attributes.items()})

    for label in ("Torso", "Head"):
        part = parts[label]
        add("Torso", "collision_" + label.lower(), "ellipsoid" if label == "Torso" else "box",
            pos=part["centre"], size=part["extent"] / 2)
    # Separate side-panel envelopes include the shell width without treating
    # the open belly as a single solid box for future refinement.
    for side in ("Left", "Right"):
        for suffix in ("side_panel_front", "side_panel_rear", "wing"):
            part = parts[side + "_" + suffix]
            add("Torso", "collision_" + side.lower() + "_" + suffix,
                "ellipsoid", pos=part["centre"], size=part["extent"] / 2)
    for side in ("L", "R"):
        for role in ("HipRoll", "Thigh", "Shin"):
            name = side + "_" + role
            owned = [part for part in visuals if part["body"] == name]
            low = np.min([p["centre"] - p["extent"]/2 for p in owned], axis=0)
            high = np.max([p["centre"] + p["extent"]/2 for p in owned], axis=0)
            add(name, "collision_" + name.lower(), "box", pos=(low+high)/2, size=(high-low)/2)
        foot = side + "_Foot"
        part = parts[foot]
        low, high = part["centre"] - part["extent"]/2, part["centre"] + part["extent"]/2
        # Two 5 mm thick soles retain the split-toe contact footprint.
        half_width = (high[0]-low[0])/4 - 0.001
        for toe, sign in (("a", -1), ("b", 1)):
            x = part["centre"][0] + sign * (high[0]-low[0])/4
            add(foot, "collision_" + foot.lower() + "_toe_" + toe, "box",
                pos=(x, part["centre"][1], low[2]+0.0025),
                size=(half_width, part["extent"][1]/2, 0.0025))
        # Upper ankle yoke envelope catches the floor when the foot rolls over.
        add(foot, "collision_" + foot.lower() + "_ankle", "box",
            pos=(0, 0, -0.007), size=(0.014, 0.012, 0.012))
    return specs


def build() -> Path:
    raw = gzip.decompress(CAD_SOURCE.read_bytes())
    scene = trimesh.load_scene(io.BytesIO(raw), file_type="glb", process=False)
    masses = json.loads((MODEL_DIR / "cad_mass_estimates.json").read_text())
    by_name = {row["name"]: row["massKg"] for row in masses["rows"]}
    by_name["Torso"] = by_name.pop("Torso + unselected hardware allowance")
    if len(scene.graph.nodes_geometry) != 57 or set(scene.graph.nodes_geometry) != set(by_name):
        raise ValueError("The CAD snapshot and its 57-part mass table do not agree")
    frames = home_frames()
    grouped = {name: [] for name in frames}
    meshes_dir = MODEL_DIR / "meshes"
    meshes_dir.mkdir(exist_ok=True)
    visuals = []
    reference_bounds = {}
    for name in sorted(scene.graph.nodes_geometry):
        transform, geometry = scene.graph[name]
        mesh = scene.geometry[geometry].copy()
        mesh.apply_transform(transform)
        # glTF is Y-up in metres; our CAD/MuJoCo convention is Z-up, front -Y.
        mesh.apply_transform(rx(90))
        reference_bounds[name] = mesh.bounds.tolist()
        body = owner(name)
        mesh.apply_transform(np.linalg.inv(frames[body]))
        rgba = np.asarray(mesh.visual.material.baseColorFactor, dtype=float) / 255
        mesh.export(meshes_dir / f"{name}.stl")
        part = {"name": name, "body": body, "mass": by_name[name], "centre": mesh.bounds.mean(axis=0), "extent": mesh.extents, "rgba": rgba}
        grouped[body].append(part)
        visuals.append(part)

    model = ET.Element("mujoco", model="Nugget C v12 — floating floor-contact lab")
    ET.SubElement(model, "compiler", angle="degree", autolimits="true", meshdir="meshes", inertiafromgeom="false", alignfree="false")
    ET.SubElement(model, "option", timestep="0.002", integrator="implicitfast", gravity="0 0 -9.81")
    visual = ET.SubElement(model, "visual")
    ET.SubElement(visual, "global", offwidth="1200", offheight="900")
    ET.SubElement(visual, "map", znear="0.01")
    ET.SubElement(model, "statistic", center="0 -0.015 0.09", extent="0.25")
    default = ET.SubElement(model, "default")
    ET.SubElement(default, "joint", damping="0.01", armature="0.00001")
    ET.SubElement(default, "geom", contype="0", conaffinity="0", group="2")
    assets = ET.SubElement(model, "asset")
    for part in visuals:
        ET.SubElement(assets, "mesh", name=part["name"], file=part["name"] + ".stl")
    world = ET.SubElement(model, "worldbody")
    ET.SubElement(world, "light", pos="0 -0.4 0.7", dir="0 0 -1", diffuse="0.8 0.8 0.8")
    ET.SubElement(world, "light", pos="0.3 0.2 0.4", dir="-1 -1 -1", diffuse="0.5 0.5 0.5")
    ET.SubElement(world, "geom", name="floor", type="plane", size="0.6 0.6 0.02", rgba="0.22 0.25 0.3 1", group="0", contype="2", conaffinity="1", condim="3", friction="0.8 0.005 0.0001")
    bodies = {"Torso": ET.SubElement(world, "body", name="Torso", pos=numbers((0, 0, TORSO_Z)))}
    ET.SubElement(bodies["Torso"], "freejoint", name="root")
    for side, word, sign in (("L", "left", -1), ("R", "right", 1)):
        definitions = (
            ("HipRoll", "Torso", (sign * (HIP_SPACING/2 - ROLL_OFFSET), -HIP_FORWARD, 0), 0, "0 1 0", (-15, 45) if sign < 0 else (-45, 15), "hip_roll"),
            ("Thigh", side + "_HipRoll", (sign * ROLL_OFFSET, 0, 0), -40, "1 0 0", (-65, 45), "hip_pitch"),
            ("Shin", side + "_Thigh", (0, 0, -THIGH), 80, "1 0 0", (0, 150), "knee"),
            ("Foot", side + "_Shin", (0, 0, -SHIN), -40, "1 0 0", (-45, 45), "ankle_pitch"),
        )
        for role, parent, pos, ref, axis, limits, joint in definitions:
            name = side + "_" + role
            body = ET.SubElement(bodies[parent], "body", name=name, pos=numbers(pos), euler=numbers((ref, 0, 0)))
            ET.SubElement(body, "joint", name=word + "_" + joint, axis=axis, range=numbers(limits), ref=str(ref))
            bodies[name] = body
        ET.SubElement(bodies[side + "_Foot"], "site", name=word + "_sole", pos=numbers((0, -0.01, -ANKLE_HEIGHT)), size="0.002", rgba="0.2 0.8 0.3 1", group="3")
    for name, parts in grouped.items():
        body = bodies[name]
        mass, com, tensor = estimated_inertia(parts)
        ET.SubElement(body, "inertial", mass=str(mass), pos=numbers(com), fullinertia=numbers((tensor[0,0], tensor[1,1], tensor[2,2], tensor[0,1], tensor[0,2], tensor[1,2])))
        for part in parts:
            ET.SubElement(body, "geom", name=part["name"], type="mesh", mesh=part["name"], rgba=numbers(part["rgba"]))
    collider_specs = add_colliders(bodies, visuals)
    actuators = ET.SubElement(model, "actuator")
    # Teaching values, NOT calibrated XL330 gains or a continuous torque rating.
    limits_by_joint = {
        "left_hip_roll": (-15, 45), "right_hip_roll": (-45, 15),
        "left_hip_pitch": (-65,45), "right_hip_pitch": (-65,45),
        "left_knee": (0,150), "right_knee": (0,150),
        "left_ankle_pitch": (-45,45), "right_ankle_pitch": (-45,45),
    }
    for name in JOINTS:
        ET.SubElement(actuators, "position", name=name, joint=name, kp="1.5", kv="0.035", ctrlrange=numbers(np.deg2rad(limits_by_joint[name])), forcerange="-0.12 0.12")
    keys = ET.SubElement(model, "keyframe")
    for name, pose in POSES.items():
        values = numbers(np.deg2rad(pose))
        ET.SubElement(keys, "key", name=name, qpos=numbers((0, 0, TORSO_Z, 1, 0, 0, 0)) + " " + values, ctrl=values)
    tree = ET.ElementTree(model)
    ET.indent(tree, space="  ")
    tree.write(XML_PATH, encoding="unicode", xml_declaration=True)
    # The CAD reference frames stay unchanged; the named stand key uses the
    # validated joint targets and corresponding sole-aligned floating base.
    import mujoco
    compiled = mujoco.MjModel.from_xml_path(str(XML_PATH))
    standing = mujoco.MjData(compiled)
    set_standing_pose(compiled, standing)
    keys.find("key[@name='stand']").set("qpos", numbers(standing.qpos))
    tree.write(XML_PATH, encoding="unicode", xml_declaration=True)
    # Keep a separate fixed-base, contact-free model for the first lesson.
    bodies["Torso"].remove(bodies["Torso"].find("freejoint"))
    model.set("model", "Nugget C v12 — pinned bench (contacts off)")
    option = model.find("option")
    option.set("gravity", "0 0 0")
    ET.SubElement(option, "flag", contact="disable")
    for key in keys:
        key.set("qpos", " ".join(key.get("qpos").split()[7:]))
    ET.indent(tree, space="  ")
    tree.write(BENCH_PATH, encoding="unicode", xml_declaration=True)
    provenance = {
        "cad_version": "C v12", "cad_url": CAD_URL,
        "cad_glb_sha256": hashlib.sha256(raw).hexdigest(),
        "export_format": "named GLB visual snapshot; not a native MJCF export",
        "source_up_axis": "Y", "mjcf_up_axis": "Z", "units": "metres",
        "parts": len(visuals), "mass_kg": sum(by_name.values()),
        "inertia_method": "per-part bounding-box approximation; CAD mass estimates",
        "contacts": "scene.xml: robot-floor primitive proxies; robot self-contact disabled. bench.xml: disabled",
        "collision_proxies": [{key: (value.tolist() if isinstance(value, np.ndarray) else value) for key, value in spec.items()} for spec in collider_specs],
        "friction": "assumed sliding coefficient 0.8; unmeasured",
        "base": "scene.xml: free (6 DOF); bench.xml: pinned",
        "cad_home_bounds_m": reference_bounds,
    }
    (MODEL_DIR / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(f"Built scene.xml (floating) and bench.xml (pinned): 57 visuals, 8 hinges, {len(collider_specs)} floor proxies, {provenance['mass_kg']:.3f} kg estimated")
    return XML_PATH


if __name__ == "__main__":
    build()
