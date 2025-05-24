// Constants
const WIDTH = 800;
const HEIGHT = 600;
const BALL_RADIUS = 10;
const ROBOT_RADIUS = 20;
const GOAL_WIDTH = 100;
const GOAL_POST_DEPTH = 10;

// Colors - themed
let GAME_WHITE = "white";
let GAME_BLACK = "black";
let GAME_RED = "red";
const GAME_GREEN = "green"; // Robot color
const GAME_BLUE = "blue";   // Robot color

// Gameplay Constants
const ROBOT_BASE_SPEED = 2.5;
const ROBOT_SPRINT_MULTIPLIER = 3.0; // Faster sprint
const SPRINT_ENERGY_MAX = 100;
const SPRINT_COST_PER_SECOND = 35;
const SPRINT_RECHARGE_RATE_PER_SECOND = 15;
const SPRINT_RECHARGE_DELAY_MS = 1500;

const BALL_FRICTION = 0.98;
const NORMAL_KICK_STRENGTH = 6;
const TRICK_KICK_VX_STRENGTH = 2;
const TRICK_KICK_VY_STRENGTH = 5;
const ROBOT_COLLISION_BOUNCE_THRESHOLD = 5;
const ROBOT_ANTI_STUCK_NUDGE_FACTOR = 1;
const ROBOT_ANTI_STUCK_NUDGE = ROBOT_RADIUS * ROBOT_ANTI_STUCK_NUDGE_FACTOR;
const TRICK_MANEUVER_WINDOW_MS = 500;
const BALL_UNSTICK_TIMEOUT_MS = 3000;
const BALL_UNSTICK_MIN_DURATION_MS = 100;
const BALL_UNSTICK_NUDGE_STRENGTH = 1.5;

// --- GAME STATE & UI FLAGS ---
const keysPressed = {};
let isPaused = false;
let wasPausedBeforeHelp = false;
let showHelp = false;
let pauseStartTime = 0;
let lastFrameTime = performance.now(); // For deltaTime

// Key Mappings
const P1_UP = 'ArrowUp';
const P1_DOWN = 'ArrowDown';
const P1_LEFT = 'ArrowLeft';
const P1_RIGHT = 'ArrowRight';
const P1_SPRINT = 'KeyN';
const P1_CATCH = 'KeyM';

const P2_UP = 'KeyW';
const P2_DOWN = 'KeyS';
const P2_LEFT = 'KeyA';
const P2_RIGHT = 'KeyD';
const P2_SPRINT = 'KeyV';
const P2_CATCH = 'KeyB';

const PAUSE_KEY = 'KeyP';
const HELP_KEY = 'KeyH';
const P1_AI_TOGGLE_KEY = 'Digit1';
const P2_AI_TOGGLE_KEY = 'Digit2';

// Initialize canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH;
canvas.height = HEIGHT;

// Game state variables
let total_goals_robot1 = 0;
let total_goals_robot2 = 0;
let start_time = performance.now();
let game_start_time = performance.now();
let last_touch_time = 0;
let last_toucher = null;
let ball, robot1, robot2;

// DOM Elements
const scoreTextElem = document.getElementById('scoreText');
const totalTimeTextElem = document.getElementById('totalTimeText');
const roundTimeTextElem = document.getElementById('roundTimeText');
const pauseHelpTextElem = document.getElementById('pauseHelpText');

// New Info Panel DOM Elements for Player Stats and Sprint Bars
const p1SprintBarFill = document.getElementById('p1SprintBarFill');
const blueStatusTextElem = document.getElementById('blueStatusText');
const p2SprintBarFill = document.getElementById('p2SprintBarFill');
const greenStatusTextElem = document.getElementById('greenStatusText');


// --- DARK MODE TOGGLE ---
const darkModeToggleBtn = document.getElementById('darkModeToggle');
const bodyElement = document.body;

function setDarkMode(enabled) {
    if (enabled) {
        bodyElement.classList.remove('light-mode');
        darkModeToggleBtn.textContent = '☀️ Light Mode';
        GAME_WHITE = "#222222"; // Canvas background for dark mode
        GAME_BLACK = "#e0e0e0"; // Text, goals on canvas for dark mode
        GAME_RED = "tomato";    // Brighter red for dark bg
    } else {
        bodyElement.classList.add('light-mode');
        darkModeToggleBtn.textContent = '🌙 Dark Mode';
        GAME_WHITE = "white";   // Canvas background for light mode
        GAME_BLACK = "black";   // Text, goals on canvas for light mode
        GAME_RED = "red";
    }
}

