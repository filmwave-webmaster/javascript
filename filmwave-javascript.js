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
  
  // REUSE the same audio element
  if (g.standaloneAudio) {
    g.standaloneAudio.pause();
    g.standaloneAudio.src = audioUrl;
    g.standaloneAudio.load();
    g.standaloneAudio.play().catch(err => console.error('Playback error:', err));
  } else {
    const audio = new Audio(audioUrl);
    g.standaloneAudio = audio;
    
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
    
    audio.play().catch(err => console.error('Playback error:', err));
  }
  
  g.isPlaying = true;
  updateMasterControllerIcons(true);
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
  
  const isMusicPage = !!document.querySelector('.music-list-wrapper');
  const shouldShow = g.hasActiveSong || g.currentSongData || g.standaloneAudio || g.currentWavesurfer;
  
  if (shouldShow) {
    if (isMusicPage) {
      playerWrapper.style.position = 'relative';
      playerWrapper.style.bottom = 'auto';
      playerWrapper.style.left = 'auto';
      playerWrapper.style.right = 'auto';
    } else {
      playerWrapper.style.position = 'fixed';
      playerWrapper.style.bottom = '0px';
      playerWrapper.style.left = '0px';
      playerWrapper.style.right = '0px';
    }
    
    playerWrapper.style.display = 'flex';
    playerWrapper.style.visibility = 'visible';
    playerWrapper.style.opacity = '1';
    playerWrapper.style.alignItems = 'center';
    playerWrapper.style.pointerEvents = 'auto';
    playerWrapper.style.width = '100%';
    playerWrapper.style.zIndex = '9999';
  } else {
    playerWrapper.style.display = 'none';
    playerWrapper.style.visibility = 'hidden';
    playerWrapper.style.opacity = '0';
  }
  
  console.log('👁️ updateMasterPlayerVisibility - shouldShow:', shouldShow, 'isMusicPage:', isMusicPage);
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
      // This shouldn't happen, but just in case
      g.currentWavesurfer.playPause();
    }
  };
  
  if (masterPlayButton) masterPlayButton.onclick = handlePlayPause;
  if (controllerPlay) controllerPlay.onclick = handlePlayPause;
  if (controllerPause) controllerPause.onclick = handlePlayPause;
  
  const navigateTrack = (direction) => {
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
        const wasPlaying = g.isPlaying;
        const prevData = g.waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
        if (prevData?.cardElement.querySelector('.play-button')) {
          prevData.cardElement.querySelector('.play-button').style.opacity = '0';
        }
        
        if (g.standaloneAudio) {
          g.standaloneAudio.pause();
        }
        
        g.currentWavesurfer.seekTo(0);
        const nextData = g.waveformData.find(data => data.wavesurfer === targetWS);
        
        if (nextData?.cardElement.querySelector('.play-button')) {
          nextData.cardElement.querySelector('.play-button').style.opacity = '1';
        }
        scrollToSelected(nextData.cardElement);
        
        if (wasPlaying) {
          playStandaloneSong(nextData.audioUrl, nextData.songData, targetWS, nextData.cardElement);
        } else {
          g.currentWavesurfer = targetWS;
          g.currentSongData = nextData.songData;
          syncMasterTrack(targetWS, nextData.songData, 0);
        }
      }
    } else {
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
  
  console.log('🔗 Linking existing standalone audio to waveform');
  
  const matchingData = g.waveformData.find(data => data.songData.id === g.currentSongData.id);
  
  if (matchingData) {
    const { wavesurfer, cardElement } = matchingData;
    
    g.currentWavesurfer = wavesurfer;
    
    // Update UI to show this song is playing
    updatePlayPauseIcons(cardElement, g.isPlaying);
    const playButton = cardElement.querySelector('.play-button');
    if (playButton) playButton.style.opacity = '1';
    
    // Sync waveform to current standalone audio position
    if (g.standaloneAudio.duration > 0) {
      const progress = g.standaloneAudio.currentTime / g.standaloneAudio.duration;
      wavesurfer.seekTo(progress);
    }
    
    // Set up continuous syncing from standalone audio to waveform
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
    
    console.log('✅ Linked standalone audio to waveform with continuous sync');
  }
}

