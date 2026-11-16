const ASSET_ROOT = 'https://raw.githubusercontent.com/Morta1/IdleonToolbox/48cb4ee697988ec5eac14ba97142add6296505b2/public/data';
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const layout = window.IDLEON_LAB_LAYOUT;
let characters = [{ name: 'Персонаж 1', labLevel: 0, current: null, lineWidth: 50, imported: false }];
let acquiredJewels = new Set();
let targetModes = new Map((layout?.bonuses || []).map((entry) => [`b${entry.id}`, 'optional']));
const characterIcons = new Map();
let solving = false;
let route = null;
let statusTimer;
let rerunRequested = false;

function showStatus(message, error = false) {
  const el = $('#status');
  el.textContent = message;
  el.classList.toggle('error', error);
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, 9000);
}

function getArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return []; } }
  return [];
}

function unwrapSave(value) {
  let save = typeof value === 'string' ? JSON.parse(value.trim()) : value;
  if (save?.data && !save.Lab && !save.Lv0_0) save = { ...save.data, playerNames: save.playerNames || save.charNames || save.data.playerNames };
  return save;
}

function parseSave(value) {
  const save = unwrapSave(value);
  if (!save || typeof save !== 'object') throw new Error('Ожидался JSON-объект сохранения.');
  const nameValue = save.playerNames || save.charNames || save.CharacterNames || [];
  const names = Array.isArray(nameValue) ? nameValue : [];
  let lab = getArray(save.Lab);
  if (typeof save.Lab === 'string') lab = getArray(save.Lab);
  const coords = getArray(lab[0]);
  const jewelFlags = getArray(lab[14]);
  const found = [];
  for (let i = 0; i < 30; i++) {
    const rawSkills = save[`Lv0_${i}`] ?? save[`Lv0${i}`];
    if (rawSkills == null) continue;
    const skills = getArray(rawSkills);
    const labLevel = Number(Array.isArray(skills) ? skills[12] : 0) || 0;
    const x = Number(coords[i * 2]);
    const y = Number(coords[i * 2 + 1]);
    found.push({
      name: String(names[i] || `Персонаж ${i + 1}`),
      labLevel,
      current: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null,
      lineWidth: Math.floor(50 + 2 * labLevel),
      imported: true,
      classId: Number(save[`CharacterClass_${i}`]) || 0,
      equipment: getArray(save[`EquipOrder_${i}`])
    });
  }
  if (!found.length) throw new Error('Не найдены массивы персонажей Lv0_0, Lv0_1… в этом JSON.');
  return { characters: found, jewelFlags };
}

function importSave(value, source) {
  try {
    const parsed = parseSave(value);
    characters = parsed.characters;
    acquiredJewels = new Set(parsed.jewelFlags.flatMap((flag, index) => Number(flag) === 1 ? [index] : []));
    targetModes = new Map([...(layout?.bonuses || []).map((entry) => [`b${entry.id}`, 'optional']), ...[...acquiredJewels].map((id) => [`j${id}`, 'optional'])]);
    characterIcons.clear();
    renderCharacters();
    renderJewels();
    calculateRoute();
    parsed.characters.forEach((character) => makeCharacterIcon(character).then((icon) => { if (icon) { characterIcons.set(character.name, icon); if (route) drawRoute(lineWidths()); } }));
    const coords = characters.filter((character) => character.current).length;
    showStatus(`Загружено из ${source}: ${characters.length} персонажей, Lab-уровни, ${coords} текущих координат и ${acquiredJewels.size} открытых самоцветов.`);
  } catch (error) {
    showStatus(error.message, true);
  }
}

