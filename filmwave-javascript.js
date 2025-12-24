
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
    MASTER_DATA: []
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
                if (link) {
                  link.textContent = stem.name;
                  link.href = stem.url;
                  link.setAttribute('download', '');
                }
                stemsList.appendChild(stemRow);
              });
            }
          }
        } else {
          masterStemsWrapper.style.display = 'none';
        }
      } catch (e) {
        console.error('Error parsing master stems:', e);
        masterStemsWrapper.style.display = 'none';
      }
    } else {
      masterStemsWrapper.style.display = 'none';
    }
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
  if (masterCoverArt && fields['Cover Art']) {
    masterCoverArt.src = fields['Cover Art'][0].url;
  }
  if (masterKey) masterKey.textContent = fields['Key'] || '-';
  if (masterBpm) masterBpm.textContent = fields['BPM'] ? fields['BPM'] + ' BPM' : '-';
  if (masterDuration) {
    const duration = wavesurfer.getDuration();
    masterDuration.textContent = duration > 0 ? formatDuration(duration) : '--:--';
  }
  if (masterCounter) {
    masterCounter.textContent = formatDuration(wavesurfer.getCurrentTime());
  }
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
      if (wasPlaying) {
        setTimeout(() => {
          if (!g.currentWavesurfer.isPlaying()) {
            g.currentWavesurfer.play().catch(() => {});
          }
        }, 50);
      }
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
  
  // Store globally
  g.currentWavesurfer = wavesurfer;
  g.currentSongData = songData;
  
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
    } catch (e) {
      console.error('Error extracting peaks:', e);
    }
  };
  if (wavesurfer.getDecodedData()) {
    getAndDrawPeaks();
  } else {
    wavesurfer.once('decode', getAndDrawPeaks);
  }
}

function setupMasterPlayerControls() {
  const g = window.musicPlayerPersistent;
  
  const masterPlayButton = document.querySelector('.player-play-pause-button');
  const controllerPlay = document.querySelector('.controller-play');
  const controllerPause = document.querySelector('.controller-pause');
  const controllerNext = document.querySelector('.controller-next');
  const controllerPrev = document.querySelector('.controller-prev');
  const handlePlayPause = () => {
    if (g.currentWavesurfer) {
      g.currentWavesurfer.playPause();
    }
  };
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
        if (data && data.cardElement.offsetParent !== null) {
          targetWS = allWavesurfers[i];
          break;
        }
      }
    } else {
      for (let i = currentIndex - 1; i >= 0; i--) {
        const data = waveformData.find(d => d.wavesurfer === allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) {
          targetWS = allWavesurfers[i];
          break;
        }
      }
    }
    if (targetWS) {
      const wasPlaying = g.currentWavesurfer.isPlaying();
      const prevData = waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
      if (prevData?.cardElement.querySelector('.play-button')) {
        prevData.cardElement.querySelector('.play-button').style.opacity = '0';
      }
      g.currentWavesurfer.pause();
      g.currentWavesurfer.seekTo(0);
      g.currentWavesurfer = targetWS;
      const nextData = waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
      if (nextData?.cardElement.querySelector('.play-button')) {
        nextData.cardElement.querySelector('.play-button').style.opacity = '1';
      }
      scrollToSelected(nextData.cardElement);
      if (wasPlaying) targetWS.play();
      else syncMasterTrack(targetWS, nextData.songData, 0);
    }
  };
  if (controllerNext) controllerNext.onclick = () => navigateTrack('next');
  if (controllerPrev) controllerPrev.onclick = () => navigateTrack('prev');
}

function initMasterPlayer() {
  const container = document.querySelector('.player-waveform-visual');
  if (!container) return;
  drawMasterWaveform([], 0);
  setupMasterPlayerControls();
}

/**
 * ============================================================
 * SONG CARD FUNCTIONS
 * ============================================================
 */
