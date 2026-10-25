import json
from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from fastapi.middleware.cors import CORSMiddleware

import mysql.connector
from dotenv import load_dotenv
import os

from google_auth_oauthlib.flow import Flow
from google.oauth2 import id_token
from google.auth.transport import requests


load_dotenv()


# =========================================================
# APP CONFIGURATION
# =========================================================

app = FastAPI(title="Student Result Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET")
)

if not os.getenv("SESSION_SECRET"):
    raise RuntimeError(
        "SESSION_SECRET missing. Set it in backend/.env"
    )



# =========================================================
# GOOGLE OAUTH CONFIGURATION
# =========================================================

GOOGLE_CLIENT_SECRETS_FILE = os.path.join(
    os.path.dirname(__file__),
    "credentials",
    "client_secret.json"
)

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
]

GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://127.0.0.1:8000/auth/google/callback"
)

# =========================================================
# DATABASE CONNECTION
# =========================================================

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME")
    )

@app.get("/me")
def get_current_user(request: Request):

    user_id = request.session.get("user_id")

    if not user_id:
        return {
            "logged_in": False,
            "message": "User is not logged in"
        }

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT
            user_id,
            google_id,
            name,
            email,
            picture,
            created_at,
            last_login
        FROM users
        WHERE user_id = %s
        """,
        (user_id,)
    )

    user = cursor.fetchone()

    cursor.close()
    conn.close()

    if user is None:
        request.session.clear()

        return {
            "logged_in": False,
            "message": "User not found"
        }

    return {
        "logged_in": True,
        "user": user
    }


@app.get("/me/result")
def get_my_result(request: Request):

    user_id = request.session.get("user_id")

    if not user_id:
        return {
            "logged_in": False,
            "message": "User is not logged in"
        }

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Get logged-in user's linked student record
        cursor.execute(
            """
            SELECT
                u.user_id,
                u.name AS user_name,
                u.email,
                s.student_id,
                s.roll_no,
                s.name AS student_name
            FROM users u
            JOIN students s
                ON u.student_id = s.student_id
            WHERE u.user_id = %s
            """,
            (user_id,)
        )

        student = cursor.fetchone()

        if student is None:
            return {
                "logged_in": True,
                "message": "No student record linked with this account"
            }

        student_id = student["student_id"]

        # Get result summary
        cursor.execute(
            """
            SELECT
                COUNT(m.mark_id) AS subjects,
                ROUND(SUM(m.marks), 2) AS total_marks,
                ROUND(AVG(m.marks), 2) AS average_marks,
                ROUND(AVG(m.marks), 2) AS percentage
            FROM marks m
            WHERE m.student_id = %s
            """,
            (student_id,)
        )

        result = cursor.fetchone()

        if not result or not result["subjects"]:
            return {
                "logged_in": True,
                "message": "No marks found for this student"
            }

        # Get individual subject marks
        cursor.execute(
            """
            SELECT
                sub.subject_name AS name,
                m.marks,
                sub.max_marks
            FROM marks m
            JOIN subjects sub
                ON m.subject_id = sub.subject_id
            WHERE m.student_id = %s
            ORDER BY sub.subject_name
            """,
            (student_id,)
        )

        subject_results = cursor.fetchall()

        # Calculate grade
        percentage = float(result["percentage"] or 0)

        if percentage >= 75:
            grade = "A"
        elif percentage >= 60:
            grade = "B"
        elif percentage >= 50:
            grade = "C"
        elif percentage >= 40:
            grade = "D"
        else:
            grade = "F"

        # Preserve subject count and add subject details
        result["subject_count"] = result["subjects"]
        result["subjects"] = [
            {
                "name": subject["name"],
                "marks": float(subject["marks"]),
                "max_marks": float(subject["max_marks"])
            }
            for subject in subject_results
        ]

        result["average_marks"] = percentage
        result["percentage"] = percentage
        result["grade"] = grade
        result["result"] = "Pass" if percentage >= 40 else "Fail"

        return {
            "logged_in": True,
            "user": {
                "user_id": student["user_id"],
                "name": student["user_name"],
                "email": student["email"]
            },
            "student": {
                "student_id": student["student_id"],
                "roll_no": student["roll_no"],
                "name": student["student_name"]
            },
            "result": result
        }

    finally:
        cursor.close()
        conn.close()


# =========================================================
# TASKS
# =========================================================

@app.get("/tasks")
def get_tasks(request: Request):

    user_id = request.session.get("user_id")

    if not user_id:
        return {
            "logged_in": False,
            "message": "User is not logged in"
        }

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # Get linked student
    cursor.execute(
        """
        SELECT student_id
        FROM users
        WHERE user_id = %s
        """,
        (user_id,)
    )

    user = cursor.fetchone()

    if user is None or user["student_id"] is None:
        cursor.close()
        conn.close()

        return {
            "logged_in": True,
            "tasks": []
        }

    student_id = user["student_id"]

    # Get student's tasks with subject name
    cursor.execute(
        """
        SELECT
            task_id,
            title,
            description,
            subject_name AS subject,
            task_date,
            start_time,
            end_time,
            xp,
            priority,
            repeat_type,
            is_completed,
            created_at,
            completed_at
        FROM tasks
        WHERE student_id = %s
        ORDER BY created_at DESC
        """,
        (student_id,)
    )
    
    tasks = cursor.fetchall()

    cursor.close()
    conn.close()

    return {
        "logged_in": True,
        "tasks": tasks
    }


@app.post("/tasks")
async def create_task(request: Request):

    user_id = request.session.get("user_id")

    if not user_id:
        return {
            "logged_in": False,
            "message": "User is not logged in"
        }

    data = await request.json()

    title = data.get("title")
    subject_name = data.get("subject_name")
    task_date = data.get("task_date")
    start_time = data.get("start_time")
    end_time = data.get("end_time")
    priority = data.get("priority", "Medium")
    repeat_type = data.get("repeat_type", "Once")

    if not title:
        return {
            "success": False,
            "message": "Task name is required"
        }

    # XP according to priority
    if priority == "High":
        xp = 30
    elif priority == "Medium":
        xp = 20
    else:
        xp = 10

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # Get student linked with logged-in user
    cursor.execute(
        """
        SELECT student_id
        FROM users
        WHERE user_id = %s
        """,
        (user_id,)
    )

    user = cursor.fetchone()

    if user is None or user["student_id"] is None:
        cursor.close()
        conn.close()

        return {
            "success": False,
            "message": "No student linked with this account"
        }

    student_id = user["student_id"]

    # Find subject_id using subject name
    

    # Create task
    cursor.execute(
       """
       INSERT INTO tasks
       (
           student_id,
           subject_name,
           title,
           description,
           task_date,
           start_time,
           end_time,
           xp,
           priority,
           repeat_type
       )
       VALUES
       (
           %s, %s, %s, %s, %s,
           %s, %s, %s, %s, %s
       )
       """,
       (
           student_id,
           subject_name,
           title,
           title,
           task_date,
           start_time,
           end_time,
           xp,
           priority,
           repeat_type
       )
   )

    conn.commit()

    task_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return {
        "success": True,
        "task_id": task_id,
        "message": "Task created successfully",
        "xp": xp
    }

@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, request: Request):

    user_id = request.session.get("user_id")

    if not user_id:
        return {
            "success": False,
            "message": "User is not logged in"
        }

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT student_id
        FROM users
        WHERE user_id = %s
        """,
        (user_id,)
    )

    user = cursor.fetchone()

    if user is None or user["student_id"] is None:
        cursor.close()
        conn.close()

        return {
            "success": False,
            "message": "No student linked with this account"
        }

    student_id = user["student_id"]

    cursor.execute(
        """
        DELETE FROM tasks
        WHERE task_id = %s
        AND student_id = %s
        """,
        (task_id, student_id)
    )

    conn.commit()

    deleted_rows = cursor.rowcount

    cursor.close()
    conn.close()

    if deleted_rows == 0:
        return {
            "success": False,
            "message": "Task not found"
        }

    return {
        "success": True,
        "message": "Task deleted successfully"
    }


