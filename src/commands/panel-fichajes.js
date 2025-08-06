// src/commands/panel-fichajes.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-fichajes')
        .setDescription('Crea el panel de control del mercado de fichajes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.reply({ content: 'Creando el nuevo panel de fichajes profesional...', flags: 64 });

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('CENTRAL DEL MERCADO DE FICHAJES')
            .setDescription('Bienvenido al centro neurálgico del mercado. Utiliza los botones de abajo según tu rol para navegar por las distintas opciones.')
            .addFields(
                { name: '👤 PARA JUGADORES', value: 'Anúnciate como agente libre para que te encuentren los equipos o busca activamente ofertas que se ajusten a tu perfil.' },
                { name: '👔 PARA MÁNAGERS Y CAPITANES', value: 'Publica las necesidades de tu plantilla para atraer talento o busca en la base de datos de agentes libres para encontrar a tu próxima estrella.' }
            )
            // <<--- ESTA ES LA LÍNEA QUE HEMOS CAMBIADO ---<<
            .setImage('https://img.freepik.com/fotos-premium/imagen-manos-hombre-firmando-contrato_380164-35331.jpg')
            .setFooter({ text: 'Todas las interacciones se gestionan por mensajes privados para mantener el canal limpio.' });

        // Fila de botones para JUGADORES
        const playerRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('market_post_agent')
                .setLabel('Anunciarse como Agente Libre')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📣'),
            new ButtonBuilder()
                .setCustomId('market_search_teams')
                .setLabel('Buscar Ofertas de Equipo')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔎'),
            new ButtonBuilder()
                .setCustomId('market_manage_ad')
                .setLabel('Gestionar mi Anuncio')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⚙️')
        );
        
        // Fila de botones para MÁNAGERS/CAPITANES
        const managerRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('market_post_offer')
                .setLabel('Publicar Oferta de Equipo')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📄'),
            new ButtonBuilder()
                .setCustomId('market_search_players')
                .setLabel('Buscar Agentes Libres')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔍')
        );

        await interaction.channel.send({ embeds: [embed], components: [playerRow, managerRow] });
        await interaction.editReply({ content: '✅ ¡Nuevo panel de fichajes creado con éxito!' });
    },
};
