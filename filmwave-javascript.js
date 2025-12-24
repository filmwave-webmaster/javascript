
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
    // Detection for the hidden background library engine
    isEngine: window.location.search.includes('engine=true')
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
 * INVISIBLE ENGINE INITIALIZATION
 * ============================================================
 */
function initBackgroundEngine() {
  // If we are the main window, spawn the hidden music engine
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
 * CROSS-WINDOW COMMUNICATION
 * ============================================================
 */
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;

  const { type, payload } = event.data;

  // Background engine sends the full library to the main window
  if (type === 'ENGINE_DATA_SYNC') {
    window.musicPlayerPersistent.MASTER_DATA = payload;
  }
  
  // Handling requests to play from other pages
  if (type === 'REMOTE_PLAY_REQUEST') {
    remotePlayHandler(payload.songId);
  }
});

function remotePlayHandler(songId) {
  const g = window.musicPlayerPersistent;
  if (g.isEngine) {
    const target = waveformData.find(d => d.songData.id === songId);
    if (target && target.wavesurfer) target.wavesurfer.play();
  }
}

/**
 * ============================================================
 * [cite_start]UTILITY FUNCTIONS [cite: 374-385]
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
 * [cite_start]MASTER PLAYER FUNCTIONS [cite: 386-447]
 * ============================================================
 */
function populateMasterStems(fields, playerScope) {
  const stemsData = fields['Stems'];
  const masterStemsWrapper = playerScope.querySelector('.player-stems-dropdown');
  if (masterStemsWrapper) {
    if (stemsData) {
      try {
        const stems = JSON.parse(stemsData);
        if (stems && stems.length > 0) {
          masterStemsWrapper.style.display = 'flex';
          const stemsList = masterStemsWrapper.querySelector('.player-stems-dropdown-list');
          if (stemsList) {
            const template = stemsList.querySelector('.stem-link-wrapper');
            stemsList.innerHTML = '';
            stems.forEach(stem => {
              const row = template.cloneNode(true);
              const link = row.querySelector('.stem-link');
              if (link) { link.textContent = stem.name; link.href = stem.url; link.setAttribute('download', ''); }
              stemsList.appendChild(row);
            });
          }
        } else { masterStemsWrapper.style.display = 'none'; }
      } catch (e) { masterStemsWrapper.style.display = 'none'; }
    } else { masterStemsWrapper.style.display = 'none'; }
  }
}

function updateMasterPlayerInfo(song, wavesurfer) {
  const fields = song.fields;
  const playerScope = document.querySelector('.music-player-wrapper');
  if (!playerScope) return;
  playerScope.querySelector('.player-song-name').textContent = fields['Song Title'] || 'Untitled';
  playerScope.querySelector('.player-artist-name').textContent = fields['Artist'] || 'Unknown Artist';
  if (fields['Cover Art']) playerScope.querySelector('.player-song-cover').src = fields['Cover Art'][0].url;
  playerScope.querySelector('.player-key').textContent = fields['Key'] || '-';
  playerScope.querySelector('.player-bpm').textContent = fields['BPM'] ? fields['BPM'] + ' BPM' : '-';
  playerScope.querySelector('.player-duration').textContent = formatDuration(wavesurfer.getDuration());
  playerScope.querySelector('.player-duration-counter').textContent = formatDuration(wavesurfer.getCurrentTime());
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
    canvas.onclick = (e) => {
      const g = window.musicPlayerPersistent;
      if (!g.currentWavesurfer) return;
      g.currentWavesurfer.seekTo(e.offsetX / canvas.clientWidth);
    };
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr; canvas.height = 25 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!peaks) { ctx.fillStyle = '#e2e2e2'; ctx.fillRect(0, canvas.height/2, canvas.width, 2); return; }
  const bars = Math.floor(canvas.width / (3 * dpr));
  for (let i = 0; i < bars; i++) {
    const peak = Math.abs(peaks[Math.floor(i * (peaks.length / bars))]) || 0;
    const h = Math.max(peak * canvas.height, 2 * dpr);
    ctx.fillStyle = (i / bars) < progress ? '#191919' : '#e2e2e2';
    ctx.fillRect(i * 3 * dpr, (canvas.height - h) / 2, 2 * dpr, h);
  }
}

function updateMasterControllerIcons(isPlaying) {
  const playBtn = document.querySelector('.controller-play');
  const pauseBtn = document.querySelector('.controller-pause');
  if (playBtn && pauseBtn) {
    playBtn.style.display = isPlaying ? 'none' : 'block';
    pauseBtn.style.display = isPlaying ? 'block' : 'none';
  }
}