function populateSongCard(cardElement, song) {
  const fields = song.fields;
  const coverArt = cardElement.querySelector('.cover-art');
  if (coverArt && fields['Cover Art']) {
    coverArt.src = fields['Cover Art'][0].url;
    coverArt.alt = fields['Song Title'] || 'Song';
  }
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
    optionsToggle.addEventListener('click', () => {
      adjustDropdownPosition(optionsToggle, optionsList);
    });
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
        if (stemsToggle && stemsList) {
          stemsToggle.addEventListener('click', () => {
            adjustDropdownPosition(stemsToggle, stemsList);
          });
        }
        if (stemsList) {
          const stemLinkTemplate = stemsList.querySelector('.stem-link-wrapper');
          if (stemLinkTemplate) {
            const templateCopy = stemLinkTemplate.cloneNode(true);
            stemsList.innerHTML = '';
            stems.forEach(stem => {
              const stemRow = templateCopy.cloneNode(true);
              const link = stemRow.querySelector('.stem-link');
              if (link) {
                link.textContent = stem.name;
                link.href = stem.url;
                link.setAttribute('download', '');
              }
              stemsList.appendChild(stemRow);
            });
          }
        }
      } else {
        stemsWrapper.style.display = 'none';
      }
    } catch (error) {
      console.error('Error parsing stems data:', error);
      stemsWrapper.style.display = 'none';
    }
  } else if (stemsWrapper) {
    stemsWrapper.style.display = 'none';
  }
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
  if (playButton && (wavesurfer.isPlaying() || wavesurfer.getCurrentTime() > 0)) {
    playButton.style.opacity = '1';
  }
}

/**
 * ============================================================
 * INITIALIZE WAVEFORMS
 * ============================================================
 */
function initializeWaveforms() {
  const g = window.musicPlayerPersistent;
  
  console.log('🎵 Init card waveforms...');
  
  const songCards = document.querySelectorAll('.song-wrapper');
  console.log(`Found ${songCards.length} cards`);
  
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
      cardElement.addEventListener('mouseleave', () => {
        if (!wavesurfer.isPlaying() && wavesurfer.getCurrentTime() === 0) playButton.style.opacity = '0';
      });
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
    wavesurfer.on('ready', function () {
      const duration = wavesurfer.getDuration();
      const containerWidth = waveformContainer.offsetWidth || 300;
      wavesurfer.zoom(containerWidth / duration);
      if (durationElement) durationElement.textContent = formatDuration(duration);
    });
    wavesurfer.on('play', function () {
      allWavesurfers.forEach(ws => {
        if (ws !== wavesurfer && ws.isPlaying()) {
          ws.pause();
          ws.seekTo(0);
        }
      });
      waveformData.forEach(data => {
        if (data.wavesurfer !== wavesurfer) {
          updatePlayPauseIcons(data.cardElement, false);
          const pb = data.cardElement.querySelector('.play-button');
          if (pb) pb.style.opacity = '0';
        }
      });
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
        const duration = wavesurfer.getDuration();
        const currentTime = Math.min(wavesurfer.getCurrentTime(), duration);
        const progress = duration > 0 ? currentTime / duration : 0;
        if (g.currentPeaksData) {
          drawMasterWaveform(g.currentPeaksData, progress);
        }
        const masterCounter = document.querySelector('.music-player-wrapper .player-duration-counter');
        if (masterCounter) {
          masterCounter.textContent = formatDuration(currentTime);
        }
      }
    });
    wavesurfer.on('pause', function () {
      lastPlayState = false;
      g.isPlaying = false;
      updatePlayPauseIcons(cardElement, false);
      updateMasterControllerIcons(false);
      updatePlayButtonVisibility(cardElement, wavesurfer);
    });
    wavesurfer.on('finish', function () {
      updatePlayPauseIcons(cardElement, false);
      const pb = cardElement.querySelector('.play-button');
      if (pb) pb.style.opacity = '0';
      wavesurfer.seekTo(0);
      updateMasterControllerIcons(false);
      const currentIndex = allWavesurfers.indexOf(wavesurfer);
      let nextWavesurfer = null;
      for (let i = currentIndex + 1; i < allWavesurfers.length; i++) {
        const data = waveformData.find(d => d.wavesurfer === allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) {
          nextWavesurfer = allWavesurfers[i];
          break;
        }
      }
      if (nextWavesurfer) {
        g.currentWavesurfer = nextWavesurfer;
        setTimeout(() => {
          nextWavesurfer.play().catch(err => console.error("Safari auto-play block: ", err));
        }, 100);
      }
    });
    allWavesurfers.push(wavesurfer);
    waveformData.push({
      wavesurfer,
      cardElement,
      waveformContainer,
      audioUrl,
      songData
    });
    const playPauseElements = [coverArtWrapper, songName];
    playPauseElements.forEach(element => {
      if (element) {
        element.style.cursor = 'pointer';
        element.addEventListener('click', (e) => {
          if (e.target.closest('.w-dropdown-toggle') || e.target.closest('.w-dropdown-list')) return;
          e.stopPropagation();
          if (g.currentWavesurfer && g.currentWavesurfer !== wavesurfer) {
            const previousPlayState = g.currentWavesurfer.isPlaying();
            g.currentWavesurfer.pause();
            g.currentWavesurfer.seekTo(0);
            g.currentWavesurfer = wavesurfer;
            if (previousPlayState) wavesurfer.play();
            else syncMasterTrack(wavesurfer, songData, 0);
          } else {
            wavesurfer.playPause();
          }
        });
      }
    });
    wavesurfer.on('interaction', function (newProgress) {
      if (g.currentWavesurfer && g.currentWavesurfer !== wavesurfer) {
        const shouldPlay = lastPlayState;
        g.currentWavesurfer.pause();
        g.currentWavesurfer.seekTo(0);
        g.currentWavesurfer = wavesurfer;
        syncMasterTrack(wavesurfer, songData, newProgress);
        if (shouldPlay) {
          setTimeout(() => wavesurfer.play(), 50);
        }
      } else {
        const wasPlaying = wavesurfer.isPlaying();
        g.currentWavesurfer = wavesurfer;
        if (wasPlaying) {
          setTimeout(() => {
            if (!wavesurfer.isPlaying()) wavesurfer.play();
          }, 50);
        }
      }
      if (g.currentPeaksData && g.currentWavesurfer === wavesurfer) {
        drawMasterWaveform(g.currentPeaksData, newProgress);
        const masterCounter = document.querySelector('.music-player-wrapper .player-duration-counter');
        if (masterCounter) {
          masterCounter.textContent = formatDuration(wavesurfer.getCurrentTime());
        }
      }
    });
  });
  
  console.log(`✅ Initialized ${allWavesurfers.length} card waveforms`);
}

