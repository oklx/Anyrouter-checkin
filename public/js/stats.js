/**
 * 统计概览 + 余额曲线图（时间轴等比例）
 */
import { $, api } from './utils.js';

let chartInstance = null;

export async function loadStats() {
  const data = await api('/api/stats');
  $('#statAccounts').textContent = data.account_count;
  $('#statBalance').textContent = `$${Number(data.total_remain).toFixed(2)}`;

  if (data.snapshots.length > 1) {
    $('#chartToggle').style.display = '';
    renderChart(data.snapshots);
  } else {
    $('#chartToggle').style.display = 'none';
  }
}

function renderChart(snapshots) {
  const canvas = $('#balanceChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const ctx = canvas.getContext('2d');

  if (chartInstance) chartInstance.destroy();

  // 转换为 {x: Date, y: number} 格式
  const points = snapshots.map((s) => ({
    x: new Date(s.created_at.replace(' ', 'T')),
    y: s.total_remain,
  }));

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: '余额总和 ($)',
        data: points,
        borderColor: '#7c956b',
        backgroundColor: 'rgba(124,149,107,.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#faf6f1',
          titleColor: '#78716c',
          bodyColor: '#292524',
          borderColor: '#d6d3d1',
          borderWidth: 1,
          cornerRadius: 12,
          padding: 10,
        },
      },
      scales: {
        x: {
          type: 'time',
          time: {
            tooltipFormat: 'MM/dd HH:mm',
            displayFormats: {
              minute: 'HH:mm',
              hour: 'MM/dd HH:mm',
              day: 'MM/dd',
            },
          },
          grid: { display: false },
          ticks: { color: '#a8a29e', font: { size: 11 }, maxTicksLimit: 8 },
        },
        y: {
          grid: { color: '#e7e5e4' },
          ticks: { color: '#a8a29e', font: { size: 11 }, callback: (v) => '$' + v },
        },
      },
    },
  });
}

export function toggleChart() {
  const wrap = $('#chartWrap');
  const btn = $('#chartToggle');
  const isHidden = wrap.style.display === 'none';
  wrap.style.display = isHidden ? '' : 'none';
  btn.textContent = isHidden ? '收起图表' : '余额趋势';
}
