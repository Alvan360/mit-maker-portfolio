const API = '/api/buildings';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  center: [-71.0875, 42.3403],
  zoom: 16,
  pitch: 55,
  bearing: -30,
  canvasContextAttributes: { antialias: true }
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
map.addControl(new maplibregl.ScaleControl());

// ---- Three.js custom layer (official MapLibre pattern) ----
const THREE = window.THREE;
let buildings = [];
let sceneObjects = [];

const customLayer = {
  id: 'three-buildings',
  type: 'custom',
  renderingMode: '3d',

  onAdd(map_, gl) {
    if (!this.scene) {
      this.camera = new THREE.Camera();
      this.camera.matrixAutoUpdate = false;
      this.camera.matrix.identity();
      this.camera.projectionMatrix.identity();

      this.scene = new THREE.Scene();
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dl = new THREE.DirectionalLight(0xffffff, 0.8);
      dl.position.set(0, -70, 100).normalize();
      this.scene.add(dl);
      const dl2 = new THREE.DirectionalLight(0xffffff, 0.3);
      dl2.position.set(0, 70, 100).normalize();
      this.scene.add(dl2);

      this.renderer = new THREE.WebGLRenderer({
        canvas: map_.getCanvas(),
        context: gl,
        antialias: true
      });
      this.renderer.autoClear = false;
    }

    this.map = map_;
    loadBuildings(this.scene);
  },

  render(gl, matrix) {
    this.camera.projectionMatrix.fromArray(matrix);

    for (const obj of sceneObjects) {
      const c = obj.mercCoord;
      const s = obj.meterScale;
      obj.transMat.identity().makeTranslation(c.x, c.y, 0);
      obj.transMat.scale(new THREE.Vector3(s, -s, s));
      obj.mesh.matrix.copy(obj.transMat);
      obj.mesh.matrixAutoUpdate = false;
      obj.mesh.matrixWorldNeedsUpdate = false;
    }

    for (const obj of rhinoObjects) {
      const c = obj.mercCoord;
      const s = obj.meterScale;
      obj.transMat.identity().makeTranslation(c.x, c.y, 0);
      obj.transMat.scale(new THREE.Vector3(s, -s, s));
      for (const mesh of obj.meshes) {
        mesh.matrix.copy(obj.transMat);
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldNeedsUpdate = true;
      }
    }

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
};

map.on('load', () => {
  map.addLayer(customLayer);
});

// ---- Extrusion builder ----
function lightenColor(hex, amount) {
  hex = hex.replace('#', '');
  const r = Math.min(255, parseInt(hex.substring(0, 2), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(hex.substring(2, 4), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(hex.substring(4, 6), 16) + Math.round(255 * amount));
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function buildExtrusion(polyMeters, heightMeters, color, id) {
  const shape = new THREE.Shape();
  polyMeters.forEach((p, i) => {
    if (i === 0) shape.moveTo(p[0], p[1]);
    else shape.lineTo(p[0], p[1]);
  });
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: heightMeters,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.05,
    bevelSegments: 1
  });
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: color || '#cccccc',
    metalness: 0.05,
    roughness: 0.8,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.buildingId = id;

  const roofGeo = new THREE.ShapeGeometry(shape);
  roofGeo.translate(0, 0, heightMeters);
  const roofMat = new THREE.MeshStandardMaterial({
    color: lightenColor(color || '#cccccc', 0.2),
    metalness: 0.05,
    roughness: 0.8,
    side: THREE.DoubleSide
  });
  mesh.add(new THREE.Mesh(roofGeo, roofMat));

  return mesh;
}

function rotatePoint(px, py, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [px * cos - py * sin, px * sin + py * cos];
}

function mirrorPoint(px, py, mx, my) {
  return [mx ? -px : px, my ? -py : py];
}

function shiftPoint(px, py, sx, sy) {
  return [px + sx, py + sy];
}

function buildAll(scene) {
  for (const obj of sceneObjects) {
    scene.remove(obj.mesh);
    obj.mesh.geometry.dispose();
    obj.mesh.material.dispose();
  }
  sceneObjects = [];

  for (const b of buildings) {
    const coord = maplibregl.MercatorCoordinate.fromLngLat([b.lng, b.lat], 0);
    const meterScale = coord.meterInMercatorCoordinateUnits();

    let polyMeters = b.polygon.map(pt => {
      const c = maplibregl.MercatorCoordinate.fromLngLat([pt[0], pt[1]], 0);
      return [(c.x - coord.x) / meterScale, (c.y - coord.y) / meterScale];
    });

    if (!b.model_file) {
      if (b.mirrorX || b.mirrorY) {
        polyMeters = polyMeters.map(p => mirrorPoint(p[0], p[1], b.mirrorX, b.mirrorY));
      }
      if (b.shiftX || b.shiftY) {
        polyMeters = polyMeters.map(p => shiftPoint(p[0], p[1], b.shiftX || 0, b.shiftY || 0));
      }
      if (b.rotation) {
        polyMeters = polyMeters.map(p => rotatePoint(p[0], p[1], b.rotation));
      }
    }

    const mesh = buildExtrusion(polyMeters, b.height, b.color, b.id);
    scene.add(mesh);
    sceneObjects.push({ id: b.id, mesh, mercCoord: coord, meterScale, transMat: new THREE.Matrix4(), polyMeters });
  }
}

async function loadBuildings(scene) {
  buildings = [...BUILDINGS_DATA];
  let api = [];
  try { api = await fetch(API).then(r => r.json()); } catch {}
  for (const a of api) {
    if (!buildings.find(x => x.id === a.id)) buildings.push(a);
  }
  buildAll(scene);
  if (isAdmin) populateBuildingDropdown();
}

// ---- Rhino (GLB) models ----
const rhinoObjects = [];
const gltfLoader = new THREE.GLTFLoader();
const rhinoCache = {}; // model_file -> { prep: [Mesh], box: Box3 } (flattened + stood up, no localMat)

function buildingFootprintCornerMeters(b) {
  if (!b.polygon || !b.polygon.length) return [0, 0];
  const coord = maplibregl.MercatorCoordinate.fromLngLat([b.lng, b.lat], 0);
  const meterScale = coord.meterInMercatorCoordinateUnits();
  const c = maplibregl.MercatorCoordinate.fromLngLat([b.polygon[0][0], b.polygon[0][1]], 0);
  return [(c.x - coord.x) / meterScale, (c.y - coord.y) / meterScale];
}

function computeRhinoLocalMat(b, box) {
  const [px, py] = buildingFootprintCornerMeters(b);
  const localMat = new THREE.Matrix4();
  const zLift = new THREE.Matrix4().makeTranslation(0, 0, -box.min.z);
  const rotMat = new THREE.Matrix4().makeRotationZ((b.rotation || 0) * Math.PI / 180);
  const rotXMat = new THREE.Matrix4().makeRotationX((b.rotX || 0) * Math.PI / 180);
  const rotYMat = new THREE.Matrix4().makeRotationY((b.rotY || 0) * Math.PI / 180);
  const shiftMat = new THREE.Matrix4().makeTranslation(b.shiftX || 0, b.shiftY || 0, 0);
  const mirrorMat = new THREE.Matrix4().makeScale(b.mirrorX ? -1 : 1, b.mirrorY ? -1 : 1, 1);
  const toPivot = new THREE.Matrix4().makeTranslation(px, py, 0);
  const fromPivot = new THREE.Matrix4().makeTranslation(-px, -py, 0);

  // Rotate X/Y about the model's own center so flips stay in place
  const cx = (box.min.x + box.max.x) / 2 * (b.mirrorX ? -1 : 1);
  const cy = (box.min.y + box.max.y) / 2 * (b.mirrorY ? -1 : 1);
  const cz = (box.min.z + box.max.z) / 2;
  const toCenter = new THREE.Matrix4().makeTranslation(cx, cy, cz);
  const fromCenter = new THREE.Matrix4().makeTranslation(-cx, -cy, -cz);

  localMat
    .multiply(zLift)
    .multiply(shiftMat)
    .multiply(toPivot)
    .multiply(rotMat)
    .multiply(fromPivot)
    .multiply(toCenter)
    .multiply(rotYMat)
    .multiply(rotXMat)
    .multiply(fromCenter)
    .multiply(mirrorMat);
  return localMat;
}

async function loadRhinoModelData(model_file) {
  if (rhinoCache[model_file]) return rhinoCache[model_file];

  const gltf = await new Promise((resolve, reject) => {
    gltfLoader.load(`/models/${model_file}`, resolve, undefined, reject);
  });
  const group = gltf.scene;

  // Fix black materials
  group.traverse(child => {
    if (child.isMesh) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        metalness: 0.1,
        roughness: 0.7,
        side: THREE.DoubleSide
      });
    }
  });

  // Flatten hierarchy: bake all node transforms into geometry
  const flattened = [];
  group.traverse(child => {
    if (child.isMesh) {
      child.updateMatrixWorld(true);
      const geo = child.geometry.clone();
      geo.applyMatrix4(child.matrixWorld);
      flattened.push(new THREE.Mesh(geo, child.material));
    }
  });

  // Stand the model up: rotate -90° around X so the Y-height becomes Z-height
  const standUp = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const prep = flattened.map(m => {
    const geo = m.geometry.clone();
    geo.applyMatrix4(standUp);
    return new THREE.Mesh(geo, m.material);
  });

  const box = new THREE.Box3();
  prep.forEach(m => box.expandByObject(m));

  rhinoCache[model_file] = { prep, box };
  return rhinoCache[model_file];
}

