/**
 * ============================================================
 * FILMWAVE MUSIC PLATFORM - VERSION 29
 * Updated: January 10, 2026
 * ============================================================
 * 
 * UPDATE NOTES (v29):
 * - Added complete Xano Playlist System integration
 * - Create Playlist modal functionality
 * - Add to Playlist dropdown on song cards
 * - Playlists page: displays user's playlist cards from Xano
 * - Playlist Template page: displays songs in selected playlist
 * - Remove song from playlist functionality
 * - Playlist notification system
 * - Memberstack user ID integration for playlist ownership
 * ============================================================
 */
/**
 * ============================================================
 * FILMWAVE MUSIC PLATFORM - CODE INDEX
 * ============================================================
 * 
 * SECTION                                    LINE #
 * ------------------------------------------------
 * 1.  GLOBAL STATE                           ~55
 * 2.  UTILITY FUNCTIONS                      ~100
 * 3.  MASTER PLAYER POSITIONING              ~140
 * 4.  MASTER PLAYER VISIBILITY CONTROL       ~155
 * 5.  MAIN INITIALIZATION                    ~220
 * 6.  STANDALONE AUDIO PLAYER                ~325
 * 7.  MASTER PLAYER FUNCTIONS                ~495
 * 8.  SONG CARD FUNCTIONS                    ~695
 * 9.  LINK STANDALONE AUDIO TO WAVEFORM      ~800
 * 10. CREATE STANDALONE AUDIO                ~870
 * 11. PLAY STANDALONE SONG                   ~1000
 * 12. INITIALIZE WAVEFORMS (LAZY LOADING)    ~1050
 * 13. LOAD WAVEFORM BATCH                    ~1140
 * 14. FETCH & DISPLAY SONGS                  ~1400
 * 15. DISPLAY FEATURED SONGS                 ~1450
 * 16. DISPLAY FAVORITE SONGS                 ~1520
 * 17. KEYBOARD CONTROLS                      ~1590
 * 18. FILTER HELPERS                         ~1670
 * 19. KEY FILTER SYSTEM                      ~1800
 * 20. BPM FILTER SYSTEM                      ~2400
 * 21. DRAG AND DROP - SORTABLE ITEMS         ~3000
 * 22. PLAYLIST EDIT OVERLAY                  ~3200
 * 23. PLAYLIST IMAGE UPLOAD                  ~3300
 * 24. RESTORE PLAYLIST IMAGES                ~3500
 * 25. UNIVERSAL SEARCH FOR NON-MUSIC PAGES   ~3550
 * 26. BARBA.JS & PAGE TRANSITIONS            ~3650
 * 27. FAVORITE BUTTON SYNCING                ~4150
 * 28. LOCALSTORAGE PERSISTENCE               ~4300
 * 29. FILTER STATE SAVE/RESTORE              ~4330
 * 30. FAVORITE SONGS PERSISTENCE             ~4800
 * 31. XANO PLAYLIST SYSTEM                   ~4900
 * 
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

// Xano Playlists API
const XANO_PLAYLISTS_API = 'https://xuvv-ysql-w1uc.n2.xano.io/api:Pjks2U_C';

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
      }
    }
  }
}

/**
 * ============================================================
 * MAIN INITIALIZATION
 * ============================================================
 */