darkModeToggleBtn.addEventListener('click', () => {
    const isLightMode = bodyElement.classList.contains('light-mode');
    setDarkMode(isLightMode);
});
// --- END DARK MODE ---

function reset_game() {
    ball = new Ball();
    const r1_ai_state = robot1 ? robot1.isAIControlled : false;
    const r2_ai_state = robot2 ? robot2.isAIControlled : false;

    robot1 = new Robot(100, HEIGHT / 2, GAME_BLUE, WIDTH - GOAL_POST_DEPTH, r1_ai_state);
    robot2 = new Robot(WIDTH - 100, HEIGHT / 2, GAME_GREEN, GOAL_POST_DEPTH, r2_ai_state);
    
    if (performance.now() - game_start_time > 100 || !isPaused) {
         game_start_time = performance.now();
    }
    if (isPaused) {
        game_start_time = pauseStartTime - (performance.now() - game_start_time);
    }

    last_touch_time = 0;
    last_toucher = null;
    for (const key in keysPressed) {
        keysPressed[key] = false;
    }
}

class Ball {
    constructor() {
        this.x = WIDTH / 2; this.y = HEIGHT / 2;
        this.vx = (Math.random() * 4) - 2; this.vy = (Math.random() * 4) - 2;
    }
    move() {
        this.x += this.vx; this.y += this.vy;
        this.vx *= BALL_FRICTION; this.vy *= BALL_FRICTION;
        if (Math.abs(this.vx) < 0.01) this.vx = 0; if (Math.abs(this.vy) < 0.01) this.vy = 0;
        if (this.x - BALL_RADIUS < 0) { this.vx *= -1; this.x = BALL_RADIUS; }
        else if (this.x + BALL_RADIUS > WIDTH) { this.vx *= -1; this.x = WIDTH - BALL_RADIUS; }
        if (this.y - BALL_RADIUS < 0) { this.vy *= -1; this.y = BALL_RADIUS; }
        else if (this.y + BALL_RADIUS > HEIGHT) { this.vy *= -1; this.y = HEIGHT - BALL_RADIUS; }
        if (this.x - BALL_RADIUS < GOAL_POST_DEPTH && this.y > HEIGHT/2 - GOAL_WIDTH/2 && this.y < HEIGHT/2 + GOAL_WIDTH/2) {
            total_goals_robot2++; reset_game();
        } else if (this.x + BALL_RADIUS > WIDTH - GOAL_POST_DEPTH && this.y > HEIGHT/2 - GOAL_WIDTH/2 && this.y < HEIGHT/2 + GOAL_WIDTH/2) {
            total_goals_robot1++; reset_game();
        }
    }
    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = GAME_RED; ctx.fill(); ctx.closePath();
    }
}

