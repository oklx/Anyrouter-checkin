/**
 * 签到日志（分页）
 */
import { $, esc, toast, api, renderPagination } from './utils.js';

let logPage = 1;
const PER_PAGE = 10;

export async function loadLogs(page) {
  if (page !== undefined) logPage = page;
  const data = await api(`/api/logs?page=${logPage}&per_page=${PER_PAGE}`);
  const rows = data.rows;

  // 当前页无数据但有记录 → 回退
  if (rows.length === 0 && data.total > 0 && logPage > 1) {
    logPage = Math.ceil(data.total / PER_PAGE);
    return loadLogs();
  }

  const body  = $('#logBody');
  const cards = $('#logCards');

  if (!data.total) {
    body.innerHTML = '';
    cards.innerHTML = '';
    $('#logEmpty').style.display = '';
    renderPagination('logPagination', 0, 1, PER_PAGE, 'loadLogPage');
    return;
  }
  $('#logEmpty').style.display = 'none';

  // Desktop
  body.innerHTML = rows.map((r) => `<tr class="hover:bg-stone-50/80 transition-colors duration-200">
    <td class="px-6 py-3 whitespace-nowrap text-stone-400 text-xs">${r.created_at}</td>
    <td class="px-6 py-3">${esc(r.account_name || '#' + r.account_id)}</td>
    <td class="px-6 py-3">
      <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
        ${r.ok ? 'bg-[#e8f0e3] text-[#5a7a4a]' : 'bg-red-50 text-[#c45c4a]'}">
        ${r.ok ? '成功' : '失败'}</span>
    </td>
    <td class="px-6 py-3 text-stone-500 text-sm">${esc(r.msg)}</td>
  </tr>`).join('');

  // Mobile
  cards.innerHTML = rows.map((r) => `<div class="px-5 py-3.5 border-b border-stone-100 last:border-b-0">
    <div class="flex items-center justify-between mb-1">
      <span class="font-semibold text-sm">${esc(r.account_name || '#' + r.account_id)}</span>
      <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
        ${r.ok ? 'bg-[#e8f0e3] text-[#5a7a4a]' : 'bg-red-50 text-[#c45c4a]'}">
        ${r.ok ? '成功' : '失败'}</span>
    </div>
    <div class="text-xs text-stone-400">${r.created_at}</div>
    <div class="text-xs text-stone-500 mt-1">${esc(r.msg)}</div>
  </div>`).join('');

  renderPagination('logPagination', data.total, data.page, PER_PAGE, 'loadLogPage');
}

export async function clearLogs() {
  if (!confirm('确认清空？')) return;
  await api('/api/logs', { method: 'DELETE' });
  toast('已清空');
  logPage = 1;
  loadLogs();
}