function buildRhinoMeshes(b, data, scene) {
  const localMat = computeRhinoLocalMat(b, data.box);
  const meshes = [];
  data.prep.forEach(p => {
    const geo = p.geometry.clone();
    geo.applyMatrix4(localMat);
    const m = new THREE.Mesh(geo, p.material);
    scene.add(m);
    meshes.push(m);
  });
  return meshes;
}

async function loadRhinoModels(scene) {
  if (rhinoObjects.length) return;
  for (const b of buildings) {
    if (!b.model_file) continue;
    try {
      const data = await loadRhinoModelData(b.model_file);
      const meshes = buildRhinoMeshes(b, data, scene);

      console.log('Rhino model loaded:', b.name, 'meshes:', meshes.length, 'bbox:', data.box.min.toArray(), data.box.max.toArray());

      const coord = maplibregl.MercatorCoordinate.fromLngLat([b.lng, b.lat], 0);
      const meterScale = coord.meterInMercatorCoordinateUnits();
      rhinoObjects.push({ id: b.id, meshes, mercCoord: coord, meterScale, transMat: new THREE.Matrix4() });
    } catch (err) {
      console.warn('Failed to load GLB:', b.model_file, err);
    }
  }
}

async function rebuildRhinoModel(id) {
  const b = buildings.find(x => x.id === id);
  if (!b || !b.model_file) return;

  const scene = customLayer.scene;
  const idx = rhinoObjects.findIndex(o => o.id === id);
  if (idx >= 0) {
    for (const m of rhinoObjects[idx].meshes) {
      scene.remove(m);
      m.geometry.dispose();
    }
    rhinoObjects.splice(idx, 1);
  }

  try {
    const data = await loadRhinoModelData(b.model_file);
    const meshes = buildRhinoMeshes(b, data, scene);
    const coord = maplibregl.MercatorCoordinate.fromLngLat([b.lng, b.lat], 0);
    const meterScale = coord.meterInMercatorCoordinateUnits();
    rhinoObjects.push({ id, meshes, mercCoord: coord, meterScale, transMat: new THREE.Matrix4() });
    setRhinoVisibility(activeLayer === 'Rhino (Building)');
    if (selectedBuildingId === id) populateTransformControls(b);
  } catch (err) {
    console.warn('Rebuild failed for', b.name, err);
    toast('Failed to rebuild model', true);
  }
}

