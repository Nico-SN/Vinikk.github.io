// script.js - Vinikk CS2 Tracker (modular version)
// IMPORTANT: adjust proxies or API keys in the UI and save settings there.

const STATE = {
  steamKey: '',
  steamId: '',
  leetifyId: '',
  useProxy: false,
  proxyBase: 'https://corsproxy.io/?', // change if you prefer another service for local tests
};

const $ = (id) => document.getElementById(id);

// Charts placeholders
let radarChart = null;
let mapChart = null;

// Helper: build URL with optional proxy
function buildUrl(url) {
  if (STATE.useProxy) {
    // corsproxy.io expects the full URL encoded after ?; adjust if you choose another service
    return STATE.proxyBase + encodeURIComponent(url);
  }
  return url;
}

function showStatus(text, isError = false) {
  const s = $('status');
  s.textContent = text;
  s.style.color = isError ? '#ff8b8b' : '';
}

// Save/load settings in localStorage (optional)
function saveSettings() {
  const cfg = {
    steamKey: $('steamKey').value.trim(),
    steamId: $('steamId').value.trim(),
    leetifyId: $('leetifyId').value.trim(),
    useProxy: $('useProxy').checked
  };
  localStorage.setItem('vinikk_cfg', JSON.stringify(cfg));
  Object.assign(STATE, cfg);
}
function loadSettings() {
  const cfg = JSON.parse(localStorage.getItem('vinikk_cfg') || '{}');
  if (cfg) {
    $('steamKey').value = cfg.steamKey || '';
    $('steamId').value = cfg.steamId || '';
    $('leetifyId').value = cfg.leetifyId || '';
    $('useProxy').checked = !!cfg.useProxy;
    Object.assign(STATE, cfg);
  }
}

// Fetch Steam profile (if key provided). Returns null on failure.
async function fetchSteamProfile() {
  if (!STATE.steamKey || !STATE.steamId) return null;
  try {
    const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STATE.steamKey}&steamids=${STATE.steamId}`;
    const r = await fetch(buildUrl(url));
    if (!r.ok) throw new Error('Steam API HTTP ' + r.status);
    const json = await r.json();
    return json?.response?.players?.[0] ?? null;
  } catch (e) {
    console.warn('Steam fetch failed', e);
    return null;
  }
}

// Fetch Leetify profile (public endpoint, may vary server-side). Returns null on failure.
// NOTE: Leetify public API paths can change: /player/{id} is used here as placeholder.
async function fetchLeetifyProfile() {
  if (!STATE.leetifyId) return null;
  try {
    const url = `https://api-public.cs-prod.leetify.com/player/${STATE.leetifyId}`;
    const r = await fetch(buildUrl(url));
    if (!r.ok) {
      throw new Error('Leetify profile HTTP ' + r.status);
    }
    const json = await r.json();
    return json;
  } catch (e) {
    console.warn('Leetify profile fetch failed', e);
    return null;
  }
}

// Fetch recent matches from Leetify
async function fetchLeetifyMatches() {
  if (!STATE.leetifyId) return [];
  try {
    const url = `https://api-public.cs-prod.leetify.com/matches/recent/${STATE.leetifyId}`;
    const r = await fetch(buildUrl(url));
    if (!r.ok) throw new Error('Leetify matches HTTP ' + r.status);
    const json = await r.json();
    return Array.isArray(json) ? json : (json.matches || []);
  } catch (e) {
    console.warn('Leetify matches fetch failed', e);
    return [];
  }
}

// Render profile + metrics into the page
function renderProfile(steamProfile, leetProfile) {
  $('playerName').textContent = steamProfile?.personaname || leetProfile?.displayName || `Player ${STATE.leetifyId || ''}`;
  $('playerSub').textContent = steamProfile?.loccountrycode ? `Steam • ${steamProfile.loccountrycode}` : 'Profil';

  $('avatar').src = steamProfile?.avatarfull || leetProfile?.avatarUrl || 'https://via.placeholder.com/150x150?text=avatar';

  // metrics (try leetify first, fallback to dashes)
  const kd = leetProfile?.kd ?? '--';
  const win = leetProfile?.winRate ?? '--';
  const hs = leetProfile?.headshotPct ?? '--';
  const hours = leetProfile?.totalPlaytimeHours ?? '--';

  $('m-kd').textContent = (kd === null || kd === undefined) ? '--' : (typeof kd === 'number' ? kd.toFixed(2) : kd);
  $('m-win').textContent = (win === null || win === undefined) ? '--' : (typeof win === 'number' ? `${win}%` : win);
  $('m-hs').textContent = (hs === null || hs === undefined) ? '--' : (typeof hs === 'number' ? `${hs}%` : hs);
  $('m-hours').textContent = (hours === null || hours === undefined) ? '--' : (typeof hours === 'number' ? `${hours} h` : hours);
}

// Render weapons (simple)
function renderWeapons(weaponStats = []) {
  const container = $('weapons');
  container.innerHTML = '';
  if (!weaponStats || weaponStats.length === 0) {
    container.innerHTML = '<div class="muted">Aucune donnée armes</div>';
    return;
  }
  weaponStats.slice(0,6).forEach(w => {
    const el = document.createElement('div');
    el.className = 'weapon';
    el.innerHTML = `<h4>${w.name}</h4><div class="muted">${w.kills ?? 0} kills • HS ${w.headshotPct ?? 0}%</div>`;
    container.appendChild(el);
  });
}

