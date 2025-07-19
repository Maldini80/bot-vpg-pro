const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const mongoose = require('mongoose');
const User = require('./models/User.js'); // Importamos el modelo de usuario

mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a la base de datos MongoDB.'))
    .catch(err => console.error('No se pudo conectar a MongoDB:', err));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Carga de comandos
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, () => {
    console.log(`¡Listo! El bot ${client.user.tag} está online.`);
});

// Gestor de interacciones (comandos Y botones)
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        // Lógica para comandos de barra
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '¡Hubo un error al ejecutar este comando!', ephemeral: true });
        }
    } else if (interaction.isButton()) {
        // Lógica para botones
        if (interaction.customId === 'verify_button') {
            // Crear el Modal (el formulario emergente)
            const modal = new ModalBuilder()
                .setCustomId('verify_modal')
                .setTitle('Verificación de Virtual Pro Gaming');

            const vpgUsernameInput = new TextInputBuilder()
                .setCustomId('vpgUsernameInput')
                .setLabel("Introduce tu nombre de usuario de VPG")
                .setStyle(TextInputStyle.Short) // Campo de una sola línea
                .setRequired(true);

            const actionRow = new ActionRowBuilder().addComponents(vpgUsernameInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        // Lógica para cuando se envía el formulario (modal)
        if (interaction.customId === 'verify_modal') {
            const vpgUsername = interaction.fields.getTextInputValue('vpgUsernameInput');
            // Aquí irá toda la lógica de scraping y guardado en la DB
            await interaction.reply({ content: `Recibido. Verificando el usuario ${vpgUsername}... Esto puede tardar unos segundos.`, ephemeral: true });
            
            // --- PRÓXIMAMENTE: Llamar al scraper ---
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