const HEAD_HUES = [[5, 10], [6, 136], [18, 182], [30, 300], [Infinity, 90]];
const HEAD_COLORS = {
  10: [0.951109,-0.113321,0.162213,0,0,0.028063,1.019983,-0.048046,0,0,-0.133487,0.135051,0.998436,0,0],
  136: [-0.50142,0.732811,0.768609,0,0,0.46499,0.607515,-0.072505,0,0,-0.181271,1.726395,-0.545124,0,0],
  182: [-0.566756,1.454843,0.111913,0,0,0.420222,0.425608,0.154171,0,0,0.45269,1.404926,-0.857615,0,0],
  300: [0.790514,0.976927,-0.767441,0,0,-0.017506,0.736336,0.28117,0,0,0.788182,-0.261767,0.473584,0,0],
  90: [0,0,1,0,0,0.355671,0.85516,-0.210831,0,0,-0.574658,1.43032,0.144338,0,0]
};
function imageLoaded(src) { return new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = src; }); }
async function makeCharacterIcon(character) {
  const [head, hats] = await Promise.all([imageLoaded('assets/head.png'), imageLoaded('assets/hats_board.png')]);
  if (!head) return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 65;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const headX = Math.round(32.5 - head.width), headY = Math.round(6 + 32.5 - head.height);
  const hue = HEAD_HUES.find(([max]) => character.classId < max)?.[1] ?? 90;
  const headCanvas = document.createElement('canvas'); headCanvas.width = head.width; headCanvas.height = head.height;
  const headCtx = headCanvas.getContext('2d', { willReadFrequently: true }); headCtx.drawImage(head, 0, 0);
  const pixels = headCtx.getImageData(0, 0, head.width, head.height), matrix = HEAD_COLORS[hue], clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (!pixels.data[i + 3]) continue;
    const [r,g,b,a] = pixels.data.slice(i, i + 4);
    pixels.data[i] = clamp(matrix[0]*r + matrix[1]*g + matrix[2]*b + matrix[3]*a + matrix[4]);
    pixels.data[i+1] = clamp(matrix[5]*r + matrix[6]*g + matrix[7]*b + matrix[8]*a + matrix[9]);
    pixels.data[i+2] = clamp(matrix[10]*r + matrix[11]*g + matrix[12]*b + matrix[13]*a + matrix[14]);
  }
  headCtx.putImageData(pixels, 0, 0);
  ctx.drawImage(headCanvas, headX, headY, head.width * 2, head.height * 2);
  const worn = character.equipment?.[0] || {};
  const premium = worn[8]; const helmet = premium && premium !== 'Blank' && premium !== 'EquipmentHats38' ? premium : worn[0];
  const hatId = typeof HAT_IDS !== 'undefined' ? HAT_IDS[helmet] : undefined;
  if (hats && Number.isFinite(hatId)) {
    const frame = hatId + 2, col = frame % 14, row = Math.floor(frame / 14);
    const sx = col * 30, sy = row * 50;
    ctx.drawImage(hats, sx, sy, 30, 50, headX - 22, headY - 36, 60, 100);
  }
  return canvas.toDataURL();
}

function renderCharacters() {
  $('#characters').innerHTML = characters.map((character, index) => {
    const pos = character.current ? `${Math.round(character.current.x)}, ${Math.round(character.current.y)}` : 'ещё не в Mainframe';
    return `<div class="char-row">
      <div class="char-name"><strong>${escapeHtml(character.name)}</strong><small>${character.imported ? 'из raw JSON' : 'параметры для примера'}</small></div>
      <label>Уровень Lab<input data-character="${index}" data-key="labLevel" type="number" min="0" value="${character.labLevel}"></label>
      <label>Ширина линии<input data-character="${index}" data-key="lineWidth" type="number" min="0" value="${character.lineWidth}"></label>
      <div class="current-pos"><small>Сейчас</small><span>${pos}</span></div>
      <button class="remove" data-remove="${index}" aria-label="Удалить ${escapeHtml(character.name)}">×</button>
    </div>`;
  }).join('');
  $('#characters').querySelectorAll('input').forEach((input) => input.addEventListener('input', () => {
    const character = characters[Number(input.dataset.character)];
    character[input.dataset.key] = Number(input.value) || 0;
    if (input.dataset.key === 'labLevel' && character.imported) {
      character.lineWidth = Math.floor(50 + 2 * character.labLevel);
      const widthInput = $('#characters').querySelector(`[data-character="${input.dataset.character}"][data-key="lineWidth"]`);
      if (widthInput) widthInput.value = character.lineWidth;
    }
    calculateRoute();
  }));
  $('#characters').querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    if (characters.length <= 1) return;
    characters.splice(Number(button.dataset.remove), 1);
    renderCharacters();
    calculateRoute();
  }));
}

