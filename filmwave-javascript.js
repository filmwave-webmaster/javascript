
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
    const cardHeight = cardElement.offsetHeight;
    const scrollAmount = cardHeight * 6;
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
  if (masterStemsWrapper) {
    if (stemsData) {
      try {
        const stems = JSON.parse(stemsData);
        if (stems && stems.length > 0) {
          masterStemsWrapper.style.display = 'flex';
          const stemsCount = masterStemsWrapper.querySelector('.stems-count');
          if (stemsCount) stemsCount.textContent = stems.length;
          const stemsList = masterStemsWrapper.querySelector('.player-stems-dropdown-list');
          if (stemsList) {
            const stemLinkTemplate = stemsList.querySelector('.stem-link-wrapper');
            if (stemLinkTemplate) {
              const templateCopy = stemLinkTemplate.cloneNode(true);
              stemsList.innerHTML = '';
              stems.forEach(stem => {
                const stemRow = templateCopy.cloneNode(true);
                const link = stemRow.querySelector('.stem-link');
                if (link) { link.textContent = stem.name; link.href = stem.url; link.setAttribute('download', ''); }
                stemsList.appendChild(stemRow);
              });
            }
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
  const masterSongTitle = playerScope.querySelector('.player-song-name');
  const masterArtist = playerScope.querySelector('.player-artist-name');
  const masterCoverArt = playerScope.querySelector('.player-song-cover');
  const masterKey = playerScope.querySelector('.player-key');
  const masterBpm = playerScope.querySelector('.player-bpm');
  const masterDuration = playerScope.querySelector('.player-duration');
  const masterCounter = playerScope.querySelector('.player-duration-counter');
  
  if (masterSongTitle) masterSongTitle.textContent = fields['Song Title'] || 'Untitled';
  if (masterArtist) masterArtist.textContent = fields['Artist'] || 'Unknown Artist';
  if (masterCoverArt && fields['Cover Art']) masterCoverArt.src = fields['Cover Art'][0].url;
  if (masterKey) masterKey.textContent = fields['Key'] || '-';
  if (masterBpm) masterBpm.textContent = fields['BPM'] ? fields['BPM'] + ' BPM' : '-';
  if (masterDuration) {
    const duration = wavesurfer.getDuration();
    masterDuration.textContent = duration > 0 ? formatDuration(duration) : '--:--';
  }
  if (masterCounter) masterCounter.textContent = formatDuration(wavesurfer.getCurrentTime());
  populateMasterStems(fields, playerScope);
}

function drawMasterWaveform(peaks, progress) {
  const container = document.querySelector('.player-waveform-visual');
  if (!container) return;
  let canvas = container.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '25px';
    canvas.style.display = 'block';
    canvas.style.cursor = 'pointer';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.innerHTML = '';
    container.appendChild(canvas);
    canvas.addEventListener('click', (e) => {
      const g = window.musicPlayerPersistent;
      if (!g.currentWavesurfer) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const newProgress = clickX / rect.width;
      const wasPlaying = g.currentWavesurfer.isPlaying();
      g.currentWavesurfer.seekTo(newProgress);
      if (wasPlaying) setTimeout(() => { if (!g.currentWavesurfer.isPlaying()) g.currentWavesurfer.play(); }, 50);
    });
  }
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth;
  const displayHeight = 25;
  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const internalHeight = canvas.height;
  const centerY = internalHeight / 2;
  if (!peaks || peaks.length === 0) {
    ctx.fillStyle = '#e2e2e2';
    ctx.fillRect(0, centerY - (1 * dpr), canvas.width, 2 * dpr);
    return;
  }
  let maxVal = 0;
  for (let i = 0; i < peaks.length; i++) {
    const p = Math.abs(peaks[i]);
    if (p > maxVal) maxVal = p;
  }
  const normalizationScale = maxVal > 0 ? 1 / maxVal : 1;
  const barWidth = 2 * dpr;
  const barGap = 1 * dpr;
  const barTotal = barWidth + barGap;
  const barsCount = Math.floor(canvas.width / barTotal);
  const samplesPerBar = Math.floor(peaks.length / barsCount);
  for (let i = 0; i < barsCount; i++) {
    const startSample = i * samplesPerBar;
    const endSample = startSample + samplesPerBar;
    let barPeak = 0;
    for (let j = startSample; j < endSample; j++) {
      const val = Math.abs(peaks[j] || 0);
      if (val > barPeak) barPeak = val;
    }
    const peak = barPeak * normalizationScale;
    const barHeight = Math.max(peak * internalHeight * 0.85, 2 * dpr);
    const x = i * barTotal;
    const barProgress = i / barsCount;
    ctx.fillStyle = barProgress < progress ? '#191919' : '#e2e2e2';
    ctx.fillRect(x, centerY - (barHeight / 2), barWidth, barHeight);
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
  g.hasActiveSong = true;
  
  const playerWrapper = document.querySelector('.music-player-wrapper');
  if (playerWrapper) {
    playerWrapper.style.display = 'flex';
    playerWrapper.style.alignItems = 'center';
  }
  g.currentPeaksData = null;
  drawMasterWaveform(null, 0);
  updateMasterPlayerInfo(songData, wavesurfer);
  const getAndDrawPeaks = () => {
    if (g.currentWavesurfer !== wavesurfer) return;
    try {
      const decodedData = wavesurfer.getDecodedData();
      if (decodedData) {
        g.currentPeaksData = decodedData.getChannelData(0);
        const progress = forcedProgress !== null ? forcedProgress : (wavesurfer.getDuration() > 0 ? wavesurfer.getCurrentTime() / wavesurfer.getDuration() : 0);
        drawMasterWaveform(g.currentPeaksData, progress);
      }
    } catch (e) {}
  };
  if (wavesurfer.getDecodedData()) getAndDrawPeaks();
  else wavesurfer.once('decode', getAndDrawPeaks);
}

function setupMasterPlayerControls() {
  const g = window.musicPlayerPersistent;
  const masterPlayButton = document.querySelector('.player-play-pause-button');
  const controllerPlay = document.querySelector('.controller-play');
  const controllerPause = document.querySelector('.controller-pause');
  const controllerNext = document.querySelector('.controller-next');
  const controllerPrev = document.querySelector('.controller-prev');
  
  const handlePlayPause = () => { if (g.currentWavesurfer) g.currentWavesurfer.playPause(); };
  if (masterPlayButton) masterPlayButton.onclick = handlePlayPause;
  if (controllerPlay) controllerPlay.onclick = handlePlayPause;
  if (controllerPause) controllerPause.onclick = handlePlayPause;
  
  const navigateTrack = (direction) => {
    if (!g.currentWavesurfer) return;
    const currentIndex = allWavesurfers.indexOf(g.currentWavesurfer);
    let targetWS = null;
    if (direction === 'next') {
      for (let i = currentIndex + 1; i < allWavesurfers.length; i++) {
        const data = waveformData.find(d => d.wavesurfer === allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) { targetWS = allWavesurfers[i]; break; }
      }
    } else {
      for (let i = currentIndex - 1; i >= 0; i--) {
        const data = waveformData.find(d => d.wavesurfer === allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) { targetWS = allWavesurfers[i]; break; }
      }
    }
    if (targetWS) {
      const wasPlaying = g.currentWavesurfer.isPlaying();
      const prevData = waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
      if (prevData?.cardElement.querySelector('.play-button')) prevData.cardElement.querySelector('.play-button').style.opacity = '0';
      g.currentWavesurfer.pause();
      g.currentWavesurfer.seekTo(0);
      g.currentWavesurfer = targetWS;
      const nextData = waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
      if (nextData?.cardElement.querySelector('.play-button')) nextData.cardElement.querySelector('.play-button').style.opacity = '1';
      scrollToSelected(nextData.cardElement);
      if (wasPlaying) targetWS.play();
      else syncMasterTrack(targetWS, nextData.songData, 0);
    }
  };
  if (controllerNext) controllerNext.onclick = () => navigateTrack('next');
  if (controllerPrev) controllerPrev.onclick = () => navigateTrack('prev');
}

/**
 * ============================================================
 * SONG CARD FUNCTIONS
 * ============================================================
 */
function populateSongCard(cardElement, song) {
  const fields = song.fields;
  const coverArt = cardElement.querySelector('.cover-art');
  if (coverArt && fields['Cover Art']) { coverArt.src = fields['Cover Art'][0].url; coverArt.alt = fields['Song Title'] || 'Song'; }
  const songName = cardElement.querySelector('.song-name');
  if (songName) songName.textContent = fields['Song Title'] || 'Untitled';
  const artistName = cardElement.querySelector('.artist-name');
  if (artistName) artistName.textContent = fields['Artist'] || 'Unknown Artist';
  const key = cardElement.querySelector('.key');
  if (key) key.textContent = fields['Key'] || '-';
  const bpm = cardElement.querySelector('.bpm');
  if (bpm) bpm.textContent = fields['BPM'] ? fields['BPM'] + ' BPM' : '-';
  const downloadLink = cardElement.querySelector('.download-icon');
  if (downloadLink && fields['R2 Audio URL']) downloadLink.href = fields['R2 Audio URL'];
  
  const stemsData = fields['Stems'];
  const stemsWrapper = cardElement.querySelector('.stems-dropdown-wrapper');
  const optionsToggle = cardElement.querySelector('.options-dropdown-toggle');
  const optionsList = cardElement.querySelector('.options-dropdown-list');
  if (optionsToggle && optionsList) {
    optionsToggle.addEventListener('click', () => adjustDropdownPosition(optionsToggle, optionsList));
  }
  if (stemsData && stemsWrapper) {
    try {
      const stems = JSON.parse(stemsData);
      if (stems && stems.length > 0) {
        stemsWrapper.style.display = 'flex';
        const stemsCount = cardElement.querySelector('.stems-count');
        if (stemsCount) stemsCount.textContent = stems.length;
        const stemsList = cardElement.querySelector('.stems-dropdown-list');
        const stemsToggle = cardElement.querySelector('.stems-dropdown-toggle');
        if (stemsToggle && stemsList) stemsToggle.addEventListener('click', () => adjustDropdownPosition(stemsToggle, stemsList));
        if (stemsList) {
          const stemLinkTemplate = stemsList.querySelector('.stem-link-wrapper');
          if (stemLinkTemplate) {
            const templateCopy = stemLinkTemplate.cloneNode(true);
            stemsList.innerHTML = '';
            stems.forEach(stem => {
              const stemRow = templateCopy.cloneNode(true);
              const link = stemRow.querySelector('.stem-link');
              if (link) { link.textContent = stem.name; link.href = stem.url; link.setAttribute('download', ''); }
              stemsList.appendChild(stemRow);
            });
          }
        }
      } else { stemsWrapper.style.display = 'none'; }
    } catch (error) { stemsWrapper.style.display = 'none'; }
  } else if (stemsWrapper) { stemsWrapper.style.display = 'none'; }
  cardElement.dataset.audioUrl = fields['R2 Audio URL'] || '';
  cardElement.dataset.songId = song.id;
  cardElement.dataset.songData = JSON.stringify(song);
}

function updatePlayPauseIcons(cardElement, isPlaying) {
  const playIcon = cardElement.querySelector('.play-icon');
  const pauseIcon = cardElement.querySelector('.pause-icon');
  if (playIcon && pauseIcon) {
    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';
  }
}

function updatePlayButtonVisibility(cardElement, wavesurfer) {
  const playButton = cardElement.querySelector('.play-button');
  if (playButton && (wavesurfer.isPlaying() || wavesurfer.getCurrentTime() > 0)) playButton.style.opacity = '1';
}

/**
 * ============================================================
 * INITIALIZE WAVEFORMS
 * ============================================================
 */
function initializeWaveforms() {
  const g = window.musicPlayerPersistent;
  const songCards = document.querySelectorAll('.song-wrapper');
  
  songCards.forEach(cardElement => {
    const audioUrl = cardElement.dataset.audioUrl;
    const songId = cardElement.dataset.songId;
    const songData = JSON.parse(cardElement.dataset.songData || '{}');
    if (!audioUrl) return;
    const waveformContainer = cardElement.querySelector('.waveform');
    if (waveformContainer && waveformContainer.hasChildNodes()) return;
    const durationElement = cardElement.querySelector('.duration');
    const coverArtWrapper = cardElement.querySelector('.cover-art-wrapper');
    const playButton = cardElement.querySelector('.play-button');
    const songName = cardElement.querySelector('.song-name');
    if (!waveformContainer) return;
    waveformContainer.id = `waveform-${songId}`;
    
    if (playButton) {
      playButton.style.opacity = '0';
      cardElement.addEventListener('mouseenter', () => playButton.style.opacity = '1');
      cardElement.addEventListener('mouseleave', () => { if (!wavesurfer.isPlaying() && wavesurfer.getCurrentTime() === 0) playButton.style.opacity = '0'; });
    }

    const wavesurfer = WaveSurfer.create({
      container: waveformContainer,
      waveColor: '#e2e2e2',
      progressColor: '#191919',
      cursorColor: 'transparent',
      cursorWidth: 0,
      height: 40,
      barWidth: 2,
      barGap: 1,
      normalize: true,
      backend: 'WebAudio',
      fillParent: true,
      scrollParent: false,
      responsive: 300,
      interact: true,
      hideScrollbar: true,
      minPxPerSec: 1
    });

    wavesurfer.load(audioUrl);
    wavesurfer.on('ready', () => {
      const duration = wavesurfer.getDuration();
      const containerWidth = waveformContainer.offsetWidth || 300;
      wavesurfer.zoom(containerWidth / duration);
      if (durationElement) durationElement.textContent = formatDuration(duration);
    });

    wavesurfer.on('play', () => {
      allWavesurfers.forEach(ws => { if (ws !== wavesurfer && ws.isPlaying()) { ws.pause(); ws.seekTo(0); } });
      waveformData.forEach(data => { if (data.wavesurfer !== wavesurfer) { updatePlayPauseIcons(data.cardElement, false); const pb = data.cardElement.querySelector('.play-button'); if (pb) pb.style.opacity = '0'; } });
      g.currentWavesurfer = wavesurfer;
      g.isPlaying = true;
      lastPlayState = true;
      updatePlayPauseIcons(cardElement, true);
      updateMasterControllerIcons(true);
      updatePlayButtonVisibility(cardElement, wavesurfer);
      syncMasterTrack(wavesurfer, songData);
    });

    wavesurfer.on('timeupdate', () => {
      if (g.currentWavesurfer === wavesurfer) {
        const currentTime = Math.min(wavesurfer.getCurrentTime(), wavesurfer.getDuration());
        const progress = wavesurfer.getDuration() > 0 ? currentTime / wavesurfer.getDuration() : 0;
        if (g.currentPeaksData) drawMasterWaveform(g.currentPeaksData, progress);
        const masterCounter = document.querySelector('.music-player-wrapper .player-duration-counter');
        if (masterCounter) masterCounter.textContent = formatDuration(currentTime);
      }
    });

    wavesurfer.on('pause', () => {
      lastPlayState = false;
      g.isPlaying = false;
      updatePlayPauseIcons(cardElement, false);
      updateMasterControllerIcons(false);
      updatePlayButtonVisibility(cardElement, wavesurfer);
    });

    wavesurfer.on('finish', () => {
      wavesurfer.seekTo(0);
      updateMasterControllerIcons(false);
      const currentIndex = allWavesurfers.indexOf(wavesurfer);
      let nextWS = null;
      for (let i = currentIndex + 1; i < allWavesurfers.length; i++) {
        const data = waveformData.find(d => d.wavesurfer === allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) { nextWS = allWavesurfers[i]; break; }
      }
      if (nextWS) { g.currentWavesurfer = nextWS; setTimeout(() => nextWS.play(), 100); }
    });

    allWavesurfers.push(wavesurfer);
    waveformData.push({ wavesurfer, cardElement, songData });

    const playPauseElements = [coverArtWrapper, songName];
    playPauseElements.forEach(el => {
      if (el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', (e) => {
          if (e.target.closest('.w-dropdown-toggle') || e.target.closest('.w-dropdown-list')) return;
          e.stopPropagation();
          if (g.currentWavesurfer && g.currentWavesurfer !== wavesurfer) {
            const previousPlayState = g.currentWavesurfer.isPlaying();
            g.currentWavesurfer.pause();
            g.currentWavesurfer.seekTo(0);
            g.currentWavesurfer = wavesurfer;
            if (previousPlayState) wavesurfer.play();
            else syncMasterTrack(wavesurfer, songData, 0);
          } else { wavesurfer.playPause(); }
        });
      }
    });

    wavesurfer.on('interaction', (newProgress) => {
      if (g.currentWavesurfer && g.currentWavesurfer !== wavesurfer) {
        const shouldPlay = lastPlayState;
        g.currentWavesurfer.pause();
        g.currentWavesurfer.seekTo(0);
        g.currentWavesurfer = wavesurfer;
        syncMasterTrack(wavesurfer, songData, newProgress);
        if (shouldPlay) setTimeout(() => wavesurfer.play(), 50);
      } else {
        const wasPlaying = wavesurfer.isPlaying();
        g.currentWavesurfer = wavesurfer;
        if (wasPlaying) setTimeout(() => { if (!wavesurfer.isPlaying()) wavesurfer.play(); }, 50);
      }
      if (g.currentPeaksData && g.currentWavesurfer === wavesurfer) {
        drawMasterWaveform(g.currentPeaksData, newProgress);
        const masterCounter = document.querySelector('.music-player-wrapper .player-duration-counter');
        if (masterCounter) masterCounter.textContent = formatDuration(wavesurfer.getCurrentTime());
      }
    });
  });
}

/**
 * ============================================================
 * FILTERING SYSTEM (Restored from Code 7)
 * ============================================================
 */
function applyFilters() {
  const searchVal = document.querySelector('.search-input')?.value.toLowerCase() || "";
  const keyVal = document.querySelector('#key-filter')?.textContent.trim() || "All Keys";
  const bpmVal = document.querySelector('#bpm-filter')?.textContent.trim() || "All BPM";
  const catVal = document.querySelector('#category-filter')?.textContent.trim() || "All Categories";

  const cards = document.querySelectorAll('.song-wrapper');
  cards.forEach(card => {
    // Skip the template if it exists
    if (card.closest('.template-wrapper')) return;

    const data = JSON.parse(card.dataset.songData || '{}').fields || {};
    
    const matchesSearch = !searchVal || 
                         (data['Song Title'] || "").toLowerCase().includes(searchVal) || 
                         (data['Artist'] || "").toLowerCase().includes(searchVal);
    
    const matchesKey = keyVal === "All Keys" || data['Key'] === keyVal;
    
    // Normalize BPM comparison
    const targetBpm = bpmVal.replace(' BPM', '');
    const matchesBPM = bpmVal === "All BPM" || (data['BPM'] && data['BPM'].toString() === targetBpm);
    
    const matchesCat = catVal === "All Categories" || (data['Category'] && data['Category'].includes(catVal));

    if (matchesSearch && matchesKey && matchesBPM && matchesCat) {
      card.style.display = 'flex';
      card.style.opacity = '1';
    } else {
      card.style.display = 'none';
      card.style.opacity = '0';
    }
  });
}

function setupFilters() {
  const searchInput = document.querySelector('.search-input');
  const clearBtn = document.querySelector('.search-clear-button');
  const searchForm = document.querySelector('.search-wrapper form') || document.querySelector('form.search-wrapper') || document.querySelector('.search-input-wrapper form');

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => { 
      e.preventDefault(); 
      e.stopPropagation(); 
      return false; 
    });
  }
  
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (clearBtn) clearBtn.style.display = searchInput.value.length > 0 ? 'flex' : 'none';
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(applyFilters, 300);
    });
  }
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      applyFilters();
    });
  }

  // Handle Dropdown Filter Links
  document.querySelectorAll('.filter-link').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const dropdown = this.closest('.w-dropdown');
      const toggle = dropdown.querySelector('.w-dropdown-toggle');
      if (toggle) toggle.textContent = this.textContent;
      
      // Close Webflow dropdown
      dropdown.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      applyFilters();
    });
  });
}

