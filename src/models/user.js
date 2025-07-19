const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    vpgUsername: { type: String, required: true },
    teamName: { type: String, default: null },
    teamLogoUrl: { type: String, default: null },
    isManager: { type: Boolean, default: false },
    lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model('VPGUser', userSchema, 'vpg_users');```

---
#### **`src/utils/scraper.js`**
```javascript
const axios = require('axios');
const cheerio = require('cheerio');

async function getVpgProfile(vpgUsername) {
    try {
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;
        const userPageResponse = await axios.get(userUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } });
        const $user = cheerio.load(userPageResponse.data);

        const teamLinkElement = $user('div.text-muted:contains("EQUIPO")').next().find('a');
        if (teamLinkElement.length === 0) return { error: `No se pudo encontrar un equipo en el perfil de **${vpgUsername}**. Asegúrate de que estás en un equipo.` };

        const teamName = teamLinkElement.text().trim();
        const teamUrl = teamLinkElement.attr('href');
        if (!teamName || !teamUrl) return { error: `Se encontró la sección de equipo para **${vpgUsername}**, pero no se pudo extraer el nombre o la URL.` };

        const teamPageResponse = await axios.get(teamUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $team = cheerio.load(teamPageResponse.data);
        const teamLogoUrl = $team('.profile-team-emblem img').attr('src');
        
        let isManager = false;
        const managerHeader = $team('h5:contains("MANAGER")');
        if (managerHeader.length > 0) {
            if (managerHeader.next().find(`a[href*="/user/${vpgUsername}"]`).length > 0) isManager = true;
        }

        return { vpgUsername, teamName, teamLogoUrl: teamLogoUrl || null, isManager };
    } catch (error) {
        if (error.response && (error.response.status === 404 || error.response.status === 400)) return { error: `No se pudo encontrar al usuario de VPG **${vpgUsername}**.` };
        console.error("Error detallado en el scraper:", error);
        return { error: "Ocurrió un error inesperado al obtener los datos de VPG. Revisa los logs del bot." };
    }
}
module.exports = { getVpgProfile };
