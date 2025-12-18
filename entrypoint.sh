#!/bin/sh
echo "Esperando o banco de dados..."

python - <<END
import time
import psycopg2
while True:
    try:
        conn = psycopg2.connect(
            dbname="${DB_NAME}",
            user="${DB_USER}",
            password="${DB_PASSWORD}",
            host="db",
            port=5432
        )
        conn.close()
        break
    except:
        time.sleep(1)
END

echo "Banco pronto!"
python manage.py migrate
celery -A core beat -l info --scheduler django_celery_beat.schedulers.DatabaseScheduler
