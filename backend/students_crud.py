"""
students_crud.py
=========================================================
Student ADD / EDIT / DELETE routes — protected by role.
His existing main.py only has GET /students and
GET /students/{id} (read-only). This fills that gap.

Add to main.py:
    from students_crud import router as students_crud_router
    app.include_router(students_crud_router)
=========================================================
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from security import require_role

import mysql.connector
import os

router = APIRouter(prefix="/students", tags=["students-crud"])


def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME")
    )


# =========================================================
# REQUEST SCHEMAS
# =========================================================

class CreateStudentRequest(BaseModel):
    roll_no: str
    name: str


class UpdateStudentRequest(BaseModel):
    roll_no: Optional[str] = None
    name: Optional[str] = None


# =========================================================
# CREATE — teacher/admin only
# =========================================================

@router.post("")
def create_student(
    data: CreateStudentRequest,
    user: dict = Depends(require_role("teacher", "admin"))
):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            INSERT INTO students (roll_no, name)
            VALUES (%s, %s)
            """,
            (data.roll_no, data.name)
        )

        conn.commit()

        return {
            "success": True,
            "student_id": cursor.lastrowid
        }

    finally:
        cursor.close()
        conn.close()


# =========================================================
# UPDATE — teacher/admin only
# =========================================================

@router.put("/{student_id}")
def update_student(
    student_id: int,
    data: UpdateStudentRequest,
    user: dict = Depends(require_role("teacher", "admin"))
):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT student_id FROM students WHERE student_id = %s",
            (student_id,)
        )

        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Student not found")

        fields = []
        values = []

        if data.roll_no is not None:
            fields.append("roll_no = %s")
            values.append(data.roll_no)

        if data.name is not None:
            fields.append("name = %s")
            values.append(data.name)

        if not fields:
            raise HTTPException(status_code=400, detail="Nothing to update")

        values.append(student_id)

        cursor.execute(
            f"UPDATE students SET {', '.join(fields)} WHERE student_id = %s",
            tuple(values)
        )

        conn.commit()

        return {"success": True}

    finally:
        cursor.close()
        conn.close()


# =========================================================
# DELETE — teacher/admin only
# =========================================================

@router.delete("/{student_id}")
def delete_student(
    student_id: int,
    user: dict = Depends(require_role("teacher", "admin"))
):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            "DELETE FROM students WHERE student_id = %s",
            (student_id,)
        )

        conn.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Student not found")

        return {"success": True}

    finally:
        cursor.close()
        conn.close()