// src/commands/panel-solicitud.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-solicitud')
        .setDescription('Crea el panel de control general para todos los usuarios.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // CORRECCIÓN: Se añade esta línea.
        // Esto le dice a Discord "Recibido, dame un segundo" y evita el error "Interacción fallida".
        await interaction.deferReply({ flags: 64 });

        const embed = new EmbedBuilder()
            .setTitle('Centro de Control de Jugador VPG')
            .setDescription('Aquí puedes interactuar con el sistema de equipos.')
            .setColor('#3498db');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('request_manager_role_button').setLabel('📝 Registrar Equipo').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('view_teams_button').setLabel('👥 Ver Equipos').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('edit_profile_button').setLabel('✏️ Editar Perfil').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('register_as_player_button').setLabel('✅ Registrarse como Jugador').setStyle(ButtonStyle.Success)
        );
        
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('leave_team_button').setLabel('🚪 Abandonar Equipo').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('apply_to_team_button').setLabel('✉️ Aplicar a un Equipo').setStyle(ButtonStyle.Secondary)
        );

        // Esto envía el panel al canal, para que todos lo vean.
        await interaction.channel.send({ embeds: [embed], components: [row, row2] });

        // Esto le responde al administrador que ejecutó el comando, en un mensaje que solo él puede ver.
        return interaction.editReply({ content: '✅ Panel de solicitud creado con éxito.' });
    }
};
