// src/commands/activar-chat-canal.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const TeamChatChannel = require('../models/teamChatChannel.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('activar-chat-canal')
        .setDescription('Activa este canal como un canal de chat de equipo automático.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const { channelId, guildId } = interaction;

        const existing = await TeamChatChannel.findOne({ channelId, guildId });
        if (existing) {
            return interaction.reply({ content: 'Este canal ya está activado como un canal de chat de equipo.', ephemeral: true });
        }

        const newChannel = new TeamChatChannel({ channelId, guildId });
        await newChannel.save();

        await interaction.reply({ content: `✅ ¡Éxito! Este canal ahora es un canal de chat de equipo. Cualquier miembro de un equipo escribirá automáticamente con su identidad.` });
    },
};
