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
    shouldAutoPlay: false,
    savedTime: 0,
    MASTER_DATA: [],
    allWavesurfers: [],
    waveformData: [],
    filtersInitialized: false,
    isTransitioning: false,
    autoPlayNext: false,
    wasPlayingBeforeHidden: false,
    filteredSongIds: []  
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
  const container = document.querySelector('.music-list-wrapper') || 
                    document.querySelector('.featured-songs-wrapper') ||
                    document.body;
  
  if (!list || !toggle) return;
  
  const containerRect = container.getBoundingClientRect();
  const toggleRect = toggle.getBoundingClientRect();
  const original = list.style.display;
  list.style.display = 'block';
  list.style.visibility = 'hidden';
  const listHeight = list.offsetHeight;
  list.style.display = original;
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
 * MASTER PLAYER POSITIONING - DO NOT MODIFY
 * ============================================================
 */
function positionMasterPlayer() {
  const playerWrapper = document.querySelector('.music-player-wrapper');
  if (!playerWrapper) return;
  
  playerWrapper.style.setProperty('position', 'fixed', 'important');
  playerWrapper.style.setProperty('bottom', '0px', 'important');
  playerWrapper.style.setProperty('left', '0px', 'important');
  playerWrapper.style.setProperty('right', '0px', 'important');
  playerWrapper.style.setProperty('top', 'auto', 'important');
  playerWrapper.style.setProperty('width', '100%', 'important');
  playerWrapper.style.setProperty('z-index', '9999', 'important');
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
  
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  const shouldShow = g.hasActiveSong || g.currentSongData || g.standaloneAudio || g.currentWavesurfer;
  
  positionMasterPlayer();
  
  if (shouldShow) {
    playerWrapper.style.display = 'flex';
    playerWrapper.style.visibility = 'visible';
    playerWrapper.style.opacity = '1';
    playerWrapper.style.alignItems = 'center';
    playerWrapper.style.pointerEvents = 'auto';
    
    if (isMusicPage) {
      const musicAreaContainer = document.querySelector('.music-area-container');
      if (musicAreaContainer) {
        musicAreaContainer.style.setProperty('padding-bottom', '77px', 'important');
      }
    }
  } else {
    playerWrapper.style.display = 'none';
    playerWrapper.style.visibility = 'hidden';
    playerWrapper.style.opacity = '0';
    
    if (isMusicPage) {
      const musicAreaContainer = document.querySelector('.music-area-container');
      if (musicAreaContainer) {
        musicAreaContainer.style.setProperty('padding-bottom', '0px', 'important');
      }
    }
  }
}

/**
 * ============================================================
 * MAIN INITIALIZATION
 * ============================================================
 */
async function initMusicPage() {
  const g = window.musicPlayerPersistent;
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  
  if (g.MASTER_DATA.length === 0) {
    await fetchSongs();
  }
  
  if (g.hasActiveSong && g.currentSongData) {
    updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
    updateMasterControllerIcons(g.isPlaying);
    updatePlayerCoverArtIcons(g.isPlaying);
    if (g.currentPeaksData && g.standaloneAudio) {
      const prog = g.currentTime / g.currentDuration || 0;
      drawMasterWaveform(g.currentPeaksData, prog);
    }
  }
  
  if (isMusicPage) {
    const searchForm = document.querySelector('.search-input-wrapper form, form.search-input-wrapper');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
    }
    
    if (!g.filtersInitialized) {
      initFilterAccordions();
      initCheckboxTextColor();
      initFilterItemBackground();
      initDynamicTagging();
      initMutualExclusion();
      initSearchAndFilters();
      g.filtersInitialized = true;
    }
    
    const songs = await fetchSongs();
    displaySongs(songs);
    initMasterPlayer();
    
    setTimeout(() => {
      positionMasterPlayer();
      updateMasterPlayerVisibility();
    }, 200);
  } else {
    initMasterPlayer();
    updateMasterPlayerVisibility();

    setTimeout(() => {
      const hasFeaturedSongs = !!document.querySelector('.featured-songs-wrapper');
      console.log('🏠 Checking for featured songs container:', hasFeaturedSongs);
      if (hasFeaturedSongs) {
        console.log('🎵 Calling displayFeaturedSongs...');
        displayFeaturedSongs(6);
      } else {
        console.log('⚠️ No featured songs container found');
      }
    }, 200);
  }
} 

/**
 * ============================================================
 * STANDALONE AUDIO PLAYER (for non-music pages)
 * ============================================================
 */
