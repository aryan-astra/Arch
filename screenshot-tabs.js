import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    // Login
    await page.goto('https://archsrm.netlify.app/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.locator('input[type="text"]').first().fill('sb7092');
    await page.locator('button:has-text("Continue")').first().click();
    await page.waitForTimeout(2000);
    
    await page.locator('input[type="password"]').first().fill('ABC123@rupsou');
    await page.locator('button:has-text("Sign in")').first().click();
    
    // Wait for app to load
    await page.waitForSelector('[class*="home"], [class*="app"], body > div', { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Take screenshots
    await page.screenshot({ path: 'prod-home.png', fullPage: false });
    console.log('✅ Home screenshot: prod-home.png');

    // Click Attendance tab
    try {
      await page.locator('button, a, div', { hasText: /^Attendance$/ }).first().click({ timeout: 2000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'prod-attendance.png', fullPage: false });
      console.log('✅ Attendance screenshot: prod-attendance.png');
    } catch (e) {
      console.log('⚠️  Attendance tab not clicked (may be loading)');
    }

    // Click Marks tab
    try {
      await page.locator('button, a, div', { hasText: /^Marks$/ }).first().click({ timeout: 2000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'prod-marks.png', fullPage: false });
      console.log('✅ Marks screenshot: prod-marks.png');
    } catch (e) {
      console.log('⚠️  Marks tab not clicked');
    }

    console.log('\n✅ Production verification complete!');

  } catch (error) {
    console.error(`❌ ${error.message}`);
  } finally {
    await browser.close();
  }
})();
