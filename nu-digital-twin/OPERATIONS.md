# NU Digital Twin — Building & Operating the Interface

This document is the complete reference for Albert's workflow: how a building model moves
from a Rhino export to a positioned, locked 3D model on the live site, and how to operate
the interface day to day.

**Live site:** https://www.nu-digital-twin.com
**Repo:** https://github.com/Alvan360/NUBostonbuildings

---

## Part A — Albert's process: building the digital twin interface

This is the end-to-end process for adding (or correcting) a Rhino building model.

### A1. Overview of the pipeline

```
Rhino export (.glb)
        │
        ▼
public/models/<file>.glb                 (uploaded via admin panel)
        │
        ▼
public/buildings-data.js                  (one entry per building, source of truth)
        │  fields: name, lat/lng, height, color, polygon,
        │  model_file, rotation, mirrorX, mirrorY, shiftX, shiftY
        ▼
MapLibre custom layer ("three-buildings") → Three.js scene
        │
        ├─ OSM box  = raw polygon footprint (LOCKED, never moves for model buildings)
        └─ GLB model = baked with local transform matrix, positioned each frame
```

Key idea: **the polygon is the true footprint; the transform fields exist only to place the
model on top of it.** The OSM box is drawn from the raw polygon (never transformed), so
tuning the model never moves the box.

### A2. Prepare a Rhino model

1. Export from Rhino as **GLB** (binary). Use real-world units — **meters, 1:1 scale**. There
   is intentionally no scale slider; the model must already be in meters.
2. Set the model origin at a known corner of the building so you can align it precisely.
3. The pipeline assumes the Rhino model is **built lying on its side** (height along the Y
   axis): it is stood up automatically with a −90° rotation around X, turning Y-height into
   Z-height. If your export is already upright, see "Model conventions" in Part B.
4. Name the file without spaces, e.g. `churchill-hall.glb`, and place it in
   `public/models/` (or upload it through the admin panel — the panel does this for you).

### A3. Attach the model to a building

Two paths in admin mode (`?admin=1`, see B2):

**Existing building**
1. Open the Admin Panel (top-right) → **Import Model**.
2. Choose the `.glb` file.
3. Pick the building from the **existing building** dropdown.
4. Click **Upload & Attach**. The model loads immediately and is shown in red.

**New building (not yet on the map)**
1. In the Admin Panel → enter a **name** and **height**, then click **Place on map**.
2. Click the map where the building should sit. A ~30×30 m rectangle footprint is created
   (this rectangle is only used for click detection; the OSM layer shows no box).
3. The new building is selected in the dropdown. Now upload the `.glb` and click
   **Upload & Attach** as above.

### A4. Position and align the model

1. Make sure the **Rhino (Building)** layer is active (left panel). The OSM boxes hide and
   the red models show.
2. Click the building on the map. The info panel opens at the bottom with a
   **Position Model** section (admin only, only for buildings that have a model).
3. Use the controls — the model **rebuilds live** as you drag:
   - **Rotation (°)** — swings the model around the **first corner of the footprint polygon**
     (like a door hinge), not the building center. This makes alignment much easier.
   - **Mirror X / Mirror Y** — flips the model.
   - **Shift X / Shift Y (m)** — nudges the model in map (east / north) meters, applied
     *after* rotation so it never fights the rotation.
4. Fine-tune until the red model lines up with the basemap/OSM footprint.
5. Switch between **OSM Buildings** and **Rhino (Building)** layers freely to compare the
   model against the footprint — the box never moves while you tune.

### A5. Lock and export

Once aligned:
1. Click **Export buildings-data.js** in the Admin Panel. This downloads the current state
   of *all* buildings, including the tuned transform values for this model.
2. Commit to the repo:
   - the downloaded `public/buildings-data.js`
   - the `.glb` file(s) in `public/models/`
3. Push to GitHub. The OSM box for model buildings is already locked to the raw footprint,
   so future model tuning will never displace it.

### A6. Deploy

- Pushing to GitHub triggers Render to redeploy automatically (the service is a
  **Web Service**, not a Static Site).
- First-time setup on Render: set the `ADMIN_KEY` environment variable (see B4).

---

## Part B — Operating the interface

### B1. Normal (public) use

- **Layers** (left panel): `OSM Buildings` (extrusion footprints) and `Rhino (Building)`
  (the GLB models). Selecting one hides the other. `BIM` and `UBEM` are placeholders.