class Robot {
    constructor(x, y, color, goal_x_target_val, isAI = false) {
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;
        this.speed = ROBOT_BASE_SPEED;
        this.color = color;
        this.goal_x_target = goal_x_target_val;
        this.bounce_counter = 0;
        // SPRINT ENERGY SYSTEM
        this.sprint_energy_max = SPRINT_ENERGY_MAX;
        this.sprint_energy_current = SPRINT_ENERGY_MAX;
        this.sprint_last_active_time = 0;
        this.is_trying_to_sprint = false;
        this.is_actually_sprinting = false;

        this.isCatchingBall = false; this.hasBall = false;
        this.manual_dx = 0; this.manual_dy = 0;
        this.isAIControlled = isAI;
    }
    toggleAIControl() {
        this.isAIControlled = !this.isAIControlled;
        if (!this.isAIControlled) { this.vx = 0; this.vy = 0; this.manual_dx = 0; this.manual_dy = 0; this.is_trying_to_sprint = false; this.is_actually_sprinting = false;}
    }
    update_state_and_energy(deltaTime) {
        if (this.is_trying_to_sprint && this.sprint_energy_current > 0) {
            this.is_actually_sprinting = true;
            this.sprint_energy_current -= SPRINT_COST_PER_SECOND * deltaTime;
            this.sprint_energy_current = Math.max(0, this.sprint_energy_current);
            this.sprint_last_active_time = performance.now();
        } else {
            this.is_actually_sprinting = false;
        }
        if (this.sprint_energy_current <= 0) { this.is_actually_sprinting = false; }
        if (!this.is_actually_sprinting && this.sprint_energy_current < this.sprint_energy_max) {
            if (performance.now() - this.sprint_last_active_time > SPRINT_RECHARGE_DELAY_MS) {
                this.sprint_energy_current += SPRINT_RECHARGE_RATE_PER_SECOND * deltaTime;
                this.sprint_energy_current = Math.min(this.sprint_energy_max, this.sprint_energy_current);
            }
        }
    }
    set_manual_movement_direction(dx, dy) { this.manual_dx = dx; this.manual_dy = dy; }
    set_catching(isCatchingInput) { this.isCatchingBall = isCatchingInput; if (!this.isCatchingBall && this.hasBall) this.hasBall = false; }
    set_sprint_intent(isIntentActive) { this.is_trying_to_sprint = isIntentActive; }
    move_towards_ball(ball_obj) {
        let dx = ball_obj.x - this.x; let dy = ball_obj.y - this.y; let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > ROBOT_RADIUS * 3 && this.sprint_energy_current > SPRINT_ENERGY_MAX * 0.25) { this.set_sprint_intent(true); }
        else if (dist < ROBOT_RADIUS * 1.5 || this.sprint_energy_current < SPRINT_ENERGY_MAX * 0.1) { this.set_sprint_intent(false); }
        if (this.isCatchingBall && this.hasBall) { this.set_sprint_intent(false); }
        let current_speed = this.speed * (this.is_actually_sprinting ? ROBOT_SPRINT_MULTIPLIER : 1);
        if (dist > 0) { this.vx = (dx / dist) * current_speed; this.vy = (dy / dist) * current_speed; } else { this.vx = 0; this.vy = 0; }
        if (dist > ROBOT_RADIUS + BALL_RADIUS - current_speed) { this.x += this.vx; this.y += this.vy; }
        this.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, this.x)); this.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, this.y));
    }
    update_position(ball_obj) {
        let current_speed = this.speed * (this.is_actually_sprinting ? ROBOT_SPRINT_MULTIPLIER : 1);
        let move_x = 0, move_y = 0; let mag = Math.sqrt(this.manual_dx**2 + this.manual_dy**2);
        if (mag > 0) { move_x = (this.manual_dx / mag) * current_speed; move_y = (this.manual_dy / mag) * current_speed; }
        this.x += move_x; this.y += move_y;
        this.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, this.x)); this.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, this.y));
        if (this.isCatchingBall) {
            const dist_ball = Math.sqrt((ball_obj.x - this.x)**2 + (ball_obj.y - this.y)**2);
            if (!this.hasBall && dist_ball < ROBOT_RADIUS + BALL_RADIUS + 10) this.hasBall = true;
            if (this.hasBall) {
                let off_dist = ROBOT_RADIUS + BALL_RADIUS * 0.2; let off_dx = 0, off_dy = 0;
                if (move_x !== 0 || move_y !== 0) { let move_mag = Math.sqrt(move_x**2 + move_y**2); off_dx = (move_x / move_mag) * off_dist; off_dy = (move_y / move_mag) * off_dist; }
                else off_dx = (this.goal_x_target > this.x ? 1 : -1) * off_dist;
                ball_obj.x = this.x + off_dx; ball_obj.y = this.y + off_dy; ball_obj.vx = 0; ball_obj.vy = 0;
                last_toucher = this; last_touch_time = performance.now();
                ball_obj.x = Math.max(BALL_RADIUS, Math.min(WIDTH - BALL_RADIUS, ball_obj.x)); ball_obj.y = Math.max(BALL_RADIUS, Math.min(HEIGHT - BALL_RADIUS, ball_obj.y));
            }
        } else if (this.hasBall) this.hasBall = false;
    }
    kick_ball_towards_goal(ball_obj) {
        if (this.isCatchingBall && this.hasBall) return;
        const ct = performance.now(); const dist_ball = Math.sqrt((ball_obj.x - this.x)**2 + (ball_obj.y - this.y)**2);
        if (dist_ball < ROBOT_RADIUS + BALL_RADIUS + 2) {
            let kicked = false;
            if (last_toucher !== null && last_toucher !== this && (ct - last_touch_time < TRICK_MANEUVER_WINDOW_MS)) {
                ball_obj.vx = (this.goal_x_target > ball_obj.x ? TRICK_KICK_VX_STRENGTH : -TRICK_KICK_VX_STRENGTH);
                ball_obj.vy = (Math.random() < 0.5 ? -1 : 1) * TRICK_KICK_VY_STRENGTH; kicked = true;
            } else {
                let gdx = this.goal_x_target - ball_obj.x; let gdy = (HEIGHT / 2) - ball_obj.y; let gdist = Math.sqrt(gdx**2 + gdy**2);
                if (gdist > 0) { ball_obj.vx = (gdx / gdist) * NORMAL_KICK_STRENGTH; ball_obj.vy = (gdy / gdist) * NORMAL_KICK_STRENGTH; kicked = true; }
            }
            if (kicked) { last_touch_time = ct; last_toucher = this; this.hasBall = false; }
        }
    }
    check_robot_collision(other_robot) {
        let dx = other_robot.x - this.x; let dy = other_robot.y - this.y; let dist = Math.sqrt(dx**2 + dy**2);
        if (dist < 2 * ROBOT_RADIUS && dist > 0) {
            let angle = Math.atan2(dy, dx); let overlap = (2 * ROBOT_RADIUS - dist); let sep = overlap / 2 + 0.1;
            this.x -= Math.cos(angle) * sep; this.y -= Math.sin(angle) * sep;
            other_robot.x += Math.cos(angle) * sep; other_robot.y += Math.sin(angle) * sep;
            [this, other_robot].forEach(r => { r.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, r.x)); r.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, r.y)); });
            if (this === robot1) { this.bounce_counter++; if (this.bounce_counter >= ROBOT_COLLISION_BOUNCE_THRESHOLD) { other_robot.y += (Math.random() < 0.5 ? -1 : 1) * ROBOT_ANTI_STUCK_NUDGE; other_robot.x += (Math.random() < 0.5 ? -1 : 1) * ROBOT_ANTI_STUCK_NUDGE * 0.5; this.bounce_counter = 0; } }
            if (this.hasBall) this.hasBall = false; if (other_robot.hasBall) other_robot.hasBall = false;
        }
    }
    attempt_ball_unstick(ball_obj) {
        if (!this.isAIControlled && (this.hasBall || this.isCatchingBall)) return;
        const ct = performance.now(); const dist_ball = Math.sqrt((ball_obj.x - this.x)**2 + (ball_obj.y - this.y)**2);
        if (last_toucher === this && (ct - last_touch_time > BALL_UNSTICK_MIN_DURATION_MS) && (ct - last_touch_time < BALL_UNSTICK_TIMEOUT_MS)) {
            if (dist_ball < ROBOT_RADIUS + BALL_RADIUS + 5) { ball_obj.vy += (Math.random() < 0.5 ? -1 : 1) * BALL_UNSTICK_NUDGE_STRENGTH; ball_obj.vx += (Math.random() < 0.5 ? -1 : 1) * BALL_UNSTICK_NUDGE_STRENGTH * 0.5; last_touch_time = ct; }
        }
    }
    draw() { // Sprint bar is now a DOM element
        ctx.beginPath(); ctx.arc(this.x, this.y, ROBOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.closePath();
    }
}

