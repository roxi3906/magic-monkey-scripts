// Sanitized shapes observed on GitHub's React routes on 2026-10-26.
const html = (payload) =>
  `<html><head><meta name="user-login" content="tester"></head><body><script type="application/json" data-target="react-app.embeddedData">${JSON.stringify({ payload }).replace(/</g, "\\u003c")}</script></body></html>`;
const pr = (number, state = "OPEN") => ({
  number,
  title: number === 2 ? "Passing change" : "Pending change",
  author: { login: "octocat" },
  state,
  commitsCount: 3,
  baseBranch: "main",
  headBranch: "feature",
  headSha: "abc123",
  createdTime: "2026-10-25T00:00:00Z",
});
const checks = (states) => ({
  "pullRequestsChecksRoute.Main": {
    value: `<aside aria-label="Check suites">${states.map((s) => `<div class="checks-list-item-icon"><svg aria-label="${s}"></svg></div>`).join("")}</aside><svg class="donut-chart"><path class="${states.some((s) => s.includes("progress")) ? "in_progress" : "success"}"></path></svg>`,
  },
  pullRequestsLayoutRoute: { pullRequest: { headSha: "abc123" } },
});
const list = [
  {
    number: 1,
    title: "Pending change",
    author: { displayLogin: "octocat" },
    commentCount: 4,
    state: "REPO_PULL_REQUEST_STATE_OPEN",
    createdAt: "2026-10-25T00:00:00Z",
  },
  {
    number: 2,
    title: "Passing change",
    author: { displayLogin: "hubot" },
    commentCount: 2,
    state: "REPO_PULL_REQUEST_STATE_OPEN",
    createdAt: "2026-10-24T00:00:00Z",
  },
];
const routes = (url) => {
  const u = new URL(url),
    p = u.pathname;
  if (p === "/acme/demo")
    return html({
      codeViewLayoutRoute: { repo: { defaultBranch: "main", isEmpty: false } },
      sidebarAbout: { stargazerCount: 123 },
    });
  if (p === "/acme/demo/pulls")
    return html({
      repoPullsDashboardContentRoute: {
        results: list,
        openCount: 2,
        totalCount: 2,
      },
    });
  if (p === "/acme/demo/branches/all")
    return html({
      branches:
        u.searchParams.get("page") === "2"
          ? [{ name: "release/v2" }]
          : [{ name: "main" }, { name: "dev" }],
      has_more: u.searchParams.get("page") !== "2",
      current_page: Number(u.searchParams.get("page") || 1),
    });
  if (p.startsWith("/acme/demo/commits/"))
    return html({
      commitsRefRoute: {
        commitGroups: [
          {
            commits: [
              {
                oid: "abc123",
                shortMessage: "fix: current commit",
                authors: [{ login: "octocat" }],
                committedDate: "2026-10-25T00:00:00Z",
              },
            ],
          },
        ],
      },
    });
  if (p === "/acme/demo/actions")
    return html({
      allWorkflowRunsRoute: {
        workflowRuns: [
          {
            name: "Build",
            id: "123",
            runUrl: "https://github.com/acme/demo/actions/runs/123",
            title: "fix: current commit",
            state: {
              status: "WORKFLOW_RUN_STATUS_COMPLETED",
              conclusion: "WORKFLOW_RUN_CONCLUSION_SUCCESS",
            },
            branch: { name: "refs/heads/main" },
            createdAt: { timestamp: "2026-10-25T00:00:00Z" },
          },
        ],
      },
    });
  const m = p.match(/^\/acme\/demo\/pull\/(\d+)(\/checks)?$/);
  if (m)
    return html(
      m[2]
        ? checks(
            Number(m[1]) === 2
              ? ["This check passed"]
              : ["This check passed", "This check is in progress"],
          )
        : { pullRequestsLayoutRoute: { pullRequest: pr(Number(m[1])) } },
    );
  return null;
};
module.exports = { html, pr, checks, list, routes };