// Render matches table
function renderMatches(matches = []) {
  const body = $('matchesBody');
  body.innerHTML = '';
  if (!matches || matches.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="8" class="muted">Aucune donnée de matchs</td>`;
    body.appendChild(tr);
    return;
  }
  matches.forEach(m => {
    const date = m.date ? new Date(m.date).toLocaleString() : (m.playedAt || '--');
    const k = Number(m.kills || m.k) || 0;
    const d = Number(m.deaths || m.d) || 0;
    const kd = d === 0 ? (k > 0 ? k.toFixed(2) : '--') : ( (k/d).toFixed(2) );
    const score = m.score || `${m.teamScore ?? '--'}-${m.oppScore ?? '--'}`;
    const result = (m.result === 'win' || m.result === 'Victory' || m.didWin) ? '✅' : '❌';
    const link = m.url || m.matchUrl || '#';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${date}</td><td>${m.mapName || m.map || '--'}</td><td>${score}</td><td>${k}</td><td>${d}</td><td>${kd}</td><td>${result}</td><td><a href="${link}" target="_blank" rel="noreferrer">Voir</a></td>`;
    body.appendChild(tr);
  });
}

// Charts (create or update)
function createOrUpdateCharts(profile, matches) {
  const radarCtx = document.getElementById('radarChart').getContext('2d');
  const mapCtx = document.getElementById('mapChart').getContext('2d');

  // Radar dataset from profile or demo values
  const radarData = {
    labels: ['KD', 'HS', 'Winrate', 'Accuracy', 'Utility'],
    datasets: [{
      label: 'Performance',
      data: [
        profile?.kd ?? 1.2,
        profile?.headshotPct ?? 20,
        profile?.winRate ?? 50,
        profile?.accuracy ?? 60,
        profile?.utility ?? 40
      ],
      borderWidth: 2,
      backgroundColor: 'rgba(0,160,180,0.12)',
      borderColor: 'rgba(0,160,180,0.9)'
    }]
  };

  if (!radarChart) {
    radarChart = new Chart(radarCtx, {
      type: 'radar',
      data: radarData,
      options: { responsive: true, plugins:{legend:{display:false}} }
    });
  } else {
    radarChart.data = radarData;
    radarChart.update();
  }

  // Map chart (aggregate win rate per map from matches)
  const mapCounts = {};
  matches.forEach(m => {
    const map = m.mapName || m.map || 'unknown';
    if (!mapCounts[map]) mapCounts[map] = { total:0, wins:0 };
    mapCounts[map].total++;
    const won = (m.result === 'win' || m.didWin || m.won) ? 1 : 0;
    mapCounts[map].wins += won;
  });
  const mapLabels = Object.keys(mapCounts).slice(0,8);
  const mapWinRates = mapLabels.map(l => Math.round((mapCounts[l].wins / mapCounts[l].total)*100));

  const mapData = {
    labels: mapLabels,
    datasets: [{
      label: 'Winrate %',
      data: mapWinRates,
      borderWidth: 2,
      backgroundColor: 'rgba(255,215,105,0.15)',
      borderColor: 'rgba(255,215,105,0.95)'
    }]
  };

  if (!mapChart) {
    mapChart = new Chart(mapCtx, {
      type: 'bar',
      data: mapData,
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { suggestedMin: 0, suggestedMax: 100 } }
      }
    });
  } else {
    mapChart.data = mapData;
    mapChart.update();
  }
}

// Main "connect" flow
async function connectFlow() {
  saveSettings();
  showStatus('Récupération des données ...');

  // fetch Steam (optional)
  const steamPromise = fetchSteamProfile();
  // fetch Leetify profile + matches
  const leetProfilePromise = fetchLeetifyProfile();
  const leetMatchesPromise = fetchLeetifyMatches();

  const [steamProfile, leetProfile, leetMatches] = await Promise.all([steamPromise, leetProfilePromise, leetMatchesPromise]);

  if (!steamProfile && !leetProfile) {
    showStatus('Impossible de récupérer Steam ou Leetify. Vérifie les IDs / proxy.', true);
  } else {
    showStatus('Données chargées.');
  }

  // show dashboard
  $('setup').classList.add('hidden');
  $('dashboard').classList.remove('hidden');

  // render
  renderProfile(steamProfile, leetProfile);
  renderWeapons(leetProfile?.weaponStats || leetProfile?.weapons || []);
  renderMatches(leetMatches || []);
  createOrUpdateCharts(leetProfile || {}, leetMatches || []);
}

// UI wiring
function initUI() {
  loadSettings();

  $('connectBtn').addEventListener('click', async (e) => {
    // copy values to STATE
    STATE.steamKey = $('steamKey').value.trim();
    STATE.steamId = $('steamId').value.trim();
    STATE.leetifyId = $('leetifyId').value.trim();
    STATE.useProxy = $('useProxy').checked;
    saveSettings();

    if (!STATE.leetifyId && !STATE.steamId) {
      alert('Renseigne au moins ton SteamID64 / Leetify ID.');
      return;
    }
    try {
      await connectFlow();
    } catch (err) {
      console.error(err);
      showStatus('Erreur lors du chargement : ' + err.message, true);
    }
  });

  $('backBtn').addEventListener('click', () => {
    // reset UI
    $('dashboard').classList.add('hidden');
    $('setup').classList.remove('hidden');
    showStatus('Déconnecté.');
  });

  // expose for dev console
  window.VINIKK = { STATE, connectFlow };
}

// initial
document.addEventListener('DOMContentLoaded', initUI);

