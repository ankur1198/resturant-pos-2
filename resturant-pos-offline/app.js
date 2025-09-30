// Application Data and State Management
class RestaurantPOS {
    constructor() {
        // Initialize with provided data
        // Initialize with empty data - will be loaded from server
        this.data = {
            restaurant: {},
            users: [],
            menuCategories: [],
            menuItems: [],
            paymentModes: [],
            orders: [],
            qrConfig: {
                enabled: true,
                uploadedImage: null
            }
        };

        this.currentUser = null;
        this.cart = [];
        this.adminCart = [];
        this.selectedPaymentMode = "Cash";
        this.currentOrder = null;
        this.selectedUserId = null;
        this.lastSentOrderId = null;
        this.isSavingAdminBill = false;
        this.isCompletingOrder = false;
        this.pendingRequests = new Set();
        this.lastOrderHash = null;

        // Enhanced: Track pending order content hashes to prevent duplicate submissions
        this.pendingOrderHashes = new Set();
        this.orderSubmissionTimeouts = new Map(); // Track cleanup timeouts
        this.hashTimestamps = new Map(); // Track when hashes were added for cleanup
        this.hashMetadata = new Map(); // Track additional metadata for each hash

        // New: Submission queue for handling concurrent requests
        this.submissionQueue = [];
        this.isProcessingQueue = false;
        this.submissionProgress = new Map(); // Track submission progress

        // New: Enhanced error tracking and recovery
        this.submissionErrors = new Map();
        this.recoveryAttempts = new Map();
        this.errorRecoveryStrategies = new Map();
        this.submissionProgressIndicators = new Map();

        // Duplicate prevention configuration with validation
        this.duplicatePreventionConfig = {
            cleanupTimeout: 30000, // 30 seconds
            maxPendingHashes: 50,   // Maximum pending hashes to prevent memory leaks
            enableLogging: true,    // Enable duplicate detection logging
            autoCleanupInterval: 30000, // Auto cleanup every 30 seconds (more aggressive)
            hashExpirationTime: 180000, // 3 minutes expiration for hashes (reduced)
            maxCleanupBatchSize: 20, // Maximum hashes to clean up per batch
            emergencyCleanupThreshold: 100, // Trigger emergency cleanup if hashes exceed this
            memoryPressureThreshold: 75, // Memory usage percentage to trigger cleanup
            hashRetryAttempts: 3, // Number of retry attempts for hash generation
            enableDetailedLogging: false // Enable verbose logging for debugging
        };

        // Validate configuration
        this.validateDuplicatePreventionConfig();
    }

    validateDuplicatePreventionConfig() {
        const config = this.duplicatePreventionConfig;

        // Validate numeric values
        if (typeof config.cleanupTimeout !== 'number' || config.cleanupTimeout < 1000) {
            console.warn('Invalid cleanupTimeout, using default 30000ms');
            config.cleanupTimeout = 30000;
        }

        if (typeof config.maxPendingHashes !== 'number' || config.maxPendingHashes < 1) {
            console.warn('Invalid maxPendingHashes, using default 50');
            config.maxPendingHashes = 50;
        }

        if (typeof config.autoCleanupInterval !== 'number' || config.autoCleanupInterval < 1000) {
            console.warn('Invalid autoCleanupInterval, using default 30000ms');
            config.autoCleanupInterval = 30000;
        }

        if (typeof config.hashExpirationTime !== 'number' || config.hashExpirationTime < 10000) {
            console.warn('Invalid hashExpirationTime, using default 180000ms');
            config.hashExpirationTime = 180000;
        }

        if (typeof config.maxCleanupBatchSize !== 'number' || config.maxCleanupBatchSize < 1) {
            console.warn('Invalid maxCleanupBatchSize, using default 20');
            config.maxCleanupBatchSize = 20;
        }

        if (typeof config.emergencyCleanupThreshold !== 'number' || config.emergencyCleanupThreshold < 10) {
            console.warn('Invalid emergencyCleanupThreshold, using default 100');
            config.emergencyCleanupThreshold = 100;
        }

        if (typeof config.hashRetryAttempts !== 'number' || config.hashRetryAttempts < 0) {
            console.warn('Invalid hashRetryAttempts, using default 3');
            config.hashRetryAttempts = 3;
        }

        console.log('Duplicate prevention configuration validated successfully');

        // Duplicate detection metrics with enhanced tracking
        this.duplicateDetectionMetrics = {
            totalSubmissions: 0,
            duplicatesPrevented: 0,
            successfulSubmissions: 0,
            cleanupEvents: 0,
            memoryCleanupEvents: 0,
            hashGenerationErrors: 0,
            emergencyCleanups: 0,
            averageHashGenerationTime: 0,
            totalHashGenerationTime: 0
        };

        // Performance monitoring
        this.hashGenerationTimes = [];

        // Start automatic cleanup
        this.startAutoCleanup();

    // Bind methods to maintain context
    this.handleLogin = this.handleLogin.bind(this);
    this.handleNavClick = this.handleNavClick.bind(this);
    this.handleCategoryClick = this.handleCategoryClick.bind(this);
    this.handlePaymentClick = this.handlePaymentClick.bind(this);

    this.init();
    }

