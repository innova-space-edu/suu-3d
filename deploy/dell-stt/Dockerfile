FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2
WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --only-binary=:all: -r requirements.txt
COPY service.py preload.py /app/
EXPOSE 8095
CMD ["python", "-m", "uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8095", "--workers", "1", "--no-access-log"]
