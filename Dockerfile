# ============================================================
#         TOING DISCORD AI BOT v3.2 - DOCKERFILE
#         Complete Edition with Voice AI, ScraperAPI, Multi-TTS
# ============================================================

FROM node:20-bullseye-slim

# ============================================================
# SYSTEM DEPENDENCIES
# ============================================================

RUN apt-get update && apt-get install -y --no-install-recommends \
    # Python for TTS
    python3 \
    python3-pip \
    # Build tools for native modules
    make \
    g++ \
    gcc \
    build-essential \
    pkg-config \
    # Audio processing
    ffmpeg \
    # Opus codec for Discord voice
    libopus0 \
    libopus-dev \
    # Sodium for voice encryption
    libsodium23 \
    libsodium-dev \
    # Utilities
    curl \
    ca-certificates \
    # Install TTS engines
    && pip3 install --no-cache-dir edge-tts gtts \
    # Cleanup to reduce image size
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /root/.cache

# ============================================================
# APPLICATION SETUP
# ============================================================

WORKDIR /app

# Copy package files first (for layer caching)
COPY package*.json ./

# Install node dependencies
RUN npm install --omit=dev \
    && npm rebuild @discordjs/opus --update-binary 2>/dev/null || true \
    && npm rebuild sodium-native --update-binary 2>/dev/null || true \
    && npm cache clean --force

# Copy source files
COPY . .

# Create necessary directories
RUN mkdir -p temp data logs modules \
    && chmod 755 temp data logs modules

# ============================================================
# ENVIRONMENT
# ============================================================

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512" \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    TZ=Asia/Jakarta \
    PORT=3000

# ============================================================
# HEALTH CHECK & RUN
# ============================================================

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

EXPOSE 3000

CMD ["node", "src/index.js"]
