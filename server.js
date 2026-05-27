const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/public',  express.static(path.join(__dirname, 'public')));

// ── Supabase client (if keys are set) ────────────────────────────────────────
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const ws = require('ws');
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: { persistSession: false },
        realtime: { transport: ws }
      }
    );
    console.log('✓ Supabase connected');
  } catch (e) {
    console.warn('Supabase init failed:', e.message);
  }
} else {
  console.log('ℹ No Supabase keys – using local JSON storage');
}

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public/uploads')),
  filename:    (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /jpeg|jpg|png|gif|webp|mp4|mov|avi|pdf/i.test(path.extname(file.originalname)));
  }
});

// ── Local JSON helpers (fallback) ─────────────────────────────────────────────
const DATA  = path.join(__dirname, 'data');
const jread  = f => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch { return []; } };
const jwrite = (f, d) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(d, null, 2));
const uid    = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mkToken = () => 'MOM-' + Math.random().toString(36).slice(2,6).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();

// ── DB abstraction ────────────────────────────────────────────────────────────
const DB = {
  // SAMPLES
  async getSamples() {
    if (supabase) {
      const { data, error } = await supabase.from('samples').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(r => ({ ...r, url: r.url, isVideo: r.is_video }));
    }
    return jread('samples.json');
  },
  async addSample(sample) {
    if (supabase) {
      const { data, error } = await supabase.from('samples').insert([{
        id: sample.id, title: sample.title, description: sample.description,
        category: sample.category, filename: sample.filename, url: sample.url,
        is_video: sample.isVideo
      }]).select().single();
      if (error) throw error;
      return { ...data, isVideo: data.is_video };
    }
    const samples = jread('samples.json');
    samples.unshift(sample); jwrite('samples.json', samples);
    return sample;
  },
  async deleteSample(id) {
    if (supabase) {
      const { data } = await supabase.from('samples').select('filename').eq('id', id).single();
      await supabase.from('samples').delete().eq('id', id);
      return data?.filename;
    }
    const samples = jread('samples.json');
    const idx = samples.findIndex(s => s.id === id);
    if (idx === -1) return null;
    const fn = samples[idx].filename;
    samples.splice(idx, 1); jwrite('samples.json', samples);
    return fn;
  },

  // REVIEWS
  async getReviews() {
    if (supabase) {
      const { data, error } = await supabase.from('reviews').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
    return jread('reviews.json');
  },
  async addReview(review) {
    if (supabase) {
      const { data, error } = await supabase.from('reviews').insert([review]).select().single();
      if (error) throw error;
      return data;
    }
    const reviews = jread('reviews.json');
    reviews.unshift(review); jwrite('reviews.json', reviews);
    return review;
  },
  async deleteReview(id) {
    if (supabase) {
      await supabase.from('reviews').delete().eq('id', id);
      return true;
    }
    const reviews = jread('reviews.json');
    const idx = reviews.findIndex(r => r.id === id);
    if (idx === -1) return false;
    reviews.splice(idx, 1); jwrite('reviews.json', reviews);
    return true;
  },

  // ORDERS
  async getOrders() {
    if (supabase) {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(normalizeOrder);
    }
    return jread('orders.json');
  },
  async getOrderByIdOrToken(idOrToken) {
    if (supabase) {
      const { data } = await supabase.from('orders').select('*')
        .or(`id.eq.${idOrToken},token.eq.${idOrToken}`).maybeSingle();
      return data ? normalizeOrder(data) : null;
    }
    const orders = jread('orders.json');
    return orders.find(o => o.id === idOrToken || o.token === idOrToken) || null;
  },
  async createOrder(order) {
    if (supabase) {
      const row = {
        id: order.id, token: order.token,
        customer_name: order.customerName, customer_email: order.customerEmail,
        customer_phone: order.customerPhone, occasion: order.occasion,
        date: order.date, price: order.price,
        advance_amount: order.advanceAmount, remaining_amount: order.remainingAmount,
        advance_paid: false, remaining_paid: false,
        status: 'Pending', notes: order.notes,
        final_project_link: '', media_uploads: []
      };
      const { data, error } = await supabase.from('orders').insert([row]).select().single();
      if (error) throw error;
      return normalizeOrder(data);
    }
    const orders = jread('orders.json');
    orders.unshift(order); jwrite('orders.json', orders);
    return order;
  },
  async updateOrder(id, fields) {
    if (supabase) {
      const row = {};
      if (fields.customerName  !== undefined) row.customer_name    = fields.customerName;
      if (fields.customerEmail !== undefined) row.customer_email   = fields.customerEmail;
      if (fields.customerPhone !== undefined) row.customer_phone   = fields.customerPhone;
      if (fields.occasion      !== undefined) row.occasion         = fields.occasion;
      if (fields.date          !== undefined) row.date             = fields.date;
      if (fields.price         !== undefined) row.price            = fields.price;
      if (fields.advanceAmount !== undefined) row.advance_amount   = fields.advanceAmount;
      if (fields.remainingAmount !== undefined) row.remaining_amount = fields.remainingAmount;
      if (fields.advancePaid   !== undefined) row.advance_paid     = fields.advancePaid;
      if (fields.remainingPaid !== undefined) row.remaining_paid   = fields.remainingPaid;
      if (fields.status        !== undefined) row.status           = fields.status;
      if (fields.notes         !== undefined) row.notes            = fields.notes;
      if (fields.finalProjectLink !== undefined) row.final_project_link = fields.finalProjectLink;
      if (fields.mediaUploads  !== undefined) row.media_uploads    = fields.mediaUploads;
      const { data, error } = await supabase.from('orders').update(row).eq('id', id).select().single();
      if (error) throw error;
      return normalizeOrder(data);
    }
    const orders = jread('orders.json');
    const idx = orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    Object.assign(orders[idx], fields, { updatedAt: new Date().toISOString() });
    jwrite('orders.json', orders);
    return orders[idx];
  },
  async deleteOrder(id) {
    if (supabase) { await supabase.from('orders').delete().eq('id', id); return true; }
    const orders = jread('orders.json');
    const idx = orders.findIndex(o => o.id === id);
    if (idx === -1) return false;
    orders.splice(idx, 1); jwrite('orders.json', orders);
    return true;
  }
};

// Normalize Supabase snake_case → camelCase
function normalizeOrder(r) {
  return {
    id: r.id, token: r.token,
    customerName: r.customer_name, customerEmail: r.customer_email,
    customerPhone: r.customer_phone, occasion: r.occasion,
    date: r.date, price: r.price,
    advanceAmount: r.advance_amount, remainingAmount: r.remaining_amount,
    advancePaid: r.advance_paid, remainingPaid: r.remaining_paid,
    status: r.status, notes: r.notes,
    finalProjectLink: r.final_project_link,
    mediaUploads: r.media_uploads || [],
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

// ── SAMPLES ───────────────────────────────────────────────────────────────────
app.get('/api/samples', async (req, res) => {
  try { res.json({ success: true, samples: await DB.getSamples() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/samples', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { title, description, category } = req.body;
    const sample = {
      id: uid(), title: title || 'Sample Work', description: description || '',
      category: category || 'General', filename: req.file.filename,
      url: '/uploads/' + req.file.filename, isVideo: req.file.mimetype.startsWith('video/'),
      createdAt: new Date().toISOString()
    };
    const saved = await DB.addSample(sample);
    res.json({ success: true, sample: saved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/samples/:id', async (req, res) => {
  try {
    const fn = await DB.deleteSample(req.params.id);
    if (fn) {
      const fp = path.join(__dirname, 'public/uploads', fn);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REVIEWS ───────────────────────────────────────────────────────────────────
app.get('/api/reviews', async (req, res) => {
  try { res.json({ success: true, reviews: await DB.getReviews() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { name, text, rating, occasion } = req.body;
    if (!name || !text) return res.status(400).json({ error: 'Name and text required' });
    const review = {
      id: uid(), name, text,
      rating: Math.min(5, Math.max(1, parseInt(rating) || 5)),
      occasion: occasion || '',
      avatar: name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(),
      createdAt: new Date().toISOString()
    };
    const saved = await DB.addReview(review);
    res.json({ success: true, review: saved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/reviews/:id', async (req, res) => {
  try { await DB.deleteReview(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ORDERS ────────────────────────────────────────────────────────────────────
app.get('/api/orders', async (req, res) => {
  try { res.json({ success: true, orders: await DB.getOrders() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, occasion, date,
            price, advanceAmount, remainingAmount, notes } = req.body;
    if (!customerName || !price) return res.status(400).json({ error: 'Name and price required' });
    const p = parseFloat(price);
    const order = {
      id: uid(), token: mkToken(),
      customerName, customerEmail: customerEmail || '',
      customerPhone: customerPhone || '', occasion: occasion || 'General',
      date: date || new Date().toISOString().split('T')[0], price: p,
      advanceAmount: parseFloat(advanceAmount) || p * 0.5,
      remainingAmount: parseFloat(remainingAmount) || p * 0.5,
      advancePaid: false, remainingPaid: false,
      status: 'Pending', notes: notes || '',
      finalProjectLink: '', mediaUploads: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    const saved = await DB.createOrder(order);
    res.json({ success: true, order: saved });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await DB.getOrderByIdOrToken(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const allowed = ['customerName','customerEmail','customerPhone','occasion','date','price',
      'advanceAmount','remainingAmount','advancePaid','remainingPaid','status','notes','finalProjectLink'];
    const fields = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) fields[k] = req.body[k]; });
    const order = await DB.updateOrder(req.params.id, fields);
    if (!order) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id', async (req, res) => {
  try { await DB.deleteOrder(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CUSTOMER AUTH ─────────────────────────────────────────────────────────────
app.post('/api/customer/login', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const order = await DB.getOrderByIdOrToken(token.trim().toUpperCase());
    if (!order) return res.status(404).json({ error: 'Invalid token. Please check and try again.' });
    res.json({ success: true, order });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CUSTOMER UPLOAD ───────────────────────────────────────────────────────────
app.post('/api/customer/upload', upload.array('files', 20), async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const order = await DB.getOrderByIdOrToken(token.trim().toUpperCase());
    if (!order) return res.status(404).json({ error: 'Invalid token' });
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    const uploads = req.files.map(f => ({
      id: uid(), filename: f.filename, originalName: f.originalname,
      url: '/uploads/' + f.filename, isVideo: f.mimetype.startsWith('video/'),
      uploadedAt: new Date().toISOString()
    }));
    const existing = order.mediaUploads || [];
    await DB.updateOrder(order.id, { mediaUploads: [...existing, ...uploads] });
    res.json({ success: true, uploads });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PAYMENT ───────────────────────────────────────────────────────────────────
app.post('/api/payment', async (req, res) => {
  try {
    const { token, type } = req.body;
    if (!token || !type) return res.status(400).json({ error: 'Token and type required' });
    const order = await DB.getOrderByIdOrToken(token.trim().toUpperCase());
    if (!order) return res.status(404).json({ error: 'Invalid token' });
    const fields = {};
    if (type === 'advance')   fields.advancePaid   = true;
    if (type === 'remaining') fields.remainingPaid = true;
    const adv = type === 'advance' ? true : order.advancePaid;
    const rem = type === 'remaining' ? true : order.remainingPaid;
    if (adv && rem) fields.status = 'Paid';
    else if (adv)   fields.status = 'In Progress';
    const updated = await DB.updateOrder(order.id, fields);
    res.json({ success: true, order: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADMIN AUTH ────────────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'Momenta@123') {
    res.json({ success: true, token: 'admin-' + Date.now() });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// ── PAGES ─────────────────────────────────────────────────────────────────────
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin',    (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, 'customer.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`✨ Momenta running on port ${PORT}`));
