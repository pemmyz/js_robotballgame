// Constants (existing)
const WIDTH = 800;
const HEIGHT = 600;
const BALL_RADIUS = 10;
const ROBOT_RADIUS = 20;
const GOAL_WIDTH = 100;
const GOAL_POST_DEPTH = 10;

// Colors (existing)
const WHITE = "white";
const GREEN_COLOR = "green";
const RED_COLOR = "red";
const BLUE_COLOR = "blue";
const BLACK_COLOR = "black";

// Gameplay Constants (existing)
const ROBOT_BASE_SPEED = 2.5;
const ROBOT_SPRINT_MULTIPLIER = 2;
const SPRINT_DURATION_MS = 2000;
const SPRINT_COOLDOWN_MS = 2000;
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
const keysPressed = {}; // For tracking key presses
let isPaused = false;
let wasPausedBeforeHelp = false;
let showHelp = false;
let pauseStartTime = 0;

// Key Mappings
const P1_UP = 'ArrowUp';
const P1_DOWN = 'ArrowDown';
const P1_LEFT = 'ArrowLeft';
const P1_RIGHT = 'ArrowRight';
const P1_SPRINT = 'Period';
const P1_CATCH = 'Minus';

const P2_UP = 'KeyW';
const P2_DOWN = 'KeyS';
const P2_LEFT = 'KeyA';
const P2_RIGHT = 'KeyD';
const P2_SPRINT = 'KeyV';
const P2_CATCH = 'KeyB';

const PAUSE_KEY = 'KeyP';
const HELP_KEY = 'KeyH';
const P1_AI_TOGGLE_KEY = 'Digit1'; // '1' key
const P2_AI_TOGGLE_KEY = 'Digit2'; // '2' key

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
const blueSprintTextElem = document.getElementById('blueSprintText');
const greenSprintTextElem = document.getElementById('greenSprintText');
const pauseHelpTextElem = document.getElementById('pauseHelpText');

function reset_game() {
    ball = new Ball();
    // Store AI state before creating new robots if they exist
    const r1_ai_state = robot1 ? robot1.isAIControlled : false; // Default to player-controlled
    const r2_ai_state = robot2 ? robot2.isAIControlled : false;

    robot1 = new Robot(100, HEIGHT / 2, BLUE_COLOR, WIDTH - GOAL_POST_DEPTH, r1_ai_state);
    robot2 = new Robot(WIDTH - 100, HEIGHT / 2, GREEN_COLOR, GOAL_POST_DEPTH, r2_ai_state);
    
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
        this.x = WIDTH / 2;
        this.y = HEIGHT / 2;
        this.vx = (Math.random() * 4) - 2;
        this.vy = (Math.random() * 4) - 2;
    }

    move() {
        this.x += this.vx; this.y += this.vy;
        this.vx *= BALL_FRICTION; this.vy *= BALL_FRICTION;
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
        if (Math.abs(this.vy) < 0.01) this.vy = 0;

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
        ctx.fillStyle = RED_COLOR; ctx.fill(); ctx.closePath();
    }
}

class Robot {
    constructor(x, y, color, goal_x_target_val, isAI = false) { // Added isAI parameter
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;
        this.speed = ROBOT_BASE_SPEED;
        this.color = color;
        this.goal_x_target = goal_x_target_val;
        this.bounce_counter = 0;

        this.sprinting = false;
        this.sprint_available = false;
        this.sprint_start_time = 0;
        this.rest_start_time = performance.now();
        this.sprint_multiplier = ROBOT_SPRINT_MULTIPLIER;

        this.isCatchingBall = false;
        this.hasBall = false;
        this.manual_dx = 0;
        this.manual_dy = 0;

        this.isAIControlled = isAI; // NEW: AI control flag
    }

    toggleAIControl() { // NEW: Method to toggle AI
        this.isAIControlled = !this.isAIControlled;
        // If switching to manual, clear any AI-driven velocity
        if (!this.isAIControlled) {
            this.vx = 0;
            this.vy = 0;
            this.manual_dx = 0; // Reset manual intent too
            this.manual_dy = 0;
        }
    }

