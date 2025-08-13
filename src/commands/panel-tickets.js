const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-tickets')
        .setDescription('Crea el panel de tickets para que los usuarios abran solicitudes de soporte.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Solo administradores pueden crear este panel

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true }); // Respuesta efímera para el admin

        const embed = new EmbedBuilder()
            .setTitle('🎫 Sistema de Tickets de Soporte')
            .setDescription(
                '¿Tienes alguna duda, problema o necesitas ayuda? Abre un ticket y nuestro equipo de soporte te atenderá de forma privada.\n\n' +
                '**¿Cómo funciona?**\n' +
                '1. Pulsa el botón "Abrir Ticket".\n' +
                '2. Se creará un canal privado solo para ti y el staff.\n' + 
                '3. Explica tu problema en el nuevo canal.\n' +
                '4. Un miembro del staff te atenderá lo antes posible.\n' +
                '5. Una vez resuelto, el staff cerrará el ticket.'
            )
            .setColor('#0099ff')
            .setFooter({ text: 'Por favor, no abuses del sistema de tickets.' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket_button')
                    .setLabel('Abrir Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('➕')
            );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ Panel de tickets creado con éxito en este canal.' });
    },
};