function setRhinoVisibility(visible) {
  for (const obj of rhinoObjects) {
    for (const mesh of obj.meshes) {
      mesh.visible = visible;
    }
  }
}

// ---- Compass overlay markers ----
let compassMarkers = [];

function getEdgeMidpoints(polyPoints) {
  const midpoints = [];
  for (let i = 0; i < polyPoints.length - 1; i++) {
    const a = polyPoints[i];
    const b = polyPoints[i + 1];
    midpoints.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return midpoints;
}

function edgeBearing(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let deg = Math.atan2(dx, dy) * 180 / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}

function bearingLabel(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function showCompassOverlay(b) {
  clearCompassOverlay();
  const obj = sceneObjects.find(o => o.id === b.id);
  if (!obj || !obj.polyMeters) return;

  const midpoints = getEdgeMidpoints(obj.polyMeters);
  const directions = ['N','E','S','W','NE','SE','SW','NW'];

  midpoints.forEach((mp, i) => {
    const nextPt = obj.polyMeters[(i + 1) % (obj.polyMeters.length - 1)];
    const bearing = edgeBearing(mp, nextPt);
    const label = bearingLabel(bearing);

    const lngLat = meterToLngLat(mp, obj);

    const el = document.createElement('div');
    el.style.cssText = 'background:rgba(255,255,255,0.9);color:#222;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;pointer-events:none;text-align:center;min-width:20px;';
    el.textContent = label;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat(lngLat)
      .addTo(map);
    marker.getElement().style.pointerEvents = 'none';
    compassMarkers.push(marker);
  });
}

function meterToLngLat(meterPt, obj) {
  const mercX = obj.mercCoord.x + meterPt[0] * obj.meterScale;
  const mercY = obj.mercCoord.y + meterPt[1] * obj.meterScale;
  const coord = new maplibregl.MercatorCoordinate(mercX, mercY, 0);
  const ll = coord.toLngLat();
  return [ll.lng, ll.lat];
}

function clearCompassOverlay() {
  compassMarkers.forEach(m => m.remove());
  compassMarkers = [];
}

// ---- Rebuild a single building ----
function rebuildSingleBuilding(buildingId) {
  const b = buildings.find(x => x.id === buildingId);
  if (!b) return;
  const obj = sceneObjects.find(o => o.id === buildingId);
  if (!obj) return;

  const coord = maplibregl.MercatorCoordinate.fromLngLat([b.lng, b.lat], 0);
  const meterScale = coord.meterInMercatorCoordinateUnits();

  let polyMeters = b.polygon.map(pt => {
    const c = maplibregl.MercatorCoordinate.fromLngLat([pt[0], pt[1]], 0);
    return [(c.x - coord.x) / meterScale, (c.y - coord.y) / meterScale];
  });

  if (b.mirrorX || b.mirrorY) {
    polyMeters = polyMeters.map(p => mirrorPoint(p[0], p[1], b.mirrorX, b.mirrorY));
  }
  if (b.shiftX || b.shiftY) {
    polyMeters = polyMeters.map(p => shiftPoint(p[0], p[1], b.shiftX || 0, b.shiftY || 0));
  }
  if (b.rotation) {
    polyMeters = polyMeters.map(p => rotatePoint(p[0], p[1], b.rotation));
  }

  const scene = customLayer.scene;
  scene.remove(obj.mesh);
  obj.mesh.geometry.dispose();
  obj.mesh.material.dispose();

  const mesh = buildExtrusion(polyMeters, b.height, b.color, b.id);
  scene.add(mesh);
  obj.mesh = mesh;
  obj.polyMeters = polyMeters;
}

// ---- Point-in-polygon (ray-casting) ----
function pointInPolygon(point, polygon) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ---- Click ----
let popup = null;
let selectedBuildingId = null;
map.on('click', (e) => {
  if (placingNewBuilding) {
    placeNewBuilding(e.lngLat.lng, e.lngLat.lat);
    return;
  }

  if (popup) { popup.remove(); popup = null; }
  selectedBuildingId = null;

  const ll = map.unproject(e.point);
  let hit = null;
  for (const b of buildings) {
    if (!b.polygon) continue;
    if (pointInPolygon([ll.lng, ll.lat], b.polygon)) { hit = b; break; }
  }

  if (hit) {
    selectedBuildingId = hit.id;
    showBuildingInfo(hit);
    popup = new maplibregl.Popup({ offset: 25 })
      .setLngLat([hit.lng, hit.lat])
      .setHTML(`<b>${esc(hit.name)}</b><br>${hit.height}m tall`)
      .addTo(map);
  } else {
    document.getElementById('info-panel').classList.add('hidden');
  }
});

// ---- UI ----
function populateTransformControls(b) {
  const section = document.getElementById('admin-transform-section');
  if (!isAdmin) { section.classList.add('hidden'); return; }
  if (!b || !b.model_file) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  const rot = b.rotation || 0;
  document.getElementById('t-rot').value = rot;
  document.getElementById('t-rot-input').value = rot;
  setSlider('t-shiftx', 't-shiftx-val', b.shiftX || 0);
  setSlider('t-shifty', 't-shifty-val', b.shiftY || 0);
  updateMirrorButtons(b.mirrorX, b.mirrorY);
  updateFlipButtons(b.rotX || 0, b.rotY || 0);
}

function showBuildingInfo(b) {
  document.getElementById('info-content').innerHTML = `
    ${b.image_file ? `<img class="info-img" src="/uploads/${b.image_file}" />` : ''}
    <h2>${esc(b.name)}</h2>
    <p>${esc(b.description || '')}</p>
    <p>${b.lat.toFixed(6)}, ${b.lng.toFixed(6)} | ${b.height}m</p>`;
  document.getElementById('info-panel').classList.remove('hidden');
  populateTransformControls(b);
}

document.getElementById('close-panel').onclick = () => {
  document.getElementById('info-panel').classList.add('hidden');
  selectedBuildingId = null;
};

function toast(msg, err) {
  let t = document.getElementById('t');
  if (!t) { t = Object.assign(document.createElement('div'), { id: 't' });
    t.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:99;background:rgba(30,30,38,0.95);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 20px;font-size:13px;color:#fff;opacity:0;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = 1; setTimeout(() => t.style.opacity = 0, 2500);
}

document.querySelectorAll('.collapsible-header').forEach(h =>
  h.onclick = () => { const b = h.parentElement.querySelector('.collapsible-body');
    b.style.display = b.style.display === 'none' ? 'flex' : 'none';
    h.parentElement.classList.toggle('expanded'); }
);
document.getElementById('btn-home').onclick = () =>
  map.flyTo({ center: [-71.0875, 42.3403], zoom: 16, pitch: 55, bearing: -30, duration: 1200 });

// ---- Resources panel toggle ----
document.getElementById('btn-resources').onclick = () => {
  document.getElementById('right-panel').classList.toggle('hidden');
};

// ---- Basemap switcher ----
const basemaps = {
  street: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  satellite: {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: 'Esri, Maxar, Earthstar Geographics'
      }
    },
    layers: [{ id: 'esri', type: 'raster', source: 'esri' }]
  },
  terrain: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: 'OpenStreetMap'
      },
      terrain: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium'
      }
    },
    terrain: { source: 'terrain', exaggeration: 1.5 },
    layers: [
      { id: 'osm', type: 'raster', source: 'osm' },
      { id: 'hills', type: 'hillshade', source: 'terrain',
        layout: { visibility: 'visible' },
        paint: { 'hillshade-shadow-color': '#473B24' }
      }
    ]
  }
};

