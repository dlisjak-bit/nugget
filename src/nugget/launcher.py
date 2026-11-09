"""Portable lab launcher, including uv-managed Python on macOS.

mjpython normally dlopens the Python executable. uv's executable refers to
libpython via a relative rpath, which can break inside the mjpython app bundle.
When a shared library is available, load that exact library instead. Preserve
the virtualenv executable as argv[0], just as the upstream launcher does.
"""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import sys
import sysconfig

def launch():
    arguments = sys.argv[1:]
    if arguments == ["--check-runtime"]:
        arguments = [
            "-c",
            "import sys, mujoco, mujoco.viewer, nugget.viewer; "
            "print('MuJoCo launcher OK:', mujoco.__version__); "
            "print('Python environment:', sys.prefix)",
        ]
    else:
        module = "nugget.evaluation.standing" if "--policy" in arguments else "nugget.viewer"
        arguments = ["-m", module, *arguments]

    # Do not resolve the Python symlink: its venv path must remain argv[0].
    python = sys.executable
    if sys.platform != "darwin":
        os.execv(python, [python, *arguments])

    spec = importlib.util.find_spec("mujoco")
    if spec is None or spec.origin is None:
        raise SystemExit("MuJoCo is missing. Run: uv sync --locked")
    app = Path(spec.origin).parent / "MuJoCo_(mjpython).app/Contents/MacOS/mjpython"
    libdir = sysconfig.get_config_var("LIBDIR")
    library = sysconfig.get_config_var("LDLIBRARY")
    libpython = Path(libdir) / library if libdir and library else None
    if libpython is not None and libpython.is_file():
        env = os.environ.copy()
        env["MJPYTHON_BIN"] = str(app)
        env["MJPYTHON_LIBPYTHON"] = str(libpython)
        os.execve(str(app), [python, *arguments], env)

    # Other Python distributions may embed Python in the executable instead.
    vendor_launcher = Path(python).parent / "mjpython"
    os.execv(str(vendor_launcher), [str(vendor_launcher), *arguments])


if __name__ == "__main__":
    launch()
