/**
 * ============================================================
 * GLOBAL PERSISTENCE & ENGINE CONFIG
 * ============================================================
 */
if (!window.musicPlayerPersistent) {
  window.musicPlayerPersistent = {
    currentWavesurfer: null,
    currentSongData: null,
    currentPeaksData: null,
    isPlaying: false,
    MASTER_DATA: [],
    isEngine: window.location.search.includes('engine=true')
  };
}

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
 * BACKGROUND ENGINE INITIALIZATION
 * ============================================================
 */
function initBackgroundEngine() {
  if (!window.musicPlayerPersistent.isEngine && !document.getElementById('music-engine')) {
    const engine = document.createElement('iframe');
    engine.id = 'music-engine';
    engine.src = window.location.origin + '/music?engine=true';
    engine.style.display = 'none'; 
    engine.setAttribute('aria-hidden', 'true');
    document.body.appendChild(engine);
  }
}

/**
 * ============================================================
 * UTILITY FUNCTIONS [cite: 4-14]
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
  const cardRect = cardElement.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  if (cardRect.bottom > containerRect.bottom || cardRect.top < containerRect.top) {
    container.scrollTop += (cardElement.offsetHeight * 6) * (cardRect.top < containerRect.top ? -1 : 1);
  }
}

function adjustDropdownPosition(toggle, list) {
  const container = document.querySelector('.music-list-wrapper');
  if (!container || !list || !toggle) return;
  const containerRect = container.getBoundingClientRect();
  const toggleRect = toggle.getBoundingClientRect();
  const listHeight = list.offsetHeight;
  if ((containerRect.bottom - toggleRect.bottom) < listHeight) {
    list.style.top = 'auto'; list.style.bottom = '100%';
  } else {
    list.style.top = '100%'; list.style.bottom = 'auto';
  }
}

/**
 * ============================================================
 * MASTER PLAYER UI & CONTROLS [cite: 15-66]
 * ============================================================
 */
function updateMasterPlayerInfo(song, wavesurfer) {
  const fields = song.fields;
  const playerScope = document.querySelector('.music-player-wrapper');
  if (!playerScope) return;
  
  if (playerScope.querySelector('.player-song-name')) playerScope.querySelector('.player-song-name').textContent = fields['Song Title'] || 'Untitled';
  if (playerScope.querySelector('.player-artist-name')) playerScope.querySelector('.player-artist-name').textContent = fields['Artist'] || 'Unknown Artist';
  if (fields['Cover Art'] && playerScope.querySelector('.player-song-cover')) playerScope.querySelector('.player-song-cover').src = fields['Cover Art'][0].url;
  
  const masterDuration = playerScope.querySelector('.player-duration');
  if (masterDuration) {
    const duration = wavesurfer.getDuration();
    masterDuration.textContent = duration > 0 ? formatDuration(duration) : '--:--';
  }
  
  populateMasterStems(fields, playerScope);
}

function drawMasterWaveform(peaks, progress) {
  const container = document.querySelector('.player-waveform-visual');
  if (!container) return;
  let canvas = container.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.style.width = '100%'; canvas.style.height = '25px';
    container.innerHTML = ''; container.appendChild(canvas);
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr; canvas.height = 25 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!peaks || peaks.length === 0) {
    ctx.fillStyle = '#e2e2e2'; ctx.fillRect(0, canvas.height/2, canvas.width, 2); return;
  }
  const bars = Math.floor(canvas.width / (3 * dpr));
  for (let i = 0; i < bars; i++) {
    const p = Math.abs(peaks[Math.floor(i * (peaks.length / bars))]) || 0;
    const h = Math.max(p * canvas.height * 0.85, 2 * dpr);
    ctx.fillStyle = (i / bars) < progress ? '#191919' : '#e2e2e2';
    ctx.fillRect(i * 3 * dpr, (canvas.height - h) / 2, 2 * dpr, h);
  }
}

function syncMasterTrack(wavesurfer, songData, forcedProgress = null) {
  const g = window.musicPlayerPersistent;
  g.currentWavesurfer = wavesurfer;
  g.currentSongData = songData;
  const playerWrapper = document.querySelector('.music-player-wrapper');
  if (playerWrapper) playerWrapper.style.display = 'flex';
  
  updateMasterPlayerInfo(songData, wavesurfer);
  const getAndDraw = () => {
    if (g.currentWavesurfer !== wavesurfer) return;
    const decoded = wavesurfer.getDecodedData();
    if (decoded) {
      g.currentPeaksData = decoded.getChannelData(0);
      drawMasterWaveform(g.currentPeaksData, forcedProgress !== null ? forcedProgress : wavesurfer.getCurrentTime() / wavesurfer.getDuration());
    }
  };
  if (wavesurfer.getDecodedData()) getAndDraw(); else wavesurfer.once('decode', getAndDraw);
}