/**
 * ============================================================
 * AIRTABLE & BARBA INITIALIZATION
 * ============================================================
 */
async function fetchSongs() {
  try {
    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?view=${VIEW_ID}`, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
    });
    const data = await response.json();
    window.musicPlayerPersistent.MASTER_DATA = data.records;
    return data.records;
  } catch (error) { return []; }
}

function displaySongs(songs) {
  const container = document.querySelector('.music-list-wrapper');
  if (!container) return;
  const templateWrapper = container.querySelector('.template-wrapper');
  const templateCard = templateWrapper ? templateWrapper.querySelector('.song-wrapper') : container.querySelector('.song-wrapper');
  if (!templateCard) return;
  
  container.innerHTML = '';
  if (templateWrapper) container.appendChild(templateWrapper);
  
  songs.forEach(song => {
    const newCard = templateCard.cloneNode(true);
    newCard.style.opacity = '1';
    newCard.style.display = 'flex';
    newCard.style.position = 'relative';
    newCard.style.pointerEvents = 'auto';
    populateSongCard(newCard, song);
    container.appendChild(newCard);
  });
  setTimeout(initializeWaveforms, 100);
}

async function initMusicPage() {
  const g = window.musicPlayerPersistent;
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  const playerWrapper = document.querySelector('.music-player-wrapper');

  if (playerWrapper) {
    if (g.currentSongData) {
      playerWrapper.style.display = 'flex';
      updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
      updateMasterControllerIcons(g.isPlaying);
      if (g.currentPeaksData) {
        const progress = g.currentWavesurfer.getCurrentTime() / g.currentWavesurfer.getDuration();
        drawMasterWaveform(g.currentPeaksData, progress);
      }
    } else { playerWrapper.style.display = 'none'; }
  }

  if (isMusicPage) {
    setupFilters();
    const songs = g.MASTER_DATA.length > 0 ? g.MASTER_DATA : await fetchSongs();
    displaySongs(songs);
  }
  setupMasterPlayerControls();
}

// Keyboard Controls
document.addEventListener('keydown', (e) => {
  const g = window.musicPlayerPersistent;
  const activeTag = document.activeElement.tagName;
  if (activeTag === 'TEXTAREA' || (activeTag === 'INPUT' && !['checkbox', 'radio'].includes(document.activeElement.type))) return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (g.currentWavesurfer) g.currentWavesurfer.playPause();
  }

  if (['ArrowDown', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
    if (!g.currentWavesurfer) return;
    const currentIndex = allWavesurfers.indexOf(g.currentWavesurfer);
    let nextWS = null;
    if (e.code === 'ArrowDown') {
      for (let i = currentIndex + 1; i < allWavesurfers.length; i++) {
        const data = waveformData.find(d => d.wavesurfer === allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) { nextWS = allWavesurfers[i]; break; }
      }
    } else {
      for (let i = currentIndex - 1; i >= 0; i--) {
        const data = waveformData.find(d => d.wavesurfer === allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) { nextWS = allWavesurfers[i]; break; }
      }
    }
    if (nextWS) {
      const wasPlaying = g.currentWavesurfer.isPlaying();
      const prevData = waveformData.find(d => d.wavesurfer === g.currentWavesurfer);
      if (prevData?.cardElement.querySelector('.play-button')) prevData.cardElement.querySelector('.play-button').style.opacity = '0';
      g.currentWavesurfer.pause();
      g.currentWavesurfer.seekTo(0);
      g.currentWavesurfer = nextWS;
      const nextData = waveformData.find(d => d.wavesurfer === nextWS);
      if (nextData?.cardElement.querySelector('.play-button')) nextData.cardElement.querySelector('.play-button').style.opacity = '1';
      scrollToSelected(nextData.cardElement);
      if (wasPlaying) nextWS.play();
      else syncMasterTrack(nextWS, nextData.songData, 0);
    }
  }
}, true);

// Barba Initialization
if (typeof barba !== 'undefined') {
  barba.init({
    transitions: [{
      name: 'fade',
      sync: true,
      leave: () => gsap.to('.main-wrapper', { opacity: 0, duration: 0.3 }),
      beforeEnter({ next }) {
        const g = window.musicPlayerPersistent;
        const isNextMusicPage = !!next.container.querySelector('.music-list-wrapper');
        const nextContainer = next.container;
        
        if (!isNextMusicPage) {
          document.body.style.overflow = 'visible';
          document.documentElement.style.overflow = 'visible';
          document.body.style.height = 'auto';
          nextContainer.style.overflow = 'visible';
        } else {
          document.body.style.overflow = 'hidden';
          document.documentElement.style.overflow = 'hidden';
          document.body.style.height = '100vh';
          nextContainer.style.overflow = 'hidden';
          const musicArea = nextContainer.querySelector('.music-area-wrapper');
          if (musicArea) musicArea.style.overflow = 'hidden';
        }

        const playerWrapper = nextContainer.querySelector('.music-player-wrapper');
        if (playerWrapper && g.hasActiveSong) {
          playerWrapper.style.display = 'flex';
          playerWrapper.style.alignItems = 'center';
        }
      },
      enter: () => {
        gsap.from('.main-wrapper', { opacity: 0, duration: 0.3 });
        return initMusicPage();
      },
      after: () => {
        window.scrollTo(0, 0);
        if (window.Webflow) { window.Webflow.destroy(); window.Webflow.ready(); window.Webflow.require('ix2').init(); }
        setTimeout(() => {
          window.dispatchEvent(new Event('scroll'));
          window.dispatchEvent(new Event('resize'));
          window.dispatchEvent(new CustomEvent('barbaAfterTransition', {
            detail: { url: window.location.pathname, isMusicPage: !!document.querySelector('.music-list-wrapper') }
          }));
        }, 100);
      }
    }]
  });
}

document.addEventListener('DOMContentLoaded', initMusicPage);