const basemapPopup = document.getElementById('basemap-popup');
let basemapActive = 'street';

document.getElementById('btn-layers').onclick = () => {
  basemapPopup.classList.toggle('hidden');
};

document.querySelectorAll('.basemap-option').forEach(opt => {
  opt.onclick = () => {
    const key = opt.dataset.style;
    if (key === basemapActive) { basemapPopup.classList.add('hidden'); return; }

    document.querySelectorAll('.basemap-option').forEach(o => o.classList.remove('active-basemap'));
    opt.classList.add('active-basemap');
    basemapActive = key;

    map.setStyle(basemaps[key]);
    map.once('style.load', () => {
      map.addLayer(customLayer);
    });
    basemapPopup.classList.add('hidden');
    toast('Switched to ' + key.charAt(0).toUpperCase() + key.slice(1));
  };
});

// Close basemap popup when clicking elsewhere
document.addEventListener('click', (e) => {
  if (!e.target.closest('#basemap-popup') && !e.target.closest('#btn-layers')) {
    basemapPopup.classList.add('hidden');
  }
});

// ---- Controls panel ----
const controlData = {
  energy:   { title: 'Energy',   text: 'To display energy information' },
  thermal:  { title: 'Thermal Comfort', text: 'To display thermal data' },
  wind:     { title: 'Wind',     text: 'To display wind data' },
  solar:    { title: 'Solar',    text: 'To display solar data' }
};

