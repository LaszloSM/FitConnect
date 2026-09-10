FROM python:3.12-slim

# Sin esto, los print() de los scripts (migrate_tenants, import_exercises) se
# quedan en el buffer y `docker logs` no muestra su avance.
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
