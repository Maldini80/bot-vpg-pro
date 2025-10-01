// src/commands/informar-lideres.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const Team = require('../models/team.js');
const t = require('../utils/translator.js');

// Función de utilidad para la pausa
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('informar-lideres')
        .setDescription('Envía una guía sobre amistosos y fichajes a todos los Mánagers y Capitanes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const panelChannelId = '1396815967685705738';
    
    const teams = await Team.find({ guildId: interaction.guild.id });
    if (teams.length === 0) {
        return interaction.editReply({ content: 'No se encontraron equipos registrados en el servidor.' });
    }

    const leaderIds = new Set();
    teams.forEach(team => {
        if (team.managerId) leaderIds.add(team.managerId);
        team.captains.forEach(captainId => leaderIds.add(captainId));
    });

    const uniqueLeaderIds = [...leaderIds];
    let notifiedCount = 0;
    let failedCount = 0;

    await interaction.editReply({ content: `Iniciando envío de comunicados a ${uniqueLeaderIds.length} líderes de equipo...` });

    for (const userId of uniqueLeaderIds) {
        try {
            const member = await interaction.guild.members.fetch(userId);

            // El Embed se crea aquí DENTRO para usar el idioma de cada 'member'
            const infoEmbed = new EmbedBuilder()
                .setTitle(t('leaderInfoTitle', member))
                .setColor(0x4A90E2)
                .setDescription(t('leaderInfoDescription', member).replace('{panelChannelId}', panelChannelId))
                .addFields(
                    { name: t('leaderInfoField1Title', member), value: t('leaderInfoField1Value', member) },
                    { name: t('leaderInfoField2Title', member), value: t('leaderInfoField2Value', member) }
                )
                .setFooter({ text: t('leaderInfoFooter', member) });

            await member.send({ embeds: [infoEmbed] });
            notifiedCount++;
        } catch (error) {
            failedCount++;
        }
        await wait(1000);
    }

    await interaction.followUp({
        content: `✅ **Proceso completado.**\n` +
                 `- Se encontraron **${uniqueLeaderIds.length}** líderes únicos.\n` +
                 `- **${notifiedCount}** líderes fueron notificados correctamente.\n` +
                 `- **${failedCount}** líderes no pudieron ser notificados (MDs cerrados o fuera del servidor).`,
        flags: MessageFlags.Ephemeral
    });
},
};