function navigateStandaloneTrack(direction) {
  console.log('🚨 NAVIGATION FUNCTION CALLED - Direction:', direction);
  
  const g = window.musicPlayerPersistent;
  
  console.log('🚨 CHECKING CONDITIONS:');
  console.log('   - g.currentSongData exists:', !!g.currentSongData);
  console.log('   - g.MASTER_DATA.length:', g.MASTER_DATA.length);
  
  if (!g.currentSongData || g.MASTER_DATA.length === 0) {
    console.log('🚨 RETURNING EARLY - conditions not met');
    return;
  }
  
  // Use filtered songs if available, otherwise use all songs
  const songsToNavigate = g.filteredSongIds && g.filteredSongIds.length > 0
    ? g.MASTER_DATA.filter(song => g.filteredSongIds.includes(song.id))
    : g.MASTER_DATA;
  
  console.log(`🎵 Navigation Debug:`);
  console.log(`   - Total songs in library: ${g.MASTER_DATA.length}`);
  console.log(`   - Filtered song IDs stored: ${g.filteredSongIds ? g.filteredSongIds.length : 0}`);
  console.log(`   - Songs to navigate through: ${songsToNavigate.length}`);
  console.log(`   - Using filters: ${g.filteredSongIds && g.filteredSongIds.length > 0}`);
  
  const currentIndex = songsToNavigate.findIndex(r => r.id === g.currentSongData.id);
  
  if (currentIndex === -1) {
    console.warn(`⚠️ Current song not found in navigation list!`);
    console.warn(`   - Current song ID: ${g.currentSongData.id}`);
    console.warn(`   - Current song: ${g.currentSongData.fields?.['Song Title']}`);
    return;
  }
  
  let nextIndex = -1;
  
  if (direction === 'next') {
    nextIndex = currentIndex + 1;
    if (nextIndex >= songsToNavigate.length) {
      console.log('🛑 Already at last song');
      return;
    }
  } else {
    nextIndex = currentIndex - 1;
    if (nextIndex < 0) {
      console.log('🛑 Already at first song');
      return;
    }
  }
  
  const nextSong = songsToNavigate[nextIndex];
  const audioUrl = nextSong.fields['R2 Audio URL'];
  
  console.log(`➡️ Navigating ${direction}: ${nextSong.fields?.['Song Title']}`);
  
  if (!audioUrl) return;
  
  const wasPlaying = g.isPlaying;
  
  if (g.standaloneAudio) {
    try {
      g.standaloneAudio.pause();
      g.standaloneAudio = null;
    } catch (e) {
      console.warn('Error cleaning up audio:', e);
      g.standaloneAudio = null;
    }
  }
  
  g.currentSongData = nextSong;
  g.hasActiveSong = true;
  
  updateMasterPlayerInfo(nextSong, null);
  
  const audio = new Audio(audioUrl);
  g.standaloneAudio = audio;
  
  audio.addEventListener('loadedmetadata', () => {
    if (g.standaloneAudio !== audio) return;
    
    g.currentDuration = audio.duration;
    const masterDuration = document.querySelector('.player-duration');
    if (masterDuration) {
      masterDuration.textContent = formatDuration(audio.duration);
    }
  });
  
  audio.addEventListener('timeupdate', () => {
    if (g.standaloneAudio !== audio) return;
    
    if (!audio.duration || !isFinite(audio.duration) || audio.duration === 0) return;
    if (!isFinite(audio.currentTime)) return;
    
    g.currentTime = audio.currentTime;
    const masterCounter = document.querySelector('.player-duration-counter');
    if (masterCounter) {
      masterCounter.textContent = formatDuration(audio.currentTime);
    }
    if (g.currentPeaksData && g.currentDuration > 0) {
      const progress = audio.currentTime / audio.duration;
      if (isFinite(progress)) {
        drawMasterWaveform(g.currentPeaksData, progress);
      }
    }
  });
  
  audio.addEventListener('play', () => {
    if (g.standaloneAudio !== audio) return;
    g.isPlaying = true;
    updateMasterControllerIcons(true);
    updatePlayerCoverArtIcons(true);
  });
  
  audio.addEventListener('pause', () => {
    if (g.standaloneAudio !== audio) return;
    g.isPlaying = false;
    updateMasterControllerIcons(false);
    updatePlayerCoverArtIcons(false);
  });
  
  audio.addEventListener('ended', () => {
    if (g.standaloneAudio !== audio) return;
    g.autoPlayNext = true;
    navigateStandaloneTrack('next');
  });
  
  audio.addEventListener('error', (e) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ AUDIO ERROR DETAILS:');
    console.error('Song:', nextSong?.fields?.['Song Title'] || 'Unknown');
    console.error('Artist:', nextSong?.fields?.['Artist'] || 'Unknown');
    console.error('Audio URL:', audioUrl);
    console.error('Error code:', audio.error?.code);
    console.error('Error message:', audio.error?.message);
    console.error('Network state:', audio.networkState);
    console.error('Ready state:', audio.readyState);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
  
  if (wasPlaying || g.autoPlayNext) {
    audio.play().catch(err => {
      if (err.name !== 'AbortError') {
        console.error('Playback error:', err);
      }
    });
    g.autoPlayNext = false;
  } else {
    g.isPlaying = false;
    updateMasterControllerIcons(false);
    updatePlayerCoverArtIcons(false);
  }

  const tempContainer = document.createElement('div');
  tempContainer.style.display = 'none';
  document.body.appendChild(tempContainer);
  
  const tempWavesurfer = WaveSurfer.create({
    container: tempContainer,
    waveColor: '#e2e2e2',
    progressColor: '#191919',
    height: 40,
    barWidth: 2,
    barGap: 1,
    normalize: true
  });
  
  tempWavesurfer.load(audioUrl);
  
  tempWavesurfer.on('decode', () => {
    try {
      const decodedData = tempWavesurfer.getDecodedData();
      if (decodedData) {
        g.currentPeaksData = decodedData.getChannelData(0);
        drawMasterWaveform(g.currentPeaksData, 0);
      }
    } catch (e) {
      console.error('Error getting peaks:', e);
    }
    
    try {
      tempWavesurfer.destroy();
      if (document.body.contains(tempContainer)) {
        document.body.removeChild(tempContainer);
      }
    } catch (e) {
      console.warn('Error cleaning up temp waveform:', e);
    }
  });
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
  const g = window.musicPlayerPersistent;
  
  if (g.isTransitioning) {
    return;
  }
  
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
      
      if (g.standaloneAudio) {
        g.standaloneAudio.currentTime = newProgress * g.standaloneAudio.duration;
      } else if (g.currentWavesurfer) {
        const wasPlaying = g.currentWavesurfer.isPlaying();
        g.currentWavesurfer.seekTo(newProgress);
        if (wasPlaying) {
          setTimeout(() => {
            if (!g.currentWavesurfer.isPlaying()) {
              g.currentWavesurfer.play().catch(() => {});
            }
          }, 50);
        }
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

function updatePlayerCoverArtIcons(isPlaying) {
  const playIcon = document.querySelector('.player-play-button .play-icon');
  const pauseIcon = document.querySelector('.player-play-button .pause-icon');
  if (playIcon && pauseIcon) {
    playIcon.style.display = isPlaying ? 'none' : 'block';
    pauseIcon.style.display = isPlaying ? 'block' : 'none';
  }
}

function syncMasterTrack(wavesurfer, songData, forcedProgress = null) {
  const g = window.musicPlayerPersistent;
  
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
    if (g.standaloneAudio) {
      if (g.standaloneAudio.paused) {
        g.standaloneAudio.play();
      } else {
        g.standaloneAudio.pause();
      }
    } else if (g.currentWavesurfer) {
      g.currentWavesurfer.playPause();
    }
  };
  
  if (masterPlayButton) masterPlayButton.onclick = handlePlayPause;
  if (controllerPlay) controllerPlay.onclick = handlePlayPause;
  if (controllerPause) controllerPause.onclick = handlePlayPause;

  // Add click handler for player cover art
const playerCoverArt = document.querySelector('.player-cover-art');
if (playerCoverArt) {
  playerCoverArt.style.cursor = 'pointer';
  playerCoverArt.onclick = handlePlayPause;
}
  
 const navigateTrack = (direction) => {
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  
  if (isMusicPage && g.allWavesurfers.length > 0 && g.currentWavesurfer) {
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
      const wasPlaying = g.isPlaying;
      const prevData = g.waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
      if (prevData?.cardElement.querySelector('.play-button')) {
        prevData.cardElement.querySelector('.play-button').style.opacity = '0';
      }
      
      if (g.standaloneAudio) {
        g.standaloneAudio.pause();
        g.standaloneAudio = null;
      }
      
      g.currentWavesurfer.seekTo(0);
      const nextData = g.waveformData.find(data => data.wavesurfer === targetWS);
      
      if (nextData?.cardElement.querySelector('.play-button')) {
        nextData.cardElement.querySelector('.play-button').style.opacity = '1';
      }
      scrollToSelected(nextData.cardElement);
      
      playStandaloneSong(nextData.audioUrl, nextData.songData, targetWS, nextData.cardElement, null, wasPlaying);
    }
  } else {
    // Not on music page or no waveforms - use standalone navigation
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
  
  const favoriteCheckbox = cardElement.querySelector('input[type="checkbox"]');
  if (favoriteCheckbox) {
    favoriteCheckbox.classList.add('favourite-checkbox');
  }
  
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

/**
 * ============================================================
 * LINK EXISTING STANDALONE AUDIO TO WAVEFORM
 * ============================================================
 */
function linkStandaloneToWaveform() {
  const g = window.musicPlayerPersistent;
  
  if (!g.standaloneAudio || !g.currentSongData) return;
  
  const matchingData = g.waveformData.find(data => data.songData.id === g.currentSongData.id);
  
  if (matchingData) {
    const { wavesurfer, cardElement } = matchingData;
    
    g.currentWavesurfer = wavesurfer;
    
    updatePlayPauseIcons(cardElement, g.isPlaying);
    const playButton = cardElement.querySelector('.play-button');
    if (playButton) playButton.style.opacity = '1';
    
    if (g.standaloneAudio.duration > 0) {
      const progress = g.standaloneAudio.currentTime / g.standaloneAudio.duration;
      wavesurfer.seekTo(progress);
    }
    
    const existingListener = g.standaloneAudio._waveformSyncListener;
    if (existingListener) {
      g.standaloneAudio.removeEventListener('timeupdate', existingListener);
    }
    
    const syncListener = () => {
      if (g.currentWavesurfer === wavesurfer && g.standaloneAudio && g.standaloneAudio.duration > 0) {
        const progress = g.standaloneAudio.currentTime / g.standaloneAudio.duration;
        wavesurfer.seekTo(progress);
      }
    };
    
    g.standaloneAudio._waveformSyncListener = syncListener;
    g.standaloneAudio.addEventListener('timeupdate', syncListener);
  }
}

/**
 * ============================================================
 * CREATE STANDALONE AUDIO FOR SONG
 * ============================================================
 */
function createStandaloneAudio(audioUrl, songData, wavesurfer, cardElement, seekToTime = null, shouldAutoPlay = true) {
  const g = window.musicPlayerPersistent;
  
  const audio = new Audio(audioUrl);
  g.standaloneAudio = audio;
  g.currentSongData = songData;
  g.currentWavesurfer = wavesurfer;
  g.hasActiveSong = true;
  
  audio.addEventListener('loadedmetadata', () => {
    g.currentDuration = audio.duration;
    
    if (seekToTime !== null && seekToTime < audio.duration) {
      audio.currentTime = seekToTime;
    }
  });
  
  audio.addEventListener('timeupdate', () => {
    g.currentTime = audio.currentTime;
    
    if (g.currentWavesurfer === wavesurfer && audio.duration > 0) {
      const progress = audio.currentTime / audio.duration;
      wavesurfer.seekTo(progress);
    }
    
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
    updatePlayPauseIcons(cardElement, true);
    updateMasterControllerIcons(true);
    updatePlayerCoverArtIcons(true);
    const playButton = cardElement.querySelector('.play-button');
    if (playButton) playButton.style.opacity = '1';
  });
  
  audio.addEventListener('pause', () => {
    g.isPlaying = false;
    updatePlayPauseIcons(cardElement, false);
    updateMasterControllerIcons(false);
    updatePlayerCoverArtIcons(false);
  });
  
  audio.addEventListener('ended', () => {
    updatePlayPauseIcons(cardElement, false);
    const pb = cardElement.querySelector('.play-button');
    if (pb) pb.style.opacity = '0';
    
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
      const nextData = g.waveformData.find(d => d.wavesurfer === nextWavesurfer);
      if (nextData) {
        playStandaloneSong(nextData.audioUrl, nextData.songData, nextWavesurfer, nextData.cardElement);
      }
    } else {
      g.autoPlayNext = true;
      navigateStandaloneTrack('next');
    }
  });
  
  audio.addEventListener('error', (e) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ AUDIO ERROR DETAILS:');
    console.error('Song:', songData?.fields?.['Song Title'] || 'Unknown');
    console.error('Artist:', songData?.fields?.['Artist'] || 'Unknown');
    console.error('Audio URL:', audioUrl);
    console.error('Error code:', audio.error?.code);
    console.error('Error message:', audio.error?.message);
    console.error('Network state:', audio.networkState);
    console.error('Ready state:', audio.readyState);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
  
  if (shouldAutoPlay) {
    audio.play().catch(err => console.error('Playback error:', err));
  }
  
  syncMasterTrack(wavesurfer, songData);
  updateMasterPlayerVisibility();
  
  return audio;
}

/**
 * ============================================================
 * PLAY STANDALONE SONG
 * ============================================================
 */
function playStandaloneSong(audioUrl, songData, wavesurfer, cardElement, seekToTime = null, shouldAutoPlay = true) {
  const g = window.musicPlayerPersistent;
  
  if (g.standaloneAudio && g.currentSongData?.id === songData.id) {
    if (shouldAutoPlay) {
      g.standaloneAudio.play().catch(err => console.error('Playback error:', err));
    }
    return;
  }
  
  if (g.standaloneAudio && g.currentSongData?.id !== songData.id) {
    g.standaloneAudio.pause();
    g.standaloneAudio = null;
  }
  
  g.allWavesurfers.forEach(ws => {
    if (ws !== wavesurfer) {
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
  
  createStandaloneAudio(audioUrl, songData, wavesurfer, cardElement, seekToTime, shouldAutoPlay);
}

/**
 * ============================================================
 * INITIALIZE WAVEFORMS WITH LAZY LOADING (BARBA-COMPATIBLE)
 * ============================================================
 */
function initializeWaveforms() {
  const g = window.musicPlayerPersistent;
  const songCards = document.querySelectorAll('.song-wrapper');
  
  const visibleCards = [];
  const notVisibleCards = [];
  
  const observer = new IntersectionObserver((entries) => {
    const cardsToLoad = [];
    
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const cardElement = entry.target;
        
        if (cardElement.dataset.waveformInitialized === 'true') {
          return;
        }
        
        cardsToLoad.push(cardElement);
        observer.unobserve(cardElement);
      }
    });
    
    if (cardsToLoad.length > 0) {
      loadWaveformBatch(cardsToLoad);
    }
  }, {
    root: document.querySelector('.music-list-wrapper'),
    rootMargin: '200px',
    threshold: 0
  });
  
  songCards.forEach((cardElement) => {
    const isInTemplate = cardElement.closest('.template-wrapper');
    const hasNoData = !cardElement.dataset.audioUrl || !cardElement.dataset.songId;
    
    if (isInTemplate || hasNoData) {
      return;
    }
    
    const waveformContainer = cardElement.querySelector('.waveform');
    if (waveformContainer) {
      waveformContainer.style.opacity = '0';
      waveformContainer.style.transition = 'opacity 0.6s ease-in-out';
    }
    
    const rect = cardElement.getBoundingClientRect();
    const container = document.querySelector('.music-list-wrapper');
    const containerRect = container ? container.getBoundingClientRect() : null;
    
    const isVisible = containerRect && 
                     rect.top < containerRect.bottom + 200 && 
                     rect.bottom > containerRect.top - 200;
    
    if (isVisible) {
      visibleCards.push(cardElement);
    } else {
      notVisibleCards.push(cardElement);
      observer.observe(cardElement);
    }
  });
  
  if (visibleCards.length > 0) {
    loadWaveformBatch(visibleCards);
  }
  
  setTimeout(() => linkStandaloneToWaveform(), 100);
  setTimeout(() => linkStandaloneToWaveform(), 300);
  setTimeout(() => linkStandaloneToWaveform(), 600);
}

/**
 * ============================================================
 * LOAD A BATCH OF WAVEFORMS AND FADE IN TOGETHER
 * ============================================================
 */
function loadWaveformBatch(cardElements) {
  const g = window.musicPlayerPersistent;
  const waveformPromises = [];
  const waveformContainers = [];
  
  cardElements.forEach((cardElement) => {
    const audioUrl = cardElement.dataset.audioUrl;
    const songId = cardElement.dataset.songId;
    const songData = JSON.parse(cardElement.dataset.songData || '{}');
    
    if (!audioUrl) return;
    
    const waveformContainer = cardElement.querySelector('.waveform');
    if (!waveformContainer || waveformContainer.hasChildNodes()) return;
    
    const durationElement = cardElement.querySelector('.duration');
    const coverArtWrapper = cardElement.querySelector('.cover-art-wrapper');
    const playButton = cardElement.querySelector('.play-button');
    const songName = cardElement.querySelector('.song-name');
    
    waveformContainer.id = `waveform-${songId}`;
    waveformContainers.push(waveformContainer);
    
    if (playButton) {
      playButton.style.opacity = '0';
      cardElement.addEventListener('mouseenter', () => playButton.style.opacity = '1');
      cardElement.addEventListener('mouseleave', () => {
        if (g.currentSongData?.id === songId && (g.isPlaying || g.standaloneAudio)) {
          playButton.style.opacity = '1';
        } else {
          playButton.style.opacity = '0';
        }
      });
    }
    
    const wavesurfer = WaveSurfer.create({
      container: waveformContainer,
      waveColor: '#e2e2e2',
      progressColor: '#191919',
      cursorColor: 'transparent',
      cursorWidth: 0,
      height: 30,
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
    
    const peaksData = songData.fields['Waveform Peaks'];
    const storedDuration = songData.fields['Duration'];

    if (peaksData && peaksData.trim().length > 0 && storedDuration) {
      try {
        const peaks = JSON.parse(peaksData);
        wavesurfer.load(audioUrl, [peaks], storedDuration);
        console.log(`⚡ Instant load with peaks + duration (no audio fetch!)`);
      } catch (e) {
        console.error('Error loading peaks:', e);
        wavesurfer.load(audioUrl);
      }
    } else {
      if (!peaksData || peaksData.trim().length === 0) {
        console.warn('⚠️ No peaks available - loading audio');
      }
      if (!storedDuration) {
        console.warn('⚠️ No duration stored - loading audio');
      }
      wavesurfer.load(audioUrl);
    }
    
    const waveformReadyPromise = new Promise((resolve) => {
      let resolved = false;
      
      wavesurfer.on('ready', function () {
        if (resolved) return;
        resolved = true;
        
        const duration = wavesurfer.getDuration();
        const containerWidth = waveformContainer.offsetWidth || 300;
        wavesurfer.zoom(containerWidth / duration);
        if (durationElement) durationElement.textContent = formatDuration(duration);
        
        resolve();
        setTimeout(() => linkStandaloneToWaveform(), 50);
      });
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 5000);
    });
    
    waveformPromises.push(waveformReadyPromise);
    
    g.allWavesurfers.push(wavesurfer);
    g.waveformData.push({
      wavesurfer,
      cardElement,
      waveformContainer,
      audioUrl,
      songData
    });
    
const handlePlayPause = (e) => {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  
  if (e && e.target.closest('.w-dropdown-toggle, .w-dropdown-list')) return;
  
  console.log('═══════════════════════════════════════════');
  console.log('🎯 CLICK DETECTED');
  console.log('Clicked song:', songData?.fields?.['Song Title']);
  console.log('Clicked song ID:', songData?.id);
  console.log('Current song:', g.currentSongData?.fields?.['Song Title']);
  console.log('Current song ID:', g.currentSongData?.id);
  console.log('Is same song?', g.currentSongData?.id === songData.id);
  console.log('═══════════════════════════════════════════');
      
  if (g.currentWavesurfer && g.currentWavesurfer !== wavesurfer) {
    console.log('🔀 Different song clicked - always play it');
    
    if (g.standaloneAudio) {
      g.standaloneAudio.pause();
    }
    
    g.currentWavesurfer.seekTo(0);
    
    // ALWAYS play when clicking a different song
    playStandaloneSong(audioUrl, songData, wavesurfer, cardElement);
  } else {
    // Same song or no current song - toggle play/pause
    if (g.standaloneAudio && g.currentSongData?.id === songData.id) {
      console.log('⏯️ Toggling current song');
      if (g.standaloneAudio.paused) {
        g.standaloneAudio.play();
      } else {
        g.standaloneAudio.pause();
      }
    } else {
      console.log('▶️ Playing new song');
      playStandaloneSong(audioUrl, songData, wavesurfer, cardElement);
    }
  }
};
    
if (coverArtWrapper) {
  coverArtWrapper.style.cursor = 'pointer';
  coverArtWrapper.addEventListener('click', handlePlayPause);
}

if (songName) {
  songName.style.cursor = 'pointer';
  songName.addEventListener('click', handlePlayPause);
}
    
    wavesurfer.on('interaction', function (newProgress) {
      if (g.currentSongData?.id === songData.id) {
        if (g.standaloneAudio) {
          g.standaloneAudio.currentTime = newProgress;
        }
        return;
      }
      
      const wasPlaying = g.isPlaying;
      
      if (g.standaloneAudio) {
        g.standaloneAudio.pause();
        g.standaloneAudio = null;
      }
      
      if (g.currentWavesurfer) {
        g.currentWavesurfer.seekTo(0);
      }
      
      g.currentWavesurfer = wavesurfer;
      g.hasActiveSong = true;
      
      playStandaloneSong(audioUrl, songData, wavesurfer, cardElement, newProgress, wasPlaying);
    });
    
    cardElement.dataset.waveformInitialized = 'true';
  });
  
  Promise.all(waveformPromises).then(() => {
    waveformContainers.forEach((container) => {
      container.style.opacity = '1';
    });
  });
  
  setTimeout(() => {
    waveformContainers.forEach((container) => {
      if (container.style.opacity === '0') {
        container.style.opacity = '1';
      }
    });
    linkStandaloneToWaveform();
  }, 1000);
}

/**
 * ============================================================
 * FETCH & DISPLAY SONGS
 * ============================================================
 */
async function fetchSongs() {
  const g = window.musicPlayerPersistent;
  
  if (g.MASTER_DATA.length > 0) {
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
 * DISPLAY FEATURED SONGS ON HOME PAGE
 * ============================================================
 */
async function displayFeaturedSongs(limit = 6) {
  const container = document.querySelector('.featured-songs-wrapper');
  if (!container) {
    console.log('No featured songs container found on this page');
    return;
  }
  
  const g = window.musicPlayerPersistent;
  
  if (g.MASTER_DATA.length === 0) {
    await fetchSongs();
  }
  
  const templateWrapper = container.querySelector('.template-wrapper');
  const templateCard = templateWrapper ? templateWrapper.querySelector('.song-wrapper') : container.querySelector('.song-wrapper');
  
  if (!templateCard) {
    console.warn('No template card found in featured-songs-wrapper');
    return;
  }
  
  container.innerHTML = '';
  if (templateWrapper) container.appendChild(templateWrapper);
  
  const featuredSongs = g.MASTER_DATA.slice(-limit).reverse();
  
  featuredSongs.forEach(song => {
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
  
  console.log(`✅ Displayed ${featuredSongs.length} featured songs on home page`);
  
  setTimeout(() => {
    const cards = container.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
    if (cards.length > 0) {
      loadWaveformBatch(Array.from(cards));
    }
  }, 100);
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
    
    if (g.standaloneAudio) {
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
    
    const isMusicPage = !!document.querySelector('.music-list-wrapper');
    
    if (isMusicPage && g.allWavesurfers.length > 0 && g.currentWavesurfer) {
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
        const wasPlaying = g.isPlaying;
        const prevData = g.waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
        if (prevData?.cardElement.querySelector('.play-button')) {
          prevData.cardElement.querySelector('.play-button').style.opacity = '0';
        }
        
        if (g.standaloneAudio) {
          g.standaloneAudio.pause();
          g.standaloneAudio = null;
        }
        
        g.currentWavesurfer.seekTo(0);
        g.currentWavesurfer = nextWS;
        const nextD = g.waveformData.find(wf => wf.wavesurfer === nextWS);
        if (nextD?.cardElement.querySelector('.play-button')) {
          nextD.cardElement.querySelector('.play-button').style.opacity = '1';
        }
        scrollToSelected(nextD.cardElement);
        
        playStandaloneSong(nextD.audioUrl, nextD.songData, nextWS, nextD.cardElement, null, wasPlaying);
      }
    } else {
      navigateStandaloneTrack(e.code === 'ArrowDown' ? 'next' : 'prev');
    }
  }
}, true);

/**
 * ============================================================
 * FILTER HELPERS
 * ============================================================
 */
function initFilterAccordions() {
  document.querySelectorAll('.filter-header').forEach(header => {
    header.addEventListener('click', function() {
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

function initCheckboxTextColor() {
  document.querySelectorAll('.checkbox-include-wrapper input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const label = this.parentElement.querySelector('.w-form-label');
      if (label) {
        label.style.color = this.checked ? '#191919' : '';
      }
    });
  });
}

function initFilterItemBackground() {
  setTimeout(function() {
    let checkboxes = document.querySelectorAll('.checkbox-wrapper input[type="checkbox"]');
    if (checkboxes.length === 0) checkboxes = document.querySelectorAll('.checkbox-include input');
    if (checkboxes.length === 0) checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        const filterItem = this.closest('.filter-item');
        if (filterItem) {
          if (this.checked) {
            filterItem.classList.add('is-selected');
          } else {
            filterItem.classList.remove('is-selected');
          }
        }
      });
    });
  }, 100);
}

function initDynamicTagging() {
  setTimeout(function() {
    const tagsContainer = document.querySelector('.filter-tags-container');
    if (!tagsContainer) return;
    
    const checkboxes = document.querySelectorAll('.filter-list input[type="checkbox"], .checkbox-single-select-wrapper input[type="checkbox"]');
    const radioWrappers = document.querySelectorAll('.filter-list label.radio-wrapper, .filter-list .w-radio');
    
    function createTag(input, labelText, radioName = null) {
      const tag = document.createElement('div');
      tag.className = 'filter-tag';
      if (radioName) tag.dataset.radioName = radioName;
      
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
          label = wrapper?.querySelector('.w-form-label, .filter-text');
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
            if (tag.querySelector('.filter-tag-text').textContent === labelText) {
              tag.remove();
            }
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
            tags.forEach(tag => { 
              if (tag.dataset.radioName === radioName) tag.remove(); 
            });
            radio.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            document.querySelectorAll(`input[name="${radioName}"]`).forEach(r => {
              const otherWrapper = r.closest('.radio-wrapper, .w-radio');
              if (otherWrapper) otherWrapper.classList.remove('is-active');
            });
            
            this.classList.add('is-active');
            
            const tags = tagsContainer.querySelectorAll('.filter-tag');
            tags.forEach(tag => { 
              if (tag.dataset.radioName === radioName) tag.remove(); 
            });
            
            const tag = createTag(radio, labelText);
            tag.dataset.radioName = radioName;
            tagsContainer.appendChild(tag);
          }
        }, 50);
      });
    });
  }, 1000);
}

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

