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
    currentTime: 0,
    currentDuration: 0,
    hasActiveSong: false,
    persistedWaveformContainer: null,
    standaloneAudio: null,
    MASTER_DATA: [],
    allWavesurfers: [],
    waveformData: []
  };
}

// Local variables that reset per page load
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
 * STANDALONE AUDIO PLAYER (for non-music pages)
 * ============================================================
 */
function navigateStandaloneTrack(direction) {
  const g = window.musicPlayerPersistent;
  
  if (!g.currentSongData || g.MASTER_DATA.length === 0) return;
  
  const currentIndex = g.MASTER_DATA.findIndex(r => r.id === g.currentSongData.id);
  if (currentIndex === -1) return;
  
  let nextIndex = -1;
  
  if (direction === 'next') {
    nextIndex = currentIndex + 1;
    if (nextIndex >= g.MASTER_DATA.length) return;
  } else {
    nextIndex = currentIndex - 1;
    if (nextIndex < 0) return;
  }
  
  const nextSong = g.MASTER_DATA[nextIndex];
  const audioUrl = nextSong.fields['R2 Audio URL'];
  
  if (!audioUrl) return;
  
  console.log('🛑 Stopping current track');
  console.log('🎵 Loading new song:', nextSong.fields['Song Title']);
  
  // Update song data FIRST
  g.currentSongData = nextSong;
  g.hasActiveSong = true;
  
  // Update player UI
  updateMasterPlayerInfo(nextSong, null);
  updateMasterPlayerVisibility();
  
  // REUSE the same audio element - just change the source
  if (g.standaloneAudio) {
    // Pause current playback
    g.standaloneAudio.pause();
    
    // Change the source
    g.standaloneAudio.src = audioUrl;
    
    // Load and play
    g.standaloneAudio.load();
    g.standaloneAudio.play().catch(err => console.error('Playback error:', err));
    
  } else {
    // First time - create the audio element
    const audio = new Audio(audioUrl);
    g.standaloneAudio = audio;
    
    // Setup event listeners ONCE
    audio.addEventListener('loadedmetadata', () => {
      g.currentDuration = audio.duration;
      const masterDuration = document.querySelector('.player-duration');
      if (masterDuration) {
        masterDuration.textContent = formatDuration(audio.duration);
      }
      console.log('📊 Audio loaded, duration:', g.currentDuration);
    });
    
    audio.addEventListener('timeupdate', () => {
      g.currentTime = audio.currentTime;
      const masterCounter = document.querySelector('.player-duration-counter');
      if (masterCounter) {
        masterCounter.textContent = formatDuration(audio.currentTime);
      }
      if (g.currentPeaksData && g.currentDuration > 0) {
        const progress = audio.currentTime / audio.duration;
        drawMasterWaveform(g.currentPeaksData, progress);
      }
    });
    
    audio.addEventListener('play', () => {
      g.isPlaying = true;
      updateMasterControllerIcons(true);
      console.log('▶️ Standalone audio playing');
    });
    
    audio.addEventListener('pause', () => {
      g.isPlaying = false;
      updateMasterControllerIcons(false);
      console.log('⏸️ Standalone audio paused');
    });
    
    audio.addEventListener('ended', () => {
      navigateStandaloneTrack('next');
    });
    
    audio.addEventListener('error', (e) => {
      console.error('❌ Audio error:', e);
    });
    
    // Play the audio
    audio.play().catch(err => console.error('Playback error:', err));
  }
  
  g.isPlaying = true;
  updateMasterControllerIcons(true);
  
  // Clear peaks data
  g.currentPeaksData = null;
  drawMasterWaveform(null, 0);
}

/**
 * ============================================================
 * MASTER PLAYER VISIBILITY CONTROL
 * ============================================================
 */
function updateMasterPlayerVisibility() {
  const g = window.musicPlayerPersistent;
  const playerWrapper = document.querySelector('.music-player-wrapper');
  if (!playerWrapper) return;
  playerWrapper.style.display = g.hasActiveSong ? 'flex' : 'none';
  playerWrapper.style.alignItems = 'center';
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
        masterStemsWrapper.style.display = 'none';
      }
    } else {
      masterStemsWrapper.style.display = 'none';
    }
  }
}

