//import fs from "fs";
import https from "https";
import zlib from "zlib";
//import path from "path";
import dotenv from "dotenv";

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');



dotenv.config();

const DB_FILE = path.join(process.cwd(), "restaurant_pos.db");
const BACKUP_RESTORE_URL = process.env.BACKUP_RESTORE_URL;
const GITHUB_BACKUP_TOKEN = process.env.GITHUB_BACKUP_TOKEN;

async function downloadPrivateGitHubFile(url, dest, token) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "RenderAutoRestore/1.0",
        "Authorization": `token ${token}`
      }
    };

    const file = fs.createWriteStream(dest);
    https.get(url, options, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download backup (HTTP ${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", reject);
  });
}

(async () => {
  try {
    const exists = fs.existsSync(DB_FILE);
    const size = exists ? fs.statSync(DB_FILE).size : 0;

    if (!exists || size < 10000) {
      console.log("⚠️  Restoring database from private GitHub backup...");

      if (!BACKUP_RESTORE_URL || !GITHUB_BACKUP_TOKEN) {
        console.error("❌ Missing BACKUP_RESTORE_URL or GITHUB_BACKUP_TOKEN. Skipping restore.");
        return;
      }

      const gzPath = DB_FILE + ".gz";
      await downloadPrivateGitHubFile(BACKUP_RESTORE_URL, gzPath, GITHUB_BACKUP_TOKEN);

      const gunzip = zlib.createGunzip();
      const input = fs.createReadStream(gzPath);
      const output = fs.createWriteStream(DB_FILE);
      input.pipe(gunzip).pipe(output);

      await new Promise((res) => output.on("finish", res));
      fs.unlinkSync(gzPath);

      console.log("✅ Database restored successfully from backup!");
    } else {
      console.log("✅ Database already exists. Skipping restore.");
    }
  } catch (err) {
    console.error("❌ Error during restore:", err);
  }
})();


const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

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

// New API endpoint for sales summary
app.get('/api/sales-summary', (req, res) => {
    const period = req.query.period || 'today';

    let startDate;
    const now = new Date();

    switch (period) {
        case 'week':
            // Start of current week (Monday)
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(now.setDate(diff));
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'month':
            // Start of current month
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'today':
        default:
            // Start of today
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
    }

    const startDateISO = startDate.toISOString();

    // Query to aggregate sales data
    const query = `
        SELECT 
            COUNT(*) AS totalOrders,
            SUM(total) AS totalSales,
            SUM(subtotal) AS totalSubtotal,
            SUM(tax_amount) AS totalTax
        FROM orders
        WHERE created_at >= ?
        AND status = 'completed'
    `;

    db.get(query, [startDateISO], (err, row) => {
        if (err) {
            console.error('Error fetching sales summary:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json({
            period,
            totalOrders: row.totalOrders || 0,
            totalSales: row.totalSales || 0,
            totalSubtotal: row.totalSubtotal || 0,
            totalTax: row.totalTax || 0
        });
    });
});

// Save order
app.post('/api/orders', (req, res) => {
    const order = req.body;
    console.log('Received order data:', order);

    // Enhanced duplicate detection
    checkForDuplicateOrder(order, (isDuplicate, existingOrder) => {
        if (isDuplicate) {
            console.log(`Duplicate order detected:`, existingOrder);
            return res.status(409).json({
                error: 'Duplicate order',
                message: 'This order has already been processed',
                existingBillNumber: existingOrder.bill_number,
                existingOrderId: existingOrder.id
            });
        }

        // No duplicate found, proceed with normal processing
        processOrder(order, res);
    });
});

// In-memory storage for request deduplication with monitoring
const requestLocks = new Map();
const LOCK_TIMEOUT = 30000; // 30 seconds
const CLEANUP_INTERVAL = 5000; // Clean up every 5 seconds
const MAX_LOCKS = 1000; // Maximum number of locks to prevent memory issues

// Statistics for monitoring
let lockStats = {
    totalLocksCreated: 0,
    totalLocksCleaned: 0,
    totalLocksExpired: 0,
    totalLocksActive: 0,
    lastCleanupTime: Date.now(),
    averageLockDuration: 0
};