function initSearchAndFilters() {
  const g = window.musicPlayerPersistent;
  const searchBar = document.querySelector('[data-filter-search="true"]');
  const clearBtn = document.querySelector('.circle-x');
  
  function toggleClearButton() {
    if (!clearBtn) return;
    
    const hasSearch = searchBar && searchBar.value.trim().length > 0;
    const hasFilters = Array.from(document.querySelectorAll('[data-filter-group]')).some(input => input.checked);
    
    clearBtn.style.display = (hasSearch || hasFilters) ? 'flex' : 'none';
  }
  
  function clearAllFilters() {
    const hasSearch = searchBar && searchBar.value.trim().length > 0;
    const hasFilters = Array.from(document.querySelectorAll('[data-filter-group]')).some(input => input.checked);
    
    if (!hasSearch && !hasFilters) {
      return;
    }
    
    if (searchBar && hasSearch) {
      searchBar.value = '';
    }
    
    if (hasFilters) {
      const tagRemoveButtons = document.querySelectorAll('.filter-tag-remove');
      
      if (tagRemoveButtons.length > 0) {
        tagRemoveButtons.forEach((btn) => {
          btn.click();
        });
      } else {
        document.querySelectorAll('[data-filter-group]').forEach(input => {
          if (input.checked) {
            input.checked = false;
            const wrapper = input.closest('.w-checkbox, .w-radio, .checkbox-single-select-wrapper, .radio-wrapper');
            if (wrapper) wrapper.classList.remove('is-active');
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
    }
    
    toggleClearButton();
    applyFilters();
  }
  
 function applyFilters() {
  const g = window.musicPlayerPersistent;
  const query = searchBar ? searchBar.value.toLowerCase().trim() : '';
  const keywords = query.split(/\s+/).filter(k => k.length > 0);
  const filterInputs = document.querySelectorAll('[data-filter-group]');
  const selectedFilters = [];
  
  filterInputs.forEach(input => {
    if (input.checked) {
      const group = input.getAttribute('data-filter-group');
      const value = input.getAttribute('data-filter-value');
      const keyGroup = input.getAttribute('data-key-group');
      
      selectedFilters.push({
        group: group,
        value: value ? value.toLowerCase() : null,
        keyGroup: keyGroup ? keyGroup.toLowerCase() : null
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
      
      if (filter.keyGroup) {
        if (filter.keyGroup === 'major') {
          return String(recVal).toLowerCase().endsWith('maj');
        }
        if (filter.keyGroup === 'minor') {
          return String(recVal).toLowerCase().endsWith('min');
        }
      }
      
      if (filter.value) {
        if (Array.isArray(recVal)) return recVal.some(v => String(v).toLowerCase() === filter.value);
        return String(recVal).toLowerCase() === filter.value;
      }
      
      return false;
    });
    
    return matchesSearch && matchesAttributes;
  }).map(r => r.id);
  
  // 👇 ONLY UPDATE FILTERED IDS IF WE'RE ON THE MUSIC PAGE
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  if (isMusicPage) {
    g.filteredSongIds = visibleIds;
    console.log(`🎵 Stored ${visibleIds.length} filtered song IDs for navigation`);
  }
  
  document.querySelectorAll('.song-wrapper').forEach(card => {
    card.style.display = visibleIds.includes(card.dataset.songId) ? 'flex' : 'none';
  });
  
  toggleClearButton();
}
  
  if (clearBtn) {
    clearBtn.style.display = 'none';
    clearBtn.addEventListener('click', clearAllFilters);
  }
  
  if (searchBar) {
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
 * REMOVE DUPLICATE IDS
 * ============================================================
 */
function removeDuplicateIds() {
  document.querySelectorAll('input[type="checkbox"][id="checkbox"]').forEach((cb) => {
    cb.removeAttribute('id');
  });
  
  document.querySelectorAll('[id="favourite-button"]').forEach((btn) => {
    btn.removeAttribute('id');
  });
}

removeDuplicateIds();

/**
 * ============================================================
 * HANDLE TAB VISIBILITY
 * ============================================================
 */
document.addEventListener('visibilitychange', function() {
  const g = window.musicPlayerPersistent;
  
  if (document.hidden) {
    if (g.standaloneAudio && !g.standaloneAudio.paused) {
      g.wasPlayingBeforeHidden = true;
    } else {
      g.wasPlayingBeforeHidden = false;
    }
  } else {
    if (g.standaloneAudio) {
      const currentTime = g.standaloneAudio.currentTime;
      
      if (g.wasPlayingBeforeHidden && g.standaloneAudio.paused) {
        setTimeout(() => {
          if (g.standaloneAudio) {
            g.standaloneAudio.play().catch(err => {
              console.log('Could not resume playback:', err);
            });
          }
        }, 100);
      }
    }
  }
});

/**
 * ============================================================
 * MANUAL TAB REINITIALIZATION FOR BARBA
 * ============================================================
 */
function reinitializeTabs() {
  document.querySelectorAll('.w-tabs').forEach(tabsComponent => {
    const allLinks = tabsComponent.querySelectorAll('.w-tab-link');
    const allPanes = tabsComponent.querySelectorAll('.w-tab-pane');
    
    allLinks.forEach((link, linkIndex) => {
      // Remove old listeners by cloning
      const newLink = link.cloneNode(true);
      link.parentNode.replaceChild(newLink, link);
      
      newLink.addEventListener('click', function(e) {
        e.preventDefault();
        const clickedIndex = Array.from(allLinks).indexOf(link);
        
        // Update tab links
        allLinks.forEach((l, i) => {
          if (i === clickedIndex) {
            l.classList.add('w--current');
            l.setAttribute('aria-selected', 'true');
            l.setAttribute('tabindex', '0');
          } else {
            l.classList.remove('w--current');
            l.setAttribute('aria-selected', 'false');
            l.setAttribute('tabindex', '-1');
          }
        });
        
        // Update tab panes
        allPanes.forEach((p, i) => {
          if (i === clickedIndex) {
            p.classList.add('w--tab-active');
            p.style.display = '';
            p.style.opacity = '1';
          } else {
            p.classList.remove('w--tab-active');
            p.style.display = 'none';
            p.style.opacity = '0';
          }
        });
        
        console.log(`✅ Switched to tab ${clickedIndex + 1}`);
        
        // Sync pricing toggle state if on pricing page
        if (typeof initPricingToggle === 'function') {
          setTimeout(() => initPricingToggle(), 50);
        }
      });
    });
  });
  
  console.log('✅ Tabs manually re-initialized');
}

/**
 * ============================================================
 * BARBA.JS & PAGE TRANSITIONS
 * ============================================================
 */
window.addEventListener('load', () => initMusicPage());

function forceWebflowRestart() {
  console.log('🔄 Force-restarting Webflow IX engine...');
  
  if (window.Webflow) {
    window.Webflow.destroy();
    window.Webflow.ready();
  }
  
  if (window.Webflow && window.Webflow.require('ix2')) {
    const ix2 = window.Webflow.require('ix2');
    
    if (ix2.store && ix2.actions) {
      ix2.store.dispatch(ix2.actions.stop());
    }
    
    ix2.init();
  }
  
  document.dispatchEvent(new Event('readystatechange'));
  window.dispatchEvent(new Event('resize'));
  
  console.log('✅ Webflow IX engine restarted');
}

if (typeof barba !== 'undefined') {
  barba.init({
    prevent: ({ el }) => el.classList && el.classList.contains('no-barba'),
    transitions: [{
      name: 'default',
      
    beforeLeave(data) {
  const g = window.musicPlayerPersistent;
  g.isTransitioning = true;
  const isMusicPage = !!data.current.container.querySelector('.music-list-wrapper');
  const hasFeaturedSongs = !!data.current.container.querySelector('.featured-songs-wrapper');
  
  g.filtersInitialized = false;
  
  // Clean up waveforms from ANY page (music page OR home page with featured songs)
  if (isMusicPage || hasFeaturedSongs) {
    g.allWavesurfers.forEach(ws => {
      try {
        ws.unAll();
        ws.destroy();
      } catch (error) {
        console.warn('Error destroying wavesurfer:', error);
      }
    });
    
    document.querySelectorAll('.waveform').forEach(container => {
      container.innerHTML = '';
    });
    
    g.allWavesurfers = [];
    g.waveformData = [];
    g.persistedWaveformContainer = null;
    g.currentWavesurfer = null;
  }
  
  const playerWrapper = document.querySelector('.music-player-wrapper');
  if (playerWrapper && g.hasActiveSong) {
    playerWrapper.style.transition = 'none';
  }
  
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  document.body.style.height = '';
  return Promise.resolve();
},

     beforeEnter(data) {
  const nextContainer = data.next.container;
  const isMusicPage = !!nextContainer.querySelector('.music-list-wrapper');

  // Inject CSS to hide ONLY .login-section during transition
  const styleId = 'barba-transition-style';
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = '.login-section { opacity: 0 !important; transition: none !important; }';

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
},

      enter(data) {
        removeDuplicateIds();
        
        if (window.Webflow) {
          setTimeout(() => {
            window.Webflow.ready();
          }, 50);
        }
        
        return initMusicPage();
      },

      after(data) {
  console.log('🚪 BARBA AFTER FIRED');
  
  const g = window.musicPlayerPersistent;
  
  window.scrollTo(0, 0);
  
  console.log('🔍 Checking for page ID...');
  let newPageId = null;

  newPageId = data.next.container?.getAttribute('data-wf-page');
  console.log('Method 1 (container):', newPageId);

  if (!newPageId && data.next.html) {
    console.log('Method 2: Searching HTML string for data-wf-page');
    
    const match = data.next.html.match(/data-wf-page="([^"]+)"/);
    
    if (match && match[1]) {
      newPageId = match[1];
      console.log('Page ID from regex:', newPageId);
    } else {
      console.log('No data-wf-page found in HTML string');
    }
  }

  const htmlTag = document.documentElement;
  const currentPageId = htmlTag.getAttribute('data-wf-page');

  console.log('Current page ID:', currentPageId);
  console.log('New page ID:', newPageId);

  if (newPageId && currentPageId !== newPageId) {
    console.log(`📄 Swapping Page ID from ${currentPageId} to ${newPageId}`);
    htmlTag.setAttribute('data-wf-page', newPageId);
    console.log('✅ Page ID updated!');
  } else if (!newPageId) {
    console.log('⚠️ No new page ID found');
  } else if (currentPageId === newPageId) {
    console.log('ℹ️ Page IDs are already the same - no swap needed');
  }
  
  if (window.Webflow) {
    try {
      const ix2 = window.Webflow.require('ix2');
      if (ix2 && ix2.destroy) {
        ix2.destroy();
      }
      
      window.Webflow.destroy();
      document.body.offsetHeight;
      window.Webflow.ready();
      
      setTimeout(() => {
        if (window.Webflow && window.Webflow.require) {
          const ix2 = window.Webflow.require('ix2');
          if (ix2 && ix2.init) {
            ix2.init();
          }
        }
      }, 100);
      
    } catch (e) {
      console.warn('Webflow reinit error:', e);
    }
  }
  
  positionMasterPlayer();
  
  setTimeout(() => {
    setupMasterPlayerControls();
    positionMasterPlayer();
    updateMasterPlayerVisibility();

    // Adjust main-content height based on player visibility (login/signup pages only)
const mainContent = document.querySelector('.main-content');
const playerWrapper = document.querySelector('.music-player-wrapper');
const isPlayerVisible = playerWrapper && 
                       playerWrapper.style.display !== 'none' && 
                       playerWrapper.style.visibility !== 'hidden';

const isLoginPage = !!document.querySelector('.login-section');

if (mainContent && isLoginPage) {
  if (isPlayerVisible) {
    mainContent.style.height = 'calc(100vh - 77px)';
    console.log('📐 Main content: calc(100vh - 77px) - player visible');
  } else {
    mainContent.style.height = '100vh';
    console.log('📐 Main content: 100vh - player hidden');
  }
  
  // Remove hiding CSS and reveal .login-section smoothly
  const style = document.getElementById('barba-transition-style');
  if (style) style.remove();
  
  const loginSection = document.querySelector('.login-section');
  if (loginSection) {
    loginSection.style.transition = 'opacity 0.15s ease';
    loginSection.style.opacity = '1';
  }
} else if (mainContent) {
  mainContent.style.height = '';  // Remove any forced height on other pages
  const style = document.getElementById('barba-transition-style');
  if (style) style.remove();
}

    g.isTransitioning = false;

    setTimeout(() => {
      const hasFeaturedSongs = !!document.querySelector('.featured-songs-wrapper');
      console.log('🏠 [BARBA AFTER] Checking for featured songs container:', hasFeaturedSongs);
      if (hasFeaturedSongs) {
        console.log('🎵 [BARBA AFTER] Calling displayFeaturedSongs...');
        displayFeaturedSongs(6);
      }
    }, 300);
    
    if (g.currentSongData) {
      updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
      updateMasterControllerIcons(g.isPlaying);
      updatePlayerCoverArtIcons(g.isPlaying);
      
      if (g.currentPeaksData) {
        let progress = 0;
        
        if (g.standaloneAudio && g.standaloneAudio.duration > 0) {
          progress = g.standaloneAudio.currentTime / g.standaloneAudio.duration;
        } else if (g.currentDuration > 0) {
          progress = g.currentTime / g.currentDuration;
        }
        
        drawMasterWaveform(g.currentPeaksData, progress);
      }
    }
    
    if (playerWrapper) {
      playerWrapper.style.transition = '';
    }
    
    setTimeout(() => {
      positionMasterPlayer();
    }, 100);
    
   setTimeout(() => {
  if (typeof $ !== 'undefined' && typeof initPricingToggle === 'function') {
    console.log('🔄 Attempting to re-initialize pricing toggle...');
    try {
      initPricingToggle();
      console.log('✅ Pricing toggle re-initialized successfully');
    } catch (e) {
      console.error('❌ Error initializing pricing toggle:', e);
    }
  }

// NEW: Reinitialize tabs
  reinitializeTabs();
  
// Manual password toggle for login/signup pages
const passwordFields = document.querySelectorAll('input[type="password"], input[type="text"][name*="password"], input[placeholder*="Password"]');

passwordFields.forEach(passwordField => {
  const container = passwordField.closest('.form-field, .password-field, .form-block, form');
  if (!container) return;
  
  const visibleToggle = container.querySelector('.password-toggle-visible');
  const hiddenToggle = container.querySelector('.password-toggle-hidden');
  
  if (!visibleToggle || !hiddenToggle) return;
  
  // Clone to remove old listeners
  const newVisibleToggle = visibleToggle.cloneNode(true);
  const newHiddenToggle = hiddenToggle.cloneNode(true);
  visibleToggle.parentNode.replaceChild(newVisibleToggle, visibleToggle);
  hiddenToggle.parentNode.replaceChild(newHiddenToggle, hiddenToggle);
  
  // Setup visible toggle (shows password when clicked)
  newVisibleToggle.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    passwordField.type = 'text';
    newVisibleToggle.style.display = 'none';
    newHiddenToggle.style.display = 'flex';
    console.log('👁️ Password shown');
  });
  
  // Setup hidden toggle (hides password when clicked)
  newHiddenToggle.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    passwordField.type = 'password';
    newVisibleToggle.style.display = 'flex';
    newHiddenToggle.style.display = 'none';
    console.log('🔒 Password hidden');
  });
  
  // Set initial state
  passwordField.type = 'password';
  newVisibleToggle.style.display = 'flex';
  newHiddenToggle.style.display = 'none';
  
  console.log('✅ Password toggle initialized');
});
     
}, 400);
    
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new CustomEvent('barbaAfterTransition'));
    
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
      
      document.querySelectorAll('[data-w-id]').forEach(el => {
        if (el.style.opacity === '0' || el.style.display === 'none') {
          el.style.opacity = '';
          el.style.display = '';
        }
        el.style.transform = '';
      });
      
      if (window.Webflow && window.Webflow.redraw) {
        window.Webflow.redraw.up();
      }
      
      if (window.Webflow && window.Webflow.require) {
        try {
          const ix2 = window.Webflow.require('ix2');
          if (ix2 && ix2.init) {
            ix2.init();
          }
        } catch (e) {}
      }
      
    }, 600);
    
  }, 200);
}
    }]
  });
}

