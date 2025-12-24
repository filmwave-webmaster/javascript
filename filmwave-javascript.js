
/**
 * ============================================================
 * GLOBAL STATE - Persists across Barba page transitions
 * ============================================================
 */
if (!window.musicPlayerPersistent) {
  window.musicPlayerPersistent = {
    currentWavesurfer: null,
    currentSongData: null,
    currentPeaksData: null,
    isPlaying: false,
    MASTER_DATA: [],
    hasActiveSong: false
  };
}

// Local variables that reset per page load
let allWavesurfers = [];
let waveformData = [];
let lastPlayState = false;
let searchTimeout;

const AIRTABLE_API_KEY = 'patiV6QOeKzi9nFsZ.6670b6f25ef81e914add50d3839946c2905e9e63d52ed7148a897cc434fe65f0';
const BASE_ID = 'app7vAuN4CqMkml5g';
const TABLE_ID = 'tbl0RZuyC0LtAo7GY';
const VIEW_ID = 'viwkfM9RnnZtxL2z5';

/**
 * ============================================================
 * UTILITY FUNCTIONS
 * ============================================================
 */
function formatDuration(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function scrollToSelected(cardElement) {
  const container = document.querySelector('.music-list-wrapper');
  if (!container || !cardElement) return;
  const containerRect = container.getBoundingClientRect();
  const cardRect = cardElement.getBoundingClientRect();
  const isOffBottom = cardRect.bottom > containerRect.bottom;
  const isOffTop = cardRect.top < containerRect.top;
  if (isOffBottom || isOffTop) {
    const scrollAmount = cardElement.offsetHeight * 6;
    if (isOffBottom) container.scrollTop += scrollAmount;
    else if (isOffTop) container.scrollTop -= scrollAmount;
  }
}

function adjustDropdownPosition(toggle, list) {
  const container = document.querySelector('.music-list-wrapper');
  if (!container || !list || !toggle) return;
  const containerRect = container.getBoundingClientRect();
  const toggleRect = toggle.getBoundingClientRect();
  const originalDisplay = list.style.display;
  list.style.display = 'block';
  list.style.visibility = 'hidden';
  const listHeight = list.offsetHeight;
  list.style.display = originalDisplay;
  list.style.visibility = '';
  const spaceBelow = containerRect.bottom - toggleRect.bottom;
  const spaceAbove = toggleRect.top - containerRect.top;
  if (spaceBelow < listHeight && spaceAbove > spaceBelow) {
    list.style.top = 'auto';
    list.style.bottom = '100%';
  } else {
    list.style.top = '100%';
    list.style.bottom = 'auto';
  }
}

/**
 * ============================================================
 * MASTER PLAYER FUNCTIONS
 * ============================================================
 */
function populateMasterStems(fields, playerScope) {
  const stemsData = fields['Stems'];
  const masterStemsWrapper = playerScope.querySelector('.player-stems-dropdown');
  if (!masterStemsWrapper) return;
  if (stemsData) {
    try {
      const stems = JSON.parse(stemsData);
      if (stems && stems.length > 0) {
        masterStemsWrapper.style.display = 'flex';
        const stemsCount = masterStemsWrapper.querySelector('.stems-count');
        if (stemsCount) stemsCount.textContent = stems.length;
        const stemsList = masterStemsWrapper.querySelector('.player-stems-dropdown-list');
        const template = stemsList?.querySelector('.stem-link-wrapper');
        if (template) {
          const copy = template.cloneNode(true);
          stemsList.innerHTML = '';
          stems.forEach(stem => {
            const row = copy.cloneNode(true);
            const link = row.querySelector('.stem-link');
            if (link) { link.textContent = stem.name; link.href = stem.url; link.setAttribute('download', ''); }
            stemsList.appendChild(row);
          });
        }
      } else { masterStemsWrapper.style.display = 'none'; }
    } catch (e) { masterStemsWrapper.style.display = 'none'; }
  } else { masterStemsWrapper.style.display = 'none'; }
}

function updateMasterPlayerInfo(song, wavesurfer) {
  const fields = song.fields;
  const playerScope = document.querySelector('.music-player-wrapper');
  if (!playerScope) return;
  playerScope.querySelector('.player-song-name').textContent = fields['Song Title'] || 'Untitled';
  playerScope.querySelector('.player-artist-name').textContent = fields['Artist'] || 'Unknown Artist';
  const cover = playerScope.querySelector('.player-song-cover');
  if (cover && fields['Cover Art']) cover.src = fields['Cover Art'][0].url;
  playerScope.querySelector('.player-key').textContent = fields['Key'] || '-';
  playerScope.querySelector('.player-bpm').textContent = fields['BPM'] ? fields['BPM'] + ' BPM' : '-';
  const duration = wavesurfer.getDuration();
  playerScope.querySelector('.player-duration').textContent = duration > 0 ? formatDuration(duration) : '--:--';
  populateMasterStems(fields, playerScope);
}

function drawMasterWaveform(peaks, progress) {
  const container = document.querySelector('.player-waveform-visual');
  if (!container) return;
  let canvas = container.querySelector('canvas') || document.createElement('canvas');
  if (!canvas.parentElement) {
    canvas.style.width = '100%'; canvas.style.height = '25px'; container.innerHTML = ''; container.appendChild(canvas);
    canvas.onclick = (e) => {
      const g = window.musicPlayerPersistent;
      if (!g.currentWavesurfer) return;
      g.currentWavesurfer.seekTo((e.clientX - canvas.getBoundingClientRect().left) / canvas.clientWidth);
    };
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr; canvas.height = 25 * dpr;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!peaks || peaks.length === 0) {
    ctx.fillStyle = '#e2e2e2'; ctx.fillRect(0, (canvas.height/2)-(1*dpr), canvas.width, 2*dpr); return;
  }
  const barWidth = 2 * dpr; const barGap = 1 * dpr; const bars = Math.floor(canvas.width / (barWidth + barGap));
  const step = Math.floor(peaks.length / bars);
  for (let i = 0; i < bars; i++) {
    const peak = Math.abs(peaks[i * step] || 0);
    const h = Math.max(peak * canvas.height * 0.85, 2 * dpr);
    ctx.fillStyle = (i / bars) < progress ? '#191919' : '#e2e2e2';
    ctx.fillRect(i * (barWidth + barGap), (canvas.height - h) / 2, barWidth, h);
  }
}

function updateMasterControllerIcons(isPlaying) {
  const play = document.querySelector('.controller-play');
  const pause = document.querySelector('.controller-pause');
  if (play && pause) { play.style.display = isPlaying ? 'none' : 'block'; pause.style.display = isPlaying ? 'block' : 'none'; }
}

function syncMasterTrack(wavesurfer, songData, forcedProgress = null) {
  const g = window.musicPlayerPersistent;
  g.currentWavesurfer = wavesurfer; g.currentSongData = songData; g.hasActiveSong = true;
  const player = document.querySelector('.music-player-wrapper');
  if (player) { player.style.display = 'flex'; player.style.alignItems = 'center'; }
  updateMasterPlayerInfo(songData, wavesurfer);
  const getPeaks = () => {
    const decoded = wavesurfer.getDecodedData();
    if (decoded) {
      g.currentPeaksData = decoded.getChannelData(0);
      const prog = forcedProgress !== null ? forcedProgress : (wavesurfer.getCurrentTime() / wavesurfer.getDuration());
      drawMasterWaveform(g.currentPeaksData, prog);
    }
  };
  if (wavesurfer.getDecodedData()) getPeaks(); else wavesurfer.once('decode', getPeaks);
}

function setupMasterPlayerControls() {
  const g = window.musicPlayerPersistent;
  const playBtns = ['.player-play-pause-button', '.controller-play', '.controller-pause'];
  playBtns.forEach(sel => {
    const btn = document.querySelector(sel);
    if (btn) btn.onclick = () => g.currentWavesurfer?.playPause();
  });

  const navigate = (dir) => {
    const idx = allWavesurfers.indexOf(g.currentWavesurfer);
    let target = null;
    const range = dir === 'next' ? { start: idx + 1, end: allWavesurfers.length, step: 1 } : { start: idx - 1, end: -1, step: -1 };
    for (let i = range.start; i !== range.end; i += range.step) {
      const d = waveformData.find(wd => wd.wavesurfer === allWavesurfers[i]);
      if (d && d.cardElement.offsetParent !== null) { target = allWavesurfers[i]; break; }
    }
    if (target) {
      const playing = g.currentWavesurfer.isPlaying();
      g.currentWavesurfer.pause(); g.currentWavesurfer.seekTo(0);
      const nextData = waveformData.find(d => d.wavesurfer === target);
      scrollToSelected(nextData.cardElement);
      if (playing) target.play(); else syncMasterTrack(target, nextData.songData, 0);
    }
  };
  const next = document.querySelector('.controller-next'); if (next) next.onclick = () => navigate('next');
  const prev = document.querySelector('.controller-prev'); if (prev) prev.onclick = () => navigate('prev');
}

/**
 * ============================================================
 * FILTER & SEARCH LOGIC
 * ============================================================
 */
function applyFilters() {
  const searchVal = document.querySelector('.search-input')?.value.toLowerCase() || "";
  const activeTags = Array.from(document.querySelectorAll('.filter-tag-text')).map(t => t.textContent.trim().toLowerCase());
  document.querySelectorAll('.song-wrapper').forEach(card => {
    if (card.closest('.template-wrapper')) return;
    const data = JSON.parse(card.dataset.songData || '{}').fields || {};
    const matchesSearch = !searchVal || (data['Song Title']||"").toLowerCase().includes(searchVal) || (data['Artist']||"").toLowerCase().includes(searchVal);
    const matchesTags = activeTags.length === 0 || activeTags.some(tag => (data['Category']||"").toLowerCase().includes(tag));
    card.style.display = matchesSearch && matchesTags ? 'flex' : 'none';
  });
}

function initSearchAndFilters() {
  const searchInput = document.querySelector('.search-input');
  const clearBtn = document.querySelector('.search-clear-button');
  const form = document.querySelector('.search-input-wrapper form, form.search-input-wrapper');
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (clearBtn) clearBtn.style.display = searchInput.value.length > 0 ? 'flex' : 'none';
      clearTimeout(searchTimeout); searchTimeout = setTimeout(applyFilters, 300);
    });
  }
  if (clearBtn) clearBtn.addEventListener('click', () => { searchInput.value = ''; clearBtn.style.display = 'none'; applyFilters(); });
}

