import { chromium } from 'playwright';

(async () => {
  console.log('🚀 Comparing LOCAL vs PRODUCTION\n');
  const browser = await chromium.launch({ headless: false });

  const testSite = async (url, label) => {
    const page = await browser.newPage();
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📍 Testing: ${label}`);
    console.log(`🔗 URL: ${url}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

      // Check elements
      const loginScreen = await page.locator('.login-screen').count();
      const lightRays = await page.locator('.light-rays-container').count();
      const canvas = await page.locator('canvas').count();
      const viewport = page.viewportSize();
      const isDesktop = await page.evaluate(() => window.matchMedia("(min-width: 900px)").matches);

      console.log(`✅ Page loaded successfully`);
      console.log(`📐 Viewport: ${viewport.width}x${viewport.height}`);
      console.log(`🖥️  Desktop mode: ${isDesktop}`);
      console.log(`📦 Login screen: ${loginScreen} element(s)`);
      console.log(`🌟 LightRays container: ${lightRays} element(s)`);
      console.log(`🎨 Canvas elements: ${canvas}`);

      // Get actual HTML of LightRays container
      const lightRaysHTML = await page.locator('.light-rays-container').innerHTML();
      console.log(`\n🔍 LightRays container HTML length: ${lightRaysHTML.length} chars`);
      console.log(`   Has canvas: ${lightRaysHTML.includes('<canvas')}`);
      console.log(`   Inline styles: ${lightRaysHTML.substring(0, 100)}...`);

      // Take screenshot
      await page.screenshot({ path: `screenshot-${label.replace(/\s+/g, '-').toLowerCase()}.png`, fullPage: true });
      console.log(`\n📸 Screenshot saved: screenshot-${label.replace(/\s+/g, '-').toLowerCase()}.png`);

      // Wait for inspection
      console.log(`\n⏳ Keeping browser open for 15 seconds...`);
      await page.waitForTimeout(15000);

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    } finally {
      await page.close();
    }
  };

  // Test both
  await testSite('http://localhost:5173', 'LOCAL DEV');
  await testSite('https://archsrm.netlify.app', 'PRODUCTION');

  await browser.close();
  console.log('\n\n✅ Comparison complete!');
})();
