// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const Team = require('../models/team.js');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0];

    if (customId === 'apply_to_team_select') {
        const teamId = selectedValue;
        const modal = new ModalBuilder().setCustomId(`application_modal_${teamId}`).setTitle('Aplicar a Equipo');
        const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Escribe una breve presentación').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        return interaction.showModal(modal);
    }
    
    if (customId === 'select_league_for_registration') {
        const leagueName = selectedValue;
        const modal = new ModalBuilder().setCustomId(`manager_request_modal_${leagueName}`).setTitle(`Registrar Equipo en ${leagueName}`);
        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo").setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput));
        return interaction.showModal(modal);
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

    if (customId === 'admin_select_team_to_manage' || customId === 'roster_management_menu' || customId === 'admin_change_league_menu') {
        await interaction.deferUpdate();
        if (customId === 'admin_select_team_to_manage') {
            const teamId = selectedValue;
            const team = await Team.findById(teamId).lean();
            if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.', components: [], embeds: [] });
            const leagues = await League.find({ guildId: guild.id }).sort({ name: 1 });
            const leagueOptions = leagues.map(l => ({ label: l.name, value: 
