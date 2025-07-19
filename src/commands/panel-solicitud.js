const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { CANAL_SOLICITUDES_ID } = require('../utils/config.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-solicitud')
        .setDescription('Crea el panel para que los usuarios soliciten ser mánager de un equipo.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // Nos aseguramos de que el comando se usa en el canal correcto
        if (interaction.channelId !== CANAL_SOLICITUDES_ID) {
            return interaction.reply({ content: `Este comando solo se puede usar en el canal de solicitudes designado.`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setTitle('📝 Solicitud para Registrar un Equipo de VPG')
            .setDescription('¿Eres mánager de un equipo en Virtual Pro Gaming y quieres registrarlo en nuestro sistema?\n\nHaz clic en el botón de abajo para iniciar el proceso de solicitud. Deberás proporcionar tu nombre de usuario de VPG y el nombre de tu equipo para que los administradores puedan verificarlo.')
            .setColor('#2ecc71')
            .setFooter({ text: 'VPG Order Management' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('request_manager_role_button')
                    .setLabel('Quiero Registrar mi Equipo')
                    .setStyle(ButtonStyle.Success)
            );

        await interaction.channel.send({
            embeds: [embed],
            components: [row]
        });
        
        await interaction.reply({ content: 'Panel de solicitud creado con éxito.', ephemeral: true });
    },
};