function updateMasterPlayerInfo(song, wavesurfer) {
  const g = window.musicPlayerPersistent;
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
    let duration = 0;
    if (wavesurfer) {
      duration = wavesurfer.getDuration();
    } else if (g.standaloneAudio) {
      duration = g.standaloneAudio.duration || g.currentDuration;
    } else {
      duration = g.currentDuration;
    }
    masterDuration.textContent = duration > 0 ? formatDuration(duration) : '--:--';
  }
  
  if (masterCounter) {
    let counterTime = 0;
    if (wavesurfer) {
      counterTime = wavesurfer.getCurrentTime();
    } else if (g.standaloneAudio) {
      counterTime = g.standaloneAudio.currentTime;
    } else {
      counterTime = g.currentTime;
    }
    masterCounter.textContent = formatDuration(counterTime);
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
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const newProgress = clickX / rect.width;
      
      if (g.currentWavesurfer) {
        const wasPlaying = g.currentWavesurfer.isPlaying();
        g.currentWavesurfer.seekTo(newProgress);
        if (wasPlaying) {
          setTimeout(() => {
            if (!g.currentWavesurfer.isPlaying()) {
              g.currentWavesurfer.play().catch(() => {});
            }
          }, 50);
        }
      } else if (g.standaloneAudio) {
        g.standaloneAudio.currentTime = newProgress * g.standaloneAudio.duration;
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
  
  // Stop standalone audio if it's playing
  if (g.standaloneAudio) {
    g.standaloneAudio.pause();
    g.standaloneAudio = null;
  }
  
  g.currentWavesurfer = wavesurfer;
  g.currentSongData = songData;
  g.hasActiveSong = true;
  
  updateMasterPlayerVisibility();
  
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
    } else if (g.standaloneAudio) {
      if (g.standaloneAudio.paused) {
        g.standaloneAudio.play();
      } else {
        g.standaloneAudio.pause();
      }
    }
  };
  
  if (masterPlayButton) masterPlayButton.onclick = handlePlayPause;
  if (controllerPlay) controllerPlay.onclick = handlePlayPause;
  if (controllerPause) controllerPause.onclick = handlePlayPause;
  
  const navigateTrack = (direction) => {
    // If on music page with waveforms
    if (g.allWavesurfers.length > 0 && g.currentWavesurfer) {
      const currentIndex = g.allWavesurfers.indexOf(g.currentWavesurfer);
      let targetWS = null;
      
      if (direction === 'next') {
        for (let i = currentIndex + 1; i < g.allWavesurfers.length; i++) {
          const data = g.waveformData.find(d => d.wavesurfer === g.allWavesurfers[i]);
          if (data && data.cardElement.offsetParent !== null) {
            targetWS = g.allWavesurfers[i];
            break;
          }
        }
      } else {
        for (let i = currentIndex - 1; i >= 0; i--) {
          const data = g.waveformData.find(d => d.wavesurfer === g.allWavesurfers[i]);
          if (data && data.cardElement.offsetParent !== null) {
            targetWS = g.allWavesurfers[i];
            break;
          }
        }
      }
      
      if (targetWS) {
        const wasPlaying = g.currentWavesurfer.isPlaying();
        const prevData = g.waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
        if (prevData?.cardElement.querySelector('.play-button')) {
          prevData.cardElement.querySelector('.play-button').style.opacity = '0';
        }
        g.currentWavesurfer.pause();
        g.currentWavesurfer.seekTo(0);
        g.currentWavesurfer = targetWS;
        const nextData = g.waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
        if (nextData?.cardElement.querySelector('.play-button')) {
          nextData.cardElement.querySelector('.play-button').style.opacity = '1';
        }
        scrollToSelected(nextData.cardElement);
        if (wasPlaying) targetWS.play();
        else syncMasterTrack(targetWS, nextData.songData, 0);
      }
    } else {
      // Not on music page - use standalone audio navigation
      navigateStandaloneTrack(direction);
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
  updateMasterPlayerVisibility();
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
      cardElement.addEventListener('mouseleave', () => {
        const ws = g.waveformData.find(d => d.cardElement === cardElement)?.wavesurfer;
        if (!ws || (!ws.isPlaying() && ws.getCurrentTime() === 0)) playButton.style.opacity = '0';
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
      // Stop standalone audio if playing
      if (g.standaloneAudio) {
        g.standaloneAudio.pause();
        g.standaloneAudio = null;
      }
      
      g.allWavesurfers.forEach(ws => {
        if (ws !== wavesurfer && ws.isPlaying()) {
          ws.pause();
          ws.seekTo(0);
        }
      });
      
      g.waveformData.forEach(data => {
        if (data.wavesurfer !== wavesurfer) {
          updatePlayPauseIcons(data.cardElement, false);
          const pb = data.cardElement.querySelector('.play-button');
          if (pb) pb.style.opacity = '0';
        }
      });
      
      g.currentWavesurfer = wavesurfer;
      g.isPlaying = true;
      g.hasActiveSong = true;
      lastPlayState = true;
      updatePlayPauseIcons(cardElement, true);
      updateMasterControllerIcons(true);
      updatePlayButtonVisibility(cardElement, wavesurfer);
      syncMasterTrack(wavesurfer, songData);
      updateMasterPlayerVisibility();
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
        g.currentTime = currentTime;
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
      g.currentTime = 0;
      updateMasterControllerIcons(false);
      
      const currentIndex = g.allWavesurfers.indexOf(wavesurfer);
      let nextWavesurfer = null;
      for (let i = currentIndex + 1; i < g.allWavesurfers.length; i++) {
        const data = g.waveformData.find(d => d.wavesurfer === g.allWavesurfers[i]);
        if (data && data.cardElement.offsetParent !== null) {
          nextWavesurfer = g.allWavesurfers[i];
          break;
        }
      }
      if (nextWavesurfer) {
        g.currentWavesurfer = nextWavesurfer;
        setTimeout(() => {
          nextWavesurfer.play().catch(() => {});
        }, 100);
      }
    });
    
    g.allWavesurfers.push(wavesurfer);
    g.waveformData.push({
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
            g.hasActiveSong = true;
            updateMasterPlayerVisibility();
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
        g.hasActiveSong = true;
        updateMasterPlayerVisibility();
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
        const duration = wavesurfer.getDuration();
        const currentTime = newProgress * duration;
        g.currentTime = currentTime;
        const masterCounter = document.querySelector('.music-player-wrapper .player-duration-counter');
        if (masterCounter) {
          masterCounter.textContent = formatDuration(currentTime);
        }
      }
    });
  });
}

