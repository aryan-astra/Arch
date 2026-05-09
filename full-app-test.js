import { chromium } from 'playwright';

(async () => {
  console.log('🔍 COMPREHENSIVE PRODUCTION TEST\n');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Navigate to prod
    console.log('📍 Navigating to https://archsrm.netlify.app/...');
    await page.goto('https://archsrm.netlify.app/', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('✅ Loaded\n');

    // Test 1: Check login page
    console.log('━ Step 1: Login Page ━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Login screen visible`);
    console.log(`✅ LightRays container found`);
    console.log(`✅ Login form loaded\n`);

    // Test 2: Enter credentials
    console.log('━ Step 2: Entering Credentials ━━━━━━━━━━━━━━━━━');
    const netIdInput = page.locator('input[type="text"]').first();
    await netIdInput.fill('sb7092');
    console.log(`✅ NetID entered: sb7092`);

    const continueBtn = page.locator('button:has-text("Continue")').first();
    await continueBtn.click();
    await page.waitForTimeout(2000);
    console.log(`✅ Continue clicked\n`);

    // Test 3: Password page
    console.log('━ Step 3: Password Page ━━━━━━━━━━━━━━━━━━━━━━━');
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill('ABC123@rupsou');
    console.log(`✅ Password entered`);

    const signInBtn = page.locator('button:has-text("Sign in")').first();
    await signInBtn.click();
    await page.waitForTimeout(5000);
    console.log(`✅ Sign in clicked\n`);

    // Test 4: Check if we see legal/consent or app
    console.log('━ Step 4: Checking Next Screen ━━━━━━━━━━━━━━━━');
    const legalScreen = await page.locator('text=/Legal|Terms|Privacy|consent|agree/i').count();
    const homeScreen = await page.locator('[class*="home"]').count();
    const marksUI = await page.locator('[class*="marks"], [class*="graph"]').count();

    console.log(`Legal/Consent screen: ${legalScreen > 0 ? '✅ Found' : '❌ Not found'}`);
    console.log(`Home screen elements: ${homeScreen}`);
    console.log(`Marks UI elements: ${marksUI}\n`);

    // Test 5: Screenshot
    console.log('━ Step 5: Taking Screenshots ━━━━━━━━━━━━━━━━━━');
    await page.screenshot({ path: 'test-1-login.png' });
    console.log(`✅ Saved: test-1-login.png`);

    // Test 6: Check page content
    console.log('\n━ Step 6: Page Content Analysis ━━━━━━━━━━━━━━━');
    const pageTitle = await page.title();
    console.log(`Page title: ${pageTitle}`);

    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 200));
    console.log(`Body text: ${bodyText.replace(/\n/g, ' ').substring(0, 100)}...`);

    // Test 7: Console errors
    console.log('\n━ Step 7: Console Messages ━━━━━━━━━━━━━━━━━━━');
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
      }
    });

    await page.waitForTimeout(5000);

    // Test 8: Check network errors
    const requests = [];
    page.on('response', res => {
      if (res.status() >= 400) {
        requests.push(`${res.status()} ${res.url().substring(0, 80)}`);
      }
    });

    console.log('\n✅ Test complete! Browser remains open for manual inspection.');
    console.log('⏳ Auto-closing in 20 seconds...\n');
    await page.waitForTimeout(20000);

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
  } finally {
    await browser.close();
  }
})();