const controlsPanel = document.getElementById('controls-panel');
const controlsContent = document.getElementById('controls-content');
let activeControl = null;

document.querySelectorAll('.control-item').forEach(item => {
  item.onclick = (e) => {
    if (e.target.closest('.toggle-switch')) return;
    const key = item.dataset.control;
    const data = controlData[key];
    if (!data) return;

    document.querySelectorAll('.control-item').forEach(i => i.classList.remove('active-control'));

    if (activeControl === key) {
      controlsPanel.classList.add('hidden');
      activeControl = null;
      return;
    }

    item.classList.add('active-control');
    activeControl = key;
    controlsContent.innerHTML = `<h4>${data.title}</h4><p>${data.text}</p>`;
    controlsPanel.classList.remove('hidden');
  };
});

document.getElementById('controls-close').onclick = () => {
  controlsPanel.classList.add('hidden');
  document.querySelectorAll('.control-item').forEach(i => i.classList.remove('active-control'));
  activeControl = null;
};

document.getElementById('solar-toggle').addEventListener('change', (e) => {
  const on = e.target.checked;
  toast(on ? 'Sun tracking enabled' : 'Sun tracking disabled');
});
document.getElementById('btn-camera').onclick = () =>
  map.getCanvas().toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'twin.png'; a.click(); });
// ---- Layer switching ----
let activeLayer = 'OSM Buildings';

function setOSMObjectsVisibility(visible) {
  for (const obj of sceneObjects) {
    obj.mesh.visible = visible;
  }
}

document.querySelectorAll('.layer-item:not(.control-item)').forEach(item => {
  item.onclick = () => {
    const label = item.querySelector('.layer-label').textContent.trim();

    // Deselect all items across both groups
    document.querySelectorAll('.layer-item').forEach(i => {
      i.classList.remove('active-item');
      const dot = i.querySelector('.active-dot');
      if (dot) dot.remove();
    });

    // Activate clicked item
    item.classList.add('active-item');
    const dot = document.createElement('span');
    dot.className = 'active-dot';
    item.appendChild(dot);

    activeLayer = label;
    setOSMObjectsVisibility(label === 'OSM Buildings');

    if (label === 'Rhino (Building)') {
      loadRhinoModels(customLayer.scene).then(() => setRhinoVisibility(true));
    } else {
      setRhinoVisibility(false);
    }
  };
});

// ---- Search ----
const searchPopup = document.createElement('div');
searchPopup.id = 'search-popup';
document.getElementById('search-wrapper').appendChild(searchPopup);

