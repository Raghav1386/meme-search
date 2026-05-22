import os
from dotenv import load_dotenv
import psycopg2

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
NEON_DATABASE_URL = os.getenv("NEON_DATABASE_URL")

print("Connecting to DB...")
conn = psycopg2.connect(NEON_DATABASE_URL)
with conn.cursor() as cur:
    print("Deleting all records from memes table...")
    cur.execute("TRUNCATE TABLE memes;")
    print("Done truncating!")
conn.commit()
conn.close()
