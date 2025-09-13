// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const Team = require('../models/team.js');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');
const { updatePanelMessage, getOrCreateWebhook } = require('./buttonHandler.js');


const POSITIONS = ['POR', 'DFC', 'CARR', 'MCD', 'MV', 'MCO', 'DC'];

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0];

    if (customId.startsWith('admin_select_new_manager_')) {
    await interaction.deferUpdate();

    const teamId = customId.split('_')[4];
    const newManagerId = values[0];

    const team = await Team.findById(teamId);
    if (!team) return interaction.followUp({ content: '❌ El equipo ya no existe.', flags: MessageFlags.Ephemeral });
    if (team.managerId === newManagerId) return interaction.editReply({ content: '⚠️ Has seleccionado al mánager actual. No se ha realizado ningún cambio.', components: [] });
    
    const isAlreadyManager = await Team.findOne({ managerId: newManagerId });
    if (isAlreadyManager) {
        return interaction.followUp({ content: `❌ El usuario seleccionado ya es mánager del equipo **${isAlreadyManager.name}**.`, flags: MessageFlags.Ephemeral });
    }
    
    const oldManagerId = team.managerId;
    const oldManagerMember = await guild.members.fetch(oldManagerId).catch(() => null);
    const newManagerMember = await guild.members.fetch(newManagerId).catch(() => null);

    if (!newManagerMember) return interaction.followUp({ content: '❌ El nuevo mánager seleccionado no se encuentra en el servidor.', flags: MessageFlags.Ephemeral });

    // --- 1. Procesar al Antiguo Mánager ---
    if (oldManagerMember) {
        await oldManagerMember.roles.remove(process.env.MANAGER_ROLE_ID);
        // Lo degradamos a jugador normal
        await oldManagerMember.roles.add(process.env.PLAYER_ROLE_ID);
        await oldManagerMember.setNickname(`${team.abbreviation} ${oldManagerMember.user.username}`).catch(() => {});
        
        // Lo añadimos a la lista de jugadores en la base de datos
        if (!team.players.includes(oldManagerId)) {
            team.players.push(oldManagerId);
        }
        await oldManagerMember.send(`Un administrador te ha reasignado. Ya no eres el mánager de **${team.name}** y ahora figuras como jugador.`).catch(() => {});
    }

    // --- 2. Procesar al Nuevo Mánager ---
    team.managerId = newManagerId;
    // Si el nuevo mánager ya era capitán o jugador, lo eliminamos de esas listas para evitar duplicados.
    team.captains = team.captains.filter(id => id !== newManagerId);
    team.players = team.players.filter(id => id !== newManagerId);

    await newManagerMember.roles.add([process.env.MANAGER_ROLE_ID, process.env.PLAYER_ROLE_ID]);
    await newManagerMember.roles.remove(process.env.CAPTAIN_ROLE_ID).catch(() => {}); // Por si era capitán
    await newManagerMember.setNickname(`|MG| ${team.abbreviation} ${newManagerMember.user.username}`).catch(() => {});
    
    // --- 3. Guardar y Notificar ---
    await team.save();

    await newManagerMember.send(`¡Enhorabuena! Un administrador te ha asignado como nuevo Mánager de **${team.name}**.`).catch(() => {});

    await interaction.editReply({
        content: `✅ **¡Cambio de mánager completado!**\n- <@${oldManagerId}> ha sido degradado a jugador.\n- <@${newManagerId}> es ahora el nuevo mánager de **${team.name}**.`,
        components: []
    });
    return;
}
    
    if (customId === 'admin_select_manager_for_creation') {
    const managerId = values[0];

    const isAlreadyInTeam = await Team.findOne({ guildId: interaction.guild.id, $or: [{ managerId }, { captains: managerId }, { players: managerId }] });
    if (isAlreadyInTeam) {
        return interaction.reply({ content: `❌ El usuario seleccionado ya pertenece al equipo **${isAlreadyInTeam.name}**.`, flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder().setCustomId(`admin_create_team_modal_${managerId}`).setTitle('Paso 2: Datos del Nuevo Equipo');
    const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre del equipo").setStyle(TextInputStyle.Short).setRequired(true);
    const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
    const leagueNameInput = new TextInputBuilder().setCustomId('leagueName').setLabel("Nombre de la liga (debe existir)").setStyle(TextInputStyle.Short).setRequired(true);
    const logoUrlInput = new TextInputBuilder().setCustomId('logoUrl').setLabel("URL del logo (opcional)").setStyle(TextInputStyle.Short).setRequired(false);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(teamNameInput),
        new ActionRowBuilder().addComponents(teamAbbrInput),
        new ActionRowBuilder().addComponents(leagueNameInput),
        new ActionRowBuilder().addComponents(logoUrlInput)
    );
    
    await interaction.showModal(modal);
    return;
}

if (customId.startsWith('admin_select_members_')) {
    await interaction.deferUpdate();
    const parts = customId.split('_');
    const roleToAdd = parts[3]; // 'captains' o 'players'
    const teamId = parts[4];
    const selectedUserIds = values;

    const team = await Team.findById(teamId);
    if (!team) return interaction.editReply({ content: '❌ El equipo ya no existe.', components: [] });

    let addedCount = 0;
    let failedUsernames = [];

    for (const userId of selectedUserIds) {
        const isAlreadyInTeam = await Team.findOne({ guildId: interaction.guild.id, $or: [{ managerId: userId }, { captains: userId }, { players: userId }] });
        if (isAlreadyInTeam) {
            const member = await guild.members.fetch(userId).catch(() => ({ user: { username: 'Usuario Desconocido' } }));
            failedUsernames.push(member.user.username);
            continue;
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
            if (roleToAdd === 'captains') {
                team.captains.push(userId);
                await member.roles.add([process.env.CAPTAIN_ROLE_ID, process.env.PLAYER_ROLE_ID]);
                await member.setNickname(`|C| ${team.abbreviation} ${member.user.username}`).catch(() => {});
            } else {
                team.players.push(userId);
                await member.roles.add(process.env.PLAYER_ROLE_ID);
                await member.setNickname(`${team.abbreviation} ${member.user.username}`).catch(() => {});
            }
            addedCount++;
        }
    }

    await team.save();
    
    let responseMessage = `✅ Se han añadido **${addedCount}** nuevos ${roleToAdd === 'captains' ? 'capitanes' : 'jugadores'} al equipo **${team.name}**.`;
    if (failedUsernames.length > 0) {
        responseMessage += `\n\n⚠️ Los siguientes usuarios no se pudieron añadir porque ya pertenecen a otro equipo: ${failedUsernames.join(', ')}.`;
    }

    await interaction.editReply({ content: responseMessage, components: [] });
    return;
}

    if (customId === 'invite_player_select') {
        await interaction.deferUpdate();
        const targetId = selectedValue;

        const team = await Team.findOne({ guildId: guild.id, managerId: user.id });
        if (!team) {
            return interaction.editReply({ content: 'No se ha encontrado tu equipo o ya no eres el mánager.', components: [] });
        }

        const targetMember = await guild.members.fetch(targetId).catch(() => null);
        if (!targetMember) {
            return interaction.editReply({ content: 'El miembro seleccionado ya no se encuentra en el servidor.', components: [] });
        }

        const isManager = await Team.findOne({ managerId: targetMember.id });
        if (isManager) {
            return interaction.editReply({ content: `❌ No puedes invitar a **${targetMember.user.tag}** porque ya es Mánager del equipo **${isManager.name}**.`, components: [] });
        }

        const embed = new EmbedBuilder().setTitle(`📩 Invitación de Equipo`).setDescription(`Has sido invitado a unirte a **${team.name}**.`).setColor('Green').setThumbnail(team.logoUrl);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_invite_${team._id}_${targetMember.id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_invite_${team._id}_${targetMember.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );
        
        try {
            await targetMember.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: `✅ Invitación enviada a **${targetMember.user.tag}**.`, components: [] });
        } catch (error) {
            return interaction.editReply({ content: `❌ No se pudo enviar la invitación a ${targetMember.user.tag}. Es posible que tenga los MDs cerrados.`, components: [] });
        }
    }

    if (customId === 'update_select_primary_position') {
        await interaction.deferUpdate();
        const selectedPosition = values[0];
        await VPGUser.findOneAndUpdate({ discordId: user.id }, { primaryPosition: selectedPosition }, { upsert: true });

        const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
        const secondaryMenu = new StringSelectMenuBuilder()
            .setCustomId('update_select_secondary_position')
            .setPlaceholder('Paso 2: Selecciona tu posición secundaria')
            .addOptions({ label: 'Ninguna', value: 'NINGUNA' }, ...positionOptions);

        await interaction.editReply({
            content: '✅ Posición principal guardada. Ahora, selecciona tu posición secundaria.',
            components: [new ActionRowBuilder().addComponents(secondaryMenu)]
        });
        return;
    }
    
    if (customId === 'update_select_secondary_position') {
        const selectedPosition = values[0];
        await VPGUser.findOneAndUpdate({ discordId: user.id }, { secondaryPosition: selectedPosition === 'NINGUNA' ? null : selectedPosition }, { upsert: true });

        const userProfile = await VPGUser.findOne({ discordId: user.id }).lean();
        const modal = new ModalBuilder().setCustomId('edit_profile_modal').setTitle('Actualizar Perfil (Paso final)');

        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsernameInput').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(false).setValue(userProfile.vpgUsername || '');
        const twitterInput = new TextInputBuilder().setCustomId('twitterInput').setLabel("Tu Twitter (sin @)").setStyle(TextInputStyle.Short).setRequired(false).setValue(userProfile.twitterHandle || '');
        const psnIdInput = new TextInputBuilder().setCustomId('psnIdInput').setLabel("Tu ID de PlayStation Network (PSN)").setStyle(TextInputStyle.Short).setRequired(false).setValue(userProfile.psnId || '');
        const eaIdInput = new TextInputBuilder().setCustomId('eaIdInput').setLabel("Tu ID de EA Sports FC").setStyle(TextInputStyle.Short).setRequired(false).setValue(userProfile.eaId || '');

        modal.addComponents(
            new ActionRowBuilder().addComponents(vpgUsernameInput),
            new ActionRowBuilder().addComponents(twitterInput),
            new ActionRowBuilder().addComponents(psnIdInput),
            new ActionRowBuilder().addComponents(eaIdInput)
        );
        
        await interaction.showModal(modal);
        return;
    }
    
    if (customId === 'search_team_pos_filter' || customId === 'search_team_league_filter') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const filter = { guildId: guild.id, status: 'ACTIVE' };
        if (selectedValue !== 'ANY') {
            if (customId === 'search_team_pos_filter') {
                filter.positions = selectedValue;
            }
        }
        const offers = await TeamOffer.find(filter).populate('teamId').limit(10);
        if (offers.length === 0) {
            return interaction.editReply({ content: '❌ No se encontraron ofertas de equipo con los filtros seleccionados.' });
        }
        await interaction.editReply({ content: `✅ Se encontraron ${offers.length} ofertas. Te las muestro a continuación:` });
        for (const offer of offers) {
            const offerEmbed = new EmbedBuilder()
                .setAuthor({ name: offer.teamId.name, iconURL: offer.teamId.logoUrl })
                .setThumbnail(offer.teamId.logoUrl)
                .setColor('Green')
                .addFields(
                    { name: 'Posiciones Buscadas', value: `\`${offer.positions.join(', ')}\`` },
                    { name: 'Requisitos', value: offer.requirements },
                    { name: 'Contacto', value: `<@${offer.postedById}>` }
                );
            await interaction.followUp({ embeds: [offerEmbed], flags: MessageFlags.Ephemeral });
        }
        return;
    }
    
    if (customId === 'search_player_pos_filter') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const selectedPositions = values;
        const profiles = await VPGUser.find({ 'primaryPosition': { $in: selectedPositions } }).lean();
        if (profiles.length === 0) {
            return interaction.editReply({ content: 'No se encontraron jugadores con esas posiciones.' });
        }
        const profileUserIds = profiles.map(p => p.discordId);
        const agents = await FreeAgent.find({ guildId: guild.id, status: 'ACTIVE', userId: { $in: profileUserIds } });
        if (agents.length === 0) {
            return interaction.editReply({ content: 'Se encontraron jugadores con esas posiciones, pero ninguno está anunciado como agente libre ahora mismo.' });
        }
        
        await interaction.editReply({ content: `✅ ¡Búsqueda exitosa! Se encontraron ${agents.length} agentes libres. Te los enviaré a continuación...` });
        
        const agentUserIds = agents.map(a => a.userId);
        const members = await guild.members.fetch({ user: agentUserIds });

        for (const agent of agents) {
            const profile = profiles.find(p => p.discordId === agent.userId);
            const member = members.get(agent.userId);
            if (!member || !profile) continue;

            const playerEmbed = new EmbedBuilder()
                .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                .setThumbnail(member.user.displayAvatarURL())
                .setColor('Blue')
                .addFields(
                    { name: 'Posiciones', value: `**${profile.primaryPosition}** / ${profile.secondaryPosition || 'N/A'}`, inline: true },
                    { name: 'VPG / Twitter', value: `${profile.vpgUsername || 'N/A'} / @${profile.twitterHandle || 'N/A'}`, inline: true },
                    { name: 'Disponibilidad', value: agent.availability || 'No especificada', inline: false },
                    { name: 'Experiencia', value: agent.experience || 'Sin descripción.' },
                    { name: 'Busco un equipo que...', value: agent.seeking || 'Sin descripción.' }
                )
                .setFooter({ text: `Puedes contactar directamente con este jugador.` });
            await interaction.followUp({ embeds: [playerEmbed], flags: MessageFlags.Ephemeral });
        }
        return;
    }
    
    if (customId.startsWith('offer_select_positions_')) {
        const teamId = customId.split('_')[3];
        const selectedPositions = values;
        const modal = new ModalBuilder()
            .setCustomId(`offer_add_requirements_${teamId}_${selectedPositions.join('-')}`)
            .setTitle('Paso 2: Añadir Requisitos');
        const requirementsInput = new TextInputBuilder()
            .setCustomId('requirementsInput')
            .setLabel("Requisitos y descripción de la oferta")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setPlaceholder('Ej: Buscamos jugadores comprometidos, con micro, disponibilidad L-J de 22 a 23h CET...');
        modal.addComponents(new ActionRowBuilder().addComponents(requirementsInput));
        await interaction.showModal(modal);
        return;
    }
    
    if (customId === 'apply_to_team_select') {
        const teamId = selectedValue;
        const modal = new ModalBuilder().setCustomId(`application_modal_${teamId}`).setTitle('Aplicar a Equipo');
        const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Escribe una breve presentación').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        await interaction.showModal(modal);
        return;
    }
    
    // ===========================================================================
    // ================== ESTE BLOQUE ES EL QUE SE HA CORREGIDO ==================
    // ===========================================================================
    if (customId === 'select_league_for_registration') {
        const leagueName = selectedValue;
        const modal = new ModalBuilder().setCustomId(`manager_request_modal_${leagueName}`).setTitle(`Registrar Equipo en ${leagueName}`);
        
        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo").setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        
        // El campo que faltaba ahora se añade al formulario
        const teamTwitterInput = new TextInputBuilder().setCustomId('teamTwitterInput').setLabel("Twitter del equipo (opcional, sin @)").setStyle(TextInputStyle.Short).setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(vpgUsernameInput), 
            new ActionRowBuilder().addComponents(teamNameInput), 
            new ActionRowBuilder().addComponents(teamAbbrInput),
            new ActionRowBuilder().addComponents(teamTwitterInput) // Añadido aquí
        );
        
        await interaction.showModal(modal);
        return;
    }
    
    if (customId.startsWith('select_league_filter_')) {
        await interaction.deferUpdate();
        const panelType = customId.split('_')[3];
        const selectedLeagues = values;
        const leaguesString = selectedLeagues.length > 0 ? selectedLeagues.join(',') : 'none';
        
        const continueButton = new ButtonBuilder()
            .setCustomId(`continue_panel_creation_${panelType}_${leaguesString}`)
            .setLabel('Continuar con la Creación del Panel')
            .setStyle(ButtonStyle.Success);
            
        await interaction.editReply({
            content: `Has seleccionado las ligas: **${selectedLeagues.length > 0 ? selectedLeagues.join(', ') : 'Ninguna'}**. Pulsa continuar.`,
            components: [new ActionRowBuilder().addComponents(continueButton)]
        });
        return;
    }
    
    if (customId === 'admin_select_team_to_manage') {
        await interaction.deferUpdate();
        const teamId = selectedValue;
        const team = await Team.findById(teamId).lean();
        if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.', components: [], embeds: [] });
        
        const leagues = await League.find({ guildId: guild.id }).sort({ name: 1 });
        const leagueOptions = leagues.map(l => ({ label: l.name, value: `admin_set_league_${teamId}_${l._id}`, default: team.league === l.name }));
        
        const leagueMenu = new StringSelectMenuBuilder()
            .setCustomId('admin_change_league_menu')
            .setPlaceholder('Cambiar la liga del equipo')
            .addOptions(leagueOptions);

        const embed = new EmbedBuilder().setTitle(`Gestión: ${team.name}`).setColor('DarkRed').setThumbnail(team.logoUrl);
        const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`admin_change_data_${teamId}`).setLabel('Cambiar Datos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Primary),
    // --- ESTE ES EL NUEVO BOTÓN ---
    new ButtonBuilder().setCustomId(`admin_change_manager_${teamId}`).setLabel('Cambiar Mánager').setStyle(ButtonStyle.Primary).setEmoji('👑')
);
        const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_dissolve_team_${teamId}`).setLabel('DISOLVER EQUIPO').setStyle(ButtonStyle.Danger));
        const row3 = new ActionRowBuilder().addComponents(leagueMenu);
        
        await interaction.editReply({ content: '', embeds: [embed], components: [row1, row2, row3] });
        return;
    }
    
    if (customId === 'roster_management_menu') {
        await interaction.deferUpdate();
        const targetId = selectedValue;
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        
        if(!team) {
            const adminTeam = await Team.findOne({ 'players': targetId });
            if (!adminTeam || !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.editReply({content: "No tienes permisos sobre este equipo.", components: []});
            }
        }
        const managerTeam = team || await Team.findOne({ players: { $in: [targetId] }, guildId: guild.id });
        
        const isManagerAction = managerTeam.managerId === user.id || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        const targetMember = await guild.members.fetch(targetId).catch(()=>null);
        if(!targetMember) return interaction.editReply({ content: "El miembro seleccionado ya no está en el servidor.", components: []});
        
        const isTargetCaptain = managerTeam.captains.includes(targetId);
        const row = new ActionRowBuilder();
        
        if (isManagerAction) {
            if (isTargetCaptain) {
                row.addComponents(new ButtonBuilder().setCustomId(`demote_captain_${targetId}`).setLabel('Degradar a Jugador').setStyle(ButtonStyle.Secondary));
            } else if (managerTeam.players.includes(targetId)) {
                row.addComponents(new ButtonBuilder().setCustomId(`promote_player_${targetId}`).setLabel('Ascender a Capitán').setStyle(ButtonStyle.Success));
            }
        }
        
        if (managerTeam.managerId !== targetId) {
             row.addComponents(new ButtonBuilder().setCustomId(`kick_player_${targetId}`).setLabel('Expulsar del Equipo').setStyle(ButtonStyle.Danger));
        }
        
        row.addComponents(new ButtonBuilder().setCustomId(`toggle_mute_player_${targetId}`).setLabel('Mutear/Desmutear Chat').setStyle(ButtonStyle.Secondary));
        
        await interaction.editReply({ content: `Acciones para **${targetMember.user.username}**:`, components: [row] });
        return;
    }
    
    if (customId === 'admin_change_league_menu') {
        await interaction.deferUpdate();
        const parts = selectedValue.split('_');
        const teamId = parts[3];
        const leagueId = parts[4];
        const team = await Team.findById(teamId);
        const league = await League.findById(leagueId);
        if (!team || !league) return interaction.followUp({ content: 'El equipo o la liga ya no existen.', flags: MessageFlags.Ephemeral });
        team.league = league.name;
        await team.save();
        await interaction.followUp({ content: `✅ La liga del equipo **${team.name}** ha sido cambiada a **${league.name}**.`, flags: MessageFlags.Ephemeral });
        return;
    }
    
    if (customId === 'view_team_roster_select') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const team = await Team.findById(selectedValue).lean();
        if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.' });
        
        const allMemberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
        if (allMemberIds.length === 0) return interaction.editReply({ content: 'Este equipo no tiene miembros.' });
        
        const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } }).lean();
        const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));
        
        let rosterString = '';
        const fetchMemberInfo = async (ids, roleName) => {
            if (!ids || ids.length === 0) return;
            rosterString += `\n**${roleName}**\n`;
            for (const memberId of ids) {
                try {
                   const memberData = await guild.members.fetch(memberId);
                   const profile = memberMap.get(memberId);
                   let positionString = profile?.primaryPosition ? ` - ${profile.primaryPosition}` : '';
                   if (profile?.secondaryPosition) { positionString += ` / ${profile.secondaryPosition}`; }
                   const vpgUsername = profile?.vpgUsername || 'N/A';
                   const twitterInfo = profile?.twitterHandle ? ` (@${profile.twitterHandle})` : '';
                   rosterString += `> ${memberData.user.username} (${vpgUsername})${positionString}${twitterInfo}\n`;
                } catch (error) { rosterString += `> *Usuario no encontrado (ID: ${memberId})*\n`; }
            }
        };
        
        await fetchMemberInfo([team.managerId].filter(Boolean), '👑 Mánager');
        await fetchMemberInfo(team.captains, '🛡️ Capitanes');
        await fetchMemberInfo(team.players, 'Jugadores');
        
        const embed = new EmbedBuilder().setTitle(`Plantilla de ${team.name} (${team.abbreviation})`).setDescription(rosterString.trim() || 'Este equipo no tiene miembros.').setColor('#3498db').setThumbnail(team.logoUrl).setFooter({ text: `Liga: ${team.league}` });
        return interaction.editReply({ embeds: [embed] });
    }
    
    if (customId === 'delete_league_select_menu') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const leaguesToDelete = values;
        const result = await League.deleteMany({ guildId: guild.id, name: { $in: leaguesToDelete } });
        return interaction.editReply({ content: `✅ Se han eliminado ${result.deletedCount} ligas.` });
    }
    
    if (customId === 'register_select_primary_position' || customId === 'register_select_secondary_position') {
        await interaction.deferUpdate();
        const isPrimary = customId === 'register_select_primary_position';
        const position = values[0];

        const update = isPrimary 
            ? { primaryPosition: position } 
            : { secondaryPosition: position === 'NINGUNA' ? null : position };
        
        const userProfile = await VPGUser.findOneAndUpdate({ discordId: user.id }, update, { new: true, upsert: true });

        if (userProfile && userProfile.primaryPosition && userProfile.secondaryPosition !== undefined) {
             try {
                const member = interaction.member;
                if (!member) throw new Error('No se pudo encontrar al miembro en el servidor.');

                const playerRole = await guild.roles.fetch(process.env.PLAYER_ROLE_ID);
                if (playerRole) {
                    await member.roles.add(playerRole);
                }
                
                await interaction.editReply({ 
                    content: '✅ **¡Registro completado!** Has recibido el rol de Jugador en el servidor. ¡Bienvenido!',
                    components: [] 
                });

            } catch (err) {
                console.error("Error al finalizar registro y asignar rol:", err);
                await interaction.editReply({ 
                    content: 'Tu perfil se ha guardado, pero hubo un error al asignarte el rol en el servidor. Por favor, contacta a un administrador.',
                    components: []
                });
            }
        }
        return;
    }
    
    if (customId.startsWith('select_available_times_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const selectedTimes = values;
        const leaguesString = customId.split('_').slice(3).join('_');
        const leagues = leaguesString === 'all' ? [] : leaguesString.split(',');
        
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: 'No se pudo encontrar tu equipo.' });

        const channelId = process.env.SCHEDULED_FRIENDLY_CHANNEL_ID;
        if (!channelId) return interaction.editReply({ content: 'Error: El ID del canal de amistosos programados no está configurado.' });

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos programados.' });

        const initialEmbed = new EmbedBuilder().setTitle(`Buscando Rival - ${team.name} (Disponible)`).setColor("Greyple");
        const webhook = await getOrCreateWebhook(channel, client);
        const message = await webhook.send({ embeds: [initialEmbed], username: team.name, avatarURL: team.logoUrl });

        const timeSlots = selectedTimes.map(time => ({
            time,
            status: 'AVAILABLE'
        }));

        const panel = new AvailabilityPanel({
            guildId: guild.id, channelId, messageId: message.id, teamId: team._id,
            postedById: user.id, panelType: 'SCHEDULED', leagues, timeSlots
        });

        await panel.save();
        await updatePanelMessage(client, panel._id);

        return interaction.editReply({ content: `✅ ¡Tu panel de búsqueda de amistosos ha sido publicado en ${channel}!` });
    }
};
