// src/commands/panel-solicitud.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-solicitud')
        .setDescription('Crea el panel de control general para todos los usuarios.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Centro de Control de Jugador VPG')
            .setDescription('Aquí puedes interactuar con el sistema de equipos.')
            .addFields(
                { name: '📝 Registrar Equipo', value: 'Si eres un nuevo mánager, pulsa aquí para iniciar el proceso de registro de tu equipo.' },
                { name: '👥 Ver Equipos', value: 'Explora la lista de equipos registrados y consulta sus plantillas.' },
                { name: '🚪 Abandonar Equipo', value: 'Si ya no quieres pertenecer a tu equipo actual, puedes abandonarlo aquí.' }
            )
            .setColor('#3498db');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('request_manager_role_button')
                .setLabel('Registrar Equipo')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('view_teams_button')
                .setLabel('Ver Equipos')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('leave_team_button')
                .setLabel('Abandonar Equipo')
                .setStyle(ButtonStyle.Danger)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de usuario creado con éxito.', ephemeral: true });
    },
};
