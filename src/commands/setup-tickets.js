const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const TicketConfig = require('../../src/models/ticketConfig'); // Ruta relativa al modelo

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-tickets')
        .setDescription('Configura los canales y roles para el sistema de tickets.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Solo administradores pueden usar este comando
        .addChannelOption(option =>
            option.setName('canal_logs')
                .setDescription('El canal donde se enviarán las notificaciones de nuevos tickets.')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('rol_soporte')
                .setDescription('El rol que podrá gestionar los tickets (ej: Árbitro, Admin).')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const logChannel = interaction.options.getChannel('canal_logs');
        const supportRole = interaction.options.getRole('rol_soporte');

        try {
            await TicketConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    logChannelId: logChannel.id,
                    supportRoleId: supportRole.id,
                },
                { upsert: true, new: true } // Crea si no existe, devuelve el nuevo documento
            );

            await interaction.editReply({
                content: `✅ Sistema de tickets configurado:\n` +
                         `Canal de logs: <#${logChannel.id}>\n` +
                         `Rol de soporte: <@&${supportRole.id}>`
            });
        } catch (error) {
            console.error('Error al configurar el sistema de tickets:', error);
            await interaction.editReply({ content: '❌ Hubo un error al guardar la configuración del ticket.' });
        }
    },
};