function initFilterAccordions() {
  document.querySelectorAll('.filter-header').forEach(header => {
    const newHeader = header.cloneNode(true); header.parentNode.replaceChild(newHeader, header);
    newHeader.addEventListener('click', function() {
      const content = this.nextElementSibling; const arrow = this.querySelector('.arrow-icon'); const isOpen = content.classList.contains('open');
      document.querySelectorAll('.filter-list').forEach(l => { l.style.maxHeight = '0px'; l.classList.remove('open'); });
      document.querySelectorAll('.arrow-icon').forEach(a => a.style.transform = 'rotate(0deg)');
      if (!isOpen) { content.style.maxHeight = Math.min(content.scrollHeight, 300) + 'px'; content.classList.add('open'); if (arrow) arrow.style.transform = 'rotate(180deg)'; }
    });
  });
}

function initCheckboxTextColor() {
  document.querySelectorAll('.checkbox-include-wrapper input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', function() {
      const label = this.parentElement.querySelector('.w-form-label');
      if (label) label.style.color = this.checked ? '#191919' : '';
    });
  });
}

/**
 * ============================================================
 * MAIN INITIALIZATION
 * ============================================================
 */
function initializeWaveforms() {
  const g = window.musicPlayerPersistent;
  document.querySelectorAll('.song-wrapper').forEach(card => {
    const url = card.dataset.audioUrl; if (!url || card.querySelector('.waveform').hasChildNodes()) return;
    const ws = WaveSurfer.create({ container: card.querySelector('.waveform'), waveColor: '#e2e2e2', progressColor: '#191919', height: 40, barWidth: 2, barGap: 1, interact: true });
    ws.load(url);
    ws.on('play', () => {
      allWavesurfers.forEach(other => { if(other !== ws) { other.pause(); other.seekTo(0); }});
      g.isPlaying = true; updateMasterControllerIcons(true); syncMasterTrack(ws, JSON.parse(card.dataset.songData));
    });
    ws.on('timeupdate', () => { if (g.currentWavesurfer === ws && g.currentPeaksData) drawMasterWaveform(g.currentPeaksData, ws.getCurrentTime()/ws.getDuration()); });
    ws.on('pause', () => { g.isPlaying = false; updateMasterControllerIcons(false); });
    card.querySelector('.cover-art-wrapper').onclick = () => ws.playPause();
    allWavesurfers.push(ws); waveformData.push({ wavesurfer: ws, cardElement: card, songData: JSON.parse(card.dataset.songData) });
  });
}

