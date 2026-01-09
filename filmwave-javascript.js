/**
 * ============================================================
 * FILMWAVE MUSIC PLATFORM - VERSION 26
 * Updated: January 1, 2026
 * 
 * NEW FEATURES IN THIS VERSION:
 * - Key Filter System (Sharp/Flat toggle, Major/Minor toggle)
 * - Enhanced Filter Persistence (saves Key filter state)
 * - Automatic initialization on page load and Barba transitions
 * ============================================================
 */

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

// Force-clear saved search query on hard refresh so field starts empty
window.addEventListener('load', () => {
  // Only run on full refresh (not Barba)
  if (!sessionStorage.getItem('isBarbaNavigation')) {
    localStorage.removeItem('musicFilters'); // or set to empty
    // Alternative: set to empty state
    // localStorage.setItem('musicFilters', JSON.stringify({ filters: [], searchQuery: '' }));
  }
});

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
                    document.querySelector('.favorite-songs-wrapper') ||
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
  const hasFooter = !!document.querySelector('.footer-wrapper');
  const shouldShow = g.hasActiveSong || g.currentSongData || g.standaloneAudio || g.currentWavesurfer;
  
  console.log('👁️ updateMasterPlayerVisibility - shouldShow:', shouldShow, 'hasFooter:', hasFooter);
  
  positionMasterPlayer();
  
  if (shouldShow) {
    playerWrapper.style.display = 'flex';
    playerWrapper.style.visibility = 'visible';
    playerWrapper.style.opacity = '1';
    playerWrapper.style.alignItems = 'center';
    playerWrapper.style.pointerEvents = 'auto';
    
    // ADD PADDING TO MUSIC AREA CONTAINER ON MUSIC PAGE
    if (isMusicPage) {
      const musicAreaContainer = document.querySelector('.music-area-container');
      if (musicAreaContainer) {
        musicAreaContainer.style.setProperty('padding-bottom', '77px', 'important');
      }
    }
    
    // ADD PADDING TO FOOTER ON ANY PAGE THAT HAS IT
    if (hasFooter) {
      const footerWrapper = document.querySelector('.footer-wrapper');
      if (footerWrapper) {
        footerWrapper.style.setProperty('padding-bottom', '77px', 'important');
        console.log('✅ Added padding to footer-wrapper');
      }
    }
  } else {
    playerWrapper.style.display = 'none';
    playerWrapper.style.visibility = 'hidden';
    playerWrapper.style.opacity = '0';
    
    // REMOVE PADDING WHEN PLAYER IS HIDDEN
    if (isMusicPage) {
      const musicAreaContainer = document.querySelector('.music-area-container');
      if (musicAreaContainer) {
        musicAreaContainer.style.setProperty('padding-bottom', '0px', 'important');
      }
    }
    
    // REMOVE PADDING FROM FOOTER ON ANY PAGE WHEN PLAYER IS HIDDEN
    if (hasFooter) {
      const footerWrapper = document.querySelector('.footer-wrapper');
      if (footerWrapper) {
        footerWrapper.style.setProperty('padding-bottom', '0px', 'important');
        console.log('🗑️ Removed padding from footer-wrapper');
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
      initKeyFilterSystem();
      initBPMFilter();
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
    const hasFavoriteSongs = !!document.querySelector('.favorite-songs-wrapper');
    
    console.log('🏠 Checking containers:', { 
      featuredSongs: hasFeaturedSongs, 
      favoriteSongs: hasFavoriteSongs 
    });
    
    if (hasFeaturedSongs) {
      console.log('🎵 Calling displayFeaturedSongs...');
      displayFeaturedSongs(6);
    }
    
    if (hasFavoriteSongs) {
      console.log('💛 Calling displayFavoriteSongs...');
      displayFavoriteSongs(); // Shows all songs, or pass a number like displayFavoriteSongs(20)
    }
    
    if (!hasFeaturedSongs && !hasFavoriteSongs) {
      console.log('⚠️ No song containers found on this page');
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
    favoriteCheckbox.classList.add('favorite-checkbox');
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
 * DISPLAY favorite SONGS ON BACKEND PAGE
 * ============================================================
 */
async function displayFavoriteSongs(limit = null) {
  const container = document.querySelector('.favorite-songs-wrapper');
  if (!container) {
    console.log('No favorite songs container found on this page');
    return;
  }
  
  const g = window.musicPlayerPersistent;
  
  // Fetch songs if not already loaded
  if (g.MASTER_DATA.length === 0) {
    await fetchSongs();
  }
  
  const templateWrapper = container.querySelector('.template-wrapper');
  const templateCard = templateWrapper ? templateWrapper.querySelector('.song-wrapper') : container.querySelector('.song-wrapper');
  
  if (!templateCard) {
    console.warn('No template card found in favorite-songs-wrapper');
    return;
  }
  
  // Clear container but keep template
  container.innerHTML = '';
  if (templateWrapper) container.appendChild(templateWrapper);
  
  // Decide which songs to show
  let songsToDisplay = g.MASTER_DATA;
  
  // If limit is specified, take the most recent songs
  if (limit) {
    songsToDisplay = g.MASTER_DATA.slice(-limit).reverse();
  }
  
  // Create song cards
  songsToDisplay.forEach(song => {
    const newCard = templateCard.cloneNode(true);
    newCard.style.opacity = '1';
    newCard.style.position = 'relative';
    newCard.style.pointerEvents = 'auto';
    
    populateSongCard(newCard, song);
    container.appendChild(newCard);
  });

  // Reinitialize Webflow interactions
  if (window.Webflow && window.Webflow.destroy && window.Webflow.ready) {
    window.Webflow.destroy();
    window.Webflow.ready();
    window.Webflow.require('ix2').init();
  }
  
  console.log(`✅ Displayed ${songsToDisplay.length} songs on favorite songs page`);
  
  // Initialize waveforms for these cards
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


/**
 * ============================================================
 * KEY FILTER SYSTEM
 * Handles Sharp/Flat toggle, Major/Minor toggle, and key selection
 * ============================================================
 */
function initKeyFilterSystem() {
  console.log('🎹 Initializing Key Filter System');
  
  // Find the KEY filter-category specifically (not Genre, Mood, etc.)
  // Look for the one that contains the sharp-flat-toggle-wrapper
  let keyAccordion = null;
  
  // First, try to find the sharp-flat-toggle-wrapper
  const toggleWrapper = document.querySelector('.sharp-flat-toggle-wrapper');
  if (toggleWrapper) {
    // Walk up to find the parent filter-category
    keyAccordion = toggleWrapper.closest('.filter-category');
    console.log('🔍 Found KEY filter via toggle wrapper');
  }
  
  // Fallback: look for filter-category with specific class or attribute
  if (!keyAccordion) {
    keyAccordion = document.querySelector('.filter-category.key');
  }
  
  // Last resort: check all filter-categories to find the one with key elements
  if (!keyAccordion) {
    const allCategories = document.querySelectorAll('.filter-category');
    console.log(`🔍 Checking ${allCategories.length} filter-category elements`);
    for (const category of allCategories) {
      if (category.querySelector('.sharp-flat-toggle-wrapper') || 
          category.querySelector('.sharp-key-column')) {
        keyAccordion = category;
        console.log('🔍 Found KEY filter by checking children');
        break;
      }
    }
  }
  
  if (!keyAccordion) {
    console.log('⚠️ Key filter-category not found - skipping Key Filter System');
    console.log('💡 Looking for: .filter-category that contains .sharp-flat-toggle-wrapper');
    return;
  }
  
  console.log('✅ Key accordion found:', keyAccordion.className);
  
  // Get all elements with detailed logging
  const sharpFlatWrapper = keyAccordion.querySelector('.sharp-flat-toggle-wrapper');
  console.log('🔍 Sharp-flat wrapper found:', !!sharpFlatWrapper, sharpFlatWrapper?.className);
  
  let sharpButton = null;
  let flatButton = null;
  
  if (sharpFlatWrapper) {
    const buttons = sharpFlatWrapper.querySelectorAll('.w-button, button, [role="button"], .sharp-button, .flat-button');
    console.log('🔍 Buttons found in wrapper:', buttons.length);
    if (buttons.length >= 2) {
      sharpButton = buttons[0];  // First button is Sharp
      flatButton = buttons[1];   // Second button is Flat
    } else {
      // Try looking for buttons with specific classes
      sharpButton = sharpFlatWrapper.querySelector('.sharp-button, [data-key-type="sharp"]');
      flatButton = sharpFlatWrapper.querySelector('.flat-button, [data-key-type="flat"]');
    }
  }
  
  const sharpColumn = keyAccordion.querySelector('.sharp-key-column');
  const flatColumn = keyAccordion.querySelector('.flat-key-column');
  
  console.log('🔍 Columns found:', {
    sharpColumn: !!sharpColumn,
    flatColumn: !!flatColumn
  });
  
  // Debug logging
  console.log('🔍 Element check:', {
    sharpButton: !!sharpButton,
    flatButton: !!flatButton,
    sharpColumn: !!sharpColumn,
    flatColumn: !!flatColumn
  });
  
  if (!sharpButton || !flatButton || !sharpColumn || !flatColumn) {
    console.error('❌ Missing Sharp/Flat elements - Details:', {
      sharpButton: sharpButton ? '✓' : '✗ MISSING',
      flatButton: flatButton ? '✓' : '✗ MISSING',
      sharpColumn: sharpColumn ? '✓' : '✗ MISSING',
      flatColumn: flatColumn ? '✓' : '✗ MISSING'
    });
    console.log('💡 Make sure your Webflow structure has these elements with correct class names');
    return;
  }
  
  // Get Major/Minor elements for BOTH Sharp and Flat sections using data-key-group
  const sharpMajorButton = sharpColumn.querySelector('[data-key-group="major"]');
  const sharpMinorButton = sharpColumn.querySelector('[data-key-group="minor"]');
  const sharpMajorColumn = sharpColumn.querySelector('.maj-key-column');
  const sharpMinorColumn = sharpColumn.querySelector('.min-key-column');
  
  const flatMajorButton = flatColumn.querySelector('[data-key-group="major"]');
  const flatMinorButton = flatColumn.querySelector('[data-key-group="minor"]');
  const flatMajorColumn = flatColumn.querySelector('.maj-key-column');
  const flatMinorColumn = flatColumn.querySelector('.min-key-column');
  
  console.log('🔍 Major/Minor buttons check:', {
    sharpMajor: !!sharpMajorButton,
    sharpMinor: !!sharpMinorButton,
    flatMajor: !!flatMajorButton,
    flatMinor: !!flatMinorButton
  });
  
  console.log('✅ Found all Key filter elements');
  
  // State tracking
  let currentSharpFlat = 'sharp'; // 'sharp' or 'flat'
  let sharpMajMin = null; // 'major', 'minor', or null
  let flatMajMin = null; // 'major', 'minor', or null
  
  /**
   * Get currently selected generic key (using data-generic-key attribute)
   */
  function getCurrentlySelectedKey() {
  const checkedRadio = keyAccordion.querySelector('input[type="radio"][data-generic-key]:checked');
  const genericKey = checkedRadio ? checkedRadio.getAttribute('data-generic-key') : null;
  console.log('🔍 getCurrentlySelectedKey:', {
    found: !!checkedRadio,
    genericKey: genericKey,
    element: checkedRadio
  });
  return genericKey;
}
  
  /**
   * Restore selected key after switching sections (using data-generic-key)
   */
  function restoreSelectedKey(genericKey, targetColumn) {
  console.log('🔄 restoreSelectedKey called:', {
    genericKey: genericKey,
    targetColumn: targetColumn?.className,
    columnVisible: targetColumn ? getComputedStyle(targetColumn).display : 'n/a'
  });
  
  if (!genericKey || !targetColumn) {
    console.log('❌ Cannot restore - missing key or column');
    return;
  }
  
  const matchingRadio = targetColumn.querySelector(`input[type="radio"][data-generic-key="${genericKey}"]`);
  console.log('🔍 Looking for radio with data-generic-key=' + genericKey + ':', {
    found: !!matchingRadio,
    alreadyChecked: matchingRadio?.checked,
    element: matchingRadio
  });
  
  if (matchingRadio && !matchingRadio.checked) {
    console.log('✅ Clicking radio (not just checking):', matchingRadio);
    // Trigger actual click instead of just setting checked
    matchingRadio.click();
  } else if (matchingRadio && matchingRadio.checked) {
    console.log('ℹ️ Radio already checked');
  } else {
    console.log('❌ No matching radio found');
  }
}
  
  /**
   * Style Sharp/Flat buttons
   */
  function styleSharpFlatButton(button, isActive) {
    if (!button) return;
    
    // For standard buttons, style the button element directly
    if (isActive) {
      button.style.color = '#191919';
      button.style.borderBottom = '3px solid #191919';
      button.style.backgroundColor = ''; // Remove any background
    } else {
      button.style.color = '';
      button.style.borderBottom = '';
      button.style.backgroundColor = '';
    }
  }
  
  /**
   * Style Major/Minor buttons
   */
  function styleMajMinButton(button, isActive) {
    if (!button) return;
    
    // The button is the input element, but we need to style its parent wrapper
    const wrapper = button.closest('.maj-wrapper, .min-wrapper, .w-radio, .radio-wrapper');
    
    if (!wrapper) {
      console.warn('No wrapper found for button:', button);
      return;
    }
    
    if (isActive) {
      wrapper.classList.add('is-active');
    } else {
      wrapper.classList.remove('is-active');
    }
  }
  
  /**
 * Show Sharp or Flat column
 */
function showSharpFlat(which) {
  const currentKey = getCurrentlySelectedKey();
  
  const keyButtonWrapper = keyAccordion.querySelector('.key-button-wrapper');
  if (keyButtonWrapper) {
    keyButtonWrapper.classList.add('no-key-transitions');
  }
  
  currentSharpFlat = which;
  
  if (which === 'sharp') {
    // Sync: Sharp inherits Flat's state
    if (flatMajMin) {
      sharpMajMin = flatMajMin;
    }
    
    sharpColumn.style.display = 'block';
    sharpColumn.style.visibility = 'visible';
    sharpColumn.style.opacity = '1';
    
    flatColumn.style.display = 'none';
    flatColumn.style.visibility = 'hidden';
    flatColumn.style.opacity = '0';
    
    styleSharpFlatButton(sharpButton, true);
    styleSharpFlatButton(flatButton, false);
    
    if (sharpMajMin === 'major') {
      if (sharpMajorColumn) {
        sharpMajorColumn.style.display = 'flex';
        sharpMajorColumn.style.visibility = 'visible';
        sharpMajorColumn.style.opacity = '1';
      }
      if (sharpMinorColumn) {
        sharpMinorColumn.style.display = 'none';
      }
      styleMajMinButton(sharpMajorButton, true);
      sharpMajorButton.checked = true;
      if (currentKey && sharpMajorColumn) {
        setTimeout(() => restoreSelectedKey(currentKey, sharpMajorColumn), 50);
      }
    } else if (sharpMajMin === 'minor') {
      if (sharpMinorColumn) {
        sharpMinorColumn.style.display = 'flex';
        sharpMinorColumn.style.visibility = 'visible';
        sharpMinorColumn.style.opacity = '1';
      }
      if (sharpMajorColumn) {
        sharpMajorColumn.style.display = 'none';
      }
      styleMajMinButton(sharpMinorButton, true);
      sharpMinorButton.checked = true;
      if (currentKey && sharpMinorColumn) {
        setTimeout(() => restoreSelectedKey(currentKey, sharpMinorColumn), 50);
      }
    } else {
      // No selection - show major keys
      if (sharpMajorColumn) {
        sharpMajorColumn.style.display = 'flex';
        sharpMajorColumn.style.visibility = 'visible';
        sharpMajorColumn.style.opacity = '1';
      }
      if (sharpMinorColumn) {
        sharpMinorColumn.style.display = 'none';
      }
    }
    
  } else {
    // Sync: Flat inherits Sharp's state
    if (sharpMajMin) {
      flatMajMin = sharpMajMin;
    }
    
    flatColumn.style.display = 'block';
    flatColumn.style.visibility = 'visible';
    flatColumn.style.opacity = '1';
    
    sharpColumn.style.display = 'none';
    sharpColumn.style.visibility = 'hidden';
    sharpColumn.style.opacity = '0';
    
    styleSharpFlatButton(flatButton, true);
    styleSharpFlatButton(sharpButton, false);
    
    if (flatMajMin === 'major') {
      if (flatMajorColumn) {
        flatMajorColumn.style.display = 'flex';
        flatMajorColumn.style.visibility = 'visible';
        flatMajorColumn.style.opacity = '1';
      }
      if (flatMinorColumn) {
        flatMinorColumn.style.display = 'none';
      }
      styleMajMinButton(flatMajorButton, true);
      flatMajorButton.checked = true;
      if (currentKey && flatMajorColumn) {
        setTimeout(() => restoreSelectedKey(currentKey, flatMajorColumn), 50);
      }
    } else if (flatMajMin === 'minor') {
      if (flatMinorColumn) {
        flatMinorColumn.style.display = 'flex';
        flatMinorColumn.style.visibility = 'visible';
        flatMinorColumn.style.opacity = '1';
      }
      if (flatMajorColumn) {
        flatMajorColumn.style.display = 'none';
      }
      styleMajMinButton(flatMinorButton, true);
      flatMinorButton.checked = true;
      if (currentKey && flatMinorColumn) {
        setTimeout(() => restoreSelectedKey(currentKey, flatMinorColumn), 50);
      }
    } else {
      // No selection - show major keys
      if (flatMajorColumn) {
        flatMajorColumn.style.display = 'flex';
        flatMajorColumn.style.visibility = 'visible';
        flatMajorColumn.style.opacity = '1';
      }
      if (flatMinorColumn) {
        flatMinorColumn.style.display = 'none';
      }
    }
  }
  
  setTimeout(() => {
    if (keyButtonWrapper) {
      keyButtonWrapper.classList.remove('no-key-transitions');
    }
  }, 50);
}
  
  /**
   * Show Major or Minor column (within current Sharp/Flat section)
   */
  function showMajorMinor(which, section) {
    // Save currently selected key before switching
    const currentKey = getCurrentlySelectedKey();
    
    const isSharp = section === 'sharp';
    const majorColumn = isSharp ? sharpMajorColumn : flatMajorColumn;
    const minorColumn = isSharp ? sharpMinorColumn : flatMinorColumn;
    const majorButton = isSharp ? sharpMajorButton : flatMajorButton;
    const minorButton = isSharp ? sharpMinorButton : flatMinorButton;
    
    if (!majorColumn || !minorColumn) return;
    
    if (which === 'major') {
      majorColumn.style.display = 'flex';
      majorColumn.style.visibility = 'visible';
      majorColumn.style.opacity = '1';
      
      minorColumn.style.display = 'none';
      minorColumn.style.visibility = 'hidden';
      minorColumn.style.opacity = '0';
      
      styleMajMinButton(majorButton, true);
      styleMajMinButton(minorButton, false);
      
      // Restore key selection in the major column
      if (currentKey) {
        setTimeout(() => restoreSelectedKey(currentKey, majorColumn), 50);
      }
      
    } else { // minor
      minorColumn.style.display = 'flex';
      minorColumn.style.visibility = 'visible';
      minorColumn.style.opacity = '1';
      
      majorColumn.style.display = 'none';
      majorColumn.style.visibility = 'hidden';
      majorColumn.style.opacity = '0';
      
      styleMajMinButton(minorButton, true);
      styleMajMinButton(majorButton, false);
      
      // Restore key selection in the minor column
      if (currentKey) {
        setTimeout(() => restoreSelectedKey(currentKey, minorColumn), 50);
      }
    }
  }
  
  /**
   * Sharp/Flat button click handlers - using capture phase to prevent blocking
   */
  sharpButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showSharpFlat('sharp');
  }, true); // Use capture phase
  
  flatButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showSharpFlat('flat');
  }, true); // Use capture phase

  
// SHARP MAJOR
  
  if (sharpMajorButton) {
  sharpMajorButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove old Major/Minor tags before toggling
    const tagsContainer = document.querySelector('.filter-tags-container');
    if (tagsContainer) {
      const oldTags = Array.from(tagsContainer.querySelectorAll('.filter-tag'));
      oldTags.forEach(tag => {
        const text = tag.querySelector('.filter-tag-text')?.textContent.trim();
        if (text === 'Major' || text === 'Minor') {
          tag.remove();
        }
      });
    }
    
    const currentKey = getCurrentlySelectedKey();
    
    if (sharpMajMin === 'major') {
      sharpMajMin = null;
      styleMajMinButton(sharpMajorButton, false);
      sharpMajorButton.checked = false;
      sharpMajorButton.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      sharpMajMin = 'major';
      styleMajMinButton(sharpMajorButton, true);
      styleMajMinButton(sharpMinorButton, false);
      sharpMinorButton.checked = false;
      
      if (sharpMajorColumn) {
        sharpMajorColumn.style.display = 'flex';
        sharpMajorColumn.style.visibility = 'visible';
        sharpMajorColumn.style.opacity = '1';
      }
      if (sharpMinorColumn) {
        sharpMinorColumn.style.display = 'none';
      }
      
      if (currentKey && sharpMajorColumn) {
        setTimeout(() => {
          restoreSelectedKey(currentKey, sharpMajorColumn);
          setTimeout(() => {
            sharpMajorButton.checked = true;
            sharpMajorButton.dispatchEvent(new Event('change', { bubbles: true }));
          }, 5);
        }, 10);
      } else {
        sharpMajorButton.checked = true;
        sharpMajorButton.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, true);
}

// SHARP MINOR
  
  if (sharpMinorButton) {
  sharpMinorButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove old Major/Minor tags before toggling
    const tagsContainer = document.querySelector('.filter-tags-container');
    if (tagsContainer) {
      const oldTags = Array.from(tagsContainer.querySelectorAll('.filter-tag'));
      oldTags.forEach(tag => {
        const text = tag.querySelector('.filter-tag-text')?.textContent.trim();
        if (text === 'Major' || text === 'Minor') {
          tag.remove();
        }
      });
    }
    
    const currentKey = getCurrentlySelectedKey();
    
    if (sharpMajMin === 'minor') {
      sharpMajMin = null;
      styleMajMinButton(sharpMinorButton, false);
      sharpMinorButton.checked = false;
      sharpMinorButton.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      sharpMajMin = 'minor';
      styleMajMinButton(sharpMinorButton, true);
      styleMajMinButton(sharpMajorButton, false);
      sharpMajorButton.checked = false;
      
      if (sharpMinorColumn) {
        sharpMinorColumn.style.display = 'flex';
        sharpMinorColumn.style.visibility = 'visible';
        sharpMinorColumn.style.opacity = '1';
      }
      if (sharpMajorColumn) {
        sharpMajorColumn.style.display = 'none';
      }
      
      if (currentKey && sharpMinorColumn) {
        sharpMinorColumn.classList.add('no-key-transitions');
        setTimeout(() => {
          restoreSelectedKey(currentKey, sharpMinorColumn);
          setTimeout(() => {
            sharpMinorButton.checked = true;
            sharpMinorButton.dispatchEvent(new Event('change', { bubbles: true }));
            sharpMinorColumn.classList.remove('no-key-transitions');
          }, 5);
        }, 10);
      } else {
        sharpMinorButton.checked = true;
        sharpMinorButton.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, true);
}

// FLAT MAJOR
  
  if (flatMajorButton) {
  flatMajorButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove old Major/Minor tags before toggling
    const tagsContainer = document.querySelector('.filter-tags-container');
    if (tagsContainer) {
      const oldTags = Array.from(tagsContainer.querySelectorAll('.filter-tag'));
      oldTags.forEach(tag => {
        const text = tag.querySelector('.filter-tag-text')?.textContent.trim();
        if (text === 'Major' || text === 'Minor') {
          tag.remove();
        }
      });
    }
    
    const currentKey = getCurrentlySelectedKey();
    
    if (flatMajMin === 'major') {
      flatMajMin = null;
      styleMajMinButton(flatMajorButton, false);
      flatMajorButton.checked = false;
      flatMajorButton.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      flatMajMin = 'major';
      styleMajMinButton(flatMajorButton, true);
      styleMajMinButton(flatMinorButton, false);
      flatMinorButton.checked = false;
      
      if (flatMajorColumn) {
        flatMajorColumn.style.display = 'flex';
        flatMajorColumn.style.visibility = 'visible';
        flatMajorColumn.style.opacity = '1';
      }
      if (flatMinorColumn) {
        flatMinorColumn.style.display = 'none';
      }
      
      if (currentKey && flatMajorColumn) {
        setTimeout(() => {
          restoreSelectedKey(currentKey, flatMajorColumn);
          setTimeout(() => {
            flatMajorButton.checked = true;
            flatMajorButton.dispatchEvent(new Event('change', { bubbles: true }));
          }, 5);
        }, 10);
      } else {
        flatMajorButton.checked = true;
        flatMajorButton.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, true);
}

// FLAT MINOR
  
  if (flatMinorButton) {
  flatMinorButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove old Major/Minor tags before toggling
    const tagsContainer = document.querySelector('.filter-tags-container');
    if (tagsContainer) {
      const oldTags = Array.from(tagsContainer.querySelectorAll('.filter-tag'));
      oldTags.forEach(tag => {
        const text = tag.querySelector('.filter-tag-text')?.textContent.trim();
        if (text === 'Major' || text === 'Minor') {
          tag.remove();
        }
      });
    }
    
    const currentKey = getCurrentlySelectedKey();
    
    if (flatMajMin === 'minor') {
      flatMajMin = null;
      styleMajMinButton(flatMinorButton, false);
      flatMinorButton.checked = false;
      flatMinorButton.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      flatMajMin = 'minor';
      styleMajMinButton(flatMinorButton, true);
      styleMajMinButton(flatMajorButton, false);
      flatMajorButton.checked = false;
      
      if (flatMinorColumn) {
        flatMinorColumn.style.display = 'flex';
        flatMinorColumn.style.visibility = 'visible';
        flatMinorColumn.style.opacity = '1';
      }
      if (flatMajorColumn) {
        flatMajorColumn.style.display = 'none';
      }
      
      if (currentKey && flatMinorColumn) {
        setTimeout(() => {
          restoreSelectedKey(currentKey, flatMinorColumn);
          setTimeout(() => {
            flatMinorButton.checked = true;
            flatMinorButton.dispatchEvent(new Event('change', { bubbles: true }));
          }, 5);
        }, 10);
      } else {
        flatMinorButton.checked = true;
        flatMinorButton.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, true);
}

  
 /**
 * Listen for key radio button clicks to maintain Major/Minor active state
 */
function attachKeyRadioListeners(column, section, majMin) {
  const radios = column.querySelectorAll('input[type="radio"]');
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        // Check if major/minor was ALREADY active before this key was clicked
        const wasMajorActive = (section === 'sharp' ? sharpMajMin : flatMajMin) === 'major';
        const wasMinorActive = (section === 'sharp' ? sharpMajMin : flatMajMin) === 'minor';
        
        // Only keep major/minor active if it was already active
        if (wasMajorActive || wasMinorActive) {
          // Update state tracking
          if (section === 'sharp') {
            sharpMajMin = majMin;
          } else {
            flatMajMin = majMin;
          }
          
          // Keep Major/Minor button visually active
          setTimeout(() => {
            if (majMin === 'major') {
              const majorButton = section === 'sharp' ? sharpMajorButton : flatMajorButton;
              styleMajMinButton(majorButton, true);
              if (majorButton) {
                majorButton.checked = true;
              }
            } else {
              const minorButton = section === 'sharp' ? sharpMinorButton : flatMinorButton;
              styleMajMinButton(minorButton, true);
              if (minorButton) {
                minorButton.checked = true;
              }
            }
          }, 10);
        }
      }
    });
  });
}
  
  // Attach listeners to all key radio buttons
  if (sharpMajorColumn) attachKeyRadioListeners(sharpMajorColumn, 'sharp', 'major');
  if (sharpMinorColumn) attachKeyRadioListeners(sharpMinorColumn, 'sharp', 'minor');
  if (flatMajorColumn) attachKeyRadioListeners(flatMajorColumn, 'flat', 'major');
  if (flatMinorColumn) attachKeyRadioListeners(flatMinorColumn, 'flat', 'minor');

// Attach listeners to all key radio buttons
if (sharpMajorColumn) attachKeyRadioListeners(sharpMajorColumn, 'sharp', 'major');
if (sharpMinorColumn) attachKeyRadioListeners(sharpMinorColumn, 'sharp', 'minor');
if (flatMajorColumn) attachKeyRadioListeners(flatMajorColumn, 'flat', 'major');
if (flatMinorColumn) attachKeyRadioListeners(flatMinorColumn, 'flat', 'minor');

// Remove old key tags when new key selected
document.querySelectorAll('[data-filter-group="Key"][data-filter-value]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.checked) {
      const tagsContainer = document.querySelector('.filter-tags-container');
      if (tagsContainer) {
        const allKeyTags = Array.from(tagsContainer.querySelectorAll('.filter-tag'));
        allKeyTags.forEach(tag => {
          const tagText = tag.querySelector('.filter-tag-text')?.textContent.trim();
          const matchingRadio = document.querySelector(`[data-filter-group="Key"][data-filter-value]:checked`);
          const matchingLabel = matchingRadio?.closest('.w-radio, .radio-wrapper')?.querySelector('label');
          const currentKeyText = matchingLabel?.textContent.trim();
          
          if (tagText && tagText !== currentKeyText && tagText !== 'Major' && tagText !== 'Minor') {
            tag.remove();
          }
        });
      }
    }
  });
});

