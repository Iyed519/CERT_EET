# Cert_EET — service ml (prédiction du risque de décrochage)
# Contexte de construction : le dossier ml/ (voir docker-compose.yml).
#   docker build -f ml/service/Dockerfile ml
# Image légère : seulement le code du service, ml/risque/ et ml/modeles/ (jamais de données).
FROM python:3.13-slim

# libgomp1 : bibliothèque OpenMP dont LightGBM a besoin à l'exécution
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY service/requirements.txt service/requirements.txt
RUN pip install --no-cache-dir -r service/requirements.txt

COPY risque/ risque/
COPY modeles/ modeles/
COPY service/__init__.py service/app.py service/modele.py service/schemas.py service/

# Utilisateur non root, sans répertoire personnel ni shell de connexion
RUN useradd --system --no-create-home --shell /usr/sbin/nologin ml
USER ml

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/sante', timeout=2).status == 200 else 1)"]

CMD ["uvicorn", "service.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-server-header"]