/**
 * ============================================================
 * FETCH & DISPLAY SONGS
 * ============================================================
 */
async function fetchSongs() {
  try {
    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?view=${VIEW_ID}`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`
      }
    });
    const data = await response.json();
    window.musicPlayerPersistent.MASTER_DATA = data.records;
    return data.records;
  } catch (error) {
    console.error('Error fetching songs:', error);
    return [];
  }
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
    newCard.style.position = 'relative';
    newCard.style.pointerEvents = 'auto';
    populateSongCard(newCard, song);
    container.appendChild(newCard);
  });
  
  setTimeout(() => initializeWaveforms(), 100);
}

/**
 * ============================================================
 * KEYBOARD CONTROLS
 * ============================================================
 */
document.addEventListener('keydown', function (e) {
  const g = window.musicPlayerPersistent;
  const activeEl = document.activeElement;
  const activeTag = activeEl.tagName;
  const activeType = activeEl.type;
  if (activeTag === 'TEXTAREA' || (activeTag === 'INPUT' && !['checkbox', 'radio'].includes(activeType))) {
    return;
  }
  if (e.code === 'Space') {
    if (activeTag === 'INPUT' && (activeType === 'checkbox' || activeType === 'radio')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    } else {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    if (g.currentWavesurfer) {
      g.currentWavesurfer.playPause();
    }
    return false;
  }
  if (['ArrowDown', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
    if (!g.currentWavesurfer) return;
    const currentIndex = allWavesurfers.indexOf(g.currentWavesurfer);
    let nextWavesurfer = null;
    if (e.code === 'ArrowDown') {
      for (let i = currentIndex + 1; i < allWavesurfers.length; i++) {
        const data = waveformData.find(d => d.wavesurfer === allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) {
          nextWavesurfer = allWavesurfers[i];
          break;
        }
      }
    } else {
      for (let i = currentIndex - 1; i >= 0; i--) {
        const data = waveformData.find(d => d.wavesurfer === allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) {
          nextWavesurfer = allWavesurfers[i];
          break;
        }
      }
    }
    if (nextWavesurfer) {
      const wasPlaying = g.currentWavesurfer.isPlaying();
      const prevData = waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
      if (prevData?.cardElement.querySelector('.play-button')) {
        prevData.cardElement.querySelector('.play-button').style.opacity = '0';
      }
      g.currentWavesurfer.pause();
      g.currentWavesurfer.seekTo(0);
      g.currentWavesurfer = nextWavesurfer;
      const nextData = waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
      if (nextData?.cardElement.querySelector('.play-button')) {
        nextData.cardElement.querySelector('.play-button').style.opacity = '1';
      }
      scrollToSelected(nextData.cardElement);
      if (wasPlaying) g.currentWavesurfer.play();
      else syncMasterTrack(g.currentWavesurfer, nextData.songData, 0);
    }
  }
}, true);

/**
 * ============================================================
 * MAIN INITIALIZATION
 * ============================================================
 */
async function initMusicPage() {
  console.log('🎵 Init Music Page...');
  
  const g = window.musicPlayerPersistent;
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  
  // Show/hide player based on state
  const playerWrapper = document.querySelector('.music-player-wrapper');
  if (playerWrapper) {
    if (g.currentSongData) {
      playerWrapper.style.display = 'flex';
      // Re-sync UI
      if (g.currentWavesurfer) {
        updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
        updateMasterControllerIcons(g.isPlaying);
        // Redraw waveform
        if (g.currentPeaksData) {
          const progress = g.currentWavesurfer.getCurrentTime() / g.currentWavesurfer.getDuration();
          drawMasterWaveform(g.currentPeaksData, progress);
        }
      }
    } else {
      playerWrapper.style.display = 'none';
    }
  }
  
  // Only init music page features if on music page
  if (isMusicPage) {
    console.log('📄 On music page - full init');
    
    // Prevent form submit
    const searchForm = document.querySelector('.search-input-wrapper form, form.search-input-wrapper');
    if (searchForm) {
      searchForm.addEventListener('submit', function (e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      });
      const successMessage = searchForm.querySelector('.w-form-done');
      const errorMessage = searchForm.querySelector('.w-form-fail');
      if (successMessage) successMessage.style.display = 'none';
      if (errorMessage) errorMessage.style.display = 'none';
      const formBlock = searchForm.querySelector('.w-form');
      if (formBlock) formBlock.style.display = 'block';
    }
    
    // Initialize filter features
    initFilterAccordions();
    initCheckboxTextColor();
    initFilterItemBackground();
    initDynamicTagging();
    initMutualExclusion();
    initSearchAndFilters();
    
    // Fetch and display
    const songs = await fetchSongs();
    displaySongs(songs);
    initMasterPlayer();
  } else {
    console.log('📄 Not on music page');
  }
}

/**
 * ============================================================
 * FILTER ACCORDIONS
 * ============================================================
 */
function initFilterAccordions() {
  document.querySelectorAll('.filter-header').forEach(header => {
    // Remove old listeners by cloning
    const newHeader = header.cloneNode(true);
    header.parentNode.replaceChild(newHeader, header);
    
    newHeader.addEventListener('click', function() {
      const content = this.nextElementSibling;
      const arrow = this.querySelector('.arrow-icon');
      const isOpen = content.classList.contains('open');
      
      document.querySelectorAll('.filter-list').forEach(list => {
        list.style.maxHeight = '0px';
        list.classList.remove('open');
      });
      
      document.querySelectorAll('.arrow-icon').forEach(arr => {
        arr.style.transform = 'rotate(0deg)';
      });
      
      if (!isOpen) {
        const actualHeight = Math.min(content.scrollHeight, 300);
        content.style.maxHeight = actualHeight + 'px';
        content.classList.add('open');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      }
    });
  });
}

/**
 * ============================================================
 * CHECKBOX TEXT COLOR
 * ============================================================
 */
function initCheckboxTextColor() {
  document.querySelectorAll('.checkbox-include-wrapper input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const label = this.parentElement.querySelector('.w-form-label');
      if (label) {
        if (this.checked) {
          label.style.color = '#191919';
        } else {
          label.style.color = '';
        }
      }
    });
  });
}