/**
 * Initial state: Show Sharp section with major keys visible (but not filtered)
 */
showSharpFlat('sharp');
  
/**
 * Initial state: Show Sharp section with major keys visible (but not filtered)
 */
showSharpFlat('sharp');

// Show major keys in both sections for user selection (not filtering yet)
if (sharpMajorColumn) {
  sharpMajorColumn.style.display = 'flex';
  sharpMajorColumn.style.visibility = 'visible';
  sharpMajorColumn.style.opacity = '1';
}
if (sharpMinorColumn) {
  sharpMinorColumn.style.display = 'none';
}

if (flatMajorColumn) {
  flatMajorColumn.style.display = 'flex';
  flatMajorColumn.style.visibility = 'visible';
  flatMajorColumn.style.opacity = '1';
}
if (flatMinorColumn) {
  flatMinorColumn.style.display = 'none';
}

// Ensure no buttons are styled as active on load
styleMajMinButton(sharpMajorButton, false);
styleMajMinButton(sharpMinorButton, false);
styleMajMinButton(flatMajorButton, false);
styleMajMinButton(flatMinorButton, false);

// Also remove any Webflow default active classes
const allWrappers = keyAccordion.querySelectorAll('.maj-wrapper, .min-wrapper');
allWrappers.forEach(wrapper => wrapper.classList.remove('is-active'));

