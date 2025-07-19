const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const axios = require('axios');

// Aplicamos el plugin de sigilo a Puppeteer
puppeteer.use(StealthPlugin());

async function getVpgProfile(vpgUsername) {
    let browser = null;
    try {
        console.log(`STEALTH MODE: Iniciando navegador sigiloso para ${vpgUsername}...`);
        
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;

        console.log(`STEALTH MODE: Navegando a ${userUrl}`);
        await page.goto(userUrl, { waitUntil: 'networkidle2' });

        console.log(`STEALTH MODE: Esperando que el contenido del perfil aparezca...`);
        // Le damos un tiempo de espera generoso, ya que el modo sigiloso puede ser más lento
        await page.waitForSelector('.profile-info-container', { timeout: 60000 });

        console.log(`STEALTH MODE: ¡Contenido encontrado! Extrayendo HTML...`);
        const content = await page.content();
        const $ = cheerio.load(content);
        
        await browser.close();
        browser = null;

        const teamLinkElement = $('div.text-muted:contains("EQUIPO")').next().find('a');
        if (teamLinkElement.length === 0) {
            return { error: `No se pudo encontrar un equipo en el perfil de **${vpgUsername}** (después de cargar la página).` };
        }

        const teamName = teamLinkElement.text().trim();
        const teamUrl = teamLinkElement.attr('href');

        console.log(`STEALTH MODE: Equipo encontrado: ${teamName}. Obteniendo detalles...`);
        const teamPageResponse = await axios.get(teamUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $team = cheerio.load(teamPageResponse.data);
        const teamLogoUrl = $team('.profile-team-emblem img').attr('src');
        let isManager = false;
        const managerHeader = $team('h5:contains("MANAGER")');
        if (managerHeader.length > 0) {
            if (managerHeader.next().find(`a[href*="/user/${vpgUsername}"]`).length > 0) isManager = true;
        }

        console.log(`STEALTH MODE: Verificación completada para ${vpgUsername}.`);
        return { vpgUsername, teamName, teamLogoUrl: teamLogoUrl || null, isManager };

    } catch (error) {
        console.error(`STEALTH MODE ERROR para ${vpgUsername}:`, error.message);
        return { error: `No se pudo cargar el perfil de VPG para **${vpgUsername}**. El sitio está protegido por una seguridad muy avanzada.` };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { getVpgProfile };
