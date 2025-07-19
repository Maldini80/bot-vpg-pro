const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
    console.log(`¡Conectado! El bot ${client.user.tag} está online.`);
});

client.login(process.env.DISCORD_TOKEN);
