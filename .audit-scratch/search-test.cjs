const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newContext().then(c => c.newPage());
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });
  
  await page.goto('https://mn-ccore-lab.pages.dev/search');
  await page.waitForLoadState('networkidle');
  await page.fill('input[placeholder*="Search"]', 'r01');
  await page.waitForTimeout(1000);
  
  // Find the first project result link
  const projectLinks = await page.$$eval('a[href*="/projects/"]', els => els.map(e => e.getAttribute('href')));
  console.log('Project result hrefs:', JSON.stringify(projectLinks, null, 2));
  
  // Try clicking the first project link
  if (projectLinks.length > 0) {
    const beforeUrl = page.url();
    console.log('Before click URL:', beforeUrl);
    await page.click(`a[href="${projectLinks[0]}"]`);
    await page.waitForTimeout(2000);
    const afterUrl = page.url();
    console.log('After click URL:', afterUrl);
    const h1 = await page.$eval('h1', el => el.textContent).catch(() => 'NO H1');
    console.log('H1 on destination page:', h1);
    const errorText = await page.$eval('body', el => el.textContent).catch(() => '').then(t => t.includes('No project matches') ? 'NOT FOUND MESSAGE PRESENT' : 'no error message');
    console.log('Error check:', errorText);
  }
  
  await browser.close();
})();
