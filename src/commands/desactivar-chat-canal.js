// src/commands/desactivar-chat-canal.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const TeamChatChannel = require('../models/teamChatChannel.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desactivar-chat-canal')
        .setDescription('Desactiva el chat de equipo automático en este canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const { channelId, guildId } = interaction;

        const result = await TeamChatChannel.deleteOne({ channelId, guildId });

        if (result.deletedCount === 0) {
            return interaction.reply({ content: 'Este canal no estaba activado.', ephemeral: true });
        }

        await interaction.reply({ content: '❌ El chat de equipo se ha desactivado en este canal. Todos los mensajes volverán a ser normales.' });
    },
};