function togglePause() {
    isPaused = !isPaused;
    if (isPaused) { pauseStartTime = performance.now(); pauseHelpTextElem.textContent = "GAME PAUSED | P: Resume | H: Help | 1/2: Toggle AI"; }
    else { const pauseDuration = performance.now() - pauseStartTime; adjustTimersForPause(pauseDuration); pauseHelpTextElem.textContent = "P: Pause | H: Help | 1/2: Toggle AI"; }
}
function adjustTimersForPause(duration) {
    start_time += duration; game_start_time += duration; if (last_touch_time !== 0) last_touch_time += duration;
    [robot1, robot2].forEach(r => { if(r) { if (r.sprint_last_active_time !== 0) { r.sprint_last_active_time += duration; } } });
}
function toggleHelp() {
    showHelp = !showHelp;
    if (showHelp) { wasPausedBeforeHelp = isPaused; if (!isPaused) { isPaused = true; pauseStartTime = performance.now(); } pauseHelpTextElem.textContent = "H: Close Help | P: Pause/Resume | 1/2: Toggle AI"; }
    else { if (!wasPausedBeforeHelp && isPaused) { isPaused = false; const pauseDuration = performance.now() - pauseStartTime; adjustTimersForPause(pauseDuration); } pauseHelpTextElem.textContent = isPaused ? "GAME PAUSED | P: Resume | H: Help | 1/2: Toggle AI" : "P: Pause | H: Help | 1/2: Toggle AI"; }
}

