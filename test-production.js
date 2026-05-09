import { chromium } from 'playwright';

(async () => {
  console.log('🚀 Starting production site test...\n');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Enable console logging
  page.on('console', msg => console.log(`[CONSOLE] ${msg.type()}: ${msg.text()}`));

  try {
    console.log('📍 Navigating to https://archsrm.netlify.app/...');
    await page.goto('https://archsrm.netlify.app/', { waitUntil: 'networkidle', timeout: 15000 });

    console.log('✅ Page loaded\n');

    // Check what's visible
    console.log('🔍 Checking visible elements...');
    const loginScreen = await page.locator('.login-screen').count();
    const lightRays = await page.locator('.light-rays-container').count();
    const homeScreen = await page.locator('[class*="home"]').count();
    const marks = await page.locator('[class*="marks"]').count();

    console.log(`  Login screen: ${loginScreen}`);
    console.log(`  Light rays: ${lightRays}`);
    console.log(`  Home screen: ${homeScreen}`);
    console.log(`  Marks: ${marks}\n`);

    // Check viewport and desktop mode
    const viewport = page.viewportSize();
    console.log(`📐 Viewport: ${viewport.width}x${viewport.height}`);
    
    const isDesktop = await page.evaluate(() => window.matchMedia("(min-width: 900px)").matches);
    console.log(`🖥️  Desktop: ${isDesktop}\n`);

    // Take screenshot
    console.log('📸 Taking screenshot...');
    await page.screenshot({ path: 'production-screenshot.png', fullPage: true });
    console.log('✅ Screenshot saved\n');

    // Wait for user to inspect
    console.log('⏳ Browser will stay open for 30 seconds. Inspect the page...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
    console.log('\n🏁 Test complete');
  }
})();
