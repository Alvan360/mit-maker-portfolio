# MIT Maker Portfolio

## Projects

### 1. Boston Common Shadow Study (Civic Data & Automation)
* **Context:** Developed during my internship with Prof. Segal for the Friends of the Public Garden.  
* **Description:** A high-impact civic project analyzing shadow impacts on Boston Common vegetation to inform local public policy.

**Key Technical Contributions:**
- **Tree Canopy Mapping:** Used open-source tree data and an AI assistant to script an interactive HTML map (`boston_common_map.html`) plotting every tree in the Common with dynamically scaled, organic canopy blobs.
- **Workflow Automation:** Wrote custom Python/Illustrator automation scripts to process and count thousands of tangled vector shadow intersection regions that were impossible to manage manually.

**Files:**
- [`boston-common-shadow-study/boston_common_map.html`](boston-common-shadow-study/boston_common_map.html) — Interactive tree/canopy map
- [`boston-common-shadow-study/boston_common_map_clean.html`](boston-common-shadow-study/boston_common_map_clean.html) — Clean version of the map
- [`boston-common-shadow-study/accumulative.jsx`](boston-common-shadow-study/accumulative.jsx) — Illustrator automation script
- [`boston-common-shadow-study/categorizedivisions.jsx`](boston-common-shadow-study/categorizedivisions.jsx) — Illustrator automation script
- [`boston-common-shadow-study/photoshop-shadow-isolater.jsx`](boston-common-shadow-study/photoshop-shadow-isolater.jsx) — Illustrator automation script
- [`boston-common-shadow-study/selecthours.jsx`](boston-common-shadow-study/selecthours.jsx) — Illustrator automation script

### 2. NU Digital Twin (Boston Buildings)
* **Context:** Interactive 3D digital twin of Northeastern University's Boston campus.
* **Description:** A web-based platform for exploring building extrusions, toggling map layers, inspecting building details, and capturing screenshots.

**Key Features:**
- 68 building extrusions with polygon footprints from OpenStreetMap
- 3D rendering with Three.js on a MapLibre GL map
- Searchable building list, layer toggles, building info panels, screenshot capture
- Admin/import workflows for adding/updating buildings and 3D models

**Tech Stack:** MapLibre GL JS, Three.js, Express.js, better-sqlite3, Multer, Turf.js

**Links:** [Live Site](https://www.nu-digital-twin.com) | [Project README](nu-digital-twin/README.md)

**Location:** [`nu-digital-twin/`](nu-digital-twin/)
