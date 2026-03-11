/**
 * 账号管理：CRUD、详情弹窗、余额、签到（分页 + 状态）
 */
import { $, state, esc, toast, api, INPUT_CLS, BTN_SM, BTN_XS, renderPagination } from './utils.js';

let accPage = 1;
const PER_PAGE = 10;

/* ===== 列表 ===== */

export async function loadAccounts(page) {
  if (page !== undefined) accPage = page;
  const data = await api(`/api/accounts?page=${accPage}&per_page=${PER_PAGE}`);
  const rows = data.rows;

  // 当前页无数据但有记录 → 回退
  if (rows.length === 0 && data.total > 0 && accPage > 1) {
    accPage = Math.ceil(data.total / PER_PAGE);
    return loadAccounts();
  }

  state.accountsCache = rows;
  const body  = $('#accBody');
  const cards = $('#accCards');

  if (!data.total) {
    body.innerHTML = '';
    cards.innerHTML = '';
    $('#accEmpty').style.display = '';
    renderPagination('accPagination', 0, 1, PER_PAGE, 'loadAccPage');
    return;
  }
  $('#accEmpty').style.display = 'none';

  const statusBadge = (s) => {
    if (s === 'ok')      return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e8f0e3] text-[#5a7a4a]">可用</span>';
    if (s === 'error')   return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-[#c45c4a]">错误</span>';
    return '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-400">未知</span>';
  };

  // Desktop rows
  body.innerHTML = rows.map((r) => {
    const bal = r.balance_remain != null ? `$${Number(r.balance_remain).toFixed(2)}` : '-';
    return `<tr class="hover:bg-stone-50/80 transition-colors duration-200">
      <td class="px-6 py-3 font-semibold">${esc(r.name || '#' + r.id)}</td>
      <td class="px-6 py-3"><code class="text-xs text-stone-400 font-mono">${esc(r.session)}</code></td>
      <td class="px-6 py-3"><span class="font-bold text-[#5a7a4a]">${bal}</span></td>
      <td class="px-6 py-3">${statusBadge(r.status)}</td>
      <td class="px-6 py-3">
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
          ${r.enabled ? 'bg-[#e8f0e3] text-[#5a7a4a]' : 'bg-stone-100 text-stone-400'}">
          ${r.enabled ? '启用' : '停用'}</span>
      </td>
      <td class="px-6 py-3">
        <div class="flex gap-1.5 flex-wrap">
          <button class="${BTN_XS} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="showDetail(${r.id})">详情</button>
          <button class="${BTN_XS} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="queryBal(${r.id})">余额</button>
          <button class="${BTN_XS} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="checkinOne(${r.id})">签到</button>
          <button class="${BTN_XS} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="toggleAcc(${r.id},${r.enabled})">${r.enabled ? '禁用' : '启用'}</button>
          <button class="${BTN_XS} text-[#c45c4a] border border-stone-200 hover:bg-red-50" onclick="delAcc(${r.id})">删除</button>
        </div>
      </td></tr>`;
  }).join('');

  // Mobile cards
  cards.innerHTML = rows.map((r) => {
    const bal = r.balance_remain != null ? `$${Number(r.balance_remain).toFixed(2)}` : '-';
    return `<div class="px-5 py-4 border-b border-stone-200 last:border-b-0">
      <div class="flex items-center justify-between mb-2">
        <span class="font-semibold">${esc(r.name || '#' + r.id)}</span>
        <div class="flex gap-1.5 items-center">
          ${statusBadge(r.status)}
          <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
            ${r.enabled ? 'bg-[#e8f0e3] text-[#5a7a4a]' : 'bg-stone-100 text-stone-400'}">
            ${r.enabled ? '启用' : '停用'}</span>
        </div>
      </div>
      <div class="flex gap-3 items-center mb-3 flex-wrap">
        <code class="text-xs text-stone-400 font-mono">${esc(r.session)}</code>
        <span class="font-bold text-[#5a7a4a] text-sm">${bal}</span>
      </div>
      <div class="flex gap-1.5 flex-wrap">
        <button class="${BTN_XS} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="showDetail(${r.id})">详情</button>
        <button class="${BTN_XS} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="queryBal(${r.id})">余额</button>
        <button class="${BTN_XS} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="checkinOne(${r.id})">签到</button>
        <button class="${BTN_XS} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="toggleAcc(${r.id},${r.enabled})">${r.enabled ? '禁用' : '启用'}</button>
        <button class="${BTN_XS} text-[#c45c4a] border border-stone-200 hover:bg-red-50" onclick="delAcc(${r.id})">删除</button>
      </div>
    </div>`;
  }).join('');

  renderPagination('accPagination', data.total, data.page, PER_PAGE, 'loadAccPage');
}

/* ===== 添加 ===== */

export function showAddForm() {
  const f = $('#addForm');
  f.style.display = f.style.display === 'none' ? '' : 'none';
}

export async function addAccount() {
  const session = $('#addSession').value.trim();
  if (!session) return toast('Session 不能为空', false);
  await api('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: $('#addName').value.trim(),
      session,
      memo_account:  $('#addMemoAcc').value.trim(),
      memo_password: $('#addMemoPwd').value.trim(),
      memo_apikey:   $('#addMemoKey').value.trim(),
      memo_note:     $('#addMemoNote').value.trim(),
      proxy_url:     $('#addProxyUrl').value.trim(),
    }),
  });
  ['addName','addSession','addMemoAcc','addMemoPwd','addMemoKey','addMemoNote','addProxyUrl']
    .forEach((id) => ($(`#${id}`).value = ''));
  $('#addForm').style.display = 'none';
  toast('添加成功');
  loadAccounts();
  window.loadStats();
}