    update_sprint_status() {
        const ct = performance.now();
        if (this.sprinting) {
            if (ct - this.sprint_start_time >= SPRINT_DURATION_MS) {
                this.sprinting = false; this.sprint_available = false; this.rest_start_time = ct;
            }
        } else if (!this.sprint_available) {
            if (ct - this.rest_start_time >= SPRINT_COOLDOWN_MS) this.sprint_available = true;
        }
    }

    set_manual_movement_direction(dx, dy) {
        this.manual_dx = dx; this.manual_dy = dy;
    }

    set_catching(isCatchingInput) {
        this.isCatchingBall = isCatchingInput;
        if (!this.isCatchingBall && this.hasBall) this.hasBall = false;
    }

    activate_sprint() {
        if (this.sprint_available && !this.sprinting) {
            this.sprinting = true; this.sprint_start_time = performance.now();
        }
    }

    move_towards_ball(ball_obj) { // AI movement logic
        let dx = ball_obj.x - this.x; let dy = ball_obj.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= 2 * ROBOT_RADIUS && this.sprint_available && !this.sprinting) this.activate_sprint();
        
        let current_speed = this.speed * (this.sprinting ? this.sprint_multiplier : 1);
        if (dist > 0) { this.vx = (dx / dist) * current_speed; this.vy = (dy / dist) * current_speed; }
        else { this.vx = 0; this.vy = 0; }
        