/**
 * ============================================================
 * CREATE STANDALONE AUDIO FOR SONG
 * ============================================================
 */
function createStandaloneAudio(audioUrl, songData, wavesurfer, cardElement, seekToTime = null, shouldAutoPlay = true) {
  const g = window.musicPlayerPersistent;
  
  console.log('🎵 Creating standalone audio for:', songData.fields['Song Title']);
  if (seekToTime !== null) {
    console.log('📍 Will seek to:', seekToTime, 'seconds after load');
  }
  
  const audio = new Audio(audioUrl);
  g.standaloneAudio = audio;
  g.currentSongData = songData;
  g.currentWavesurfer = wavesurfer;
  g.hasActiveSong = true;
  
  audio.addEventListener('loadedmetadata', () => {
    g.currentDuration = audio.duration;
    console.log('📊 Audio loaded, duration:', g.currentDuration);
    
    // Seek to the desired position if specified
    if (seekToTime !== null && seekToTime < audio.duration) {
      console.log('⏩ Seeking to requested position:', seekToTime);
      audio.currentTime = seekToTime;
    }
  });
  
  audio.addEventListener('timeupdate', () => {
    g.currentTime = audio.currentTime;
    
    // Sync WaveSurfer to standalone audio
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
    const playButton = cardElement.querySelector('.play-button');
    if (playButton) playButton.style.opacity = '1';
    console.log('▶️ Standalone audio playing');
  });
  
  audio.addEventListener('pause', () => {
    g.isPlaying = false;
    updatePlayPauseIcons(cardElement, false);
    updateMasterControllerIcons(false);
    console.log('⏸️ Standalone audio paused');
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
    }
  });
  
  audio.addEventListener('error', (e) => {
    console.error('❌ Audio error:', e);
  });
  
  audio.src = audioUrl;
  audio.load();
  
  // Only auto-play if shouldAutoPlay is true
  if (shouldAutoPlay) {
    audio.play().catch(err => console.error('Playback error:', err));
  } else {
    console.log('⏸️ Song loaded but paused - ready for spacebar play');
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
  
  console.log('🎵 Play standalone song:', songData.fields['Song Title']);
  
  // If already playing this exact song, just resume
  if (g.standaloneAudio && g.currentSongData?.id === songData.id) {
    console.log('▶️ Resuming same song');
    if (shouldAutoPlay) {
      g.standaloneAudio.play().catch(err => console.error('Playback error:', err));
    }
    return;
  }
  
  // Stop current audio if playing different song
  if (g.standaloneAudio && g.currentSongData?.id !== songData.id) {
    console.log('🛑 Stopping previous song');
    g.standaloneAudio.pause();
    g.standaloneAudio = null;
  }
  
  // Reset all other wavesurfers visually
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
  
  // Create new audio for different song (with optional seek position and auto-play control)
  createStandaloneAudio(audioUrl, songData, wavesurfer, cardElement, seekToTime, shouldAutoPlay);
}

/**
 * ============================================================
 * INITIALIZE WAVEFORMS
 * ============================================================
 */
