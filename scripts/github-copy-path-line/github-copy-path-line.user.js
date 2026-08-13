// ==UserScript==
// @name         GitHub 复制文件路径与行号
// @name:en      GitHub Copy Path & Line
// @namespace    https://github.com/roxi3906/magic-monkey-scripts
// @version      0.5.0
// @description  在 GitHub PR 代码审查的行选择菜单中复制文件路径和所选行号，兼容新版 React diff DOM
// @description:en Copy file paths and selected line numbers from GitHub pull request diff menus.
// @author       Roxi
// @license      MIT
// @homepageURL  https://github.com/roxi3906/magic-monkey-scripts/tree/main/scripts/github-copy-path-line
// @supportURL   https://github.com/roxi3906/magic-monkey-scripts/issues
// @downloadURL  https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-copy-path-line/github-copy-path-line.user.js
// @updateURL    https://raw.githubusercontent.com/roxi3906/magic-monkey-scripts/main/scripts/github-copy-path-line/github-copy-path-line.user.js
// @match        https://github.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const MENU_MARK_ATTR = 'data-copy-pathline-injected';
  let lastClickedEl = null;

  function cleanPath(value) {
    return (value || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
  }

  function getFilePathFromContainer(container) {
    if (!container) return null;

    let path = container.getAttribute('data-tagsearch-path') || container.getAttribute('data-path');
    if (path) return cleanPath(path);

    const clip = container.querySelector('clipboard-copy[value]');
    if (clip) {
      const value = clip.getAttribute('value');
      if (value && value.includes('/')) return cleanPath(value);
    }

    const blobLink = container.querySelector('a[href*="/blob/"]');
    if (blobLink) {
      const match = blobLink.getAttribute('href').match(/\/blob\/[^/]+\/([^?#]+)/);
      if (match) return cleanPath(decodeURIComponent(match[1]));
    }

    const titledLink = container.querySelector('a[title][href^="#diff-"], a[title]');
    if (titledLink) return cleanPath(titledLink.getAttribute('title'));

    const headerCode = container.querySelector('h3 a[href^="#diff-"] code');
    if (headerCode) return cleanPath(headerCode.textContent);

    const diffGrid = container.querySelector('[role="grid"][aria-label^="Diff for:"]');
    if (diffGrid) {
      return cleanPath(diffGrid.getAttribute('aria-label').replace(/^Diff for:\s*/, ''));
    }

    return null;
  }

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target;
      if (target && typeof target.closest === 'function' && target.closest('[id^="diff-"]')) {
        lastClickedEl = target;
      }
    },
    true
  );

  // ---------- 主方案：从 URL hash 里取 "#diff-<40~64位hex> + R83-R85 / L10" ----------
  function getFileAndLinesFromHash() {
    const hash = location.hash || '';
    const m = hash.match(/^#diff-([0-9a-f]{32,64})([LR]\d+(?:-[LR]?\d+)?)$/i);
    if (!m) return null;

    const diffId = 'diff-' + m[1];
    const nums = m[2].match(/\d+/g);
    if (!nums || !nums.length) return null;
    const start = nums[0];
    const end = nums[1] || nums[0];

    const container = document.getElementById(diffId);
    if (!container) return null;

    const path = getFilePathFromContainer(container);
    if (!path) return null;

    return { path, start, end };
  }

  // ---------- 备用方案：菜单文案 / 触发元素兜底（hash 方案失败时用） ----------
  function getLineRangeFromMenuText(menuEl) {
    const text = menuEl.textContent || '';
    const m = text.match(/on\s+lines?\s+([A-Za-z]?\d+)(?:\s*-\s*([A-Za-z]?\d+))?/i);
    if (m) {
      const start = m[1].replace(/^[A-Za-z]/, '');
      const end = (m[2] || m[1]).replace(/^[A-Za-z]/, '');
      return { start, end };
    }
    return null;
  }

  function getLineFromTriggerRow(triggerEl) {
    if (!triggerEl) return null;
    const row = triggerEl.closest('tr');
    if (!row) return null;
    const cell = row.querySelector('[data-line-number]');
    const n = cell && cell.getAttribute('data-line-number');
    return n ? { start: n, end: n } : null;
  }

  function getMenuTrigger(menuEl) {
    if (!menuEl) return null;
    const triggerId = menuEl.getAttribute('aria-labelledby');
    return triggerId ? document.getElementById(triggerId) : null;
  }

  function getFilePathFromTrigger(triggerEl) {
    if (!triggerEl) return null;
    const fileContainer = triggerEl.closest('[data-tagsearch-path], [data-path], .file, [id^="diff-"]');
    if (!fileContainer) return null;

    return getFilePathFromContainer(fileContainer);
  }

  function resolvePathAndLines(menuEl) {
    const fromHash = getFileAndLinesFromHash();
    if (fromHash) return fromHash;

    console.warn('[CopyPathLine] URL hash 未能提供完整结果，尝试从菜单触发器解析。当前 hash =', location.hash);
    const triggerEl = getMenuTrigger(menuEl) || lastClickedEl;
    const path = getFilePathFromTrigger(triggerEl);
    const lines = (menuEl && getLineRangeFromMenuText(menuEl)) || getLineFromTriggerRow(triggerEl);
    if (path && lines) return { path, start: lines.start, end: lines.end };
    return null;
  }

  // ---------- 通用工具 ----------
  function copyText(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text);
        return true;
      }
    } catch (e) {
      /* fall through */
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: 999999,
      background: '#238636',
      color: '#fff',
      padding: '8px 14px',
      borderRadius: '6px',
      fontSize: '13px',
      boxShadow: '0 4px 12px rgba(0,0,0,.3)',
      opacity: '0',
      transition: 'opacity .15s ease',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 200);
    }, 1600);
  }

  function closeMenu() {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  }

  function buildMenuItem() {
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;
    Object.assign(item.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 8px',
      margin: '0 4px',
      borderRadius: '6px',
      fontSize: '14px',
      lineHeight: '20px',
      cursor: 'pointer',
      color: 'var(--fgColor-default, var(--color-fg-default, #e6edf3))',
    });
    item.addEventListener('mouseenter', () => {
      item.style.backgroundColor = 'var(--bgColor-neutral-muted, var(--color-neutral-muted, rgba(110,118,129,.4)))';
    });
    item.addEventListener('mouseleave', () => {
      item.style.backgroundColor = 'transparent';
    });

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.style.flexShrink = '0';
    icon.innerHTML =
      '<path fill="currentColor" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h5A1.5 1.5 0 0 1 10 3.5V5h1.5A1.5 1.5 0 0 1 13 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 5 12.5V11H3.5A1.5 1.5 0 0 1 2 9.5v-6ZM3.5 3a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5H5V6.5A1.5 1.5 0 0 1 6.5 5H9V3.5a.5.5 0 0 0-.5-.5h-5ZM6 6.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-6Z"/>';

    const label = document.createElement('span');
    label.textContent = '复制路径:行号';
    label.style.flex = '1';

    item.appendChild(icon);
    item.appendChild(label);
    return item;
  }

  function tryInject(menuEl) {
    if (!menuEl || menuEl.hasAttribute(MENU_MARK_ATTR)) return;

    const text = menuEl.textContent || '';
    if (!/copy link/i.test(text)) return;
    if (!/(add comment|suggest change)/i.test(text)) return;

    console.log('[CopyPathLine] 匹配到目标菜单容器', menuEl);

    const candidateSelector =
      '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="button"], button, a, li';
    const items = Array.from(menuEl.querySelectorAll(candidateSelector));
    console.log(
      '[CopyPathLine] 候选菜单项(' + items.length + ' 个):',
      items.map((el) => ({ tag: el.tagName, role: el.getAttribute('role'), text: el.textContent.trim() }))
    );

    // 放宽匹配：菜单项文字很可能和快捷键提示(⌥⌘Y 之类)连在同一个元素里，
    // 不能要求 textContent 完全等于 "Copy link"，用"以 Copy link 开头"来匹配
    const copyLinkItem = items.find((el) => /^copy\s*link/i.test(el.textContent.trim()));
    if (!copyLinkItem || !copyLinkItem.parentElement) {
      console.warn('[CopyPathLine] 没能在候选项里找到 "Copy link"，放弃插入。请把上面"候选菜单项"那条日志发给我。');
      return;
    }

    menuEl.setAttribute(MENU_MARK_ATTR, '1');
    console.log('[CopyPathLine] 找到 Copy link 项，准备插入"复制路径:行号"', copyLinkItem);

    const newItem = buildMenuItem();

    newItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const result = resolvePathAndLines(menuEl);
      if (!result) {
        console.warn('[CopyPathLine] 未能识别文件路径或行号。hash =', location.hash, 'lastClickedEl =', lastClickedEl);
        showToast('未能识别路径/行号，请打开控制台查看日志');
        return;
      }

      const text =
        result.start === result.end ? `${result.path}:${result.start}` : `${result.path}:${result.start}-${result.end}`;

      if (copyText(text)) {
        showToast(`已复制: ${text}`);
      } else {
        showToast('复制失败');
      }
      closeMenu();
    });

    copyLinkItem.parentElement.insertBefore(newItem, copyLinkItem.nextSibling);
  }

  function scanForMenus() {
    const menus = document.querySelectorAll('[role="menu"]');
    if (menus.length) {
      console.log('[CopyPathLine] 本次扫描找到 ' + menus.length + ' 个 [role="menu"] 元素');
    }
    menus.forEach(tryInject);
  }

  // ---------- 事件驱动：点击"..."按钮之后，再去查一次菜单，不用定时器轮询 ----------
  // 你截图里的按钮是 aria-haspopup="true"（配合 CSS anchor-name 做锚定定位，
  // 说明菜单内容大概率是预渲染好、切换显隐的，不一定会触发"新增节点"）。
  // 用事件委托抓住点击瞬间，点击后只查 1~2 次，不持续轮询。
  document.addEventListener(
    'click',
    (e) => {
      const trigger = e.target.closest('button[aria-haspopup="true"], [aria-haspopup="menu"]');
      if (!trigger) return;

      const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
      console.log('[CopyPathLine] 检测到可能的菜单触发点击, aria-expanded(点击前)=', wasOpen, trigger);
      if (wasOpen) return;

      requestAnimationFrame(() => requestAnimationFrame(scanForMenus));
      setTimeout(scanForMenus, 150);
    },
    true
  );

  // 保留 MutationObserver 作为兜底：万一某些情况下菜单确实是新插入的节点
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches && node.matches('[role="menu"]')) tryInject(node);
        if (node.querySelectorAll) node.querySelectorAll('[role="menu"]').forEach(tryInject);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  console.log('[CopyPathLine] 脚本已加载 v0.5.0');
})();
