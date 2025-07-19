const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { CANAL_APROBACIONES_ID } = require('../utils/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-admin')
        .setDescription('Crea el panel de control para administradores de equipos.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (interaction.channelId !== CANAL_APROBACIONES_ID) {
            return interaction.reply({ content: 'Este comando solo se puede usar en el canal de aprobaciones/administración.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Administrador de Equipos VPG')
            .setDescription('Usa los botones de abajo para gestionar los equipos y jugadores registrados en el sistema.')
            .setColor('#c0392b')
            .setFooter({ text: 'VPG Order Management' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('admin_search_team_button')
                    .setLabel('🔍 Buscar Equipo')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('admin_search_player_button')
                    .setLabel('👤 Buscar Jugador')
                    .setStyle(ButtonStyle.Secondary)
            );
        
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de administrador creado con éxito.', ephemeral: true });
    },
};