    startAutoCleanup() {
        if (this.autoCleanupIntervalId) {
            clearInterval(this.autoCleanupIntervalId);
        }

        this.autoCleanupIntervalId = setInterval(() => {
            const now = Date.now();
            const expiredHashes = [];

            for (const [hash, timestamp] of this.hashTimestamps.entries()) {
                if (now - timestamp > this.duplicatePreventionConfig.hashExpirationTime) {
                    expiredHashes.push(hash);
                }
            }

            if (expiredHashes.length > 0) {
                expiredHashes.forEach(hash => {
                    this.pendingOrderHashes.delete(hash);
                    this.hashTimestamps.delete(hash);
                    this.hashMetadata.delete(hash);

                    const timeoutId = this.orderSubmissionTimeouts.get(hash);
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        this.orderSubmissionTimeouts.delete(hash);
                    }
                });

                this.duplicateDetectionMetrics.cleanupEvents++;
                if (this.duplicatePreventionConfig.enableLogging) {
                    console.log(`[AutoCleanup] Removed ${expiredHashes.length} expired order hashes`);
                }
            }
        }, this.duplicatePreventionConfig.autoCleanupInterval);
    }

    stopAutoCleanup() {
        if (this.autoCleanupIntervalId) {
            clearInterval(this.autoCleanupIntervalId);
            this.autoCleanupIntervalId = null;
            if (this.duplicatePreventionConfig.enableLogging) {
                console.log('[AutoCleanup] Stopped automatic cleanup');
            }
        }
    }

    init() {
        // Load data from server API
        this.loadDataFromServer()
            .then(() => {
                this.setupEventListeners();
                this.showScreen('loginScreen');
            })
            .catch(() => {
                // Setup with empty data if server is unavailable
                this.setupEventListeners();
                this.showScreen('loginScreen');
            });
    }

    async loadDataFromServer() {
        try {
            const response = await fetch('/api/data');
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();
            this.data = this.sanitizeServerData(data);
            
            // FIX: Properly parse and validate order data
            if (this.data.orders && Array.isArray(this.data.orders)) {
                this.data.orders = this.data.orders.map(order => {
                    try {
                        // Parse items if stored as JSON string
                        if (typeof order.items === 'string') {
                            order.items = JSON.parse(order.items);
                        }
                        // Validate items array
                        if (!Array.isArray(order.items)) {
                            order.items = [];
                        }
                        // Validate and normalize each item
                        order.items = order.items.map(item => ({
                            name: item.name || 'Unknown Item',
                            price: parseFloat(item.price) || 0,
                            quantity: parseInt(item.quantity) || 1,
                            total: parseFloat(item.total) || (parseFloat(item.price) * parseInt(item.quantity))
                        }));

                        // Ensure numeric fields are properly typed
                        order.subtotal = parseFloat(order.subtotal) || 0;
                        order.tax_amount = parseFloat(order.tax_amount) || 0;
                        order.total = parseFloat(order.total) || 0;
                        order.gst_rate = parseFloat(order.gst_rate) || 5;

                        // Map database field names to app field names
                        order.billNumber = String(order.bill_number || '');
                        delete order.bill_number;

                        return order;
                    } catch (error) {
                        console.error(`Error parsing order ${order.id}:`, error);
                        const fallbackOrder = { ...order, items: [] };
                        fallbackOrder.billNumber = String(fallbackOrder.bill_number || '');
                        delete fallbackOrder.bill_number;
                        return fallbackOrder;
                    }
                });
            }
            
            // FIX: Improved currentOrder restoration - only restore pending orders
            if (this.data.orders && this.data.orders.length > 0) {
                this.data.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                
                const pendingOrder = this.data.orders.find(order => 
                    order.status === 'pending' && 
                    Array.isArray(order.items) && 
                    order.items.length > 0
                );
                
                if (pendingOrder) {
                    this.currentOrder = pendingOrder;
                    console.log('Restored pending currentOrder:', this.currentOrder.billNumber);
                } else {
                    this.currentOrder = null;
                }
            } else {
                this.currentOrder = null;
            }
            
            this.currentUser = null;
            this.cart = [];
            this.adminCart = [];
            this.selectedPaymentMode = "Cash";
            this.selectedUserId = null;
            this.lastSentOrderId = null;

            console.log('Data loaded successfully from server');
            return true;
        } catch (error) {
            console.error('Error loading data from server:', error);
            throw error;
        }
    }

    sanitizeServerData(data) {
        // Ensure all required properties exist with defaults
        return {
            restaurant: data.restaurant || {},
            users: Array.isArray(data.users) ? data.users : [],
            menuCategories: Array.isArray(data.menuCategories) ? data.menuCategories : [],
            menuItems: Array.isArray(data.menuItems) ? data.menuItems : [],
            paymentModes: Array.isArray(data.paymentModes) ? data.paymentModes : [],
            orders: Array.isArray(data.orders) ? data.orders : [],
            qrConfig: data.qrConfig || { enabled: true, uploadedImage: null }
        };
    }

    // Backup and Recovery Methods
    exportOrderHistory() {
        try {
            const exportData = {
                exportDate: new Date().toISOString(),
                restaurant: this.data.restaurant,
                orders: this.data.orders,
                totalOrders: this.data.orders.length,
                dateRange: {
                    oldest: this.data.orders.length > 0 ? this.data.orders[this.data.orders.length - 1].created_at : null,
                    newest: this.data.orders.length > 0 ? this.data.orders[0].created_at : null
                }
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(dataBlob);
            link.download = `order_history_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            this.showToast('Order history exported successfully!', 'success');
        } catch (error) {
            console.error('Error exporting order history:', error);
            this.showToast('Error exporting order history', 'error');
        }
    }

    importOrderHistory(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importData = JSON.parse(e.target.result);

                    // Validate import data structure
                    if (!importData.orders || !Array.isArray(importData.orders)) {
                        throw new Error('Invalid backup file format');
                    }

                    // Show confirmation dialog
                    const orderCount = importData.orders.length;
                    const confirmMessage = `Import ${orderCount} orders from backup file?\n\n` +
                        `Export Date: ${new Date(importData.exportDate).toLocaleString()}\n` +
                        `This will merge orders with existing data.`;

                    if (!confirm(confirmMessage)) {
                        reject(new Error('Import cancelled by user'));
                        return;
                    }

                    // Import orders to database
                    this.importOrdersToDatabase(importData.orders)
                        .then(() => {
                            this.showToast(`Successfully imported ${orderCount} orders!`, 'success');
                            // Reload data from server
                            this.loadDataFromServer();
                            resolve();
                        })
                        .catch(error => {
                            console.error('Error importing orders:', error);
                            this.showToast('Error importing orders to database', 'error');
                            reject(error);
                        });

                } catch (error) {
                    console.error('Error parsing backup file:', error);
                    this.showToast('Invalid backup file format', 'error');
                    reject(error);
                }
            };

            reader.onerror = () => {
                this.showToast('Error reading backup file', 'error');
                reject(new Error('File read error'));
            };

            reader.readAsText(file);
        });
    }

    async importOrdersToDatabase(orders) {
        const importPromises = orders.map(order => {
            return fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...order,
                    billNumber: order.billNumber || `IMPORT-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // Use existing or generate temp
                    generated_by: 'import' // Mark as imported
                })
            });
        });

        const results = await Promise.allSettled(importPromises);

        const successful = results.filter(result => result.status === 'fulfilled').length;
        const failed = results.filter(result => result.status === 'rejected').length;

        if (failed > 0) {
            console.warn(`Import completed: ${successful} successful, ${failed} failed`);
        }

        return { successful, failed };
    }

    // Auto-backup functionality
    setupAutoBackup() {
        // Backup every 24 hours
        setInterval(() => {
            if (this.currentUser && this.currentUser.role === 'admin') {
                this.performAutoBackup();
            }
        }, 24 * 60 * 60 * 1000); // 24 hours
    }

    performAutoBackup() {
        try {
            const backupData = {
                timestamp: new Date().toISOString(),
                orders: this.data.orders,
                restaurant: this.data.restaurant
            };

            // Store in localStorage as emergency backup
            localStorage.setItem('pos_auto_backup', JSON.stringify(backupData));

            // Also create a downloadable backup file (optional)
            const dataStr = JSON.stringify(backupData, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });

            // Create download link but don't auto-click (user can manually download if needed)
            const backupUrl = URL.createObjectURL(dataBlob);
            console.log('Auto-backup created. Download URL:', backupUrl);

            console.log('Auto-backup completed successfully');
        } catch (error) {
            console.error('Auto-backup failed:', error);
        }
    }

    restoreFromAutoBackup() {
        try {
            const backupStr = localStorage.getItem('pos_auto_backup');
            if (!backupStr) {
                this.showToast('No auto-backup found', 'error');
                return;
            }

            const backupData = JSON.parse(backupStr);
            const confirmMessage = `Restore from auto-backup?\n\n` +
                `Backup Date: ${new Date(backupData.timestamp).toLocaleString()}\n` +
                `Orders: ${backupData.orders.length}\n\n` +
                `This will replace current data with backup data.`;

            if (!confirm(confirmMessage)) {
                return;
            }

            // Restore data
            this.data.orders = backupData.orders;
            this.data.restaurant = backupData.restaurant;

            this.showToast('Data restored from auto-backup!', 'success');

            // Refresh UI
            this.loadPendingOrders();
            this.loadAdminBillManagement();

        } catch (error) {
            console.error('Error restoring from auto-backup:', error);
            this.showToast('Error restoring from backup', 'error');
        }
    }

    // Utility Functions
    getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-IN');
    }

    formatTime(dateString) {
        return new Date(dateString).toLocaleTimeString('en-IN', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    generateBillNumber() {
        // Generate a temporary bill number for frontend use
        // Server will generate the final unique bill number
        return `TEMP-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    }

    createOrderHash(order) {
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

        // Use crypto-like hashing for client-side (fallback to simple hash if crypto not available)
        let hash = '';
        try {
            if (window.crypto && window.crypto.subtle) {
                // Use Web Crypto API if available
                const encoder = new TextEncoder();
                const data = encoder.encode(JSON.stringify(content));
                return crypto.subtle.digest('SHA-256', data).then(buffer => {
                    const hashArray = Array.from(new Uint8Array(buffer));
                    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                });
            } else {
                // Fallback to simple hash
                const str = JSON.stringify(content);
                let h = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    h = ((h << 5) - h) + char;
                    h = h & h; // Convert to 32-bit integer
                }
                return Math.abs(h).toString(16);
            }
        } catch (error) {
            // Final fallback
            const str = JSON.stringify(content);
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                h = ((h << 5) - h) + char;
                h = h & h;
            }
            return Math.abs(h).toString(16);
        }
    }

    // Authentication
    handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        
        console.log('Login attempt:', username); // Debug log
        
        if (!username || !password) {
            this.showLoginError('Please enter both username and password');
            return;
        }
        
        if (this.login(username, password)) {
            this.hideLoginError();
            // After successful login, show bill preview only for cashiers with pending currentOrder
            if (this.currentUser && this.currentUser.role === 'cashier' && 
                this.currentOrder && this.currentOrder.status === 'pending') {
                this.showBillPreview();
            }
        } else {
            this.showLoginError('Invalid username or password');
        }
    }

    login(username, password) {
        console.log('Attempting login for:', username); // Debug log

        const user = this.data.users.find(u => u.username === username && u.password === password);

        if (user) {
            this.currentUser = user;
            user.lastLogin = new Date().toISOString();
            this.showToast('Login successful!', 'success');

            // Update last login in database
            fetch(`/api/users/${user.id}/last-login`, {
                method: 'PUT'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('Last login updated successfully');
                } else {
                    console.warn('Failed to update last login');
                }
            })
            .catch(error => {
                console.error('Error updating last login:', error);
            });

            // For cashiers, restore pending orders specific to this user
            if (user.role === 'cashier') {
                const userPendingOrder = this.data.orders.find(order => 
                    order.status === 'pending' && order.cashier_id === user.id
                );
                if (userPendingOrder) {
                    this.currentOrder = userPendingOrder;
                    console.log('Restored user-specific pending order:', this.currentOrder.billNumber);
                } else {
                    this.currentOrder = null;
                }
            } else {
                // For admin, clear currentOrder
                this.currentOrder = null;
            }

            if (user.role === 'admin') {
                this.showScreen('adminScreen');
                setTimeout(() => this.initAdminDashboard(), 100);
            } else {
                this.showScreen('cashierScreen');
                setTimeout(() => this.initCashierInterface(), 100);
            }
            return true;
        }
        return false;
    }

    showLoginError(message) {
        const errorEl = document.getElementById('loginError');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    }

    hideLoginError() {
        const errorEl = document.getElementById('loginError');
        if (errorEl) {
            errorEl.classList.add('hidden');
        }
    }

    logout() {
        this.currentUser = null;
        this.cart = [];
        this.adminCart = [];
        this.selectedPaymentMode = 'Cash';
        this.currentOrder = null;
        this.showScreen('loginScreen');
        this.showToast('Logged out successfully', 'info');
        
        // Reset login form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.reset();
        }
        this.hideLoginError();
    }

    // Screen Management
    showScreen(screenId) {
        console.log('Showing screen:', screenId); // Debug log
        
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
        } else {
            console.error('Screen not found:', screenId);
        }
    }

    // Admin Dashboard
    initAdminDashboard() {
        console.log('Initializing admin dashboard'); // Debug log

        const adminUserNameEl = document.getElementById('adminUserName');
        if (adminUserNameEl && this.currentUser) {
            adminUserNameEl.textContent = this.currentUser.name;
        }

        this.setupMenuCategoryFilters();
        this.loadAdminBillManagement();
        this.loadMenuItems();
        this.loadSalesReports();
        this.loadUsers();
        this.loadRestaurantSettings();
        this.loadQRSettings();
        this.loadOrderHistory();
        this.loadPendingOrders();
        this.setupExportFilters();
    }

    loadAdminBillManagement() {
        const today = this.getTodayDate();
        const todayOrders = this.data.orders.filter(order => order.date === today);

        // Update stats
        const todayBillsCount = todayOrders.length;
        const todayRevenue = todayOrders.reduce((sum, order) => sum + order.total, 0);
        const pendingBillsCount = this.data.orders.filter(order => order.status === 'pending').length;

        const elements = {
            todayBillsCount: document.getElementById('todayBillsCount'),
            todayRevenue: document.getElementById('todayRevenue'),
            pendingBillsCount: document.getElementById('pendingBillsCount')
        };

        if (elements.todayBillsCount) elements.todayBillsCount.textContent = todayBillsCount;
        if (elements.todayRevenue) elements.todayRevenue.textContent = `₹${todayRevenue.toFixed(2)}`;
        if (elements.pendingBillsCount) elements.pendingBillsCount.textContent = pendingBillsCount;

        // Load recent bills
        const recentOrders = [...this.data.orders]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 10);

        const recentBillsList = document.getElementById('recentBillsList');
        if (recentBillsList) {
            if (recentOrders.length === 0) {
                recentBillsList.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No bills found</p>';
            } else {
                recentBillsList.innerHTML = recentOrders.map(order => `
                    <div class="bill-item" onclick="pos.showOrderDetails(${order.id})">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>Bill #${order.billNumber}</strong><br>
                                <small>${order.customer_name || 'Walk-in Customer'} | ${this.formatDate(order.created_at)}</small>
                            </div>
                            <div style="text-align: right;">
                                <strong>₹${order.total.toFixed(2)}</strong><br>
                                <small>${order.payment_mode}</small>
                            </div>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    loadPendingOrders() {
        const container = document.getElementById('pendingOrdersList');
        if (!container) return;

        let pendingOrders = this.data.orders.filter(order => order.status === 'pending');

        // Filter by cashier if not admin
        if (this.currentUser && this.currentUser.role === 'cashier') {
            pendingOrders = pendingOrders.filter(order => order.cashier_id === this.currentUser.id);
        }

        // Sort by created_at descending
        pendingOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (pendingOrders.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--color-text-secondary);">No pending orders found</p>';
            return;
        }

        container.innerHTML = pendingOrders.map(order => `
            <div class="pending-order-item">
                <div class="pending-order-header">
                    <div class="pending-order-info">
                        <h4>Bill #${order.billNumber}</h4>
                        <div class="pending-order-meta">
                            ${order.customer_name || 'Walk-in Customer'} | Table: ${order.table_number} | ${this.formatDate(order.created_at)} ${this.formatTime(order.created_at)}
                        </div>
                        <div class="pending-order-cashier">Cashier: ${order.cashier_name}</div>
                    </div>
                    <div class="pending-order-amount">
                        <div class="pending-order-total">₹${order.total.toFixed(2)}</div>
                        <div class="pending-order-payment">${order.payment_mode}</div>
                    </div>
                </div>
                <div class="pending-order-items">
                    ${order.items.map(item => `
                        <div class="pending-order-item-row">
                            <span>${item.name} (${item.quantity}x)</span>
                            <span>₹${item.total.toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="pending-order-actions">
                    <button class="btn btn--success btn--sm" onclick="pos.completeOrder(${order.id})">Complete Order</button>
                    <button class="btn btn--outline btn--sm" onclick="pos.showOrderDetails(${order.id})">View Details</button>
                </div>
            </div>
        `).join('');
    }

    completeOrder(orderId) {
        const order = this.data.orders.find(o => o.id === orderId);
        if (!order) {
            this.showToast('Order not found', 'error');
            return;
        }

        // Check if order is already completed
        if (order.status === 'completed') {
            this.showToast('Order is already completed', 'info');
            return;
        }

        if (!confirm(`Are you sure you want to mark Bill #${order.billNumber} as completed?`)) {
            return;
        }

        const completeOrderBtn = document.querySelector(`.pending-order-actions button[onclick="pos.completeOrder(${orderId})"]`);
        if (completeOrderBtn) {
            completeOrderBtn.disabled = true;
            completeOrderBtn.textContent = 'Completing...';
        }

        fetch(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'completed' })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update local data
                order.status = 'completed';
                this.loadPendingOrders();
                this.loadAdminBillManagement(); // Refresh stats
                this.showToast('Order completed successfully!', 'success');

                // Close bill preview modal if open
                this.closeModal('billModal');
            } else {
                throw new Error('Failed to complete order');
            }
        })
        .catch(error => {
            console.error('Error completing order:', error);
            this.showToast('Error completing order', 'error');
        })
        .finally(() => {
            if (completeOrderBtn) {
                completeOrderBtn.disabled = false;
                completeOrderBtn.textContent = 'Complete Order';
            }
        });
    }

    openAdminBillModal() {
        console.log('Opening admin bill modal'); // Debug log
        
        const modal = document.getElementById('adminBillModal');
        if (!modal) {
            console.error('Admin bill modal not found');
            return;
        }

        // Reset form and cart
        this.adminCart = [];
        
        // Set current date/time
        const now = new Date();
        const localISOTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const dateInput = document.getElementById('adminBillDate');
        if (dateInput) {
            dateInput.value = localISOTime;
        }

        // Populate cashier dropdown
        const cashierSelect = document.getElementById('adminCashier');
        if (cashierSelect) {
            cashierSelect.innerHTML = '<option value="">Select Cashier</option>';
            this.data.users.filter(u => u.role === 'cashier').forEach(cashier => {
                cashierSelect.innerHTML += `<option value="${cashier.id}">${cashier.name}</option>`;
            });
        }

        this.loadAdminMenuItems();
        this.updateAdminCart();
        modal.classList.remove('hidden');
        this.showToast('Admin bill modal opened', 'info');
    }

    loadAdminMenuItems(searchFilter = '') {
        const container = document.getElementById('adminMenuItems');
        if (!container) return;

        let filteredItems = this.data.menuItems.filter(item => item.available);

        if (searchFilter) {
            filteredItems = filteredItems.filter(item => 
                item.name.toLowerCase().includes(searchFilter.toLowerCase())
            );
        }

        container.innerHTML = filteredItems.map(item => `
            <div class="admin-menu-item" onclick="pos.addToAdminCart(${item.id})">
                <strong>${item.name}</strong><br>
                <small>₹${item.price.toFixed(2)}</small>
            </div>
        `).join('');
    }

    addToAdminCart(itemId) {
        console.log('Adding item to admin cart:', itemId); // Debug log
        
        const item = this.data.menuItems.find(i => i.id === itemId);
        if (!item || !item.available) {
            this.showToast('Item not available', 'error');
            return;
        }

        const existingItem = this.adminCart.find(c => c.id === itemId);
        if (existingItem) {
            existingItem.quantity += 1;
            existingItem.total = existingItem.quantity * existingItem.price;
        } else {
            this.adminCart.push({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: 1,
                total: item.price
            });
        }

        this.updateAdminCart();
        this.showToast(`${item.name} added to cart`, 'success');
    }

    removeFromAdminCart(itemId) {
        this.adminCart = this.adminCart.filter(item => item.id !== itemId);
        this.updateAdminCart();
        this.showToast('Item removed from cart', 'info');
    }

    updateAdminCartQuantity(itemId, change) {
        const item = this.adminCart.find(c => c.id === itemId);
        if (item) {
            item.quantity += change;
            if (item.quantity <= 0) {
                this.removeFromAdminCart(itemId);
            } else {
                item.total = item.quantity * item.price;
                this.updateAdminCart();
            }
        }
    }

    updateAdminCart() {
        const container = document.getElementById('adminCartItems');
        if (!container) return;

        const subtotal = this.adminCart.reduce((sum, item) => sum + item.total, 0);
        const gstRate = this.data.restaurant.gstRate || 5;
        const gstAmount = (subtotal * gstRate) / 100;
        const grandTotal = subtotal + gstAmount;

        if (this.adminCart.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No items added</p>';
        } else {
            container.innerHTML = this.adminCart.map(item => `
                <div class="admin-cart-item">
                    <div>
                        <strong>${item.name}</strong><br>
                        <small>₹${item.price.toFixed(2)} each</small>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button class="quantity-btn" onclick="pos.updateAdminCartQuantity(${item.id}, -1)">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn" onclick="pos.updateAdminCartQuantity(${item.id}, 1)">+</button>
                        <span style="font-weight: bold; margin-left: 12px;">₹${item.total.toFixed(2)}</span>
                        <button class="remove-item" onclick="pos.removeFromAdminCart(${item.id})">×</button>
                    </div>
                </div>
            `).join('');
        }

        const elements = {
            adminSubtotal: document.getElementById('adminSubtotal'),
            adminGst: document.getElementById('adminGst'),
            adminTotal: document.getElementById('adminTotal')
        };

        if (elements.adminSubtotal) elements.adminSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
        if (elements.adminGst) elements.adminGst.textContent = `₹${gstAmount.toFixed(2)}`;
        if (elements.adminTotal) elements.adminTotal.textContent = `₹${grandTotal.toFixed(2)}`;

        const saveBtn = document.getElementById('saveAdminBill');
        if (saveBtn) {
            saveBtn.disabled = this.adminCart.length === 0;
        }
    }

    async saveAdminBill() {
        const customerName = document.getElementById('adminCustomerName').value.trim();
        const customerPhone = document.getElementById('adminCustomerPhone').value.trim();
        const tableNumber = document.getElementById('adminTableNumber').value.trim();
        const billDate = document.getElementById('adminBillDate').value;
        const cashierId = document.getElementById('adminCashier').value;
        const paymentMode = document.getElementById('adminPaymentMode').value;

        if (!tableNumber || !billDate || !cashierId || !paymentMode) {
            this.showToast('Please fill all required fields', 'error');
            return;
        }

        if (this.adminCart.length === 0) {
            this.showToast('Please add items to the bill', 'error');
            return;
        }

        const cashier = this.data.users.find(u => u.id == cashierId);
        const subtotal = this.adminCart.reduce((sum, item) => sum + item.total, 0);
        const gstRate = this.data.restaurant.gstRate || 5;
        const gstAmount = (subtotal * gstRate) / 100;
        const grandTotal = subtotal + gstAmount;

        // Use undefined billNumber initially to let server generate unique bill number
        const billNumber = undefined;
        const order = {
            id: Date.now(),
            billNumber: billNumber,
            customer_name: customerName,
            customer_phone: customerPhone,
            table_number: tableNumber,
            items: [...this.adminCart],
            subtotal: subtotal,
            gst_rate: gstRate,
            tax_amount: gstAmount,
            total: grandTotal,
            payment_mode: paymentMode,
            cashier_id: parseInt(cashierId),
            cashier_name: cashier.name,
            status: 'completed',
            created_at: new Date(billDate).toISOString(),
            date: new Date(billDate).toISOString().split('T')[0],
            generated_by: 'admin'
        };

        // Generate hash of order content to detect duplicates
        const orderContentHash = await this.createOrderHash(order);

        // Check if this order is already pending submission
        if (this.pendingOrderHashes.has(orderContentHash)) {
            this.showToast('Duplicate bill not allowed. This order is already being submitted.', 'warning');
            return;
        }

        // Add hash to pending set
        this.pendingOrderHashes.add(orderContentHash);

        // Disable save button to prevent multiple clicks
        const saveBtn = document.getElementById('saveAdminBill');
        if (saveBtn) {
            saveBtn.disabled = true;
        }

        // Save order to database
        fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(order)
        })
        .then(response => response.json())
        .then(data => {
            // Remove hash from pending set
            this.pendingOrderHashes.delete(orderContentHash);

            // Re-enable save button
            if (saveBtn) {
                saveBtn.disabled = false;
            }

            if (data.success) {
                // Update order with server-generated bill number
                if (data.billNumber) {
                    order.billNumber = data.billNumber;
                    console.log(`Server generated bill number: ${data.billNumber}`);
                }

                // FIX: Check for duplicates AFTER getting server-generated bill number
                // Use server-generated bill number for reliable duplicate detection
                const existingOrderIndex = this.data.orders.findIndex(existingOrder => {
                    // Primary check: server-generated bill number
                    if (existingOrder.billNumber && order.billNumber) {
                        return existingOrder.billNumber === order.billNumber;
                    }
                    // Fallback: check by order ID if bill numbers are missing
                    return existingOrder.id === order.id;
                });

                if (existingOrderIndex === -1) {
                    // No duplicate found, add to local data
                    this.data.orders.unshift(order);
                    console.log('Admin order added to local data:', order.billNumber);
                } else {
                    // Update existing order with new data
                    this.data.orders[existingOrderIndex] = order;
                    console.log('Admin order updated in local data:', order.billNumber);
                }

                this.currentOrder = order;

                this.closeModal('adminBillModal');
                this.showBillPreview();
                this.loadAdminBillManagement();
                this.showToast(`Admin bill generated successfully! Bill #${order.billNumber}`, 'success');
            } else {
                // Handle server-side duplicate detection
                if (data.error === 'Duplicate order') {
                    this.showToast(`Bill already exists with number: ${data.existingBillNumber}`, 'warning');
                    console.log('Server detected duplicate order:', data.existingBillNumber);
                    return;
                }
                throw new Error(data.error || 'Failed to save order');
            }
        })
        .catch(error => {
            // Remove hash from pending set on error
            this.pendingOrderHashes.delete(orderContentHash);

            // Re-enable save button
            if (saveBtn) {
                saveBtn.disabled = false;
            }

            console.error('Error saving admin order:', error);
            this.showToast('Error saving order to database', 'error');
        });
    }

    setupMenuCategoryFilters() {
        const categoryFilter = document.getElementById('categoryFilter');
        const itemCategory = document.getElementById('itemCategory');
        
        // Clear existing options
        if (categoryFilter) {
            categoryFilter.innerHTML = '<option value="">All Categories</option>';
            this.data.menuCategories.forEach(category => {
                categoryFilter.innerHTML += `<option value="${category}">${category}</option>`;
            });
        }

        if (itemCategory) {
            itemCategory.innerHTML = '<option value="">Select Category</option>';
            this.data.menuCategories.forEach(category => {
                itemCategory.innerHTML += `<option value="${category}">${category}</option>`;
            });
        }

        // Setup cashier filter
        const cashierFilter = document.getElementById('cashierFilter');
        if (cashierFilter) {
            cashierFilter.innerHTML = '<option value="">All Cashiers</option>';
            this.data.users.filter(u => u.role === 'cashier').forEach(cashier => {
                cashierFilter.innerHTML += `<option value="${cashier.id}">${cashier.name}</option>`;
            });
        }

        // Setup payment mode filter
        const paymentModeFilter = document.getElementById('paymentModeFilter');
        if (paymentModeFilter) {
            paymentModeFilter.innerHTML = '<option value="">All Payment Modes</option>';
            this.data.paymentModes.forEach(mode => {
                paymentModeFilter.innerHTML += `<option value="${mode}">${mode}</option>`;
            });
        }
    }

    setupExportFilters() {
        const exportCashierFilter = document.getElementById('exportCashierFilter');
        if (exportCashierFilter) {
            exportCashierFilter.innerHTML = '<option value="">All Cashiers</option>';
            this.data.users.filter(u => u.role === 'cashier').forEach(cashier => {
                exportCashierFilter.innerHTML += `<option value="${cashier.id}">${cashier.name}</option>`;
            });
        }
    }

    loadMenuItems(categoryFilter = '', searchFilter = '') {
        const container = document.getElementById('menuItemsList');
        if (!container) return;

        let filteredItems = this.data.menuItems;

        if (categoryFilter) {
            filteredItems = filteredItems.filter(item => item.category === categoryFilter);
        }

        if (searchFilter) {
            filteredItems = filteredItems.filter(item => 
                item.name.toLowerCase().includes(searchFilter.toLowerCase())
            );
        }

        container.innerHTML = filteredItems.map(item => `
            <div class="menu-item-card">
                <div class="menu-item-header">
                    <div class="menu-item-info">
                        <h4>${item.name}</h4>
                        <span class="menu-item-category">${item.category}</span>
                    </div>
                    <div class="menu-item-price">₹${item.price.toFixed(2)}</div>
                </div>
                <div class="menu-item-status">
                    <span class="status-indicator ${item.available ? '' : 'unavailable'}"></span>
                    <span>${item.available ? 'Available' : 'Unavailable'}</span>
                </div>
                <div class="menu-item-actions">
                    <button class="btn btn--outline btn--sm" onclick="pos.editMenuItem(${item.id})">Edit</button>
                    <button class="btn btn--outline btn--sm" onclick="pos.deleteMenuItem(${item.id})">Delete</button>
                </div>
            </div>
        `).join('');
    }

    loadOrderHistory(filters = {}) {
        const container = document.getElementById('orderHistoryList');
        if (!container) return;

        let filteredOrders = [...this.data.orders];

        // Apply filters
        if (filters.cashier) {
            filteredOrders = filteredOrders.filter(order => order.cashier_id == filters.cashier);
        }
        
        if (filters.paymentMode) {
            filteredOrders = filteredOrders.filter(order => order.payment_mode === filters.paymentMode);
        }
        
        if (filters.date) {
            filteredOrders = filteredOrders.filter(order => order.date === filters.date);
        }
        
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            filteredOrders = filteredOrders.filter(order => 
                (order.customer_name && order.customer_name.toLowerCase().includes(searchTerm)) ||
                (order.customer_phone && order.customer_phone.includes(searchTerm)) ||
                (order.billNumber && order.billNumber.toLowerCase().includes(searchTerm))
            );
        }

        // Sort by created_at descending
        filteredOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (filteredOrders.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--color-text-secondary);">No orders found</p>';
            return;
        }

        container.innerHTML = filteredOrders.map(order => `
            <div class="order-item" onclick="pos.showOrderDetails(${order.id})">
                <div class="order-header">
                    <div class="order-basic-info">
                        <h4>Bill #${order.billNumber} ${order.generated_by === 'admin' ? '<span style="color: var(--color-warning);">[Admin]</span>' : ''}</h4>
                        <div class="order-meta">
                            ${order.customer_name || 'Walk-in Customer'} | Table: ${order.table_number} | ${this.formatDate(order.created_at)} ${this.formatTime(order.created_at)}
                        </div>
                    </div>
                    <div class="order-amount">
                        <div class="order-total">₹${order.total.toFixed(2)}</div>
                        <div class="order-payment">${order.payment_mode}</div>
                    </div>
                </div>
                <div class="order-details">
                    <div class="order-items-count">${order.items.length} items</div>
                    <div>Cashier: ${order.cashier_name}</div>
                    ${this.currentUser && this.currentUser.role === 'admin' ? `
                        <div class="order-actions">
                            <button class="btn btn--outline btn--sm btn--danger" onclick="event.stopPropagation(); pos.deleteOrder(${order.id})">Delete</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    showOrderDetails(orderId) {
        console.log('Showing order details for:', orderId); // Debug log

        const order = this.data.orders.find(o => o.id === orderId);
        if (!order) {
            this.showToast('Order not found', 'error');
            return;
        }

        const modal = document.getElementById('orderDetailsModal');
        const content = document.getElementById('orderDetailsContent');

        if (!modal || !content) {
            this.showToast('Order details modal not found', 'error');
            return;
        }

        content.innerHTML = `
            <div class="order-details-content">
                <div class="order-details-section">
                    <h4>Order Information</h4>
                    <div class="detail-row">
                        <span class="detail-label">Bill Number:</span>
                        <span>${order.billNumber} ${order.generated_by === 'admin' ? '[Admin Generated]' : ''}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Date & Time:</span>
                        <span>${this.formatDate(order.created_at)} ${this.formatTime(order.created_at)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Table Number:</span>
                        <span>${order.table_number}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Cashier:</span>
                        <span>${order.cashier_name}</span>
                    </div>
                </div>

                <div class="order-details-section">
                    <h4>Customer Details</h4>
                    <div class="detail-row">
                        <span class="detail-label">Name:</span>
                        <span>${order.customer_name || 'Walk-in Customer'}</span>
                    </div>
                    ${order.customer_phone ? `
                        <div class="detail-row">
                            <span class="detail-label">Phone:</span>
                            <span>${order.customer_phone}</span>
                        </div>
                    ` : ''}
                </div>

                <div class="order-details-section">
                    <h4>Order Items</h4>
                    <div class="order-items-list">
                        ${order.items.map(item => `
                            <div class="order-item-row">
                                <div class="item-details-col">
                                    <div class="item-name-detail">${item.name}</div>
                                    <div class="item-price-detail">₹${item.price.toFixed(2)} each</div>
                                </div>
                                <div class="item-qty-col">${item.quantity}</div>
                                <div class="item-total-col">₹${item.total.toFixed(2)}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="order-details-section">
                    <h4>Payment Summary</h4>
                    <div class="detail-row">
                        <span class="detail-label">Subtotal:</span>
                        <span>₹${order.subtotal.toFixed(2)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">GST (${order.gst_rate}%):</span>
                        <span>₹${order.tax_amount.toFixed(2)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Grand Total:</span>
                        <strong>₹${order.total.toFixed(2)}</strong>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Payment Mode:</span>
                        <span>${order.payment_mode}</span>
                    </div>
                </div>
                ${this.currentUser && this.currentUser.role === 'admin' ? `
                    <div class="order-details-section">
                        <div class="order-actions">
                            <button class="btn btn--danger" onclick="pos.deleteOrder(${order.id})">Delete Order</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        this.currentOrder = order;
        modal.classList.remove('hidden');
    }

    deleteOrder(orderId) {
        const order = this.data.orders.find(o => o.id === orderId);
        if (!order) {
            this.showToast('Order not found', 'error');
            return;
        }

        if (!confirm(`Are you sure you want to delete Bill #${order.billNumber}? This action cannot be undone.`)) {
            return;
        }

        fetch(`/api/orders/${orderId}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Remove order from local data
                this.data.orders = this.data.orders.filter(o => o.id !== orderId);
                this.loadOrderHistory();
                this.loadAdminBillManagement();
                this.closeModal('orderDetailsModal');
                this.showToast('Order deleted successfully!', 'success');
            } else {
                throw new Error('Failed to delete order');
            }
        })
        .catch(error => {
            console.error('Error deleting order:', error);
            this.showToast('Error deleting order from database', 'error');
        });
    }

    addMenuItem(itemData) {
        const newItem = {
            name: itemData.name,
            category: itemData.category,
            price: parseFloat(itemData.price),
            available: itemData.available === 'true'
        };

        fetch('/api/menu-items', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newItem)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                newItem.id = data.id;
                this.data.menuItems.push(newItem);
                this.loadMenuItems();
                this.showToast('Menu item added successfully!', 'success');
            } else {
                throw new Error('Failed to add menu item');
            }
        })
        .catch(error => {
            console.error('Error adding menu item:', error);
            this.showToast('Error adding menu item to database', 'error');
        });
    }

    editMenuItem(id) {
        const item = this.data.menuItems.find(i => i.id === id);
        if (item) {
            this.openMenuItemModal(item);
        }
    }

    updateMenuItem(id, itemData) {
        const updatedItem = {
            name: itemData.name,
            category: itemData.category,
            price: parseFloat(itemData.price),
            available: itemData.available === 'true'
        };

        fetch(`/api/menu-items/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedItem)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const item = this.data.menuItems.find(i => i.id === id);
                if (item) {
                    Object.assign(item, updatedItem);
                    this.loadMenuItems();
                    this.showToast('Menu item updated successfully!', 'success');
                }
            } else {
                throw new Error('Failed to update menu item');
            }
        })
        .catch(error => {
            console.error('Error updating menu item:', error);
            this.showToast('Error updating menu item in database', 'error');
        });
    }

    deleteMenuItem(id) {
        if (confirm('Are you sure you want to delete this menu item?')) {
            fetch(`/api/menu-items/${id}`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.data.menuItems = this.data.menuItems.filter(i => i.id !== id);
                    this.loadMenuItems();
                    this.showToast('Menu item deleted successfully!', 'success');
                } else {
                    throw new Error('Failed to delete menu item');
                }
            })
            .catch(error => {
                console.error('Error deleting menu item:', error);
                this.showToast('Error deleting menu item from database', 'error');
            });
        }
    }

    loadSalesReports(period = 'today') {
        const now = new Date();
        let startDate, endDate;

        switch (period) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                break;
            case 'week':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
                endDate = now;
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = now;
                break;
            default:
                startDate = new Date(0);
                endDate = now;
        }

        const filteredOrders = this.data.orders.filter(order => {
            const orderDate = new Date(order.created_at);
            return orderDate >= startDate && orderDate < endDate;
        });

        const totalSales = filteredOrders.reduce((sum, order) => sum + order.total, 0);
        const totalBills = filteredOrders.length;
        const avgOrder = totalBills > 0 ? totalSales / totalBills : 0;

        const totalSalesEl = document.getElementById('totalSales');
        const totalBillsEl = document.getElementById('totalBills');
        const avgOrderEl = document.getElementById('avgOrder');

        if (totalSalesEl) totalSalesEl.textContent = `₹${totalSales.toFixed(2)}`;
        if (totalBillsEl) totalBillsEl.textContent = totalBills;
        if (avgOrderEl) avgOrderEl.textContent = `₹${avgOrder.toFixed(2)}`;

        this.updatePaymentChart(filteredOrders);
    }

    updatePaymentChart(orders) {
        const paymentData = {};
        this.data.paymentModes.forEach(mode => {
            paymentData[mode] = orders.filter(o => o.payment_mode === mode).reduce((sum, o) => sum + o.total, 0);
        });

        const ctx = document.querySelector('#paymentChart canvas');
        if (ctx) {
            if (window.paymentChart) {
                window.paymentChart.destroy();
            }
            
            window.paymentChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(paymentData),
                    datasets: [{
                        data: Object.values(paymentData),
                        backgroundColor: ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom'
                        }
                    }
                }
            });
        }
    }

    loadUsers() {
        const container = document.getElementById('usersList');
        if (!container) return;

        const cashiers = this.data.users.filter(u => u.role === 'cashier');
        
        container.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Phone</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${cashiers.map(user => `
                        <tr>
                            <td>${user.name}</td>
                            <td>${user.username}</td>
                            <td>${user.phone}</td>
                            <td>${user.lastLogin ? this.formatDate(user.lastLogin) + ' ' + this.formatTime(user.lastLogin) : 'Never'}</td>
                            <td>
                                <div class="user-actions">
                                    <button class="btn btn--outline btn--sm" onclick="pos.openChangePasswordModal(${user.id})">Change Password</button>
                                    <button class="btn btn--outline btn--sm" onclick="pos.deleteUser(${user.id})">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    openChangePasswordModal(userId) {
        this.selectedUserId = userId;
        const user = this.data.users.find(u => u.id === userId);
        if (!user) return;
        
        const modal = document.getElementById('changePasswordModal');
        const form = document.getElementById('changePasswordForm');
        
        if (modal && form) {
            form.reset();
            modal.querySelector('h3').textContent = `Change Password for ${user.name}`;
            modal.classList.remove('hidden');
        }
    }

    changeUserPassword(userId, newPassword) {
        fetch(`/api/users/${userId}/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password: newPassword })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const user = this.data.users.find(u => u.id === userId);
                if (user) {
                    this.showToast(`Password changed successfully for ${user.name}`, 'success');
                }
                this.closeModal('changePasswordModal');
            } else {
                throw new Error('Failed to change password');
            }
        })
        .catch(error => {
            console.error('Error changing password:', error);
            this.showToast('Error changing password in database', 'error');
        });
    }

    addUser(userData) {
        const newUser = {
            username: userData.username,
            password: userData.password,
            role: 'cashier',
            name: userData.name,
            phone: userData.phone,
            permissions: "create_orders,print_own,view_own_history"
        };

        fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newUser)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Reload users from database to get updated list
                this.reloadUsersFromDatabase();
                this.showToast('Cashier added successfully!', 'success');
            } else {
                throw new Error('Failed to add user');
            }
        })
        .catch(error => {
            console.error('Error adding user:', error);
            this.showToast('Error adding cashier to database', 'error');
        });
    }

    deleteUser(id) {
        const user = this.data.users.find(u => u.id === id);
        if (user && confirm(`Are you sure you want to delete cashier "${user.name}"?`)) {
            fetch(`/api/users/${id}`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Reload users from database to get updated list
                    this.reloadUsersFromDatabase();
                    this.showToast('Cashier deleted successfully!', 'success');
                } else {
                    throw new Error('Failed to delete user');
                }
            })
            .catch(error => {
                console.error('Error deleting user:', error);
                this.showToast('Error deleting cashier from database', 'error');
            });
        }
    }

    reloadUsersFromDatabase() {
        fetch('/api/data')
            .then(response => response.json())
            .then(data => {
                if (data.users) {
                    this.data.users = data.users;
                    this.loadUsers();
                    this.setupMenuCategoryFilters();
                    this.setupExportFilters();
                }
            })
            .catch(error => {
                console.error('Error reloading users from database:', error);
                this.showToast('Error refreshing user data', 'error');
            });
    }

    loadRestaurantSettings() {
        const settings = this.data.restaurant;

        const elements = {
            restaurantName: document.getElementById('restaurantName'),
            restaurantAddress: document.getElementById('restaurantAddress'),
            gstin: document.getElementById('gstin'),
            fssai: document.getElementById('fssai'),
            restaurantPhone: document.getElementById('restaurantPhone'),
            gstRate: document.getElementById('gstRate')
        };

        if (elements.restaurantName) elements.restaurantName.value = settings.name;
        if (elements.restaurantAddress) elements.restaurantAddress.value = settings.address;
        if (elements.gstin) elements.gstin.value = settings.gstin;
        if (elements.fssai) elements.fssai.value = settings.fssai;
        if (elements.restaurantPhone) elements.restaurantPhone.value = settings.phone;
        if (elements.gstRate) elements.gstRate.value = settings.gstRate || 5;

        // Display current logo if exists
        const logoPreview = document.getElementById('currentLogoPreview');
        if (logoPreview) {
            if (settings.logo && settings.logo !== 'restaurant-logo.png') {
                logoPreview.innerHTML = `<img src="${settings.logo}" alt="Current Logo" style="max-width: 200px; max-height: 100px; border: 1px solid #ddd; border-radius: 4px;">`;
            } else {
                logoPreview.innerHTML = '<small>No logo uploaded</small>';
            }
        }
    }

    saveRestaurantSettings(settingsData) {
        const logoInput = document.getElementById('restaurantLogo');
        const file = logoInput?.files[0];

        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                this.showToast('Please select a valid image file', 'error');
                return;
            }

            // Validate file size (2MB max)
            if (file.size > 2 * 1024 * 1024) {
                this.showToast('File size must be less than 2MB', 'error');
                return;
            }

            // Convert to base64
            const reader = new FileReader();
            reader.onload = (e) => {
                settingsData.logo = e.target.result;
                this.sendRestaurantSettings(settingsData);
            };
            reader.onerror = () => {
                this.showToast('Error reading file', 'error');
            };
            reader.readAsDataURL(file);
        } else {
            this.sendRestaurantSettings(settingsData);
        }
    }

    sendRestaurantSettings(settingsData) {
        fetch('/api/restaurant-settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settingsData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.data.restaurant = { ...this.data.restaurant, ...settingsData };
                this.showToast('Restaurant settings saved successfully!', 'success');
                // Clear the file input
                const logoInput = document.getElementById('restaurantLogo');
                if (logoInput) logoInput.value = '';
                // Reload settings to show updated logo
                this.loadRestaurantSettings();
            } else {
                throw new Error('Failed to save settings');
            }
        })
        .catch(error => {
            console.error('Error saving restaurant settings:', error);
            this.showToast('Error saving settings to database', 'error');
        });
    }

    loadQRSettings() {
        const qrConfig = this.data.qrConfig;
        
        const elements = {
            upiId: document.getElementById('upiId'),
            merchantName: document.getElementById('merchantName'),
            qrEnabled: document.getElementById('qrEnabled')
        };

        if (elements.upiId) elements.upiId.value = qrConfig.upiId || '';
        if (elements.merchantName) elements.merchantName.value = qrConfig.merchantName || '';
        if (elements.qrEnabled) elements.qrEnabled.checked = qrConfig.enabled;

        this.updateQRPreview();
    }

    saveQRSettings(qrData) {
        // Include uploadedImage in the data sent to backend
        const dataToSave = {
            ...qrData,
            uploadedImage: this.data.qrConfig.uploadedImage || null
        };

        fetch('/api/qr-config', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToSave)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                this.data.qrConfig.upiId = qrData.upiId;
                this.data.qrConfig.merchantName = qrData.merchantName;
                this.data.qrConfig.enabled = qrData.enabled;
                this.data.qrConfig.uploadedImage = dataToSave.uploadedImage;

                // Reload QR config from backend to ensure persistence
                this.loadQRSettings();

                this.showToast('QR Code settings saved successfully!', 'success');
            } else {
                throw new Error('Failed to save QR settings');
            }
        })
        .catch(error => {
            console.error('Error saving QR settings:', error);
            this.showToast('Error saving QR settings to database', 'error');
        });
    }

    handleQRCodeUpload(event) {
        const file = event.target.files[0];
        if (!file) {
            this.data.qrConfig.uploadedImage = null;
            this.updateQRPreview();
            // Save QR settings to clear uploaded image on backend
            this.saveQRSettings({
                upiId: this.data.qrConfig.upiId,
                merchantName: this.data.qrConfig.merchantName,
                enabled: this.data.qrConfig.enabled
            });
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showToast('Please select a valid image file', 'error');
            event.target.value = '';
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showToast('File size must be less than 5MB', 'error');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.data.qrConfig.uploadedImage = e.target.result;
            this.updateQRPreview();
            this.showToast('QR code image uploaded successfully', 'success');
            // Save QR settings with uploaded image to backend
            this.saveQRSettings({
                upiId: this.data.qrConfig.upiId,
                merchantName: this.data.qrConfig.merchantName,
                enabled: this.data.qrConfig.enabled
            });
        };
        reader.onerror = () => {
            this.showToast('Error reading file', 'error');
            event.target.value = '';
        };
        reader.readAsDataURL(file);
    }

    updateQRPreview() {
        const container = document.getElementById('qrPreviewContainer');
        if (!container) return;

        // Clear previous content
        container.innerHTML = '';

        if (this.data.qrConfig.uploadedImage) {
            // Show uploaded image
            const img = document.createElement('img');
            img.src = this.data.qrConfig.uploadedImage;
            img.style.maxWidth = '200px';
            img.style.maxHeight = '200px';
            img.style.border = '1px solid #ddd';
            img.style.borderRadius = '4px';
            container.appendChild(img);
        } else if (this.data.qrConfig.enabled && this.data.qrConfig.upiId && this.data.qrConfig.merchantName) {
            // Show generated QR code
            const canvas = document.createElement('canvas');
            canvas.id = 'qrPreviewCanvas';
            container.appendChild(canvas);

            const upiString = `upi://pay?pa=${this.data.qrConfig.upiId}&pn=${this.data.qrConfig.merchantName}&cu=INR`;

            if (typeof QRCode !== 'undefined') {
                QRCode.toCanvas(canvas, upiString, { width: 200 }, function (error) {
                    if (error) console.error(error);
                });
            }
        } else {
            // Show placeholder text
            const placeholder = document.createElement('div');
            placeholder.style.width = '200px';
            placeholder.style.height = '200px';
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.justifyContent = 'center';
            placeholder.style.border = '1px solid #ddd';
            placeholder.style.borderRadius = '4px';
            placeholder.style.backgroundColor = '#f9f9f9';
            placeholder.style.color = '#666';
            placeholder.style.fontSize = '14px';
            placeholder.style.textAlign = 'center';

            if (!this.data.qrConfig.enabled) {
                placeholder.textContent = 'QR Code Disabled';
            } else {
                placeholder.innerHTML = 'Enter UPI details<br>or upload QR code<br>above to preview';
            }

            container.appendChild(placeholder);
        }
    }

    // Cashier Interface
    initCashierInterface() {
        console.log('Initializing cashier interface'); // Debug log

        const cashierUserNameEl = document.getElementById('cashierUserName');
        if (cashierUserNameEl && this.currentUser) {
            cashierUserNameEl.textContent = this.currentUser.name;
        }

        this.setupCashierCategories();
        this.loadCashierMenu();
        this.updateCart();
        this.loadPendingOrders();

        // Clear QR code upload on cashier interface init (optional)
        const qrPhotoInput = document.getElementById('qrPhoto');
        if (qrPhotoInput) {
            qrPhotoInput.value = '';
        }
    }

    setupCashierCategories() {
        const container = document.querySelector('.menu-categories');
        if (!container) return;

        container.innerHTML = `
            <button class="category-btn active" data-category="">All Items</button>
            ${this.data.menuCategories.map(category => 
                `<button class="category-btn" data-category="${category}">${category}</button>`
            ).join('')}
        `;
    }

    loadCashierMenu(categoryFilter = '', searchFilter = '') {
        const container = document.getElementById('menuItemsGrid');
        if (!container) return;

        let filteredItems = this.data.menuItems.filter(item => item.available);

        if (categoryFilter) {
            filteredItems = filteredItems.filter(item => item.category === categoryFilter);
        }

        if (searchFilter) {
            filteredItems = filteredItems.filter(item => 
                item.name.toLowerCase().includes(searchFilter.toLowerCase())
            );
        }

        container.innerHTML = filteredItems.map(item => `
            <div class="menu-item-display ${!item.available ? 'unavailable' : ''}" 
                 onclick="${item.available ? `pos.addToCart(${item.id})` : ''}">
                <h4>${item.name}</h4>
                <p class="price">₹${item.price.toFixed(2)}</p>
                <p style="font-size: 12px; color: var(--color-text-secondary);">${item.category}</p>
            </div>
        `).join('');
    }

    // Order History for Cashier
    showCashierHistory() {
        const panel = document.getElementById('cashierHistoryPanel');
        if (panel) {
            panel.classList.remove('hidden');
            this.loadCashierOrderHistory('today');
        }
    }

    hideCashierHistory() {
        const panel = document.getElementById('cashierHistoryPanel');
        if (panel) {
            panel.classList.add('hidden');
        }
    }

    loadCashierOrderHistory(period = 'today', filters = {}) {
        const container = document.getElementById('cashierOrderHistory');
        if (!container) return;

        // Filter orders by current cashier
        let filteredOrders = this.data.orders.filter(order => order.cashier_id === this.currentUser.id);

        // Apply period filter
        if (period === 'today') {
            const today = this.getTodayDate();
            filteredOrders = filteredOrders.filter(order => order.date === today);
        }

        // Apply additional filters
        if (filters.date) {
            filteredOrders = filteredOrders.filter(order => order.date === filters.date);
        }

        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            filteredOrders = filteredOrders.filter(order => 
                order.customer_name.toLowerCase().includes(searchTerm) ||
                order.customer_phone.includes(searchTerm) ||
                order.billNumber.toLowerCase().includes(searchTerm)
            );
        }

        // Sort by created_at descending
        filteredOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (filteredOrders.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--color-text-secondary);">No orders found</p>';
            return;
        }

        container.innerHTML = filteredOrders.map(order => `
            <div class="history-item" onclick="pos.showOrderDetails(${order.id})">
                <div class="history-item-header">
                    <div class="history-item-info">
                        <h5>Bill #${order.billNumber}</h5>
                        <div class="history-item-time">${this.formatDate(order.created_at)} ${this.formatTime(order.created_at)}</div>
                    </div>
                    <div class="history-item-total">₹${order.total.toFixed(2)}</div>
                </div>
                <div class="history-item-details">
                    ${order.customer_name || 'Walk-in Customer'} | Table: ${order.table_number} | ${order.payment_mode} | ${order.items.length} items
                </div>
            </div>
        `).join('');
    }

    addToCart(itemId) {
        console.log('Adding item to cart:', itemId); // Debug log
        
        const item = this.data.menuItems.find(i => i.id === itemId);
        if (!item || !item.available) {
            this.showToast('Item not available', 'error');
            return;
        }

        const existingItem = this.cart.find(c => c.id === itemId);
        if (existingItem) {
            existingItem.quantity += 1;
            existingItem.total = existingItem.quantity * existingItem.price;
        } else {
            this.cart.push({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: 1,
                total: item.price
            });
        }

        this.updateCart();
        this.showToast(`${item.name} added to cart`, 'success');
    }

    removeFromCart(itemId) {
        this.cart = this.cart.filter(item => item.id !== itemId);
        this.updateCart();
        this.showToast('Item removed from cart', 'info');
    }

    updateQuantity(itemId, change) {
        const item = this.cart.find(c => c.id === itemId);
        if (item) {
            item.quantity += change;
            if (item.quantity <= 0) {
                this.removeFromCart(itemId);
            } else {
                item.total = item.quantity * item.price;
                this.updateCart();
            }
        }
    }

    updateCart() {
        const container = document.getElementById('cartItems');
        if (!container) return;

        const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
        const gstRate = this.data.restaurant.gstRate || 5;
        const gstAmount = (subtotal * gstRate) / 100;
        const grandTotal = subtotal + gstAmount;

        if (this.cart.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No items in cart</p>';
        } else {
            container.innerHTML = this.cart.map(item => `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">₹${item.price.toFixed(2)} each</div>
                    </div>
                    <div class="cart-item-controls">
                        <button class="quantity-btn" onclick="pos.updateQuantity(${item.id}, -1)">-</button>
                        <span class="cart-item-quantity">${item.quantity}</span>
                        <button class="quantity-btn" onclick="pos.updateQuantity(${item.id}, 1)">+</button>
                        <span class="cart-item-total">₹${item.total.toFixed(2)}</span>
                        <button class="remove-item" onclick="pos.removeFromCart(${item.id})">×</button>
                    </div>
                </div>
            `).join('');
        }

        const elements = {
            subtotalAmount: document.getElementById('subtotalAmount'),
            gstPercentage: document.getElementById('gstPercentage'),
            gstAmount: document.getElementById('gstAmount'),
            grandTotal: document.getElementById('grandTotal')
        };

        if (elements.subtotalAmount) elements.subtotalAmount.textContent = `₹${subtotal.toFixed(2)}`;
        if (elements.gstPercentage) elements.gstPercentage.textContent = gstRate;
        if (elements.gstAmount) elements.gstAmount.textContent = `₹${gstAmount.toFixed(2)}`;
        if (elements.grandTotal) elements.grandTotal.textContent = `₹${grandTotal.toFixed(2)}`;

        const generateBtn = document.getElementById('generateBill');
        const tableNumberInput = document.getElementById('tableNumber');
        
        if (generateBtn && tableNumberInput) {
            const tableNumber = tableNumberInput.value.trim();
            generateBtn.disabled = this.cart.length === 0 || !tableNumber;
        }
    }

    clearCart() {
        this.cart = [];
        this.updateCart();
        this.showToast('Cart cleared', 'info');
    }

    generateBill() {
        console.log('Generating bill'); // Debug log
        
        const customerNameInput = document.getElementById('customerName');
        const customerPhoneInput = document.getElementById('customerPhone');
        const tableNumberInput = document.getElementById('tableNumber');

        if (!customerNameInput || !tableNumberInput) {
            this.showToast('Form elements not found', 'error');
            return;
        }

        const customerName = customerNameInput.value.trim() || '';
        const customerPhone = customerPhoneInput ? customerPhoneInput.value.trim() : '';
        const tableNumber = tableNumberInput.value.trim();

        if (!tableNumber) {
            this.showToast('Please enter table number', 'error');
            return;
        }

        if (this.cart.length === 0) {
            this.showToast('Cart is empty', 'error');
            return;
        }

        const subtotal = this.cart.reduce((sum, item) => sum + item.total, 0);
        const gstRate = this.data.restaurant.gstRate || 5;
        const gstAmount = (subtotal * gstRate) / 100;
        const grandTotal = subtotal + gstAmount;

        const billNumber = this.generateBillNumber();

        this.currentOrder = {
            id: Date.now(),
            billNumber: billNumber,
            customer_name: customerName,
            customer_phone: customerPhone,
            table_number: tableNumber,
            items: [...this.cart],
            subtotal: subtotal,
            gst_rate: gstRate,
            tax_amount: gstAmount,
            total: grandTotal,
            payment_mode: this.selectedPaymentMode,
            cashier_id: this.currentUser.id,
            cashier_name: this.currentUser.name,
            status: 'pending',
            created_at: new Date().toISOString(),
            date: this.getTodayDate()
        };

        this.showBillPreview();
    }

    showBillPreview() {
        console.log('Showing bill preview'); // Debug log
        
        const modal = document.getElementById('billModal');
        const preview = document.getElementById('billPreview');
        
        if (!modal || !preview) {
            this.showToast('Bill modal elements not found', 'error');
            return;
        }
        
        const billHTML = this.generateBillHTML(this.currentOrder);
        preview.innerHTML = billHTML;

        // Generate QR code after setting the HTML
        setTimeout(() => {
            this.generateBillQRCode();
        }, 100);

        modal.classList.remove('hidden');
    }

    generateBillHTML(order) {
        const restaurant = this.data.restaurant;
        const date = new Date(order.created_at);

        // QR code section
        let qrCodeHTML = '';
        if (this.data.qrConfig.enabled && this.data.qrConfig.upiId && this.data.qrConfig.merchantName) {
            qrCodeHTML = `
                <div class="qr-code-section">
                    <div class="qr-text">Pay via QR Code</div>
                    <canvas id="billQrCanvas" width="120" height="120"></canvas>
                    <div class="qr-text">Scan to pay ₹${order.total.toFixed(2)}</div>
                </div>
            `;
        }

        // Add logo image section if logo exists
        let logoHTML = '';
        if (restaurant.logo) {
            logoHTML = `
                <div class="bill-logo" style="text-align: center; margin-bottom: 10px;">
                    <img src="${restaurant.logo}" alt="Restaurant Logo" style="max-height: 80px; max-width: 100%; object-fit: contain;">
                </div>
            `;
        }

        return `
            ${logoHTML}
            <div class="bill-header">
                <div class="restaurant-name">${restaurant.name}</div>
                <div class="restaurant-info">${restaurant.address}</div>
                <div class="restaurant-info">GST: ${restaurant.gstin}</div>
                <div class="restaurant-info">FSSAI: ${restaurant.fssai}</div>
                <div class="restaurant-info">Phone: ${restaurant.phone}</div>
            </div>

            <div class="bill-details">
                <div>Bill No: ${order.billNumber}</div>
                <div>Date: ${date.toLocaleDateString('en-IN')}</div>
            </div>
            <div class="bill-details">
                <div>Time: ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                <div>Table: ${order.table_number}</div>
            </div>

            <div class="customer-info">
                <div>Customer: ${order.customer_name || 'Walk-in Customer'}</div>
                ${order.customer_phone ? `<div>Phone: ${order.customer_phone}</div>` : ''}
                <div>Cashier: ${order.cashier_name}</div>
            </div>

            <div class="bill-items">
                ${order.items.map(item => `
                    <div class="bill-item">
                        <div class="item-details">
                            <div class="item-name">${item.name}</div>
                            <div class="item-qty-price">${item.quantity} x ₹${item.price.toFixed(2)}</div>
                        </div>
                        <div class="item-total">₹${item.total.toFixed(2)}</div>
                    </div>
                `).join('')}
            </div>

            <div class="bill-totals">
                <div class="total-row">
                    <span>Subtotal:</span>
                    <span>₹${order.subtotal.toFixed(2)}</span>
                </div>
                <div class="total-row">
                    <span>GST (${order.gst_rate}%):</span>
                    <span>₹${order.tax_amount.toFixed(2)}</span>
                </div>
                <div class="total-row grand-total-row">
                    <span>GRAND TOTAL:</span>
                    <span>₹${order.total.toFixed(2)}</span>
                </div>
            </div>

            <div class="payment-info">
                <strong>Payment Mode: ${order.payment_mode}</strong>
            </div>

            ${qrCodeHTML}

            <div class="bill-footer">
                Thanks & Visit Again!
            </div>
        `;
    }

    generateBillQRCode() {
        if (!this.data.qrConfig.enabled || !this.currentOrder) return;

        const canvas = document.getElementById('billQrCanvas');
        if (!canvas) return;

        // Clear previous content
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (this.data.qrConfig.uploadedImage) {
            // Use uploaded QR code image
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, 120, 120);
            };
            img.src = this.data.qrConfig.uploadedImage;
        } else if (this.data.qrConfig.upiId && this.data.qrConfig.merchantName && typeof QRCode !== 'undefined') {
            // Generate QR code from UPI details
            const upiString = `upi://pay?pa=${this.data.qrConfig.upiId}&pn=${this.data.qrConfig.merchantName}&am=${this.currentOrder.total}&cu=INR`;
            QRCode.toCanvas(canvas, upiString, { width: 120 }, function (error) {
                if (error) console.error('QR Code generation error:', error);
            });
        }
    }

    completeBill() {
        if (this.isCompletingOrder) {
            this.showToast('Order completion in progress, please wait...', 'info');
            return;
        }

        // Validate current order exists and has required data
        if (!this.currentOrder) {
            this.showToast('No current order to complete', 'error');
            return;
        }

        if (!this.currentOrder.items || this.currentOrder.items.length === 0) {
            this.showToast('Cannot complete order with no items', 'error');
            return;
        }

        // Generate hash of current order content to detect duplicates
        const orderContentHash = this.createOrderHash(this.currentOrder);

        // Check if this order is already pending submission
        if (this.pendingOrderHashes.has(orderContentHash)) {
            this.showToast('This order is already being submitted. Please wait.', 'info');
            return;
        }

        // Check if this order was already sent
        if (this.lastSentOrderId === this.currentOrder.id) {
            this.showToast('This order has already been completed', 'info');
            return;
        }

        this.isCompletingOrder = true;
        const completeBillBtn = document.getElementById('completeBill');
        if (completeBillBtn) {
            completeBillBtn.disabled = true;
            completeBillBtn.textContent = 'Completing...';
        }

        console.log('Completing bill'); // Debug log

        if (!this.currentOrder) {
            this.showToast('No current order to complete', 'error');
            this.isCompletingOrder = false;
            if (completeBillBtn) {
                completeBillBtn.disabled = false;
                completeBillBtn.textContent = 'Complete Bill';
            }
            return;
        }

        // Add hash to pending set
        this.pendingOrderHashes.add(orderContentHash);

        console.log('Sending order to server:', this.currentOrder);

        // Save order to database
        fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this.currentOrder)
        })
        .then(response => {
            console.log('Server response status:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Server response data:', data);

            // Remove hash from pending set
            this.pendingOrderHashes.delete(orderContentHash);

            if (data.success) {
                // Update the current order with server-generated bill number
                if (data.billNumber) {
                    this.currentOrder.billNumber = data.billNumber;
                    console.log(`Updated bill number to server-generated: ${data.billNumber}`);
                }

                // Update order status to completed
                this.currentOrder.status = 'completed';

                // Check if order already exists in local data to avoid duplication
                const existingOrderIndex = this.data.orders.findIndex(order => order.id === this.currentOrder.id);
                if (existingOrderIndex === -1) {
                    this.data.orders.unshift(this.currentOrder);
                    console.log('Order added to local data, total orders:', this.data.orders.length);
                } else {
                    // Replace existing order with updated one
                    this.data.orders[existingOrderIndex] = this.currentOrder;
                    console.log('Order updated in local data at index:', existingOrderIndex);
                }

                // Mark this order as sent to prevent duplicates
                this.lastSentOrderId = this.currentOrder.id;

                // Clear current order and cart
                this.currentOrder = null;
                this.cart = [];
                this.selectedPaymentMode = 'Cash';

                // Reset form
                const elements = {
                    customerName: document.getElementById('customerName'),
                    customerPhone: document.getElementById('customerPhone'),
                    tableNumber: document.getElementById('tableNumber')
                };

                if (elements.customerName) elements.customerName.value = '';
                if (elements.customerPhone) elements.customerPhone.value = '';
                if (elements.tableNumber) elements.tableNumber.value = '';

                // Reset payment mode buttons
                document.querySelectorAll('.payment-btn').forEach(btn => btn.classList.remove('active'));
                const cashBtn = document.querySelector('.payment-btn[data-mode="Cash"]');
                if (cashBtn) cashBtn.classList.add('active');
            }

            // Close bill preview modal
            this.closeModal('billModal');
        })
        .catch(error => {
            console.error('Error completing order:', error);

            // Handle specific error types
            if (error.message.includes('409')) {
                this.showToast('This order has already been processed. Please check your order history.', 'warning');
            } else {
                this.showToast('Error completing order. Please try again.', 'error');
            }

            // Remove hash from pending set on error
            this.pendingOrderHashes.delete(orderContentHash);
        })
        .finally(() => {
            // Always re-enable the button and reset completion flag
            this.isCompletingOrder = false;
            const completeBillBtn = document.getElementById('completeBill');
            if (completeBillBtn) {
                completeBillBtn.disabled = false;
                completeBillBtn.textContent = 'Complete Bill';
            }
        });
    }

    reprintBill() {
        if (this.currentOrder) {
            this.showBillPreview();
        } else {
            this.showToast('No bill to reprint', 'error');
        }
    }

    // Enhanced Print Functionality
    printBill() {
        console.log('Printing bill'); // Debug log
        
        if (!this.currentOrder) {
            this.showToast('No bill to print', 'error');
            return;
        }

        // Generate print-friendly content
        const printContainer = document.getElementById('printContainer');
        const printReceipt = document.getElementById('printReceipt');
        
        if (!printContainer || !printReceipt) {
            this.showToast('Print container not found', 'error');
            return;
        }

        // Generate QR code first if enabled
        let qrDataURL = '';
        if (this.data.qrConfig.enabled && this.data.qrConfig.upiId && this.data.qrConfig.merchantName) {
            const tempCanvas = document.createElement('canvas');
            const upiString = `upi://pay?pa=${this.data.qrConfig.upiId}&pn=${this.data.qrConfig.merchantName}&am=${this.currentOrder.total}&cu=INR`;
            
            if (typeof QRCode !== 'undefined') {
                QRCode.toCanvas(tempCanvas, upiString, { width: 120 }, (error) => {
                    if (!error) {
                        qrDataURL = tempCanvas.toDataURL();
                        this.generatePrintContent(printReceipt, qrDataURL);
                        this.executePrint();
                    } else {
                        console.error('QR generation error:', error);
                        this.generatePrintContent(printReceipt, '');
                        this.executePrint();
                    }
                });
            } else {
                this.generatePrintContent(printReceipt, '');
                this.executePrint();
            }
        } else {
            this.generatePrintContent(printReceipt, '');
            this.executePrint();
        }
    }

    generatePrintContent(container, qrDataURL) {
        const order = this.currentOrder;
        const restaurant = this.data.restaurant;
        const date = new Date(order.created_at);

        // Add logo section if logo exists
        let logoSection = '';
        if (restaurant.logo) {
            logoSection = `
                <div style="text-align: center; margin-bottom: 8px;">
                    <img src="${restaurant.logo}" style="max-height: 60px; max-width: 100%; object-fit: contain;">
                </div>
            `;
        }

        let qrSection = '';
        if (this.data.qrConfig.uploadedImage) {
            qrSection = `
                <div style="text-align: center; margin: 8px 0; border-top: 1px dashed #333; padding-top: 8px;">
                    <div style="font-size: 9px;">Pay via QR Code</div>
                    <img src="${this.data.qrConfig.uploadedImage}" width="120" height="120" style="margin: 4px 0;">
                    <div style="font-size: 9px;">Scan to pay ₹${order.total.toFixed(2)}</div>
                </div>
            `;
        } else if (qrDataURL) {
            qrSection = `
                <div style="text-align: center; margin: 8px 0; border-top: 1px dashed #333; padding-top: 8px;">
                    <div style="font-size: 9px;">Pay via QR Code</div>
                    <img src="${qrDataURL}" width="120" height="120" style="margin: 4px 0;">
                    <div style="font-size: 9px;">Scan to pay ₹${order.total.toFixed(2)}</div>
                </div>
            `;
        }

        container.innerHTML = `
            ${logoSection}
            <div style="text-align: center; border-bottom: 1px dashed #333; padding-bottom: 8px; margin-bottom: 8px;">
                <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${restaurant.name}</div>
                <div style="font-size: 10px; margin-bottom: 2px;">${restaurant.address}</div>
                <div style="font-size: 10px; margin-bottom: 2px;">GST: ${restaurant.gstin}</div>
                <div style="font-size: 10px; margin-bottom: 2px;">FSSAI: ${restaurant.fssai}</div>
                <div style="font-size: 10px;">Phone: ${restaurant.phone}</div>
            </div>
            
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10px;">
                <div>Bill No: ${order.billNumber}</div>
                <div>Date: ${date.toLocaleDateString('en-IN')}</div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 10px;">
                <div>Time: ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                <div>Table: ${order.table_number}</div>
            </div>
            
            <div style="margin-bottom: 8px; font-size: 10px;">
                <div>Customer: ${order.customer_name || 'Walk-in Customer'}</div>
                ${order.customer_phone ? `<div>Phone: ${order.customer_phone}</div>` : ''}
                <div>Cashier: ${order.cashier_name}</div>
            </div>
            
            <div style="border-bottom: 1px dashed #333; padding-bottom: 8px; margin-bottom: 8px;">
                ${order.items.map(item => `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; font-size: 10px;">
                        <div style="flex: 1;">
                            <div style="font-weight: bold;">${item.name}</div>
                            <div style="color: #666;">${item.quantity} x ₹${item.price.toFixed(2)}</div>
                        </div>
                        <div style="font-weight: bold; text-align: right; min-width: 60px;">₹${item.total.toFixed(2)}</div>
                    </div>
                `).join('')}
            </div>
            
            <div style="border-bottom: 1px dashed #333; padding-bottom: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 10px;">
                    <span>Subtotal:</span>
                    <span>₹${order.subtotal.toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 10px;">
                    <span>GST (${order.gst_rate}%):</span>
                    <span>₹${order.tax_amount.toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; border-top: 1px solid #333; padding-top: 4px;">
                    <span>GRAND TOTAL:</span>
                    <span>₹${order.total.toFixed(2)}</span>
                </div>
            </div>
            
            <div style="text-align: center; margin-bottom: 8px; font-size: 10px; font-weight: bold;">
                <strong>Payment Mode: ${order.payment_mode}</strong>
            </div>
            
            ${qrSection}
            
            <div style="text-align: center; font-size: 10px; font-style: italic;">
                Thanks & Visit Again!
            </div>
        `;
    }

    executePrint() {
        console.log('Executing print'); // Debug log
        
        this.showToast('Opening print dialog...', 'info');
        
        setTimeout(() => {
            try {
                window.print();
            } catch (error) {
                console.error('Print error:', error);
                this.showToast('Print error occurred', 'error');
            }
        }, 500);
    }

    // Enhanced PDF Download Functionality
    downloadPDF() {
        console.log('Downloading PDF'); // Debug log
        
        if (!this.currentOrder) {
            this.showToast('No bill to download', 'error');
            return;
        }

        if (typeof window.jspdf === 'undefined') {
            this.showToast('PDF library not loaded', 'error');
            return;
        }

        this.showLoading();

        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                unit: 'mm',
                format: [80, 200]
            });
            
            const order = this.currentOrder;
            const restaurant = this.data.restaurant;
            const date = new Date(order.created_at);
            
            // Set font
            pdf.setFont('courier');
            
            let yPos = 10;
            const pageWidth = 80;
            const lineHeight = 4;
            
            // Add logo if available
            if (restaurant.logo) {
                try {
                    // Add logo image (assuming it's base64 or accessible URL)
                    pdf.addImage(restaurant.logo, 'PNG', pageWidth/2 - 15, yPos, 30, 20);
                    yPos += 25;
                } catch (error) {
                    console.warn('Error adding logo to PDF:', error);
                }
            }

            // Header
            pdf.setFontSize(12);
            pdf.text(restaurant.name, pageWidth/2, yPos, { align: 'center' });
            yPos += lineHeight;

            pdf.setFontSize(8);
            const addressLines = this.wrapText(restaurant.address, 35);
            addressLines.forEach(line => {
                pdf.text(line, pageWidth/2, yPos, { align: 'center' });
                yPos += lineHeight;
            });

            pdf.text(`GST: ${restaurant.gstin}`, pageWidth/2, yPos, { align: 'center' });
            yPos += lineHeight;
            pdf.text(`FSSAI: ${restaurant.fssai}`, pageWidth/2, yPos, { align: 'center' });
            yPos += lineHeight;
            pdf.text(`Phone: ${restaurant.phone}`, pageWidth/2, yPos, { align: 'center' });
            yPos += lineHeight + 2;
            
            // Dashed line
            this.drawDashedLine(pdf, 5, yPos, pageWidth - 5, yPos);
            yPos += lineHeight;
            
            // Bill details
            pdf.text(`Bill No: ${order.billNumber}`, 5, yPos);
            pdf.text(`Date: ${date.toLocaleDateString('en-IN')}`, pageWidth - 5, yPos, { align: 'right' });
            yPos += lineHeight;
            
            pdf.text(`Time: ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, 5, yPos);
            pdf.text(`Table: ${order.table_number}`, pageWidth - 5, yPos, { align: 'right' });
            yPos += lineHeight + 2;
            
            // Customer info
            pdf.text(`Customer: ${order.customer_name || 'Walk-in Customer'}`, 5, yPos);
            yPos += lineHeight;
            if (order.customer_phone) {
                pdf.text(`Phone: ${order.customer_phone}`, 5, yPos);
                yPos += lineHeight;
            }
            pdf.text(`Cashier: ${order.cashier_name}`, 5, yPos);
            yPos += lineHeight + 2;
            
            // Dashed line
            this.drawDashedLine(pdf, 5, yPos, pageWidth - 5, yPos);
            yPos += lineHeight;
            
            // Items
            order.items.forEach(item => {
                pdf.text(item.name, 5, yPos);
                yPos += lineHeight;
                pdf.text(`${item.quantity} x ₹${item.price.toFixed(2)}`, 5, yPos);
                pdf.text(`₹${item.total.toFixed(2)}`, pageWidth - 5, yPos, { align: 'right' });
                yPos += lineHeight + 1;
            });
            
            // Dashed line
            this.drawDashedLine(pdf, 5, yPos, pageWidth - 5, yPos);
            yPos += lineHeight;
            
            // Totals
            pdf.text('Subtotal:', 5, yPos);
            pdf.text(`₹${order.subtotal.toFixed(2)}`, pageWidth - 5, yPos, { align: 'right' });
            yPos += lineHeight;
            
            pdf.text(`GST (${order.gst_rate}%):`, 5, yPos);
            pdf.text(`₹${order.tax_amount.toFixed(2)}`, pageWidth - 5, yPos, { align: 'right' });
            yPos += lineHeight + 1;
            
            pdf.setFontSize(10);
            pdf.text('GRAND TOTAL:', 5, yPos);
            pdf.text(`₹${order.total.toFixed(2)}`, pageWidth - 5, yPos, { align: 'right' });
            yPos += lineHeight + 2;
            
            // Dashed line
            pdf.setFontSize(8);
            this.drawDashedLine(pdf, 5, yPos, pageWidth - 5, yPos);
            yPos += lineHeight;
            
            // Payment mode
            pdf.text(`Payment Mode: ${order.payment_mode}`, pageWidth/2, yPos, { align: 'center' });
            yPos += lineHeight + 4;
            
            // QR Code
            if (this.data.qrConfig.enabled) {
                if (this.data.qrConfig.uploadedImage) {
                    // Use uploaded QR code image
                    this.drawDashedLine(pdf, 5, yPos, pageWidth - 5, yPos);
                    yPos += lineHeight;

                    pdf.text('Pay via QR Code', pageWidth/2, yPos, { align: 'center' });
                    yPos += lineHeight;

                    pdf.addImage(this.data.qrConfig.uploadedImage, 'PNG', pageWidth/2 - 15, yPos, 30, 30);
                    yPos += 32;

                    pdf.text(`Scan to pay ₹${order.total.toFixed(2)}`, pageWidth/2, yPos, { align: 'center' });
                    yPos += lineHeight + 4;
                } else if (this.data.qrConfig.upiId && this.data.qrConfig.merchantName && typeof QRCode !== 'undefined') {
                    // Generate QR code from UPI details
                    const tempCanvas = document.createElement('canvas');
                    const upiString = `upi://pay?pa=${this.data.qrConfig.upiId}&pn=${this.data.qrConfig.merchantName}&am=${order.total}&cu=INR`;

                    QRCode.toCanvas(tempCanvas, upiString, { width: 120 }, (error) => {
                        if (!error) {
                            const qrDataURL = tempCanvas.toDataURL();

                            this.drawDashedLine(pdf, 5, yPos, pageWidth - 5, yPos);
                            yPos += lineHeight;

                            pdf.text('Pay via QR Code', pageWidth/2, yPos, { align: 'center' });
                            yPos += lineHeight;

                            pdf.addImage(qrDataURL, 'PNG', pageWidth/2 - 15, yPos, 30, 30);
                            yPos += 32;

                            pdf.text(`Scan to pay ₹${order.total.toFixed(2)}`, pageWidth/2, yPos, { align: 'center' });
                            yPos += lineHeight + 4;
                        }

                        // Footer
                        pdf.text('Thanks & Visit Again!', pageWidth/2, yPos, { align: 'center' });

                        // Save PDF
                        const filename = `Bill_${order.billNumber}_${date.toISOString().split('T')[0]}.pdf`;
                        pdf.save(filename);
                        this.hideLoading();
                        this.showToast('PDF downloaded successfully!', 'success');
                    });
                    return; // Exit early since QR generation is async
                }

                // Footer
                pdf.text('Thanks & Visit Again!', pageWidth/2, yPos, { align: 'center' });

                // Save PDF
                const filename = `Bill_${order.billNumber}_${date.toISOString().split('T')[0]}.pdf`;
                pdf.save(filename);
                this.hideLoading();
                this.showToast('PDF downloaded successfully!', 'success');
            } else {
                // Footer without QR
                pdf.text('Thanks & Visit Again!', pageWidth/2, yPos, { align: 'center' });

                // Save PDF
                const filename = `Bill_${order.billNumber}_${date.toISOString().split('T')[0]}.pdf`;
                pdf.save(filename);
                this.hideLoading();
                this.showToast('PDF downloaded successfully!', 'success');
            }
            
        } catch (error) {
            console.error('PDF generation error:', error);
            this.hideLoading();
            this.showToast('Error generating PDF', 'error');
        }
    }

    wrapText(text, maxLength) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';
        
        words.forEach(word => {
            if (currentLine.length + word.length + 1 <= maxLength) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        });
        
        if (currentLine) lines.push(currentLine);
        return lines;
    }

    drawDashedLine(pdf, x1, y, x2, y2) {
        const dashLength = 1;
        const spaceLength = 1;
        let currentX = x1;
        
        while (currentX < x2) {
            const endX = Math.min(currentX + dashLength, x2);
            pdf.line(currentX, y, endX, y2);
            currentX = endX + spaceLength;
        }
    }

    // Enhanced Export Functions
    exportSalesCSV() {
        console.log('Exporting sales CSV'); // Debug log
        
        const orders = this.getFilteredExportData();
        const csvContent = [
            ['Bill Number', 'Date', 'Time', 'Customer', 'Phone', 'Table', 'Items', 'Subtotal', 'GST', 'Total', 'Payment Mode', 'Cashier', 'Generated By'],
            ...orders.map(order => [
                order.billNumber,
                this.formatDate(order.created_at),
                this.formatTime(order.created_at),
                order.customer_name || 'Walk-in Customer',
                order.customer_phone || '',
                order.table_number,
                order.items.length,
                order.subtotal.toFixed(2),
                order.tax_amount.toFixed(2),
                order.total.toFixed(2),
                order.payment_mode,
                order.cashier_name,
                order.generated_by || 'cashier'
            ])
        ].map(row => row.join(',')).join('\n');
        
        this.downloadFile(csvContent, 'sales_report.csv', 'text/csv');
        this.showToast('Sales CSV exported successfully!', 'success');
    }

    exportSalesPDF() {
        console.log('Exporting sales PDF'); // Debug log
        
        if (typeof window.jspdf === 'undefined') {
            this.showToast('PDF library not loaded', 'error');
            return;
        }

        this.showLoading();
        
        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF();
            const orders = this.getFilteredExportData();
            
            // Title
            pdf.setFontSize(16);
            pdf.text('Sales Report', 105, 20, { align: 'center' });
            
            pdf.setFontSize(12);
            pdf.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 105, 30, { align: 'center' });
            
            // Summary
            const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
            const totalOrders = orders.length;
            
            pdf.setFontSize(10);
            let yPos = 50;
            pdf.text(`Total Orders: ${totalOrders}`, 20, yPos);
            pdf.text(`Total Sales: ₹${totalSales.toFixed(2)}`, 120, yPos);
            yPos += 10;
            
            pdf.text(`Average Order Value: ₹${totalOrders > 0 ? (totalSales / totalOrders).toFixed(2) : '0.00'}`, 20, yPos);
            yPos += 20;
            
            // Table headers
            const headers = ['Bill#', 'Date', 'Customer', 'Items', 'Total', 'Payment'];
            const columnWidths = [25, 25, 40, 20, 25, 25];
            let xPos = 20;
            
            pdf.setFontSize(8);
            headers.forEach((header, index) => {
                pdf.text(header, xPos, yPos);
                xPos += columnWidths[index];
            });
            yPos += 5;
            
            // Table content
            orders.slice(0, 30).forEach(order => { // Limit to 30 orders per page
                if (yPos > 270) {
                    pdf.addPage();
                    yPos = 30;
                }
                
                xPos = 20;
                const rowData = [
                    order.billNumber,
                    this.formatDate(order.created_at),
                    (order.customer_name || 'Walk-in').substring(0, 15),
                    order.items.length.toString(),
                    `₹${order.total.toFixed(2)}`,
                    order.payment_mode
                ];
                
                rowData.forEach((data, index) => {
                    pdf.text(data.toString(), xPos, yPos);
                    xPos += columnWidths[index];
                });
                yPos += 5;
            });
            
            const filename = `Sales_Report_${new Date().toISOString().split('T')[0]}.pdf`;
            pdf.save(filename);
            
            this.hideLoading();
            this.showToast('Sales PDF exported successfully!', 'success');
        } catch (error) {
            console.error('PDF export error:', error);
            this.hideLoading();
            this.showToast('Error exporting PDF', 'error');
        }
    }

    exportOrdersCSV() {
        const orders = this.getFilteredExportData();
        const csvContent = [
            ['Order ID', 'Bill Number', 'Date', 'Time', 'Customer Name', 'Customer Phone', 'Table Number', 'Item Name', 'Quantity', 'Price', 'Item Total', 'Subtotal', 'GST Rate', 'GST Amount', 'Grand Total', 'Payment Mode', 'Cashier', 'Status'],
            ...orders.flatMap(order => 
                order.items.map(item => [
                    order.id,
                    order.billNumber,
                    this.formatDate(order.created_at),
                    this.formatTime(order.created_at),
                    order.customer_name || 'Walk-in Customer',
                    order.customer_phone || '',
                    order.table_number,
                    item.name,
                    item.quantity,
                    item.price.toFixed(2),
                    item.total.toFixed(2),
                    order.subtotal.toFixed(2),
                    order.gst_rate + '%',
                    order.tax_amount.toFixed(2),
                    order.total.toFixed(2),
                    order.payment_mode,
                    order.cashier_name,
                    order.status
                ])
            )
        ].map(row => row.join(',')).join('\n');
        
        this.downloadFile(csvContent, 'orders_detailed.csv', 'text/csv');
        this.showToast('Orders CSV exported successfully!', 'success');
    }

    exportMenuCSV() {
        const csvContent = [
            ['Item ID', 'Name', 'Category', 'Price', 'Available'],
            ...this.data.menuItems.map(item => [
                item.id,
                item.name,
                item.category,
                item.price.toFixed(2),
                item.available ? 'Yes' : 'No'
            ])
        ].map(row => row.join(',')).join('\n');
        
        this.downloadFile(csvContent, 'menu_items.csv', 'text/csv');
        this.showToast('Menu CSV exported successfully!', 'success');
    }

    exportFinancialPDF() {
        if (typeof window.jspdf === 'undefined') {
            this.showToast('PDF library not loaded', 'error');
            return;
        }

        this.showLoading();
        
        try {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF();
            const orders = this.getFilteredExportData();
            
            // Title
            pdf.setFontSize(16);
            pdf.text('Financial Summary Report', 105, 20, { align: 'center' });
            
            pdf.setFontSize(12);
            pdf.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 105, 30, { align: 'center' });
            
            // Financial calculations
            const totalSales = orders.reduce((sum, order) => sum + order.total, 0);
            const totalGST = orders.reduce((sum, order) => sum + order.tax_amount, 0);
            const totalSubtotal = orders.reduce((sum, order) => sum + order.subtotal, 0);
            
            // Payment mode breakdown
            const paymentBreakdown = {};
            this.data.paymentModes.forEach(mode => {
                paymentBreakdown[mode] = orders.filter(o => o.payment_mode === mode).reduce((sum, o) => sum + o.total, 0);
            });
            
            let yPos = 50;
            pdf.setFontSize(14);
            pdf.text('Financial Overview', 20, yPos);
            yPos += 15;
            
            pdf.setFontSize(10);
            pdf.text(`Total Gross Sales: ₹${totalSales.toFixed(2)}`, 20, yPos);
            yPos += 8;
            pdf.text(`Total GST Collected: ₹${totalGST.toFixed(2)}`, 20, yPos);
            yPos += 8;
            pdf.text(`Net Sales (Before Tax): ₹${totalSubtotal.toFixed(2)}`, 20, yPos);
            yPos += 8;
            pdf.text(`Total Orders: ${orders.length}`, 20, yPos);
            yPos += 20;
            
            // Payment Mode Breakdown
            pdf.setFontSize(14);
            pdf.text('Payment Mode Breakdown', 20, yPos);
            yPos += 15;
            
            pdf.setFontSize(10);
            Object.entries(paymentBreakdown).forEach(([mode, amount]) => {
                if (amount > 0) {
                    const percentage = ((amount / totalSales) * 100).toFixed(1);
                    pdf.text(`${mode}: ₹${amount.toFixed(2)} (${percentage}%)`, 20, yPos);
                    yPos += 8;
                }
            });
            
            const filename = `Financial_Report_${new Date().toISOString().split('T')[0]}.pdf`;
            pdf.save(filename);
            
            this.hideLoading();
            this.showToast('Financial PDF exported successfully!', 'success');
        } catch (error) {
            console.error('Financial PDF export error:', error);
            this.hideLoading();
            this.showToast('Error exporting financial PDF', 'error');
        }
    }

    getFilteredExportData() {
        const fromDate = document.getElementById('exportFromDate')?.value;
        const toDate = document.getElementById('exportToDate')?.value;
        const cashierId = document.getElementById('exportCashierFilter')?.value;
        
        let filteredOrders = [...this.data.orders];
        
        if (fromDate) {
            filteredOrders = filteredOrders.filter(order => order.date >= fromDate);
        }
        
        if (toDate) {
            filteredOrders = filteredOrders.filter(order => order.date <= toDate);
        }
        
        if (cashierId) {
            filteredOrders = filteredOrders.filter(order => order.cashier_id == cashierId);
        }
        
        return filteredOrders;
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    // Modal Management
    openMenuItemModal(item = null) {
        const modal = document.getElementById('menuItemModal');
        const title = document.getElementById('menuItemModalTitle');
        const form = document.getElementById('menuItemForm');
        
        if (!modal || !title || !form) return;
        
        if (item) {
            title.textContent = 'Edit Menu Item';
            document.getElementById('itemName').value = item.name;
            document.getElementById('itemCategory').value = item.category;
            document.getElementById('itemPrice').value = item.price;
            document.getElementById('itemAvailable').value = item.available.toString();
            form.dataset.editId = item.id;
        } else {
            title.textContent = 'Add Menu Item';
            form.reset();
            delete form.dataset.editId;
        }
        
        modal.classList.remove('hidden');
    }

    openUserModal() {
        const modal = document.getElementById('userModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    // Utility Functions
    showToast(message, type = 'info') {
        console.log(`Toast [${type}]: ${message}`); // Debug log
        
        const container = document.getElementById('toastContainer');
        if (!container) {
            console.warn('Toast container not found');
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 3000);
    }

    showLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
            spinner.classList.remove('hidden');
        }
    }

    hideLoading() {
        const spinner = document.getElementById('loadingSpinner');
        if (spinner) {
            spinner.classList.add('hidden');
        }
    }

    // Event Handlers
    handleNavClick(e) {
        console.log('Nav clicked:', e.target.dataset.section); // Debug log

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));

        e.target.classList.add('active');
        const section = e.target.dataset.section;
        const sectionEl = document.getElementById(`${section}Section`);
        if (sectionEl) {
            sectionEl.classList.add('active');
        }

        // Load data when switching sections
        if (section === 'bills') {
            setTimeout(() => this.loadAdminBillManagement(), 100);
        } else if (section === 'users') {
            setTimeout(() => this.loadUsers(), 100);
        } else if (section === 'settings') {
            setTimeout(() => this.loadRestaurantSettings(), 100);
        } else if (section === 'qr') {
            setTimeout(() => this.loadQRSettings(), 100);
        } else if (section === 'orders') {
            setTimeout(() => this.loadOrderHistory(), 100);
        } else if (section === 'pending') {
            setTimeout(() => this.loadPendingOrders(), 100);
        }
    }

    handleCategoryClick(e) {
        if (!e.target.classList.contains('category-btn')) return;
        
        document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        const searchValue = document.getElementById('menuSearchCashier') ? document.getElementById('menuSearchCashier').value : '';
        this.loadCashierMenu(e.target.dataset.category, searchValue);
    }

    handlePaymentClick(e) {
        if (!e.target.classList.contains('payment-btn')) return;
        
        document.querySelectorAll('.payment-btn').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        this.selectedPaymentMode = e.target.dataset.mode;
        console.log('Payment mode selected:', this.selectedPaymentMode); // Debug log
    }

    // Event Listeners Setup
    setupEventListeners() {
        console.log('Setting up event listeners'); // Debug log
        
        // Login Form
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin);
            console.log('Login form listener added'); // Debug log
        } else {
            console.error('Login form not found');
        }

        // Admin Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', this.handleNavClick);
        });

        // Admin Bill Generation
        const generateAdminBillBtn = document.getElementById('generateAdminBillBtn');
        if (generateAdminBillBtn) {
            generateAdminBillBtn.addEventListener('click', () => {
                this.openAdminBillModal();
            });
        }

        const adminMenuSearch = document.getElementById('adminMenuSearch');
        if (adminMenuSearch) {
            adminMenuSearch.addEventListener('input', (e) => {
                this.loadAdminMenuItems(e.target.value);
            });
        }

        const saveAdminBillBtn = document.getElementById('saveAdminBill');
        if (saveAdminBillBtn) {
            saveAdminBillBtn.addEventListener('click', () => {
                this.saveAdminBill();
            });
        }

        // Export functionality
        const exportButtons = [
            { id: 'exportSalesCSV', action: () => this.exportSalesCSV() },
            { id: 'exportSalesPDF', action: () => this.exportSalesPDF() },
            { id: 'exportOrdersCSV', action: () => this.exportOrdersCSV() },
            { id: 'exportMenuCSV', action: () => this.exportMenuCSV() },
            { id: 'exportFinancialPDF', action: () => this.exportFinancialPDF() }
        ];

        exportButtons.forEach(({ id, action }) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', action);
            }
        });

        // Menu Management
        const addMenuBtn = document.getElementById('addMenuItemBtn');
        if (addMenuBtn) {
            addMenuBtn.addEventListener('click', () => {
                this.openMenuItemModal();
            });
        }

        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                const searchValue = document.getElementById('menuSearch') ? document.getElementById('menuSearch').value : '';
                this.loadMenuItems(e.target.value, searchValue);
            });
        }

        const menuSearch = document.getElementById('menuSearch');
        if (menuSearch) {
            menuSearch.addEventListener('input', (e) => {
                const categoryValue = document.getElementById('categoryFilter') ? document.getElementById('categoryFilter').value : '';
                this.loadMenuItems(categoryValue, e.target.value);
            });
        }

        const menuItemForm = document.getElementById('menuItemForm');
        if (menuItemForm) {
            menuItemForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const itemName = document.getElementById('itemName').value;
                const itemCategory = document.getElementById('itemCategory').value;
                const itemPrice = document.getElementById('itemPrice').value;
                const itemAvailable = document.getElementById('itemAvailable').value;
                
                const itemData = {
                    name: itemName,
                    category: itemCategory,
                    price: itemPrice,
                    available: itemAvailable
                };
                
                if (e.target.dataset.editId) {
                    // Edit existing item
                    const id = parseInt(e.target.dataset.editId);
                    this.updateMenuItem(id, itemData);
                } else {
                    // Add new item
                    this.addMenuItem(itemData);
                }
                
                this.closeModal('menuItemModal');
            });
        }

        // Order History Filters
        const orderFilters = ['cashierFilter', 'paymentModeFilter', 'orderDateFilter'];
        orderFilters.forEach(filterId => {
            const filter = document.getElementById(filterId);
            if (filter) {
                filter.addEventListener('change', () => {
                    this.applyOrderFilters();
                });
            }
        });

        const orderSearch = document.getElementById('orderSearch');
        if (orderSearch) {
            orderSearch.addEventListener('input', () => {
                this.applyOrderFilters();
            });
        }

        const clearOrderFiltersBtn = document.getElementById('clearOrderFilters');
        if (clearOrderFiltersBtn) {
            clearOrderFiltersBtn.addEventListener('click', () => {
                const cashierFilterEl = document.getElementById('cashierFilter');
                const paymentModeFilterEl = document.getElementById('paymentModeFilter');
                const orderDateFilterEl = document.getElementById('orderDateFilter');
                const orderSearchEl = document.getElementById('orderSearch');
                
                if (cashierFilterEl) cashierFilterEl.value = '';
                if (paymentModeFilterEl) paymentModeFilterEl.value = '';
                if (orderDateFilterEl) orderDateFilterEl.value = '';
                if (orderSearchEl) orderSearchEl.value = '';
                
                this.loadOrderHistory();
            });
        }

        // Sales Reports
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadSalesReports(btn.dataset.period);
            });
        });

        // User Management
        const addUserBtn = document.getElementById('addUserBtn');
        if (addUserBtn) {
            addUserBtn.addEventListener('click', () => {
                this.openUserModal();
            });
        }

        const userForm = document.getElementById('userForm');
        if (userForm) {
            userForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const userName = document.getElementById('userName').value;
                const userUsername = document.getElementById('userUsername').value;
                const userPassword = document.getElementById('userPassword').value;
                const userPhone = document.getElementById('userPhone').value;
                
                const userData = {
                    name: userName,
                    username: userUsername,
                    password: userPassword,
                    phone: userPhone
                };
                
                this.addUser(userData);
                this.closeModal('userModal');
                e.target.reset();
            });
        }

        // Change Password Form
        const changePasswordForm = document.getElementById('changePasswordForm');
        if (changePasswordForm) {
            changePasswordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const newPassword = document.getElementById('newPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;
                
                if (newPassword !== confirmPassword) {
                    this.showToast('Passwords do not match', 'error');
                    return;
                }
                
                if (newPassword.length < 4) {
                    this.showToast('Password must be at least 4 characters long', 'error');
                    return;
                }
                
                if (this.selectedUserId) {
                    this.changeUserPassword(this.selectedUserId, newPassword);
                    e.target.reset();
                }
            });
        }

        // Restaurant Settings
        const settingsForm = document.getElementById('restaurantSettingsForm');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const restaurantName = document.getElementById('restaurantName').value;
                const restaurantAddress = document.getElementById('restaurantAddress').value;
                const gstin = document.getElementById('gstin').value;
                const fssai = document.getElementById('fssai').value;
                const restaurantPhone = document.getElementById('restaurantPhone').value;
                const gstRate = document.getElementById('gstRate').value;
                
                const settingsData = {
                    name: restaurantName,
                    address: restaurantAddress,
                    gstin: gstin,
                    fssai: fssai,
                    phone: restaurantPhone,
                    gstRate: parseInt(gstRate)
                };
                
                this.saveRestaurantSettings(settingsData);
            });
        }

        // QR Settings
        const qrSettingsForm = document.getElementById('qrSettingsForm');
        if (qrSettingsForm) {
            qrSettingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const upiId = document.getElementById('upiId').value;
                const merchantName = document.getElementById('merchantName').value;
                const qrEnabled = document.getElementById('qrEnabled').checked;
                
                const qrData = {
                    upiId: upiId,
                    merchantName: merchantName,
                    enabled: qrEnabled
                };
                
                this.saveQRSettings(qrData);
            });
        }

        // QR Preview Update
        const qrInputs = ['upiId', 'merchantName', 'qrEnabled'];
        qrInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.addEventListener('input', () => {
                    this.updateQRPreview();
                });
                input.addEventListener('change', () => {
                    this.updateQRPreview();
                });
            }
        });

        // QR Code File Upload
        const qrPhotoInput = document.getElementById('qrPhoto');
        if (qrPhotoInput) {
            qrPhotoInput.addEventListener('change', (e) => {
                this.handleQRCodeUpload(e);
            });
        }

        // Cashier Interface
        const menuSearchCashier = document.getElementById('menuSearchCashier');
        if (menuSearchCashier) {
            menuSearchCashier.addEventListener('input', (e) => {
                const activeCategory = document.querySelector('.category-btn.active');
                const category = activeCategory ? activeCategory.dataset.category : '';
                this.loadCashierMenu(category, e.target.value);
            });
        }

        // Cashier Order History
        const viewHistoryBtn = document.getElementById('viewHistoryBtn');
        if (viewHistoryBtn) {
            viewHistoryBtn.addEventListener('click', () => {
                this.showCashierHistory();
            });
        }

        const closeHistoryBtn = document.getElementById('closeHistoryBtn');
        if (closeHistoryBtn) {
            closeHistoryBtn.addEventListener('click', () => {
                this.hideCashierHistory();
            });
        }

        // History tabs
        document.querySelectorAll('.history-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadCashierOrderHistory(tab.dataset.period);
            });
        });

        // History filters
        const historyDateFilter = document.getElementById('historyDateFilter');
        if (historyDateFilter) {
            historyDateFilter.addEventListener('change', () => {
                this.applyCashierHistoryFilters();
            });
        }

        const historySearch = document.getElementById('historySearch');
        if (historySearch) {
            historySearch.addEventListener('input', () => {
                this.applyCashierHistoryFilters();
            });
        }

        // Use event delegation for dynamic content
        document.addEventListener('click', this.handleCategoryClick);
        document.addEventListener('click', this.handlePaymentClick);

        const tableNumberInput = document.getElementById('tableNumber');
        if (tableNumberInput) {
            tableNumberInput.addEventListener('input', () => {
                this.updateCart();
            });
        }

        const clearCartBtn = document.getElementById('clearCart');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => {
                this.clearCart();
            });
        }

        const generateBillBtn = document.getElementById('generateBill');
        if (generateBillBtn) {
            generateBillBtn.addEventListener('click', () => {
                this.generateBill();
            });
        }

        // Bill Modal
        const printBillBtn = document.getElementById('printBill');
        if (printBillBtn) {
            printBillBtn.addEventListener('click', () => {
                this.printBill();
            });
        }

        const downloadPDFBtn = document.getElementById('downloadPDF');
        if (downloadPDFBtn) {
            downloadPDFBtn.addEventListener('click', () => {
                this.downloadPDF();
            });
        }

        const downloadBillPDFBtn = document.getElementById('downloadBillPDF');
        if (downloadBillPDFBtn) {
            downloadBillPDFBtn.addEventListener('click', () => {
                this.downloadPDF();
            });
        }

        const completeBillBtn = document.getElementById('completeBill');
        if (completeBillBtn) {
            completeBillBtn.addEventListener('click', () => {
                this.completeBill();
            });
        }

        const reprintBillBtn = document.getElementById('reprintBill');
        if (reprintBillBtn) {
            reprintBillBtn.addEventListener('click', () => {
                this.reprintBill();
            });
        }

        // Modal Controls
        document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) {
                    modal.classList.add('hidden');
                }
            });
        });

        // Logout buttons
        const adminLogoutBtn = document.getElementById('adminLogout');
        if (adminLogoutBtn) {
            adminLogoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }

        const cashierLogoutBtn = document.getElementById('cashierLogout');
        if (cashierLogoutBtn) {
            cashierLogoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }

        // Click outside modal to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                }
            });
        });

        console.log('Event listeners setup completed'); // Debug log
    }

    applyOrderFilters() {
        const filters = {
            cashier: document.getElementById('cashierFilter')?.value,
            paymentMode: document.getElementById('paymentModeFilter')?.value,
            date: document.getElementById('orderDateFilter')?.value,
            search: document.getElementById('orderSearch')?.value
        };
        this.loadOrderHistory(filters);
    }

    applyCashierHistoryFilters() {
        const activeTab = document.querySelector('.history-tab.active');
        const period = activeTab ? activeTab.dataset.period : 'today';
        
        const filters = {
            date: document.getElementById('historyDateFilter')?.value,
            search: document.getElementById('historySearch')?.value
        };
        
        this.loadCashierOrderHistory(period, filters);
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded - Initializing POS'); // Debug log
    window.pos = new RestaurantPOS();
});

// Fallback initialization if DOM is already loaded
if (document.readyState !== 'loading') {
    console.log('DOM already loaded - Initializing POS'); // Debug log
    window.pos = new RestaurantPOS();
}