        if (dist > ROBOT_RADIUS + BALL_RADIUS - current_speed) { this.x += this.vx; this.y += this.vy; }
        this.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, this.x));
        this.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, this.y));
    }

    update_position(ball_obj) { // Manual movement logic
        let current_move_speed = this.speed * (this.sprinting ? this.sprint_multiplier : 1);
        let move_x = 0, move_y = 0;
        let mag = Math.sqrt(this.manual_dx**2 + this.manual_dy**2);
        if (mag > 0) { move_x = (this.manual_dx / mag) * current_move_speed; move_y = (this.manual_dy / mag) * current_move_speed; }
        
        this.x += move_x; this.y += move_y;
        this.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, this.x));
        this.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, this.y));

        if (this.isCatchingBall) {
            const dist_ball = Math.sqrt((ball_obj.x - this.x)**2 + (ball_obj.y - this.y)**2);
            if (!this.hasBall && dist_ball < ROBOT_RADIUS + BALL_RADIUS + 10) this.hasBall = true;

            if (this.hasBall) {
                let off_dist = ROBOT_RADIUS + BALL_RADIUS * 0.2; let off_dx = 0, off_dy = 0;
                if (move_x !== 0 || move_y !== 0) {
                    let move_mag = Math.sqrt(move_x**2 + move_y**2);
                    off_dx = (move_x / move_mag) * off_dist; off_dy = (move_y / move_mag) * off_dist;
                } else off_dx = (this.goal_x_target > this.x ? 1 : -1) * off_dist;
                
                ball_obj.x = this.x + off_dx; ball_obj.y = this.y + off_dy;
                ball_obj.vx = 0; ball_obj.vy = 0;
                last_toucher = this; last_touch_time = performance.now();
                ball_obj.x = Math.max(BALL_RADIUS, Math.min(WIDTH - BALL_RADIUS, ball_obj.x));
                ball_obj.y = Math.max(BALL_RADIUS, Math.min(HEIGHT - BALL_RADIUS, ball_obj.y));
            }
        } else if (this.hasBall) this.hasBall = false;
    }

    kick_ball_towards_goal(ball_obj) {
        if (this.isCatchingBall && this.hasBall) return; // Don't auto-kick if player is holding catch

        const ct = performance.now();
        const dist_ball = Math.sqrt((ball_obj.x - this.x)**2 + (ball_obj.y - this.y)**2);

        if (dist_ball < ROBOT_RADIUS + BALL_RADIUS + 2) {
            let kicked = false;
            if (last_toucher !== null && last_toucher !== this && (ct - last_touch_time < TRICK_MANEUVER_WINDOW_MS)) {
                ball_obj.vx = (this.goal_x_target > ball_obj.x ? TRICK_KICK_VX_STRENGTH : -TRICK_KICK_VX_STRENGTH);
                ball_obj.vy = (Math.random() < 0.5 ? -1 : 1) * TRICK_KICK_VY_STRENGTH;
                if (this.sprint_available && !this.sprinting) this.activate_sprint();
                kicked = true;
            } else {
                let gdx = this.goal_x_target - ball_obj.x; let gdy = (HEIGHT / 2) - ball_obj.y;
                let gdist = Math.sqrt(gdx**2 + gdy**2);
                if (gdist > 0) {
                    ball_obj.vx = (gdx / gdist) * NORMAL_KICK_STRENGTH;
                    ball_obj.vy = (gdy / gdist) * NORMAL_KICK_STRENGTH;
                    kicked = true;
                }
            }
            if (kicked) { last_touch_time = ct; last_toucher = this; this.hasBall = false; }
        }
    }

    check_robot_collision(other_robot) {
        let dx = other_robot.x - this.x; let dy = other_robot.y - this.y;
        let dist = Math.sqrt(dx**2 + dy**2);
        if (dist < 2 * ROBOT_RADIUS && dist > 0) {
            let angle = Math.atan2(dy, dx);
            let overlap = (2 * ROBOT_RADIUS - dist);
            let sep = overlap / 2 + 0.1;
            this.x -= Math.cos(angle) * sep; this.y -= Math.sin(angle) * sep;
            other_robot.x += Math.cos(angle) * sep; other_robot.y += Math.sin(angle) * sep;
            
            [this, other_robot].forEach(r => {
                r.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, r.x));
                r.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, r.y));
            });

            if (this === robot1) { // Let robot1 manage anti-stuck for robot2
                this.bounce_counter++;
                if (this.bounce_counter >= ROBOT_COLLISION_BOUNCE_THRESHOLD) {
                    other_robot.y += (Math.random() < 0.5 ? -1 : 1) * ROBOT_ANTI_STUCK_NUDGE;
                    other_robot.x += (Math.random() < 0.5 ? -1 : 1) * ROBOT_ANTI_STUCK_NUDGE * 0.5;
                    this.bounce_counter = 0;
                }
            }
            if (this.hasBall) this.hasBall = false;
            if (other_robot.hasBall) other_robot.hasBall = false;
        }
    }

    attempt_ball_unstick(ball_obj) {
        // AI always tries. Manual player only if not holding/catching ball.
        if (!this.isAIControlled && (this.hasBall || this.isCatchingBall)) return;

        const ct = performance.now();
        const dist_ball = Math.sqrt((ball_obj.x - this.x)**2 + (ball_obj.y - this.y)**2);
        if (last_toucher === this && (ct - last_touch_time > BALL_UNSTICK_MIN_DURATION_MS) && (ct - last_touch_time < BALL_UNSTICK_TIMEOUT_MS)) {
            if (dist_ball < ROBOT_RADIUS + BALL_RADIUS + 5) {
                ball_obj.vy += (Math.random() < 0.5 ? -1 : 1) * BALL_UNSTICK_NUDGE_STRENGTH;
                ball_obj.vx += (Math.random() < 0.5 ? -1 : 1) * BALL_UNSTICK_NUDGE_STRENGTH * 0.5;
                last_touch_time = ct;
            }
        }
    }

    draw() {
        ctx.beginPath(); ctx.arc(this.x, this.y, ROBOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.closePath();
    }
}

// --- PAUSE/RESUME FUNCTIONS ---
function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        pauseStartTime = performance.now();
        pauseHelpTextElem.textContent = "GAME PAUSED | P: Resume | H: Help | 1/2: Toggle AI";
    } else {
        const pauseDuration = performance.now() - pauseStartTime;
        adjustTimersForPause(pauseDuration);
        pauseHelpTextElem.textContent = "P: Pause | H: Help | 1/2: Toggle AI";
    }
}

function adjustTimersForPause(duration) {
    start_time += duration; game_start_time += duration;
    if (last_touch_time !== 0) last_touch_time += duration;
    [robot1, robot2].forEach(r => {
        if (r.sprinting) r.sprint_start_time += duration;
        else if (!r.sprint_available) r.rest_start_time += duration;
    });
}