console.log('✅ Key Filter System initialized');
window.keyFilterSystemReady = true;
// Clear button handling for Key filter - attach to document to catch all clears
document.addEventListener('click', (e) => {
  if (e.target.matches('.circle-x, .circle-x *')) {
    console.log('🧹 Clear button clicked, cleaning Key filters...');
    setTimeout(() => {
      // Uncheck all Key radios
      const allKeyRadios = document.querySelectorAll('[data-filter-group="Key"]');
      console.log('Found Key radios to clear:', allKeyRadios.length);
      allKeyRadios.forEach(radio => {
        radio.checked = false;
      });
      
      // Remove ALL active states from Key section
      const activeInKey = document.querySelectorAll('[data-filter-type="key"] .is-active');
      console.log('Found active wrappers to clear:', activeInKey.length);
      activeInKey.forEach(el => {
        el.classList.remove('is-active');
      });
      
      // Reset state variables
      sharpMajMin = null;
      flatMajMin = null;
      
      console.log('✅ Cleared Key filter states');

      // Also remove all Key-related tags from container
const tagsContainer = document.querySelector('.filter-tags-container');
if (tagsContainer) {
  const allTags = Array.from(tagsContainer.querySelectorAll('.filter-tag'));
  allTags.forEach(tag => {
    const text = tag.querySelector('.filter-tag-text')?.textContent.trim();
    // Remove any tag that looks like a key (single letter) or Major/Minor
    if (text && (text.length <= 3 || text === 'Major' || text === 'Minor')) {
      tag.remove();
    }
  });
}
      
    }, 100);
  }
});
}
  
function toggleClearButton() {
  const clearBtn = document.querySelector('.circle-x');
  const searchBar = document.querySelector('[data-filter-search="true"]');
  if (!clearBtn) return;

  const hasSearch = searchBar && searchBar.value.trim().length > 0;
  const hasFilters = Array.from(document.querySelectorAll('[data-filter-group]')).some(input => input.checked);

  clearBtn.style.display = (hasSearch || hasFilters) ? 'flex' : 'none';
}