function renderJewels() {
  if (!layout) return;
  $('#jewel-controls').innerHTML = layout.jewels.map((jewel) => `<label class="jewel-toggle">
    <input type="checkbox" data-jewel="${jewel.id}" ${acquiredJewels.has(jewel.id) ? 'checked' : ''}>
    <span>${escapeHtml(jewel.name)}</span></label>`).join('');
  $('#jewel-controls').querySelectorAll('[data-jewel]').forEach((input) => input.addEventListener('change', () => {
    const id = Number(input.dataset.jewel);
    if (input.checked) { acquiredJewels.add(id); if (!targetModes.has(`j${id}`)) targetModes.set(`j${id}`, 'optional'); }
    else { acquiredJewels.delete(id); targetModes.delete(`j${id}`); }
    calculateRoute();
  }));
}

function gameDistance(a, b) {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return 0.9604339 * Math.max(dx, dy) + 0.397824735 * Math.min(dx, dy);
}

function lineWidths(site = null) {
  const flat = Number($('#linePx').value) || 0;
  const percent = Number($('#linePct').value) || 0;
  const sapphire = layout.jewels[5];
  return characters.map((character) => {
    let base = 50 + 2 * (Number(character.labLevel) || 0);
    if (Number.isFinite(Number(character.lineWidth))) base = Number(character.lineWidth);
    if (acquiredJewels.has(5) && site && gameDistance(site, sapphire) < 150) base *= 1.25;
    return Math.max(0, Math.floor((base + flat) * (1 + percent / 100)));
  });
}

function targetRanges(rangeMods) {
  const px = Number($('#rangePx').value) || 0;
  const pct = Number($('#rangePct').value) || 0;
  const safety = Math.max(0, Number($('#precision').value) || 0);
  const range = (base, fixed = false) => fixed ? base : Math.floor(80 * (1 + (rangeMods.pct + pct) / 100) + rangeMods.px + px);
  const targets = layout.bonuses.map((entry) => ({ ...entry, type: 'bonus', key: `b${entry.id}`, eligible: true,
    mode: targetModes.get(`b${entry.id}`) || 'excluded', reach: range(entry.baseRange || 80, entry.id === 8 || entry.id === 13) }));
  layout.jewels.forEach((entry) => {
    const fixed = entry.id === 9 || entry.id === 19 || entry.id >= 21;
    const base = entry.id >= 21 ? 100 : 80;
    targets.push({ ...entry, type: 'jewel', key: `j${entry.id}`, eligible: acquiredJewels.has(entry.id),
      mode: targetModes.get(`j${entry.id}`) || 'excluded', reach: range(base, fixed) });
  });
  targets.forEach((target) => { target.safeReach = Math.max(0, target.reach - safety); });
  return targets;
}

function countBits(mask) {
  let count = 0;
  while (mask) { mask &= mask - 1n; count++; }
  return count;
}

function buildCandidates(targets) {
  const points = [...targets, ...layout.jewels, layout.origin, ...characters.map((character) => character.current).filter(Boolean)];
  const candidates = new Map();
  const add = (x, y) => {
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (!candidates.has(key)) candidates.set(key, { x: Math.round(x), y: Math.round(y), key });
  };
  points.forEach((point) => add(point.x, point.y));
  const maxBridge = Math.max(60, ...characters.map((character) => Number(character.lineWidth) || 0)) * 2;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (gameDistance(points[i], points[j]) <= maxBridge) add((points[i].x + points[j].x) / 2, (points[i].y + points[j].y) / 2);
  }
  return [...candidates.values()];
}

