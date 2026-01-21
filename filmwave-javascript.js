/**
 * ============================================================
 * FILMWAVE MUSIC PLATFORM - VERSION 31
 * Updated: January 17, 2026
 * ============================================================
 */
/**
 * ============================================================
 * FILMWAVE MUSIC PLATFORM - CODE INDEX
 * ============================================================
 * 
 * SECTION                                    LINE #
 * ------------------------------------------------
 * 1.  GLOBAL STATE                           ~20
 * 2.  UTILITY FUNCTIONS                      ~65
 * 3.  MASTER PLAYER POSITIONING              ~100
 * 4.  MASTER PLAYER VISIBILITY CONTROL       ~115
 * 5.  MAIN INITIALIZATION                    ~175
 * 6.  STANDALONE AUDIO PLAYER                ~280
 * 7.  MASTER PLAYER FUNCTIONS                ~450
 * 8.  SONG CARD FUNCTIONS                    ~650
 * 9.  LINK STANDALONE AUDIO TO WAVEFORM      ~750
 * 10. CREATE STANDALONE AUDIO                ~820
 * 11. PLAY STANDALONE SONG                   ~950
 * 12. INITIALIZE WAVEFORMS (LAZY LOADING)    ~1000
 * 13. LOAD WAVEFORM BATCH                    ~1090
 * 14. FETCH & DISPLAY SONGS                  ~1350
 * 15. DISPLAY FEATURED SONGS                 ~1400
 * 16. DISPLAY FAVORITE SONGS                 ~1470
 * 17. KEYBOARD CONTROLS                      ~1540
 * 18. FILTER HELPERS                         ~1620
 * 19. KEY FILTER SYSTEM                      ~1750
 * 20. BPM FILTER SYSTEM                      ~2350
 * 21. DRAG AND DROP - SORTABLE ITEMS         ~2950
 * 22. PLAYLIST EDIT OVERLAY                  ~3150
 * 23. UNIVERSAL SEARCH FOR NON-MUSIC PAGES   ~3500
 * 24. SCROLL LOCK                            ~4218
 * 25. BARBA.JS & PAGE TRANSITIONS            ~3600
 * 26. FAVORITE BUTTON SYNCING                ~4100
 * 27. LOCALSTORAGE PERSISTENCE               ~4250
 * 28. FILTER STATE SAVE/RESTORE              ~4280
 * 29. FAVORITE SONGS PERSISTENCE             ~4750
 * 30. XANO PLAYLIST SYSTEM                   ~5870
 * 31. DASHBOARD TILES                        ~7900
 * 32. DASHBOARD PLAYLISTS                    ~8100
 * 
 * ============================================================
 */

// Clear search field immediately if auto-search is pending
if (window.location.pathname === '/music' && sessionStorage.getItem('autoSearchGenre')) {
  // Clear the localStorage filter state immediately
  const filters = localStorage.getItem('musicFilters');
  if (filters) {
    const parsed = JSON.parse(filters);
    parsed.searchQuery = '';
    localStorage.setItem('musicFilters', JSON.stringify(parsed));
  }
}

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
    filteredSongIds: [],  
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

/* ============================================================
   DASHBOARD WELCOME TEXT - GENERATE FROM MEMBERSTACK
   ============================================================ */
async function initDashboardWelcome() {
  const welcomeText = document.querySelector('.dashboard-welcome-text');
  if (!welcomeText) return;

  console.log('🏁 initDashboardWelcome CALLED');

  // Check localStorage first
  const cachedName = localStorage.getItem('userFirstName');
  
  if (cachedName) {
    // Set cached name immediately
    welcomeText.textContent = `Welcome, ${cachedName}!`;
    console.log('✅ Set cached name:', cachedName);
    return;
  }

  // No cache - fetch from Memberstack
  try {
    if (!window.$memberstackDom) return;

    const { data: member } = await window.$memberstackDom.getCurrentMember();
    const firstName = member?.customFields?.['first-name'];

    if (firstName) {
      localStorage.setItem('userFirstName', firstName);
      welcomeText.textContent = `Welcome, ${firstName}!`;
      console.log('✅ Set and cached name:', firstName);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

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
      PlaylistManager.init();
    }, 200);
  } else {
    initMasterPlayer();
    updateMasterPlayerVisibility();
    await PlaylistManager.init();
    
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
        displayFavoriteSongs();
      }
      
      if (hasFeaturedSongs || hasFavoriteSongs) {
        setTimeout(() => {
          initUniversalSearch();
        }, 100);
      }
    }, 200);
    
    
    const isDashboardPage = !!document.querySelector('.db-dashboard-wrapper');
    
    if (isDashboardPage) {
      initDashboardWelcome();
      initDashboardTiles();
      initDashboardPlaylists();
    }
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
  cardElement.setAttribute('data-airtable-id', song.id);
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
    document.dispatchEvent(new CustomEvent('audioStateChange', { detail: { songId: songData.id, isPlaying: true } }));
  });
  
  audio.addEventListener('pause', () => {
    g.isPlaying = false;
    updatePlayPauseIcons(cardElement, false);
    updateMasterControllerIcons(false);
    updatePlayerCoverArtIcons(false);
    document.dispatchEvent(new CustomEvent('audioStateChange', { detail: { songId: songData.id, isPlaying: false } }));
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
 * DISPLAY FAVORITE SONGS ON BACKEND PAGE
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
      
      // ✅ ALSO CALL clearAllFilters to handle search and other filters
      if (typeof clearAllFilters === 'function') {
        clearAllFilters();
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

function clearAllFilters() {
  const searchBar = document.querySelector('[data-filter-search="true"]'); // Add this line
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
  
  // Show all songs manually (in case applyFilters doesn't exist yet)
  document.querySelectorAll('.song-wrapper').forEach(song => {
    song.style.display = '';
  });
  
  // Save empty state so restoration knows it was intentionally cleared
  localStorage.setItem('musicFilters', JSON.stringify({
    filters: [],
    searchQuery: ''
  }));
  
  toggleClearButton();
  
  // Only call applyFilters if it exists
  if (typeof applyFilters === 'function') {
    applyFilters();
  }
  
  updateFilterDots();

// ✅ REINITIALIZE SEARCH after clearing
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  if (isMusicPage && typeof initSearchAndFilters === 'function') {
    console.log('🔄 Reinitializing search after clear');
    setTimeout(() => {
      initSearchAndFilters();
    }, 100);
  }
}

function initSearchAndFilters() {
  const g = window.musicPlayerPersistent;
  const searchBar = document.querySelector('[data-filter-search="true"]');
  const clearBtn = document.querySelector('.circle-x');
  
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
    const SLIDER_WIDTH = 175;
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

  const value = Math.max(MIN_BPM, Math.min(MAX_BPM, Number(bpm)));
  const ratio = (value - MIN_BPM) / BPM_RANGE;

  const wrapper = handle.closest('.slider-range-wrapper, .slider-exact-wrapper');
  const track = wrapper?.querySelector('.slider-track');
  const parent = handle.offsetParent || wrapper;

  if (!wrapper || !track || !parent) return;
  if (getComputedStyle(wrapper).display === 'none') return; // don’t measure hidden

  const trackRect = track.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  const trackLeft = trackRect.left - parentRect.left;
  const trackWidth = trackRect.width;

  const handleWidth = handle.offsetWidth || 10;
  const minLeft = trackLeft + handleWidth / 2;
  const maxLeft = trackLeft + trackWidth - handleWidth / 2;

  const rawLeft = trackLeft + ratio * trackWidth;
  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));

  handle.style.position = 'absolute';
  handle.style.left = `${clampedLeft}px`;
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
    
   // Restore values (after DOM paints the correct slider mode)
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    if (bpmState.exact && exactInput && sliderHandleExact) {
      exactInput.value = bpmState.exact;
      updateHandlePosition(sliderHandleExact, parseInt(bpmState.exact, 10));
    }

    if (bpmState.low && lowInput && sliderHandleLow) {
      lowInput.value = bpmState.low;
      updateHandlePosition(sliderHandleLow, parseInt(bpmState.low, 10));
    }

    if (bpmState.high && highInput && sliderHandleHigh) {
      highInput.value = bpmState.high;
      updateHandlePosition(sliderHandleHigh, parseInt(bpmState.high, 10));
    }
  });
});
    
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
  const SLIDER_WIDTH = 175; // px
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

  const value = Math.max(MIN_BPM, Math.min(MAX_BPM, Number(bpm)));
  const ratio = (value - MIN_BPM) / BPM_RANGE;

  const wrapper = handle.closest('.slider-range-wrapper, .slider-exact-wrapper');
  const track = wrapper?.querySelector('.slider-track');
  const parent = handle.offsetParent || wrapper;

  if (!wrapper || !track || !parent) return;
  if (getComputedStyle(wrapper).display === 'none') return; // don’t measure hidden

  const trackRect = track.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  const trackLeft = trackRect.left - parentRect.left;
  const trackWidth = trackRect.width;

  const handleWidth = handle.offsetWidth || 10;
  const minLeft = trackLeft + handleWidth / 2;
  const maxLeft = trackLeft + trackWidth - handleWidth / 2;

  const rawLeft = trackLeft + ratio * trackWidth;
  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));

  handle.style.position = 'absolute';
  handle.style.left = `${clampedLeft}px`;
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

