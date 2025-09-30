// src/handlers/buttonHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const VPGUser = require('../models/user.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');
const Ticket = require('../models/ticket.js');
const TicketConfig = require('../models/ticketConfig.js');
const PendingTeam = require('../models/pendingTeam.js');
const t = require('../utils/translator.js');

const POSITIONS = ['POR', 'DFC', 'CARR', 'MCD', 'MV', 'MCO', 'DC'];

// ===========================================================================
// =================== FUNCIONES DE UTILIDAD (NO CAMBIAN) ====================
// ===========================================================================

async function sendPaginatedPlayerMenu(interaction, members, page) {
    const member = interaction.member; // Necesario para obtener el idioma
    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(members.length / ITEMS_PER_PAGE);
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentMembers = members.slice(startIndex, endIndex);
    if (currentMembers.length === 0) { return interaction.editReply({ content: t('errorNoEligibleMembers', member), components: [] }); }
    
    const memberOptions = currentMembers.map(m => ({ label: m.user.username, description: m.nickname || m.user.id, value: m.id }));
    
    const placeholder = t('invitePlayerMenuPlaceholder', member)
        .replace('{currentPage}', page + 1)
        .replace('{totalPages}', totalPages);

    const selectMenu = new StringSelectMenuBuilder().setCustomId('invite_player_select').setPlaceholder(placeholder).addOptions(memberOptions);
    
    // Dejamos los botones de navegación sin traducir ya que son universales
    const navigationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paginate_invitePlayer_${page - 1}`).setLabel('◀️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`paginate_invitePlayer_${page + 1}`).setLabel('Siguiente ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
    );
    const components = [new ActionRowBuilder().addComponents(selectMenu)];
    if (totalPages > 1) { components.push(navigationRow); }
    await interaction.editReply({ content: t('invitePlayerMenuHeader', member), components });
}

async function sendPaginatedTeamMenu(interaction, teams, baseCustomId, paginationId, page, contentMessage) {
    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(teams.length / ITEMS_PER_PAGE);
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentTeams = teams.slice(startIndex, endIndex);
    if (currentTeams.length === 0) { return interaction.editReply({ content: 'No se encontraron equipos en esta página.', components: [] }); }
    const teamOptions = currentTeams.map(t => ({ label: `${t.name} (${t.abbreviation})`.substring(0, 100), value: t._id.toString() }));
    const selectMenu = new StringSelectMenuBuilder().setCustomId(baseCustomId).setPlaceholder(`Página ${page + 1} de ${totalPages} - Selecciona un equipo`).addOptions(teamOptions);
    const navigationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`paginate_${paginationId}_${page - 1}`).setLabel('◀️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`paginate_${paginationId}_${page + 1}`).setLabel('Siguiente ▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
    );
    const components = [new ActionRowBuilder().addComponents(selectMenu)];
    if (totalPages > 1) { components.push(navigationRow); }
    if (interaction.deferred || interaction.replied) { await interaction.editReply({ content: contentMessage, components }); }
    else { await interaction.reply({ content: contentMessage, components, flags: MessageFlags.Ephemeral }); }
}

async function updatePanelMessage(client, panelId) {
    try {
        const panel = await AvailabilityPanel.findById(panelId).populate('teamId').lean();
        if (!panel) return;
        const channel = await client.channels.fetch(panel.channelId);
        const webhook = await getOrCreateWebhook(channel, client);
        const hostTeam = panel.teamId;
        const hasConfirmedMatch = panel.timeSlots.some(s => s.status === 'CONFIRMED');
        const pendingCount = panel.timeSlots.reduce((acc, slot) => acc + (slot.pendingChallenges?.length || 0), 0);
        let panelTitle, panelColor;
        if (hasConfirmedMatch) { panelTitle = `Panel de Amistosos de ${hostTeam.name}`; panelColor = "Green"; }
        else if (pendingCount > 0) { panelTitle = `Buscando Rival - ${hostTeam.name} (${pendingCount} Petición(es))`; panelColor = "Orange"; }
        else { panelTitle = `Buscando Rival - ${hostTeam.name} (Disponible)`; panelColor = "Greyple"; }
        let description = `**Anfitrión:** ${hostTeam.name}\n**Contacto:** <@${panel.postedById}>`;
        if (panel.leagues && panel.leagues.length > 0) { description += `\n**Filtro de liga:** \`${panel.leagues.join(', ')}\``; }
        const embed = new EmbedBuilder().setTitle(panelTitle).setColor(panelColor).setDescription(description).setThumbnail(hostTeam.logoUrl);
        const components = [];
        let currentRow = new ActionRowBuilder();
        const timeSlots = panel.timeSlots.sort((a, b) => a.time.localeCompare(b.time));
        for (const slot of timeSlots) {
            if (slot.status === 'CONFIRMED') {
                const challengerTeam = await Team.findById(slot.challengerTeamId).lean();
                if (!challengerTeam) continue;
                const contactButton = new ButtonBuilder().setCustomId(`contact_opponent_${panel.teamId._id}_${challengerTeam._id}`).setLabel(`Contactar`).setStyle(ButtonStyle.Primary).setEmoji('💬');
                const abandonButton = new ButtonBuilder().setCustomId(`abandon_challenge_${panel._id}_${slot.time}`).setLabel('Abandonar').setStyle(ButtonStyle.Danger).setEmoji('❌');
                const matchInfoButton = new ButtonBuilder().setCustomId(`match_info_${slot.time}`).setLabel(`vs ${challengerTeam.name} (${slot.time})`).setStyle(ButtonStyle.Success).setDisabled(true);
                if (currentRow.components.length > 0) { components.push(currentRow); currentRow = new ActionRowBuilder(); }
                currentRow.addComponents(matchInfoButton, contactButton, abandonButton);
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
                continue;
            } else { 
                const label = slot.time === 'INSTANT' ? `⚔️ Desafiar Ahora` : `⚔️ Desafiar (${slot.time})`;
                const pendingText = slot.pendingChallenges.length > 0 ? ` (${slot.pendingChallenges.length} ⏳)` : '';
                const challengeButton = new ButtonBuilder().setCustomId(`challenge_slot_${panel._id}_${slot.time}`).setLabel(label + pendingText).setStyle(ButtonStyle.Success);
                if (currentRow.components.length >= 5) { components.push(currentRow); currentRow = new ActionRowBuilder(); }
                currentRow.addComponents(challengeButton);
            }
        }
        if (currentRow.components.length > 0) { components.push(currentRow); }
        if (pendingCount > 0) {
            const cancelRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cancel_all_challenges_${panel._id}`).setLabel('Cancelar Todas las Peticiones').setStyle(ButtonStyle.Danger));
            if (components.length < 5) { components.push(cancelRow); }
        }
        if (components.length > 5) { components.length = 5; }
        await webhook.editMessage(panel.messageId, { username: hostTeam.name, avatarURL: hostTeam.logoUrl, embeds: [embed], components });
    } catch (error) {
        if (error.code !== 10008) console.error("Error fatal al actualizar el panel de amistosos:", error);
    }
}

async function getOrCreateWebhook(channel, client) {
    const webhookName = 'VPG Bot Amistosos';
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.name === webhookName);
    if (!webhook) { webhook = await channel.createWebhook({ name: webhookName, avatar: client.user.displayAvatarURL() }); }
    return webhook;
}

async function sendApprovalRequest(interaction, client, { vpgUsername, teamName, teamAbbr, teamTwitter, leagueName, logoUrl }) {
    const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
    if (!approvalChannelId) return;
    const approvalChannel = await client.channels.fetch(approvalChannelId).catch(() => null);
    if (!approvalChannel) return;
    const safeLeagueName = leagueName.replace(/\s/g, '_');
    const embed = new EmbedBuilder().setTitle('📝 Nueva Solicitud de Registro').setColor('Orange').setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).setThumbnail(logoUrl && logoUrl.startsWith('http') ? logoUrl : null)
        .addFields(
            { name: 'Usuario VPG', value: vpgUsername }, { name: 'Nombre del Equipo', value: teamName }, { name: 'Abreviatura', value: teamAbbr },
            { name: 'Twitter del Equipo', value: teamTwitter || 'No especificado' }, { name: 'URL del Logo', value: `[Ver Logo](${logoUrl})` }, { name: 'Liga Seleccionada', value: leagueName }
        ).setTimestamp();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_request_${interaction.user.id}_${safeLeagueName}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_request_${interaction.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
    );
    await approvalChannel.send({ content: `**Solicitante:** <@${interaction.user.id}>`, embeds: [embed], components: [row] });
}


// ===========================================================================
// ========================== MANEJADOR PRINCIPAL ============================
// ===========================================================================

const handler = async (client, interaction) => {
    const { customId, user } = interaction;

    // ===========================================================================
    // =================== LÓGICA DE INTERACCIONES EN MD =========================
    // ===========================================================================
    if (!interaction.inGuild()) {
        await interaction.deferUpdate();
        const { message } = interaction;
        
        if (customId.startsWith('accept_challenge_') || customId.startsWith('reject_challenge_')) {
            const parts = customId.split('_');
            const action = parts[0]; 
            const panelId = parts[2];
            const time = parts[3];
            const challengeId = parts[4];
            
            const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
            if (!panel) return interaction.editReply({ content: 'Este panel de amistosos ya no existe.', components: [] });
            
            const slot = panel.timeSlots.find(s => s.time === time);
            if (!slot) {
                await message.edit({ content: 'Este horario de partido ya no existe en el panel.', components: [] });
                return interaction.followUp({ content: 'El horario ya no existe.', flags: MessageFlags.Ephemeral });
            }
            
            if (slot.status === 'CONFIRMED') {
                await message.edit({ content: '❌ Este desafío ha expirado porque ya se ha confirmado otro partido en este horario.', components: [] });
                return interaction.followUp({ content: '¡Demasiado tarde! Ya has aceptado otro desafío para este horario.', flags: MessageFlags.Ephemeral });
            }

            const challengeIndex = slot.pendingChallenges.findIndex(c => c._id.toString() === challengeId);
            if (challengeIndex === -1) {
                await message.edit({ content: 'Esta petición de desafío ya no es válida o ya fue gestionada.', components: [] });
                return interaction.followUp({ content: 'La petición ya no es válida.', flags: MessageFlags.Ephemeral });
            }

            const [acceptedChallenge] = slot.pendingChallenges.splice(challengeIndex, 1);
            const rejectedChallenges = slot.pendingChallenges;
            slot.pendingChallenges = [];

            if (action === 'accept') {
                slot.status = 'CONFIRMED';
                slot.challengerTeamId = acceptedChallenge.teamId;
                
                const winnerTeam = await Team.findById(acceptedChallenge.teamId);
                const winnerUser = await client.users.fetch(acceptedChallenge.userId);
                
                await winnerUser.send(`✅ ¡Enhorabuena! Tu desafío contra **${panel.teamId.name}** para las **${time}** ha sido **ACEPTADO**!`).catch(()=>{});
                await message.edit({ content: `✅ Has aceptado el desafío de **${winnerTeam.name}**. Se ha notificado a todos los equipos.`, components: [], embeds: [] });

                for (const loser of rejectedChallenges) {
                    const loserUser = await client.users.fetch(loser.userId).catch(() => null);
                    if (loserUser) await loserUser.send(`Lo sentimos, tu desafío contra **${panel.teamId.name}** para las **${time}** no pudo ser aceptado. El anfitrión ha elegido a otro rival.`).catch(()=>{});
                }

                const challengerPanel = await AvailabilityPanel.findOne({ teamId: winnerTeam._id, panelType: 'SCHEDULED' });
                if (challengerPanel) {
                    const challengerSlot = challengerPanel.timeSlots.find(s => s.time === time);
                    if (challengerSlot) {
                        challengerSlot.status = 'CONFIRMED';
                        challengerSlot.challengerTeamId = panel.teamId._id;
                        challengerSlot.pendingChallenges = [];
                        await challengerPanel.save();
                        await updatePanelMessage(client, challengerPanel._id);
                    }
                }

            } else { // REJECT
                 await message.edit({ content: `❌ Has rechazado el desafío.`, components: [], embeds: [] });
                 const rejectedUser = await client.users.fetch(acceptedChallenge.userId);
                 await rejectedUser.send(`Tu desafío contra **${panel.teamId.name}** para las **${time}** ha sido **RECHAZADO**.`).catch(()=>{});
            }

            await panel.save();
            await updatePanelMessage(client, panel._id);
        } else if (customId.startsWith('accept_application_') || customId.startsWith('reject_application_')) {
            const applicationId = customId.split('_')[2];
            const application = await PlayerApplication.findById(applicationId).populate('teamId');
            if(!application || application.status !== 'pending') return interaction.editReply({ content: 'Esta solicitud ya no es válida o ya ha sido gestionada.', components: [], embeds: [] });
            
            const applicantUser = await client.users.fetch(application.userId).catch(()=>null);
            if (customId.startsWith('accept_application_')) {
                application.status = 'accepted';
                if (applicantUser) {
                    const targetGuild = await client.guilds.fetch(application.teamId.guildId);
                    const applicantMember = await targetGuild.members.fetch(application.userId).catch(()=>null);
                    if (applicantMember) {
                        await applicantMember.roles.add(process.env.PLAYER_ROLE_ID);
                        await applicantMember.setNickname(`${application.teamId.abbreviation} ${applicantUser.username}`).catch(()=>{});
                        application.teamId.players.push(applicantUser.id);
                    }
                    await applicantUser.send(`¡Enhorabuena! Tu solicitud para unirte a **${application.teamId.name}** ha sido **aceptada**.`);
                }
                await interaction.editReply({ content: `Has aceptado a ${applicantUser ? applicantUser.tag : 'un usuario'} en tu equipo.`, components: [], embeds: [] });
            } else {
                application.status = 'rejected';
                if(applicantUser) await applicantUser.send(`Lo sentimos, tu solicitud para unirte a **${application.teamId.name}** ha sido **rechazada**.`);
                await interaction.editReply({ content: `Has rechazado la solicitud de ${applicantUser ? applicantUser.tag : 'un usuario'}.`, components: [], embeds: [] });
            }
            await application.teamId.save();
            await application.save();
        }
        else if (customId.startsWith('accept_invite_') || customId.startsWith('reject_invite_')) {
            const parts = customId.split('_');
            const action = parts[0];
            const teamId = parts[2];
            const playerId = parts[3];

            if (interaction.user.id !== playerId) {
                return interaction.followUp({ content: 'Esta invitación no es para ti.', flags: MessageFlags.Ephemeral });
            }

            const team = await Team.findById(teamId);
            if (!team) {
                return interaction.editReply({ content: 'Este equipo ya no existe.', components: [], embeds: [] });
            }

            const manager = await client.users.fetch(team.managerId).catch(() => null);

            if (action === 'accept') {
                const targetGuild = await client.guilds.fetch(team.guildId);
                const member = await targetGuild.members.fetch(playerId).catch(() => null);
                if (!member) {
                    return interaction.editReply({ content: 'Parece que ya no estás en el servidor del equipo.', components: [], embeds: [] });
                }

                const existingTeam = await Team.findOne({ guildId: team.guildId, $or: [{ managerId: playerId }, { captains: playerId }, { players: playerId }] });
                if (existingTeam) {
                    return interaction.editReply({ content: `❌ No puedes unirte. Ya perteneces al equipo **${existingTeam.name}**.`, components: [], embeds: [] });
                }
                
                team.players.push(playerId);
                await team.save();

                await member.roles.add(process.env.PLAYER_ROLE_ID);
                await member.setNickname(`${team.abbreviation} ${member.user.username}`).catch(()=>{});
                
                if (manager) await manager.send(`✅ ¡El jugador **${member.user.tag}** ha aceptado tu invitación y se ha unido a **${team.name}**!`);
                await interaction.editReply({ content: `¡Enhorabuena! Te has unido al equipo **${team.name}**.`, components: [], embeds: [] });

            } else { 
                if (manager) await manager.send(`❌ El jugador **${interaction.user.tag}** ha rechazado tu invitación para unirse a **${team.name}**.`);
                await interaction.editReply({ content: 'Has rechazado la invitación al equipo.', components: [], embeds: [] });
            }
        }
        return;
    }


    // ===========================================================================
    // =================== LÓGICA DE INTERACCIONES EN GUILD ======================
    // ===========================================================================
    const { member, guild } = interaction;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    if (customId === 'admin_create_team_button') {
    if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });

    const userSelectMenu = new UserSelectMenuBuilder()
        .setCustomId('admin_select_manager_for_creation')
        .setPlaceholder('Selecciona al futuro mánager del equipo')
        .setMinValues(1)
        .setMaxValues(1);

    await interaction.reply({
        content: '**Paso 1 de 3:** Selecciona al miembro del servidor que será el Mánager de este nuevo equipo.',
        components: [new ActionRowBuilder().addComponents(userSelectMenu)],
        flags: MessageFlags.Ephemeral
    });
    return;
}

if (customId.startsWith('admin_add_captains_') || customId.startsWith('admin_add_players_')) {
    if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });

    const isAddingCaptains = customId.startsWith('admin_add_captains_');
    const teamId = customId.substring(customId.lastIndexOf('_') + 1);
    
    const userSelectMenu = new UserSelectMenuBuilder()
        .setCustomId(`admin_select_members_${isAddingCaptains ? 'captains' : 'players'}_${teamId}`)
        .setPlaceholder(`Selecciona los ${isAddingCaptains ? 'capitanes' : 'jugadores'} a añadir`)
        .setMinValues(1)
        .setMaxValues(25);

    await interaction.reply({
        content: `Selecciona los **${isAddingCaptains ? 'capitanes' : 'jugadores'}** que quieres añadir al equipo desde el menú de abajo.`,
        components: [new ActionRowBuilder().addComponents(userSelectMenu)],
        flags: MessageFlags.Ephemeral
    });
    return;
}
if (customId.startsWith('admin_change_manager_')) {
    if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });
    
    const teamId = customId.split('_')[3];
    const team = await Team.findById(teamId);
    if (!team) return interaction.reply({ content: 'Equipo no encontrado.', flags: MessageFlags.Ephemeral });

    const userSelectMenu = new UserSelectMenuBuilder()
        .setCustomId(`admin_select_new_manager_${teamId}`)
        .setPlaceholder('Selecciona al miembro que será el nuevo mánager')
        .setMinValues(1)
        .setMaxValues(1);

    await interaction.reply({
        content: `Estás a punto de cambiar el mánager del equipo **${team.name}**. El mánager actual es <@${team.managerId}>.\n\nPor favor, selecciona al nuevo mánager en el menú de abajo.`,
        components: [new ActionRowBuilder().addComponents(userSelectMenu)],
        flags: MessageFlags.Ephemeral
    });
    return;
}
    if (customId.startsWith('admin_set_logo_custom_')) {
    const teamId = customId.split('_')[4];
    const modal = new ModalBuilder()
        .setCustomId(`admin_submit_logo_modal_${teamId}`)
        .setTitle('Añadir Logo Personalizado');
    const logoUrlInput = new TextInputBuilder().setCustomId('logoUrl').setLabel("URL de la imagen del logo").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://i.imgur.com/logo.png');
    modal.addComponents(new ActionRowBuilder().addComponents(logoUrlInput));
    await interaction.showModal(modal);
    return;
}

if (customId.startsWith('admin_continue_no_logo_')) {
    const teamId = customId.split('_')[4];
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`admin_add_captains_${teamId}`).setLabel('Añadir Capitanes').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`admin_add_players_${teamId}`).setLabel('Añadir Jugadores').setStyle(ButtonStyle.Success)
    );
    await interaction.update({
        content: `✅ Logo por defecto asignado. Ahora puedes añadir miembros a la plantilla.`,
        components: [row]
    });
    return;
}

    if (customId.startsWith('paginate_')) {
    await interaction.deferUpdate();
    const parts = customId.split('_');
    const paginationId = parts[1];
    const newPage = parseInt(parts[2], 10);

    // --- LÓGICA AÑADIDA PARA LA PAGINACIÓN DE JUGADORES ---
    if (paginationId === 'invitePlayer') {
        const allMembers = await guild.members.fetch();
        const teamsInServer = await Team.find({ guildId: guild.id }).select('managerId captains players').lean();
        const playersInTeams = new Set(teamsInServer.flatMap(t => [t.managerId, ...t.captains, ...t.players]));
        const eligibleMembers = allMembers.filter(m => !m.user.bot && !playersInTeams.has(m.id));
        const sortedMembers = Array.from(eligibleMembers.values()).sort((a, b) => a.user.username.localeCompare(b.user.username));
        await sendPaginatedPlayerMenu(interaction, sortedMembers, newPage);
    } 
    // --- FIN DE LA LÓGICA AÑADIDA ---
    else {
        let teams, baseCustomId, contentMessage;
        if (paginationId === 'view') {
            teams = await Team.find({ guildId: guild.id }).sort({ name: 1 }).lean();
            baseCustomId = 'view_team_roster_select';
            contentMessage = 'Elige un equipo para ver su plantilla:';
        } else if (paginationId === 'apply') {
            teams = await Team.find({ guildId: guild.id, recruitmentOpen: true }).sort({ name: 1 }).lean();
            baseCustomId = 'apply_to_team_select';
            contentMessage = 'Selecciona el equipo al que quieres aplicar:';
        } else if (paginationId === 'manage') {
            teams = await Team.find({ guildId: interaction.guildId }).sort({ name: 1 }).lean();
            baseCustomId = 'admin_select_team_to_manage';
            contentMessage = 'Selecciona el equipo que deseas gestionar:';
        }
        if (teams) {
            await sendPaginatedTeamMenu(interaction, teams, baseCustomId, paginationId, newPage, contentMessage);
        }
    }
    return;
}

    // ===========================================================================
    // =================== LÓGICA DE PANELES Y BOTONES ===========================
    // ===========================================================================
    
    // Panel de Solicitud General
    if (customId === 'start_player_registration') {
        const modal = new ModalBuilder()
            .setCustomId('player_registration_modal')
            .setTitle('Registro de Perfil de Jugador (1/2)');

        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsernameInput').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
        const twitterInput = new TextInputBuilder().setCustomId('twitterInput').setLabel("Tu Twitter (usuario sin @, opcional)").setStyle(TextInputStyle.Short).setRequired(false);
        const psnIdInput = new TextInputBuilder().setCustomId('psnIdInput').setLabel("Tu ID de PlayStation Network (PSN)").setStyle(TextInputStyle.Short).setRequired(false);
        const eaIdInput = new TextInputBuilder().setCustomId('eaIdInput').setLabel("Tu ID de EA Sports FC").setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(vpgUsernameInput),
            new ActionRowBuilder().addComponents(twitterInput),
            new ActionRowBuilder().addComponents(psnIdInput),
            new ActionRowBuilder().addComponents(eaIdInput)
        );
        return interaction.showModal(modal);
    }
    
    if (customId === 'manager_actions_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
        if (team) {
            // Ahora también traducimos el mensaje de error
            return interaction.editReply({ content: t('errorAlreadyManager', member) });
        }
        
        // Usamos la función 't' para obtener los textos en el idioma del usuario
        const subMenuEmbed = new EmbedBuilder()
            .setTitle(t('managerActionsTitle', member))
            .setDescription(t('managerActionsDescription', member))
            .setColor('Green');
            
        const subMenuRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('request_manager_role_button')
                .setLabel(t('registerTeamButton', member))
                .setStyle(ButtonStyle.Success)
        );
        
        return interaction.editReply({ embeds: [subMenuEmbed], components: [subMenuRow] });
    }

        if (customId === 'request_manager_role_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const existingTeam = await Team.findOne({ $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }], guildId: guild.id });
        if (existingTeam) {
            const errorMessage = t('errorAlreadyInTeam', member).replace('{teamName}', existingTeam.name);
            return interaction.editReply({ content: errorMessage });
        }
        
        const leagues = await League.find({ guildId: guild.id });
        if(leagues.length === 0) {
            return interaction.editReply({ content: t('errorNoLeaguesConfigured', member) });
        }
        
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_league_for_registration')
            .setPlaceholder(t('selectLeaguePlaceholder', member))
            .addOptions(leagueOptions);
        
        return interaction.editReply({ content: t('promptSelectLeagueStep1', member), components: [new ActionRowBuilder().addComponents(selectMenu)]});
    }

    if (customId.startsWith('ask_logo_yes_')) {
        const pendingTeamId = customId.split('_')[3];
        const modal = new ModalBuilder()
            .setCustomId(`final_logo_submit_${pendingTeamId}`)
            .setTitle(t('finalLogoModalTitle', member)); // Traducido
        const teamLogoUrlInput = new TextInputBuilder()
            .setCustomId('teamLogoUrlInput')
            .setLabel(t('logoUrlLabel', member)) // Traducido
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(t('logoUrlPlaceholder', member)); // Traducido
        modal.addComponents(new ActionRowBuilder().addComponents(teamLogoUrlInput));
        return interaction.showModal(modal);
    }
    
    if (customId.startsWith('ask_logo_no_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const pendingTeamId = customId.split('_')[3];

        const pendingTeam = await PendingTeam.findById(pendingTeamId);
        if (!pendingTeam || pendingTeam.userId !== user.id) {
            // Este es un mensaje de error interno, lo traduciremos más adelante si es necesario
            return interaction.editReply({ content: 'Esta solicitud ha expirado o no es tuya.', components: [] });
        }

        const defaultLogo = 'https://i.imgur.com/V4J2Fcf.png';
        await sendApprovalRequest(interaction, client, { ...pendingTeam.toObject(), logoUrl: defaultLogo });
        await PendingTeam.findByIdAndDelete(pendingTeamId);

        // Mensaje de confirmación traducido
        return interaction.editReply({ content: t('requestSentDefaultLogo', member), components: [] });
    }
    
    // ===========================================================================
    // =================== BLOQUE DE APROBACIÓN/RECHAZO CORREGIDO =================
    // ===========================================================================
    if (customId.startsWith('approve_request_')) {
        await interaction.deferUpdate();
        const esAprobador = member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!esAprobador) return interaction.followUp({ content: 'No tienes permisos para esta acción.', flags: MessageFlags.Ephemeral });

        const parts = customId.split('_');
        const applicantId = parts[2];
        const leagueName = parts.slice(3).join('_').replace(/_/g, ' '); 

        const originalEmbed = interaction.message.embeds[0];
        if (!originalEmbed) return interaction.followUp({ content: 'Error: No se pudo encontrar el embed de la solicitud original.', flags: MessageFlags.Ephemeral });
        
        const teamName = originalEmbed.fields.find(f => f.name === 'Nombre del Equipo').value;
        const teamAbbr = originalEmbed.fields.find(f => f.name === 'Abreviatura').value;
        const teamTwitter = originalEmbed.fields.find(f => f.name === 'Twitter del Equipo').value;
        const logoUrl = originalEmbed.thumbnail ? originalEmbed.thumbnail.url : 'https://i.imgur.com/X2YIZh4.png';

        const applicantMember = await guild.members.fetch(applicantId).catch(() => null);
        if (!applicantMember) return interaction.followUp({ content: `El usuario solicitante ya no está en el servidor.`, flags: MessageFlags.Ephemeral });

        const existingTeam = await Team.findOne({ $or: [{ name: teamName }, { managerId: applicantId }], guildId: guild.id });
        if (existingTeam) return interaction.followUp({ content: `Error: Ya existe un equipo con el nombre "${teamName}" o el usuario ya es mánager.`, flags: MessageFlags.Ephemeral });

        const newTeam = new Team({
            name: teamName,
            abbreviation: teamAbbr,
            guildId: guild.id,
            league: leagueName,
            logoUrl: logoUrl,
            twitterHandle: teamTwitter === 'No especificado' ? null : teamTwitter,
            managerId: applicantId,
        });
        await newTeam.save();

        await applicantMember.roles.add(process.env.MANAGER_ROLE_ID);
        await applicantMember.roles.add(process.env.PLAYER_ROLE_ID);
        await applicantMember.setNickname(`|MG| ${teamAbbr} ${applicantMember.user.username}`).catch(err => console.log(`No se pudo cambiar apodo: ${err.message}`));

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ components: [disabledRow] });

        try {
            const managerGuideEmbed = new EmbedBuilder()
                .setTitle(`👑 ¡Felicidades, Mánager! Tu equipo "${teamName}" ha sido aprobado.`)
                .setColor('Gold')
                .setImage('https://i.imgur.com/KjamtCg.jpeg')
                .setDescription('¡Bienvenido a la élite de la comunidad! Aquí tienes una guía detallada de tus nuevas responsabilidades y herramientas. Tu centro de mando principal es el panel del canal de gestión de equipo.')
                .addFields(
                    { name: 'Paso 1: Construye tu Plantilla', value: 'Tu prioridad es formar tu equipo. Desde el submenú `Gestionar Plantilla` puedes:\n• **`Invitar Jugador`**: Añade miembros directamente a tu plantilla.\n• **`Ascender a Capitán`**: Delega responsabilidades en jugadores de confianza para que te ayuden con la gestión diaria (amistosos, fichajes).' },
                    { name: 'Paso 2: Mantén tu Equipo Activo', value: 'La actividad es clave para el éxito. Desde los submenús correspondientes puedes:\n• **`Gestionar Amistosos`**: Usa `Programar Búsqueda` para anunciar tu disponibilidad con antelación o `Buscar Rival (Ahora)` para un partido inmediato.\n• **`Gestionar Fichajes`**: Usa `Crear / Editar Oferta` para publicar que buscas jugadores. Tu oferta será visible para todos los agentes libres.' },
                    { name: 'Paso 3: Administración y Consejos', value: '• **`Editar Datos del Equipo`**: Mantén actualizados el nombre, abreviatura, logo y Twitter de tu equipo.\n• **`Abrir/Cerrar Reclutamiento`**: Controla si tu equipo acepta solicitudes de nuevos miembros.\n• **Tienes el control total**: Eres el máximo responsable de tu equipo.' }
                );
            await applicantMember.send({ embeds: [managerGuideEmbed] });
        } catch (dmError) {
            console.log(`AVISO: No se pudo enviar el MD de guía al nuevo mánager ${applicantMember.user.tag}.`);
        }
        
        return interaction.followUp({ content: `✅ Equipo **${teamName}** creado. ${applicantMember.user.tag} es ahora Mánager.`, flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('reject_request_')) {
        await interaction.deferUpdate();
        const esAprobador = member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!esAprobador) return interaction.followUp({ content: 'No tienes permisos para esta acción.', flags: MessageFlags.Ephemeral });

        const applicantId = customId.split('_')[2];
        const applicant = await guild.members.fetch(applicantId).catch(() => null);

        const disabledRow = ActionRowBuilder.from(interaction.message.components[0]);
        disabledRow.components.forEach(c => c.setDisabled(true));
        await interaction.message.edit({ components: [disabledRow] });

        if (applicant) {
            await applicant.send('Lo sentimos, tu solicitud para registrar un equipo ha sido rechazada por un administrador.').catch(() => {});
        }
        
        return interaction.followUp({ content: `Solicitud de ${applicant ? applicant.user.tag : 'un usuario'} rechazada.`, flags: MessageFlags.Ephemeral });
    }
    // ===========================================================================
    // ================== BLOQUE DE CÓDIGO FALTANTE (AHORA PRESENTE) ==============
    // ===========================================================================
        if (customId.startsWith('promote_player_') || customId.startsWith('demote_captain_') || customId.startsWith('kick_player_') || customId.startsWith('toggle_mute_player_')) {
        await interaction.deferUpdate();
    
        const targetId = customId.substring(customId.lastIndexOf('_') + 1);
        
        let team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: user.id }, { captains: user.id }] });
        
        if (!team) {
            team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: targetId }, { captains: targetId }, { players: targetId }] });
        }
    
        if (!team) return interaction.editReply({ content: 'No se pudo encontrar el equipo del jugador seleccionado.', components: [] });
    
        const isManager = team.managerId === user.id;
        const isCaptain = team.captains.includes(user.id);
        if (!isAdmin && !isManager && !isCaptain) {
            return interaction.editReply({ content: 'No tienes permisos para gestionar este equipo.', components: [] });
        }
    
        const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!targetMember) return interaction.editReply({ content: 'Miembro no encontrado en el servidor.', components: [] });
    
        const canManage = isAdmin || isManager;
        const isTargetCaptain = team.captains.includes(targetId);
    
        if (customId.startsWith('kick_player_')) {
            if (isTargetCaptain && !canManage) return interaction.editReply({ content: 'Un capitán no puede expulsar a otro capitán.', components: [] });
            if (team.managerId === targetId) return interaction.editReply({ content: 'No puedes expulsar al mánager del equipo.', components: [] });
    
            team.players = team.players.filter(p => p !== targetId);
            team.captains = team.captains.filter(c => c !== targetId);
            await targetMember.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(targetMember.user.username).catch(()=>{});
            
            const successMessage = t('playerKicked', member).replace('{playerName}', targetMember.user.username);
            await interaction.editReply({ content: successMessage, components: [] });

        } else if (customId.startsWith('promote_player_')) {
            if (!canManage) return interaction.editReply({ content: 'Solo el Mánager o un Administrador pueden ascender jugadores.', components: [] });
            team.players = team.players.filter(p => p !== targetId);
            team.captains.push(targetId);
            await targetMember.roles.remove(process.env.PLAYER_ROLE_ID).catch(()=>{});
            await targetMember.roles.add(process.env.CAPTAIN_ROLE_ID).catch(()=>{});
            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`|C| ${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
    
            try {
                // El MD de guía para el nuevo capitán lo dejamos bilingüe
                const captainGuideEmbed = new EmbedBuilder()
                    .setTitle(`🛡️ ¡Enhorabuena! / Congratulations!`)
                    .setColor('Blue')
                    .setDescription(`Has sido ascendido a Capitán de "${team.name}".\nYou have been promoted to Captain of "${team.name}".`)
                    .addFields(
                        { name: '✅ Tus Nuevas Responsabilidades / Your New Responsibilities', value: '• Gestionar Amistosos / Manage Friendlies\n• Gestionar Fichajes / Manage Transfers\n• Gestionar Miembros / Manage Members' },
                        { name: '❌ Límites de tu Rol / Role Limitations', value: 'No puedes invitar jugadores ni editar datos del equipo.\nYou cannot invite players or edit team data.' }
                    );
                await targetMember.send({ embeds: [captainGuideEmbed] });
            } catch (dmError) {
                console.log(`AVISO: No se pudo enviar el MD de guía al nuevo capitán ${targetMember.user.tag}.`);
            }
            
            const successMessage = t('playerPromoted', member).replace('{playerName}', targetMember.user.username);
            await interaction.editReply({ content: successMessage, components: [] });

        } else if (customId.startsWith('demote_captain_')) {
            if (!canManage) return interaction.editReply({ content: 'Solo el Mánager o un Administrador pueden degradar capitanes.', components: [] });
            team.captains = team.captains.filter(c => c !== targetId);
            team.players.push(targetId);
            await targetMember.roles.remove(process.env.CAPTAIN_ROLE_ID).catch(()=>{});
            await targetMember.roles.add(process.env.PLAYER_ROLE_ID).catch(()=>{});
            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
            
            const successMessage = t('playerDemoted', member).replace('{playerName}', targetMember.user.username);
            await interaction.editReply({ content: successMessage, components: [] });

        } else if (customId.startsWith('toggle_mute_player_')) {
            if (isTargetCaptain && !canManage) return interaction.editReply({ content: 'Un capitán no puede mutear a otro capitán.', components: [] });
            const hasMutedRole = targetMember.roles.cache.has(process.env.MUTED_ROLE_ID);
            if (hasMutedRole) {
                await targetMember.roles.remove(process.env.MUTED_ROLE_ID);
                const successMessage = t('playerUnmuted', member).replace('{playerName}', targetMember.user.username);
                await interaction.editReply({ content: successMessage, components: [] });
            } else {
                await targetMember.roles.add(process.env.MUTED_ROLE_ID);
                const successMessage = t('playerMuted', member).replace('{playerName}', targetMember.user.username);
                await interaction.editReply({ content: successMessage, components: [] });
            }
        }
        await team.save();
        return;
    }

    if (customId === 'view_teams_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const teams = await Team.find({ guildId: guild.id }).sort({ name: 1 }).lean();
        if (teams.length === 0) {
            return interaction.editReply({ content: 'No hay equipos registrados.' });
        }
        await sendPaginatedTeamMenu(interaction, teams, 'view_team_roster_select', 'view', 0, 'Elige un equipo para ver su plantilla:');
        return;
    }
    
    if (customId === 'player_actions_button') {
        const canLeaveTeam = member.roles.cache.has(process.env.PLAYER_ROLE_ID) || member.roles.cache.has(process.env.CAPTAIN_ROLE_ID);
        
        // Usamos la función 't' para obtener los textos en el idioma del usuario
        const subMenuEmbed = new EmbedBuilder()
            .setTitle(t('playerActionsTitle', member))
            .setDescription(t('playerActionsDescription', member))
            .setColor('Blue');
            
        const subMenuRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('edit_profile_button').setLabel(t('editProfileButton', member)).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('apply_to_team_button').setLabel(t('applyToTeamButton', member)).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('leave_team_button').setLabel(t('leaveTeamButton', member)).setStyle(ButtonStyle.Danger).setDisabled(!canLeaveTeam)
        );
        
        return interaction.reply({ embeds: [subMenuEmbed], components: [subMenuRow], flags: MessageFlags.Ephemeral });
    }

        if (customId.startsWith('team_submenu_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        // MÁS ADELANTE TRADUCIREMOS ESTE ERROR
        if (!team) return interaction.editReply({ content: '❌ Debes ser Mánager o Capitán para usar estos menús.' });

        let embed, row1, row2;
        switch (customId) {
            case 'team_submenu_roster':
                embed = new EmbedBuilder().setTitle(t('rosterSubmenuTitle', member)).setColor('Blue').setDescription(t('rosterSubmenuDescription', member));
                row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('team_invite_player_button').setLabel(t('invitePlayerButton', member)).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('team_manage_roster_button').setLabel(t('manageMembersButton', member)).setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('team_view_roster_button').setLabel(t('viewRosterButton', member)).setStyle(ButtonStyle.Secondary)
                );
                row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('team_toggle_recruitment_button').setLabel(t('toggleRecruitmentButton', member)).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('team_edit_data_button').setLabel(t('editTeamDataButton', member)).setStyle(ButtonStyle.Danger)
                );
                await interaction.editReply({ embeds: [embed], components: [row1, row2] });
                break;
            case 'team_submenu_friendlies':
                embed = new EmbedBuilder().setTitle(t('friendliesSubmenuTitle', member)).setColor('Green').setDescription(t('friendliesSubmenuDescription', member));
                row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('post_scheduled_panel').setLabel(t('scheduleSearchButton', member)).setStyle(ButtonStyle.Primary).setEmoji('🗓️'),
                    new ButtonBuilder().setCustomId('post_instant_panel').setLabel(t('findRivalNowButton', member)).setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('delete_friendly_panel').setLabel(t('deleteSearchButton', member)).setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
                    new ButtonBuilder().setCustomId('team_view_confirmed_matches').setLabel(t('viewMatchesButton', member)).setStyle(ButtonStyle.Secondary)
                );
                await interaction.editReply({ embeds: [embed], components: [row1] });
                break;
            case 'team_submenu_market':
                embed = new EmbedBuilder().setTitle(t('marketSubmenuTitle', member)).setColor('Purple').setDescription(t('marketSubmenuDescription', member));
                row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('market_post_offer').setLabel(t('createEditOfferButton', member)).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('team_manage_offer_button').setLabel(t('manageOfferButton', member)).setStyle(ButtonStyle.Primary)
                );
                await interaction.editReply({ embeds: [embed], components: [row1] });
                break;
        }
        return; 
    }
    if (customId === 'admin_create_league_button') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });
        const modal = new ModalBuilder().setCustomId('create_league_modal').setTitle('Crear Nueva Liga');
        const leagueNameInput = new TextInputBuilder().setCustomId('leagueNameInput').setLabel("Nombre de la nueva liga").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(leagueNameInput));
        return interaction.showModal(modal);
    }
    
    if (customId === 'admin_delete_league_button') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const leagues = await League.find({ guildId: guild.id });
        if (leagues.length === 0) {
            return interaction.editReply({ content: 'No hay ligas para borrar.' });
        }
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('delete_league_select_menu')
            .setPlaceholder('Selecciona las ligas a eliminar')
            .addOptions(leagueOptions)
            .setMinValues(1)
            .setMaxValues(leagues.length);
        return interaction.editReply({ content: 'Selecciona una o más ligas del menú para borrarlas permanentemente.', components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    if (customId === 'admin_manage_team_button') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const teams = await Team.find({ guildId: interaction.guildId }).sort({ name: 1 }).lean();
        if (teams.length === 0) {
            return interaction.editReply({ content: 'No hay equipos registrados en este servidor.' });
        }
        await sendPaginatedTeamMenu(interaction, teams, 'admin_select_team_to_manage', 'manage', 0, 'Selecciona el equipo que deseas gestionar:');
        return;
    }
    
    if (customId.startsWith('admin_manage_members_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'Equipo no encontrado.' });
        
        const memberIds = [team.managerId, ...team.captains, ...team.players].filter(Boolean);
        if (memberIds.length === 0) {
            return interaction.editReply({ content: 'Este equipo no tiene miembros.' });
        }

        const memberObjects = await guild.members.fetch({ user: memberIds }).catch(() => []);
        if (!memberObjects || memberObjects.size === 0) {
            return interaction.editReply({ content: 'No se pudo encontrar a ningún miembro de este equipo en el servidor.' });
        }
        
        const memberOptions = memberObjects.map(m => ({
            label: m.displayName,
            description: `Rol: ${team.managerId === m.id ? 'Mánager' : (team.captains.includes(m.id) ? 'Capitán' : 'Jugador')}`,
            value: m.id
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`roster_management_menu`)
            .setPlaceholder('Selecciona un miembro para gestionar')
            .addOptions(memberOptions);
        
        await interaction.editReply({ content: `Gestionando miembros de **${team.name}**. Selecciona uno:`, components: [new ActionRowBuilder().addComponents(selectMenu)] });
        return;
    }
    
    if (customId.startsWith('admin_change_data_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.reply({ content: 'No se encontró el equipo.', flags: MessageFlags.Ephemeral });

        const modal = new ModalBuilder().setCustomId(`edit_data_modal_${team._id}`).setTitle(`Editar Datos de ${team.name}`);
        const newNameInput = new TextInputBuilder().setCustomId('newName').setLabel("Nuevo Nombre (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.name);
        const newAbbrInput = new TextInputBuilder().setCustomId('newAbbr').setLabel("Nueva Abreviatura (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.abbreviation).setMinLength(3).setMaxLength(3);
        const newLogoInput = new TextInputBuilder().setCustomId('newLogo').setLabel("Nueva URL del Logo (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.logoUrl);
        const newTwitterInput = new TextInputBuilder().setCustomId('newTwitter').setLabel("Twitter del equipo (sin @)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.twitterHandle || '');
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(newNameInput),
            new ActionRowBuilder().addComponents(newAbbrInput),
            new ActionRowBuilder().addComponents(newLogoInput),
            new ActionRowBuilder().addComponents(newTwitterInput)
        );
        return interaction.showModal(modal);
    }
    
    if (customId.startsWith('admin_dissolve_team_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.reply({ content: 'Equipo no encontrado.', flags: MessageFlags.Ephemeral });
        
        const modal = new ModalBuilder().setCustomId(`confirm_dissolve_modal_${teamId}`).setTitle(`Disolver Equipo: ${team.name}`);
        const confirmationInput = new TextInputBuilder().setCustomId('confirmation_text').setLabel(`Escribe "${team.name}" para confirmar`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(team.name);
        modal.addComponents(new ActionRowBuilder().addComponents(confirmationInput));
        return interaction.showModal(modal);
    }

    if (customId === 'admin_view_pending_requests') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: MessageFlags.Ephemeral });
        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        if (!approvalChannelId) {
            return interaction.reply({ content: 'La variable de entorno `APPROVAL_CHANNEL_ID` no está configurada.', flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({ content: `Todas las solicitudes de registro de equipo pendientes se encuentran en el canal <#${approvalChannelId}>.`, flags: MessageFlags.Ephemeral });
    }
    
    // --- Lógica para los botones de GESTIÓN DE PLANTILLA ---
        if (customId === 'team_invite_player_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findOne({ guildId: guild.id, managerId: user.id });
        if (!team) {
            return interaction.editReply({ content: t('errorOnlyManagersCanInvite', member) });
        }

        const allMembers = await guild.members.fetch();
        const teams = await Team.find({ guildId: guild.id }).select('managerId captains players').lean();
        const playersInTeams = new Set(teams.flatMap(t => [t.managerId, ...t.captains, ...t.players]));

        const eligibleMembers = allMembers.filter(m => !m.user.bot && !playersInTeams.has(m.id));

        if (eligibleMembers.size === 0) {
            return interaction.editReply({ content: t('errorNoEligibleMembers', member) });
        }

        const sortedMembers = Array.from(eligibleMembers.values()).sort((a, b) => a.user.username.localeCompare(b.user.username));
        await sendPaginatedPlayerMenu(interaction, sortedMembers, 0);
        return;
    }
    
        if (customId === 'team_manage_roster_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) {
            return interaction.editReply({ content: t('errorTeamNotFound', member) });
        }
        
        const isManager = team.managerId === user.id;
        let memberIds = isManager ? [...team.captains, ...team.players] : team.players;

        if (memberIds.length === 0) {
            return interaction.editReply({ content: t('errorNoMembersToManage', member) });
        }

        const memberObjects = await guild.members.fetch({ user: memberIds });
        const memberOptions = memberObjects.map(m => ({ label: m.displayName, description: `ID: ${m.id}`, value: m.id }));

        if (memberOptions.length === 0) {
            // Este es un error técnico, lo dejamos sin traducir por ahora
            return interaction.editReply({ content: 'No se encontraron miembros válidos en el servidor.' });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('roster_management_menu')
            .setPlaceholder(t('manageRosterMenuPlaceholder', member))
            .addOptions(memberOptions);

        await interaction.editReply({ content: t('manageRosterHeader', member), components: [new ActionRowBuilder().addComponents(selectMenu)] });
        return;
    }

        if (customId === 'team_view_roster_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const teamToView = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }] });
        if (!teamToView) return interaction.editReply({ content: t('errorNotInAnyTeam', member) });
        
        const allMemberIds = [teamToView.managerId, ...teamToView.captains, ...teamToView.players].filter(id => id);
        if (allMemberIds.length === 0) return interaction.editReply({ content: t('errorTeamHasNoMembers', member) });
        
        const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } }).lean();
        const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));
        
        let rosterString = '';
        const fetchMemberInfo = async (ids, roleNameKey) => {
            if (!ids || ids.length === 0) return;
            rosterString += `\n**${t(roleNameKey, member)}**\n`; // Usamos la clave de traducción
            for (const memberId of ids) {
                try {
                   const memberData = await guild.members.fetch(memberId);
                   const vpgUser = memberMap.get(memberId)?.vpgUsername || 'N/A';
                   rosterString += `> ${memberData.user.username} (${vpgUser})\n`;
                } catch (error) { rosterString += `> *Usuario no encontrado (ID: ${memberId})*\n`; }
            }
        };
        
        await fetchMemberInfo([teamToView.managerId].filter(Boolean), 'rosterManager');
        await fetchMemberInfo(teamToView.captains, 'rosterCaptains');
        await fetchMemberInfo(teamToView.players, 'rosterPlayers');
        
        const embedTitle = t('rosterEmbedTitle', member).replace('{teamName}', teamToView.name);
        const embedFooter = t('rosterLeague', member).replace('{leagueName}', teamToView.league);

        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(rosterString.trim() || t('rosterNoMembers', member))
            .setColor('#3498db')
            .setThumbnail(teamToView.logoUrl)
            .setFooter({ text: embedFooter });
            
        return interaction.editReply({ embeds: [embed] });
    }

    if (customId === 'team_toggle_recruitment_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findOne({ guildId: guild.id, managerId: user.id }); // Solo el mánager puede
        if (!team) return interaction.editReply({ content: t('errorOnlyManagersToggleRecruitment', member) });

        team.recruitmentOpen = !team.recruitmentOpen;
        await team.save();

        const description = (team.recruitmentOpen ? t('recruitmentStatusOpen', member) : t('recruitmentStatusClosed', member))
            .replace('{teamName}', team.name);
        const color = team.recruitmentOpen ? 'Green' : 'Red';
        
        const embed = new EmbedBuilder()
            .setTitle(t('recruitmentStatusTitle', member))
            .setDescription(description)
            .setColor(color);
        
        await interaction.editReply({ embeds: [embed] });
        return;
    }
    
    if (customId === 'team_edit_data_button') {
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.reply({ content: 'No se encontró tu equipo o no tienes permisos.', flags: MessageFlags.Ephemeral });
        
        const isManager = team.managerId === user.id;
        if (!isManager) return interaction.reply({ content: 'Solo el mánager del equipo puede editar sus datos.', flags: MessageFlags.Ephemeral });

        const modal = new ModalBuilder()
            .setCustomId(`edit_data_modal_${team._id}`)
            .setTitle(`Editar Datos de ${team.name}`);
        
        const newNameInput = new TextInputBuilder().setCustomId('newName').setLabel("Nuevo Nombre (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.name);
        const newAbbrInput = new TextInputBuilder().setCustomId('newAbbr').setLabel("Nueva Abreviatura (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.abbreviation).setMinLength(3).setMaxLength(3);
        const newLogoInput = new TextInputBuilder().setCustomId('newLogo').setLabel("Nueva URL del Logo (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.logoUrl);
        const newTwitterInput = new TextInputBuilder().setCustomId('newTwitter').setLabel("Twitter del equipo (sin @)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.twitterHandle || '');
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(newNameInput),
            new ActionRowBuilder().addComponents(newAbbrInput),
            new ActionRowBuilder().addComponents(newLogoInput),
            new ActionRowBuilder().addComponents(newTwitterInput)
        );
        
        return interaction.showModal(modal);
    }
    
    // --- Lógica para el Panel de Amistosos ---

            if (customId === 'post_scheduled_panel') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: t('errorTeamNotFound', member) });

        const existingPanel = await AvailabilityPanel.findOne({ teamId: team._id, panelType: 'SCHEDULED' });
        if (existingPanel) {
            const channel = guild.channels.cache.get(existingPanel.channelId);
            const errorMessage = t('errorExistingScheduledPanel', member).replace('{channel}', channel || 'un canal');
            return interaction.editReply({ content: errorMessage });
        }
        
        const leagues = await League.find({ guildId: guild.id }).lean();
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));

        const leaguesMenu = new StringSelectMenuBuilder()
            .setCustomId('select_league_filter_SCHEDULED')
            .setPlaceholder(t('leagueFilterPlaceholder', member))
            .addOptions(leagueOptions)
            .setMinValues(0)
            .setMaxValues(leagueOptions.length > 0 ? leagueOptions.length : 1);

        const continueButton = new ButtonBuilder()
            .setCustomId('continue_panel_creation_SCHEDULED_all')
            .setLabel(t('continueButtonLabel', member))
            .setStyle(ButtonStyle.Primary);
        
        const components = [new ActionRowBuilder().addComponents(continueButton)];
        if(leagueOptions.length > 0) {
            components.unshift(new ActionRowBuilder().addComponents(leaguesMenu));
        }

        await interaction.editReply({ content: t('friendlyStep1Header', member), components });
        return;
    }
        if (customId.startsWith('continue_panel_creation_')) {
        const panelType = customId.split('_')[3];
        const leaguesString = customId.split('_').slice(4).join('_');
        
        if (panelType === 'SCHEDULED') {
            const timeSlots = ['22:00', '22:20', '22:40', '23:00', '23:20', '23:40'];
            const timeOptions = timeSlots.map(t => ({ label: t, value: t }));

            const timeMenu = new StringSelectMenuBuilder()
                .setCustomId(`select_available_times_${leaguesString}`)
                .setPlaceholder(t('timeSlotsPlaceholder', member))
                .addOptions(timeOptions)
                .setMinValues(1)
                .setMaxValues(timeSlots.length);
            
            await interaction.update({
                content: t('friendlyStep2Header', member),
                components: [new ActionRowBuilder().addComponents(timeMenu)]
            });
        }
        return;
    }
    
    if (customId === 'post_instant_panel') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: t('errorTeamNotFound', member) });
        
        const existingPanel = await AvailabilityPanel.findOne({ teamId: team._id, panelType: 'INSTANT' });
        if (existingPanel) {
            const channel = guild.channels.cache.get(existingPanel.channelId);
            const errorMessage = t('errorExistingInstantPanel', member).replace('{channel}', channel || 'un canal');
            return interaction.editReply({ content: errorMessage });
        }

        const channelId = process.env.INSTANT_FRIENDLY_CHANNEL_ID;
        if (!channelId) return interaction.editReply({ content: t('errorInstantChannelNotSet', member) });
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: t('errorInstantChannelNotFound', member) });

        const webhook = await getOrCreateWebhook(channel, client);
        const message = await webhook.send({ content: 'Creando panel...', username: team.name, avatarURL: team.logoUrl });
        
        const panel = new AvailabilityPanel({
            guildId: guild.id,
            channelId,
            messageId: message.id,
            teamId: team._id,
            postedById: user.id,
            panelType: 'INSTANT',
            timeSlots: [{ time: 'INSTANT', status: 'AVAILABLE' }]
        });
        
        await panel.save();
        await updatePanelMessage(client, panel._id);
        
        const successMessage = t('instantPanelCreatedSuccess', member).replace('{channel}', channel.toString());
        return interaction.editReply({ content: successMessage });
    }

        if (customId === 'delete_friendly_panel') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: t('errorTeamNotFound', member) });
        
        const panels = await AvailabilityPanel.find({ teamId: team._id });
        if(panels.length === 0) return interaction.editReply({ content: t('errorNoPanelsToDelete', member) });
        
        let deletedCount = 0;
        for (const panel of panels) {
            try {
                const channel = await client.channels.fetch(panel.channelId);
                const webhook = await getOrCreateWebhook(channel, client);
                await webhook.deleteMessage(panel.messageId);
            } catch (error) {
                console.log(`No se pudo borrar el mensaje del panel ${panel.messageId}. Puede que ya no existiera.`);
            }
            await AvailabilityPanel.findByIdAndDelete(panel._id);
            deletedCount++;
        }
        
        const successMessage = t('panelsDeletedSuccess', member).replace('{count}', deletedCount);
        return interaction.editReply({ content: successMessage });
    }

    if (customId.startsWith('challenge_slot_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const challengerTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!challengerTeam) return interaction.editReply({ content: 'Debes ser Mánager o Capitán de un equipo para desafiar.' });

        const [, , panelId, time] = customId.split('_');

        const existingMatch = await AvailabilityPanel.findOne({
            guildId: guild.id,
            "timeSlots.time": time,
            "timeSlots.status": "CONFIRMED",
            $or: [ { teamId: challengerTeam._id }, { "timeSlots.challengerTeamId": challengerTeam._id } ]
        }).populate('teamId timeSlots.challengerTeamId');

        if (existingMatch) {
            const opponentTeam = existingMatch.teamId._id.equals(challengerTeam._id) ? existingMatch.timeSlots.find(s=>s.time === time).challengerTeamId : existingMatch.teamId;
            return interaction.editReply({ content: `❌ No puedes desafiar a este horario. Ya tienes un partido confirmado a las **${time}** contra **${opponentTeam.name}**. Debes abandonar ese partido primero.` });
        }

        const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
        if (!panel) return interaction.editReply({ content: 'Este panel de amistosos ya no existe.' });
        if (panel.teamId._id.equals(challengerTeam._id)) return interaction.editReply({ content: 'No puedes desafiar a tu propio equipo.' });
        if (panel.leagues && panel.leagues.length > 0 && !panel.leagues.includes(challengerTeam.league)) {
            return interaction.editReply({ content: `Este amistoso está filtrado solo para equipos de la(s) liga(s): **${panel.leagues.join(', ')}**.` });
        }
        const slot = panel.timeSlots.find(s => s.time === time);
        if (!slot || slot.status === 'CONFIRMED') return interaction.editReply({ content: 'Este horario ya no está disponible.' });
        if (slot.pendingChallenges.some(c => c.teamId.equals(challengerTeam._id))) {
            return interaction.editReply({ content: 'Ya has enviado una petición para este horario.' });
        }
        
        const newChallenge = { teamId: challengerTeam._id, userId: user.id };
        slot.pendingChallenges.push(newChallenge);
        
        await panel.save();
        
        const updatedPanel = await AvailabilityPanel.findById(panelId);
        const updatedSlot = updatedPanel.timeSlots.find(s => s.time === time);
        const savedChallenge = updatedSlot.pendingChallenges.find(c => c.userId === user.id && c.teamId.equals(challengerTeam._id));

        if (!savedChallenge) {
            return interaction.editReply({ content: 'Hubo un error al procesar tu desafío. Inténtalo de nuevo.' });
        }
        
        const hostManagerId = panel.teamId.managerId;
        const hostCaptains = await Team.findById(panel.teamId).select('captains').lean();

        const recipients = [hostManagerId, ...hostCaptains.captains];
        const uniqueRecipients = [...new Set(recipients)];

        const embed = new EmbedBuilder().setTitle('⚔️ ¡Nuevo Desafío!').setDescription(`El equipo **${challengerTeam.name}** os ha desafiado para un partido a las **${time}**.`).setColor('Gold').setThumbnail(challengerTeam.logoUrl);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_challenge_${panel._id}_${time}_${savedChallenge._id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_challenge_${panel._id}_${time}_${savedChallenge._id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

        let notified = false;
        for(const recipientId of uniqueRecipients) {
            try {
                const recipientUser = await client.users.fetch(recipientId);
                await recipientUser.send({ embeds: [embed], components: [row] });
                notified = true;
            } catch (error) {
                console.log(`No se pudo notificar a ${recipientId}`);
            }
        }

        if(!notified) {
            // Revert challenge if no one could be notified
            panel.timeSlots.find(s => s.time === time).pendingChallenges = panel.timeSlots.find(s => s.time === time).pendingChallenges.filter(c => !c._id.equals(savedChallenge._id));
            await panel.save();
            await interaction.editReply({ content: 'No se pudo enviar el desafío. El mánager y los capitanes rivales tienen los MDs cerrados.' });
            await updatePanelMessage(client, panel._id);
            return;
        }

        await updatePanelMessage(client, panel._id);
        return interaction.editReply({ content: '✅ ¡Desafío enviado!' });
    }
    
    if (customId.startsWith('cancel_all_challenges_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const panelId = customId.split('_')[3];
        const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
        if (!panel) return interaction.editReply({ content: 'Este panel ya no existe.' });

        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!userTeam || !userTeam._id.equals(panel.teamId._id)) {
            return interaction.editReply({ content: 'No tienes permiso para cancelar las peticiones de este panel.' });
        }

        const challengesToNotify = [];
        panel.timeSlots.forEach(slot => {
            if (slot.pendingChallenges && slot.pendingChallenges.length > 0) {
                challengesToNotify.push(...slot.pendingChallenges);
                slot.pendingChallenges = [];
            }
        });

        if (challengesToNotify.length === 0) {
            return interaction.editReply({ content: 'No había peticiones pendientes que cancelar.' });
        }

        await panel.save();

        for (const challenge of challengesToNotify) {
            const userToNotify = await client.users.fetch(challenge.userId).catch(() => null);
            if (userToNotify) {
                await userToNotify.send(`El equipo **${panel.teamId.name}** ha cancelado todas sus peticiones de desafío pendientes, incluyendo la tuya.`).catch(() => {});
            }
        }
        
        await updatePanelMessage(client, panel._id);
        return interaction.editReply({ content: '✅ Todas las peticiones de desafío pendientes han sido canceladas.' });
    }

    if (customId.startsWith('abandon_challenge_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const [, , panelId, time] = customId.split('_');
        const panel = await AvailabilityPanel.findById(panelId);
        if (!panel) return interaction.editReply({ content: 'Este panel ya no existe.' });
        
        const slot = panel.timeSlots.find(s => s.time === time);
        if (!slot || slot.status !== 'CONFIRMED') return interaction.editReply({ content: 'No hay un partido que abandonar aquí.' });
        
        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        const isHost = userTeam?._id.equals(panel.teamId);
        const isChallenger = userTeam?._id.equals(slot.challengerTeamId);
        if (!isHost && !isChallenger) return interaction.editReply({ content: 'No eres Mánager o Capitán de uno de los equipos de este enfrentamiento.' });
        
        const otherTeamId = isHost ? slot.challengerTeamId : panel.teamId;
        const otherTeam = await Team.findById(otherTeamId);
        
        slot.status = 'AVAILABLE';
        slot.challengerTeamId = null;
        await panel.save();
        
        const otherTeamPanel = await AvailabilityPanel.findOne({ teamId: otherTeamId, panelType: panel.panelType });
        if (otherTeamPanel) {
            const otherTeamSlot = otherTeamPanel.timeSlots.find(s => s.time === time);
            if (otherTeamSlot && otherTeamSlot.status === 'CONFIRMED') {
                otherTeamSlot.status = 'AVAILABLE';
                otherTeamSlot.challengerTeamId = null;
                await otherTeamPanel.save();
                await updatePanelMessage(client, otherTeamPanel._id);
            }
        }
        
        await updatePanelMessage(client, panel._id);
        await interaction.editReply({ content: '✅ El partido ha sido cancelado. Ambos paneles han sido actualizados.' });

        const otherTeamLeaders = [otherTeam.managerId, ...otherTeam.captains];
        for(const leaderId of otherTeamLeaders){
            const otherLeader = await client.users.fetch(leaderId).catch(() => null);
            if (otherLeader) await otherLeader.send(`⚠️ El equipo **${userTeam.name}** ha cancelado vuestro partido de las **${time}**. El horario vuelve a estar libre.`).catch(()=>{});
        }
        return;
    }

    if (customId.startsWith('contact_opponent_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const [, , teamId1, teamId2] = customId.split('_');
        
        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!userTeam) return interaction.editReply({ content: 'No tienes permisos para esta acción.' });
        
        let opponentTeamId = null;
        if (userTeam._id.equals(teamId1)) {
            opponentTeamId = teamId2;
        } else if (userTeam._id.equals(teamId2)) {
            opponentTeamId = teamId1;
        } else {
            return interaction.editReply({ content: 'No eres parte de este enfrentamiento.' });
        }
        
        const opponentTeam = await Team.findById(opponentTeamId).lean();
        if (!opponentTeam) return interaction.editReply({ content: 'No se encontró al equipo rival.' });
        
        return interaction.editReply({ content: `Para hablar con el rival, contacta a su mánager: <@${opponentTeam.managerId}>` });
    }
    
        if (customId === 'team_view_confirmed_matches') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }] });
        if (!userTeam) return interaction.editReply({ content: t('errorNotInAnyTeam', member) });

        const confirmedPanels = await AvailabilityPanel.find({
            guildId: guild.id,
            "timeSlots.status": "CONFIRMED",
            $or: [ { teamId: userTeam._id }, { "timeSlots.challengerTeamId": userTeam._id } ]
        }).populate('teamId timeSlots.challengerTeamId').lean();

        let description = '';
        const allConfirmedSlots = [];
        for (const panel of confirmedPanels) {
             for (const slot of panel.timeSlots) {
                if (slot.status === 'CONFIRMED') {
                    const isHost = panel.teamId._id.equals(userTeam._id);
                     if (isHost || (slot.challengerTeamId && userTeam._id.equals(slot.challengerTeamId._id))) {
                        const opponent = isHost ? slot.challengerTeamId : panel.teamId;
                        if (opponent) { allConfirmedSlots.push({ time: slot.time, opponent }); }
                    }
                }
            }
        }

        const uniqueMatches = [...new Map(allConfirmedSlots.map(item => [item.time, item])).values()];
        uniqueMatches.sort((a,b) => a.time.localeCompare(b.time));

        for(const match of uniqueMatches) {
            description += t('matchInfoLine', member)
                .replace('{time}', match.time)
                .replace('{opponentName}', match.opponent.name)
                .replace('{managerId}', match.opponent.managerId);
        }
        
        if (description === '') { 
            description = t('noConfirmedMatches', member);
        }

        const embedTitle = t('confirmedMatchesTitle', member).replace('{teamName}', userTeam.name);
        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(description)
            .setColor('Green')
            .setThumbnail(userTeam.logoUrl)
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
    // --- Lógica de Mercado de Fichajes y Perfil de Jugador ---

        if (customId === 'edit_profile_button') {
        const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
        
        const primaryMenu = new StringSelectMenuBuilder()
            .setCustomId('update_select_primary_position') 
            .setPlaceholder(t('primaryPositionPlaceholder', member))
            .addOptions(positionOptions);
        
        await interaction.reply({ 
            content: t('updateProfilePrompt', member),
            components: [new ActionRowBuilder().addComponents(primaryMenu)],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

        if (customId === 'apply_to_team_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const isManager = await Team.findOne({ guildId: guild.id, managerId: user.id });
        if (isManager) {
            return interaction.editReply({ content: t('errorManagerCannotApply', member) });
        }
        const existingApplication = await PlayerApplication.findOne({ userId: user.id, status: 'pending' });
        if (existingApplication) {
            return interaction.editReply({ content: t('errorApplicationPending', member) });
        }
        
        const openTeams = await Team.find({ guildId: guild.id, recruitmentOpen: true }).sort({ name: 1 }).lean();
        if (openTeams.length === 0) {
            return interaction.editReply({ content: t('errorNoRecruitingTeams', member) });
        }
        await sendPaginatedTeamMenu(interaction, openTeams, 'apply_to_team_select', 'apply', 0, t('applyToTeamMenuHeader', member));
        return;
    }

    if (customId === 'leave_team_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const teamToLeave = await Team.findOne({ guildId: guild.id, $or: [{ captains: user.id }, { players: user.id }] });
        if (!teamToLeave) {
            return interaction.editReply({ content: t('errorNotInTeamToLeave', member) });
        }
        
        teamToLeave.players = teamToLeave.players.filter(p => p !== user.id);
        teamToLeave.captains = teamToLeave.captains.filter(c => c !== user.id);
        await teamToLeave.save();
        
        await member.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
        if (member.id !== guild.ownerId) await member.setNickname(member.user.username).catch(()=>{});
        
        const successMessage = t('leaveTeamSuccess', member).replace('{teamName}', teamToLeave.name);
        await interaction.editReply({ content: successMessage });
        
        // El MD al mánager se envía bilingüe, ya que no sabemos su idioma.
        const manager = await client.users.fetch(teamToLeave.managerId).catch(() => null);
        if (manager) {
            await manager.send(`The player **${user.tag}** has left your team.\nEl jugador **${user.tag}** ha abandonado tu equipo.`);
        }
        return;
    }
    
    if (customId.startsWith('market_')) {
        if (customId === 'market_post_agent') {
            const hasRequiredRole = member.roles.cache.has(process.env.PLAYER_ROLE_ID) || member.roles.cache.has(process.env.CAPTAIN_ROLE_ID);
            if (!hasRequiredRole) {
                return interaction.reply({ content: '❌ Necesitas el rol de "Jugador" o "Capitán" para anunciarte.', flags: MessageFlags.Ephemeral });
            }

            const modal = new ModalBuilder().setCustomId('market_agent_modal').setTitle('Anunciarse como Agente Libre');
            const experienceInput = new TextInputBuilder().setCustomId('experienceInput').setLabel("Tu experiencia (clubes, logros, etc.)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
            const seekingInput = new TextInputBuilder().setCustomId('seekingInput').setLabel("¿Qué tipo de equipo buscas?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
            const availabilityInput = new TextInputBuilder().setCustomId('availabilityInput').setLabel("Tu disponibilidad horaria").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200);
            modal.addComponents(new ActionRowBuilder().addComponents(experienceInput), new ActionRowBuilder().addComponents(seekingInput), new ActionRowBuilder().addComponents(availabilityInput));
            await interaction.showModal(modal);
        }
                else if (customId === 'market_post_offer') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
            if (!team) return interaction.editReply({ content: t('errorMustBeManagerOrCaptain', member) });
            
            const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
            const positionMenu = new StringSelectMenuBuilder()
                .setCustomId(`offer_select_positions_${team._id}`)
                .setPlaceholder(t('offerPositionsPlaceholder', member))
                .addOptions(positionOptions)
                .setMinValues(1)
                .setMaxValues(positionOptions.length);

            await interaction.editReply({
                content: t('offerStep1Header', member),
                components: [new ActionRowBuilder().addComponents(positionMenu)],
            });
        }
        else if (customId === 'market_search_teams') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const leagues = await League.find({ guildId: guild.id }).lean();
            const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
            const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
            const positionMenu = new StringSelectMenuBuilder().setCustomId('search_team_pos_filter').setPlaceholder('Filtrar por posición que buscan').addOptions({ label: 'Cualquier Posición', value: 'ANY' }, ...positionOptions);
            const leagueMenu = new StringSelectMenuBuilder().setCustomId('search_team_league_filter').setPlaceholder('Filtrar por liga').addOptions({ label: 'Cualquier Liga', value: 'ANY' }, ...leagueOptions);
            await interaction.editReply({ content: 'Usa los menús para filtrar las ofertas de equipo.', components: [new ActionRowBuilder().addComponents(positionMenu), new ActionRowBuilder().addComponents(leagueMenu)]});
        }
        else if (customId === 'market_search_players') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
            const positionMenu = new StringSelectMenuBuilder().setCustomId('search_player_pos_filter').setPlaceholder('Selecciona las posiciones que buscas').addOptions(positionOptions).setMinValues(1).setMaxValues(5);
            await interaction.editReply({ content: 'Usa el menú para filtrar jugadores por su posición principal o secundaria.', components: [new ActionRowBuilder().addComponents(positionMenu)]});
        }
        else if (customId === 'market_manage_ad') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const existingAd = await FreeAgent.findOne({ userId: user.id });

            if (!existingAd) {
                return interaction.editReply({ content: '❌ No tienes ningún anuncio de agente libre activo.' });
            }

            const embed = new EmbedBuilder()
                .setTitle('Gestión de tu Anuncio de Agente Libre')
                .setDescription('Aquí está tu anuncio actual. Puedes editarlo o borrarlo.')
                .addFields(
                    { name: 'Experiencia actual', value: existingAd.experience || 'No especificado' },
                    { name: 'Equipo que busco', value: existingAd.seeking || 'No especificado' },
                    { name: 'Disponibilidad actual', value: existingAd.availability || 'No especificado' }
                )
                .setColor('Orange');

            const managementRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('market_edit_ad_button').setLabel('Editar Anuncio').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('market_delete_ad_button').setLabel('Borrar Anuncio').setStyle(ButtonStyle.Danger)
            );
            
            await interaction.editReply({ embeds: [embed], components: [managementRow] });
        }
        else if (customId === 'market_delete_ad_button') {
            await interaction.deferUpdate(); 
            const adToDelete = await FreeAgent.findOne({ userId: user.id });

            if (adToDelete && adToDelete.messageId) {
                try {
                    const channel = await client.channels.fetch(process.env.PLAYERS_AD_CHANNEL_ID);
                    await channel.messages.delete(adToDelete.messageId);
                } catch (error) {}
            }
            
            await FreeAgent.deleteOne({ userId: user.id });
            
            await interaction.editReply({ 
                content: '✅ Tu anuncio de agente libre ha sido borrado con éxito.',
                embeds: [], 
                components: [] 
            });
        }
        else if (customId === 'market_edit_ad_button') {
            const existingAd = await FreeAgent.findOne({ userId: user.id });
            if (!existingAd) {
                return interaction.reply({ content: '❌ No se pudo encontrar tu anuncio para editarlo.', flags: MessageFlags.Ephemeral });
            }

            const modal = new ModalBuilder().setCustomId(`market_agent_modal_edit:${existingAd._id}`).setTitle('Editar Anuncio de Agente Libre');
            const experienceInput = new TextInputBuilder().setCustomId('experienceInput').setLabel("Tu experiencia").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(existingAd.experience || '');
            const seekingInput = new TextInputBuilder().setCustomId('seekingInput').setLabel("¿Qué tipo de equipo buscas?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(existingAd.seeking || '');
            const availabilityInput = new TextInputBuilder().setCustomId('availabilityInput').setLabel("Tu disponibilidad horaria").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200).setValue(existingAd.availability || '');
            modal.addComponents(new ActionRowBuilder().addComponents(experienceInput), new ActionRowBuilder().addComponents(seekingInput), new ActionRowBuilder().addComponents(availabilityInput));
            await interaction.showModal(modal);
        }
        return;
    }
    
        if (customId === 'team_manage_offer_button') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: t('errorTeamNotFound', member) });
        
        const existingOffer = await TeamOffer.findOne({ teamId: team._id });

        if (!existingOffer) {
            return interaction.editReply({ content: t('errorNoOfferToManage', member) });
        }

        const embedTitle = t('manageOfferEmbedTitle', member).replace('{teamName}', team.name);
        const embed = new EmbedBuilder()
            .setTitle(embedTitle)
            .setDescription(t('manageOfferEmbedDescription', member))
            .addFields(
                { name: t('offerPositionsField', member), value: `\`${existingOffer.positions.join(', ')}\`` },
                { name: t('offerRequirementsField', member), value: existingOffer.requirements }
            )
            .setColor('Purple');

        const managementRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`market_post_offer`).setLabel(t('editReplaceOfferButton', member)).setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`delete_team_offer_button_${existingOffer._id}`).setLabel(t('deleteOfferButton', member)).setStyle(ButtonStyle.Danger) 
        );
        
        await interaction.editReply({ embeds: [embed], components: [managementRow] });
        return;
    }

        if (customId.startsWith('delete_team_offer_button_')) {
        await interaction.deferUpdate();
        const offerId = customId.split('_')[4];

        const offerToDelete = await TeamOffer.findById(offerId);
        if (!offerToDelete) return interaction.editReply({ content: 'La oferta ya no existe.', embeds: [], components: [] });

        if (offerToDelete.messageId) {
            try {
                const channelId = process.env.TEAMS_AD_CHANNEL_ID;
                const channel = await client.channels.fetch(channelId);
                await channel.messages.delete(offerToDelete.messageId);
            } catch (error) {
                console.log(`No se pudo borrar el mensaje público de la oferta (ID: ${offerToDelete.messageId}).`);
            }
        }

        await TeamOffer.findByIdAndDelete(offerId);
        
        await interaction.editReply({
            content: t('offerDeletedSuccess', member),
            embeds: [],
            components: []
        });
        return;
    }

    // --- SISTEMA DE TICKETS ---
    if (customId === 'create_ticket_button') {
        await interaction.deferReply({ ephemeral: true });

        const ticketConfig = await TicketConfig.findOne({ guildId: guild.id });
        if (!ticketConfig) {
            return interaction.editReply({ content: '❌ El sistema de tickets no ha sido configurado. Por favor, contacta a un administrador.' });
        }

        const existingTicket = await Ticket.findOne({ userId: user.id, status: { $in: ['open', 'claimed'] } });
        if (existingTicket) {
            return interaction.editReply({ content: `❌ Ya tienes un ticket abierto o en proceso: <#${existingTicket.channelId}>` });
        }

        try {
            const ticketChannel = await guild.channels.create({
                name: `ticket-${user.username.replace(/[^a-z0-9-]/g, '')}`,
                type: ChannelType.GuildText,
                parent: process.env.TICKET_CATEGORY_ID || null,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                    { id: ticketConfig.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                ],
            });

            const ticketEmbed = new EmbedBuilder()
                .setTitle(`Ticket de Soporte`)
                .setDescription(`¡Hola <@${user.id}>! Tu ticket ha sido creado.\n\nPor favor, describe tu problema o duda con el mayor detalle posible. Un miembro del staff te atenderá pronto.`)
                .setColor('Blue')
                .setFooter({ text: 'Puedes cerrar este ticket en cualquier momento pulsando el botón 🔒.' });

            const ticketButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`attend_ticket`).setLabel('Atender Ticket').setStyle(ButtonStyle.Primary).setEmoji('✅'),
                new ButtonBuilder().setCustomId(`close_ticket`).setLabel('Cerrar Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );

            const ticketMessage = await ticketChannel.send({ embeds: [ticketEmbed], components: [ticketButtons] });

            const newTicket = new Ticket({ userId: user.id, channelId: ticketChannel.id, guildId: guild.id, messageId: ticketMessage.id, status: 'open' });

            const logChannel = await guild.channels.fetch(ticketConfig.logChannelId);
            if (logChannel) {
                const staffNotificationEmbed = new EmbedBuilder()
                    .setTitle('🔔 Nuevo Ticket Abierto')
                    .setDescription(`Un nuevo ticket ha sido abierto por <@${user.id}>.`)
                    .addFields({ name: 'Ticket', value: `<#${ticketChannel.id}>`, inline: true }, { name: 'Estado', value: 'Abierto', inline: true })
                    .setColor('Green').setTimestamp();
                
                const staffNotificationButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ir al Ticket').setStyle(ButtonStyle.Link).setURL(ticketChannel.url));
                const logMessage = await logChannel.send({ embeds: [staffNotificationEmbed], components: [staffNotificationButtons] });
                
                newTicket.logMessageId = logMessage.id;
            }

            await newTicket.save();
            await interaction.editReply({ content: `✅ Tu ticket ha sido creado: <#${ticketChannel.id}>` });

        } catch (error) {
            console.error('Error al crear el ticket:', error);
            await interaction.editReply({ content: '❌ Hubo un error al intentar crear tu ticket. Por favor, inténtalo de nuevo más tarde.' });
        }
        return;
    }

    if (customId === 'attend_ticket') {
        await interaction.deferReply({ ephemeral: true });
        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
        const ticketConfig = await TicketConfig.findOne({ guildId: guild.id });

        if (!ticket) { return interaction.editReply({ content: '❌ Este canal no corresponde a un ticket válido.' }); }
        if (ticket.status !== 'open') { return interaction.editReply({ content: `❌ Este ticket ya está ${ticket.status === 'claimed' ? 'siendo atendido' : 'cerrado'}.` }); }
        if (!member.roles.cache.has(ticketConfig.supportRoleId) && !isAdmin) { return interaction.editReply({ content: '❌ No tienes permiso para atender tickets.' }); }

        ticket.status = 'claimed';
        ticket.claimedBy = user.id;
        await ticket.save();

        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setColor('Orange').addFields({ name: 'Atendido por', value: `<@${user.id}>` });
        const updatedButtons = ActionRowBuilder.from(interaction.message.components[0]);
        updatedButtons.components[0].setDisabled(true);

        await interaction.message.edit({ embeds: [updatedEmbed], components: [updatedButtons] });
        await interaction.editReply({ content: `✅ Has tomado este ticket. Ahora eres el responsable de atender a <@${ticket.userId}>.` });

        if (ticket.logMessageId) {
            try {
                const logChannel = await guild.channels.fetch(ticketConfig.logChannelId);
                const logMessage = await logChannel.messages.fetch(ticket.logMessageId);
                const updatedLogEmbed = EmbedBuilder.from(logMessage.embeds[0]).setTitle('📝 Ticket Atendido').setColor('Orange').spliceFields(1, 1, { name: 'Estado', value: `Atendido por <@${user.id}>`, inline: true });
                await logMessage.edit({ embeds: [updatedLogEmbed] });
            } catch (error) { console.error("Error al editar el mensaje de log (atender):", error); }
        }
        return;
    }

    if (customId === 'close_ticket') {
        await interaction.deferReply({ ephemeral: true });
        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
        const ticketConfig = await TicketConfig.findOne({ guildId: guild.id });

        if (!ticket) { return interaction.editReply({ content: '❌ Este canal no parece ser un ticket válido.' }); }
        if (ticket.status === 'closed') { return interaction.editReply({ content: '❌ Este ticket ya está en proceso de cierre.' }); }

        const canClose = member.roles.cache.has(ticketConfig.supportRoleId) || isAdmin || ticket.userId === user.id;
        if (!canClose) { return interaction.editReply({ content: '❌ No tienes permiso para cerrar este ticket.' }); }

        ticket.status = 'closed';
        await ticket.save();

        await interaction.channel.send({ content: '🔒 Este ticket ha sido cerrado y será eliminado en 10 segundos.' });
        
        if (ticket.logMessageId) {
            try {
                const logChannel = await guild.channels.fetch(ticketConfig.logChannelId);
                const logMessage = await logChannel.messages.fetch(ticket.logMessageId);
                const updatedLogEmbed = EmbedBuilder.from(logMessage.embeds[0]).setTitle('🔒 Ticket Cerrado').setColor('Red').setDescription(`El ticket de <@${ticket.userId}> fue cerrado por <@${user.id}>.`);
                await logMessage.edit({ embeds: [updatedLogEmbed], components: [] });
            } catch (error) { console.error("Error al editar el mensaje de log (cerrar):", error); }
        }

        setTimeout(async () => {
            try { await interaction.channel.delete(); } 
            catch (err) { console.error(`Error al eliminar el canal del ticket ${ticket.channelId}:`, err); }
        }, 10000);
        
        return interaction.editReply({ content: '✅ El ticket se está cerrando.' });
    }
};


// Exportamos el handler y las funciones de utilidad para que puedan ser usadas en otros archivos.
handler.updatePanelMessage = updatePanelMessage;
handler.getOrCreateWebhook = getOrCreateWebhook;
handler.sendPaginatedTeamMenu = sendPaginatedTeamMenu;
handler.sendPaginatedPlayerMenu = sendPaginatedPlayerMenu;
module.exports = handler;
