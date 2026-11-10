// ==UserScript==
// @name         GitHub 自动折叠测试文件
// @name:en      GitHub Collapse Test Files
// @namespace    https://github.com/roxi3906/magic-monkey-scripts
// @version      0.1.0
// @description  在 GitHub PR Changes 页面自动折叠 .test.[扩展名] 文件，支持动态加载和手动展开。
// @description:en Automatically collapse .test.[extension] files in GitHub PR diffs, with dynamic loading and manual expansion support.
// @author       Roxi
// @license      MIT
// @homepageURL  https://github.com/roxi3906/magic-monkey-scripts/tree/main/scripts/github-collapse-test-files
// @supportURL   https://github.com/roxi3906/magic-monkey-scripts/issues
// @match        https://github.com/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  if (location.hostname !== 'github.com') return;

  const HEADER = '[data-diff-header-wrapper], .file-header';
  let route = '';
  let handled = new WeakMap();
  const manuallyExpanded = new Set();
  let scheduled = false;

  const diffRoute = () => location.pathname.match(/^\/[^/]+\/[^/]+\/pull\/\d+\/(?:changes|files)(?:\/.*)?$/)?.[0] || '';

  // 新版 GitHub 的文件名含方向控制字符，按钮名称可能由独立 tooltip 提供。
  const filePath = header => (
    header.getAttribute('data-path') ||
    header.querySelector('h3 a[href^="#diff-"] code')?.textContent ||
    header.querySelector('.file-info a[title]')?.getAttribute('title') || ''
  ).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();

  const buttonName = button => {
    const labelledBy = button.getAttribute('aria-labelledby');
    return (labelledBy
      ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ')
      : button.getAttribute('aria-label') || button.getAttribute('title') || '').trim();
  };

  const isTest = path => /\.test\.[^./]+$/.test(path);

  const syncRoute = () => {
    const next = diffRoute();
    if (next !== route) {
      route = next;
      handled = new WeakMap();
      manuallyExpanded.clear();
    }
    return Boolean(route);
  };

  const collapseFiles = () => {
    scheduled = false;
    if (!syncRoute()) return;
    for (const header of document.querySelectorAll(HEADER)) {
      if (!header.closest('[id^="diff-"]')) continue;
      const path = filePath(header);
      if (!isTest(path) || handled.get(header) === path || manuallyExpanded.has(path)) continue;
      const button = [...header.querySelectorAll('button')].find(candidate =>
        /^(Collapse|Expand) file$/.test(buttonName(candidate))
      );
      if (!button || button.disabled) continue;
      // 每个已挂载的文件只处理一次；使用原生按钮，不修改 Viewed 状态。
      handled.set(header, path);
      if (buttonName(button) === 'Collapse file') button.click();
    }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(collapseFiles, 80);
  };

  // 用户手动展开后，即使 React 重建文件节点，也保留本次页面内的选择。
  document.addEventListener('click', event => {
    if (!event.isTrusted || !syncRoute()) return;
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    const header = button?.closest(HEADER);
    if (!header || !header.closest('[id^="diff-"]') || buttonName(button) !== 'Expand file') return;
    const path = filePath(header);
    if (isTest(path)) manuallyExpanded.add(path);
  }, true);

  // 批量处理懒加载、React 重绘和站内导航产生的 DOM 变化。
  new MutationObserver(schedule).observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-label', 'aria-labelledby', 'data-path', 'disabled', 'id'],
  });
  document.addEventListener('turbo:load', schedule);
  document.addEventListener('pjax:end', schedule);
  window.addEventListener('popstate', schedule);
  schedule();
})();
