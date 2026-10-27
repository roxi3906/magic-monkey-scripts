const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fs = require("node:fs");
const { routes, html, checks } = require("./fixtures.cjs");
const scriptPath = "scripts/github-watch/github-watch.user.js";
let browser;
before(async () => {
  fs.mkdirSync(".codex/probes", { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
});
const setup = async () => {
  const context = await browser.newContext();
  let requests = [];
  let fail = false;
  let override;
  const store = {};
  const tabs = {};
  const pages = new Map();
  await context.exposeBinding("gmRead", (_, key) => store[key]);
  await context.exposeBinding("gmWrite", async ({ page }, key, value) => {
    store[key] = value;
    for (const other of pages.keys())
      if (other !== page)
        await other.evaluate(
          ({ key, value }) => {
            for (const f of window.listeners[key] || [])
              f(key, null, value, true);
          },
          { key, value },
        );
  });
  await context.exposeBinding("gmKeys", () => Object.keys(store));
  await context.exposeBinding("gmDelete", (_, key) => {
    delete store[key];
  });
  await context.exposeBinding(
    "tabRead",
    ({ page }) => tabs[pages.get(page)] || {},
  );
  await context.exposeBinding("tabSave", ({ page }, v) => {
    tabs[pages.get(page)] = v;
  });
  await context.exposeBinding("tabsRead", () => tabs);
  await context.route("https://github.com/**", async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (override && (await override(route))) return;
    const data = routes(url);
    await route.fulfill({
      status: fail ? 503 : data ? 200 : 404,
      contentType: "text/html",
      headers: { etag: '"fixture"' },
      body: fail ? "Unavailable" : data || "Not found",
    });
  });
  const newPage = async (url = "https://github.com/acme/demo/pull/1") => {
    const page = await context.newPage();
    pages.set(page, String(pages.size + 1));
    await page.addInitScript(() => {
      // Keep the real scheduler but expose its callbacks to test elapsed background refreshes.
      window.scheduled = new Map();
      const schedule = window.setInterval.bind(window);
      window.setInterval = (callback, ms, ...args) => {
        window.scheduled.set(ms, callback);
        return schedule(callback, ms, ...args);
      };
      window.listeners = {};
      window.opened = [];
      window.notifications = [];
      window.GM_notification = (details) => notifications.push(details);
      window.focused = 0;
      window.GM = {
        getValue: async (k, d) => (await gmRead(k)) ?? d,
        setValue: gmWrite,
        listValues: gmKeys,
        deleteValue: gmDelete,
      };
      window.GM_getTab = (cb) => tabRead().then(cb);
      window.GM_saveTab = tabSave;
      window.GM_getTabs = (cb) => tabsRead().then(cb);
      window.GM_addValueChangeListener = (k, f) =>
        (listeners[k] ??= []).push(f);
      window.GM_openInTab = (url) => opened.push(url);
      window.focus = () => {
        focused++;
      };
    });
    await page.goto(url);
    if (fs.existsSync(scriptPath))
      await page.addScriptTag({ content: fs.readFileSync(scriptPath, "utf8") });
    return page;
  };
  return {
    context,
    newPage,
    store,
    tabs,
    requests,
    fail: () => {
      fail = true;
    },
    respond: (fn) => {
      override = fn;
    },
  };
};

test("panel tracks PRs and repos, sorts passed CI, persists, confirms removal and selects branches", async () => {
  const env = await setup();
  try {
    const page = await env.newPage();
    const button = page.getByRole("button", { name: "打开 GitHub 关注面板" });
    assert.equal(await button.count(), 1, "floating launcher exists");
    await button.click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText("Pending change", { exact: true }).waitFor();
    await page.getByText("提交 3", { exact: true }).waitFor();
    await page.getByText("评论 4", { exact: true }).waitFor();
    await page.evaluate(() => {
      history.pushState({}, "", "/acme/demo/pull/2");
      document.dispatchEvent(new Event("turbo:load"));
    });
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText("全部通过 · 1/1", { exact: true }).waitFor();
    assert.equal(
      await page
        .locator('article[data-kind="pr"]')
        .first()
        .getAttribute("data-key"),
      "acme/demo#2",
    );
    await page
      .getByRole("button", { name: "关注当前仓库", exact: true })
      .click();
    await page.getByRole("button", { name: /仓库 \(1\)/ }).click();
    await page.getByText("★ 123", { exact: true }).waitFor();
    await page.getByText("开启 PR 2", { exact: true }).waitFor();
    await page.getByRole("button", { name: "选择分支", exact: true }).click();
    await page.getByLabel("dev", { exact: true }).check();
    await page.getByRole("button", { name: "更多分支", exact: true }).click();
    await page.getByLabel("release/v2", { exact: true }).check();
    await page.getByRole("button", { name: "保存分支", exact: true }).click();
    await page.getByText("dev", { exact: true }).first().waitFor();
    const remove = page.getByRole("button", {
      name: "取消关注 acme/demo",
      exact: true,
    });
    await remove.click();
    await page.getByRole("button", { name: "保留关注", exact: true }).click();
    assert.equal(await remove.count(), 1);
    await remove.click();
    await page.getByRole("button", { name: "确认取消", exact: true }).click();
    await page.getByText("还没有关注仓库", { exact: true }).waitFor();
    await page.getByRole("button", { name: /PR \(2\)/ }).click();
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    const prior = env.requests.length;
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await page.waitForTimeout(200);
    assert.ok(
      env.requests.length - prior < 3,
      "fresh resources are not all fetched again",
    );
    const second = await env.newPage();
    await second.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await second.getByText("Passing change", { exact: true }).waitFor();
    await page.screenshot({ path: ".codex/probes/panel-desktop.png" });
    await page.setViewportSize({ width: 375, height: 760 });
    await page.screenshot({ path: ".codex/probes/panel-mobile.png" });
    assert.ok(
      await page
        .locator("#github-watch")
        .evaluate((el) => el.getBoundingClientRect().right <= innerWidth),
    );
  } finally {
    await env.context.close();
  }
});

test("existing tabs receive a focus request; missing targets open a new tab", async () => {
  const env = await setup();
  try {
    const first = await env.newPage();
    const second = await env.newPage("https://github.com/acme/demo/pull/2");
    await first.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await second.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await second
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await second.getByRole("button", { name: "刷新", exact: true }).waitFor();
    // A throttled but responsive remote tab must still receive the focus request.
    for (const tab of Object.values(env.tabs))
      tab.githubWatch.seenAt = Date.now() - 120000;
    await first
      .getByRole("button", { name: "跳转 acme/demo#2", exact: true })
      .click();
    await first.waitForTimeout(200);
    assert.equal(await second.evaluate(() => focused), 1);
    assert.deepEqual(await first.evaluate(() => opened), []);
    await first
      .getByRole("button", { name: "关注当前仓库", exact: true })
      .click();
    await first.getByRole("button", { name: /仓库 \(1\)/ }).click();
    await first
      .getByRole("button", { name: "跳转 acme/demo", exact: true })
      .click();
    assert.deepEqual(await first.evaluate(() => opened), [
      "https://github.com/acme/demo",
    ]);
  } finally {
    await env.context.close();
  }
});

test("live-shaped parsers cover missing counts, Actions, branches and commit data without executing HTML", async () => {
  const page = await browser.newPage();
  try {
    const source = fs.readFileSync(scriptPath, "utf8");
    await page.evaluate((source) => {
      const module = { exports: {} };
      eval(source);
      window.core = module.exports;
    }, source);
    const data = await page.evaluate(
      ({ repo, pulls, actions, branches, commits, check, old }) => {
        const parse = (s) => new DOMParser().parseFromString(s, "text/html");
        return {
          repo: core.parseRepo(parse(repo)),
          list: core.parsePullList(parse(pulls)),
          actions: core.parseActions(parse(actions)),
          branches: core.parseBranches(parse(branches)),
          commit: core.parseCommit(parse(commits)),
          ci: core.parseChecks(parse(check)),
          legacy: core.parsePR(parse(old)),
        };
      },
      {
        repo: routes("https://github.com/acme/demo"),
        pulls: routes("https://github.com/acme/demo/pulls"),
        actions: routes("https://github.com/acme/demo/actions"),
        branches: routes("https://github.com/acme/demo/branches/all"),
        commits: routes("https://github.com/acme/demo/commits/main"),
        check: html(checks(["This check passed", "This job was skipped"])),
        old: '<span class="js-issue-title">Legacy</span><span class="State">Open</span>',
      },
    );
    assert.equal(data.repo.stars, 123);
    assert.equal(data.list.items[0].comments, 4);
    assert.equal(data.actions[0].state, "success");
    assert.equal(data.branches.more, true);
    assert.equal(data.commit.title, "fix: current commit");
    assert.equal(data.ci.state, "success");
    assert.equal(data.legacy.commits, null);
  } finally {
    await page.close();
  }
});

test("failed refresh retains data as stale and removes passed-first highlighting", async () => {
  const env = await setup();
  try {
    const page = await env.newPage("https://github.com/acme/demo/pull/2");
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText("全部通过 · 1/1", { exact: true }).waitFor();
    for (const [key, value] of Object.entries(env.store))
      if (key.includes(":cache:")) {
        value.at = Date.now() - 120000;
        value.attemptedAt = value.at;
      }
    env.fail();
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await page.getByText(/读取失败 \(503\)/).waitFor();
    assert.equal(
      await page.getByText("Passing change", { exact: true }).count(),
      1,
    );
    assert.equal(await page.locator("article.pass").count(), 0);
  } finally {
    await env.context.close();
  }
});

test("new follows during an in-flight refresh are not stranded until the next refresh period", async () => {
  const env = await setup();
  try {
    env.respond(async (route) => {
      if (
        new URL(route.request().url()).pathname === "/acme/demo/pull/1" &&
        route.request().resourceType() === "fetch"
      ) {
        await new Promise((r) => setTimeout(r, 600));
      }
      return false;
    });
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.evaluate(() => {
      history.pushState({}, "", "/acme/demo/pull/2");
      document.dispatchEvent(new Event("turbo:load"));
    });
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page
      .getByText("Passing change", { exact: true })
      .waitFor({ timeout: 4000 });
  } finally {
    await env.context.close();
  }
});

test("conditional 304 refresh reuses normalized data and sends validators", async () => {
  const env = await setup();
  try {
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText("评论 4", { exact: true }).waitFor();
    for (const [key, value] of Object.entries(env.store))
      if (key.includes(":cache:")) {
        value.at = Date.now() - 120000;
        value.attemptedAt = value.at;
      }
    let revalidated = 0;
    env.respond(async (route) => {
      if (route.request().resourceType() !== "fetch") return false;
      assert.equal(route.request().headers()["if-none-match"], '"fixture"');
      revalidated++;
      await route.fulfill({ status: 304, headers: { etag: '"fixture"' } });
      return true;
    });
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
    assert.equal(revalidated, 3);
    assert.equal(await page.getByText("评论 4", { exact: true }).count(), 1);
    assert.equal(await page.getByText(/读取失败/).count(), 0);
  } finally {
    await env.context.close();
  }
});

test("GitHub Turbo body replacement preserves the panel and navigation actions", async () => {
  const env = await setup();
  try {
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page.evaluate(() => {
      document.body.replaceWith(document.createElement("body"));
      history.pushState({}, "", "/acme/demo");
      document.dispatchEvent(new Event("turbo:load"));
    });
    assert.equal(
      await page.getByRole("button", { name: "关闭面板" }).count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "关注当前 PR", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "关注当前仓库", exact: true })
        .count(),
      1,
    );
  } finally {
    await env.context.close();
  }
});

