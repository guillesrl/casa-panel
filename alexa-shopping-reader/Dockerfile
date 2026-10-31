FROM mcr.microsoft.com/playwright/python:v1.64.1-noble

WORKDIR /app
RUN pip install --no-cache-dir playwright==1.64.1
COPY reader.py bridge_server.py ./
ENV ALEXA_READER_HOME=/data
ENV ALEXA_BRIDGE_HOST=0.0.0.0
ENV ALEXA_BRIDGE_PORT=8765
EXPOSE 8765
USER root
CMD ["python", "bridge_server.py"]