/**
 * ============================================================
 * FETCH & DISPLAY SONGS
 * ============================================================
 */
async function fetchSongs() {
  const g = window.musicPlayerPersistent;
  
  if (g.MASTER_DATA.length > 0) {
    console.log('Using cached MASTER_DATA');
    return g.MASTER_DATA;
  }
  
  try {
    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}?view=${VIEW_ID}`, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`
      }
    });
    const data = await response.json();
    g.MASTER_DATA = data.records;
    console.log(`Fetched ${g.MASTER_DATA.length} songs from Airtable`);
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
  if (window.Webflow && window.Webflow.destroy && window.Webflow.ready) {
    window.Webflow.destroy();
    window.Webflow.ready();
    window.Webflow.require('ix2').init();
  }
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
  if (activeEl.tagName === 'TEXTAREA' || (activeEl.tagName === 'INPUT' && !['checkbox', 'radio'].includes(activeEl.type))) return;
  
  if (e.code === 'Space') {
    e.preventDefault();
    e.stopImmediatePropagation();
    
    if (g.currentWavesurfer) {
      g.currentWavesurfer.playPause();
    } else if (g.standaloneAudio) {
      if (g.standaloneAudio.paused) {
        g.standaloneAudio.play();
      } else {
        g.standaloneAudio.pause();
      }
    }
    return false;
  }
  
  if (['ArrowDown', 'ArrowUp'].includes(e.code)) {
    e.preventDefault();
    
    // If on music page with waveforms
    if (g.allWavesurfers.length > 0 && g.currentWavesurfer) {
      const currentIndex = g.allWavesurfers.indexOf(g.currentWavesurfer);
      let nextWS = null;
      if (e.code === 'ArrowDown') {
        for (let i = currentIndex + 1; i < g.allWavesurfers.length; i++) {
          const d = g.waveformData.find(wf => wf.wavesurfer === g.allWavesurfers[i]);
          if (d && d.cardElement.offsetParent !== null) { nextWS = g.allWavesurfers[i]; break; }
        }
      } else {
        for (let i = currentIndex - 1; i >= 0; i--) {
          const d = g.waveformData.find(wf => wf.wavesurfer === g.allWavesurfers[i]);
          if (d && d.cardElement.offsetParent !== null) { nextWS = g.allWavesurfers[i]; break; }
        }
      }
      if (nextWS) {
        const wasPlaying = g.currentWavesurfer.isPlaying();
        const prevData = g.waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
        if (prevData?.cardElement.querySelector('.play-button')) {
          prevData.cardElement.querySelector('.play-button').style.opacity = '0';
        }
        g.currentWavesurfer.pause();
        g.currentWavesurfer.seekTo(0);
        g.currentWavesurfer = nextWS;
        const nextD = g.waveformData.find(wf => wf.wavesurfer === nextWS);
        if (nextD?.cardElement.querySelector('.play-button')) {
          nextD.cardElement.querySelector('.play-button').style.opacity = '1';
        }
        scrollToSelected(nextD.cardElement);
        if (wasPlaying) g.currentWavesurfer.play();
        else syncMasterTrack(g.currentWavesurfer, nextD.songData, 0);
      }
    } else {
      // Not on music page - use standalone navigation
      navigateStandaloneTrack(e.code === 'ArrowDown' ? 'next' : 'prev');
    }
  }
}, true);

