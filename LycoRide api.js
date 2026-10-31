
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASS, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 10
});

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }


app.get('/', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'views/Lycoride.html'), 'utf8')
      .replace('{{ mapbox_token }}', process.env.MAPBOX_TOKEN);
  res.type('html').send(html);
});

  async function auth(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not logged in' });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Session expired' });
    req.user = data.user;
    next();

const sign = u => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(t, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Not logged in' }); }
}


app.post('/api/register', async (req, res) => {
  const { email, password, role } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 6)
    return res.status(400).json({ error: 'Invalid email or password too short' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.execute(
        'INSERT INTO users (email, password_hash, role) VALUES (?,?,?)',
        [email, hash, role === 'RIDER' ? 'RIDER' : 'STUDENT']);
    res.json({ token: sign({ id: r.insertId, email }) });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.execute('SELECT * FROM users WHERE email=?', [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || '', u.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(u) });
});


app.get('/api/me', auth, async (req, res) => {
  const [r] = await db.execute(
      'SELECT email, role, name, phone, city, address FROM users WHERE id=?', [req.user.id]);
  res.json(r[0]);
});
app.put('/api/me', auth, async (req, res) => {
  const { name, phone, city, address } = req.body;
  await db.execute('UPDATE users SET name=?, phone=?, city=?, address=? WHERE id=?',
      [name, phone, city, address, req.user.id]);
  res.json({ ok: true });
});


app.get('/api/drivers', auth, async (req, res) => {
  const [r] = await db.execute(
      'SELECT id, name, car, rating, eta_min AS eta, fare_mult AS mult FROM drivers WHERE active=1');
  res.json(r);
});


app.get('/api/trips', auth, async (req, res) => {
  const [r] = await db.execute(
      `SELECT t.id, t.destination AS dest, t.km, t.fare, t.rating, t.comment, t.created_at AS date,
            d.name AS driver, d.car
     FROM trips t JOIN drivers d ON d.id = t.driver_id
     WHERE t.user_id=? ORDER BY t.created_at DESC`, [req.user.id]);
  res.json(r);
});
app.post('/api/trips', auth, async (req, res) => {
  const { driver_id, dest, lat, lng, km, fare, rating, comment } = req.body;
  const [r] = await db.execute(
      `INSERT INTO trips (user_id, driver_id, destination, dest_lat, dest_lng, km, fare, rating, comment)
     VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.id, driver_id, dest, lat, lng, km, fare, rating || null, comment || null]);
  res.json({ id: r.insertId });
});
app.delete('/api/trips', auth, async (req, res) => {
  await db.execute('DELETE FROM trips WHERE user_id=?', [req.user.id]);
  res.json({ ok: true });
});


app.get('/api/search-place', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing search text' });
  const url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + encodeURIComponent(q) +
      '.json?country=ph&limit=8&proximity=120.9158,14.2905&access_token=' + process.env.MAPBOX_TOKEN;
  try {
    const r = await fetch(url);
    const j = await r.json();
    res.json((j.features || []).map(f => ({
      name: f.place_name, lng: f.center[0], lat: f.center[1]
    })));
  } catch { res.status(502).json({ error: 'Search service unavailable' }); }
});

app.listen(process.env.PORT, () => console.log('LycoRide on http://localhost:' + process.env.PORT));