async function initializeSongData() {
  const g = window.musicPlayerPersistent;
  
  try {
    const loadingPlaceholder = document.querySelector('.loading-placeholder');
    if (loadingPlaceholder) loadingPlaceholder.style.display = 'block';
    
    const songs = await fetchSongs();
    
    if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
    
    const isMusicPage = !!document.querySelector('.music-list-wrapper');
    const isFeaturedPage = !!document.querySelector('.featured-songs-wrapper');
    const isFavoritesPage = !!document.querySelector('.favorite-songs-wrapper');
    const isPlaylistTemplatePage = window.location.pathname.includes('playlist-template');
    
    if (isMusicPage) {
      displaySongs(songs);
    } else if (isFeaturedPage && !isMusicPage) {
      displayFeaturedSongs(6);
    } else if (isFavoritesPage && !isMusicPage && !isPlaylistTemplatePage) {
      displayFavoriteSongs();
    }
    
    // Initialize playlist template page if applicable
    if (isPlaylistTemplatePage) {
      PlaylistManager.initPlaylistTemplatePage();
    }
    
    initMasterPlayer();
    updateMasterPlayerVisibility();
    
    if (g.standaloneAudio && g.currentSongData) {
      linkStandaloneToWaveform();
      updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
      
      if (g.currentPeaksData && g.standaloneAudio.duration > 0) {
        const progress = g.standaloneAudio.currentTime / g.standaloneAudio.duration;
        drawMasterWaveform(g.currentPeaksData, progress);
      }
    }
    
    // Initialize Playlist System
    PlaylistManager.init();
    
  } catch (error) {
    console.error('Error initializing song data:', error);
    const loadingPlaceholder = document.querySelector('.loading-placeholder');
    if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', initializeSongData);

// Add visibility change handler
document.addEventListener('visibilitychange', () => {
  const g = window.musicPlayerPersistent;
  
  if (document.hidden) {
    if (g.standaloneAudio && !g.standaloneAudio.paused) {
      g.wasPlayingBeforeHidden = true;
    }
  } else {
    // Tab is visible again
    if (g.wasPlayingBeforeHidden && g.standaloneAudio && g.standaloneAudio.paused) {
      // Don't auto-resume - let user control
    }
    g.wasPlayingBeforeHidden = false;
  }
});

/**
 * ============================================================
 * STANDALONE AUDIO PLAYER FOR NON-MUSIC PAGES
 * ============================================================
 */
function navigateStandaloneTrack(direction) {
  const g = window.musicPlayerPersistent;
  
  if (!g.currentSongData || g.MASTER_DATA.length === 0) return;
  
  const currentIndex = g.MASTER_DATA.findIndex(song => song.id === g.currentSongData.id);
  
  if (currentIndex === -1) return;
  
  let newIndex;
  if (direction === 'next') {
    newIndex = (currentIndex + 1) % g.MASTER_DATA.length;
  } else {
    newIndex = (currentIndex - 1 + g.MASTER_DATA.length) % g.MASTER_DATA.length;
  }
  
  const newSong = g.MASTER_DATA[newIndex];
  const audioUrl = newSong.fields['R2 Audio URL'];
  
  if (!audioUrl) return;
  
  if (g.standaloneAudio) {
    g.standaloneAudio.pause();
    g.standaloneAudio = null;
  }
  
  const audio = new Audio(audioUrl);
  g.standaloneAudio = audio;
  g.currentSongData = newSong;
  g.hasActiveSong = true;
  
  audio.addEventListener('loadedmetadata', () => {
    g.currentDuration = audio.duration;
    const masterDuration = document.querySelector('.player-song-length');
    if (masterDuration) masterDuration.textContent = formatDuration(audio.duration);
  });
  
  audio.addEventListener('timeupdate', () => {
    g.currentTime = audio.currentTime;
    const masterCounter = document.querySelector('.player-duration-counter');
    if (masterCounter) masterCounter.textContent = formatDuration(audio.currentTime);
    
    if (g.currentPeaksData && audio.duration > 0) {
      const progress = audio.currentTime / audio.duration;
      drawMasterWaveform(g.currentPeaksData, progress);
    }
  });
  
  audio.addEventListener('play', () => {
    g.isPlaying = true;
    updateMasterControllerIcons(true);
    updatePlayerCoverArtIcons(true);
  });
  
  audio.addEventListener('pause', () => {
    g.isPlaying = false;
    updateMasterControllerIcons(false);
    updatePlayerCoverArtIcons(false);
  });
  
  audio.addEventListener('ended', () => {
    updateMasterControllerIcons(false);
    updatePlayerCoverArtIcons(false);
    
    if (g.autoPlayNext) {
      navigateStandaloneTrack('next');
    }
  });
  
  updateMasterPlayerInfo(newSong, null);
  updateMasterPlayerVisibility();
  
  g.currentPeaksData = null;
  drawMasterWaveform(null, 0);
  
  const peaksUrl = newSong.fields['Peaks JSON URL'];
  if (peaksUrl) {
    fetch(peaksUrl)
      .then(response => response.json())
      .then(peaksData => {
        if (g.currentSongData?.id === newSong.id) {
          g.currentPeaksData = peaksData.data || peaksData;
          drawMasterWaveform(g.currentPeaksData, 0);
        }
      })
      .catch(err => console.warn('Could not load peaks:', err));
  }
  
  audio.play().catch(e => console.warn('Autoplay prevented:', e));
}

function updateMasterPlayerInfo(songData, wavesurfer) {
  const fields = songData.fields;
  
  const playerImg = document.querySelector('.player-cover-art');
  if (playerImg && fields['Cover Art']) {
    playerImg.src = fields['Cover Art'][0].url;
  }
  
  const playerTitle = document.querySelector('.player-song-name');
  if (playerTitle) {
    playerTitle.textContent = fields['Song Title'] || 'Unknown';
  }
  
  const playerArtist = document.querySelector('.player-artist-name');
  if (playerArtist) {
    playerArtist.textContent = fields['Artist'] || 'Unknown Artist';
  }
  
  const playerKey = document.querySelector('.player-key');
  if (playerKey) {
    playerKey.textContent = fields['Key'] || '-';
  }
  
  const playerBPM = document.querySelector('.player-bpm');
  if (playerBPM) {
    playerBPM.textContent = fields['BPM'] ? fields['BPM'] + ' BPM' : '-';
  }
  
  const masterDuration = document.querySelector('.player-song-length');
  if (masterDuration) {
    if (window.musicPlayerPersistent.standaloneAudio && window.musicPlayerPersistent.standaloneAudio.duration > 0) {
      masterDuration.textContent = formatDuration(window.musicPlayerPersistent.standaloneAudio.duration);
    } else if (wavesurfer && wavesurfer.getDuration() > 0) {
      masterDuration.textContent = formatDuration(wavesurfer.getDuration());
    } else if (fields['Duration']) {
      masterDuration.textContent = fields['Duration'];
    }
  }
}

/**
 * ============================================================
 * MASTER PLAYER FUNCTIONS
 * ============================================================
 */
function drawMasterWaveform(peaks, progress) {
  const canvas = document.querySelector('.player-waveform-visual');
  if (!canvas) return;
  
  // Check if it's actually a canvas element
  if (canvas.tagName !== 'CANVAS') {
    console.warn('player-waveform-visual is not a canvas element');
    return;
  }
  
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = canvas.offsetWidth;
  const displayHeight = canvas.offsetHeight;
  
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayHeight + 'px';
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
      const nextData = g.waveformData.find(d => d.wavesurfer === targetWS);
      if (nextData) {
        g.waveformData.forEach(d => {
          if (d.wavesurfer !== targetWS) {
            d.wavesurfer.seekTo(0);
            const pb = d.cardElement.querySelector('.play-button');
            if (pb) pb.style.opacity = '0';
            updatePlayPauseIcons(d.cardElement, false);
          }
        });
        
        if (g.standaloneAudio) {
          g.standaloneAudio.pause();
          g.standaloneAudio = null;
        }
        
        const wasPlaying = g.isPlaying;
        playStandaloneSong(nextData.audioUrl, nextData.songData, targetWS, nextData.cardElement, null, wasPlaying);
      }
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
  
  // ✅ ADD DATA ATTRIBUTES FOR SEARCH
  cardElement.setAttribute('data-mood', fields['Mood'] || '');
  cardElement.setAttribute('data-genre', fields['Genre'] || '');
  cardElement.setAttribute('data-instrument', fields['Instrument'] || '');
  cardElement.setAttribute('data-theme', fields['Theme'] || '');
  cardElement.setAttribute('data-build', fields['Build'] || '');
  cardElement.setAttribute('data-vocals', fields['Vocals'] || '');
  cardElement.setAttribute('data-instrumental', fields['Instrumental'] || '');
  cardElement.setAttribute('data-acapella', fields['Acapella'] || '');
  cardElement.setAttribute('data-bpm', fields['BPM'] || '');
  cardElement.setAttribute('data-key', fields['Key'] || '');
  cardElement.setAttribute('data-duration', fields['Duration'] || '');
  
  // Store Airtable ID for playlist integration
  cardElement.setAttribute('data-airtable-id', song.id);
  
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
    updateMasterControllerIcons(false);
    updatePlayerCoverArtIcons(false);
    
    if (g.autoPlayNext) {
      const navigateTrack = setupMasterPlayerControls.navigateTrack;
      if (typeof navigateTrack === 'function') {
        navigateTrack('next');
      }
    }
  });
  
  return audio;
}

/**
 * ============================================================
 * PLAY STANDALONE SONG
 * ============================================================
 */
function playStandaloneSong(audioUrl, songData, wavesurfer, cardElement, seekToTime = null, shouldAutoPlay = true) {
  const g = window.musicPlayerPersistent;
  
  if (g.standaloneAudio) {
    g.standaloneAudio.pause();
    g.standaloneAudio = null;
  }
  
  g.waveformData.forEach(data => {
    if (data.cardElement !== cardElement) {
      updatePlayPauseIcons(data.cardElement, false);
      const pb = data.cardElement.querySelector('.play-button');
      if (pb) pb.style.opacity = '0';
      data.wavesurfer.seekTo(0);
    }
  });
  
  const audio = createStandaloneAudio(audioUrl, songData, wavesurfer, cardElement, seekToTime, shouldAutoPlay);
  
  syncMasterTrack(wavesurfer, songData);
  updateMasterPlayerVisibility();
  
  if (shouldAutoPlay) {
    audio.play().catch(e => console.warn('Autoplay prevented:', e));
  }
  
  scrollToSelected(cardElement);
}

/**
 * ============================================================
 * INITIALIZE WAVEFORMS (LAZY LOADING)
 * ============================================================
 */
function initializeWaveforms() {
  const g = window.musicPlayerPersistent;
  
  const container = document.querySelector('.music-list-wrapper');
  if (!container) return;
  
  const songCards = container.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
  if (songCards.length === 0) return;
  
  const BATCH_SIZE = 10;
  const SCROLL_THRESHOLD = 500;
  
  let loadedCount = 0;
  let isLoading = false;
  const cardsArray = Array.from(songCards);
  
  const loadNextBatch = () => {
    if (isLoading || loadedCount >= cardsArray.length) return;
    
    isLoading = true;
    const batchEnd = Math.min(loadedCount + BATCH_SIZE, cardsArray.length);
    const batch = cardsArray.slice(loadedCount, batchEnd);
    
    loadWaveformBatch(batch);
    
    loadedCount = batchEnd;
    isLoading = false;
  };
  
  const handleScroll = () => {
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    if (scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD) {
      loadNextBatch();
    }
  };
  
  container.addEventListener('scroll', handleScroll);
  
  loadNextBatch();
}