@app.put("/tasks/{task_id}/complete")
def complete_task(task_id: int, request: Request):

    user_id = request.session.get("user_id")

    if not user_id:
        return {
            "logged_in": False,
            "message": "User is not logged in"
        }

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # Get student's ID
    cursor.execute(
        """
        SELECT student_id
        FROM users
        WHERE user_id = %s
        """,
        (user_id,)
    )

    user = cursor.fetchone()

    if user is None or user["student_id"] is None:
        cursor.close()
        conn.close()

        return {
            "success": False,
            "message": "No student linked with this account"
        }

    student_id = user["student_id"]

    # Check task belongs to this student
    cursor.execute(
        """
        SELECT task_id, xp, is_completed
        FROM tasks
        WHERE task_id = %s
        AND student_id = %s
        """,
        (task_id, student_id)
    )

    task = cursor.fetchone()

    if task is None:
        cursor.close()
        conn.close()

        return {
            "success": False,
            "message": "Task not found"
        }

    if task["is_completed"]:
        cursor.close()
        conn.close()

        return {
            "success": False,
            "message": "Task already completed"
        }

    # Mark task completed
    cursor.execute(
        """
        UPDATE tasks
        SET
            is_completed = TRUE,
            completed_at = CURRENT_TIMESTAMP
        WHERE task_id = %s
        """,
        (task_id,)
    )

    conn.commit()

    cursor.close()
    conn.close()

    return {
        "success": True,
        "xp_earned": task["xp"],
        "message": "Task completed successfully"
    }  

