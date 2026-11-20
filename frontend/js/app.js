/* =========================================================
   STUDYSYNC - STUDENT PERFORMANCE ANALYZER
   ========================================================= */


/* =========================================================
   STORAGE KEYS
   ========================================================= */

const RESULT_KEY = "studysync_result";
const TASK_KEY = "studysync_tasks";
const XP_KEY = "studysync_xp";
const PLANNER_KEY = "studysync_planner";
const LEGACY_AUTH_USER_KEY = "studysync_user";

const XP_BY_PRIORITY = {
    Low: 10,
    Medium: 20,
    High: 30
};


/* =========================================================
   STATE
   ========================================================= */

let subjects = [];
let tasks = [];
let editingTaskId = null;
const API_BASE = window.location.protocol === "file:"
    ? "https://student-result-analyzer-6yst.onrender.com"
    : ["localhost", "127.0.0.1"].includes(window.location.hostname)
        ? `${window.location.protocol}//${window.location.hostname}:8000`
        : window.location.origin;
let currentUser = null;


/* =========================================================
   INITIALIZATION
   ========================================================= */


document.addEventListener("DOMContentLoaded", async () => {

    setupAuth();
    setupProfileMenu();
    setupNavigation();
    setupActivityCalendar();
    setupResultSystem();
    setupTaskSystem();
    setupPlanner();
    setupSettings();
    setupIOSGlassSheen();

    const params = new URLSearchParams(window.location.search);
    const googleLoginCompleted =
        params.get("google_login") === "success" && params.get("user_id");

    if (googleLoginCompleted) {
        localStorage.setItem("studysync_google_user_id", params.get("user_id"));
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const googleUser = await fetchGoogleSession();

    if (googleUser) {
        await loadMyResult();
        showDashboard();
    } else {
        localStorage.removeItem("studysync_google_user_id");
        localStorage.removeItem("studysync_logged_in");
        sessionStorage.removeItem("studysync_logged_in");
        showLogin();
    }

});


/* =========================================================
   AUTHENTICATION SYSTEM
   ========================================================= */

function setupAuth() {

    const loginForm =
        document.getElementById("loginForm");
    const registerForm =
        document.getElementById("registerForm");
    const showRegisterBtn =
        document.getElementById("showRegisterBtn");
    const showLoginBtn =
        document.getElementById("showLoginBtn");
    const loginPasswordToggle =
        document.getElementById("loginPasswordToggle");
    const registerPasswordToggle =
        document.getElementById("registerPasswordToggle");
    const registerConfirmPasswordToggle =
        document.getElementById(
            "registerConfirmPasswordToggle"
        );
    const forgotPasswordBtn =
        document.getElementById("forgotPasswordBtn");
    const passwordResetRequestForm =
        document.getElementById("passwordResetRequestForm");
    const passwordResetForm =
        document.getElementById("passwordResetForm");
    const resendPasswordResetCodeBtn =
        document.getElementById("resendPasswordResetCodeBtn");
    const backToLoginBtn =
        document.getElementById("backToLoginBtn");
    const googleLoginBtn =
        document.getElementById("googleLoginBtn");

    if (loginForm) {
        loginForm.addEventListener(
            "submit",
            handleLogin
        );
    }

    if (registerForm) {
        registerForm.addEventListener(
            "submit",
            handleRegister
        );
    }

    if (showRegisterBtn) {
        showRegisterBtn.addEventListener(
            "click",
            showRegister
        );
    }

    if (showLoginBtn) {
        showLoginBtn.addEventListener(
            "click",
            showLogin
        );
    }

    if (loginPasswordToggle) {
        loginPasswordToggle.addEventListener(
            "click",
            () => togglePassword(
                "loginPassword",
                loginPasswordToggle
            )
        );
    }

    if (registerPasswordToggle) {

        registerPasswordToggle.addEventListener(
                    "click",
            () => togglePassword(
                "registerPassword",
                registerPasswordToggle
            )
    );
    }

    if (registerConfirmPasswordToggle) {
        registerConfirmPasswordToggle.addEventListener(
            "click",
            () => togglePassword(
                "registerConfirmPassword",
                registerConfirmPasswordToggle
            )
        );
    }

    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener(
            "click",
            handleForgotPassword
        );
    }

    if (passwordResetRequestForm) {
        passwordResetRequestForm.addEventListener(
            "submit",
            handlePasswordResetRequest
        );
    }

    if (passwordResetForm) {
        passwordResetForm.addEventListener(
            "submit",
            handlePasswordResetConfirm
        );
    }

    if (resendPasswordResetCodeBtn) {
        resendPasswordResetCodeBtn.addEventListener(
            "click",
            handlePasswordResetResend
        );
    }

    if (backToLoginBtn) {
        backToLoginBtn.addEventListener("click", showLogin);
    }

    if (googleLoginBtn) {
        googleLoginBtn.addEventListener(
            "click",
            handleGoogleLogin
        );
    }
}

async function checkLoginStatus() {
    try {
        const response = await fetch(
            `${API_BASE}/me`,
            {
                credentials: "include"
            }
        );

        const data = await response.json();

        console.log("Login Status:", data);

        if (data.logged_in) {
            console.log("User is logged in:", data.user);

            document.getElementById("authScreen").style.display = "none";
        }else {
            console.log("User is not logged in");
        } 

    } catch (error) {
        console.error("Login check failed:", error);
    }
}

async function loadMyResult() {
    try {
        const response = await fetch(`${API_BASE}/me/result`, {
            credentials: "include"
        });
        const data = await response.json();

        if (!data.logged_in || !data.result || !data.result.subjects) return;

        const apiResult = data.result;
        const subjectList = apiResult.subjects.map(s => ({
            name: s.name,
            marks: s.marks,
            max_marks: s.max_marks
        }));

        if (subjectList.length === 0) return;

        const sortedDesc = [...subjectList].sort((a, b) => b.marks - a.marks);
        const sortedAsc = [...subjectList].sort((a, b) => a.marks - b.marks);

        const saved = {
            studentName: data.student?.name ?? data.user?.name ?? "Student",
            subjects: subjectList,
            total: Number(apiResult.total_marks ?? 0),
            average: Number(apiResult.percentage ?? 0),
            percentage: Number(apiResult.percentage ?? 0),
            grade: apiResult.grade,
            passed: apiResult.result === "Pass",
            highest: sortedDesc[0],
            lowest: sortedAsc[0],
            updatedAt: new Date().toISOString()
        };

        localStorage.setItem(RESULT_KEY, JSON.stringify(saved));

    } catch (error) {
        console.error("Failed to load result:", error);
    }
}


/* =========================================================
   LOGIN
   ========================================================= */

async function handleLogin(event) {
    event.preventDefault();
    const loginValue =
        document.getElementById("loginEmail")
            .value
            .trim();
    const password =
        document.getElementById("loginPassword")
            .value;

    if (!loginValue || !password) {
        alert("Please enter your login details.");
        return;
    }

    const submitButton = event.currentTarget.querySelector(
        'button[type="submit"]'
    );
    submitButton.disabled = true;
    try {
        let data;
        try {
            data = await submitAuthRequest("/login", {
                email: loginValue,
                password
            });
        } catch (error) {
            const legacyUser = getLegacyAuthUser();
            if (
                error.status !== 401 ||
                !legacyUser ||
                legacyUser.email?.toLowerCase() !== loginValue.toLowerCase() ||
                legacyUser.password !== password
            ) {
                throw error;
            }

            data = await submitAuthRequest("/register", {
                name: legacyUser.name,
                email: legacyUser.email,
                password: legacyUser.password
            });
        }

        currentUser = data.user;
        localStorage.removeItem(LEGACY_AUTH_USER_KEY);
        await loadMyResult();
        showDashboard();
    } catch (error) {
        alert(error instanceof Error ? error.message : "Could not log in.");
    } finally {
        submitButton.disabled = false;
    }
}

