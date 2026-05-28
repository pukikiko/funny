import math
import os
import random
import shutil
import mimetypes
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')
from functools import wraps
from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for, Response
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename
from app.config import Config
from app.models import db, Video

app = Flask(__name__)
app.config.from_object(Config)

# Initialize extensions
db.init_app(app)

# Rate limiter — shared across uWSGI workers via the Redis backend configured
# in Config.RATELIMIT_STORAGE_URI. Default limits act as a backstop for any
# route that isn't given an explicit limit.
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["200 per minute", "2000 per hour"],
)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

# Initialize Database
with app.app_context():
    db.create_all()
    
    # Sync existing videos from the videos folder into the database
    if os.path.exists(app.config['VIDEOS_FOLDER']):
        existing_db_videos = {v.filename for v in Video.query.all()}
        for filename in os.listdir(app.config['VIDEOS_FOLDER']):
            if allowed_file(filename) and filename not in existing_db_videos:
                new_video = Video(filename=filename)
                db.session.add(new_video)
        db.session.commit()

def check_auth(username, password):
    if not username or not password:
        return False
    return (
        username == app.config['ADMIN_USERNAME']
        and check_password_hash(app.config['ADMIN_PASSWORD_HASH'], password)
    )

def authenticate():
    return Response(
        'Could not verify your access level for that URL.\n'
        'You have to login with proper credentials', 401,
        {'WWW-Authenticate': 'Basic realm="Login Required"'})

def _auth_ok():
    auth = request.authorization
    return bool(auth and check_auth(auth.username, auth.password))

def requires_auth(f):
    # brute-force limit: applies only when creds are missing or wrong,
    # so authenticated admin work isn't throttled
    @wraps(f)
    @limiter.limit("10 per minute", exempt_when=_auth_ok)
    def decorated(*args, **kwargs):
        if not _auth_ok():
            return authenticate()
        return f(*args, **kwargs)
    return decorated

# ---- Public Routes ----

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/video/next')
@limiter.limit("120 per minute")
def next_video():
    videos = Video.query.all()
    if not videos:
        return jsonify({'error': 'No videos available'}), 404
    
    # Parse watched video IDs from the client (sent via query param).
    # Client localStorage is capped at 500 ids — anything wildly over that
    # is abuse, so bail early before doing any parse work.
    MAX_WATCHED_IDS = 500
    watched_param = request.args.get('watched', '')
    if len(watched_param) > MAX_WATCHED_IDS * 12:  # ~12 chars per id with commas, generous
        return jsonify({'error': 'watched parameter too large'}), 400
    watched_ids = set()
    if watched_param:
        try:
            watched_ids = {
                int(x) for x in watched_param.split(',', MAX_WATCHED_IDS)[:MAX_WATCHED_IDS]
                if x.strip()
            }
        except ValueError:
            pass

    # Mode selection. `random` = uniform over unwatched (falls back to all
    # videos once everything has been seen); anything else falls through
    # to the scoring algorithm below.
    mode = request.args.get('mode', 'algorithm')
    if mode == 'random':
        pool = [v for v in videos if v.id not in watched_ids] or videos
        return jsonify(random.choice(pool).to_dict())

    # Score each video
    from datetime import datetime
    now = datetime.utcnow()
    scored = []
    
    for v in videos:
        # Recency score: videos less than 1 day old get full boost,
        # decays over 30 days down to a baseline of 1.0
        age_hours = max((now - v.created_at).total_seconds() / 3600, 0)
        recency = max(1.0, 10.0 - (age_hours / 72))  # 10 -> 1 over ~30 days

        # Popularity score: log-dampened net likes so a single 200-like
        # video doesn't dominate the whole feed. A 0-vote video starts at
        # 1.0; 10 net likes -> ~3.4; 200 net likes -> ~6.3.
        net_likes = max(0, v.thumbs_up - v.thumbs_down)
        popularity = 1.0 + math.log1p(net_likes)

        # Watched penalty: 100x downweight (not full exclusion, so users
        # can still re-encounter popular older content once they've burned
        # through everything new)
        watched_mult = 0.01 if v.id in watched_ids else 1.0

        score = recency * popularity * watched_mult
        scored.append((v, max(score, 0.001)))  # Floor so score never hits zero
    
    # Weighted random selection
    total = sum(s for _, s in scored)
    r = random.uniform(0, total)
    cumulative = 0
    chosen = scored[0][0]
    for v, s in scored:
        cumulative += s
        if r <= cumulative:
            chosen = v
            break
    
    return jsonify(chosen.to_dict())

