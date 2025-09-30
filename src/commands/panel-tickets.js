const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-tickets')
        .setDescription('Crea el panel de tickets para que los usuarios abran solicitudes de soporte.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Solo administradores pueden crear este panel

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true }); // Respuesta efímera para el admin

        const embed = new EmbedBuilder()
            .setTitle('🎫 🇪🇸 Sistema de Tickets / 🇬🇧 Ticket System')
            .setDescription(
                '🇪🇸 ¿Tienes alguna duda o problema? Abre un ticket y nuestro equipo te atenderá de forma privada.\n' +
                '----------------------------------------------------------------------\n' +
                '🇬🇧 Do you have any questions or issues? Open a ticket and our team will assist you privately.'
            )
            .addFields(
                { 
                    name: '🇪🇸 ¿Cómo funciona? / 🇬🇧 How does it work?', 
                    value: '1. Pulsa el botón "Abrir Ticket / Open Ticket".\n' +
                           '2. Se creará un canal privado para ti y el staff.\n' +
                           '3. Explica tu problema en el nuevo canal.\n\n' +
                           '1. Press the "Abrir Ticket / Open Ticket" button.\n' +
                           '2. A private channel will be created for you and the staff.\n' +
                           '3. Explain your issue in the new channel.'
                }
            )
            .setColor('#0099ff')
            .setFooter({ text: '🇪🇸 Por favor, no abuses del sistema. / 🇬🇧 Please do not abuse the system.' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket_button')
                    .setLabel('Abrir Ticket / Open Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('➕')
            );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ Panel de tickets creado con éxito en este canal.' });
    },
};
