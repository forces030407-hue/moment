const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public/uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|avi/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) cb(null, true);
    else cb(new Error('Only images and videos allowed'));
  }
});

const SAMPLES_FILE = path.join(__dirname, 'data/samples.json');

function readSamples() {
  try {
    return JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeSamples(data) {
  fs.writeFileSync(SAMPLES_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/samples', (req, res) => {
  const samples = readSamples();
  res.json({ success: true, samples });
});

app.post('/api/samples', upload.single('file'), (req, res) => {
  try {
    const { title, description, category } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const samples = readSamples();
    const sample = {
      id: Date.now().toString(),
      title: title || 'Sample Work',
      description: description || '',
      category: category || 'General',
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      url: '/uploads/' + req.file.filename,
      isVideo: req.file.mimetype.startsWith('video/'),
      createdAt: new Date().toISOString()
    };

    samples.unshift(sample);
    writeSamples(samples);
    res.json({ success: true, sample });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/samples/:id', (req, res) => {
  try {
    const samples = readSamples();
    const idx = samples.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Sample not found' });

    const sample = samples[idx];
    const filePath = path.join(__dirname, 'public/uploads', sample.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    samples.splice(idx, 1);
    writeSamples(samples);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Momenta running at http://0.0.0.0:${PORT}`);
});
