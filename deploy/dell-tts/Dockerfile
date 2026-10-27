FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1
WORKDIR /app
COPY requirements.txt /app/requirements.txt
# Fail clearly instead of building optional native dependencies from source.
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt
COPY service.py /app/service.py
EXPOSE 8096
CMD ["python","-m","uvicorn","service:app","--host","0.0.0.0","--port","8096","--workers","1","--no-access-log"]