@app.route('/api/video/<int:video_id>/vote', methods=['POST'])
@limiter.limit("30 per minute")
def vote_video(video_id):
    video = Video.query.get_or_404(video_id)
    data = request.json
    action = data.get('action')
    if action == 'up':
        video.thumbs_up += 1
    elif action == 'down':
        video.thumbs_down += 1
    else:
        return jsonify({'error': 'Invalid action'}), 400
    
    db.session.commit()
    return jsonify(video.to_dict())

@app.route('/upload', methods=['POST'])
@limiter.limit("5 per hour;2 per minute")
def upload_public():
    if 'video' not in request.files:
        return jsonify({'error': 'No video part'}), 400
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Ensure unique filename in queue
        base, ext = os.path.splitext(filename)
        counter = 1
        while os.path.exists(os.path.join(app.config['QUEUE_FOLDER'], filename)):
            filename = f"{base}_{counter}{ext}"
            counter += 1
            
        file.save(os.path.join(app.config['QUEUE_FOLDER'], filename))
        return jsonify({'message': 'Video uploaded successfully and is pending review'}), 201
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/videos/<filename>')
def serve_video(filename):
    return send_from_directory(app.config['VIDEOS_FOLDER'], filename)

@app.route('/queue/<filename>')
@requires_auth
def serve_queued_video(filename):
    return send_from_directory(app.config['QUEUE_FOLDER'], filename)

# ---- Admin Routes ----

@app.route('/admin')
@requires_auth
def admin_dashboard():
    videos = Video.query.order_by(Video.created_at.desc()).all()
    return render_template('admin.html', videos=videos)

@app.route('/admin/upload', methods=['POST'])
@requires_auth
def admin_upload():
    if 'video' not in request.files:
        return redirect(url_for('admin_dashboard'))
    
    files = request.files.getlist('video')
    for file in files:
        if file.filename == '':
            continue
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            base, ext = os.path.splitext(filename)
            counter = 1
            while os.path.exists(os.path.join(app.config['VIDEOS_FOLDER'], filename)):
                filename = f"{base}_{counter}{ext}"
                counter += 1
            
            file.save(os.path.join(app.config['VIDEOS_FOLDER'], filename))
            new_video = Video(filename=filename)
            db.session.add(new_video)
            
    db.session.commit()
    return redirect(url_for('admin_dashboard'))

@app.route('/admin/delete/<int:video_id>', methods=['POST'])
@requires_auth
def admin_delete(video_id):
    video = Video.query.get_or_404(video_id)
    try:
        os.remove(os.path.join(app.config['VIDEOS_FOLDER'], video.filename))
    except OSError:
        pass # File might be missing
    db.session.delete(video)
    db.session.commit()
    return redirect(url_for('admin_dashboard'))

@app.route('/admin/queue')
@requires_auth
def admin_queue():
    queue_files = []
    if os.path.exists(app.config['QUEUE_FOLDER']):
        queue_files = [f for f in os.listdir(app.config['QUEUE_FOLDER']) if allowed_file(f)]
    return render_template('admin_queue.html', queued_videos=queue_files)

@app.route('/admin/queue/<filename>/<action>', methods=['POST'])
@requires_auth
def admin_queue_action(filename, action):
    source_path = os.path.join(app.config['QUEUE_FOLDER'], secure_filename(filename))
    if not os.path.exists(source_path):
        return redirect(url_for('admin_queue'))
        
    if action == 'approve':
        dest_filename = secure_filename(filename)
        base, ext = os.path.splitext(dest_filename)
        counter = 1
        while os.path.exists(os.path.join(app.config['VIDEOS_FOLDER'], dest_filename)):
            dest_filename = f"{base}_{counter}{ext}"
            counter += 1
            
        dest_path = os.path.join(app.config['VIDEOS_FOLDER'], dest_filename)
        shutil.move(source_path, dest_path)
        
        new_video = Video(filename=dest_filename)
        db.session.add(new_video)
        db.session.commit()
        
    elif action == 'reject':
        os.remove(source_path)
        
    return redirect(url_for('admin_queue'))

if __name__ == '__main__':
    app.run(debug=True)
