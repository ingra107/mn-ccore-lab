const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  
  const responses = [];
  page.on('response', res => {
    if (res.status() >= 400) responses.push({ url: res.url(), status: res.status() });
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack?.substring(0, 300)));
  
  await page.goto('https://mn-ccore-lab.pages.dev/search');
  await page.waitForLoadState('networkidle');
  await page.fill('input[placeholder*="Search"]', 'r01');
  await page.waitForTimeout(1500);
  
  const projectLinks = await page.$$eval('a[href*="/projects/"]', els => els.map(e => ({ href: e.getAttribute('href'), rect: e.getBoundingClientRect() })));
  console.log('Mobile project links found:', projectLinks.length);
  projectLinks.forEach(l => console.log('  ', l.href, 'at y=' + Math.round(l.rect.top || 0), 'w=' + Math.round(l.rect.width || 0)));
  
  if (projectLinks.length > 0) {
    console.log('\nBefore tap URL:', page.url());
    await page.tap(`a[href="${projectLinks[0].href}"]`);
    await page.waitForTimeout(3000);
    console.log('After tap URL:', page.url());
    
    const h1 = await page.$eval('h1', el => el.textContent).catch(() => 'NO H1');
    console.log('H1:', h1);
    const bodyText = await page.$eval('body', el => el.textContent).catch(() => '');
    console.log('Has "No project matches":', bodyText.includes('No project matches'));
    console.log('Has "Something went wrong":', bodyText.includes('Something went wrong'));
  }
  
  console.log('\n4xx/5xx responses:');
  responses.forEach(r => console.log('  ', r.status, r.url));
  
  await browser.close();
})();
