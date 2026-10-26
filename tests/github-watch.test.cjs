const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const script = path.resolve("scripts/github-watch/github-watch.user.js");
const core = fs.existsSync(script) ? require(script) : {};

test("URLs reject other origins and normalize PR subpages", () => {
  assert.equal(
    typeof core.parseTarget,
    "function",
    "GitHub target parser is implemented",
  );
  assert.deepEqual(
    core.parseTarget("https://github.com/Owner/Repo/pull/42/files"),
    { repo: "owner/repo", number: 42, key: "owner/repo#42" },
  );
  assert.equal(core.parseTarget("https://evil.test/owner/repo"), null);
  assert.equal(core.parseTarget("https://github.com/login/oauth"), null);
  assert.equal(core.parseTarget("javascript:alert(1)"), null);
  assert.equal(core.parseTarget("owner/repo").key, "owner/repo");
});

test("CI never promotes absent, incomplete, failed or stale checks", () => {
  assert.equal(
    typeof core.summarizeCI,
    "function",
    "CI aggregation is implemented",
  );
  assert.equal(core.summarizeCI([]).state, "none");
  assert.equal(core.summarizeCI(["success", "pending"]).state, "pending");
  assert.equal(core.summarizeCI(["success", "failure"]).state, "failure");
  assert.equal(core.summarizeCI(["success", "unknown"]).state, "unknown");
  assert.equal(core.summarizeCI(["success", "skipped"]).state, "success");
  assert.equal(core.summarizeCI(["skipped"]).state, "neutral");
  assert.equal(core.summarizeCI(["success", "cancelled"]).state, "failure");
  assert.deepEqual(core.summarizeCI(["success", "pending", "skipped"]), {
    state: "pending",
    total: 3,
    done: 2,
    passed: 1,
  });
});

test("only fresh passing PRs sort ahead without losing deterministic order", () => {
  assert.equal(typeof core.sortPRs, "function", "PR ordering is implemented");
  const items = [
    { key: "a", ci: { state: "pending" }, updatedAt: "2026-10-20" },
    { key: "b", ci: { state: "success" }, updatedAt: "2026-10-19" },
    {
      key: "c",
      ci: { state: "success" },
      stale: true,
      updatedAt: "2026-10-21",
    },
  ];
  assert.deepEqual(
    core.sortPRs(items).map((p) => p.key),
    ["b", "c", "a"],
  );
  assert.equal(items[0].key, "a");
});
