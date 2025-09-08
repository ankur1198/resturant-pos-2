const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// Database setup
const db = new sqlite3.Database('./restaurant_pos.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeDatabase();
    }
});


// Helper function to generate unique bill number
function generateUniqueBillNumber() {
    return `${Date.now()}${Math.floor(Math.random() * 1000000)}`.slice(-12);
}

// Initialize database tables
function initializeDatabase() {
    const tables = [
        `CREATE TABLE IF NOT EXISTS restaurant_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            gstin TEXT,
            fssai TEXT,
            phone TEXT,
            gst_rate REAL DEFAULT 5,
            upi_id TEXT,
            merchant_name TEXT,
            logo TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            last_login DATETIME,
            permissions TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS menu_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            available BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS payment_modes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_number TEXT UNIQUE NOT NULL,
            customer_name TEXT,
            customer_phone TEXT,
            table_number TEXT NOT NULL,
            items TEXT NOT NULL, -- JSON string
            subtotal REAL NOT NULL,
            gst_rate REAL DEFAULT 5,
            tax_amount REAL NOT NULL,
            total REAL NOT NULL,
            payment_mode TEXT NOT NULL,
            cashier_id INTEGER,
            cashier_name TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            date DATE NOT NULL,
            generated_by TEXT DEFAULT 'cashier',
            FOREIGN KEY (cashier_id) REFERENCES users (id)
        )`,
        `CREATE TABLE IF NOT EXISTS qr_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            upi_id TEXT,
            merchant_name TEXT,
            enabled BOOLEAN DEFAULT 1,
            fixed_amount BOOLEAN DEFAULT 0,
            uploaded_image TEXT, -- Base64 encoded image
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    let index = 0;
    function createNextTable() {
        if (index < tables.length) {
            db.run(tables[index], (err) => {
                if (err) {
                    console.error('Error creating table:', err);
                    return;
                }
                index++;
                createNextTable();
            });
        } else {
            // All tables created, now insert default data
            insertDefaultData();
        }
    }

    createNextTable();
}

// Insert default data
function insertDefaultData() {
    // Check if default data exists
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (err) {
            console.error('Error checking users:', err);
            return;
        }

        if (row.count === 0) {
            console.log('Inserting default data...');

            // Insert default restaurant settings
            db.run(`INSERT INTO restaurant_settings (name, address, gstin, fssai, phone, gst_rate, upi_id, merchant_name)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ['PB\'s BHOJANALAY',
                 'MOHANBARI BY PASS, NH-15, Dist. - Dibrugarh, (Assam), PIN NO - 786012',
                 '18AJZPG4997J3Z1',
                 '20323116000543',
                 '+91 9876543210',
                 5,
                 'pbsbhojanalay@upi',
                 'PB\'s BHOJANALAY']);

            // Insert default users
            db.run(`INSERT INTO users (username, password, role, name, phone, permissions)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                ['admin', 'admin123', 'admin', 'Restaurant Manager', '+91 9876543210',
                 'generate_bills,export_data,print_all,edit_orders,delete_orders']);

            db.run(`INSERT INTO users (username, password, role, name, phone, permissions)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                ['cashier1', 'cash123', 'cashier', 'DIPANJOLI', '+91 9876543211',
                 'create_orders,print_own,view_own_history']);

            db.run(`INSERT INTO users (username, password, role, name, phone, permissions)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                ['lina', 'lina123', 'cashier', 'Lina', '+91 9876543212',
                 'create_orders,print_own,view_own_history']);

            // Insert default menu categories
            const categories = ['Appetizers', 'Main Course', 'Beverages', 'Desserts', 'Special Items'];
            categories.forEach(category => {
                db.run(`INSERT INTO menu_categories (name) VALUES (?)`, [category]);
            });

            // Insert default menu items
            const menuItems = [
                ['Lachha Laddu (pc)', 'Desserts', 15.00],
                ['Malai Kalakand', 'Desserts', 20.00],
                ['Butter Chicken', 'Main Course', 280.00],
                ['Dal Makhani', 'Main Course', 220.00],
                ['Masala Chai', 'Beverages', 25.00],
                ['Paneer Tikka', 'Appetizers', 180.00],
                ['Chicken Biryani', 'Main Course', 320.00],
                ['Gulab Jamun', 'Desserts', 12.00]
            ];

            menuItems.forEach(item => {
                db.run(`INSERT INTO menu_items (name, category, price) VALUES (?, ?, ?)`,
                    item);
            });

            // Insert default payment modes
            const paymentModes = ['Cash', 'UPI', 'Card', 'Online', 'Credit'];
            paymentModes.forEach(mode => {
                db.run(`INSERT INTO payment_modes (name) VALUES (?)`, [mode]);
            });

            // Insert default QR config
            db.run(`INSERT INTO qr_config (upi_id, merchant_name, enabled, uploaded_image)
                    VALUES (?, ?, ?, ?)`,
                ['pbsbhojanalay@upi', 'PB\'s BHOJANALAY', 1, null]);

            console.log('Default data inserted successfully.');
        }
    });
}

// API Routes

// Get all data for initialization
app.get('/api/data', (req, res) => {
    const data = {};

    // Get restaurant settings
    db.get("SELECT * FROM restaurant_settings ORDER BY id DESC LIMIT 1", (err, row) => {
        if (err) {
            console.error('Error getting restaurant settings:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        data.restaurant = row || {};

        // Get users
        db.all("SELECT * FROM users ORDER BY id", (err, rows) => {
            if (err) {
                console.error('Error getting users:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            data.users = rows || [];

            // Get menu categories
            db.all("SELECT name FROM menu_categories ORDER BY name", (err, rows) => {
                if (err) {
                    console.error('Error getting menu categories:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                data.menuCategories = rows.map(row => row.name) || [];

                // Get menu items
                db.all("SELECT * FROM menu_items ORDER BY id", (err, rows) => {
                    if (err) {
                        console.error('Error getting menu items:', err);
                        return res.status(500).json({ error: 'Database error' });
                    }
                    data.menuItems = rows || [];

                    // Get payment modes
                    db.all("SELECT name FROM payment_modes ORDER BY name", (err, rows) => {
                        if (err) {
                            console.error('Error getting payment modes:', err);
                            return res.status(500).json({ error: 'Database error' });
                        }
                        data.paymentModes = rows.map(row => row.name) || [];

                        // Get orders
                        db.all("SELECT * FROM orders ORDER BY created_at DESC", (err, rows) => {
                            if (err) {
                                console.error('Error getting orders:', err);
                                return res.status(500).json({ error: 'Database error' });
                            }
                            data.orders = rows || [];

                            // Get QR config
                            db.get("SELECT * FROM qr_config ORDER BY id DESC LIMIT 1", (err, row) => {
                                if (err) {
                                    console.error('Error getting QR config:', err);
                                    return res.status(500).json({ error: 'Database error' });
                                }

                                if (row) {
                                    // Map database column names to app property names
                                    data.qrConfig = {
                                        upiId: row.upi_id,
                                        merchantName: row.merchant_name,
                                        enabled: row.enabled,
                                        fixedAmount: row.fixed_amount,
                                        uploadedImage: row.uploaded_image
                                    };
                                } else {
                                    data.qrConfig = { enabled: true, uploadedImage: null };
                                }

                                res.json(data);
                            });
                        });
                    });
                });
            });
        });
    });
});

// Save order
app.post('/api/orders', (req, res) => {
    const order = req.body;
    console.log('Received order data:', order);

    // Check for duplicate order based on order ID to prevent data redundancy
    if (order.id) {
        db.get("SELECT id, bill_number FROM orders WHERE id = ?", [order.id], (err, row) => {
            if (err) {
                console.error('Error checking order ID existence:', err.message);
                return res.status(500).json({ error: 'Database error', details: err.message });
            }

            if (row) {
                console.log(`Duplicate order detected with ID ${order.id}, existing bill number: ${row.bill_number}`);
                return res.status(409).json({
                    error: 'Duplicate order',
                    message: 'An order with this ID already exists',
                    existingBillNumber: row.bill_number
                });
            }

            // No duplicate found, proceed with normal processing
            processOrder(order, res);
        });
    } else {
        // No order ID provided, proceed with normal processing
        processOrder(order, res);
    }
});

function processOrder(order, res) {
    // Check if this is a temporary bill number from frontend
    const isTempBillNumber = order.billNumber && order.billNumber.startsWith('TEMP-');

    let billNumber = order.billNumber;
    if (!billNumber || isTempBillNumber) {
        // Generate a new unique bill number on server side
        billNumber = generateUniqueBillNumber();
        console.log(`Generated new bill number ${billNumber} for ${isTempBillNumber ? 'temp' : 'missing'} bill number`);
    }

    let retryCount = 0;
    const maxRetries = 5;

    function tryInsert() {
        // Check if bill number already exists
        db.get("SELECT id FROM orders WHERE bill_number = ?", [billNumber], (err, row) => {
            if (err) {
                console.error('Error checking bill number existence:', err.message);
                return res.status(500).json({ error: 'Database error', details: err.message });
            }

            if (row) {
                // Bill number exists, generate new one and retry
                if (retryCount < maxRetries) {
                    console.log(`Bill number ${billNumber} already exists, generating new one (attempt ${retryCount + 1}/${maxRetries})`);
                    billNumber = generateUniqueBillNumber();
                    retryCount++;
                    return tryInsert();
                } else {
                    console.error('Max retries exceeded for generating unique bill number');
                    return res.status(500).json({ error: 'Failed to generate unique bill number after multiple attempts' });
                }
            }

            // Bill number is unique, proceed with insertion
            db.run(`INSERT INTO orders (bill_number, customer_name, customer_phone, table_number, items, subtotal, gst_rate, tax_amount, total, payment_mode, cashier_id, cashier_name, status, date, generated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [billNumber, order.customer_name, order.customer_phone, order.table_number,
                 JSON.stringify(order.items), order.subtotal, order.gst_rate, order.tax_amount,
                 order.total, order.payment_mode, order.cashier_id, order.cashier_name,
                 order.status, order.date, order.generated_by || 'cashier'],
                function(err) {
                    if (err) {
                        console.error('Error saving order:', err.message);
                        console.error('Order data that failed:', order);
                        return res.status(500).json({ error: 'Failed to save order', details: err.message });
                    }
                    console.log(`Order saved successfully with bill number: ${billNumber}`);
                    res.json({ id: this.lastID, success: true, billNumber: billNumber });
                });
        });
    }

    tryInsert();
}

