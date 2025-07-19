const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const mongoose = require('mongoose');
const User = require('./models/User.js');
const { getVpgProfile } = require('./utils/scraper.js'); // Importamos el scraper

mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a la base de datos MongoDB.'))
    .catch(err => console.error('No se pudo conectar a MongoDB:', err));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

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

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '¡Hubo un error al ejecutar este comando!', ephemeral: true });
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'verify_button') {
            const modal = new ModalBuilder().setCustomId('verify_modal').setTitle('Verificación de Virtual Pro Gaming');
            const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsernameInput').setLabel("Introduce tu nombre de usuario de VPG").setStyle(TextInputStyle.Short).setRequired(true);
            const actionRow = new ActionRowBuilder().addComponents(vpgUsernameInput);
            modal.addComponents(actionRow);
            await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'verify_modal') {
            const vpgUsername = interaction.fields.getTextInputValue('vpgUsernameInput');
            await interaction.reply({ content: `Recibido. Verificando el usuario **${vpgUsername}**... Esto puede tardar unos segundos.`, ephemeral: true });

            // --- ¡AQUÍ EMPIEZA LA MAGIA! ---
            const profileData = await getVpgProfile(vpgUsername);

            // Si el scraper devuelve un error, se lo notificamos al usuario.
            if (profileData.error) {
                return interaction.followUp({ content: `❌ ${profileData.error}`, ephemeral: true });
            }
            
            // Si todo va bien, guardamos o actualizamos en la base de datos
            await User.findOneAndUpdate(
                { discordId: interaction.user.id }, // Buscar por el ID de Discord del usuario
                { // Datos a insertar o actualizar
                    vpgUsername: profileData.vpgUsername,
                    teamName: profileData.teamName,
                    teamLogoUrl: profileData.teamLogoUrl,
                    isManager: profileData.isManager,
                    lastUpdated: Date.now()
                },
                { upsert: true, new: true } // `upsert: true` crea el documento si no existe
            );

            // Ahora, actualizamos el perfil en Discord
            try {
                const member = interaction.member;

                // Cambiar el apodo
                await member.setNickname(`${member.user.username} | ${profileData.teamName}`);

                // Gestionar Rol de Manager
                const managerRole = interaction.guild.roles.cache.find(r => r.name === '👑 Manager');
                if (managerRole) {
                    if (profileData.isManager) {
                        await member.roles.add(managerRole);
                    } else {
                        await member.roles.remove(managerRole);
                    }
                }

                // Notificación final de éxito
                await interaction.followUp({ content: `✅ ¡Verificación completada! Tu perfil ha sido vinculado con **${profileData.teamName}**.`, ephemeral: true });

            } catch (err) {
                console.error("Error actualizando perfil de Discord:", err);
                await interaction.followUp({ content: `⚠️ Tu perfil de VPG se ha verificado, pero no he podido actualizar tu apodo o roles. Es posible que mis permisos estén por debajo de los tuyos.`, ephemeral: true });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
