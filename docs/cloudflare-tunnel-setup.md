# Cloudflare Tunnel Setup for Habit Tracker API

This guide walks through exposing the FastAPI backend (`localhost:8000`) to the
internet using [Cloudflare Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

## Prerequisites

- A Cloudflare account with an active domain (zone) added.
- A running instance of the Habit Tracker API on `localhost:8000`.

---

## 1. Install `cloudflared`

### Debian / Ubuntu

```bash
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
  https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt update && sudo apt install -y cloudflared
```

### macOS (Homebrew)

```bash
brew install cloudflared
```

### Verify

```bash
cloudflared --version
```

---

## 2. Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser window. Select the domain you want to use and authorise
the connection. A certificate is saved to `~/.cloudflared/cert.pem`.

---

## 3. Create a Tunnel

```bash
cloudflared tunnel create habit-tracker
```

Note the **Tunnel UUID** printed in the output (e.g.
`a1b2c3d4-e5f6-7890-abcd-ef1234567890`). A credentials file is saved to
`~/.cloudflared/<TUNNEL_UUID>.json`.

---

## 4. Configure the Tunnel

Create (or copy) the configuration file. A ready-made template lives at
`backend/cloudflared-config.yml` in this repository.

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/<user>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: api.example.com
    service: http://localhost:8000
  - service: http_status:404
```

Replace:
- `<TUNNEL_UUID>` with your tunnel's UUID.
- `<user>` with the OS user that owns the credentials file.
- `api.example.com` with your chosen subdomain.

Place the file at `~/.cloudflared/config.yml` or pass its path explicitly with
the `--config` flag.

---

## 5. DNS Configuration

Create a CNAME record that points your subdomain to the tunnel:

```bash
cloudflared tunnel route dns habit-tracker api.example.com
```

This adds a CNAME record in Cloudflare DNS:

| Type  | Name  | Target                                         |
|-------|-------|-------------------------------------------------|
| CNAME | api   | `<TUNNEL_UUID>.cfargotunnel.com`                |

You can verify the record in the Cloudflare dashboard under **DNS > Records**.

---

## 6. Run the Tunnel

### Manual (foreground)

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml run habit-tracker
```

### As a systemd Service (recommended for production)

Install the service:

```bash
sudo cloudflared service install
```

This copies your config and credentials into `/etc/cloudflared/` and creates a
`cloudflared.service` unit. If you prefer to point at a custom config path:

```bash
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/<TUNNEL_UUID>.json /etc/cloudflared/<TUNNEL_UUID>.json
```

Enable and start the service:

```bash
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

Check the status:

```bash
sudo systemctl status cloudflared
journalctl -u cloudflared -f
```

The service is configured to restart on failure automatically via systemd's
`Restart=on-failure` directive.

---

## 7. Docker Compose (alternative)

Instead of installing `cloudflared` on the host, you can run the tunnel as a
Docker container alongside the API. See the `tunnel` service in
`backend/docker-compose.yml`:

```bash
cd backend
docker compose --profile tunnel up -d
```

This requires you to bind-mount your `cloudflared-config.yml` and tunnel
credentials file. See the `docker-compose.yml` comments for details.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ERR  Unable to reach the origin service` | Ensure the API is running on `localhost:8000`. |
| `failed to sufficiently increase receive buffer size` | Ignored safely; this is a UDP tuning warning. |
| DNS record not propagating | Wait a few minutes; check the Cloudflare dashboard for the CNAME. |
| 502 Bad Gateway | The tunnel is running but the backend is down. Start the API first. |
