import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'instance', 'app.db')
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    try:
        cur.execute("ALTER TABLE video ADD COLUMN tags TEXT DEFAULT ''")
        conn.commit()
        print("Migration successful: added tags to video table.")
    except sqlite3.OperationalError as e:
        print("Error/Already migrated:", e)
    conn.close()
else:
    print(f"Database not found at {db_path}")
