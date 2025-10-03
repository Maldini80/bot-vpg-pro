// src/commands/selector-idiomas.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('selector-idiomas')
        .setDescription('Crea un panel para que los usuarios elijan su rol de idioma.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle('Selección de Idioma / Language Selection')
            .setColor('#2980b9')
            .setImage('https://i.imgur.com/dBIejz8.jpeg')
            .setDescription(
                '🇪🇸 Pulsa el botón de tu idioma para que el bot te hable en esa lengua. Esto cambiará tu rol de idioma actual si ya tenías uno.\n\n' +
                '🇬🇧 Press the button for your language to have the bot interact with you in that language. This will replace your current language role if you already have one.'
            );

        // Primera fila de botones
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('select_lang_es').setLabel('Español').setStyle(ButtonStyle.Secondary).setEmoji('🇪🇸'),
            new ButtonBuilder().setCustomId('select_lang_en').setLabel('English').setStyle(ButtonStyle.Secondary).setEmoji('🇬🇧'),
            new ButtonBuilder().setCustomId('select_lang_it').setLabel('Italiano').setStyle(ButtonStyle.Secondary).setEmoji('🇮🇹'),
            new ButtonBuilder().setCustomId('select_lang_fr').setLabel('Français').setStyle(ButtonStyle.Secondary).setEmoji('🇫🇷')
        );

        // Segunda fila de botones
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('select_lang_pt').setLabel('Português').setStyle(ButtonStyle.Secondary).setEmoji('🇵🇹'),
            new ButtonBuilder().setCustomId('select_lang_de').setLabel('Deutsch').setStyle(ButtonStyle.Secondary).setEmoji('🇩🇪'),
            new ButtonBuilder().setCustomId('select_lang_tr').setLabel('Türkçe').setStyle(ButtonStyle.Secondary).setEmoji('🇹🇷')
        );

        try {
            await interaction.channel.send({ embeds: [embed], components: [row1, row2] });
            await interaction.editReply({ content: '✅ Panel selector de idiomas creado con éxito.' });
        } catch (error) {
            console.error("Error al crear el panel de idiomas:", error);
            await interaction.editReply({ content: '❌ No se pudo crear el panel. Asegúrate de que tengo permisos para enviar mensajes en este canal.' });
        }
    },
};