// Update restaurant settings
app.put('/api/restaurant-settings', (req, res) => {
    const settings = req.body;

    // Build dynamic SQL based on provided fields
    let updateFields = [];
    let values = [];

    if (settings.name !== undefined) {
        updateFields.push('name = ?');
        values.push(settings.name);
    }
    if (settings.address !== undefined) {
        updateFields.push('address = ?');
        values.push(settings.address);
    }
    if (settings.gstin !== undefined) {
        updateFields.push('gstin = ?');
        values.push(settings.gstin);
    }
    if (settings.fssai !== undefined) {
        updateFields.push('fssai = ?');
        values.push(settings.fssai);
    }
    if (settings.phone !== undefined) {
        updateFields.push('phone = ?');
        values.push(settings.phone);
    }
    if (settings.gstRate !== undefined) {
        updateFields.push('gst_rate = ?');
        values.push(settings.gstRate);
    }
    if (settings.upiId !== undefined) {
        updateFields.push('upi_id = ?');
        values.push(settings.upiId);
    }
    if (settings.merchantName !== undefined) {
        updateFields.push('merchant_name = ?');
        values.push(settings.merchantName);
    }
    if (settings.logo !== undefined) {
        updateFields.push('logo = ?');
        values.push(settings.logo);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    if (updateFields.length === 1) {
        // Only updated_at, no actual changes
        return res.json({ success: true });
    }

    const sql = `UPDATE restaurant_settings SET ${updateFields.join(', ')}
                 WHERE id = (SELECT id FROM restaurant_settings ORDER BY id DESC LIMIT 1)`;

    db.run(sql, values, function(err) {
        if (err) {
            console.error('Error updating restaurant settings:', err);
            return res.status(500).json({ error: 'Failed to update settings' });
        }
        res.json({ success: true });
    });
});
// Update QR configuration
app.put('/api/qr-config', (req, res) => {
    const qrConfig = req.body;

    // Check if QR config exists
    db.get("SELECT id FROM qr_config ORDER BY id DESC LIMIT 1", (err, row) => {
        if (err) {
            console.error('Error checking QR config existence:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (row) {
            // Update existing QR config
            db.run(`UPDATE qr_config SET
                    upi_id = ?, merchant_name = ?, enabled = ?, fixed_amount = ?, uploaded_image = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?`,
                [qrConfig.upiId, qrConfig.merchantName, qrConfig.enabled, qrConfig.fixedAmount, qrConfig.uploadedImage, row.id],
                function(err) {
                    if (err) {
                        console.error('Error updating QR config:', err);
                        return res.status(500).json({ error: 'Failed to update QR config' });
                    }
                    res.json({ success: true });
                });
        } else {
            // Insert new QR config
            db.run(`INSERT INTO qr_config (upi_id, merchant_name, enabled, fixed_amount, uploaded_image, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                [qrConfig.upiId, qrConfig.merchantName, qrConfig.enabled, qrConfig.fixedAmount, qrConfig.uploadedImage],
                function(err) {
                    if (err) {
                        console.error('Error inserting QR config:', err);
                        return res.status(500).json({ error: 'Failed to insert QR config' });
                    }
                    res.json({ success: true });
                });
        }
    });
});

// Update order status
app.put('/api/orders/:id/status', (req, res) => {
    const id = req.params.id;
    const { status } = req.body;

    if (!status || !['pending', 'completed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be "pending" or "completed"' });
    }

    db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, id], function(err) {
        if (err) {
            console.error('Error updating order status:', err);
            return res.status(500).json({ error: 'Failed to update order status' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json({ success: true });
    });
});

// Delete order
app.delete('/api/orders/:id', (req, res) => {
    const id = req.params.id;

    db.run(`DELETE FROM orders WHERE id = ?`, [id], function(err) {
        if (err) {
            console.error('Error deleting order:', err);
            return res.status(500).json({ error: 'Failed to delete order' });
        }
        res.json({ success: true });
    });
});

// Add menu item
app.post('/api/menu-items', (req, res) => {
    const item = req.body;

    db.run(`INSERT INTO menu_items (name, category, price, available)
            VALUES (?, ?, ?, ?)`,
        [item.name, item.category, item.price, item.available],
        function(err) {
            if (err) {
                console.error('Error adding menu item:', err);
                return res.status(500).json({ error: 'Failed to add menu item' });
            }
            res.json({ id: this.lastID, success: true });
        });
});

// Update menu item
app.put('/api/menu-items/:id', (req, res) => {
    const id = req.params.id;
    const item = req.body;

    db.run(`UPDATE menu_items SET
            name = ?, category = ?, price = ?, available = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        [item.name, item.category, item.price, item.available, id],
        function(err) {
            if (err) {
                console.error('Error updating menu item:', err);
                return res.status(500).json({ error: 'Failed to update menu item' });
            }
            res.json({ success: true });
        });
});

// Delete menu item
app.delete('/api/menu-items/:id', (req, res) => {
    const id = req.params.id;

    db.run(`DELETE FROM menu_items WHERE id = ?`, [id], function(err) {
        if (err) {
            console.error('Error deleting menu item:', err);
            return res.status(500).json({ error: 'Failed to delete menu item' });
        }
        res.json({ success: true });
    });
});

// Add user
app.post('/api/users', (req, res) => {
    const user = req.body;

    db.run(`INSERT INTO users (username, password, role, name, phone, permissions)
            VALUES (?, ?, ?, ?, ?, ?)`,
        [user.username, user.password, user.role, user.name, user.phone, user.permissions],
        function(err) {
            if (err) {
                console.error('Error adding user:', err);
                return res.status(500).json({ error: 'Failed to add user' });
            }
            res.json({ id: this.lastID, success: true });
        });
});

// Update user password
app.put('/api/users/:id/password', (req, res) => {
    const id = req.params.id;
    const { password } = req.body;

    db.run(`UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [password, id], function(err) {
            if (err) {
                console.error('Error updating user password:', err);
                return res.status(500).json({ error: 'Failed to update password' });
            }
            res.json({ success: true });
        });
});

// Delete user
app.delete('/api/users/:id', (req, res) => {
    const id = req.params.id;

    db.run(`DELETE FROM users WHERE id = ?`, [id], function(err) {
        if (err) {
            console.error('Error deleting user:', err);
            return res.status(500).json({ error: 'Failed to delete user' });
        }
        res.json({ success: true });
    });
});

// Update user last login
app.put('/api/users/:id/last-login', (req, res) => {
    const id = req.params.id;

    db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`,
        [id], function(err) {
            if (err) {
                console.error('Error updating last login:', err);
                return res.status(500).json({ error: 'Failed to update last login' });
            }
            res.json({ success: true });
        });
});

// Catch-all handler for 404 errors
app.get('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, '..', '404.php'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Restaurant POS server running on port ${PORT}`);
    console.log(`Database file: ${path.join(__dirname, 'restaurant_pos.db')}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});

module.exports = app;
