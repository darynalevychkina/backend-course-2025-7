const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { Command } = require('commander');

const program = new Command();

program
  .requiredOption('-h, --host <host>', 'Server host')
  .requiredOption('-p, --port <port>', 'Server port', (value) => parseInt(value, 10))
  .requiredOption('-c, --cache <dir>', 'Cache directory');

program.parse(process.argv);

const options = program.opts();
const HOST = options.host;
const PORT = options.port;
const CACHE_DIR = path.resolve(options.cache);
const PHOTOS_DIR = path.join(CACHE_DIR, 'photos');
const DB_FILE = path.join(CACHE_DIR, 'inventory.json');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

function loadInventory() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveInventory(items) {
  fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2), 'utf8');
}

let inventory = loadInventory();

function generateId() {
  const maxId = inventory.reduce((max, item) => Math.max(max, Number(item.id)), 0);
  return String(maxId + 1);
}

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const upload = multer({ dest: PHOTOS_DIR });

function methodGuard(allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.method)) {
      return res.status(405).send('Method not allowed');
    }
    next();
  };
}

app.all('/register', methodGuard(['POST']));
app.post('/register', upload.single('photo'), (req, res) => {
  const { inventory_name, description } = req.body;

  if (!inventory_name || inventory_name.trim() === '') {
    return res.status(400).json({ error: 'inventory_name is required' });
  }

  const id = generateId();
  const photoFilename = req.file ? req.file.filename : null;

  const item = {
    id,
    inventory_name,
    description: description || '',
    photoFilename
  };

  inventory.push(item);
  saveInventory(inventory);

  const photoUrl = photoFilename
    ? `${req.protocol}://${req.get('host')}/inventory/${id}/photo`
    : null;

  return res.status(201).json({
    id,
    inventory_name: item.inventory_name,
    description: item.description,
    photo_url: photoUrl
  });
});

app.all('/inventory', methodGuard(['GET']));
app.get('/inventory', (req, res) => {
  const list = inventory.map((item) => {
    const photoUrl = item.photoFilename
      ? `${req.protocol}://${req.get('host')}/inventory/${item.id}/photo`
      : null;

    return {
      id: item.id,
      inventory_name: item.inventory_name,
      description: item.description,
      photo_url: photoUrl
    };
  });

  res.status(200).json(list);
});

app.all('/inventory/:id', methodGuard(['GET', 'PUT']));
app.get('/inventory/:id', (req, res) => {
  const item = inventory.find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Not found' });
  }

  const photoUrl = item.photoFilename
    ? `${req.protocol}://${req.get('host')}/inventory/${item.id}/photo`
    : null;

  res.status(200).json({
    id: item.id,
    inventory_name: item.inventory_name,
    description: item.description,
    photo_url: photoUrl
  });
});

app.put('/inventory/:id', (req, res) => {
  const item = inventory.find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { inventory_name, description } = req.body;

  if (inventory_name !== undefined) {
    item.inventory_name = inventory_name;
  }
  if (description !== undefined) {
    item.description = description;
  }

  saveInventory(inventory);

  const photoUrl = item.photoFilename
    ? `${req.protocol}://${req.get('host')}/inventory/${item.id}/photo`
    : null;

  res.status(200).json({
    id: item.id,
    inventory_name: item.inventory_name,
    description: item.description,
    photo_url: photoUrl
  });
});

app.use((req, res) => {
  res.status(404).send('Not found');
});

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
  console.log(`Cache directory: ${CACHE_DIR}`);
});
