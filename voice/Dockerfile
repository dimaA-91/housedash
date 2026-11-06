# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 HOME=/state CODEX_HOME=/state/codex OMP_NUM_THREADS=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libgomp1 ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
RUN --mount=type=cache,target=/root/.npm npm install -g @openai/codex@0.166.0 --ignore-scripts --no-audit --no-fund
RUN python3 -m venv /opt/voice-venv && /opt/voice-venv/bin/pip install --no-cache-dir aiohttp==3.14.5 vosk==0.3.45
COPY download-model.py /opt/download-model.py
RUN python3 /opt/download-model.py
RUN cp /usr/share/common-licenses/Apache-2.0 /opt/models/LICENSE-Apache-2.0
RUN apt-get update && apt-get install -y --no-install-recommends espeak-ng && rm -rf /var/lib/apt/lists/*
RUN /opt/voice-venv/bin/pip install --no-cache-dir piper-tts==1.8.0
COPY download-speech.py /opt/download-speech.py
RUN python3 /opt/download-speech.py && cp /usr/share/common-licenses/GPL-3 /opt/models/piper/LICENSE-PIPER-GPL-3
# libvosk.so needs libatomic on ARM64; without it speech recognition cannot load.
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/housedash-voice
RUN mkdir -p /state/codex /workspace /run/housedash-voice && chown -R node:node /state /workspace /run/housedash-voice
# Zuletzt, damit eine Code-Änderung keine großen Schichten neu erzeugt.
COPY broker.py schema.json ./
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD /opt/voice-venv/bin/python -c "import socket; s=socket.socket(socket.AF_UNIX); s.settimeout(3); s.connect('/run/housedash-voice/bridge.sock'); s.close()"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/opt/voice-venv/bin/python", "broker.py"]
