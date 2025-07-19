const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const mongoose = require('mongoose');
const User = require('./models/user.js');
const { getVpgProfile } = require('./utils/scraper.js');
require('dotenv').config();

mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a la base de datos MongoDB.')) // <-- LÍNEA CORREGIDA
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
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

client.once(Events.ClientReady, () => {
    console.log(`¡Listo! El bot ${client.user.tag} está online.`);
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
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
                await interaction.deferReply({ ephemeral: true });

                const vpgUsername = interaction.fields.getTextInputValue('vpgUsernameInput');
                const profileData = await getVpgProfile(vpgUsername);

                if (profileData.error) return interaction.editReply({ content: `❌ ${profileData.error}` });
                
                await User.findOneAndUpdate(
                    { discordId: interaction.user.id },
                    { vpgUsername: profileData.vpgUsername, teamName: profileData.teamName, teamLogoUrl: profileData.teamLogoUrl, isManager: profileData.isManager, lastUpdated: Date.now() },
                    { upsert: true, new: true }
                );

                const member = interaction.member;
                await member.setNickname(`${member.user.username} | ${profileData.teamName}`);
                const managerRoleId = process.env.MANAGER_ROLE_ID;
                if (managerRoleId) {
                    if (profileData.isManager) await member.roles.add(managerRoleId);
                    else await member.roles.remove(managerRoleId).catch(() => {});
                }
                
                await interaction.editReply({ content: `✅ ¡Verificación completada! Tu perfil ha sido vinculado con **${profileData.teamName}**.` });
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción (probablemente por arranque en frío):", error.message);
    }
});

client.login(process.env.DISCORD_TOKEN);
