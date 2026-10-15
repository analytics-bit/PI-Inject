// Start Chrome: lokaal de geïnstalleerde Chrome, in serverless (Netlify/AWS Lambda)
// de Chromium-build van @sparticuz/chromium-min.
// playwright-core wordt pas in launchBrowser geladen: zo crasht niet elke endpoint
// (login, status, ...) als dat pakket ontbreekt; alleen het genereren heeft het nodig.

// Chromium wordt bij de eerste aanroep gedownload (past zo binnen de functiegrootte van Netlify).
// Versie moet overeenkomen met @sparticuz/chromium-min in package.json; override met CHROMIUM_PACK_URL.
const PACK_URL = 'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar';

const isServerless = () =>
  !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY || process.env.CHROMIUM_SERVERLESS);

async function launchBrowser() {
  const { chromium } = require('playwright-core');
  if (!isServerless()) return chromium.launch({ channel: 'chrome', headless: true });

  const mod = await import('@sparticuz/chromium-min');
  const sparticuz = mod.default || mod;
  // Geen WebGL via swiftshader: we maken alleen screenshots en het CPU-pad is op één vCPU veel lichter.
  sparticuz.setGraphicsMode = false;
  // Eigen profielmap per run (Playwright ruimt die op een warme functie niet zelf op).
  const userDataDir = require('path').join(require('os').tmpdir(), `pw-${require('crypto').randomUUID()}`);
  const browser = await chromium.launch({
    executablePath: await sparticuz.executablePath(process.env.CHROMIUM_PACK_URL || PACK_URL),
    args: [...sparticuz.args, `--user-data-dir=${userDataDir}`],
    headless: true,
  });
  browser.on('disconnected', () => { try { require('fs').rmSync(userDataDir, { recursive: true, force: true }); } catch {} });
  return browser;
}

module.exports = { launchBrowser, isServerless };
