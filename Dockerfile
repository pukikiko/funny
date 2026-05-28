FROM python:3.14.5-alpine

RUN apk add --no-cache build-base linux-headers libffi-dev openssl-dev musl-dev

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