/* ===== 启停 / 删除 ===== */

export async function toggleAcc(id, cur) {
  await api(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ enabled: !cur }) });
  loadAccounts();
}

export async function delAcc(id) {
  if (!confirm('确认删除？')) return;
  await api(`/api/accounts/${id}`, { method: 'DELETE' });
  toast('已删除');
  loadAccounts();
  window.loadLogs();
  window.loadStats();
}

/* ===== 详情弹窗 ===== */

function openModal() {
  const m = $('#detailModal');
  m.classList.remove('hidden');
  m.classList.add('flex');
}

export function closeDetail() {
  const m = $('#detailModal');
  m.classList.add('hidden');
  m.classList.remove('flex');
}

export function showDetail(id) {
  const r = state.accountsCache.find((a) => a.id === id);
  if (!r) return;
  $('#detailTitle').textContent = r.name || '账号#' + r.id;

  const row = (label, val) =>
    `<div class="flex py-2.5 border-b border-stone-100 last:border-b-0 text-sm">
       <span class="text-stone-500 min-w-[80px] font-semibold text-xs shrink-0">${label}</span>
       <span class="text-stone-800 break-all flex-1">${val}</span>
     </div>`;

  const badge = (on, yes, no) =>
    `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
       ${on ? 'bg-[#e8f0e3] text-[#5a7a4a]' : 'bg-stone-100 text-stone-400'}">${on ? yes : no}</span>`;

  let h = '';
  h += row('Session', `<code class="text-xs font-mono">${esc(r.session)}</code>`);
  h += row('状态', badge(r.enabled, '启用', '禁用'));
  h += row('创建时间', r.created_at);
  if (r.memo_account)  h += row('账号', esc(r.memo_account));
  if (r.memo_password) h += row('密码', esc(r.memo_password));
  if (r.memo_apikey)   h += row('API Key', esc(r.memo_apikey));
  if (r.memo_note)     h += row('备注', esc(r.memo_note));
  if (r.proxy_url)     h += row('代理地址', esc(r.proxy_url));

  if (r.balance_remain != null) {
    h += `<div class="bg-[#7c956b] rounded-[1.5rem] p-5 my-4 text-white">
      <div class="flex justify-between text-sm opacity-80 mb-1">
        <span>剩余额度</span><span>更新: ${r.balance_updated_at || '-'}</span>
      </div>
      <div class="text-3xl font-bold my-1.5 tracking-tight font-serif">$${Number(r.balance_remain).toFixed(2)}</div>
    </div>`;
  }

  h += `<div class="flex gap-2 mt-5">
    <button class="${BTN_SM} bg-stone-800 text-white hover:bg-stone-700" onclick="editDetail(${r.id})">编辑</button>
    <button class="${BTN_SM} bg-[#7c956b] text-white hover:bg-[#6b8259]" onclick="closeDetail();queryBal(${r.id})">查余额</button>
  </div>`;

  $('#detailBody').innerHTML = h;
  openModal();
}

