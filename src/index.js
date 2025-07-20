require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, WebhookClient, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');

// --- CARGA DE MODELOS ---
const Team = require('./models/team.js');
const League = require('./models/league.js');
const VPGUser = require('./models/user.js');
const TeamChatChannel = require('./models/teamChatChannel.js');

mongoose.connect(process.env.DATABASE_URL).then(() => console.log('Conectado a MongoDB.')).catch(err => console.error('Error MongoDB:', err));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- CARGA DE COMANDOS ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) { client.commands.set(command.data.name, command); }
}

client.once(Events.ClientReady, () => {
    console.log(`¡Listo! ${client.user.tag} está online.`);
});

// --- LÓGICA DE CHAT AUTOMÁTICO POR CANAL ---
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.inGuild()) return;
    const activeChannel = await TeamChatChannel.findOne({ channelId: message.channel.id, guildId: message.guildId });
    if (!activeChannel) return;
    const team = await Team.findOne({ guildId: message.guildId, $or: [{ managerId: message.member.id }, { captains: message.member.id }, { players: message.member.id }] });
    if (!team) return;
    try {
        await message.delete();
        const webhooks = await message.channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.owner.id === client.user.id && wh.name.startsWith('VPG Bot'));
        if (!webhook) { webhook = await message.channel.createWebhook({ name: `VPG Bot - Chat`, avatar: client.user.displayAvatarURL() }); }
        await webhook.send({ content: message.content, username: message.member.displayName, avatarURL: team.logoUrl, allowedMentions: { parse: ['users', 'roles', 'everyone'] } });
    } catch (error) {
        if (error.code !== 10008) console.error(`Error en chat de equipo:`, error.message);
    }
});


