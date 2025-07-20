// src/commands/panel-solicitud.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-solicitud')
        .setDescription('Crea el panel para solicitar ser mánager o abandonar un equipo.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        if (interaction.channelId !== process.env.REQUEST_CHANNEL_ID) {
            return interaction.reply({ content: `Este comando solo se puede usar en el canal de solicitudes designado.`, ephemeral: true });
        }
        const embed = new EmbedBuilder()
            .setTitle('📝 Gestión de Equipos VPG')
            .setDescription('Usa los botones de abajo para registrar tu equipo o para abandonar el equipo al que perteneces.')
            .setColor('#2ecc71');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('request_manager_role_button')
                .setLabel('Quiero Registrar mi Equipo')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder() // <-- BOTÓN NUEVO
                .setCustomId('leave_team_button')
                .setLabel('Abandonar mi Equipo Actual')
                .setStyle(ButtonStyle.Danger)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de solicitud creado con éxito.', ephemeral: true });
    },
};