function toggleHelp() {
    showHelp = !showHelp;
    if (showHelp) {
        wasPausedBeforeHelp = isPaused;
        if (!isPaused) { isPaused = true; pauseStartTime = performance.now(); }
        pauseHelpTextElem.textContent = "H: Close Help | P: Pause/Resume | 1/2: Toggle AI";
    } else {
        if (!wasPausedBeforeHelp && isPaused) {
            isPaused = false;
            const pauseDuration = performance.now() - pauseStartTime;
            adjustTimersForPause(pauseDuration);
        }
        pauseHelpTextElem.textContent = isPaused ? "GAME PAUSED | P: Resume | H: Help | 1/2: Toggle AI" : "P: Pause | H: Help | 1/2: Toggle AI";
    }
}

// --- Input Handlers ---
window.addEventListener('keydown', (e) => {
    if (e.code === PAUSE_KEY && !showHelp) { togglePause(); return; }
    if (e.code === HELP_KEY) { toggleHelp(); return; }

    // AI Toggle Keys (can be pressed even if paused or help is shown, for convenience)
    if (e.code === P1_AI_TOGGLE_KEY) { robot1.toggleAIControl(); return; }
    if (e.code === P2_AI_TOGGLE_KEY) { robot2.toggleAIControl(); return; }

    if (isPaused && !showHelp) return; // Game input ignored if paused
    keysPressed[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    if (isPaused && !showHelp && ![PAUSE_KEY, HELP_KEY, P1_AI_TOGGLE_KEY, P2_AI_TOGGLE_KEY].includes(e.code)) return;
    keysPressed[e.code] = false;
});

function handle_manual_input() {
    // Player 1
    if (!robot1.isAIControlled) {
        let p1_dx = 0, p1_dy = 0;
        if (keysPressed[P1_LEFT]) p1_dx -= 1; if (keysPressed[P1_RIGHT]) p1_dx += 1;
        if (keysPressed[P1_UP]) p1_dy -= 1; if (keysPressed[P1_DOWN]) p1_dy += 1;
        robot1.set_manual_movement_direction(p1_dx, p1_dy);
        if (keysPressed[P1_SPRINT]) robot1.activate_sprint();
        robot1.set_catching(!!keysPressed[P1_CATCH]);
    } else { // Ensure AI doesn't use stale manual inputs
        robot1.set_manual_movement_direction(0,0);
        robot1.set_catching(false);
    }

    // Player 2
    if (!robot2.isAIControlled) {
        let p2_dx = 0, p2_dy = 0;
        if (keysPressed[P2_LEFT]) p2_dx -= 1; if (keysPressed[P2_RIGHT]) p2_dx += 1;
        if (keysPressed[P2_UP]) p2_dy -= 1; if (keysPressed[P2_DOWN]) p2_dy += 1;
        robot2.set_manual_movement_direction(p2_dx, p2_dy);
        if (keysPressed[P2_SPRINT]) robot2.activate_sprint();
        robot2.set_catching(!!keysPressed[P2_CATCH]);
    } else {
        robot2.set_manual_movement_direction(0,0);
        robot2.set_catching(false);
    }
}

// --- TOUCH CONTROL SETUP ---
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
            const onStart = (e) => {
                e.preventDefault();
                if ((isPaused && !showHelp) || m.playerRobot().isAIControlled) return; // Ignore if paused or robot is AI
                keysPressed[m.key] = true;
            };
            const onEnd = (e) => {
                e.preventDefault();
                // Allow unpressing even if paused or AI, to clear state
                keysPressed[m.key] = false;
            };
            btn.addEventListener('touchstart', onStart, { passive: false });
            btn.addEventListener('touchend', onEnd, { passive: false });
            btn.addEventListener('mousedown', onStart); // For desktop testing
            btn.addEventListener('mouseup', onEnd);
            btn.addEventListener('mouseleave', onEnd); // If mouse leaves while pressed
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
    
    let r1_status = robot1.isAIControlled ? "AI Mode" : (robot1.sprinting ? 'Active' : (robot1.sprint_available ? 'Available' : 'Cooldown'));
    if (!robot1.isAIControlled && robot1.hasBall) r1_status += ' (Dribbling)';
    blueSprintTextElem.textContent = `Blue: ${r1_status}`;
    
    let r2_status = robot2.isAIControlled ? "AI Mode" : (robot2.sprinting ? 'Active' : (robot2.sprint_available ? 'Available' : 'Cooldown'));
    if (!robot2.isAIControlled && robot2.hasBall) r2_status += ' (Dribbling)';
    greenSprintTextElem.textContent = `Green: ${r2_status}`;
}