async function fetchSongs() {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?view=${VIEW_ID}`, { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } });
  const data = await res.json(); window.musicPlayerPersistent.MASTER_DATA = data.records; return data.records;
}

function displaySongs(songs) {
  const container = document.querySelector('.music-list-wrapper');
  const template = container?.querySelector('.song-wrapper'); if (!container || !template) return;
  container.innerHTML = '';
  songs.forEach(song => {
    const card = template.cloneNode(true); card.style.opacity = '1';
    const f = song.fields;
    card.querySelector('.song-name').textContent = f['Song Title'] || 'Untitled';
    card.querySelector('.artist-name').textContent = f['Artist'] || 'Unknown Artist';
    card.querySelector('.key').textContent = f['Key'] || '-';
    card.querySelector('.bpm').textContent = f['BPM'] ? f['BPM'] + ' BPM' : '-';
    if (f['Cover Art']) card.querySelector('.cover-art').src = f['Cover Art'][0].url;
    card.dataset.audioUrl = f['R2 Audio URL'] || ''; card.dataset.songData = JSON.stringify(song);
    container.appendChild(card);
  });
  setTimeout(initializeWaveforms, 100);
}

async function initMusicPage() {
  const g = window.musicPlayerPersistent;
  const isMusic = !!document.querySelector('.music-list-wrapper');
  const player = document.querySelector('.music-player-wrapper');
  if (player && g.hasActiveSong) {
    player.style.display = 'flex'; updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
    if (g.currentPeaksData) drawMasterWaveform(g.currentPeaksData, g.currentWavesurfer.getCurrentTime()/g.currentWavesurfer.getDuration());
  }
  if (isMusic) {
    initFilterAccordions(); initCheckboxTextColor(); initSearchAndFilters();
    setupMasterPlayerControls();
    const songs = g.MASTER_DATA.length > 0 ? g.MASTER_DATA : await fetchSongs();
    displaySongs(songs);
  }
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
  const g = window.musicPlayerPersistent;
  if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); g.currentWavesurfer?.playPause(); }
}, true);

// Barba Init
if (typeof barba !== 'undefined') {
  barba.init({
    transitions: [{
      name: 'fade',
      leave: () => gsap.to('.main-wrapper', { opacity: 0, duration: 0.2 }),
      enter: () => { gsap.to('.main-wrapper', { opacity: 1, duration: 0.2 }); return initMusicPage(); },
      after: () => { if (window.Webflow) { window.Webflow.destroy(); window.Webflow.ready(); window.Webflow.require('ix2').init(); } }
    }]
  });
}
document.addEventListener('DOMContentLoaded', initMusicPage);
