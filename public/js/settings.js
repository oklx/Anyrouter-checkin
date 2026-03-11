/**
 * 系统设置
 */
import { $, state, toast, api } from './utils.js';

export async function loadSettings() {
  const s = await api('/api/settings');
  $('#sUpstream').value = s.upstream || '';
  $('#sCron').value     = s.cron || '';
  $('#sTgToken').value  = s.tg_bot_token || '';
  $('#sTgChat').value   = s.tg_chat_id || '';
  $('#sPanelPwd').value = s.panel_password || '';
}

export async function saveSettings() {
  await api('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({
      upstream:       $('#sUpstream').value.trim(),
      cron:           $('#sCron').value.trim(),
      tg_bot_token:   $('#sTgToken').value.trim(),
      tg_chat_id:     $('#sTgChat').value.trim(),
      panel_password: $('#sPanelPwd').value,
    }),
  });
  state.panelPwd = $('#sPanelPwd').value;
  toast('设置已保存');
}