// Cleanup expired locks periodically with enhanced monitoring
setInterval(() => {
    const now = Date.now();
    const expiredLocks = [];
    let cleanedCount = 0;
    let totalDuration = 0;
    let activeLocks = 0;

    for (const [key, lockTime] of requestLocks.entries()) {
        const lockAge = now - lockTime;
        if (lockAge > LOCK_TIMEOUT) {
            requestLocks.delete(key);
            expiredLocks.push(key);
            cleanedCount++;
            totalDuration += lockAge;
        } else {
            activeLocks++;
        }
    }

    // Update statistics
    lockStats.totalLocksCleaned += cleanedCount;
    lockStats.totalLocksExpired += cleanedCount;
    lockStats.totalLocksActive = activeLocks;
    lockStats.lastCleanupTime = now;

    if (cleanedCount > 0) {
        lockStats.averageLockDuration = totalDuration / cleanedCount;
        console.log(`[LOCK_CLEANUP] Cleaned up ${cleanedCount} expired locks. Active locks: ${activeLocks}. Avg duration: ${Math.round(lockStats.averageLockDuration)}ms`);
    }

    // Emergency cleanup if too many locks
    if (requestLocks.size > MAX_LOCKS) {
        console.warn(`[LOCK_CLEANUP] Emergency cleanup: Too many locks (${requestLocks.size}), clearing all expired locks`);
        const emergencyCleaned = [];
        for (const [key, lockTime] of requestLocks.entries()) {
            if (now - lockTime > LOCK_TIMEOUT) {
                requestLocks.delete(key);
                emergencyCleaned.push(key);
            }
        }
        console.log(`[LOCK_CLEANUP] Emergency cleanup removed ${emergencyCleaned.length} locks`);
    }

    // Log statistics every minute
    if (now - lockStats.lastCleanupTime > 60000) {
        console.log(`[LOCK_STATS] Total locks created: ${lockStats.totalLocksCreated}, Active: ${lockStats.totalLocksActive}, Cleaned: ${lockStats.totalLocksCleaned}`);
    }
}, CLEANUP_INTERVAL);

// Function to safely add a lock with monitoring
function addRequestLock(key, timestamp = Date.now()) {
    if (requestLocks.size >= MAX_LOCKS) {
        console.warn(`[LOCK_WARNING] Maximum locks reached (${MAX_LOCKS}), cannot add new lock for: ${key}`);
        return false;
    }

    requestLocks.set(key, timestamp);
    lockStats.totalLocksCreated++;
    return true;
}

// Function to safely remove a lock
function removeRequestLock(key) {
    const removed = requestLocks.delete(key);
    if (removed) {
        lockStats.totalLocksActive = Math.max(0, lockStats.totalLocksActive - 1);
    }
    return removed;
}

// Function to get lock statistics
function getLockStats() {
    return {
        ...lockStats,
        currentLocks: requestLocks.size,
        oldestLock: requestLocks.size > 0 ? Math.min(...Array.from(requestLocks.values())) : null,
        newestLock: requestLocks.size > 0 ? Math.max(...Array.from(requestLocks.values())) : null
    };
}

// Duplicate detection metrics and logging
let duplicateDetectionMetrics = {
    totalChecks: 0,
    totalDuplicatesFound: 0,
    totalDuplicatesPrevented: 0,
    totalFalsePositives: 0,
    totalProcessingTime: 0,
    averageProcessingTime: 0,
    checksByType: {
        idMatch: 0,
        contentMatch: 0,
        lockActive: 0
    },
    duplicatesByType: {
        idMatch: 0,
        contentMatch: 0,
        lockActive: 0
    },
    lastMetricsUpdate: Date.now(),
    hourlyStats: [],
    dailyStats: []
};