- **Search**: type a building name; click a result to fly to it.
- **Click a building**: shows an info panel (name, description, coordinates, height).
- **Screenshot** (camera button, bottom-left): downloads a PNG.
- **Home** (bottom-right): resets the camera to the default campus view.
- The compass bar at the top always shows north.

### B2. Admin mode

1. Open `https://www.nu-digital-twin.com/?admin=1` (append `?admin=1` to the URL).
   Normal visitors never see the login box without this.
2. Enter the passcode (the `ADMIN_KEY`). On success the Admin Panel appears on the
   **right side** — it is positioned there so the layer controls stay clickable.
3. A **gear button** appears bottom-left while logged in; it toggles the Admin Panel.
4. Session lasts 8 hours per token; **Log out** clears it.

Admin Panel contents:
| Control | Purpose |
|---------|---------|
| Choose `.glb` + building dropdown | Attach a model to an existing building |
| Name + height + **Place on map** | Create a new building footprint on the map |
| **Upload & Attach** | Upload the model and attach it |
| **Export buildings-data.js** | Download the current building data for committing |

### B3. Layer & transform behavior (reference)

- **OSM box (model buildings)**: drawn from the raw polygon. `rotation` / `mirrorX` /
  `mirrorY` / `shiftX` / `shiftY` are **ignored** for the box; they only place the model.
- **Transform order for the model** (mirror → rotate about pivot → shift → stand on ground):
  `localMat = zLift · shift · T(pivot) · rotation · T(−pivot) · mirror`
- **Rotation pivot**: the first vertex of the building's polygon, in meters relative to the
  building anchor (`lat/lng`).
- **Per-frame placement**: each mesh gets `translate(x, y) · scale(s, −s, s)` from the
  anchor's Mercator coordinate and meter scale.
- **GLB pipeline** (`loadRhinoModelData` in `public/app.js`): override materials (debug red) →
  flatten hierarchy (bake node transforms into geometry) → stand up (−90° X) → compute
  bounding box → bake `localMat` into the geometry → add meshes straight to the scene.
  Meshes are cached so live tuning rebuilds are instant.

### B4. Environment variables & deployment

| Variable | Purpose |
|----------|---------|
| `ADMIN_KEY` | Admin passcode. **Must be set in Render**; locally it falls back to `dev-admin-passcode` (with a warning in production). |
| `PORT` | Server port (Render sets this). |

- Render hosts the app as a **Web Service** with start command `node index.js` (the root
  `index.js` requires `src/server.js`).
- **Render's filesystem is ephemeral**: uploaded `.glb` files and the SQLite database reset
  on every deploy. Persistent data = `buildings-data.js` + `.glb` files committed to the
  repo. After any tuning, export and commit (A5).
- Custom domain: CNAME `www` → `nu-digital-twin.onrender.com`; A record for `@` from
  Render's IP.

### B5. Model conventions (important for exports)

- **Units**: meters, real-world scale. No scale field exists.
- **Orientation**: model is expected to lie flat (height along Y); the app stands it up.
  If your Rhino export is already upright, the model will render lying on its wall — this is
  the most common symptom to check first.
- **Origin**: set at a known building corner so shift/rotation align predictably.
- **Pivot**: rotation pivots on the first polygon corner — if you want a different corner,
  reorder the polygon's vertices in `buildings-data.js`.

### B6. Common issues & troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Model invisible on Rhino layer | Layer switch hides objects by `mesh.visible`; make sure the Rhino layer is active and the model was attached. |
| Model lying on its side | GLB exported upright — needs the standing rotation. Re-export flat, or adjust the stand-up in `loadRhinoModelData`. |
| Black model | Materials get overridden to red on load; if still black, check the GLB for non-standard materials. |
| Shift/rotation do nothing | Ensure the building has `model_file` and you are in admin mode; controls only appear for model buildings. |
| Box moved off footprint | For model buildings the box is raw-only; if a *non-model* box moved, its `rotation`/`mirror`/`shift` values changed. |
| Upload fails | File must be `.glb`/`.gltf` and ≤ 100 MB; admin token may have expired (log in again). |
| Admin login always fails | `ADMIN_KEY` mismatch; on Render check the env var, locally the default is `dev-admin-passcode`. |
| Changes disappear after deploy | Render wiped the ephemeral FS — commit `buildings-data.js` + `.glb` files to the repo. |
