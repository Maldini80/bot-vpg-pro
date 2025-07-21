// src/commands/panel-equipo.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-equipo')
        .setDescription('Crea el panel de control para Mánagers y Capitanes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Equipo y Amistosos')
            .setDescription('Usa los botones de abajo para gestionar tu equipo y organizar partidos.')
            .setColor('#e67e22')
            .setFooter({ text: 'Algunos botones como Editar Datos, Invitar y Reclutamiento son solo para Mánagers.' });

        // Fila 1: Gestión del Equipo
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('team_invite_player_button').setLabel('📧 Invitar Jugador').setStyle(ButtonStyle.Success).setEmoji('👤'), // Verde para acciones de añadir
            new ButtonBuilder().setCustomId('team_manage_roster_button').setLabel('📋 Gestionar Plantilla').setStyle(ButtonStyle.Primary),      // Azul para gestión
            new ButtonBuilder().setCustomId('team_view_roster_button').setLabel('👥 Ver Plantilla').setStyle(ButtonStyle.Secondary),         // Gris para visualización
            new ButtonBuilder().setCustomId('team_toggle_recruitment_button').setLabel('📢 Reclutamiento').setStyle(ButtonStyle.Secondary) // Gris para acciones secundarias
        );
        
        // Fila 2: Amistosos
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('post_scheduled_panel').setLabel('Programar Amistoso').setStyle(ButtonStyle.Primary).setEmoji('🗓️'), // Azul para acciones principales
            new ButtonBuilder().setCustomId('post_instant_panel').setLabel('Amistoso (Ahora)').setStyle(ButtonStyle.Success).setEmoji('⚡'),      // Verde para acción inmediata
            new ButtonBuilder().setCustomId('delete_friendly_panel').setLabel('Borrar Búsqueda').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),       // Rojo para eliminación
            new ButtonBuilder().setCustomId('team_view_confirmed_matches').setLabel('Amistosos Confirmados').setStyle(ButtonStyle.Secondary).setEmoji('🗓️') // NUEVO BOTÓN
        );

        // Fila 3: Acciones exclusivas de Mánager (MG)
        const row3 = new ActionRowBuilder().addComponents(
             new ButtonBuilder().setCustomId('team_edit_data_button').setLabel('✏️ Editar Datos (Solo MG)').setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row1, row2, row3] });

        await interaction.editReply({ content: '✅ Panel de equipo y amistosos creado con éxito.' });
    },
};