function initSearchAndFilters() {
  const g = window.musicPlayerPersistent;
  const searchBar = document.querySelector('[data-filter-search="true"]');
  const clearBtn = document.querySelector('.circle-x');
  
  function clearAllFilters() {
  const hasSearch = searchBar && searchBar.value.trim().length > 0;
  const hasFilters = Array.from(document.querySelectorAll('[data-filter-group]')).some(input => input.checked);

  if (!hasSearch && !hasFilters) {
    return;
  }

  if (searchBar && hasSearch) {
    searchBar.value = '';
    // Optional: dispatch input to trigger applyFilters early
    searchBar.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Clear checkbox filters
  const tagRemoveButtons = document.querySelectorAll('.filter-tag-remove');
  if (tagRemoveButtons.length > 0) {
    tagRemoveButtons.forEach((btn) => btn.click());
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

  // Save empty state so restoration knows it was intentionally cleared
  localStorage.setItem('musicFilters', JSON.stringify({
    filters: [],
    searchQuery: ''
  }));

  toggleClearButton();
  applyFilters();
  updateFilterDots();
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
  // Start hidden — will only show after restoration (if needed)
  clearBtn.style.display = 'none';
  clearBtn.addEventListener('click', clearAllFilters);

  // Safety: update visibility after a delay in case restoration takes time
  setTimeout(() => {
    toggleClearButton();
  }, 800);
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
  
  document.querySelectorAll('[id="favorite-button"]').forEach((btn) => {
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
 * BPM FILTER SYSTEM
 * Global restore function - called during filter restoration
 * ============================================================
 */
function restoreBPMState() {
  const savedFilters = localStorage.getItem('musicFilters');
  if (!savedFilters) return;
  
  try {
    const filterState = JSON.parse(savedFilters);
    if (!filterState.bpm) return;
    
    const bpmState = filterState.bpm;
    
    // Re-query all DOM elements
    const SLIDER_WIDTH = 225;
    const MIN_BPM = 1;
    const MAX_BPM = 300;
    const BPM_RANGE = MAX_BPM - MIN_BPM;
    
    const exactToggle = document.querySelector('.bpm-toggle .exact');
    const rangeToggle = document.querySelector('.bpm-toggle .range');
    const exactInput = document.querySelector('.bpm-input-field');
    const lowInput = document.querySelector('.bpm-input-field-low');
    const highInput = document.querySelector('.bpm-input-field-high');
    const sliderRangeWrapper = document.querySelector('.slider-range-wrapper');
    const sliderExactWrapper = document.querySelector('.slider-exact-wrapper');
    const sliderHandleLow = document.querySelector('.slider-handle-low');
    const sliderHandleHigh = document.querySelector('.slider-handle-high');
    const sliderHandleExact = document.querySelector('.slider-handle-exact');
    
    if (!exactToggle || !rangeToggle) return;
    
    // Helper: Update handle position
    function updateHandlePosition(handle, bpm) {
      if (!handle) return;
      const value = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
      const ratio = (value - MIN_BPM) / BPM_RANGE;
      const pixels = ratio * SLIDER_WIDTH;
      
      handle.style.position = 'absolute';
      handle.style.left = `${pixels}px`;
      handle.style.top = '50%';
      handle.style.transform = 'translate(-50%, -50%)';
    }
    
    // Restore mode
    const mode = bpmState.mode || 'range';
    if (mode === 'exact') {
      exactToggle.style.color = '#191919';
      exactToggle.style.textDecoration = 'underline';
      rangeToggle.style.color = '#9e9e9e';
      rangeToggle.style.textDecoration = 'none';
      
      if (exactInput) exactInput.style.display = 'block';
      if (lowInput) lowInput.closest('.bpm-range-field-wrapper').style.display = 'none';
      if (sliderExactWrapper) sliderExactWrapper.style.display = 'block';
      if (sliderRangeWrapper) sliderRangeWrapper.style.display = 'none';
    } else {
      rangeToggle.style.color = '#191919';
      rangeToggle.style.textDecoration = 'underline';
      exactToggle.style.color = '#9e9e9e';
      exactToggle.style.textDecoration = 'none';
      
      if (exactInput) exactInput.style.display = 'none';
      if (lowInput) lowInput.closest('.bpm-range-field-wrapper').style.display = 'flex';
      if (sliderExactWrapper) sliderExactWrapper.style.display = 'none';
      if (sliderRangeWrapper) sliderRangeWrapper.style.display = 'block';
    }
    
    // Restore values
    if (bpmState.exact && exactInput && sliderHandleExact) {
      exactInput.value = bpmState.exact;
      updateHandlePosition(sliderHandleExact, parseInt(bpmState.exact));
    }
    
    if (bpmState.low && lowInput && sliderHandleLow) {
      lowInput.value = bpmState.low;
      updateHandlePosition(sliderHandleLow, parseInt(bpmState.low));
    }
    
    if (bpmState.high && highInput && sliderHandleHigh) {
      highInput.value = bpmState.high;
      updateHandlePosition(sliderHandleHigh, parseInt(bpmState.high));
    }
    
    console.log('✅ BPM state restored:', bpmState);
    
// Apply filter after a short delay to ensure songs are loaded
setTimeout(() => {
  let minBPM = null;
  let maxBPM = null;
  
  if (mode === 'exact') {
    const exact = parseInt(exactInput?.value);
    if (!isNaN(exact)) {
      minBPM = exact;
      maxBPM = exact;
    }
  } else {
    const low = parseInt(lowInput?.value);
    const high = parseInt(highInput?.value);
    if (!isNaN(low)) minBPM = low;
    if (!isNaN(high)) maxBPM = high;
  }
  
 if (minBPM !== null || maxBPM !== null) {
  document.querySelectorAll('.song-wrapper').forEach(song => {
    // Skip songs already hidden by other filters
    if (song.style.display === 'none' && song.getAttribute('data-hidden-by-bpm') !== 'true') {
      return; // Don't touch songs hidden by other filters
    }
    
    const bpmText = song.querySelector('.bpm')?.textContent || '';
    const songBPM = parseInt(bpmText.replace(/\D/g, ''));
    
    if (isNaN(songBPM)) {
      song.style.display = 'none';
      song.setAttribute('data-hidden-by-bpm', 'true');
      return;
    }
    
    let shouldShow = true;
    if (minBPM !== null && songBPM < minBPM) shouldShow = false;
    if (maxBPM !== null && songBPM > maxBPM) shouldShow = false;
    
    if (!shouldShow) {
      song.style.display = 'none';
      song.setAttribute('data-hidden-by-bpm', 'true');
    } else {
      // Only unhide if currently hidden AND was hidden by BPM
      if (song.style.display === 'none' && song.getAttribute('data-hidden-by-bpm') === 'true') {
        song.style.display = '';
      }
      song.removeAttribute('data-hidden-by-bpm');
    }
  });
    
    console.log(`🎵 BPM filter applied: ${minBPM || 'any'} - ${maxBPM || 'any'}`);
  }
  
  // Update tag - need to access the function from initBPMFilter scope
  const tagsContainer = document.querySelector('.filter-tags-container');
  if (tagsContainer) {
    // Remove existing BPM tag
    const existingTag = tagsContainer.querySelector('[data-bpm-tag]');
    if (existingTag) existingTag.remove();
    
    // Get current values
    let tagText = '';
    if (mode === 'exact') {
      const exact = exactInput?.value;
      if (exact) tagText = `${exact} BPM`;
    } else {
      const low = lowInput?.value;
      const high = highInput?.value;
      if (low && high) tagText = `${low}-${high} BPM`;
      else if (low) tagText = `${low}+ BPM`;
      else if (high) tagText = `≤${high} BPM`;
    }
    
    // Create tag if we have text
    if (tagText) {
      const tag = document.createElement('div');
      tag.className = 'filter-tag';
      tag.setAttribute('data-bpm-tag', 'true');
      tag.innerHTML = `
        <span class="filter-tag-text">${tagText}</span>
        <span class="filter-tag-remove x-button-style">×</span>
      `;
      
      tag.querySelector('.filter-tag-remove').addEventListener('click', function() {
        const clearBtn = document.querySelector('.bpm-clear');
        if (clearBtn) clearBtn.click();
      });
      
      tagsContainer.appendChild(tag);
    }
    
    // Update clear button visibility
    const clearButton = document.querySelector('.circle-x');
    if (clearButton) {
      const hasAnyFilters = tagsContainer.querySelectorAll('.filter-tag').length > 0;
      clearButton.style.display = hasAnyFilters ? 'flex' : 'none';
    }
  }
}, 200);
    
  } catch (e) {
    console.error('Error restoring BPM state:', e);
  }
}

// START OF FILTER DOTS

function updateFilterDots() {
  document.querySelectorAll('[data-filter-type]').forEach(section => {
    const filterType = section.getAttribute('data-filter-type');
    const dot = section.querySelector('.filter-dot-active');
    if (!dot) return;
    
    let isActive = false;
    
    // Check based on filter type
    if (filterType === 'bpm') {
      // Check if BPM has values
      const lowInput = document.querySelector('.bpm-input-field-low');
      const highInput = document.querySelector('.bpm-input-field-high');
      const exactInput = document.querySelector('.bpm-input-field');
      isActive = !!(lowInput?.value || highInput?.value || exactInput?.value);
      
    } else if (filterType === 'key') {
      // Check if any key filter is checked
      isActive = !!section.querySelector('[data-filter-group="Key"]:checked');
      
    } else {
      // Check if any checkbox/radio in this section is checked
      isActive = !!section.querySelector('[data-filter-group]:checked');
    }
    
    // Show/hide dot
    dot.style.display = isActive ? 'block' : 'none';
  });
}

// START OF INIT BPM FILTER

function initBPMFilter() {
  console.log('🎵 Initializing BPM Filter System');
  
  // Constants
  const SLIDER_WIDTH = 225; // px
  const MIN_BPM = 1;
  const MAX_BPM = 300;
  const BPM_RANGE = MAX_BPM - MIN_BPM;
  
  // Get all DOM elements
  const exactToggle = document.querySelector('.bpm-toggle .exact');
  const rangeToggle = document.querySelector('.bpm-toggle .range');
  const exactInput = document.querySelector('.bpm-input-field');
  const lowInput = document.querySelector('.bpm-input-field-low');
  const highInput = document.querySelector('.bpm-input-field-high');
  const sliderRangeWrapper = document.querySelector('.slider-range-wrapper');
  const sliderExactWrapper = document.querySelector('.slider-exact-wrapper');
  const sliderHandleLow = document.querySelector('.slider-handle-low');
  const sliderHandleHigh = document.querySelector('.slider-handle-high');
  const sliderHandleExact = document.querySelector('.slider-handle-exact');
  const clearButton = document.querySelector('.bpm-clear');
  
  // Check if elements exist
  if (!exactToggle || !rangeToggle) {
    console.warn('⚠️ BPM toggle elements not found');
    return;
  }
  
  // State
  let currentMode = 'range'; // 'exact' or 'range'
  let isDragging = false;
  let activeHandle = null;
  
  /**
   * Convert pixel position to BPM value
   */
  function pixelToBPM(pixels) {
    const ratio = Math.max(0, Math.min(1, pixels / SLIDER_WIDTH));
    return Math.round(MIN_BPM + (ratio * BPM_RANGE));
  }
  
  /**
   * Convert BPM value to pixel position
   */
  function bpmToPixel(bpm) {
    const value = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
    const ratio = (value - MIN_BPM) / BPM_RANGE;
    return ratio * SLIDER_WIDTH;
  }
  
  /**
   * Update slider handle position
   */
  function updateHandlePosition(handle, bpm) {
    if (!handle) return;
    const pixels = bpmToPixel(bpm);
    handle.style.position = 'absolute';
    handle.style.left = `${pixels}px`;
    handle.style.top = '50%';
    handle.style.transform = 'translate(-50%, -50%)';
  }
  
  /**
   * Toggle between Exact and Range modes
   */
  function setMode(mode, shouldSave = true) {
  currentMode = mode;
  
  if (mode === 'exact') {
    exactToggle.style.color = '#191919';
    exactToggle.style.textDecoration = 'underline';
    rangeToggle.style.color = '#9e9e9e';
    rangeToggle.style.textDecoration = 'none';
    
    if (exactInput) exactInput.style.display = 'block';
    if (lowInput) lowInput.closest('.bpm-range-field-wrapper').style.display = 'none';
    if (sliderExactWrapper) sliderExactWrapper.style.display = 'block';
    if (sliderRangeWrapper) sliderRangeWrapper.style.display = 'none';
    
  } else {
    rangeToggle.style.color = '#191919';
    rangeToggle.style.textDecoration = 'underline';
    exactToggle.style.color = '#9e9e9e';
    exactToggle.style.textDecoration = 'none';
    
    if (exactInput) exactInput.style.display = 'none';
    if (lowInput) lowInput.closest('.bpm-range-field-wrapper').style.display = 'flex';
    if (sliderExactWrapper) sliderExactWrapper.style.display = 'none';
    if (sliderRangeWrapper) sliderRangeWrapper.style.display = 'block';
  }
  
  if (shouldSave) {
    saveBPMState();
  }
}
  
  /**
   * Update input field from slider
   */
  function updateInputFromSlider(handle, input) {
    if (!handle || !input) return;
    const pixels = parseFloat(handle.style.left) || 0;
    const bpm = pixelToBPM(pixels);
    input.value = bpm;
  }
  
  /**
   * Update slider from input field
   */
  function updateSliderFromInput(input, handle) {
  if (!input || !handle) return;
  if (input.value === '') {
    handle.style.left = '0px';
    return;
  }
  const bpm = parseInt(input.value);
  if (isNaN(bpm)) return;
  const clampedBPM = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
  input.value = clampedBPM;
  updateHandlePosition(handle, clampedBPM);
}
  
  /**
   * Handle slider dragging
   */
  function startDrag(e, handle) {
    isDragging = true;
    activeHandle = handle;
    e.preventDefault();
    
    // Add global mouse listeners
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
  }
  
  function onDrag(e) {
    if (!isDragging || !activeHandle) return;
    
    const sliderTrack = activeHandle.closest('.slider-range-wrapper, .slider-exact-wrapper')
                                    ?.querySelector('.slider-track');
    if (!sliderTrack) return;
    
    const rect = sliderTrack.getBoundingClientRect();
    let newLeft = e.clientX - rect.left;
    
    // Clamp to slider bounds
    newLeft = Math.max(0, Math.min(SLIDER_WIDTH, newLeft));
    
    // Prevent handles from crossing in range mode
    if (currentMode === 'range') {
      if (activeHandle === sliderHandleLow && sliderHandleHigh) {
        const highPos = parseFloat(sliderHandleHigh.style.left) || SLIDER_WIDTH;
        newLeft = Math.min(newLeft, highPos);
      } else if (activeHandle === sliderHandleHigh && sliderHandleLow) {
        const lowPos = parseFloat(sliderHandleLow.style.left) || 0;
        newLeft = Math.max(newLeft, lowPos);
      }
    }
    
    activeHandle.style.left = `${newLeft}px`;
    activeHandle.style.top = '50%';
    activeHandle.style.transform = 'translate(-50%, -50%)';
    
    // Update corresponding input
    if (activeHandle === sliderHandleLow && lowInput) {
      updateInputFromSlider(activeHandle, lowInput);
    } else if (activeHandle === sliderHandleHigh && highInput) {
      updateInputFromSlider(activeHandle, highInput);
    } else if (activeHandle === sliderHandleExact && exactInput) {
      updateInputFromSlider(activeHandle, exactInput);
    }
  }
  
function stopDrag() {
  if (isDragging) {
    isDragging = false;
    const lastHandle = activeHandle; // Save before nulling
    activeHandle = null;
    
    // Update input from slider and clear if at extremes
    if (lastHandle === sliderHandleLow && lowInput) {
      updateInputFromSlider(lastHandle, lowInput);
      // Clear if at minimum
      if (lowInput.value === '1') lowInput.value = '';
    } else if (lastHandle === sliderHandleHigh && highInput) {
      updateInputFromSlider(lastHandle, highInput);
      // Clear if at maximum
      if (highInput.value === '300') highInput.value = '';
    } else if (lastHandle === sliderHandleExact && exactInput) {
      updateInputFromSlider(lastHandle, exactInput);
    }
    
    saveBPMState();
    applyBPMFilter();
    updateBPMTag();
    updateFilterDots();
    
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  }
}
/**
 * Clear all BPM values
 */
function clearBPM() {
  // Reset inputs
  if (exactInput) exactInput.value = '';
  if (lowInput) lowInput.value = '';
  if (highInput) highInput.value = '';
  
  // Reset slider positions
  if (sliderHandleExact) sliderHandleExact.style.left = '0px';
  if (sliderHandleLow) sliderHandleLow.style.left = '0px';
  if (sliderHandleHigh) sliderHandleHigh.style.left = `${SLIDER_WIDTH}px`;
  
  saveBPMState();
  
  // Show only songs that were hidden by BPM
document.querySelectorAll('.song-wrapper[data-hidden-by-bpm="true"]').forEach(song => {
  song.style.display = '';
  song.removeAttribute('data-hidden-by-bpm');
});
  
  updateBPMTag();
  updateFilterDots();
  
  // Update clear all button visibility
  const mainClearButton = document.querySelector('.circle-x');
  if (mainClearButton) {
    const hasOtherFilters = document.querySelector('.filter-tags-container')?.querySelectorAll('.filter-tag:not([data-bpm-tag])').length > 0;
    mainClearButton.style.display = hasOtherFilters ? 'flex' : 'none';
  }
}
  
  /**
   * Save BPM state to localStorage
   */
  function saveBPMState() {
    const state = {
      mode: currentMode,
      exact: exactInput?.value || '',
      low: lowInput?.value || '',
      high: highInput?.value || ''
    };
    
    // Get existing filters
    const savedFilters = localStorage.getItem('musicFilters');
    let filterState = { filters: [], searchQuery: '' };
    
    if (savedFilters) {
      try {
        filterState = JSON.parse(savedFilters);
      } catch (e) {
        console.error('Error parsing saved filters:', e);
      }
    }
    
    // Add or update BPM in filters
    filterState.bpm = state;
    
    localStorage.setItem('musicFilters', JSON.stringify(filterState));
    console.log('💾 BPM state saved:', state);
  }
  
  /**
 * Apply BPM filter to songs
 * This integrates with your existing Finsweet filter system
 */
function applyBPMFilter() {
  // Get current BPM values
  let minBPM = null;
  let maxBPM = null;
  
  if (currentMode === 'exact') {
    const exact = parseInt(exactInput?.value);
    if (!isNaN(exact)) {
      minBPM = exact;
      maxBPM = exact;
    }
  } else {
    const low = parseInt(lowInput?.value);
    const high = parseInt(highInput?.value);
    if (!isNaN(low)) minBPM = low;
    if (!isNaN(high)) maxBPM = high;
  }
  
  // If no BPM filter, unhide songs that were hidden by BPM
  if (minBPM === null && maxBPM === null) {
    document.querySelectorAll('.song-wrapper[data-hidden-by-bpm="true"]').forEach(song => {
      song.removeAttribute('data-hidden-by-bpm');
      song.style.display = '';
    });
    return;
  }
  
  // DON'T clear marks here - process each song individually
  
  // Apply filter to all songs
  document.querySelectorAll('.song-wrapper').forEach(song => {
    // Skip songs hidden by other filters (not by BPM)
    if (song.style.display === 'none' && song.getAttribute('data-hidden-by-bpm') !== 'true') {
      return;
    }
    
    const bpmText = song.querySelector('.bpm')?.textContent || '';
    const songBPM = parseInt(bpmText.replace(/\D/g, ''));
    
    if (isNaN(songBPM)) {
      song.style.display = 'none';
      song.setAttribute('data-hidden-by-bpm', 'true');
      return;
    }
    
    let shouldShow = true;
    if (minBPM !== null && songBPM < minBPM) shouldShow = false;
    if (maxBPM !== null && songBPM > maxBPM) shouldShow = false;
    
    if (!shouldShow) {
      song.style.display = 'none';
      song.setAttribute('data-hidden-by-bpm', 'true');
    } else {
      // Song passes BPM filter - unhide if BPM hid it
      if (song.getAttribute('data-hidden-by-bpm') === 'true') {
        song.style.display = '';
      }
      song.removeAttribute('data-hidden-by-bpm');
    }
  });
  
  console.log(`🎵 BPM filter applied: ${minBPM || 'any'} - ${maxBPM || 'any'}`);
}

function updateBPMTag() {
  const tagsContainer = document.querySelector('.filter-tags-container');
  if (!tagsContainer) return;
  
  // Remove existing BPM tag
  const existingTag = tagsContainer.querySelector('[data-bpm-tag]');
  if (existingTag) existingTag.remove();
  
  // Get current values
  let tagText = '';
  if (currentMode === 'exact') {
    const exact = exactInput?.value;
    if (exact) tagText = `${exact} BPM`;
  } else {
    const low = lowInput?.value;
    const high = highInput?.value;
    if (low && high) tagText = `${low}-${high} BPM`;
    else if (low) tagText = `${low}+ BPM`;
    else if (high) tagText = `≤${high} BPM`;
  }
  
  // Create tag if we have text
  if (tagText) {
    const tag = document.createElement('div');
    tag.className = 'filter-tag';
    tag.setAttribute('data-bpm-tag', 'true');
    tag.innerHTML = `
      <span class="filter-tag-text">${tagText}</span>
      <span class="filter-tag-remove x-button-style">×</span>
    `;
    
    tag.querySelector('.filter-tag-remove').addEventListener('click', clearBPM);
    tagsContainer.appendChild(tag);
  }
  
  // Update clear button visibility
  const clearButton = document.querySelector('.circle-x');
  if (clearButton) {
    const hasAnyFilters = tagsContainer.querySelectorAll('.filter-tag').length > 0;
    clearButton.style.display = hasAnyFilters ? 'flex' : 'none';
  }
}

/**
 * Initialize event listeners
 */
function setupEventListeners() {
  // Toggle buttons
  exactToggle?.addEventListener('click', () => setMode('exact'));
  rangeToggle?.addEventListener('click', () => setMode('range'));
  
  // Clear button
  clearButton?.addEventListener('click', clearBPM);

  // Clear all button (circle-x) also clears BPM
  const mainClearButton = document.querySelector('.circle-x');
  if (mainClearButton) {
    mainClearButton.addEventListener('click', clearBPM);
  }
    
  // Slider handles - mousedown events
  sliderHandleLow?.addEventListener('mousedown', (e) => startDrag(e, sliderHandleLow));
  sliderHandleHigh?.addEventListener('mousedown', (e) => startDrag(e, sliderHandleHigh));
  sliderHandleExact?.addEventListener('mousedown', (e) => startDrag(e, sliderHandleExact));
  
  // Input fields - blur events (when user clicks out after typing)
  exactInput?.addEventListener('blur', () => {
    updateSliderFromInput(exactInput, sliderHandleExact);
    saveBPMState();
    applyBPMFilter();
    updateBPMTag();
    updateFilterDots();
  });
  
  lowInput?.addEventListener('blur', () => {
    updateSliderFromInput(lowInput, sliderHandleLow);
    saveBPMState();
    applyBPMFilter();
    updateBPMTag();
    updateFilterDots();
  });
  
  highInput?.addEventListener('blur', () => {
    updateSliderFromInput(highInput, sliderHandleHigh);
    saveBPMState();
    applyBPMFilter();
    updateBPMTag();
    updateFilterDots();
  });
  
  // Input fields - Enter key
  [exactInput, lowInput, highInput].forEach(input => {
    input?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.target.blur(); // Trigger blur event
      }
    });
  });
    
    // Only allow numbers in input fields
    [exactInput, lowInput, highInput].forEach(input => {
      input?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
      });
    });
  }
  
  /**
   * Initialize slider handle positions
   */
  function initializeSliders() {
    // Ensure slider tracks have position relative
    const sliderTracks = document.querySelectorAll('.slider-track');
    sliderTracks.forEach(track => {
      track.style.position = 'relative';
    });
    
    // Set default positions for range sliders
    if (sliderHandleLow) {
      sliderHandleLow.style.position = 'absolute';
      sliderHandleLow.style.left = '0px';
      sliderHandleLow.style.top = '50%';
      sliderHandleLow.style.transform = 'translate(-50%, -50%)';
    }
    if (sliderHandleHigh) {
      sliderHandleHigh.style.position = 'absolute';
      sliderHandleHigh.style.left = `${SLIDER_WIDTH}px`;
      sliderHandleHigh.style.top = '50%';
      sliderHandleHigh.style.transform = 'translate(-50%, -50%)';
    }
    if (sliderHandleExact) {
      sliderHandleExact.style.position = 'absolute';
      sliderHandleExact.style.left = '0px';
      sliderHandleExact.style.top = '50%';
      sliderHandleExact.style.transform = 'translate(-50%, -50%)';
    }
  }
  
  // Initialize
initializeSliders();
setupEventListeners();
setMode('range', false); // Start in range mode

// Re-apply BPM filter whenever any other filter changes
document.addEventListener('change', function(e) {
  if (e.target.matches('[data-filter-group]')) {
    // Clear BPM marks first - other filters will hide their songs
    document.querySelectorAll('[data-hidden-by-bpm]').forEach(song => {
      song.removeAttribute('data-hidden-by-bpm');
    });
    
    // Wait for other filters to finish, then re-apply BPM
    setTimeout(() => {
      applyBPMFilter();
      setTimeout(updateBPMTag, 100);
    }, 0);
  }
});
  
console.log('✅ BPM Filter System initialized');
  
// Expose restore function globally
window.restoreBPMState = restoreBPMState;

// Update filter dots when any filter changes
document.addEventListener('change', function(e) {
  if (e.target.matches('[data-filter-group]')) {
    setTimeout(updateFilterDots, 50);
  }
});

// Initial dot update
setTimeout(updateFilterDots, 500);
}

// Call this function after your other filter initializations
// Add this line in your initMusicPage() function after initKeyFilterSystem();
// initBPMFilter();

/**
 * ============================================================
 * DRAG AND DROP - SORTABLE PROFILE ITEMS
 * ============================================================
 */

let sortableInstance = null;
let isEditMode = false;

function initializeProfileSortable() {
  const container = document.querySelector('.sortable-container');
  const organizeButton = document.querySelector('.organize-button');
  
  if (!container) {
    console.log('ℹ️ No sortable container found on this page');
    return;
  }
  
  console.log('📦 Found container:', container);
  
  // Destroy existing instance if it exists
  if (sortableInstance) {
    try {
      sortableInstance.destroy();
      console.log('🗑️ Destroyed old sortable instance');
    } catch (e) {
      console.warn('⚠️ Error destroying sortable:', e);
    }
    sortableInstance = null;
  }
  
  // 1. Dynamically assign data-ids to items
  assignDataIds(container);
  
  // 2. Restore saved order
  restoreOrder(container);
  
  // 3. Initialize SortableJS (starts disabled)
  if (typeof Sortable !== 'undefined') {
    try {
      sortableInstance = Sortable.create(container, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        disabled: true, // Start locked
        delay: 200, // 200ms delay before drag starts
        delayOnTouchOnly: false, // Apply delay to mouse events too
        
        onStart: function(evt) {
          console.log('🎯 Drag started');
        },
        
        onEnd: function(evt) {
          console.log('🔄 Item moved from index', evt.oldIndex, 'to', evt.newIndex);
          // Don't auto-save - user needs to click "Save"
        }
      });
      
      console.log('✅ Sortable profile items initialized (locked)');
      console.log('📌 Sortable instance:', sortableInstance);
    } catch (e) {
      console.error('❌ Error creating sortable:', e);
    }
  } else {
    console.error('❌ SortableJS not loaded - check if script is in <head>');
  }
  
  // 4. Setup organize/save button
  if (organizeButton) {
    // Clone to remove old listeners
    const newButton = organizeButton.cloneNode(true);
    organizeButton.parentNode.replaceChild(newButton, organizeButton);
    
    newButton.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('🔘 Organize button clicked');
      toggleEditMode(container, newButton);
    });
    
    // Set initial button state
    updateButtonState(newButton, false);
    console.log('✅ Organize button initialized');
  } else {
    console.warn('⚠️ No organize button found');
  }
  
  // 5. Hide edit icons initially
  toggleEditIcons(false);
}