/**
 * ============================================================
 * SONG CARD & WAVEFORM LOGIC [cite: 67-96]
 * ============================================================
 */
function initializeWaveforms() {
  const g = window.musicPlayerPersistent;
  document.querySelectorAll('.song-wrapper').forEach(card => {
    const waveformContainer = card.querySelector('.waveform');
    if (waveformContainer.hasChildNodes()) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformContainer, waveColor: '#e2e2e2', progressColor: '#191919',
      height: 40, barWidth: 2, barGap: 1, normalize: true, backend: 'WebAudio'
    });
    
    const songData = JSON.parse(card.dataset.songData || '{}');
    wavesurfer.load(card.dataset.audioUrl);

    wavesurfer.on('play', () => {
      allWavesurfers.forEach(ws => { if(ws !== wavesurfer) { ws.pause(); ws.seekTo(0); }});
      g.isPlaying = true;
      syncMasterTrack(wavesurfer, songData);
    });

    wavesurfer.on('timeupdate', () => {
      if (g.currentWavesurfer === wavesurfer) {
        const progress = wavesurfer.getCurrentTime() / wavesurfer.getDuration();
        if (g.currentPeaksData) drawMasterWaveform(g.currentPeaksData, progress);
      }
    });

    allWavesurfers.push(wavesurfer);
    waveformData.push({ wavesurfer, cardElement: card, songData });
  });
}

/**
 * ============================================================
 * FETCH & SEARCH/FILTER LOGIC [cite: 97-122]
 * ============================================================
 */
async function fetchSongs() {
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?view=${VIEW_ID}`, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
  });
  const data = await response.json();
  window.musicPlayerPersistent.MASTER_DATA = data.records;
  return data.records;
}

function displaySongs(songs) {
  const container = document.querySelector('.music-list-wrapper');
  if (!container) return;
  const template = container.querySelector('.song-wrapper');
  container.innerHTML = '';
  songs.forEach(s => {
    const card = template.cloneNode(true);
    card.dataset.audioUrl = s.fields['R2 Audio URL'] || '';
    card.dataset.songData = JSON.stringify(s);
    // Restoration of populateSongCard logic here
    card.querySelector('.song-name').textContent = s.fields['Song Title'] || 'Untitled';
    card.querySelector('.artist-name').textContent = s.fields['Artist'] || 'Unknown';
    if (s.fields['Cover Art']) card.querySelector('.cover-art').src = s.fields['Cover Art'][0].url;
    container.appendChild(card);
  });
  setTimeout(initializeWaveforms, 100);
}

function initSearchForm() {
  const searchForm = document.querySelector('.search-input-wrapper form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
  }
}

/**
 * ============================================================
 * MAIN INITIALIZATION [cite: 110-120]
 * ============================================================
 */
async function initMusicPage() {
  const g = window.musicPlayerPersistent;
  const isMusicPage = !!document.querySelector('.music-list-wrapper');

  initBackgroundEngine();
  initSearchForm();

  if (isMusicPage || g.isEngine) {
    const songs = await fetchSongs();
    if (isMusicPage) {
      displaySongs(songs);
      initMasterPlayer(); 
      // Re-init filter accordions & dynamic systems [cite: 118]
      if (typeof initSearchAndFilters === 'function') initSearchAndFilters();
    }
  }

  const player = document.querySelector('.music-player-wrapper');
  if (player && g.currentSongData) {
    player.style.display = 'flex';
    updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
  }
}

/**
 * ============================================================
 * BARBA TRANSITIONS
 * ============================================================
 */
window.addEventListener('load', initMusicPage);

if (typeof barba !== 'undefined') {
  barba.init({
    transitions: [{
      name: 'default',
      enter() { return initMusicPage(); },
      after() {
        if (window.Webflow) {
          window.Webflow.destroy(); window.Webflow.ready(); window.Webflow.require('ix2').init();
        }
      }
    }]
  });
}
