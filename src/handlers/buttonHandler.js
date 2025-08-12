const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const VPGUser = require('../models/user.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');
const recentlyNotifiedAgentAd = new Set();
const AGENT_AD_COOLDOWN = 5 * 60 * 1000; // 5 minutos en milisegundos

const POSITIONS = ['POR', 'DFC', 'CARR', 'MCD', 'MV', 'MCO', 'DC'];

async function sendPaginatedTeamMenu(interaction, teams, baseCustomId, paginationId, page, contentMessage) {
    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(teams.length / ITEMS_PER_PAGE);
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentTeams = teams.slice(startIndex, endIndex);

    if (currentTeams.length === 0) {
        return interaction.editReply({ content: 'No se encontraron equipos en esta página.', components: [] });
    }

    const teamOptions = currentTeams.map(t => ({
        label: `${t.name} (${t.abbreviation})`.substring(0, 100),
        value: t._id.toString(),
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(baseCustomId)
        .setPlaceholder(`Página ${page + 1} de ${totalPages} - Selecciona un equipo`)
        .addOptions(teamOptions);

    const navigationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`paginate_${paginationId}_${page - 1}`)
            .setLabel('◀️ Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`paginate_${paginationId}_${page + 1}`)
            .setLabel('Siguiente ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );

    const components = [new ActionRowBuilder().addComponents(selectMenu)];
    if (totalPages > 1) {
        components.push(navigationRow);
    }
    
    if (interaction.deferred || interaction.replied || customId.startsWith('paginate_')) {
        await interaction.editReply({ content: contentMessage, components });
    } else {
        await interaction.reply({ content: contentMessage, components, ephemeral: true });
    }
}

async function sendPaginatedPlayerMenu(interaction, members, page) {
    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(members.length / ITEMS_PER_PAGE);
    const startIndex = page * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentMembers = members.slice(startIndex, endIndex);

    if (currentMembers.length === 0) {
        return interaction.editReply({ content: 'No se encontraron jugadores elegibles en esta página.', components: [] });
    }

    const memberOptions = currentMembers.map(m => ({
        label: m.user.username,
        description: m.nickname || m.user.id,
        value: m.id,
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('invite_player_select')
        .setPlaceholder(`Página ${page + 1} de ${totalPages} - Selecciona un jugador a invitar`)
        .addOptions(memberOptions);

    const navigationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`paginate_invite_player_${page - 1}`)
            .setLabel('◀️ Anterior')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`paginate_invite_player_${page + 1}`)
            .setLabel('Siguiente ▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );

    const components = [new ActionRowBuilder().addComponents(selectMenu)];
    if (totalPages > 1) {
        components.push(navigationRow);
    }
    
    await interaction.editReply({ content: 'Selecciona un jugador del menú para enviarle una invitación:', components });
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
        
        let panelTitle;
        let panelColor;
        if (hasConfirmedMatch) {
            panelTitle = `Panel de Amistosos de ${hostTeam.name}`;
            panelColor = "Green";
        } else if (pendingCount > 0) {
            panelTitle = `Buscando Rival - ${hostTeam.name} (${pendingCount} Petición(es))`;
            panelColor = "Orange";
        } else {
            panelTitle = `Buscando Rival - ${hostTeam.name} (Disponible)`;
            panelColor = "Greyple";
        }
        
        let description = `**Anfitrión:** ${hostTeam.name}`;
        if (panel.leagues && panel.leagues.length > 0) {
            description += `\n**Filtro de liga:** \`${panel.leagues.join(', ')}\``;
        }

        const embed = new EmbedBuilder()
			.setAuthor({ name: hostTeam.name, iconURL: hostTeam.logoUrl })
			.setTitle(panelTitle)
			.setColor(panelColor)
			.setDescription(description)
			.setThumbnail(hostTeam.logoUrl);

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
                
                if (currentRow.components.length > 0) {
                    components.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
                currentRow.addComponents(matchInfoButton, contactButton, abandonButton);
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
                continue;

            } else { 
                const label = slot.time === 'INSTANT' ? `⚔️ Desafiar Ahora` : `⚔️ Desafiar (${slot.time})`;
                const pendingText = slot.pendingChallenges.length > 0 ? ` (${slot.pendingChallenges.length} ⏳)` : '';
                const challengeButton = new ButtonBuilder().setCustomId(`challenge_slot_${panel._id}_${slot.time}`).setLabel(label + pendingText).setStyle(ButtonStyle.Success);
                
                if (currentRow.components.length >= 5) {
                    components.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
                currentRow.addComponents(challengeButton);
            }
        }

        if (currentRow.components.length > 0) {
            components.push(currentRow);
        }

        if (pendingCount > 0) {
            const cancelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`cancel_all_challenges_${panel._id}`).setLabel('Cancelar Todas las Peticiones').setStyle(ButtonStyle.Danger)
            );
            if (components.length < 5) {
                components.push(cancelRow);
            }
        }
        
        if (components.length > 5) {
             console.error(`ERROR CRÍTICO: Se intentaron generar ${components.length} filas de componentes para el panel ${panel._id}. Se truncará a 5 para evitar un crash.`);
             components.length = 5;
        }

        await webhook.editMessage(panel.messageId, {
            content: `**Contacto:** <@${panel.postedById}>`,
            username: hostTeam.name,
            avatarURL: hostTeam.logoUrl,
            embeds: [embed],
            components
        });
    } catch (error) {
        if (error.code !== 10008) console.error("Error fatal al actualizar el panel de amistosos:", error);
    }
}


async function getOrCreateWebhook(channel, client) {
    const webhookName = 'VPG Bot Amistosos';
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.name === webhookName);
    if (!webhook) {
        webhook = await channel.createWebhook({ name: webhookName, avatar: client.user.displayAvatarURL() });
    }
    return webhook;
}

const handler = async (client, interaction) => {
    const { customId, member, guild, user } = interaction;

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
            return interaction.editReply({ content: '❌ Ya eres mánager de un equipo, no puedes registrar otro.' });
        }
        const subMenuEmbed = new EmbedBuilder().setTitle('👑 Acciones de Mánager').setDescription('Aquí tienes las acciones disponibles para la gestión de equipos.').setColor('Green');
        const subMenuRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('request_manager_role_button').setLabel('📝 Registrar mi Equipo').setStyle(ButtonStyle.Success));
        return interaction.editReply({ embeds: [subMenuEmbed], components: [subMenuRow] });
    }

    if (customId === 'player_actions_button') {
        const canLeaveTeam = interaction.member.roles.cache.has(process.env.PLAYER_ROLE_ID) || interaction.member.roles.cache.has(process.env.CAPTAIN_ROLE_ID);
        const subMenuEmbed = new EmbedBuilder().setTitle('👤 Acciones de Jugador').setDescription('Gestiona tu perfil y tu pertenencia a equipos.').setColor('Blue');
        const subMenuRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('edit_profile_button').setLabel('✏️ Actualizar Perfil').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('apply_to_team_button').setLabel('✉️ Unirme a un Equipo').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('leave_team_button').setLabel('🚪 Abandonar Equipo').setStyle(ButtonStyle.Danger).setDisabled(!canLeaveTeam)
        );
        return interaction.reply({ embeds: [subMenuEmbed], components: [subMenuRow], flags: MessageFlags.Ephemeral });
    }

     // --- NUEVO BLOQUE PARA "SÍ, AÑADIR LOGO" ---
    if (customId.startsWith('ask_logo_yes_')) {
        await interaction.deferUpdate();

        const parts = customId.split('_');
        const leagueName = parts[3];
        const teamDataString = parts.slice(4).join('_');

        const guideEmbed = getLogoGuideEmbed();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('get_imgur_link_button')
                .setLabel('Obtener Enlace para Subir Logo')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🖼️'),
            new ButtonBuilder()
                .setCustomId(`show_logo_modal_${leagueName}_${teamDataString}`)
                .setLabel('Continuar y Pegar URL')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.editReply({ embeds: [guideEmbed], components: [row] });
    }

    // --- AÑADE ESTE NUEVO BLOQUE COMPLETO ---
    else if (customId === 'get_imgur_link_button') {
        await interaction.reply({
            content: 'Aquí tienes el enlace para subir tu logo:\n\n' +
                     '👉 **https://imgur.com/upload** 👈\n\n' +
                     'Una vez que tengas la URL de la imagen, **vuelve al mensaje anterior** y pulsa **"Continuar y Pegar URL"**.',
            ephemeral: true
        });
    }

    // --- NUEVO BLOQUE PARA "NO, USAR LOGO POR DEFECTO" ---
    else if (customId.startsWith('ask_logo_no_')) {
        await interaction.deferReply({ ephemeral: true });

        const parts = customId.split('_');
        const leagueName = parts[3];
        const teamDataString = parts.slice(4).join('_');
        
        const teamData = parseTeamData(teamDataString);
        const logoUrl = 'https://i.imgur.com/WBCpaMW.png'; // Logo por defecto

        await sendApprovalRequest(interaction, client, { ...teamData, leagueName, logoUrl });

        const guideEmbed = getLogoGuideEmbed();
        await interaction.editReply({ 
            content: '✅ Tu solicitud ha sido enviada con el logo por defecto. Un administrador la revisará pronto.\n\n' +
                     '**Nota:** Podrás cambiar el logo más adelante desde el panel de gestión (`Gestionar Plantilla` -> `Editar Datos`). ' +
                     'Aquí tienes una guía para cuando la necesites:',
            embeds: [guideEmbed],
            components: [] 
        });
    }
    
    // --- NUEVO BLOQUE PARA MOSTRAR EL FORMULARIO FINAL DEL LOGO ---
    else if (customId.startsWith('show_logo_modal_')) {
        const parts = customId.split('_');
        const leagueName = parts[3];
        const teamDataString = parts.slice(4).join('_');

        const modal = new ModalBuilder()
            .setCustomId(`final_logo_submit_${leagueName}_${teamDataString}`)
            .setTitle('Pegar URL del Logo');

        const logoUrlInput = new TextInputBuilder()
            .setCustomId('teamLogoUrlInput')
            .setLabel("Pega aquí la URL de la imagen que copiaste")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Ej: https://i.imgur.com/tu_imagen.png');
            
        modal.addComponents(new ActionRowBuilder().addComponents(logoUrlInput));
        await interaction.showModal(modal);
    }

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
                return interaction.followUp({ content: 'El horario ya no existe.', ephemeral: true });
            }
            
            if (slot.status === 'CONFIRMED') {
                await message.edit({ content: '❌ Este desafío ha expirado porque ya se ha confirmado otro partido en este horario.', components: [] });
                return interaction.followUp({ content: '¡Demasiado tarde! Ya has aceptado otro desafío para este horario.', ephemeral: true });
            }

            const challengeIndex = slot.pendingChallenges.findIndex(c => c._id.toString() === challengeId);
            if (challengeIndex === -1) {
                await message.edit({ content: 'Esta petición de desafío ya no es válida o ya fue gestionada.', components: [] });
                return interaction.followUp({ content: 'La petición ya no es válida.', ephemeral: true });
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
                return interaction.followUp({ content: 'Esta invitación no es para ti.', ephemeral: true });
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

            } else { // Rechazar
                if (manager) await manager.send(`❌ El jugador **${interaction.user.tag}** ha rechazado tu invitación para unirse a **${team.name}**.`);
                await interaction.editReply({ content: 'Has rechazado la invitación al equipo.', components: [], embeds: [] });
            }
        }
        return;
    }

    if (customId.startsWith('paginate_invite_player_')) {
        await interaction.deferUpdate();
        const newPage = parseInt(customId.split('_')[3], 10);

        const allMembers = await guild.members.fetch();
        const teams = await Team.find({ guildId: guild.id }).select('managerId captains players').lean();
        const playersInTeams = new Set(teams.flatMap(t => [t.managerId, ...t.captains, ...t.players]));

        const eligibleMembers = allMembers.filter(m => !m.user.bot && !playersInTeams.has(m.id));
        
        await sendPaginatedPlayerMenu(interaction, Array.from(eligibleMembers.values()), newPage);
        return;
    }

    if (customId.startsWith('paginate_')) {
        await interaction.deferUpdate();

        const parts = customId.split('_');
        const action = parts[1]; 
        const newPage = parseInt(parts[2], 10);

        let teams;
        let baseCustomId;
        let contentMessage;

        if (action === 'view') {
            teams = await Team.find({ guildId: guild.id }).sort({ name: 1 }).lean();
            baseCustomId = 'view_team_roster_select';
            contentMessage = 'Elige un equipo para ver su plantilla:';
        } else if (action === 'apply') {
            teams = await Team.find({ guildId: guild.id, recruitmentOpen: true }).sort({ name: 1 }).lean();
            baseCustomId = 'apply_to_team_select';
            contentMessage = 'Selecciona el equipo al que quieres aplicar:';
        } else if (action === 'manage') {
            teams = await Team.find({ guildId: interaction.guildId }).sort({ name: 1 }).lean();
            baseCustomId = 'admin_select_team_to_manage';
            contentMessage = 'Selecciona el equipo que deseas gestionar:';
        } else {
            return;
        }

        if (teams && teams.length > 0) {
            await sendPaginatedTeamMenu(interaction, teams, baseCustomId, action, newPage, contentMessage);
        } else {
            await interaction.editReply({ content: 'No se encontraron equipos.', components: [] });
        }
        
        return;
    }

    if (customId.startsWith('team_submenu_')) {
        await interaction.deferReply({ flags: 64 });
        
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: '❌ Debes ser Mánager o Capitán para usar estos menús.' });

        let embed, row1, row2;

        switch (customId) {
            case 'team_submenu_roster':
                embed = new EmbedBuilder().setTitle('SUBMENÚ: GESTIÓN DE PLANTILLA').setColor('Blue').setDescription('Utiliza los botones para gestionar los miembros y datos de tu equipo.');
                row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('team_invite_player_button').setLabel('Invitar Jugador').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('team_manage_roster_button').setLabel('Gestionar Miembros').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('team_view_roster_button').setLabel('Ver Plantilla').setStyle(ButtonStyle.Secondary)
                );
                row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('team_toggle_recruitment_button').setLabel('Abrir/Cerrar Reclutamiento').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('team_edit_data_button').setLabel('Editar Datos del Equipo').setStyle(ButtonStyle.Danger)
                );
                await interaction.editReply({ embeds: [embed], components: [row1, row2] });
                break;

            case 'team_submenu_friendlies':
                embed = new EmbedBuilder().setTitle('SUBMENÚ: GESTIÓN DE AMISTOSOS').setColor('Green').setDescription('Organiza partidos, busca rivales y consulta tus amistosos confirmados.');
                row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('post_scheduled_panel').setLabel('Programar Búsqueda').setStyle(ButtonStyle.Primary).setEmoji('🗓️'),
                    new ButtonBuilder().setCustomId('post_instant_panel').setLabel('Buscar Rival (Ahora)').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
                    new ButtonBuilder().setCustomId('delete_friendly_panel').setLabel('Borrar Búsqueda').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
                    new ButtonBuilder().setCustomId('team_view_confirmed_matches').setLabel('Ver Partidos').setStyle(ButtonStyle.Secondary)
                );
                await interaction.editReply({ embeds: [embed], components: [row1] });
                break;
            
            case 'team_submenu_market':
                embed = new EmbedBuilder().setTitle('SUBMENÚ: GESTIÓN DE FICHAJES').setColor('Purple').setDescription('Publica o gestiona la oferta de fichajes de tu equipo.');
                row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('market_post_offer').setLabel('Crear / Editar Oferta').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('team_manage_offer_button').setLabel('Gestionar Oferta Existente').setStyle(ButtonStyle.Primary)
                );
                await interaction.editReply({ embeds: [embed], components: [row1] });
                break;
        }
        return; 
    }

    if (customId === 'team_invite_player_button') {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findOne({ guildId: guild.id, managerId: user.id });
        if (!team) {
            return interaction.editReply({ content: 'Solo los mánagers pueden invitar jugadores.' });
        }

        const allMembers = await guild.members.fetch();
        const teams = await Team.find({ guildId: guild.id }).select('managerId captains players').lean();
        const playersInTeams = new Set(teams.flatMap(t => [t.managerId, ...t.captains, ...t.players]));

        const eligibleMembers = allMembers.filter(m => !m.user.bot && !playersInTeams.has(m.id));

        if (eligibleMembers.size === 0) {
            return interaction.editReply({ content: 'No se encontraron miembros elegibles para invitar.' });
        }

        await sendPaginatedPlayerMenu(interaction, Array.from(eligibleMembers.values()), 0);
        return;
    }

    if (customId === 'team_manage_offer_button') {
        await interaction.deferReply({ flags: 64 });
        
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: 'No se pudo encontrar tu equipo.' });
        
        const existingOffer = await TeamOffer.findOne({ teamId: team._id });

        if (!existingOffer) {
            return interaction.editReply({ content: '❌ Tu equipo no tiene ninguna oferta de fichajes activa.' });
        }

        const embed = new EmbedBuilder()
            .setTitle(`Gestión de Oferta de Fichajes de ${team.name}`)
            .setDescription('Aquí está tu oferta actual. Puedes editarla o borrarla.')
            .addFields(
                { name: 'Posiciones Buscadas', value: `\`${existingOffer.positions.join(', ')}\`` },
                { name: 'Requisitos Actuales', value: existingOffer.requirements }
            )
            .setColor('Purple');

        const managementRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`edit_team_offer_button_${existingOffer._id}`).setLabel('Editar Oferta').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`delete_team_offer_button_${existingOffer._id}`).setLabel('Borrar Oferta').setStyle(ButtonStyle.Danger) 
        );
        
        await interaction.editReply({ embeds: [embed], components: [managementRow] });
        return;
    }

    if (customId.startsWith('delete_team_offer_button_')) {
        await interaction.deferUpdate();
        const offerId = customId.split('_')[4];

        const offerToDelete = await TeamOffer.findById(offerId);
        
        if (offerToDelete && offerToDelete.messageId) {
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
            content: '✅ La oferta de fichajes ha sido borrada.',
            embeds: [],
            components: []
        });
        return;
    }

    if (customId.startsWith('edit_team_offer_button_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: '❌ No se pudo encontrar tu equipo.' });
        
        const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
        const positionMenu = new StringSelectMenuBuilder()
            .setCustomId(`offer_select_positions_${team._id}`)
            .setPlaceholder('Selecciona las posiciones que buscas')
            .addOptions(positionOptions)
            .setMinValues(1)
            .setMaxValues(positionOptions.length);

        await interaction.editReply({
            content: '**Paso 1 de 2 (Editando):** Selecciona las posiciones que tu equipo necesita cubrir.',
            components: [new ActionRowBuilder().addComponents(positionMenu)]
        });
        return;
    }

    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    const esAprobador = isAdmin || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
    
    if (customId === 'edit_profile_button') {
        const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
        
        const primaryMenu = new StringSelectMenuBuilder()
            .setCustomId('update_select_primary_position') 
            .setPlaceholder('Paso 1: Selecciona tu posición principal')
            .addOptions(positionOptions);
        
        await interaction.reply({ 
            content: 'Vamos a actualizar tu perfil. Por favor, empieza seleccionando tu posición principal.',
            components: [new ActionRowBuilder().addComponents(primaryMenu)],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    if (customId.startsWith('market_')) {
        
        if (customId === 'market_post_agent') {
			const hasRequiredRole = member.roles.cache.has(process.env.PLAYER_ROLE_ID) || member.roles.cache.has(process.env.CAPTAIN_ROLE_ID);
			
			if (hasRequiredRole) {
				const modal = new ModalBuilder().setCustomId('market_agent_modal').setTitle('Anunciarse como Agente Libre');
				const experienceInput = new TextInputBuilder().setCustomId('experienceInput').setLabel("Tu experiencia (clubes, logros, etc.)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
				const seekingInput = new TextInputBuilder().setCustomId('seekingInput').setLabel("¿Qué tipo de equipo buscas?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500);
				const availabilityInput = new TextInputBuilder().setCustomId('availabilityInput').setLabel("Tu disponibilidad horaria").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200);
				modal.addComponents(new ActionRowBuilder().addComponents(experienceInput), new ActionRowBuilder().addComponents(seekingInput), new ActionRowBuilder().addComponents(availabilityInput));
				return interaction.showModal(modal);
			}

			if (recentlyNotifiedAgentAd.has(user.id)) {
				return interaction.reply({
					content: '❌ Ya te he enviado las instrucciones por MD hace poco. Por favor, revísalas antes de volver a intentarlo.',
					ephemeral: true
				});
			}

			const targetChannelId = '1396815232122228827';
			
			const guideEmbed = new EmbedBuilder()
				.setTitle('📝 Completa tu perfil para ser Agente Libre')
				.setColor('Orange')
				.setDescription('He visto que intentas anunciarte como Agente Libre. ¡Genial! Para poder hacerlo, primero necesitas tener el rol de "Jugador", que se te asigna automáticamente al completar tu perfil.')
				.addFields(
					{ name: 'Paso 1: Ve al canal de control', value: `Haz clic aquí para ir al canal <#${targetChannelId}>.` },
					{ name: 'Paso 2: Abre el menú de jugador', value: 'Pulsa el botón **"Acciones de Jugador"**.' },
					{ name: 'Paso 3: Completa tu perfil', value: 'En el menú que aparecerá, pulsa **"Actualizar Perfil"** y rellena todos tus datos.' }
				)
				.setFooter({ text: 'Una vez completado, recibirás el rol y podrás anunciarte sin problemas.' });

			try {
				await user.send({ embeds: [guideEmbed] });

				recentlyNotifiedAgentAd.add(user.id);
				setTimeout(() => {
					recentlyNotifiedAgentAd.delete(user.id);
				}, AGENT_AD_COOLDOWN);

				return interaction.reply({
					content: 'ℹ️ Para anunciarte, primero debes tener el rol de "Jugador". ¡Te acabo de enviar un Mensaje Directo con las instrucciones para conseguirlo!',
					ephemeral: true
				});

			} catch (error) {
				return interaction.reply({
					content: '❌ Necesitas el rol de "Jugador" para anunciarte. Intenté enviarte una guía por MD pero los tienes desactivados. Por favor, busca el canal de control y completa tu perfil.',
					ephemeral: true
				});
			}
		}
		else if (customId === 'market_post_offer') {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });

			const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
			if (!team) return interaction.editReply({ content: '❌ Solo los Mánagers o Capitanes pueden publicar ofertas.' });
			
			const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
			const positionMenu = new StringSelectMenuBuilder()
				.setCustomId(`offer_select_positions_${team._id}`)
				.setPlaceholder('Selecciona las posiciones que buscas')
				.addOptions(positionOptions)
				.setMinValues(1)
				.setMaxValues(positionOptions.length);

			await interaction.editReply({
				content: '**Paso 1 de 2:** Selecciona del menú todas las posiciones que tu equipo necesita cubrir.',
				components: [new ActionRowBuilder().addComponents(positionMenu)],
			});
		}
        else if (customId === 'market_search_teams') {
            await interaction.deferReply({ flags: 64 });
            const leagues = await League.find({ guildId: guild.id }).lean();
            const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
            const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
            const positionMenu = new StringSelectMenuBuilder().setCustomId('search_team_pos_filter').setPlaceholder('Filtrar por posición que buscan').addOptions({ label: 'Cualquier Posición', value: 'ANY' }, ...positionOptions);
            const leagueMenu = new StringSelectMenuBuilder().setCustomId('search_team_league_filter').setPlaceholder('Filtrar por liga').addOptions({ label: 'Cualquier Liga', value: 'ANY' }, ...leagueOptions);
            await interaction.editReply({ content: 'Usa los menús para filtrar las ofertas de equipo.', components: [new ActionRowBuilder().addComponents(positionMenu), new ActionRowBuilder().addComponents(leagueMenu)]});
        }
        else if (customId === 'market_search_players') {
            await interaction.deferReply({ flags: 64 });
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
                .setDescription('Aquí está tu anuncio actual. Puedes editarlo para actualizar la información o borrarlo si ya no buscas equipo.')
                .addFields(
                    { name: 'Experiencia actual', value: existingAd.experience || 'No especificado' },
                    { name: 'Equipo que busco', value: existingAd.seeking || 'No especificado' },
                    { name: 'Disponibilidad actual', value: existingAd.availability || 'No especificado' }
                )
                .setColor('Orange')
                .setFooter({ text: 'Los mánagers ven esta información cuando te buscan.' });

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
                } catch (error) {
                    console.log(`No se pudo borrar el mensaje del anuncio ${adToDelete.messageId}. Puede que ya no existiera.`);
                }
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

            const experienceInput = new TextInputBuilder().setCustomId('experienceInput').setLabel("Tu experiencia (clubes, logros, etc.)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(existingAd.experience || '');
            const seekingInput = new TextInputBuilder().setCustomId('seekingInput').setLabel("¿Qué tipo de equipo buscas?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setValue(existingAd.seeking || '');
            const availabilityInput = new TextInputBuilder().setCustomId('availabilityInput').setLabel("Tu disponibilidad horaria").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200).setValue(existingAd.availability || '');

            modal.addComponents(
                new ActionRowBuilder().addComponents(experienceInput),
                new ActionRowBuilder().addComponents(seekingInput),
                new ActionRowBuilder().addComponents(availabilityInput)
            );
            await interaction.showModal(modal);
        }
        return;
    }

    if (customId.startsWith('challenge_slot_')) {
        await interaction.deferReply({ flags: 64 });
        
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
        
        const updatedSlot = panel.timeSlots.find(s => s.time === time);
        const savedChallenge = updatedSlot.pendingChallenges.find(c => c.userId === user.id && c.teamId.equals(challengerTeam._id));

        if (!savedChallenge) {
            return interaction.editReply({ content: 'Hubo un error al procesar tu desafío. Inténtalo de nuevo.' });
        }

        const hostManager = await client.users.fetch(panel.teamId.managerId).catch(() => null);
        if (hostManager) {
            const embed = new EmbedBuilder().setTitle('⚔️ ¡Nuevo Desafío!').setDescription(`El equipo **${challengerTeam.name}** te ha desafiado para un partido a las **${time}**.`).setColor('Gold').setThumbnail(challengerTeam.logoUrl);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_challenge_${panel._id}_${time}_${savedChallenge._id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_challenge_${panel._id}_${time}_${savedChallenge._id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
            );
            await hostManager.send({ embeds: [embed], components: [row] }).catch(async () => {
                panel.timeSlots.find(s => s.time === time).pendingChallenges = panel.timeSlots.find(s => s.time === time).pendingChallenges.filter(c => !c._id.equals(savedChallenge._id));
                await panel.save();
                await interaction.editReply({ content: 'No se pudo enviar el desafío. El mánager rival tiene los MDs cerrados.' });
                await updatePanelMessage(client, panel._id);
                return;
            });
        }

        await updatePanelMessage(client, panel._id);
        return interaction.editReply({ content: '✅ ¡Desafío enviado!' });
    }
    
    if (customId.startsWith('cancel_all_challenges_')) {
        await interaction.deferReply({ flags: 64 });
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
        await interaction.deferReply({ flags: 64 });
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
        const otherManager = await client.users.fetch(otherTeam.managerId).catch(() => null);
        
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
        if (otherManager) await otherManager.send(`⚠️ El equipo **${userTeam.name}** ha cancelado vuestro partido de las **${time}**. El horario vuelve a estar libre.`).catch(()=>{});
        return;
    }

    if (customId.startsWith('contact_opponent_')) {
        await interaction.deferReply({ flags: 64 });
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
        await interaction.deferReply({ flags: 64 });
        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }] });
        if (!userTeam) return interaction.editReply({ content: 'Debes pertenecer a un equipo para ver los partidos.' });

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
            description += `**🕕 ${match.time}** vs **${match.opponent.name}**\\n> Contacto: <@${match.opponent.managerId}>\\n\\n`;
        }
        
        if (description === '') { description = 'No tienes ningún partido programado.'; }

        const embed = new EmbedBuilder()
            .setTitle(`🗓️ Amistosos Confirmados de ${userTeam.name}`)
            .setDescription(description)
            .setColor(userTeam.logoUrl ? 'Default' : '#2ecc71')
            .setThumbnail(userTeam.logoUrl)
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    if (customId === 'admin_create_league_button' || customId.startsWith('admin_dissolve_team_') || customId.startsWith('approve_request_') || customId.startsWith('admin_change_data_') || customId === 'team_edit_data_button' || customId === 'team_invite_player_button') {
        if (customId === 'admin_create_league_button') {
            if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: 64 });
            const modal = new ModalBuilder().setCustomId('create_league_modal').setTitle('Crear Nueva Liga');
            const leagueNameInput = new TextInputBuilder().setCustomId('leagueNameInput').setLabel("Nombre de la nueva liga").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(leagueNameInput));
            return interaction.showModal(modal);
        }
        if (customId.startsWith('admin_dissolve_team_')) {
            if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', flags: 64 });
            const teamId = customId.split('_')[3];
            const team = await Team.findById(teamId);
            if (!team) return interaction.reply({ content: 'Equipo no encontrado.', flags: 64 });
            const modal = new ModalBuilder().setCustomId(`confirm_dissolve_modal_${teamId}`).setTitle(`Disolver Equipo: ${team.name}`);
            const confirmationInput = new TextInputBuilder().setCustomId('confirmation_text').setLabel(`Escribe \"${team.name}\" para confirmar`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(team.name);
            modal.addComponents(new ActionRowBuilder().addComponents(confirmationInput));
            return interaction.showModal(modal);
        }
        if (customId.startsWith('approve_request_')) {
            await interaction.deferReply({ ephemeral: true });

            if (!esAprobador) return interaction.editReply({ content: 'No tienes permiso.' });

            try {
                const originalMessage = interaction.message;
                if (!originalMessage || !originalMessage.embeds[0]) {
                    return interaction.editReply({ content: 'Error: No se pudo encontrar la solicitud original.' });
                }

                const parts = customId.split('_');
                const applicantId = parts[2];
                const leagueName = parts[3];

                const embed = originalMessage.embeds[0];
                const teamName = embed.fields.find(f => f.name === 'Nombre del Equipo').value;
                const teamAbbr = embed.fields.find(f => f.name === 'Abreviatura').value;
                const teamLogoUrl = embed.fields.find(f => f.name === 'URL del Logo').value.match(/\\(([^)]+)\\)/)[1]; // Extrae la URL del formato [Ver Logo](URL)
                const twitterValue = embed.fields.find(f => f.name === 'Twitter del Equipo').value;
                const teamTwitter = (twitterValue && twitterValue !== 'No especificado') ? twitterValue : null;
                
                const applicantMember = await interaction.guild.members.fetch(applicantId).catch(() => null);
                if (!applicantMember) return interaction.editReply({ content: `Error: El usuario solicitante ya no está en el servidor.` });

                const existingTeam = await Team.findOne({ $or: [{ name: teamName }, { managerId: applicantId }], guildId: interaction.guild.id });
                if (existingTeam) return interaction.editReply({ content: `Error: Ya existe un equipo con ese nombre o el usuario ya es mánager.` });

                const newTeam = new Team({ name: teamName, abbreviation: teamAbbr, guildId: interaction.guild.id, league: leagueName, logoUrl: teamLogoUrl, managerId: applicantId, twitterHandle: teamTwitter });
                await newTeam.save();

                await applicantMember.roles.add(process.env.MANAGER_ROLE_ID);
                await applicantMember.roles.add(process.env.PLAYER_ROLE_ID);
                await applicantMember.setNickname(`|MG| ${teamAbbr} ${applicantMember.user.username}`).catch(err => console.log(`No se pudo cambiar apodo: ${err.message}`));

                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'), ButtonBuilder.from(originalMessage.components[0].components[1]).setDisabled(true));
                await originalMessage.edit({ components: [disabledRow] });
                
                try {
                    const managerGuideEmbed = new EmbedBuilder()
                        .setTitle(`👑 ¡Felicidades, Mánager! Tu equipo \"${teamName}\" ha sido aprobado.`) 
                        .setColor('Gold')
                        .setImage('https://i.imgur.com/KjamtCg.jpeg')
                        .setDescription('¡Bienvenido a la élite de la comunidad! Tu centro de mando principal es el panel del canal <#1396815967685705738>.')
                        .addFields(
                            { name: 'Paso 1: Construye tu Plantilla', value: 'Desde el submenú `Gestionar Plantilla` puedes:\\n• **`Invitar Jugador`**: Añade miembros directamente.\\n• **`Ascender a Capitán`**: Delega responsabilidades en jugadores de confianza.' },
                            { name: 'Paso 2: Mantén tu Equipo Activo', value: 'Desde los submenús correspondientes puedes:\\n• **`Gestionar Amistosos`**: Anuncia tu disponibilidad o busca rivales.\\n• **`Gestionar Fichajes`**: Publica ofertas para encontrar nuevos talentos.'},
                            { name: 'Paso 3: Administración y Consejos', value: '• **`Editar Datos del Equipo`**: Mantén actualizados el nombre, logo, etc.\\n• **`Abrir/Cerrar Reclutamiento`**: Controla si tu equipo acepta solicitudes.'}
                        );
                    await applicantMember.send({ embeds: [managerGuideEmbed] });
                } catch (dmError) {
                    console.log(`AVISO: No se pudo enviar el MD de guía al nuevo mánager ${applicantMember.user.tag}.`);
                }

                return interaction.editReply({ content: `✅ Equipo **${teamName}** creado en la liga **${leagueName}**. ${applicantMember.user.tag} es ahora Mánager.` });

            } catch (error) {
                console.error("Error en aprobación de equipo:", error);
                return interaction.editReply({ content: 'Ocurrió un error inesperado.' });
            }
        }
     // --- INICIO DEL BLOQUE DE EDICIÓN FINAL Y FUNCIONAL ---

        // --- INICIO DEL BLOQUE DE EDICIÓN FINAL Y FUNCIONAL ---

