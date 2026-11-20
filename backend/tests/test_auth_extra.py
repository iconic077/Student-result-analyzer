import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-with-32-bytes-minimum")
os.environ.setdefault("SESSION_SECRET", "test-only-session-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import auth_extra
import main
from fastapi import HTTPException


class FakeDatabase:
    def __init__(self):
        self.users = {}
        self.next_user_id = 1
        self.next_student_id = 100

    def connect(self):
        return FakeConnection(self)


class FakeConnection:
    def __init__(self, database):
        self.database = database

    def cursor(self, dictionary=False):
        return FakeCursor(self.database)

    def commit(self):
        pass

    def close(self):
        pass


class FakeCursor:
    def __init__(self, database):
        self.database = database
        self.row = None
        self.rows = []
        self.lastrowid = None

    def execute(self, query, params=()):
        sql = " ".join(query.lower().split())
        self.row = None
        self.rows = []

        if sql.startswith("select user_id from users where lower(email)"):
            self.row = next(
                (
                    {"user_id": user["user_id"]}
                    for user in self.database.users.values()
                    if user["email"] == params[0]
                ),
                None
            )
        elif sql.startswith("insert into users"):
            user_id = self.database.next_user_id
            self.database.next_user_id += 1
            name, email, password, role = params
            self.database.users[email] = {
                "user_id": user_id,
                "name": name,
                "email": email,
                "password": password,
                "role": role,
                "student_id": None
            }
            self.lastrowid = user_id
        elif sql.startswith("select student_id from users"):
            user = next(
                (
                    value
                    for value in self.database.users.values()
                    if value["user_id"] == params[0]
                ),
                None
            )
            self.row = {"student_id": user["student_id"]} if user else None
        elif sql.startswith("insert into students"):
            self.lastrowid = self.database.next_student_id
            self.database.next_student_id += 1
        elif sql.startswith("update users set student_id"):
            student_id, user_id = params
            user = next(
                value
                for value in self.database.users.values()
                if value["user_id"] == user_id
            )
            user["student_id"] = student_id
        elif sql.startswith("select user_id, name, email, password, role from users"):
            user = next(
                (
                    value
                    for value in self.database.users.values()
                    if value["email"] == params[0]
                ),
                None
            )
            self.row = dict(user) if user else None
        elif sql.startswith("select task_id, title"):
            self.rows = []
        else:
            raise AssertionError(f"Unexpected SQL: {sql}")

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows

    def close(self):
        pass


class AuthSessionTests(unittest.TestCase):
    def setUp(self):
        self.database = FakeDatabase()
        self.auth_connection = patch.object(
            auth_extra,
            "get_db_connection",
            self.database.connect
        )
        self.main_connection = patch.object(
            main,
            "get_db_connection",
            self.database.connect
        )
        self.auth_connection.start()
        self.main_connection.start()
        self.addCleanup(self.auth_connection.stop)
        self.addCleanup(self.main_connection.stop)

    def test_registration_creates_a_student_and_session(self):
        request = SimpleNamespace(session={})
        response = auth_extra.register(
            auth_extra.RegisterRequest(
                name="Student",
                email="student@example.com",
                password="valid-pass-1"
            ),
            request
        )

        self.assertTrue(response["success"])
        self.assertEqual(request.session["user_id"], response["user_id"])
        self.assertEqual(
            self.database.users["student@example.com"]["student_id"],
            100
        )

    def test_session_authenticates_task_requests(self):
        request = SimpleNamespace(session={})
        auth_extra.register(
            auth_extra.RegisterRequest(
                name="Student",
                email="student@example.com",
                password="valid-pass-1"
            ),
            request
        )

        response = main.get_tasks(
            SimpleNamespace(session=request.session, headers={})
        )
        self.assertEqual(response, {"logged_in": True, "tasks": []})

        unauthenticated = main.get_tasks(
            SimpleNamespace(session={}, headers={"X-User-ID": "1"})
        )
        self.assertFalse(unauthenticated["logged_in"])

    def test_login_restores_the_account_session(self):
        auth_extra.register(
            auth_extra.RegisterRequest(
                name="Student",
                email="student@example.com",
                password="valid-pass-1"
            ),
            SimpleNamespace(session={})
        )
        request = SimpleNamespace(session={})

        response = auth_extra.login(
            auth_extra.LoginRequest(
                email="student@example.com",
                password="valid-pass-1"
            ),
            request
        )

        self.assertTrue(response["success"])
        self.assertEqual(request.session["user_id"], response["user"]["id"])

    def test_public_registration_cannot_assign_privileged_roles(self):
        with self.assertRaises(HTTPException) as raised:
            auth_extra.register(
                auth_extra.RegisterRequest(
                    name="Admin",
                    email="admin@example.com",
                    password="valid-pass-1",
                    role="admin"
                ),
                SimpleNamespace(session={})
            )

        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
