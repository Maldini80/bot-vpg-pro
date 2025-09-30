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
            .setTitle('🇪🇸 PANEL DE GESTIÓN DE EQUIPO / 🇬🇧 TEAM MANAGEMENT PANEL')
            .setDescription(
                '🇪🇸 Centro de control para Mánagers y Capitanes. Selecciona una categoría.\n' +
                '----------------------------------------------------------------------\n' +
                '🇬🇧 Control center for Managers and Captains. Select a category.'
            )
            .setColor('#e67e22')
            .setImage('https://i.imgur.com/KjamtCg.jpeg')
            .setFooter({ text: '🇪🇸 Las opciones se mostrarán en privado. / 🇬🇧 Options will be shown privately.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('team_submenu_roster')
                .setLabel('Gestionar Plantilla / Manage Roster')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId('team_submenu_friendlies')
                .setLabel('Gestionar Amistosos / Manage Friendlies')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🗓️'),
            new ButtonBuilder()
                .setCustomId('team_submenu_market')
                .setLabel('Gestionar Fichajes / Manage Transfers')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📄')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ Panel de gestión de equipo creado con éxito.' });
    },
};
