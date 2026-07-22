FROM python:3.11-slim

RUN apt-get update && apt-get install -y build-essential python3-dev tesseract-ocr libtesseract-dev ffmpeg libgl1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt uwsgi

# Copy the app source
COPY app/ ./app/
COPY uwsgi.ini .

# Create the directories we need
RUN mkdir -p /app/videos /app/queue /app/instance

EXPOSE 80

CMD ["uwsgi", "--ini", "uwsgi.ini"]