// Function to log duplicate detection metrics
function logDuplicateDetectionMetrics(operation, result, processingTime, details = {}) {
    duplicateDetectionMetrics.totalChecks++;
    duplicateDetectionMetrics.totalProcessingTime += processingTime;

    if (result.isDuplicate) {
        duplicateDetectionMetrics.totalDuplicatesFound++;
        if (result.prevented) {
            duplicateDetectionMetrics.totalDuplicatesPrevented++;
        }
    }

    // Track by type
    if (details.type) {
        duplicateDetectionMetrics.checksByType[details.type] = (duplicateDetectionMetrics.checksByType[details.type] || 0) + 1;
        if (result.isDuplicate) {
            duplicateDetectionMetrics.duplicatesByType[details.type] = (duplicateDetectionMetrics.duplicatesByType[details.type] || 0) + 1;
        }
    }

    // Calculate average processing time
    duplicateDetectionMetrics.averageProcessingTime = duplicateDetectionMetrics.totalProcessingTime / duplicateDetectionMetrics.totalChecks;

    // Log detailed metrics every 100 checks or when duplicates are found
    if (duplicateDetectionMetrics.totalChecks % 100 === 0 || result.isDuplicate) {
        console.log(`[DUPLICATE_METRICS] Total checks: ${duplicateDetectionMetrics.totalChecks}`);
        console.log(`[DUPLICATE_METRICS] Duplicates found: ${duplicateDetectionMetrics.totalDuplicatesFound} (${duplicateDetectionMetrics.totalDuplicatesPrevented} prevented)`);
        console.log(`[DUPLICATE_METRICS] Average processing time: ${Math.round(duplicateDetectionMetrics.averageProcessingTime)}ms`);
        console.log(`[DUPLICATE_METRICS] Detection rate: ${((duplicateDetectionMetrics.totalDuplicatesFound / duplicateDetectionMetrics.totalChecks) * 100).toFixed(2)}%`);

        if (result.isDuplicate) {
            console.log(`[DUPLICATE_METRICS] Duplicate detected - Type: ${details.type}, Processing time: ${processingTime}ms`);
        }
    }

    // Store hourly stats every hour
    const now = Date.now();
    if (now - duplicateDetectionMetrics.lastMetricsUpdate > 3600000) { // 1 hour
        duplicateDetectionMetrics.hourlyStats.push({
            timestamp: now,
            checks: duplicateDetectionMetrics.totalChecks,
            duplicates: duplicateDetectionMetrics.totalDuplicatesFound,
            averageTime: duplicateDetectionMetrics.averageProcessingTime
        });

        // Keep only last 24 hours
        if (duplicateDetectionMetrics.hourlyStats.length > 24) {
            duplicateDetectionMetrics.hourlyStats.shift();
        }

        duplicateDetectionMetrics.lastMetricsUpdate = now;
    }
}

// Function to get duplicate detection statistics
function getDuplicateDetectionStats() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const hourlyStats = duplicateDetectionMetrics.hourlyStats.filter(stat => stat.timestamp > oneHourAgo);
    const dailyStats = duplicateDetectionMetrics.hourlyStats.filter(stat => stat.timestamp > oneDayAgo);

    return {
        ...duplicateDetectionMetrics,
        detectionRate: duplicateDetectionMetrics.totalChecks > 0 ?
            (duplicateDetectionMetrics.totalDuplicatesFound / duplicateDetectionMetrics.totalChecks) * 100 : 0,
        preventionRate: duplicateDetectionMetrics.totalDuplicatesFound > 0 ?
            (duplicateDetectionMetrics.totalDuplicatesPrevented / duplicateDetectionMetrics.totalDuplicatesFound) * 100 : 0,
        hourlyAverage: hourlyStats.length > 0 ?
            hourlyStats.reduce((sum, stat) => sum + stat.duplicates, 0) / hourlyStats.length : 0,
        dailyAverage: dailyStats.length > 0 ?
            dailyStats.reduce((sum, stat) => sum + stat.duplicates, 0) / dailyStats.length : 0
    };
}

// API endpoint to get duplicate detection metrics
app.get('/api/metrics/duplicate-detection', (req, res) => {
    res.json(getDuplicateDetectionStats());
});

// API endpoint to get lock statistics
app.get('/api/metrics/locks', (req, res) => {
    res.json(getLockStats());
});

