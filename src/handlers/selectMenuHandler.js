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

    if (customId === 'select_primary_position' || customId === 'select_secondary_position') {
    try {
        await interaction.deferUpdate();
    } catch (e) {
        // Si falla (porque la interacción ya expiró), simplemente lo ignoramos y continuamos
        // ya que la única acción es guardar en la BD.
        console.log("DeferUpdate falló en selectMenuHandler (perfil), continuando...");
    }
    const updateData = customId === 'select_primary_position'
        ? { primaryPosition: selectedValue }
        : { secondaryPosition: selectedValue === 'NINGUNA' ? null : selectedValue };
    await VPGUser.findOneAndUpdate({ discordId: user.id }, updateData, { upsert: true });
    // No hay 'return' para que la estructura else if funcione
} else if (customId === 'search_team_pos_filter' || customId === 'search_team_league_filter') {
        await interaction.deferReply({ flags: 64 });
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
            await interaction.followUp({ embeds: [offerEmbed], ephemeral: true });
        }

    } else if (customId === 'search_player_pos_filter') {
        await interaction.deferReply({ flags: 64 });
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
        for (const agent of agents) {
            const profile = profiles.find(p => p.discordId === agent.userId);
            const member = await guild.members.fetch(agent.userId).catch(() => null);
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
            await interaction.followUp({ embeds: [playerEmbed] });
        }

    } else if (customId.startsWith('offer_select_positions_')) {
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

    } else if (customId === 'apply_to_team_select') {
        const teamId = selectedValue;
        const modal = new ModalBuilder().setCustomId(`application_modal_${teamId}`).setTitle('Aplicar a Equipo');
        const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Escribe una breve presentación').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        await interaction.showModal(modal);

    } else if (customId === 'select_league_for_registration') {
        const leagueName = selectedValue;
        const modal = new ModalBuilder().setCustomId(`manager_request_modal_${leagueName}`).setTitle(`Registrar Equipo en ${leagueName}`);
        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo").setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput));
        await interaction.showModal(modal);

    } else if (customId.startsWith('select_league_filter_') || customId === 'admin_select_team_to_manage' || customId === 'roster_management_menu' || customId === 'admin_change_league_menu') {
        await interaction.deferUpdate();
        if (customId.startsWith('select_league_filter_')) {
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
        } else if (customId === 'admin_select_team_to_manage') {
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
            await interaction.editReply({ content: '', embeds: [embed], components: [row1, row2, row3] });
        } else if (customId === 'roster_management_menu') {
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
            await interaction.editReply({ content: `Acciones para **${targetMember.user.username}**:`, components: [row] });
        } else if (customId === 'admin_change_league_menu') {
            const parts = selectedValue.split('_');
            const teamId = parts[3];
            const leagueId = parts[4];
            const team = await Team.findById(teamId);
            const league = await League.findById(leagueId);
            if (!team || !league) return interaction.followUp({ content: 'El equipo o la liga ya no existen.', ephemeral: true });
            team.league = league.name;
            await team.save();
            await interaction.followUp({ content: `✅ La liga del equipo **${team.name}** ha sido cambiada a **${league.name}**.`, ephemeral: true });
        }

    } else if (customId === 'view_team_roster_select') {
        await interaction.deferReply({ flags: 64 });
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

    } else if (customId === 'delete_league_select_menu') {
        await interaction.deferReply({ flags: 64 });
        const leaguesToDelete = values;
        const result = await League.deleteMany({ guildId: guild.id, name: { $in: leaguesToDelete } });
        return interaction.editReply({ content: `✅ Se han eliminado ${result.deletedCount} ligas.` });
    
    // --- LÓGICA AÑADIDA PARA FINALIZAR EL REGISTRO DE JUGADOR ---
    } else if (customId === 'register_select_primary_position' || customId === 'register_select_secondary_position') {
        await interaction.deferUpdate();
        const isPrimary = customId === 'register_select_primary_position';
        const position = values[0];

        const update = isPrimary 
            ? { primaryPosition: position } 
            : { secondaryPosition: position === 'NINGUNA' ? null : position };
        await VPGUser.findOneAndUpdate({ discordId: user.id }, update);

        const userProfile = await VPGUser.findOne({ discordId: user.id });

        if (userProfile && userProfile.primaryPosition) {
            try {
                // Buscamos el servidor (guild) desde el cliente porque esta interacción ocurre en un MD
                const guild = await client.guilds.fetch(process.env.GUILD_ID);
                if (!guild) throw new Error('No se pudo encontrar el servidor principal.');
                
                const member = await guild.members.fetch(user.id);
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
    }
};
