// src/commands/panel-admin.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control para administradores.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Administrador VPG')
            .setDescription('Usa los botones de abajo para gestionar la comunidad.')
            .setColor('#c0392b');
            
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_create_league_button').setLabel('➕ Crear Liga').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('admin_delete_league_button').setLabel('🗑️ Borrar Liga').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('admin_manage_team_button').setLabel('🔍 Gestionar Equipo').setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_view_pending_requests').setLabel('⏳ Ver Solicitudes Pendientes').setStyle(ButtonStyle.Secondary)
        );
        await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
        await interaction.reply({ content: 'Panel de administrador creado con éxito.', ephemeral: true });
    },
};