// Enhanced duplicate detection function with detailed logging
function checkForDuplicateOrder(order, callback) {
    const startTime = Date.now();
    const orderHash = createOrderHash(order);
    const lockKey = `order_${orderHash}`;

    console.log(`[DUPLICATE_CHECK] Starting duplicate check for order hash: ${orderHash.substring(0, 16)}...`);
    console.log(`[DUPLICATE_CHECK] Order details: Customer=${order.customer_name || 'N/A'}, Table=${order.table_number}, Total=${order.total}, Items=${order.items?.length || 0}`);

    // Check 1: Request lock to prevent race conditions
    if (requestLocks.has(lockKey)) {
        const lockTime = requestLocks.get(lockKey);
        const lockAge = Date.now() - lockTime;
        if (lockAge < LOCK_TIMEOUT) {
            console.log(`[DUPLICATE_CHECK] Request lock active for order hash: ${orderHash.substring(0, 16)}..., lock age: ${lockAge}ms`);
            return callback(true, { lock: true, message: 'Request already in progress' });
        } else {
            // Lock expired, remove it
            requestLocks.delete(lockKey);
            console.log(`[DUPLICATE_CHECK] Expired lock removed for order hash: ${orderHash.substring(0, 16)}..., lock age: ${lockAge}ms`);
        }
    }

    // Set lock for this request
    requestLocks.set(lockKey, Date.now());
    console.log(`[DUPLICATE_CHECK] Lock set for order hash: ${orderHash.substring(0, 16)}...`);

    // Check 2: Exact order ID match
    if (order.id) {
        console.log(`[DUPLICATE_CHECK] Checking for exact order ID match: ${order.id}`);
        db.get("SELECT id, bill_number, customer_name, table_number, total, created_at FROM orders WHERE id = ?", [order.id], (err, row) => {
            if (err) {
                console.error(`[DUPLICATE_CHECK] Error checking order ID existence:`, err.message);
                requestLocks.delete(lockKey);
                return callback(false);
            }

            if (row) {
                console.log(`[DUPLICATE_CHECK] Duplicate order detected with ID ${order.id}, existing bill number: ${row.bill_number}, created: ${row.created_at}`);
                console.log(`[DUPLICATE_CHECK] Duplicate check completed in ${Date.now() - startTime}ms - RESULT: DUPLICATE (ID match)`);
                requestLocks.delete(lockKey);
                return callback(true, row);
            }

            console.log(`[DUPLICATE_CHECK] No exact ID match found, proceeding to content-based check`);
            // Check 3: Content-based duplicate detection (same customer, table, items, total within last 5 minutes)
            checkContentDuplicate(order, (isDuplicate, existingOrder) => {
                if (isDuplicate) {
                    requestLocks.delete(lockKey);
                }
                console.log(`[DUPLICATE_CHECK] Duplicate check completed in ${Date.now() - startTime}ms - RESULT: ${isDuplicate ? 'DUPLICATE (Content)' : 'NO DUPLICATE'}`);
                callback(isDuplicate, existingOrder);
            });
        });
    } else {
        console.log(`[DUPLICATE_CHECK] No order ID provided, proceeding to content-based check`);
        // No order ID provided, check content-based duplicate
        checkContentDuplicate(order, (isDuplicate, existingOrder) => {
            if (isDuplicate) {
                requestLocks.delete(lockKey);
            }
            console.log(`[DUPLICATE_CHECK] Duplicate check completed in ${Date.now() - startTime}ms - RESULT: ${isDuplicate ? 'DUPLICATE (Content)' : 'NO DUPLICATE'}`);
            callback(isDuplicate, existingOrder);
        });
    }
}

// Content-based duplicate detection
function checkContentDuplicate(order, callback) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Create a hash of the order content for comparison
    const orderHash = createOrderHash(order);

    // Check for orders with same content within last 5 minutes
    const query = `
        SELECT id, bill_number, customer_name, table_number, total, created_at
        FROM orders
        WHERE created_at > ?
        AND customer_name = ?
        AND table_number = ?
        AND total = ?
        AND generated_by = ?
    `;

    const params = [
        fiveMinutesAgo,
        order.customer_name || '',
        order.table_number,
        order.total,
        order.generated_by || 'cashier'
    ];

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Error checking content duplicate:', err.message);
            return callback(false);
        }

        if (rows && rows.length > 0) {
            // Check if items match
            for (const existingOrder of rows) {
                if (ordersHaveSameItems(order, existingOrder)) {
                    console.log(`Content duplicate detected: same order content within 5 minutes, existing bill: ${existingOrder.bill_number}`);
                    return callback(true, existingOrder);
                }
            }
        }

        // No duplicate found
        callback(false);
    });
}