async function submitAuthRequest(endpoint, payload) {
    const response = await fetch(`${API_BASE}/auth${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
    });

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`The server returned an invalid response (${response.status}).`);
    }

    if (!response.ok) {
        if (response.status === 404 || response.status === 405) {
            const action = endpoint === "/login"
                ? "Email/password login"
                : "Account registration";
            throw new Error(
                `${action} is not enabled on the deployed backend yet. Redeploy the updated backend, or use Continue with Google.`
            );
        }

        const error = new Error(
            data.detail || data.message || "The request could not be completed."
        );
        error.status = response.status;
        throw error;
    }

    if (!data.success || !data.user) {
        throw new Error(data.message || "The server did not confirm the account operation.");
    }

    return data;
}

/* =========================================================
   GOOGLE LOGIN
   ========================================================= */

function handleGoogleLogin() {
    window.location.href = `${API_BASE}/auth/google`;
}


async function fetchGoogleSession() {
    try {
        const response = await fetch(`${API_BASE}/me`, {
            credentials: "include"
        });
        const data = await response.json();

        if (!data.logged_in) return null;

        currentUser = data.user;
        return data.user;

    } catch (error) {
        console.error("Session check failed:", error);
        return null;
    }
}


async function logout() {
    let serverLogoutFailed = false;

    try {
        const response = await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(`Logout failed with status ${response.status}`);
        }
    } catch (error) {
        console.error("Logout request failed:", error);
        serverLogoutFailed = true;
    }

    localStorage.removeItem("studysync_logged_in");
    localStorage.removeItem("studysync_google_user_id");
    localStorage.removeItem("studysync_remember");
    sessionStorage.removeItem("studysync_logged_in");

    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    if (loginForm) loginForm.reset();
    if (registerForm) registerForm.reset();

    currentUser = null;
    showLogin();

    if (serverLogoutFailed) {
        alert("You are signed out on this device, but server sign-out could not be confirmed.");
    }
}


function setupProfileMenu() {

    const profileBtn = document.getElementById("profileBtn");
    const menu = document.getElementById("profileMenu");
    const menuLogout = document.getElementById("profileLogoutBtn");
    const settingsLogout = document.getElementById("logoutBtn");

    if (profileBtn && menu) {

        profileBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            menu.classList.toggle("hidden");
        });

        document.addEventListener("click", (event) => {
            if (!menu.contains(event.target)) {
                menu.classList.add("hidden");
            }
        });

    }

    if (menuLogout) menuLogout.addEventListener("click", logout);
    if (settingsLogout) settingsLogout.addEventListener("click", logout);

}


/* =========================================================
   REGISTER
   ========================================================= */

async function handleRegister(event) {
    event.preventDefault();
    const name =
        document.getElementById("registerName")
            .value
            .trim();
    const email =
        document.getElementById("registerEmail")
            .value
            .trim();
    const password =
        document.getElementById("registerPassword")
            .value;
    const confirmPassword =
        document.getElementById(
            "registerConfirmPassword"
        ).value;

    if (
        !name ||
        !email ||
        !password ||
        !confirmPassword
    ) {
        alert(
            "Please fill all required fields."
        );
        return;
    }

    if (password.length < 6) {
        alert(
            "Password should contain at least 6 characters."
        );
        return;
    }

    if (password !== confirmPassword) {
        alert(
            "Passwords do not match."
        );
        return;
    }

    const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
        alert(
            "Please enter a valid email address."
        );
        return;
    }

    const submitButton = event.currentTarget.querySelector(
        'button[type="submit"]'
    );
    submitButton.disabled = true;
    try {
        const data = await submitAuthRequest("/register", {
            name,
            email,
            password
        });
        currentUser = data.user;
        localStorage.removeItem(LEGACY_AUTH_USER_KEY);
        showDashboard();
    } catch (error) {
        alert(error instanceof Error ? error.message : "Could not create the account.");
    } finally {
        submitButton.disabled = false;
    }
}

function getLegacyAuthUser() {
    const storedUser = localStorage.getItem(LEGACY_AUTH_USER_KEY);
    if (!storedUser) return null;

    try {
        return JSON.parse(storedUser);
    } catch (error) {
        console.error("Could not read the previous local account:", error);
        return null;
    }
}


/* =========================================================
   LOGIN / REGISTER UI
   ========================================================= */

function showLogin() {

    const authScreen =
        document.getElementById("authScreen");

    const loginCard =
        document.getElementById("loginCard");

    const registerCard =
        document.getElementById("registerCard");
    const passwordResetCard =
        document.getElementById("passwordResetCard");


    if (!authScreen) return;


    authScreen.classList.remove("hidden");


    if (loginCard) {

        loginCard.classList.remove("hidden");

    }


    if (registerCard) {

        registerCard.classList.add("hidden");

    }

    if (passwordResetCard) {

        passwordResetCard.classList.add("hidden");

    }

}


function showRegister() {

    const authScreen =
        document.getElementById("authScreen");

    const loginCard =
        document.getElementById("loginCard");

    const registerCard =
        document.getElementById("registerCard");
    const passwordResetCard =
        document.getElementById("passwordResetCard");


    if (!authScreen) return;


    authScreen.classList.remove("hidden");


    if (loginCard) {

        loginCard.classList.add("hidden");

    }


    if (registerCard) {

        registerCard.classList.remove("hidden");

    }

    if (passwordResetCard) {

        passwordResetCard.classList.add("hidden");

    }

}


/* =========================================================
   PASSWORD TOGGLE
   ========================================================= */

function togglePassword(
    inputId,
    button
) {

    const input =
        document.getElementById(inputId);


    if (!input) return;


    if (input.type === "password") {

        input.type = "text";

        button.textContent = "🙈";

    } else {

        input.type = "password";

        button.textContent = "👁️";

    }

}


/* =========================================================
   FORGOT PASSWORD
   ========================================================= */

function handleForgotPassword() {
    const authScreen = document.getElementById("authScreen");
    const loginCard = document.getElementById("loginCard");
    const registerCard = document.getElementById("registerCard");
    const passwordResetCard = document.getElementById("passwordResetCard");
    const loginEmail = document.getElementById("loginEmail");
    const passwordResetEmail = document.getElementById("passwordResetEmail");
    const requestForm = document.getElementById("passwordResetRequestForm");
    const resetForm = document.getElementById("passwordResetForm");
    const status = document.getElementById("passwordResetStatus");

    if (!authScreen || !passwordResetCard) return;

    authScreen.classList.remove("hidden");
    if (loginCard) loginCard.classList.add("hidden");
    if (registerCard) registerCard.classList.add("hidden");
    passwordResetCard.classList.remove("hidden");
    if (loginEmail && passwordResetEmail) {
        const enteredEmail = loginEmail.value.trim();
        passwordResetEmail.value =
            enteredEmail && loginEmail.checkValidity() ? enteredEmail : "";
    }
    if (requestForm) requestForm.classList.remove("hidden");
    if (resetForm) resetForm.classList.add("hidden");
    if (status) {
        status.textContent = "";
        status.className = "password-reset-status";
    }
}

function setPasswordResetStatus(message, type) {
    const status = document.getElementById("passwordResetStatus");
    if (!status) return;

    status.textContent = message;
    status.className = `password-reset-status ${type}`;
}

async function requestPasswordResetCode(email) {
    const response = await fetch(`${API_BASE}/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email })
    });
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.detail || "Could not request a password reset code.");
    }

    return data;
}

async function handlePasswordResetRequest(event) {
    event.preventDefault();

    const email = document.getElementById("passwordResetEmail").value.trim();
    const requestForm = event.currentTarget;
    const submitButton = requestForm.querySelector('button[type="submit"]');
    const resetForm = document.getElementById("passwordResetForm");

    submitButton.disabled = true;
    try {
        const data = await requestPasswordResetCode(email);
        setPasswordResetStatus(
            `${data.message} Check your inbox and spam folder. If you already requested a code, wait a minute before requesting another.`,
            "success"
        );
        requestForm.classList.add("hidden");
        resetForm.classList.remove("hidden");
    } catch (error) {
        setPasswordResetStatus(
            error instanceof Error ? error.message : "Could not request a password reset code.",
            "error"
        );
    } finally {
        submitButton.disabled = false;
    }
}

async function handlePasswordResetResend(event) {
    const email = document.getElementById("passwordResetEmail").value.trim();
    const resendButton = event.currentTarget;

    resendButton.disabled = true;
    try {
        const data = await requestPasswordResetCode(email);
        setPasswordResetStatus(
            `${data.message} Check your inbox and spam folder. If you already requested a code, wait a minute before requesting another.`,
            "success"
        );
    } catch (error) {
        setPasswordResetStatus(
            error instanceof Error ? error.message : "Could not request a new code.",
            "error"
        );
    } finally {
        resendButton.disabled = false;
    }
}

