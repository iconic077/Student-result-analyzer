# Student Result Analyzer

A web-based student result analysis and gamified study planner, built as a BCA (AI & ML) group project at Vidya University, Meerut.

## Overview

Student Result Analyzer automates the calculation and analysis of student academic results — total marks, average, percentage, grade, and pass/fail status — while also helping students identify weak subjects and build consistent study habits through tasks, XP, streaks, and rewards.

## Features

- Role-based login (student, teacher, admin)
- Add/edit/delete student and subject records
- Automatic result calculation: total, average, percentage, grade
- Subject-wise performance analysis (highest/lowest scoring subjects)
- Daily study tasks — auto-generated from weak subjects or added manually
- Custom Study Planner with recurring weekly schedules
- XP, streaks, and auto-unlocked badges for consistency
- Google accounts without a linked student record receive a personal profile with an app-generated `SS-<user_id>` roll number for task tracking
- Responsive dashboard (desktop + mobile)

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python, FastAPI
- **Database:** MySQL

## Project Structure

```text
frontend/
  index.html
  css/style.css
  js/app.js
backend/
  main.py
  auth_extra.py
  security.py
  students_crud.py
  requirements.txt
```

## Setup (Backend)

1. Install Python and MySQL, and configure the required database tables.
2. Set `backend/.env` with `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`,
   `DB_NAME`, `SESSION_SECRET`, and `JWT_SECRET`. Configure Google OAuth values
   if Google sign-in is needed.
3. From the repository root, run:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

Open `http://127.0.0.1:8000/` to use the app. FastAPI serves the frontend and API
from the same origin. This repository does not include a database export; the
MySQL tables used by the API must be created separately.

After changing backend routes, redeploy the `studysync-api` service on Render.
The hosted frontend cannot use email/password login or registration until the
deployed API includes the `/auth/login` and `/auth/register` routes.

## Password recovery

The password reset endpoints send a six-digit code by email. Configure these environment variables for the backend:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, and `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL` and `SMTP_USE_TLS` (`true` by default)
- `JWT_SECRET` to securely hash reset codes

Reset codes expire after 10 minutes, and another code can be requested after 60 seconds. The backend creates its `password_reset_codes` table automatically.

## Team

- Aditi Devrani
- Nishu
- Harsh Ram
- Rudhra Rajput

**Supervisor:** Miss Sandhya Kumari
**Course:** BCA (Artificial Intelligence & Machine Learning), Batch 2025–2028

Save this as your README.md, then:

bash
git add README.md
git commit -m "Add project README"
git push