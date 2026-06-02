const MU0 = 4 * Math.PI * 1e-7;

const params = {
  wireLength: 80,
  wireDiam: 0.8,
  insulation: 0.05,
  frameDiam: 30,
  current: 1,
  lMin: 10,
  lMax: 180,
  lStep: 0.1
};

const controlDefs = [
  ['wireLength', 'Длина провода L', 5, 250, 1, 'м'],
  ['wireDiam', 'Диаметр жилы d', 0.2, 3, 0.1, 'мм'],
  ['insulation', 'Изоляция δ', 0, 0.5, 0.01, 'мм'],
  ['frameDiam', 'Диаметр каркаса D', 10, 120, 1, 'мм'],
  ['current', 'Ток I', 0.1, 10, 0.1, 'А'],
  ['lMin', 'Минимальная длина l', 5, 160, 1, 'мм'],
  ['lMax', 'Максимальная длина l', 20, 360, 1, 'мм'],
  ['lStep', 'Шаг перебора Δl', 0.1, 10, 0.1, 'мм']
];

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0';
}

function wireOuterDiameter(p) {
  return (p.wireDiam + 2 * p.insulation) / 1000;
}

function firstLayerRadius(p) {
  return p.frameDiam / 2000 + wireOuterDiameter(p) / 2;
}

function fieldAtCenter(p, coilLength) {
  const pitch = wireOuterDiameter(p);
  const turnsPerLayer = Math.max(1, Math.floor(coilLength / pitch));
  const firstRadius = firstLayerRadius(p);
  let remaining = p.wireLength;
  let B = 0;
  let N = 0;
  let layers = 0;
  let radiusSum = 0;

  for (let j = 0; remaining > 0; j++) {
    const r = firstRadius + j * pitch;
    const turnLength = 2 * Math.PI * r;
    const turns = Math.min(turnsPerLayer, Math.floor(remaining / turnLength));
    if (turns <= 0) break;

    layers++;
    const dx = coilLength / turns;
    for (let i = 0; i < turns; i++) {
      const x = -coilLength / 2 + (i + 0.5) * dx;
      B += MU0 * p.current * r * r / (2 * Math.pow(r * r + x * x, 1.5));
    }

    N += turns;
    radiusSum += turns * r;
    remaining -= turns * turnLength;
  }

  const meanRadius = N > 0 ? radiusSum / N : firstRadius;
  const windingDepth = Math.max(layers, 1) * pitch;
  const Llong = MU0 * N * N * Math.PI * meanRadius * meanRadius / coilLength;
  const Lwheeler = wheelerInductance(N, meanRadius, coilLength, windingDepth, layers);
  const inductanceError = Lwheeler > 0 ? Math.abs(Llong - Lwheeler) / Lwheeler : 0;

  return {
    length: coilLength,
    B,
    N,
    layers,
    meanRadius,
    windingDepth,
    Llong,
    Lwheeler,
    inductanceError
  };
}

function wheelerInductance(N, radius, length, depth, layers) {
  const meterToInch = 39.3700787402;
  const r = radius * meterToInch;
  const l = length * meterToInch;
  const b = depth * meterToInch;

  if (N <= 0 || r <= 0 || l <= 0) return 0;

  if (layers <= 1) {
    return (r * r * N * N / (9 * r + 10 * l)) * 1e-6;
  }

  return (0.8 * r * r * N * N / (6 * r + 9 * l + 10 * b)) * 1e-6;
}

function optimize(stepMeters) {
  const min = params.lMin / 1000;
  const max = params.lMax / 1000;
  const step = Math.max(stepMeters, 0.00001);
  const data = [];
  const count = Math.floor((max - min) / step);

  for (let k = 0; k <= count; k++) {
    data.push(fieldAtCenter(params, min + k * step));
  }
  if (data[data.length - 1].length < max - 1e-12) {
    data.push(fieldAtCenter(params, max));
  }

  let bestIndex = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].B > data[bestIndex].B) bestIndex = i;
  }

  return {
    data,
    best: data[bestIndex],
    bestIndex,
    isBoundary: bestIndex === 0 || bestIndex === data.length - 1
  };
}

function convergenceCheck() {
  const coarse = optimize(params.lStep / 1000);
  const fine = optimize(params.lStep / 2000);
  const change = Math.abs(fine.best.length - coarse.best.length) / coarse.best.length;
  return { coarse, fine, change };
}

function singleLayerCheck(length) {
  const r = firstLayerRadius(params);
  const pitch = wireOuterDiameter(params);
  const turns = Math.max(2, Math.floor(length / pitch));
  const dx = length / turns;
  let numeric = 0;

  for (let i = 0; i < turns; i++) {
    const x = -length / 2 + (i + 0.5) * dx;
    numeric += MU0 * params.current * r * r / (2 * Math.pow(r * r + x * x, 1.5));
  }

  const analytic = MU0 * turns * params.current / (2 * Math.sqrt(r * r + Math.pow(length / 2, 2)));
  const error = Math.abs(numeric - analytic) / analytic;
  return { turns, radius: r, numeric, analytic, error };
}

