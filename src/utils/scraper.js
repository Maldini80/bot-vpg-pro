const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

// Esta es la ruta exacta donde Render instala el navegador.
// La hemos sacado de tus propios logs de error.
const CHROME_PATH = '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';

async function getVpgProfile(vpgUsername) {
    let browser = null;
    let page = null;
    try {
        console.log(`PUPPETEER: Iniciando navegador para ${vpgUsername}...`);
        
        browser = await puppeteer.launch({
            headless: true,
            executablePath: CHROME_PATH, // Le decimos a Puppeteer dónde encontrar el ejecutable de Chrome
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        page = await browser.newPage();
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;

        await page.goto(userUrl, { waitUntil: 'networkidle2' });
        await page.waitForSelector('.profile-info-container', { timeout: 30000 });

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
        
        let screenshotUrl = 'No se pudo generar la captura.';
        if (page) {
            try {
                const screenshotPath = `error_screenshot_${Date.now()}.png`;
                await page.screenshot({ path: screenshotPath, fullPage: true });
                
                const form = new FormData();
                form.append('key', process.env.FREEIMAGE_API_KEY);
                form.append('action', 'upload');
                form.append('source', fs.createReadStream(screenshotPath));
                
                const response = await axios.post('https://freeimage.host/api/1/upload', form, { headers: form.getHeaders() });
                screenshotUrl = response.data.image.url;
                fs.unlinkSync(screenshotPath);
            } catch (uploadError) {
                screenshotUrl = `Error al subir la captura: ${uploadError.message}`;
            }
        }
        
        return { 
            error: `No se pudo cargar el perfil de VPG para **${vpgUsername}**. El sitio puede estar lento o protegido.\n\n**Depuración:** ${screenshotUrl}`
        };
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { getVpgProfile };