window.addEventListener('keydown', (e) => {
    if ([P1_UP, P1_DOWN, P1_LEFT, P1_RIGHT, P2_UP, P2_DOWN, P2_LEFT, P2_RIGHT].includes(e.code)) {
        if (!(isPaused && !showHelp)) { e.preventDefault(); }
    }
    if (e.code === PAUSE_KEY && !showHelp) { togglePause(); return; }
    if (e.code === HELP_KEY) { toggleHelp(); return; }
    if (e.code === P1_AI_TOGGLE_KEY) { if(robot1) robot1.toggleAIControl(); return; }
    if (e.code === P2_AI_TOGGLE_KEY) { if(robot2) robot2.toggleAIControl(); return; }
    if (isPaused && !showHelp) return;
    keysPressed[e.code] = true;
});
window.addEventListener('keyup', (e) => {
    if (isPaused && !showHelp && ![PAUSE_KEY, HELP_KEY, P1_AI_TOGGLE_KEY, P2_AI_TOGGLE_KEY].includes(e.code)) return;
    keysPressed[e.code] = false;
});

function handle_manual_input() {
    if (robot1 && !robot1.isAIControlled) {
        let p1_dx = 0, p1_dy = 0;
        if (keysPressed[P1_LEFT]) p1_dx -= 1; if (keysPressed[P1_RIGHT]) p1_dx += 1;
        if (keysPressed[P1_UP]) p1_dy -= 1; if (keysPressed[P1_DOWN]) p1_dy += 1;
        robot1.set_manual_movement_direction(p1_dx, p1_dy);
        robot1.set_sprint_intent(!!keysPressed[P1_SPRINT]);
        robot1.set_catching(!!keysPressed[P1_CATCH]);
    } else if (robot1) { robot1.set_manual_movement_direction(0,0); robot1.set_sprint_intent(false); robot1.set_catching(false); }

    if (robot2 && !robot2.isAIControlled) {
        let p2_dx = 0, p2_dy = 0;
        if (keysPressed[P2_LEFT]) p2_dx -= 1; if (keysPressed[P2_RIGHT]) p2_dx += 1;
        if (keysPressed[P2_UP]) p2_dy -= 1; if (keysPressed[P2_DOWN]) p2_dy += 1;
        robot2.set_manual_movement_direction(p2_dx, p2_dy);
        robot2.set_sprint_intent(!!keysPressed[P2_SPRINT]);
        robot2.set_catching(!!keysPressed[P2_CATCH]);
    } else if (robot2) { robot2.set_manual_movement_direction(0,0); robot2.set_sprint_intent(false); robot2.set_catching(false); }
}

