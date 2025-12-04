# Immediate Fix: Using Your VPN with Docker

Since you mentioned you have a VPN, here's how to route Docker traffic through it.

## Option 1: Use Host Network Mode (Simplest)

This makes Docker use your host's network (including VPN):

### Update docker compose.yml:
```yaml
backend:
  network_mode: "host"  # Use host network instead of bridge
  # Remove the 'ports:' section - not needed with host mode
  # Remove the 'networks:' section
  environment:
    - MONGODB_URI=mongodb://localhost:27017  # Changed from 'mongodb'
    - DATABASE_NAME=stock_analyzer
    - SERVER_HOST=127.0.0.1
    - SERVER_PORT=3333
    - ANALYSIS_INTERVAL_SECS=3600
    - CACHE_TTL_SECS=300
    - YAHOO_REQUEST_DELAY_MS=8000  # Can reduce since using VPN
    - RUST_LOG=info

mongodb:
  network_mode: "host"
  # Remove 'ports:' and 'networks:' sections
```

### Deploy:
```bash
docker compose down
docker compose up -d

# Test - should now work through VPN
docker logs -f stock_analyzer_backend | grep -E "(✅|Rate limited)"
```

**Pros**: ✅ Simple, uses your VPN automatically  
**Cons**: ❌ Less isolation, containers share host network

---

## Option 2: Proxy Your VPN (Better for Production)

### Step 1: Install and configure proxy on host

```bash
# Install tinyproxy on macOS
brew install tinyproxy

# Configure /usr/local/etc/tinyproxy/tinyproxy.conf
Port 8888
Listen 127.0.0.1
Allow 127.0.0.1
Allow 172.16.0.0/12  # Docker bridge network
```

### Step 2: Start proxy
```bash
# Start proxy (will use your active VPN connection)
tinyproxy -d  # -d for debug mode, remove for production

# Or as a service
brew services start tinyproxy
```

### Step 3: Update docker compose.yml
```yaml
backend:
  environment:
    - HTTP_PROXY=http://host.docker.internal:8888
    - HTTPS_PROXY=http://host.docker.internal:8888
    - NO_PROXY=mongodb,localhost,127.0.0.1
    - YAHOO_REQUEST_DELAY_MS=6000  # Can reduce delay
```

### Step 4: Test
```bash
docker compose down && docker compose up -d
docker logs -f stock_analyzer_backend

# You should see successful fetches:
# ✅ Successfully fetched AAPL after 0 retries
```

---

## Option 3: Use Docker's Built-in VPN Container

### Create a VPN container that other containers route through:

```yaml
# docker compose.yml
services:
  vpn:
    image: dperson/openvpn-client
    container_name: vpn
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun
    volumes:
      - ./vpn-config:/vpn
    command: '-r 192.168.1.0/24'
    networks:
      - stock_analyzer_network

  backend:
    network_mode: "service:vpn"  # Route through VPN container
    depends_on:
      - vpn
      - mongodb
    # Rest of backend config...
```

Place your VPN config files in `./vpn-config/`

---

## Option 4: Quick Test - Disable VPN Temporarily

To verify the issue is VPN-related:

```bash
# Turn OFF your VPN
# Run locally (not Docker)
cargo run --release

# Check logs - should work from your IP
```

If local works but Docker doesn't, then Docker networking is the issue, not the VPN.

---

## Recommended: Option 1 (Host Network Mode)

**For your setup**, I recommend **Option 1 (Host Network Mode)** because:
- ✅ Your VPN is already active on the host
- ✅ Simplest configuration (2 line changes)
- ✅ No additional software needed
- ✅ Works immediately

### Quick Implementation:

1. **Update docker compose.yml**:
```yaml
services:
  mongodb:
    image: mongo:7.0
    container_name: stock_analyzer_db
    network_mode: "host"
    volumes:
      - mongodb_data:/data/db
    environment:
      - MONGO_INITDB_DATABASE=stock_analyzer

  backend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: stock_analyzer_backend
    network_mode: "host"
    environment:
      - MONGODB_URI=mongodb://127.0.0.1:27017
      - DATABASE_NAME=stock_analyzer
      - SERVER_HOST=127.0.0.1
      - SERVER_PORT=3333
      - ANALYSIS_INTERVAL_SECS=3600
      - CACHE_TTL_SECS=300
      - YAHOO_REQUEST_DELAY_MS=6000
      - RUST_LOG=info
    depends_on:
      - mongodb

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: stock_analyzer_frontend
    network_mode: "host"
    depends_on:
      - backend

volumes:
  mongodb_data:
```

2. **Deploy**:
```bash
# Stop existing containers
docker compose down

# Remove network (not needed anymore)
docker network rm auto-analyser-2_stock_analyzer_network 2>/dev/null || true

# Start with host network
docker compose up -d

# Monitor logs
docker logs -f stock_analyzer_backend
```

3. **Access**:
- Frontend: http://localhost:80
- Backend API: http://localhost:3333
- MongoDB: localhost:27017

### Expected Result:
```
INFO auto_analyser_2::analysis: 🆕 Analyzing new ticker: AAPL
INFO auto_analyser_2::yahoo: ✅ Successfully fetched AAPL after 0 retries
INFO auto_analyser_2::analysis: ⏱️ Waiting 6842ms before next request
INFO auto_analyser_2::analysis: 🆕 Analyzing new ticker: MSFT
INFO auto_analyser_2::yahoo: ✅ Successfully fetched MSFT after 0 retries
```

No more 429 errors! 🎉

---

## Troubleshooting

### Issue: Still getting 429 even with host network
**Solution**: Your VPN might not be active or routing correctly.

```bash
# Verify VPN is active
curl -s https://ipinfo.io/json | jq '.country, .org'

# Should show VPN country/provider, not your real ISP

# Test Yahoo Finance from host
curl -s 'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=5d' | head -20

# Should return JSON, not "Too Many Requests"
```

### Issue: Containers can't talk to each other
**Solution**: Use localhost instead of container names

```yaml
# Instead of:
MONGODB_URI=mongodb://mongodb:27017

# Use:
MONGODB_URI=mongodb://127.0.0.1:27017
```

### Issue: Port conflicts
**Solution**: Check what's using port 3333/27017

```bash
lsof -i :3333
lsof -i :27017

# Kill conflicting processes
kill -9 <PID>
```

---

## Performance Expectations

With VPN + host network mode:

| Metric | Expected Value |
|--------|---------------|
| Request Success Rate | >95% |
| Avg Request Time | 1-2 seconds |
| Rate Limit Errors | <5% |
| Stocks/Hour | ~600 (with 6s delay) |
| Full Cycle (5943 stocks) | ~10 hours |

Adjust `YAHOO_REQUEST_DELAY_MS` based on your results:
- Start with 6000ms (6 seconds)
- If still getting errors, increase to 8000ms
- If no errors, can try 4000ms for faster analysis
