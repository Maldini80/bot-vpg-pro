// src/commands/panel-fichajes.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-fichajes')
        .setDescription('Crea el panel de control del mercado de fichajes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Solo los admins pueden usarlo

    async execute(interaction) {
        // Respondemos al admin para que sepa que el comando ha funcionado
        await interaction.reply({ content: 'Creando el panel de fichajes...', flags: 64 });

        // Creamos el mensaje visual (el "embed")
        const embed = new EmbedBuilder()
            .setTitle('CENTRO DE FICHAJES VPG')
            .setDescription('Usa los botones de abajo para buscar jugadores, encontrar equipo o publicar ofertas.')
            .setColor('Gold') // Un color dorado/amarillo
            .setFooter({ text: 'Las búsquedas y publicaciones se gestionan mediante mensajes privados.' });

        // Creamos la fila de botones
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('market_search_players')
                .setLabel('Buscar Jugadores')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔎'),
            new ButtonBuilder()
                .setCustomId('market_search_teams')
                .setLabel('Buscar Equipos')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔎'),
            new ButtonBuilder()
                .setCustomId('market_post_agent')
                .setLabel('Anunciarse como Agente Libre')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📣'),
            new ButtonBuilder()
                .setCustomId('market_post_offer')
                .setLabel('Publicar Oferta de Equipo')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📄')
        );

        // Enviamos el panel al canal donde se usó el comando
        await interaction.channel.send({ embeds: [embed], components: [row] });
        
        // Editamos la respuesta inicial para confirmar que todo ha ido bien
        await interaction.editReply({ content: '✅ ¡Panel de fichajes creado con éxito!' });
    },
};
