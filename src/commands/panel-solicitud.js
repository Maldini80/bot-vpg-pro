// src/commands/panel-solicitud.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-solicitud')
        .setDescription('Crea el panel de control general para todos los usuarios.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // CORRECCIÓN: Respondemos primero para evitar "Unknown Interaction"
        await interaction.reply({ content: 'Creando el panel de solicitud...', ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle('Centro de Control de Jugador VPG')
            .setDescription('Aquí puedes interactuar con el sistema de equipos.')
            .setColor('#3498db');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('request_manager_role_button').setLabel('📝 Registrar Equipo').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('view_teams_button').setLabel('👥 Ver Equipos').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('leave_team_button').setLabel('🚪 Abandonar Equipo').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('apply_to_team_button').setLabel('✉️ Aplicar a un Equipo').setStyle(ButtonStyle.Secondary)
        );

        // Enviamos el panel al canal
        await interaction.channel.send({ embeds: [embed], components: [row] });

        // Editamos la respuesta original para confirmar
        await interaction.editReply({ content: '✅ Panel de solicitud creado con éxito.' });
    },
};