# =========================================================
# BASIC ROUTES
# =========================================================

@app.get("/")
def home():
    return {
        "message": "Student Result Analyzer API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


# =========================================================
# DATABASE TEST
# =========================================================

@app.get("/db-test")
def db_test():

    connection = get_db_connection()

    cursor = connection.cursor()

    cursor.execute("SELECT DATABASE()")

    database = cursor.fetchone()[0]

    cursor.close()
    connection.close()

    return {
        "status": "connected",
        "database": database
    }


# =========================================================
# GET ALL STUDENTS
# =========================================================

@app.get("/students")
def get_students():

    conn = get_db_connection()

    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        "SELECT * FROM students LIMIT 100"
    )

    students = cursor.fetchall()

    cursor.close()
    conn.close()

    return students


# =========================================================
# GET SINGLE STUDENT
# =========================================================

@app.get("/students/{student_id}")
def get_student(student_id: int):

    conn = get_db_connection()

    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT *
        FROM students
        WHERE student_id = %s
        """,
        (student_id,)
    )

    student = cursor.fetchone()

    cursor.close()
    conn.close()

    if student is None:
        return {
            "error": "Student not found"
        }

    return student


# =========================================================
# GET STUDENT MARKS
# =========================================================

@app.get("/students/{student_id}/marks")
def get_student_marks(student_id: int):

    conn = get_db_connection()

    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT
            s.student_id,
            s.roll_no,
            s.name,
            sub.subject_code,
            sub.subject_name,
            m.marks
        FROM students s
        JOIN marks m
            ON s.student_id = m.student_id
        JOIN subjects sub
            ON m.subject_id = sub.subject_id
        WHERE s.student_id = %s
        ORDER BY sub.subject_id
        """,
        (student_id,)
    )

    marks = cursor.fetchall()

    cursor.close()
    conn.close()

    if not marks:
        return {
            "message": "No marks found for this student"
        }

    return marks


# =========================================================
# GET STUDENT RESULT
# =========================================================

@app.get("/students/{student_id}/result")
def get_student_result(student_id: int):

    conn = get_db_connection()

    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT
            s.student_id,
            s.roll_no,
            s.name,
            COUNT(m.mark_id) AS subjects,
            ROUND(SUM(m.marks), 2) AS total_marks,
            ROUND(AVG(m.marks), 2) AS average_marks,
            ROUND(AVG(m.marks), 2) AS percentage
        FROM students s
        JOIN marks m
            ON s.student_id = m.student_id
        WHERE s.student_id = %s
        GROUP BY
            s.student_id,
            s.roll_no,
            s.name
        """,
        (student_id,)
    )

    result = cursor.fetchone()

    cursor.close()
    conn.close()

    if result is None:
        return {
            "message": "Student result not found"
        }

    percentage = float(result["percentage"])

    # Grade calculation
    if percentage >= 75:
        grade = "A"
    elif percentage >= 60:
        grade = "B"
    elif percentage >= 50:
        grade = "C"
    elif percentage >= 40:
        grade = "D"
    else:
        grade = "F"

    result["grade"] = grade

    result["result"] = (
        "Pass"
        if percentage >= 40
        else "Fail"
    )

    return result


# =========================================================
# STATISTICS
# =========================================================

@app.get("/statistics")
def get_statistics():

    conn = get_db_connection()

    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT

            (
                SELECT COUNT(*)
                FROM students
            ) AS total_students,

            (
                SELECT COUNT(*)
                FROM subjects
            ) AS total_subjects,

            (
                SELECT COUNT(*)
                FROM marks
            ) AS total_marks_records,

            (
                SELECT COUNT(*)
                FROM (
                    SELECT student_id
                    FROM marks
                    GROUP BY student_id
                    HAVING AVG(marks) >= 40
                ) AS passed
            ) AS passed_students,

            (
                SELECT COUNT(*)
                FROM (
                    SELECT student_id
                    FROM marks
                    GROUP BY student_id
                    HAVING AVG(marks) < 40
                ) AS failed
            ) AS failed_students,

            (
                SELECT ROUND(AVG(marks), 2)
                FROM marks
            ) AS overall_average;
        """
    )

    statistics = cursor.fetchone()

    cursor.close()
    conn.close()

    return statistics