// Clamp to REAL track width
const trackWidth = rect.width;
newLeft = Math.max(0, Math.min(trackWidth, newLeft));
    
    // Prevent handles from crossing in range mode
    if (currentMode === 'range') {
      if (activeHandle === sliderHandleLow && sliderHandleHigh) {
        const highPos = parseFloat(sliderHandleHigh.style.left) || rect.width;
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
  //restoreOrder(container);
  
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
        
      //  onEnd: function(evt) {
      //   console.log('🔄 Item moved from index', evt.oldIndex, 'to', evt.newIndex);
          // Don't auto-save - user needs to click "Save"
      //  }
      // });

      onEnd: function(evt) {
        console.log('🔄 Item moved from index', evt.oldIndex, 'to', evt.newIndex);
         if (isEditMode) {
        saveOrder(container);
        }
      }, 
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

  const wrapper = document.querySelector('.sortable-container-wrapper');
  if (wrapper) {
    if (isEditMode) wrapper.classList.add('is-edit-mode');
    else wrapper.classList.remove('is-edit-mode');
  }
  
  if (isEditMode) {
    // UNLOCK - Enter edit mode
    try {
      sortableInstance.option('disabled', false);
      container.classList.add('is-editing');
      
      // Directly set cursor on items
     // const items = container.querySelectorAll('.playlist-item');
    //  console.log('🎯 Found', items.length, 'items to enable dragging');
    //  items.forEach(item => {
     //   item.style.cursor = 'grab';
    //  });

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
      const items = container.querySelectorAll('.playlist-item');
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
    button.textContent = 'Done';
    button.classList.add('is-saving');
  } else {
    button.textContent = 'Edit';
    button.classList.remove('is-saving');
  }
}

// Dynamically assign data-ids
function assignDataIds(container) {
  const items = container.querySelectorAll('.playlist-item');
  
  items.forEach((item, index) => {
    if (!item.getAttribute('data-id')) {
      const uniqueId = `playlist-item-${index + 1}`;
      item.setAttribute('data-id', uniqueId);
      console.log(`📌 Assigned data-id: ${uniqueId}`);
    }
  });
}

async function saveOrder(container) {
  const items = container.querySelectorAll('.playlist-card-template');
  const positions = Array.from(items)
    .filter((item, index) => {
      // Skip first item (template) OR items without playlistId
      return index > 0 && item.dataset.playlistId;
    })
    .map((item, index) => ({
      id: parseInt(item.dataset.playlistId),
      position: index
    }));
  
  console.log('💾 Saving positions:', positions);
  
  try {
    const response = await fetch(`${XANO_PLAYLISTS_API}/Update_Playlist_Positions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions })
    });
    
    if (!response.ok) throw new Error('Failed to update positions');
    
    console.log('✅ Saved order to Xano');
  } catch (err) {
    console.error('❌ Error saving order:', err);
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

  function closeAllPlaylistOverlays() {
  document.querySelectorAll('.playlist-edit-overlay.is-visible').forEach((ov) => {
    hideOverlay(ov);
  });
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
  const card = newEditIcon.closest('.playlist-card-template');
  if (!card) return;

  const playlistId = card.dataset.playlistId;
  PlaylistManager.editingPlaylistId = playlistId; // ✅ fix error

  closeAllPlaylistOverlays();
  showOverlay(overlay);
  console.log('✅ Playlist overlay shown');

 // Set REAL editable values for name + description (no placeholders)
PlaylistManager.getPlaylistById(playlistId).then((playlist) => {
  const nameInput = overlay.querySelector('.edit-playlist-text-field-1');
  const descInput = overlay.querySelector('.edit-playlist-text-field-2');

  if (nameInput) {
    nameInput.placeholder = '';
    nameInput.value = playlist?.name || '';
  }
  if (descInput) {
    descInput.placeholder = '';
    descInput.value = playlist?.description || '';
  }
});

  const textEl = overlay.querySelector('.change-cover-image .add-image-text');
  if (textEl && !textEl.dataset.originalText) {
    textEl.dataset.originalText = textEl.textContent;
  }
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
  const textEl = overlay.querySelector('.change-cover-image .add-image-text');
  if (textEl && textEl.dataset.originalText) {
    textEl.textContent = textEl.dataset.originalText;
  }

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

function showOverlay(overlay) {
  if (overlay.__fwHideTimer) {
  clearTimeout(overlay.__fwHideTimer);
  overlay.__fwHideTimer = null;
}
  // ✅ undo forced-close inline styles so overlay can open again
  const wrappersToReset = [
    overlay,
    overlay?.closest('.playlist-edit-overlay-wrapper'),
    overlay?.closest('.playlist-edit-module-wrapper'),
    overlay?.closest('.playlist-edit-modal-wrapper'),
    overlay?.closest('.w-modal'),
    overlay?.closest('.w-lightbox-backdrop')
  ].filter(Boolean);

  wrappersToReset.forEach((el) => {
    el.style.display = '';
    el.style.opacity = '';
    el.style.pointerEvents = '';
  });

  // Set display first
  overlay.style.display = 'flex'; // or 'block' depending on your layout

  const overlayEl = document.querySelector('.playlist-edit-overlay');
  const textEl = overlayEl?.querySelector('.change-cover-image .add-image-text');
  if (textEl && !textEl.dataset.originalText) {
    textEl.dataset.originalText = textEl.textContent;
  }

  // Force reflow to ensure display is applied
  overlay.offsetHeight;

  // Add visible class for fade in
  overlay.classList.add('is-visible');
}

// Hide overlay with fade out
function hideOverlay(overlay) {
  // cancel any previous hide timer for this overlay
  if (overlay.__fwHideTimer) {
    clearTimeout(overlay.__fwHideTimer);
    overlay.__fwHideTimer = null;
  }

  // Remove visible class for fade out
  overlay.classList.remove('is-visible');

  // Wait for transition to complete before hiding
  overlay.__fwHideTimer = setTimeout(() => {
    overlay.style.display = 'none';
    overlay.__fwHideTimer = null;
  }, 300); // Match the CSS transition duration
}

// Initialize on page load
window.addEventListener('load', () => {
  initializePlaylistOverlay();
});  

/**
 * ============================================================
 * UNIVERSAL SEARCH FOR NON-MUSIC PAGES
 * (Favorites, Playlist Templates, etc.)
 * ============================================================
 */
function initUniversalSearch() {
  console.log('🔍 Initializing universal search...');
  
  const searchInputs = document.querySelectorAll('.text-field');
  
  if (searchInputs.length === 0) {
    console.log('ℹ️ No search inputs found');
    return;
  }
  
  searchInputs.forEach(searchInput => {
    const isMusicPage = !!searchInput.closest('.music-area-container');
    if (isMusicPage) {
      console.log('⏭️ Skipping music page search (has its own handler)');
      return;
    }
    
    const isFavoritesPage = !!document.querySelector('.favorite-songs-wrapper');
    const isPlaylistTemplatePage = !!document.querySelector('.playlist-template-container');
    
    if (!isFavoritesPage && !isPlaylistTemplatePage) {
      console.log('ℹ️ Not on a supported page');
      return;
    }
    
    console.log(`✅ Setting up search for ${isFavoritesPage ? 'Favorites' : 'Playlist Template'} page`);
    
    // DON'T clone - just add listeners to existing input
    let searchTimeout;
    
    const performSearch = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = searchInput.value.toLowerCase().trim();
        const keywords = query.split(/\s+/).filter(k => k.length > 0);
        
        console.log(`🔍 Searching for: "${query}"`);
        
        const songCards = document.querySelectorAll('.song-wrapper:not(.template-wrapper .song-wrapper)');
        let visibleCount = 0;
        
        console.log(`📊 Found ${songCards.length} song cards to search`);
        
        songCards.forEach(card => {
          // Get text content
          const songTitle = card.querySelector('.song-title, .song-name')?.textContent.toLowerCase() || '';
          const artistName = card.querySelector('.artist-name')?.textContent.toLowerCase() || '';
          const bpm = card.querySelector('.bpm')?.textContent.toLowerCase() || '';
          const key = card.querySelector('.key')?.textContent.toLowerCase() || '';
          
          // Get data attributes (keywords from Airtable)
          const mood = card.getAttribute('data-mood')?.toLowerCase() || '';
          const genre = card.getAttribute('data-genre')?.toLowerCase() || '';
          const instrument = card.getAttribute('data-instrument')?.toLowerCase() || '';
          const theme = card.getAttribute('data-theme')?.toLowerCase() || '';
          const build = card.getAttribute('data-build')?.toLowerCase() || '';
          const vocals = card.getAttribute('data-vocals')?.toLowerCase() || '';
          const instrumental = card.getAttribute('data-instrumental')?.toLowerCase() || '';
          const acapella = card.getAttribute('data-acapella')?.toLowerCase() || '';
          
          // Combine everything
          const allText = `${songTitle} ${artistName} ${bpm} ${key} ${mood} ${genre} ${instrument} ${theme} ${build} ${vocals} ${instrumental} ${acapella}`;
          
          // Debug first card
          if (visibleCount === 0) {
            console.log('🔍 First card data:', {
              songTitle,
              mood,
              genre,
              instrument,
              allText: allText.substring(0, 100) + '...'
            });
          }
          
          const matchesSearch = keywords.length === 0 || keywords.every(k => allText.includes(k));
          
          if (matchesSearch) {
            card.style.display = '';
            visibleCount++;
          } else {
            card.style.display = 'none';
          }
        });
        
        console.log(`✅ Showing ${visibleCount} of ${songCards.length} songs`);
      }, 400);
    };
    
    // Remove old listeners first
    searchInput.removeEventListener('input', performSearch);
    searchInput.removeEventListener('keyup', performSearch);
    
    // Add new listeners
    searchInput.addEventListener('input', performSearch);
    searchInput.addEventListener('keyup', performSearch);
    
    // Prevent Enter key from submitting
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        performSearch(); // Trigger search immediately
        return false;
      }
    });
    
    // Prevent form submission
    const searchForm = searchInput.closest('form');
    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        performSearch();
        return false;
      });
    }
    
    console.log('✅ Universal search initialized');
  });
}

/**
* =============================================================
* SCROLL LOCK
* =============================================================
*/

(function () {
  const html = document.documentElement;
  const body = document.body;

  function lockScroll() {
    if (body.classList.contains("modal-open")) return;

    const scrollY = window.scrollY || window.pageYOffset;
    body.dataset.scrollY = String(scrollY);

    html.classList.add("modal-open");
    body.classList.add("modal-open");

    body.style.top = `-${scrollY}px`;
  }

  function unlockScroll() {
    if (!body.classList.contains("modal-open")) return;

    const scrollY = parseInt(body.dataset.scrollY || "0", 10);

    html.classList.remove("modal-open");
    body.classList.remove("modal-open");

    body.style.top = "";
    window.scrollTo(0, scrollY);
  }

  // Watch your two modules for “active” state
  const selectors = [
    ".create-playlist-module-wrapper",
    ".add-to-playlist-module-wrapper"
  ];

  function isActive(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    // treat visible modules as active (covers flex/block/etc)
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
  }

  function updateLock() {
    const anyActive = selectors.some(sel => isActive(document.querySelector(sel)));
    anyActive ? lockScroll() : unlockScroll();
  }

  // Observe changes (style/class changes when Webflow shows/hides)
  const observer = new MutationObserver(updateLock);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });

  // Initial run
  updateLock();
})();


/**
 * ============================================================
 * BARBA.JS & PAGE TRANSITIONS
 * ============================================================
 */
window.addEventListener('load', () => {
  initMusicPage();

 // Check for auto-search on initial load
if (window.location.pathname === '/music') {
  const autoSearchGenre = sessionStorage.getItem('autoSearchGenre');
  console.log('🔍 [LOAD] Checking for auto-search genre:', autoSearchGenre);
  
  if (autoSearchGenre) {
    // Clear search field immediately
    const searchInput = document.querySelector('.music-area-container .text-field');
    if (searchInput) {
      searchInput.value = '';
    }
    
    setTimeout(() => {
      const searchInput = document.querySelector('.music-area-container .text-field');
      console.log('🔍 [LOAD] Search input found:', !!searchInput);
      
      if (searchInput) {
        searchInput.value = autoSearchGenre;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('✅ [LOAD] Auto-searched for:', autoSearchGenre);
        
        sessionStorage.removeItem('autoSearchGenre');
      }
    }, 300); // Reduced from 1000ms
  }
}
  
  // Initialize Memberstack handlers on initial page load
  setTimeout(() => {
    initializeMemberstackHandlers();
    
    // Initialize welcome text on any page that has it
    initDashboardWelcome();
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

         // ✅ CLEAR ONLY THE MUSIC PAGE SEARCH INPUT
  const isMusicPage = !!data.next.container.querySelector('.music-list-wrapper');
  if (isMusicPage) {
    // Wait for DOM to settle, then clear the actual music page input
    setTimeout(() => {
      const musicSearchInput = document.querySelector('.music-area-container .text-field');
      if (musicSearchInput) {
        musicSearchInput.value = '';
        console.log('🧹 Cleared music page search input');
      }
    }, 100);
  }
        
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

// === SIDEBAR MANAGEMENT ===
const shouldHaveSidebar = window.location.pathname.startsWith('/dashboard/');
const sidebar = document.querySelector('.sidebar-nav');

if (shouldHaveSidebar && sidebar) {
  sidebar.style.visibility = 'visible';
  initDashboardWelcome();
  console.log('✅ Sidebar visible');
} else if (!shouldHaveSidebar && sidebar) {
  sidebar.style.visibility = 'hidden';
  console.log('🚫 Sidebar hidden');
}
// === END SIDEBAR MANAGEMENT ===

  // Initialize dashboard components
const isDashboardPage = window.location.pathname === '/dashboard/dashboard';
if (isDashboardPage) {
  initDashboardTiles();
  initDashboardPlaylists();
  
  // === FILTER PILL CODE ===          
  // Genre filter button handling - ONLY on dashboard
  const filterButtons = document.querySelectorAll('.db-filter-pill');
  console.log('🔍 Found genre filter buttons:', filterButtons.length);
  filterButtons.forEach(button => {
    button.style.cursor = 'pointer';
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const genre = button.textContent.trim();
      
      console.log('🎯 Filter button clicked:', genre);
      
      sessionStorage.setItem('autoSearchGenre', genre);
      console.log('💾 Stored in sessionStorage:', genre);
      
      console.log('🚀 Navigating to /music');
      window.location.href = '/music';
    });
  });
}

// On music page, check for auto-search - ALWAYS runs
if (window.location.pathname === '/music') {
  const autoSearchGenre = sessionStorage.getItem('autoSearchGenre');
  console.log('🔍 Checking for auto-search genre:', autoSearchGenre);
  
  if (autoSearchGenre) {
    setTimeout(() => {
      const searchInput = document.querySelector('.music-area-container .text-field');
      console.log('🔍 Search input found:', !!searchInput);
      
      if (searchInput) {
        searchInput.value = autoSearchGenre;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('✅ Auto-searched for:', autoSearchGenre);
        
        sessionStorage.removeItem('autoSearchGenre');
      }
    }, 500);
  }
}
// === END FILTER PILL CODE ===     
  
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
    
    // Initialize search after featured songs load
    setTimeout(() => {
      console.log('🔍 [BARBA] Initializing search for featured songs...');
      initUniversalSearch();
    }, 800);
  }
  
  if (hasFavoriteSongs) {
    console.log('💛 [BARBA AFTER] Calling displayFavoriteSongs...');
    displayFavoriteSongs();
    
    // Initialize search after favorite songs load
    setTimeout(() => {
      console.log('🔍 [BARBA] Initializing search for favorite songs...');
      initUniversalSearch();
    }, 800);
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

  // ✅ ONLY SAVE FILTERS ON MUSIC PAGE
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  if (!isMusicPage) {
    console.log('⏭️ Skipping filter save - not on music page');
    return;
  }
  
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
    console.log('🔍 Restored search query:', filterState.searchQuery);
    
    // Manually apply the search filter
    setTimeout(() => {
      const query = filterState.searchQuery.toLowerCase().trim();
      const keywords = query.split(/\s+/).filter(k => k.length > 0);
      const songCards = document.querySelectorAll('.song-wrapper');
      
      console.log('🔥 Manually filtering', songCards.length, 'songs with query:', query);
      
      songCards.forEach(card => {
        const songTitle = card.querySelector('.song-title, .song-name')?.textContent.toLowerCase() || '';
        const artistName = card.querySelector('.artist-name')?.textContent.toLowerCase() || '';
        const allFields = Object.values(card.dataset).join(' ').toLowerCase();
        const searchableText = `${songTitle} ${artistName} ${allFields}`;
        
        const matches = keywords.every(k => searchableText.includes(k));
        card.style.display = matches ? '' : 'none';
      });
      
      // Trigger the input event so listeners can update
      searchBar.dispatchEvent(new Event('input', { bubbles: true }));
    }, 200);
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

/**
 * ============================================================
 * XANO PLAYLIST SYSTEM
 * ============================================================
 */

/* ============================================================
   SHARED HELPERS
   ============================================================ */

function updateEmptyPlaylistMessage(container) {
  if (!container) return;

  const existing = container.querySelector('.empty-playlist-message');
  if (existing) existing.remove();

  const remaining = container.querySelectorAll(
    '.song-wrapper:not(.template-wrapper .song-wrapper)'
  );

  if (remaining.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-playlist-message';
    empty.style.cssText = 'text-align:center;padding:60px 20px;color:#666;';
    empty.innerHTML = '<p>This playlist is empty.</p>';
    container.appendChild(empty);
  }
}

function isPlaylistsGridPage() {
  const path = window.location.pathname;
  return path.includes('playlists') && !path.includes('playlist-template');
}

function isPlaylistTemplatePage() {
  return window.location.pathname.includes('playlist-template');
}

function invalidateAddToPlaylistDropdownCache() {
  document.querySelectorAll('.add-to-playlist').forEach((dd) => {
    delete dd.dataset.lastPopulated;
  });
}

function reinitWebflowIX2() {
  if (!window.Webflow) return;
  window.Webflow.destroy();
  window.Webflow.ready();
  window.Webflow.require('ix2').init();
}

function clearResponsiveImageAttrs(img) {
  if (!img) return;
  img.removeAttribute('srcset');
  img.removeAttribute('sizes');
}

function pickImageAsBase64({ onPicked, onCancel } = {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) {
      if (typeof onCancel === 'function') onCancel();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof onPicked === 'function') {
        onPicked({ base64: reader.result, file });
      }
    };
    reader.readAsDataURL(file);
  };

  input.click();
}

/* ============================================================
   DOWNSAMPLE IMAGES
   ============================================================ */

  async function downsampleImageBase64(dataUrl, {
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.8,
  mimeType = 'image/jpeg',
} = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      resolve(canvas.toDataURL(mimeType, quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/* ============================================================
   FILE UPLOAD DRAG AND DROP
   ============================================================ */

(function setupCreatePlaylistDragDropCover() {
  const DROPZONE_SEL = '.new-playlist-upload-field';
  const TEXT_SEL = '.new-plalyist-upload-field-text';
  const ICON_SEL = '.new-playlist-file-icon';

  // Prevent double-install
  if (window.__FW_CREATE_PLAYLIST_DROPZONE_INSTALLED) return;
  window.__FW_CREATE_PLAYLIST_DROPZONE_INSTALLED = true;

  // Utility: detect if a file is an image
  function isImageFile(file) {
    return !!file && typeof file.type === 'string' && file.type.startsWith('image/');
  }

  // Utility: read File -> base64 dataURL
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  // ✅ Capture ORIGINAL UI state (text, color, icon display)
  function getOrStoreDefaultState(modal) {
    if (!modal) return null;

    const zone = modal.querySelector(DROPZONE_SEL);
    if (!zone) return null;

    if (!zone.dataset.defaultCaptured) {
      const textEl = modal.querySelector(TEXT_SEL);
      const iconEl = modal.querySelector(ICON_SEL);

      zone.dataset.defaultCaptured = 'true';
      zone.dataset.defaultText = textEl ? textEl.textContent : '';
      zone.dataset.defaultTextColor = textEl ? (getComputedStyle(textEl).color || '') : '';

      // Important: store the icon's original display (or empty if none)
      if (iconEl) {
        zone.dataset.defaultIconDisplay = iconEl.style.display || '';
        zone.dataset.defaultHasIcon = 'true';
      } else {
        zone.dataset.defaultIconDisplay = '';
        zone.dataset.defaultHasIcon = 'false';
      }
    }

    return zone;
  }

  // ✅ Update UI inside the Create Playlist modal only
  function updateDropUI(modal, fileName) {
    if (!modal) return;

    getOrStoreDefaultState(modal);

    const textEl = modal.querySelector(TEXT_SEL);
    const iconEl = modal.querySelector(ICON_SEL);

    if (textEl) {
      textEl.textContent = fileName || 'Image selected';
      textEl.style.color = '#191919';
    }

    // ✅ Hide icon (do NOT remove)
    if (iconEl) {
      iconEl.style.display = 'none';
    }
  }

  // ✅ Reset UI back to original state (text + icon)
  function resetDropUI(modal) {
    if (!modal) return;

    const zone = getOrStoreDefaultState(modal);
    if (!zone) return;

    const textEl = modal.querySelector(TEXT_SEL);
    const iconEl = modal.querySelector(ICON_SEL);

    if (textEl) {
      textEl.textContent = zone.dataset.defaultText || '';
      textEl.style.color = zone.dataset.defaultTextColor || '';
    }

    // ✅ Re-show icon (only if it existed originally)
    if (zone.dataset.defaultHasIcon === 'true') {
      if (iconEl) {
        iconEl.style.display = zone.dataset.defaultIconDisplay || '';
      } else {
        // If someone removed it, recreate a basic one so the class styling applies
        const recreated = document.createElement('div');
        recreated.className = ICON_SEL.replace('.', '');
        recreated.style.display = zone.dataset.defaultIconDisplay || '';
        zone.appendChild(recreated);
      }
    }
  }

  // ✅ Expose reset function so closeCreatePlaylistModal() can call it
  window.__FW_resetCreatePlaylistDropUI = resetDropUI;

  // Highlight helpers (optional, safe)
  function setDragActive(zone, isActive) {
    if (!zone) return;
    zone.classList.toggle('is-drag-active', !!isActive);
  }

  // Main: handle dropped file
  async function handleDroppedFile(modal, file) {
    if (!isImageFile(file)) {
      alert('Please drop an image file.');
      return;
    }

    try {
      const base64 = await fileToBase64(file);

      if (window.PlaylistManager) {
        downsampleImageBase64(base64, { maxWidth: 800, maxHeight: 800, quality: 0.8 })
  .then((small) => {
    window.PlaylistManager.pendingCoverImageBase64 = small;
  })
  .catch(() => {
    window.PlaylistManager.pendingCoverImageBase64 = base64; // fallback
  });
      }

      updateDropUI(modal, file.name);
      console.log('🖼️ Create playlist cover set via drag/drop:', file.name);
    } catch (err) {
      console.error('Drag/drop cover image failed:', err);
      alert('Could not read that image file.');
    }
  }

  // ✅ CLICK-TO-OPEN DIALOG (dropzone uses the SAME picker flow)
  document.addEventListener('click', (e) => {
    const zone = e.target.closest(DROPZONE_SEL);
    if (!zone) return;

    const modal = zone.closest('.create-playlist-module-wrapper');
    if (!modal) return;

    // Only when modal is actually open
    if (getComputedStyle(modal).display === 'none') return;

    getOrStoreDefaultState(modal);

    pickImageAsBase64({
      onPicked: ({ base64, file }) => {
        if (window.PlaylistManager) {
          downsampleImageBase64(base64, { maxWidth: 800, maxHeight: 800, quality: 0.8 })
  .then((small) => {
    window.PlaylistManager.pendingCoverImageBase64 = small;
  })
  .catch(() => {
    window.PlaylistManager.pendingCoverImageBase64 = base64; // fallback
  });

        }
        updateDropUI(modal, file?.name || 'Image selected');
        console.log('🖼️ Create playlist cover set via picker:', file?.name);
      },
      onCancel: () => {},
    });
  });

  document.addEventListener('dragover', (e) => {
    const zone = e.target.closest(DROPZONE_SEL);
    if (!zone) return;

    const modal = zone.closest('.create-playlist-module-wrapper');
    if (!modal) return;
    if (getComputedStyle(modal).display === 'none') return;

    getOrStoreDefaultState(modal);

    e.preventDefault(); // required for drop to fire
    setDragActive(zone, true);
  });

  document.addEventListener('dragleave', (e) => {
    const zone = e.target.closest(DROPZONE_SEL);
    if (!zone) return;
    setDragActive(zone, false);
  });

  document.addEventListener('drop', async (e) => {
    const zone = e.target.closest(DROPZONE_SEL);
    if (!zone) return;

    e.preventDefault();
    e.stopPropagation();

    setDragActive(zone, false);

    const modal = zone.closest('.create-playlist-module-wrapper');
    if (!modal) return;
    if (getComputedStyle(modal).display === 'none') return;

    getOrStoreDefaultState(modal);

    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    await handleDroppedFile(modal, file);
  });

  console.log('✅ Create playlist drag/drop cover uploader installed');
})();


/* ============================================================
   PLAYLIST MANAGER
   ============================================================ */

/* ----------------------------
   HELPERS
   ---------------------------- */

function FW_getVisiblePlaylistCards(container) {
  return Array.from(container.querySelectorAll('.playlist-card-template'))
    .filter((el) => !el.classList.contains('is-template'));
}

function FW_flipAnimate(container, mutateFn) {
  const cards = FW_getVisiblePlaylistCards(container);
  const first = new Map(cards.map((el) => [el, el.getBoundingClientRect()]));

  mutateFn();

  const cardsAfter = FW_getVisiblePlaylistCards(container);
  const last = new Map(cardsAfter.map((el) => [el, el.getBoundingClientRect()]));

  // Apply FLIP
  cardsAfter.forEach((el) => {
    const f = first.get(el);
    const l = last.get(el);
    if (!f || !l) return;

    const dx = f.left - l.left;
    const dy = f.top - l.top;

    if (dx || dy) {
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.transition = 'transform 0s';
      el.getBoundingClientRect(); // force reflow
      el.style.transition = 'transform 250ms ease';
      el.style.transform = '';
    }
  });

  // Cleanup transitions after
  setTimeout(() => {
    cardsAfter.forEach((el) => {
      el.style.transition = '';
      el.style.transform = '';
    });
  }, 300);
}

function FW_buildPlaylistCardFromTemplate({ template, playlist, count = 0 }) {
  const card = template.cloneNode(true);
  card.classList.remove('is-template');

  const title = card.querySelector('.playlist-title');
  const detail = card.querySelector('.playlist-detail');
  const image = card.querySelector('.playlist-image');
  const link = card.querySelector('.playlist-link-block');

  if (title) title.textContent = playlist.name;
  if (detail) detail.textContent = playlist.description || '';

  if (image && playlist.cover_image_url) {
    clearResponsiveImageAttrs(image);
    image.src = playlist.cover_image_url;

    requestAnimationFrame(() => {
      clearResponsiveImageAttrs(image);
      image.src = playlist.cover_image_url;
    });
  }

  if (link) link.href = `/dashboard/playlist-template?playlist=${playlist.id}`;

  card.dataset.playlistId = playlist.id;

  const countEl = card.querySelector('.playlist-song-count');
  if (countEl) countEl.textContent = String(count);

  card.style.removeProperty('display');
  card.style.display = 'block';

  return card;
}

const PlaylistManager = {
  
  /* ----------------------------
     STATE
     ---------------------------- */

  currentUserId: null,
  playlists: [],
  currentPlaylistId: null,

  pendingSongToAdd: null,
  listenersInitialized: false,

  currentSongForPlaylist: null,
  selectedPlaylistIds: [],
  originalPlaylistIds: [],

  pendingCoverImageBase64: null,
  editingPlaylistId: null,

  // kept to avoid breaking external refs
  selectedCoverImageBase64: null,
  selectedCoverImageName: null,

 /* ----------------------------
    ADD TO PLAYLIST - RE-ORDER HELPERS
    ---------------------------- */

    _setLastClickedPlaylistForAddModal(playlistId) {
    if (!playlistId) return;
    localStorage.setItem('fw_last_clicked_playlist_id', String(playlistId));
    },
  
    _getLastClickedPlaylistForAddModal() {
    return localStorage.getItem('fw_last_clicked_playlist_id');
    },

    _setLastCreatedPlaylistForAddModal(playlistId) {
    if (!playlistId) return;
    localStorage.setItem('fw_last_created_playlist_id', String(playlistId));
    },
  
    _getLastCreatedPlaylistForAddModal() {
    return localStorage.getItem('fw_last_created_playlist_id');
    },
  
    _clearLastCreatedPlaylistForAddModal() {
    localStorage.removeItem('fw_last_created_playlist_id');
    },

    _setLastCreatedPlaylistAutoSelectId(playlistId) {
    if (!playlistId) return;
    localStorage.setItem('fw_last_created_playlist_autoselect_id', String(playlistId));
    },
  
    _getLastCreatedPlaylistAutoSelectId() {
    return localStorage.getItem('fw_last_created_playlist_autoselect_id');
    },
  
    _clearLastCreatedPlaylistAutoSelectId() {
    localStorage.removeItem('fw_last_created_playlist_autoselect_id');
    },  
  
  /* ----------------------------
     INIT
     ---------------------------- */

  async init() {
    console.log('🎵 Initializing Playlist Manager');
    await this.getUserId();
    this.setupEventListeners();
    this.setupPageSpecificFeatures();
  },

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

  /* ============================================================
     API METHODS
     ============================================================ */

  async createPlaylist(name, description = '') {
    if (!this.currentUserId) throw new Error('User not logged in');

    const response = await fetch(`${XANO_PLAYLISTS_API}/Create_Playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: this.currentUserId,
        name,
        description,
        cover_image_url: this.pendingCoverImageBase64 || '',
      }),
    });

    if (!response.ok) throw new Error('Failed to create playlist');
    return response.json();
  },

  async updatePlaylist(playlistId, updates = {}) {
    if (!this.currentUserId) throw new Error('User not logged in');

    const response = await fetch(`${XANO_PLAYLISTS_API}/Update_Playlist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playlist_id: parseInt(playlistId),
        user_id: this.currentUserId,
        ...updates,
      }),
    });

    if (!response.ok) throw new Error('Failed to update playlist');
    return response.json();
  },

  async getUserPlaylists(forceRefresh = false) {
    if (!this.currentUserId) return [];

    if (!forceRefresh && Array.isArray(this.playlists) && this.playlists.length) {
      return this.playlists;
    }

    try {
      const response = await fetch(
        `${XANO_PLAYLISTS_API}/Get_User_Playlists?user_id=${this.currentUserId}`
      );

      if (!response.ok) throw new Error('Failed to fetch playlists');

      const data = await response.json();
      this.playlists = data;
      return data;
    } catch (error) {
      console.error('Error fetching playlists:', error);
      return [];
    }
  },

  async getPlaylistById(playlistId) {
    const playlists = await this.getUserPlaylists();
    return playlists.find((p) => p.id === parseInt(playlistId));
  },

  async getPlaylistSongs(playlistId) {
    try {
      const response = await fetch(
        `${XANO_PLAYLISTS_API}/Get_Playlist_Songs?playlist_id=${playlistId}`
      );

      if (!response.ok) throw new Error('Failed to fetch playlist songs');
      return response.json();
    } catch (error) {
      console.error('Error fetching playlist songs:', error);
      return [];
    }
  },

  async addSongToPlaylist(playlistId, songId, position = 0) {
    const response = await fetch(`${XANO_PLAYLISTS_API}/Add_Song_to_Playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playlist_id: parseInt(playlistId),
        song_id: songId,
        position,
      }),
    });

    if (!response.ok) throw new Error('Failed to add song to playlist');
    return response.json();
  },

  async removeSongFromPlaylist(playlistId, songId) {
    const url =
      `${XANO_PLAYLISTS_API}/Remove_Song_from_Playlist` +
      `?playlist_id=${encodeURIComponent(parseInt(playlistId))}` +
      `&song_id=${encodeURIComponent(songId)}`;

    const response = await fetch(url, { method: 'DELETE' });

    if (!response.ok) throw new Error('Failed to remove song');
    return response.json();
  },

  async reorderPlaylistSongs(playlistId, positions) {
    const response = await fetch(`${XANO_PLAYLISTS_API}/Reorder_Playlist_Songs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playlist_id: parseInt(playlistId),
        positions,
      }),
    });

    if (!response.ok) throw new Error('Failed to reorder playlist');
    return response.json();
  },

  async deletePlaylist(playlistId) {
    const response = await fetch(`${XANO_PLAYLISTS_API}/Delete_Playlist`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlist_id: parseInt(playlistId) }),
    });

    if (!response.ok) throw new Error('Failed to delete playlist');
    return response.json();
  },

  /* ============================================================
     UI METHODS
     ============================================================ */

  setupEventListeners() {
    if (this.listenersInitialized) return;
    this.listenersInitialized = true;

    // Disabled to avoid double-trigger
    // setupCoverImageUpload('.add-cover-image');
    // setupCoverImageUpload('.change-cover-image');

    document.body.addEventListener('click', async (e) => {
      /* ----------------------------
         ADD-TO-PLAYLIST (dropdown + modal)
         ---------------------------- */

      if (e.target.closest('.dd-create-new-playlist')) {
        e.preventDefault();
        e.stopPropagation();

        const songWrapper = e.target.closest('.song-wrapper');
        if (songWrapper) {
          this.pendingSongToAdd = {
            songId: songWrapper.dataset.songId || songWrapper.dataset.airtableId,
          };
        }

        this.openCreatePlaylistModal();
        return;
      }


      // Add to Playlist Module
      if (e.target.closest('.dd-add-to-playlist')) {
  e.preventDefault();
  e.stopPropagation();

  const songWrapper = e.target.closest('.song-wrapper');
  const songId = songWrapper?.dataset.songId || songWrapper?.dataset.airtableId;

  console.log('✅ dd-add-to-playlist CLICK -> songId:', songId);

  if (songId) {
    // ✅ Capture selected song UI data from the clicked card
    this._setAddToPlaylistSelectedSongFromCard(songWrapper);

    // ✅ Open modal
    this.openAddToPlaylistModal(songId);
  } else {
    console.warn('❌ Could not find songId for add-to-playlist');
  }

  return;
}
//End

      if (e.target.closest('.add-to-playlist-x-button')) {
        e.preventDefault();
        this.closeAddToPlaylistModal();
        return;
      }

      if (e.target.classList.contains('add-to-playlist-module-wrapper')) {
        this.closeAddToPlaylistModal();
        return;
      }

     const playlistRow = e.target.closest('.add-to-playlist-row');
if (playlistRow && playlistRow.dataset.playlistId) {
  e.preventDefault();

  // ✅ once they click anything, stop pinning "last created"
  if (typeof this._clearLastCreatedPlaylistForAddModal === 'function') {
    this._clearLastCreatedPlaylistForAddModal();
  }
  if (typeof this._clearLastCreatedPlaylistAutoSelectId === 'function') {
    this._clearLastCreatedPlaylistAutoSelectId();
  }

  // ✅ remember last clicked (applies next open)
  this._setLastClickedPlaylistForAddModal(playlistRow.dataset.playlistId);

  this.togglePlaylistSelection(playlistRow);
  return;
}

      if (e.target.closest('.add-to-playlist-save-button')) {
  e.preventDefault();

  // If newly created playlist is selected, treat it as "most recent"
  const lastCreatedId = this._getLastCreatedPlaylistForAddModal?.();
  if (
    lastCreatedId &&
    this.selectedPlaylistIds.map(String).includes(String(lastCreatedId))
  ) {
    this._setLastClickedPlaylistForAddModal(String(lastCreatedId));
  }

  // Clear one-time helpers AFTER promotion
  if (typeof this._clearLastCreatedPlaylistForAddModal === 'function') {
    this._clearLastCreatedPlaylistForAddModal();
  }
  if (typeof this._clearLastCreatedPlaylistAutoSelectId === 'function') {
    this._clearLastCreatedPlaylistAutoSelectId();
  }

  this.saveToSelectedPlaylists();
  return;
}

      /* ----------------------------
         CREATE PLAYLIST MODAL
         ---------------------------- */

      if (e.target.closest('.create-playlist-x-button')) {
        e.preventDefault();
        this.closeCreatePlaylistModal();
        return;
      }

      if (e.target.closest('.create-playlist-button') || e.target.closest('.playlist-add-button')) {
        e.preventDefault();
        e.stopPropagation();

        this.pendingSongToAdd = null;
        this.openCreatePlaylistModal();
        return;
      }

      if (e.target.closest('.create-playlist-save-button')) {
        e.preventDefault();
        this.handleCreatePlaylist();
        return;
      }

      if (e.target.classList.contains('create-playlist-module-wrapper')) {
        this.closeCreatePlaylistModal();
        return;
      }

      /* ----------------------------
         ADD SONG TO PLAYLIST (hover dropdown item)
         ---------------------------- */

      const dropdownItem = e.target.closest('.playlist-dropdown-item');
      if (dropdownItem) {
        e.preventDefault();
        e.stopPropagation();

        const playlistId = dropdownItem.dataset.playlistId;
        const playlistName = dropdownItem.textContent;
        const dropdown = dropdownItem.closest('.add-to-playlist');

        if (dropdown && playlistId) {
          this.handleAddSongToPlaylist(dropdown, playlistId, playlistName);
        }
        return;
      }

      /* ----------------------------
         DELETE PLAYLIST
         ---------------------------- */

      const deleteBtn = e.target.closest('.playlist-delete-button');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();

        const card = deleteBtn.closest('.playlist-card-template');
        const playlistId = card?.dataset.playlistId;
        const title = card?.querySelector('.playlist-title')?.textContent;

        if (playlistId && confirm(`Delete "${title}"?`)) {
         this.deletePlaylist(playlistId)
  .then(async () => {
    const container = document.querySelector('.sortable-container');

    if (container && card) {
      FW_flipAnimate(container, () => {
        card.remove();
      });
    } else if (card) {
      card.remove();
    }

    await this.getUserPlaylists(true);
    invalidateAddToPlaylistDropdownCache();
    this.showNotification('Playlist deleted');
  })
           
            .catch(() => {
              this.showNotification('Error deleting playlist', 'error');
            });
        }
        return;
      }

      /* ----------------------------
         REMOVE SONG FROM PLAYLIST (playlist template)
         ---------------------------- */

      if (e.target.closest('.dd-remove-from-playlist')) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation(); // ✅ stop the other remove handler from firing

        const btn = e.target.closest('.dd-remove-from-playlist');
        const card = btn.closest('.song-wrapper');
        const songId = card?.dataset.songId;

        if (!songId || !this.currentPlaylistId) {
          console.warn('❌ Missing songId or currentPlaylistId', {
            songId,
            currentPlaylistId: this.currentPlaylistId,
          });
          return;
        }

        try {
          await this.removeSongFromPlaylist(this.currentPlaylistId, songId);

          card.style.opacity = '0';

          setTimeout(() => {
            card.remove();

            const container = document.querySelector('.playlist-songs-wrapper');
            if (!container) return;

            const remaining = container.querySelectorAll(
              '.song-wrapper:not(.template-wrapper .song-wrapper)'
            );

            if (remaining.length === 0) {
              const templateWrapper = container.querySelector('.template-wrapper');
              if (templateWrapper) templateWrapper.style.display = 'none';
              updateEmptyPlaylistMessage(container);
            }
          }, 300);

          const playlist = await this.getPlaylistById(this.currentPlaylistId);
          const playlistName = playlist?.name || 'playlist';
          this.showNotification(`Removed from "${playlistName}"`);
        } catch (err) {
          console.error('Error removing song:', err);
          this.showNotification('Error removing song', 'error');
        }

        return;
      }

      /* ----------------------------
         EDIT OVERLAY (close w/o save)
         ---------------------------- */

      if (e.target.closest('.playlist-x-button')) {
        e.preventDefault();
        e.stopPropagation();

        this.pendingCoverImageBase64 = null;
        this.editingPlaylistId = null;

        const overlay = document.querySelector('.playlist-edit-overlay');
        const textEl = overlay?.querySelector('.change-cover-image .add-image-text');

        if (textEl) {
          textEl.textContent = textEl.dataset.originalText || textEl.textContent;
        }

        const nameInput = document.querySelector('.edit-playlist-text-field-1');
        const descInput = document.querySelector('.edit-playlist-text-field-2');

        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';

        return;
      }

      /* ----------------------------
         COVER IMAGE (create playlist)
         ---------------------------- */

     if (e.target.closest('.add-cover-image')) {
  e.preventDefault();
  e.stopPropagation();

  const modal = e.target.closest('.create-playlist-module-wrapper');
  if (!modal) return;

  const zone = modal.querySelector('.new-playlist-upload-field');
  if (zone) zone.click(); // ✅ route through the dropzone click handler (single flow)

  return;
}

      /* ----------------------------
         COVER IMAGE (edit playlist)
         ---------------------------- */

     if (e.target.closest('.change-cover-image')) {
  e.preventDefault();
  e.stopPropagation();

  const card = e.target.closest('.playlist-card-template');
  const playlistId = card?.dataset.playlistId;
  if (!playlistId) return;

  this.editingPlaylistId = playlistId;

  const playlist = await this.getPlaylistById(playlistId);

const nameInput = document.querySelector('.edit-playlist-text-field-1');
const descInput = document.querySelector('.playlist-settings-label');

if (nameInput) {
  nameInput.placeholder = playlist?.name || '';
  nameInput.value = '';
}
if (descInput) {
  descInput.placeholder = playlist?.description || '';
  descInput.value = '';
}     

  const btn = e.target.closest('.change-cover-image');
  const textEl = btn?.querySelector('.add-image-text');

  if (textEl && !textEl.dataset.originalText) {
    textEl.dataset.originalText = textEl.textContent;
  }

  pickImageAsBase64({
    onPicked: async ({ base64, file }) => {
      try {
        const small = await downsampleImageBase64(base64, {
          maxWidth: 800,
          maxHeight: 800,
          quality: 0.8,
          mimeType: 'image/jpeg',
        });
        this.pendingCoverImageBase64 = small;
      } catch {
        this.pendingCoverImageBase64 = base64; // fallback
      }

      if (textEl) textEl.textContent = file?.name || 'Image selected';
    },
  });

  return;
}

      /* ----------------------------
         SAVE PLAYLIST EDITS
         ---------------------------- */

      if (e.target.closest('.playlist-save-button')) {
        e.preventDefault();
        e.stopPropagation();

        const playlistId = this.editingPlaylistId;
        const savingCard = document.querySelector(`.playlist-card-template[data-playlist-id="${playlistId}"]`);
        if (savingCard) savingCard.style.opacity = '0.6';
        if (!playlistId) {
          console.warn('❌ No editingPlaylistId set');
          return;
        }

        const saveBtn = e.target.closest('.playlist-save-button');
        const originalSaveText = saveBtn ? saveBtn.textContent : null;

        if (saveBtn) {
          saveBtn.textContent = 'Saving...';
          saveBtn.style.pointerEvents = 'none';
          saveBtn.style.opacity = '0.7';
        }

       const overlay = e.target.closest('.playlist-edit-overlay');
const nameInput = overlay?.querySelector('.edit-playlist-text-field-1');
const descInput = overlay?.querySelector('.edit-playlist-text-field-2');

// Always start from existing data so nothing gets wiped
const existing = await this.getPlaylistById(playlistId);

const updates = {
  name: existing?.name || '',
  description: existing?.description || '',
  cover_image_url: existing?.cover_image_url || '', // ✅ preserve image
};

if (nameInput) updates.name = nameInput.value.trim();
if (descInput) updates.description = descInput.value.trim();

// Only override cover if user picked a new one
const newCover = this.pendingCoverImageBase64;
if (newCover) updates.cover_image_url = newCover;

        try {
          await this.updatePlaylist(playlistId, updates);
          this.pendingCoverImageBase64 = null;

          const card = document.querySelector(`.playlist-card-template[data-playlist-id="${playlistId}"]`);
if (card) {
  card.style.opacity = '0.6'; // ⬅ start “saving” visual state

  const titleEl = card.querySelector('.playlist-title');
  const detailEl = card.querySelector('.playlist-detail');

  if (titleEl && updates.name) titleEl.textContent = updates.name;
  if (detailEl) detailEl.textContent = updates.description || '';
}

          if (newCover) {
            const card = document.querySelector(
              `.playlist-card-template[data-playlist-id="${playlistId}"]`
            );
            const img = card?.querySelector('.playlist-image');

            if (img) {
              clearResponsiveImageAttrs(img);
              img.src = newCover;

              requestAnimationFrame(() => {
                clearResponsiveImageAttrs(img);
                img.src = newCover;
              });
            }
          }

          invalidateAddToPlaylistDropdownCache();

          if (isPlaylistsGridPage()) {
          // ✅ do NOT re-render the whole grid (prevents flash)
          // refresh cache only
          await this.getUserPlaylists(true);
          }

          this.pendingCoverImageBase64 = null;

          const overlay = document.querySelector('.playlist-edit-overlay');
          const textEl = overlay?.querySelector('.change-cover-image .add-image-text');

          if (textEl) {
            textEl.textContent = textEl.dataset.originalText || textEl.textContent;
          }

         this.showNotification('Playlist updated');

// ✅ reset cover filename text back to default BEFORE closing
const overlayEl =
  e.target.closest('.playlist-edit-overlay') ||
  document.querySelector('.playlist-edit-overlay');

const textElAfterSave = overlayEl?.querySelector('.change-cover-image .add-image-text');
if (textElAfterSave) {
  textElAfterSave.textContent =
    textElAfterSave.dataset.originalText || textElAfterSave.textContent;
}

// FORCE CLOSE EDIT OVERLAY
const wrappersToHide = [
  overlayEl,
  overlayEl?.closest('.playlist-edit-overlay-wrapper'),
  overlayEl?.closest('.playlist-edit-module-wrapper'),
  overlayEl?.closest('.playlist-edit-modal-wrapper'),
  overlayEl?.closest('.w-modal'),
  overlayEl?.closest('.w-lightbox-backdrop')
].filter(Boolean);

wrappersToHide.forEach((el) => {
  el.style.display = 'none';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
  el.classList.remove('open', 'is-open', 'is-active', 'active', 'w--open');
});

this.editingPlaylistId = null;
this.pendingCoverImageBase64 = null;
          
        } catch (err) {
          console.error('Error saving playlist edits:', err);
          this.showNotification('Error saving playlist', 'error');
        } finally {
          if (saveBtn) {
            saveBtn.textContent = originalSaveText || 'Save';
            saveBtn.style.pointerEvents = '';
            saveBtn.style.opacity = '';
          }
          if (savingCard) savingCard.style.opacity = '';
        }

        return;
      }
    });

    this.setupAddToPlaylistDropdowns();

    console.log('✅ Playlist event listeners setup complete');
  },

  openCreatePlaylistModal() {
    const modal = document.querySelector('.create-playlist-module-wrapper');
    if (!modal) return;

    modal.style.display = 'flex';

    setTimeout(() => {
      const input = modal.querySelector('.playlist-text-field-1');
      if (input) input.focus();
    }, 100);
  },

  closeCreatePlaylistModal() {
    const modal = document.querySelector('.create-playlist-module-wrapper');
    if (!modal) return;

    modal.style.display = 'none';
    if (window.__FW_resetCreatePlaylistDropUI) window.__FW_resetCreatePlaylistDropUI(modal);

    const titleInput = modal.querySelector('.playlist-text-field-1');
    const descInput = modal.querySelector('.playlist-text-field-2');

    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';

    this.pendingSongToAdd = null;
    this.pendingCoverImageBase64 = null;

    const textEl = modal.querySelector('.add-cover-image .add-image-text');
    if (textEl) {
      textEl.textContent = textEl.dataset.originalText || textEl.textContent;
    }
  },

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
      const saveBtn = modal?.querySelector('.create-playlist-save-button');
      const originalText = saveBtn?.textContent;

      if (saveBtn) saveBtn.textContent = 'Creating...';

     const playlist = await this.createPlaylist(name, description);

// ✅ Pin “last created” to top (next time the add modal opens)
this._setLastCreatedPlaylistForAddModal(playlist.id);

// ✅ ONLY set auto-select if the Add-to-Playlist modal is currently open
const addModal = document.querySelector('.add-to-playlist-module-wrapper');
const addModalOpen = addModal && getComputedStyle(addModal).display !== 'none';

if (addModalOpen) {
  this._setLastCreatedPlaylistAutoSelectId(playlist.id);
} else {
  // created from playlists page etc → DO NOT auto-checkmark later
  this._clearLastCreatedPlaylistAutoSelectId();
}

await this.getUserPlaylists(true);

if (addModalOpen) {
  await this.populateAddToPlaylistModal();
}

      invalidateAddToPlaylistDropdownCache();

      if (isPlaylistsGridPage()) {
  const container = document.querySelector('.sortable-container');
  const template = container?.querySelector('.playlist-card-template.is-template');

  if (container && template) {
    // ✅ keep everything visible, insert new card, shuffle animation
    FW_flipAnimate(container, () => {
      const newCard = FW_buildPlaylistCardFromTemplate({
        template,
        playlist,
        count: 0,
      });

      // insert at top (after template)
      if (template.nextSibling) {
        container.insertBefore(newCard, template.nextSibling);
      } else {
        container.appendChild(newCard);
      }
    });

    reinitWebflowIX2();
    if (typeof initializePlaylistOverlay === 'function') {
      initializePlaylistOverlay();
    }

    // keep cache fresh (no grid rebuild)
    await this.getUserPlaylists(true);
  } else {
    // fallback
    this.playlists = [];
    await this.renderPlaylistsGrid();
  }
}

      if (saveBtn) saveBtn.textContent = originalText;

      this.closeCreatePlaylistModal();

      if (this.pendingSongToAdd?.songId) {
        await this.addSongToPlaylist(playlist.id, this.pendingSongToAdd.songId, 1);
        this.showNotification('Playlist created and song added!');
        this.pendingSongToAdd = null;
      } else {
        this.showNotification(`Playlist "${name}" created!`);
      }

      this.pendingCoverImageBase64 = null;

      const imgTextEl = modal?.querySelector('.add-cover-image .add-image-text');
      if (imgTextEl) {
        imgTextEl.textContent = imgTextEl.dataset.originalText || imgTextEl.textContent;
      }
    } catch (error) {
      console.error('Error creating playlist:', error);
      this.showNotification('Error creating playlist', 'error');

      const saveBtn = modal?.querySelector('.create-playlist-save-button');
      if (saveBtn) saveBtn.textContent = 'Save';
    }

    // ✅ Reset the drag/drop upload UI back to default
const uploadField = modal.querySelector('.new-playlist-upload-field');
const uploadText = modal.querySelector('.new-plalyist-upload-field-text');
const uploadIcon = modal.querySelector('.new-playlist-file-icon');

if (uploadText) {
  // store default once
  if (!uploadText.dataset.originalText) {
    uploadText.dataset.originalText = uploadText.textContent;
  }
  uploadText.textContent = uploadText.dataset.originalText;
  uploadText.style.color = '';
}

if (uploadIcon) uploadIcon.style.display = '';
  },

  /* ============================================================
     ADD TO PLAYLIST MODAL
     ============================================================ */

  /* ----------------------------
   ADD TO PLAYLIST SONG INFO
   ---------------------------- */

_setAddToPlaylistSelectedSongFromCard(songWrapper) {
  if (!songWrapper) return;

  const title = (songWrapper.querySelector('.song-name')?.textContent || '').trim();
  const artist = (songWrapper.querySelector('.artist-name')?.textContent || '').trim();

  const coverEl = songWrapper.querySelector('.cover-art');
  let coverSrc = '';

  if (coverEl && coverEl.tagName === 'IMG') {
    coverSrc = coverEl.getAttribute('src') || '';
  } else if (coverEl) {
    const bg = getComputedStyle(coverEl).backgroundImage || '';
    const match = bg.match(/url\(["']?(.*?)["']?\)/i);
    coverSrc = match?.[1] || '';
  }

  this._selectedSongForAddToPlaylistUI = { title, artist, coverSrc };
},

_renderAddToPlaylistSelectedSongUI() {
  const modal = document.querySelector('.add-to-playlist-module-wrapper');
  if (!modal) return;

  const coverTarget = modal.querySelector('.add-to-playlist-song-cover');
  const textTarget = modal.querySelector('.add-to-playlist-song-text');

  let meta = this._selectedSongForAddToPlaylistUI;

  if (!meta && this.currentSongForPlaylist) {
    const id = String(this.currentSongForPlaylist);

    const card =
      document.querySelector(`.song-wrapper[data-song-id="${CSS.escape(id)}"]`) ||
      document.querySelector(`.song-wrapper[data-airtable-id="${CSS.escape(id)}"]`);

    if (card) {
      this._setAddToPlaylistSelectedSongFromCard(card);
      meta = this._selectedSongForAddToPlaylistUI;
    }
  }

  if (!meta) return;

  const title = meta.title || '';
  const artist = meta.artist || '';
  const coverSrc = meta.coverSrc || '';

  if (textTarget) {
    textTarget.textContent = artist ? `${title} by ${artist}` : title;
  }

  if (coverTarget) {
    if (coverTarget.tagName === 'IMG') {
      if (coverSrc) coverTarget.src = coverSrc;
    } else if (coverSrc) {
      coverTarget.style.backgroundImage = `url("${coverSrc}")`;
      coverTarget.style.backgroundSize = 'cover';
      coverTarget.style.backgroundPosition = 'center';
      coverTarget.style.backgroundRepeat = 'no-repeat';
    }
  }
},
  
  // Open Add to Playlist Module
  openAddToPlaylistModal(songId) {
  this.currentSongForPlaylist = songId;
  this.selectedPlaylistIds = [];

  const modal = document.querySelector('.add-to-playlist-module-wrapper');
  if (!modal) return;

  modal.style.display = 'flex';

  // ✅ Paint the selected song into the modal immediately
  this._renderAddToPlaylistSelectedSongUI();

  this.populateAddToPlaylistModal();
},
  //End

  closeAddToPlaylistModal() {
  const modal = document.querySelector('.add-to-playlist-module-wrapper');
  if (modal) modal.style.display = 'none';

  this.currentSongForPlaylist = null;
  this.selectedPlaylistIds = [];
  this.originalPlaylistIds = [];

  // ✅ clear ONLY the auto-select id when closing (so selection doesn't stick)
  if (typeof this._clearLastCreatedPlaylistAutoSelectId === 'function') {
    this._clearLastCreatedPlaylistAutoSelectId();
  }
},

  async populateAddToPlaylistModal() {
    const container = document.querySelector('.module-bod-container');
    const template = container?.querySelector('.add-to-playlist-row');
    if (!container || !template) return;

    // Hide immediately to prevent icon flash
    container.style.opacity = '0';

    // Clear existing rows except template
    container.querySelectorAll('.add-to-playlist-row').forEach((row, i) => {
      if (i > 0) row.remove();
    });

    // Hide template row immediately
    template.style.display = 'none';

    const playlists = await this.getUserPlaylists();

    // ✅ Sort order priority:
// 1) last created playlist (if any)
// 2) last clicked playlist (if any)
// 3) otherwise keep original order
const lastCreatedId = this._getLastCreatedPlaylistForAddModal?.();
const lastClickedId = this._getLastClickedPlaylistForAddModal?.();

if (lastCreatedId || lastClickedId) {
  playlists.sort((a, b) => {
    const aCreated = lastCreatedId && String(a.id) === String(lastCreatedId);
    const bCreated = lastCreatedId && String(b.id) === String(lastCreatedId);
    if (aCreated && !bCreated) return -1;
    if (!aCreated && bCreated) return 1;

    const aClicked = lastClickedId && String(a.id) === String(lastClickedId);
    const bClicked = lastClickedId && String(b.id) === String(lastClickedId);
    if (aClicked && !bClicked) return -1;
    if (!aClicked && bClicked) return 1;

    return 0;
  });
}

    const songInPlaylists = [];
    this.originalPlaylistIds = [];

    const songsByPlaylist = await Promise.all(
      playlists.map(async (playlist) => {
        const songs = await this.getPlaylistSongs(playlist.id);
        return { playlistId: playlist.id, songs };
      })
    );

    for (const { playlistId, songs } of songsByPlaylist) {
      if (songs.some((s) => String(s.song_id) === String(this.currentSongForPlaylist))) {
        songInPlaylists.push(playlistId);
      }
    }

    playlists.forEach((playlist) => {
      const row = template.cloneNode(true);
      const title = row.querySelector('.add-to-playlist-title');
      const icon = row.querySelector('.add-to-playlist-icon');

      if (title) title.textContent = playlist.name;
      if (icon) icon.style.opacity = '0';

      row.dataset.playlistId = playlist.id;
      row.style.display = '';

      // ✅ AUTO-SELECT newly created playlist (one-time via separate key)
const autoSelectId = this._getLastCreatedPlaylistAutoSelectId?.();
if (autoSelectId && String(playlist.id) === String(autoSelectId)) {
  if (!this.selectedPlaylistIds.includes(playlist.id)) {
    this.selectedPlaylistIds.push(playlist.id);
  }
  if (icon) icon.style.opacity = '1';
}

      row.onmouseenter = () => {
        if (!this.selectedPlaylistIds.includes(playlist.id)) {
          const i = row.querySelector('.add-to-playlist-icon');
          if (i) i.style.opacity = '0.3';
        }
      };

      row.onmouseleave = () => {
        if (!this.selectedPlaylistIds.includes(playlist.id)) {
          const i = row.querySelector('.add-to-playlist-icon');
          if (i) i.style.opacity = '0';
        }
      };

     if (songInPlaylists.includes(playlist.id)) {
  if (!this.selectedPlaylistIds.includes(playlist.id)) {
    this.selectedPlaylistIds.push(playlist.id);
  }
  if (!this.originalPlaylistIds.includes(playlist.id)) {
    this.originalPlaylistIds.push(playlist.id);
  }
  if (icon) icon.style.opacity = '1';
}

      container.appendChild(row);
    });

    container.style.opacity = '1';
  },

  togglePlaylistSelection(row) {
    const playlistId = parseInt(row.dataset.playlistId);
    const icon = row.querySelector('.add-to-playlist-icon');

    const index = this.selectedPlaylistIds.indexOf(playlistId);

    if (index > -1) {
      this.selectedPlaylistIds.splice(index, 1);
      if (icon) icon.style.opacity = '0';
    } else {
      this.selectedPlaylistIds.push(playlistId);
      if (icon) icon.style.opacity = '1';
    }
  },

  async saveToSelectedPlaylists() {
    if (!this.currentSongForPlaylist) {
      this.closeAddToPlaylistModal();
      return;
    }

    try {
      // Add to newly selected playlists
      for (const playlistId of this.selectedPlaylistIds) {
        if (!this.originalPlaylistIds.includes(playlistId)) {
          const songs = await this.getPlaylistSongs(playlistId);
          await this.addSongToPlaylist(
            playlistId,
            this.currentSongForPlaylist,
            songs.length + 1
          );
        }
      }

      // Remove from deselected playlists
      for (const playlistId of this.originalPlaylistIds) {
        if (!this.selectedPlaylistIds.includes(playlistId)) {
          await this.removeSongFromPlaylist(playlistId, this.currentSongForPlaylist);
        }
      }

      const removedIds = this.originalPlaylistIds
        .map((id) => Number(id))
        .filter((id) => !this.selectedPlaylistIds.map((x) => Number(x)).includes(id));

      const newlyAddedIds = this.selectedPlaylistIds
        .map((id) => Number(id))
        .filter((id) => !this.originalPlaylistIds.map((x) => Number(x)).includes(id));

      const addedNames = (this.playlists || [])
        .filter((p) => newlyAddedIds.includes(Number(p.id)))
        .map((p) => p.name)
        .filter(Boolean);

      const removedNames = (this.playlists || [])
        .filter((p) => removedIds.includes(Number(p.id)))
        .map((p) => p.name)
        .filter(Boolean);

      const parts = [];

      if (removedIds.length > 0) {
        if (removedNames.length > 0) {
          parts.push(`Removed from "${removedNames.join(', ')}"`);
        } else {
          parts.push(
            `Removed from "${removedIds.length} playlist${removedIds.length > 1 ? 's' : ''}"`
          );
        }
      }

      if (newlyAddedIds.length > 0) {
        if (addedNames.length > 0) {
          parts.push(`Added to "${addedNames.join(', ')}"`);
        } else {
          parts.push(
            `Added to "${newlyAddedIds.length} playlist${newlyAddedIds.length > 1 ? 's' : ''}"`
          );
        }
      }

      if (parts.length > 0) {
        this.showNotification(parts.join(', '));
      }

      this.closeAddToPlaylistModal();
    } catch (error) {
      console.error('Error saving to playlists:', error);
      this.showNotification('Error updating playlists', 'error');
    }
  },

  /* ============================================================
     DROPDOWNS
     ============================================================ */

  setupAddToPlaylistDropdowns() {
    document.querySelectorAll('.add-to-playlist').forEach((dropdown) => {
      dropdown.addEventListener('mouseenter', () => this.populatePlaylistDropdown(dropdown));
    });
  },

  async populatePlaylistDropdown(dropdown) {
    if (!this.currentUserId) return;

    const lastPopulated = dropdown.dataset.lastPopulated;
    if (lastPopulated && Date.now() - parseInt(lastPopulated) < 30000) return;

    const playlists = await this.getUserPlaylists();
    const createNewBtn = dropdown.querySelector('.dd-create-new-playlist');

    dropdown
      .querySelectorAll('.playlist-dropdown-item, .playlist-dropdown-separator')
      .forEach((item) => item.remove());

    playlists.forEach((playlist) => {
      const item = document.createElement('div');
      item.className = 'playlist-dropdown-item';
      item.textContent = playlist.name;
      item.dataset.playlistId = playlist.id;
      item.style.cssText = 'padding:8px 16px;cursor:pointer;font-size:14px;';

      item.addEventListener('mouseenter', () => (item.style.background = '#f5f5f5'));
      item.addEventListener('mouseleave', () => (item.style.background = ''));

      if (createNewBtn) dropdown.insertBefore(item, createNewBtn);
      else dropdown.appendChild(item);
    });

    if (
      playlists.length > 0 &&
      createNewBtn &&
      !dropdown.querySelector('.playlist-dropdown-separator')
    ) {
      const sep = document.createElement('div');
      sep.className = 'playlist-dropdown-separator';
      sep.style.cssText = 'height:1px;background:#e0e0e0;margin:4px 0;';
      dropdown.insertBefore(sep, createNewBtn);
    }

    dropdown.dataset.lastPopulated = Date.now().toString();
  },

  async handleAddSongToPlaylist(dropdown, playlistId, playlistName) {
    const songWrapper = dropdown.closest('.song-wrapper');
    const songId = songWrapper?.dataset.songId || songWrapper?.dataset.airtableId;

    if (!songId) {
      this.showNotification('Error: Could not find song', 'error');
      return;
    }

    try {
      const songs = await this.getPlaylistSongs(playlistId);
      await this.addSongToPlaylist(playlistId, songId, songs.length + 1);
      this.showNotification(`Added to "${playlistName}"`);
      document.body.click();
    } catch (error) {
      this.showNotification('Error adding song', 'error');
    }
  },

  /* ============================================================
     NOTIFICATIONS
     ============================================================ */

  showNotification(message, type = 'success') {
    document.querySelectorAll('.playlist-notification').forEach((n) => n.remove());

    const notification = document.createElement('div');
    notification.className = 'playlist-notification';
    notification.textContent = message;

    notification.style.cssText = `
      position:fixed;
      bottom:100px;
      left:50%;
      transform:translateX(-50%);
      background:${type === 'error' ? '#dc3545' : '#333'};
      color:white;
      padding:12px 24px;
      border-radius:8px;
      z-index:10000;
      font-size:14px;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  },

  /* ============================================================
     PAGE FEATURES
     ============================================================ */

  setupPageSpecificFeatures() {
    if (isPlaylistsGridPage()) this.initPlaylistsPage();
    if (isPlaylistTemplatePage()) this.initPlaylistTemplatePage();
  },

  async initPlaylistsPage() {
    if (!this.currentUserId) return;
    await this.renderPlaylistsGrid();
  },

  async renderPlaylistsGrid() {
    const container = document.querySelector('.sortable-container');
    const template = container?.querySelector('.playlist-card-template.is-template');
    if (!container || !template) return;

   // ✅ Placeholders: show once, then only ever hide (never re-show)
if (!window.__fw_placeholders_initialized) {
  window.__fw_placeholders_initialized = true;

  // Make sure they are visible on first load
  document.querySelectorAll('.playlist-placeholder').forEach((el) => {
    el.style.display = '';
  });
}

// On any render call, DO NOT re-show placeholders.
// They will be hidden once real cards render successfully.

try {
  const playlists = (await this.getUserPlaylists()).slice().sort((a, b) => {
    // Sort by position first, then by created_at for items with same position
    if (a.position !== b.position) {
      return a.position - b.position;
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });

  // Clear existing cards except template
  container.querySelectorAll('.playlist-card-template').forEach((card, i) => {
    if (i > 0) card.remove();
  });

// ✅ Hide the template
template.style.display = 'none';

      // ✅ Pre-fetch counts in parallel (prevents sequential await lag)
      const playlistCounts = await Promise.all(
        playlists.map(async (p) => {
          try {
            const songs = await this.getPlaylistSongs(p.id);
            return { id: Number(p.id), count: songs.length };
          } catch {
            return { id: Number(p.id), count: 0 };
          }
        })
      );

      const countsById = new Map(playlistCounts.map((x) => [x.id, x.count]));

      // ✅ Build off-DOM, then append once
      const frag = document.createDocumentFragment();

      for (const playlist of playlists) {
        const card = template.cloneNode(true);
        card.classList.remove('is-template');

        const title = card.querySelector('.playlist-title');
        const detail = card.querySelector('.playlist-detail');
        const image = card.querySelector('.playlist-image');
        const link = card.querySelector('.playlist-link-block');

        if (title) title.textContent = playlist.name;
        if (detail) detail.textContent = playlist.description || '';

        if (image && playlist.cover_image_url) {
          clearResponsiveImageAttrs(image);
          image.src = playlist.cover_image_url;

          requestAnimationFrame(() => {
            clearResponsiveImageAttrs(image);
            image.src = playlist.cover_image_url;
          });
        }

        if (link) link.href = `/dashboard/playlist-template?playlist=${playlist.id}`;

        card.dataset.playlistId = playlist.id;

        const countEl = card.querySelector('.playlist-song-count');
        if (countEl) {
          const count = countsById.get(Number(playlist.id)) ?? 0;
          countEl.textContent = String(count);
        }

        card.style.removeProperty('display'); // removes inline display:none copied from template
card.style.display = 'block';         // force visible (use 'flex' if your card needs flex)
        frag.appendChild(card);
      }

      // ✅ Append everything at once
      container.appendChild(frag);

      console.log(`✅ Rendered ${playlists.length} playlist cards`);

      reinitWebflowIX2();

      if (typeof initializePlaylistOverlay === 'function') {
        initializePlaylistOverlay();
      }
    } finally {

// Hide all placeholders once real cards exist
document.querySelectorAll('.playlist-placeholder').forEach((el) => {
  el.style.display = 'none';
});
      
      // ✅ Reveal + return container to normal sizing
      container.style.opacity = '1';
      container.style.pointerEvents = '';
    }
  },

  async initPlaylistTemplatePage() {
    const urlParams = new URLSearchParams(window.location.search);
    const playlistId = urlParams.get('playlist');
    if (!playlistId) return;

    this.currentPlaylistId = playlistId;

    const playlist = await this.getPlaylistById(playlistId);
    if (playlist) {
      const header = document.querySelector('.playlist-template-title');
      if (header) header.textContent = playlist.name;
    }

    await this.renderPlaylistSongs(playlistId);
  },

  async renderPlaylistSongs(playlistId) {
    const container = document.querySelector('.playlist-songs-wrapper');
    if (!container) return;

    const g = window.musicPlayerPersistent;
    if (g.MASTER_DATA.length === 0) await fetchSongs();

    const templateWrapper = container.querySelector('.template-wrapper');
    const templateCard =
      templateWrapper?.querySelector('.song-wrapper') || container.querySelector('.song-wrapper');

    if (!templateCard) return;

    const playlistSongs = await this.getPlaylistSongs(playlistId);

    container.innerHTML = '';
    if (templateWrapper) container.appendChild(templateWrapper);

    if (playlistSongs.length === 0) {
      if (templateWrapper) templateWrapper.style.display = 'none';
      updateEmptyPlaylistMessage(container);
      return;
    }

    playlistSongs.sort((a, b) => a.position - b.position);

    playlistSongs.forEach((ps) => {
      const song = g.MASTER_DATA.find((s) => s.id === ps.song_id);
      if (!song) return;

      const card = templateCard.cloneNode(true);
      card.style.opacity = '1';
      card.style.pointerEvents = 'auto';

      populateSongCard(card, song);

      // NOTE: leaving your existing dataset assignments as-is (no behavior change)
      card.dataset.songId = ps.id;

      const removeBtn = card.querySelector('.dd-remove-from-playlist');
      if (removeBtn) removeBtn.dataset.songId = song.id;

      // ✅ IMPORTANT: ensure playlist cards carry the playlist song_id (NOT airtable id)
      card.dataset.songId = String(ps.song_id);

      card.dataset.playlistPosition = ps.position;
      container.appendChild(card);
    });

    if (window.Webflow?.require) reinitWebflowIX2();

    setTimeout(() => {
      const cards = container.querySelectorAll(
        '.song-wrapper:not(.template-wrapper .song-wrapper)'
      );

      if (cards.length > 0) loadWaveformBatch(Array.from(cards));

      cards.forEach((card) => {
        const removeBtn = card.querySelector('.dd-remove-from-playlist');
        if (removeBtn) removeBtn.style.display = 'flex';
      });
    }, 100);
  },
};

/* ============================================================
   GLOBAL ONE-TIME LISTENERS
   ============================================================ */

document.addEventListener(
  'click',
  (e) => {
    const list = e.target.closest('.options-dropdown-list');
    if (!list) return;

    // Find the Webflow dropdown root (usually has .w-dropdown)
    const dropdownRoot =
      list.closest('.w-dropdown') ||
      list.closest('.options-dropdown');

    if (!dropdownRoot) return;

    // Let the clicked item’s handler run first, then close the dropdown
    setTimeout(() => {
      dropdownRoot.classList.remove('w--open');

      const toggle = dropdownRoot.querySelector('.w-dropdown-toggle, .options-dropdown-toggle');
      const wfList = dropdownRoot.querySelector('.w-dropdown-list, .options-dropdown-list');

      if (toggle) toggle.classList.remove('w--open');
      if (wfList) {
        wfList.classList.remove('w--open');
        // ✅ IMPORTANT: clear any inline display we might have accidentally set earlier
        wfList.style.display = '';
      }
    }, 0);
  },
  true // capture phase
);

/* ============================================================
   EXPORT
   ============================================================ */

window.PlaylistManager = PlaylistManager;
console.log('🎵 Playlist System loaded');

/* ============================================================
   31. DASHBOARD TILES
   ============================================================ */

async function initDashboardTiles() {
  const tiles = document.querySelectorAll('.masonry-song-tile-wrapper');
  console.log(`🔍 Found ${tiles.length} dashboard tiles`);
  
  if (tiles.length === 0) {
    console.log('ℹ️ No dashboard tiles found');
    return;
  }

  // Check if tiles already have data
  const firstTile = tiles[0];
  if (firstTile && firstTile.dataset.songId) {
    console.log('♻️ Dashboard tiles already initialized, skipping');
    return;
  }

  const g = window.musicPlayerPersistent;
  
  // Ensure songs are loaded
  if (g.MASTER_DATA.length === 0) {
    await fetchSongs();
  }

  console.log(`📊 Total songs in MASTER_DATA: ${g.MASTER_DATA.length}`);

  // Use cached random selection if available, otherwise create new one
  if (!g.dashboardTileSongs || g.dashboardTileSongs.length === 0) {
    const shuffled = [...g.MASTER_DATA].sort(() => Math.random() - 0.5);
    g.dashboardTileSongs = shuffled.slice(0, 6);
    console.log('🎲 Generated new random tile selection');
  } else {
    console.log('♻️ Using cached tile selection');
  }

  const songs = g.dashboardTileSongs;

  tiles.forEach((tile, index) => {
    if (index >= songs.length) return;
    
    const song = songs[index];
    const fields = song.fields;
    
    console.log(`🎵 Tile ${index}: ${fields['Song Title']}`);
    
    // Set the background tile image
    const tileImage = tile.querySelector('.db-tile-image');
    if (tileImage && fields['Cover Art']) {
      tileImage.src = fields['Cover Art'][0].url;
      tileImage.alt = fields['Song Title'] || 'Album art';
      console.log(`   ✅ Set tile image`);
    }
    
    // Set the small cover art image
    const coverArt = tile.querySelector('.db-player-song-cover');
    if (coverArt && fields['Cover Art']) {
      coverArt.src = fields['Cover Art'][0].url;
      coverArt.alt = fields['Song Title'] || 'Album art';
      console.log(`   ✅ Set cover art image`);
    }

    // Set song info
    const songName = tile.querySelector('.db-player-song-name');
    const artistName = tile.querySelector('.db-artist-name');
    if (songName) songName.textContent = fields['Song Title'] || 'Unknown';
    if (artistName) artistName.textContent = fields['Artist'] || 'Unknown';

    // Store song data
    tile.dataset.songId = song.id;

    // Setup waveform container
    const waveformContainer = tile.querySelector('.db-waveform');
    if (waveformContainer && fields['R2 Audio URL']) {
      waveformContainer.innerHTML = '';
      waveformContainer.dataset.songId = song.id;
      
      // Initialize waveform
      const wavesurfer = WaveSurfer.create({
        container: waveformContainer,
        waveColor: '#808080',
        progressColor: '#ffffff',
        cursorColor: 'transparent',
        barWidth: 1.5,
        barGap: 1.5,
        barRadius: 2,
        height: waveformContainer.offsetHeight || 60,
        normalize: true,
        backend: 'WebAudio',
        interact: true
      });

      const peaksData = fields['Peaks'] ? JSON.parse(fields['Peaks']) : null;
      
      if (peaksData && Array.isArray(peaksData)) {
        wavesurfer.load(fields['R2 Audio URL'], peaksData);
      } else {
        wavesurfer.load(fields['R2 Audio URL']);
      }

      g.allWavesurfers.push(wavesurfer);
      
      g.waveformData.push({
        wavesurfer: wavesurfer,
        songId: song.id,
        cardElement: tile,
        audioUrl: fields['R2 Audio URL'],
        songData: song
      });

      // Waveform click to play/seek
      waveformContainer.style.cursor = 'pointer';
      waveformContainer.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Calculate click position for seeking
        const bounds = waveformContainer.getBoundingClientRect();
        const x = e.clientX - bounds.left;
        const progress = x / bounds.width;
        
        console.log('🎵 Waveform clicked for:', fields['Song Title'], 'at position:', progress);
        
        const isCurrentSong = g.currentSongData?.id === song.id;
        const isAnyPlaying = g.standaloneAudio && !g.standaloneAudio.paused;
        
        // If NO song is playing anywhere - just seek without playing
        if (!isAnyPlaying) {
          console.log('   No song playing - seeking without autoplay');
          
          if (wavesurfer.getDuration() > 0) {
            wavesurfer.seekTo(progress);
          } else {
            wavesurfer.once('ready', () => {
              wavesurfer.seekTo(progress);
            });
          }
          
          // Load the song but don't play
          if (!isCurrentSong) {
            const seekTime = progress * (wavesurfer.getDuration() || 0);
            playStandaloneSong(fields['R2 Audio URL'], song, wavesurfer, tile, seekTime, false);
          }
        }
        // If a song IS playing somewhere
        else {
          // If clicking on the currently playing song - just seek
          if (isCurrentSong) {
            console.log('   Seeking within currently playing song');
            const seekTime = progress * g.standaloneAudio.duration;
            g.standaloneAudio.currentTime = seekTime;
            wavesurfer.seekTo(progress);
          }
          // If clicking on a different song - pause old, play new from position
          else {
            console.log('   Switching to new song and playing from position');
            if (g.standaloneAudio) {
              g.standaloneAudio.pause();
            }
            
            if (wavesurfer.getDuration() > 0) {
              const seekTime = progress * wavesurfer.getDuration();
              playStandaloneSong(fields['R2 Audio URL'], song, wavesurfer, tile, seekTime, true);
            } else {
              wavesurfer.once('ready', () => {
                const seekTime = progress * wavesurfer.getDuration();
                playStandaloneSong(fields['R2 Audio URL'], song, wavesurfer, tile, seekTime, true);
              });
            }
          }
        }
      });
    }

    // Setup play button
    const playIcon = tile.querySelector('.db-play-icon');
    const pauseIcon = tile.querySelector('.db-pause-icon');
    const playContainer = tile.querySelector('.db-play-container');
    const playButton = tile.querySelector('.db-player-play-button');
    
    // Set initial icon state
    if (playIcon) playIcon.style.display = 'block';
    if (pauseIcon) pauseIcon.style.display = 'none';
    
    // Add click handlers to all play elements
    [playIcon, pauseIcon, playContainer, playButton].forEach(element => {
      if (element) {
        element.style.cursor = 'pointer';
        element.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const wsData = g.waveformData.find(w => w.songId === song.id);
          
          // If currently playing this song, pause it
          if (g.currentSongData?.id === song.id && g.standaloneAudio && !g.standaloneAudio.paused) {
            g.standaloneAudio.pause();
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
          } else if (g.currentSongData?.id === song.id && g.standaloneAudio && g.standaloneAudio.paused) {
            // Resume if paused
            g.standaloneAudio.play();
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
          } else if (wsData) {
            // Play new song
            playStandaloneSong(fields['R2 Audio URL'], song, wsData.wavesurfer, tile);
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
          }
        });
      }
    });

    // Song name click to play
    if (songName) {
      songName.style.cursor = 'pointer';
      songName.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const wsData = g.waveformData.find(w => w.songId === song.id);
        
        if (wsData) {
          playStandaloneSong(fields['R2 Audio URL'], song, wsData.wavesurfer, tile);
        }
      });
    }
  });

  // Listen for play/pause events to update icons
  document.addEventListener('audioStateChange', (e) => {
    const { songId, isPlaying } = e.detail;
    
    tiles.forEach(tile => {
      if (tile.dataset.songId === songId) {
        const playIcon = tile.querySelector('.db-play-icon');
        const pauseIcon = tile.querySelector('.db-pause-icon');
        
        if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
        if (pauseIcon) pauseIcon.style.display = isPlaying ? 'block' : 'none';
      } else {
        // Reset other tiles to play icon
        const playIcon = tile.querySelector('.db-play-icon');
        const pauseIcon = tile.querySelector('.db-pause-icon');
        
        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
      }
    });
  });

  console.log(`✅ Dashboard tiles initialized (${tiles.length} tiles)`);
}