function setupTouchControls() {
    const touchMappings = [
        { id: 'p1TouchUp', key: P1_UP, playerRobot: () => robot1 }, { id: 'p1TouchDown', key: P1_DOWN, playerRobot: () => robot1 },
        { id: 'p1TouchLeft', key: P1_LEFT, playerRobot: () => robot1 }, { id: 'p1TouchRight', key: P1_RIGHT, playerRobot: () => robot1 },
        { id: 'p1TouchSprint', key: P1_SPRINT, playerRobot: () => robot1 }, { id: 'p1TouchCatch', key: P1_CATCH, playerRobot: () => robot1 },
        { id: 'p2TouchUp', key: P2_UP, playerRobot: () => robot2 }, { id: 'p2TouchDown', key: P2_DOWN, playerRobot: () => robot2 },
        { id: 'p2TouchLeft', key: P2_LEFT, playerRobot: () => robot2 }, { id: 'p2TouchRight', key: P2_RIGHT, playerRobot: () => robot2 },
        { id: 'p2TouchSprint', key: P2_SPRINT, playerRobot: () => robot2 }, { id: 'p2TouchCatch', key: P2_CATCH, playerRobot: () => robot2 },
    ];
    touchMappings.forEach(m => {
        const btn = document.getElementById(m.id);
        if (btn) {
            const onStart = (e) => { e.preventDefault(); if (!m.playerRobot() || (isPaused && !showHelp) || m.playerRobot().isAIControlled) return; keysPressed[m.key] = true; };
            const onEnd = (e) => { e.preventDefault(); keysPressed[m.key] = false; };
            btn.addEventListener('touchstart', onStart, { passive: false }); btn.addEventListener('touchend', onEnd, { passive: false });
            btn.addEventListener('mousedown', onStart); btn.addEventListener('mouseup', onEnd); btn.addEventListener('mouseleave', onEnd);
        }
    });
}

function update_info_panel() {
    const ct = performance.now();
    const total_play = isPaused ? (pauseStartTime - start_time)/1000 : (ct - start_time)/1000;
    const round_play = isPaused ? (pauseStartTime - game_start_time)/1000 : (ct - game_start_time)/1000;
    scoreTextElem.textContent = `Score: Blue ${total_goals_robot1} - Green ${total_goals_robot2}`;
    totalTimeTextElem.textContent = `Total Playtime: ${Math.floor(total_play)}s`;
    roundTimeTextElem.textContent = `Current Round: ${Math.floor(round_play)}s`;

    if (robot1 && p1SprintBarFill && blueStatusTextElem) {
        p1SprintBarFill.style.width = `${robot1.sprint_energy_current}%`;
        let r1_player_states = [];
        if (!robot1.isAIControlled && robot1.hasBall) r1_player_states.push('Dribbling');
        if (!robot1.isAIControlled && robot1.is_actually_sprinting) r1_player_states.push('Sprinting');

        let r1_display_status = robot1.isAIControlled ? "AI Mode" : "Player";
        if (r1_player_states.length > 0) {
            r1_display_status += ` (${r1_player_states.join(', ')})`;
        }
        blueStatusTextElem.textContent = `Status: ${r1_display_status}`;
    }
    if (robot2 && p2SprintBarFill && greenStatusTextElem) {
        p2SprintBarFill.style.width = `${robot2.sprint_energy_current}%`;
        let r2_player_states = [];
        if (!robot2.isAIControlled && robot2.hasBall) r2_player_states.push('Dribbling');
        if (!robot2.isAIControlled && robot2.is_actually_sprinting) r2_player_states.push('Sprinting');
        
        let r2_display_status = robot2.isAIControlled ? "AI Mode" : "Player";
        if (r2_player_states.length > 0) {
            r2_display_status += ` (${r2_player_states.join(', ')})`;
        }
        greenStatusTextElem.textContent = `Status: ${r2_display_status}`;
    }
}