/**
 * ============================================================
 * FILTER ITEM BACKGROUND
 * ============================================================
 */
function initFilterItemBackground() {
  setTimeout(function() {
    let checkboxes = document.querySelectorAll('.checkbox-wrapper input[type="checkbox"]');
    if (checkboxes.length === 0) checkboxes = document.querySelectorAll('.checkbox-include input');
    if (checkboxes.length === 0) checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    function updateBackgroundColor(checkbox) {
      const filterItem = checkbox.closest('.filter-item');
      if (checkbox.checked) {
        if (filterItem) filterItem.classList.add('is-selected');
      } else {
        if (filterItem) filterItem.classList.remove('is-selected');
      }
    }
    
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        updateBackgroundColor(this);
      });
    });
  }, 100);
}

/**
 * ============================================================
 * DYNAMIC TAGGING WITH DESELECTABLE RADIOS
 * ============================================================
 */
function initDynamicTagging() {
  setTimeout(function() {
    const tagsContainer = document.querySelector('.filter-tags-container');
    if (!tagsContainer) return;
    
    const checkboxes = document.querySelectorAll('.filter-list input[type="checkbox"], .checkbox-single-select-wrapper input[type="checkbox"]');
    const radioWrappers = document.querySelectorAll('.filter-list label.radio-wrapper, .filter-list .w-radio');
    
    function createTag(input, labelText) {
      const tag = document.createElement('div');
      tag.className = 'filter-tag';
      tag.innerHTML = `
        <span class="filter-tag-text">${labelText}</span>
        <span class="filter-tag-remove x-button-style">×</span>
      `;
      tag.querySelector('.filter-tag-remove').addEventListener('click', function() {
        input.checked = false;
        const wrapper = input.closest('.radio-wrapper, .w-radio, .checkbox-single-select-wrapper');
        if (wrapper) wrapper.classList.remove('is-active');
        input.dispatchEvent(new Event('change', { bubbles: true }));
        tag.remove();
      });
      return tag;
    }

    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        let label;
        const wrapper = this.closest('.checkbox-single-select-wrapper, .checkbox-include, .checkbox-exclude, .w-checkbox');
        if (this.closest('.checkbox-single-select-wrapper')) {
          label = this.closest('.checkbox-single-select-wrapper').querySelector('.filter-single-select-text');
        } else {
          label = wrapper ? wrapper.querySelector('.w-form-label, .filter-text') : null;
        }
        const labelText = label ? label.textContent.trim() : 'Filter';
        if (this.checked) {
          if (wrapper) wrapper.classList.add('is-active');
          const tag = createTag(this, labelText);
          tagsContainer.appendChild(tag);
        } else {
          if (wrapper) wrapper.classList.remove('is-active');
          const tags = tagsContainer.querySelectorAll('.filter-tag');
          tags.forEach(tag => {
            if (tag.querySelector('.filter-tag-text').textContent === labelText) tag.remove();
          });
        }
      });
    });

    radioWrappers.forEach(wrapper => {
      wrapper.addEventListener('mousedown', function() {
        const radio = this.querySelector('input[type="radio"]');
        if (radio) this.dataset.wasChecked = radio.checked;
      });

      wrapper.addEventListener('click', function() {
        const radio = this.querySelector('input[type="radio"]');
        const label = this.querySelector('.radio-button-label');
        if (!radio || !label) return;
        const labelText = label.innerText.trim();
        const radioName = radio.name;

        setTimeout(() => {
          if (this.dataset.wasChecked === "true") {
            radio.checked = false;
            this.classList.remove('is-active');
            const tags = tagsContainer.querySelectorAll('.filter-tag');
            tags.forEach(tag => { if (tag.dataset.radioName === radioName) tag.remove(); });
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            document.querySelectorAll(`input[name="${radioName}"]`).forEach(r => {
              const otherWrapper = r.closest('.radio-wrapper, .w-radio');
              if (otherWrapper) otherWrapper.classList.remove('is-active');
            });
            this.classList.add('is-active');
            const tags = tagsContainer.querySelectorAll('.filter-tag');
            tags.forEach(tag => { if (tag.dataset.radioName === radioName) tag.remove(); });
            const tag = createTag(radio, labelText);
            tag.dataset.radioName = radioName;
            tagsContainer.appendChild(tag);
          }
        }, 50);
      });
    });
  }, 100);
}

