const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, 'forumbot.db');
    }

    // Initialize database connection and create tables
    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('❌ Error opening database:', err);
                    reject(err);
                } else {
                    console.log('✅ Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    // Create all necessary tables
    async createTables() {
        const tables = [
            // Player IDs table (replaces ids.txt and idspl.txt)
            `CREATE TABLE IF NOT EXISTS player_ids (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id TEXT NOT NULL,
                discord_user_id TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('de', 'pl')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(player_id, discord_user_id, type)
            )`,

            // User preferences table for notification settings
            `CREATE TABLE IF NOT EXISTS user_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                discord_user_id TEXT NOT NULL UNIQUE,
                notify_static_field BOOLEAN DEFAULT 1,
                notify_closed_threads BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Admin names table (replaces adminnames.txt)
            `CREATE TABLE IF NOT EXISTS admin_names (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_name TEXT NOT NULL,
                discord_user_id TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('de', 'pl')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(admin_name, discord_user_id, type)
            )`,

            // Pending requests table (replaces pending_requests.json)
            `CREATE TABLE IF NOT EXISTS pending_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT UNIQUE NOT NULL,
                player_id TEXT NOT NULL,
                discord_user_id TEXT NOT NULL,
                discord_user_tag TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('de', 'pl')),
                status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied')),
                reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Sent log table (replaces sent_log.json)
            `CREATE TABLE IF NOT EXISTS sent_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_url TEXT NOT NULL,
                player_id TEXT,
                discord_user_id TEXT,
                message_content TEXT,
                notification_type TEXT DEFAULT 'discord',
                sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Stats table (replaces stats.json)
            `CREATE TABLE IF NOT EXISTS stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                scanned_threads INTEGER DEFAULT 0,
                accumulated_uptime INTEGER DEFAULT 0,
                session_start_time INTEGER,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Telegram user mappings table (replaces telegram_user_mappings.json)
            `CREATE TABLE IF NOT EXISTS telegram_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                discord_user_id TEXT UNIQUE NOT NULL,
                telegram_chat_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const tableSQL of tables) {
            await this.run(tableSQL);
        }

        // Run migrations for existing tables
        await this.runMigrations();

        // Initialize stats if empty
        const statsCount = await this.get('SELECT COUNT(*) as count FROM stats');
        if (statsCount.count === 0) {
            await this.run('INSERT INTO stats (scanned_threads, accumulated_uptime, session_start_time) VALUES (0, 0, ?)', [Date.now()]);
        }

        console.log("✅ Database initialized successfully");
    }

    async runMigrations() {
        try {
            // Check if admin_names table exists and needs migration
            const adminTableInfo = await this.all("PRAGMA table_info(admin_names)");
            const hasTypeColumn = adminTableInfo.some(column => column.name === 'type');
            
            if (adminTableInfo.length > 0 && !hasTypeColumn) {
                console.log("🔄 Migrating admin_names table to add type column...");
                
                // Add type column with default value 'de' for existing records
                await this.run("ALTER TABLE admin_names ADD COLUMN type TEXT NOT NULL DEFAULT 'de' CHECK(type IN ('de', 'pl'))");
                
                // Drop the old unique constraint and add new one
                await this.run(`CREATE TABLE admin_names_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_name TEXT NOT NULL,
                    discord_user_id TEXT NOT NULL,
                    type TEXT NOT NULL CHECK(type IN ('de', 'pl')),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(admin_name, discord_user_id, type)
                )`);
                
                // Copy data from old table to new table
                await this.run(`INSERT INTO admin_names_new (id, admin_name, discord_user_id, type, created_at)
                    SELECT id, admin_name, discord_user_id, type, created_at FROM admin_names`);
                
                // Drop old table and rename new table
                await this.run("DROP TABLE admin_names");
                await this.run("ALTER TABLE admin_names_new RENAME TO admin_names");
                
                console.log("✅ admin_names table migration completed");
            }
        } catch (error) {
            console.error("❌ Migration error:", error);
            // Don't throw here to allow the bot to continue running
        }
    }

    // Helper method to run SQL queries
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('❌ Database run error:', err);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    // Helper method to get a single row
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('❌ Database get error:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Helper method to get all rows
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('❌ Database all error:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // === PLAYER IDS METHODS ===
    async getPlayerIds(type = 'de') {
        const rows = await this.all('SELECT player_id, discord_user_id FROM player_ids WHERE type = ?', [type]);
        return rows.map(row => ({ id: row.player_id, userId: row.discord_user_id }));
    }

    async addPlayerId(playerId, discordUserId, type = 'de') {
        try {
            await this.run('INSERT INTO player_ids (player_id, discord_user_id, type) VALUES (?, ?, ?)', 
                [playerId, discordUserId, type]);
            return true;
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                return false; // Already exists
            }
            throw err;
        }
    }

    async playerIdExists(playerId, type = 'de') {
        const row = await this.get('SELECT id FROM player_ids WHERE player_id = ? AND type = ?', [playerId, type]);
        return !!row;
    }

    async userMonitorsPlayerId(discordUserId, playerId, type = 'de') {
        const row = await this.get('SELECT id FROM player_ids WHERE discord_user_id = ? AND player_id = ? AND type = ?', 
            [discordUserId, playerId, type]);
        return !!row;
    }

    async getPlayerIdsByDiscordUser(discordUserId) {
        return await this.all('SELECT player_id, type, created_at FROM player_ids WHERE discord_user_id = ? ORDER BY type, player_id', [discordUserId]);
    }

    async removePlayerId(playerId, type = 'de') {
        const result = await this.run('DELETE FROM player_ids WHERE player_id = ? AND type = ?', [playerId, type]);
        return result.changes > 0; // Returns true if a row was deleted
    }

    async getPlayerIdDetails(playerId, type = 'de') {
        return await this.get('SELECT player_id, discord_user_id, type, created_at FROM player_ids WHERE player_id = ? AND type = ?', [playerId, type]);
    }

    async getAllPlayerIds() {
        return await this.all('SELECT player_id, discord_user_id, type, created_at FROM player_ids ORDER BY discord_user_id, type, player_id');
    }

    // === THREAD MANAGEMENT METHODS ===
    async deleteThreadFromLog(threadUrl) {
        const result = await this.run('DELETE FROM sent_log WHERE thread_url = ?', [threadUrl]);
        return result.changes; // Returns number of deleted rows
    }

    async getThreadsFromLog(limit = 50) {
        return await this.all('SELECT DISTINCT thread_url, COUNT(*) as notification_count, MAX(sent_at) as last_notification FROM sent_log GROUP BY thread_url ORDER BY last_notification DESC LIMIT ?', [limit]);
    }

    // === ADMIN NAMES METHODS ===
    async getAdminNames(type = 'de') {
        return await this.all('SELECT admin_name as name, discord_user_id as userId FROM admin_names WHERE type = ?', [type]);
    }

    async addAdminName(adminName, discordUserId, type = 'de') {
        try {
            await this.run(`INSERT INTO admin_names 
                (admin_name, discord_user_id, type) VALUES (?, ?, ?)`, 
                [adminName, discordUserId, type]);
            return true;
        } catch (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                return false; // Already exists
            }
            throw err;
        }
    }

    async removeAdminName(adminName, type = 'de') {
        await this.run('DELETE FROM admin_names WHERE admin_name = ? AND type = ?', [adminName, type]);
    }

    async adminNameExists(adminName, type = 'de') {
        const result = await this.get('SELECT id FROM admin_names WHERE admin_name = ? AND type = ? LIMIT 1', [adminName, type]);
        return !!result;
    }

    // === PENDING REQUESTS METHODS ===
    async getPendingRequests() {
        return await this.all('SELECT * FROM pending_requests WHERE status = "pending" ORDER BY created_at DESC');
    }

    async addPendingRequest(requestData) {
        await this.run(`INSERT INTO pending_requests 
            (request_id, player_id, discord_user_id, discord_user_tag, type) 
            VALUES (?, ?, ?, ?, ?)`, 
            [requestData.requestId, requestData.playerId, requestData.discordUserId, 
             requestData.discordUserTag, requestData.type]);
    }

    async updateRequestStatus(requestId, status) {
        await this.run('UPDATE pending_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?', 
            [status, requestId]);
    }

    async updateRequestStatusWithReason(requestId, status, reason) {
        await this.run('UPDATE pending_requests SET status = ?, reason = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?', 
            [status, reason, requestId]);
    }

    async getRequestById(requestId) {
        return await this.get('SELECT * FROM pending_requests WHERE request_id = ?', [requestId]);
    }

    async hasExistingRequest(playerId, discordUserId, type) {
        const row = await this.get(`SELECT id FROM pending_requests 
            WHERE player_id = ? AND discord_user_id = ? AND type = ? AND status = "pending"`, 
            [playerId, discordUserId, type]);
        return !!row;
    }

    // === SENT LOG METHODS ===
    async addSentLog(threadUrl, playerId, discordUserId, messageContent, notificationType = 'discord') {
        await this.run(`INSERT INTO sent_log 
            (thread_url, player_id, discord_user_id, message_content, notification_type) 
            VALUES (?, ?, ?, ?, ?)`, 
            [threadUrl, playerId, discordUserId, messageContent, notificationType]);
    }

    async getSentLog(limit = 1000) {
        return await this.all('SELECT * FROM sent_log ORDER BY sent_at DESC LIMIT ?', [limit]);
    }

    async hasRecentNotification(threadUrl, playerId, discordUserId, hoursAgo = 24) {
        const cutoffTime = new Date(Date.now() - (hoursAgo * 60 * 60 * 1000)).toISOString();
        const row = await this.get(`SELECT id FROM sent_log 
            WHERE thread_url = ? AND player_id = ? AND discord_user_id = ? AND sent_at > ?`, 
            [threadUrl, playerId, discordUserId, cutoffTime]);
        return !!row;
    }

    // === STATS METHODS ===
    async getStats() {
        return await this.get('SELECT * FROM stats ORDER BY id DESC LIMIT 1');
    }

    async updateStats(scannedThreads, accumulatedUptime) {
        await this.run(`UPDATE stats SET 
            scanned_threads = ?, 
            accumulated_uptime = ?, 
            last_updated = CURRENT_TIMESTAMP 
            WHERE id = (SELECT id FROM stats ORDER BY id DESC LIMIT 1)`, 
            [scannedThreads, accumulatedUptime]);
    }

    async incrementScannedThreads() {
        await this.run(`UPDATE stats SET 
            scanned_threads = scanned_threads + 1, 
            last_updated = CURRENT_TIMESTAMP 
            WHERE id = (SELECT id FROM stats ORDER BY id DESC LIMIT 1)`);
    }

    // === TELEGRAM MAPPINGS METHODS ===
    async getTelegramMappings() {
        const rows = await this.all('SELECT discord_user_id, telegram_chat_id FROM telegram_mappings');
        const mappings = {};
        rows.forEach(row => {
            mappings[row.discord_user_id] = row.telegram_chat_id;
        });
        return mappings;
    }

    async addTelegramMapping(discordUserId, telegramChatId) {
        await this.run(`INSERT OR REPLACE INTO telegram_mappings 
            (discord_user_id, telegram_chat_id) VALUES (?, ?)`, 
            [discordUserId, telegramChatId]);
    }

    async removeTelegramMapping(discordUserId) {
        await this.run('DELETE FROM telegram_mappings WHERE discord_user_id = ?', [discordUserId]);
    }

    async getTelegramChatId(discordUserId) {
        const row = await this.get('SELECT telegram_chat_id FROM telegram_mappings WHERE discord_user_id = ?', [discordUserId]);
        return row ? row.telegram_chat_id : null;
    }

    // === USER PREFERENCES METHODS ===
    async getUserPreferences(discordUserId) {
        return await this.get('SELECT * FROM user_preferences WHERE discord_user_id = ?', [discordUserId]);
    }

    async addUserPreferences(discordUserId, notifyStaticField, notifyClosedThreads) {
        await this.run(`INSERT INTO user_preferences 
            (discord_user_id, notify_static_field, notify_closed_threads) 
            VALUES (?, ?, ?)`, 
            [discordUserId, notifyStaticField, notifyClosedThreads]);
    }

    async updateUserPreferences(discordUserId, notifyStaticField, notifyClosedThreads) {
        await this.run(`UPDATE user_preferences SET 
            notify_static_field = ?, 
            notify_closed_threads = ?, 
            updated_at = CURRENT_TIMESTAMP 
            WHERE discord_user_id = ?`, 
            [notifyStaticField, notifyClosedThreads, discordUserId]);
    }

    async getUserPreferencesWithDefaults(discordUserId) {
        let prefs = await this.getUserPreferences(discordUserId);
        if (!prefs) {
            await this.addUserPreferences(discordUserId, true, true);
            prefs = { notify_static_field: true, notify_closed_threads: true };
        }
        return prefs;
    }

    // Close database connection
    close() {
        if (this.db) {
            this.db.close();
            console.log('✅ Database connection closed');
        }
    }
}

module.exports = Database;
