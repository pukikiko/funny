// app.js

document.addEventListener('DOMContentLoaded', () => {
    const feed = document.getElementById('video-feed');
    if (!feed) return; // Not on the index page

    let isFetching = false;

    // ---- Watch History (localStorage) ----
    const STORAGE_KEY = 'funny_watched';
    const MAX_HISTORY = 500; // Cap stored IDs to avoid bloating localStorage

    function getWatchedIds() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function markWatched(videoId) {
        const watched = getWatchedIds();
        if (!watched.includes(videoId)) {
            watched.push(videoId);
            // Trim oldest entries if we exceed the cap
            if (watched.length > MAX_HISTORY) {
                watched.splice(0, watched.length - MAX_HISTORY);
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(watched));
        }
    }

    // ---- Feed mode (localStorage) ----
    const MODE_KEY = 'funny_mode';
    const MODES = ['algorithm', 'random'];

    // SVGs parsed once into detached DOM nodes; we clone on each insert
    // so we never touch innerHTML with these strings.
    function parseSvg(s) {
        return new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;
    }
    const MODE_ICONS = {
        // algorithm: sparkles / "smart"
        algorithm: parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/></svg>'),
        // random: shuffle arrows
        random: parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>'),
    };
    const MODE_LABELS = {
        algorithm: 'PipeAI Algorithm',
        random: 'Randomised',
    };

    function getMode() {
        const m = localStorage.getItem(MODE_KEY);
        return MODES.includes(m) ? m : 'algorithm';
    }

    function cycleMode() {
        const i = MODES.indexOf(getMode());
        const next = MODES[(i + 1) % MODES.length];
        localStorage.setItem(MODE_KEY, next);
        refreshModeButtons();

        // On touch devices, briefly flash the new mode's label so users
        // know what they just switched to (no hover state to fall back on)
        if (!window.matchMedia('(hover: hover)').matches) {
            document.querySelectorAll('.mode-control').forEach(el => {
                el.classList.add('show-label');
                clearTimeout(el._labelTimer);
                el._labelTimer = setTimeout(() => el.classList.remove('show-label'), 1500);
            });
        }
    }

    function refreshModeButtons() {
        const mode = getMode();
        const label = MODE_LABELS[mode];
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.replaceChildren(MODE_ICONS[mode].cloneNode(true));
            btn.title = `Mode: ${label} (click to change)`;
            btn.setAttribute('aria-label', `Feed mode: ${label}`);
        });
        document.querySelectorAll('.mode-label').forEach(el => {
            el.textContent = label;
        });
    }

    // ---- Volume (localStorage) ----
    const VOLUME_KEY = 'funny_volume';
    const VOLUME_ICONS = {
        mute: parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'),
        low:  parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>'),
        med:  parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>'),
        high: parseSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'),
    };

    function getVolume() {
        const v = parseFloat(localStorage.getItem(VOLUME_KEY));
        return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
    }

    function setVolume(v) {
        v = Math.max(0, Math.min(1, v));
        localStorage.setItem(VOLUME_KEY, String(v));
        applyVolumeToAllVideos();
        refreshVolumeButtons();
    }

    function volumeIconFor(v) {
        if (v === 0) return VOLUME_ICONS.mute;
        if (v < 0.34) return VOLUME_ICONS.low;
        if (v < 0.67) return VOLUME_ICONS.med;
        return VOLUME_ICONS.high;
    }

    function applyVolumeToVideo(video) {
        const v = getVolume();
        video.volume = v;
        video.muted = v === 0;
    }

    function applyVolumeToAllVideos() {
        document.querySelectorAll('video.video-player').forEach(applyVolumeToVideo);
    }

    function refreshVolumeButtons() {
        const v = getVolume();
        document.querySelectorAll('.volume-btn .icon').forEach(el => {
            el.replaceChildren(volumeIconFor(v).cloneNode(true));
        });
        document.querySelectorAll('.volume-slider').forEach(slider => {
            // skip the slider currently being dragged so we don't fight the user
            if (slider !== document.activeElement) slider.value = String(v);
        });
    }

    // On touch devices, close any open volume popup when the user taps
    // outside its control. Hover devices use the CSS :hover rule.
    document.addEventListener('click', (e) => {
        if (e.target.closest('.volume-control')) return;
        document.querySelectorAll('.volume-control.show-slider').forEach(el => {
            el.classList.remove('show-slider');
        });
    });

    // Close share popup when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target.closest('.share-control')) return;
        document.querySelectorAll('.share-control.show-popup').forEach(el => {
            el.classList.remove('show-popup');
        });
    });

    function flashShareLabel(labelEl, text) {
        const original = labelEl.dataset.original || labelEl.textContent;
        labelEl.dataset.original = original;
        labelEl.textContent = text;
        clearTimeout(labelEl._flashTimer);
        labelEl._flashTimer = setTimeout(() => {
            labelEl.textContent = labelEl.dataset.original;
        }, 1200);
    }

    // Intersection Observer for auto-playing videos in view
    const observerOptions = {
        root: feed,
        rootMargin: '0px',
        threshold: 0.7
    };

    // The single video currently in view — scrubber tracks this one
    let currentVideo = null;

    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');
            if (entry.isIntersecting) {
                if (video) {
                    currentVideo = video;
                    // Hide the indicator preemptively so it doesn't flash
                    // while autoplay is starting; restore it only if the
                    // play() promise actually rejects.
                    entry.target.classList.remove('paused');
                    video.play().catch(e => {
                        console.log('Autoplay prevented:', e);
                        entry.target.classList.add('paused');
                    });
                }
                // Mark this video as watched when it comes into view
                const videoId = entry.target.dataset.videoId;
                if (videoId) markWatched(parseInt(videoId));
            } else {
                if (video) {
                    video.pause();
                    if (currentVideo === video) currentVideo = null;
                }
            }
        });
    }, observerOptions);

    // ---- Scrubber: tracks currentVideo and supports drag-to-seek ----
    const scrubber = document.getElementById('video-scrubber');
    const scrubberFill = scrubber.querySelector('.scrubber-fill');
    let isDraggingScrubber = false;

    function scrubberTick() {
        requestAnimationFrame(scrubberTick);
        if (isDraggingScrubber) return;
        if (!currentVideo || !isFinite(currentVideo.duration) || currentVideo.duration === 0) {
            scrubberFill.style.width = '0%';
            return;
        }
        const pct = (currentVideo.currentTime / currentVideo.duration) * 100;
        scrubberFill.style.width = `${pct}%`;
    }
    scrubberTick();

    function seekToPointer(clientX) {
        if (!currentVideo || !isFinite(currentVideo.duration) || currentVideo.duration === 0) return;
        const rect = scrubber.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const pct = x / rect.width;
        currentVideo.currentTime = pct * currentVideo.duration;
        scrubberFill.style.width = `${pct * 100}%`;
    }

    scrubber.addEventListener('pointerdown', (e) => {
        if (!currentVideo) return;
        isDraggingScrubber = true;
        scrubber.classList.add('dragging');
        scrubber.setPointerCapture(e.pointerId);
        seekToPointer(e.clientX);
        e.preventDefault();
    });
    scrubber.addEventListener('pointermove', (e) => {
        if (isDraggingScrubber) seekToPointer(e.clientX);
    });
    function endScrub(e) {
        if (!isDraggingScrubber) return;
        isDraggingScrubber = false;
        scrubber.classList.remove('dragging');
        try { scrubber.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    scrubber.addEventListener('pointerup', endScrub);
    scrubber.addEventListener('pointercancel', endScrub);

    // Intersection Observer for infinite scrolling
    const lastVideoObserver = new IntersectionObserver((entries) => {
        const lastEntry = entries[0];
        if (lastEntry.isIntersecting) {
            fetchNextVideo();
            lastVideoObserver.unobserve(lastEntry.target);
        }
    }, { root: feed, rootMargin: '200px', threshold: 0 });

    async function fetchNextVideo() {
        if (isFetching) return;
        isFetching = true;
        
        try {
            const params = new URLSearchParams();
            const watched = getWatchedIds();
            if (watched.length > 0) params.set('watched', watched.join(','));
            const mode = getMode();
            if (mode !== 'algorithm') params.set('mode', mode);
            const qs = params.toString();
            const response = await fetch(`/api/video/next${qs ? '?' + qs : ''}`);
            if (!response.ok) {
                if (response.status === 404) {
                    // No videos available yet
                    if (feed.children.length === 0) {
                        feed.innerHTML = '<div class="video-container" style="color:#fff; flex-direction:column;"><h2>No videos yet</h2><p>Be the first to upload!</p></div>';
                    }
                    return;
                }
                throw new Error('Network response was not ok');
            }
            
            const videoData = await response.json();
            appendVideoElement(videoData);
        } catch (error) {
            console.error('Error fetching video:', error);
        } finally {
            isFetching = false;
        }
    }

    function appendVideoElement(data) {
        const container = document.createElement('div');
        container.className = 'video-container';
        container.dataset.videoId = data.id;
        
        container.innerHTML = `
            <video class="video-player" src="/videos/${data.filename}" loop playsinline preload="metadata"></video>
            <div class="play-indicator" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="8 5 19 12 8 19 8 5"></polygon>
                </svg>
            </div>
            <div class="video-actions">
                <div class="volume-control">
                    <button class="action-btn volume-btn" title="Volume" aria-label="Volume"><span class="icon"></span></button>
                    <div class="volume-slider-popup">
                        <input type="range" class="volume-slider" min="0" max="1" step="0.01" aria-label="Volume">
                    </div>
                </div>
                <div class="mode-control">
                    <button class="action-btn mode-btn" title="Feed mode"></button>
                    <span class="mode-label"></span>
                </div>
                <button class="action-btn upvote-btn" data-id="${data.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                    </svg>
                    <span class="action-count up-count">${data.thumbs_up}</span>
                </button>
                <button class="action-btn downvote-btn" data-id="${data.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"></path>
                    </svg>
                    <span class="action-count down-count">${data.thumbs_down}</span>
                </button>
                <div class="share-control">
                    <button class="action-btn share-btn" title="Share" aria-label="Share">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="18" cy="5" r="3"></circle>
                            <circle cx="6" cy="12" r="3"></circle>
                            <circle cx="18" cy="19" r="3"></circle>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                    </button>
                    <div class="share-popup">
                        <button class="share-close" aria-label="Close">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                        <button class="share-option" data-action="copy">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                            <span class="label">Copy link</span>
                        </button>
                        <button class="share-option" data-action="download">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            <span class="label">Download</span>
                        </button>
                    </div>
                </div>
                <button class="upload-btn neon-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
            </div>
        `;

        feed.appendChild(container);
        videoObserver.observe(container);
        
        // Re-observe the new last element for infinite scroll
        const allContainers = feed.querySelectorAll('.video-container');
        if (allContainers.length > 0) {
            lastVideoObserver.observe(allContainers[allContainers.length - 1]);
        }

        // Attach event listeners for voting
        const upBtn = container.querySelector('.upvote-btn');
        const downBtn = container.querySelector('.downvote-btn');
        
        upBtn.addEventListener('click', () => vote(data.id, 'up', upBtn, downBtn));
        downBtn.addEventListener('click', () => vote(data.id, 'down', upBtn, downBtn));

        container.querySelector('.upload-btn').addEventListener('click', openUploadModal);
        container.querySelector('.mode-btn').addEventListener('click', cycleMode);
        refreshModeButtons();

        // Share popup
        const shareControl = container.querySelector('.share-control');
        shareControl.querySelector('.share-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            shareControl.classList.toggle('show-popup');
        });
        shareControl.querySelector('.share-close').addEventListener('click', (e) => {
            e.stopPropagation();
            shareControl.classList.remove('show-popup');
        });
        shareControl.querySelectorAll('.share-option').forEach(opt => {
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = opt.dataset.action;
                const videoUrl = `${window.location.origin}/videos/${encodeURIComponent(data.filename)}`;
                const labelEl = opt.querySelector('.label');
                if (action === 'copy') {
                    try {
                        await navigator.clipboard.writeText(videoUrl);
                        flashShareLabel(labelEl, 'Copied!');
                    } catch (err) {
                        console.error('Clipboard write failed', err);
                        flashShareLabel(labelEl, 'Copy failed');
                    }
                } else if (action === 'download') {
                    const a = document.createElement('a');
                    a.href = videoUrl;
                    a.download = data.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    shareControl.classList.remove('show-popup');
                }
            });
        });

        // Volume: slider drag updates persisted volume + all video elements
        const volumeControl = container.querySelector('.volume-control');
        const volumeSlider = volumeControl.querySelector('.volume-slider');
        const volumeBtn = volumeControl.querySelector('.volume-btn');
        volumeSlider.value = String(getVolume());
        volumeSlider.addEventListener('input', e => setVolume(parseFloat(e.target.value)));
        // Touch devices: tap to toggle the popup (hover devices use CSS)
        if (!window.matchMedia('(hover: hover)').matches) {
            volumeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                volumeControl.classList.toggle('show-slider');
            });
        }
        refreshVolumeButtons();
        
        // Toggle play/pause on video click
        const video = container.querySelector('video');
        video.addEventListener('click', () => {
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        });

        // Show the play indicator whenever the video is paused (whether
        // by user click, scrolling out of view, or blocked autoplay).
        // Driven by the native play/pause events so it stays in sync.
        video.addEventListener('play', () => container.classList.remove('paused'));
        video.addEventListener('pause', () => container.classList.add('paused'));

        // Apply the user's saved volume (videos default to muted so autoplay
        // works; only unmute once the saved volume is above zero).
        applyVolumeToVideo(video);
    }

    async function vote(videoId, action, upBtn, downBtn) {
        // Prevent double voting locally for immediate UI feedback (simplified)
        if (upBtn.classList.contains('voted') || downBtn.classList.contains('voted')) return;
        
        const btn = action === 'up' ? upBtn : downBtn;
        btn.classList.add('voted');
        btn.style.color = action === 'up' ? 'var(--success)' : 'var(--danger)';

        try {
            const response = await fetch(`/api/video/${videoId}/vote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action: action })
            });
            
            if (response.ok) {
                const data = await response.json();
                upBtn.querySelector('.up-count').textContent = data.thumbs_up;
                downBtn.querySelector('.down-count').textContent = data.thumbs_down;
            }
        } catch (error) {
            console.error('Error voting:', error);
            btn.classList.remove('voted');
            btn.style.color = '';
        }
    }

    // Modal Logic
    const modal = document.getElementById('upload-modal');
    const closeBtn = document.getElementById('close-modal');
    const form = document.getElementById('upload-form');
    const statusMsg = document.getElementById('upload-status');
    const fileInput = document.getElementById('video-input');
    const fileLabel = document.querySelector('.file-label');

    fileInput.addEventListener('change', (e) => {
        if(e.target.files.length > 0) {
            fileLabel.textContent = e.target.files[0].name;
            fileLabel.style.borderColor = 'var(--success)';
        } else {
            fileLabel.textContent = 'Choose Video';
            fileLabel.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }
    });

    function openUploadModal() {
        modal.classList.remove('hidden');
        statusMsg.textContent = '';
        statusMsg.className = 'status-msg';
        form.reset();
        fileLabel.textContent = 'Choose Video';
        fileLabel.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    }

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading...';
        
        const formData = new FormData(form);
        
        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                statusMsg.textContent = 'Upload successful! Pending moderation.';
                statusMsg.className = 'status-msg success';
                setTimeout(() => {
                    modal.classList.add('hidden');
                }, 2000);
            } else {
                statusMsg.textContent = data.error || 'Upload failed';
                statusMsg.className = 'status-msg error';
            }
        } catch (error) {
            statusMsg.textContent = 'An error occurred during upload.';
            statusMsg.className = 'status-msg error';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Upload to Queue';
        }
    });

    // Initial load: fetch first two videos to have something to scroll to
    fetchNextVideo().then(() => {
        if(feed.children.length > 0) fetchNextVideo();
    });
});