/**
 * ============================================================
 * MAIN INITIALIZATION
 * ============================================================
 */
async function initMusicPage() {
  const g = window.musicPlayerPersistent;
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  
  // Ensure MASTER_DATA is loaded
  if (g.MASTER_DATA.length === 0) {
    await fetchSongs();
  }
  
  updateMasterPlayerVisibility();
  
  if (g.hasActiveSong && g.currentSongData) {
    updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
    updateMasterControllerIcons(g.isPlaying);
    if (g.currentPeaksData && g.currentWavesurfer) {
      const prog = g.currentWavesurfer.getCurrentTime() / g.currentWavesurfer.getDuration() || 0;
      drawMasterWaveform(g.currentPeaksData, prog);
    } else if (g.currentPeaksData) {
      const prog = g.currentTime / g.currentDuration || 0;
      drawMasterWaveform(g.currentPeaksData, prog);
    }
  }

  if (isMusicPage) {
    const searchForm = document.querySelector('.search-input-wrapper form, form.search-input-wrapper');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
    }
    initFilterAccordions();
    initCheckboxTextColor();
    initFilterItemBackground();
    initDynamicTagging();
    initMutualExclusion();
    initSearchAndFilters();
    const songs = await fetchSongs();
    displaySongs(songs);
    initMasterPlayer();
  } else {
    // Still init master player controls for navigation
    initMasterPlayer();
  }
}

/**
 * ============================================================
 * FILTER HELPERS
 * ============================================================
 */
function initFilterAccordions() {
  document.querySelectorAll('.filter-header').forEach(header => {
    const newHeader = header.cloneNode(true);
    header.parentNode.replaceChild(newHeader, header);
    
    newHeader.addEventListener('click', function() {
      const content = this.nextElementSibling;
      const arrow = this.querySelector('.arrow-icon');
      const isOpen = content.classList.contains('open');
      document.querySelectorAll('.filter-list').forEach(l => { l.style.maxHeight = '0px'; l.classList.remove('open'); });
      document.querySelectorAll('.arrow-icon').forEach(a => a.style.transform = 'rotate(0deg)');
      if (!isOpen) {
        content.style.maxHeight = Math.min(content.scrollHeight, 300) + 'px';
        content.classList.add('open');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
      }
    });
  });
}

function initCheckboxTextColor() {
  document.querySelectorAll('.checkbox-include-wrapper input[type="checkbox"]').forEach(c => {
    c.addEventListener('change', function() {
      const l = this.parentElement.querySelector('.w-form-label');
      if (l) l.style.color = this.checked ? '#191919' : '';
    });
  });
}

function initFilterItemBackground() {
  setTimeout(() => {
    document.querySelectorAll('input[type="checkbox"]').forEach(c => {
      c.addEventListener('change', function() {
        const fi = this.closest('.filter-item');
        if (fi) this.checked ? fi.classList.add('is-selected') : fi.classList.remove('is-selected');
      });
    });
  }, 100);
}