if (customId.startsWith('admin_change_data_') || customId === 'team_edit_data_button') {
    
    // Se ha eliminado la lógica de enviar MDs desde aquí para evitar dobles respuestas.
    // La única responsabilidad de este bloque ahora es mostrar el formulario (modal).

    let team;
    if (customId.startsWith('admin_change_data_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const teamId = customId.split('_')[3];
        team = await Team.findById(teamId);
    } else {
        team = await Team.findOne({ guildId: guild.id, managerId: user.id });
    }

    // Si no se encuentra el equipo, respondemos aquí y detenemos la ejecución.
    // Esto es seguro porque es la primera y única respuesta.
    if (!team) {
        return interaction.reply({ content: 'No se encontró el equipo para editar o no tienes los permisos necesarios.', ephemeral: true });
    }

    const modalTitle = `Editar Datos de ${team.name}`.substring(0, 45);
    const modal = new ModalBuilder().setCustomId(`edit_data_modal_${team._id}`).setTitle(modalTitle);
    
    const newNameInput = new TextInputBuilder().setCustomId('newName').setLabel("Nuevo Nombre (Opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.name);
    const newAbbrInput = new TextInputBuilder().setCustomId('newAbbr').setLabel("Nueva Abreviatura (Opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.abbreviation).setMinLength(3).setMaxLength(3);
    const newLogoInput = new TextInputBuilder().setCustomId('newLogo').setLabel("Nueva URL Del Logo (Opcional)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Pega aquí el nuevo enlace si quieres cambiarlo.');
    const newTwitterInput = new TextInputBuilder().setCustomId('newTwitter').setLabel("Twitter del Equipo (Solo Usuario, Sin @)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.twitterHandle || '');

    modal.addComponents(
        new ActionRowBuilder().addComponents(newNameInput),
        new ActionRowBuilder().addComponents(newAbbrInput),
        new ActionRowBuilder().addComponents(newLogoInput),
        new ActionRowBuilder().addComponents(newTwitterInput)
    );
    
    // Mostramos el modal como la única y primera respuesta a la interacción.
    await interaction.showModal(modal);
}

// --- FIN DEL BLOQUE DE EDICIÓN ---
        
        if (customId === 'team_invite_player_button') {
            const team = await Team.findOne({ guildId: guild.id, managerId: user.id });
            if (!team) return interaction.reply({ content: 'Solo los mánagers pueden invitar.', flags: 64 });
            const modal = new ModalBuilder().setCustomId(`invite_player_modal_${team._id}`).setTitle(`Invitar Jugador a ${team.name}`);
            const playerNameInput = new TextInputBuilder().setCustomId('playerName').setLabel("Nombre de usuario (o parte) del jugador").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(playerNameInput));
            return interaction.showModal(modal);
        }
    }
    
    if (customId.startsWith('reject_request_') || customId.startsWith('promote_player_') || customId.startsWith('demote_captain_') || customId.startsWith('kick_player_') || customId.startsWith('toggle_mute_player_')) {
        await interaction.deferUpdate();
        if (customId.startsWith('reject_request_')) {
            if (!esAprobador) return interaction.followUp({ content: 'No tienes permiso.', ephemeral: true });
            const applicantId = customId.split('_')[2];
            const applicant = await guild.members.fetch(applicantId).catch(()=>null);
            const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true), ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true));
            await interaction.message.edit({ components: [disabledRow] });
            await interaction.followUp({ content: `La solicitud de **${applicant ? applicant.user.tag : 'un usuario'}** ha sido rechazada.`, ephemeral: true });
            if (applicant) await applicant.send(`Tu solicitud para registrar un equipo ha sido rechazada.`).catch(() => {});
        } else if (customId.startsWith('promote_player_') || customId.startsWith('demote_captain_') || customId.startsWith('kick_player_') || customId.startsWith('toggle_mute_player_')) {
            const targetId = customId.substring(customId.lastIndexOf('_') + 1);
            const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: user.id }, { captains: user.id }] });
            if(!team) return interaction.editReply({ content: 'No tienes permisos sobre este equipo.', components: []});
            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
            if(!targetMember) return interaction.editReply({ content: 'Miembro no encontrado.', components: []});
            const isManagerAction = team.managerId === user.id;
            if(customId.startsWith('kick_player_')) {
                const isTargetCaptain = team.captains.includes(targetId);
                if(isTargetCaptain && !isManagerAction) return interaction.editReply({content: 'Un capitán no puede expulsar a otro capitán.', components: []});
                team.players = team.players.filter(p => p !== targetId);
                team.captains = team.captains.filter(c => c !== targetId);
                await targetMember.roles.remove([process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(targetMember.user.username).catch(()=>{});
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido expulsado.`, components: [] });
            } else if (customId.startsWith('promote_player_')) {
                if(!isManagerAction) return interaction.editReply({content: 'Solo el Mánager puede ascender.', components: []});
                team.players = team.players.filter(p => p !== targetId);
                team.captains.push(targetId);
                await targetMember.roles.remove(process.env.PLAYER_ROLE_ID).catch(()=>{});
                await targetMember.roles.add(process.env.CAPTAIN_ROLE_ID).catch(()=>{});
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`|C| ${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                // --- INICIO DEL CÓDIGO AÑADIDO: MD de bienvenida al Capitán ---
                try {
                    const captainGuideEmbed = new EmbedBuilder()
                        .setTitle(`🛡️ ¡Enhorabuena! Has sido ascendido a Capitán de \"${team.name}\".`) 
                        .setColor('Blue')
                        .setDescription(`El Mánager confía en ti para ser su mano derecha. Has obtenido acceso a nuevas herramientas en el panel de equipo de <#1396815967685705738> para ayudar en la gestión.`) 
                        .addFields(
                            { 
                                name: '✅ Tus Nuevas Responsabilidades', 
                                value: '• **Gestionar Amistosos**: Eres clave para mantener al equipo en forma. Puedes programar y buscar partidos.\\n' + 
                                       '• **Gestionar Fichajes**: Ayuda a buscar nuevos talentos creando y actualizando las ofertas del equipo.\\n' + 
                                       '• **Gestionar Miembros**: Mantén el orden. Puedes expulsar jugadores (excepto a otros capitanes) y usar la función de mutear en el chat de equipo.'
                            },
                            {
                                name: '❌ Límites de tu Rol (Reservado al Mánager)', 
                                value: '• No puedes editar los datos principales del equipo (nombre, logo).\\n' + 
                                       '• No puedes invitar jugadores directamente.\\n' + 
                                       '• No puedes ascender o degradar a otros miembros.'
                            },
                            {
                                name: '💡 Un Rol de Liderazgo',
                                value: 'Eres un pilar fundamental y un ejemplo para la plantilla. Usa tus nuevas herramientas con responsabilidad para llevar al equipo al éxito.'
                            }
                        );

                    await targetMember.send({ embeds: [captainGuideEmbed] });
                } catch (dmError) {
                    console.log(`AVISO: No se pudo enviar el MD de guía al nuevo capitán ${targetMember.user.tag}.`);
                }
                // --- FIN DEL CÓDIGO AÑADIDO ---
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ascendido a Capitán.`, components: [] });
            } else if (customId.startsWith('demote_captain_')) {
                if(!isManagerAction) return interaction.editReply({content: 'Solo el Mánager puede degradar.', components: []});
                team.captains = team.captains.filter(c => c !== targetId);
                team.players.push(targetId);
                await targetMember.roles.remove(process.env.CAPTAIN_ROLE_ID).catch(()=>{});
                await targetMember.roles.add(process.env.PLAYER_ROLE_ID).catch(()=>{});
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** degradado a Jugador.`, components: [] });
            } else if (customId.startsWith('toggle_mute_player_')) {
                if(team.captains.includes(targetId) && !isManagerAction) return interaction.editReply({ content: 'No puedes mutear a un capitán.', components: [] });
                const hasMutedRole = targetMember.roles.cache.has(process.env.MUTED_ROLE_ID);
                if (hasMutedRole) {
                    await targetMember.roles.remove(process.env.MUTED_ROLE_ID);
                    await interaction.editReply({ content: `✅ **${targetMember.user.username}** desmuteado.`, components: [] });
                } else {
                    await targetMember.roles.add(process.env.MUTED_ROLE_ID);
                    await interaction.editReply({ content: `🔇 **${targetMember.user.username}** muteado.`, components: [] });
                }
            }
            await team.save();
        }
        return; 
    }
    
    if (customId === 'request_manager_role_button') {
        await interaction.deferReply({ flags: 64 });
        const existingTeam = await Team.findOne({ $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }], guildId: guild.id });
        if (existingTeam) return interaction.editReply({ content: `Ya perteneces al equipo **${existingTeam.name}**. ` });
        const leagues = await League.find({ guildId: guild.id });
        if(leagues.length === 0) return interaction.editReply({ content: 'No hay ligas configuradas.' });
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('select_league_for_registration').setPlaceholder('Selecciona la liga').addOptions(leagueOptions);
        return interaction.editReply({ content: 'Selecciona la liga para tu equipo:', components: [new ActionRowBuilder().addComponents(selectMenu)]});
    }

    if (customId === 'view_teams_button') {
    await interaction.deferReply({ ephemeral: true });
    const teams = await Team.find({ guildId: guild.id }).sort({ name: 1 }).lean();
    if (teams.length === 0) {
        return interaction.editReply({ content: 'No hay equipos registrados.' });
    }
    await sendPaginatedTeamMenu(interaction, teams, 'view_team_roster_select', 'view', 0, 'Elige un equipo para ver su plantilla:');
}

