const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const mongoose = require('mongoose');
const User = require('./models/user.js');
const { getVpgProfile } = require('./utils/scraper.js');

// Carga las variables de entorno desde un archivo .env si existe
require('dotenv').config();

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
    // --- GESTIÓN DE COMANDOS ---
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error("Error ejecutando el comando:", error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: '¡Hubo un error al ejecutar este comando!', ephemeral: true });
            } else {
                await interaction.reply({ content: '¡Hubo un error al ejecutar este comando!', ephemeral: true });
            }
        }
    
    // --- GESTIÓN DE BOTONES ---
    } else if (interaction.isButton()) {
        if (interaction.customId === 'verify_button') {
            const modal = new ModalBuilder().setCustomId('verify_modal').setTitle('Verificación de Virtual Pro Gaming');
            const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsernameInput').setLabel("Introduce tu nombre de usuario de VPG").setStyle(TextInputStyle.Short).setRequired(true);
            const actionRow = new ActionRowBuilder().addComponents(vpgUsernameInput);
            modal.addComponents(actionRow);
            await interaction.showModal(modal);
        }

    // --- GESTIÓN DE MODALES (CON LÓGICA DEFER) ---
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'verify_modal') {
            await interaction.deferReply({ ephemeral: true });

            const vpgUsername = interaction.fields.getTextInputValue('vpgUsernameInput');
            const profileData = await getVpgProfile(vpgUsername);

            if (profileData.error) {
                return interaction.editReply({ content: `❌ ${profileData.error}` });
            }
            
            await User.findOneAndUpdate(
                { discordId: interaction.user.id },
                {
                    vpgUsername: profileData.vpgUsername,
                    teamName: profileData.teamName,
                    teamLogoUrl: profileData.teamLogoUrl,
                    isManager: profileData.isManager,
                    lastUpdated: Date.now()
                },
                { upsert: true, new: true }
            );

            try {
                const member = interaction.member;
                await member.setNickname(`${member.user.username} | ${profileData.teamName}`);

                const managerRoleId = process.env.MANAGER_ROLE_ID;
                if (managerRoleId) {
                    if (profileData.isManager) {
                        await member.roles.add(managerRoleId);
                    } else {
                        await member.roles.remove(managerRoleId).catch(() => {});
                    }
                }
                
                await interaction.editReply({ content: `✅ ¡Verificación completada! Tu perfil ha sido vinculado con **${profileData.teamName}**.` });

            } catch (err) {
                console.error("Error actualizando perfil de Discord:", err);
                await interaction.editReply({ content: `⚠️ Tu perfil de VPG se ha verificado, pero no he podido actualizar tu apodo o roles. Es posible que mis permisos estén por debajo de los tuyos.` });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