function initDynamicTagging() {
  setTimeout(() => {
    const container = document.querySelector('.filter-tags-container');
    if (!container) return;
    document.querySelectorAll('.filter-list input[type="checkbox"]').forEach(c => {
      c.addEventListener('change', function() {
        const label = this.closest('.checkbox-single-select-wrapper, .w-checkbox')?.querySelector('.filter-single-select-text, .w-form-label')?.textContent.trim() || 'Filter';
        if (this.checked) {
          const tag = document.createElement('div');
          tag.className = 'filter-tag';
          tag.innerHTML = `<span class="filter-tag-text">${label}</span><span class="filter-tag-remove x-button-style">×</span>`;
          tag.querySelector('.filter-tag-remove').addEventListener('click', () => { this.checked = false; this.dispatchEvent(new Event('change', { bubbles: true })); tag.remove(); });
          container.appendChild(tag);
        } else {
          container.querySelectorAll('.filter-tag').forEach(t => { if (t.querySelector('.filter-tag-text').textContent === label) t.remove(); });
        }
      });
    });
  }, 100);
}

function initMutualExclusion() {
  const inst = document.querySelector('[data-exclusive="instrumental"] input');
  const acap = document.querySelector('[data-exclusive="acapella"] input');
  if (inst && acap) {
    inst.addEventListener('change', () => { if (inst.checked && acap.checked) { acap.checked = false; acap.dispatchEvent(new Event('change', { bubbles: true })); } });
    acap.addEventListener('change', () => { if (acap.checked && inst.checked) { inst.checked = false; inst.dispatchEvent(new Event('change', { bubbles: true })); } });
  }
}

function initSearchAndFilters() {
  const g = window.musicPlayerPersistent;
  const searchBar = document.querySelector('[data-filter-search="true"]');
  const clearBtn = document.querySelector('.circle-x');
  
  const apply = () => {
    const query = searchBar ? searchBar.value.toLowerCase().trim() : '';
    const keywords = query.split(/\s+/).filter(k => k.length > 0);
    const filters = Array.from(document.querySelectorAll('[data-filter-group]')).filter(i => i.checked).map(i => ({ group: i.getAttribute('data-filter-group'), value: i.getAttribute('data-filter-value').toLowerCase() }));
    const ids = g.MASTER_DATA.filter(r => {
      const text = Object.values(r.fields).join(' ').toLowerCase();
      const mS = keywords.every(k => text.includes(k));
      const mF = filters.every(f => {
        let v = r.fields[f.group];
        return Array.isArray(v) ? v.some(val => String(val).toLowerCase() === f.value) : String(v).toLowerCase() === f.value;
      });
      return mS && mF;
    }).map(r => r.id);
    document.querySelectorAll('.song-wrapper').forEach(card => card.style.display = ids.includes(card.dataset.songId) ? 'flex' : 'none');
    if (clearBtn) clearBtn.style.display = (query || filters.length) ? 'flex' : 'none';
  };
  
  if (searchBar) searchBar.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(apply, 400); });
  document.querySelectorAll('[data-filter-group]').forEach(i => i.addEventListener('change', apply));
  if (clearBtn) clearBtn.addEventListener('click', () => { 
    if (searchBar) searchBar.value = ''; 
    document.querySelectorAll('[data-filter-group]').forEach(i => { i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); }); 
    apply(); 
  });
}

/**
 * ============================================================
 * BARBA.JS & PAGE TRANSITIONS
 * ============================================================
 */
window.addEventListener('load', () => initMusicPage());