if (customId === 'team_view_roster_button') {
    await interaction.deferReply({ flags: 64 });
    const teamToView = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }] });
    if (!teamToView) return interaction.editReply({ content: 'No perteneces a ningún equipo.' });
    // El resto de la lógica para ver tu propia plantilla queda igual
    const allMemberIds = [teamToView.managerId, ...teamToView.captains, ...teamToView.players].filter(id => id);
     if (allMemberIds.length === 0) return interaction.editReply({ content: 'Tu equipo no tiene miembros.' });
     const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } }).lean();
     const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));
     let rosterString = '';
     const fetchMemberInfo = async (ids, roleName) => {
         if (!ids || ids.length === 0) return;
         rosterString += `\\n**${roleName}**\\n`;
         for (const memberId of ids) {
             try {
                const memberData = await guild.members.fetch(memberId);
                const vpgUser = memberMap.get(memberId)?.vpgUsername || 'N/A';
                rosterString += `> ${memberData.user.username} (${vpgUser})\\n`;
             } catch (error) { rosterString += `> *Usuario no encontrado (ID: ${memberId})*\\n`; }
         }
     };
     await fetchMemberInfo([teamToView.managerId].filter(Boolean), '👑 Mánager');
     await fetchMemberInfo(teamToView.captains, '🛡️ Capitanes');
     await fetchMemberInfo(teamToView.players, 'Jugadores');
     const embed = new EmbedBuilder().setTitle(`Plantilla de ${teamToView.name}`).setDescription(rosterString.trim() || 'Este equipo no tiene miembros.').setColor('#3498db').setThumbnail(teamToView.logoUrl).setFooter({ text: `Liga: ${teamToView.league}` });
     return interaction.editReply({ embeds: [embed] });
}

    if (customId === 'apply_to_team_button') {
    await interaction.deferReply({ ephemeral: true });
    const isManager = await Team.findOne({ guildId: guild.id, managerId: user.id });
    if (isManager) {
        return interaction.editReply({ content: '❌ Como Mánager de un equipo, no puedes enviar solicitudes de unión a otros equipos.' });
    }
    const existingApplication = await PlayerApplication.findOne({ userId: user.id, status: 'pending' });
    if (existingApplication) {
        return interaction.editReply({ content: 'Ya tienes una solicitud de aplicación pendiente.' });
    }
    
    const openTeams = await Team.find({ guildId: guild.id, recruitmentOpen: true }).sort({ name: 1 }).lean();
    if (openTeams.length === 0) {
        return interaction.editReply({ content: 'No hay equipos con reclutamiento abierto en este momento.' });
    }

    // Llama a la nueva función de paginación
    await sendPaginatedTeamMenu(interaction, openTeams, 'apply_to_team_select', 'apply', 0, 'Selecciona el equipo al que quieres aplicar:');
}

    if (customId === 'leave_team_button') {
        await interaction.deferReply({ flags: 64 });
        const teamToLeave = await Team.findOne({ guildId: guild.id, $or: [{ captains: user.id }, { players: user.id }] });
        if (!teamToLeave) return interaction.editReply({ content: 'No perteneces a un equipo como jugador o capitán.' });
        teamToLeave.players = teamToLeave.players.filter(p => p !== user.id);
        teamToLeave.captains = teamToLeave.captains.filter(c => c !== user.id);
        await teamToLeave.save();
        await member.roles.remove([process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
        if (member.id !== guild.ownerId) await member.setNickname(user.username).catch(()=>{});
        await interaction.editReply({ content: `Has abandonado el equipo **${teamToLeave.name}**. ` });
        const manager = await client.users.fetch(teamToLeave.managerId).catch(() => null);
        if (manager) await manager.send(`El jugador **${user.tag}** ha abandonado tu equipo.`);
        return;
    }

    if (customId === 'admin_delete_league_button') {
        await interaction.deferReply({ flags: 64 });
        if (!isAdmin) return interaction.editReply({content: 'Acción restringida.'});
        const leagues = await League.find({ guildId: guild.id });
        if (leagues.length === 0) return interaction.editReply({ content: 'No hay ligas para borrar.' });
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('delete_league_select_menu').setPlaceholder('Selecciona las ligas a eliminar').addOptions(leagueOptions).setMinValues(1).setMaxValues(leagues.length);
        return interaction.editReply({ content: 'Selecciona del menú las ligas que quieres borrar:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    // ESTE ES EL BLOQUE CORREGIDO PARA EL BOTÓN DE "GESTIONAR EQUIPO" DEL ADMIN
if (customId === 'admin_manage_team_button') {
    await interaction.deferReply({ ephemeral: true });
    
    // Comprobamos si es admin
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isAdmin) {
        return interaction.editReply({content: 'Acción restringida.'});
    }
    
    const teams = await Team.find({ guildId: interaction.guildId }).sort({ name: 1 }).lean();
    if (teams.length === 0) {
        return interaction.editReply({ content: 'No hay equipos registrados para gestionar.' });
    }
    
    // Llama a la nueva función de paginación
    await sendPaginatedTeamMenu(interaction, teams, 'admin_select_team_to_manage', 'manage', 0, 'Selecciona el equipo que deseas gestionar:');
}

    if (customId.startsWith('admin_manage_members_') || customId === 'team_manage_roster_button') {
        await interaction.deferReply({ flags: 64 });
        let teamToManage;
        if (customId.startsWith('admin_manage_members_')) {
            if (!isAdmin) return interaction.editReply({ content: 'Acción restringida.' });
            const teamId = customId.split('_')[3];
            teamToManage = await Team.findById(teamId);
        } else {
            teamToManage = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        }
        if (!teamToManage) return interaction.editReply({ content: 'No se encontró el equipo o no tienes permisos.' });
        const memberIds = [teamToManage.managerId, ...teamToManage.captains, ...teamToManage.players].filter(id => id);
        if (memberIds.length === 0) return interaction.editReply({ content: 'Este equipo no tiene miembros.' });
        const membersCollection = await guild.members.fetch({ user: memberIds });
        const memberOptions = membersCollection.map(member => {
            let description = 'Jugador';
            if (teamToManage.managerId === member.id) description = 'Mánager';
            else if (teamToManage.captains.includes(member.id)) description = 'Capitán';
            return { label: member.user.username, description: description, value: member.id, };
        });
        if (memberOptions.length === 0) return interaction.editReply({ content: 'No se encontraron miembros válidos.' });
        const selectMenu = new StringSelectMenuBuilder().setCustomId('roster_management_menu').setPlaceholder('Selecciona un miembro').addOptions(memberOptions);
        return interaction.editReply({ content: 'Gestionando miembros de **' + teamToManage.name + '**:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    if (customId === 'admin_view_pending_requests') {
        await interaction.deferReply({ flags: 64 });
        if (!isAdmin) return interaction.editReply({content: 'Acción restringida.'});
        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        if (!approvalChannelId) return interaction.editReply({ content: 'El canal de aprobaciones no está configurado.' });
        
        const channel = await guild.channels.fetch(approvalChannelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: 'No se pudo encontrar el canal de aprobaciones.' });

        const messages = await channel.messages.fetch({ limit: 50 });
        const pendingRequests = messages.filter(m => 
            m.author.id === client.user.id &&
            m.embeds.length > 0 &&
            m.embeds[0].title === '📝 Nueva Solicitud de Registro' &&
            m.components.length > 0 &&
            !m.components[0].components[0].disabled 
        );

        if (pendingRequests.size === 0) {
            return interaction.editReply({ content: '✅ No hay solicitudes de registro pendientes.' });
        }

        const description = pendingRequests.map(m => {
            const teamName = m.embeds[0].fields.find(f => f.name === 'Nombre del Equipo')?.value || 'N/A';
            const userTag = m.embeds[0].author.name || 'N/A';
            return `> **${teamName}** por ${userTag} - [Ir a la solicitud](${m.url})`;
        }).join('\\n');

        const embed = new EmbedBuilder()
            .setTitle(`⏳ ${pendingRequests.size} Solicitud(es) Pendiente(s)`) 
            .setDescription(description)
            .setColor('Yellow')
            .setTimestamp();
            
        return interaction.editReply({ embeds: [embed] });
    }
    
   
    
    // REEMPLAZA CON ESTE BLOQUE
if (customId === 'team_toggle_recruitment_button') {
    await interaction.deferReply({ flags: 64 });
    // Se busca el equipo del usuario que interactúa con el botón
    const team = await Team.findOne({ guildId: interaction.guild.id, managerId: user.id });
    
    if (!team) {
        return interaction.editReply({ content: 'Solo los mánagers de un equipo pueden hacer esto.' });
    }

    team.recruitmentOpen = !team.recruitmentOpen;
    await team.save();
    return interaction.editReply({ content: `El reclutamiento está ahora **${team.recruitmentOpen ? 'ABIERTO' : 'CERRADO'}**.` });
}

// Lógica para el botón de BORRAR


// Lógica para el botón de EDITAR (abre un formulario)

    // REEMPLAZA CON ESTE BLOQUE
if (customId === 'post_scheduled_panel' || customId === 'post_instant_panel') {
    await interaction.deferReply({ flags: 64 });

    const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
    if (!team) return interaction.editReply({ content: 'Debes ser mánager o capitán para crear un panel.' });

    const panelType = customId === 'post_scheduled_panel' ? 'SCHEDULED' : 'INSTANT';
    const existingPanel = await AvailabilityPanel.findOne({ teamId: team._id, panelType });
    if (existingPanel) return interaction.editReply({ content: `Tu equipo ya tiene un panel de amistosos de tipo ${panelType} activo. Bórralo primero.` });
        const leagues = await League.find({ guildId: guild.id });
        const components = [];
        if (leagues.length > 0) {
            const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
            const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_league_filter_${panelType}`).setPlaceholder('Filtrar por ligas (opcional)').addOptions(leagueOptions).setMinValues(0).setMaxValues(leagues.length);
            components.push(new ActionRowBuilder().addComponents(selectMenu));
        }
        const button = new ButtonBuilder().setCustomId(`continue_panel_creation_${panelType}_all`).setLabel('Buscar en TODAS las Ligas').setStyle(ButtonStyle.Primary);
        if (components.length === 0) {
            return interaction.editReply({ content: 'Pulsa el botón para continuar.', components: [new ActionRowBuilder().addComponents(button)] });
        }
        components.push(new ActionRowBuilder().addComponents(button));
        return interaction.editReply({ content: 'Selecciona las ligas para las que quieres buscar rival, o busca en todas.', components: components });
    }

    if (customId.startsWith('continue_panel_creation_')) {
        await interaction.deferReply({ flags: 64 });
        const parts = customId.split('_');
        const panelType = parts[3];
        const leaguesString = parts.slice(4).join('_');
        const leagues = leaguesString === 'all' || leaguesString === 'none' || !leaguesString ? [] : leaguesString.split(',');
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: 'No se ha podido encontrar tu equipo.' });
        if (panelType === 'SCHEDULED') {
            const timeSlots = ['22:00', '22:20', '22:40', '23:00', '23:20', '23:40'];
            const timeOptions = timeSlots.map(time => ({ label: time, value: time }));
            const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_available_times_${leagues.join(',') || 'all'}`).setPlaceholder('Selecciona tus horarios disponibles').addOptions(timeOptions).setMinValues(1).setMaxValues(timeSlots.length);
            return interaction.editReply({ content: 'Elige los horarios en los que tu equipo está disponible:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
        } else {
            const channelId = process.env.INSTANT_FRIENDLY_CHANNEL_ID;
            if (!channelId) return interaction.editReply({ content: 'Error: El ID del canal de amistosos instantáneos no está configurado.' });
            const channel = await client.channels.fetch(channelId).catch(()=>null);
            if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos instantáneos.' });
            
            const initialEmbed = new EmbedBuilder().setTitle(`Buscando Rival - ${team.name} (Disponible)`).setColor("Greyple");
            const webhook = await getOrCreateWebhook(channel, client);
            const message = await webhook.send({ embeds: [initialEmbed], username: team.name, avatarURL: team.logoUrl });
            
            const panel = new AvailabilityPanel({ 
                guildId: guild.id, channelId, messageId: message.id, teamId: team._id, postedById: user.id, panelType: 'INSTANT', leagues,
                timeSlots: [{ time: 'INSTANT', status: 'AVAILABLE' }] 
            });
            await panel.save();
            await updatePanelMessage(client, panel._id);
            return interaction.editReply({ content: '​' });
        }
    }

    if (customId === 'delete_friendly_panel') {
        await interaction.deferReply({ flags: 64 });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`confirm_delete_panel_SCHEDULED`).setLabel('Borrar Panel Programado').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`confirm_delete_panel_INSTANT`).setLabel('Borrar Panel Instantáneo').setStyle(ButtonStyle.Danger)
        );
        return interaction.editReply({ content: '¿Qué tipo de búsqueda de amistoso quieres borrar?', components: [row] });
    }
    
    if (customId.startsWith('confirm_delete_panel_')) {
        await interaction.deferReply({ flags: 64 });
        const [, , , panelType] = customId.split('_');
        const teamToDeleteFrom = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!teamToDeleteFrom) {
            return interaction.editReply({ content: "No se pudo encontrar tu equipo para realizar esta acción." });
        }
        const existingPanel = await AvailabilityPanel.findOneAndDelete({ teamId: teamToDeleteFrom._id, panelType: panelType });
        if (!existingPanel) {
            return interaction.editReply({ content: `No se encontró un panel de tipo **${panelType}** activo que pertenezca a tu equipo.` });
        }
        try {
            const channel = await client.channels.fetch(existingPanel.channelId);
            const webhook = await getOrCreateWebhook(channel, client);
            await webhook.deleteMessage(existingPanel.messageId);
        } catch(e) {
            console.log(`No se pudo borrar el mensaje del panel (ID: ${existingPanel.messageId}) porque probablemente ya no existía.`);
        }
        return interaction.editReply({ content: `✅ Tu panel de amistosos de tipo **${panelType}** ha sido eliminado.` });
    }
};
function getLogoGuideEmbed() {
    return new EmbedBuilder()
        .setTitle('Guía para Añadir/Cambiar un Logo')
        .setColor('Blue')
        .setDescription(
            'Para usar un logo personalizado, necesitas un enlace directo a la imagen. Sigue estos sencillos pasos:\\n\\n' + 
            '1. Abre el siguiente enlace en tu navegador:\\n' + 
            '👉 **https://imgur.com/upload** 👈\\n\\n' + 
            '2. Arrastra tu imagen a la página de Imgur.\\n\\n' + 
            '3. Una vez subida, haz **clic derecho** sobre la imagen y selecciona **"Copiar dirección de imagen"**.\\n\\n' + 
            'Esa URL es la que deberás pegar en el campo \"Nueva URL Del Logo\" del formulario de edición.'
        );
}

function parseTeamData(dataString) {
    const data = {};
    dataString.split('|||').forEach(part => {
        const [key, value] = part.split(':', 2); // El 2 asegura que solo divida en el primer ':'
        data[key] = value === 'none' ? null : value;
    });
    return data;
}

async function sendApprovalRequest(interaction, client, { vpg, name, abbr, twitter, leagueName, logoUrl }) {
    const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
    if (!approvalChannelId) return;
    const approvalChannel = await client.channels.fetch(approvalChannelId).catch(() => null);
    if(!approvalChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📝 Nueva Solicitud de Registro')
        .setColor('Orange')
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setThumbnail(logoUrl && logoUrl.startsWith('http') ? logoUrl : null)
        .addFields(
            { name: 'Usuario VPG', value: vpg }, 
            { name: 'Nombre del Equipo', value: name }, 
            { name: 'Abreviatura', value: abbr }, 
            { name: 'Twitter del Equipo', value: twitter || 'No especificado' },
            { name: 'URL del Logo', value: `[Ver Logo](${logoUrl})` },
            { name: 'Liga Seleccionada', value: leagueName }
        )
        .setTimestamp();
        
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_request_${interaction.user.id}_${leagueName}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), 
        new ButtonBuilder().setCustomId(`reject_request_${interaction.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
    );
    await approvalChannel.send({ content: `**Solicitante:** <@${interaction.user.id}>`, embeds: [embed], components: [row] });
}

handler.updatePanelMessage = updatePanelMessage;
handler.getOrCreateWebhook = getOrCreateWebhook;
module.exports = handler;
