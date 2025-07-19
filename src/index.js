const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const mongoose = require('mongoose');

// Conectar a la base de datos de MongoDB
mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a la base de datos MongoDB.'))
    .catch(err => console.error('No se pudo conectar a MongoDB:', err));

// Crear el cliente de Discord con los permisos (intents) necesarios
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Cargar los comandos desde la carpeta /src/commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
}

// Evento que se ejecuta una vez cuando el bot está listo
client.once(Events.ClientReady, () => {
    console.log(`¡Listo! El bot ${client.user.tag} está online.`);
});

// Evento principal que gestiona todas las interacciones (comandos, botones, etc.)
client.on(Events.InteractionCreate, async interaction => {
    
    // Si la interacción es un COMANDO DE BARRA
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '¡Hubo un error al ejecutar este comando!', ephemeral: true });
        }
    } 
    // Si la interacción es un BOTÓN
    else if (interaction.isButton()) {
        if (interaction.customId === 'verify_button') {
            // Crear el formulario (Modal) que se mostrará al usuario
            const modal = new ModalBuilder()
                .setCustomId('verify_modal')
                .setTitle('Verificación de Virtual Pro Gaming');

            const vpgUsernameInput = new TextInputBuilder()
                .setCustomId('vpgUsernameInput')
                .setLabel("Introduce tu nombre de usuario de VPG")
                .setStyle(TextInputStyle.Short) // Campo de texto corto
                .setRequired(true);

            // Añadir el campo de texto al formulario
            const actionRow = new ActionRowBuilder().addComponents(vpgUsernameInput);
            modal.addComponents(actionRow);

            // Mostrar el formulario al usuario que hizo clic
            await interaction.showModal(modal);
        }
    } 
    // Si la interacción es el ENVÍO DE UN FORMULARIO
    else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'verify_modal') {
            // Obtener el valor que el usuario escribió en el campo de texto
            const vpgUsername = interaction.fields.getTextInputValue('vpgUsernameInput');
            
            // Responder de forma temporal mientras trabajamos
            await interaction.reply({ content: `Recibido. Verificando el usuario **${vpgUsername}**... Esto puede tardar unos segundos.`, ephemeral: true });
            
            // PRÓXIMAMENTE: Aquí irá toda la lógica de scraping y guardado en la DB.
        }
    }
});

// Iniciar sesión en Discord con el token
client.login(process.env.DISCORD_TOKEN);
