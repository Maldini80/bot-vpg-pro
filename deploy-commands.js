const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');

// Lista de archivos de comandos que ya no usamos y deben ser ignorados.
const commandFilesToExclude = ['panel-amistosos.js', 'admin-gestionar-equipo.js'];

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && !commandFilesToExclude.includes(file));

console.log('Cargando los siguientes archivos de comandos para desplegar:');
console.log(commandFiles);

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(`[ADVERTENCIA] El comando en ${filePath} no tiene las propiedades "data" o "execute".`);
        }
    } catch (error) {
        console.error(`Error al cargar el comando en ${filePath}:`, error);
    }
}

// Asegúrate de que las variables de entorno CLIENT_ID y GUILD_ID están definidas.
if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
    console.error("Error: Faltan variables de entorno esenciales (DISCORD_TOKEN, CLIENT_ID, GUILD_ID).");
    process.exit(1); // Detiene el script si faltan variables.
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Refrescando ${commands.length} comandos de aplicación (/) en el servidor ${process.env.GUILD_ID}.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log(`¡Éxito! Se han recargado ${data.length} comandos.`);
    } catch (error) {
        console.error("Error al desplegar los comandos:", error);
    }
})();
