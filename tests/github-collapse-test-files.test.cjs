const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");

const scriptPath = "scripts/github-collapse-test-files/github-collapse-test-files.user.js";
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

// Keep the observed GitHub header shape; only its native toggle handler is simulated.
const file = (id, path, collapsed = false, directLabel = false) => `
  <section id="diff-${id}" role="region" aria-labelledby="heading-${id}">
    <div data-diff-header-wrapper="true">
      <button type="button" ${directLabel ? `aria-label="${collapsed ? "Expand" : "Collapse"} file"` : `aria-labelledby="toggle-${id}"`} data-toggle>
        <svg><path></path></svg>
      </button>
      <span id="toggle-${id}" aria-hidden="true">${collapsed ? "Expand" : "Collapse"} file</span>
      <h3 id="heading-${id}"><a href="#diff-${id}"><code>‎${path}‎</code></a></h3>
      <button aria-label="Expand all lines: ${path}">More lines</button>
      <button aria-label="Not Viewed" aria-pressed="false">Viewed</button>
    </div>
    <pre ${collapsed ? "hidden" : ""}>code diff</pre>
  </section>`;

const setup = async (t, html, url = "https://github.com/acme/demo/pull/1/changes") => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route("**/*", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
  await page.goto(url);
  await page.evaluate(() => {
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-toggle]");
      if (!button) return;
      const container = button.closest("section");
      const content = container.querySelector("pre");
      content.hidden = !content.hidden;
      const label = content.hidden ? "Expand file" : "Collapse file";
      container.querySelector('[id^="toggle-"]').textContent = label;
      if (button.hasAttribute("aria-label")) button.setAttribute("aria-label", label);
      button.dataset.clicks = String(Number(button.dataset.clicks || 0) + 1);
    });
  });
  if (fs.existsSync(scriptPath)) await page.addScriptTag({ path: scriptPath });
  return page;
};
const settle = page => page.waitForTimeout(250);
const hidden = (page, id) => page.locator(`#diff-${id} pre`).evaluate(el => el.hidden);

test("collapses only .test.extension filenames and never marks files viewed", async t => {
  const paths = [
    ["a", "src/app.test.ts", true],
    ["b", "app.test.tsx", true],
    ["c", "src/deep/app.test.js", true],
    ["d", "src/app.integration.test.py", true],
    ["e", "src/app.ts", false],
    ["f", "src/app.spec.ts", false],
    ["g", "src/app.test.ts.snap", false],
    ["h", "src.test.ts/app.js", false],
    ["i", "src/app.test.", false],
    ["j", "src/test.ts", false],
  ];
  const page = await setup(t, paths.map(([id, path]) => file(id, path, false, id === "b")).join(""));
  await settle(page);
  for (const [id, path, expected] of paths) assert.equal(await hidden(page, id), expected, path);
  assert.equal(await page.locator('[aria-pressed="true"]').count(), 0);
  assert.equal(await page.locator('h3:visible').count(), paths.length);
});

test("does not toggle already collapsed files and respects manual expansion through rerenders", async t => {
  const page = await setup(t, file("a", "app.test.ts") + file("b", "closed.test.ts", true));
  await settle(page);
  assert.equal(await hidden(page, "a"), true);
  assert.equal(await page.locator('#diff-b [data-toggle]').getAttribute("data-clicks"), null);
  await page.locator('#diff-a [data-toggle] svg').click();
  await settle(page);
  assert.equal(await hidden(page, "a"), false);
  await page.locator('#diff-a').evaluate((el, html) => { el.outerHTML = html; }, file("a", "app.test.ts"));
  await settle(page);
  assert.equal(await hidden(page, "a"), false);
});

test("collapses asynchronously inserted files and remounted defaults", async t => {
  const page = await setup(t, "<main></main>");
  await page.locator('main').evaluate((el, html) => { el.innerHTML = html; }, file("a", "late.test.ts"));
  await settle(page);
  assert.equal(await hidden(page, "a"), true);
  await page.locator('#diff-a').evaluate((el, html) => { el.outerHTML = html; }, file("a", "late.test.ts"));
  await settle(page);
  assert.equal(await hidden(page, "a"), true);
  assert.equal(await page.locator('#diff-a [data-toggle]').getAttribute("data-clicks"), "1");
});

test("waits for late labels and enabled controls", async t => {
  const page = await setup(t, file("a", "late.test.ts").replace('data-toggle>', 'data-toggle disabled>').replace('>Collapse file<', '><'));
  await settle(page);
  assert.equal(await hidden(page, "a"), false);
  await page.evaluate(() => {
    document.querySelector('[data-toggle]').disabled = false;
    document.querySelector('#toggle-a').textContent = 'Collapse file';
  });
  await settle(page);
  assert.equal(await hidden(page, "a"), true);
});

test("activates after SPA navigation and resets manual overrides for another PR", async t => {
  const page = await setup(t, file("a", "app.test.ts"), "https://github.com/acme/demo/pull/1");
  await settle(page);
  assert.equal(await hidden(page, "a"), false);
  await page.evaluate(() => {
    history.pushState({}, '', '/acme/demo/pull/1/files/abcdef');
    document.dispatchEvent(new Event('turbo:load'));
  });
  await settle(page);
  assert.equal(await hidden(page, "a"), true);
  await page.locator('#diff-a [data-toggle]').click();
  await page.evaluate(html => {
    history.pushState({}, '', '/acme/demo/pull/2/changes');
    document.body.innerHTML = html;
  }, file("a", "app.test.ts"));
  await settle(page);
  assert.equal(await hidden(page, "a"), true);
});

test("ignores non-GitHub hosts and non-PR diff pages", async t => {
  for (const url of ['https://example.com/acme/demo/pull/1/changes', 'https://github.com/acme/demo/commit/123', 'https://github.com/acme/demo/pull/1/checks']) {
    const page = await setup(t, file("a", "app.test.ts"), url);
    await settle(page);
    assert.equal(await hidden(page, "a"), false, url);
  }
});