// =========================================================================================
// === GESTIÓN DE INTERACCIONES (CON NUEVA LÓGICA DE GESTIÓN) ===
// =========================================================================================
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (!interaction.inGuild()) return;

        // --- AUTOCOMPLETADO ---
        if (interaction.isAutocomplete()) {
            const commandName = interaction.commandName;
            const focusedOption = interaction.options.getFocused(true);

            if (commandName === 'admin-gestionar-equipo' && focusedOption.name === 'equipo') {
                const teams = await Team.find({ guildId: interaction.guildId, name: { $regex: focusedOption.value, $options: 'i' } }).limit(25);
                await interaction.respond(
                    teams.map(team => ({ name: `${team.name} (${team.abbreviation})`, value: team._id.toString() })),
                );
            }
            return;
        }

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            // --- EJECUCIÓN DEL COMANDO DE GESTIÓN DE ADMIN ---
            if (interaction.commandName === 'admin-gestionar-equipo') {
                const teamId = interaction.options.getString('equipo');
                const team = await Team.findById(teamId);

                if (!team) {
                    return interaction.reply({ content: 'No se ha encontrado un equipo con ese ID. Por favor, selecciónalo de la lista.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`Panel de Gestión: ${team.name}`)
                    .setDescription('Selecciona una acción para administrar este equipo.')
                    .setThumbnail(team.logoUrl)
                    .setColor('#e74c3c');

                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`admin_change_name_${teamId}`).setLabel('Cambiar Nombre').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`admin_change_logo_${teamId}`).setLabel('Cambiar Logo').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`admin_expel_manager_${teamId}`).setLabel('Expulsar Mánager').setStyle(ButtonStyle.Danger).setDisabled(!team.managerId)
                );
                
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`admin_assign_manager_${teamId}`).setLabel('Asignar Mánager').setStyle(ButtonStyle.Success).setDisabled(!!team.managerId),
                    new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Secondary)
                );

                await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });

            } else {
                 await command.execute(interaction);
            }
            return;
        }
        
        if (interaction.isButton()) {
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            
            // --- GESTIÓN DE LIGAS (ADMIN) ---
            if (interaction.customId === 'admin_create_league_button') {
                if (!isAdmin) return interaction.reply({ content: 'Solo los administradores pueden usar este botón.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('create_league_modal').setTitle('Crear Nueva Liga');
                const leagueNameInput = new TextInputBuilder().setCustomId('leagueNameInput').setLabel("Nombre de la nueva liga").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(leagueNameInput));
                await interaction.showModal(modal);
            }
            else if (interaction.customId === 'admin_delete_league_button') {
                if (!isAdmin) return interaction.reply({ content: 'Solo los administradores pueden usar este botón.', ephemeral: true });
                const leagues = await League.find({ guildId: interaction.guildId });
                if (leagues.length === 0) return interaction.reply({ content: 'No hay ligas para borrar.', ephemeral: true });
                const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('delete_league_select_menu').setPlaceholder('Selecciona las ligas a eliminar').addOptions(leagueOptions).setMinValues(1).setMaxValues(leagueOptions.length);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                await interaction.reply({ content: 'Selecciona del menú las ligas que quieres borrar permanentemente:', components: [row], ephemeral: true });
            }

            // --- PANEL DE USUARIO PÚBLICO ---
            else if (interaction.customId === 'view_teams_button') {
                const teams = await Team.find({ guildId: interaction.guildId }).limit(25);
                if (teams.length === 0) return interaction.reply({ content: 'No hay equipos registrados en este servidor.', ephemeral: true });
                const teamOptions = teams.map(t => ({ label: t.name, description: `Liga: ${t.league}`, value: t._id.toString() }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('view_team_roster_select').setPlaceholder('Selecciona un equipo para ver su plantilla').addOptions(teamOptions);
                await interaction.reply({ content: 'Elige un equipo del menú desplegable:', components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            }
            else if (interaction.customId === 'request_manager_role_button') {
                const existingTeam = await Team.findOne({ managerId: interaction.user.id, guildId: interaction.guildId });
                if (existingTeam) return interaction.reply({ content: `Ya eres el Mánager del equipo **${existingTeam.name}**.`, ephemeral: true });
                const leagues = await League.find({ guildId: interaction.guildId });
                if (leagues.length === 0) return interaction.reply({ content: 'No hay ligas registradas. Contacta a un administrador.', ephemeral: true });
                const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
                const modal = new ModalBuilder().setCustomId('manager_request_modal').setTitle('Formulario de Solicitud de Mánager');
                const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura del equipo (3-4 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(4);
                const leagueSelect = new StringSelectMenuBuilder().setCustomId('leagueSelect').setPlaceholder('Selecciona la liga').addOptions(leagueOptions);
                modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput), new ActionRowBuilder().addComponents(leagueSelect));
                await interaction.showModal(modal);
            }
            else if (interaction.customId === 'leave_team_button') {
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }, { players: interaction.user.id }] });
                if (!team) return interaction.reply({ content: 'No perteneces a ningún equipo.', ephemeral: true });
                if (team.managerId === interaction.user.id) return interaction.reply({ content: 'Los Mánagers no pueden abandonar su equipo.', ephemeral: true });
                team.players = team.players.filter(p => p !== interaction.user.id);
                team.captains = team.captains.filter(c => c !== interaction.user.id);
                await team.save();
                await interaction.member.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID]).catch(() => {});
                await interaction.reply({ content: `Has abandonado el equipo **${team.name}**.`, ephemeral: true });
                const manager = await client.users.fetch(team.managerId).catch(() => null);
                if (manager) await manager.send(`El jugador **${interaction.user.tag}** ha abandonado tu equipo.`);
            }
            
            // ... (resto de lógica de botones como accept_invite, etc.) ...
            else if (interaction.customId.startsWith('accept_invite_')) {
                const teamId = interaction.customId.split('_')[2];
                const team = await Team.findById(teamId);
                if (!team) return interaction.reply({ content: 'Este equipo ya no existe.', ephemeral: true });
                const existingTeamMembership = await Team.findOne({ guildId: interaction.guildId, $or: [{ players: interaction.user.id }, { captains: interaction.user.id }] });
                if (existingTeamMembership) {
                    existingTeamMembership.players = existingTeamMembership.players.filter(p => p !== interaction.user.id);
                    existingTeamMembership.captains = existingTeamMembership.captains.filter(c => c !== interaction.user.id);
                    await existingTeamMembership.save();
                }
                const modal = new ModalBuilder().setCustomId(`player_join_modal_${teamId}`).setTitle(`Únete a ${team.name}`);
                const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const positionSelect = new StringSelectMenuBuilder().setCustomId('positionSelect').setPlaceholder('Selecciona tu posición principal').addOptions([ { label: 'Portero (GK)', value: 'GK' }, { label: 'Defensa Central (DFC/CB)', value: 'DFC' }, { label: 'Carrilero (CARR/RB/LB)', value: 'CARR' }, { label: 'Medio Defensivo (MCD/CDM)', value: 'MCD' }, { label: 'Mediocentro (MC/CM)', value: 'MC' }, { label: 'Medio Ofensivo (MCO/CAM)', value: 'MCO' }, { label: 'Delantero Centro (DC/ST)', value: 'DC' } ]);
                modal.addComponents( new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(positionSelect) );
                await interaction.showModal(modal);
            }
        } 
        
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'delete_league_select_menu') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Acción no permitida.', ephemeral: true });
                const selectedLeagues = interaction.values;
                await League.deleteMany({ guildId: interaction.guildId, name: { $in: selectedLeagues } });
                await interaction.update({ content: `✅ Ligas eliminadas con éxito: **${selectedLeagues.join(', ')}**`, components: [] });
            }
            else if (interaction.customId === 'view_team_roster_select') {
                const teamId = interaction.values[0];
                const team = await Team.findById(teamId);
                if (!team) return interaction.update({ content: 'Este equipo ya no existe.', components: [] });

                const allMemberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
                const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } });
                const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));

                const positionOrder = ['GK', 'DFC', 'CARR', 'MCD', 'MC', 'MCO', 'DC', null];
                const sortedMemberIds = allMemberIds.sort((a, b) => {
                    const posA = memberMap.get(a)?.position;
                    const posB = memberMap.get(b)?.position;
                    return positionOrder.indexOf(posA) - positionOrder.indexOf(posB);
                });

                let managerString = "Sin Mánager";
                if(team.managerId) managerString = `<@${team.managerId}> (${memberMap.get(team.managerId)?.vpgUsername || 'N/A'})`;

                const getMemberString = (id) => `<@${id}> (${memberMap.get(id)?.vpgUsername || 'N/A'} - ${memberMap.get(id)?.position || 'N/A'})`;
                
                const captainsStrings = team.captains.map(getMemberString);
                const playersStrings = team.players.map(getMemberString);

                const embed = new EmbedBuilder()
                    .setTitle(`Plantilla de ${team.name} [${team.abbreviation}]`)
                    .setThumbnail(team.logoUrl)
                    .setColor('#3498db')
                    .addFields(
                        { name: '👑 Mánager', value: managerString },
                        { name: '🛡️ Capitanes', value: captainsStrings.length > 0 ? captainsStrings.join('\n') : 'Sin Capitanes' },
                        { name: '👥 Jugadores', value: playersStrings.length > 0 ? playersStrings.join('\n') : 'Sin Jugadores' }
                    )
                    .setFooter({ text: `Liga: ${team.league}`});
                
                await interaction.update({ content: '', embeds: [embed], components: [] });
            }
             // ... (resto de lógica de menús como roster_management_menu) ...
        } 
        
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'create_league_modal') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: 'Acción no permitida.', ephemeral: true });
                const leagueName = interaction.fields.getTextInputValue('leagueNameInput');
                const existing = await League.findOne({ name: leagueName, guildId: interaction.guildId });
                if (existing) return interaction.reply({ content: `La liga "${leagueName}" ya existe.`, ephemeral: true });
                const newLeague = new League({ name: leagueName, guildId: interaction.guildId });
                await newLeague.save();
                await interaction.reply({ content: `✅ Liga "${leagueName}" creada con éxito.`, ephemeral: true });
            }
             // ... (resto de lógica de modales como manager_request_modal, player_join_modal, etc.) ...
            else if (interaction.customId.startsWith('player_join_modal_')) {
                const teamId = interaction.customId.split('_')[2];
                const team = await Team.findById(teamId);
                if (!team) return interaction.reply({ content: 'Error: El equipo ya no existe.', ephemeral: true });

                const vpgUsername = interaction.fields.getTextInputValue('vpgUsername');
                const position = interaction.fields.getTextInputValue('positionSelect');
                
                await VPGUser.findOneAndUpdate(
                    { discordId: interaction.user.id },
                    { discordId: interaction.user.id, vpgUsername, position, teamName: team.name, isManager: false, lastUpdated: new Date() },
                    { upsert: true, new: true }
                );

                team.players.push(interaction.user.id);
                await team.save();

                await interaction.member.roles.add(process.env.PLAYER_ROLE_ID);
                await interaction.member.setNickname(interaction.user.username).catch(err => console.error(`Fallo al cambiar apodo de Jugador: ${err.message}`));
                
                await interaction.reply({ content: `¡Felicidades! Te has unido a **${team.name}** como ${position}.`, ephemeral: true });
                
                const manager = await client.users.fetch(team.managerId);
                await manager.send(`✅ **${interaction.user.username}** (Usuario VPG: ${vpgUsername}) ha aceptado tu invitación a **${team.name}** y jugará de ${position}.`);

                interaction.message.delete().catch(() => {});
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true }).catch(()=>{});
        } else {
            await interaction.reply({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true }).catch(()=>{});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
