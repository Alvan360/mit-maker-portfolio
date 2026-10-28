const express = require('express');
const multer = require('multer');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Admin auth (passcode gate) ----
const ADMIN_KEY = process.env.ADMIN_KEY || 'dev-admin-passcode';
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_KEY) {
  console.warn('WARNING: ADMIN_KEY not set. Using insecure default. Set ADMIN_KEY in Render env vars.');
}
const adminTokens = new Map(); // token -> expiry (ms)
const TOKEN_TTL = 8 * 60 * 60 * 1000; // 8 hours

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const exp = adminTokens.get(token);
  if (!exp || exp < Date.now()) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
const modelDir = path.join(__dirname, '..', 'public', 'models');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(modelDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'model') cb(null, modelDir);
    else cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.glb', '.gltf', '.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`File type ${ext} not allowed`));
  }
});

app.post('/api/buildings', upload.fields([
  { name: 'model', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), (req, res) => {
  try {
    const { name, description, lat, lng, height, color, type } = req.body;
    if (!name || !lat || !lng) {
      return res.status(400).json({ error: 'name, lat, lng required' });
    }

    const building = db.prepare(`
      INSERT INTO buildings (name, description, lat, lng, height, color, type, model_file, image_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      description || '',
      parseFloat(lat),
      parseFloat(lng),
      parseFloat(height) || 20,
      color || '#4a90d9',
      type || 'BIM',
      req.files?.model?.[0]?.filename || null,
      req.files?.image?.[0]?.filename || null
    );

    res.json({ id: building.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/buildings', (req, res) => {
  const buildings = db.prepare('SELECT * FROM buildings ORDER BY created_at DESC').all();
  res.json(buildings);
});

app.get('/api/buildings/:id', (req, res) => {
  const building = db.prepare('SELECT * FROM buildings WHERE id = ?').get(req.params.id);
  if (!building) return res.status(404).json({ error: 'not found' });
  res.json(building);
});

app.put('/api/buildings/:id', upload.fields([
  { name: 'model', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), (req, res) => {
  try {
    const { name, description, lat, lng, height, color } = req.body;
    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (lat) { updates.push('lat = ?'); values.push(parseFloat(lat)); }
    if (lng) { updates.push('lng = ?'); values.push(parseFloat(lng)); }
    if (height) { updates.push('height = ?'); values.push(parseFloat(height)); }
    if (color) { updates.push('color = ?'); values.push(color); }
    if (req.files?.model?.[0]) { updates.push('model_file = ?'); values.push(req.files.model[0].filename); }
    if (req.files?.image?.[0]) { updates.push('image_file = ?'); values.push(req.files.image[0].filename); }

    if (updates.length === 0) return res.status(400).json({ error: 'no fields to update' });

    values.push(req.params.id);
    db.prepare(`UPDATE buildings SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/buildings/:id', (req, res) => {
  const building = db.prepare('SELECT model_file, image_file FROM buildings WHERE id = ?').get(req.params.id);
  if (!building) return res.status(404).json({ error: 'not found' });

  if (building.model_file) {
    const p = path.join(modelDir, building.model_file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  if (building.image_file) {
    const p = path.join(uploadDir, building.image_file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  db.prepare('DELETE FROM buildings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ---- Admin routes ----
app.post('/api/admin/auth', (req, res) => {
  const { passcode } = req.body || {};
  if (!passcode || passcode !== ADMIN_KEY) {
    return res.status(401).json({ error: 'invalid passcode' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.set(token, Date.now() + TOKEN_TTL);
  res.json({ token, expiresIn: TOKEN_TTL });
});

app.get('/api/admin/auth/verify', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

app.post('/api/admin/models', requireAdmin, upload.single('model'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
  res.json({ filename: req.file.filename });
});

app.delete('/api/admin/models/:filename', requireAdmin, (req, res) => {
  const name = path.basename(req.params.filename);
  if (!/^[\w.\- ]+$/.test(name)) return res.status(400).json({ error: 'invalid filename' });
  const p = path.join(modelDir, name);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'not found' });
  fs.unlinkSync(p);
  res.json({ success: true });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

app.listen(PORT, () => {
  console.log(`GIS 3D Map server running on http://localhost:${PORT}`);
});