// Toggle between edit and view mode
function toggleEditMode(container, button) {
  console.log('🔄 Toggling edit mode. Current state:', isEditMode);
  console.log('📌 Sortable instance exists?', !!sortableInstance);
  
  if (!sortableInstance) {
    console.error('❌ Sortable instance is null - cannot toggle');
    return;
  }
  
  isEditMode = !isEditMode;
  
  if (isEditMode) {
    // UNLOCK - Enter edit mode
    try {
      sortableInstance.option('disabled', false);
      container.classList.add('is-editing');
      
      // Directly set cursor on items
      const items = container.querySelectorAll('.profile-item');
      console.log('🎯 Found', items.length, 'items to enable dragging');
      items.forEach(item => {
        item.style.cursor = 'grab';
      });

      // Disable playlist links in edit mode
      const playlistLinks = document.querySelectorAll('.playlist-link-block');
      playlistLinks.forEach(link => {
      link.style.pointerEvents = 'none';
      link.style.cursor = 'grab';
      });
      
      toggleEditIcons(true); // Show edit icons
      console.log('🔓 Edit mode enabled - dragging should work now');
    } catch (e) {
      console.error('❌ Error enabling edit mode:', e);
    }
  } else {
    // LOCK - Exit edit mode and save
    try {
      sortableInstance.option('disabled', true);
      container.classList.remove('is-editing');
      
      // Reset cursor
      const items = container.querySelectorAll('.profile-item');
      items.forEach(item => {
        item.style.cursor = 'default';
      });

      // Re-enable playlist links
      const playlistLinks = document.querySelectorAll('.playlist-link-block');
      playlistLinks.forEach(link => {
      link.style.pointerEvents = 'auto';
      link.style.cursor = 'pointer';
      });
      
      toggleEditIcons(false); // Hide edit icons

      // Close any open playlist overlays
      const openOverlays = document.querySelectorAll('.playlist-edit-overlay.is-visible');
      openOverlays.forEach(overlay => {
      hideOverlay(overlay);
      });
      console.log('✅ Closed', openOverlays.length, 'open overlays');
      
      saveOrder(container);
      console.log('🔒 Edit mode disabled, order saved');
    } catch (e) {
      console.error('❌ Error disabling edit mode:', e);
    }
  }
  
  updateButtonState(button, isEditMode);
}

