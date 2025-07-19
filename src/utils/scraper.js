const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');

async function getVpgProfile(vpgUsername) {
    let browser = null;
    try {
        console.log(`PUPPETEER: Iniciando navegador para ${vpgUsername}...`);
        
        // Puppeteer usará automáticamente el navegador instalado en la ruta definida por PUPPETEER_CACHE_DIR
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;

        await page.goto(userUrl, { waitUntil: 'networkidle2' });
        await page.waitForSelector('.profile-info-container', { timeout: 45000 }); // Aumentamos el timeout por seguridad

        const content = await page.content();
        const $ = cheerio.load(content);
        
        await browser.close();
        browser = null;

        const teamLinkElement = $('div.text-muted:contains("EQUIPO")').next().find('a');
        if (teamLinkElement.length === 0) {
            return { error: `No se pudo encontrar un equipo en el perfil de **${vpgUsername}**.` };
        }

        const teamName = teamLinkElement.text().trim();
        const teamUrl = teamLinkElement.attr('href');

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
        console.error(`PUPPETEER ERROR para ${vpgUsername}:`, error.message);
        return { error: `No se pudo cargar el perfil de VPG para **${vpgUsername}**. El sitio puede estar lento o el perfil no existe.` };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { getVpgProfile };