/**
 * ============================================================
 * LOAD WAVEFORM BATCH
 * ============================================================
 */
function loadWaveformBatch(cards) {
  const g = window.musicPlayerPersistent;
  
  const waveformPromises = [];
  const waveformContainers = [];
  
  cards.forEach((cardElement) => {
    if (cardElement.dataset.waveformInitialized === 'true') return;
    
    const songDataRaw = cardElement.dataset.songData;
    if (!songDataRaw) return;
    
    let songData;
    try {
      songData = JSON.parse(songDataRaw);
    } catch (e) {
      return;
    }
    
    const waveformContainer = cardElement.querySelector('.waveform');
    if (!waveformContainer) return;
    
    waveformContainers.push(waveformContainer);
    
    const audioUrl = cardElement.dataset.audioUrl;
    const peaksUrl = songData.fields['Peaks JSON URL'];
    
    const promise = new Promise(async (resolve) => {
      const wavesurfer = WaveSurfer.create({
        container: waveformContainer,
        waveColor: '#e2e2e2',
        progressColor: '#191919',
        cursorColor: 'transparent',
        height: waveformContainer.offsetHeight || 40,
        barWidth: 2,
        barGap: 1,
        barRadius: 0,
        normalize: true,
        interact: true,
        hideScrollbar: true,
        fillParent: true
      });
      
      g.allWavesurfers.push(wavesurfer);
      g.waveformData.push({
        wavesurfer,
        cardElement,
        songData,
        audioUrl
      });
      
      if (peaksUrl) {
        try {
          const response = await fetch(peaksUrl);
          const peaksData = await response.json();
          const peaks = peaksData.data || peaksData;
          
          wavesurfer.load(audioUrl, peaks);
        } catch (error) {
          wavesurfer.load(audioUrl);
        }
      } else {
        wavesurfer.load(audioUrl);
      }
      
      wavesurfer.on('ready', () => resolve());
      wavesurfer.on('error', () => resolve());
    });
    
    waveformPromises.push(promise);
    
    // Setup play handlers
    const coverArtWrapper = cardElement.querySelector('.cover-art-wrapper');
    const songName = cardElement.querySelector('.song-name');
    const playButton = cardElement.querySelector('.play-button');
    
    const handlePlayPause = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const isCurrentSong = g.currentSongData?.id === songData.id;
      const isDifferentSong = g.currentSongData && g.currentSongData.id !== songData.id;
      
      if (isDifferentSong) {
        // ALWAYS play when clicking a different song
        playStandaloneSong(audioUrl, songData, g.waveformData.find(d => d.songData.id === songData.id)?.wavesurfer, cardElement);
      } else {
        // Same song or no current song - toggle play/pause
        if (g.standaloneAudio && g.currentSongData?.id === songData.id) {
          if (g.standaloneAudio.paused) {
            g.standaloneAudio.play();
          } else {
            g.standaloneAudio.pause();
          }
        } else {
          playStandaloneSong(audioUrl, songData, g.waveformData.find(d => d.songData.id === songData.id)?.wavesurfer, cardElement);
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
    
    // Waveform interaction
    const waveformData = g.waveformData.find(d => d.songData.id === songData.id);
    if (waveformData) {
      waveformData.wavesurfer.on('interaction', function(newProgress) {
        if (g.currentSongData?.id === songData.id) {
          if (g.standaloneAudio) {
            g.standaloneAudio.currentTime = newProgress * g.standaloneAudio.duration;
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
        
        g.currentWavesurfer = waveformData.wavesurfer;
        g.hasActiveSong = true;
        
        const seekTime = newProgress * (waveformData.wavesurfer.getDuration() || 0);
        playStandaloneSong(audioUrl, songData, waveformData.wavesurfer, cardElement, seekTime, wasPlaying);
      });
    }
    
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
document.addEventListener('keydown', (e) => {
  const g = window.musicPlayerPersistent;
  
  // Ignore if typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  if (e.code === 'Space') {
    e.preventDefault();
    if (g.standaloneAudio) {
      if (g.standaloneAudio.paused) {
        g.standaloneAudio.play();
      } else {
        g.standaloneAudio.pause();
      }
    }
  }
  
  if (e.code === 'ArrowRight') {
    if (g.standaloneAudio) {
      g.standaloneAudio.currentTime = Math.min(g.standaloneAudio.currentTime + 10, g.standaloneAudio.duration);
    }
  }
  
  if (e.code === 'ArrowLeft') {
    if (g.standaloneAudio) {
      g.standaloneAudio.currentTime = Math.max(g.standaloneAudio.currentTime - 10, 0);
    }
  }
});

/**
 * ============================================================
 * FILTER HELPERS
 * ============================================================
 */
function applyActiveFilters() {
  const activeFilterTags = document.querySelectorAll('.filter-tag');
  const activeFilters = [];
  
  activeFilterTags.forEach(tag => {
    const filterValue = tag.querySelector('.tag-text')?.textContent?.trim();
    if (filterValue) {
      activeFilters.push(filterValue.toLowerCase());
    }
  });
  
  const songCards = document.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
  
  songCards.forEach(card => {
    if (activeFilters.length === 0) {
      card.style.display = '';
      return;
    }
    
    const mood = (card.dataset.mood || '').toLowerCase();
    const genre = (card.dataset.genre || '').toLowerCase();
    const instrument = (card.dataset.instrument || '').toLowerCase();
    const theme = (card.dataset.theme || '').toLowerCase();
    
    const cardValues = `${mood} ${genre} ${instrument} ${theme}`;
    
    const matchesAll = activeFilters.every(filter => cardValues.includes(filter));
    
    card.style.display = matchesAll ? '' : 'none';
  });
}

function clearAllFilters() {
  const tagsContainer = document.querySelector('.filter-tags-container');
  if (tagsContainer) {
    tagsContainer.innerHTML = '';
  }
  
  const allCheckboxes = document.querySelectorAll('.dd-list input[type="checkbox"]');
  allCheckboxes.forEach(cb => {
    cb.checked = false;
  });
  
  const songCards = document.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
  songCards.forEach(card => {
    card.style.display = '';
  });
  
  const searchInput = document.querySelector('.music-search');
  if (searchInput) {
    searchInput.value = '';
  }
  
  // Clear saved filters
  localStorage.removeItem('musicFilters');
}

/**
 * ============================================================
 * KEY FILTER SYSTEM
 * ============================================================
 */
function initKeyFilter() {
  const keyFilterWrapper = document.querySelector('.key-filter-wrapper');
  if (!keyFilterWrapper) return;
  
  const keyFilterLabel = keyFilterWrapper.querySelector('.key-filter-label');
  const keyFilterDropdown = keyFilterWrapper.querySelector('.key-filter-dropdown');
  const keyFilterList = keyFilterWrapper.querySelector('.key-filter-list');
  const sharpFlatToggle = keyFilterWrapper.querySelector('.sharp-flat-toggle');
  const majorMinorToggle = keyFilterWrapper.querySelector('.major-minor-toggle');
  
  let currentKey = null;
  let isSharp = true;
  let isMajor = true;
  
  const keyMap = {
    'C': { sharp: 'C', flat: 'C' },
    'C#': { sharp: 'C#', flat: 'Db' },
    'D': { sharp: 'D', flat: 'D' },
    'D#': { sharp: 'D#', flat: 'Eb' },
    'E': { sharp: 'E', flat: 'E' },
    'F': { sharp: 'F', flat: 'F' },
    'F#': { sharp: 'F#', flat: 'Gb' },
    'G': { sharp: 'G', flat: 'G' },
    'G#': { sharp: 'G#', flat: 'Ab' },
    'A': { sharp: 'A', flat: 'A' },
    'A#': { sharp: 'A#', flat: 'Bb' },
    'B': { sharp: 'B', flat: 'B' }
  };
  
  const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  
  function updateKeyDisplay() {
    if (!currentKey) {
      if (keyFilterLabel) keyFilterLabel.textContent = 'Key';
      return;
    }
    
    const keyData = keyMap[currentKey];
    const displayKey = isSharp ? keyData.sharp : keyData.flat;
    const mode = isMajor ? 'maj' : 'min';
    
    if (keyFilterLabel) keyFilterLabel.textContent = `${displayKey} ${mode}`;
  }
  
  function filterByKey() {
    const songCards = document.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
    
    if (!currentKey) {
      songCards.forEach(card => card.style.display = '');
      return;
    }
    
    const keyData = keyMap[currentKey];
    const targetKeys = [
      `${keyData.sharp}${isMajor ? 'maj' : 'min'}`,
      `${keyData.flat}${isMajor ? 'maj' : 'min'}`,
      `${keyData.sharp} ${isMajor ? 'maj' : 'min'}`,
      `${keyData.flat} ${isMajor ? 'maj' : 'min'}`,
      `${keyData.sharp}${isMajor ? '' : 'm'}`,
      `${keyData.flat}${isMajor ? '' : 'm'}`
    ].map(k => k.toLowerCase());
    
    songCards.forEach(card => {
      const cardKey = (card.dataset.key || '').toLowerCase().trim();
      const matches = targetKeys.some(tk => cardKey.includes(tk.replace(' ', '')));
      card.style.display = matches ? '' : 'none';
    });
  }
  
  // Toggle dropdown
  if (keyFilterLabel) {
    keyFilterLabel.addEventListener('click', () => {
      if (keyFilterDropdown) {
        keyFilterDropdown.style.display = keyFilterDropdown.style.display === 'none' ? 'block' : 'none';
      }
    });
  }
  
  // Key selection
  if (keyFilterList) {
    const keyItems = keyFilterList.querySelectorAll('.key-filter-item');
    keyItems.forEach((item, index) => {
      item.addEventListener('click', () => {
        currentKey = keys[index] || null;
        updateKeyDisplay();
        filterByKey();
        if (keyFilterDropdown) keyFilterDropdown.style.display = 'none';
      });
    });
  }
  
  // Sharp/Flat toggle
  if (sharpFlatToggle) {
    sharpFlatToggle.addEventListener('click', () => {
      isSharp = !isSharp;
      sharpFlatToggle.textContent = isSharp ? '#' : 'b';
      updateKeyDisplay();
      filterByKey();
    });
  }
  
  // Major/Minor toggle
  if (majorMinorToggle) {
    majorMinorToggle.addEventListener('click', () => {
      isMajor = !isMajor;
      majorMinorToggle.textContent = isMajor ? 'Maj' : 'Min';
      updateKeyDisplay();
      filterByKey();
    });
  }
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!keyFilterWrapper.contains(e.target)) {
      if (keyFilterDropdown) keyFilterDropdown.style.display = 'none';
    }
  });
}

/**
 * ============================================================
 * BPM FILTER SYSTEM
 * ============================================================
 */
function initBPMFilter() {
  const bpmFilterWrapper = document.querySelector('.bpm-filter-wrapper');
  if (!bpmFilterWrapper) return;
  
  const bpmInput = bpmFilterWrapper.querySelector('.bpm-input');
  const bpmRangeMin = bpmFilterWrapper.querySelector('.bpm-range-min');
  const bpmRangeMax = bpmFilterWrapper.querySelector('.bpm-range-max');
  const bpmModeToggle = bpmFilterWrapper.querySelector('.bpm-mode-toggle');
  const exactModeLabel = bpmFilterWrapper.querySelector('.bpm-exact-label');
  const rangeModeLabel = bpmFilterWrapper.querySelector('.bpm-range-label');
  
  let isExactMode = true;
  
  function filterByBPM() {
    const songCards = document.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
    
    if (isExactMode) {
      const targetBPM = parseInt(bpmInput?.value || '0', 10);
      if (!targetBPM || targetBPM === 0) {
        songCards.forEach(card => card.style.display = '');
        return;
      }
      
      songCards.forEach(card => {
        const cardBPM = parseInt(card.dataset.bpm || '0', 10);
        const matches = Math.abs(cardBPM - targetBPM) <= 5; // ±5 BPM tolerance
        card.style.display = matches ? '' : 'none';
      });
    } else {
      const minBPM = parseInt(bpmRangeMin?.value || '0', 10);
      const maxBPM = parseInt(bpmRangeMax?.value || '999', 10);
      
      if (minBPM === 0 && maxBPM === 0) {
        songCards.forEach(card => card.style.display = '');
        return;
      }
      
      songCards.forEach(card => {
        const cardBPM = parseInt(card.dataset.bpm || '0', 10);
        const matches = cardBPM >= minBPM && cardBPM <= maxBPM;
        card.style.display = matches ? '' : 'none';
      });
    }
  }
  
  // Mode toggle
  if (bpmModeToggle) {
    bpmModeToggle.addEventListener('click', () => {
      isExactMode = !isExactMode;
      
      if (exactModeLabel) exactModeLabel.style.opacity = isExactMode ? '1' : '0.5';
      if (rangeModeLabel) rangeModeLabel.style.opacity = isExactMode ? '0.5' : '1';
      
      if (bpmInput) bpmInput.style.display = isExactMode ? '' : 'none';
      if (bpmRangeMin) bpmRangeMin.style.display = isExactMode ? 'none' : '';
      if (bpmRangeMax) bpmRangeMax.style.display = isExactMode ? 'none' : '';
      
      filterByBPM();
    });
  }
  
  // Input handlers
  if (bpmInput) {
    bpmInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(filterByBPM, 300);
    });
  }
  
  if (bpmRangeMin) {
    bpmRangeMin.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(filterByBPM, 300);
    });
  }
  
  if (bpmRangeMax) {
    bpmRangeMax.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(filterByBPM, 300);
    });
  }
} 

