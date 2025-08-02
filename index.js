console.log("🚀 Bot script OG.js starting execution...");
// === Global Error Handlers ===
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled Promise Rejection:', error);
});
process.on('uncaughtException', error => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1); // Optional: exit on uncaught exception
});

// === Imports & Setup ===
const fs = require('fs');
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const { Telegraf } = require('telegraf');
const { v4: uuidv4 } = require('uuid'); // For generating unique request IDs
const path = require('path');
const Database = require('./database'); // Add database import
const CommandHandler = require('./commands'); // Add command handler import

// Initialize database
const db = new Database();
let dbInitialized = false;
let commandHandler = null;

// Initialize database connection
async function initializeDatabase() {
    try {
        await db.init();
        dbInitialized = true;
        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        process.exit(1);
    }
}

let scannedThreads = 0;
let accumulatedUptime = 0; // To store total uptime in seconds
// foundIDs and sentNotifications are no longer global persistent stats for status display.

// === Telegram Setup ===
let telegramBot = null;
// Map to store Discord user IDs to Telegram chat IDs
let userMappings = {};
const USER_MAPPINGS_FILE = path.join(__dirname, 'telegram_user_mappings.json');
const PENDING_REQUESTS_FILE = path.join(__dirname, 'pending_requests.json');
const ADMIN_NOTIFICATION_CHANNEL_ID = '1385561623103537163'; // << IMPORTANT: Configure this

setInterval(saveStats, 60000); // Save stats every minute

// === Helper: Token & IDs ===
function getTokenFromFile() {
    try {
        const token = fs.readFileSync('token.txt', 'utf8').trim();
        return token;
    } catch (err) {
        console.error("❌ Fehler beim Token-Laden:", err);
        return null;
    }
}

async function getIDsFromFile(type) {
    if (!dbInitialized) return [];
    try {
        return await db.getPlayerIds(type);
    } catch (err) {
        console.error("❌ Fehler beim IDs-Laden:", err);
        return [];
    }
}

async function getIDsPLFromFile() {
    return await getIDsFromFile('pl');
}

async function loadAdminNamesFromFile(type = 'de') {
    if (!dbInitialized) return [];
    try {
        return await db.getAdminNames(type);
    } catch (err) {
        console.error("❌ Fehler beim Laden der Adminnamen:", err);
        return [];
    }
}

async function loadSentLog() {
    if (!dbInitialized) return [];
    try {
        return await db.getSentLog();
    } catch (err) {
        console.error("❌ Fehler beim Log-Laden:", err);
        return [];
    }
}

async function saveSentLog(threadUrl, playerId, discordUserId, messageContent, notificationType = 'discord') {
    if (!dbInitialized) return;
    try {
        await db.addSentLog(threadUrl, playerId, discordUserId, messageContent, notificationType);
    } catch (err) {
        console.error("❌ Fehler beim Speichern des Logs:", err);
    }
}

async function isThreadAlreadyProcessed(threadUrl) {
    if (!dbInitialized) return false;
    try {
        const result = await db.get('SELECT id FROM sent_log WHERE thread_url = ? LIMIT 1', [threadUrl]);
        return !!result;
    } catch (err) {
        console.error("❌ Fehler beim Prüfen des Thread-Logs:", err);
        return false;
    }
}

// === Helper: Pending ID Requests ===
async function loadPendingRequests() {
    if (!dbInitialized) return [];
    try {
        return await db.getPendingRequests();
    } catch (err) {
        console.error("❌ Fehler beim Laden der ausstehenden Anfragen:", err);
        return [];
    }
}

async function savePendingRequests(requestData) {
    if (!dbInitialized) return;
    try {
        if (Array.isArray(requestData)) {
            // If it's an array, we're updating the entire list (legacy compatibility)
            // For now, we'll just log this case as it shouldn't happen with the new system
            console.log("⚠️ Legacy savePendingRequests call with array - ignoring");
        } else {
            // Single request data
            await db.addPendingRequest(requestData);
        }
    } catch (err) {
        console.error("❌ Fehler beim Speichern der ausstehenden Anfragen:", err);
    }
}

const statsFile = "stats.json";

async function loadStats() {
    if (!dbInitialized) return;
    try {
        const stats = await db.getStats();
        scannedThreads = stats.scanned_threads || 0;
        accumulatedUptime = stats.accumulated_uptime || 0;
    } catch (err) {
        console.error("❌ Fehler beim Laden der Stats:", err);
    }
}

let sessionStartTime = Date.now(); // Track start time of the current session

async function saveStats() {
    if (!dbInitialized) return;
    try {
        const currentSessionDurationSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
        await db.updateStats(scannedThreads, accumulatedUptime + currentSessionDurationSeconds);
    } catch (err) {
        console.error("❌ Fehler beim Speichern der Stats:", err);
    }
}

// === Discord Client ===
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, // Needed for command registration and fetching channels/users
        GatewayIntentBits.GuildMessages, // Needed for fetching and sending messages, deleting messages
        GatewayIntentBits.MessageContent, // Potentially needed for more complex message deletion logic
    ]
});

const NOTIFICATION_CHANNEL_ID = '1382139125951627264';

// === Logging ===
async function logToConsole(message) { // Renamed and simplified
    const msg = `${message}`;
    console.log(msg);
}

// === Stat Formatting Helpers ===
function formatUptime(totalSeconds) {
    const days = Math.floor(totalSeconds / (3600 * 24));
    totalSeconds %= (3600 * 24);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);

    let uptimeString = '';
    if (days > 0) uptimeString += `${days}d `;
    if (hours > 0 || days > 0) uptimeString += `${hours}h `;
    if (minutes > 0 || hours > 0 || days > 0) uptimeString += `${minutes}m `;
    uptimeString += `${seconds}s`;
    return uptimeString.trim();
}

function formatThreadsInK(count) {
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count.toString();
}

// === Puppeteer Forum-Check ===
async function getThreads(page) {
    await logToConsole("🔍 Lade Deutsche Forum-Threads...");
    await page.goto("https://forum.gta5majestic.com/forums/beschwerden-uber-spieler.88/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('a[href^="/threads/"]');
    let links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="/threads/"]'))
            .map(a => `https://forum.gta5majestic.com${a.getAttribute('href')}`)
    );
    links = [...new Set(links)].filter(l =>
        !l.endsWith("/latest") && !l.includes("regeln-fur-beschwerden")
    );
    await logToConsole(`✅ Gefundene Deutsche Threads: ${links.length}`);
    return links;
}

async function getThreadsPL(page) {
    await logToConsole("🔍 Lade POLNISCHE Forum-Threads...");
    await page.goto("https://forum.gta5majestic.com/forums/skargi-na-graczy.63/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('a[href^="/threads/"]');
    let links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="/threads/"]'))
            .map(a => `https://forum.gta5majestic.com${a.getAttribute('href')}`)
    );
    links = [...new Set(links)].filter(l => !l.endsWith("/latest"));
    await logToConsole(`✅ [PL] Gefundene Threads: ${links.length}`);
    return links;
}

