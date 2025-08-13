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
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const logChannel = interaction.options.getChannel('canal_logs');
        let supportRole = interaction.options.getRole('rol_soporte');

        if (!supportRole) {
            const arbiterRoleId = process.env.ARBITER_ROLE_ID;
            if (!arbiterRoleId) {
                return interaction.editReply({ content: '❌ No se proporcionó un rol de soporte y la variable de entorno `ARBITER_ROLE_ID` no está configurada.' });
            }
            try {
                supportRole = await interaction.guild.roles.fetch(arbiterRoleId);
                if (!supportRole) {
                    return interaction.editReply({ content: '❌ El rol con ID `' + arbiterRoleId + '` configurado en `ARBITER_ROLE_ID` no se encontró en este servidor.' });
                }
            } catch (error) {
                console.error(`Error al obtener el rol de ARBITER_ROLE_ID (${arbiterRoleId}):`, error);
                return interaction.editReply({ content: '❌ Hubo un error al intentar obtener el rol de soporte desde `ARBITER_ROLE_ID`.' });
            }
        }

        try {
            await TicketConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    logChannelId: logChannel.id,
                    supportRoleId: supportRole.id,
                },
                { upsert: true, new: true }
            );

            await interaction.editReply({
                content: `✅ Sistema de tickets configurado:\n` + 
                         `Canal de logs: <#${logChannel.id}>
` + 
                         `Rol de soporte: <@&${supportRole.id}>`
            });
        } catch (error) {
            console.error('Error al configurar el sistema de tickets:', error);
            await interaction.editReply({ content: '❌ Hubo un error al guardar la configuración del ticket.' });
        }
    },
};