function initializeWaveforms() {
  const g = window.musicPlayerPersistent;
  const songCards = document.querySelectorAll('.song-wrapper');
  
  console.log('🎨 Total song cards found:', songCards.length);
  
  songCards.forEach((cardElement, index) => {
    // Skip if this is the template card (multiple checks)
    const isInTemplate = cardElement.closest('.template-wrapper');
    const hasNoData = !cardElement.dataset.audioUrl || !cardElement.dataset.songId;
    
    if (isInTemplate || hasNoData) {
      console.log(`⏭️ Skipping card ${index} - isInTemplate:`, !!isInTemplate, 'hasNoData:', hasNoData);
      return;
    }
    
    const audioUrl = cardElement.dataset.audioUrl;
    const songId = cardElement.dataset.songId;
    const songData = JSON.parse(cardElement.dataset.songData || '{}');
    
    console.log(`✅ Initializing waveform ${index} for:`, songData.fields['Song Title'], 'songId:', songId);
    
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
    
    g.allWavesurfers.push(wavesurfer);
    g.waveformData.push({
      wavesurfer,
      cardElement,
      waveformContainer,
      audioUrl,
      songData  // Store the song data here
    });
    
    // WRAP IN IIFE TO CREATE PROPER CLOSURE
    setupWaveformHandlers(wavesurfer, audioUrl, songData, cardElement, coverArtWrapper, songName);
  });
  
  console.log('📊 Total waveforms created:', g.allWavesurfers.length);
  
  // Link existing standalone audio to waveforms
  setTimeout(() => {
    linkStandaloneToWaveform();
  }, 100);
}

/**
 * Setup event handlers with proper closure
 */
