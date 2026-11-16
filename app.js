const DATA_URL = './data/lab-layout.json';
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let layout;
let characters = [{ name: 'Персонаж 1', labLevel: 0, current: null, lineWidth: 50, imported: false }];
let acquiredJewels = new Set();
let route = null;
let statusTimer;

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
      imported: true
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
    renderCharacters();
    renderJewels();
    calculateRoute();
    const coords = characters.filter((character) => character.current).length;
    showStatus(`Загружено из ${source}: ${characters.length} персонажей, Lab-уровни, ${coords} текущих координат и ${acquiredJewels.size} открытых самоцветов.`);
  } catch (error) {
    showStatus(error.message, true);
  }
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
  $('#jewel-controls').innerHTML = layout.jewels.map((jewel) => `<label class="jewel-toggle">
    <input type="checkbox" data-jewel="${jewel.id}" ${acquiredJewels.has(jewel.id) ? 'checked' : ''}>
    <span>${escapeHtml(jewel.name)}</span></label>`).join('');
  $('#jewel-controls').querySelectorAll('[data-jewel]').forEach((input) => input.addEventListener('change', () => {
    const id = Number(input.dataset.jewel);
    if (input.checked) acquiredJewels.add(id); else acquiredJewels.delete(id);
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
  const range = (base, fixed = false) => fixed ? base : Math.floor(80 * (1 + (rangeMods.pct + pct) / 100) + rangeMods.px + px);
  const targets = layout.bonuses.map((entry) => ({ ...entry, type: 'bonus', key: `b${entry.id}`, baseRange: entry.baseRange || 80,
    reach: range(entry.baseRange || 80, entry.id === 8 || entry.id === 13) }));
  layout.jewels.filter((entry) => acquiredJewels.has(entry.id)).forEach((entry) => {
    const fixed = entry.id === 9 || entry.id === 19 || entry.id >= 21;
    const base = entry.id >= 21 ? 100 : 80;
    targets.push({ ...entry, type: 'jewel', key: `j${entry.id}`, baseRange: base, reach: range(base, fixed) });
  });
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

function searchRoute(targets, widths) {
  const sites = buildCandidates(targets);
  if (!widths.length || !sites.length) return { positions: [], targets, connected: [], score: 0 };
  const coverage = sites.map((site) => targets.reduce((mask, target, index) => gameDistance(site, target) < target.reach ? mask | (1n << BigInt(index)) : mask, 0n));
  const widthsAtSite = sites.map((site) => lineWidths(site));
  const ordered = $('#order').value === 'wide'
    ? widths.map((width, index) => ({ width, index })).sort((a, b) => b.width - a.width).map((entry) => entry.index)
    : widths.map((_, index) => index);
  const beamLimit = 72;
  const getWidth = (characterId, siteId) => widthsAtSite[siteId][characterId];
  let beam = [];
  for (let siteId = 0; siteId < sites.length; siteId++) {
    const charId = ordered[0];
    if (gameDistance(layout.origin, sites[siteId]) < getWidth(charId, siteId)) beam.push({ positions: [siteId], charIds: [charId], mask: coverage[siteId] });
  }
  beam.sort((a, b) => countBits(b.mask) - countBits(a.mask));
  beam = beam.slice(0, beamLimit);
  for (let step = 1; step < ordered.length && beam.length; step++) {
    const charId = ordered[step];
    const next = [];
    for (const state of beam) for (let siteId = 0; siteId < sites.length; siteId++) {
      const width = getWidth(charId, siteId);
      let linked = false;
      for (const previousId of state.positions) if (gameDistance(sites[previousId], sites[siteId]) < width) { linked = true; break; }
      if (linked) next.push({ positions: [...state.positions, siteId], charIds: [...state.charIds, charId], mask: state.mask | coverage[siteId] });
    }
    next.sort((a, b) => countBits(b.mask) - countBits(a.mask));
    const diverse = [], seen = new Set();
    for (const state of next) {
      const key = `${state.mask.toString(16)}:${state.positions[state.positions.length - 1]}`;
      if (seen.has(key)) continue;
      seen.add(key); diverse.push(state);
      if (diverse.length >= beamLimit) break;
    }
    beam = diverse;
  }
  const best = beam.reduce((a, b) => !a || countBits(b.mask) > countBits(a.mask) ? b : a, null);
  if (!best) return { positions: [], targets, connected: [], score: 0 };
  const connected = targets.filter((_, index) => Boolean(best.mask & (1n << BigInt(index))));
  return { positions: best.positions.map((siteId, index) => ({ ...sites[siteId], characterId: best.charIds[index] })), targets, connected, score: countBits(best.mask) };
}

function calculateRoute() {
  const widths = lineWidths();
  let modifiers = { pct: 0, px: 0 }, result;
  for (let iteration = 0; iteration < 4; iteration++) {
    const targets = targetRanges(modifiers);
    result = searchRoute(targets, widths);
    const hasViral = result.connected.some((target) => target.type === 'bonus' && target.id === 13);
    const hasPyrite = result.connected.some((target) => target.type === 'jewel' && target.id === 9);
    const hasSpelunker = result.connected.some((target) => target.type === 'bonus' && target.id === 8);
    const next = { pct: (hasViral ? 50 : 0) + (hasPyrite ? 30 * (hasSpelunker ? 1.5 : 1) : 0), px: 0 };
    if (next.pct === modifiers.pct) break;
    modifiers = next;
  }
  route = result;
  drawRoute(widths);
}

function drawRoute(widths) {
  const svg = $('#map');
  if (!route) return;
  const connectedKeys = new Set(route.connected.map((target) => target.key));
  const targetSvg = (entry, type) => {
    const active = connectedKeys.has(`${type === 'bonus' ? 'b' : 'j'}${entry.id}`);
    const radius = type === 'bonus' ? 11 : 7;
    const color = active ? '#c6f36b' : (type === 'bonus' ? '#506274' : '#567b99');
    const label = `${type === 'bonus' ? 'B' : 'J'}${entry.id}`;
    return `<g class="target ${type} ${active ? 'active' : ''}" transform="translate(${entry.x},${entry.y})"><title>${escapeHtml(entry.name)}${type === 'jewel' && !acquiredJewels.has(entry.id) ? ' · не открыт' : ''} · ${entry.x}, ${entry.y}</title><circle r="${radius}" fill="${color}"/><text y="3" text-anchor="middle">${label}</text></g>`;
  };
  const targetMarkup = layout.jewels.map((entry) => targetSvg(entry, 'jewel')).join('') + layout.bonuses.map((entry) => targetSvg(entry, 'bonus')).join('');
  let lines = `<line class="link" x1="${layout.origin.x}" y1="${layout.origin.y}" x2="${route.positions[0]?.x ?? layout.origin.x}" y2="${route.positions[0]?.y ?? layout.origin.y}"/>`;
  for (let i = 1; i < route.positions.length; i++) {
    const point = route.positions[i];
    let parent = route.positions[0], closest = Infinity;
    for (let j = 0; j < i; j++) { const distance = gameDistance(point, route.positions[j]); if (distance < closest) { closest = distance; parent = route.positions[j]; } }
    lines += `<line class="link" x1="${parent.x}" y1="${parent.y}" x2="${point.x}" y2="${point.y}"/>`;
  }
  const players = route.positions.map((point, index) => `<g class="player" transform="translate(${point.x},${point.y})"><title>${escapeHtml(characters[point.characterId]?.name || `Персонаж ${index + 1}`)} · ширина ${widths[point.characterId]} px</title><circle r="8"/><text y="3" text-anchor="middle">${index + 1}</text></g>`).join('');
  svg.innerHTML = `<text class="origin-label" x="${layout.origin.x + 10}" y="${layout.origin.y + 17}">Prism · 43, 229</text>${lines}${targetMarkup}${players}`;
  $('#lit-count').textContent = `${route.score} / ${route.targets.length}`;
  $('#player-count').textContent = String(route.positions.length);
  $('#active-nodes').innerHTML = [
    ...layout.bonuses.map((entry) => ({ ...entry, type: 'bonus' })),
    ...layout.jewels.map((entry) => ({ ...entry, type: 'jewel' }))
  ].map((entry) => {
    const active = connectedKeys.has(`${entry.type === 'bonus' ? 'b' : 'j'}${entry.id}`);
    const locked = entry.type === 'jewel' && !acquiredJewels.has(entry.id);
    return `<div class="node-line ${active ? 'lit' : ''}"><span class="node-id">${entry.type === 'bonus' ? 'B' : 'J'}${String(entry.id).padStart(2, '0')}</span><div><strong>${escapeHtml(entry.name)}</strong><small>${entry.x}, ${entry.y} px · ${locked ? 'не открыт' : active ? 'подключён' : 'вне охвата'}</small></div><span class="node-state">${active ? '●' : '○'}</span></div>`;
  }).join('');
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

fetch(DATA_URL).then((response) => { if (!response.ok) throw new Error('Не получилось загрузить карту Laboratory.'); return response.json(); })
  .then((data) => { layout = data; renderCharacters(); renderJewels(); calculateRoute(); })
  .catch((error) => showStatus(error.message, true));