// Show/hide playlist edit icons with smooth fade
function toggleEditIcons(show) {
  const editIcons = document.querySelectorAll('.playlist-edit-icon');
  
  editIcons.forEach(icon => {
    if (show) {
      // Show: Set display first, then trigger opacity transition
      icon.style.display = 'flex'; // or 'block' depending on your layout
      icon.style.pointerEvents = 'auto';
      
      // Force reflow to ensure display is applied before opacity changes
      icon.offsetHeight;
      
      // Fade in
      icon.style.opacity = '1';
      icon.style.transform = 'scale(1)';
    } else {
      // Fade out
      icon.style.opacity = '0';
      icon.style.transform = 'scale(0.9)';
      icon.style.pointerEvents = 'none';
      
      // Hide after transition completes
      setTimeout(() => {
        icon.style.display = 'none';
      }, 200); // Match your CSS transition duration
    }
  });
}

// Update button text based on mode
function updateButtonState(button, editing) {
  if (editing) {
    button.textContent = 'Save';
    button.classList.add('is-saving');
  } else {
    button.textContent = 'Organize';
    button.classList.remove('is-saving');
  }
}

// Dynamically assign data-ids
function assignDataIds(container) {
  const items = container.querySelectorAll('.profile-item');
  
  items.forEach((item, index) => {
    if (!item.getAttribute('data-id')) {
      const uniqueId = `profile-item-${index + 1}`;
      item.setAttribute('data-id', uniqueId);
      console.log(`📌 Assigned data-id: ${uniqueId}`);
    }
  });
}

// Save order to localStorage
function saveOrder(container) {
  const items = container.querySelectorAll('.profile-item');
  const order = Array.from(items).map(item => item.getAttribute('data-id'));
  
  const storageKey = 'profile-item-order';
  localStorage.setItem(storageKey, JSON.stringify(order));
  
  console.log('💾 Saved order:', order);
  
  // Optional: Save to backend
  // saveOrderToBackend(order);
}

// Restore order from localStorage
function restoreOrder(container) {
  const storageKey = 'profile-item-order';
  const savedOrder = localStorage.getItem(storageKey);
  
  if (!savedOrder) {
    console.log('ℹ️ No saved order found');
    return;
  }
  
  const order = JSON.parse(savedOrder);
  console.log('🔄 Restoring order:', order);
  
  const items = container.querySelectorAll('.profile-item');
  const itemMap = {};
  items.forEach(item => {
    const id = item.getAttribute('data-id');
    if (id) itemMap[id] = item;
  });
  
  order.forEach(id => {
    if (itemMap[id]) {
      container.appendChild(itemMap[id]);
    }
  });
  
  console.log('✅ Order restored');
}

// Optional: Save to backend
async function saveOrderToBackend(order) {
  if (!window.$memberstackDom) return;
  
  try {
    const { data: member } = await window.$memberstackDom.getCurrentMember();
    if (!member) return;
    
    const response = await fetch('YOUR_XANO_ENDPOINT/profile-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        memberId: member.id,
        itemOrder: order
      })
    });
    
    if (response.ok) {
      console.log('✅ Order saved to backend');
    }
  } catch (err) {
    console.error('❌ Failed to save to backend:', err);
  }
}

// Initialize on page load
window.addEventListener('load', () => {
  initializeProfileSortable();
});

/**
 * ============================================================
 * PLAYLIST EDIT OVERLAY
 * ============================================================
 */

function initializePlaylistOverlay() {
  const editIcons = document.querySelectorAll('.playlist-edit-icon');
  const closeButtons = document.querySelectorAll('.playlist-x-button');
  const overlays = document.querySelectorAll('.playlist-edit-overlay');
  
  if (editIcons.length === 0) {
    console.log('ℹ️ No playlist edit icons found');
    return;
  }
  
  // Show overlay when edit icon is clicked
  editIcons.forEach(editIcon => {
    // Clone to remove old listeners
    const newEditIcon = editIcon.cloneNode(true);
    editIcon.parentNode.replaceChild(newEditIcon, editIcon);
    
    newEditIcon.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Find the associated overlay (could be parent/sibling)
      const overlay = findAssociatedOverlay(newEditIcon);
      
      if (overlay) {
        showOverlay(overlay);
        console.log('✅ Playlist overlay shown');
      }
    });
  });
  
  // Hide overlay when X button is clicked
  closeButtons.forEach(closeBtn => {
    const newCloseBtn = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    
    newCloseBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Find the overlay (usually a parent)
      const overlay = newCloseBtn.closest('.playlist-edit-overlay');
      
      if (overlay) {
        hideOverlay(overlay);
        console.log('✅ Playlist overlay hidden');
      }
    });
  });
  
  console.log(`✅ Initialized ${editIcons.length} playlist overlays`);
}

// Find the associated overlay for an edit icon
function findAssociatedOverlay(editIcon) {
  // Try to find overlay in same parent
  let overlay = editIcon.parentElement.querySelector('.playlist-edit-overlay');
  
  // If not found, try siblings
  if (!overlay) {
    overlay = editIcon.nextElementSibling;
    if (overlay && !overlay.classList.contains('playlist-edit-overlay')) {
      overlay = null;
    }
  }
  
  // If still not found, try closest parent container
  if (!overlay) {
    const container = editIcon.closest('.playlist-item, .playlist-card, .playlist-container');
    if (container) {
      overlay = container.querySelector('.playlist-edit-overlay');
    }
  }
  
  return overlay;
}

// Show overlay with fade in
function showOverlay(overlay) {
  // Set display first
  overlay.style.display = 'flex'; // or 'block' depending on your layout
  
  // Force reflow to ensure display is applied
  overlay.offsetHeight;
  
  // Add visible class for fade in
  overlay.classList.add('is-visible');
}

// Hide overlay with fade out
function hideOverlay(overlay) {
  // Remove visible class for fade out
  overlay.classList.remove('is-visible');
  
  // Wait for transition to complete before hiding
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 300); // Match the CSS transition duration
}

// Initialize on page load
window.addEventListener('load', () => {
  initializePlaylistOverlay();
});  

/**
 * ============================================================
 * PLAYLIST COVER IMAGE UPLOAD (TWO-STEP PROCESS)
 * ============================================================
 */
