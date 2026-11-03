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
- Responsive dashboard (desktop + mobile)

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MySQL

## Project Structure

student-result-analyzer/
├── frontend/ # HTML, CSS, JS
├── backend/
│ ├── server.js
│ ├── config/
│ │ └── db.js
│ ├── routes/
│ ├── middleware/
│ └── .env.example
└── database/
└── result_analyzer_export.sql


## Setup (Backend)

```bash
cd backend
npm install
# create a .env file with your own DB credentials (see .env.example)
npx nodemon server.js
```

Import `database/result_analyzer_export.sql` into your own local MySQL server before running the backend.

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