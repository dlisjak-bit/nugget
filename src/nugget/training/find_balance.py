"""Search symmetric fixed joint targets, without a policy or reward function.

Run: python -m nugget.training.find_balance
This tests the current approximate model and controller, not hardware stability.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime
from itertools import product
import json

import mujoco
import numpy as np

from nugget.poses import POSES
from nugget.robot import JOINTS, PROJECT_ROOT, SCENE


def lowest_box_z(model, data, geom):
    rotation = data.geom_xmat[geom].reshape(3, 3)
    return data.geom_xpos[geom, 2] - np.abs(rotation[2]) @ model.geom_size[geom]


def trial(model, hip, knee, ankle, seconds=10.0):
    data = mujoco.MjData(model)
    angles = np.deg2rad([0, hip, knee, ankle] * 2)
    for name, angle in zip(JOINTS, angles):
        data.qpos[model.joint(name).qposadr[0]] = angle
        data.ctrl[model.actuator(name).id] = angle
    mujoco.mj_forward(model, data)
    soles = {model.geom(f"collision_{side}_foot_toe_{toe}").id
             for side in ('l', 'r') for toe in ('a', 'b')}
    # Place each candidate on its soles, not at the original pose's base height.
    data.qpos[2] -= min(lowest_box_z(model, data, g) for g in soles)
    data.qpos[2] += 0.0001
    mujoco.mj_forward(model, data)
    floor = model.geom('floor').id
    torso = model.body('Torso').id
    start_xy = data.subtree_com[torso, :2].copy()
    start_height = float(data.subtree_com[torso, 2])
    jac = np.zeros((3, model.nv))
    row = dict(hip_deg=hip, knee_deg=knee, ankle_deg=ankle,
               seconds=0.0, stable=False, reason='duration', max_tilt_deg=0.0,
               max_drift_m=0.0, final_speed_rms_m_s=0.0,
               final_angular_speed_rms_rad_s=0.0, final_height_range_m=0.0,
               peak_torque_nm=0.0, initial_com_height_m=start_height,
               contacting_geom='')
    samples = []
    steps = int(np.ceil(seconds/model.opt.timestep))
    for step in range(steps):
        # Check initial geometry too: don't accept a pose supported on a shin box.
        for contact in data.contact:
            pair = (int(contact.geom1), int(contact.geom2))
            if floor in pair and contact.dist < -0.00001:
                other = pair[1] if pair[0] == floor else pair[0]
                if other not in soles:
                    row.update(reason='nonsole_floor_contact',
                               contacting_geom=model.geom(other).name)
                    return row
        mujoco.mj_step(model, data)
        row['seconds'] = float(data.time)
        if not np.isfinite(data.qpos).all() or not np.isfinite(data.qvel).all() or data.warning.number.any():
            row['reason'] = 'numerical_failure'
            return row
        mujoco.mj_forward(model, data)
        tilt = np.rad2deg(np.arccos(np.clip(data.xmat[torso].reshape(3, 3)[2, 2], -1, 1)))
        drift = float(np.linalg.norm(data.subtree_com[torso, :2]-start_xy))
        row['max_tilt_deg'] = max(row['max_tilt_deg'], float(tilt))
        row['max_drift_m'] = max(row['max_drift_m'], drift)
        row['peak_torque_nm'] = max(row['peak_torque_nm'], float(np.max(np.abs(data.actuator_force))))
        if tilt > 20 or drift > .03 or data.subtree_com[torso, 2] < .8*start_height:
            row['reason'] = 'tilt_drift_or_height'
            return row
        if data.time >= seconds-min(2.0, seconds/2):
            mujoco.mj_jacSubtreeCom(model, data, jac, torso)
            samples.append((np.linalg.norm(jac @ data.qvel), np.linalg.norm(data.qvel[3:6]),
                            float(data.subtree_com[torso, 2])))
    # Check the last integrated state too, and require actual sole support.
    sole_support = False
    for contact in data.contact:
        pair = (int(contact.geom1), int(contact.geom2))
        if floor in pair and contact.dist <= 0:
            other = pair[1] if pair[0] == floor else pair[0]
            if other not in soles and contact.dist < -0.00001:
                row.update(reason='nonsole_floor_contact', contacting_geom=model.geom(other).name)
                return row
            sole_support |= other in soles
    if not sole_support:
        row['reason'] = 'no_sole_support'
        return row
    samples = np.asarray(samples)
    row['final_speed_rms_m_s'] = float(np.sqrt(np.mean(samples[:, 0]**2)))
    row['final_angular_speed_rms_rad_s'] = float(np.sqrt(np.mean(samples[:, 1]**2)))
    row['final_height_range_m'] = float(np.ptp(samples[:, 2]))
    row['stable'] = (row['final_speed_rms_m_s'] < .02
                     and row['final_angular_speed_rms_rad_s'] < .2
                     and row['final_height_range_m'] < .005)
    row['reason'] = 'stable' if row['stable'] else 'still_moving'
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--radius', type=float, default=20, help='Grid radius around CAD pose, degrees.')
    parser.add_argument('--step', type=float, default=10, help='Grid spacing, degrees.')
    parser.add_argument('--seconds', type=float, default=10)
    args = parser.parse_args()
    if args.radius < 0 or args.step <= 0 or args.seconds <= 0:
        parser.error('radius must be nonnegative; step and seconds must be positive')
    model = mujoco.MjModel.from_xml_path(str(SCENE))
    offsets = np.unique(np.r_[np.arange(-args.radius, args.radius+1e-8, args.step), 0.0])
    grids = []
    for index in (1, 2, 3):
        limits = model.joint(JOINTS[index]).range
        grids.append([float(a) for a in POSES['stand'][index]+offsets
                      if limits[0]-1e-8 <= np.deg2rad(a) <= limits[1]+1e-8])
    candidates = list(product(*grids))
    out = PROJECT_ROOT/'runs'/'find_balance'/datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    out.mkdir(parents=True)
    (out/'config.json').write_text(json.dumps(dict(vars(args), model=str(SCENE),
        max_tilt_deg=20, max_drift_m=.03, min_height_fraction=.8,
        final_speed_rms_m_s=.02, final_angular_speed_rms_rad_s=.2,
        final_height_range_m=.005, contact_policy='sole only'), indent=2)+'\n')
    winners = []
    print(f'Testing {len(candidates)} poses. Results: {out}', flush=True)
    with (out/'results.csv').open('w', newline='') as f:
        writer = None
        for i, angles in enumerate(candidates, 1):
            result = trial(model, *angles, seconds=args.seconds)
            if writer is None:
                writer = csv.DictWriter(f, fieldnames=list(result)); writer.writeheader()
            writer.writerow(result); f.flush()
            if result['stable']:
                winners.append(result)
            print(f"{i}/{len(candidates)} {angles}: {result['reason']} at {result['seconds']:.3f}s", flush=True)
    winners.sort(key=lambda r: (r['final_speed_rms_m_s'], r['max_tilt_deg']))
    (out/'stable_poses.json').write_text(json.dumps(winners, indent=2)+'\n')
    if winners:
        print(f'{len(winners)} stable poses. Best: {winners[0]}')
    else:
        print('No stable pose found. Inspect results.csv; this does not prove none exists.')


if __name__ == '__main__':
    main()