/**
 * ============================================================
 * DRAG AND DROP - SORTABLE ITEMS
 * ============================================================
 */
function initSortable() {
  const sortableContainer = document.querySelector('.sortable-container');
  if (!sortableContainer) return;
  
  let draggedItem = null;
  
  const items = sortableContainer.querySelectorAll('.playlist-card-template');
  
  items.forEach(item => {
    item.setAttribute('draggable', 'true');
    
    item.addEventListener('dragstart', (e) => {
      draggedItem = item;
      item.style.opacity = '0.5';
    });
    
    item.addEventListener('dragend', () => {
      draggedItem.style.opacity = '1';
      draggedItem = null;
    });
    
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
    });
    
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (draggedItem && draggedItem !== item) {
        const allItems = [...sortableContainer.querySelectorAll('.playlist-card-template')];
        const draggedIndex = allItems.indexOf(draggedItem);
        const targetIndex = allItems.indexOf(item);
        
        if (draggedIndex < targetIndex) {
          item.parentNode.insertBefore(draggedItem, item.nextSibling);
        } else {
          item.parentNode.insertBefore(draggedItem, item);
        }
        
        // Save new order
        savePlaylistOrder();
      }
    });
  });
}

function savePlaylistOrder() {
  const sortableContainer = document.querySelector('.sortable-container');
  if (!sortableContainer) return;
  
  const items = sortableContainer.querySelectorAll('.playlist-card-template');
  const order = [];
  
  items.forEach((item, index) => {
    const playlistId = item.dataset.playlistId;
    if (playlistId) {
      order.push({ id: playlistId, position: index + 1 });
    }
  });
  
  localStorage.setItem('playlistOrder', JSON.stringify(order));
}

