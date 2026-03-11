/**
 * 入口：认证、初始化、全局绑定
 */
import { $, state, toast } from './utils.js';
import {
  loadAccounts, showAddForm, addAccount, toggleAcc, delAcc,
  showDetail, closeDetail, editDetail, saveDetail,
  queryBal, checkinOne, checkinAll,
} from './accounts.js';
import { loadLogs, clearLogs } from './logs.js';
import { loadSettings, saveSettings } from './settings.js';
import { loadStats, toggleChart } from './stats.js';

/* ===== 认证 ===== */

function showLogin() {
  $('#loginMask').style.display = 'flex';
}

async function doLogin() {
  const pwd = $('#loginPwd').value;
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    if (r.ok && (await r.json()).ok) {
      state.panelPwd = pwd;
      $('#loginMask').style.display = 'none';
      init();
    } else {
      toast('密码错误', false);
    }
  } catch {
    toast('登录失败', false);
  }
}

async function checkAuth() {
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '' }),
    });
    if (r.ok && (await r.json()).ok) { init(); return; }
  } catch {}
  showLogin();
}

function init() {
  loadStats();
  loadAccounts(1);
  loadLogs(1);
  loadSettings();
}

/* ===== 分页跳转 ===== */

function loadAccPage(p) { loadAccounts(p); }
function loadLogPage(p) { loadLogs(p); }

/* ===== 事件 ===== */

$('#detailModal').addEventListener('click', (e) => {
  if (e.target === $('#detailModal')) closeDetail();
});

/* ===== 暴露到 window（供 onclick 调用）===== */

Object.assign(window, {
  doLogin, showLogin,
  showAddForm, addAccount, toggleAcc, delAcc,
  showDetail, closeDetail, editDetail, saveDetail,
  queryBal, checkinOne, checkinAll,
  loadAccounts, loadLogs, clearLogs,
  loadAccPage, loadLogPage,
  loadStats, toggleChart,
  saveSettings,
});

/* ===== 启动 ===== */

checkAuth();
