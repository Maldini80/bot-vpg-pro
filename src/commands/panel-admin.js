// src/commands/panel-admin.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control para administradores.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // La línea deferReply ha sido ELIMINADA de aquí para evitar conflictos.

        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Administrador VPG')
            .setDescription('Usa los botones de abajo para gestionar la comunidad.')
            .setColor('#c0392b');
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_create_league_button').setLabel('➕ Crear Liga').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('admin_delete_league_button').setLabel('🗑️ Borrar Liga').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('admin_manage_team_button').setLabel('🔍 Gestionar Equipo').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('admin_view_pending_requests').setLabel('⏳ Ver Solicitudes').setStyle(ButtonStyle.Secondary)
        );
        
        // Enviamos el panel al canal
        await interaction.channel.send({ embeds: [embed], components: [row] });
        
        // Usamos editReply porque el "portero" en index.js ya hizo defer.
        return interaction.editReply({ content: '✅ Panel de administrador creado con éxito.' });
    },
};