function initPlaylistImageUpload() {
  console.log('🖼️ Initializing playlist image upload...');
  
  const tempImageData = new Map();
  const profileItems = document.querySelectorAll('.profile-item');
  
  if (profileItems.length === 0) {
    console.log('ℹ️ No profile items found');
    return;
  }
  
  profileItems.forEach((profileItem, index) => {
    if (!profileItem.dataset.id) {
      profileItem.dataset.id = `profile-item-${index + 1}`;
    }
    const profileItemId = profileItem.dataset.id;
    
    const addImageButton = profileItem.querySelector('.add-image');
    const saveButton = profileItem.querySelector('.playlist-save-button');
    const playlistImageWrapper = profileItem.querySelector('.playlist-image-wrapper');
    
    if (!addImageButton || !playlistImageWrapper) {
      return;
    }
    
    let playlistImage = playlistImageWrapper.querySelector('.playlist-image');
    
    if (!playlistImage) {
      return;
    }
    
    let fileInput = profileItem.querySelector('input[type="file"].playlist-image-input');
    
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.classList.add('playlist-image-input');
      fileInput.style.display = 'none';
      profileItem.appendChild(fileInput);
    }
    
    const newAddImageButton = addImageButton.cloneNode(true);
    addImageButton.parentNode.replaceChild(newAddImageButton, addImageButton);
    
    // Get the text element from the NEW cloned button
    const addImageText = newAddImageButton.querySelector('.add-image-text');
    
    newAddImageButton.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });
    
    fileInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      
      if (!file || !file.type.startsWith('image/')) {
        return;
      }
      
      // Update filename text on the NEW button
      if (addImageText) {
        addImageText.textContent = file.name;
        console.log(`📝 Updated filename to: ${file.name}`);
      }
      
      const reader = new FileReader();
      
      reader.onload = function(event) {
        tempImageData.set(profileItemId, {
          dataUrl: event.target.result,
          filename: file.name
        });
        console.log(`💾 Stored temp data for ${profileItemId}`);
      };
      
      reader.readAsDataURL(file);
    });
    
    if (saveButton) {
      const newSaveButton = saveButton.cloneNode(true);
      saveButton.parentNode.replaceChild(newSaveButton, saveButton);
      
      // Get the button text element
      const saveButtonText = newSaveButton.textContent.trim();
      
      newSaveButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const tempData = tempImageData.get(profileItemId);
        
        if (tempData) {
          console.log(`📷 Applying image for ${profileItemId}`);
          
          // Create a temporary image to preload
          const tempImg = new Image();
          
          tempImg.onload = function() {
            // Once loaded, hide current image
            playlistImage.style.opacity = '0';
            
            // Remove srcset and sizes
            playlistImage.removeAttribute('srcset');
            playlistImage.removeAttribute('sizes');
            
            // Set the src
            playlistImage.src = tempData.dataUrl;
            
            // Show new image immediately (it's already loaded)
            playlistImage.style.opacity = '1';
            
            console.log('✅ Image updated, srcset removed');
          };
          
          // Start loading the image
          tempImg.src = tempData.dataUrl;
          
          // Try to save to localStorage with error handling
          try {
            localStorage.setItem(`playlist-image-${profileItemId}`, tempData.dataUrl);
            console.log(`💾 Saved to localStorage: ${profileItemId}`);
            
            // Check localStorage usage
            let totalSize = 0;
            for (let key in localStorage) {
              if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length + key.length;
              }
            }
            console.log(`📊 Total localStorage usage: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
            
          } catch (e) {
            console.error('❌ localStorage quota exceeded!', e);
            alert('⚠️ Storage limit reached! Cannot save more images. Consider using smaller images or clearing old data.');
            
            // Don't change button text if save failed
            return;
          }
          
          // Clear temp
          tempImageData.delete(profileItemId);
          
          // Change button text to "Saved"
          newSaveButton.textContent = 'Saved';
          
          // Reset after 3 seconds
          setTimeout(() => {
            newSaveButton.textContent = saveButtonText;
          }, 3000);
          
        } else {
          // Show alert only if no image selected
          alert('⚠️ Please select an image first');
        }
      });
    }
  });
  
  console.log(`✅ Initialized ${profileItems.length} image upload buttons`);
}

/**
 * ============================================================
 * RESTORE PLAYLIST IMAGES FROM LOCALSTORAGE
 * ============================================================
 */
function restorePlaylistImages() {
  console.log('🔄 Restoring playlist images from localStorage...');
  
  const profileItems = document.querySelectorAll('.profile-item');
  
  profileItems.forEach((profileItem, index) => {
    const profileItemId = profileItem.dataset.id || `profile-item-${index + 1}`;
    const savedImage = localStorage.getItem(`playlist-image-${profileItemId}`);
    
    if (savedImage) {
      const playlistImage = profileItem.querySelector('.playlist-image');
      if (playlistImage) {
        // Create temp image to preload
        const tempImg = new Image();
        
        tempImg.onload = function() {
          // Hide current image
          playlistImage.style.opacity = '0';
          
          // Remove srcset so src takes precedence
          playlistImage.removeAttribute('srcset');
          playlistImage.removeAttribute('sizes');
          
          playlistImage.src = savedImage;
          
          // Show immediately (already loaded)
          playlistImage.style.opacity = '1';
          
          console.log(`✅ Restored image for ${profileItemId}`);
        };
        
        // Start preloading
        tempImg.src = savedImage;
      }
    }
  });
}

// Initialize
window.addEventListener('load', () => {
  setTimeout(() => {
    initPlaylistImageUpload();
    restorePlaylistImages();
  }, 1000);
});

if (typeof barba !== 'undefined') {
  window.addEventListener('barbaAfterTransition', function() {
    setTimeout(() => {
      initPlaylistImageUpload();
      restorePlaylistImages();
    }, 1000);
  });
}

/**
 * ============================================================
 * UNIVERSAL SEARCH FOR NON-MUSIC PAGES
 * (Favorites, Playlist Templates, etc.)
 * ============================================================
 */
function initUniversalSearch() {
  console.log('🔍 Initializing universal search...');
  
  // Find all search inputs EXCEPT on music page
  const searchInputs = document.querySelectorAll('.text-field');
  
  if (searchInputs.length === 0) {
    console.log('ℹ️ No search inputs found');
    return;
  }
  
  searchInputs.forEach(searchInput => {
    // Skip if this is the music page search
    const isMusicPage = !!searchInput.closest('.music-area-container');
    if (isMusicPage) {
      console.log('⏭️ Skipping music page search (has its own handler)');
      return;
    }
    
    // Detect which page we're on
    const isFavoritesPage = !!searchInput.closest('.favorite-songs-wrapper') || !!document.querySelector('.favorite-songs-wrapper');
    const isPlaylistTemplatePage = !!document.querySelector('.playlist-template-container'); // Adjust selector
    
    let songCardSelector = '';
    let pageType = '';
    
    if (isFavoritesPage) {
      songCardSelector = '.favorite-songs-wrapper .song-card';
      pageType = 'Favorites';
    } else if (isPlaylistTemplatePage) {
      songCardSelector = '.playlist-template-container .song-card'; // Adjust selector
      pageType = 'Playlist Template';
    } else {
      // Generic fallback - search for any song cards on the page
      songCardSelector = '.song-card';
      pageType = 'Generic';
    }
    
    console.log(`✅ Setting up ${pageType} page search`);
    setupUniversalSearch(searchInput, songCardSelector);
  });
}

function setupUniversalSearch(searchInput, songCardSelector) {
  // Remove existing listeners by cloning
  const newSearchInput = searchInput.cloneNode(true);
  searchInput.parentNode.replaceChild(newSearchInput, searchInput);
  
  const performSearch = () => {
    const searchTerm = newSearchInput.value.toLowerCase().trim();
    const songCards = document.querySelectorAll(songCardSelector);
    
    if (songCards.length === 0) {
      console.warn('⚠️ No song cards found with selector:', songCardSelector);
      return;
    }
    
    let visibleCount = 0;
    
    console.log(`🔍 Searching "${searchTerm}" in ${songCards.length} songs`);
    
    songCards.forEach(card => {
      // Get basic info
      const songTitle = card.querySelector('.song-title')?.textContent.toLowerCase() || '';
      const artistName = card.querySelector('.artist-name')?.textContent.toLowerCase() || '';
      const bpm = card.getAttribute('data-bpm')?.toLowerCase() || 
                  card.querySelector('.bpm-text')?.textContent.toLowerCase() || '';
      const key = card.getAttribute('data-key')?.toLowerCase() || 
                  card.querySelector('.key-text')?.textContent.toLowerCase() || '';
      const duration = card.getAttribute('data-duration')?.toLowerCase() || '';
      
      // Get all Airtable filter data attributes
      const mood = card.getAttribute('data-mood')?.toLowerCase() || '';
      const genre = card.getAttribute('data-genre')?.toLowerCase() || '';
      const instrument = card.getAttribute('data-instrument')?.toLowerCase() || '';
      const theme = card.getAttribute('data-theme')?.toLowerCase() || '';
      const build = card.getAttribute('data-build')?.toLowerCase() || '';
      const vocals = card.getAttribute('data-vocals')?.toLowerCase() || '';
      const instrumental = card.getAttribute('data-instrumental')?.toLowerCase() || '';
      const acapella = card.getAttribute('data-acapella')?.toLowerCase() || '';
      
      // Combine all searchable text
      const searchableText = `${songTitle} ${artistName} ${bpm} ${key} ${duration} ${mood} ${genre} ${instrument} ${theme} ${build} ${vocals} ${instrumental} ${acapella}`;
      
      // Show/hide based on search match
      if (searchTerm === '' || searchableText.includes(searchTerm)) {
        card.style.display = '';
        card.style.opacity = '1';
        visibleCount++;
      } else {
        card.style.display = 'none';
        card.style.opacity = '0';
      }
    });
    
    console.log(`✅ Showing ${visibleCount} of ${songCards.length} songs`);
  };
  
  // Add event listeners
  newSearchInput.addEventListener('input', performSearch);
  newSearchInput.addEventListener('keyup', performSearch);
  
  // Also handle form submission to prevent page reload
  const searchForm = newSearchInput.closest('form');
  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      performSearch();
    });
  }
  
  console.log('✅ Universal search initialized');
}

// Initialize on page load - LONGER DELAY for songs to load
window.addEventListener('load', () => {
  setTimeout(() => {
    initUniversalSearch();
  }, 2000); // Increased to 2 seconds
});

// Re-initialize after Barba transitions
if (typeof barba !== 'undefined') {
  window.addEventListener('barbaAfterTransition', function() {
    setTimeout(() => {
      initUniversalSearch();
    }, 2000); // Increased to 2 seconds
  });
}

/**
 * ============================================================
 * BARBA.JS & PAGE TRANSITIONS
 * ============================================================
 */
window.addEventListener('load', () => {
  initMusicPage();
  
  // Initialize Memberstack handlers on initial page load
  setTimeout(() => {
    initializeMemberstackHandlers();
  }, 500);
});

// Shared function to initialize all Memberstack handlers
function initializeMemberstackHandlers() {
  console.log('🔧 Initializing Memberstack handlers...');
  
  // Handle login form
const loginForm = document.querySelector('[data-ms-form="login"]');
if (loginForm) {
  console.log('🔐 Attaching login form handler');
  
  // Remove old listener by cloning
  const newLoginForm = loginForm.cloneNode(true);
  loginForm.parentNode.replaceChild(newLoginForm, loginForm);
  
  newLoginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const email = newLoginForm.querySelector('[data-ms-member="email"]')?.value;
    const password = newLoginForm.querySelector('[data-ms-member="password"]')?.value;
    
    if (email && password && window.$memberstackDom) {
      console.log('🔑 Attempting login...');
      window.$memberstackDom.loginMemberEmailPassword({ email, password })
        .then(({ data: member }) => {
          console.log('✅ Login successful');
          // Get the redirect URL from member data or default to dashboard
          const redirectUrl = member?.loginRedirect || '/dashboard/dashboard';
          console.log('🔀 Redirecting to:', redirectUrl);
          window.location.href = redirectUrl;
        })
        .catch(err => {
          console.error('❌ Login failed:', err);
          alert('Login failed: ' + (err.message || 'Invalid credentials'));
        });
    }
  });
}

  // Handle signup form
  const signupForm = document.querySelector('[data-ms-form="signup"]');
  if (signupForm) {
    console.log('📝 Attaching signup form handler');
    
    const newSignupForm = signupForm.cloneNode(true);
    signupForm.parentNode.replaceChild(newSignupForm, signupForm);
    
    newSignupForm.addEventListener('submit', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      const email = newSignupForm.querySelector('[data-ms-member="email"]')?.value;
      const password = newSignupForm.querySelector('[data-ms-member="password"]')?.value;
      
      if (email && password && window.$memberstackDom) {
        console.log('📧 Attempting signup...');
        window.$memberstackDom.signupMemberEmailPassword({ email, password })
          .then(() => {
            console.log('✅ Signup successful - Memberstack will handle redirect');
            // Don't reload - let Memberstack handle the redirect
          })
          .catch(err => {
            console.error('❌ Signup failed:', err);
            alert('Signup failed: ' + (err.message || 'Please try again'));
          });
      }
    });
  }

  // Update member data display
  if (window.$memberstackDom) {
    window.$memberstackDom.getCurrentMember()
      .then(({ data: member }) => {
        if (member) {
          console.log('✅ Member found:', member.auth?.email);
          console.log('📋 Custom fields:', member.customFields);
          
          // Update all [data-ms-member] elements
          const elementsToUpdate = document.querySelectorAll('[data-ms-member]');
          console.log(`🔍 Found ${elementsToUpdate.length} elements with [data-ms-member]`);
          
          elementsToUpdate.forEach(el => {
            const field = el.getAttribute('data-ms-member');
            console.log(`🔍 Processing field: "${field}"`);
            
            // Check customFields first (where first-name and last-name are)
            let value = member.customFields?.[field] || member[field];
            
            // Handle nested paths like "auth.email"
            if (!value && field.includes('.')) {
              value = member;
              field.split('.').forEach(part => {
                value = value?.[part];
              });
            }
            
            if (value) {
              if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = value;
              } else {
                el.textContent = value;
              }
              console.log(`✅ Updated [data-ms-member="${field}"]: "${value}"`);
            } else {
              console.warn(`⚠️ No value found for [data-ms-member="${field}"]`);
            }
          });
          
          // Attach logout handler using event delegation (works with dropdowns)
// First, remove any existing delegated handlers
document.removeEventListener('click', window._logoutHandler);

// Create new handler
window._logoutHandler = function(e) {
  const logoutBtn = e.target.closest('[data-ms-action="logout"]');
  
  if (logoutBtn) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    console.log('🚪 Logout button clicked!');
    
    if (window.$memberstackDom && window.$memberstackDom.logout) {
      console.log('🔑 Calling logout...');
      window.$memberstackDom.logout()
        .then(() => {
          console.log('✅ Logged out successfully');
          window.location.href = '/';
        })
        .catch(err => {
          console.error('❌ Logout error:', err);
          window.location.href = '/';
        });
    } else {
      console.error('❌ Memberstack logout not available');
      window.location.href = '/';
    }
  }
};

// Attach to document with capture phase to catch before dropdown closes
document.addEventListener('click', window._logoutHandler, true);
console.log('✅ Logout handler attached via event delegation');
        } else {
          console.log('ℹ️ No member logged in');
        }
      })
      .catch(err => {
        console.error('❌ Error getting member:', err);
      });
  }
}

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
      const hasFavoriteSongs = !!document.querySelector('.favorite-songs-wrapper');
      
      console.log('🏠 [BARBA AFTER] Checking containers:', { 
        featuredSongs: hasFeaturedSongs, 
        favoriteSongs: hasFavoriteSongs 
      });
      
      if (hasFeaturedSongs) {
        console.log('🎵 [BARBA AFTER] Calling displayFeaturedSongs...');
        displayFeaturedSongs(6);
      }
      
      if (hasFavoriteSongs) {
        console.log('💛 [BARBA AFTER] Calling displayFavoriteSongs...');
        displayFavoriteSongs();
      }
      
      if (!hasFeaturedSongs && !hasFavoriteSongs) {
        console.log('⚠️ No song containers found on this page');
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

      // Call shared Memberstack handler function
      initializeMemberstackHandlers();
      initializeProfileSortable(); 
      initializePlaylistOverlay();  
         
    }, 200);
    
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
    playerCheckbox.classList.add('player-favorite-checkbox');
    console.log('✅ Added player-favorite-checkbox class to player');
  }
  
  let currentSongfavorite = null;
  let playerfavorite = null;
  let lastChangeSource = null;
  let playerListenerAttached = false;
  
  const observer = new MutationObserver(function() {
    const player = document.querySelector('.music-player-wrapper input.player-favorite-checkbox');
    if (player && !playerListenerAttached) {
      console.log('✅ Player favorite appeared in DOM');
      playerfavorite = player;
      playerfavorite.addEventListener('change', handlePlayerfavoriteChange);
      playerListenerAttached = true;
      
      if (currentSongfavorite) {
        console.log('Current song exists, syncing on player appear');
        setTimeout(() => {
          if (playerfavorite.checked !== currentSongfavorite.checked) {
            console.log(`🔄 Syncing: Song is ${currentSongfavorite.checked}, Player is ${playerfavorite.checked}`);
            lastChangeSource = 'sync';
            playerfavorite.click();
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
  
  function getPlayerfavorite() {
    if (!playerfavorite || !document.body.contains(playerfavorite)) {
      playerfavorite = document.querySelector('.music-player-wrapper input.player-favorite-checkbox');
      if (playerfavorite && !playerListenerAttached) {
        console.log('✅ Player favorite found via getter');
        playerfavorite.addEventListener('change', handlePlayerfavoriteChange);
        playerListenerAttached = true;
      }
    }
    return playerfavorite;
  }
  
  function syncFavorites(songCard) {
    if (currentSongfavorite) {
      currentSongfavorite.removeEventListener('change', handleSongfavoriteChange);
    }
    
    currentSongfavorite = songCard.querySelector('input.favorite-checkbox');
    console.log('Set current song favorite:', currentSongfavorite ? 'found' : 'not found');
    
    if (currentSongfavorite) {
      console.log('Song checkbox element:', currentSongfavorite.tagName, currentSongfavorite.type, 'checked:', currentSongfavorite.checked);
      
      const player = getPlayerfavorite();
      
      if (player) {
        console.log('Player checkbox element:', player.tagName, player.type, 'checked:', player.checked);
      }
      
      if (player) {
        if (player.checked !== currentSongfavorite.checked) {
          console.log(`🔄 Song changed - syncing player from ${player.checked} to ${currentSongfavorite.checked}`);
          lastChangeSource = 'sync';
          player.click();
          setTimeout(() => { lastChangeSource = null; }, 100);
        } else {
          console.log('Player already matches song:', player.checked);
        }
      }
      
      currentSongfavorite.addEventListener('change', handleSongfavoriteChange);
      console.log('Synced favorite for current song');
    }
  }
  
  function handleSongfavoriteChange(e) {
    if (lastChangeSource === 'player') {
      console.log('Ignoring song change - triggered by player');
      lastChangeSource = null;
      return;
    }
    
    const player = getPlayerfavorite();
    if (!player) {
      console.log('Player not available, song favorite changed to:', e.target.checked);
      return;
    }
    
    if (player.checked !== e.target.checked) {
      lastChangeSource = 'song';
      console.log('💛 Song favorite clicked, syncing player to:', e.target.checked);
      player.click();
    }
  }
  
  function handlePlayerfavoriteChange() {
    if (lastChangeSource === 'song' || lastChangeSource === 'sync') {
      console.log('Ignoring player change - triggered by', lastChangeSource);
      lastChangeSource = null;
      return;
    }
    
    if (currentSongfavorite && currentSongfavorite.checked !== this.checked) {
      lastChangeSource = 'player';
      console.log('💛 Player favorite clicked, syncing song to:', this.checked);
      currentSongfavorite.click();
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
        syncFavorites(matchingData.cardElement);
      }
    }
    
    if (!g.currentSongData && currentSongfavorite) {
      if (currentSongfavorite) {
        currentSongfavorite.removeEventListener('change', handleSongfavoriteChange);
      }
      currentSongfavorite = null;
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
        syncFavorites(matchingData.cardElement);
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
let searchSaveTimeout;


/**
 * ============================================================
 * ENHANCED FILTER PERSISTENCE - WITH KEY FILTER SUPPORT
 * ============================================================
 */
function saveFilterState() {
  if (isClearing) {
    console.log('⏸️ Skipping save - clearing in progress');
    return;
  }
  
  const filterState = {
    filters: [],
    searchQuery: '',
    keyState: {
      sharpFlat: 'sharp',
      sharpMajMin: null,
      flatMajMin: null
    }
  };
  
 // Check if specific keys are selected
const hasSpecificKeySelected = !!document.querySelector('[data-filter-group="Key"][data-filter-value]:checked');

// Save all checked filters
document.querySelectorAll('[data-filter-group]').forEach(input => {
  if (input.checked) {
    const isKeyGroup = input.getAttribute('data-filter-group') === 'Key';
    const hasKeyGroupAttr = input.hasAttribute('data-key-group');
    const hasFilterValue = input.hasAttribute('data-filter-value');
    
    // Skip major/minor radios if a specific key is selected
    if (isKeyGroup && hasKeyGroupAttr && !hasFilterValue && hasSpecificKeySelected) {
      console.log('⏭️ Skipping major/minor radio (specific key selected)');
      return; // Skip this radio
    }
    
    filterState.filters.push({
      group: input.getAttribute('data-filter-group'),
      value: input.getAttribute('data-filter-value'),
      keyGroup: input.getAttribute('data-key-group')
    });
  }
});
  
  // Save search query
  const searchBar = document.querySelector('[data-filter-search="true"]');
  if (searchBar && searchBar.value) {
    filterState.searchQuery = searchBar.value;
  }
  
  // Save Key filter UI state (Sharp/Flat, Major/Minor)
  const sharpColumn = document.querySelector('.sharp-key-column');
  const flatColumn = document.querySelector('.flat-key-column');
  
  // Detect which Sharp/Flat is active
  if (flatColumn && flatColumn.style.display === 'block') {
    filterState.keyState.sharpFlat = 'flat';
  }
  
  // Detect Sharp section Major/Minor state - check if INPUT is checked
const sharpMajorInput = document.querySelector('.sharp-key-column [data-key-group="major"]');
const sharpMinorInput = document.querySelector('.sharp-key-column [data-key-group="minor"]');

if (sharpMajorInput?.checked) {
  filterState.keyState.sharpMajMin = 'major';
} else if (sharpMinorInput?.checked) {
  filterState.keyState.sharpMajMin = 'minor';
}

// Detect Flat section Major/Minor state - check if INPUT is checked
const flatMajorInput = document.querySelector('.flat-key-column [data-key-group="major"]');
const flatMinorInput = document.querySelector('.flat-key-column [data-key-group="minor"]');

if (flatMajorInput?.checked) {
  filterState.keyState.flatMajMin = 'major';
} else if (flatMinorInput?.checked) {
  filterState.keyState.flatMajMin = 'minor';
}
  
  localStorage.setItem('musicFilters', JSON.stringify(filterState));
  console.log('💾 Saved filter state (with Key state):', filterState);
}

function restoreFilterState() {
  sessionStorage.removeItem('isBarbaNavigation'); // Always clear the Barba flag

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
    
   const hasActiveFilters = filterState.filters.length > 0 || filterState.searchQuery || filterState.bpm;
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

// Restore BPM even if no other filters
if (filterState.bpm && typeof restoreBPMState === 'function') {
  restoreBPMState();
}

// If only BPM was active, show songs and return
if (!filterState.filters.length && !filterState.searchQuery) {
  const musicList = document.querySelector('.music-list-wrapper');
  if (musicList) {
    musicList.style.opacity = '1';
    musicList.style.visibility = 'visible';
    musicList.style.pointerEvents = 'auto';
  }
  return true;
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
    
    // Don't dispatch change events - we already created the tags manually
// Dispatching would cause Webflow to create duplicate tags
console.log('⏭️ Skipping change events to prevent duplicate tags');
      
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

    
    if (filterState.searchQuery) {
      const searchBar = document.querySelector('[data-filter-search="true"]');
      if (searchBar) {
        searchBar.value = filterState.searchQuery;
        searchBar.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    
   // Restore Key filter UI state - wait longer for Key Filter System to initialize
if (filterState.keyState) {
  setTimeout(() => {
    restoreKeyFilterState(filterState.keyState);
    
    // Manually create major/minor tags after restore completes
    setTimeout(() => {
      const hasSpecificKey = filterState.filters.some(f => f.group === 'Key' && f.value);
      
      if (hasSpecificKey && tagsContainer && filterState.keyState) {
        // Check if major/minor INPUT is checked (not wrapper class)
        if (filterState.keyState.sharpMajMin === 'major' || filterState.keyState.flatMajMin === 'major') {
          const majorInput = document.querySelector('[data-key-group="major"]:checked');
          if (majorInput) {
            const tag = document.createElement('div');
            tag.className = 'filter-tag';
            tag.innerHTML = `<span class="filter-tag-text">Major</span><span class="filter-tag-remove x-button-style">×</span>`;
            tag.querySelector('.filter-tag-remove').addEventListener('click', function() {
              majorInput.click();
              tag.remove();
            });
            tagsContainer.appendChild(tag);
          }
        }
        
        if (filterState.keyState.sharpMajMin === 'minor' || filterState.keyState.flatMajMin === 'minor') {
          const minorInput = document.querySelector('[data-key-group="minor"]:checked');
          if (minorInput) {
            const tag = document.createElement('div');
            tag.className = 'filter-tag';
            tag.innerHTML = `<span class="filter-tag-text">Minor</span><span class="filter-tag-remove x-button-style">×</span>`;
            tag.querySelector('.filter-tag-remove').addEventListener('click', function() {
              minorInput.click();
              tag.remove();
            });
            tagsContainer.appendChild(tag);
          }
        }
      }
    }, 200);
  }, 500);
}
    
    // Ensure clear button state is correct after restore
    setTimeout(() => {
      toggleClearButton();
    }, 100);

    toggleClearButton(); // Make sure button visibility is correct after restore
    
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
}, 800); // Increased from 150 to 800 to wait for filtering

// Restore BPM filter state
if (filterState.bpm && typeof restoreBPMState === 'function') {
  restoreBPMState();
}

    updateFilterDots();
    
    return true;
  } catch (error) {
    console.error('Error restoring filters:', error);
    
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

/**
 * Restore Key filter UI state
 * @param {Object} keyState - Object containing sharpFlat, sharpMajMin, flatMajMin
 */
function restoreKeyFilterState(keyState) {
  if (!keyState) return;
  
  console.log('🎹 Restoring Key filter state:', keyState);
  
  // Wait for Key Filter System to be ready
  function attemptRestore(attempts = 0) {
    if (window.keyFilterSystemReady) {
      console.log('✅ Key Filter System ready, restoring now');
      doRestore();
    } else if (attempts < 20) {
      console.log(`⏳ Waiting for Key Filter System... attempt ${attempts + 1}`);
      setTimeout(() => attemptRestore(attempts + 1), 100);
    } else {
      console.error('❌ Timeout waiting for Key Filter System');
    }
  }
  
function doRestore() {
  // First, open the Key accordion if it's closed
  const keyAccordion = document.querySelector('[data-filter-type="key"]');
  const accordionToggle = keyAccordion?.querySelector('.filter-header, .accordion-header, [class*="toggle"], [class*="header"]');
  
  console.log('🔍 Accordion check:', {
    keyAccordion: !!keyAccordion,
    toggle: !!accordionToggle,
    toggleClass: accordionToggle?.className
  });
  
  // Don't auto-open - user can open manually if needed
  
  // Wait for wrapper to exist - re-query keyAccordion each time
  let attempts = 0;
  function waitForWrapper() {
    const keyAccordion = document.querySelector('[data-filter-type="key"]');
    const wrapper = keyAccordion?.querySelector('.sharp-flat-toggle-wrapper');
    console.log(`🔍 Attempt ${attempts + 1}:`, {
      keyAccordion: !!keyAccordion,
      wrapper: !!wrapper
    });
    if (wrapper) {
      console.log('✅ Wrapper found, continuing restore...');
      doActualRestore();
    } else if (attempts < 10) {
      attempts++;
      console.log(`⏳ Waiting for wrapper... attempt ${attempts}`);
      setTimeout(waitForWrapper, 50);
    } else {
      console.log('❌ Timeout waiting for wrapper');
    }
  }
  
  function doActualRestore() {
  const keyAccordion = document.querySelector('[data-filter-type="key"]'); // Re-query here too!
  const sharpFlatWrapper = keyAccordion.querySelector('.sharp-flat-toggle-wrapper');
    const buttons = sharpFlatWrapper.querySelectorAll('.w-button, button');
const sharpButton = buttons[0];
const flatButton = buttons[1];

// Restore Sharp/Flat selection
if (keyState.sharpFlat === 'flat' && flatButton) {
  flatButton.click();
} else if (sharpButton) {
  sharpButton.click();
}
    
    // Wait for Sharp/Flat to render, then restore Major/Minor
    setTimeout(() => {
      // Restore Sharp section Major/Minor - click the actual INPUT
      if (keyState.sharpMajMin === 'major') {
        const sharpMajorInput = keyAccordion.querySelector('.sharp-key-column [data-key-group="major"]');
        if (sharpMajorInput) {
          console.log('🎯 Clicking Sharp Major input');
          sharpMajorInput.click();
        }
      } else if (keyState.sharpMajMin === 'minor') {
        const sharpMinorInput = keyAccordion.querySelector('.sharp-key-column [data-key-group="minor"]');
        if (sharpMinorInput) {
          console.log('🎯 Clicking Sharp Minor input');
          sharpMinorInput.click();
        }
      }
      
      // Restore Flat section Major/Minor - click the actual INPUT
      if (keyState.flatMajMin === 'major') {
        const flatMajorInput = keyAccordion.querySelector('.flat-key-column [data-key-group="major"]');
        if (flatMajorInput) {
          console.log('🎯 Clicking Flat Major input');
          flatMajorInput.click();
        }
      } else if (keyState.flatMajMin === 'minor') {
        const flatMinorInput = keyAccordion.querySelector('.flat-key-column [data-key-group="minor"]');
        if (flatMinorInput) {
          console.log('🎯 Clicking Flat Minor input');
          flatMinorInput.click();
        }
      }
    }, 100);
  }
  
  waitForWrapper();
}
  
  attemptRestore();
}

function clearFilterState() {
  // Save an EMPTY state instead of removing the item
  localStorage.setItem('musicFilters', JSON.stringify({
    filters: [],
    searchQuery: ''
  }));
  console.log('💾 Saved empty filter state after clear');
 
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
  // Hide all filter dots immediately
  document.querySelectorAll('.filter-dot-active').forEach(dot => {
    dot.style.display = 'none';
  });
  
  console.log('🔄 Page load event fired');
  filtersRestored = false;
  
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

/**
 * ============================================================
 * FAVORITE SONGS PERSISTENCE
 * ============================================================
 */

function saveFavorites() {
  const favorites = [];
  document.querySelectorAll('input.favorite-checkbox:checked').forEach(checkbox => {
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
      const checkbox = songCard?.querySelector('input.favorite-checkbox');
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
  if (e.target.matches('input.favorite-checkbox')) {
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
