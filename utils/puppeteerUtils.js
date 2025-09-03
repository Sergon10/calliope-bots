import fs from 'fs';
import path from 'path';
import { copiarTextoLargoPortapapeles } from './fileManager.js';

/**
 * Generates a normally distributed random number with given mean and standard deviation.
 *
 * @param {number} mean The mean value.
 * @param {number} stdDev The standard deviation.
 * @returns {number} A non-negative random sample.
 */
export function gauss(mean, stdDev) {
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return Math.abs(z * stdDev + mean);
}

/**
 * Pauses execution for a random duration drawn from a Gaussian distribution.
 *
 * @param {number} base The average pause time in ms.
 * @param {number} deviation The standard deviation.
 * @returns {Promise<void>}
 */
export async function pausaGauss(base, deviation) {
  const delay = Math.abs(gauss(base, deviation));
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Launches Puppeteer with the user’s Chrome profile, sets up download behavior,
 * positions the mouse randomly, and returns context.
 *
 * @param {import('puppeteer').Puppeteer} puppeteer The puppeteer-extra instance.
 * @param {boolean} [incognito=false] Whether to launch in incognito mode.
 * @returns {Promise<{browser: any, page: any, x0: number, y0: number, carpetaDescargas: string}>}
 * @throws Will throw if required config or Chrome executable is missing.
 */
export async function browserInit(puppeteer, incognito = false) {
  try {
    // Load and validate user config from CWD
    const configPath = path.join(process.cwd(), 'config.json');
    const cwd_dir = process.cwd()
    if (!fs.existsSync(configPath)) {
      console.error(`configPath: ${configPath}; process.cwd(): ${cwd_dir}`)
      throw new Error('config.json not found. Please create it in your working directory.');
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // Validate required config properties
    if (!config.downloadsDir || !config.outputsDir) {
      throw new Error('Config error: `downloadsDir` and `outputsDir` must be defined in config.json.');
    }
    if (config.downloadsDir === config.outputsDir) {
      throw new Error('Config error: `downloadsDir` and `outputsDir` cannot be the same path.');
    }

    // Build browser launch options
    const browserOptions = {
      headless: false,
      args: incognito
        ? ['--incognito', '--disable-blink-features=AutomationControlled', '--window-size=1280,720']
        : ['--disable-blink-features=AutomationControlled', '--remote-debugging-port=0', '--start-maximized'],
      executablePath: config.chromeExecutablePath,
      userDataDir: incognito ? undefined : config.chromeUserDataDir
    };

    // Verify Chrome executable exists
    if (!fs.existsSync(browserOptions.executablePath)) {
      throw new Error(`Chrome executable not found at: ${browserOptions.executablePath}`);
    }

    // Launch and get first page
    const browser = await puppeteer.launch(browserOptions);
    const context = browser.defaultBrowserContext();
    const page = (await context.pages())[0];

    // Ensure downloads and outputs folders exist
    const carpetaDescargas = config.downloadsDir;
    const carpetaOutputs = config.outputsDir;
    fs.mkdirSync(carpetaDescargas, { recursive: true });
    fs.mkdirSync(carpetaOutputs, { recursive: true });

    // Enable automatic downloads
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: carpetaDescargas
    });

    // Randomize initial mouse position
    let x0, y0;
    try {
      await page.setViewport({ width: 1280, height: 720 });
      const viewport = page.viewport();
      x0 = gauss(viewport.width / 2, viewport.width / 4);
      y0 = gauss(viewport.height / 2, viewport.height / 4);
      console.info(`INFO (browserInit): Initial mouse coordinates -> x0:${x0.toFixed(2)}, y0:${y0.toFixed(2)}`);
      await page.mouse.move(x0, y0);
    } catch (err) {
      console.warn(
        `WARNING (browserInit): Could not set initial mouse position: ${err.message}. Using (0,0).`
      );
      x0 = 0;
      y0 = 0;
    }

    console.info(`INFO (browserInit): Browser launched and mouse positioned.`);
    return { browser, page, x0, y0, carpetaDescargas, carpetaOutputs };

  } catch (error) {
    console.error(`ERROR (browserInit): Failed to launch browser ->`, error.message);
    throw error;
  }
}

/**
 * Waits for an element (or uses an ElementHandle), moves the mouse to its center,
 * and clicks it using one of three methods.
 *
 * @param {import('puppeteer').Page} page The Puppeteer page.
 * @param {string|import('puppeteer').ElementHandle} selector CSS selector or ElementHandle.
 * @param {number} x0 Previous mouse X coordinate.
 * @param {number} y0 Previous mouse Y coordinate.
 * @param {1|2|3} [clickOption=1] Which click strategy to use.
 * @returns {Promise<{x1:number,y1:number}>} New mouse coordinates.
 */
