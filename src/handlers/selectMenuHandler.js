// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const Team = require('../models/team.js');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0];
    // --- Lógica para el Perfil de Jugador y Búsquedas del Mercado ---
if (customId === 'select_primary_position' || customId === 'select_secondary_position') {
    await interaction.deferUpdate();
    const updateData = customId === 'select_primary_position' 
        ? { primaryPosition: selectedValue } 
        : { secondaryPosition: selectedValue === 'NINGUNA' ? null : selectedValue };
    await VPGUser.findOneAndUpdate({ discordId: user.id }, updateData, { upsert: true });
    return; // Detenemos la ejecución
}

if (customId === 'search_team_pos_filter' || customId === 'search_team_league_filter') {
    await interaction.deferReply({ flags: 64 });
    
    const filter = { guildId: guild.id, status: 'ACTIVE' };
    const selectedValue = values[0];
    
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
        await interaction.followUp({ embeds: [offerEmbed], ephemeral: true });
    }
    return;
}

if (customId === 'search_player_pos_filter') {
    await interaction.deferReply({ flags: 64 });
    const selectedPositions = values;

    // Buscamos primero los perfiles que coincidan con la posición
    const profiles = await VPGUser.find({
        'primaryPosition': { $in: selectedPositions } 
        // Podríamos añadir la posición secundaria también con un $or
    }).lean();

    if (profiles.length === 0) {
        return interaction.editReply({ content: 'No se encontraron jugadores con esas posiciones.' });
    }
    
    const profileUserIds = profiles.map(p => p.discordId);

    // Ahora, de esos jugadores, vemos cuáles están anunciados como agentes libres
    const agents = await FreeAgent.find({ 
        guildId: guild.id, 
        status: 'ACTIVE',
        userId: { $in: profileUserIds }
    });

    if (agents.length === 0) {
        return interaction.editReply({ content: 'Se encontraron jugadores con esas posiciones, pero ninguno está anunciado como agente libre ahora mismo.' });
    }

    // Confirmamos al mánager que hemos encontrado resultados y vamos a enviarlos
    await interaction.editReply({ content: `✅ ¡Búsqueda exitosa! Se encontraron ${agents.length} agentes libres. Te los enviaré a continuación...` });

    // Ahora, creamos una "ficha" (embed) para cada agente y la enviamos como un nuevo mensaje
    for (const agent of agents) {
        const profile = profiles.find(p => p.discordId === agent.userId);
        const member = await guild.members.fetch(agent.userId).catch(() => null);

        // Si el jugador ya no está en el servidor, lo ignoramos
        if (!member) continue;

        const playerEmbed = new EmbedBuilder()
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
            .setThumbnail(member.user.displayAvatarURL())
            .setColor('Blue')
            .addFields(
                { name: 'Posiciones', value: `**${profile.primaryPosition}** / ${profile.secondaryPosition || 'N/A'}`, inline: true },
                { name: 'VPG / Twitter', value: `${profile.vpgUsername || 'N/A'} / @${profile.twitterHandle || 'N/A'}`, inline: true },
                { name: 'Disponibilidad', value: agent.availability || 'No especificada', inline: false },
                { name: 'Descripción del Jugador', value: agent.description || 'Sin descripción.' }
            )
            .setFooter({ text: `Puedes contactar directamente con este jugador.` });
        
        // Usamos followUp para enviar mensajes adicionales después de la respuesta inicial.
        // Como la respuesta inicial fue efímera (solo visible para el mánager), esta también lo será.
        await interaction.followUp({ embeds: [playerEmbed] });
    }
    
    return; // Terminamos la ejecución para este customId
}
if (customId.startsWith('offer_select_positions_')) {
    const teamId = customId.split('_')[3];
    const selectedPositions = values; // values es un array

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
    return; // <-- LÍNEA AÑADIDA
}

    if (customId === 'apply_to_team_select') {
        // CORRECCIÓN: Un modal ya es una respuesta, así que no necesita defer. Esto está bien.
        const teamId = selectedValue;
        const modal = new ModalBuilder().setCustomId(`application_modal_${teamId}`).setTitle('Aplicar a Equipo');
        const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Escribe una breve presentación').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        return interaction.showModal(modal);
    }
    
    if (customId === 'select_league_for_registration') {
        // CORRECCIÓN: Un modal ya es una respuesta. Esto está bien.
        const leagueName = selectedValue;
        const modal = new ModalBuilder().setCustomId(`manager_request_modal_${leagueName}`).setTitle(`Registrar Equipo en ${leagueName}`);
        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo").setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput));
        return interaction.showModal(modal);
    }

    if (customId.startsWith('select_league_filter_') || customId === 'admin_select_team_to_manage' || customId === 'roster_management_menu' || customId === 'admin_change_league_menu') {
        // CORRECCIÓN: Responder inmediatamente.
        await interaction.deferUpdate();

        if (customId.startsWith('select_league_filter_')) {
            const panelType = customId.split('_')[3];
            const selectedLeagues = values;
            const leaguesString = selectedLeagues.length > 0 ? selectedLeagues.join(',') : 'none';
            const continueButton = new ButtonBuilder()
                .setCustomId(`continue_panel_creation_${panelType}_${leaguesString}`)
                .setLabel('Continuar con la Creación del Panel')
                .setStyle(ButtonStyle.Success);
            return interaction.editReply({
                content: `Has seleccionado las ligas: **${selectedLeagues.length > 0 ? selectedLeagues.join(', ') : 'Ninguna'}**. Pulsa continuar.`,
                components: [new ActionRowBuilder().addComponents(continueButton)]
            });
        }

        if (customId === 'admin_select_team_to_manage') {
            const teamId = selectedValue;
            const team = await Team.findById(teamId).lean();
            if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.', components: [], embeds: [] });
            const leagues = await League.find({ guildId: guild.id }).sort({ name: 1 });
            const leagueOptions = leagues.map(l => ({ label: l.name, value: `admin_set_league_${teamId}_${l._id}`, default: team.league === l.name }));
            const leagueMenu = new StringSelectMenuBuilder().setCustomId('admin_change_league_menu').setPlaceholder('Cambiar la liga del equipo').addOptions(leagueOptions);
            const embed = new EmbedBuilder().setTitle(`Gestión: ${team.name}`).setColor('DarkRed').setThumbnail(team.logoUrl);
            const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_change_data_${teamId}`).setLabel('Cambiar Datos').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Primary));
            const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_dissolve_team_${teamId}`).setLabel('DISOLVER EQUIPO').setStyle(ButtonStyle.Danger));
            const row3 = new ActionRowBuilder().addComponents(leagueMenu);
            return interaction.editReply({ content: '', embeds: [embed], components: [row1, row2, row3] });
        }

        if (customId === 'roster_management_menu') {
            const targetId = selectedValue;
            const managerTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
            if (!managerTeam) return interaction.editReply({content: "Ya no tienes permisos sobre este equipo.", components: []});
            const isManager = managerTeam.managerId === user.id;
            const targetMember = await guild.members.fetch(targetId).catch(()=>null);
            if(!targetMember) return interaction.editReply({ content: "El miembro seleccionado ya no está en el servidor.", components: []});
            const isTargetCaptain = managerTeam.captains.includes(targetId);
            const row = new ActionRowBuilder();
            if (isManager) {
                if (isTargetCaptain) { row.addComponents(new ButtonBuilder().setCustomId(`demote_captain_${targetId}`).setLabel('Degradar a Jugador').setStyle(ButtonStyle.Secondary)); }
                else { row.addComponents(new ButtonBuilder().setCustomId(`promote_player_${targetId}`).setLabel('Ascender a Capitán').setStyle(ButtonStyle.Success)); }
            }
            row.addComponents(new ButtonBuilder().setCustomId(`kick_player_${targetId}`).setLabel('Expulsar del Equipo').setStyle(ButtonStyle.Danger));
            row.addComponents(new ButtonBuilder().setCustomId(`toggle_mute_player_${targetId}`).setLabel('Mutear/Desmutear Chat').setStyle(ButtonStyle.Secondary));
            return interaction.editReply({ content: `Acciones para **${targetMember.user.username}**:`, components: [row] });
        }

        if (customId === 'admin_change_league_menu') {
            const parts = selectedValue.split('_');
            const teamId = parts[3];
            const leagueId = parts[4];
            const team = await Team.findById(teamId);
            const league = await League.findById(leagueId);
            if (!team || !league) return interaction.followUp({ content: 'El equipo o la liga ya no existen.', ephemeral: true });
            team.league = league.name;
            await team.save();
            return interaction.followUp({ content: `✅ La liga del equipo **${team.name}** ha sido cambiada a **${league.name}**.`, ephemeral: true });
        }
        return;
    }
    
    // CORRECCIÓN: Usar flags en lugar de ephemeral.
    await interaction.deferReply({ flags: 64 });
    

    
    if (customId === 'view_team_roster_select') {
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
                   if (profile?.secondaryPosition) {
                       positionString += ` / ${profile.secondaryPosition}`;
                   }
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
        const leaguesToDelete = values;
        const result = await League.deleteMany({ guildId: guild.id, name: { $in: leaguesToDelete } });
        return interaction.editReply({ content: `✅ Se han eliminado ${result.deletedCount} ligas.` });
    }
};
