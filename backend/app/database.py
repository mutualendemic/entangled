from flask import current_app
from pymongo import MongoClient


def get_database():
    client = current_app.extensions.get("mongo_client")
    if client is None:
        client = MongoClient(
            current_app.config["MONGODB_URI"],
            maxPoolSize=5,
            minPoolSize=0,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
        )
        current_app.extensions["mongo_client"] = client

    database = client[current_app.config["MONGODB_DATABASE"]]
    if not current_app.extensions.get("mongo_indexes_ready"):
        database.users.create_index("username_key", unique=True)
        database.users.create_index(
            "email",
            unique=True,
            partialFilterExpression={"email_verified": True},
        )
        database.profiles.create_index("username_key", unique=True)
        database.profiles.create_index("user_id", unique=True)
        current_app.extensions["mongo_indexes_ready"] = True

    return database