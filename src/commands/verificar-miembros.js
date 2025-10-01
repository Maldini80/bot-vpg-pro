// src/commands/verificar-miembros.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const VPGUser = require('../models/user.js');
const t = require('../utils/translator.js');

// Una pequeña función de utilidad para esperar.
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verificar-miembros')
        .setDescription('Busca miembros sin rol de jugador o perfil incompleto y les envía un recordatorio por MD.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const exclusionRoles = [
        process.env.ADMIN_ROLE_ID,
        process.env.CASTER_ROLE_ID,
        process.env.ARBITER_ROLE_ID
    ].filter(Boolean);

    const teamRoles = [
        process.env.PLAYER_ROLE_ID,
        process.env.CAPTAIN_ROLE_ID,
        process.env.MANAGER_ROLE_ID
    ].filter(Boolean);

    const members = await interaction.guild.members.fetch();
    let notifiedCount = 0;
    let failedCount = 0;
    let processedCount = 0;

    const targetChannelId = '1396815232122228827';
    
    await interaction.editReply({ content: `Iniciando verificación de ${members.size} miembros... Esto puede tardar.` });

    for (const member of members.values()) {
        processedCount++;
        if (processedCount % 20 === 0) {
             await interaction.followUp({ content: `Procesados ${processedCount} de ${members.size} miembros...`, flags: MessageFlags.Ephemeral });
        }

        if (member.user.bot || 
            member.roles.cache.some(role => exclusionRoles.includes(role.id)) || 
            member.roles.cache.some(role => teamRoles.includes(role.id))) {
            continue;
        }

        const userProfile = await VPGUser.findOne({ discordId: member.id });

        if (!userProfile || !userProfile.primaryPosition) {
            try {
                // El Embed se crea aquí DENTRO para usar el idioma de cada 'member'
                const reminderEmbed = new EmbedBuilder()
                    .setTitle(t('profileReminderTitle', member))
                    .setDescription(t('profileReminderDescription', member))
                    .addFields(
                        { name: t('profileReminderField1Title', member), value: t('profileReminderField1Value', member).replace('{targetChannelId}', targetChannelId) },
                        { name: t('profileReminderField2Title', member), value: t('profileReminderField2Value', member) },
                        { name: t('profileReminderField3Title', member), value: t('profileReminderField3Value', member) }
                    )
                    .setColor('Orange')
                    .setImage('https://i.imgur.com/JDxmInz.jpeg')
                    .setFooter({ text: t('profileReminderFooter', member) });

                await member.send({ embeds: [reminderEmbed] });
                notifiedCount++;
            } catch (error) {
                failedCount++;
            }
            
            await wait(1000); 
        }
    }

    await interaction.followUp({
        content: `✅ **Verificación completada.**\n` +
                 `- Se procesaron **${members.size}** miembros en total.\n` +
                 `- **${notifiedCount}** miembro(s) fueron notificados correctamente por MD.\n` +
                 `- **${failedCount}** miembro(s) no pudieron ser notificados (MDs cerrados).`,
        flags: MessageFlags.Ephemeral
    });
},
};