// --- DRAWING FUNCTIONS FOR OVERLAYS ---
function drawPausedScreen() {
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle = "white"; ctx.font = "48px Arial"; ctx.textAlign = "center";
    ctx.fillText("PAUSED", WIDTH/2, HEIGHT/2);
    ctx.font = "20px Arial"; ctx.fillText("Press P to Resume", WIDTH/2, HEIGHT/2 + 40);
}

function drawHelpMenu() {
    ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillRect(0,0,WIDTH,HEIGHT);
    const pad = 30, boxW = Math.min(WIDTH*0.8, 500), boxX = (WIDTH-boxW)/2;
    const lines = 18, lH = 22, boxH = Math.min(HEIGHT*0.8, lines*lH + pad*2 + 40), boxY = (HEIGHT-boxH)/2;

    ctx.fillStyle="#333"; ctx.strokeStyle="#555"; ctx.lineWidth=2;
    ctx.fillRect(boxX,boxY,boxW,boxH); ctx.strokeRect(boxX,boxY,boxW,boxH);

    ctx.fillStyle="white"; ctx.textAlign="center"; ctx.font="bold 24px Arial";
    ctx.fillText("Game Controls", WIDTH/2, boxY+pad+5);

    ctx.textAlign="left"; let cY = boxY+pad+45;
    const drawLine = (txt, bold=false, indent=0) => {
        ctx.font = `${bold?'bold ':''}15px Arial`;
        ctx.fillText(txt, boxX+pad+indent, cY); cY += 22;
    };
    
    drawLine("Player 1 (Blue - Left):", true);
    drawLine("Move: Arrow Keys", false, 15);
    drawLine("Sprint: Period (.)", false, 15);
    drawLine("Catch: Minus (-)", false, 15);
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
    if (!isPaused) {
        robot1.update_sprint_status(); robot2.update_sprint_status();
        handle_manual_input(); // Process inputs for non-AI players

        // Robot 1 movement
        if (robot1.isAIControlled) robot1.move_towards_ball(ball);
        else robot1.update_position(ball);
        // Robot 2 movement
        if (robot2.isAIControlled) robot2.move_towards_ball(ball);
        else robot2.update_position(ball);

        // Ball movement (if not held)
        const r1_holding = !robot1.isAIControlled && robot1.isCatchingBall && robot1.hasBall;
        const r2_holding = !robot2.isAIControlled && robot2.isCatchingBall && robot2.hasBall;
        if (!r1_holding && !r2_holding) ball.move();
        
        robot1.kick_ball_towards_goal(ball); robot2.kick_ball_towards_goal(ball);
        robot1.check_robot_collision(robot2);
        
        // Ball unsticking
        robot1.attempt_ball_unstick(ball);
        robot2.attempt_ball_unstick(ball);
        
        update_info_panel();
    } else {
        update_info_panel(); // Update to show frozen timers
    }

    // Drawing
    ctx.fillStyle = WHITE; ctx.fillRect(0,0,WIDTH,HEIGHT);
    ball.draw(); robot1.draw(); robot2.draw();
    ctx.fillStyle = BLACK_COLOR;
    ctx.fillRect(0, HEIGHT/2 - GOAL_WIDTH/2, GOAL_POST_DEPTH, GOAL_WIDTH);
    ctx.fillRect(WIDTH - GOAL_POST_DEPTH, HEIGHT/2 - GOAL_WIDTH/2, GOAL_POST_DEPTH, GOAL_WIDTH);

    if (!showHelp) {
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.font = "14px Arial";
        ctx.textAlign = "right"; ctx.fillText("H: Help | 1/2: AI", WIDTH-10, HEIGHT-10);
    }
    if (showHelp) drawHelpMenu();
    else if (isPaused) drawPausedScreen();

    requestAnimationFrame(gameLoop);
}

// Initialize and start
reset_game(); // This will now use default AI states (player-controlled)
setupTouchControls();
gameLoop();
