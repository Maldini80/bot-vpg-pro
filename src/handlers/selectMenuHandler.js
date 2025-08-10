// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const Team = require('../models/team.js');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');

const POSITIONS = ['POR', 'DFC', 'CARR', 'MCD', 'MV', 'MCO', 'DC'];

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0];

    // --- LÓGICA CORREGIDA PARA ACTUALIZAR PERFIL ---
    if (customId === 'update_select_primary_position') {
        // CORRECCIÓN: Usar deferUpdate para asegurar la respuesta a tiempo.
        await interaction.deferUpdate();

        const selectedPosition = values[0];
        await VPGUser.findOneAndUpdate({ discordId: user.id }, { primaryPosition: selectedPosition }, { upsert: true });

        const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
        const secondaryMenu = new StringSelectMenuBuilder()
            .setCustomId('update_select_secondary_position')
            .setPlaceholder('Paso 2: Selecciona tu posición secundaria')
            .addOptions({ label: 'Ninguna', value: 'NINGUNA' }, ...positionOptions);

        await interaction.editReply({ // editReply funciona después de deferUpdate
            content: '✅ Posición principal guardada. Ahora, selecciona tu posición secundaria.',
            components: [new ActionRowBuilder().addComponents(secondaryMenu)]
        });
        return;

    } else if (customId === 'update_select_secondary_position') {
        // showModal es una respuesta final, no necesita defer. NO REQUIERE CAMBIOS.
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

    // --- RESTO DEL CÓDIGO YA CORRECTO ---
    
    else if (customId === 'search_team_pos_filter' || customId === 'search_team_league_filter') {
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
                    { name: 'Requisitos', value: offer.requirements }
                );
            await interaction.followUp({ content: `**Contacto:** <@${offer.postedById}>`, embeds: [offerEmbed], ephemeral: true });
        }

    } else if (customId === 'search_player_pos_filter') {
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
            if (!team || !league) return interaction.followUp({ content: 'El equipo o la liga ya no existen.', flags: MessageFlags.Ephemeral });
            team.league = league.name;
            await team.save();
            await interaction.followUp({ content: `✅ La liga del equipo **${team.name}** ha sido cambiada a **${league.name}**.`, flags: MessageFlags.Ephemeral });
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
                const guild = await client.guilds.fetch(process.env.GUILD_ID);
                if (!guild) throw new Error('No se pudo encontrar el servidor principal.');
                
                const member = await guild.members.fetch(user.id);
                if (!member) throw new Error('No se pudo encontrar al miembro en el servidor.');

                const playerRole = await guild.roles.fetch(process.env.PLAYER_ROLE_ID);
                if (playerRole) {
                    await member.roles.add(playerRole);
                    // --- INICIO DEL CÓDIGO AÑADIDO: MD de bienvenida al jugador ---
try {
    const playerGuideEmbed = new EmbedBuilder()
        .setTitle('✅ ¡Perfil Completado y Rol de Jugador Desbloqueado!')
        .setColor('Green')
        .setImage('https://i.imgur.com/7sB0gaa.jpg')
        .setDescription(`¡Felicidades, ${member.user.username}! Has completado tu perfil. Ahora tienes acceso a las herramientas de jugador. A continuación, te explicamos en detalle todo lo que puedes hacer:`)
        .addFields(
            {
                name: '➡️ ¿Ya tienes equipo pero necesitas unirte en Discord?',
                value: 'Tienes dos formas de hacerlo:\n' +
                       '1. **La más recomendada:** Habla con tu **Mánager o Capitán**. Ellos pueden usar la función `Invitar Jugador` desde su panel para añadirte al instante.\n' +
                       '2. **Si prefieres tomar la iniciativa:** Puedes ir al panel de <#1396815232122228827>, pulsar `Acciones de Jugador` -> `Aplicar a un Equipo`, buscar tu club en la lista y enviarles una solicitud formal.'
            },
            { 
                name: '🔎 ¿Buscas un nuevo reto? Guía Completa del Mercado de Fichajes', 
                value: 'El canal <#1402608609724072040> es tu centro de operaciones.\n' +
                       '• **Para anunciarte**: Usa `Anunciarse como Agente Libre`. Si ya tenías un anuncio publicado, **este será reemplazado automáticamente por el nuevo**, nunca tendrás duplicados. Esta acción de publicar/reemplazar tu anuncio solo se puede realizar **una vez cada 3 días**.\n' +
                       '• **Para buscar**: Usa `Buscar Ofertas de Equipo` para ver qué equipos han publicado vacantes y qué perfiles necesitan.\n' +
                       '• **Para administrar tu anuncio**: Usa `Gestionar mi Anuncio` en cualquier momento para **editar** los detalles o **borrarlo** definitivamente si encuentras equipo.'
            },
            {
                name: '⚙️ Herramientas Clave de tu Carrera',
                value: 'Desde el panel principal de <#1396815232122228827> (`Acciones de Jugador`) tienes control total:\n' +
                       '• **`Actualizar Perfil`**: Es crucial que mantengas tus IDs de juego (PSN, EA) actualizados.\n' +
                       '• **`Abandonar Equipo`**: Si en el futuro decides dejar tu equipo actual, esta opción te dará total independencia para hacerlo.'
            }
        );

    await member.send({ embeds: [playerGuideEmbed] });

} catch (dmError) {
    console.log(`AVISO: No se pudo enviar el MD de guía al nuevo jugador ${member.user.tag}.`);
}
// --- FIN DEL CÓDIGO AÑADIDO ---
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
    else if (customId.startsWith('select_available_times_')) {
        await interaction.deferReply({ flags: 64 });

        const { updatePanelMessage, getOrCreateWebhook } = require('./buttonHandler.js'); // Importamos las funciones necesarias
        const selectedTimes = values;
        const leaguesString = customId.split('_').slice(3).join('_');
        const leagues = leaguesString === 'all' ? [] : leaguesString.split(',');
        
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: 'No se pudo encontrar tu equipo.' });

        const channelId = process.env.SCHEDULED_FRIENDLY_CHANNEL_ID;
        if (!channelId) return interaction.editReply({ content: 'Error: El ID del canal de amistosos programados no está configurado.' });

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos programados.' });

        // Creamos un mensaje temporal para obtener un ID
        const initialEmbed = new EmbedBuilder().setTitle(`Buscando Rival - ${team.name} (Disponible)`).setColor("Greyple");
        const webhook = await getOrCreateWebhook(channel, client);
        const message = await webhook.send({ embeds: [initialEmbed], username: team.name, avatarURL: team.logoUrl });

        const timeSlots = selectedTimes.map(time => ({
            time: time,
            status: 'AVAILABLE'
        }));

        const panel = new AvailabilityPanel({
            guildId: guild.id,
            channelId,
            messageId: message.id,
            teamId: team._id,
            postedById: user.id,
            panelType: 'SCHEDULED',
            leagues,
            timeSlots
        });

        await panel.save();
        await updatePanelMessage(client, panel._id); // Actualizamos el mensaje para que tenga los botones correctos

        return interaction.editReply({ content: `✅ ¡Tu panel de búsqueda de amistosos ha sido publicado en ${channel}!` });
    }
};