async function checkThreadForIDs(page, url, ids) {
    scannedThreads++;
    saveStats();
    await logToConsole(`🔎 Prüfe Thread: ${url}`);
    try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (!res || res.status() !== 200) return [];

        const body = await page.evaluate(() => document.body.innerText);
        if (body.includes("keine Berechtigung") || body.includes("nicht gefunden")) return [];

        let allMatchedUsers = new Set(); // Track users who have been notified for this thread
        let matchedFromEndsId = [];

        // --- Check for IDs in de_endsid field ---
        try {
            await page.waitForSelector('dl[data-field="de_endsid"] dd', { timeout: 15000 });
            const contentEndsId = await page.evaluate(() =>
                Array.from(document.querySelectorAll('dl[data-field="de_endsid"] dd'))
                    .map(el => el.textContent.trim())
            );
            matchedFromEndsId = ids.filter(idObj =>
                contentEndsId.some(txt => new RegExp(`(?<!\\d)${idObj.id}(?!\\d)`).test(txt))
            );

            if (matchedFromEndsId.length > 0) {
                const isOpenThread = url.endsWith("/");
                
                // Send notifications for BOTH open and closed threads from de_endsid field
                // Get thread details for embed
                const threadTitle = await page.evaluate(() => {
                    const titleElement = document.querySelector('.p-title-value');
                    return titleElement ? titleElement.textContent.trim() : 'Beschwerde';
                });
                
                const threadAuthor = await page.evaluate(() => {
                    const authorElement = document.querySelector('.p-description .username');
                    return authorElement ? authorElement.textContent.trim() : 'Unknown';
                });
                
                const threadTime = new Date().toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                // Filter users who want static field notifications
                const usersToNotify = [];
                for (const match of matchedFromEndsId) {
                    if (!allMatchedUsers.has(match.userId)) {
                        const userPrefs = await db.getUserPreferences(match.userId);
                        if (!userPrefs || userPrefs.notify_static_field) { // Default to true if no preferences
                            usersToNotify.push(match);
                            allMatchedUsers.add(match.userId);
                        }
                    }
                }

                if (usersToNotify.length > 0) {
                    const mentions = [...new Set(usersToNotify.map(m => `<@${m.userId}>`))].join(" ");
                    
                    // Create a rich embed for the notification
                    const embedTitle = isOpenThread 
                        ? '🔔 ID Gefunden in neuem Thread'
                        : '🔔 ID Gefunden in bearbeitetem Thread';
                    
                    const embed = new EmbedBuilder()
                        .setColor('#FF1493') // Deep pink color
                        .setTitle(embedTitle)
                        .addFields(
                            { name: 'Title', value: threadTitle || 'Unknown', inline: false },
                            { name: 'Author & Time', value: `${threadAuthor || 'Unknown'} • ${threadTime || 'Unknown'}`, inline: false },
                            { name: 'Link', value: `[Click here to view thread](${url})`, inline: false }
                        )
                        .setTimestamp();
                    
                    // Send to channel with mention
                    const discordChannel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
                    if (discordChannel?.isTextBased()) {
                        await discordChannel.send({ content: mentions, embeds: [embed] });
                    }
                    
                    // Send to each user as DM
                    for (const match of usersToNotify) {
                        try {
                            const user = await client.users.fetch(match.userId);
                            const userEmbed = new EmbedBuilder(embed);
                            const userDescription = isOpenThread
                                ? `@${user.username} - Deine ID wurde in einem neuen Thread gefunden!`
                                : `@${user.username} - Deine ID wurde in einem bearbeiteten Thread gefunden!`;
                            userEmbed.setDescription(userDescription);
                            await user.send({ embeds: [userEmbed] });
                        } catch (err) {
                            console.error(`❌ Fehler beim Senden der DM an ${match.userId} für ${url}: ${err.message}`);
                        }
                        
                        // Send to Telegram if the user has linked their account
                        const telegramMessageType = isOpenThread ? 'neuen' : 'bearbeiteten';
                        const telegramMessage = `💬 Deine ID wurde in einem ${telegramMessageType} Thread gefunden!\n📝 Titel: ${threadTitle}\n👤 Autor: ${threadAuthor}\n⏰ Zeit: ${threadTime}\n🎯 Deine Static ID(s): ${match.id}\n🔗 Link: ${url}`;
                        await sendTelegramDM(match.userId, telegramMessage);
                    }
                }
            }
        } catch (e) {
            await logToConsole(`ℹ️ Hinweis oder Fehler bei de_endsid für ${url} (Selector nicht gefunden oder Timeout): ${e.message}`);
        }

        // --- Check for IDs in de_moystatic field (for edited complaints) ---
        if (!url.endsWith("/")) { // Only check this field if URL indicates an edited/closed thread
            try {
                await page.waitForSelector('dl[data-field="de_moystatic"] dd', { timeout: 15000 });
                const contentMoystatic = await page.evaluate(() =>
                    Array.from(document.querySelectorAll('dl[data-field="de_moystatic"] dd'))
                        .map(el => el.textContent.trim())
                );

                const matchedInMoystatic = ids.filter(idObj =>
                    contentMoystatic.some(txt => new RegExp(`(?<!\\d)${idObj.id}(?!\\d)`).test(txt))
                );

                if (matchedInMoystatic.length > 0) {
                    // Get thread details for embed
                    const threadTitle = await page.evaluate(() => {
                        const titleElement = document.querySelector('.p-title-value');
                        return titleElement ? titleElement.textContent.trim() : 'Beschwerde';
                    });
                    
                    const threadAuthor = await page.evaluate(() => {
                        const authorElement = document.querySelector('.p-description .username');
                        return authorElement ? authorElement.textContent.trim() : 'Unknown';
                    });
                    
                    const threadTime = new Date().toLocaleDateString('de-DE', {
                        day: 'numeric',
                        month: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    
                    // Filter users who want closed thread notifications AND haven't been notified yet
                    const usersToNotifyMoystatic = [];
                    for (const match of matchedInMoystatic) {
                        if (!allMatchedUsers.has(match.userId)) {
                            const userPrefs = await db.getUserPreferences(match.userId);
                            if (!userPrefs || userPrefs.notify_closed_threads) { // Default to true if no preferences
                                usersToNotifyMoystatic.push(match);
                                allMatchedUsers.add(match.userId);
                            }
                        }
                    }

                    if (usersToNotifyMoystatic.length > 0) {
                        const mentionsMoystatic = [...new Set(usersToNotifyMoystatic.map(m => `<@${m.userId}>`))].join(" ");
                        
                        // Create a rich embed for the edited complaint notification
                        const embed = new EmbedBuilder()
                            .setColor('#FF1493') // Deep pink color
                            .setTitle('🔔 Update zu deiner eingereichten Beschwerde')
                            .addFields(
                                { name: 'Title', value: threadTitle || 'Unknown', inline: false },
                                { name: 'Author & Time', value: `${threadAuthor || 'Unknown'} • ${threadTime || 'Unknown'}`, inline: false },
                                { name: 'Link', value: `[Click here to view thread](${url})`, inline: false }
                            )
                            .setTimestamp();
                        
                        // Send to channel with mention
                        const discordChannel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
                        if (discordChannel?.isTextBased()) {
                            await discordChannel.send({ content: mentionsMoystatic, embeds: [embed] });
                        }
                        await logToConsole(`ℹ️ Benachrichtigung für bearbeitete Beschwerde (Kanal) gesendet für: ${url}`);
                        
                        // Send to Telegram
                        const telegramBaseMessage = `💬 Update zu deiner eingereichten Beschwerde!\n📝 Titel: ${threadTitle}\n👤 Autor: ${threadAuthor}\n⏰ Zeit: ${threadTime}\n🔗 Link: ${url}`;
                        await sendTelegramMessage(telegramBaseMessage);

                        // Send DMs
                        for (const match of usersToNotifyMoystatic) {
                            try {
                                const user = await client.users.fetch(match.userId);
                                const userEmbed = new EmbedBuilder(embed);
                                userEmbed.setDescription(`@${user.username} - Update zu deiner eingereichten Beschwerde!`);
                                await user.send({ embeds: [userEmbed] });
                                await logToConsole(`ℹ️ DM für bearbeitete Beschwerde an ${match.userId} gesendet für: ${url}`);
                            } catch (err) {
                                console.error(`❌ Fehler beim Senden der DM (bearbeitet) an ${match.userId} für ${url}: ${err.message}`);
                            }
                            
                            // Send to Telegram if the user has linked their account
                            const telegramMessage = `${telegramBaseMessage}\n🎯 Deine Static ID(s): ${match.id}`;
                            await sendTelegramDM(match.userId, telegramMessage);
                        }
                    }
                }
            } catch (e) {
                await logToConsole(`ℹ️ Hinweis oder Fehler bei de_moystatic für ${url} (Selector nicht gefunden oder Timeout): ${e.message}`);
            }
        }

        // Return matches from de_endsid to keep logging consistent
        return matchedFromEndsId;

    } catch (err) {
        await logToConsole(`❌ Fehler bei Thread: ${url} – ${err.message}`);
        return [];
    }
}

async function checkThreadForIDsPL(page, url, ids) {
    scannedThreads++;
    saveStats(); 
    await logToConsole(`🔎 [PL] Prüfe Thread: ${url}`);
    try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (!res || res.status() !== 200) return [];

        const body = await page.evaluate(() => document.body.innerText);
        if (body.includes("keine Berechtigung") || body.includes("nicht gefunden")) return [];

        let matchedFromSidipl = [];
        let matchedFromStaticpl = [];
        let allMatches = new Map(); // Track all unique matches per user

        // --- Check for IDs in sidipl field (standard PL complaints) ---
        try {
            await page.waitForSelector('dl[data-field="sidipl"] dd', { timeout: 15000 });
            const contentSidipl = await page.evaluate(() =>
                Array.from(document.querySelectorAll('dl[data-field="sidipl"] dd'))
                    .map(el => el.textContent.trim())
            );
            matchedFromSidipl = ids.filter(idObj =>
                contentSidipl.some(txt => new RegExp(`(?<!\\d)${idObj.id}(?!\\d)`).test(txt))
            );

            // Add to allMatches map
            matchedFromSidipl.forEach(match => {
                if (!allMatches.has(match.userId)) {
                    allMatches.set(match.userId, {
                        userId: match.userId,
                        ids: [match.id],
                        fields: ['sidipl']
                    });
                } else {
                    const existing = allMatches.get(match.userId);
                    if (!existing.ids.includes(match.id)) existing.ids.push(match.id);
                    if (!existing.fields.includes('sidipl')) existing.fields.push('sidipl');
                }
            });

            if (matchedFromSidipl.length > 0) {
                const mentions = [...new Set(matchedFromSidipl.map(m => `<@${m.userId}>`))].join(" ");
                const isOpenThread = url.endsWith("/");
                
                // Get thread details for embed
                const threadTitle = await page.evaluate(() => {
                    const titleElement = document.querySelector('.p-title-value');
                    return titleElement ? titleElement.textContent.trim() : 'Skarga';
                });
                
                const threadAuthor = await page.evaluate(() => {
                    const authorElement = document.querySelector('.p-description .username');
                    return authorElement ? authorElement.textContent.trim() : 'Unknown';
                });
                
                const threadTime = new Date().toLocaleDateString('pl-PL', {
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                // Create a rich embed for the notification
                const embed = new EmbedBuilder()
                    .setColor('#FF1493') // Deep pink color
                    .setTitle('🔔 Znaleziono ID w wątku [PL]')
                    .addFields(
                        { name: 'Title', value: threadTitle || 'Unknown', inline: false },
                        { name: 'Author & Time', value: `${threadAuthor || 'Unknown'} • ${threadTime || 'Unknown'}`, inline: false },
                        { name: 'Link', value: `[Click here to view thread](${url})`, inline: false }
                    )
                    .setTimestamp();
                
                // Send to channel with mention
                const discordChannel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
                if (discordChannel?.isTextBased()) {
                    await discordChannel.send({ content: mentions, embeds: [embed] });
                }
            }
        } catch (e) {
            // This will catch timeouts or if the selector is not found after waiting
            await logToConsole(`ℹ️ [PL] Hinweis oder Fehler bei sidipl für ${url} (Selector nicht gefunden oder Timeout): ${e.message}`);
        }

        // --- Check for IDs in staticpl field (for edited PL complaints) ---
        if (!url.endsWith("/")) { // Only check this field if URL indicates an edited/closed thread
            try {
                await page.waitForSelector('dl[data-field="staticpl"] dd', { timeout: 15000 });
                const contentStaticpl = await page.evaluate(() =>
                    Array.from(document.querySelectorAll('dl[data-field="staticpl"] dd'))
                        .map(el => el.textContent.trim())
                );

                matchedFromStaticpl = ids.filter(idObj =>
                    contentStaticpl.some(txt => new RegExp(`(?<!\\d)${idObj.id}(?!\\d)`).test(txt))
                );

                // Add to allMatches map
                matchedFromStaticpl.forEach(match => {
                    if (!allMatches.has(match.userId)) {
                        allMatches.set(match.userId, {
                            userId: match.userId,
                            ids: [match.id],
                            fields: ['staticpl']
                        });
                    } else {
                        const existing = allMatches.get(match.userId);
                        if (!existing.ids.includes(match.id)) existing.ids.push(match.id);
                        if (!existing.fields.includes('staticpl')) existing.fields.push('staticpl');
                    }
                });

                if (matchedFromStaticpl.length > 0) {
                    const mentionsStaticpl = [...new Set(matchedFromStaticpl.map(m => `<@${m.userId}>`))].join(" ");
                    
                    // Get thread details for embed
                    const threadTitle = await page.evaluate(() => {
                        const titleElement = document.querySelector('.p-title-value');
                        return titleElement ? titleElement.textContent.trim() : 'Skarga';
                    });
                    
                    const threadAuthor = await page.evaluate(() => {
                        const authorElement = document.querySelector('.p-description .username');
                        return authorElement ? authorElement.textContent.trim() : 'Unknown';
                    });
                    
                    const threadTime = new Date().toLocaleDateString('pl-PL', {
                        day: 'numeric',
                        month: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    
                    // Create a rich embed for the edited complaint notification
                    const embed = new EmbedBuilder()
                        .setColor('#FF1493') // Deep pink color
                        .setTitle('🔔 Znaleziono ID w edytowanym wątku [PL]')
                        .addFields(
                            { name: 'Title', value: threadTitle || 'Unknown', inline: false },
                            { name: 'Author & Time', value: `${threadAuthor || 'Unknown'} • ${threadTime || 'Unknown'}`, inline: false },
                            { name: 'Link', value: `[Click here to view thread](${url})`, inline: false }
                        )
                        .setTimestamp();
                    
                    // Send to channel with mention
                    const discordChannel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
                    if (discordChannel?.isTextBased()) {
                        await discordChannel.send({ content: mentionsStaticpl, embeds: [embed] });
                    }
                    await logToConsole(`ℹ️ [PL] Benachrichtigung für bearbeitete Beschwerde (Kanal) gesendet für: ${url}`);
                    
                    // Send to Telegram
                    const telegramBaseMessage = `💬 Edytowana skarga! [PL]\n📝 Tytuł: ${threadTitle}\n👤 Autor: ${threadAuthor}\n⏰ Czas: ${threadTime}\n🔗 Link: ${url}`;
                    await sendTelegramMessage(telegramBaseMessage);
                }
            } catch (e) {
                // This will catch timeouts or if the selector is not found after waiting
                await logToConsole(`ℹ️ [PL] Hinweis oder Fehler bei staticpl für ${url} (Selector nicht gefunden oder Timeout): ${e.message}`);
            }
        }

        // --- Send consolidated DMs (only one per user per thread) ---
        if (allMatches.size > 0) {
            // Get thread details for DM embed
            const threadTitle = await page.evaluate(() => {
                const titleElement = document.querySelector('.p-title-value');
                return titleElement ? titleElement.textContent.trim() : 'Skarga';
            });
            
            const threadAuthor = await page.evaluate(() => {
                const authorElement = document.querySelector('.p-description .username');
                return authorElement ? authorElement.textContent.trim() : 'Unknown';
            });
            
            const threadTime = new Date().toLocaleDateString('pl-PL', {
                day: 'numeric',
                month: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            for (const [userId, matchData] of allMatches) {
                try {
                    // Check user preferences before sending notifications
                    const userPrefs = await db.getUserPreferences(userId);
                    
                    // Determine if user wants notifications based on field types
                    let shouldNotify = false;
                    if (matchData.fields.includes('sidipl')) {
                        // Static field notification
                        shouldNotify = !userPrefs || userPrefs.notify_static_field;
                    }
                    if (matchData.fields.includes('staticpl') && (!userPrefs || userPrefs.notify_closed_threads)) {
                        // Closed thread notification
                        shouldNotify = true;
                    }
                    
                    if (!shouldNotify) {
                        await logToConsole(`ℹ️ [PL] Skipping notification for ${userId} due to user preferences`);
                        continue;
                    }
                    
                    const user = await client.users.fetch(userId);
                    
                    // Create embed for DM
                    const embed = new EmbedBuilder()
                        .setColor('#FF1493')
                        .setTitle('🔔 Aktualizacja Twojej zgłoszonej skargi [PL]')
                        .addFields(
                            { name: 'Title', value: threadTitle || 'Unknown', inline: false },
                            { name: 'Author & Time', value: `${threadAuthor || 'Unknown'} • ${threadTime || 'Unknown'}`, inline: false },
                            { name: 'Twoje IDs', value: matchData.ids.join(', '), inline: false },
                            { name: 'Link', value: `[Click here to view thread](${url})`, inline: false }
                        )
                        .setTimestamp();
                    
                    await user.send({ embeds: [embed] });
                    await logToConsole(`ℹ️ [PL] Konsolidierte DM an ${userId} gesendet für: ${url}`);
                    
                    // Send to Telegram if the user has linked their account
                    const telegramMessage = `💬 Aktualizacja Twojej zgłoszonej skargi! [PL]\n📝 Tytuł: ${threadTitle}\n👤 Autor: ${threadAuthor}\n⏰ Czas: ${threadTime}\n🎯 Twoje Static ID(s): ${matchData.ids.join(', ')}\n🔗 Link: ${url}`;
                    await sendTelegramDM(userId, telegramMessage);
                } catch (err) {
                    console.error(`❌ Fehler beim Senden der konsolidierten PL DM an ${userId} für ${url}: ${err.message}`);
                }
            }
        }

        // The main loop uses the return value for its console logging.
        // We return matches from sidipl to keep that specific logging consistent.
        return matchedFromSidipl;
    } catch (err) {
        await logToConsole(`❌ Fehler bei [PL] Thread: ${url} – ${err.message}`);
        return [];
    }
}

async function getAdminComplaintThreads(page) {
    await logToConsole("🔍 Lade ADMIN-Beschwerde-Threads...");
    await page.goto("https://forum.gta5majestic.com/forums/beschwerden-uber-admins.90/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('a[href^="/threads/"]');

    let links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="/threads/"]'))
            .map(a => `https://forum.gta5majestic.com${a.getAttribute('href')}`)
    );
    links = [...new Set(links)].filter(l =>
        !l.endsWith("/latest")
    );

    await logToConsole(`✅ ADMIN-Threads gefunden: ${links.length}`);
    return links;
}

async function getAdminComplaintThreadsPL(page) {
    await logToConsole("🔍 Lade ADMIN-Beschwerde-Threads (PL)...");
    await page.goto("https://forum.gta5majestic.com/forums/skargi-na-administratorow.65/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('a[href^="/threads/"]');

    let links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href^="/threads/"]'))
            .map(a => `https://forum.gta5majestic.com${a.getAttribute('href')}`)
    );
    links = [...new Set(links)].filter(l =>
        !l.endsWith("/latest")
    );

    await logToConsole(`✅ ADMIN-Threads (PL) gefunden: ${links.length}`);
    return links;
}

async function checkThreadForAdminNames(page, url, adminNames) {
    scannedThreads++;
    saveStats(); // saveStats is already called inside checkThreadForAdminNames
    await logToConsole(`🔎 [ADMIN] Prüfe Thread: ${url}`);    try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (!res || res.status() !== 200) return [];

        const body = await page.evaluate(() => document.body.innerText);
        if (body.includes("keine Berechtigung") || body.includes("nicht gefunden")) return [];

        const selectorExists = await page.$('dl[data-field="de_adminname"] dd') !== null;
        if (!selectorExists) return [];

        try {
            await page.waitForSelector('dl[data-field="de_adminname"] dd', { timeout: 15000 });
            const content = await page.evaluate(() =>
                Array.from(document.querySelectorAll('dl[data-field="de_adminname"] dd'))
                    .map(el => el.textContent.trim())
            );

            const matched = adminNames.filter(admin =>
                content.some(txt => txt.toLowerCase() === admin.name.toLowerCase())
            );

            if (matched.length > 0) {
                const mentions = [...new Set(matched.map(m => `<@${m.userId}>`))].join(" ");
                const isOpenThread = url.endsWith("/");
                
                // Get thread details for embed
                const threadTitle = await page.evaluate(() => {
                    const titleElement = document.querySelector('.p-title-value');
                    return titleElement ? titleElement.textContent.trim() : 'Admin Beschwerde';
                });
                
                const threadAuthor = await page.evaluate(() => {
                    const authorElement = document.querySelector('.p-description .username');
                    return authorElement ? authorElement.textContent.trim() : 'Unknown';
                });
                
                const threadTime = new Date().toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                // Get the admin name that was mentioned
                const adminName = await page.evaluate(() => {
                    const adminElement = document.querySelector('dl[data-field="de_adminname"] dd');
                    return adminElement ? adminElement.textContent.trim() : 'Unknown';
                });
                
                // Create a rich embed for the notification
                const embed = new EmbedBuilder()
                    .setColor('#FF1493') // Deep pink color
                    .setTitle('🔔 Admin Erwähnung in Beschwerde!')
                    .addFields(
                        { name: 'Title', value: threadTitle || 'Unknown', inline: false },
                        { name: 'Author & Time', value: `${threadAuthor || 'Unknown'} • ${threadTime || 'Unknown'}`, inline: false },
                        { name: 'Link', value: `[Click here to view thread](${url})`, inline: false }
                    )
                    .setTimestamp();
                
                // Send to channel with mention
                const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
                if (channel?.isTextBased()) {
                    await channel.send({ content: mentions, embeds: [embed] });
                }
                
                // Send to each admin as DM
                for (const match of matched) {
                    try {
                        const user = await client.users.fetch(match.userId);
                        const userEmbed = new EmbedBuilder(embed);
                        userEmbed.setDescription(`@${user.username} - Dein Admin-Name wurde in einer Beschwerde erwähnt!`);
                        await user.send({ embeds: [userEmbed] });
                    } catch (err) {
                        console.error(`❌ Fehler beim Senden der Admin DM an ${match.userId} für ${url}: ${err.message}`);
                    }
                    
                    // Send to Telegram if the user has linked their account
                    const telegramMessage = `💬 Admin Erwähnung in Beschwerde!\n@${match.userId} - Dein Admin-Name wurde in einer Beschwerde erwähnt!\n📝 Titel: ${threadTitle}\n👤 Autor: ${threadAuthor}\n⏰ Zeit: ${threadTime}\n👮 Admin Name: ${adminName}\n🔗 Link: ${url}`;
                    await sendTelegramDM(match.userId, telegramMessage);
                }
            }
            return matched; // Return matches if processing was successful
        } catch (e) {
            // This will catch timeouts or if the selector is not found after waiting
            await logToConsole(`ℹ️ [ADMIN] Hinweis oder Fehler bei de_adminname für ${url} (Selector nicht gefunden oder Timeout): ${e.message}`);
            return []; // Return empty if there was an error processing this specific selector
        }

    } catch (err) {
        await logToConsole(`❌ Fehler bei [ADMIN] Thread: ${url} – ${err.message}`);
        return [];
    }
}

async function checkThreadForAdminNamesPL(page, url, adminNames) {
    scannedThreads++;
    saveStats();
    await logToConsole(`🔎 [ADMIN-PL] Prüfe Thread: ${url}`);
    try {
        const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (!res || res.status() !== 200) return [];

        const body = await page.evaluate(() => document.body.innerText);
        if (body.includes("keine Berechtigung") || body.includes("nicht gefunden")) return [];

        const selectorExists = await page.$('dl[data-field="imeadmpl"] dd') !== null;
        if (!selectorExists) return [];

        try {
            await page.waitForSelector('dl[data-field="imeadmpl"] dd', { timeout: 15000 });
            const content = await page.evaluate(() =>
                Array.from(document.querySelectorAll('dl[data-field="imeadmpl"] dd'))
                    .map(el => el.textContent.trim())
            );

            const matched = adminNames.filter(admin =>
                content.some(txt => txt.toLowerCase() === admin.name.toLowerCase())
            );

            if (matched.length > 0) {
                const mentions = [...new Set(matched.map(m => `<@${m.userId}>`))].join(" ");
                const isOpenThread = url.endsWith("/");
                
                // Get thread details for embed
                const threadTitle = await page.evaluate(() => {
                    const titleElement = document.querySelector('.p-title-value');
                    return titleElement ? titleElement.textContent.trim() : 'Admin Beschwerde (PL)';
                });
                
                const threadAuthor = await page.evaluate(() => {
                    const authorElement = document.querySelector('.p-description .username');
                    return authorElement ? authorElement.textContent.trim() : 'Unknown';
                });
                
                const threadTime = new Date().toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
                
                // Get the admin name that was mentioned
                const adminName = await page.evaluate(() => {
                    const adminElement = document.querySelector('dl[data-field="imeadmpl"] dd');
                    return adminElement ? adminElement.textContent.trim() : 'Unknown';
                });
                
                // Create a rich embed for the notification
                const embed = new EmbedBuilder()
                    .setColor('#FF1493') // Deep pink color
                    .setTitle('🔔 Admin Erwähnung in Beschwerde (PL)!')
                    .addFields(
                        { name: 'Title', value: threadTitle || 'Unknown', inline: false },
                        { name: 'Author & Time', value: `${threadAuthor || 'Unknown'} • ${threadTime || 'Unknown'}`, inline: false },
                        { name: 'Link', value: `[Click here to view thread](${url})`, inline: false }
                    )
                    .setTimestamp();
                
                // Send to channel with mention
                const channel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
                if (channel?.isTextBased()) {
                    await channel.send({ content: mentions, embeds: [embed] });
                }
                
                // Send to each admin as DM
                for (const match of matched) {
                    try {
                        const user = await client.users.fetch(match.userId);
                        const userEmbed = new EmbedBuilder(embed);
                        userEmbed.setDescription(`@${user.username} - Dein Admin-Name wurde in einer polnischen Beschwerde erwähnt!`);
                        await user.send({ embeds: [userEmbed] });
                    } catch (err) {
                        console.error(`❌ Fehler beim Senden der Admin DM (PL) an ${match.userId} für ${url}: ${err.message}`);
                    }
                    
                    // Send to Telegram if the user has linked their account
                    const telegramMessage = `💬 Admin Erwähnung in polnischer Beschwerde!\n@${match.userId} - Dein Admin-Name wurde in einer polnischen Beschwerde erwähnt!\n📝 Titel: ${threadTitle}\n👤 Autor: ${threadAuthor}\n⏰ Zeit: ${threadTime}\n👮 Admin Name: ${adminName}\n🔗 Link: ${url}`;
                    await sendTelegramDM(match.userId, telegramMessage);
                }
            }
            return matched;
        } catch (e) {
            await logToConsole(`ℹ️ [ADMIN-PL] Hinweis oder Fehler bei imeadmpl für ${url} (Selector nicht gefunden oder Timeout): ${e.message}`);
            return [];
        }

    } catch (err) {
        await logToConsole(`❌ Fehler bei [ADMIN-PL] Thread: ${url} – ${err.message}`);
        return [];
    }
}

setInterval(async () => {
    await logToConsole("🔁 Starte [ADMIN] Forumüberprüfung...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        const threads = await getAdminComplaintThreads(page);
        const admins = await loadAdminNamesFromFile();
        const log = await loadSentLog();

        for (const thread of threads) {
            if (await isThreadAlreadyProcessed(thread)) continue;

            const matched = await checkThreadForAdminNames(page, thread, admins);
            await saveSentLog(thread, null, null, null, 'admin'); // Save thread to log

            if (matched.length > 0) {
                const matchedAdminInfo = matched.map(m => `Admin: ${m.name} (User ID: ${m.userId})`).join(', ');
                await logToConsole(`✅ [ADMIN] Matched admin(s) in ${thread}: ${matchedAdminInfo}`);
                
                // Send notifications and log each admin match
                for (const match of matched) {
                    const user = await client.users.fetch(match.userId);
                    const message = `⚠️ **Admin-Beschwerde gefunden!**\n📍 **Thread:** ${thread}\n👮 **Admin:** ${match.name}`;
                    
                    try {
                        await user.send(message);
                        await saveSentLog(thread, null, match.userId, message, 'admin');
                        await logToConsole(`📨 Admin notification sent to ${user.tag} for ${match.name}`);
                    } catch (dmError) {
                        await logToConsole(`❌ Could not send DM to admin ${user.tag}: ${dmError.message}`);
                        await saveSentLog(thread, null, match.userId, `DM failed: ${dmError.message}`, 'admin');
                    }
                    
                    // Send to Telegram if the user has linked their account
                    try {
                        await sendTelegramDM(match.userId, message);
                    } catch (telegramError) {
                        await logToConsole(`⚠️ Telegram notification failed for admin ${user.tag}: ${telegramError.message}`);
                    }
                }
                
                await logToConsole(`📊 Stats: Uptime: ${formatUptime(process.uptime())}, Threads: ${formatThreadsInK(scannedThreads)}`);
            } else {
                // Log processed thread even if no matches (to avoid reprocessing)
                await saveSentLog(thread, null, null, null, 'admin');
            }
        }
    } catch (e) {
        await logToConsole("❌ [ADMIN] Allgemeiner Fehler: " + e.message);
    } finally {
        await browser.close();
    }
}, 180000); // Interval for admin complaints scan (3 minutes)

// === Polish Admin Complaints Scan ===
setInterval(async () => {
    await logToConsole("🔁 Starte [ADMIN-PL] Forumüberprüfung...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        const threads = await getAdminComplaintThreadsPL(page);
        const admins = await loadAdminNamesFromFile('pl');
        const log = await loadSentLog();

        for (const thread of threads) {
            if (await isThreadAlreadyProcessed(thread)) continue;

            const matched = await checkThreadForAdminNamesPL(page, thread, admins);
            await saveSentLog(thread, null, null, null, 'admin-pl'); // Save thread to log

            if (matched.length > 0) {
                const matchedAdminInfo = matched.map(m => `Admin: ${m.name} (User ID: ${m.userId})`).join(', ');
                await logToConsole(`✅ [ADMIN-PL] Matched admin(s) in ${thread}: ${matchedAdminInfo}`);
                
                // Send notifications and log each admin match
                for (const match of matched) {
                    const user = await client.users.fetch(match.userId);
                    const message = `⚠️ **Admin-Beschwerde gefunden (PL)!**\n📍 **Thread:** ${thread}\n👮 **Admin:** ${match.name}`;
                    
                    try {
                        await user.send(message);
                        await saveSentLog(thread, null, match.userId, message, 'admin-pl');
                        await logToConsole(`📨 Admin notification (PL) sent to ${user.tag} for ${match.name}`);
                    } catch (dmError) {
                        await logToConsole(`❌ Could not send DM to admin (PL) ${user.tag}: ${dmError.message}`);
                        await saveSentLog(thread, null, match.userId, `DM failed: ${dmError.message}`, 'admin-pl');
                    }
                    
                    // Send to Telegram if the user has linked their account
                    try {
                        await sendTelegramDM(match.userId, message);
                    } catch (telegramError) {
                        await logToConsole(`⚠️ Telegram notification failed for admin (PL) ${user.tag}: ${telegramError.message}`);
                    }
                }
                
                await logToConsole(`📊 Stats: Uptime: ${formatUptime(process.uptime())}, Threads: ${formatThreadsInK(scannedThreads)}`);
            } else {
                // Log processed thread even if no matches (to avoid reprocessing)
                await saveSentLog(thread, null, null, null, 'admin-pl');
            }
        }
    } catch (e) {
        await logToConsole("❌ [ADMIN-PL] Allgemeiner Fehler: " + e.message);
    } finally {
        await browser.close();
    }
}, 180000); // Interval for Polish admin complaints scan (3 minutes)

// === Automatische Forumüberprüfung ===
setInterval(async () => {
    await logToConsole("🔁 Starte Forumüberprüfung...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        const threads = await getThreads(page);
        const ids = await getIDsFromFile('de');

        for (const thread of threads) {
            if (await isThreadAlreadyProcessed(thread)) continue;

            const matched = await checkThreadForIDs(page, thread, ids);

            if (matched.length > 0) {
                const matchedInfo = matched.map(m => `ID: ${m.id} (User: ${m.userId})`).join(', ');
                await logToConsole(`✅ Match found in DE thread ${thread}: ${matchedInfo}`);
                
                // Log each match to sent_log (DMs are now handled inside checkThreadForIDs function)
                for (const match of matched) {
                    await saveSentLog(thread, match.id, match.userId, 'Notification sent via checkThreadForIDs', 'discord');
                }
                
                if (!thread.endsWith("/")) {
                    await logToConsole(`❗ Achtung: Der Link ${thread} endet nicht mit einem Slash – bitte manuell prüfen!`);
                }
                await logToConsole(`📊 Stats: Uptime: ${formatUptime(process.uptime())}, Threads: ${formatThreadsInK(scannedThreads)}`);
            } else {
                // Log processed thread even if no matches (to avoid reprocessing)
                await saveSentLog(thread, null, null, null, 'discord');
            }
        }
    } catch (e) {
        await logToConsole("❌ Allgemeiner Fehler: " + e.message);
    } finally {
        await browser.close();
    }
}, 180000); // Interval for German forum scan (3 minutes)

setInterval(async () => {
    await logToConsole("🔁 Starte [PL] Forumüberprüfung...");
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        const threads = await getThreadsPL(page);
        const ids = await getIDsFromFile('pl');

        for (const thread of threads) {
            if (await isThreadAlreadyProcessed(thread)) continue;

            const matched = await checkThreadForIDsPL(page, thread, ids);

            if (matched.length > 0) {
                const matchedInfo = matched.map(m => `ID: ${m.id} (User: ${m.userId})`).join(', ');
                await logToConsole(`✅ Match found in PL thread ${thread}: ${matchedInfo}`);
                
                // Log each match to sent_log (DMs are now handled inside checkThreadForIDsPL function)
                for (const match of matched) {
                    await saveSentLog(thread, match.id, match.userId, 'Notification sent via checkThreadForIDsPL', 'discord');
                }
                
                if (!thread.endsWith("/")) {
                    await logToConsole(`❗ Achtung: Der Link ${thread} endet nicht mit einem Slash – bitte manuell prüfen!`);
                }
                await logToConsole(`📊 Stats: Uptime: ${formatUptime(process.uptime())}, Threads: ${formatThreadsInK(scannedThreads)}`);
            } else {
                // Log processed thread even if no matches (to avoid reprocessing)
                await saveSentLog(thread, null, null, null, 'discord');
            }
        }
    } catch (e) {
        await logToConsole("❌ [PL] Allgemeiner Fehler: " + e.message);
    } finally {
        await browser.close();
    }
}, 180000); // Interval for Polish forum scan (3 minutes)

const ID_LIST_CHANNEL_ID = '1382139260655763610';
const ID_LIST_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds

async function sendIDListToChannel() {
    if (!client.isReady()) {
        await logToConsole("📋 ID List: Bot not ready, skipping.");
        return;
    }
    try {
        const channel = await client.channels.fetch(ID_LIST_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) {
            await logToConsole(`❌ ID List: Channel ${ID_LIST_CHANNEL_ID} not found or not text-based.`);
            return;
        }

        // Delete previous messages from the bot in this channel
        let fetchedMessages;
        do {
            fetchedMessages = await channel.messages.fetch({ limit: 100 });
            const botMessages = fetchedMessages.filter(msg => msg.author.id === client.user.id);
            if (botMessages.size > 0) {
                await channel.bulkDelete(botMessages, true).catch(err => { // true to ignore messages older than 2 weeks
                    logToConsole(`⚠️ ID List: Error during bulk delete (some messages might be too old): ${err.message}`);
                    // Fallback to deleting one by one if bulk delete fails for other reasons
                    for (const msg of botMessages.values()) {
                        msg.delete().catch(e => logToConsole(`⚠️ ID List: Error deleting single message ${msg.id}: ${e.message}`));
                    }
                });
                await logToConsole(`🗑️ ID List: Deleted ${botMessages.size} previous bot messages from channel ${ID_LIST_CHANNEL_ID}.`);
            }
        } while (fetchedMessages.size >= 100);

        const germanIDs = await getIDsFromFile('de');
        const polishIDs = await getIDsFromFile('pl');
        const currentDate = new Date().toLocaleDateString('de-DE', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Create main embed for the ID list
        const mainEmbed = new EmbedBuilder()
            .setColor('#4287f5')
            .setTitle('📋 Überwachte IDs Liste')
            .setDescription(`Aktualisiert am: ${currentDate}`)
            .setFooter({ text: `Insgesamt: ${germanIDs.length + polishIDs.length} IDs | ${germanIDs.length} DE | ${polishIDs.length} PL` })
            .setTimestamp();
        
        // Create German IDs embed
        const germanEmbed = new EmbedBuilder()
            .setColor('#000000') // Black for German flag colors
            .setTitle('🇩🇪 Deutsche IDs')
            .setTimestamp();
        
        // Format German IDs
        let germanIDsText = '';
        for (const entry of germanIDs) {
            let userName = entry.userId; // Default to ID if user cannot be fetched
            try {
                const user = await client.users.fetch(entry.userId);
                userName = user.tag || user.username; // user.tag for Username#XXXX, user.username for new system
                // Escape underscores to prevent Discord markdown formatting
                userName = userName.replace(/_/g, '\\_');
            } catch (fetchError) {
                await logToConsole(`⚠️ ID List: Konnte Discord Benutzer für ID ${entry.userId} nicht abrufen: ${fetchError.message}`);
            }
            germanIDsText += `**ID:** ${entry.id} - **Discord:** ${userName}\n`;
        }
        
        // Handle German IDs - Split into chunks if needed due to Discord's field value limit (1024 chars)
        if (germanIDsText.length <= 1024) {
            germanEmbed.addFields({ name: 'IDs', value: germanIDsText || 'Keine IDs gefunden', inline: false });
        } else {
            // Split into multiple fields if too long
            const chunks = splitTextIntoChunks(germanIDsText, 1024);
            for (let i = 0; i < chunks.length; i++) {
                germanEmbed.addFields({ name: i === 0 ? 'IDs' : `IDs (Fortsetzung ${i})`, value: chunks[i], inline: false });
            }
        }
        
        // Create Polish IDs embed
        const polishEmbed = new EmbedBuilder()
            .setColor('#dc143c') // Crimson for Polish flag colors
            .setTitle('🇵🇱 Polnische IDs')
            .setTimestamp();
        
        // Format Polish IDs
        let polishIDsText = '';
        for (const entry of polishIDs) {
            let userName = entry.userId; // Default to ID if user cannot be fetched
            try {
                const user = await client.users.fetch(entry.userId);
                userName = user.tag || user.username;
                // Escape underscores to prevent Discord markdown formatting
                userName = userName.replace(/_/g, '\\_');
            } catch (fetchError) {
                await logToConsole(`⚠️ ID List: Konnte Discord Benutzer für ID ${entry.userId} (PL) nicht abrufen: ${fetchError.message}`);
            }
            polishIDsText += `**ID:** ${entry.id} - **Discord:** ${userName}\n`;
        }
        
        // Handle Polish IDs - Split into chunks if needed
        if (polishIDsText.length <= 1024) {
            polishEmbed.addFields({ name: 'IDs', value: polishIDsText || 'Keine IDs gefunden', inline: false });
        } else {
            // Split into multiple fields if too long
            const chunks = splitTextIntoChunks(polishIDsText, 1024);
            for (let i = 0; i < chunks.length; i++) {
                polishEmbed.addFields({ name: i === 0 ? 'IDs' : `IDs (Fortsetzung ${i})`, value: chunks[i], inline: false });
            }
        }
        
        // Send embeds to channel
        await channel.send({ embeds: [mainEmbed, germanEmbed, polishEmbed] });
        await logToConsole(`✅ ID List: Successfully sent ID list to channel ${ID_LIST_CHANNEL_ID}.`);
    } catch (error) {
        await logToConsole(`❌ ID List: Fehler beim Senden der ID-Liste: ${error.message}\n${error.stack}`);
    }
}

// === Helper Functions ===
/**
 * Splits a text into chunks of specified maximum length, trying to break at newlines when possible
 * @param {string} text - The text to split
 * @param {number} maxLength - Maximum length of each chunk
 * @returns {string[]} Array of text chunks
 */
function splitTextIntoChunks(text, maxLength) {
    if (!text || text.length <= maxLength) return [text];
    
    const chunks = [];
    let currentChunk = "";
    const lines = text.split('\n');
    
    for (const line of lines) {
        // If adding this line would exceed the max length, push current chunk and start a new one
        if (currentChunk.length + line.length + 1 > maxLength) {
            // If the current chunk is not empty, push it
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = "";
            }
            
            // If the line itself is longer than maxLength, split it
            if (line.length > maxLength) {
                let remainingLine = line;
                while (remainingLine.length > 0) {
                    const chunk = remainingLine.substring(0, maxLength);
                    chunks.push(chunk);
                    remainingLine = remainingLine.substring(maxLength);
                }
            } else {
                currentChunk = line;
            }
        } else {
            // Add line to current chunk
            if (currentChunk) {
                currentChunk += '\n' + line;
            } else {
                currentChunk = line;
            }
        }
    }
    
    // Don't forget the last chunk
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

// === Bot Activity Update ===
async function updateBotActivity() {
    if (!client.user) return; // Bot not logged in yet
    // Calculate total uptime to display
    const currentSessionDisplayUptime = Math.floor((Date.now() - sessionStartTime) / 1000);
    const totalDisplayUptime = accumulatedUptime + currentSessionDisplayUptime;
    const uptimeString = formatUptime(totalDisplayUptime);
    const threads = formatThreadsInK(scannedThreads);
    const statusText = `Threads: ${threads} | Uptime: ${uptimeString}`;
    client.user.setActivity(statusText, { type: 0 }); // Type 0 is "Playing"
}

// === Start Bot ===
client.once('ready', async () => {
    console.log(`✅ Discord Bot als ${client.user?.tag || 'Unknown Tag'} eingeloggt!`);
    console.log("🚀 Forum-Scanner gestartet. Überprüfungen beginnen in Kürze...");
    
    // Initialize command handler
    commandHandler = new CommandHandler(db, client, getIDsFromFile, sendIDListToChannel, loadPendingRequests, savePendingRequests);
    
    // Update bot activity
    updateBotActivity();
    setInterval(updateBotActivity, 60000); // Update every minute

    // Start ID list update interval
    setInterval(sendIDListToChannel, ID_LIST_INTERVAL);
    sendIDListToChannel(); // Send immediately on startup

    // Register Slash Commands
    await commandHandler.registerCommands(client);
    
    // Create permanent control panel in the specified channel
    const CONTROL_PANEL_CHANNEL_ID = '1386309865508442212';
    try {
        await commandHandler.createPermanentControlPanel(CONTROL_PANEL_CHANNEL_ID);
        console.log(`✅ Permanent control panel created in channel ${CONTROL_PANEL_CHANNEL_ID}`);
    } catch (error) {
        console.error('❌ Error creating permanent control panel:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (commandHandler) {
        await commandHandler.handleInteraction(interaction);
    }
});

// Load Telegram bot token from file
function getTelegramTokenFromFile() {
    try {
        const token = fs.readFileSync(path.join(__dirname, 'telegram_token.txt'), 'utf8').trim();
        return token;
    } catch (err) {
        console.error("❌ Fehler beim Telegram-Token-Laden:", err);
        return null;
    }
}

// Load saved user mappings
async function loadUserMappings() {
    if (!dbInitialized) {
        userMappings = {};
        return;
    }
    try {
        userMappings = await db.getTelegramMappings();
        console.log(`✅ Loaded ${Object.keys(userMappings).length} Telegram user mappings`);
    } catch (err) {
        console.error("❌ Error loading Telegram user mappings:", err);
        userMappings = {};
    }
}

// Save user mappings to database
async function saveUserMappings() {
    if (!dbInitialized) return;
    try {
        // Save all current mappings to database
        for (const [discordUserId, telegramChatId] of Object.entries(userMappings)) {
            await db.addTelegramMapping(discordUserId, telegramChatId);
        }
    } catch (err) {
        console.error("❌ Error saving Telegram user mappings:", err);
    }
}

// Initialize Telegram bot
async function initTelegramBot() {
    const token = getTelegramTokenFromFile();
    if (!token) {
        console.log("⚠️ No Telegram token found. Telegram notifications will be disabled.");
        return false;
    }
    
    try {
        telegramBot = new Telegraf(token);
        
        // Handle /start command
        telegramBot.start((ctx) => {
            ctx.reply('Welcome to the Forum Notification Bot! Use /link <discord_user_id> to link your Discord account.');
        });

        // Handle /link command to associate Discord ID with Telegram chat
        telegramBot.command('link', (ctx) => {
            const chatId = ctx.chat.id;
            const text = ctx.message.text;
            const parts = text.split(' ');
            
            if (parts.length < 2) {
                return ctx.reply('Please provide your Discord user ID: /link <discord_user_id>');
            }
            
            const discordUserId = parts[1].trim();
            // Basic validation for Discord user ID format
            if (!/^\d{17,19}$/.test(discordUserId)) {
                return ctx.reply('Invalid Discord user ID format. It should be a number with 17-19 digits.');
            }
            
            userMappings[discordUserId] = chatId;
            saveUserMappings();
            ctx.reply(`✅ Successfully linked Discord ID ${discordUserId} with this Telegram chat. You will now receive notifications when your ID is mentioned in the forum.`);
            console.log(`✅ Linked Discord user ${discordUserId} with Telegram chat ${chatId}`);
        });

        // Handle /unlink command
        telegramBot.command('unlink', (ctx) => {
            const chatId = ctx.chat.id;
            let found = false;
            
            // Find and remove all Discord IDs linked to this chat
            Object.keys(userMappings).forEach(discordId => {
                if (userMappings[discordId] === chatId) {
                    delete userMappings[discordId];
                    found = true;
                }
            });
            
            if (found) {
                saveUserMappings();
                ctx.reply('You have been unlinked from all Discord accounts.');
                console.log(`✅ Unlinked Telegram chat: ${chatId}`);
            } else {
                ctx.reply('You are not currently linked to any Discord account.');
            }
        });

        // Launch the bot
        telegramBot.launch();
        console.log("✅ Telegram bot started successfully");
        
        // Load existing user mappings
        loadUserMappings();
        
        return true;
    } catch (err) {
        console.error("❌ Error initializing Telegram bot:", err);
        return false;
    }
}

// Send message to a specific Discord user via Telegram
async function sendTelegramDM(discordUserId, message) {
    if (!telegramBot) {
        console.log("⚠️ Telegram bot not initialized. Message not sent.");
        return;
    }

    // Check if this Discord user has a linked Telegram chat
    const chatId = userMappings[discordUserId];
    if (!chatId) {
        // No linked Telegram chat for this Discord user
        return;
    }

    // Clean up Discord mentions for Telegram
    const cleanMessage = message.replace(/<@(\d+)>/g, 'User ID: $1');

    try {
        await telegramBot.telegram.sendMessage(chatId, cleanMessage, { parse_mode: 'HTML' });
        console.log(`✅ Sent Telegram message to Discord user ${discordUserId} (Telegram chat: ${chatId})`);
    } catch (err) {
        console.error(`❌ Error sending Telegram message to ${chatId}:`, err);
        // If the error is because the user blocked the bot or chat not found, remove from mappings
        if (err.description && (err.description.includes('blocked') || err.description.includes('chat not found'))) {
            delete userMappings[discordUserId];
            saveUserMappings();
            console.log(`✅ Removed invalid mapping for Discord user: ${discordUserId}`);
        }
    }
}

async function main() {
    // Wait for database initialization
    await initializeDatabase();
    
    const token = getTokenFromFile();
    if (token) {
        await loadStats();
        client.login(token).catch(err => {
                console.error("❌ Fehler beim Discord Login:", err.message);
                console.log("⚠️ Forum-Scanner startet ohne Discord-Funktionen, falls möglich, oder bricht ab.");
            });
    } else {
        console.error("❌ Kein Discord Token gefunden – Forum-Scanner startet ohne Discord-Benachrichtigungen.");
        await loadStats(); // Load stats even if Discord fails, so scanner core can run
        console.log("🚀 Forum-Scanner (ohne Discord) gestartet. Überprüfungen beginnen in Kürze...");
    }

    // Initialize Telegram bot after database is ready
    const telegramInitialized = await initTelegramBot();
    if (telegramInitialized) {
        console.log("✅ Telegram integration initialized successfully");
    } else {
        console.log("⚠️ Telegram integration not available");
    }

    // Graceful shutdown: Save stats before exiting
    process.on('SIGINT', async () => {
        console.log("💤 Bot wird heruntergefahren, speichere Statistiken...");
        await saveStats(); // Save current session uptime before exiting
        if (telegramBot) {
            await telegramBot.stop('SIGINT');
        }
        db.close();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log("💤 Bot wird terminiert, speichere Statistiken...");
        await saveStats(); // Save current session uptime before exiting
        if (telegramBot) {
            await telegramBot.stop('SIGTERM');
        }
        db.close();
        process.exit(0);
    });
}

main().catch(console.error);
