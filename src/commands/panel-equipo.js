// src/commands/panel-equipo.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-equipo')
        .setDescription('Crea el panel de control principal para Mánagers y Capitanes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const embed = new EmbedBuilder()
            .setTitle('PANEL DE GESTIÓN DE EQUIPO')
            .setDescription('Este es el centro de control para Mánagers y Capitanes. Selecciona una categoría para ver las acciones disponibles.')
            .setColor('#e67e22')
            .setImage('https://i.imgur.com/KjamtCg.jpeg') // <-- TU IMAGEN AÑADIDA
            .setFooter({ text: 'Las opciones se mostrarán en un mensaje privado solo para ti.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('team_submenu_roster')
                .setLabel('Gestionar Plantilla')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId('team_submenu_friendlies')
                .setLabel('Gestionar Amistosos')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🗓️'),
            new ButtonBuilder()
                .setCustomId('team_submenu_market')
                .setLabel('Gestionar Fichajes')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📄')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ Panel de gestión de equipo creado con éxito.' });
    },
};
