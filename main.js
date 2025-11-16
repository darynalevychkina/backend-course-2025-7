const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { Command } = require('commander');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

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

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory Service API',
      version: '1.0.0',
      description: 'Simple inventory service for Lab 6'
    },
    servers: [
      {
        url: `http://${HOST}:${PORT}`
      }
    ],
    paths: {
      '/register': {
        post: {
          summary: 'Register a new inventory item',
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    inventory_name: { type: 'string', description: 'Item name (required)' },
                    description: { type: 'string', description: 'Item description' },
                    photo: { type: 'string', format: 'binary', description: 'Item photo file' }
                  },
                  required: ['inventory_name']
                }
              }
            }
          },
          responses: {
            201: { description: 'Inventory item created' },
            400: { description: 'Inventory name is missing' }
          }
        }
      },
      '/inventory': {
        get: {
          summary: 'Get all inventory items',
          responses: {
            200: { description: 'List of all inventory items in JSON format' }
          }
        }
      },
      '/inventory/{id}': {
        get: {
          summary: 'Get inventory item by ID',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
              description: 'Inventory item ID'
            }
          ],
          responses: {
            200: { description: 'Inventory item found' },
            404: { description: 'Inventory item not found' }
          }
        },
        put: {
          summary: 'Update inventory item name and/or description',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
              description: 'Inventory item ID'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    inventory_name: { type: 'string', description: 'New item name' },
                    description: { type: 'string', description: 'New item description' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Inventory item updated' },
            404: { description: 'Inventory item not found' }
          }
        },
        delete: {
          summary: 'Delete inventory item by ID',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
              description: 'Inventory item ID'
            }
          ],
          responses: {
            200: { description: 'Inventory item deleted' },
            404: { description: 'Inventory item not found' }
          }
        }
      },
      '/inventory/{id}/photo': {
        get: {
          summary: 'Get inventory item photo',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
              description: 'Inventory item ID'
            }
          ],
          responses: {
            200: { description: 'JPEG image with item photo' },
            404: { description: 'Item or photo not found' }
          }
        },
        put: {
          summary: 'Update inventory item photo',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' },
              description: 'Inventory item ID'
            }
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    photo: {
                      type: 'string',
                      format: 'binary',
                      description: 'New photo file for the item'
                    }
                  },
                  required: ['photo']
                }
              }
            }
          },
          responses: {
            200: { description: 'Item photo updated' },
            400: { description: 'Photo file is missing' },
            404: { description: 'Inventory item not found' }
          }
        }
      },
      '/search': {
        post: {
          summary: 'Search inventory item by ID (form submission)',
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                      description: 'Inventory item ID to search'
                    },
                    has_photo: {
                      type: 'string',
                      description:
                        'If present, append photo URL to item description when photo exists'
                    }
                  },
                  required: ['id']
                }
              }
            }
          },
          responses: {
            200: { description: 'Inventory item found and returned' },
            404: { description: 'Inventory item not found' }
          }
        }
      }
    }
  },
  apis: []
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

app.all('/inventory/:id', methodGuard(['GET', 'PUT', 'DELETE']));
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

app.delete('/inventory/:id', (req, res) => {
  const index = inventory.findIndex((i) => i.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Not found' });
  }

  const [removed] = inventory.splice(index, 1);

  if (removed.photoFilename) {
    const photoPath = path.join(PHOTOS_DIR, removed.photoFilename);
    fs.promises.unlink(photoPath).catch(() => {});
  }

  saveInventory(inventory);

  res.status(200).json({ message: 'Deleted' });
});

app.all('/inventory/:id/photo', methodGuard(['GET', 'PUT']));
app.get('/inventory/:id/photo', (req, res) => {
  const item = inventory.find((i) => i.id === req.params.id);
  if (!item || !item.photoFilename) {
    return res.status(404).send('Not found');
  }

  const photoPath = path.join(PHOTOS_DIR, item.photoFilename);
  if (!fs.existsSync(photoPath)) {
    return res.status(404).send('Not found');
  }

  res.status(200);
  res.setHeader('Content-Type', 'image/jpeg');
  res.sendFile(photoPath);
});

app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
  const item = inventory.find((i) => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'photo file is required' });
  }

  if (item.photoFilename) {
    const oldPath = path.join(PHOTOS_DIR, item.photoFilename);
    fs.promises.unlink(oldPath).catch(() => {});
  }

  item.photoFilename = req.file.filename;
  saveInventory(inventory);

  const photoUrl = `${req.protocol}://${req.get('host')}/inventory/${item.id}/photo`;

  res.status(200).json({
    id: item.id,
    photo_url: photoUrl,
    message: 'Photo updated'
  });
});

app.all('/RegisterForm.html', methodGuard(['GET']));
app.get('/RegisterForm.html', (req, res) => {
  const filePath = path.join(__dirname, 'RegisterForm.html');
  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(filePath);
});

app.all('/SearchForm.html', methodGuard(['GET']));
app.get('/SearchForm.html', (req, res) => {
  const filePath = path.join(__dirname, 'SearchForm.html');
  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(filePath);
});

app.all('/search', methodGuard(['POST']));
app.post('/search', (req, res) => {
  const { id, has_photo } = req.body;

  const item = inventory.find((i) => i.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Not found' });
  }

  const photoUrl = item.photoFilename
    ? `${req.protocol}://${req.get('host')}/inventory/${item.id}/photo`
    : null;

  let description = item.description;

  if (has_photo && photoUrl) {
    description = `${description}\nPhoto: ${photoUrl}`;
    item.description = description;
    saveInventory(inventory);
  }

  res.status(200).json({
    id: item.id,
    inventory_name: item.inventory_name,
    description,
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
