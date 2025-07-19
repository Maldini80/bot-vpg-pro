const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

async function getVpgProfile(vpgUsername) {
    let browser = null; // Definimos el navegador fuera del try para poder cerrarlo en el finally.
    try {
        console.log(`PUPPETEER: Iniciando navegador para el usuario ${vpgUsername}...`);
        
        // 1. Inicia el navegador sin cabeza con argumentos especiales para que funcione en Render.
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        });

        const page = await browser.newPage();
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;

        // 2. Navega a la página del usuario.
        await page.goto(userUrl, { waitUntil: 'networkidle2' }); // Espera a que la página esté mayormente cargada.

        // 3. Espera a que un selector específico (que solo existe después de que JS se ejecuta) aparezca.
        //    Este selector apunta al contenedor de la información del perfil.
        await page.waitForSelector('.profile-info-container', { timeout: 30000 }); // Espera hasta 30 segundos.

        // 4. Una vez que el contenido está ahí, lo extraemos.
        const content = await page.content();
        const $ = cheerio.load(content);

        const teamLinkElement = $('div.text-muted:contains("EQUIPO")').next().find('a');
        if (teamLinkElement.length === 0) {
            return { error: `No se pudo encontrar un equipo en el perfil de **${vpgUsername}**.` };
        }

        const teamName = teamLinkElement.text().trim();
        const teamUrl = teamLinkElement.attr('href');

        await browser.close(); // Cerramos el navegador para liberar memoria.
        browser = null;

        // 5. La segunda parte (ir a la página del equipo) sigue siendo válida y la hacemos con axios por eficiencia.
        const teamPageResponse = require('axios').get(teamUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $team = cheerio.load((await teamPageResponse).data);
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
        // Asegurarnos de que el navegador siempre se cierre, incluso si hay un error.
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { getVpgProfile };