test("missing CI head identity cannot be marked all passed", async () => {
  const env = await setup();
  try {
    env.respond(async (route) => {
      if (!route.request().url().endsWith("/checks")) return false;
      const payload = checks(["This check passed"]);
      delete payload.pullRequestsLayoutRoute;
      await route.fulfill({ contentType: "text/html", body: html(payload) });
      return true;
    });
    const page = await env.newPage("https://github.com/acme/demo/pull/2");
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText("Passing change", { exact: true }).waitFor();
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
    assert.equal(await page.locator("article.pass").count(), 0);
    assert.equal(await page.getByText(/状态未知/).count(), 1);
  } finally {
    await env.context.close();
  }
});

test("untrusted titles are text and changed login responses cannot overwrite cached data", async () => {
  const env = await setup();
  try {
    const attack = '<img src=x onerror="window.pwned=1">';
    env.respond(async (route) => {
      const url = route.request().url();
      const value = routes(url);
      if (value && new URL(url).pathname === "/acme/demo/pull/2") {
        await route.fulfill({
          contentType: "text/html",
          body: value.replaceAll(
            "Passing change",
            JSON.stringify(attack).slice(1, -1).replaceAll("<", "\\u003c"),
          ),
        });
        return true;
      }
      return false;
    });
    const page = await env.newPage("https://github.com/acme/demo/pull/2");
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText(attack, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    assert.equal(await page.locator("#github-watch img").count(), 0);
    for (const [key, value] of Object.entries(env.store))
      if (key.includes(":cache:")) {
        value.at = Date.now() - 120000;
        value.attemptedAt = value.at;
      }
    env.respond(async (route) => {
      if (route.request().resourceType() !== "fetch") return false;
      await route.fulfill({
        contentType: "text/html",
        body: routes(route.request().url()).replace(
          'content="tester"',
          'content="other-account"',
        ),
      });
      return true;
    });
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    await page.getByText(/登录状态已变化/).waitFor();
    assert.equal(await page.getByText(attack, { exact: true }).count(), 1);
    assert.equal(
      Object.values(env.store).filter(
        (v) => v?.data?.title === "Passing change",
      ).length,
      0,
    );
  } finally {
    await env.context.close();
  }
});

test("rate limits back off remaining requests and unrecognized checks cannot pass", async () => {
  const env = await setup();
  try {
    let blocked = 0;
    env.respond(async (route) => {
      if (route.request().resourceType() !== "fetch") return false;
      blocked++;
      await route.fulfill({
        status: 429,
        headers: { "retry-after": "120" },
        body: "Too many requests",
      });
      return true;
    });
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText(/GitHub 限流/).waitFor();
    assert.equal(blocked, 1);
    assert.equal(await page.locator("article.pass").count(), 0);
    await page.evaluate(
      (source) => {
        const module = { exports: {} };
        eval(source);
        window.core = module.exports;
      },
      fs.readFileSync(scriptPath, "utf8"),
    );
    const bad = await page.evaluate(() => {
      try {
        core.parseChecks(
          new DOMParser().parseFromString("<p>Sign in</p>", "text/html"),
        );
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(bad, true);
  } finally {
    await env.context.close();
  }
});

test("confirmation remains visible when an in-flight refresh redraws a card", async () => {
  const env = await setup();
  try {
    env.respond(async (route) => {
      if (
        route.request().resourceType() === "fetch" &&
        new URL(route.request().url()).pathname === "/acme/demo/pull/1"
      )
        await new Promise((resolve) => setTimeout(resolve, 700));
      return false;
    });
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page
      .getByRole("button", { name: "取消关注 acme/demo#1", exact: true })
      .click();
    await page.getByText("Pending change", { exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "保留关注", exact: true }).count(),
      1,
    );
    assert.equal(
      await page
        .locator("#github-watch")
        .evaluate((el) => el.shadowRoot.activeElement?.textContent),
      "保留关注",
    );
    await page.getByRole("button", { name: "保留关注", exact: true }).click();
    assert.equal(
      await page.locator('article[data-key="acme/demo#1"]').count(),
      1,
    );
    await page
      .getByRole("button", { name: "取消关注 acme/demo#1", exact: true })
      .click();
    await page.getByRole("button", { name: "仓库 (0)", exact: true }).click();
    await page.getByRole("button", { name: "PR (1)", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "保留关注", exact: true }).count(),
      0,
    );
  } finally {
    await env.context.close();
  }
});

// Sanitized Checks sidebar shape: repeated workflow runs appear together.
const suite = (id, workflow, jobs) => `<details id="sidebar_check_suite_${id}">
  <summary><a href="/acme/demo/actions/runs/${id}"><span>${workflow}</span><span>on: pull_request</span></a></summary>
  ${jobs
    .map(
      ([job, name, state]) => `<div class="checks-list-item"><div>
    <span class="checks-list-item-icon"><svg aria-label="${state}"></svg></span>
    <a href="/acme/demo/actions/runs/${id}/job/${job}?pr=1"><span>${name}</span></a>
  </div></div>`,
    )
    .join("")}</details>`;
const mixedChecks = () => {
  const payload = checks([]);
  payload["pullRequestsChecksRoute.Main"].value =
    `<aside aria-label="Check suites">` +
    suite(20, "CI", [
      ...Array.from({ length: 17 }, (_, i) => [
        200 + i,
        `Pass ${i}`,
        "This job succeeded",
      ]),
      ...Array.from({ length: 11 }, (_, i) => [
        300 + i,
        `Skip ${i}`,
        "This job was skipped",
      ]),
      [400, "Fail 0", "This job failed"],
      [401, "Fail 1", "This job failed"],
    ]) +
    suite(10, "CI", [
      [100, "Pass 0", "This job was cancelled"],
      [101, "Skip 0", "This job succeeded"],
      [102, "Skip 1", "This job succeeded"],
    ]) +
    `</aside><svg class="donut-chart"><path class="failure"></path></svg>`;
  return payload;
};

test("CI cards and repository previews show latest classified counts instead of historical jobs", async () => {
  const env = await setup();
  try {
    env.respond(async (route) => {
      if (!route.request().url().endsWith("/checks")) return false;
      await route.fulfill({
        contentType: "text/html",
        body: html(mixedChecks()),
      });
      return true;
    });
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText("评论 4", { exact: true }).waitFor();
    const card = page.locator('article[data-key="acme/demo#1"]');
    assert.match(await card.innerText(), /通过 17.*跳过 11.*失败 2/s);
    assert.equal(
      await card.getByRole("progressbar").getAttribute("aria-valuemax"),
      "30",
    );
    assert.equal(
      await card.getByRole("progressbar").getAttribute("aria-valuenow"),
      "30",
    );
    await page.screenshot({ path: ".codex/probes/ci-counts-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: ".codex/probes/ci-counts-mobile.png" });
    await page
      .getByRole("button", { name: "关注当前仓库", exact: true })
      .click();
    await page.getByRole("button", { name: "仓库 (1)", exact: true }).click();
    await page.getByText("★ 123").waitFor();
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
    assert.equal(
      await page
        .getByText("通过 17 · 跳过 11 · 失败 2", { exact: true })
        .count(),
      2,
    );
  } finally {
    await env.context.close();
  }
});

test("upgrading CI cache refetches counts without losing followed items or other resource validators", async () => {
  const env = await setup();
  try {
    const prefix = "github-watch:v1:tester:";
    env.store[prefix + "item:acme/demo#1"] = {
      repo: "acme/demo",
      number: 1,
      key: "acme/demo#1",
    };
    env.store[prefix + "cache:/acme/demo/pull/1/checks"] = {
      data: {
        state: "success",
        total: 33,
        done: 33,
        passed: 20,
        sha: "abc123",
      },
      at: Date.now(),
      attemptedAt: Date.now(),
      etag: '"legacy"',
      error: "",
    };
    let fetched = 0;
    env.respond(async (route) => {
      if (!route.request().url().endsWith("/checks")) return false;
      assert.equal(route.request().headers()["if-none-match"], undefined);
      fetched++;
      await route.fulfill({
        contentType: "text/html",
        body: html(mixedChecks()),
      });
      return true;
    });
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page.getByText("评论 4", { exact: true }).waitFor();
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
    assert.equal(fetched, 1);
    assert.match(
      await page.locator('article[data-key="acme/demo#1"]').innerText(),
      /通过 17.*跳过 11.*失败 2/s,
    );
    assert.ok(env.store[prefix + "item:acme/demo#1"]);
  } finally {
    await env.context.close();
  }
});

test("CI deduplication keeps distinct workflows and unknown jobs, and ignores superseded failures", async () => {
  const page = await browser.newPage();
  try {
    const parse = async (fragment) =>
      page.evaluate(
        ({ source, fragment }) => {
          const module = { exports: {} };
          eval(source);
          return module.exports.parseChecks(
            new DOMParser().parseFromString(fragment, "text/html"),
          );
        },
        { source: fs.readFileSync(scriptPath, "utf8"), fragment },
      );
    const history =
      suite(2, "CI", [[20, "Build", "This job succeeded"]]) +
      suite(1, "CI", [[10, "Build", "This job failed"]]);
    const latest = await parse(
      history +
        '<svg class="donut-chart"><path class="failure"></path><path class="success"></path></svg>',
    );
    assert.equal(latest.total, 1);
    assert.equal(latest.state, "success");
    assert.equal(latest.failed, 0);
    const mixed = await parse(
      history +
        suite(3, "Other CI", [[30, "Build", "This job is queued"]]) +
        '<div class="checks-list-item-icon"><svg aria-label="Unrecognized status"></svg></div>',
    );
    assert.equal(mixed.total, 3);
    assert.equal(mixed.pending, 1);
    assert.equal(mixed.unknown, 1);
    assert.equal(mixed.done, 1);
    assert.equal(mixed.state, "unknown");
    const hidden = await parse(
      suite(2, "CI", [[20, "Build", "This job succeeded"]]) +
        '<svg class="donut-chart"><path class="failure"></path></svg>',
    );
    assert.equal(hidden.state, "failure");
    assert.equal(hidden.incomplete, true);
    assert.equal(hidden.failed, 0); // No invented count for a hidden result.
    const missingSkipped = await parse(
      suite(2, "CI", [[20, "Build", "This job succeeded"]]) +
        '<svg class="donut-chart"><path class="success"></path><path class="skipped"></path></svg>',
    );
    assert.equal(missingSkipped.incomplete, true);
    assert.equal(missingSkipped.state, "unknown");
    const thirdParty = await parse('<div class="checks-list-item"><span class="checks-list-item-icon"><svg aria-label="This check is in progress"></svg></span><a class="SideNav-subItem" href="/acme/demo/pull/1/checks?check_run_id=42"><span>External CI</span></a></div>');
    assert.equal(thirdParty.activeChecks[0].name, "External CI");
  } finally {
    await page.close();
  }
});

test("only current-tab follow controls remain, with group switches below them", async () => {
  const env = await setup();
  try {
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    assert.equal(await page.getByRole("textbox").count(), 0);
    assert.equal(
      await page.getByRole("button", { name: "添加关注", exact: true }).count(),
      0,
    );
    const follow = await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .boundingBox();
    const group = await page
      .getByRole("button", { name: "PR (0)", exact: true })
      .boundingBox();
    assert.ok(group.y >= follow.y + follow.height);
    await page.evaluate(() => {
      history.pushState({}, "", "/settings/profile");
      document.dispatchEvent(new Event("turbo:load"));
    });
    assert.equal(
      await page.getByRole("button", { name: /关注当前/ }).count(),
      0,
    );
    assert.match(await page.locator(".footer").innerText(), /30 秒.*后台/);
  } finally {
    await env.context.close();
  }
});

test("PR status is prominent and running CI stays visible alongside failed checks and creation dates", async () => {
  const env = await setup();
  try {
    env.respond(async (route) => {
      if (!route.request().url().endsWith("/checks")) return false;
      const payload = checks([]);
      payload["pullRequestsChecksRoute.Main"].value = suite(10, "CI", [
        [100, "Build linux", "This job is in progress"],
        [101, "Build windows", "This job is queued"],
        [102, "Lint", "This job failed"],
      ]);
      await route.fulfill({ contentType: "text/html", body: html(payload) });
      return true;
    });
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText("评论 4", { exact: true }).waitFor();
    const card = page.locator('article[data-key="acme/demo#1"]');
    assert.equal(await card.locator('.pr-state[data-state="open"]').count(), 1);
    assert.match(await card.innerText(), /CI 进行中 2/);
    assert.match(await card.innerText(), /运行中：CI \/ Build linux/);
    assert.match(await card.innerText(), /排队中：CI \/ Build windows/);
    assert.match(await card.innerText(), /失败 1/);
    await page.screenshot({ path: ".codex/probes/pr-status-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: ".codex/probes/pr-status-mobile.png" });
    await page
      .getByRole("button", { name: "关注当前仓库", exact: true })
      .click();
    await page.getByText("★ 123", { exact: true }).waitFor();
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
    const mini = page.locator('.mini[data-key="acme/demo#1"]');
    assert.equal(
      await mini.locator('time[datetime="2026-10-25T00:00:00Z"]').count(),
      1,
    );
    assert.match(await mini.innerText(), /创建于/);
    assert.match(await mini.innerText(), /Build linux/);
  } finally {
    await env.context.close();
  }
});

test("30-second scheduled updates run with a hidden document and closed panel", async () => {
  const env = await setup();
  try {
    env.store["github-watch:v1:tester:item:acme/demo#1"] = {
      repo: "acme/demo",
      number: 1,
      key: "acme/demo#1",
    };
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page.getByText("评论 4", { exact: true }).waitFor();
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
    await page.getByRole("button", { name: "关闭面板", exact: true }).click();
    assert.equal(await page.evaluate(() => scheduled.has(30000)), true);
    let requests = 0;
    env.respond(async (route) => {
      if (route.request().resourceType() !== "fetch") return false;
      requests++;
      assert.equal(route.request().headers()["if-none-match"], '\"fixture\"');
      await route.fulfill({ status: 304, headers: { etag: '\"fixture\"' } });
      return true;
    });
    await page.evaluate(async () => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      const now = Date.now();
      Date.now = () => now + 31000;
      await scheduled.get(30000)();
    });
    assert.equal(requests, 3);
    await page.evaluate(async () => {
      await scheduled.get(30000)();
    });
    assert.equal(
      requests,
      3,
      "fresh background caches prevent duplicate downloads",
    );
  } finally {
    await env.context.close();
  }
});

// Only a fresh completion transition should notify, including failing terminal results.
test(
    "CI completion notifies once across tabs and clicking reuses the PR tab",
    async () => {
      const env = await setup();
      try {
        const first = await env.newPage();
        const second = await env.newPage("https://github.com/acme/demo");
        await first
          .getByRole("button", { name: "打开 GitHub 关注面板" })
          .click();
        await first
          .getByRole("button", { name: "关注当前 PR", exact: true })
          .click();
        await first.getByText("评论 4", { exact: true }).waitFor();
        await first
          .getByRole("button", { name: "刷新", exact: true })
          .waitFor();
        await second.evaluate(async () => {
          await scheduled.get(30000)();
        });
        env.respond(async (route) => {
          if (!route.request().url().endsWith("/checks")) return false;
          await route.fulfill({
            contentType: "text/html",
            body: html(checks(["This job succeeded", "This job failed"])),
          });
          return true;
        });
        for (const [key, value] of Object.entries(env.store))
          if (key.includes(":cache:")) {
            value.at = Date.now() - 31000;
            value.attemptedAt = value.at;
          }
        await Promise.all(
          [first, second].map((page) =>
            page.evaluate(async () => {
              Object.defineProperty(document, "hidden", {
                configurable: true,
                value: true,
              });
              await scheduled.get(30000)();
            }),
          ),
        );
        const pages = [first, second];
        const counts = await Promise.all(
          pages.map((page) => page.evaluate(() => notifications.length)),
        );
        assert.equal(counts[0] + counts[1], 1);
        const sender = pages[counts.indexOf(1)];
        const notice = await sender.evaluate(() => ({
          title: notifications[0].title,
          text: notifications[0].text,
          url: notifications[0].url,
        }));
        assert.match(notice.title, /#1.*Pending change/);
        assert.match(notice.text, /通过 1.*失败 1/);
        assert.equal(notice.url, "https://github.com/acme/demo/pull/1");
        // Background throttling must not exclude an old but responsive tab.
        for (const tab of Object.values(env.tabs)) tab.githubWatch.seenAt = Date.now() - 120000;
        await sender.evaluate(async () => {
          window.prevented = false;
          await notifications[0].onclick({
            preventDefault: () => {
              prevented = true;
            },
          });
        });
        assert.equal(await sender.evaluate(() => prevented), true);
        assert.equal(await first.evaluate(() => focused), 1);
        assert.equal(await sender.evaluate(() => opened.length), 0);
        await Promise.all(
          pages.map((page) =>
            page.evaluate(async () => {
              await scheduled.get(30000)();
            }),
          ),
        );
        assert.equal(
          (
            await Promise.all(
              pages.map((page) => page.evaluate(() => notifications.length)),
            )
          ).reduce((a, b) => a + b),
          1,
        );
        // If the matching tab navigates away, the same notification opens the PR instead.
        await first.evaluate(() => {
          history.pushState({}, "", "/acme/demo");
          // Keep the old registration to simulate leaving GitHub without a route callback.
        });
        await first.waitForTimeout(50);
        await sender.evaluate(async () => {
          await notifications[0].onclick({ preventDefault() {} });
        });
        assert.deepEqual(await sender.evaluate(() => opened), [
          "https://github.com/acme/demo/pull/1",
        ]);
      } finally {
        await env.context.close();
      }
    },
  );

test("already completed CI is a silent baseline and stale results cannot notify", async () => {
  const env = await setup();
  try {
    const page = await env.newPage("https://github.com/acme/demo/pull/2");
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText("全部通过 · 1/1", { exact: true }).waitFor();
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => notifications.length), 0);
    env.fail();
    for (const [key, value] of Object.entries(env.store))
      if (key.includes(":cache:")) {
        value.at = Date.now() - 31000;
        value.attemptedAt = value.at;
      }
    await page.evaluate(async () => {
      await scheduled.get(30000)();
    });
    assert.equal(await page.evaluate(() => notifications.length), 0);
  } finally {
    await env.context.close();
  }
});

test("completion rejects mismatched or incomplete CI and retries notification API failures", async () => {
  const env = await setup();
  try {
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page
      .getByRole("button", { name: "关注当前 PR", exact: true })
      .click();
    await page.getByText("评论 4", { exact: true }).waitFor();
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
    const expire = () => {
      for (const [key, value] of Object.entries(env.store))
        if (key.includes(":cache:")) {
          value.at = Date.now() - 31000;
          value.attemptedAt = value.at;
        }
    };
    let mode = "mismatch";
    env.respond(async (route) => {
      if (!route.request().url().endsWith("/checks")) return false;
      const payload = checks(["This job succeeded"]);
      if (mode === "mismatch")
        payload.pullRequestsLayoutRoute.pullRequest.headSha = "old-sha";
      if (mode === "incomplete")
        payload["pullRequestsChecksRoute.Main"].value +=
          '<svg class="donut-chart"><path class="in_progress"></path></svg>';
      await route.fulfill({ contentType: "text/html", body: html(payload) });
      return true;
    });
    for (mode of ["mismatch", "incomplete"]) {
      expire();
      await page.evaluate(async () => {
        await scheduled.get(30000)();
      });
      assert.equal(await page.evaluate(() => notifications.length), 0);
    }
    mode = "complete";
    await page.evaluate(() => {
      GM_notification = () => {
        throw new Error("permission denied");
      };
    });
    expire();
    await page.evaluate(async () => {
      await scheduled.get(30000)();
    });
    assert.match(await page.locator(".notice").innerText(), /CI 通知发送失败/);
    await page.evaluate(() => {
      GM_notification = (details) => notifications.push(details);
    });
    await page.evaluate(async () => {
      await scheduled.get(30000)();
    });
    assert.equal(await page.evaluate(() => notifications.length), 1);
    assert.equal(await page.locator(".notice").innerText(), "");
  } finally {
    await env.context.close();
  }
});


test("monitoring continues without Web Locks and explains notifications are unavailable", async () => {
  const env = await setup();
  try {
    await env.context.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined }));
    const page = await env.newPage();
    await page.getByRole("button", { name: "打开 GitHub 关注面板" }).click();
    await page.getByRole("button", { name: "关注当前 PR", exact: true }).click();
    await page.getByText("评论 4", { exact: true }).waitFor();
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor();
    assert.match(await page.locator(".notice").innerText(), /不支持 Web Locks/);
    assert.equal(await page.evaluate(() => notifications.length), 0);
    assert.match(await page.locator("article").innerText(), /CI 进行中/);
  } finally {
    await env.context.close();
  }
});