function renderControls() {
  const box = document.getElementById('controls');
  box.innerHTML = '';

  controlDefs.forEach(([key, label, min, max, step, unit]) => {
    const el = document.createElement('label');
    el.className = 'control';
    el.innerHTML = `
      <span>${label}: <b id="val-${key}">${params[key]}</b> ${unit}</span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${params[key]}">
    `;

    el.querySelector('input').addEventListener('input', event => {
      params[key] = Number(event.target.value);
      if (params.lMin >= params.lMax) {
        if (key === 'lMin') params.lMax = params.lMin + 1;
        else params.lMin = params.lMax - 1;
        syncControlValues();
      }
      document.getElementById(`val-${key}`).textContent = params[key];
      render();
    });

    box.appendChild(el);
  });
}

function syncControlValues() {
  controlDefs.forEach(([key]) => {
    const value = document.getElementById(`val-${key}`);
    const input = value && value.parentElement.nextElementSibling;
    if (value) value.textContent = params[key];
    if (input) input.value = params[key];
  });
}

function drawPlot(data, best) {
  const svg = document.getElementById('plot');
  const W = 900;
  const H = 420;
  const m = { l: 70, r: 26, t: 24, b: 60 };
  svg.innerHTML = '';

  const xs = data.map(d => d.length * 1000);
  const ys = data.map(d => d.B * 1000);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = 0;
  const ymax = Math.max(...ys) * 1.08 || 1;
  const X = x => m.l + (x - xmin) / (xmax - xmin) * (W - m.l - m.r);
  const Y = y => H - m.b - (y - ymin) / (ymax - ymin) * (H - m.t - m.b);

  for (let i = 0; i <= 5; i++) {
    const x = m.l + i * (W - m.l - m.r) / 5;
    const xv = xmin + i * (xmax - xmin) / 5;
    const y = m.t + i * (H - m.t - m.b) / 5;
    const yv = ymax - i * (ymax - ymin) / 5;
    svg.insertAdjacentHTML('beforeend', `<line class="gridline" x1="${x}" y1="${m.t}" x2="${x}" y2="${H - m.b}"/><text class="tick" x="${x - 18}" y="${H - m.b + 24}">${xv.toFixed(0)}</text>`);
    svg.insertAdjacentHTML('beforeend', `<line class="gridline" x1="${m.l}" y1="${y}" x2="${W - m.r}" y2="${y}"/><text class="tick" x="12" y="${y + 4}">${yv.toFixed(3)}</text>`);
  }

  const path = data.map((d, i) => `${i ? 'L' : 'M'}${X(d.length * 1000).toFixed(2)},${Y(d.B * 1000).toFixed(2)}`).join(' ');
  svg.insertAdjacentHTML('beforeend', `
    <line class="axis" x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}"/>
    <line class="axis" x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H - m.b}"/>
    <path class="curve" d="${path}"/>
    <circle class="point" cx="${X(best.length * 1000)}" cy="${Y(best.B * 1000)}" r="6"/>
    <text class="label" x="${W / 2 - 30}" y="${H - 18}">l, мм</text>
    <text class="label" transform="translate(20 ${H / 2 + 30}) rotate(-90)">B, мТл</text>
  `);
}

function render() {
  if (params.lMin >= params.lMax) params.lMin = params.lMax - 1;

  if (params.lMin >= params.lMax) params.lMin = params.lMax - 1;

  const result = optimize(params.lStep / 1000);
  const best = result.best;

  document.getElementById('bestLength').textContent = `l_opt = ${fmt(best.length * 1000, 1)} мм`;
  document.getElementById('bestB').textContent = `B_max = ${fmt(best.B * 1000, 4)} мТл`;
  document.getElementById('bestN').textContent = `N = ${best.N} витков, слоёв = ${best.layers}`;
  document.getElementById('bestGeometry').textContent = `a = d + 2δ = ${fmt(wireOuterDiameter(params) * 1000, 2)} мм; r_1 = D/2 + a/2 = ${fmt(firstLayerRadius(params) * 1000, 2)} мм`;
  document.getElementById('bestL').textContent = `Индуктивность: Уиллер ${fmt(best.Lwheeler * 1000, 3)} мГн; длинный соленоид ${fmt(best.Llong * 1000, 3)} мГн`;
  document.getElementById('inductanceError').textContent = `Расхождение оценок индуктивности: ${fmt(best.inductanceError * 100, 1)}%`;

  drawPlot(result.data, best);
}

renderControls();
render();
