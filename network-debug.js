import { chromium } from 'playwright';

(async () => {
  console.log('🔍 NETWORK DEBUGGING TEST\n');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Log all network activity
  page.on('request', req => {
    console.log(`→ ${req.method()} ${req.url().substring(0, 80)}`);
  });

  page.on('response', res => {
    const status = res.status();
    const color = status >= 400 ? '❌' : status >= 300 ? '⚠️' : '✅';
    console.log(`${color} ${status} ${res.url().substring(0, 80)}`);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[ERROR] ${msg.text()}`);
    }
  });

  try {
    console.log('━ Navigating to prod...\n');
    await page.goto('https://archsrm.netlify.app/', { waitUntil: 'networkidle' });

    console.log('\n━ Entering credentials...\n');
    await page.locator('input[type="text"]').first().fill('sb7092');
    await page.locator('button:has-text("Continue")').first().click();
    await page.waitForTimeout(2000);

    console.log('\n━ Entering password...\n');
    await page.locator('input[type="password"]').first().fill('ABC123@rupsou');
    await page.locator('button:has-text("Sign in")').first().click();

    console.log('\n━ Waiting for auth response...\n');
    await page.waitForTimeout(8000);

    console.log('\n━ Final page state:\n');
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log(bodyText);

  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    await browser.close();
  }
})();