// Helper function to create a comprehensive hash of order content
function createOrderHash(order) {
    // Normalize and sort items for consistent hashing
    const normalizedItems = (order.items || []).map(item => ({
        name: (item.name || '').trim().toLowerCase(),
        price: parseFloat(item.price || 0).toFixed(2),
        quantity: parseInt(item.quantity || 1),
        total: parseFloat(item.total || 0).toFixed(2)
    })).sort((a, b) => a.name.localeCompare(b.name));

    // Create comprehensive content object with all relevant fields
    const content = {
        customer_name: (order.customer_name || '').trim().toLowerCase(),
        customer_phone: (order.customer_phone || '').trim(),
        table_number: (order.table_number || '').trim().toLowerCase(),
        items: normalizedItems,
        subtotal: parseFloat(order.subtotal || 0).toFixed(2),
        gst_rate: parseFloat(order.gst_rate || 5).toFixed(2),
        tax_amount: parseFloat(order.tax_amount || 0).toFixed(2),
        total: parseFloat(order.total || 0).toFixed(2),
        payment_mode: (order.payment_mode || '').trim().toLowerCase(),
        generated_by: (order.generated_by || 'cashier').trim().toLowerCase()
    };

    // Use crypto for more secure and consistent hashing
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');

    return hash;
}

// Helper function to check if two orders have the same items
function ordersHaveSameItems(order1, order2) {
    if (!order1.items || !order2.items) return false;

    // Check if both orders have the same number of items
    if (order1.items.length !== order2.items.length) return false;

    // Create sorted copies of items for comparison
    const items1 = [...order1.items].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const items2 = [...order2.items].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Compare each item in detail
    for (let i = 0; i < items1.length; i++) {
        const item1 = items1[i];
        const item2 = items2[i];

        // Compare item name, quantity, and price
        if (item1.name !== item2.name ||
            item1.quantity !== item2.quantity ||
            item1.price !== item2.price) {
            return false;
        }
    }

    return true;
}