async function searchRoute(targets, widths, deadline, onProgress) {
  const sites = buildCandidates(targets);
  if (!widths.length || !sites.length) return { positions: [], targets, connected: [], score: 0 };
  const coverage = sites.map((site) => targets.reduce((masks, target, index) => {
    if (!target.eligible) return masks;
    const distance = gameDistance(site, target);
    const bit = 1n << BigInt(index);
    return {
      active: distance < target.reach ? masks.active | bit : masks.active,
      required: target.mode === 'required' && distance < target.safeReach ? masks.required | bit : masks.required,
      optional: target.mode === 'optional' && distance < target.safeReach ? masks.optional | bit : masks.optional,
      excluded: target.mode === 'excluded' && distance < target.reach ? masks.excluded | bit : masks.excluded
    };
  }, { active: 0n, required: 0n, optional: 0n, excluded: 0n }));
  const widthsAtSite = sites.map((site) => lineWidths(site));
  const mode = $('#order').value;
  const ordered = mode === 'wide'
    ? widths.map((width, index) => ({ width, index })).sort((a, b) => b.width - a.width).map((entry) => entry.index)
    : widths.map((_, index) => index);
  const optimizingOrder = mode === 'optimal';
  const safety = Math.max(0, Number($('#precision').value) || 0);
  const beamLimit = optimizingOrder ? 40 : 56;
  const getWidth = (characterId, siteId) => widthsAtSite[siteId][characterId];
  const requiredTotal = targets.filter((target) => target.eligible && target.mode === 'required').length;
  const optionalTotal = targets.filter((target) => target.eligible && target.mode === 'optional').length;
  const compare = (a, b) => countBits(b.requiredMask) - countBits(a.requiredMask) || countBits(a.excludedMask) - countBits(b.excludedMask) || countBits(b.optionalMask) - countBits(a.optionalMask) || countBits(b.activeMask) - countBits(a.activeMask) || b.margin - a.margin;
  let beam = [], best = { positions: [], charIds: [], activeMask: 0n, requiredMask: 0n, optionalMask: 0n, excludedMask: 0n, margin: 0 };
  const firstCandidates = optimizingOrder ? widths.map((_, index) => index) : [ordered[0]];
  for (const charId of firstCandidates) for (let siteId = 0; siteId < sites.length; siteId++) {
    const reach = getWidth(charId, siteId) - safety;
    const distance = gameDistance(layout.origin, sites[siteId]);
    if (reach > 0 && distance < reach) beam.push({ positions: [siteId], charIds: [charId], usedMask: 1n << BigInt(charId), activeMask: coverage[siteId].active,
      requiredMask: coverage[siteId].required, optionalMask: coverage[siteId].optional, excludedMask: coverage[siteId].excluded, margin: reach - distance });
  }
  beam.sort(compare); beam = beam.slice(0, beamLimit);
  if (beam[0] && compare(beam[0], best) < 0) best = beam[0];
  onProgress(5, `Подготовлено ${sites.length} точек-кандидатов · ищем порядок персонажей`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let step = 1; step < widths.length && beam.length && performance.now() < deadline; step++) {
    const next = [];
    for (const state of beam) {
      const nextChars = optimizingOrder ? widths.map((_, index) => index).filter((index) => !(state.usedMask & (1n << BigInt(index)))) : [ordered[step]];
      for (const charId of nextChars) for (let siteId = 0; siteId < sites.length; siteId++) {
        if (performance.now() >= deadline) break;
        const reach = getWidth(charId, siteId) - safety;
        if (reach <= 0) continue;
        let closest = Infinity;
        for (const previousId of state.positions) closest = Math.min(closest, gameDistance(sites[previousId], sites[siteId]));
        if (closest >= reach) continue;
        const usedMask = state.usedMask | (1n << BigInt(charId));
        next.push({ positions: [...state.positions, siteId], charIds: [...state.charIds, charId], usedMask,
          activeMask: state.activeMask | coverage[siteId].active, requiredMask: state.requiredMask | coverage[siteId].required,
          optionalMask: state.optionalMask | coverage[siteId].optional, excludedMask: state.excludedMask | coverage[siteId].excluded,
          margin: state.margin + reach - closest });
      }
    }
    next.sort(compare);
    const diverse = [], seen = new Set();
    for (const state of next) {
      const key = `${state.usedMask.toString(16)}:${state.activeMask.toString(16)}:${state.requiredMask.toString(16)}:${state.optionalMask.toString(16)}:${state.excludedMask.toString(16)}:${state.positions.join('.')}`;
      if (seen.has(key)) continue;
      seen.add(key); diverse.push(state);
      if (diverse.length >= beamLimit) break;
    }
    beam = diverse;
    if (beam[0] && compare(beam[0], best) < 0) best = beam[0];
    onProgress(Math.min(96, Math.round((step / Math.max(1, widths.length - 1)) * 96)), `Проверено ${step + 1} из ${widths.length} персонажей · ${sites.length} точек-кандидатов`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const connected = targets.filter((target, index) => target.eligible && Boolean(best.activeMask & (1n << BigInt(index))));
  const requiredConnected = targets.filter((target, index) => target.eligible && target.mode === 'required' && Boolean(best.requiredMask & (1n << BigInt(index))));
  const optionalConnected = targets.filter((target, index) => target.eligible && target.mode === 'optional' && Boolean(best.optionalMask & (1n << BigInt(index))));
  return { positions: best.positions.map((siteId, index) => ({ ...sites[siteId], characterId: best.charIds[index] })), targets, connected,
    requiredTotal, optionalTotal, requiredConnected, optionalConnected, excludedConnected: countBits(best.excludedMask), complete: requiredConnected.length === requiredTotal };
}

async function calculateRoute() {
  if (solving) { rerunRequested = true; return; }
  if (!layout) return showStatus('Карта узлов не загружена. Обновите страницу.', true);
  solving = true;
  $('#solve').disabled = true;
  $('#solve').textContent = 'Идёт расчёт…';
  $('#progress-wrap').hidden = false;
  $('#progress').value = 0;
  $('#progress-message').textContent = 'Подготовка карты и вариантов…';
  const started = performance.now();
  const timeLimit = Math.min(120, Math.max(1, Number($('#solve-time').value) || 12)) * 1000;
  const deadline = started + timeLimit;
  const widths = lineWidths();
  try {
    let modifiers = { pct: 0, px: 0 }, result;
    for (let iteration = 0; iteration < 8 && performance.now() < deadline; iteration++) {
      const targets = targetRanges(modifiers);
      result = await searchRoute(targets, widths, deadline, (value, message) => { $('#progress').value = value; $('#progress-message').textContent = message; });
      const hasViral = result.connected.some((target) => target.type === 'bonus' && target.id === 13);
      const hasPyrite = result.connected.some((target) => target.type === 'jewel' && target.id === 9);
      const hasSpelunker = result.connected.some((target) => target.type === 'bonus' && target.id === 8);
      const next = { pct: (hasViral ? 50 : 0) + (hasPyrite ? 30 * (hasSpelunker ? 1.5 : 1) : 0), px: 0 };
      if (next.pct === modifiers.pct) break;
      modifiers = next;
      if (performance.now() >= deadline) break;
    }
    route = result || await searchRoute(targetRanges(modifiers), widths, performance.now() + 20, () => {});
    drawRoute(widths);
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    $('#progress').value = 100;
    $('#progress-message').textContent = `Поиск завершён за ${seconds} с. Обязательные: ${route.requiredConnected.length}/${route.requiredTotal}; желательные: ${route.optionalConnected.length}/${route.optionalTotal}; исключённых подключено: ${route.excludedConnected}.`;
    showStatus($('#progress-message').textContent, !route.complete);
  } finally {
    solving = false; $('#solve').disabled = false; $('#solve').textContent = 'Рассчитать маршрут';
    if (rerunRequested) { rerunRequested = false; setTimeout(calculateRoute, 0); }
  }
}

function drawRoute(widths) {
  const svg = $('#map');
  if (!route) return;
  const connectedKeys = new Set(route.connected.map((target) => target.key));
  const precision = Math.max(0, Number($('#precision').value) || 0);
  const distToRoute = (target) => route.positions.reduce((best, point) => Math.min(best, gameDistance(point, target)), Infinity);
  let margins = route.connected.map((target) => target.reach - distToRoute(target));
  for (let i = 0; i < route.positions.length; i++) {
    const point = route.positions[i];
    const reach = lineWidths(point)[point.characterId];
    let dist = Infinity;
    if (i === 0) dist = gameDistance(layout.origin, point);
    else for (let j = 0; j < i; j++) dist = Math.min(dist, gameDistance(point, route.positions[j]));
    margins.push(reach - dist);
  }
  const actualMinSlack = margins.length ? Math.max(0, Math.floor(Math.min(...margins))) : 0;
  const targetSvg = (entry, type) => {
    const active = connectedKeys.has(`${type === 'bonus' ? 'b' : 'j'}${entry.id}`);
    const locked = type === 'jewel' && !acquiredJewels.has(entry.id);
    const label = `${type === 'bonus' ? 'B' : 'J'}${entry.id}`;
    const icon = type === 'bonus'
      ? `<image class="target-icon" href="${ASSET_ROOT}/LabBonus${entry.id}.png" x="-15" y="-15" width="30" height="30" preserveAspectRatio="xMidYMid meet"/>`
      : `<path d="M0-12 10-4 7 9 0 14-7 9-10-4Z" fill="${locked ? '#445263' : '#77cbe0'}" stroke="${active ? '#d4ff84' : '#c3e6ef'}" stroke-width="2"/>`;
    const opacity = locked ? '.38' : '1';
    return `<g class="target ${type} ${active ? 'active' : ''}" transform="translate(${entry.x},${entry.y})" opacity="${opacity}"><title>${escapeHtml(entry.name)}${locked ? ' · не открыт' : ''} · ${entry.x}, ${entry.y}</title><circle r="17" fill="${active ? '#c6f36b' : '#233442'}" stroke="${active ? '#efffc9' : '#7e91a4'}" stroke-width="2"/>${icon}<text y="26" text-anchor="middle">${label}</text></g>`;
  };
  const targetMarkup = layout.jewels.map((entry) => targetSvg(entry, 'jewel')).join('') + layout.bonuses.map((entry) => targetSvg(entry, 'bonus')).join('');
  let lines = `<line class="link" x1="${layout.origin.x}" y1="${layout.origin.y}" x2="${route.positions[0]?.x ?? layout.origin.x}" y2="${route.positions[0]?.y ?? layout.origin.y}"/>`;
  for (let i = 1; i < route.positions.length; i++) {
    const point = route.positions[i];
    let parent = route.positions[0], closest = Infinity;
    for (let j = 0; j < i; j++) { const distance = gameDistance(point, route.positions[j]); if (distance < closest) { closest = distance; parent = route.positions[j]; } }
    lines += `<line class="link" x1="${parent.x}" y1="${parent.y}" x2="${point.x}" y2="${point.y}"/>`;
  }
  const players = route.positions.map((point, index) => {
    const character = characters[point.characterId];
    const icon = characterIcons.get(character?.name);
    return `<g class="player" transform="translate(${point.x},${point.y})"><title>${escapeHtml(character?.name || `Персонаж ${index + 1}`)} · шаг ${index + 1} · линия ${widths[point.characterId]} px · координаты ${point.x}, ${point.y}</title>${icon ? `<image href="${icon}" x="-25" y="-42" width="50" height="50" preserveAspectRatio="xMidYMid meet"/>` : `<circle r="11"/>`}<circle class="player-order" cy="19" r="9"/><text class="player-number" y="22" text-anchor="middle">${index + 1}</text></g>`;
  }).join('');
  const grid = [];
  for (let x = 0; x <= 2100; x += 100) grid.push(`<line class="map-grid" x1="${x}" y1="0" x2="${x}" y2="470"/>`);
  for (let y = 0; y <= 450; y += 50) grid.push(`<line class="map-grid" x1="0" y1="${y}" x2="2110" y2="${y}"/>`);
  const current = characters.map((character) => character.current ? `<g class="current-player" transform="translate(${character.current.x},${character.current.y})"><title>Сейчас: ${escapeHtml(character.name)} · ${Math.round(character.current.x)}, ${Math.round(character.current.y)}</title>${characterIcons.get(character.name) ? `<image href="${characterIcons.get(character.name)}" x="-18" y="-30" width="36" height="36" preserveAspectRatio="xMidYMid meet"/>` : '<circle r="5"/>'}</g>` : '').join('');
  svg.innerHTML = `<image class="map-bg" href="${ASSET_ROOT}/LabBG.png" x="0" y="0" width="2110" height="470" preserveAspectRatio="none"/><g>${grid.join('')}</g><text class="origin-label" x="${layout.origin.x + 14}" y="${layout.origin.y + 28}">Prism · 43, 229</text>${lines}${current}${targetMarkup}${players}`;
  $('#lit-count').textContent = `${route.requiredConnected.length}/${route.requiredTotal} обяз. · ${route.optionalConnected.length}/${route.optionalTotal} желат.`;
  $('#player-count').textContent = String(route.positions.length);
  $('#accuracy').textContent = `${actualMinSlack} px`;
  $('#placement-list').innerHTML = route.positions.map((point, index) => {
    const character = characters[point.characterId];
    return `<div class="placement-step"><b>${index + 1}</b><span>${characterIcons.get(character?.name) ? `<img src="${characterIcons.get(character.name)}" alt="">` : ''}</span><strong>${escapeHtml(character?.name || `Персонаж ${index + 1}`)}</strong><code>x ${point.x} · y ${point.y}</code><small>ширина линии ${widths[point.characterId]} px</small></div>`;
  }).join('');
  $('#active-nodes').innerHTML = [
    ...layout.bonuses.map((entry) => ({ ...entry, type: 'bonus' })),
    ...layout.jewels.map((entry) => ({ ...entry, type: 'jewel' }))
  ].map((entry) => {
    const key = `${entry.type === 'bonus' ? 'b' : 'j'}${entry.id}`;
    const active = connectedKeys.has(key);
    const locked = entry.type === 'jewel' && !acquiredJewels.has(entry.id);
    const target = route.targets.find((item) => item.key === key);
    const nearest = target ? distToRoute(target) : Infinity;
    const slack = target ? Math.floor(target.reach - nearest) : -Infinity;
    const gap = Number.isFinite(slack) ? `${Math.max(0, -slack)} px` : '—';
    const mode = targetModes.get(key) || 'excluded';
    const detail = locked ? 'не открыт' : active ? `подключён · запас ${slack} px` : mode === 'excluded' ? 'исключён' : `не хватает ${gap}`;
    const icon = entry.type === 'bonus' ? `<img class="node-icon" loading="lazy" src="${ASSET_ROOT}/LabBonus${entry.id}.png" alt="" onerror="this.style.display='none'">` : '<span class="diamond" aria-hidden="true"></span>';
    const status = active ? `● ${slack} px` : (locked ? 'закрыт' : mode === 'excluded' ? 'искл.' : gap);
    return `<div class="node-line ${active ? 'lit' : ''}"><span class="node-id">${entry.type === 'bonus' ? 'B' : 'J'}${String(entry.id).padStart(2, '0')}</span><select class="target-mode ${mode}" data-target-mode="${key}" ${locked ? 'disabled' : ''} aria-label="Режим узла ${escapeHtml(entry.name)}"><option value="required" ${mode === 'required' ? 'selected' : ''}>Обяз.</option><option value="optional" ${mode === 'optional' ? 'selected' : ''}>Желат.</option><option value="excluded" ${mode === 'excluded' ? 'selected' : ''}>Исключить</option></select>${icon}<div><strong>${escapeHtml(entry.name)}</strong><small>${entry.x}, ${entry.y} px · ${detail}</small></div><span class="node-state">${status}</span></div>`;
  }).join('');
  $('#active-nodes').querySelectorAll('[data-target-mode]').forEach((select) => select.addEventListener('change', () => {
    targetModes.set(select.dataset.targetMode, select.value);
    calculateRoute();
  }));
}

$('#load-json').addEventListener('click', () => importSave($('#raw-json').value, 'raw JSON'));
$('#file').addEventListener('change', async (event) => { if (event.target.files?.[0]) $('#raw-json').value = await event.target.files[0].text(); });
$('#load-profile').addEventListener('click', async () => {
  const name = $('#username').value.trim();
  if (!name) return showStatus('Введите имя публичного профиля.', true);
  showStatus('Загружаю опубликованный профиль IdleOn Efficiency…');
  try {
    const response = await fetch(`https://cdn.idleonefficiency.com/profiles/${encodeURIComponent(name.toLowerCase())}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    importSave(await response.json(), `профиль ${name}`);
  } catch (error) { showStatus(`Профиль не загрузился: ${error.message}. Вставьте raw JSON из IdleOn Efficiency.`, true); }
});
$('#tab-raw').addEventListener('click', () => { $('#tab-raw').classList.add('selected'); $('#tab-name').classList.remove('selected'); $('#raw-panel').hidden = false; $('#name-panel').hidden = true; });
$('#tab-name').addEventListener('click', () => { $('#tab-name').classList.add('selected'); $('#tab-raw').classList.remove('selected'); $('#raw-panel').hidden = true; $('#name-panel').hidden = false; });
$('#add-character').addEventListener('click', () => { characters.push({ name: `Персонаж ${characters.length + 1}`, labLevel: 0, current: null, lineWidth: 50, imported: false }); renderCharacters(); calculateRoute(); });
$('#solve').addEventListener('click', calculateRoute);
$('#order').addEventListener('change', calculateRoute);
document.querySelectorAll('[data-recalc]').forEach((input) => input.addEventListener('input', calculateRoute));

if (!layout) showStatus('Встроенная карта Laboratory не загрузилась. Обновите страницу.', true);
else { renderCharacters(); renderJewels(); calculateRoute(); }
