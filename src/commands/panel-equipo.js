// src/commands/panel-equipo.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-equipo')
        .setDescription('Crea el panel de control para Mánagers y Capitanes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // CORRECCIÓN: Respondemos primero
        await interaction.reply({ content: 'Creando el panel de equipo y amistosos...', ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Equipo y Amistosos')
            .setDescription('Usa los botones de abajo para gestionar tu equipo y organizar partidos.')
            .setColor('#e67e22')
            .setFooter({ text: 'Algunos botones como Editar Datos y Reclutamiento son solo para Mánagers.' });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('team_invite_player_button').setLabel('📧 Invitar Jugador').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('team_manage_roster_button').setLabel('📋 Gestionar Plantilla').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('team_view_roster_button').setLabel('👥 Ver Plantilla').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('team_edit_data_button').setLabel('✏️ Editar Datos (MG)').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('post_scheduled_panel').setLabel('🗓️ Programar Amistoso').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('post_instant_panel').setLabel('⚡ Amistoso (Ahora)').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('delete_friendly_panel').setLabel('🗑️ Borrar mi Búsqueda').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('team_toggle_recruitment_button').setLabel('📢 Reclutamiento (MG)').setStyle(ButtonStyle.Secondary)
        );
        
        // Enviamos el panel al canal
        await interaction.channel.send({ embeds: [embed], components: [row1, row2] });

        // Editamos la respuesta original para confirmar
        await interaction.editReply({ content: '✅ Panel de equipo y amistosos creado con éxito.' });
    },
};