const searchInput = document.getElementById('search-input');
let searchBlurTimeout = null;

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchPopup.style.display = 'none'; return; }

  const results = buildings.filter(b => b.name.toLowerCase().includes(q)).slice(0, 10);

  searchPopup.innerHTML = '';
  if (!results.length) {
    searchPopup.innerHTML = '<div class="search-no-results">No results</div>';
  } else {
    results.forEach(b => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.textContent = `${b.name}  (${b.height}m)`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        searchPopup.style.display = 'none';
        searchInput.value = '';
        map.flyTo({ center: [b.lng, b.lat], zoom: 17, duration: 1200 });
        showBuildingInfo(b);
        if (popup) popup.remove();
        popup = new maplibregl.Popup({ offset: 25 })
          .setLngLat([b.lng, b.lat])
          .setHTML(`<b>${esc(b.name)}</b><br>${b.height}m tall`)
          .addTo(map);
      });
      searchPopup.appendChild(item);
    });
  }
  searchPopup.style.display = 'block';
});

searchInput.addEventListener('blur', () => {
  searchBlurTimeout = setTimeout(() => { searchPopup.style.display = 'none'; }, 200);
});
searchInput.addEventListener('focus', () => {
  if (searchBlurTimeout) clearTimeout(searchBlurTimeout);
  if (searchInput.value.trim()) searchInput.dispatchEvent(new Event('input'));
});



// ---- Compass bar ----
const compassTrack = document.getElementById('compass-track');
const directions = [
  { deg: 0, label: 'N', cardinal: true },
  { deg: 45, label: 'NE', cardinal: false },
  { deg: 90, label: 'E', cardinal: true },
  { deg: 135, label: 'SE', cardinal: false },
  { deg: 180, label: 'S', cardinal: true },
  { deg: 225, label: 'SW', cardinal: false },
  { deg: 270, label: 'W', cardinal: true },
  { deg: 315, label: 'NW', cardinal: false },
];
const pxPerDeg = 2400 / 360;
const copyWidth = 2400;
const totalCopies = 3;
const totalWidth = copyWidth * totalCopies;

// Build 3 copies of the track so it wraps smoothly
for (let copy = 0; copy < totalCopies; copy++) {
  const offsetX = copy * copyWidth;
  for (let deg = 0; deg < 360; deg += 5) {
    const tick = document.createElement('div');
    tick.className = 'compass-tick ' + (deg % 45 === 0 ? 'major' : 'minor');
    tick.style.left = (offsetX + deg * pxPerDeg) + 'px';
    compassTrack.appendChild(tick);
  }
  directions.forEach(d => {
    const label = document.createElement('div');
    label.className = 'compass-label' + (d.cardinal ? ' cardinal' : '');
    label.style.left = (offsetX + d.deg * pxPerDeg) + 'px';
    label.textContent = d.label;
    compassTrack.appendChild(label);
  });
}

compassTrack.style.width = totalWidth + 'px';

let lastBearing = null;
let continuousOffset = 0;

function updateCompass() {
  const bearing = map.getBearing();
  if (lastBearing !== null) {
    let delta = bearing - lastBearing;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    continuousOffset += delta;
  }
  lastBearing = bearing;

  const pos = continuousOffset * pxPerDeg;
  const offset = 300 - copyWidth - pos;
  compassTrack.style.transform = `translateX(${offset}px)`;
}
map.on('rotate', updateCompass);
updateCompass();
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ================= ADMIN =================
const ADMIN_API = '/api/admin';
let isAdmin = false;
let adminToken = sessionStorage.getItem('nuAdminToken') || null;
let placingNewBuilding = false;
let adminNewBuildingId = null;
let pendingModelFile = null;

const urlParams = new URLSearchParams(location.search);
if (urlParams.get('admin') === '1') {
  if (adminToken) {
    verifyAdmin().then(ok => { if (ok) openAdminPanel(); else showAdminLogin(); });
  } else {
    showAdminLogin();
  }
}

function showAdminLogin() {
  document.getElementById('admin-login').classList.remove('hidden');
  document.getElementById('admin-passcode').focus();
}
function hideAdminLogin() {
  document.getElementById('admin-login').classList.add('hidden');
}
function adminFetch(url, opts = {}) {
  opts.headers = Object.assign({}, opts.headers);
  if (adminToken) opts.headers.Authorization = 'Bearer ' + adminToken;
  return fetch(url, opts);
}
async function verifyAdmin() {
  try {
    const r = await adminFetch(`${ADMIN_API}/auth/verify`);
    return r.ok;
  } catch { return false; }
}

