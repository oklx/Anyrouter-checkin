/**
 * 共享状态、工具函数、样式常量
 */

export const state = {
  panelPwd: '',
  accountsCache: [],
};

export const $ = (s) => document.querySelector(s);

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function toast(msg, ok = true) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `show ${ok ? 't-ok' : 't-err'}`;
  setTimeout(() => { el.className = ''; }, 2500);
}

export function api(path, opts = {}) {
  if (!opts.headers) opts.headers = {};
  opts.headers['x-panel-password'] = state.panelPwd;
  if (!opts.headers['Content-Type'] && opts.body)
    opts.headers['Content-Type'] = 'application/json';
  return fetch(path, opts).then((r) => {
    if (r.status === 401 && path !== '/api/login') {
      window.showLogin();
      throw new Error('未授权');
    }
    return r.json();
  });
}

/* ---- Tailwind class constants for JS-generated HTML ---- */

export const INPUT_CLS =
  'flex-1 w-full px-5 py-3 bg-white border border-stone-200 rounded-full text-stone-800 ' +
  'placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200 ' +
  'transition-all duration-300 text-sm';

export const BTN_SM =
  'px-4 py-2 rounded-full font-medium transition-colors duration-300 text-sm active:scale-95';

export const BTN_XS =
  'px-3 py-1.5 rounded-full font-medium transition-colors duration-300 text-xs active:scale-95';

/* ---- 分页渲染 ---- */

export function renderPagination(containerId, total, page, perPage, pageFnName) {
  const container = $(`#${containerId}`);
  const totalPages = Math.ceil(total / perPage);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const btn = (label, pg, active, disabled) => {
    if (active)
      return `<button class="${BTN_XS} bg-stone-800 text-white">${label}</button>`;
    if (disabled)
      return `<button class="${BTN_XS} text-stone-300 border border-stone-100 cursor-default">${label}</button>`;
    return `<button class="${BTN_XS} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="${pageFnName}(${pg})">${label}</button>`;
  };

  // Build page numbers with ellipsis
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  let html = '<div class="flex items-center justify-center gap-1 py-4 px-6">';
  html += btn('‹', page - 1, false, page <= 1);
  for (const p of pages) {
    if (p === '...') {
      html += `<span class="px-2 text-stone-400 text-xs select-none">…</span>`;
    } else {
      html += btn(p, p, p === page, false);
    }
  }
  html += btn('›', page + 1, false, page >= totalPages);
  html += '</div>';
  container.innerHTML = html;
}
