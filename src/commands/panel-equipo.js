// src/commands/panel-equipo.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-equipo')
        .setDescription('Crea el panel de control para Mánagers y Capitanes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Equipo')
            .setDescription('Usa los botones de abajo para gestionar tu equipo.')
            .setColor('#e67e22');

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('team_invite_player_button').setLabel('📧 Invitar Jugador').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('team_manage_roster_button').setLabel('📋 Gestionar Plantilla').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('team_view_roster_button').setLabel('👥 Ver Plantilla').setStyle(ButtonStyle.Secondary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('team_edit_data_button').setLabel('✏️ Editar Datos del Equipo').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('team_toggle_recruitment_button').setLabel('📢 Abrir/Cerrar Reclutamiento').setStyle(ButtonStyle.Secondary)
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
        await interaction.reply({ content: 'Panel de control de equipo creado con éxito.', ephemeral: true });
    },
};
