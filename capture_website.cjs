const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const assetsDir = path.join(__dirname, 'video_assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir);
  }

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Set LocalStorage for authentication
  console.log('Setting localStorage session for NIM...');
  await page.goto('http://localhost:4000', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => {
    localStorage.setItem('sim-user-nim', '1101223157');
  });

  // 2. Capture Dashboard Page
  console.log('Navigating to Dashboard Page...');
  await page.goto('http://localhost:4000/dashboard', { waitUntil: 'load', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 2000));
  await page.screenshot({ path: path.join(assetsDir, 'dashboard_page_icons.png') });
  console.log('Saved dashboard_page_icons.png');

  // 3. Capture Settings Page
  console.log('Navigating to Settings Page...');
  await page.goto('http://localhost:4000/settings', { waitUntil: 'load', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 2000));
  await page.screenshot({ path: path.join(assetsDir, 'settings_page_icons.png') });
  console.log('Saved settings_page_icons.png');

  // 4. Capture Simulation Page
  console.log('Navigating to Simulation Page...');
  await page.goto('http://localhost:4000/simulation', { waitUntil: 'load', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Dismiss Configure modal if visible
  console.log('Entering Simulation workspace...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const continueBtn = buttons.find(b => b.textContent?.toLowerCase().includes('continue'));
    if (continueBtn) continueBtn.click();
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  await page.screenshot({ path: path.join(assetsDir, 'simulation_page_icons.png') });
  console.log('Saved simulation_page_icons.png');

  // Start simulation to capture active telemetry detail selection
  console.log('Clicking Start...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const startBtn = buttons.find(b => b.textContent?.trim() === 'Start');
    if (startBtn) startBtn.click();
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Click on vehicle to open details panel
  console.log('Clicking a vehicle...');
  const canvasSelector = '.sim-canvas';
  const canvasElement = await page.$(canvasSelector);
  if (canvasElement) {
    const box = await canvasElement.boundingBox();
    const targetX = box.x + 240;
    const targetY = box.y + box.height / 2;
    await page.mouse.move(targetX, targetY);
    await page.mouse.click(targetX, targetY);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  await page.screenshot({ path: path.join(assetsDir, 'simulation_page_active_detail.png') });
  console.log('Saved simulation_page_active_detail.png');

  await browser.close();
  console.log('Verification screenshots captured successfully!');
})();
