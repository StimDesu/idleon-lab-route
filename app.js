const ASSET_ROOT = 'assets/idleon';
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const layout = window.IDLEON_LAB_LAYOUT;
let characters = [{ name: 'Персонаж 1', labLevel: 0, current: null, lineWidth: 50, imported: false }];
let acquiredJewels = new Set();
let importedLineCardBonus = 0;
let importedNodeRangeFlat = 0;
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
  const gemShop = getArray(save.GemItemsPurchased);
  const tubeBonusSlots = Math.max(0, Number(gemShop[123]) || 0) * 2;
  const cards = save.Cards0 && typeof save.Cards0 === 'object' ? save.Cards0 : getArray(save.Cards0);
  const lineCardBonus = Math.min(2 * (Number(cards?.Crystal3) || 0), 50);
  const taskLevels = getArray(save.TaskZZ2);
  const dream = getArray(save.Dream);
  const summon = getArray(save.Summon);
  const winRangeSummons = new Set(['slimeG', 'frogBIG', 'steak', 'ram', 'w5a4', 'w6b4', 'Pet10']);
  const winRangeCount = getArray(summon[1]).filter((name) => winRangeSummons.has(name)).length;
  const nodeRangeFlat = Math.max(0, Number(taskLevels[3]?.[4]) || 0) + (Number(dream[8]) || 0) + 3.5 * 0.3 * winRangeCount;
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
      current: Number.isFinite(x) && Number.isFinite(y) && !(x === 0 && y === 0) ? { x, y } : null,
      lineWidth: Math.floor((50 + 2 * labLevel) * (i < tubeBonusSlots ? 1.3 : 1)),
      tubeBonus: i < tubeBonusSlots ? 30 : 0,
      lineWidthManual: false,
      imported: true,
      classId: Number(save[`CharacterClass_${i}`]) || 0,
      equipment: getArray(save[`EquipOrder_${i}`])
    });
  }
  if (!found.length) throw new Error('Не найдены массивы персонажей Lv0_0, Lv0_1… в этом JSON.');
  return { characters: found, jewelFlags, lineCardBonus, nodeRangeFlat };
}

