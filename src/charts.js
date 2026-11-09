/* ===================== WYKRESY SVG ===================== */
const PAL = ['#1565C0', '#26A69A', '#F9A825', '#7E57C2', '#EF5350', '#8D6E63', '#78909C', '#AB47BC', '#29B6F6', '#9CCC65'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtShort = v => { const a = Math.abs(v); if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' mln'; if (a >= 1e4) return Math.round(v / 1e3) + ' tys.'; if (a >= 1e3) return (v / 1e3).toFixed(1).replace('.', ',') + ' tys.'; if (a >= 100 || a === 0) return Math.round(v).toString(); return (+v.toFixed(a >= 10 ? 1 : 2)).toString().replace('.', ','); };
function niceTicks(min, max, n = 5) {
  if (min === max) { max = min + 1; }
  const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(10));
  return t;
}
function emptyChart(msg) { return `<div class="chart-empty">${esc(msg || 'Brak danych do wykresu')}</div>`; }

/* series: [{name, color, points:[[dateStr, value]]}], opts: {pct, h} */
function lineChart(series, opts = {}) {
  const K = (!opts.pct && !opts.fmt && !opts.pln && typeof C !== 'undefined' && C && C.waluta && C.waluta !== 'PLN' && C.kursX) ? C.kursX : 1;   // waluta prezentacji
  if (K !== 1) series = series.map(s => ({ ...s, points: s.points.map(p => [p[0], p[1] / K]) }));
  const pts = series.flatMap(s => s.points);
  if (pts.length < 2) return emptyChart(opts.empty || 'Wykres pojawi się po kilku dniach zapisów historii');
  const W = 640, H = opts.h || 240, L = 66, R = 14, T = 12, B = 28;
  const xs = pts.map(p => new Date(p[0]).getTime()), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys); if (!opts.pct && opts.zero !== false) y0 = Math.min(y0, 0);
  if (y1 - y0 < Math.abs(y1) * 0.002) { const pad = Math.max(Math.abs(y1) * 0.002, 1); y0 -= pad; y1 += pad; }
  const ticks = niceTicks(y0, y1); y0 = ticks[0]; y1 = ticks[ticks.length - 1];
  const X = t => L + (W - L - R) * (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0));
  const Y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0));
  const stepT = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  const fy = v => opts.pct ? (v * 100).toFixed(stepT < 0.01 ? 1 : 0).replace('.', ',') + '%' : (stepT < 1000 && Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('pl-PL') : fmtShort(v));
  let g = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${fy(v)}</text>`).join('');
  const span = x1 - x0, p2 = n => String(n).padStart(2, '0');
  const fx = d => span < 2 * 864e5 ? `${p2(d.getHours())}:${p2(d.getMinutes())}` : span < 120 * 864e5 ? `${p2(d.getDate())}.${p2(d.getMonth() + 1)}` : `${p2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
  const nx = 5; for (let i = 0; i <= nx; i++) { const t = x0 + (x1 - x0) * i / nx; const d = new Date(t);
    g += `<text x="${X(t)}" y="${H - 8}" class="ax" text-anchor="middle">${fx(d)}</text>`; }
  const paths = series.map((s, k) => { const c = s.color || PAL[k];
    const sorted = s.points.slice().sort((a, b) => a[0].localeCompare(b[0]));
    const d = sorted.map((p, i) => `${i ? 'L' : 'M'}${X(new Date(p[0]).getTime()).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    const area = k === 0 && opts.area ? `<path d="${d}L${X(new Date(sorted[sorted.length - 1][0]).getTime())},${Y(y0)}L${X(new Date(sorted[0][0]).getTime())},${Y(y0)}Z" fill="${c}" opacity=".08"/>` : '';
    return area + `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.2" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`; }).join('');
  const zero = !opts.pct || y0 >= 0 ? '' : `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" stroke="#9aa4b2"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}${zero}${paths}</svg>` + legend(series.map((s, k) => [s.name, s.color || PAL[k]]));
}
function legend(items) { return `<div class="legend">${items.map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('')}</div>`; }

/* data: [[label, value]] */
function donut(data, opts = {}) {
  data = data.filter(d => d[1] > 0).sort((a, b) => b[1] - a[1]);
  const tot = data.reduce((a, d) => a + d[1], 0);
  if (!tot) return emptyChart(opts.empty);
  const R = 80, r = 52, C = 100; let a0 = -Math.PI / 2, out = '';
  data.forEach(([, v], k) => {
    const a1 = a0 + 2 * Math.PI * v / tot, big = a1 - a0 > Math.PI ? 1 : 0, c = opts.colors?.[k] || PAL[k % PAL.length];
    if (data.length === 1) { out += `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${c}" stroke-width="${R - r}"/>`; }
    else { const p = (ang, rad) => `${(C + rad * Math.cos(ang)).toFixed(2)},${(C + rad * Math.sin(ang)).toFixed(2)}`;
      out += `<path d="M${p(a0, R)}A${R},${R} 0 ${big} 1 ${p(a1, R)}L${p(a1, r)}A${r},${r} 0 ${big} 0 ${p(a0, r)}Z" fill="${c}"/>`; }
    a0 = a1; });
  const center = opts.center ? `<text x="${C}" y="${C - 2}" text-anchor="middle" class="dc1">${esc(opts.center[0])}</text><text x="${C}" y="${C + 16}" text-anchor="middle" class="dc2">${esc(opts.center[1])}</text>` : '';
  const leg = data.map(([n, v], k) => `<div class="dl"><i style="background:${opts.colors?.[k] || PAL[k % PAL.length]}"></i><span>${esc(n)}</span><b>${(v / tot * 100).toFixed(1).replace('.', ',')}%</b></div>`).join('');
  return `<div class="donut"><svg viewBox="0 0 200 200">${out}${center}</svg><div class="dlegend">${leg}</div></div>`;
}

/* bars: labels[], series:[{name,color,values[]}], opts {h, fmt, horizontal} */
function barChart(labels, series, opts = {}) {
  const K = (!opts.pct && !opts.fmt && !opts.pln && typeof C !== 'undefined' && C && C.waluta && C.waluta !== 'PLN' && C.kursX) ? C.kursX : 1;
  if (K !== 1) series = series.map(s => ({ ...s, values: s.values.map(v => v / K) }));
  const all = series.flatMap(s => s.values);
  if (!all.some(v => v)) return emptyChart(opts.empty);
  const W = 640, H = opts.h || 230, L = 58, R = 12, T = 12, B = 30;
  let y0 = Math.min(0, ...all), y1 = Math.max(0, ...all); const ticks = niceTicks(y0, y1); y0 = ticks[0]; y1 = ticks[ticks.length - 1];
  const Y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0));
  const n = labels.length, gw = (W - L - R) / n, bw = Math.min(28, gw * 0.7 / series.length);
  const f = opts.fmt || fmtShort;
  let g = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${f(v)}</text>`).join('');
  labels.forEach((lb, i) => { const cx = L + gw * (i + 0.5);
    g += `<text x="${cx}" y="${H - 10}" class="ax" text-anchor="middle">${esc(String(lb).slice(0, 12))}</text>`;
    series.forEach((s, k) => { const v = s.values[i] || 0, x = cx - bw * series.length / 2 + k * bw, y = Y(Math.max(v, 0)), h = Math.abs(Y(v) - Y(0));
      const col = opts.signColors ? (v >= 0 ? '#26A69A' : '#EF5350') : (s.color || PAL[k]);
      g += `<rect x="${x + 1}" y="${y}" width="${bw - 2}" height="${Math.max(h, v ? 1 : 0)}" rx="3" fill="${col}"><title>${esc(lb)}: ${esc(f(v))}</title></rect>`; }); });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>` + (series.length > 1 ? legend(series.map((s, k) => [s.name, s.color || PAL[k]])) : '');
}
