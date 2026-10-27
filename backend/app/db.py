import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.app.config import settings

Base = declarative_base()

def get_engine_url():
    if settings.DATABASE_URL:
        url = settings.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url
    
    # Fallback to local SQLite file
    root_dir = Path(__file__).resolve().parent.parent.parent
    data_dir = root_dir / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    sqlite_path = data_dir / "reputelens.db"
    return f"sqlite:///{sqlite_path}"

database_url = get_engine_url()
connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}

engine = create_engine(
    database_url,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from backend.app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