function drawPausedScreen() {
    ctx.fillStyle = bodyElement.classList.contains('light-mode') ? "rgba(100,100,100,0.5)" : "rgba(0,0,0,0.5)";
    ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle = bodyElement.classList.contains('light-mode') ? GAME_BLACK : "white";
    ctx.font = "48px Arial"; ctx.textAlign = "center";
    ctx.fillText("PAUSED", WIDTH/2, HEIGHT/2);
    ctx.font = "20px Arial"; ctx.fillText("Press P to Resume", WIDTH/2, HEIGHT/2 + 40);
}
function drawHelpMenu() {
    ctx.fillStyle = bodyElement.classList.contains('light-mode') ? "rgba(200,200,200,0.85)" : "rgba(0,0,0,0.85)";
    ctx.fillRect(0,0,WIDTH,HEIGHT);
    const pad = 30, boxW = Math.min(WIDTH*0.8, 500), boxX = (WIDTH-boxW)/2;
    const lines = 18, lH = 22, boxH = Math.min(HEIGHT*0.8, lines*lH + pad*2 + 40), boxY = (HEIGHT-boxH)/2;
    ctx.fillStyle= bodyElement.classList.contains('light-mode') ? "#fafafa" : "#333";
    ctx.strokeStyle= bodyElement.classList.contains('light-mode') ? "#ccc" : "#555";
    ctx.lineWidth=2;
    ctx.fillRect(boxX,boxY,boxW,boxH); ctx.strokeRect(boxX,boxY,boxW,boxH);
    ctx.fillStyle = bodyElement.classList.contains('light-mode') ? GAME_BLACK : "white";
    ctx.textAlign="center"; ctx.font="bold 24px Arial";
    ctx.fillText("Game Controls", WIDTH/2, boxY+pad+5);
    ctx.textAlign="left"; let cY = boxY+pad+45;
    const drawLine = (txt, bold=false, indent=0) => { ctx.font = `${bold?'bold ':''}15px Arial`; ctx.fillText(txt, boxX+pad+indent, cY); cY += 22; };
    drawLine("Player 1 (Blue - Left):", true);
    drawLine("Move: Arrow Keys", false, 15);
    drawLine("Sprint: N", false, 15);
    drawLine("Catch: M", false, 15);
    drawLine("Toggle AI: Key 1", false, 15); cY+=10;
    drawLine("Player 2 (Green - Right):", true);
    drawLine("Move: W, A, S, D", false, 15);
    drawLine("Sprint: V", false, 15);
    drawLine("Catch: B", false, 15);
    drawLine("Toggle AI: Key 2", false, 15); cY+=10;
    drawLine("General:", true);
    drawLine("Pause: P", false, 15);
    drawLine("Help: H (Toggle)", false, 15); cY+=20;
    ctx.textAlign="center"; ctx.font="bold 16px Arial";
    ctx.fillText("Press H to close Help", WIDTH/2, Math.min(boxY+boxH-pad+5, cY+10));
}

function gameLoop() {
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastFrameTime) / 1000;
    lastFrameTime = currentTime;

    if (!isPaused) {
        if(robot1) robot1.update_state_and_energy(deltaTime); if(robot2) robot2.update_state_and_energy(deltaTime);
        handle_manual_input();
        if (robot1) { if (robot1.isAIControlled) robot1.move_towards_ball(ball); else robot1.update_position(ball); }
        if (robot2) { if (robot2.isAIControlled) robot2.move_towards_ball(ball); else robot2.update_position(ball); }
        const r1_holding = robot1 && !robot1.isAIControlled && robot1.isCatchingBall && robot1.hasBall;
        const r2_holding = robot2 && !robot2.isAIControlled && robot2.isCatchingBall && robot2.hasBall;
        if (ball && !r1_holding && !r2_holding) ball.move();
        if(robot1 && ball) robot1.kick_ball_towards_goal(ball); if(robot2 && ball) robot2.kick_ball_towards_goal(ball);
        if(robot1 && robot2) robot1.check_robot_collision(robot2);
        if(robot1 && ball) robot1.attempt_ball_unstick(ball); if(robot2 && ball) robot2.attempt_ball_unstick(ball);
        update_info_panel();
    } else { update_info_panel(); }

    ctx.fillStyle = GAME_WHITE;
    ctx.fillRect(0,0,WIDTH,HEIGHT);
    if(ball) ball.draw(); if(robot1) robot1.draw(); if(robot2) robot2.draw();
    ctx.fillStyle = GAME_BLACK;
    ctx.fillRect(0, HEIGHT/2 - GOAL_WIDTH/2, GOAL_POST_DEPTH, GOAL_WIDTH);
    ctx.fillRect(WIDTH - GOAL_POST_DEPTH, HEIGHT/2 - GOAL_WIDTH/2, GOAL_POST_DEPTH, GOAL_WIDTH);
    if (!showHelp) {
        ctx.fillStyle = bodyElement.classList.contains('light-mode') ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)";
        ctx.font = "14px Arial"; ctx.textAlign = "right";
        ctx.fillText("H: Help | 1/2: AI | Theme", WIDTH-10, HEIGHT-10);
    }
    if (showHelp) drawHelpMenu(); else if (isPaused) drawPausedScreen();
    requestAnimationFrame(gameLoop);
}

// Initialize and start
setDarkMode(true);
reset_game();
setupTouchControls();
gameLoop();