/**
 * ============================================================
 * PLAYLIST EDIT OVERLAY
 * ============================================================
 */
function initPlaylistEditOverlay() {
  const overlays = document.querySelectorAll('.playlist-edit-overlay');
  
  overlays.forEach(overlay => {
    const card = overlay.closest('.playlist-card-template');
    
    overlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Toggle edit mode
      card.classList.toggle('edit-mode');
    });
  });
}

/**
 * ============================================================
 * PLAYLIST IMAGE UPLOAD (Placeholder for future)
 * ============================================================
 */
function initPlaylistImageUpload() {
  // Placeholder for future image upload functionality
  console.log('Playlist image upload initialized (placeholder)');
}

/**
 * ============================================================
 * RESTORE PLAYLIST IMAGES
 * ============================================================
 */
function restorePlaylistImages() {
  const savedImages = localStorage.getItem('playlistImages');
  if (!savedImages) return;
  
  try {
    const images = JSON.parse(savedImages);
    Object.keys(images).forEach(playlistId => {
      const card = document.querySelector(`[data-playlist-id="${playlistId}"]`);
      if (card) {
        const img = card.querySelector('.playlist-image');
        if (img) {
          img.src = images[playlistId];
        }
      }
    });
  } catch (e) {
    console.error('Error restoring playlist images:', e);
  }
}

/**
 * ============================================================
 * UNIVERSAL SEARCH FOR NON-MUSIC PAGES
 * ============================================================
 */
function initUniversalSearch() {
  const searchInput = document.querySelector('.music-search');
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const songCards = document.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
      
      songCards.forEach(card => {
        if (!query) {
          card.style.display = '';
          return;
        }
        
        const title = card.querySelector('.song-name')?.textContent?.toLowerCase() || '';
        const artist = card.querySelector('.artist-name')?.textContent?.toLowerCase() || '';
        const mood = (card.dataset.mood || '').toLowerCase();
        const genre = (card.dataset.genre || '').toLowerCase();
        
        const matches = title.includes(query) || 
                       artist.includes(query) || 
                       mood.includes(query) || 
                       genre.includes(query);
        
        card.style.display = matches ? '' : 'none';
      });
    }, 300);
  });
}

/**
 * ============================================================
 * BARBA.JS & PAGE TRANSITIONS
 * ============================================================
 */
let filtersRestored = false;
let favoritesRestored = false;

function initBarba() {
  if (typeof barba === 'undefined') return;
  
  barba.init({
    transitions: [{
      name: 'default-transition',
      leave(data) {
        const g = window.musicPlayerPersistent;
        g.isTransitioning = true;
        
        return new Promise(resolve => {
          const current = data.current.container;
          current.style.opacity = '0';
          setTimeout(resolve, 300);
        });
      },
      enter(data) {
        const g = window.musicPlayerPersistent;
        
        return new Promise(resolve => {
          const next = data.next.container;
          next.style.opacity = '0';
          
          setTimeout(() => {
            next.style.opacity = '1';
            g.isTransitioning = false;
            
            // Reinitialize page
            initializeSongData();
            initKeyFilter();
            initBPMFilter();
            initSortable();
            initPlaylistEditOverlay();
            initUniversalSearch();
            
            resolve();
          }, 100);
        });
      }
    }]
  });
}

// Initialize Barba if available
document.addEventListener('DOMContentLoaded', initBarba);

/**
 * ============================================================
 * FAVORITE BUTTON SYNCING
 * ============================================================
 */
function syncFavoriteButtons() {
  const g = window.musicPlayerPersistent;
  
  if (!g.currentSongData) return;
  
  const currentId = g.currentSongData.id;
  const songCards = document.querySelectorAll(`.song-wrapper[data-song-id="${currentId}"]`);
  
  songCards.forEach(card => {
    const checkbox = card.querySelector('input.favorite-checkbox');
    if (checkbox) {
      // Sync state if needed
    }
  });
}

/**
 * ============================================================
 * LOCALSTORAGE PERSISTENCE
 * ============================================================
 */
function saveFilterState() {
  const activeFilters = [];
  
  document.querySelectorAll('.filter-tag').forEach(tag => {
    const text = tag.querySelector('.tag-text')?.textContent?.trim();
    if (text) activeFilters.push(text);
  });
  
  const searchQuery = document.querySelector('.music-search')?.value || '';
  
  const state = {
    filters: activeFilters,
    searchQuery: searchQuery
  };
  
  localStorage.setItem('musicFilters', JSON.stringify(state));
}

/**
 * ============================================================
 * FILTER STATE SAVE/RESTORE
 * ============================================================
 */
