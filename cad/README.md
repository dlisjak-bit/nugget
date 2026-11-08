# CAD snapshots

`c_v12/` contains the current C v12 ForgeCAD source and the vendor meshes that
it imports, copied from the existing project sources. Earlier design branches
and obsolete v2 MuJoCo files are outside this snapshot.

Source version:
https://forgecad.io/app/projects/39098efa-3bbf-41a2-9983-493faeace2fc/778999cf-bf78-4fe9-b662-cd1ae014b093

This is a source snapshot, not a live connection to ForgeCAD. The current local
MJCF package still comes from the saved GLB and `scripts/build_model.py`;
native ForgeCAD MJCF export has not yet been generated or tested. Updating CAD
alone does not update the local simulation model.
