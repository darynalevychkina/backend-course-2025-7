CREATE TABLE IF NOT EXISTS inventory_items (
    id SERIAL PRIMARY KEY,
    inventory_name TEXT NOT NULL,
    description TEXT,
    photo_url TEXT
);

INSERT INTO inventory_items (inventory_name, description, photo_url) VALUES
('Sample item 1', 'This is a sample item from init.sql', NULL),
('Sample item 2', 'Another sample item', NULL);