/**
 * ============================================================
 * MUTUAL EXCLUSION
 * ============================================================
 */
function initMutualExclusion() {
  const instWrapper = document.querySelector('[data-exclusive="instrumental"]');
  const acapWrapper = document.querySelector('[data-exclusive="acapella"]');
  const instInput = instWrapper ? instWrapper.querySelector('input[type="checkbox"]') : null;
  const acapInput = acapWrapper ? acapWrapper.querySelector('input[type="checkbox"]') : null;

  if (instInput && acapInput) {
    function clearOther(otherInput, otherWrapper) {
      if (otherInput.checked) {
        otherInput.checked = false;
        if (otherWrapper) otherWrapper.classList.remove('is-active');
        otherInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    instInput.addEventListener('change', function() {
      if (this.checked) clearOther(acapInput, acapWrapper);
    });
    acapInput.addEventListener('change', function() {
      if (this.checked) clearOther(instInput, instWrapper);
    });
  }
}

/**
 * ============================================================
 * SEARCH AND FILTERS
 * ============================================================
 */
function initSearchAndFilters() {
  const g = window.musicPlayerPersistent;
  
  function toggleClearButton() {
    const clearBtn = document.querySelector('.circle-x');
    const searchBar = document.querySelector('[data-filter-search="true"]');
    const filterInputs = document.querySelectorAll('[data-filter-group]');
    
    if (!clearBtn) return;

    const hasSearch = searchBar && searchBar.value.trim().length > 0;
    const hasFilters = Array.from(filterInputs).some(input => input.checked);

    clearBtn.style.display = (hasSearch || hasFilters) ? 'flex' : 'none';
  }

  function clearAllFilters() {
    const searchBar = document.querySelector('[data-filter-search="true"]');
    const filterInputs = document.querySelectorAll('[data-filter-group]');
    
    if (searchBar) searchBar.value = '';

    const tagRemoveButtons = document.querySelectorAll('.filter-tag-remove');
    if (tagRemoveButtons.length > 0) {
      tagRemoveButtons.forEach(btn => btn.click());
    } else {
      filterInputs.forEach(input => {
        input.checked = false;
        const parent = input.closest('.w-checkbox') || input.parentElement;
        if (parent) {
          const visualCheckbox = parent.querySelector('.w-checkbox-input');
          if (visualCheckbox) visualCheckbox.classList.remove('w--redirected-checked');
        }
      });
    }
    
    toggleClearButton();
    applyFilters();
  }

  function applyFilters() {
    const searchBar = document.querySelector('[data-filter-search="true"]');
    const filterInputs = document.querySelectorAll('[data-filter-group]');
    const query = searchBar ? searchBar.value.toLowerCase().trim() : '';
    const keywords = query.split(/\s+/).filter(k => k.length > 0);
    const selectedFilters = [];
    
    filterInputs.forEach(input => {
      if (input.checked) {
        selectedFilters.push({
          group: input.getAttribute('data-filter-group'),
          value: input.getAttribute('data-filter-value').toLowerCase()
        });
      }
    });

    const visibleIds = g.MASTER_DATA.filter(record => {
      const fields = record.fields;
      const allText = Object.values(fields).map(v => String(v)).join(' ').toLowerCase();
      const matchesSearch = keywords.every(k => allText.includes(k));
      const matchesAttributes = selectedFilters.every(filter => {
        let recVal = fields[filter.group];
        if (recVal === undefined || recVal === null) return false;
        if (Array.isArray(recVal)) return recVal.some(v => String(v).toLowerCase() === filter.value);
        return String(recVal).toLowerCase() === filter.value;
      });
      return matchesSearch && matchesAttributes;
    }).map(r => r.id);

    document.querySelectorAll('.song-wrapper').forEach(card => {
      card.style.display = visibleIds.includes(card.dataset.songId) ? 'flex' : 'none';
    });
    
    toggleClearButton();
  }

  // Setup listeners
  const clearBtn = document.querySelector('.circle-x');
  if (clearBtn) {
    clearBtn.style.display = 'none';
    clearBtn.addEventListener('click', clearAllFilters);
  }

  const searchBar = document.querySelector('[data-filter-search="true"]');
  if (searchBar) {
    searchBar.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.stopPropagation();
      }
    });
    searchBar.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      toggleClearButton();
      searchTimeout = setTimeout(applyFilters, 400);
    });
  }
  
  document.querySelectorAll('[data-filter-group]').forEach(input => {
    input.addEventListener('change', () => {
      applyFilters();
      toggleClearButton();
    });
  });
}