function processOrder(order, res) {
    // Check if this is a temporary bill number from frontend
    const isTempBillNumber = order.billNumber && order.billNumber.startsWith('TEMP-');

    let billNumber = order.billNumber;
    if (!billNumber || isTempBillNumber) {
        // Generate a new unique bill number on server side
        billNumber = generateUniqueBillNumber();
        console.log(`Generated new bill number ${billNumber} for ${isTempBillNumber ? 'temp' : 'missing'} bill number`);
    }

    // Always set order status to 'completed' for orders submitted via POST /api/orders
    // This ensures orders are marked as completed when saved from the cashier interface
    let orderStatus = 'completed';
    console.log(`Order status set to 'completed' for submitted order`);

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
                // Bill number exists, check if it was provided in the order or generated
                if (order.billNumber && order.billNumber === billNumber) {
                    // Bill number was provided and exists, treat as duplicate
                    console.log(`Duplicate order detected: bill number ${billNumber} already exists`);
                    return res.status(409).json({
                        error: 'Duplicate order',
                        message: 'An order with this bill number already exists'
                    });
                } else {
                    // Bill number was generated and exists (collision), generate new one and retry
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
            }

            // Bill number is unique, proceed with insertion
            console.log(`Inserting order with status: ${orderStatus}`);
            db.run(`INSERT INTO orders (bill_number, customer_name, customer_phone, table_number, items, subtotal, gst_rate, tax_amount, total, payment_mode, cashier_id, cashier_name, status, date, generated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [billNumber, order.customer_name, order.customer_phone, order.table_number,
                 JSON.stringify(order.items), order.subtotal, order.gst_rate, order.tax_amount,
                 order.total, order.payment_mode, order.cashier_id, order.cashier_name,
                 orderStatus, order.date, order.generated_by || 'cashier'],
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

// Secure database backup route
app.get('/backup-db', (req, res) => {
    const expectedToken = process.env.BACKUP_TOKEN;
    const providedToken = req.headers['x-backup-token'] || req.query.token;

    if (!expectedToken || providedToken !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const dbPath = path.join(__dirname, 'restaurant_pos.db');

    res.download(dbPath, 'restaurant_pos_backup.db', (err) => {
        if (err) {
            console.error('Error downloading database backup:', err);
            return res.status(500).json({ error: 'Failed to download backup' });
        }
    });
});

// Configure multer for file uploads
const upload = multer({ dest: 'temp/' });

// Function to validate SQLite database file
function validateSQLiteFile(filePath) {
    return new Promise((resolve, reject) => {
        // Check file size (SQLite files should be at least 512 bytes for header)
        fs.stat(filePath, (err, stats) => {
            if (err) {
                return reject(new Error('Cannot access file'));
            }

            if (stats.size < 512) {
                return reject(new Error('File too small to be a valid SQLite database'));
            }

            // Read the SQLite header (first 16 bytes should be "SQLite format 3\000")
            const buffer = Buffer.alloc(16);
            const fd = fs.openSync(filePath, 'r');

            try {
                const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
                fs.closeSync(fd);

                if (bytesRead !== 16) {
                    return reject(new Error('Cannot read file header'));
                }

                const header = buffer.toString('ascii', 0, 16);
                if (header !== 'SQLite format 3\0') {
                    return reject(new Error('Invalid SQLite database file'));
                }

                resolve(true);
            } catch (error) {
                fs.closeSync(fd);
                reject(error);
            }
        });
    });
}

// Secure database restore route
app.post('/restore-db', upload.single('dbfile'), async (req, res) => {
    const expectedToken = process.env.BACKUP_TOKEN;
    const providedToken = req.headers['x-backup-token'] || req.query.token;

    if (!expectedToken || providedToken !== expectedToken) {
        // Clean up uploaded file if unauthorized
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error cleaning up unauthorized upload:', err);
            });
        }
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No database file provided' });
    }

    try {
        // Validate the uploaded file is a proper SQLite database
        await validateSQLiteFile(req.file.path);
    } catch (validationError) {
        console.error('Database validation failed:', validationError.message);
        // Clean up invalid uploaded file
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Error cleaning up invalid upload:', err);
        });
        return res.status(400).json({ error: 'Invalid database file: ' + validationError.message });
    }

    const dbPath = path.join(__dirname, 'restaurant_pos.db');
    const backupPath = path.join(__dirname, `restaurant_pos.db.bak.${Date.now()}`);

    // First, create a backup of the current database
    fs.copyFile(dbPath, backupPath, (err) => {
        if (err) {
            console.error('Error creating backup:', err);
            // Clean up uploaded file
            fs.unlink(req.file.path, (err2) => {
                if (err2) console.error('Error cleaning up upload after backup failure:', err2);
            });
            return res.status(500).json({ error: 'Failed to create backup of current database' });
        }

        // Now replace the database with the uploaded file
        fs.copyFile(req.file.path, dbPath, (err) => {
            if (err) {
                console.error('Error restoring database:', err);
                // Clean up uploaded file
                fs.unlink(req.file.path, (err2) => {
                    if (err2) console.error('Error cleaning up upload after restore failure:', err2);
                });
                return res.status(500).json({ error: 'Failed to restore database' });
            }

            // Clean up the uploaded file
            fs.unlink(req.file.path, (err) => {
                if (err) {
                    console.error('Error cleaning up uploaded file:', err);
                }
            });

            console.log(`Database restored successfully. Backup created at: ${backupPath}`);
            res.json({ success: true, message: 'Database restored successfully!' });
        });
    });
});

// Catch-all handler for 404 errors (only for non-API routes)
app.get('*', (req, res) => {
    // Only serve 404 for non-API routes
    if (!req.path.startsWith('/api/') && req.path !== '/backup-db') {
        res.status(404).sendFile(path.join(__dirname, '..', '404.php'));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
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