function syncMasterTrack(wavesurfer, songData, forcedProgress = null) {
  const g = window.musicPlayerPersistent;
  g.currentWavesurfer = wavesurfer;
  g.currentSongData = songData;
  const playerWrapper = document.querySelector('.music-player-wrapper');
  if (playerWrapper) playerWrapper.style.display = 'flex';
  updateMasterPlayerInfo(songData, wavesurfer);
  const draw = () => {
    if (g.currentWavesurfer !== wavesurfer) return;
    const decoded = wavesurfer.getDecodedData();
    if (decoded) {
      g.currentPeaksData = decoded.getChannelData(0);
      drawMasterWaveform(g.currentPeaksData, forcedProgress !== null ? forcedProgress : wavesurfer.getCurrentTime() / wavesurfer.getDuration());
    }
  };
  if (wavesurfer.getDecodedData()) draw(); else wavesurfer.once('decode', draw);
}

/**
 * ============================================================
 * [cite_start]SONG LIST & SEARCH LOGIC [cite: 326-330, 448-472]
 * ============================================================
 */
async function fetchSongs() {
  try {
    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?view=${VIEW_ID}`, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
    });
    const data = await response.json();
    window.musicPlayerPersistent.MASTER_DATA = data.records;
    if (window.musicPlayerPersistent.isEngine) {
      window.parent.postMessage({ type: 'ENGINE_DATA_SYNC', payload: data.records }, window.location.origin);
    }
    return data.records;
  } catch (e) { return []; }
}

function populateSongCard(cardElement, song) {
  const f = song.fields;
  cardElement.querySelector('.song-name').textContent = f['Song Title'] || 'Untitled';
  cardElement.querySelector('.artist-name').textContent = f['Artist'] || 'Unknown';
  if (f['Cover Art']) cardElement.querySelector('.cover-art').src = f['Cover Art'][0].url;
  cardElement.dataset.audioUrl = f['R2 Audio URL'] || '';
  cardElement.dataset.songId = song.id;
  cardElement.dataset.songData = JSON.stringify(song);
}

function initializeWaveforms() {
  const g = window.musicPlayerPersistent;
  document.querySelectorAll('.song-wrapper').forEach(card => {
    if (card.querySelector('.waveform').hasChildNodes()) return;
    const ws = WaveSurfer.create({
      container: card.querySelector('.waveform'), waveColor: '#e2e2e2', progressColor: '#191919',
      height: 40, barWidth: 2, barGap: 1, normalize: true, backend: 'WebAudio'
    });
    ws.load(card.dataset.audioUrl);
    ws.on('play', () => {
      allWavesurfers.forEach(other => { if(other !== ws) { other.pause(); other.seekTo(0); }});
      g.isPlaying = true; syncMasterTrack(ws, JSON.parse(card.dataset.songData)); updateMasterControllerIcons(true);
    });
    ws.on('pause', () => { g.isPlaying = false; updateMasterControllerIcons(false); });
    allWavesurfers.push(ws);
    waveformData.push({ wavesurfer: ws, cardElement: card, songData: JSON.parse(card.dataset.songData) });
  });
}

function initSearchForm() {
  const searchForm = document.querySelector('.search-input-wrapper form');
  if (searchForm) {
    searchForm.onsubmit = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
  }
}

/**
 * ============================================================
 * MAIN INITIALIZATION (initMusicPage)
 * ============================================================
 */
async function initMusicPage() {
  const g = window.musicPlayerPersistent;
  const isMusicPage = !!document.querySelector('.music-list-wrapper');

  initBackgroundEngine();
  initSearchForm();

  const player = document.querySelector('.music-player-wrapper');
  if (player && g.currentSongData) {
    player.style.display = 'flex';
    updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
    updateMasterControllerIcons(g.isPlaying);
  }

  if (isMusicPage || g.isEngine) {
    const songs = await fetchSongs();
    if (isMusicPage) {
      const container = document.querySelector('.music-list-wrapper');
      const template = container.querySelector('.song-wrapper');
      container.innerHTML = '';
      songs.forEach(s => {
        const card = template.cloneNode(true);
        populateSongCard(card, s);
        container.appendChild(card);
      });
      setTimeout(initializeWaveforms, 100);
      initMasterPlayer();
    } else {
      // The background engine still builds the list in memory to handle playback
      const ghost = document.createElement('div');
      songs.forEach(s => {
        const d = document.createElement('div');
        d.className = 'song-wrapper'; d.dataset.audioUrl = s.fields['R2 Audio URL'];
        d.dataset.songData = JSON.stringify(s); d.innerHTML = '<div class="waveform"></div>';
        ghost.appendChild(d);
      });
      document.body.appendChild(ghost);
      ghost.style.display = 'none';
      initializeWaveforms();
    }
  }
}

/**
 * ============================================================
 * [cite_start]BARBA INTEGRATION [cite: 502-540]
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