document.getElementById('admin-login-btn').onclick = async () => {
  const passcode = document.getElementById('admin-passcode').value;
  document.getElementById('admin-login-error').textContent = '';
  try {
    const r = await fetch(`${ADMIN_API}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode })
    });
    if (!r.ok) { document.getElementById('admin-login-error').textContent = 'Invalid passcode'; return; }
    const data = await r.json();
    adminToken = data.token;
    sessionStorage.setItem('nuAdminToken', adminToken);
    hideAdminLogin();
    openAdminPanel();
  } catch {
    document.getElementById('admin-login-error').textContent = 'Login failed';
  }
};
document.getElementById('admin-passcode').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('admin-login-btn').click();
});

function openAdminPanel() {
  isAdmin = true;
  document.body.classList.add('admin-mode');
  document.getElementById('admin-panel').classList.remove('hidden');
  populateBuildingDropdown();
  toast('Admin mode enabled');
  if (selectedBuildingId) {
    const b = buildings.find(x => x.id === selectedBuildingId);
    if (b) populateTransformControls(b);
  }
}
document.getElementById('admin-close').onclick = () => {
  document.getElementById('admin-panel').classList.add('hidden');
};
document.getElementById('btn-admin').onclick = () => {
  const panel = document.getElementById('admin-panel');
  const willOpen = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (willOpen) populateBuildingDropdown();
};
document.getElementById('admin-logout').onclick = () => {
  adminToken = null;
  isAdmin = false;
  sessionStorage.removeItem('nuAdminToken');
  document.body.classList.remove('admin-mode');
  document.getElementById('admin-panel').classList.add('hidden');
  document.getElementById('admin-transform-section').classList.add('hidden');
  toast('Logged out');
};

function populateBuildingDropdown() {
  const sel = document.getElementById('admin-target-building');
  sel.innerHTML = '<option value="">-- existing building --</option>';
  buildings.forEach(b => {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = `${b.name}${b.model_file ? ' (has model)' : ''}`;
    sel.appendChild(o);
  });
}

function refreshBuildingDropdown() {
  const sel = document.getElementById('admin-target-building');
  const prev = sel.value;
  populateBuildingDropdown();
  if (prev) sel.value = prev;
}

const adminBuildingSelect = document.getElementById('admin-target-building');
adminBuildingSelect.addEventListener('mousedown', () => { if (isAdmin) refreshBuildingDropdown(); });
adminBuildingSelect.addEventListener('focus', () => { if (isAdmin) refreshBuildingDropdown(); });

// New building placement
document.getElementById('admin-new-place').onclick = () => {
  const name = document.getElementById('admin-new-name').value.trim();
  if (!name) { toast('Enter a building name first', true); return; }
  placingNewBuilding = true;
  toast('Click on the map to place the building');
};

function placeNewBuilding(lng, lat) {
  placingNewBuilding = false;
  const name = document.getElementById('admin-new-name').value.trim();
  const height = parseFloat(document.getElementById('admin-new-height').value) || 20;
  const id = Date.now();

  const b = {
    id,
    name,
    lat,
    lng,
    height,
    color: '#cccccc',
    rotation: 0,
    rotX: 0,
    rotY: 0,
    mirrorX: 0,
    mirrorY: 0,
    shiftX: 0,
    shiftY: 0,
    polygon: rectanglePolygon(lng, lat, 15, 15)
  };
  buildings.push(b);
  adminNewBuildingId = id;

  buildAll(customLayer.scene);
  populateBuildingDropdown();
  document.getElementById('admin-target-building').value = id;
  map.flyTo({ center: [lng, lat], zoom: 17, duration: 800 });
  toast(`Placed "${name}" — now upload a model and attach`);
}

function rectanglePolygon(lng, lat, halfW, halfD) {
  const coord = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
  const s = coord.meterInMercatorCoordinateUnits();
  return [
    [-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]
  ].map(([dx, dy]) => {
    const c = new maplibregl.MercatorCoordinate(coord.x + dx * s, coord.y + dy * s);
    const ll = c.toLngLat();
    return [ll.lng, ll.lat];
  });
}

// Upload & attach model
document.getElementById('admin-attach').onclick = async () => {
  const fileInput = document.getElementById('admin-model-file');
  const file = fileInput.files[0];
  if (!file) { toast('Choose a .glb file first', true); return; }

  let targetId = null;
  const selVal = document.getElementById('admin-target-building').value;
  if (selVal) targetId = parseInt(selVal, 10);
  if (!targetId && adminNewBuildingId) targetId = adminNewBuildingId;
  if (!targetId) { toast('Pick an existing building or create a new one first', true); return; }

  const b = buildings.find(x => x.id === targetId);
  if (!b) { toast('Target building not found', true); return; }

  const fd = new FormData();
  fd.append('model', file);

  try {
    const r = await adminFetch(`${ADMIN_API}/models`, { method: 'POST', body: fd });
    if (!r.ok) { toast('Upload failed', true); return; }
    const data = await r.json();
    b.model_file = data.filename;
    toast(`Attached ${data.filename} to ${b.name}`);
    await rebuildRhinoModel(b.id);
    populateBuildingDropdown();
    if (selectedBuildingId === b.id) populateTransformControls(b);
    fileInput.value = '';
    pendingModelFile = null;
  } catch {
    toast('Upload failed', true);
  }
};

// Remove model from building
document.getElementById('admin-remove-model').onclick = async () => {
  const selVal = document.getElementById('admin-target-building').value;
  const targetId = selVal ? parseInt(selVal, 10) : null;
  const b = targetId ? buildings.find(x => x.id === targetId) : null;
  if (!b || !b.model_file) { toast('No model attached to this building', true); return; }

  if (!window.confirm(`Remove the model from "${b.name}"? The uploaded file will also be deleted.`)) return;
  const filename = b.model_file;

  const idx = rhinoObjects.findIndex(o => o.id === b.id);
  if (idx >= 0) {
    for (const m of rhinoObjects[idx].meshes) {
      customLayer.scene.remove(m);
      m.geometry.dispose();
    }
    rhinoObjects.splice(idx, 1);
  }

  delete b.model_file;
  delete b.modelYUp;
  if (selectedBuildingId === b.id) populateTransformControls(b);
  populateBuildingDropdown();
  toast(`Removed model from ${b.name}`);

  try {
    const r = await adminFetch(`${ADMIN_API}/models/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    if (!r.ok) console.warn('Failed to delete model file:', filename);
  } catch {
    console.warn('Failed to delete model file:', filename);
  }
};

// Export buildings-data.js
document.getElementById('admin-export').onclick = () => {
  const lines = ['const BUILDINGS_DATA = ['];
  buildings.forEach((b, i) => {
    const copy = { ...b };
    delete copy.description;
    lines.push(JSON.stringify(copy, null, 2) + (i < buildings.length - 1 ? ',' : ''));
  });
  lines.push('];');
  const blob = new Blob([lines.join('\n')], { type: 'text/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'buildings-data.js';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Exported — commit this file and any new .glb models to the repo');
};

// Transform controls
let transformDebounce = null;
function setSlider(sliderId, valId, value) {
  const sl = document.getElementById(sliderId);
  const vl = document.getElementById(valId);
  sl.value = value;
  vl.textContent = value;
}
function updateMirrorButtons(mx, my) {
  document.getElementById('t-mirror-x').classList.toggle('active', !!mx);
  document.getElementById('t-mirror-y').classList.toggle('active', !!my);
}
function applyTransform() {
  if (!selectedBuildingId) return;
  const b = buildings.find(x => x.id === selectedBuildingId);
  if (!b) return;
  b.rotation = parseFloat(document.getElementById('t-rot').value);
  b.shiftX = parseFloat(document.getElementById('t-shiftx').value);
  b.shiftY = parseFloat(document.getElementById('t-shifty').value);
  document.getElementById('t-rot-input').value = b.rotation;
  setSlider('t-shiftx', 't-shiftx-val', b.shiftX);
  setSlider('t-shifty', 't-shifty-val', b.shiftY);
  clearTimeout(transformDebounce);
  transformDebounce = setTimeout(() => rebuildRhinoModel(b.id), 120);
}
['t-rot', 't-shiftx', 't-shifty'].forEach(id => {
  document.getElementById(id).addEventListener('input', applyTransform);
});
document.getElementById('t-rot-input').addEventListener('change', () => {
  if (!selectedBuildingId) return;
  let v = parseFloat(document.getElementById('t-rot-input').value);
  if (isNaN(v)) v = 0;
  v = Math.max(-180, Math.min(180, Math.round(v)));
  document.getElementById('t-rot').value = v;
  document.getElementById('t-rot-input').value = v;
  applyTransform();
});
function updateFlipButtons(fx, fy) {
  document.getElementById('t-flip-x').classList.toggle('active', Math.abs(fx) === 180);
  document.getElementById('t-flip-y').classList.toggle('active', Math.abs(fy) === 180);
}
function toggleFlip(axis) {
  if (!selectedBuildingId) return;
  const b = buildings.find(x => x.id === selectedBuildingId);
  if (!b) return;
  if (axis === 'x') b.rotX = (b.rotX || 0) === 180 ? 0 : 180;
  else b.rotY = (b.rotY || 0) === 180 ? 0 : 180;
  updateFlipButtons(b.rotX || 0, b.rotY || 0);
  rebuildRhinoModel(b.id);
}
function toggleMirror(axis) {
  if (!selectedBuildingId) return;
  const b = buildings.find(x => x.id === selectedBuildingId);
  if (!b) return;
  if (axis === 'x') b.mirrorX = b.mirrorX ? 0 : 1;
  else b.mirrorY = b.mirrorY ? 0 : 1;
  updateMirrorButtons(b.mirrorX, b.mirrorY);
  rebuildRhinoModel(b.id);
}
document.getElementById('t-mirror-x').onclick = () => toggleMirror('x');
document.getElementById('t-mirror-y').onclick = () => toggleMirror('y');
document.getElementById('t-flip-x').onclick = () => toggleFlip('x');
document.getElementById('t-flip-y').onclick = () => toggleFlip('y');
