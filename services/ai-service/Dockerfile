# Python ML service (Whisper / PySceneDetect / MediaPipe). Build context = repo root.
FROM python:3.12-slim

# OpenCV / MediaPipe runtime libs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/ai-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ai-service/app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