if (typeof barba !== 'undefined') {
  barba.init({
    prevent: ({ el }) => el.classList && el.classList.contains('no-barba'),
    transitions: [{
      name: 'default',
      
     beforeLeave(data) {
  const g = window.musicPlayerPersistent;
  const isMusicPage = !!data.current.container.querySelector('.music-list-wrapper');
  
  console.log('🚪 beforeLeave - isMusicPage:', isMusicPage);
  console.log('🚪 currentWavesurfer:', g.currentWavesurfer);
  console.log('🚪 currentSongData:', g.currentSongData);
  console.log('🚪 isPlaying:', g.isPlaying);
  
  if (isMusicPage && g.currentWavesurfer) {
    console.log('💾 Leaving music page - converting to standalone audio');
    
    // Save current state
    g.currentTime = g.currentWavesurfer.getCurrentTime();
    g.currentDuration = g.currentWavesurfer.getDuration();
    const wasPlaying = g.currentWavesurfer.isPlaying();
    
    console.log('💾 Saved state - time:', g.currentTime, 'duration:', g.currentDuration, 'playing:', wasPlaying);
    
    // CRITICAL: Stop any existing standalone audio FIRST
    if (g.standaloneAudio) {
      console.log('🛑 Stopping existing standalone audio before conversion');
      try {
        g.standaloneAudio.pause();
        g.standaloneAudio.currentTime = 0;
        g.standaloneAudio.onloadedmetadata = null;
        g.standaloneAudio.ontimeupdate = null;
        g.standaloneAudio.onplay = null;
        g.standaloneAudio.onpause = null;
        g.standaloneAudio.onended = null;
        g.standaloneAudio.onerror = null;
        g.standaloneAudio.removeAttribute('src');
        g.standaloneAudio.load();
      } catch (e) {
        console.warn('Error stopping existing audio:', e);
      }
      g.standaloneAudio = null;
    }
    
    // Extract and preserve the audio element
    try {
      const mediaElement = g.currentWavesurfer.getMediaElement();
      console.log('💾 Media element:', mediaElement);
      
      if (mediaElement && g.currentSongData) {
        // Create standalone audio from the media element
        const audioUrl = g.currentSongData.fields['R2 Audio URL'];
        console.log('💾 Creating standalone audio from:', audioUrl);
        
        const audio = new Audio();
        audio.currentTime = g.currentTime;
        
        g.standaloneAudio = audio;
        
        // Setup event listeners
        audio.addEventListener('timeupdate', () => {
          g.currentTime = audio.currentTime;
          const masterCounter = document.querySelector('.player-duration-counter');
          if (masterCounter) {
            masterCounter.textContent = formatDuration(audio.currentTime);
          }
          
          // Update waveform if we have peaks
          if (g.currentPeaksData && g.currentDuration > 0) {
            const progress = audio.currentTime / g.currentDuration;
            drawMasterWaveform(g.currentPeaksData, progress);
          }
        });
        
        audio.addEventListener('loadedmetadata', () => {
          g.currentDuration = audio.duration;
          console.log('💾 Audio loaded, duration:', g.currentDuration);
        });
        
        audio.addEventListener('play', () => {
          g.isPlaying = true;
          updateMasterControllerIcons(true);
          console.log('▶️ Standalone audio playing');
        });
        
        audio.addEventListener('pause', () => {
          g.isPlaying = false;
          updateMasterControllerIcons(false);
          console.log('⏸️ Standalone audio paused');
        });
        
        audio.addEventListener('ended', () => {
          navigateStandaloneTrack('next');
        });
        
        // Load and resume playback if it was playing
        audio.src = audioUrl;
        audio.load();
        
        if (wasPlaying) {
          audio.play().catch(err => console.error('Resume playback error:', err));
        }
        
        console.log('✓ Converted to standalone audio');
      } else {
        console.warn('⚠️ Cannot create standalone audio - missing mediaElement or currentSongData');
      }
    } catch (e) {
      console.error('❌ Error creating standalone audio:', e);
    }
  }
  
  if (isMusicPage) {
    // Destroy ALL wavesurfers
    g.allWavesurfers.forEach(ws => ws.destroy());
    
    // Clear ALL waveform containers
    document.querySelectorAll('.waveform').forEach(container => {
      container.innerHTML = '';
    });
    
    // Clear the arrays
    g.allWavesurfers = [];
    g.waveformData = [];
    g.persistedWaveformContainer = null;
    g.currentWavesurfer = null;
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

        // Keep player visible if there's active audio
        updateMasterPlayerVisibility();
      },

      enter(data) {
        return initMusicPage();
      },

      after(data) {
        const g = window.musicPlayerPersistent;
        
        window.scrollTo(0, 0);
        
        if (window.Webflow) {
          try {
            window.Webflow.destroy();
            window.Webflow.ready();
            window.Webflow.require('ix2').init();
          } catch (e) {}
        }
        
        setTimeout(() => {
          // CRITICAL: Re-setup master player controls on EVERY page
          console.log('🎮 Setting up master player controls');
          setupMasterPlayerControls();
          
          // Update player visibility and UI
          updateMasterPlayerVisibility();
          
          // If we have active song data, update the player info
          if (g.currentSongData) {
            updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
            updateMasterControllerIcons(g.isPlaying);
          }
          
          window.dispatchEvent(new Event('scroll'));
          window.dispatchEvent(new Event('resize'));
          window.dispatchEvent(new CustomEvent('barbaAfterTransition'));
          
          console.log('✅ Transition complete - Controls ready');
        }, 200);
      }
    }]
  });
}
