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

    function getMode() {
        const m = localStorage.getItem(MODE_KEY);
        return MODES.includes(m) ? m : 'algorithm';
    }

    function cycleMode() {
        const i = MODES.indexOf(getMode());
        const next = MODES[(i + 1) % MODES.length];
        localStorage.setItem(MODE_KEY, next);
        refreshModeButtons();
    }

    function refreshModeButtons() {
        const mode = getMode();
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.replaceChildren(MODE_ICONS[mode].cloneNode(true));
            btn.title = `Mode: ${mode} (click to change)`;
            btn.setAttribute('aria-label', `Feed mode: ${mode}`);
        });
    }

    // Intersection Observer for auto-playing videos in view
    const observerOptions = {
        root: feed,
        rootMargin: '0px',
        threshold: 0.7
    };

    const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target.querySelector('video');
            if (entry.isIntersecting) {
                if (video) {
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
                if (video) video.pause();
            }
        });
    }, observerOptions);

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
                <button class="action-btn mode-btn" title="Feed mode"></button>
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
