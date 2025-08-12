const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// Load configuration
const configPath = path.join(__dirname, 'config.json');
let config = {};
try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
    console.warn('⚠️ config.json not found. Run `npm run setup` to create it.');
}

class CommandHandler {
    constructor(db, client, getIDsFromFile, sendIDListToChannel, loadPendingRequests, savePendingRequests) {
        this.db = db;
        this.client = client;
        this.getIDsFromFile = getIDsFromFile;
        this.sendIDListToChannel = sendIDListToChannel;
        this.loadPendingRequests = loadPendingRequests;
        this.savePendingRequests = savePendingRequests;
        this.ADMIN_NOTIFICATION_CHANNEL_ID = config.adminNotificationChannelId || null;
    }

    // Command definitions
    getCommandDefinitions() {
        return [
            {
                name: 'addidde',
                description: 'Fügt eine neue ID zur deutschen Liste hinzu.',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    {
                        name: 'id',
                        type: 3, // STRING type for ID
                        description: 'Die Spieler-ID (z.B. 12345)',
                        required: true,
                    },
                    {
                        name: 'discordid',
                        type: 3, // STRING type for Discord User ID
                        description: 'Die Discord User ID des Spielers (z.B. 868492674322296833)',
                        required: true,
                    },
                ],
            },
            {
                name: 'addidpl',
                description: 'Fügt eine neue ID zur polnischen Liste hinzu.',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    {
                        name: 'id',
                        type: 3, // STRING
                        description: 'Die Spieler-ID (z.B. 12345)',
                        required: true,
                    },
                    {
                        name: 'discordid',
                        type: 3, // STRING
                        description: 'Die Discord User ID des Spielers (z.B. 868492674322296833)',
                        required: true,
                    },
                ],
            },
            {
                name: 'delid',
                description: 'Entfernt eine ID aus der deutschen Liste.',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    {
                        name: 'id',
                        type: 3, // STRING
                        description: 'Die zu entfernende Spieler-ID (z.B. 12345)',
                        required: true,
                    },
                ],
            },
            {
                name: 'delidpl',
                description: 'Entfernt eine ID aus der polnischen Liste.',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    {
                        name: 'id',
                        type: 3, // STRING
                        description: 'Die zu entfernende Spieler-ID (z.B. 12345)',
                        required: true,
                    },
                ],
            },
            {
                name: 'requestidde',
                description: 'Stellt eine Anfrage, um eine deutsche Spieler-ID überwachen zu lassen.',
                options: [
                    { name: 'playerid', type: 3, description: 'Deine Spieler-ID (z.B. 12345)', required: true },
                ],
            },
            {
                name: 'requestidpl',
                description: 'Stellt eine Anfrage, um eine polnische Spieler-ID überwachen zu lassen.',
                options: [
                    { name: 'playerid', type: 3, description: 'Deine Spieler-ID (z.B. 12345)', required: true },
                ],
            },
            {
                name: 'listrequests',
                description: 'Listet alle ausstehenden Anfragen zur ID-Überwachung auf.',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
            },
            {
                name: 'approverequest',
                description: 'Genehmigt eine Anfrage zur ID-Überwachung.',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    { name: 'requestid', type: 3, description: 'Die ID der Anfrage (aus /listrequests).', required: true },
                ],
            },
            {
                name: 'denyrequest',
                description: 'Lehnt eine Anfrage zur ID-Überwachung ab.',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    { name: 'requestid', type: 3, description: 'Die ID der Anfrage (aus /listrequests).', required: true },
                    { name: 'reason', type: 3, description: 'Grund für die Ablehnung (optional).', required: false },
                ],
            },
            {
                name: 'listids',
                description: 'Zeigt alle deine überwachten Spieler-IDs an.',
            },
            {
                name: 'controlpanel',
                description: 'Opens the user control panel with interactive options.',
            },
            {
                name: 'createpanel',
                description: 'Creates a permanent control panel in the current channel.',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
            },
            {
                name: 'deletethread',
                description: 'Lösche einen spezifischen Forum-Thread aus der Datenbank',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    {
                        name: 'url',
                        type: 3,
                        description: 'Die vollständige URL des Forum-Threads',
                        required: true,
                    },
                ],
            },
            // Admin management commands
            {
                name: 'addadminde',
                description: 'Füge einen Admin-Namen für deutsche Server hinzu',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    {
                        name: 'adminname',
                        type: 3,
                        description: 'Der Admin-Name',
                        required: true,
                    },
                    {
                        name: 'user',
                        type: 6,
                        description: 'Der Discord-Benutzer',
                        required: true,
                    },
                ],
            },
            {
                name: 'addadminpl',
                description: 'Füge einen Admin-Namen für polnische Server hinzu',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    {
                        name: 'adminname',
                        type: 3,
                        description: 'Der Admin-Name',
                        required: true,
                    },
                    {
                        name: 'user',
                        type: 6,
                        description: 'Der Discord-Benutzer',
                        required: true,
                    },
                ],
            },
            {
                name: 'deladminde',
                description: 'Entferne einen Admin-Namen für deutsche Server',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    {
                        name: 'adminname',
                        type: 3,
                        description: 'Der Admin-Name',
                        required: true,
                    },
                ],
            },
            {
                name: 'deladminpl',
                description: 'Entferne einen Admin-Namen für polnische Server',
                default_member_permissions: PermissionsBitField.Flags.ManageGuild.toString(),
                options: [
                    {
                        name: 'adminname',
                        type: 3,
                        description: 'Der Admin-Name',
                        required: true,
                    },
                ],
            },
        ];
    }

    // Command handlers
    async handleAddId(interaction) {
        // Defer the reply immediately to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        const { commandName, options } = interaction;
        const idToAdd = options.getString('id');
        const discordIdToAdd = options.getString('discordid');
        const type = commandName === 'addidde' ? 'de' : 'pl';

        try {
            // Check if this specific user already monitors this player ID
            const userAlreadyMonitors = await this.db.userMonitorsPlayerId(discordIdToAdd, idToAdd, type);
            
            if (userAlreadyMonitors) {
                return interaction.editReply({ content: `⚠️ Du überwachst die Spieler-ID ${idToAdd} bereits in der ${type} Liste.` });
            }

            const success = await this.db.addPlayerId(idToAdd, discordIdToAdd, type);
            
            if (!success) {
                return interaction.editReply({ content: `⚠️ Du überwachst die Spieler-ID ${idToAdd} bereits in der ${type} Liste.` });
            }
            
            // Update the public list
            await this.sendIDListToChannel();
            
            return interaction.editReply({ content: `✅ ID ${idToAdd} (Discord: ${discordIdToAdd}) wurde erfolgreich zur ${type} Liste hinzugefügt.` });
        } catch (err) {
            console.error(`❌ Fehler beim Hinzufügen der ID zur ${type} Liste:`, err);
            return interaction.editReply({ content: `❌ Es gab einen Fehler beim Hinzufügen der ID zur ${type} Liste.` });
        }
    }

    async handleDeleteId(interaction) {
        // Check permissions first before deferring
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung, diesen Befehl auszuführen.', ephemeral: true });
        }

        // Defer the reply to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        const playerId = interaction.options.getString('id');
        const type = interaction.commandName === 'delid' ? 'de' : 'pl';
        const typeName = type === 'de' ? 'deutschen' : 'polnischen';

        try {
            // First check if the ID exists and get details
            const playerDetails = await this.db.getPlayerIdDetails(playerId, type);
            
            if (!playerDetails) {
                return interaction.editReply({ 
                    content: `❌ Spieler-ID \`${playerId}\` wurde nicht in der ${typeName} Liste gefunden.`
                });
            }

            // Remove the ID
            const removed = await this.db.removePlayerId(playerId, type);
            
            if (removed) {
                await this.sendIDListToChannel(); // Update the public list
                
                // Try to notify the user whose ID was removed
                try {
                    const user = await this.client.users.fetch(playerDetails.discord_user_id);
                    await user.send(`📢 Deine Spieler-ID \`${playerId}\` wurde aus der ${typeName} Überwachungsliste entfernt.`);
                } catch (dmError) {
                    console.log(`Could not send DM to user ${playerDetails.discord_user_id}: ${dmError.message}`);
                }

                return interaction.editReply({ 
                    content: `✅ Spieler-ID \`${playerId}\` wurde erfolgreich aus der ${typeName} Liste entfernt. Der Benutzer <@${playerDetails.discord_user_id}> wurde benachrichtigt.`
                });
            } else {
                return interaction.editReply({ 
                    content: `❌ Fehler beim Entfernen der Spieler-ID \`${playerId}\` aus der ${typeName} Liste.`
                });
            }
        } catch (error) {
            console.error(`❌ Fehler beim Entfernen der ID ${playerId} aus ${type} Liste:`, error);
            return interaction.editReply({ 
                content: `❌ Es gab einen Fehler beim Entfernen der Spieler-ID \`${playerId}\`.`
            });
        }
    }

    async handleRequestId(interaction) {
        // Defer the reply immediately to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        const { commandName, options } = interaction;
        const playerId = options.getString('playerid');
        const discordUserId = interaction.user.id;
        const discordUserTag = interaction.user.tag;
        const type = commandName === 'requestidde' ? 'de' : 'pl';

        try {
            // Check if the player ID already exists in monitoring
            const idExists = await this.db.playerIdExists(playerId, type);
            if (idExists) {
                // Check if it's already monitored by this user
                const userIds = await this.db.getPlayerIdsByDiscordUser(discordUserId);
                const userHasThisId = userIds.some(entry => entry.player_id === playerId && entry.type === type);
                
                if (userHasThisId) {
                    return interaction.editReply({ content: `⚠️ Du überwachst bereits die Spieler-ID ${playerId} (${type}).` });
                } else {
                    return interaction.editReply({ content: `⚠️ Die Spieler-ID ${playerId} (${type}) wird bereits von einem anderen Benutzer überwacht. Admins können sie dir bei Bedarf manuell zuweisen.` });
                }
            }

            // Check if there's already a pending request
            const hasExistingRequest = await this.db.hasExistingRequest(playerId, discordUserId, type);
            if (hasExistingRequest) {
                return interaction.editReply({ content: `⚠️ Du hast bereits eine ausstehende Anfrage für die Spieler-ID ${playerId} (${type}).` });
            }

            // Create new request
            const requestId = uuidv4().substring(0, 8); // Short unique ID
            const requestData = {
                requestId,
                playerId,
                discordUserId,
                discordUserTag,
                type
            };
            
            await this.db.addPendingRequest(requestData);

            await interaction.editReply({ content: `✅ Deine Anfrage zur Überwachung der Spieler-ID ${playerId} (${type}) wurde mit der ID \`${requestId}\` eingereicht. Du wirst benachrichtigt, sobald sie bearbeitet wurde.` });

            // Notify admins
            try {
                const adminChannel = await this.client.channels.fetch(this.ADMIN_NOTIFICATION_CHANNEL_ID);
                if (adminChannel?.isTextBased()) {
                    await adminChannel.send(`🆕 **Neue ID-Überwachungsanfrage:**\nSpieler-ID: \`${playerId}\` (${type})\nAngefragt von: ${discordUserTag} (<@${discordUserId}>)\nRequest-ID: \`${requestId}\`\n\nGenehmigen: \`/approverequest requestid:${requestId}\`\nAblehnen: \`/denyrequest requestid:${requestId}\``);
                } else {
                    console.error("❌ Admin-Benachrichtigungskanal nicht gefunden oder kein Textkanal.");
                }
            } catch (err) {
                console.error("❌ Fehler beim Senden der Admin-Benachrichtigung:", err);
            }
        } catch (error) {
            console.error("❌ Fehler beim Verarbeiten der ID-Anfrage:", error);
            return interaction.editReply({ content: `❌ Es gab einen Fehler beim Verarbeiten deiner Anfrage.` });
        }
    }

    async handleListRequests(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung, diesen Befehl auszuführen.', ephemeral: true });
        }
        const pendingRequests = (await this.loadPendingRequests()).filter(req => req.status === 'pending');
        if (pendingRequests.length === 0) {
            return interaction.reply({ content: 'ℹ️ Es gibt keine ausstehenden Anfragen.', ephemeral: true });
        }
        let replyMessage = "**Ausstehende ID-Überwachungsanfragen:**\n";
        pendingRequests.forEach(req => {
            replyMessage += `\n**ID:** \`${req.requestId}\`\nSpieler-ID: \`${req.playerId}\` (${req.type})\nBenutzer: ${req.discordUserTag} (<@${req.discordUserId}>)\nDatum: ${new Date(req.timestamp).toLocaleString()}\n`;
        });
        return interaction.reply({ content: replyMessage.substring(0, 2000), ephemeral: true });
    }

    async handleApproveRequest(interaction) {
        // Check permissions first before deferring
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung, diesen Befehl auszuführen.', ephemeral: true });
        }

        // Defer the reply to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        const requestIdToApprove = interaction.options.getString('requestid');
        
        try {
            // Get the specific request from database
            const request = await this.db.getRequestById(requestIdToApprove);
            
            if (!request || request.status !== 'pending') {
                return interaction.editReply({ content: `❌ Anfrage mit ID \`${requestIdToApprove}\` nicht gefunden oder bereits bearbeitet.` });
            }

            const type = request.type.toLowerCase();
            
            // Check if ID already exists for this user
            const userIds = await this.db.getPlayerIdsByDiscordUser(request.discord_user_id);
            const userHasThisId = userIds.some(entry => entry.player_id === request.player_id && entry.type === type);

            if (userHasThisId) {
                // Mark as denied if already exists to clear queue
                await this.db.updateRequestStatus(requestIdToApprove, 'denied');
                return interaction.editReply({ content: `⚠️ Spieler-ID \`${request.player_id}\` wird bereits von <@${request.discord_user_id}> überwacht. Anfrage als erledigt markiert.` });
            }

            // Add the player ID and approve the request
            await this.db.addPlayerId(request.player_id, request.discord_user_id, type);
            await this.db.updateRequestStatus(requestIdToApprove, 'approved');
            await this.sendIDListToChannel(); // Update the public list

            await interaction.editReply({ content: `✅ Anfrage \`${request.request_id}\` genehmigt. Spieler-ID \`${request.player_id}\` wurde für ${request.discord_user_tag} hinzugefügt.` });
            
            // Notify the user
            try {
                const user = await this.client.users.fetch(request.discord_user_id);
                await user.send(`🎉 Deine Anfrage zur Überwachung der Spieler-ID \`${request.player_id}\` (${request.type}) wurde genehmigt!`);
            } catch (dmError) {
                console.error(`Could not send DM to user ${request.discord_user_id}:`, dmError);
            }
        } catch (err) {
            console.error(`❌ Fehler beim Genehmigen der Anfrage ${requestIdToApprove}:`, err);
            return interaction.editReply({ content: `❌ Es gab einen Fehler beim Genehmigen der Anfrage \`${requestIdToApprove}\`.` });
        }
    }

    async handleDenyRequest(interaction) {
        // Check permissions first before deferring
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung, diesen Befehl auszuführen.', ephemeral: true });
        }

        // Defer the reply to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        const requestIdToDeny = interaction.options.getString('requestid');
        const reason = interaction.options.getString('reason') || 'Kein Grund angegeben.';
        
        try {
            // Get the specific request from database
            const request = await this.db.getRequestById(requestIdToDeny);

            if (!request || request.status !== 'pending') {
                return interaction.editReply({ content: `❌ Anfrage mit ID \`${requestIdToDeny}\` nicht gefunden oder bereits bearbeitet.` });
            }

            await this.db.updateRequestStatusWithReason(requestIdToDeny, 'denied', reason);

            await interaction.editReply({ content: `✅ Anfrage \`${request.request_id}\` für ${request.discord_user_tag} wurde abgelehnt. Grund: ${reason}` });
            
            // Notify the user
            try {
                const user = await this.client.users.fetch(request.discord_user_id);
                await user.send(`🙁 Deine Anfrage zur Überwachung der Spieler-ID \`${request.player_id}\` (${request.type}) wurde leider abgelehnt. Grund: ${reason}`);
            } catch (dmError) {
                console.error(`Could not send DM to user ${request.discord_user_id}:`, dmError);
            }
        } catch (err) {
            console.error(`❌ Fehler beim Ablehnen der Anfrage ${requestIdToDeny}:`, err);
            return interaction.editReply({ content: `❌ Es gab einen Fehler beim Ablehnen der Anfrage \`${requestIdToDeny}\`.` });
        }
    }

    async handleListIds(interaction) {
        const userId = interaction.user.id;
        
        try {
            // Get user's IDs from database (returns all types)
            const allPlayerIds = await this.db.getPlayerIdsByDiscordUser(userId);
            
            // Filter by type
            const germanIds = allPlayerIds.filter(id => id.type === 'de');
            const polishIds = allPlayerIds.filter(id => id.type === 'pl');
            
            // Get user's admin names from both German and Polish lists
            const germanAdmins = await this.db.getAdminNames('de');
            const polishAdmins = await this.db.getAdminNames('pl');
            
            // Filter admin names for this user
            const userGermanAdmins = germanAdmins.filter(admin => admin.userId === userId);
            const userPolishAdmins = polishAdmins.filter(admin => admin.userId === userId);
            
            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📋 Deine überwachten IDs und Admin-Namen')
                .setTimestamp();
            
            // Add German IDs field
            if (germanIds.length > 0) {
                const germanIdList = germanIds.map(id => `• ${id.player_id}`).join('\n');
                embed.addFields({ name: '🇩🇪 Deutsche Spieler-IDs', value: germanIdList, inline: true });
            } else {
                embed.addFields({ name: '🇩🇪 Deutsche Spieler-IDs', value: 'Keine IDs gefunden', inline: true });
            }
            
            // Add Polish IDs field
            if (polishIds.length > 0) {
                const polishIdList = polishIds.map(id => `• ${id.player_id}`).join('\n');
                embed.addFields({ name: '🇵🇱 Polnische Spieler-IDs', value: polishIdList, inline: true });
            } else {
                embed.addFields({ name: '🇵🇱 Polnische Spieler-IDs', value: 'Keine IDs gefunden', inline: true });
            }
            
            // Add empty field for spacing
            embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
            
            // Add German admin names field
            if (userGermanAdmins.length > 0) {
                const germanAdminList = userGermanAdmins.map(admin => `• ${admin.name}`).join('\n');
                embed.addFields({ name: '👮 Deutsche Admin-Namen', value: germanAdminList, inline: true });
            } else {
                embed.addFields({ name: '👮 Deutsche Admin-Namen', value: 'Keine Admin-Namen gefunden', inline: true });
            }
            
            // Add Polish admin names field
            if (userPolishAdmins.length > 0) {
                const polishAdminList = userPolishAdmins.map(admin => `• ${admin.name}`).join('\n');
                embed.addFields({ name: '👮 Polnische Admin-Namen', value: polishAdminList, inline: true });
            } else {
                embed.addFields({ name: '👮 Polnische Admin-Namen', value: 'Keine Admin-Namen gefunden', inline: true });
            }
            
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            
        } catch (error) {
            console.error('❌ Error in handleListIds:', error);
            await interaction.reply({ 
                content: '❌ Es gab einen Fehler beim Abrufen deiner IDs und Admin-Namen.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }

    async handleControlPanel(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const discordUserId = interaction.user.id;
        
        try {
            // Get user preferences (create default if doesn't exist)
            let userPrefs = await this.db.getUserPreferences(discordUserId);
            if (!userPrefs) {
                await this.db.addUserPreferences(discordUserId, true, true);
                userPrefs = { notify_static_field: true, notify_closed_threads: true };
            }

            // Get user's current player IDs
            const playerIds = await this.db.getPlayerIdsByDiscordUser(discordUserId);
            const deCount = playerIds.filter(id => id.type === 'de').length;
            const plCount = playerIds.filter(id => id.type === 'pl').length;

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🎛️ User Control Panel')
                .setDescription('Manage your ID monitoring and notification settings')
                .addFields(
                    {
                        name: '📊 Your Monitored IDs',
                        value: `🇩🇪 German IDs: **${deCount}**\n🇵🇱 Polish IDs: **${plCount}**\n📋 Total: **${playerIds.length}**`,
                        inline: true
                    },
                    {
                        name: '🔔 Notification Settings',
                        value: `📍 Edited Field Pings: ${userPrefs.notify_static_field ? '✅ On' : '❌ Off'} - Get notified when complaints you uploaded are updated\n🔒 Closed Threads: ${userPrefs.notify_closed_threads ? '✅ On' : '❌ Off'} - Get notified even for closed forum threads`,
                        inline: true
                    }
                )
                .setColor(0x0099FF)
                .setTimestamp();

            // Create buttons
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('request_id_de')
                        .setLabel('🇩🇪 Request German ID')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('request_id_pl')
                        .setLabel('🇵🇱 Request Polish ID')
                        .setStyle(ButtonStyle.Primary)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggle_static_notifications')
                        .setLabel(`${userPrefs.notify_static_field ? '🔕' : '🔔'} Edited Field Pings`)
                        .setStyle(userPrefs.notify_static_field ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('toggle_closed_notifications')
                        .setLabel(`${userPrefs.notify_closed_threads ? '🔕' : '🔔'} Closed Threads`)
                        .setStyle(userPrefs.notify_closed_threads ? ButtonStyle.Success : ButtonStyle.Secondary)
                );

            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('view_my_ids')
                        .setLabel('📋 View My IDs')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('refresh_panel')
                        .setLabel('🔄 Refresh')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.editReply({
                embeds: [embed],
                components: [row1, row2, row3]
            });

        } catch (error) {
            console.error('❌ Error loading control panel:', error);
            await interaction.editReply({
                content: '❌ There was an error loading the control panel.'
            });
        }
    }

    async handleCreatePanel(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const channelId = interaction.channelId;
        await this.createPermanentControlPanel(channelId);
        await interaction.reply({ content: '✅ Permanent control panel created in this channel.', ephemeral: true });
    }

    // Handle button interactions
    async handleButtonInteraction(interaction) {
        if (!interaction.isButton()) return;

        const discordUserId = interaction.user.id;
        const customId = interaction.customId;

        try {
            switch (customId) {
                case 'request_id_de':
                    // Don't defer update for modal buttons - just handle the modal directly
                    await this.handleRequestIdButton(interaction, 'de');
                    break;
                case 'request_id_pl':
                    // Don't defer update for modal buttons - just handle the modal directly
                    await this.handleRequestIdButton(interaction, 'pl');
                    break;
                case 'toggle_static_notifications':
                    await interaction.deferUpdate();
                    await this.handleToggleNotifications(interaction, 'static');
                    break;
                case 'toggle_closed_notifications':
                    await interaction.deferUpdate();
                    await this.handleToggleNotifications(interaction, 'closed');
                    break;
                case 'view_my_ids':
                    await interaction.deferUpdate();
                    await this.handleViewMyIds(interaction);
                    break;
                case 'refresh_panel':
                    await interaction.deferUpdate();
                    // Check if this is from a permanent panel
                    const isPermanentPanel = interaction.channelId === '1386309865508442212';
                    if (isPermanentPanel) {
                        // For permanent panel, just send a follow-up message instead of refreshing
                        await interaction.followUp({
                            content: '🔄 Your personal settings are always up to date! Use "🎛️ Open Personal Panel" for a detailed view.',
                            ephemeral: true
                        });
                    } else {
                        // For personal panels, refresh the panel
                        await this.refreshControlPanel(interaction);
                        
                        await interaction.followUp({
                            content: '🔄 Your personal settings are always up to date! Use "🎛️ Open Personal Panel" for a detailed view.',
                            ephemeral: true
                        });
                    }
                    break;
                case 'open_control_panel':
                    // Don't defer update for this button - it opens a new panel
                    await this.handleOpenPersonalPanel(interaction);
                    break;
                default:
                    console.log(`Unknown button interaction: ${customId}`);
            }
        } catch (error) {
            console.error('❌ Error handling button interaction:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ There was an error handling your request.',
                    ephemeral: true
                });
            } else {
                await interaction.followUp({
                    content: '❌ There was an error handling your request.',
                    ephemeral: true
                });
            }
        }
    }

    async handleRequestIdButton(interaction, type) {
        const modal = {
            title: `${type === 'de' ? '🇩🇪 German' : '🇵🇱 Polish'} ID Request`,
            custom_id: `request_modal_${type}`,
            components: [
                {
                    type: 1,
                    components: [
                        {
                            type: 4,
                            custom_id: 'player_id_input',
                            label: 'Your Player ID',
                            style: 1,
                            placeholder: 'e.g. 12345',
                            required: true,
                            max_length: 20
                        }
                    ]
                }
            ]
        };

        await interaction.showModal(modal);
    }

    async handleToggleNotifications(interaction, type) {
        const discordUserId = interaction.user.id;
        
        // Get current preferences
        let userPrefs = await this.db.getUserPreferences(discordUserId);
        if (!userPrefs) {
            await this.db.addUserPreferences(discordUserId, true, true);
            userPrefs = { notify_static_field: true, notify_closed_threads: true };
        }

        // Toggle the appropriate setting
        if (type === 'static') {
            await this.db.updateUserPreferences(discordUserId, !userPrefs.notify_static_field, userPrefs.notify_closed_threads);
            userPrefs.notify_static_field = !userPrefs.notify_static_field;
        } else {
            await this.db.updateUserPreferences(discordUserId, userPrefs.notify_static_field, !userPrefs.notify_closed_threads);
            userPrefs.notify_closed_threads = !userPrefs.notify_closed_threads;
        }
        
        // Check if this is from a permanent panel (channel 1386309865508442212)
        const isPermanentPanel = interaction.channelId === '1386309865508442212';
        
        if (isPermanentPanel) {
            // For permanent panel, just send a follow-up message instead of refreshing
            const isEnabled = type === 'static' ? userPrefs.notify_static_field : userPrefs.notify_closed_threads;
            const status = isEnabled ? 'enabled' : 'disabled';
            const icon = isEnabled ? '✅' : '❌';
            
            await interaction.followUp({
                content: `${icon} ${type === 'static' ? 'Edited Field' : 'Closed Thread'} notifications have been ${status}.`,
                ephemeral: true
            });
        } else {
            // For personal panels, refresh the panel
            await this.refreshControlPanel(interaction);
            
            const isEnabled = type === 'static' ? userPrefs.notify_static_field : userPrefs.notify_closed_threads;
            const status = isEnabled ? 'enabled' : 'disabled';
            const icon = isEnabled ? '✅' : '❌';
            
            await interaction.followUp({
                content: `${icon} ${type === 'static' ? 'Edited Field' : 'Closed Thread'} notifications have been ${status}.`,
                ephemeral: true
            });
        }
    }

    async handleViewMyIds(interaction) {
        const discordUserId = interaction.user.id;
        const playerIds = await this.db.getPlayerIdsByDiscordUser(discordUserId);
        
        if (playerIds.length === 0) {
            return interaction.followUp({
                content: '📋 You are not currently monitoring any player IDs.',
                ephemeral: true
            });
        }
        
        const deIds = playerIds.filter(id => id.type === 'de');
        const plIds = playerIds.filter(id => id.type === 'pl');

        let response = '📋 **Your Monitored Player IDs:**\n\n';

        if (deIds.length > 0) {
            response += '🇩🇪 **German IDs:**\n';
            deIds.forEach(id => {
                const createdDate = new Date(id.created_at).toLocaleDateString('en-US');
                response += `• \`${id.player_id}\` (since ${createdDate})\n`;
            });
            response += '\n';
        }

        if (plIds.length > 0) {
            response += '🇵🇱 **Polish IDs:**\n';
            plIds.forEach(id => {
                const createdDate = new Date(id.created_at).toLocaleDateString('en-US');
                response += `• \`${id.player_id}\` (since ${createdDate})\n`;
            });
        }

        response += `\n**Total:** ${playerIds.length} monitored ID${playerIds.length !== 1 ? 's' : ''}`;

        await interaction.followUp({
            content: response,
            ephemeral: true
        });
    }

    async refreshControlPanel(interaction) {
        const discordUserId = interaction.user.id;
        
        // Get updated user preferences
        let userPrefs = await this.db.getUserPreferences(discordUserId);
        if (!userPrefs) {
            await this.db.addUserPreferences(discordUserId, true, true);
            userPrefs = { notify_static_field: true, notify_closed_threads: true };
        }

        // Get updated player IDs
        const playerIds = await this.db.getPlayerIdsByDiscordUser(discordUserId);
        const deCount = playerIds.filter(id => id.type === 'de').length;
        const plCount = playerIds.filter(id => id.type === 'pl').length;

        // Create updated embed
        const embed = new EmbedBuilder()
            .setTitle('🎛️ User Control Panel')
            .setDescription('Manage your ID monitoring and notification settings')
            .addFields(
                {
                    name: '📊 Your Monitored IDs',
                    value: `🇩🇪 German IDs: **${deCount}**\n🇵🇱 Polish IDs: **${plCount}**\n📋 Total: **${playerIds.length}**`,
                    inline: true
                },
                {
                    name: '🔔 Notification Settings',
                    value: `📍 Edited Field Pings: ${userPrefs.notify_static_field ? '✅ On' : '❌ Off'} - Get notified when complaints you uploaded are updated\n🔒 Closed Threads: ${userPrefs.notify_closed_threads ? '✅ On' : '❌ Off'} - Get notified even for closed forum threads`,
                    inline: true
                }
            )
            .setColor(0x0099FF)
            .setTimestamp();

        // Create updated buttons
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('request_id_de')
                    .setLabel('🇩🇪 Request German ID')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('request_id_pl')
                    .setLabel('🇵🇱 Request Polish ID')
                    .setStyle(ButtonStyle.Primary)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('toggle_static_notifications')
                    .setLabel(`${userPrefs.notify_static_field ? '🔕' : '🔔'} Edited Field Pings`)
                    .setStyle(userPrefs.notify_static_field ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('toggle_closed_notifications')
                    .setLabel(`${userPrefs.notify_closed_threads ? '🔕' : '🔔'} Closed Threads`)
                    .setStyle(userPrefs.notify_closed_threads ? ButtonStyle.Success : ButtonStyle.Secondary)
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('view_my_ids')
                    .setLabel('📋 View My IDs')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('refresh_panel')
                    .setLabel('🔄 Refresh')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.editReply({
            embeds: [embed],
            components: [row1, row2, row3]
        });
    }

    async createPermanentControlPanel(channelId) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) {
                console.error(`❌ Could not find channel with ID: ${channelId}`);
                return;
            }

            // Delete any existing permanent control panel messages from the bot
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const botMessages = messages.filter(msg => 
                    msg.author.id === this.client.user.id && 
                    msg.embeds.length > 0 && 
                    msg.embeds[0].title && 
                    msg.embeds[0].title.includes('Forum Bot Control Panel')
                );
                
                if (botMessages.size > 0) {
                    console.log(`🗑️ Deleting ${botMessages.size} existing control panel message(s)...`);
                    for (const message of botMessages.values()) {
                        await message.delete();
                    }
                    console.log(`✅ Deleted ${botMessages.size} old control panel message(s)`);
                }
            } catch (deleteError) {
                console.error("⚠️ Error deleting old control panel messages:", deleteError);
                // Continue with creating new panel even if deletion fails
            }

            // Create permanent embed
            const embed = new EmbedBuilder()
                .setTitle('🎛️ Forum Bot Control Panel')
                .setDescription('**Welcome to the Forum Bot Control Panel!**\n\nUse the buttons below to manage your player ID monitoring and notification settings.')
                .addFields(
                    {
                        name: '🆔 ID Monitoring',
                        value: '• Request monitoring for German or Polish player IDs\n• View all your currently monitored IDs\n• Get notified when your IDs appear in forum threads',
                        inline: false
                    },
                    {
                        name: '🔔 Notification Settings',
                        value: '• **Edited Field Pings**: Get notified when complaints you uploaded are closed.\n• **Closed Threads**: Get notified even for closed forum threads\n• Toggle these settings on/off as needed',
                        inline: false
                    },
                    {
                        name: '🚀 How to Use',
                        value: '1. Click **"🇩🇪 Request German ID"** or **"🇵🇱 Request Polish ID"** to add your player ID\n2. Use **"📋 View My IDs"** to see all your monitored IDs\n3. Toggle notification settings with the 🔔/🔕 buttons\n4. Click **"🔄 Refresh"** to update the panel',
                        inline: false
                    }
                )
                .setColor(0x00FF00)
                .setFooter({ text: 'All interactions are private - only you can see your responses!' })
                .setTimestamp();

            // Create permanent buttons
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('request_id_de')
                        .setLabel('🇩🇪 Request German ID')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('request_id_pl')
                        .setLabel('🇵🇱 Request Polish ID')
                        .setStyle(ButtonStyle.Primary)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('toggle_static_notifications')
                        .setLabel('🔔 Edited Field Pings')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('toggle_closed_notifications')
                        .setLabel('🔔 Closed Threads')
                        .setStyle(ButtonStyle.Secondary)
                );

            const row3 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('view_my_ids')
                        .setLabel('📋 View My IDs')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('open_control_panel')
                        .setLabel('🎛️ Open Personal Panel')
                        .setStyle(ButtonStyle.Success)
                );

            // Send the permanent message
            const message = await channel.send({
                embeds: [embed],
                components: [row1, row2, row3]
            });

            console.log(`✅ Permanent control panel created in channel ${channelId}: ${message.url}`);
            return message;

        } catch (error) {
            console.error('❌ Error creating permanent control panel:', error);
        }
    }

    async handleOpenPersonalPanel(interaction) {
        // This will open the same control panel as the /controlpanel command
        await this.handleControlPanel(interaction);
    }

    // Handle modal submissions for ID requests
    async handleModalSubmit(interaction) {
        if (!interaction.isModalSubmit()) return;

        const customId = interaction.customId;
        
        if (customId.startsWith('request_modal_')) {
            const type = customId.split('_')[2]; // 'de' or 'pl'
            const playerId = interaction.fields.getTextInputValue('player_id_input');
            
            // Create a mock interaction object for the existing handleRequestId method
            const mockInteraction = {
                ...interaction,
                commandName: type === 'de' ? 'requestidde' : 'requestidpl',
                options: {
                    getString: (name) => {
                        if (name === 'playerid') return playerId;
                        return null;
                    }
                },
                deferReply: async (options) => {
                    // For modal submissions, we need to defer the reply differently
                    if (!interaction.deferred && !interaction.replied) {
                        return await interaction.deferReply(options);
                    }
                    return Promise.resolve();
                },
                editReply: async (options) => {
                    // For modal submissions, we need to handle the reply differently
                    if (interaction.deferred) {
                        return await interaction.editReply(options);
                    } else if (!interaction.replied) {
                        return await interaction.reply(options);
                    } else {
                        return await interaction.followUp(options);
                    }
                }
            };

            await this.handleRequestId(mockInteraction);
        }
    }

    // Main command handler
    async handleInteraction(interaction) {
        // Handle slash commands
        if (interaction.isCommand()) {
            const { commandName } = interaction;

            switch (commandName) {
                case 'addidde':
                case 'addidpl':
                    await this.handleAddId(interaction);
                    break;
                case 'delid':
                case 'delidpl':
                    await this.handleDeleteId(interaction);
                    break;
                case 'requestidde':
                case 'requestidpl':
                    await this.handleRequestId(interaction);
                    break;
                case 'listrequests':
                    await this.handleListRequests(interaction);
                    break;
                case 'approverequest':
                    await this.handleApproveRequest(interaction);
                    break;
                case 'denyrequest':
                    await this.handleDenyRequest(interaction);
                    break;
                case 'listids':
                    await this.handleListIds(interaction);
                    break;
                case 'controlpanel':
                    await this.handleControlPanel(interaction);
                    break;
                case 'createpanel':
                    await this.handleCreatePanel(interaction);
                    break;
                case 'addadminde':
                    await this.handleAddAdmin(interaction, 'de');
                    break;
                case 'addadminpl':
                    await this.handleAddAdmin(interaction, 'pl');
                    break;
                case 'deladminde':
                    await this.handleDelAdmin(interaction, 'de');
                    break;
                case 'deladminpl':
                    await this.handleDelAdmin(interaction, 'pl');
                    break;
                case 'deletethread':
                    await this.handleDeleteThread(interaction);
                    break;
                default:
                    console.log(`Unknown command: ${commandName}`);
            }
        }
        // Handle button interactions
        else if (interaction.isButton()) {
            await this.handleButtonInteraction(interaction);
        }
        // Handle modal submissions
        else if (interaction.isModalSubmit()) {
            await this.handleModalSubmit(interaction);
        }
    }

    async handleAddAdmin(interaction, type) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung, diesen Befehl auszuführen.', ephemeral: true });
        }

        const adminName = interaction.options.getString('adminname');
        const user = interaction.options.getUser('user');

        try {
            await this.db.addAdminName(adminName, user.id, type);
            await interaction.reply({ content: `✅ Admin \`${adminName}\` für ${type} Server hinzugefügt.`, ephemeral: true });
        } catch (error) {
            console.error(`❌ Fehler beim Hinzufügen des Admins \`${adminName}\` für ${type} Server:`, error);
            await interaction.reply({ content: `❌ Es gab einen Fehler beim Hinzufügen des Admins \`${adminName}\` für ${type} Server.`, ephemeral: true });
        }
    }

    async handleDelAdmin(interaction, type) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung, diesen Befehl auszuführen.', ephemeral: true });
        }

        const adminName = interaction.options.getString('adminname');

        try {
            await this.db.removeAdminName(adminName, type);
            await interaction.reply({ content: `✅ Admin \`${adminName}\` für ${type} Server entfernt.`, ephemeral: true });
        } catch (error) {
            console.error(`❌ Fehler beim Entfernen des Admins \`${adminName}\` für ${type} Server:`, error);
            await interaction.reply({ content: `❌ Es gab einen Fehler beim Entfernen des Admins \`${adminName}\` für ${type} Server.`, ephemeral: true });
        }
    }

    async handleDeleteThread(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({ content: '❌ Du hast keine Berechtigung, diesen Befehl auszuführen.', ephemeral: true });
        }

        const url = interaction.options.getString('url');

        try {
            const deletedCount = await this.db.deleteThreadFromLog(url);
            if (deletedCount > 0) {
                await interaction.reply({ content: `✅ Thread \`${url}\` wurde aus der Datenbank gelöscht (${deletedCount} Einträge entfernt).`, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: `⚠️ Thread \`${url}\` wurde nicht in der Datenbank gefunden.`, flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            console.error(`❌ Fehler beim Löschen des Threads \`${url}\`:`, error);
            await interaction.reply({ content: `❌ Es gab einen Fehler beim Löschen des Threads \`${url}\`.`, flags: MessageFlags.Ephemeral });
        }
    }

    // Register commands
    async registerCommands(client) {
        const commands = this.getCommandDefinitions();
        
        try {
            await client.application.commands.set(commands);
            console.log("⚡ Slash Commands successfully registered.");
        } catch (error) {
            console.error("❌ Error registering slash commands:", error);
        }
    }

    async init() {
        await this.registerCommands(this.client);
    }
}

module.exports = CommandHandler;