export async function navigateAndClick(page, selector, x0, y0, clickOption = 1) {
  let element, x1 = x0, y1 = y0;

  // Resolve selector to ElementHandle
  try {
    if (typeof selector === 'string') {
      await page.waitForSelector(selector, { timeout: 60000 });
      element = await page.$(selector);
      if (!element) throw new Error(`Selector "${selector}" returned no element.`);
    } else {
      element = selector;
    }
  } catch (err) {
    console.error(`ERROR (navigateAndClick): Could not find "${selector}":`, err.message);
    return { x1, y1 };
  }

  // Move mouse to element center via Bezier curve
  try {
    const box = await element.boundingBox();
    if (box && Number.isFinite(x0) && Number.isFinite(y0)) {
      // Compute random target within the element
      x1 = Math.min(Math.max(box.x + box.width / 2 + gauss(0, box.width / 4), box.x), box.x + box.width);
      y1 = Math.min(Math.max(box.y + box.height / 2 + gauss(0, box.height / 4), box.y), box.y + box.height);

      // Build curved path
      const control = {
        x: (x0 + x1) / 2 + gauss(0, Math.abs(x1 - x0) / 2),
        y: (y0 + y1) / 2 + gauss(0, Math.abs(y1 - y0) / 2)
      };
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = (1 - t)**2 * x0 + 2*(1 - t)*t*control.x + t**2 * x1;
        const y = (1 - t)**2 * y0 + 2*(1 - t)*t*control.y + t**2 * y1;
        await page.mouse.move(x, y);
        await pausaGauss(30, 10);
      }
      await pausaGauss(100, 10);
    } else {
      console.info(`INFO (navigateAndClick): Skipping mouse move; invalid bounding box for "${selector}".`);
    }
  } catch (err) {
    console.warn(`WARNING (navigateAndClick): Mouse move failed for "${selector}": ${err.message}`);
  }

  // Perform the click
  try {
    switch (clickOption) {
      case 2:
      case 1:
        console.info(`INFO (navigateAndClick): Clicking "${selector}" (option ${clickOption}).`);
        await element.click({ delay: Math.abs(gauss(70, 10)), button: 'left', clickCount: 1 });
        break;
      case 3:
        console.info(`INFO (navigateAndClick): Clicking via evaluate() for "${selector}".`);
        await page.evaluate(el => el.click(), element);
        break;
      default:
        console.info(`INFO (navigateAndClick): Invalid click option; defaulting to 1.`);
        await element.click({ delay: Math.abs(gauss(70, 10)), button: 'left', clickCount: 1 });
    }
    console.info(`INFO (navigateAndClick): Click succeeded on "${selector}".`);
  } catch (clickErr) {
    console.warn(`WARNING (navigateAndClick): Click failed for option ${clickOption} on "${selector}": ${clickErr.message}`);
    if (/not clickable|not an Element/.test(clickErr.message)) {
      console.info(`INFO (navigateAndClick): Attempting fallback click via evaluate().`);
      await page.evaluate(el => el.click(), element);
      console.info(`INFO (navigateAndClick): Fallback click succeeded on "${selector}".`);
    } else {
      throw clickErr;
    }
  }

  return { x1, y1 };
}

/**
 * Clicks into a text field (selector), clears it, then either pastes or types the given text.
 *
 * @param {import('puppeteer').Page} page The Puppeteer page.
 * @param {string|import('puppeteer').ElementHandle} selector CSS selector or ElementHandle.
 * @param {string} texto The text to fill.
 * @param {"fast"|"slow=(100,600)"} rapidez_escritura How quickly to type.
 * @param {number} x0 Previous mouse X coordinate.
 * @param {number} y0 Previous mouse Y coordinate.
 * @param {boolean} pegarTexto Whether to paste via clipboard (true) or type (false).
 * @returns {Promise<{x1:number,y1:number}>} New mouse coordinates.
 */
export async function navigateAndFullFill(
  page, selector, texto, rapidez_escritura = "slow=(100,600)", x0, y0, pegarTexto = true
  ) {
  let x1 = x0, y1 = y0;
  try {
    // Focus and clear the field
    ({ x1, y1 } = await navigateAndClick(page, selector, x0, y0, 3));
    await pausaGauss(600, 200);

    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await pausaGauss(50, 10);
    await page.keyboard.press('Delete');
    await pausaGauss(100, 20);

    if (pegarTexto) {
      console.info(`INFO (navigateAndFullFill): Pasting text via clipboard.`);
      copiarTextoLargoPortapapeles(texto);
      // Simulate Ctrl+V
      await page.keyboard.down('Control');
      await page.keyboard.press('V');
      await page.keyboard.up('Control');
    } else {
      console.info(`INFO (navigateAndFullFill): Typing text (${rapidez_escritura}).`);
      const length = texto.length;
      const pauseBase = rapidez_escritura === "fast" ? 20 : 100;
      const pauseDev = rapidez_escritura === "fast" ? 20 : 600;
      for (let i = 0; i < length; i++) {
        await page.keyboard.type(texto[i]);
        const delay = Math.abs(gauss(pauseBase, pauseDev));
        await new Promise(res => setTimeout(res, delay));
      }
    }

  } catch (error) {
    console.error(`ERROR (navigateAndFullFill): Selector "${selector}" ->`, error.message);
  }
  return { x1, y1 };
}