function restoreFilterState() {
  const saved = localStorage.getItem('musicFilters');
  if (!saved) return;
  
  try {
    const state = JSON.parse(saved);
    
    // Restore search query
    const searchInput = document.querySelector('.music-search');
    if (searchInput && state.searchQuery) {
      searchInput.value = state.searchQuery;
      searchInput.dispatchEvent(new Event('input'));
    }
    
    // Restore filter tags
    if (state.filters && state.filters.length > 0) {
      state.filters.forEach(filterText => {
        // Find and check the corresponding checkbox
        const checkboxes = document.querySelectorAll('.dd-list input[type="checkbox"]');
        checkboxes.forEach(cb => {
          const label = cb.closest('label') || cb.parentElement;
          if (label && label.textContent.trim().toLowerCase() === filterText.toLowerCase()) {
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
    }
    
    filtersRestored = true;
  } catch (e) {
    console.error('Error restoring filters:', e);
  }
}

function attemptRestore() {
  if (filtersRestored) return true;
  
  const musicList = document.querySelector('.music-list-wrapper');
  const hasSongs = musicList && document.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)').length > 0;
  
  if (hasSongs) {
    restoreFilterState();
    
    // Show everything
    if (musicList) {
      musicList.style.opacity = '1';
      musicList.style.visibility = 'visible';
      musicList.style.pointerEvents = 'auto';
    }
    
    return true;
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

/**
 * ============================================================
 * XANO PLAYLIST SYSTEM
 * ============================================================
 */
const PlaylistManager = {
  currentUserId: null,
  playlists: [],
  currentPlaylistId: null,
  currentPlaylistSongs: [],
  pendingSongToAdd: null, // Store song info when opening modal from dropdown
  
  /**
   * Initialize the playlist manager
   */
  async init() {
    console.log('🎵 Initializing Playlist Manager');
    await this.getUserId();
    this.setupEventListeners();
    this.setupPageSpecificFeatures();
  },
  
  /**
   * Get current user ID from Memberstack
   */
  async getUserId() {
    try {
      if (window.$memberstackDom) {
        const member = await window.$memberstackDom.getCurrentMember();
        if (member && member.data) {
          this.currentUserId = member.data.id;
          console.log('👤 User ID:', this.currentUserId);
        }
      }
    } catch (error) {
      console.warn('Could not get Memberstack user:', error);
    }
    return this.currentUserId;
  },
  
  // ==================== API METHODS ====================
  
  /**
   * Create a new playlist
   */
  async createPlaylist(name, description = '') {
    if (!this.currentUserId) {
      throw new Error('User not logged in');
    }
    
    const response = await fetch(`${XANO_PLAYLISTS_API}/Create_Playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: this.currentUserId,
        name: name,
        description: description,
        cover_image_url: ''
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to create playlist');
    }
    
    return response.json();
  },
  
  /**
   * Get all playlists for current user
   */
  async getUserPlaylists() {
    if (!this.currentUserId) {
      console.warn('No user ID available');
      return [];
    }
    
    try {
      const response = await fetch(`${XANO_PLAYLISTS_API}/Get_User_Playlists?user_id=${this.currentUserId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch playlists');
      }
      
      const data = await response.json();
      this.playlists = data;
      return data;
    } catch (error) {
      console.error('Error fetching playlists:', error);
      return [];
    }
  },
  
  /**
   * Get playlist by ID
   */
  async getPlaylistById(playlistId) {
    const playlists = await this.getUserPlaylists();
    return playlists.find(p => p.id === parseInt(playlistId));
  },
  
  /**
   * Get songs in a playlist
   */
  async getPlaylistSongs(playlistId) {
    try {
      const response = await fetch(`${XANO_PLAYLISTS_API}/Get_Playlist_Songs?playlist_id=${playlistId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch playlist songs');
      }
      
      return response.json();
    } catch (error) {
      console.error('Error fetching playlist songs:', error);
      return [];
    }
  },
  
  /**
   * Add song to playlist
   */
  async addSongToPlaylist(playlistId, songId, position = 0) {
    try {
      const response = await fetch(`${XANO_PLAYLISTS_API}/Add_Song_to_Playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist_id: parseInt(playlistId),
          song_id: songId,
          position: position
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to add song to playlist');
      }
      
      return response.json();
    } catch (error) {
      console.error('Error adding song to playlist:', error);
      throw error;
    }
  },
  
  /**
   * Remove song from playlist
   */
  async removeSongFromPlaylist(playlistId, songId) {
    try {
      const response = await fetch(`${XANO_PLAYLISTS_API}/Remove_Song_from_Playlist`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist_id: parseInt(playlistId),
          song_id: songId
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove song from playlist');
      }
      
      return response.json();
    } catch (error) {
      console.error('Error removing song from playlist:', error);
      throw error;
    }
  },
  
  /**
   * Reorder songs in playlist
   */
  async reorderPlaylistSongs(playlistId, positions) {
    try {
      const response = await fetch(`${XANO_PLAYLISTS_API}/Reorder_Playlist_Songs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist_id: parseInt(playlistId),
          positions: positions
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to reorder playlist');
      }
      
      return response.json();
    } catch (error) {
      console.error('Error reordering playlist:', error);
      throw error;
    }
  },
  
  /**
   * Delete a playlist
   */
  async deletePlaylist(playlistId) {
    try {
      const response = await fetch(`${XANO_PLAYLISTS_API}/Delete_Playlist`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlist_id: parseInt(playlistId)
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete playlist');
      }
      
      return response.json();
    } catch (error) {
      console.error('Error deleting playlist:', error);
      throw error;
    }
  },
  
  // ==================== UI METHODS ====================
  
  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Create playlist modal - open from button
    document.querySelectorAll('.create-playlist-button, .playlist-add-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pendingSongToAdd = null; // Clear any pending song
        this.openCreatePlaylistModal();
      });
    });
    
    // Create playlist from dropdown (when browsing songs)
    document.querySelectorAll('.dd-create-new-playlist').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Store the song info to add after playlist creation
        const songWrapper = btn.closest('.song-wrapper');
        if (songWrapper) {
          this.pendingSongToAdd = {
            songId: songWrapper.dataset.songId || songWrapper.dataset.airtableId,
            songData: songWrapper.dataset.songData
          };
        }
        
        this.openCreatePlaylistModal();
      });
    });
    
    // Close modal - X button
    document.querySelectorAll('.create-playlist-x-button').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeCreatePlaylistModal();
      });
    });
    
    // Close modal - click outside
    document.querySelectorAll('.create-playlist-module-wrapper').forEach(wrapper => {
      wrapper.addEventListener('click', (e) => {
        if (e.target === wrapper) {
          this.closeCreatePlaylistModal();
        }
      });
    });
    
    // Save playlist button
    document.querySelectorAll('.create-playlist-save-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleCreatePlaylist();
      });
    });
    
    // Setup add-to-playlist dropdowns
    this.setupAddToPlaylistDropdowns();
    
    console.log('✅ Playlist event listeners setup complete');
  },
  
  /**
   * Open create playlist modal
   */
  openCreatePlaylistModal() {
    const modal = document.querySelector('.create-playlist-module-wrapper');
    if (modal) {
      modal.style.display = 'flex';
      
      // Focus on title input
      setTimeout(() => {
        const titleInput = modal.querySelector('.playlist-text-field-1');
        if (titleInput) titleInput.focus();
      }, 100);
    }
  },
  
  /**
   * Close create playlist modal
   */
  closeCreatePlaylistModal() {
    const modal = document.querySelector('.create-playlist-module-wrapper');
    if (modal) {
      modal.style.display = 'none';
      
      // Clear form
      const titleInput = modal.querySelector('.playlist-text-field-1');
      const descInput = modal.querySelector('.playlist-text-field-2');
      if (titleInput) titleInput.value = '';
      if (descInput) descInput.value = '';
      
      // Clear pending song
      this.pendingSongToAdd = null;
    }
  },
  
  /**
   * Handle create playlist form submission
   */
  async handleCreatePlaylist() {
    const modal = document.querySelector('.create-playlist-module-wrapper');
    const titleInput = modal?.querySelector('.playlist-text-field-1');
    const descInput = modal?.querySelector('.playlist-text-field-2');
    
    const name = titleInput?.value?.trim();
    const description = descInput?.value?.trim() || '';
    
    if (!name) {
      this.showNotification('Please enter a playlist name', 'error');
      return;
    }
    
    if (!this.currentUserId) {
      this.showNotification('Please log in to create a playlist', 'error');
      return;
    }
    
    try {
      // Show loading state
      const saveBtn = modal?.querySelector('.create-playlist-save-button');
      const originalText = saveBtn?.textContent;
      if (saveBtn) saveBtn.textContent = 'Creating...';
      
      const playlist = await this.createPlaylist(name, description);
      
      // Restore button text
      if (saveBtn) saveBtn.textContent = originalText;
      
      this.closeCreatePlaylistModal();
      
      // If there's a pending song to add, add it now
      if (this.pendingSongToAdd && this.pendingSongToAdd.songId) {
        await this.addSongToPlaylist(playlist.id, this.pendingSongToAdd.songId, 1);
        this.showNotification(`Playlist created and song added!`);
        this.pendingSongToAdd = null;
      } else {
        this.showNotification(`Playlist "${name}" created!`);
      }
      
      // If on playlists page, refresh the grid
      if (window.location.pathname.includes('playlists') && !window.location.pathname.includes('playlist-template')) {
        await this.renderPlaylistsGrid();
      }
      
    } catch (error) {
      console.error('Error creating playlist:', error);
      this.showNotification('Error creating playlist. Please try again.', 'error');
      
      // Restore button text
      const saveBtn = modal?.querySelector('.create-playlist-save-button');
      if (saveBtn) saveBtn.textContent = 'Save';
    }
  },
  
  /**
   * Setup add-to-playlist dropdown functionality
   */
  setupAddToPlaylistDropdowns() {
    // Find all add-to-playlist elements
    document.querySelectorAll('.add-to-playlist').forEach(dropdown => {
      // On mouseenter, populate with playlists
      dropdown.addEventListener('mouseenter', () => {
        this.populatePlaylistDropdown(dropdown);
      });
    });
  },
  
  /**
   * Populate a dropdown with user's playlists
   */
  async populatePlaylistDropdown(dropdown) {
    if (!this.currentUserId) return;
    
    // Check if already populated recently (cache for 30 seconds)
    const lastPopulated = dropdown.dataset.lastPopulated;
    if (lastPopulated && (Date.now() - parseInt(lastPopulated)) < 30000) {
      return;
    }
    
    const playlists = await this.getUserPlaylists();
    
    // Find the dd-create-new-playlist element as reference point
    const createNewBtn = dropdown.querySelector('.dd-create-new-playlist');
    
    // Remove any previously added playlist items
    dropdown.querySelectorAll('.playlist-dropdown-item').forEach(item => item.remove());
    
    // Add playlist items before the create new button
    playlists.forEach(playlist => {
      const item = document.createElement('div');
      item.className = 'playlist-dropdown-item';
      item.textContent = playlist.name;
      item.dataset.playlistId = playlist.id;
      
      // Style to match existing dropdown items
      item.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s;
      `;
      
      item.addEventListener('mouseenter', () => {
        item.style.background = '#f5f5f5';
      });
      
      item.addEventListener('mouseleave', () => {
        item.style.background = '';
      });
      
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleAddSongToPlaylist(dropdown, playlist.id, playlist.name);
      });
      
      if (createNewBtn) {
        dropdown.insertBefore(item, createNewBtn);
      } else {
        dropdown.appendChild(item);
      }
    });
    
    // Add separator before create new if we have playlists
    if (playlists.length > 0 && createNewBtn) {
      const existingSeparator = dropdown.querySelector('.playlist-dropdown-separator');
      if (!existingSeparator) {
        const separator = document.createElement('div');
        separator.className = 'playlist-dropdown-separator';
        separator.style.cssText = `
          height: 1px;
          background: #e0e0e0;
          margin: 4px 0;
        `;
        dropdown.insertBefore(separator, createNewBtn);
      }
    }
    
    dropdown.dataset.lastPopulated = Date.now().toString();
  },
  
  /**
   * Handle adding a song to a playlist
   */
  async handleAddSongToPlaylist(dropdown, playlistId, playlistName) {
    // Get the song ID from the parent song-wrapper
    const songWrapper = dropdown.closest('.song-wrapper');
    const songId = songWrapper?.dataset.songId || songWrapper?.dataset.airtableId;
    
    if (!songId) {
      console.error('Could not find song ID');
      this.showNotification('Error: Could not find song', 'error');
      return;
    }
    
    try {
      // Get current songs in playlist to determine position
      const songs = await this.getPlaylistSongs(playlistId);
      const position = songs.length + 1;
      
      await this.addSongToPlaylist(playlistId, songId, position);
      this.showNotification(`Added to "${playlistName}"`);
      
      // Close the dropdown by clicking elsewhere
      document.body.click();
      
    } catch (error) {
      console.error('Error adding song to playlist:', error);
      this.showNotification('Error adding song. It may already be in the playlist.', 'error');
    }
  },
  
  /**
   * Show a notification message
   */
  showNotification(message, type = 'success') {
    // Remove any existing notifications
    document.querySelectorAll('.playlist-notification').forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = 'playlist-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'error' ? '#dc3545' : '#333'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideUp 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(-50%) translateY(10px)';
      notification.style.transition = 'all 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  },
  
  // ==================== PAGE-SPECIFIC FEATURES ====================
  
  /**
   * Setup features based on current page
   */
  setupPageSpecificFeatures() {
    const path = window.location.pathname;
    
    // Playlists listing page
    if (path.includes('playlists') && !path.includes('playlist-template')) {
      this.initPlaylistsPage();
    }
  },
  
  /**
   * Initialize the playlists listing page
   */
  async initPlaylistsPage() {
    if (!this.currentUserId) {
      console.log('User not logged in - cannot show playlists');
      return;
    }
    
    await this.renderPlaylistsGrid();
  },
  
  /**
   * Render the playlists grid on the playlists page
   */
  async renderPlaylistsGrid() {
    const container = document.querySelector('.sortable-container');
    if (!container) {
      console.warn('No sortable-container found');
      return;
    }
    
    // Get template
    const template = container.querySelector('.playlist-card-template');
    if (!template) {
      console.warn('No playlist-card-template found');
      return;
    }
    
    // Show loading state
    template.style.opacity = '0.5';
    
    // Fetch playlists
    const playlists = await this.getUserPlaylists();
    
    // Clear existing cards except first (template)
    const existingCards = container.querySelectorAll('.playlist-card-template');
    existingCards.forEach((card, index) => {
      if (index > 0) card.remove();
    });
    
    if (playlists.length === 0) {
      // Show empty state
      template.style.display = 'none';
      
      // Create empty state message
      let emptyState = container.querySelector('.empty-playlists-message');
      if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'empty-playlists-message';
        emptyState.style.cssText = `
          text-align: center;
          padding: 60px 20px;
          color: #666;
          font-size: 16px;
        `;
        emptyState.innerHTML = `
          <p>You haven't created any playlists yet.</p>
          <p style="margin-top: 10px; font-size: 14px; color: #999;">Click "Playlist +" to create your first playlist!</p>
        `;
        container.appendChild(emptyState);
      }
      return;
    }
    
    // Remove empty state if exists
    const emptyState = container.querySelector('.empty-playlists-message');
    if (emptyState) emptyState.remove();
    
    // Create cards for each playlist
    playlists.forEach((playlist, index) => {
      const card = index === 0 ? template : template.cloneNode(true);
      
      // Update card content
      const title = card.querySelector('.playlist-title');
      const detail = card.querySelector('.playlist-detail');
      const image = card.querySelector('.playlist-image');
      const link = card.querySelector('.playlist-link-block');
      
      if (title) title.textContent = playlist.name;
      if (detail) detail.textContent = playlist.description || '';
      if (image && playlist.cover_image_url) {
        image.src = playlist.cover_image_url;
      }
      if (link) {
        link.href = `/dashboard/playlist-template?playlist=${playlist.id}`;
      }
      
      // Store playlist ID on card
      card.dataset.playlistId = playlist.id;
      card.style.display = '';
      card.style.opacity = '1';
      
      if (index > 0) {
        container.appendChild(card);
      }
    });
    
    console.log(`✅ Rendered ${playlists.length} playlist cards`);
    
    // Reinitialize sortable for drag-drop
    initSortable();
  },
  
  /**
   * Initialize the playlist template page (single playlist view)
   */
  async initPlaylistTemplatePage() {
    // Get playlist ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const playlistId = urlParams.get('playlist');
    
    if (!playlistId) {
      console.error('No playlist ID in URL');
      return;
    }
    
    this.currentPlaylistId = playlistId;
    
    // Fetch playlist details
    const playlist = await this.getPlaylistById(playlistId);
    if (playlist) {
      // Update page title/header
      const headerTitle = document.querySelector('.playlist-template-header');
      if (headerTitle) headerTitle.textContent = playlist.name;
      
      // Also update any breadcrumb or navigation that shows playlist name
      document.querySelectorAll('[data-playlist-name]').forEach(el => {
        el.textContent = playlist.name;
      });
    }
    
    // Fetch and render songs
    await this.renderPlaylistSongs(playlistId);
  },
  
  /**
   * Render songs in a playlist on the template page
   */
  async renderPlaylistSongs(playlistId) {
    const container = document.querySelector('.favorite-songs-wrapper');
    if (!container) {
      console.warn('No favorite-songs-wrapper found for playlist songs');
      return;
    }
    
    const g = window.musicPlayerPersistent;
    
    // Ensure we have song data from Airtable
    if (g.MASTER_DATA.length === 0) {
      await fetchSongs();
    }
    
    const templateWrapper = container.querySelector('.template-wrapper');
    const templateCard = templateWrapper 
      ? templateWrapper.querySelector('.song-wrapper') 
      : container.querySelector('.song-wrapper');
    
    if (!templateCard) {
      console.warn('No template card found');
      return;
    }
    
    // Show loading
    const loadingPlaceholder = document.querySelector('.loading-placeholder');
    if (loadingPlaceholder) loadingPlaceholder.style.display = 'block';
    
    // Fetch playlist songs from Xano
    const playlistSongs = await this.getPlaylistSongs(playlistId);
    
    // Hide loading
    if (loadingPlaceholder) loadingPlaceholder.style.display = 'none';
    
    // Store for later use
    this.currentPlaylistSongs = playlistSongs;
    
    // Clear container but keep template
    container.innerHTML = '';
    if (templateWrapper) container.appendChild(templateWrapper);
    
    if (playlistSongs.length === 0) {
      // Show empty state
      if (templateWrapper) templateWrapper.style.display = 'none';
      
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-playlist-songs';
      emptyState.style.cssText = `
        text-align: center;
        padding: 60px 20px;
        color: #666;
        font-size: 16px;
      `;
      emptyState.innerHTML = `
        <p>This playlist is empty.</p>
        <p style="margin-top: 10px; font-size: 14px; color: #999;">Browse music and click "Add to Playlist" to add songs!</p>
      `;
      container.appendChild(emptyState);
      return;
    }
    
    // Sort by position
    playlistSongs.sort((a, b) => a.position - b.position);
    
    // Match playlist songs with Airtable data and render
    playlistSongs.forEach(playlistSong => {
      // Find the matching Airtable record
      const airtableSong = g.MASTER_DATA.find(song => song.id === playlistSong.song_id);
      
      if (airtableSong) {
        const newCard = templateCard.cloneNode(true);
        newCard.style.opacity = '1';
        newCard.style.position = 'relative';
        newCard.style.pointerEvents = 'auto';
        
        // Populate the card with Airtable data
        populateSongCard(newCard, airtableSong);
        
        // Add playlist-specific data attributes
        newCard.dataset.playlistSongId = playlistSong.id;
        newCard.dataset.playlistPosition = playlistSong.position;
        
        // Add remove from playlist functionality
        this.addRemoveFromPlaylistButton(newCard, playlistId, playlistSong.song_id);
        
        container.appendChild(newCard);
      } else {
        console.warn(`Song ${playlistSong.song_id} not found in Airtable data`);
      }
    });
    
    // Reinitialize Webflow interactions
    if (window.Webflow && window.Webflow.destroy && window.Webflow.ready) {
      window.Webflow.destroy();
      window.Webflow.ready();
      window.Webflow.require('ix2').init();
    }
    
    console.log(`✅ Displayed ${playlistSongs.length} songs in playlist`);
    
    // Initialize waveforms
    setTimeout(() => {
      const cards = container.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
      if (cards.length > 0) {
        loadWaveformBatch(Array.from(cards));
      }
    }, 100);
    
    // Setup drag-drop reordering for playlist songs
    this.setupPlaylistSongReordering(container);
  },
  
  /**
   * Add a remove button to song cards in playlist view
   */
  addRemoveFromPlaylistButton(cardElement, playlistId, songId) {
    // Check if the options dropdown exists
    const optionsList = cardElement.querySelector('.options-dropdown-list');
    if (!optionsList) return;
    
    // Create remove option
    const removeOption = document.createElement('div');
    removeOption.className = 'remove-from-playlist-option';
    removeOption.textContent = 'Remove from Playlist';
    removeOption.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      color: #dc3545;
      font-size: 14px;
    `;
    
    removeOption.addEventListener('mouseenter', () => {
      removeOption.style.background = '#fff5f5';
    });
    
    removeOption.addEventListener('mouseleave', () => {
      removeOption.style.background = '';
    });
    
    removeOption.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (confirm('Remove this song from the playlist?')) {
        try {
          await this.removeSongFromPlaylist(playlistId, songId);
          
          // Remove the card with animation
          cardElement.style.transition = 'all 0.3s ease';
          cardElement.style.opacity = '0';
          cardElement.style.transform = 'translateX(-20px)';
          
          setTimeout(() => {
            cardElement.remove();
            this.showNotification('Song removed from playlist');
          }, 300);
          
        } catch (error) {
          this.showNotification('Error removing song', 'error');
        }
      }
    });
    
    // Add to dropdown
    optionsList.appendChild(removeOption);
  },
  
  /**
   * Setup drag-drop reordering for playlist songs
   */
  setupPlaylistSongReordering(container) {
    const playlistId = this.currentPlaylistId;
    if (!playlistId) return;
    
    let draggedItem = null;
    
    const items = container.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
    
    items.forEach(item => {
      item.setAttribute('draggable', 'true');
      
      item.addEventListener('dragstart', (e) => {
        draggedItem = item;
        item.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
      });
      
      item.addEventListener('dragend', () => {
        if (draggedItem) {
          draggedItem.style.opacity = '1';
          draggedItem = null;
        }
        
        // Save new order
        this.savePlaylistSongOrder(container);
      });
      
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedItem && draggedItem !== item) {
          const allItems = [...container.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)')];
          const draggedIndex = allItems.indexOf(draggedItem);
          const targetIndex = allItems.indexOf(item);
          
          if (draggedIndex < targetIndex) {
            item.parentNode.insertBefore(draggedItem, item.nextSibling);
          } else {
            item.parentNode.insertBefore(draggedItem, item);
          }
        }
      });
    });
  },
  
  /**
   * Save the new order of songs in a playlist
   */
  async savePlaylistSongOrder(container) {
    const playlistId = this.currentPlaylistId;
    if (!playlistId) return;
    
    const items = container.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
    const positions = [];
    
    items.forEach((item, index) => {
      const songId = item.dataset.songId || item.dataset.airtableId;
      if (songId) {
        positions.push({
          song_id: songId,
          position: index + 1
        });
      }
    });
    
    if (positions.length > 0) {
      try {
        await this.reorderPlaylistSongs(playlistId, positions);
        console.log('✅ Playlist order saved');
      } catch (error) {
        console.error('Error saving playlist order:', error);
        this.showNotification('Error saving order', 'error');
      }
    }
  }
};

// Export for global access if needed
window.PlaylistManager = PlaylistManager;

console.log('🎵 Playlist System loaded');
