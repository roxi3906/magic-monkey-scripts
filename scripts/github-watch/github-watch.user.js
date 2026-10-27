// ==UserScript==
// @name         GitHub 关注面板
// @name:en      GitHub Watch Panel
// @namespace    https://github.com/roxi3906/magic-monkey-scripts
// @version      1.1.0
// @description  使用已有登录态关注 GitHub 仓库、分支、PR 和 CI，支持缓存和标签跳转。
// @description:en Watch GitHub repositories, branches, pull requests and CI using your existing session.
// @author       Roxi
// @license      MIT
// @homepageURL  https://github.com/roxi3906/magic-monkey-scripts/tree/main/scripts/github-watch
// @supportURL   https://github.com/roxi3906/magic-monkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-watch/github-watch.user.js
// @updateURL    https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-watch/github-watch.user.js
// @match        https://github.com/*
// @noframes
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.listValues
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_getTabs
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @grant        GM_notification
// @grant        window.focus
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const ORIGIN = "https://github.com";
  const TTL = 30000;
  const RESERVED = new Set([
    "settings",
    "login",
    "logout",
    "signup",
    "orgs",
    "users",
    "organizations",
    "marketplace",
    "features",
    "topics",
    "collections",
    "sponsors",
    "search",
    "notifications",
    "new",
    "explore",
    "dashboard",
    "codespaces",
    "account",
    "sessions",
  ]);

  // 所有用户输入和服务端链接都必须留在 GitHub；PR 子页面归一到同一个关注项。
  const parseTarget = (value) => {
    try {
      const input = String(value).trim();
      const url = new URL(
        input.startsWith("/")
          ? input
          : input.includes("://")
            ? input
            : `${ORIGIN}/${input}`,
        ORIGIN,
      );
      if (url.origin !== ORIGIN || url.username || url.password) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (
        parts.length < 2 ||
        RESERVED.has(parts[0].toLowerCase()) ||
        !/^[\w.-]+$/.test(parts[0]) ||
        !/^[\w.-]+$/.test(parts[1])
      )
        return null;
      const repo = `${parts[0]}/${parts[1]}`.toLowerCase();
      const number =
        parts[2] === "pull" && /^[1-9]\d*$/.test(parts[3] || "")
          ? Number(parts[3])
          : null;
      if (parts[2] === "pull" && !Number.isSafeInteger(number)) return null;
      return { repo, number, key: number ? `${repo}#${number}` : repo };
    } catch {
      return null;
    }
  };
  const targetURL = (target) =>
    `${ORIGIN}/${target.repo}${target.number ? `/pull/${target.number}` : ""}`;
  const stateOf = (value) => {
    const s = String(value || "").toLowerCase();
    if (
      /fail|error|cancel|timed.?out|action_required|startup_failure|stale/.test(
        s,
      )
    )
      return "failure";
    if (/pending|progress|queue|waiting|requested/.test(s)) return "pending";
    if (/success|succeed|passed/.test(s)) return "success";
    if (/skip|neutral/.test(s)) return "skipped";
    return "unknown";
  };
  const summarizeCI = (states) => {
    const values = states.map(stateOf);
    const passed = values.filter((s) => s === "success").length;
    // 完成数包含跳过和失败，不能当成通过数展示。
    const skipped = values.filter((s) => s === "skipped").length;
    const failed = values.filter((s) => s === "failure").length;
    const pending = values.filter((s) => s === "pending").length;
    const unknown = values.filter((s) => s === "unknown").length;
    const done = passed + skipped + failed;
    const state = !values.length
      ? "none"
      : values.includes("failure")
        ? "failure"
        : values.includes("unknown")
          ? "unknown"
          : values.includes("pending")
            ? "pending"
            : passed
              ? "success"
              : "neutral";
    return {
      state,
      total: values.length,
      done,
      passed,
      skipped,
      failed,
      pending,
      unknown,
    };
  };
  const sortPRs = (items) =>
    [...items].sort(
      (a, b) =>
        Number(b.ci?.state === "success" && !b.stale) -
          Number(a.ci?.state === "success" && !a.stale) ||
        String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) ||
        a.key.localeCompare(b.key),
    );
  const dom = (html) => new DOMParser().parseFromString(html, "text/html");
  const embedded = (doc) => {
    const payload = {};
    for (const script of doc.querySelectorAll(
      'script[data-target="react-app.embeddedData"]',
    )) {
      try {
        Object.assign(payload, JSON.parse(script.textContent).payload);
      } catch {
        /* 其他应用片段不应破坏可用数据。 */
      }
    }
    return payload;
  };
  const requireValue = (
    value,
    message = "GitHub 页面结构已变化，暂时无法读取",
  ) => {
    if (value === undefined || value === null) throw new Error(message);
    return value;
  };
  const count = (value) =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
      ? Number(value)
      : null;
  const parseRepo = (doc) => {
    const p = embedded(doc);
    const repo = p.codeViewLayoutRoute?.repo;
    requireValue(repo);
    return {
      defaultBranch: repo.defaultBranch || "",
      empty: !!repo.isEmpty,
      stars: count(
        p.sidebarAbout?.stargazerCount ??
          p.codeViewRepoRoute?.overview?.sidebarAboutData?.stargazerCount,
      ),
    };
  };
  const parsePullList = (doc) => {
    const route = requireValue(embedded(doc).repoPullsDashboardContentRoute);
    requireValue(Array.isArray(route.results) ? true : null);
    return {
      openCount: count(route.openCount),
      items: route.results.map((p) => ({
        number: p.number,
        title: p.title,
        author: p.author?.displayLogin || "",
        comments: count(p.commentCount ?? 0),
        createdAt: p.createdAt || "",
        updatedAt: p.updatedAt || p.createdAt || "",
      })),
    };
  };
  const parsePR = (doc) => {
    const p = embedded(doc).pullRequestsLayoutRoute?.pullRequest;
    if (p)
      return {
        title: requireValue(p.title),
        number: p.number,
        author: p.author?.login || "",
        state: p.state?.toLowerCase() || "unknown",
        commits: count(p.commitsCount),
        base: p.baseBranch,
        head: p.headBranch,
        sha: p.headSha,
        createdAt: p.createdTime || "",
        updatedAt: p.updatedTime || p.createdTime || "",
      };
    // 旧版 PR 页面使用稳定语义节点；无法识别时明确失败，不猜测状态或数量。
    const title = doc.querySelector(".js-issue-title");
    if (!title)
      throw new Error("无法读取 PR；请确认登录状态、访问权限或页面是否已更新");
    const label = doc
      .querySelector(".State")
      ?.textContent?.trim()
      .toLowerCase();
    return {
      title: title.textContent.trim(),
      author:
        doc.querySelector(".gh-header-meta .author")?.textContent?.trim() || "",
      state: ["open", "closed", "merged", "draft"].includes(label)
        ? label
        : "unknown",
      commits: count(
        doc
          .querySelector("#commits_tab_counter")
          ?.textContent?.replaceAll(",", ""),
      ),
      sha: "",
      createdAt: "",
      updatedAt: "",
    };
  };
  const parseChecks = (doc) => {
    const p = embedded(doc);
    const fragment = p["pullRequestsChecksRoute.Main"]?.value;
    const root = fragment ? dom(fragment) : doc;
    const latest = new Map();
    const rawStates = [];
    for (const icon of root.querySelectorAll(".checks-list-item-icon")) {
      const labels = [...icon.querySelectorAll("[aria-label]")].map((node) =>
        node.getAttribute("aria-label"),
      );
      const state =
        labels.find((label) => stateOf(label) !== "unknown") || "unknown";
      rawStates.push(stateOf(state));
      // Checks 侧栏会同时包含同名工作流的旧执行；只对有明确身份的 Actions job 去重。
      const link = icon
        .closest(".checks-list-item")
        ?.querySelector('a[href*="/job/"], a.SideNav-subItem');
      const job = link
        ?.getAttribute("href")
        ?.match(
          /^(\/[\w.-]+\/[\w.-]+)\/actions\/runs\/\d+\/job\/(\d+)(?:[?#]|$)/,
        );
      const workflowLink = icon
        .closest('details[id^="sidebar_check_suite_"]')
        ?.querySelector('summary a[href*="/actions/runs/"]');
      const workflow = workflowLink?.textContent.replace(/\s+/g, " ").trim();
      const workflowName =
        workflowLink?.querySelector("span")?.textContent.trim() || workflow;
      const name = link?.textContent.trim();
      const key =
        job && workflow && name
          ? JSON.stringify([job[1], workflow, name])
          : icon;
      const previous = latest.get(key);
      if (!previous || BigInt(job[2]) > previous.id)
        latest.set(key, {
          state,
          id: job ? BigInt(job[2]) : 0n,
          name: name
            ? `${workflowName ? workflowName + " / " : ""}${name}`
            : "未命名检查",
        });
    }
    const states = [...latest.values()].map((check) => check.state);
    if (
      !states.length &&
      !root.querySelector('[aria-label="Check suites"]') &&
      !/no checks|checks haven.t run|no check runs/i.test(root.body.textContent)
    )
      throw new Error("CI 尚未加载或页面结构已变化");
    const ci = summarizeCI(states);
    // 汇总圆环还可能包含侧栏未展开的检查；不把不完整列表的全绿当成最终成功。
    const aggregate = [...root.querySelectorAll(".donut-chart path")].map(
      (el) => stateOf(el.getAttribute("class")),
    );
    // 圆环也包含旧执行；仅用列表中完全缺失的类别阻止误报全绿，数量仍以可读检查为准。
    const unlisted = aggregate.filter((state) => !rawStates.includes(state));
    if (unlisted.includes("failure")) ci.state = "failure";
    else if (unlisted.includes("unknown")) ci.state = "unknown";
    else if (unlisted.includes("pending") && ci.state !== "failure")
      ci.state = "pending";
    if (unlisted.length) {
      ci.incomplete = true;
      if (["success", "neutral", "none"].includes(ci.state))
        ci.state = "unknown";
    }
    return {
      ...ci,
      // 即使总状态已失败，也保留其他仍运行或排队的检查，供卡片独立显示。
      activeChecks: [...latest.values()]
        .filter((check) => stateOf(check.state) === "pending")
        .map((check) => ({
          name: check.name,
          status: /queue|waiting|requested/i.test(check.state)
            ? "queued"
            : "running",
        })),
      sha: p.pullRequestsLayoutRoute?.pullRequest?.headSha || "",
    };
  };
  const parseBranches = (doc) => {
    const p = embedded(doc);
    requireValue(Array.isArray(p.branches) ? true : null);
    return {
      names: p.branches.map((b) => requireValue(b.name)),
      more: !!p.has_more,
    };
  };
  const parseCommit = (doc) => {
    const route = requireValue(embedded(doc).commitsRefRoute);
    const c = route.commitGroups?.[0]?.commits?.[0];
    if (!c) return null;
    return {
      sha: c.oid,
      title: c.shortMessage,
      author: c.authors?.[0]?.login || c.authors?.[0]?.displayName || "",
      date: c.committedDate,
    };
  };
  const parseActions = (doc) => {
    const route = requireValue(embedded(doc).allWorkflowRunsRoute);
    return requireValue(route.workflowRuns)
      .slice(0, 5)
      .map((r) => ({
        id: String(r.id),
        name: r.name || r.workflowName,
        title: r.title,
        state: stateOf(r.state?.conclusion || r.state?.status),
        branch: r.branch?.name?.replace(/^refs\/heads\//, "") || "",
        date: r.createdAt?.timestamp || "",
      }));
  };

  // CommonJS 可用于无浏览器的逻辑检查；安装脚本时仍直接运行，不依赖构建工具。
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      parseTarget,
      summarizeCI,
      sortPRs,
      parseRepo,
      parsePullList,
      parsePR,
      parseChecks,
      parseBranches,
      parseCommit,
      parseActions,
    };
    return;
  }
  if (
    location.origin !== ORIGIN ||
    window.top !== window.self ||
    document.getElementById("github-watch")
  )
    return;

  const boot = async () => {
    const viewer =
      document.querySelector('meta[name="user-login"]')?.content ||
      "signed-out";
    const prefix = `github-watch:v1:${viewer}:`;
    const itemPrefix = `${prefix}item:`;
    const cachePrefix = `${prefix}cache:`;
    const changedKey = `${prefix}changed`;
    const focusKey = "github-watch:focus";
    let items = [],
      rows = new Map(),
      opened = false,
      group = "pr",
      busy = false,
      refreshQueued = false,
      message = "",
      editor = null,
      confirming = null;
    let accountChanged = false;
    const inFlight = new Map();
    const tabId = crypto.randomUUID();
    const getTabs = () => new Promise((resolve) => GM_getTabs(resolve));
    const getTab = () => new Promise((resolve) => GM_getTab(resolve));
    const withLock = (name, fn) =>
      navigator.locks ? navigator.locks.request(`${prefix}${name}`, fn) : fn();
    const readItems = async () => {
      const keys = (await GM.listValues()).filter((k) =>
        k.startsWith(itemPrefix),
      );
      items = (await Promise.all(keys.map((k) => GM.getValue(k)))).filter(
        (item) => item && parseTarget(targetURL(item))?.key === item.key,
      );
    };
    const signal = () => GM.setValue(changedKey, crypto.randomUUID());
    const setItem = async (item) => {
      await GM.setValue(itemPrefix + item.key, item);
      await readItems();
      await signal();
    };
    const accountOK = () => {
      const current =
        document.querySelector('meta[name="user-login"]')?.content ||
        "signed-out";
      if (current !== viewer) accountChanged = true;
      if (accountChanged) throw new Error("登录账号已改变，请刷新此页面后继续");
    };

    // 缓存只包含解析后的显示字段；每个资源独立重验证，失败保留最后成功值。
    const resource = async (path, parse, ttl = TTL, cachedOnly = false) => {
      // 新字段不能从旧缓存的304响应恢复；仅升级CI和PR元数据，不动关注列表。
      const revision =
        parse === parseChecks
          ? ":counts-v3"
          : [parsePR, parsePullList].includes(parse)
            ? ":pr-v2"
            : "";
      const key = cachePrefix + path + revision;
      const load = async () => {
        const saved = await GM.getValue(key);
        if (
          cachedOnly ||
          (saved && Date.now() - (saved.attemptedAt || saved.at) < ttl)
        )
          return saved
            ? { ...saved, stale: !!saved.error || Date.now() - saved.at > ttl }
            : { stale: true };
        if (inFlight.has(key)) return inFlight.get(key);
        const run = withLock(`fetch:${path}`, async () => {
          const old = await GM.getValue(key);
          if (old && Date.now() - (old.attemptedAt || old.at) < ttl)
            return { ...old, stale: !!old.error || Date.now() - old.at > ttl };
          try {
            accountOK();
            const until = await GM.getValue(`${prefix}backoff`, 0);
            if (Date.now() < until)
              throw new Error(
                `GitHub 限流，${new Date(until).toLocaleTimeString()} 后重试`,
              );
            const response = await fetch(new URL(path, ORIGIN), {
              credentials: "include",
              headers: old?.etag ? { "If-None-Match": old.etag } : {},
              signal: AbortSignal.timeout(20000),
            });
            if ([429, 403].includes(response.status)) {
              const retry = response.headers.get("retry-after");
              const delay = /^\d+$/.test(retry || "")
                ? Number(retry) * 1000
                : Date.parse(retry) - Date.now();
              await GM.setValue(
                `${prefix}backoff`,
                Date.now() + Math.min(3600000, Math.max(60000, delay || 0)),
              );
            }
            if (
              response.status !== 304 &&
              (!response.ok ||
                new URL(response.url || ORIGIN).origin !== ORIGIN ||
                /\/(login|session|sessions)(\/|$)/.test(
                  new URL(response.url || ORIGIN).pathname,
                ))
            )
              throw new Error(
                `读取失败 (${response.status})，请确认登录状态和仓库权限`,
              );
            let data;
            if (response.status === 304) {
              if (!old || !Object.hasOwn(old, "data"))
                throw new Error("缓存已失效，请稍后重试");
              data = old.data;
            } else {
              const document = dom(await response.text());
              const responseViewer =
                document.querySelector('meta[name="user-login"]')?.content ||
                "signed-out";
              if (responseViewer !== viewer)
                throw new Error("登录状态已变化，请刷新页面；保留此前缓存");
              data = parse(document);
            }
            accountOK();
            const next = {
              data,
              at: Date.now(),
              attemptedAt: Date.now(),
              etag: response.headers.get("etag") || old?.etag || "",
              error: "",
            };
            await GM.setValue(key, next);
            return { ...next, stale: false };
          } catch (error) {
            const next = {
              ...old,
              attemptedAt: Date.now(),
              error:
                error.name === "TimeoutError"
                  ? "请求超时，稍后自动重试"
                  : error.message,
            };
            await GM.setValue(key, next);
            return { ...next, stale: true };
          }
        });
        inFlight.set(key, run);
        try {
          return await run;
        } finally {
          inFlight.delete(key);
        }
      };
      return load();
    };
    const pullList = (repo, cachedOnly, number) =>
      resource(
        `/${repo}/pulls?q=${encodeURIComponent(number ? `is:pr ${number}` : "is:pr is:open sort:created-desc")}`,
        parsePullList,
        TTL,
        cachedOnly,
      );
    const getPR = async (target, cachedOnly, preview) => {
      const main = await resource(
        `/${target.repo}/pull/${target.number}`,
        parsePR,
        TTL,
        cachedOnly,
      );
      const check = await resource(
        `/${target.repo}/pull/${target.number}/checks`,
        parseChecks,
        TTL,
        cachedOnly,
      );
      const listing = preview
        ? { data: { items: [preview] }, stale: false }
        : await pullList(target.repo, cachedOnly, target.number);
      const summary = listing.data?.items.find(
        (p) => p.number === target.number,
      );
      const errors = [main, check, listing].map((r) => r.error).filter(Boolean);
      const ci = check.data || { state: "unknown", done: 0, total: 0 };
      const mismatch =
        !main.data?.sha || !check.data?.sha || main.data.sha !== check.data.sha;
      const incomplete = !summary || !main.data || !check.data || mismatch;
      if (mismatch) errors.push("无法确认 CI 对应当前提交，等待下次同步");
      return {
        ...target,
        ...preview,
        ...main.data,
        comments: summary?.comments ?? null,
        createdAt: main.data?.createdAt || summary?.createdAt || "",
        ci: mismatch ? { ...ci, state: "unknown" } : ci,
        stale: incomplete || main.stale || check.stale || listing.stale,
        at: Math.min(
          main.at || Infinity,
          check.at || Infinity,
          listing.at || Infinity,
        ),
        error: errors.join("；"),
      };
    };
    const getRepo = async (target, cachedOnly) => {
      const info = await resource(
        `/${target.repo}`,
        parseRepo,
        TTL,
        cachedOnly,
      );
      const list = await pullList(target.repo, cachedOnly);
      const branches =
        target.branches ??
        (info.data?.defaultBranch ? [info.data.defaultBranch] : []);
      const branchRows = [];
      for (const name of branches) {
        const commit = info.data?.empty
          ? { data: null }
          : await resource(
              `/${target.repo}/commits/${encodeURIComponent(name)}`,
              parseCommit,
              TTL,
              cachedOnly,
            );
        const actions = await resource(
          `/${target.repo}/actions?query=${encodeURIComponent(`branch:${JSON.stringify(name)}`)}`,
          parseActions,
          TTL,
          cachedOnly,
        );
        branchRows.push({
          name,
          commit: commit.data,
          actions: actions.data || [],
          stale: commit.stale || actions.stale,
          error: [commit.error, actions.error].filter(Boolean).join("；"),
        });
      }
      const prs = [];
      for (const preview of (list.data?.items || []).slice(0, 5))
        prs.push(
          await getPR(
            {
              repo: target.repo,
              number: preview.number,
              key: `${target.repo}#${preview.number}`,
            },
            cachedOnly,
            preview,
          ),
        );
      return {
        ...target,
        ...info.data,
        openCount: list.data?.openCount,
        branches: branchRows,
        prs,
        stale: info.stale || list.stale,
        at: Math.min(info.at || Infinity, list.at || Infinity),
        error: [info.error, list.error].filter(Boolean).join("；"),
      };
    };

    // 每个 GitHub 标签注册当前路由；通信消息定向到单个脚本实例，避免多个同 URL 标签同时抢焦点。
    const registerTab = async () => {
      const tab = await getTab();
      const target = parseTarget(location.href);
      tab.githubWatch = {
        id: tabId,
        key: target?.key || "",
        url: location.href,
        viewer,
        seenAt: Date.now(),
      };
      GM_saveTab(tab);
    };
    const jump = async (target) => {
      const url = targetURL(target);
      const matches = Object.values(await getTabs())
        .map((t) => t.githubWatch)
        .filter((t) => t?.key === target.key && t.viewer === viewer)
        .sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0));
      for (const match of matches) {
        if (match.id === tabId && parseTarget(location.href)?.key === target.key) {
          window.focus();
          return;
        }
        const nonce = crypto.randomUUID();
        const ackKey = `${cachePrefix}focus-ack:${nonce}`;
        await GM.setValue(focusKey, {
          id: match.id,
          key: target.key,
          time: Date.now(),
          nonce,
        });
        // 标签注册可能在离开GitHub后残留；只有活跃脚本确认后才视为跳转完成。
        try {
          for (let attempt = 0; attempt < 10; attempt++) {
            if (await GM.getValue(ackKey)) return;
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } finally {
          await GM.deleteValue(ackKey);
        }
      }
      GM_openInTab(url, { active: true, insert: true, setParent: true });
    };
    // 同账号跨标签共享完成基线；只通知已观察到的未完成→完成，避免启动时历史结果刷屏。
    const notifyCompletion = async (item) => {
      const ci = item.ci;
      if (item.stale || !ci?.sha || !ci.total || ci.incomplete || ci.unknown)
        return;
      if (!navigator.locks)
        throw new Error("当前浏览器不支持 Web Locks，CI 完成通知不可用");
      await withLock(`notify:${item.key}`, async () => {
        accountOK();
        const key = `${prefix}notification:${item.key}`;
        const previous = await GM.getValue(key);
        if (previous && item.at < previous.at) return;
        const complete = ci.done === ci.total && !ci.pending;
        if (previous?.sha === ci.sha && !previous.complete && complete) {
          // url在源标签关闭后仍可兜底打开；源标签存活时阻止默认打开并复用现有跳转。
          GM_notification({
            title: `PR #${item.number} ${item.title || item.repo}`,
            text: `${item.repo} · CI 已全部运行完毕\n通过 ${ci.passed} · 失败 ${ci.failed}`,
            tag: `${prefix}ci-complete:${item.key}`,
            url: targetURL(item),
            highlight: false,
            onclick: (event) => {
              event?.preventDefault();
              return jump(item).catch(showError);
            },
          });
          if (message.startsWith("CI 通知发送失败：")) {
            message = "";
            renderNotice();
          }
        }
        await GM.setValue(key, { sha: ci.sha, complete, at: item.at });
      });
    };
    GM_addValueChangeListener(focusKey, async (_key, _old, value, remote) => {
      if (
        remote &&
        value?.id === tabId &&
        Date.now() - value.time < 5000 &&
        value.key === parseTarget(location.href)?.key &&
        /^[\w-]+$/.test(value.nonce || "")
      ) {
        window.focus();
        await GM.setValue(`${cachePrefix}focus-ack:${value.nonce}`, { at: Date.now() });
      }
    });
    const openURL = (url) => {
      const parsed = new URL(url, ORIGIN);
      if (parsed.origin === ORIGIN)
        GM_openInTab(parsed.href, {
          active: true,
          insert: true,
          setParent: true,
        });
    };

    // Shadow DOM 隔离 GitHub CSS；所有远端文字都用 textContent，绝不插入远端 HTML。
    const host = document.createElement("div");
    host.id = "github-watch";
    host.style.cssText =
      "position:fixed;right:18px;bottom:18px;z-index:2147483646;max-width:calc(100vw - 24px);";
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host{all:initial;color-scheme:light}*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}
      button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid #008c8c;outline-offset:3px}button{border:0;border-radius:7px;background:#f0f1f1;color:#272c2c;padding:6px 9px;line-height:1.4}button:hover{background:#e4eeee}button.primary{background:#006764;color:white}button.quiet{background:transparent;color:#64706e}button.icon{padding:3px 6px;font-size:15px}
      .launcher{float:right;width:46px;height:46px;margin-top:10px;border-radius:15px;background:#008c8c;color:#fff;box-shadow:0 5px 20px #0002;font:700 14px system-ui}.launcher:hover{background:#006764}
      .panel{font:12px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#242b2a;width:430px;max-width:calc(100vw - 36px);height:min(690px,calc(100dvh - 100px));background:#f7f8f8;border:1px solid #dfe5e4;border-radius:16px;box-shadow:0 16px 64px #0003;display:flex;flex-direction:column;overflow:hidden}.panel[hidden]{display:none}
      header{padding:15px 16px 10px;background:#fff}h1{font-size:16px;letter-spacing:-.3px;margin:0}h2{font-size:12px;margin:12px 0 6px;font-weight:600;color:#64706e}p{margin:5px 0}.row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.spread{justify-content:space-between}.grow{flex:1;min-width:0}.sub{font-size:11px;color:#64706e}.tabs{display:flex;gap:5px;margin-top:12px}.tabs button{flex:1;background:#f4f5f5}.tabs button[aria-pressed=true]{background:#e6f3f0;color:#006764;font-weight:700}
      .tools{padding:10px 16px;display:grid;gap:8px;background:white}.body{overflow:auto;overscroll-behavior:contain;padding:4px 12px 12px;flex:1;min-height:0}.card{background:white;border:1px solid #e3e8e6;border-radius:10px;padding:12px;margin:8px 0}.card.pass{border-left:3px solid #008c8c}.title{font-weight:650;font-size:13px;overflow-wrap:anywhere}.repo-label{color:#64706e;font-size:11px;margin-bottom:4px;overflow-wrap:anywhere}.badge{font-size:10px;border-radius:5px;padding:2px 5px;background:#eef1f0;color:#4e5b57}.good{background:#e6f3f0;color:#006764}.metrics{font-size:11px;color:#64706e;margin-top:7px;display:flex;gap:10px;flex-wrap:wrap}.ci{margin:9px 0 3px}.track{height:3px;background:#e9eeec;border-radius:9px;overflow:hidden;margin-top:5px}.fill{height:100%;background:#008c8c}.stale{font-size:10px;color:#7a6250;margin-top:7px}.empty{text-align:center;padding:36px 14px;color:#64706e}.mini{padding:9px 0;margin:0}.mini+.mini{border-top:1px solid #f0f2f1}.mini .title{font-size:12px}.branch{background:#f7f9f8;border-radius:7px;padding:9px;margin-top:7px}.mono{font-family:ui-monospace,monospace}.link{background:none;padding:0;color:#006764;text-align:left;overflow-wrap:anywhere}.footer{padding:7px 16px;background:#fff;color:#64706e;font-size:10px}.notice{padding:5px 0;color:#69574a;overflow-wrap:anywhere}.confirm{background:#edf7f5;border-radius:8px;padding:10px;margin:8px 0}.branch-options{max-height:180px;overflow:auto;display:grid;gap:5px;margin:8px 0}label{display:flex;align-items:center;gap:6px;overflow-wrap:anywhere}input[type=checkbox]{accent-color:#008c8c}a{color:#006764}progress{width:100%}
      .pr-status-row{margin-top:8px}.pr-state,.ci-active{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:700;line-height:1.5}.pr-state{background:#e9edec;color:#4e5b57}.pr-state::before,.ci-active::before{content:"";width:6px;height:6px;flex-shrink:0;border-radius:50%;background:currentColor}.pr-state[data-state=open]{background:#d8f1e8;color:#006764}.pr-state[data-state=merged]{background:#eee2ff;color:#6836a2}.pr-state[data-state=closed]{background:#ffe4e2;color:#a82c26}.ci-active{background:#e2efff;color:#1858a8}.active-check{margin-top:3px;overflow-wrap:anywhere}.created-at{display:block;margin-top:5px}.tabs{margin-top:2px}
      @media(max-width:480px){.panel{width:calc(100vw - 36px)}header{padding:12px}.tools{padding:8px 12px}.body{padding:3px 8px 8px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
    `;
    root.append(style);
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const button = (text, action, className = "") => {
      const node = el("button", className, text);
      node.type = "button";
      node.addEventListener("click", () =>
        Promise.resolve().then(action).catch(showError),
      );
      return node;
    };
    const showError = (error) => {
      message = error.message || String(error);
      renderNotice();
    };
    const panel = el("section", "panel");
    panel.hidden = true;
    panel.setAttribute("aria-label", "GitHub 关注面板");
    const header = el("header");
    const top = el("div", "row spread");
    top.append(
      el("h1", "", "GitHub 关注"),
      button("×", () => toggle(false), "quiet icon"),
    );
    top.lastChild.setAttribute("aria-label", "关闭面板");
    header.append(top, el("div", "sub", "仓库动态与 PR 检查，一处查看"));
    const tabs = el("div", "tabs");

    const tools = el("div", "tools");
    const current = el("div", "row");
    // 先操作当前标签，再切换分组；不提供跨地址添加入口。
    tools.append(current, tabs);
    const notice = el("div", "notice");
    notice.setAttribute("role", "status");
    tools.append(notice);
    const body = el("div", "body");
    const footer = el(
      "div",
      "footer",
      "每 30 秒尝试更新 · 后台更新 · CI 完成通知 · 请保留 GitHub 标签页（浏览器休眠或限速时可能延迟）",
    );
    panel.append(header, tools, body, footer);
    root.append(panel);
    const launcher = button("GH", () => toggle(!opened), "launcher");
    launcher.setAttribute("aria-label", "打开 GitHub 关注面板");
    launcher.setAttribute("aria-expanded", "false");
    root.append(launcher);
    const renderNotice = () => {
      notice.textContent = message;
      notice.hidden = !message;
    };
    const add = async (target) => {
      accountOK();
      if (items.some((item) => item.key === target.key)) {
        message = "已经在关注列表中";
        renderNotice();
        return;
      }
      await setItem({ ...target, addedAt: Date.now() });
      group = target.number ? "pr" : "repo";
      message = "";
      render();
      await refresh();
    };
    const toggle = (value) => {
      opened = value;
      panel.hidden = !value;
      launcher.setAttribute("aria-expanded", String(value));
      if (value) {
        render();
        refresh();
      } else launcher.focus();
    };
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (editor) {
          editor = null;
          render();
        } else toggle(false);
        event.stopPropagation();
      }
    });
    const renderCurrent = () => {
      current.replaceChildren();
      const target = parseTarget(location.href);
      if (target) {
        current.append(
          button("关注当前仓库", () =>
            add({ repo: target.repo, number: null, key: target.repo }),
          ),
        );
        if (target.number)
          current.append(button("关注当前 PR", () => add(target)));
      }
      const refreshButton = button(busy ? "更新中…" : "刷新", refresh, "quiet");
      refreshButton.disabled = busy;
      current.append(refreshButton);
    };
    const renderTabs = () => {
      tabs.replaceChildren();
      for (const [id, title] of [
        ["pr", "PR"],
        ["repo", "仓库"],
      ]) {
        const node = button(
          `${title} (${items.filter((i) => !!i.number === (id === "pr")).length})`,
          () => {
            group = id;
            editor = null;
            confirming = null;
            render();
          },
        );
        node.setAttribute("aria-pressed", String(group === id));
        tabs.append(node);
      }
    };
    const showStale = (container, data) => {
      if (data.stale || data.error)
        container.append(el("div", "stale", data.error || "缓存待更新"));
      if (Number.isFinite(data.at))
        container.append(
          el("div", "sub", `更新于 ${new Date(data.at).toLocaleTimeString()}`),
        );
    };
    const ciLabel = (ci) => {
      const names = {
        success: "全部通过",
        pending: "运行中",
        failure: "未通过",
        unknown: "状态未知",
        none: "无检查",
        neutral: "已跳过",
      };
      return `${names[ci.state] || names.unknown}${ci.total ? ` · ${ci.done}/${ci.total}` : ""}`;
    };
    const ciView = (data) => {
      const ci = data.ci || { state: "unknown" };
      const node = el("div", "ci");
      node.append(
        el(
          "span",
          `badge ${ci.state === "success" && !data.stale ? "good" : ""}`,
          ciLabel(ci),
        ),
      );
      if (Number.isInteger(ci.failed)) {
        const counts = [
          `通过 ${ci.passed}`,
          `跳过 ${ci.skipped}`,
          `失败 ${ci.failed}`,
        ];
        if (ci.pending) counts.push(`进行中 ${ci.pending}`);
        if (ci.unknown) counts.push(`未知 ${ci.unknown}`);
        node.append(el("div", "sub ci-counts", counts.join(" · ")));
      }
      for (const check of ci.activeChecks || [])
        node.append(
          el(
            "div",
            "sub active-check",
            `${check.status === "queued" ? "排队中" : "运行中"}：${check.name}`,
          ),
        );
      if (ci.incomplete)
        node.append(el("div", "sub", "部分检查未加载，数量仅含已读取项"));
      if (ci.total) {
        const track = el("div", "track");
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", "CI 完成进度");
        track.setAttribute("aria-valuenow", String(ci.done));
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", String(ci.total));
        track.setAttribute("aria-valuetext", `已完成 ${ci.done}/${ci.total}`);
        const fill = el("div", "fill");
        fill.style.width = `${(ci.done / ci.total) * 100}%`;
        track.append(fill);
        node.append(track);
      }
      return node;
    };
    const appendConfirmation = (item, card) => {
      if (confirming !== item.key) return;
      const box = el("div", "confirm");
      box.append(el("p", "", `取消关注 ${item.key}？`));
      const actions = el("div", "row");
      actions.append(
        button("确认取消", async () => {
          confirming = null;
          await GM.deleteValue(itemPrefix + item.key);
          rows.delete(item.key);
          await readItems();
          await signal();
          render();
        }),
        button("保留关注", () => {
          confirming = null;
          render();
        }),
      );
      box.append(actions);
      card.append(box);
    };
    const confirmRemove = (item) => {
      confirming = item.key;
      render();
      root.querySelector(".confirm button:last-child")?.focus();
    };
    const cardActions = (item) => {
      const actions = el("div", "row");
      const go = button("↗", () => jump(item), "quiet icon");
      go.setAttribute("aria-label", `跳转 ${item.key}`);
      go.title = "跳转已有标签或新建标签";
      actions.append(go);
      const remove = button("×", () => confirmRemove(item), "quiet icon");
      remove.setAttribute("aria-label", `取消关注 ${item.key}`);
      remove.title = "取消关注";
      actions.append(remove);
      return actions;
    };
    const prCard = (item, mini = false) => {
      const card = el(
        mini ? "div" : "article",
        mini
          ? "mini"
          : `card ${item.ci?.state === "success" && !item.stale ? "pass" : ""}`,
      );
      card.dataset.key = item.key;
      card.dataset.kind = "pr";
      const row = el("div", "row spread");
      row.append(
        el(
          "div",
          "repo-label grow",
          mini
            ? `#${item.number} · ${item.author || "—"}`
            : `${item.repo} · #${item.number}`,
        ),
      );
      if (!mini) row.append(cardActions(item));
      card.append(row);
      const title = button(
        item.title || `PR #${item.number}`,
        () => jump(item),
        "title link",
      );
      card.append(title);
      const metrics = el("div", "metrics");
      const state = {
        open: "开启",
        closed: "已关闭",
        merged: "已合并",
        draft: "草稿",
        unknown: "未知",
      };
      // PR生命周期与CI运行状态分开：失败的检查不能遮住仍在运行的其他检查。
      const statusRow = el("div", "row pr-status-row");
      const status = el("span", "pr-state", state[item.state] || "未知");
      status.dataset.state = Object.hasOwn(state, item.state)
        ? item.state
        : "unknown";
      status.setAttribute(
        "aria-label",
        `PR 状态：${state[item.state] || "未知"}`,
      );
      statusRow.append(status);
      if (item.ci?.pending)
        statusRow.append(
          el(
            "span",
            "ci-active",
            `${item.stale ? "上次记录：" : ""}CI 进行中 ${item.ci.pending}`,
          ),
        );
      card.append(statusRow);
      metrics.append(
        el("span", "", item.author || "—"),
        el("span", "", `评论 ${item.comments ?? "—"}`),
      );
      if (!mini) metrics.append(el("span", "", `提交 ${item.commits ?? "—"}`));
      card.append(metrics);
      if (mini) {
        const timestamp = Date.parse(item.createdAt);
        const created = el(
          "time",
          "sub created-at",
          Number.isFinite(timestamp)
            ? `创建于 ${new Date(timestamp).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}`
            : "创建时间未知",
        );
        if (Number.isFinite(timestamp)) {
          created.dateTime = item.createdAt;
          created.title = item.createdAt;
        }
        card.append(created);
      }
      card.append(ciView(item));
      if (!mini || item.error) showStale(card, item);
      if (!mini) appendConfirmation(item, card);
      return card;
    };
    const editBranches = async (item) => {
      editor = {
        key: item.key,
        page: 0,
        names: [],
        selected: new Set(
          item.branches ??
            rows.get(item.key)?.branches?.map((b) => b.name) ??
            [],
        ),
        more: true,
        loading: false,
      };
      await moreBranches(item);
    };
    const moreBranches = async (item) => {
      const draft = editor;
      if (!draft || draft.loading) return;
      draft.loading = true;
      render();
      const result = await resource(
        `/${item.repo}/branches/all?page=${draft.page + 1}`,
        parseBranches,
        TTL,
      );
      if (editor !== draft) return;
      draft.loading = false;
      if (result.data) {
        draft.page++;
        draft.names = [...new Set([...draft.names, ...result.data.names])];
        draft.more = result.data.more;
      }
      if (result.error) message = result.error;
      render();
    };
    const branchEditor = (item) => {
      const box = el("div", "branch");
      box.append(el("strong", "", "选择要监控的分支"));
      const list = el("div", "branch-options");
      for (const name of [...new Set([...editor.selected, ...editor.names])]) {
        const label = el("label");
        const checkbox = el("input");
        checkbox.type = "checkbox";
        checkbox.checked = editor.selected.has(name);
        checkbox.addEventListener("change", () =>
          checkbox.checked
            ? editor.selected.add(name)
            : editor.selected.delete(name),
        );
        label.append(checkbox, document.createTextNode(name));
        list.append(label);
      }
      box.append(list);
      const actions = el("div", "row");
      if (editor.more) {
        const more = button(editor.loading ? "加载中…" : "更多分支", () =>
          moreBranches(item),
        );
        more.disabled = editor.loading;
        actions.append(more);
      }
      actions.append(
        button(
          "保存分支",
          async () => {
            if (!editor.selected.size) throw new Error("请至少选择一个分支");
            const latest = await GM.getValue(itemPrefix + item.key);
            if (!latest) throw new Error("此仓库已经取消关注");
            await setItem({ ...latest, branches: [...editor.selected] });
            editor = null;
            await refresh();
          },
          "primary",
        ),
        button("取消", () => {
          editor = null;
          render();
        }),
      );
      box.append(actions);
      return box;
    };
    const repoCard = (item, data) => {
      const card = el("article", "card");
      card.dataset.key = item.key;
      card.dataset.kind = "repo";
      const title = el("div", "row spread");
      title.append(
        button(item.repo, () => jump(item), "title link grow"),
        cardActions(item),
      );
      card.append(title);
      const metrics = el("div", "metrics");
      metrics.append(
        el("span", "", `开启 PR ${data.openCount ?? "—"}`),
        el("span", "", `★ ${data.stars ?? "—"}`),
        button("选择分支", () => editBranches(item), "quiet"),
      );
      card.append(metrics);
      if (editor?.key === item.key) card.append(branchEditor(item));
      for (const branch of data.branches || []) {
        const node = el("div", "branch");
        node.append(el("strong", "mono", branch.name));
        if (branch.commit) {
          const c = branch.commit;
          node.append(
            el("p", "", "最新提交"),
            button(
              `${c.sha.slice(0, 7)} ${c.title}`,
              () =>
                openURL(`/${item.repo}/commit/${encodeURIComponent(c.sha)}`),
              "link",
            ),
            el(
              "div",
              "sub",
              `${c.author} · ${c.date ? new Date(c.date).toLocaleString() : ""}`,
            ),
          );
        } else
          node.append(
            el("div", "sub", data.empty ? "空仓库，暂无提交" : "提交待更新"),
          );
        for (const run of branch.actions) {
          const row = el("div", "row");
          row.append(
            el("span", "badge", ciLabel({ state: run.state })),
            button(
              run.name,
              () =>
                openURL(
                  `/${item.repo}/actions/runs/${encodeURIComponent(run.id)}`,
                ),
              "link",
            ),
          );
          node.append(row);
        }
        if (!branch.actions.length)
          node.append(el("div", "sub", "暂无 Actions 记录"));
        showStale(node, branch);
        card.append(node);
      }
      card.append(el("h2", "", "最近开启的 PR"));
      if (!data.prs?.length)
        card.append(
          el(
            "div",
            "sub",
            data.openCount === 0 ? "暂无开启的 PR" : "PR 待更新",
          ),
        );
      for (const pr of data.prs || []) card.append(prCard(pr, true));
      showStale(card, data);
      appendConfirmation(item, card);
      return card;
    };
    const render = () => {
      renderTabs();
      renderCurrent();
      renderNotice();
      const selected = items.filter(
        (item) => !!item.number === (group === "pr"),
      );
      // 后台数据刷新不应中断用户正在确认的键盘操作。
      const active = root.activeElement;
      const focus = active?.matches(".confirm button")
        ? {
            key: active.closest("article")?.dataset.key,
            action: active.textContent,
          }
        : null;
      const previousScroll = body.scrollTop;
      body.replaceChildren();
      if (!selected.length)
        body.append(
          el(
            "div",
            "empty",
            group === "pr" ? "还没有关注 PR" : "还没有关注仓库",
          ),
        );
      if (group === "pr")
        for (const row of sortPRs(
          selected.map(
            (item) => rows.get(item.key) || { ...item, stale: true },
          ),
        ))
          body.append(prCard(row));
      else
        for (const item of selected)
          body.append(repoCard(item, rows.get(item.key) || { stale: true }));
      body.scrollTop = previousScroll;
      if (focus) {
        const match = [...body.querySelectorAll(".confirm button")].find(
          (node) =>
            node.closest("article")?.dataset.key === focus.key &&
            node.textContent === focus.action,
        );
        match?.focus({ preventScroll: true });
      }
    };
    const trimCache = async () => {
      const keys = (await GM.listValues()).filter((k) =>
        k.startsWith(cachePrefix),
      );
      if (keys.length <= 300) return;
      const all = await Promise.all(
        keys.map(async (key) => ({
          key,
          at: (await GM.getValue(key))?.at || 0,
        })),
      );
      for (const entry of all.sort((a, b) => b.at - a.at).slice(300))
        await GM.deleteValue(entry.key);
    };
    const refresh = async () => {
      if (busy) {
        refreshQueued = true;
        return;
      }
      if (accountChanged) return;
      busy = true;
      renderCurrent();
      try {
        accountOK();
        await registerTab();
        await readItems();
        const snapshot = [...items];
        for (const cachedOnly of [true, false])
          for (const item of snapshot) {
            // 已删除或修改的关注项在下个周期重新读取，不让迟到请求复活关注项。
            const result = item.number
              ? await getPR(item, cachedOnly)
              : await getRepo(item, cachedOnly);
            if (items.some((current) => current.key === item.key))
              rows.set(item.key, result);
            if (
              !cachedOnly &&
              items.some((current) => current.key === item.key)
            )
              for (const pr of item.number ? [result] : result.prs || [])
                await notifyCompletion(pr).catch((error) =>
                  showError(new Error(`CI 通知发送失败：${error.message}`)),
                );
            if (opened && !editor) render();
          }
        await trimCache();
      } catch (error) {
        showError(error);
      } finally {
        busy = false;
        if (opened && !editor) render();
        else renderCurrent();
        if (refreshQueued) {
          refreshQueued = false;
          queueMicrotask(refresh);
        }
      }
    };
    GM_addValueChangeListener(
      changedKey,
      async (_key, _old, _value, remote) => {
        if (remote) {
          await readItems();
          editor = null;
          render();
          refresh();
        }
      },
    );
    await readItems();
    await registerTab();
    let href = location.href;
    setInterval(() => {
      if (href !== location.href) {
        href = location.href;
        registerTab();
        renderCurrent();
      }
    }, 1000);
    // 后台和面板收起时也刷新；浏览器仍可能节流或冻结页面计时器。
    setInterval(refresh, TTL);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        registerTab();
        refresh();
      }
    });
    document.addEventListener("turbo:load", () => {
      if (!host.isConnected) document.body.append(host);
      registerTab();
      renderCurrent();
    });
    refresh();
  };
  boot().catch((error) =>
    console.error("[GitHub Watch] 初始化失败:", error.message),
  );
})();