function setupWaveformHandlers(wavesurfer, audioUrl, songData, cardElement, coverArtWrapper, songName) {
  const g = window.musicPlayerPersistent;
  
  // MANUAL PLAY/PAUSE - Don't use wavesurfer play event
  const handlePlayPause = (e) => {
    if (e && e.target.closest('.w-dropdown-toggle, .w-dropdown-list')) return;
    if (e) e.stopPropagation();
    
    if (g.currentWavesurfer && g.currentWavesurfer !== wavesurfer) {
      // Switch to this song
      const wasPlaying = g.isPlaying;
      
      if (g.standaloneAudio) {
        g.standaloneAudio.pause();
      }
      
      g.currentWavesurfer.seekTo(0);
      
      if (wasPlaying) {
        playStandaloneSong(audioUrl, songData, wavesurfer, cardElement);
      } else {
        g.currentWavesurfer = wavesurfer;
        g.currentSongData = songData;
        g.hasActiveSong = true;
        syncMasterTrack(wavesurfer, songData, 0);
      }
    } else {
      // Toggle play/pause on current song
      if (g.standaloneAudio && g.currentSongData?.id === songData.id) {
        if (g.standaloneAudio.paused) {
          g.standaloneAudio.play();
        } else {
          g.standaloneAudio.pause();
        }
      } else {
        playStandaloneSong(audioUrl, songData, wavesurfer, cardElement);
      }
    }
  };
  
  // Click handlers
  if (coverArtWrapper) {
    coverArtWrapper.style.cursor = 'pointer';
    coverArtWrapper.addEventListener('click', handlePlayPause);
  }
  
  if (songName) {
    songName.style.cursor = 'pointer';
    songName.addEventListener('click', handlePlayPause);
  }
  
// Waveform interaction (seeking)
wavesurfer.on('interaction', function (newProgress) {
  console.log('🎯 Waveform interaction');
  console.log('  - Clicked songId:', songData.id);
  console.log('  - Clicked songTitle:', songData.fields['Song Title']);
  console.log('  - Current songId:', g.currentSongData?.id);
  console.log('  - Current songTitle:', g.currentSongData?.fields['Song Title']);
  console.log('  - Are they equal?', g.currentSongData?.id === songData.id);
  console.log('  - Click position (seconds):', newProgress);
  
  // ALWAYS check song ID first, not wavesurfer reference
  if (g.currentSongData?.id === songData.id) {
    // This is the current song - just seek
    if (g.standaloneAudio) {
      console.log('⏩ Seeking current song to:', newProgress, 'seconds');
      g.standaloneAudio.currentTime = newProgress;
    } else {
      console.log('⚠️ No standalone audio to seek!');
    }
    return; // Don't do anything else
  }
  
  // Different song - switch to it
  console.log('🔄 Switching songs');
  const wasPlaying = g.isPlaying;
  
  // Stop current audio
  if (g.standaloneAudio) {
    g.standaloneAudio.pause();
    g.standaloneAudio = null;
  }
  
  // Reset previous waveform
  if (g.currentWavesurfer) {
    g.currentWavesurfer.seekTo(0);
  }
  
  // Update wavesurfer reference (but NOT song data yet)
  g.currentWavesurfer = wavesurfer;
  g.hasActiveSong = true;
  
  // ALWAYS delegate to playStandaloneSong
  // It will handle creating audio, seeking, and auto-play based on wasPlaying
  playStandaloneSong(audioUrl, songData, wavesurfer, cardElement, newProgress, wasPlaying);
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
  const wasPlaying = g.isPlaying;
  const prevData = g.waveformData.find(data => data.wavesurfer === g.currentWavesurfer);
  if (prevData?.cardElement.querySelector('.play-button')) {
    prevData.cardElement.querySelector('.play-button').style.opacity = '0';
  }
  
  if (g.standaloneAudio) {
    g.standaloneAudio.pause();
    g.standaloneAudio = null; // Clear it
  }
  
  g.currentWavesurfer.seekTo(0);
  g.currentWavesurfer = nextWS;
  const nextD = g.waveformData.find(wf => wf.wavesurfer === nextWS);
  if (nextD?.cardElement.querySelector('.play-button')) {
    nextD.cardElement.querySelector('.play-button').style.opacity = '1';
  }
  scrollToSelected(nextD.cardElement);
  
  // ALWAYS create standalone audio (whether playing or paused)
  // Pass seekToTime as null (start from beginning) and wasPlaying flag
  playStandaloneSong(nextD.audioUrl, nextD.songData, nextWS, nextD.cardElement, null, wasPlaying);
}
    } else {
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
  
  if (g.MASTER_DATA.length === 0) {
    await fetchSongs();
  }
  
  if (!isMusicPage && g.currentSongData) {
    console.log('🎵 Skipping updateMasterPlayerVisibility - have song data, will handle in after hook');
  } else {
    updateMasterPlayerVisibility();
  }
  
  if (g.hasActiveSong && g.currentSongData) {
    updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
    updateMasterControllerIcons(g.isPlaying);
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
    initFilterAccordions();
    initCheckboxTextColor();
    initFilterItemBackground();
    initDynamicTagging();
    initMutualExclusion();
    initSearchAndFilters();
    const songs = await fetchSongs();
    displaySongs(songs);
    initMasterPlayer();
    
    // Ensure player is visible if there's active audio
    if (g.hasActiveSong || g.currentSongData) {
      setTimeout(() => {
        const playerWrapper = document.querySelector('.music-player-wrapper');
        if (playerWrapper && (g.hasActiveSong || g.currentSongData)) {
          playerWrapper.style.position = 'relative';
          playerWrapper.style.bottom = 'auto';
          playerWrapper.style.left = 'auto';
          playerWrapper.style.right = 'auto';
          playerWrapper.style.display = 'flex';
          playerWrapper.style.visibility = 'visible';
          playerWrapper.style.opacity = '1';
          playerWrapper.style.alignItems = 'center';
          playerWrapper.style.width = '100%';
          updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
        }
      }, 100);
    }
  } else {
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
  setTimeout(() => {
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
  setTimeout(() => {
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
            
            const tag = createTag(radio, labelText, radioName);
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
    if (searchBar) searchBar.value = '';
    
    const tagRemoveButtons = document.querySelectorAll('.filter-tag-remove');
    if (tagRemoveButtons.length > 0) {
      tagRemoveButtons.forEach(btn => btn.click());
    } else {
      document.querySelectorAll('[data-filter-group]').forEach(input => {
        input.checked = false;
        const wrapper = input.closest('.w-checkbox, .w-radio, .checkbox-single-select-wrapper, .radio-wrapper');
        if (wrapper) wrapper.classList.remove('is-active');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    
    toggleClearButton();
    applyFilters();
  }
  
  function applyFilters() {
    const query = searchBar ? searchBar.value.toLowerCase().trim() : '';
    const keywords = query.split(/\s+/).filter(k => k.length > 0);
    const filters = Array.from(document.querySelectorAll('[data-filter-group]'))
      .filter(i => i.checked)
      .map(i => ({ 
        group: i.getAttribute('data-filter-group'), 
        value: i.getAttribute('data-filter-value').toLowerCase() 
      }));
    
    const ids = g.MASTER_DATA.filter(record => {
      const text = Object.values(record.fields).join(' ').toLowerCase();
      const matchesSearch = keywords.every(k => text.includes(k));
      const matchesFilters = filters.every(f => {
        let v = record.fields[f.group];
        return Array.isArray(v) 
          ? v.some(val => String(val).toLowerCase() === f.value) 
          : String(v).toLowerCase() === f.value;
      });
      return matchesSearch && matchesFilters;
    }).map(r => r.id);
    
    document.querySelectorAll('.song-wrapper').forEach(card => {
      card.style.display = ids.includes(card.dataset.songId) ? 'flex' : 'none';
    });
    
    toggleClearButton();
  }
  
  if (searchBar) {
    searchBar.addEventListener('input', () => { 
      clearTimeout(searchTimeout); 
      searchTimeout = setTimeout(applyFilters, 400); 
    });
  }
  
  document.querySelectorAll('[data-filter-group]').forEach(i => {
    i.addEventListener('change', applyFilters);
  });
  
  if (clearBtn) {
    clearBtn.style.display = 'none';
    clearBtn.addEventListener('click', clearAllFilters);
  }
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
        
        if (isMusicPage) {
          // Just destroy the visual waveforms - standalone audio keeps playing!
          console.log('🗑️ Destroying waveforms (audio continues playing)');
          
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
        
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.body.style.height = '';
        return Promise.resolve();
      },

      beforeEnter(data) {
        const nextContainer = data.next.container;
        const isMusicPage = !!nextContainer.querySelector('.music-list-wrapper');

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
          console.log('🎮 Setting up master player controls');
          setupMasterPlayerControls();
          
          // Standalone audio already exists and is still playing!
          // Just need to ensure player is visible
          const ensurePlayerVisible = () => {
            const playerWrapper = document.querySelector('.music-player-wrapper');
            
            if (playerWrapper && (g.hasActiveSong || g.standaloneAudio || g.currentSongData)) {
              console.log('🎯 Ensuring player visible');
              
              const isMusicPage = !!document.querySelector('.music-list-wrapper');
              
              if (isMusicPage) {
                playerWrapper.style.position = 'relative';
                playerWrapper.style.bottom = 'auto';
                playerWrapper.style.left = 'auto';
                playerWrapper.style.right = 'auto';
              } else {
                playerWrapper.style.position = 'fixed';
                playerWrapper.style.bottom = '0px';
                playerWrapper.style.left = '0px';
                playerWrapper.style.right = '0px';
              }
              
              playerWrapper.style.display = 'flex';
              playerWrapper.style.visibility = 'visible';
              playerWrapper.style.opacity = '1';
              playerWrapper.style.alignItems = 'center';
              playerWrapper.style.pointerEvents = 'auto';
              playerWrapper.style.width = '100%';
              playerWrapper.style.zIndex = '9999';
              
              if (g.currentSongData) {
                updateMasterPlayerInfo(g.currentSongData, g.currentWavesurfer);
                updateMasterControllerIcons(g.isPlaying);
              }
            } else if (g.currentSongData) {
              console.log('⏳ Player wrapper not found, retrying...');
              setTimeout(ensurePlayerVisible, 100);
            }
          };
          
          ensurePlayerVisible();
          
          window.dispatchEvent(new Event('scroll'));
          window.dispatchEvent(new Event('resize'));
          window.dispatchEvent(new CustomEvent('barbaAfterTransition'));
          
          console.log('✅ Transition complete - Controls ready');
        }, 200);
      }
    }]
  });
}