/**
 * ============================================================
 * LOAD & BARBA
 * ============================================================
 */
window.addEventListener('load', () => {
  initMusicPage();
});

if (typeof barba !== 'undefined') {
  barba.init({
    prevent: ({ el }) => el.classList && el.classList.contains('no-barba'),
    transitions: [{
      name: 'default',
      
      beforeLeave(data) {
        const isMusicPage = !!data.current.container.querySelector('.music-list-wrapper');
        if (isMusicPage && window.musicPlayerPersistent.currentWavesurfer) {
          window.musicPlayerPersistent.currentTime = window.musicPlayerPersistent.currentWavesurfer.getCurrentTime();
          window.musicPlayerPersistent.currentDuration = window.musicPlayerPersistent.currentWavesurfer.getDuration();
          window.musicPlayerPersistent.isPlaying = window.musicPlayerPersistent.currentWavesurfer.isPlaying();
          const currentD = waveformData.find(d => d.wavesurfer === window.musicPlayerPersistent.currentWavesurfer);
          if (currentD) {
            const persistentDiv = document.createElement('div');
            persistentDiv.style.display = 'none';
            document.body.appendChild(persistentDiv);
            persistentDiv.appendChild(currentD.waveformContainer);
            window.musicPlayerPersistent.persistedWaveformContainer = currentD.waveformContainer;
          }
        }
        if (isMusicPage) {
          allWavesurfers.forEach(ws => {
            if (ws !== window.musicPlayerPersistent.currentWavesurfer) ws.destroy();
          });
          allWavesurfers = allWavesurfers.filter(ws => ws === window.musicPlayerPersistent.currentWavesurfer);
          waveformData = waveformData.filter(d => d.wavesurfer === window.musicPlayerPersistent.currentWavesurfer);
        }
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.body.style.height = '';
        return Promise.resolve();
      },

      beforeEnter(data) {
        const nextContainer = data.next.container;
        const isMusicPage = !!nextContainer.querySelector('.music-list-wrapper');
        const g = window.musicPlayerPersistent;

        if (!isMusicPage) {
          document.body.style.overflow = 'visible';
          document.documentElement.style.overflow = 'visible';
          document.body.style.height = 'auto';
          nextContainer.style.overflow = 'visible';
          
          const mainContent = nextContainer.querySelector('.main-content');
          if (mainContent) mainContent.style.overflow = 'visible';
        } else {
          document.body.style.overflow = 'hidden';
          document.documentElement.style.overflow = 'hidden';
          document.body.style.height = '100vh';
          nextContainer.style.overflow = 'hidden';
          
          const musicArea = nextContainer.querySelector('.music-area-wrapper');
          if (musicArea) musicArea.style.overflow = 'hidden';
        }

        // Force player visibility
        const playerWrapper = nextContainer.querySelector('.music-player-wrapper');
        if (playerWrapper && g.hasActiveSong) {
          playerWrapper.style.display = 'flex';
          playerWrapper.style.alignItems = 'center';
        }
      },

      enter(data) {
        return initMusicPage();
      },

      after(data) {
        window.scrollTo(0, 0);
        if (window.Webflow) {
          try {
            window.Webflow.destroy();
            window.Webflow.ready();
            window.Webflow.require('ix2').init();
          } catch (e) {}
        }
        setTimeout(() => {
          updateMasterPlayerVisibility();
          window.dispatchEvent(new Event('scroll'));
          window.dispatchEvent(new Event('resize'));
          window.dispatchEvent(new CustomEvent('barbaAfterTransition', {
            detail: {
              url: window.location.pathname,
              isMusicPage: !!document.querySelector('.music-list-wrapper')
            }
          }));
        }, 100);
      }
    }]
  });
}
