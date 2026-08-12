import sqlite3
import os

DB_FILE = os.path.join(os.path.dirname(__file__), "araujo.db")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn
