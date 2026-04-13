// Verify the CSS row-height fix is applied correctly at mobile.
// Loads the local preview page, then uses page.evaluate to build synthetic rows.
const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // Load the built index.html so the CSS is applied
  await page.goto('http://127.0.0.1:4321/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(500);

  // Inject synthetic test rows and measure
  const result = await page.evaluate(() => {
    const container = document.createElement('div');
    container.className = 'table-container';
    container.style.width = '375px';
    const makeRow = (cls) => {
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = `
        <div style="padding: 12px 0;">
          <div style="font-size: 14px; font-weight: 500; margin-bottom: 4px;">Test Project Title That Is Quite Long To Test Wrapping</div>
          <div style="display: flex; gap: 12px; font-size: 11px;">
            <span>Active</span>
            <span>Planning</span>
            <span>Category tag</span>
          </div>
        </div>
      `;
      return el;
    };
    const plainRow = makeRow('project-list-row');
    const manuscriptRow = makeRow('manuscript-list-row');
    container.appendChild(plainRow);
    container.appendChild(manuscriptRow);
    document.body.appendChild(container);

    const getStyle = (el) => {
      const cs = getComputedStyle(el);
      return {
        height: cs.height,
        minHeight: cs.minHeight,
        boundingHeight: Math.round(el.getBoundingClientRect().height),
      };
    };

    return {
      viewportWidth: window.innerWidth,
      project: getStyle(plainRow),
      manuscript: getStyle(manuscriptRow),
      projectContentHeight: plainRow.firstElementChild.scrollHeight,
    };
  });

  console.log('Mobile CSS verification (iPhone 13, 390px):');
  console.log(JSON.stringify(result, null, 2));

  // Also check at desktop
  await ctx.close();
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const desktopPage = await desktopCtx.newPage();
  await desktopPage.goto('http://127.0.0.1:4321/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await desktopPage.waitForTimeout(500);
  const desktopResult = await desktopPage.evaluate(() => {
    const container = document.createElement('div');
    container.className = 'table-container';
    const makeRow = (cls) => {
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = '<div>Row content</div>';
      return el;
    };
    const row = makeRow('project-list-row');
    container.appendChild(row);
    document.body.appendChild(container);
    const cs = getComputedStyle(row);
    return { height: cs.height, minHeight: cs.minHeight, boundingHeight: Math.round(row.getBoundingClientRect().height) };
  });
  console.log('\nDesktop CSS verification (1440px):');
  console.log(JSON.stringify(desktopResult, null, 2));

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