/**
 * ============================================================
 * FAVORITE BUTTON SYNCING
 * ============================================================
 */
function initFavoriteSync() {
  const g = window.musicPlayerPersistent;
  if (!g) {
    console.warn('⚠️ musicPlayerPersistent not found');
    return;
  }

  const playerCheckbox = document.querySelector('.music-player-wrapper input[type="checkbox"]');
  if (playerCheckbox) {
    playerCheckbox.classList.add('player-favourite-checkbox');
    console.log('✅ Added player-favourite-checkbox class to player');
  }
  
  let currentSongFavourite = null;
  let playerFavourite = null;
  let lastChangeSource = null;
  let playerListenerAttached = false;
  
  const observer = new MutationObserver(function() {
    const player = document.querySelector('.music-player-wrapper input.player-favourite-checkbox');
    if (player && !playerListenerAttached) {
      console.log('✅ Player favourite appeared in DOM');
      playerFavourite = player;
      playerFavourite.addEventListener('change', handlePlayerFavouriteChange);
      playerListenerAttached = true;
      
      if (currentSongFavourite) {
        console.log('Current song exists, syncing on player appear');
        setTimeout(() => {
          if (playerFavourite.checked !== currentSongFavourite.checked) {
            console.log(`🔄 Syncing: Song is ${currentSongFavourite.checked}, Player is ${playerFavourite.checked}`);
            lastChangeSource = 'sync';
            playerFavourite.click();
            setTimeout(() => { lastChangeSource = null; }, 100);
          }
        }, 500);
      } else {
        console.log('No current song yet');
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  function getPlayerFavourite() {
    if (!playerFavourite || !document.body.contains(playerFavourite)) {
      playerFavourite = document.querySelector('.music-player-wrapper input.player-favourite-checkbox');
      if (playerFavourite && !playerListenerAttached) {
        console.log('✅ Player favourite found via getter');
        playerFavourite.addEventListener('change', handlePlayerFavouriteChange);
        playerListenerAttached = true;
      }
    }
    return playerFavourite;
  }
  
  function syncFavourites(songCard) {
    if (currentSongFavourite) {
      currentSongFavourite.removeEventListener('change', handleSongFavouriteChange);
    }
    
    currentSongFavourite = songCard.querySelector('input.favourite-checkbox');
    console.log('Set current song favourite:', currentSongFavourite ? 'found' : 'not found');
    
    if (currentSongFavourite) {
      console.log('Song checkbox element:', currentSongFavourite.tagName, currentSongFavourite.type, 'checked:', currentSongFavourite.checked);
      
      const player = getPlayerFavourite();
      
      if (player) {
        console.log('Player checkbox element:', player.tagName, player.type, 'checked:', player.checked);
      }
      
      if (player) {
        if (player.checked !== currentSongFavourite.checked) {
          console.log(`🔄 Song changed - syncing player from ${player.checked} to ${currentSongFavourite.checked}`);
          lastChangeSource = 'sync';
          player.click();
          setTimeout(() => { lastChangeSource = null; }, 100);
        } else {
          console.log('Player already matches song:', player.checked);
        }
      }
      
      currentSongFavourite.addEventListener('change', handleSongFavouriteChange);
      console.log('Synced favourite for current song');
    }
  }
  
  function handleSongFavouriteChange(e) {
    if (lastChangeSource === 'player') {
      console.log('Ignoring song change - triggered by player');
      lastChangeSource = null;
      return;
    }
    
    const player = getPlayerFavourite();
    if (!player) {
      console.log('Player not available, song favourite changed to:', e.target.checked);
      return;
    }
    
    if (player.checked !== e.target.checked) {
      lastChangeSource = 'song';
      console.log('💛 Song favourite clicked, syncing player to:', e.target.checked);
      player.click();
    }
  }
  
  function handlePlayerFavouriteChange() {
    if (lastChangeSource === 'song' || lastChangeSource === 'sync') {
      console.log('Ignoring player change - triggered by', lastChangeSource);
      lastChangeSource = null;
      return;
    }
    
    if (currentSongFavourite && currentSongFavourite.checked !== this.checked) {
      lastChangeSource = 'player';
      console.log('💛 Player favourite clicked, syncing song to:', this.checked);
      currentSongFavourite.click();
    }
  }
  
  let lastSyncedSongId = null;
  setInterval(() => {
    if (g.currentSongData && g.currentSongData.id !== lastSyncedSongId) {
      lastSyncedSongId = g.currentSongData.id;
      
      const matchingData = g.waveformData.find(data => 
        data.songData && data.songData.id === g.currentSongData.id
      );
      
      if (matchingData && matchingData.cardElement) {
        console.log('🎵 New song detected, syncing favorites');
        syncFavourites(matchingData.cardElement);
      }
    }
    
    if (!g.currentSongData && currentSongFavourite) {
      if (currentSongFavourite) {
        currentSongFavourite.removeEventListener('change', handleSongFavouriteChange);
      }
      currentSongFavourite = null;
      lastSyncedSongId = null;
    }
  }, 500);
  
  setTimeout(() => {
    if (g.currentSongData) {
      const matchingData = g.waveformData.find(data => 
        data.songData && data.songData.id === g.currentSongData.id
      );
      
      if (matchingData && matchingData.cardElement) {
        console.log('🎵 Initial song detected, syncing favorites');
        syncFavourites(matchingData.cardElement);
      }
    }
  }, 1000);
}

window.addEventListener('load', function() {
  setTimeout(() => {
    console.log('🚀 Initializing favorite sync system');
    initFavoriteSync();
  }, 2000);
});

if (typeof barba !== 'undefined') {
  window.addEventListener('barbaAfterTransition', function() {
    console.log('🔄 Re-initializing favorite sync after Barba transition');
    setTimeout(initFavoriteSync, 1000);
  });
}

/**
 * ============================================================
 * LOCALSTORAGE PERSISTENCE FOR FILTERS & FAVORITES
 * ============================================================
 */
let filtersRestored = false;
let favoritesRestored = false;
let isClearing = false;

function saveFilterState() {
  if (isClearing) {
    console.log('⏸️ Skipping save - clearing in progress');
    return;
  }
  
  const filterState = {
    filters: [],
    searchQuery: ''
  };
  
  document.querySelectorAll('[data-filter-group]').forEach(input => {
    if (input.checked) {
      filterState.filters.push({
        group: input.getAttribute('data-filter-group'),
        value: input.getAttribute('data-filter-value'),
        keyGroup: input.getAttribute('data-key-group')
      });
    }
  });
  
  const searchBar = document.querySelector('[data-filter-search="true"]');
  if (searchBar && searchBar.value) {
    filterState.searchQuery = searchBar.value;
  }
  
  localStorage.setItem('musicFilters', JSON.stringify(filterState));
  console.log('💾 Saved filter state:', filterState);
}

function restoreFilterState() {
  const isBarbaNavigation = sessionStorage.getItem('isBarbaNavigation') === 'true';
  
  sessionStorage.removeItem('isBarbaNavigation');
  
  if (!isBarbaNavigation) {
    console.log('🔄 Fresh page load - not restoring filters');
    const musicList = document.querySelector('.music-list-wrapper');
    if (musicList) {
      musicList.style.opacity = '1';
      musicList.style.visibility = 'visible';
      musicList.style.pointerEvents = 'auto';
    }
    
    const tagsContainer = document.querySelector('.filter-tags-container');
    const clearButton = document.querySelector('.circle-x');
    if (tagsContainer) tagsContainer.style.opacity = '1';
    if (clearButton) clearButton.style.opacity = '1';
    
    const oldStyle = document.getElementById('filter-loading-style-fresh');
    if (oldStyle) oldStyle.remove();
    return false;
  }
  
  const savedState = localStorage.getItem('musicFilters');
  if (!savedState) {
    const musicList = document.querySelector('.music-list-wrapper');
    if (musicList) {
      musicList.style.opacity = '1';
      musicList.style.visibility = 'visible';
      musicList.style.pointerEvents = 'auto';
    }
    
    const tagsContainer = document.querySelector('.filter-tags-container');
    const clearButton = document.querySelector('.circle-x');
    if (tagsContainer) tagsContainer.style.opacity = '1';
    if (clearButton) clearButton.style.opacity = '1';
    
    return false;
  }
  
  try {
    const filterState = JSON.parse(savedState);
    
    const hasActiveFilters = filterState.filters.length > 0 || filterState.searchQuery;
    if (!hasActiveFilters) {
      const musicList = document.querySelector('.music-list-wrapper');
      if (musicList) {
        musicList.style.opacity = '1';
        musicList.style.visibility = 'visible';
        musicList.style.pointerEvents = 'auto';
      }
      
      const tagsContainer = document.querySelector('.filter-tags-container');
      const clearButton = document.querySelector('.circle-x');
      if (tagsContainer) tagsContainer.style.opacity = '1';
      if (clearButton) clearButton.style.opacity = '1';
      
      return false;
    }
    
    console.log('📂 Restoring filter state:', filterState);
    
    const tagsContainer = document.querySelector('.filter-tags-container');
    const clearButton = document.querySelector('.circle-x');
    
    if (tagsContainer) {
      tagsContainer.style.opacity = '0';
      tagsContainer.style.transition = 'none';
    }
    if (clearButton) {
      clearButton.style.opacity = '0';
      clearButton.style.transition = 'none';
    }
    
    let restoredCount = 0;
    
    filterState.filters.forEach(savedFilter => {
      let selector = `[data-filter-group="${savedFilter.group}"]`;
      
      if (savedFilter.value) {
        selector += `[data-filter-value="${savedFilter.value}"]`;
      }
      if (savedFilter.keyGroup) {
        selector += `[data-key-group="${savedFilter.keyGroup}"]`;
      }
      
      const input = document.querySelector(selector);
      if (input && !input.checked) {
        input.checked = true;
        
        const wrapper = input.closest('.w-checkbox, .w-radio, .checkbox-single-select-wrapper, .radio-wrapper, .filter-item');
        if (wrapper) {
          wrapper.classList.add('is-active');
        }
        
        restoredCount++;
      }
    });
    
    if (tagsContainer) {
      tagsContainer.innerHTML = '';
      
      filterState.filters.forEach(savedFilter => {
        let selector = `[data-filter-group="${savedFilter.group}"]`;
        
        if (savedFilter.value) {
          selector += `[data-filter-value="${savedFilter.value}"]`;
        }
        if (savedFilter.keyGroup) {
          selector += `[data-key-group="${savedFilter.keyGroup}"]`;
        }
        
        const input = document.querySelector(selector);
        if (input && input.checked) {
          const tag = document.createElement('div');
          tag.className = 'filter-tag';
          
          let tagText;
          
          const wrapper = input.closest('.w-checkbox, .w-radio, .checkbox-single-select-wrapper, .radio-wrapper, .filter-item');
          const label = wrapper?.querySelector('label, .w-form-label, .filter-item-text, [class*="label"]');
          
          if (label && label.textContent.trim()) {
            tagText = label.textContent.trim();
          } 
          else if (savedFilter.value && savedFilter.value !== 'true' && savedFilter.value !== 'false') {
            tagText = savedFilter.value;
          }
          else {
            tagText = savedFilter.group;
          }
          
          tag.innerHTML = `
            <span class="filter-tag-text">${tagText}</span>
            <span class="filter-tag-remove x-button-style">×</span>
          `;
          
          tag.querySelector('.filter-tag-remove').addEventListener('click', function() {
            input.checked = false;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            tag.remove();
            saveFilterState();
          });
          
          tagsContainer.appendChild(tag);
        }
      });
      
      console.log(`✅ Created ${tagsContainer.children.length} filter tags`);
    }
    
    setTimeout(() => {
      filterState.filters.forEach(savedFilter => {
        let selector = `[data-filter-group="${savedFilter.group}"]`;
        
        if (savedFilter.value) {
          selector += `[data-filter-value="${savedFilter.value}"]`;
        }
        if (savedFilter.keyGroup) {
          selector += `[data-key-group="${savedFilter.keyGroup}"]`;
        }
        
        const input = document.querySelector(selector);
        if (input && input.checked) {
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      
      setTimeout(() => {
        if (tagsContainer) {
          const seen = new Set();
          const tagsToRemove = [];
          
          tagsContainer.querySelectorAll('.filter-tag').forEach(tag => {
            const text = tag.querySelector('.filter-tag-text')?.textContent.trim();
            if (text) {
              if (seen.has(text)) {
                tagsToRemove.push(tag);
              } else {
                seen.add(text);
              }
            }
          });
          
          tagsToRemove.forEach(tag => tag.remove());
          
          if (tagsToRemove.length > 0) {
            console.log(`🗑️ Removed ${tagsToRemove.length} duplicate tags`);
          }
          
          setTimeout(() => {
            if (tagsContainer) {
              tagsContainer.style.transition = 'opacity 0.3s ease-in-out';
              tagsContainer.style.opacity = '1';
            }
            if (clearButton) {
              clearButton.style.transition = 'opacity 0.3s ease-in-out';
              clearButton.style.opacity = '1';
            }
            console.log('✨ Tags and clear button faded in');
          }, 10);
        }
      }, 100);
    }, 50);
    
    if (filterState.searchQuery) {
      const searchBar = document.querySelector('[data-filter-search="true"]');
      if (searchBar) {
        searchBar.value = filterState.searchQuery;
        searchBar.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    
    console.log(`✅ Restored ${restoredCount} filters`);
    
    setTimeout(() => {
      const musicList = document.querySelector('.music-list-wrapper');
      if (musicList) {
        musicList.style.opacity = '1';
        musicList.style.visibility = 'visible';
        musicList.style.pointerEvents = 'auto';
        musicList.style.transition = 'opacity 0.3s ease-in-out';
      }
      console.log('✨ Songs faded in');
    }, 150);
    
    return true;
  } catch (error) {
    console.error('Error restoring filters:', error);
    localStorage.removeItem('musicFilters');
    
    const musicList = document.querySelector('.music-list-wrapper');
    if (musicList) {
      musicList.style.opacity = '1';
      musicList.style.visibility = 'visible';
      musicList.style.pointerEvents = 'auto';
    }
    
    const tagsContainer = document.querySelector('.filter-tags-container');
    const clearButton = document.querySelector('.circle-x');
    if (tagsContainer) tagsContainer.style.opacity = '1';
    if (clearButton) clearButton.style.opacity = '1';
    
    return false;
  }
}

function clearFilterState() {
  localStorage.removeItem('musicFilters');
  console.log('🗑️ Cleared filter state');
  
  const musicList = document.querySelector('.music-list-wrapper');
  if (musicList) {
    musicList.style.opacity = '1';
    musicList.style.visibility = 'visible';
    musicList.style.pointerEvents = 'auto';
  }
}

document.addEventListener('change', function(e) {
  if (e.target.matches('[data-filter-group]')) {
    saveFilterState();
  }
});

let searchSaveTimeout;
document.addEventListener('input', function(e) {
  if (e.target.matches('[data-filter-search="true"]')) {
    clearTimeout(searchSaveTimeout);
    searchSaveTimeout = setTimeout(saveFilterState, 500);
  }
});

function attemptRestore() {
  console.log('attemptRestore called, filtersRestored:', filtersRestored);
  
  if (filtersRestored) return true;
  
  const hasFilters = document.querySelectorAll('[data-filter-group]').length > 0;
  console.log('Filters found on page:', hasFilters);
  
  if (hasFilters) {
    const success = restoreFilterState();
    console.log('restoreFilterState returned:', success);
    
    if (success) {
      filtersRestored = true;
    } else {
      console.log('Restoration failed - showing everything');
      const musicList = document.querySelector('.music-list-wrapper');
      if (musicList) {
        musicList.style.opacity = '1';
        musicList.style.visibility = 'visible';
        musicList.style.pointerEvents = 'auto';
      }
      
      const tagsContainer = document.querySelector('.filter-tags-container');
      const clearButton = document.querySelector('.circle-x');
      if (tagsContainer) tagsContainer.style.opacity = '1';
      if (clearButton) clearButton.style.opacity = '1';
    }
    return success;
  }
  
  console.log('No filters on page - showing songs immediately');
  const musicList = document.querySelector('.music-list-wrapper');
  if (musicList) {
    musicList.style.opacity = '1';
    musicList.style.visibility = 'visible';
    musicList.style.pointerEvents = 'auto';
  }
  
  return false;
}

window.addEventListener('load', function() {
  console.log('🔄 Page load event fired');
  filtersRestored = false;
  
  const clearButton = document.querySelector('.circle-x');
  if (clearButton) {
    console.log('✅ Clear button found, attaching listener');
    clearButton.addEventListener('click', function() {
      isClearing = true;
      
      const searchBar = document.querySelector('[data-filter-search="true"]');
      if (searchBar && searchBar.value) {
        searchBar.value = '';
        // Don't dispatch input event - we're clearing everything
      }
      
      clearFilterState();
      
      setTimeout(() => {
        isClearing = false;
        console.log('✅ Clear complete - auto-save re-enabled');
      }, 100);
    });
  }
  
  setTimeout(() => {
    const musicList = document.querySelector('.music-list-wrapper');
    console.log('Checking music list on page load:', musicList ? 'found' : 'not found');
    if (musicList) {
      console.log('Current opacity:', musicList.style.opacity);
      if (!musicList.style.opacity || musicList.style.opacity === '0') {
        console.log('⚡ Setting initial visibility');
        musicList.style.opacity = '1';
        musicList.style.visibility = 'visible';
        musicList.style.pointerEvents = 'auto';
      }
    }
  }, 100);
  
  setTimeout(() => {
    const musicList = document.querySelector('.music-list-wrapper');
    if (musicList && (musicList.style.opacity === '0' || musicList.style.visibility === 'hidden')) {
      console.warn('⚠️ Filter restoration timeout - showing everything anyway');
      musicList.style.opacity = '1';
      musicList.style.visibility = 'visible';
      musicList.style.pointerEvents = 'auto';
      
      const tagsContainer = document.querySelector('.filter-tags-container');
      const clearButton = document.querySelector('.circle-x');
      if (tagsContainer) tagsContainer.style.opacity = '1';
      if (clearButton) clearButton.style.opacity = '1';
    }
  }, 2000);
  
  setTimeout(() => {
    console.log('Starting filter restoration attempts');
    if (!attemptRestore()) {
      setTimeout(() => { 
        if (!attemptRestore()) {
          setTimeout(attemptRestore, 200);
        }
      }, 100);
    }
  }, 100);
});

if (typeof barba !== 'undefined') {
  barba.hooks.before((data) => {
    sessionStorage.setItem('isBarbaNavigation', 'true');
    console.log('🚀 Barba navigation starting');
  });
  
  barba.hooks.beforeEnter((data) => {
    console.log('📥 Barba beforeEnter hook');
    const savedState = localStorage.getItem('musicFilters');
    console.log('Saved filters:', savedState);
    
    if (savedState) {
      try {
        const filterState = JSON.parse(savedState);
        const hasActiveFilters = filterState.filters.length > 0 || filterState.searchQuery;
        console.log('Has active filters:', hasActiveFilters);
        
        if (hasActiveFilters) {
          const musicList = data.next.container.querySelector('.music-list-wrapper');
          if (musicList) {
            musicList.style.opacity = '0';
            musicList.style.visibility = 'hidden';
            musicList.style.pointerEvents = 'none';
            console.log('🔒 Songs hidden via Barba hook');
          } else {
            console.log('⚠️ Music list not found in next container');
          }
        } else {
          console.log('✅ No active filters - songs will show normally');
        }
      } catch (e) {
        console.error('Error in beforeEnter hook:', e);
      }
    } else {
      console.log('✅ No saved state - songs will show normally');
    }
  });
  
  barba.hooks.after((data) => {
    console.log('✅ Barba after hook');
    filtersRestored = false;
    
    setTimeout(() => {
      const musicList = document.querySelector('.music-list-wrapper');
      console.log('Checking music list after 500ms:', musicList ? 'found' : 'not found');
      if (musicList) {
        console.log('Music list opacity:', musicList.style.opacity);
        if (musicList.style.opacity === '0' || musicList.style.opacity === '') {
          console.log('⚡ Forcing songs visible after 500ms');
          musicList.style.opacity = '1';
          musicList.style.visibility = 'visible';
          musicList.style.pointerEvents = 'auto';
        }
      }
    }, 500);
    
    setTimeout(() => {
      const musicList = document.querySelector('.music-list-wrapper');
      if (musicList && (musicList.style.opacity === '0' || musicList.style.visibility === 'hidden')) {
        console.warn('⚠️ Filter restoration timeout (Barba) - showing everything');
        musicList.style.opacity = '1';
        musicList.style.visibility = 'visible';
        musicList.style.pointerEvents = 'auto';
        
        const tagsContainer = document.querySelector('.filter-tags-container');
        const clearButton = document.querySelector('.circle-x');
        if (tagsContainer) tagsContainer.style.opacity = '1';
        if (clearButton) clearButton.style.opacity = '1';
      }
    }, 2000);
    
    setTimeout(() => {
      console.log('Attempting restore at 100ms');
      if (!attemptRestore()) {
        setTimeout(() => {
          console.log('Attempting restore at 200ms');
          if (!attemptRestore()) {
            setTimeout(() => {
              console.log('Attempting restore at 400ms');
              attemptRestore();
            }, 200);
          }
        }, 100);
      }
    }, 100);
  });
}

const clearButton = document.querySelector('.circle-x');
if (clearButton) {
  clearButton.addEventListener('click', function() {
    isClearing = true;
    
    const searchBar = document.querySelector('[data-filter-search="true"]');
    if (searchBar && searchBar.value) {
      searchBar.value = '';
      // Don't dispatch input event - we're clearing everything
    }
    
    clearFilterState();
    
    setTimeout(() => {
      isClearing = false;
      console.log('✅ Clear complete - auto-save re-enabled');
    }, 100);
  });
}

/**
 * ============================================================
 * FAVORITE SONGS PERSISTENCE
 * ============================================================
 */
function saveFavorites() {
  const favorites = [];
  document.querySelectorAll('input.favourite-checkbox:checked').forEach(checkbox => {
    const songCard = checkbox.closest('.song-wrapper');
    if (songCard?.dataset.songId) {
      favorites.push(songCard.dataset.songId);
    }
  });
  localStorage.setItem('favoriteSongs', JSON.stringify(favorites));
}

function restoreFavorites() {
  const saved = localStorage.getItem('favoriteSongs');
  if (!saved) return;
  
  try {
    const favoriteIds = JSON.parse(saved);
    favoriteIds.forEach(songId => {
      const songCard = document.querySelector(`[data-song-id="${songId}"]`);
      const checkbox = songCard?.querySelector('input.favourite-checkbox');
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    console.log(`✅ Restored ${favoriteIds.length} favorites`);
  } catch (error) {
    console.error('Error restoring favorites:', error);
  }
}

document.addEventListener('change', function(e) {
  if (e.target.matches('input.favourite-checkbox')) {
    saveFavorites();
  }
});

function attemptRestoreFavorites() {
  if (favoritesRestored) return true;
  
  const hasSongs = document.querySelectorAll('.song-wrapper[data-song-id]').length > 0;
  if (hasSongs) {
    restoreFavorites();
    favoritesRestored = true;
    return true;
  }
  return false;
}

window.addEventListener('load', function() {
  favoritesRestored = false;
  
  setTimeout(() => {
    if (!attemptRestoreFavorites()) {
      setTimeout(() => {
        if (!attemptRestoreFavorites()) {
          setTimeout(attemptRestoreFavorites, 500);
        }
      }, 500);
    }
  }, 1000);
});

if (typeof barba !== 'undefined') {
  window.addEventListener('barbaAfterTransition', function() {
    favoritesRestored = false;
    
    setTimeout(() => {
      if (!attemptRestoreFavorites()) {
        setTimeout(() => {
          if (!attemptRestoreFavorites()) {
            setTimeout(attemptRestoreFavorites, 500);
          }
        }, 500);
      }
    }, 1000);
  });
}

console.log('💾 localStorage persistence initialized');
