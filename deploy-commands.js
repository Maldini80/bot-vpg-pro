const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
// Leemos todos los archivos .js, excepto los que hemos eliminado
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'panel-amistosos.js' && file !== 'admin-gestionar-equipo.js');

console.log('Cargando los siguientes archivos de comandos:');
console.log(commandFiles);

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`[ADVERTENCIA] El comando en ${filePath} no tiene las propiedades "data" o "execute".`);
    }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`Refrescando ${commands.length} comandos de aplicación (/).`);

        const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log(`¡Éxito! Se han recargado ${data.length} comandos.`);
    } catch (error) {
        console.error(error);
    }
})();
