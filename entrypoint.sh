#!/bin/sh
echo "Esperando o banco de dados MySQL..."

python - <<END
import time
import os
import MySQLdb

max_retries = 30
retry = 0

while retry < max_retries:
    try:
        conn = MySQLdb.connect(
            db=os.environ.get('DB_NAME', 'st63136_dev_app_transportadora'),
            user=os.environ.get('DB_USER', 'st63136_quickdelivery'),
            passwd=os.environ.get('DB_PASSWORD', ''),
            host=os.environ.get('DB_HOST', 'st63136.ispot.cc'),
            port=int(os.environ.get('DB_PORT', 3306)),
            connect_timeout=5
        )
        conn.close()
        print("Conexão estabelecida com sucesso!")
        break
    except Exception as e:
        retry += 1
        print(f"Tentativa {retry}/{max_retries} - Aguardando MySQL: {e}")
        time.sleep(2)

if retry >= max_retries:
    print("ERRO: Não foi possível conectar ao banco de dados.")
    exit(1)
END

echo "Banco pronto! Executando comando..."
exec "$@"
