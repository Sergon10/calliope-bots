/**
 * Navigates the given Puppeteer page to the specified ChatGPT URL,
 * waiting until network is idle.
 *
 * @param {import('puppeteer').Page} page The Puppeteer Page instance.
 * @param {string} url The ChatGPT URL to open.
 * @throws Will rethrow if navigation fails.
 */
export async function gptInit(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    console.info(`INFO (gptInit): Successfully navigated to ChatGPT at ${url}`);
  } catch (error) {
    console.error(`ERROR (gptInit): Failed to open ChatGPT ->`, error.message);
    throw error;
  }
}
