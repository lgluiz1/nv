# Usa uma imagem base Python
FROM python:3.11-slim

# Define o diretório de trabalho. O root do seu projeto é copiado aqui.
WORKDIR /transportadora_backend

# Configurações de performance e logs
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Instala dependências do sistema
 
RUN apt-get update && apt-get install -y \
    postgresql-client \
    gcc \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    python3-dev \
    default-libmysqlclient-dev \
    build-essential \
    pkg-config \
    graphviz \
    libgraphviz-dev \
    pkg-config \
    # Limpa o cache
    && rm -rf /var/lib/apt/lists/*

# Copia e instala as dependências Python
COPY requirements.txt /transportadora_backend/
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Copia o código da aplicação
COPY . /transportadora_backend/