async function handlePasswordResetConfirm(event) {
    event.preventDefault();

    const email = document.getElementById("passwordResetEmail").value.trim();
    const code = document.getElementById("passwordResetCode").value.trim();
    const newPassword = document.getElementById("passwordResetNewPassword").value;
    const confirmPassword = document.getElementById("passwordResetConfirmPassword").value;
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');

    if (newPassword !== confirmPassword) {
        setPasswordResetStatus("The passwords do not match.", "error");
        return;
    }

    submitButton.disabled = true;
    try {
        const response = await fetch(`${API_BASE}/auth/password-reset/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                email,
                code,
                new_password: newPassword
            })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || "Could not reset your password.");
        }

        form.reset();
        form.classList.add("hidden");
        document.getElementById("passwordResetRequestForm").classList.add("hidden");
        setPasswordResetStatus(
            `${data.message} You can now sign in with your new password.`,
            "success"
        );
    } catch (error) {
        setPasswordResetStatus(
            error instanceof Error ? error.message : "Could not reset your password.",
            "error"
        );
    } finally {
        submitButton.disabled = false;
    }
}



/* =========================================================
   AUTH HELPERS
   ========================================================= */

/* =========================================================
   SHOW / HIDE DASHBOARD
   ========================================================= */

function showDashboard() {

    const authScreen =
        document.getElementById("authScreen");


    if (authScreen) {

        authScreen.classList.add("hidden");

    }


    initializeApplication();

}


/* =========================================================
   APPLICATION INITIALIZATION
   ========================================================= */

function initializeApplication() {

    loadData();
    loadTasks();
    renderSubjects();
    renderTasks();
    updateDashboard();
    updateAnalytics();
    updateRewards();
    loadPlannerSettings();
    updateProfileUI();
}

/* =========================================================
   iOS SPECULAR GLASS SHEEN
   ========================================================= */

function setupIOSGlassSheen() {

    const glassTargets = document.querySelectorAll(
        ".stat-card, .panel, .form-panel, .auth-card, .reward-card"
    );

    glassTargets.forEach((card) => {

        card.addEventListener("pointermove", (event) => {
            const rect = card.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;

            card.style.background = `
                radial-gradient(
                    circle at ${x}% ${y}%,
                    rgba(255, 255, 255, 0.14),
                    rgba(255, 255, 255, 0.05) 55%
                )
            `;
        });

        card.addEventListener("pointerleave", () => {
            card.style.background = "";
        });

    });

}


/* =========================================================
   LOCAL STORAGE
   ========================================================= */

function loadData() {

    const savedResult =
        localStorage.getItem(
            RESULT_KEY
        );

    const savedTasks =
        localStorage.getItem(
            TASK_KEY
        );


    if (savedResult) {

        try {

            const result =
                JSON.parse(savedResult);

            subjects =
                result.subjects || [];


            const studentNameInput =
                document.getElementById(
                    "studentName"
                );


            if (studentNameInput) {

                studentNameInput.value =
                    result.studentName || "";

            }


            showSavedResult(result);

        } catch (error) {

            console.error(
                "Could not load saved result:",
                error
            );

        }

    }


    if (savedTasks) {

        try {

            tasks =
                JSON.parse(savedTasks);


            if (!Array.isArray(tasks)) {

                tasks = [];

            }

        } catch (error) {

            console.error(
                "Could not load tasks:",
                error
            );

            tasks = [];

        }

    }

}


function saveTasks() {

    localStorage.setItem(
        TASK_KEY,
        JSON.stringify(tasks)
    );

}


function getXP() {

    let completedXP = 0;


    tasks.forEach(task => {

        if (task.completed) {

            completedXP +=
                XP_BY_PRIORITY[
                    task.priority
                ] || 0;

        }

    });


    localStorage.setItem(
        XP_KEY,
        completedXP
    );


    return completedXP;

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function setupNavigation() {

    const navItems =
        document.querySelectorAll(
            ".nav-item"
        );


    navItems.forEach(item => {

        item.addEventListener(
            "click",
            () => {

                const sectionName =
                    item.dataset.section;


                navItems.forEach(nav =>
                    nav.classList.remove(
                        "active"
                    )
                );


                item.classList.add(
                    "active"
                );


                document.querySelectorAll(".page-section").forEach(section => {
                    section.classList.remove("active");
                    section.style.display = "";
                });


                const target =
                    document.getElementById(
                        sectionName
                    );


                if (target) {

                    target.classList.add(
                        "active"
                    );

                }


                updatePageTitle(
                    sectionName
                );


                if (sectionName === "analytics") {
                    updateAnalytics();
                } else if (sectionName === "dashboard") {
                    updateDashboard();
                } else if (sectionName === "tasks") {
                    loadTasks();
                } else if (sectionName === "rewards") {
                    updateRewards();
                }

            }
        );

    });

}


function openTasksForDate(date) {
    const taskDate = document.getElementById("taskDate");
    const taskName = document.getElementById("taskName");
    const tasksNavItem = document.querySelector(
        '.nav-item[data-section="tasks"]'
    );

    if (taskDate) {
        taskDate.value = date;
    }

    if (tasksNavItem) {
        tasksNavItem.click();
    }

    if (taskName) {
        taskName.scrollIntoView({ behavior: "smooth", block: "center" });
        taskName.focus({ preventScroll: true });
    }
}


function updatePageTitle(section) {

    const titles = {

        dashboard: [
            "Dashboard",
            "Your academic overview"
        ],

        results: [
            "Results",
            "Analyze your academic performance"
        ],

        analytics: [
            "Analytics",
            "Performance insights and study progress"
        ],

        planner: [
            "Study Planner",
            "Create your personalized study routine"
        ],

        tasks: [
            "Daily Tasks",
            "Manage your study goals"
        ],

        rewards: [
            "Rewards",
            "XP, badges and achievements"
        ],

        settings: [
            "Settings",
            "Manage your StudySync data"
        ]

    };


    const data =
        titles[section] ||
        titles.dashboard;


    document.getElementById(
        "pageTitle"
    ).textContent = data[0];


    document.getElementById(
        "pageSubtitle"
    ).textContent = data[1];

}


/* =========================================================
   RESULT ANALYZER
   ========================================================= */

function setupResultSystem() {

    const addSubjectBtn =
        document.getElementById(
            "addSubjectBtn"
        );

    const analyzeBtn =
        document.getElementById(
            "analyzeBtn"
        );


    if (addSubjectBtn) {

        addSubjectBtn.addEventListener(
            "click",
            () => {

                subjects.push({
                    name: "",
                    marks: ""
                });

                renderSubjects();

            }
        );

    }


    if (analyzeBtn) {

        analyzeBtn.addEventListener(
            "click",
            analyzeResult
        );

    }

}


function renderSubjects() {

    const container =
        document.getElementById(
            "subjectsContainer"
        );


    if (!container) return;


    if (subjects.length === 0) {

        subjects = [

            {
                name: "",
                marks: ""
            },

            {
                name: "",
                marks: ""
            }

        ];

    }


    container.innerHTML = "";


    subjects.forEach(
        (subject, index) => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "subject-row";


            row.innerHTML = `

                <input
                    type="text"
                    placeholder="Subject name"
                    value="${escapeHTML(
                        subject.name
                    )}"
                    data-index="${index}"
                    data-type="name"
                >

                <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Marks"
                    value="${subject.marks}"
                    data-index="${index}"
                    data-type="marks"
                >

                <button
                    class="remove-subject"
                    data-index="${index}"
                >
                    ✕
                </button>

            `;


            container.appendChild(row);

        }
    );


    container
        .querySelectorAll("input")
        .forEach(input => {

            input.addEventListener(
                "input",
                event => {

                    const index =
                        Number(
                            event.target.dataset.index
                        );

                    const type =
                        event.target.dataset.type;


                    subjects[index][type] =
                        event.target.value;

                }
            );

        });


    container
        .querySelectorAll(
            ".remove-subject"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(
                            button.dataset.index
                        );


                    if (
                        subjects.length <= 1
                    ) {

                        alert(
                            "At least one subject is required."
                        );

                        return;

                    }


                    subjects.splice(
                        index,
                        1
                    );


                    renderSubjects();

                }
            );

        });

}


function analyzeResult() {

    const studentName =
        document.getElementById(
            "studentName"
        ).value.trim();


    const cleanedSubjects =
        subjects
            .map(subject => ({

                name:
                    subject.name.trim(),

                marks:
                    Number(subject.marks)

            }))
            .filter(
                subject =>
                    subject.name !== ""
            );


    if (!studentName) {

        alert(
            "Please enter student name."
        );

        return;

    }


    if (
        cleanedSubjects.length === 0
    ) {

        alert(
            "Please add at least one subject."
        );

        return;

    }


    const invalid =
        cleanedSubjects.some(
            subject =>
                Number.isNaN(
                    subject.marks
                ) ||
                subject.marks < 0 ||
                subject.marks > 100
        );


    if (invalid) {

        alert(
            "Marks must be between 0 and 100."
        );

        return;

    }


    subjects =
        cleanedSubjects;


    const total =
        subjects.reduce(
            (sum, subject) =>
                sum + subject.marks,
            0
        );


    const average =
        total / subjects.length;


    const grade =
        getGrade(average);


    const passed =
        subjects.every(
            subject =>
                subject.marks >= 33
        );


    const highest =
        [...subjects]
            .sort(
                (a, b) =>
                    b.marks - a.marks
            )[0];


    const lowest =
        [...subjects]
            .sort(
                (a, b) =>
                    a.marks - b.marks
            )[0];


    const result = {

        studentName,

        subjects,

        total,

        average,

        percentage: average,

        grade,

        passed,

        highest,

        lowest,

        updatedAt:
            new Date().toISOString()

    };


    localStorage.setItem(
        RESULT_KEY,
        JSON.stringify(result)
    );


    showSavedResult(result);

    populateSubjects();

    updateDashboard();

    updateAnalytics();

    updateRewards();


    updateProfileUI();


    alert(
        "Result analyzed successfully! 🎉"
    );

}


function getGrade(average) {

    if (average >= 90)
        return "A+";

    if (average >= 80)
        return "A";

    if (average >= 70)
        return "B+";

    if (average >= 60)
        return "B";

    if (average >= 50)
        return "C";

    if (average >= 40)
        return "D";

    return "F";

}


function showSavedResult(result) {

    const output =
        document.getElementById(
            "resultOutput"
        );


    if (!output) return;


    output.classList.remove(
        "hidden"
    );


    document.getElementById(
        "resultTotal"
    ).textContent =
        result.total;


    document.getElementById(
        "resultAverage"
    ).textContent =
        `${result.average.toFixed(2)}%`;


    document.getElementById(
        "resultGrade"
    ).textContent =
        result.grade;


    document.getElementById(
        "resultStatus"
    ).textContent =
        result.passed
            ? "PASS"
            : "FAIL";


    document.getElementById(
        "highestSubject"
    ).innerHTML = `

        ${escapeHTML(
            result.highest.name
        )}

        <span>
            ${result.highest.marks}/100
        </span>

    `;


    document.getElementById(
        "lowestSubject"
    ).innerHTML = `

        ${escapeHTML(
            result.lowest.name
        )}

        <span>
            ${result.lowest.marks}/100
        </span>

    `;


    renderSubjectAnalysis(
        result.subjects
    );

}


function renderSubjectAnalysis(
    subjectList
) {

    const container =
        document.getElementById(
            "subjectAnalysis"
        );


    if (!container) return;


    container.innerHTML = "";


    subjectList.forEach(
        subject => {

            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "subject-analysis-row";


            row.innerHTML = `

                <div
                    class="subject-analysis-top"
                >

                    <strong>
                        ${escapeHTML(
                            subject.name
                        )}
                    </strong>

                    <span>
                        ${subject.marks}/100
                    </span>

                </div>

                <div
                    class="subject-progress"
                >

                    <div
                        class="subject-progress-fill"
                        style="width:${subject.marks}%"
                    ></div>

                </div>

            `;


            container.appendChild(row);

        }
    );

}


/* =========================================================
   SUBJECT DROPDOWN
   ========================================================= */

function populateSubjects() {

    const select =
        document.getElementById(
            "taskSubject"
        );


    if (!select) return;


    const currentValue =
        select.value;


    select.innerHTML =
        `<option value="">
            Select subject
        </option>`;


    subjects.forEach(
        subject => {

            if (!subject.name)
                return;


            const option =
                document.createElement(
                    "option"
                );


            option.value =
                subject.name;


            option.textContent =
                subject.name;


            select.appendChild(
                option
            );

        }
    );


    if (
        [...select.options].some(
            option =>
                option.value ===
                currentValue
        )
    ) {

        select.value =
            currentValue;

    }

}


/* =========================================================
   DAILY TASK SYSTEM
   ========================================================= */

function setupTaskSystem() {

    const saveButton =
        document.getElementById(
            "saveTaskBtn"
        );


    if (!saveButton) return;


    saveButton.addEventListener(
        "click",
        saveTask
    );

}


async function saveTask() {
    console.log("SAVE TASK FUNCTION CALLED");
    
    const name =
        document.getElementById("taskName").value.trim();

    const subject =
        document.getElementById("taskSubject").value;

    const date =
        document.getElementById("taskDate").value;

    const startTime =
        document.getElementById("taskStartTime").value;

    const endTime =
        document.getElementById("taskEndTime").value;

    const priority =
        document.getElementById("taskPriority").value;

    const repeat =
        document.getElementById("taskRepeat").value;


    if (!name) {
        alert("Please enter task name.");
        return;
    }


    if (!date) {
        alert("Please select task date.");
        return;
    }


    try {

        const response = await fetch(
            `${API_BASE}/tasks`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title: name,
                    subject_name: subject,
                    task_date: date,
                    start_time: startTime || null,
                    end_time: endTime || null,
                    priority: priority,
                    repeat_type: repeat
                })
            }
        );


        const data = await response.json();

        console.log("Create Task:", data);


        if (!data.success) {

            alert(
                data.message ||
                "Failed to create task."
            );

            return;
        }


        alert("Task created successfully! 🎉");


        clearTaskForm();

        await loadTasks();

        renderTasks();

        updateDashboard();

        updateAnalytics();

        updateRewards();


    } catch (error) {

        console.error(
            "Failed to create task:",
            error
        );

        alert(
            "Unable to connect with server. Please make sure the backend is running."
        );

    }

}


async function loadTasks() {

    try {

        const response = await fetch(
            `${API_BASE}/tasks`,
            {
                method: "GET",
                credentials: "include"
            }
        );

        const data = await response.json();

        console.log("Tasks from backend:", data);

        if (!data.logged_in || !Array.isArray(data.tasks)) {
            tasks = [];
            renderTasks();
            updateDashboard();
            updateAnalytics();
            updateRewards();
            return;
        }

        tasks = data.tasks.map(task => ({
            id: task.task_id,
            name: task.title,
            subject: task.subject || "",
            date: task.task_date || "",
            startTime: task.start_time || "",
            endTime: task.end_time || "",
            priority: task.priority || "Medium",
            repeat: task.repeat_type || "Once",
            completed: Boolean(task.is_completed),
            completedAt: task.completed_at || null,
            createdAt: task.created_at
        }));

        console.log("Frontend tasks:", tasks);

        renderTasks();
        updateDashboard();
        updateAnalytics();
        updateRewards();

    } catch (error) {

        console.error(
            "Failed to load tasks:",
            error
        );

    }
}


function renderTasks() {

    const container =
        document.getElementById(
            "tasksList"
        );


    if (!container) return;


    container.innerHTML = "";


    const sortedTasks =
        [...tasks].sort(
            (a, b) => {

                const first =
                    `${a.date} ${
                        a.startTime ||
                        "00:00"
                    }`;


                const second =
                    `${b.date} ${
                        b.startTime ||
                        "00:00"
                    }`;


                return first.localeCompare(
                    second
                );

            }
        );


    if (
        sortedTasks.length === 0
    ) {

        container.innerHTML = `

            <div class="empty-state">

                <span>📝</span>

                <p>
                    No tasks yet.
                </p>

            </div>

        `;

    } else {

        sortedTasks.forEach(
            task => {

                container.appendChild(
                    createTaskElement(
                        task
                    )
                );

            }
        );

    }


    const taskCount =
        document.getElementById(
            "taskCount"
        );


    if (taskCount) {

        taskCount.textContent =
            `${tasks.length} ${
                tasks.length === 1
                    ? "task"
                    : "tasks"
            }`;

    }

}


function createTaskElement(task) {

    const div =
        document.createElement(
            "div"
        );


    div.className =
        `task ${
            task.completed
                ? "completed"
                : ""
        }`;


    const xp =
        XP_BY_PRIORITY[
            task.priority
        ] || 0;


    div.innerHTML = `

        <input
            class="task-check"
            type="checkbox"
            ${
                task.completed
                    ? "checked"
                    : ""
            }
            data-task-id="${task.id}"
        >

        <div class="task-main">

            <strong>
                ${escapeHTML(
                    task.name
                )}
            </strong>

            <small>

                ${escapeHTML(
                    task.subject ||
                    "General"
                )}

                •
                ${formatDate(
                    task.date
                )}

                ${
                    task.startTime
                        ? ` • ${task.startTime}`
                        : ""
                }

                ${
                    task.endTime
                        ? ` - ${task.endTime}`
                        : ""
                }

                •

                <span
                    class="priority-${
                        String(
                            task.priority
                        ).toLowerCase()
                    }"
                >
                    ${task.priority}
                </span>

                • +${xp} XP

                ${
                    task.repeat !==
                    "Once"
                        ? ` • ${task.repeat}`
                        : ""
                }

            </small>

        </div>

        <div class="task-actions">

            <button
                title="Edit"
                data-action="edit"
                data-id="${task.id}"
            >
                ✏️
            </button>

            <button
                title="Delete"
                data-action="delete"
                data-id="${task.id}"
            >
                🗑️
            </button>

        </div>

    `;


    const checkbox =
        div.querySelector(
            ".task-check"
        );


    if (checkbox) {

        checkbox.addEventListener(
            "change",
            event => {

                toggleTask(
                    Number(
                        event.target
                            .dataset
                            .taskId
                    ),
                    event.target.checked
                );

            }
        );

    }


    div.querySelectorAll(
        "[data-action]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const id =
                    Number(
                        button.dataset.id
                    );


                if (
                    button.dataset.action ===
                    "edit"
                ) {

                    editTask(id);

                }


                if (
                    button.dataset.action ===
                    "delete"
                ) {

                    deleteTask(id);

                }

            }
        );

    });


    return div;

}


async function toggleTask(id, completed) {

    const task = tasks.find(
        task => task.id === id
    );

    if (!task) return;

    try {

        if (completed) {

            const response = await fetch(
                `${API_BASE}/tasks/${id}/complete`,
                {
                    method: "PUT",
                    credentials: "include"
                }
            );

            const data = await response.json();

            console.log("Complete Task:", data);

            if (!data.success) {
                alert(
                    data.message ||
                    "Failed to complete task."
                );

                renderTasks();
                return;
            }

            task.completed = true;
            task.completedAt =
                new Date().toISOString();

        } else {

            // Unchecking is handled locally for now
            task.completed = false;
            task.completedAt = null;
        }

        saveTasks();

        renderTasks();
        updateDashboard();
        updateAnalytics();
        updateRewards();

    } catch (error) {

        console.error(
            "Failed to update task:",
            error
        );

        alert(
            "Unable to connect with server."
        );

        renderTasks();
    }
}


async function deleteTask(id) {

    const confirmed = confirm("Delete this task?");

    if (!confirmed) return;

    try {

        const response = await fetch(
            `${API_BASE}/tasks/${id}`,
            {
                method: "DELETE",
                credentials: "include"
            }
        );

        const data = await response.json();

        console.log("Delete Task:", data);

        if (!data.success) {

            alert(
                data.message ||
                "Failed to delete task."
            );

            return;
        }

        // Remove from frontend
        tasks = tasks.filter(
            task => task.id !== id
        );

        renderTasks();
        updateDashboard();
        updateAnalytics();
        updateRewards();

        console.log(
            "Task deleted successfully from database."
        );

    } catch (error) {

        console.error(
            "Failed to delete task:",
            error
        );

        alert(
            "Unable to connect with server."
        );
    }
}


function clearTaskForm() {

    document.getElementById(
        "taskName"
    ).value = "";


    document.getElementById(
        "taskSubject"
    ).value = "";


    document.getElementById(
        "taskDate"
    ).value = "";


    document.getElementById(
        "taskStartTime"
    ).value = "";


    document.getElementById(
        "taskEndTime"
    ).value = "";


    document.getElementById(
        "taskPriority"
    ).value =
        "Medium";


    document.getElementById(
        "taskRepeat"
    ).value =
        "Once";

}


/* =========================================================
   DASHBOARD
   ========================================================= */

function updateDashboard() {

    const result =
        getSavedResult();


    const xp =
        getXP();


    const dashXP =
        document.getElementById(
            "dashXP"
        );


    const sidebarXP =
        document.getElementById(
            "sidebarXP"
        );


    if (dashXP)
        dashXP.textContent = xp;


    if (sidebarXP)
        sidebarXP.textContent =
            `${xp} XP`;


    if (result) {

        document.getElementById(
            "dashAverage"
        ).textContent =
            `${result.average.toFixed(1)}%`;


        document.getElementById(
            "dashGrade"
        ).textContent =
            result.grade;


        renderDashboardChart(
            result.subjects
        );


    } else {
        document.getElementById(
            "dashAverage"
        ).textContent =
            "--";
        document.getElementById(
            "dashGrade"
        ).textContent =
            "--";
    }

    const completed =
        tasks.filter(
            task =>
                task.completed
        ).length;


    document.getElementById(
        "dashTasksDone"
    ).textContent =
        completed;


    document.getElementById(
        "dashTaskTotal"
    ).textContent =
        `${tasks.length} total tasks`;


    const percentage =
        tasks.length === 0
            ? 0
            : Math.round(
                (
                    completed /
                    tasks.length
                ) * 100
            );


    document.getElementById(
        "dashboardProgress"
    ).style.width =
        `${percentage}%`;


    document.getElementById(
        "dashboardProgressText"
    ).textContent =
        `${percentage}%`;


    renderDashboardTasks();

    updateStreakUI();

}


function renderDashboardChart(
    subjectList
) {

    const container =
        document.getElementById(
            "dashboardChart"
        );


    if (!container) return;


    container.innerHTML = "";


    if (
        !subjectList ||
        subjectList.length === 0
    ) {

        container.innerHTML = `

            <div class="empty-state">

                <span>📊</span>

                <p>
                    Add your result to see performance.
                </p>

            </div>

        `;

        return;

    }


    subjectList.forEach(
        subject => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "bar-item";


            item.innerHTML = `

                <span class="bar-value">
                    ${subject.marks}
                </span>

                <div
                    class="bar"
                    style="
                        height:${Math.max(
                            subject.marks,
                            4
                        )}%;
                    "
                ></div>

                <span class="bar-label">
                    ${escapeHTML(
                        subject.name
                    )}
                </span>

            `;


            container.appendChild(
                item
            );

        }
    );

}


function renderDashboardTasks() {

    const container =
        document.getElementById(
            "dashboardTasks"
        );


    if (!container) return;


    container.innerHTML = "";


    const today =
        getLocalDateString();


    const todayTasks =
        tasks
            .filter(
                task =>
                    task.date ===
                    today
            )
            .sort(
                (a, b) =>
                    (
                        a.startTime ||
                        ""
                    ).localeCompare(
                        b.startTime ||
                        ""
                    )
            );


    if (
        todayTasks.length === 0
    ) {

        container.innerHTML = `

            <div class="empty-state">

                <span>📝</span>

                <p>
                    No tasks for today.
                </p>

            </div>

        `;

        return;

    }


    todayTasks
        .slice(0, 5)
        .forEach(task => {

            container.appendChild(
                createTaskElement(
                    task
                )
            );

        });

}


/* =========================================================
   STREAK SYSTEM
   ========================================================= */

function getCompletedDates() {

    const dates =
        new Set();

    tasks.forEach(
        task => {
            const completedDate = getTaskCompletionDate(task);

            if (completedDate) {
                dates.add(completedDate);
            }
        }
    );

    return dates;

}


function getTaskCompletionDate(task) {
    if (!task.completed) return null;

    if (task.completedAt) {
        const completedAt = new Date(task.completedAt);

        if (!Number.isNaN(completedAt.getTime())) {
            return formatLocalDate(completedAt);
        }
    }

    return task.date || null;
}


function shiftDate(
    dateString,
    amount
) {

    const date =
        new Date(
            `${dateString}T00:00:00`
        );


    date.setDate(
        date.getDate() +
        amount
    );


    return formatLocalDate(
        date
    );

}


function formatLocalDate(date) {

    const year =
        date.getFullYear();


    const month =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );


    return `${year}-${month}-${day}`;

}


function calculateStreaks() {

    const activeDates =
        getCompletedDates();


    const today =
        getLocalDateString();


    const yesterday =
        shiftDate(
            today,
            -1
        );


    let currentStreak = 0;


    if (
        activeDates.has(today)
    ) {

        let cursor =
            today;


        while (
            activeDates.has(
                cursor
            )
        ) {

            currentStreak++;

            cursor =
                shiftDate(
                    cursor,
                    -1
                );

        }

    } else if (
        activeDates.has(
            yesterday
        )
    ) {

        let cursor =
            yesterday;


        while (
            activeDates.has(
                cursor
            )
        ) {

            currentStreak++;

            cursor =
                shiftDate(
                    cursor,
                    -1
                );

        }

    }


    const sortedDates =
        [...activeDates]
            .sort();


    let longestStreak = 0;
    let runningStreak = 0;
    let previousDate = null;


    sortedDates.forEach(
        date => {

            if (!previousDate) {

                runningStreak = 1;

            } else {

                const nextDate =
                    shiftDate(
                        previousDate,
                        1
                    );


                if (
                    date ===
                    nextDate
                ) {

                    runningStreak++;

                } else {

                    runningStreak = 1;

                }

            }


            longestStreak =
                Math.max(
                    longestStreak,
                    runningStreak
                );


            previousDate =
                date;

        }
    );


    return {

        currentStreak,

        longestStreak,

        activeToday:
            activeDates.has(
                today
            )

    };

}


function updateStreakUI() {

    const streaks =
        calculateStreaks();


    const current =
        document.getElementById(
            "currentStreak"
        );


    const longest =
        document.getElementById(
            "longestStreak"
        );


    const status =
        document.getElementById(
            "todayStreakStatus"
        );


    if (current) {

        current.textContent =
            streaks.currentStreak;

    }


    if (longest) {

        longest.textContent =
            streaks.longestStreak;

    }


    if (status) {

        status.textContent =
            streaks.activeToday
                ? "Active 🔥"
                : "Not Started";

    }

}


function setupActivityCalendar() {
    const modal = document.getElementById("activityCalendarModal");
    const closeButton = document.getElementById("closeActivityCalendarBtn");
    const previousButton = document.getElementById("previousCalendarMonthBtn");
    const nextButton = document.getElementById("nextCalendarMonthBtn");
    const daysContainer = document.getElementById("activityCalendarDays");
    const addTaskButton = document.getElementById("calendarAddTaskBtn");
    const dashboardAddTaskButton = document.getElementById("dashboardAddTaskBtn");
    const currentStreakButton = document.getElementById("currentStreakCalendarBtn");
    const todayStatusButton = document.getElementById("todayStatusCalendarBtn");

    if (!modal) return;

    currentStreakButton?.addEventListener("click", event => {
        openActivityCalendar(getLocalDateString(), event.currentTarget, "streak");
    });
    todayStatusButton?.addEventListener("click", event => {
        openActivityCalendar(getLocalDateString(), event.currentTarget, "tasks");
    });
    dashboardAddTaskButton?.addEventListener("click", () => {
        openTasksForDate(getLocalDateString());
    });
    closeButton?.addEventListener("click", closeActivityCalendar);
    previousButton?.addEventListener("click", () => {
        shiftActivityCalendarMonth(-1);
    });
    nextButton?.addEventListener("click", () => {
        shiftActivityCalendarMonth(1);
    });
    daysContainer?.addEventListener("click", event => {
        const dayButton = event.target.closest("[data-calendar-date]");
        if (!dayButton) return;

        activityCalendarSelectedDate = dayButton.dataset.calendarDate;
        renderActivityCalendar();
    });
    addTaskButton?.addEventListener("click", () => {
        closeActivityCalendar();
        openTasksForDate(activityCalendarSelectedDate);
    });
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeActivityCalendar();
        }
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !modal.classList.contains("hidden")) {
            closeActivityCalendar();
        }
    });
}


function shiftActivityCalendarMonth(amount) {
    const year = activityCalendarMonth.getFullYear();
    const month = activityCalendarMonth.getMonth() + amount;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const selectedDay = Number(activityCalendarSelectedDate.slice(-2));

    activityCalendarMonth = new Date(year, month, 1);
    activityCalendarSelectedDate = formatLocalDate(
        new Date(year, month, Math.min(selectedDay, daysInMonth))
    );
    renderActivityCalendar();
}


let activityCalendarSelectedDate = "";
let activityCalendarMonth = new Date();
let activityCalendarReturnFocus = null;
let activityCalendarMode = "tasks";


function openActivityCalendar(date, trigger, mode) {
    const modal = document.getElementById("activityCalendarModal");
    if (!modal) return;

    activityCalendarSelectedDate = date;
    activityCalendarMonth = new Date(`${date}T00:00:00`);
    activityCalendarMode = mode;
    activityCalendarReturnFocus = trigger || document.activeElement;
    document.getElementById("activityCalendarTitle").textContent =
        mode === "streak" ? "Current streak calendar" : "Task status calendar";
    document.querySelector(".calendar-summary").textContent =
        mode === "streak"
            ? "🔥 marks each day you completed a task and kept your streak active."
            : "Select a date to see its scheduled tasks and completion status.";
    document.getElementById("calendarAddTaskBtn").classList.toggle(
        "hidden",
        mode === "streak"
    );
    renderActivityCalendar();
    modal.classList.remove("hidden");
    document.getElementById("closeActivityCalendarBtn")?.focus();
}


function closeActivityCalendar() {
    const modal = document.getElementById("activityCalendarModal");
    if (!modal) return;

    modal.classList.add("hidden");
    activityCalendarReturnFocus?.focus();
    activityCalendarReturnFocus = null;
}


function renderActivityCalendar() {
    const monthHeading = document.getElementById("activityCalendarMonth");
    const daysContainer = document.getElementById("activityCalendarDays");
    if (!monthHeading || !daysContainer) return;

    const year = activityCalendarMonth.getFullYear();
    const month = activityCalendarMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const activeDates = getCompletedDates();

    monthHeading.textContent = activityCalendarMonth.toLocaleDateString(
        undefined,
        { month: "long", year: "numeric" }
    );
    daysContainer.innerHTML = "";

    for (let blank = 0; blank < firstWeekday; blank++) {
        const emptyCell = document.createElement("span");
        emptyCell.className = "calendar-day-empty";
        emptyCell.setAttribute("aria-hidden", "true");
        daysContainer.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const date = formatLocalDate(new Date(year, month, day));
        const scheduledTasks = tasks.filter(task => task.date === date);
        const hasStreak = activityCalendarMode === "streak" && activeDates.has(date);
        const hasCompletedTask =
            activityCalendarMode === "tasks" &&
            scheduledTasks.some(task => task.completed);
        const isToday = date === getLocalDateString();
        const isSelected = date === activityCalendarSelectedDate;
        const dayButton = document.createElement("button");

        dayButton.type = "button";
        dayButton.className = "calendar-day";
        dayButton.dataset.calendarDate = date;
        dayButton.setAttribute(
            "aria-label",
            `${new Date(year, month, day).toLocaleDateString()}${
                activityCalendarMode === "tasks" && scheduledTasks.length
                    ? `, ${scheduledTasks.length} scheduled task${scheduledTasks.length === 1 ? "" : "s"}`
                    : ""
            }${hasStreak ? ", streak day" : ""}`
        );
        dayButton.setAttribute("aria-pressed", String(isSelected));

        if (activityCalendarMode === "tasks" && scheduledTasks.length) {
            dayButton.classList.add("has-tasks");
        }
        if (hasCompletedTask) dayButton.classList.add("has-completed-tasks");
        if (hasStreak) dayButton.classList.add("streak-day");
        if (isToday) dayButton.classList.add("today");
        if (isSelected) dayButton.classList.add("selected");

        dayButton.innerHTML = `
            <span class="calendar-day-number">${day}</span>
            <span class="calendar-day-indicator">${
                hasStreak ? "🔥" : hasCompletedTask ? "✓" : scheduledTasks.length && activityCalendarMode === "tasks" ? "•" : ""
            }</span>
        `;
        dayButton.addEventListener("click", () => {
            activityCalendarSelectedDate = date;
            renderActivityCalendar();
        });
        daysContainer.appendChild(dayButton);
    }

    renderCalendarDayDetails(activityCalendarSelectedDate);
}


function renderCalendarDayDetails(date) {
    const selectedDateHeading = document.getElementById("calendarSelectedDate");
    const tasksContainer = document.getElementById("calendarTasksForDate");
    if (!selectedDateHeading || !tasksContainer) return;

    const dateObject = new Date(`${date}T00:00:00`);
    selectedDateHeading.textContent = dateObject.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
    });

    if (activityCalendarMode === "streak") {
        tasksContainer.innerHTML = getCompletedDates().has(date)
            ? '<p class="calendar-day-empty">🔥 Streak activity recorded for this day.</p>'
            : '<p class="calendar-day-empty">No streak activity recorded for this day.</p>';
        return;
    }

    const dayTasks = tasks
        .filter(task => task.date === date)
        .sort((first, second) =>
            (first.startTime || "").localeCompare(second.startTime || "")
        );

    if (!dayTasks.length) {
        tasksContainer.innerHTML =
            '<p class="calendar-day-empty">No tasks scheduled for this day.</p>';
        return;
    }

    tasksContainer.innerHTML = dayTasks.map(task => {
        const status = task.completed ? "Completed" : "Scheduled";
        const time = task.startTime
            ? `${task.startTime}${task.endTime ? ` - ${task.endTime}` : ""}`
            : "No time set";

        return `
            <div class="calendar-task-row">
                <div class="calendar-task-info">
                    <strong>${escapeHTML(task.name)}</strong>
                    <small>${escapeHTML(task.subject || "General")} · ${escapeHTML(time)}</small>
                </div>
                <span class="calendar-task-status ${task.completed ? "complete" : ""}">
                    ${status}
                </span>
            </div>
        `;
    }).join("");
}


/* =========================================================
   ANALYTICS
   ========================================================= */


function updateAnalytics() {
    const result = getSavedResult();
    updateTaskAnalytics();

    if (!result || !Array.isArray(result.subjects) || result.subjects.length === 0) {
        document.getElementById("analyticsAverage").textContent = "--";
        document.getElementById("analyticsGrade").textContent = "--";
        document.getElementById("analyticsBest").textContent = "--";
        document.getElementById("analyticsBestMarks").textContent = "--";
        document.getElementById("analyticsWeak").textContent = "--";
        document.getElementById("analyticsWeakMarks").textContent = "--";
        renderEmptyAnalytics();
        return;
    }

    const subjects = result.subjects;
    const average = Number(result.average ?? result.average_marks ?? result.percentage ?? 0);
    const grade = result.grade ?? "--";

    document.getElementById("analyticsAverage").textContent =
        `${average.toFixed(1)}%`;

    document.getElementById("analyticsGrade").textContent = grade;

    const sorted = [...subjects].sort(
        (a, b) => Number(b.marks) - Number(a.marks)
    );

    const best = sorted[0];
    const weak = sorted[sorted.length - 1];

    document.getElementById("analyticsBest").textContent = best.name;
    document.getElementById("analyticsBestMarks").textContent =
        `${best.marks}/${best.max_marks ?? 100}`;

    document.getElementById("analyticsWeak").textContent = weak.name;
    document.getElementById("analyticsWeakMarks").textContent =
        `${weak.marks}/${weak.max_marks ?? 100}`;

    renderAnalyticsChart(subjects);
    renderStrongSubjects(subjects);
    renderWeakSubjects(subjects);
    renderSuggestions(subjects, average);
}



function renderEmptyAnalytics() {

    document.getElementById(
        "analyticsChart"
    ).innerHTML = `

        <div class="empty-state">

            <span>📊</span>

            <p>
                Add a result to generate analytics.
            </p>

        </div>

    `;


    document.getElementById(
        "strongSubjects"
    ).innerHTML = `

        <div class="empty-state">

            <p>
                No data available.
            </p>

        </div>

    `;


    document.getElementById(
        "weakSubjects"
    ).innerHTML = `

        <div class="empty-state">

            <p>
                No data available.
            </p>

        </div>

    `;


    document.getElementById(
        "improvementSuggestions"
    ).innerHTML = `

        <div class="suggestion">

            <span>💡</span>

            <p>
                Add your result to receive personalized suggestions.
            </p>

        </div>

    `;

}


function renderAnalyticsChart(
    subjectList
) {

    const container =
        document.getElementById(
            "analyticsChart"
        );


    if (!container) return;


    container.innerHTML = "";


    subjectList.forEach(
        subject => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "analytics-bar-item";


            item.innerHTML = `

                <span
                    class="analytics-bar-value"
                >
                    ${subject.marks}%
                </span>

                <div
                    class="analytics-bar"
                    style="
                        height:${Math.max(
                            subject.marks,
                            3
                        )}%;
                    "
                ></div>

                <span
                    class="analytics-bar-label"
                >
                    ${escapeHTML(
                        subject.name
                    )}
                </span>

            `;


            container.appendChild(
                item
            );

        }
    );

}


function renderStrongSubjects(
    subjectList
) {

    const container =
        document.getElementById(
            "strongSubjects"
        );


    if (!container) return;


    container.innerHTML = "";


    const strong =
        subjectList
            .filter(
                subject =>
                    subject.marks >= 75
            )
            .sort(
                (a, b) =>
                    b.marks -
                    a.marks
            );


    if (
        strong.length === 0
    ) {

        container.innerHTML = `

            <div class="empty-state">

                <p>
                    No subject has crossed 75% yet.
                </p>

            </div>

        `;

        return;

    }


    strong.forEach(
        subject => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "insight-item";


            item.innerHTML = `

                <div>

                    <strong>
                        ${escapeHTML(
                            subject.name
                        )}
                    </strong>

                    <span>
                        Strong performance
                    </span>

                </div>

                <strong>
                    ${subject.marks}%
                </strong>

            `;


            container.appendChild(
                item
            );

        }
    );

}


function renderWeakSubjects(
    subjectList
) {

    const container =
        document.getElementById(
            "weakSubjects"
        );


    if (!container) return;


    container.innerHTML = "";


    const weak =
        subjectList
            .filter(
                subject =>
                    subject.marks < 60
            )
            .sort(
                (a, b) =>
                    a.marks -
                    b.marks
            );


    if (
        weak.length === 0
    ) {

        container.innerHTML = `

            <div class="empty-state">

                <p>
                    No major improvement area detected.
                </p>

            </div>

        `;

        return;

    }


    weak.forEach(
        subject => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "insight-item";


            item.innerHTML = `

                <div>

                    <strong>
                        ${escapeHTML(
                            subject.name
                        )}
                    </strong>

                    <span>
                        Needs more practice
                    </span>

                </div>

                <strong>
                    ${subject.marks}%
                </strong>

            `;


            container.appendChild(
                item
            );

        }
    );

}


function renderSuggestions(
    subjectList,
    average
) {

    const container =
        document.getElementById(
            "improvementSuggestions"
        );


    if (!container) return;


    const suggestions = [];


    const weak =
        subjectList
            .filter(
                subject =>
                    subject.marks < 60
            )
            .sort(
                (a, b) =>
                    a.marks -
                    b.marks
            );


    const strong =
        subjectList.filter(
            subject =>
                subject.marks >= 75
        );


    if (
        weak.length > 0
    ) {

        suggestions.push({

            icon: "🎯",

            text:
                `Give extra study time to ${
                    weak[0].name
                }. Its current score is ${
                    weak[0].marks
                }/100.`

        });

    }


    if (average < 60) {

        suggestions.push({

            icon: "📚",

            text:
                "Your overall average is below 60%. Focus on fundamentals and maintain a regular study routine."

        });

    } else if (average < 75) {

        suggestions.push({

            icon: "📈",

            text:
                "Your performance has a good base. Consistent practice can help improve your overall average."

        });

    } else {

        suggestions.push({

            icon: "🚀",

            text:
                "Your overall performance is strong. Focus on maintaining consistency and improving weaker subjects."

        });

    }


    if (
        strong.length > 0
    ) {

        suggestions.push({

            icon: "💪",

            text:
                `${strong[0].name} is one of your stronger subjects. Use your study approach here as a reference for other subjects.`

        });

    }


    if (
        tasks.length === 0
    ) {

        suggestions.push({

            icon: "📝",

            text:
                "Create daily study tasks so your performance can be tracked alongside your results."

        });

    } else {

        const completed =
            tasks.filter(
                task =>
                    task.completed
            ).length;


        const completion =
            Math.round(
                (
                    completed /
                    tasks.length
                ) * 100
            );


        suggestions.push({

            icon:
                completion < 50
                    ? "⏰"
                    : "🔥",

            text:
                completion < 50
                    ? `Your current task completion rate is ${completion}%. Try completing smaller, consistent daily tasks.`
                    : `Your task completion rate is ${completion}%. Keep building consistency.`

        });

    }


    container.innerHTML = "";


    suggestions.forEach(
        suggestion => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "suggestion";


            element.innerHTML = `

                <span>
                    ${suggestion.icon}
                </span>

                <p>
                    ${escapeHTML(
                        suggestion.text
                    )}
                </p>

            `;


            container.appendChild(
                element
            );

        }
    );

}


function updateTaskAnalytics() {

    const total =
        tasks.length;


    const completed =
        tasks.filter(
            task =>
                task.completed
        ).length;


    const pending =
        total -
        completed;


    const completion =
        total === 0
            ? 0
            : Math.round(
                (
                    completed /
                    total
                ) * 100
            );


    document.getElementById(
        "analyticsTotalTasks"
    ).textContent =
        total;


    document.getElementById(
        "analyticsCompletedTasks"
    ).textContent =
        completed;


    document.getElementById(
        "analyticsPendingTasks"
    ).textContent =
        pending;


    document.getElementById(
        "analyticsCompletion"
    ).textContent =
        `${completion}%`;


    document.getElementById(
        "analyticsTaskProgress"
    ).style.width =
        `${completion}%`;

}


/* =========================================================
   SMART STUDY PLANNER
   ========================================================= */

function setupPlanner() {

    const generateButton =
        document.getElementById(
            "generatePlanBtn"
        );


    if (!generateButton) return;


    generateButton.addEventListener(
        "click",
        generateStudyPlan
    );

}


function loadPlannerSettings() {

    const data =
        localStorage.getItem(
            PLANNER_KEY
        );


    if (!data) return;


    try {

        const settings =
            JSON.parse(data);


        if (
            document.getElementById(
                "targetDate"
            )
        ) {

            document.getElementById(
                "targetDate"
            ).value =
                settings.targetDate ||
                "";

        }


        if (
            document.getElementById(
                "dailyHours"
            )
        ) {

            document.getElementById(
                "dailyHours"
            ).value =
                settings.dailyHours ||
                2;

        }


        if (
            document.getElementById(
                "plannerStartTime"
            )
        ) {

            document.getElementById(
                "plannerStartTime"
            ).value =
                settings.startTime ||
                "18:00";

        }


        if (
            document.getElementById(
                "sessionLength"
            )
        ) {

            document.getElementById(
                "sessionLength"
            ).value =
                settings.sessionLength ||
                "60";

        }


        if (
            settings.sessions
        ) {

            renderGeneratedPlan(
                settings.sessions
            );

            renderPlannerSummary(
                settings
            );

        }

    } catch (error) {

        console.error(
            "Could not load planner:",
            error
        );

    }

}


function generateStudyPlan() {

    const targetDate =
        document.getElementById(
            "targetDate"
        ).value;


    const dailyHours =
        Number(
            document.getElementById(
                "dailyHours"
            ).value
        );


    const startTime =
        document.getElementById(
            "plannerStartTime"
        ).value;


    const sessionLength =
        Number(
            document.getElementById(
                "sessionLength"
            ).value
        );


    if (!targetDate) {

        alert(
            "Please select target/exam date."
        );

        return;

    }


    if (
        !dailyHours ||
        dailyHours <= 0
    ) {

        alert(
            "Please enter valid daily study hours."
        );

        return;

    }


    const result =
        getSavedResult();


    if (
        !result ||
        !result.subjects ||
        result.subjects.length === 0
    ) {

        alert(
            "Please analyze your result first so the planner can identify your focus subjects."
        );

        return;

    }


    const rankedSubjects =
        rankSubjectsForPlanner(
            result.subjects
        );


    const sessions =
        buildPlannerSessions(
            rankedSubjects,
            dailyHours,
            startTime,
            sessionLength
        );


    const settings = {

        targetDate,

        dailyHours,

        startTime,

        sessionLength,

        sessions,

        generatedAt:
            new Date().toISOString()

    };


    localStorage.setItem(
        PLANNER_KEY,
        JSON.stringify(settings)
    );


    renderPlannerSummary(
        settings
    );


    renderGeneratedPlan(
        sessions
    );


    alert(
        "Personalized study plan generated! 🧠"
    );

}


function rankSubjectsForPlanner(
    subjectList
) {

    return [...subjectList]
        .map(subject => {

            let score;


            if (subject.marks < 40) {

                score = 5;

            } else if (
                subject.marks < 50
            ) {

                score = 4;

            } else if (
                subject.marks < 60
            ) {

                score = 3;

            } else if (
                subject.marks < 75
            ) {

                score = 2;

            } else {

                score = 1;

            }


            return {

                ...subject,

                plannerScore:
                    score,

                priority:
                    subject.marks < 60
                        ? "High"
                        : subject.marks < 75
                            ? "Medium"
                            : "Low"

            };

        })
        .sort(
            (a, b) =>
                b.plannerScore -
                a.plannerScore
        );

}


function buildPlannerSessions(
    rankedSubjects,
    dailyHours,
    startTime,
    sessionLength
) {

    const totalMinutes =
        Math.round(
            dailyHours * 60
        );


    const numberOfSessions =
        Math.max(
            1,
            Math.floor(
                totalMinutes /
                sessionLength
            )
        );


    const sessions = [];


    let currentMinutes =
        timeToMinutes(
            startTime
        );


    for (
        let i = 0;
        i < numberOfSessions;
        i++
    ) {

        const subject =
            rankedSubjects[
                i %
                rankedSubjects.length
            ];


        const start =
            minutesToTime(
                currentMinutes
            );


        const end =
            minutesToTime(
                currentMinutes +
                sessionLength
            );


        sessions.push({

            id:
                `planner-${Date.now()}-${i}`,

            subject:
                subject.name,

            marks:
                subject.marks,

            priority:
                subject.priority,

            startTime:
                start,

            endTime:
                end,

            duration:
                sessionLength

        });


        currentMinutes +=
            sessionLength;

    }


    return sessions;

}


function renderPlannerSummary(
    settings
) {

    const summary =
        document.getElementById(
            "plannerSummary"
        );


    if (!summary) return;


    const cards =
        summary.querySelectorAll(
            ".planner-summary-card"
        );


    if (cards.length >= 4) {

        cards[0]
            .querySelector("strong")
            .textContent =
            subjects.length;


        const focusSubject =
            rankSubjectsForPlanner(
                subjects
            )[0];


        cards[1]
            .querySelector("strong")
            .textContent =
            focusSubject
                ? focusSubject.name
                : "--";


        cards[2]
            .querySelector("strong")
            .textContent =
            `${settings.dailyHours}h`;


        cards[3]
            .querySelector("strong")
            .textContent =
            formatDate(
                settings.targetDate
            );

    }

}


function renderGeneratedPlan(
    sessions
) {

    const container =
        document.getElementById(
            "generatedPlan"
        );


    if (!container) return;


    container.innerHTML = "";


    if (
        !sessions ||
        sessions.length === 0
    ) {

        container.innerHTML = `

            <div class="empty-state">

                <span>🧠</span>

                <p>
                    Generate a plan to see your personalized study sessions.
                </p>

            </div>

        `;

        return;

    }


    sessions.forEach(
        session => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "plan-item";


            item.innerHTML = `

                <div
                    class="plan-item-info"
                >

                    <strong>
                        ${escapeHTML(
                            session.subject
                        )}
                    </strong>

                    <span>
                        ${session.startTime}
                        -
                        ${session.endTime}
                        •
                        ${session.duration}
                        min
                        •
                        ${session.priority}
                        Priority
                    </span>

                </div>

                <button
                    class="btn secondary"
                    data-planner-session="${escapeHTML(
                        JSON.stringify(
                            session
                        )
                    )}"
                >
                    + Add Task
                </button>

            `;


            const button =
                item.querySelector(
                    "[data-planner-session]"
                );


            button.addEventListener(
                "click",
                () => {

                    addPlannerSessionAsTask(
                        session
                    );

                }
            );


            container.appendChild(
                item
            );

        }
    );

}


function addPlannerSessionAsTask(
    session
) {

    const today =
        getLocalDateString();


    tasks.push({

        id: Date.now(),

        name:
            `Study ${session.subject}`,

        subject:
            session.subject,

        date:
            today,

        startTime:
            session.startTime,

        endTime:
            session.endTime,

        priority:
            session.priority,

        repeat:
            "Once",

        completed:
            false,

        completedAt:
            null,

        source:
            "planner",

        createdAt:
            new Date().toISOString()

    });


    saveTasks();

    renderTasks();

    updateDashboard();

    updateAnalytics();

    updateRewards();


    alert(
        "Study session added to today's tasks! 📚"
    );

}


function timeToMinutes(
    time
) {

    if (!time) return 0;


    const parts =
        time.split(":");


    return (
        Number(parts[0]) * 60 +
        Number(parts[1])
    );

}


function minutesToTime(
    totalMinutes
) {

    totalMinutes =
        totalMinutes % 1440;


    const hours =
        Math.floor(
            totalMinutes / 60
        );


    const minutes =
        totalMinutes % 60;


    return `${String(
        hours
    ).padStart(2, "0")}:${String(
        minutes
    ).padStart(2, "0")}`;

}


/* =========================================================
   REWARDS + LEVEL SYSTEM
   ========================================================= */

function updateRewards() {

    const xp =
        getXP();


    const completedCount =
        tasks.filter(
            task =>
                task.completed
        ).length;


    const streaks =
        calculateStreaks();


    const result =
        getSavedResult();


    const level =
        Math.floor(
            xp / 100
        ) + 1;


    const currentLevelXP =
        xp % 100;


    const nextLevelXP =
        100 -
        currentLevelXP;


    const progress =
        currentLevelXP;


    const rewardLevel =
        document.getElementById(
            "rewardLevel"
        );


    const rewardXPText =
        document.getElementById(
            "rewardXPText"
        );


    const rewardNextLevelText =
        document.getElementById(
            "rewardNextLevelText"
        );


    const rewardProgressPercent =
        document.getElementById(
            "rewardProgressPercent"
        );


    const rewardLevelProgress =
        document.getElementById(
            "rewardLevelProgress"
        );


    if (rewardLevel) {

        rewardLevel.textContent =
            `Level ${level}`;

    }


    if (rewardXPText) {

        rewardXPText.textContent =
            `${currentLevelXP} / 100 XP`;

    }


    if (rewardNextLevelText) {

        rewardNextLevelText.textContent =
            nextLevelXP === 100
                ? "Earn XP to reach the next level."
                : `${nextLevelXP} XP needed for next level.`;

    }


    if (rewardProgressPercent) {

        rewardProgressPercent.textContent =
            `${progress}%`;

    }


    if (rewardLevelProgress) {

        rewardLevelProgress.style.width =
            `${progress}%`;

    }


    const rewards = [

        {

            id:
                "first-task",

            condition:
                completedCount >= 1

        },

        {

            id:
                "ten-tasks",

            condition:
                completedCount >= 10

        },

        {

            id:
                "hundred-xp",

            condition:
                xp >= 100

        },

        {

            id:
                "three-day-streak",

            condition:
                streaks.longestStreak >= 3

        },

        {

            id:
                "seven-day-streak",

            condition:
                streaks.longestStreak >= 7

        },

        {

            id:
                "fourteen-day-streak",

            condition:
                streaks.longestStreak >= 14

        },

        {

            id:
                "twenty-five-tasks",

            condition:
                completedCount >= 25

        },

        {

            id:
                "result-ready",

            condition:
                Boolean(result)

        }

    ];


    let badgeCount = 0;


    rewards.forEach(
        reward => {

            const card =
                document.querySelector(
                    `[data-reward="${reward.id}"]`
                );


            if (!card) return;


            const status =
                card.querySelector(
                    ".reward-status"
                );


            if (reward.condition) {

                badgeCount++;


                card.classList.remove(
                    "locked"
                );


                card.classList.add(
                    "unlocked"
                );


                if (status) {

                    status.textContent =
                        "✓ Unlocked";

                }

            } else {

                card.classList.remove(
                    "unlocked"
                );


                card.classList.add(
                    "locked"
                );


                if (status) {

                    status.textContent =
                        "🔒 Locked";

                }

            }

        }
    );


    const badgeCountElement =
        document.getElementById(
            "rewardBadgeCount"
        );


    if (badgeCountElement) {

        badgeCountElement.textContent =
            badgeCount;

    }

}


/* =========================================================
   PROFILE
   ========================================================= */

function updateProfileUI() {

    const name =
        currentUser?.name ||
        "Student";

    const email =
        currentUser?.email ||
        "";

    document.getElementById("topStudentName").textContent = name;
    document.getElementById("profileMenuName").textContent = name;
    document.getElementById("profileMenuEmail").textContent = email;

    document.querySelector(".avatar").textContent =
        name.charAt(0).toUpperCase();

}


/* =========================================================
   SETTINGS
   ========================================================= */

function setupSettings() {

    const clearDataBtn =
        document.getElementById(
            "clearDataBtn"
        );


    if (!clearDataBtn) return;


    clearDataBtn.addEventListener(
        "click",
        () => {

            const confirmed =
                confirm(
                    "This will delete your result, tasks and XP. Continue?"
                );


            if (!confirmed)
                return;


            localStorage.removeItem(
                RESULT_KEY
            );

            localStorage.removeItem(
                TASK_KEY
            );

            localStorage.removeItem(
                XP_KEY
            );

            localStorage.removeItem(
                PLANNER_KEY
            );


            subjects = [];

            tasks = [];

            editingTaskId = null;


            location.reload();

        }
    );

}


/* =========================================================
   HELPERS
   ========================================================= */

function getSavedResult() {

    const data =
        localStorage.getItem(
            RESULT_KEY
        );


    if (!data)
        return null;


    try {

        return JSON.parse(data);

    } catch (error) {

        console.error(
            "Could not parse result:",
            error
        );

        return null;

    }

}


function formatDate(
    dateString
) {

    if (!dateString)
        return "";


    const date =
        new Date(
            `${dateString}T00:00:00`
        );


    return date.toLocaleDateString(
        "en-IN",
        {

            day: "numeric",

            month: "short"

        }
    );

}


function getLocalDateString() {

    return formatLocalDate(
        new Date()
    );

}


function navigateTo(
    sectionName
) {

    const navItem =
        document.querySelector(
            `.nav-item[data-section="${sectionName}"]`
        );


    if (navItem) {

        navItem.click();

    }

}


function escapeHTML(value) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}
