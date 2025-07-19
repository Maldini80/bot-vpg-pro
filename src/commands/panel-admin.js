const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control para administradores de equipos en este canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Administrador de Equipos VPG')
            .setDescription('Usa los botones de abajo para gestionar los equipos y jugadores registrados en el sistema.')
            .setColor('#c0392b');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('admin_manage_team_button').setLabel('🔍 Gestionar Equipo').setStyle(ButtonStyle.Primary)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de administrador creado con éxito.', ephemeral: true });
    },
};