function importSave(value, source) {
  try {
    const parsed = parseSave(value);
    characters = parsed.characters;
    importedLineCardBonus = parsed.lineCardBonus;
    importedNodeRangeFlat = parsed.nodeRangeFlat;
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
  try {
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
  } catch {
    // Local file:// pages may refuse pixel reads from canvas. drawRoute has a
    // direct-SVG fallback that uses these same local sprites without canvas.
    return null;
  }
}

function fallbackCharacterMarkup(character, { slot = 0, placement = false } = {}) {
  const hue = HEAD_HUES.find(([max]) => character.classId < max)?.[1] ?? 90;
  const matrix = HEAD_COLORS[hue].join(' ');
  const filterId = `head-tint-${hue}-${slot}-${placement ? 'map' : 'card'}`;
  const worn = character.equipment?.[0] || {};
  const premium = worn[8];
  const helmet = premium && premium !== 'Blank' && premium !== 'EquipmentHats38' ? premium : worn[0];
  const hatId = typeof HAT_IDS !== 'undefined' ? HAT_IDS[helmet] : undefined;
  let hat = '';
  if (Number.isFinite(hatId)) {
    const frame = hatId + 2, col = frame % 14, row = Math.floor(frame / 14);
    hat = `<svg x="0" y="-8" width="60" height="100" viewBox="${col * 30} ${row * 50} 30 50" preserveAspectRatio="none"><image href="assets/hats_board.png" x="0" y="0" width="420" height="650" preserveAspectRatio="none"/></svg>`;
  }
  const position = placement ? 'x="-25" y="-42" ' : '';
  return `<svg class="fallback-character" ${position}width="50" height="50" viewBox="0 0 65 65" preserveAspectRatio="none"><defs><filter id="${filterId}"><feColorMatrix type="matrix" values="${matrix}"/></filter></defs><image href="assets/head.png" x="22" y="28" width="22" height="22" filter="url(#${filterId})"/>${hat}</svg>`;
}

function renderCharacters() {
  $('#characters').innerHTML = characters.map((character, index) => {
    const pos = character.current ? `${Math.round(character.current.x)}, ${Math.round(character.current.y)}` : 'ещё не в Mainframe';
    return `<div class="char-row">
      <div class="char-name"><strong>${escapeHtml(character.name)}</strong><small>${character.imported ? `из raw JSON${character.tubeBonus ? ` · труба +${character.tubeBonus}%` : ''}` : 'параметры для примера'}</small></div>
      <label>Уровень Lab<input data-character="${index}" data-key="labLevel" type="number" min="0" value="${character.labLevel}"></label>
      <label title="Предсказанная ширина по формулам игры. Введите фактическую цифру из окна Lab, чтобы задать точное значение.">Ширина линии<input data-character="${index}" data-key="lineWidth" type="number" min="0" value="${lineWidths(character.current)[index]}"></label>
      <div class="current-pos"><small>Сейчас</small><span>${pos}</span></div>
      <button class="remove" data-remove="${index}" aria-label="Удалить ${escapeHtml(character.name)}">×</button>
    </div>`;
  }).join('');
  $('#characters').querySelectorAll('input').forEach((input) => input.addEventListener('input', () => {
    const character = characters[Number(input.dataset.character)];
    if (input.dataset.key === 'lineWidth') character.lineWidthManual = true;
    character[input.dataset.key] = Number(input.value) || 0;
    if (input.dataset.key === 'labLevel' && character.imported) {
      character.lineWidth = Math.floor((50 + 2 * character.labLevel) * (1 + (character.tubeBonus || 0) / 100));
      character.lineWidthManual = false;
      const widthInput = $('#characters').querySelector(`[data-character="${input.dataset.character}"][data-key="lineWidth"]`);
      if (widthInput) widthInput.value = lineWidths(character.current)[Number(input.dataset.character)];
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

function refreshAutoLineWidths() {
  characters.forEach((character, index) => {
    if (character.lineWidthManual) return;
    const input = $('#characters').querySelector(`[data-character="${index}"][data-key="lineWidth"]`);
    if (input) input.value = lineWidths(character.current)[index];
  });
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

function gameRangePolygon(center, radius) {
  const axis = radius / 0.9604339;
  const diagonal = radius / (0.9604339 + 0.397824735);
  return [
    { x: center.x + axis, y: center.y }, { x: center.x + diagonal, y: center.y + diagonal },
    { x: center.x, y: center.y + axis }, { x: center.x - diagonal, y: center.y + diagonal },
    { x: center.x - axis, y: center.y }, { x: center.x - diagonal, y: center.y - diagonal },
    { x: center.x, y: center.y - axis }, { x: center.x + diagonal, y: center.y - diagonal }
  ];
}

function placementBlockers() {
  // The game draws each bonus tile from x/y - 38 with a second frame shifted
  // by +6 px; unlocked jewels are 68×68 and only exist when owned. A 2 px
  // clearance keeps clicks off the edge of the game's image hit area.
  const clearance = 2;
  return [
    ...layout.bonuses.map((node) => ({ key: `b${node.id}`, left: node.x - 38 - clearance, right: node.x + 38 + 6 + clearance, top: node.y - 38 - clearance, bottom: node.y + 38 + 6 + clearance })),
    ...layout.jewels.filter((node) => acquiredJewels.has(node.id)).map((node) => ({ key: `j${node.id}`, left: node.x - 34 - clearance, right: node.x + 34 + clearance, top: node.y - 34 - clearance, bottom: node.y + 34 + clearance }))
  ];
}

function isBlockedPlacement(point, blockers = placementBlockers()) {
  return blockers.some((box) => point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom);
}

function characterEdgeDistance(parent, child, childLineWidth) {
  // ActorEvents_548 connects an already-linked player to a new one by testing
  // the candidate/new player's own Dist(Player) value, not the parent's width.
  return childLineWidth - gameDistance(parent, child);
}

function lineWidths(site = null) {
  const flat = (Number($('#linePx').value) || 0) + importedLineCardBonus;
  const percent = Number($('#linePct').value) || 0;
  const sapphire = layout.jewels[5];
  return characters.map((character) => {
    if (character.lineWidthManual) {
      let exact = Math.max(0, Number(character.lineWidth) || 0);
      if (acquiredJewels.has(5) && site) {
        const wasNear = character.current && gameDistance(character.current, sapphire) < 150;
        const willBeNear = gameDistance(site, sapphire) < 150;
        if (!wasNear && willBeNear) exact *= 1.25;
        if (wasNear && !willBeNear) exact /= 1.25;
      }
      return Math.floor(exact);
    }
    let base = 50 + 2 * (Number(character.labLevel) || 0);
    if (acquiredJewels.has(5) && site && gameDistance(site, sapphire) < 150) base *= 1.25;
    return Math.max(0, Math.floor((base + flat) * (1 + (percent + (character.tubeBonus || 0)) / 100)));
  });
}

function targetRanges(rangeMods) {
  const px = Number($('#rangePx').value) || 0;
  const pct = Number($('#rangePct').value) || 0;
  // Node activation uses Lab Dist Bonus/Gem from the game, independently of
  // character line width. Both are measured with DistanceEqn, but node radii
  // start at 80 (or 100 for the last three jewels) and include Lab range buffs.
  const range = (base, fixed = false) => fixed ? base : Math.floor(80 * (1 + (rangeMods.pct + pct) / 100) + rangeMods.px + importedNodeRangeFlat + px);
  const targets = layout.bonuses.map((entry) => ({ ...entry, type: 'bonus', key: `b${entry.id}`, eligible: true,
    mode: targetModes.get(`b${entry.id}`) || 'excluded', reach: range(entry.baseRange || 80, entry.id === 8 || entry.id === 13) }));
  layout.jewels.forEach((entry) => {
    const fixed = entry.id === 9 || entry.id === 19 || entry.id >= 21;
    const base = entry.id >= 21 ? 100 : 80;
    targets.push({ ...entry, type: 'jewel', key: `j${entry.id}`, eligible: acquiredJewels.has(entry.id),
      mode: targetModes.get(`j${entry.id}`) || 'excluded', reach: range(base, fixed) });
  });
  targets.forEach((target) => { target.safeReach = target.reach; });
  return targets;
}

function countBits(mask) {
  let count = 0;
  while (mask) { mask &= mask - 1n; count++; }
  return count;
}

function buildCandidates(targets) {
  const eligibleTargets = targets.filter((target) => target.eligible);
  const connectableTargets = eligibleTargets.filter((target) => target.mode !== 'excluded');
  const points = [...eligibleTargets, layout.origin, ...characters.map((character) => character.current).filter(Boolean)];
  const blockers = placementBlockers();
  const obstaclePolygons = blockers.map((box) => [
    { x: box.left, y: box.top }, { x: box.right, y: box.top },
    { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom }
  ]);
  const candidates = new Map();
  const add = (x, y) => {
    const point = { x: Math.round(x), y: Math.round(y) };
    if (point.x < 0 || point.x > 2110 || point.y < 0 || point.y > 470) return;
    if (isBlockedPlacement(point, blockers)) return;
    const key = `${point.x},${point.y}`;
    if (!candidates.has(key)) candidates.set(key, { ...point, key });
  };
  points.forEach((point) => add(point.x, point.y));
  // A node's capture boundary uses the game's distance metric. In screen space
  // that boundary is an octagon, not a Euclidean circle, so intersect its
  // actual metric polygons to get useful positions between adjacent nodes.
  const polygons = connectableTargets.map((target) => gameRangePolygon(target, Math.max(0, target.safeReach - 1)));
  const segmentIntersection = (a, b, c, d) => {
    const abx = b.x - a.x, aby = b.y - a.y, cdx = d.x - c.x, cdy = d.y - c.y;
    const denominator = abx * cdy - aby * cdx;
    if (Math.abs(denominator) < 1e-9) return null;
    const t = ((c.x - a.x) * cdy - (c.y - a.y) * cdx) / denominator;
    const u = ((c.x - a.x) * aby - (c.y - a.y) * abx) / denominator;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * abx, y: a.y + t * aby } : null;
  };
  const addIntersections = (leftPoly, rightPoly) => {
    for (let a = 0; a < leftPoly.length; a++) for (let b = 0; b < rightPoly.length; b++) {
      const crossing = segmentIntersection(leftPoly[a], leftPoly[(a + 1) % leftPoly.length], rightPoly[b], rightPoly[(b + 1) % rightPoly.length]);
      if (crossing) add(crossing.x, crossing.y);
    }
  };
  for (const poly of obstaclePolygons) {
    const xs = poly.map((point) => point.x), ys = poly.map((point) => point.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    add(left, top); add((left + right) / 2, top); add(right, top);
    add(right, (top + bottom) / 2); add(right, bottom); add((left + right) / 2, bottom);
    add(left, bottom); add(left, (top + bottom) / 2);
  }
  for (const captureArea of polygons) for (const obstacle of obstaclePolygons) addIntersections(captureArea, obstacle);
  for (let i = 0; i < polygons.length; i++) for (let j = i + 1; j < polygons.length; j++) {
    const left = connectableTargets[i], right = connectableTargets[j];
    const centerDistance = gameDistance(left, right);
    if (centerDistance > left.safeReach + right.safeReach || centerDistance < Math.abs(left.safeReach - right.safeReach)) continue;
    addIntersections(polygons[i], polygons[j]);
  }
  // Also generate the critical positions where a character's connection
  // boundary intersects a node's capture boundary. Without these, a node may
  // be reachable from the Prism even when its center is just outside line
  // range, but the candidate set would incorrectly contain no valid first step.
  const anchors = [...candidates.values()];
  for (const anchor of anchors) {
    const siteWidths = lineWidths(anchor);
    for (const rawWidth of new Set(siteWidths)) {
      const reach = Math.floor(rawWidth) - 1;
      if (reach <= 0) continue;
      const connector = gameRangePolygon(anchor, reach);
      for (const obstacle of obstaclePolygons) addIntersections(connector, obstacle);
      for (let i = 0; i < polygons.length; i++) {
        const target = connectableTargets[i];
        const centerDistance = gameDistance(anchor, target);
        if (centerDistance > reach + target.safeReach || centerDistance < Math.abs(reach - target.safeReach)) continue;
        addIntersections(connector, polygons[i]);
      }
    }
  }
  return [...candidates.values()];
}

async function searchRoute(targets, widths, deadline, onProgress) {
  const sites = buildCandidates(targets);
  if (!widths.length || !sites.length) {
    const validation = validateRoute([], targets);
    const requiredTotal = targets.filter((target) => target.eligible && target.mode === 'required').length;
    const optionalTotal = targets.filter((target) => target.eligible && target.mode === 'optional').length;
    return { positions: [], targets, connected: [], links: [], validation, requiredTotal, optionalTotal, requiredConnected: [], optionalConnected: [], excludedConnected: 0, complete: requiredTotal === 0 };
  }
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
  const accountOrder = widths.map((_, index) => index);
  const ordered = mode === 'wide' && accountOrder.length > 1
    ? [accountOrder[0], ...accountOrder.slice(1).sort((a, b) => widths[b] - widths[a])]
    : accountOrder;
  const optimizingOrder = mode === 'optimal';
  const timeBudgetSeconds = Math.min(120, Math.max(1, Number($('#solve-time').value) || 12));
  const beamLimit = optimizingOrder ? Math.min(128, 48 + Math.round(timeBudgetSeconds * 4)) : 56;
  const getWidth = (characterId, siteId) => widthsAtSite[siteId][characterId];
  const futureMasks = sites.map((site, siteId) => widths.map((_, charId) => {
    const reach = getWidth(charId, siteId);
    return targets.reduce((mask, target, index) => {
      if (!target.eligible || target.mode === 'excluded' || gameDistance(site, target) >= reach + target.safeReach) return mask;
      return mask | (1n << BigInt(index));
    }, 0n);
  }));
  const requiredTotal = targets.filter((target) => target.eligible && target.mode === 'required').length;
  const optionalTotal = targets.filter((target) => target.eligible && target.mode === 'optional').length;
  const frontierCount = (state) => countBits(state.futureMask & ~state.activeMask);
  const compare = (a, b) => countBits(b.requiredMask) - countBits(a.requiredMask) || countBits(a.excludedMask) - countBits(b.excludedMask) || countBits(b.optionalMask) - countBits(a.optionalMask) || countBits(b.activeMask) - countBits(a.activeMask) || frontierCount(b) - frontierCount(a) || (a.minSpacing === b.minSpacing ? 0 : b.minSpacing - a.minSpacing) || b.margin - a.margin;
  const maxMapSpacing = Math.hypot(2110, 470);
  let beam = [], best = { positions: [], charIds: [], activeMask: 0n, futureMask: 0n, requiredMask: 0n, optionalMask: 0n, excludedMask: 0n, margin: 0, minSpacing: maxMapSpacing };
  const playerIds = accountOrder;
  // The game seeds from whichever roster member reaches the Prism first. In
  // optimal mode any character can be that seed; locking it to account slot 1
  // can discard the widest line (often Bubo) and sharply limit the whole route.
  const firstCandidates = optimizingOrder ? playerIds : (playerIds.length ? [playerIds[0]] : []);
  for (const charId of firstCandidates) for (let siteId = 0; siteId < sites.length; siteId++) {
    const reach = getWidth(charId, siteId);
    const distance = gameDistance(layout.origin, sites[siteId]);
    if (reach > 0 && distance < reach) beam.push({ positions: [siteId], charIds: [charId], parentIds: [-1], usedMask: 1n << BigInt(charId), activeMask: coverage[siteId].active,
      futureMask: futureMasks[siteId][charId], requiredMask: coverage[siteId].required, optionalMask: coverage[siteId].optional, excludedMask: coverage[siteId].excluded, margin: reach - distance, minSpacing: maxMapSpacing });
  }
  beam.sort(compare); beam = beam.slice(0, beamLimit);
  if (beam[0] && compare(beam[0], best) < 0) best = beam[0];
  onProgress(5, `Подготовлено ${sites.length} точек-кандидатов · ищем порядок персонажей`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let step = 1; step < playerIds.length && beam.length && performance.now() < deadline; step++) {
    const next = [];
    for (const state of beam) {
      const nextChars = optimizingOrder ? playerIds.filter((index) => !(state.usedMask & (1n << BigInt(index)))) : [ordered[step]];
      for (const charId of nextChars) for (let siteId = 0; siteId < sites.length; siteId++) {
        if (performance.now() >= deadline) break;
        const reach = getWidth(charId, siteId);
        if (reach <= 0) continue;
        const rootCharacterId = state.charIds[0];
        if (optimizingOrder && charId < rootCharacterId && gameDistance(layout.origin, sites[siteId]) < getWidth(charId, siteId)) continue;
        if (state.positions.includes(siteId)) continue;
        let bestParent = -1, bestGap = -Infinity;
        for (let parentId = 0; parentId < state.positions.length; parentId++) {
          const parentSiteId = state.positions[parentId];
          const slack = characterEdgeDistance(sites[parentSiteId], sites[siteId], reach);
          if (slack > 0 && slack > bestGap) { bestParent = parentId; bestGap = slack; }
        }
        if (bestParent < 0) continue;
        const usedMask = state.usedMask | (1n << BigInt(charId));
        const nearestSpacing = Math.min(...state.positions.map((placedSiteId) => Math.hypot(sites[placedSiteId].x - sites[siteId].x, sites[placedSiteId].y - sites[siteId].y)));
        next.push({ positions: [...state.positions, siteId], charIds: [...state.charIds, charId], parentIds: [...state.parentIds, bestParent], usedMask,
          futureMask: state.futureMask | futureMasks[siteId][charId],
          activeMask: state.activeMask | coverage[siteId].active, requiredMask: state.requiredMask | coverage[siteId].required,
          optionalMask: state.optionalMask | coverage[siteId].optional, excludedMask: state.excludedMask | coverage[siteId].excluded, minSpacing: Math.min(state.minSpacing, nearestSpacing),
          margin: state.margin + bestGap });
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
    onProgress(Math.min(96, Math.round((step / Math.max(1, playerIds.length - 1)) * 96)), `Проверено ${step + 1} из ${playerIds.length} персонажей · ${sites.length} точек-кандидатов`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  // Complete any search cut short by the time limit with a fast greedy pass.
  // This always places every available character and lets late characters add
  // targets instead of merely stacking them at the anchor.
  const placed = new Set(best.charIds);
  while (placed.size < playerIds.length && best.positions.length) {
    let choice = null;
    for (const charId of playerIds) {
      if (placed.has(charId)) continue;
      for (let siteId = 0; siteId < sites.length; siteId++) {
        const reach = getWidth(charId, siteId);
        if (reach <= 0) continue;
        if ($('#order').value === 'optimal' && charId < best.charIds[0] && gameDistance(layout.origin, sites[siteId]) < reach) continue;
        if (best.positions.includes(siteId)) continue;
        let parentId = -1, parentSlack = -Infinity;
        for (let index = 0; index < best.positions.length; index++) {
          const parentSiteId = best.positions[index];
          const slack = characterEdgeDistance(sites[parentSiteId], sites[siteId], reach);
          if (slack > parentSlack) { parentId = index; parentSlack = slack; }
        }
        if (parentSlack <= 0) continue;
        const candidate = {
          positions: [...best.positions, siteId], charIds: [...best.charIds, charId], parentIds: [...best.parentIds, parentId],
          futureMask: (best.futureMask || 0n) | futureMasks[siteId][charId],
          usedMask: best.usedMask | (1n << BigInt(charId)), activeMask: best.activeMask | coverage[siteId].active,
          requiredMask: best.requiredMask | coverage[siteId].required, optionalMask: best.optionalMask | coverage[siteId].optional,
          excludedMask: best.excludedMask | coverage[siteId].excluded,
          minSpacing: Math.min(best.minSpacing, ...best.positions.map((placedSiteId) => Math.hypot(sites[placedSiteId].x - sites[siteId].x, sites[placedSiteId].y - sites[siteId].y))),
          margin: best.margin + parentSlack
        };
        if (!choice || compare(candidate, choice) < 0) choice = candidate;
      }
    }
    if (!choice) break;
    best = choice; placed.add(best.charIds.at(-1));
  }
  const positions = best.positions.map((siteId, index) => ({ ...sites[siteId], characterId: best.charIds[index], parentId: best.parentIds[index] }));
  const validation = validateRoute(positions, targets);
  const connected = validation.connected;
  const requiredConnected = connected.filter((target) => target.mode === 'required');
  const optionalConnected = connected.filter((target) => target.mode === 'optional');
  const excludedConnected = connected.filter((target) => target.mode === 'excluded').length;
  return { positions, targets, connected, links: validation.links, validation,
    requiredTotal, optionalTotal, requiredConnected, optionalConnected, excludedConnected, complete: requiredConnected.length === requiredTotal };
}

function validateRoute(positions, targets) {
  const errors = [], links = [], blockers = placementBlockers(), usedCharacters = new Set(), seenPositions = new Set();
  if (!positions.length && characters.length) errors.push('Не найдено ни одной допустимой позиции для связи с Призмой.');
  positions.forEach((point, index) => {
    const key = `${point.x},${point.y}`;
    if (point.x < 0 || point.x > 2110 || point.y < 0 || point.y > 470) errors.push(`Персонаж ${point.characterId + 1}: точка вне Mainframe.`);
    if (isBlockedPlacement(point, blockers)) errors.push(`Персонаж ${point.characterId + 1}: точка перекрыта квадратной нодой.`);
    if (seenPositions.has(key)) errors.push(`Персонажи стоят в одной точке (${key}).`);
    seenPositions.add(key);
    if (usedCharacters.has(point.characterId)) errors.push(`Персонаж ${point.characterId + 1} добавлен в цепь больше одного раза.`);
    usedCharacters.add(point.characterId);
    const childWidth = lineWidths(point)[point.characterId] || 0;
    if (index > 0 && point.characterId < positions[0].characterId && gameDistance(layout.origin, point) < childWidth) {
      errors.push(`Слот ${point.characterId + 1} должен сработать раньше выбранного старта от Призмы.`);
    }
    if (index === 0) {
      const slack = characterEdgeDistance(layout.origin, point, childWidth);
      if (slack <= 0) errors.push(`Персонаж ${point.characterId + 1} не достигает Призму.`);
      else links.push({ fromIndex: -1, toIndex: index, slack });
      return;
    }
    const incoming = [];
    for (let parentIndex = 0; parentIndex < index; parentIndex++) {
      const slack = characterEdgeDistance(positions[parentIndex], point, childWidth);
      if (slack > 0) { incoming.push(parentIndex); links.push({ fromIndex: parentIndex, toIndex: index, slack }); }
    }
    if (!incoming.length) errors.push(`Персонаж ${point.characterId + 1} не связан с предыдущей частью цепи.`);
    else if (!incoming.includes(point.parentId)) errors.push(`Указанный родитель персонажа ${point.characterId + 1} не образует связь.`);
  });
  const connected = targets.filter((target) => target.eligible && positions.some((point) => gameDistance(point, target) < target.reach));
  return { valid: errors.length === 0, errors, links, connected, connectedPlayers: usedCharacters.size };
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
      result = await searchRoute(targets, widths, deadline, (_value, message) => {
        const elapsed = (performance.now() - started) / 1000;
        $('#progress').value = Math.min(95, Math.round((elapsed / timeLimit) * 95));
        $('#progress-message').textContent = `${message} · ${elapsed.toFixed(1)} / ${timeLimit.toFixed(0)} с`;
      });
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
    const check = route.validation.valid
      ? `Проверка связей пройдена: ${route.validation.connectedPlayers}/${characters.length} персонажей, ${route.links.length} связей.`
      : `Проверка не пройдена: ${route.validation.errors.join(' ')}`;
    $('#progress-message').textContent = `Поиск завершён за ${seconds} с. Обязательные: ${route.requiredConnected.length}/${route.requiredTotal}; желательные: ${route.optionalConnected.length}/${route.optionalTotal}; исключённых подключено: ${route.excludedConnected}. ${check}`;
    showStatus($('#progress-message').textContent, !route.complete || !route.validation.valid);
  } finally {
    solving = false; $('#solve').disabled = false; $('#solve').textContent = 'Рассчитать маршрут';
    if (rerunRequested) { rerunRequested = false; setTimeout(calculateRoute, 0); }
  }
}

function drawRoute(widths) {
  const svg = $('#map');
  if (!route) return;
  const connectedKeys = new Set(route.connected.map((target) => target.key));
  const distToRoute = (target) => route.positions.reduce((best, point) => Math.min(best, gameDistance(point, target)), Infinity);
  const margins = route.connected.map((target) => target.reach - distToRoute(target));
  route.links.forEach((link) => margins.push(link.slack));
  const actualMinSlack = margins.length ? Math.floor(Math.min(...margins)) : 0;
  const rangePolygons = route.targets.filter((target) => target.eligible && target.mode !== 'excluded').map((target) => {
    const points = [];
    gameRangePolygon(target, Math.max(0, target.reach - 1)).forEach((point) => points.push(`${Math.round(point.x)},${Math.round(point.y)}`));
    return `<polygon class="node-range ${target.mode} ${connectedKeys.has(target.key) ? 'active' : ''}" points="${points.join(' ')}"><title>Зона ноды ${escapeHtml(target.name)} · радиус ${target.reach} px</title></polygon>`;
  }).join('');
  const targetSvg = (entry, type) => {
    const active = connectedKeys.has(`${type === 'bonus' ? 'b' : 'j'}${entry.id}`);
    const locked = type === 'jewel' && !acquiredJewels.has(entry.id);
    const label = `${type === 'bonus' ? 'B' : 'J'}${entry.id}`;
    const size = type === 'bonus' ? 82 : 68;
    const half = size / 2;
    const icon = type === 'bonus'
      ? `<image class="target-icon" href="${ASSET_ROOT}/LabBonus${entry.id}.png" x="-28" y="-28" width="56" height="56" preserveAspectRatio="xMidYMid meet"/>`
      : `<path d="M0-22 17-8 12 15 0 24-12 15-17-8Z" fill="${locked ? '#445263' : '#77cbe0'}" stroke="${active ? '#d4ff84' : '#c3e6ef'}" stroke-width="3"/>`;
    const opacity = locked ? '.38' : '1';
    const rect = `<rect x="${type === 'bonus' ? -38 : -half}" y="${type === 'bonus' ? -38 : -half}" width="${size}" height="${size}" rx="1" fill="${active ? '#253b2b' : '#172735'}" stroke="${active ? '#c6f36b' : '#8298a8'}" stroke-width="2"/>`;
    const labelY = entry.y + half + 13 <= 466 ? half + 13 : -half - 4;
    return `<g class="target ${type} ${active ? 'active' : ''}" transform="translate(${entry.x},${entry.y})" opacity="${opacity}"><title>${escapeHtml(entry.name)}${locked ? ' · не открыт' : ''} · зона установки ${size}×${size} · ${entry.x}, ${entry.y}</title>${rect}${icon}<text y="${labelY}" text-anchor="middle">${label}</text></g>`;
  };
  const targetMarkup = layout.jewels.map((entry) => targetSvg(entry, 'jewel')).join('') + layout.bonuses.map((entry) => targetSvg(entry, 'bonus')).join('');
  const lines = route.links.map((link) => {
    const from = link.fromIndex < 0 ? layout.origin : route.positions[link.fromIndex];
    const to = route.positions[link.toIndex];
    return `<line class="link" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"><title>Связь ${link.fromIndex < 0 ? 'Призма' : `персонаж ${route.positions[link.fromIndex].characterId + 1}`} → персонаж ${to.characterId + 1} · запас ${Math.floor(link.slack)} px</title></line>`;
  }).join('');
  const players = route.positions.map((point, index) => {
    const character = characters[point.characterId];
    const icon = characterIcons.get(character?.name);
    const actualWidth = lineWidths(point)[point.characterId];
    const rosterNumber = point.characterId + 1;
    return `<g class="player" transform="translate(${point.x},${point.y})"><title>${escapeHtml(character?.name || `Персонаж ${rosterNumber}`)} · слот сохранения ${rosterNumber} · шаг маршрута ${index + 1} · линия ${actualWidth} px · координаты ${point.x}, ${point.y}</title><path class="player-crosshair" d="M-7 0H7M0-7V7"/>${icon ? `<image href="${icon}" x="-25" y="-42" width="50" height="50" preserveAspectRatio="xMidYMid meet"/>` : fallbackCharacterMarkup(character, { slot: point.characterId, placement: true })}<circle class="player-order" cy="19" r="9"/><text class="player-number" y="22" text-anchor="middle">${rosterNumber}</text></g>`;
  }).join('');
  const grid = [];
  const axes = [];
  for (let x = 0; x <= 2100; x += 100) { grid.push(`<line class="map-grid" x1="${x}" y1="0" x2="${x}" y2="470"/>`); axes.push(`<text class="axis-label" x="${x + 3}" y="94">${x}</text>`); }
  for (let y = 0; y <= 450; y += 50) { grid.push(`<line class="map-grid" x1="0" y1="${y}" x2="2110" y2="${y}"/>`); if (y % 100 === 0) axes.push(`<text class="axis-label" x="4" y="${y - 3}">${y}</text>`); }
  const current = characters.map((character, index) => character.current ? `<g class="current-player" transform="translate(${character.current.x},${character.current.y})"><title>Сейчас · слот сохранения ${index + 1}: ${escapeHtml(character.name)} · ${Math.round(character.current.x)}, ${Math.round(character.current.y)}</title>${characterIcons.get(character.name) ? `<image href="${characterIcons.get(character.name)}" x="-18" y="-30" width="36" height="36" preserveAspectRatio="xMidYMid meet"/>` : fallbackCharacterMarkup(character, { slot: index, placement: true })}</g>` : '').join('');
  svg.innerHTML = `<image class="map-bg" href="${ASSET_ROOT}/LabBG.png" x="0" y="0" width="2110" height="470" preserveAspectRatio="none"/><g>${grid.join('')}${axes.join('')}</g>${rangePolygons}<text class="origin-label" x="${layout.origin.x + 14}" y="${layout.origin.y + 28}">Prism · 43, 229</text>${lines}${current}${targetMarkup}${players}`;
  $('#map-coordinate').textContent = 'Координаты карты: наведите курсор для X/Y';
  if (!svg.dataset.coordinateListener) {
    svg.addEventListener('pointermove', (event) => {
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const mapPoint = point.matrixTransform(svg.getScreenCTM().inverse());
      $('#map-coordinate').textContent = `Координаты карты: X ${Math.round(mapPoint.x)} · Y ${Math.round(mapPoint.y)}`;
    });
    svg.addEventListener('pointerleave', () => { $('#map-coordinate').textContent = 'Координаты карты: наведите курсор для X/Y'; });
    svg.dataset.coordinateListener = 'true';
  }
  $('#lit-count').textContent = `${route.requiredConnected.length}/${route.requiredTotal} обяз. · ${route.optionalConnected.length}/${route.optionalTotal} желат.`;
  $('#player-count').textContent = String(route.positions.length);
  $('#accuracy').textContent = `${actualMinSlack} px`;
  $('#placement-list').innerHTML = route.positions.map((point, index) => {
    const character = characters[point.characterId];
    const rosterNumber = point.characterId + 1;
    const nearest = route.targets.reduce((best, target) => gameDistance(point, target) < gameDistance(point, best) ? target : best, route.targets[0]);
    const dx = Math.round(point.x - nearest.x), dy = Math.round(point.y - nearest.y);
    const relative = `${nearest.type === 'bonus' ? 'B' : 'J'}${String(nearest.id).padStart(2, '0')}: ${dx >= 0 ? '+' : ''}${dx}, ${dy >= 0 ? '+' : ''}${dy} px`;
    const avatar = characterIcons.get(character?.name)
      ? `<img src="${characterIcons.get(character.name)}" alt="">`
      : fallbackCharacterMarkup(character, { slot: point.characterId });
    const incoming = route.links.filter((link) => link.toIndex === index).length;
    return `<div class="placement-step"><b title="Номер в сохранении">${rosterNumber}</b><span class="roster-avatar">${avatar}</span><strong>${escapeHtml(character?.name || `Персонаж ${rosterNumber}`)}</strong><code>x ${point.x} · y ${point.y}</code><small>шаг ${index + 1} · ${incoming} связей · от ${relative} · линия ${lineWidths(point)[point.characterId]} px</small></div>`;
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
$('#all-optional').addEventListener('click', () => {
  layout.bonuses.forEach((entry) => targetModes.set(`b${entry.id}`, 'optional'));
  acquiredJewels.forEach((id) => targetModes.set(`j${id}`, 'optional'));
  calculateRoute();
});
$('#no-targets').addEventListener('click', () => {
  layout.bonuses.forEach((entry) => targetModes.set(`b${entry.id}`, 'excluded'));
  acquiredJewels.forEach((id) => targetModes.set(`j${id}`, 'excluded'));
  calculateRoute();
});
document.querySelectorAll('[data-recalc]').forEach((input) => input.addEventListener('input', () => { refreshAutoLineWidths(); calculateRoute(); }));

if (!layout) showStatus('Встроенная карта Laboratory не загрузилась. Обновите страницу.', true);
else { renderCharacters(); renderJewels(); calculateRoute(); }