/* ===== 编辑 ===== */

export function editDetail(id) {
  const r = state.accountsCache.find((a) => a.id === id);
  if (!r) return;

  const fr = (label, elId, value, ph) =>
    `<div class="flex flex-col md:flex-row gap-2 md:gap-3 items-start md:items-center">
       <label class="text-sm text-stone-500 font-semibold md:min-w-[80px]">${label}</label>
       <input id="${elId}" value="${esc(value)}" placeholder="${ph || ''}" class="${INPUT_CLS}">
     </div>`;

  $('#detailBody').innerHTML = `<div class="space-y-3">
    ${fr('名称', 'editName', r.name, '')}
    <div class="flex flex-col md:flex-row gap-2 md:gap-3 items-start md:items-center">
      <label class="text-sm text-stone-500 font-semibold md:min-w-[80px]">Session</label>
      <input id="editSession" placeholder="留空不修改" class="${INPUT_CLS}">
    </div>
    ${fr('账号', 'editMemoAcc', r.memo_account, '')}
    ${fr('密码', 'editMemoPwd', r.memo_password, '')}
    ${fr('API Key', 'editMemoKey', r.memo_apikey, '')}
    ${fr('备注', 'editMemoNote', r.memo_note, '')}
    ${fr('代理地址', 'editProxyUrl', r.proxy_url || '', 'http://1.2.3.4:3001')}
  </div>
  <div class="flex gap-2 justify-end mt-5">
    <button class="${BTN_SM} text-stone-500 border border-stone-200 hover:bg-stone-100" onclick="showDetail(${id})">取消</button>
    <button class="${BTN_SM} bg-[#7c956b] text-white hover:bg-[#6b8259]" onclick="saveDetail(${id})">保存</button>
  </div>`;
}

export async function saveDetail(id) {
  const body = {
    name:          $('#editName').value.trim(),
    memo_account:  $('#editMemoAcc').value.trim(),
    memo_password: $('#editMemoPwd').value.trim(),
    memo_apikey:   $('#editMemoKey').value.trim(),
    memo_note:     $('#editMemoNote').value.trim(),
    proxy_url:     $('#editProxyUrl').value.trim(),
  };
  const session = $('#editSession').value.trim();
  if (session) body.session = session;
  await api(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  toast('已保存');
  closeDetail();
  loadAccounts();
}

/* ===== 余额 ===== */

export async function queryBal(id) {
  toast('查询中...');
  try {
    const r = await api(`/api/balance/${id}`);
    if (!r.ok) { toast(r.msg, false); loadAccounts(); window.loadLogs(); return; }
    toast(`余额: $${Number(r.remain).toFixed(2)}`);
    loadAccounts();
    window.loadStats();
    window.loadLogs();
  } catch { toast('查询失败', false); }
}

/* ===== 签到 ===== */

export async function checkinOne(id) {
  toast('签到中...');
  const r = await api(`/api/checkin/${id}`, { method: 'POST' });
  toast(r.msg, r.ok);
  loadAccounts();
  window.loadLogs();
  window.loadStats();
}

export async function checkinAll() {
  toast('签到中...');
  await api('/api/checkin', { method: 'POST' });
  toast('签到完成');
  loadAccounts();
  window.loadLogs();
  window.loadStats();
}