/* ============================================================
   32. DASHBOARD PLAYLISTS
   ============================================================ */

async function initDashboardPlaylists() {
  const container = document.querySelector('.db-sortable-container');
  if (!container) {
    console.log('ℹ️ No dashboard playlists container found');
    return;
  }

  // Check if playlists are already rendered
  const existingCards = container.querySelectorAll('.playlist-card-template:not(.is-template)');
  if (existingCards.length > 0) {
    console.log('♻️ Dashboard playlists already rendered, skipping');
    return;
  }

  const template = container.querySelector('.playlist-card-template');
  if (!template) {
    console.log('❌ No playlist template found');
    return;
  }

  console.log('🎵 Initializing dashboard playlists...');

  // Remove template from DOM temporarily
  const templateParent = template.parentNode;
  const templateNextSibling = template.nextSibling;
  template.remove();

  // Show placeholders while loading
  container.querySelectorAll('.playlist-placeholder').forEach((el) => {
    el.style.display = '';
  });

  try {
    const allPlaylists = await PlaylistManager.getUserPlaylists();
    console.log('📊 Total playlists:', allPlaylists.length);
    
    const playlists = allPlaylists.sort((a, b) => {
      if (a.position !== b.position) {
        return a.position - b.position;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    }).slice(0, 4);

    console.log('📊 Showing first 4 playlists');

    // Clear existing cards
    container.querySelectorAll('.playlist-card-template').forEach((card) => {
      card.remove();
    });

    // Pre-fetch counts in parallel
    const playlistCounts = await Promise.all(
      playlists.map(async (p) => {
        try {
          const songs = await PlaylistManager.getPlaylistSongs(p.id);
          return { id: Number(p.id), count: songs.length };
        } catch {
          return { id: Number(p.id), count: 0 };
        }
      })
    );

    const countsById = new Map(playlistCounts.map((x) => [x.id, x.count]));

    // Build off-DOM, then append once
    const frag = document.createDocumentFragment();

    for (const playlist of playlists) {
      const card = template.cloneNode(true);
      card.classList.remove('is-template');

      const title = card.querySelector('.playlist-title');
      const detail = card.querySelector('.playlist-detail');
      const image = card.querySelector('.playlist-image');
      const link = card.querySelector('.playlist-link-block');

      if (title) title.textContent = playlist.name;
      if (detail) detail.textContent = playlist.description || '';

      if (image && playlist.cover_image_url) {
        clearResponsiveImageAttrs(image);
        image.src = playlist.cover_image_url;

        requestAnimationFrame(() => {
          clearResponsiveImageAttrs(image);
          image.src = playlist.cover_image_url;
        });
      }

      if (link) link.href = `/dashboard/playlist-template?playlist=${playlist.id}`;

      card.dataset.playlistId = playlist.id;

      const countEl = card.querySelector('.playlist-song-count');
      if (countEl) {
        const count = countsById.get(Number(playlist.id)) ?? 0;
        countEl.textContent = String(count);
      }

      card.style.removeProperty('display');
      card.style.display = 'block';
      frag.appendChild(card);
    }

    // Append everything at once
    container.appendChild(frag);

    console.log(`✅ Rendered ${playlists.length} dashboard playlist cards`);

    if (window.Webflow?.require) {
      try {
        const ix2 = window.Webflow.require('ix2');
        if (ix2 && ix2.init) ix2.init();
      } catch (e) {}
    }
  } finally {
    // Hide all placeholders once real cards exist
    container.querySelectorAll('.playlist-placeholder').forEach((el) => {
      el.style.display = 'none';
    });

    container.style.opacity = '1';
    container.style.pointerEvents = '';
  }
}