# =========================================================
# GOOGLE LOGIN
# =========================================================

@app.get("/auth/google")
def google_login(request: Request):

    client_config_json = os.getenv("GOOGLE_CLIENT_CONFIG_JSON")
    
    if client_config_json:
        flow = Flow.from_client_config(
            json.loads(client_config_json),
            scopes=GOOGLE_SCOPES
        )
    else:
        flow = Flow.from_client_secrets_file(
            GOOGLE_CLIENT_SECRETS_FILE,
            scopes=GOOGLE_SCOPES
        )

    flow.redirect_uri = GOOGLE_REDIRECT_URI

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="select_account"
    )

    # Save BOTH state and PKCE code verifier
    request.session["oauth_state"] = state
    request.session["code_verifier"] = flow.code_verifier

    return RedirectResponse(
        url=authorization_url
    )


# =========================================================
# GOOGLE CALLBACK
# =========================================================

@app.get("/auth/google/callback")
def google_callback(
    request: Request,
    code: str,
    state: str
):
    # Get saved OAuth values
    saved_state = request.session.get("oauth_state")
    saved_code_verifier = request.session.get("code_verifier")

    # Check state
    if not saved_state or state != saved_state:
        return {
            "error": "Invalid OAuth state. Please login again."
        }

    # Check PKCE verifier
    if not saved_code_verifier:
        return {
            "error": "Missing OAuth code verifier. Please login again."
        }

    # Recreate the Flow WITH the original code verifier
    flow = Flow.from_client_secrets_file(
        GOOGLE_CLIENT_SECRETS_FILE,
        scopes=GOOGLE_SCOPES,
        state=saved_state,
        code_verifier=saved_code_verifier
    )

    flow.redirect_uri = GOOGLE_REDIRECT_URI

    # Exchange authorization code for tokens
    flow.fetch_token(
        code=code
    )

    credentials = flow.credentials

    # Verify Google ID token
    id_info = id_token.verify_oauth2_token(
        credentials.id_token,
        requests.Request(),
        clock_skew_in_seconds=10
    )

    # Google user information
    google_id = id_info["sub"]
    name = id_info.get("name")
    email = id_info.get("email")
    picture = id_info.get("picture")

    # =====================================================
    # SAVE / CHECK USER IN MYSQL
    # =====================================================

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    # Check whether user already exists
    cursor.execute(
        """
        SELECT user_id
        FROM users
        WHERE google_id = %s OR email = %s
        LIMIT 1
        """,
        (google_id, email)
    )

    existing_user = cursor.fetchone()

    if existing_user:
        # Existing user → update login information
        user_id = existing_user["user_id"]

        cursor.execute(
            """
            UPDATE users
            SET
                google_id = %s,
                name = %s,
                email = %s,
                picture = %s,
                last_login = NOW()
            WHERE user_id = %s
            """,
            (
                google_id,
                name,
                email,
                picture,
                user_id
            )
        )

        user_status = "existing_user"

    else:
        # New user → create account
        cursor.execute(
            """
            INSERT INTO users
            (
                google_id,
                name,
                email,
                picture
            )
            VALUES (%s, %s, %s, %s)
            """,
            (
                google_id,
                name,
                email,
                picture
            )
        )

        user_id = cursor.lastrowid
        user_status = "new_user"

    conn.commit()

    cursor.close()
    conn.close()

    # =====================================================
    # SAVE LOGGED-IN USER IN SESSION
    # =====================================================

    request.session["user_id"] = user_id
    request.session["google_id"] = google_id
    request.session["user_name"] = name
    request.session["user_email"] = email
    request.session["user_picture"] = picture

    # Remove OAuth data after successful login
    request.session.pop("oauth_state", None)
    request.session.pop("code_verifier", None)

    return RedirectResponse(
    url=f"http://127.0.0.1:5500/index.html?google_login_success&user_id={user_id}"
)
