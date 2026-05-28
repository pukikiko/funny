# funny

a self-hosted short-form media platform for sharing your shitpost folder with the world.

**live demo:** [funny.mfc.pw](https://funny.mfc.pw)

---

## getting started

### 1. clone the repo

```bash
git clone https://github.com/pukikiko/funny
cd funny
```

### 2. configure `docker-compose.yml`

Edit `docker-compose.yml` to fit your environment. See the volume mounts and environment variables below.

#### volume mounts

| path | description |
|------|-------------|
| `/app/videos` | where public videos are stored. point this to an existing folder to automatically import everything inside on first run. |
| `/app/queue` | where recently uploaded videos are temporarily placed during moderation. |
| `/app/instance` | where the database is stored. |

#### environment variables

| variable | description |
|----------|-------------|
| `ADMIN_USERNAME` | username for the admin panel |
| `ADMIN_PASSWORD_HASH` | werkzeug-format password hash for the admin panel (see below) |
| `REDIS_URL` | redis connection string for the rate-limit store (defaults to the bundled `redis` service) |

#### generating an admin password hash

the admin password is stored hashed (scrypt) so the plaintext never sits in env or memory. generate the hash and paste it into `ADMIN_PASSWORD_HASH`:

```bash
python -c "from werkzeug.security import generate_password_hash; import getpass; print(generate_password_hash(getpass.getpass()))"
```

### 3. run it

```bash
docker-compose up -d
```

funny will be available at `http://<your-instance>`.

the admin panel is at `http://<your-instance>/admin`.
