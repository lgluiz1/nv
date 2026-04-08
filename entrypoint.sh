#!/bin/sh
echo "Esperando o banco de dados..."

python - <<END
import time
import MySQLdb
import os
while True:
    try:
        conn = MySQLdb.connect(
            db=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            passwd=os.getenv("DB_PASSWORD"),
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", 3306))
        )
        conn.close()
        break
    except Exception as e:
        print(f"Aguardando MySQL... {e}")
        time.sleep(2)
END

echo "Banco pronto!"
python manage.py migrate
celery -A core beat -l info --scheduler django_celery_beat.schedulers.DatabaseScheduler
