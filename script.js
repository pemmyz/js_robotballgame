// Constants
const WIDTH = 800;
const HEIGHT = 600;
const BALL_RADIUS = 10;
const ROBOT_RADIUS = 20;
const GOAL_WIDTH = 100; // Height of the goal area
const GOAL_POST_DEPTH = 10; // Thickness/depth of the goal posts or scoring line

// Colors
const WHITE = "white";
const GREEN_COLOR = "green";
const RED_COLOR = "red";
const BLUE_COLOR = "blue";
const BLACK_COLOR = "black";

// Gameplay Constants
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
let isManualMode = true;
const keysPressed = {};
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
    robot1 = new Robot(100, HEIGHT / 2, BLUE_COLOR, WIDTH - GOAL_POST_DEPTH);
    robot2 = new Robot(WIDTH - 100, HEIGHT / 2, GREEN_COLOR, GOAL_POST_DEPTH);
    
    // Only reset game_start_time if it's not the very first launch or if it's not paused
    // This prevents round timer from resetting if paused during a goal
    if (performance.now() - game_start_time > 100 || !isPaused) { // Heuristic: if round time > 0.1s or not paused
         game_start_time = performance.now();
    }
    if (isPaused) { // Adjust new game_start_time for current pause
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
        this.x += this.vx;
        this.y += this.vy;

        this.vx *= BALL_FRICTION;
        this.vy *= BALL_FRICTION;

        if (Math.abs(this.vx) < 0.01) this.vx = 0;
        if (Math.abs(this.vy) < 0.01) this.vy = 0;

        if (this.x - BALL_RADIUS < 0) {
            this.vx *= -1; this.x = BALL_RADIUS;
        } else if (this.x + BALL_RADIUS > WIDTH) {
            this.vx *= -1; this.x = WIDTH - BALL_RADIUS;
        }
        if (this.y - BALL_RADIUS < 0) {
            this.vy *= -1; this.y = BALL_RADIUS;
        } else if (this.y + BALL_RADIUS > HEIGHT) {
            this.vy *= -1; this.y = HEIGHT - BALL_RADIUS;
        }

        if (this.x - BALL_RADIUS < GOAL_POST_DEPTH && this.y > HEIGHT / 2 - GOAL_WIDTH / 2 && this.y < HEIGHT / 2 + GOAL_WIDTH / 2) {
            total_goals_robot2++; reset_game();
        } else if (this.x + BALL_RADIUS > WIDTH - GOAL_POST_DEPTH && this.y > HEIGHT / 2 - GOAL_WIDTH / 2 && this.y < HEIGHT / 2 + GOAL_WIDTH / 2) {
            total_goals_robot1++; reset_game();
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = RED_COLOR; ctx.fill(); ctx.closePath();
    }
}

class Robot {
    constructor(x, y, color, goal_x_target_val) {
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
    }

    update_sprint_status() {
        const current_time_ms = performance.now();
        if (this.sprinting) {
            if (current_time_ms - this.sprint_start_time >= SPRINT_DURATION_MS) {
                this.sprinting = false; this.sprint_available = false; this.rest_start_time = current_time_ms;
            }
        } else if (!this.sprint_available) {
            if (current_time_ms - this.rest_start_time >= SPRINT_COOLDOWN_MS) {
                this.sprint_available = true;
            }
        }
    }

    set_manual_movement_direction(dx, dy) {
        this.manual_dx = dx; this.manual_dy = dy;
    }

    set_catching(isCatchingInput) {
        this.isCatchingBall = isCatchingInput;
        if (!this.isCatchingBall && this.hasBall) {
            this.hasBall = false;
        }
    }

    activate_sprint() {
        if (this.sprint_available && !this.sprinting) {
            this.sprinting = true; this.sprint_start_time = performance.now();
        }
    }

    move_towards_ball(ball_obj) { // AI movement
        let dx = ball_obj.x - this.x;
        let dy = ball_obj.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= 2 * ROBOT_RADIUS && this.sprint_available && !this.sprinting) {
            this.activate_sprint();
        }

        let current_speed = this.speed * (this.sprinting ? this.sprint_multiplier : 1);

        if (dist > 0) {
            this.vx = (dx / dist) * current_speed; this.vy = (dy / dist) * current_speed;
        } else {
            this.vx = 0; this.vy = 0;
        }
        
        if (dist > ROBOT_RADIUS + BALL_RADIUS - current_speed) {
             this.x += this.vx; this.y += this.vy;
        }
        this.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, this.x));
        this.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, this.y));
    }

    update_position(ball_obj) { // Manual movement
        let current_move_speed = this.speed * (this.sprinting ? this.sprint_multiplier : 1);
        let move_x_intent = 0;
        let move_y_intent = 0;

        let magnitude = Math.sqrt(this.manual_dx * this.manual_dx + this.manual_dy * this.manual_dy);
        if (magnitude > 0) {
            move_x_intent = (this.manual_dx / magnitude) * current_move_speed;
            move_y_intent = (this.manual_dy / magnitude) * current_move_speed;
        }
        
        this.x += move_x_intent;
        this.y += move_y_intent;

        this.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, this.x));
        this.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, this.y));

        if (this.isCatchingBall) {
            const dist_to_ball = Math.sqrt(Math.pow(ball_obj.x - this.x, 2) + Math.pow(ball_obj.y - this.y, 2));
            if (!this.hasBall && dist_to_ball < ROBOT_RADIUS + BALL_RADIUS + 10) {
                this.hasBall = true;
            }

            if (this.hasBall) {
                let attach_offset_dist = ROBOT_RADIUS + BALL_RADIUS * 0.2;
                let attach_dx = 0;
                let attach_dy = 0;

                if (move_x_intent !== 0 || move_y_intent !== 0) {
                    let move_mag = Math.sqrt(move_x_intent*move_x_intent + move_y_intent*move_y_intent);
                    attach_dx = (move_x_intent / move_mag) * attach_offset_dist;
                    attach_dy = (move_y_intent / move_mag) * attach_offset_dist;
                } else {
                    attach_dx = (this.goal_x_target > this.x ? 1 : -1) * attach_offset_dist;
                }

                ball_obj.x = this.x + attach_dx;
                ball_obj.y = this.y + attach_dy;
                ball_obj.vx = 0; ball_obj.vy = 0;

                last_toucher = this;
                last_touch_time = performance.now();

                ball_obj.x = Math.max(BALL_RADIUS, Math.min(WIDTH - BALL_RADIUS, ball_obj.x));
                ball_obj.y = Math.max(BALL_RADIUS, Math.min(HEIGHT - BALL_RADIUS, ball_obj.y));
            }
        } else if (this.hasBall) {
            this.hasBall = false;
        }
    }

    kick_ball_towards_goal(ball_obj) {
        if (this.isCatchingBall && this.hasBall) {
            return;
        }

        const current_time_ms = performance.now();
        const dist_to_ball = Math.sqrt(Math.pow(ball_obj.x - this.x, 2) + Math.pow(ball_obj.y - this.y, 2));

        if (dist_to_ball < ROBOT_RADIUS + BALL_RADIUS + 2) {
            let kick_occurred = false;
            if (last_toucher !== null && last_toucher !== this && (current_time_ms - last_touch_time < TRICK_MANEUVER_WINDOW_MS)) {
                ball_obj.vx = (this.goal_x_target > ball_obj.x ? TRICK_KICK_VX_STRENGTH : -TRICK_KICK_VX_STRENGTH);
                ball_obj.vy = (Math.random() < 0.5 ? -1 : 1) * TRICK_KICK_VY_STRENGTH;
                if (this.sprint_available && !this.sprinting) this.activate_sprint();
                kick_occurred = true;
            } else {
                let goal_dx = this.goal_x_target - ball_obj.x;
                let goal_dy = (HEIGHT / 2) - ball_obj.y;
                let goal_dist = Math.sqrt(goal_dx * goal_dx + goal_dy * goal_dy);
                if (goal_dist > 0) {
                    ball_obj.vx = (goal_dx / goal_dist) * NORMAL_KICK_STRENGTH;
                    ball_obj.vy = (goal_dy / goal_dist) * NORMAL_KICK_STRENGTH;
                    kick_occurred = true;
                }
            }
            if (kick_occurred) {
                last_touch_time = current_time_ms;
                last_toucher = this;
                this.hasBall = false;
            }
        }
    }

    check_robot_collision(other_robot) {
        let dx_robots = other_robot.x - this.x;
        let dy_robots = other_robot.y - this.y;
        let dist_robots = Math.sqrt(dx_robots * dx_robots + dy_robots * dy_robots);

        if (dist_robots < 2 * ROBOT_RADIUS && dist_robots > 0) {
            let angle = Math.atan2(dy_robots, dx_robots);
            let overlap = (2 * ROBOT_RADIUS - dist_robots);
            let separation_amount = overlap / 2 + 0.1;

            this.x -= Math.cos(angle) * separation_amount;
            this.y -= Math.sin(angle) * separation_amount;
            other_robot.x += Math.cos(angle) * separation_amount;
            other_robot.y += Math.sin(angle) * separation_amount;
            
            this.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, this.x));
            this.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, this.y));
            other_robot.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, other_robot.x));
            other_robot.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, other_robot.y));

            if (this === robot1) {
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
        if (isManualMode && (this.hasBall || this.isCatchingBall)) return;

        const current_time_ms = performance.now();
        const dist_to_ball = Math.sqrt(Math.pow(ball_obj.x - this.x, 2) + Math.pow(ball_obj.y - this.y, 2));

        if (last_toucher === this &&
            (current_time_ms - last_touch_time > BALL_UNSTICK_MIN_DURATION_MS) && 
            (current_time_ms - last_touch_time < BALL_UNSTICK_TIMEOUT_MS)) {      
            if (dist_to_ball < ROBOT_RADIUS + BALL_RADIUS + 5) {
                ball_obj.vy += (Math.random() < 0.5 ? -1 : 1) * BALL_UNSTICK_NUDGE_STRENGTH;
                ball_obj.vx += (Math.random() < 0.5 ? -1 : 1) * BALL_UNSTICK_NUDGE_STRENGTH * 0.5;
                last_touch_time = current_time_ms;
            }
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, ROBOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = this.color; ctx.fill(); ctx.closePath();
    }
}

// --- PAUSE/RESUME FUNCTIONS ---
function togglePause() {
    isPaused = !isPaused;
    if (isPaused) {
        pauseStartTime = performance.now();
        pauseHelpTextElem.textContent = "GAME PAUSED | P: Resume | H: Help";
    } else {
        const pauseDuration = performance.now() - pauseStartTime;
        adjustTimersForPause(pauseDuration);
        pauseHelpTextElem.textContent = "P: Pause | H: Help";
    }
}

function adjustTimersForPause(duration) {
    start_time += duration;
    game_start_time += duration;
    if (last_touch_time !== 0) last_touch_time += duration;

    [robot1, robot2].forEach(robot => {
        if (robot.sprinting) {
            robot.sprint_start_time += duration;
        } else if (!robot.sprint_available) {
            robot.rest_start_time += duration;
        }
    });
}

function toggleHelp() {
    showHelp = !showHelp;
    if (showHelp) {
        wasPausedBeforeHelp = isPaused;
        if (!isPaused) {
            isPaused = true;
            pauseStartTime = performance.now();
        }
        pauseHelpTextElem.textContent = "H: Close Help | P: Pause/Resume";
    } else {
        if (!wasPausedBeforeHelp && isPaused) {
            isPaused = false;
            const pauseDuration = performance.now() - pauseStartTime;
            adjustTimersForPause(pauseDuration);
        }
        pauseHelpTextElem.textContent = isPaused ? "GAME PAUSED | P: Resume | H: Help" : "P: Pause | H: Help";
    }
}

// --- Input Handlers ---
window.addEventListener('keydown', (e) => {
    if (e.code === PAUSE_KEY && !showHelp) {
        togglePause();
        return;
    }
    if (e.code === HELP_KEY) {
        toggleHelp();
        return;
    }
    if (isPaused && !showHelp) return;
    keysPressed[e.code] = true;

    if ([P1_UP, P1_DOWN, P1_LEFT, P1_RIGHT, P2_UP, P2_DOWN, P2_LEFT, P2_RIGHT, 'Space'].includes(e.code)) {
        // e.preventDefault(); // Uncomment if scrolling is an issue for these keys
    }
});

window.addEventListener('keyup', (e) => {
    if (isPaused && !showHelp && e.code !== PAUSE_KEY && e.code !== HELP_KEY) return;
    keysPressed[e.code] = false;
});

function handle_manual_input() {
    let p1_dx = 0; let p1_dy = 0;
    if (keysPressed[P1_LEFT]) p1_dx -= 1;
    if (keysPressed[P1_RIGHT]) p1_dx += 1;
    if (keysPressed[P1_UP]) p1_dy -= 1;
    if (keysPressed[P1_DOWN]) p1_dy += 1;
    robot1.set_manual_movement_direction(p1_dx, p1_dy);

    if (keysPressed[P1_SPRINT]) robot1.activate_sprint();
    robot1.set_catching(!!keysPressed[P1_CATCH]);

    let p2_dx = 0; let p2_dy = 0;
    if (keysPressed[P2_LEFT]) p2_dx -= 1;
    if (keysPressed[P2_RIGHT]) p2_dx += 1;
    if (keysPressed[P2_UP]) p2_dy -= 1;
    if (keysPressed[P2_DOWN]) p2_dy += 1;
    robot2.set_manual_movement_direction(p2_dx, p2_dy);

    if (keysPressed[P2_SPRINT]) robot2.activate_sprint();
    robot2.set_catching(!!keysPressed[P2_CATCH]);
}

// --- TOUCH CONTROL SETUP ---
function setupTouchControls() {
    const touchButtonMappings = [
        { id: 'p1TouchUp', key: P1_UP }, { id: 'p1TouchDown', key: P1_DOWN },
        { id: 'p1TouchLeft', key: P1_LEFT }, { id: 'p1TouchRight', key: P1_RIGHT },
        { id: 'p1TouchSprint', key: P1_SPRINT }, { id: 'p1TouchCatch', key: P1_CATCH },
        { id: 'p2TouchUp', key: P2_UP }, { id: 'p2TouchDown', key: P2_DOWN },
        { id: 'p2TouchLeft', key: P2_LEFT }, { id: 'p2TouchRight', key: P2_RIGHT },
        { id: 'p2TouchSprint', key: P2_SPRINT }, { id: 'p2TouchCatch', key: P2_CATCH },
    ];

    touchButtonMappings.forEach(mapping => {
        const button = document.getElementById(mapping.id);
        if (button) {
            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (isPaused && !showHelp) return;
                keysPressed[mapping.key] = true;
            }, { passive: false });

            button.addEventListener('touchend', (e) => {
                e.preventDefault();
                keysPressed[mapping.key] = false;
            }, { passive: false });

            button.addEventListener('mousedown', (e) => { // For desktop testing
                if (isPaused && !showHelp) return;
                keysPressed[mapping.key] = true;
            });
            button.addEventListener('mouseup', (e) => { // For desktop testing
                keysPressed[mapping.key] = false;
            });
            button.addEventListener('mouseleave', (e) => { // For desktop testing
                keysPressed[mapping.key] = false;
            });
        } else {
            console.warn(`Touch button with id ${mapping.id} not found.`);
        }
    });
}

function update_info_panel() {
    const ct = performance.now();
    const total_playtime_sec = isPaused ? (pauseStartTime - start_time) / 1000 : (ct - start_time) / 1000;
    const current_round_time_sec = isPaused ? (pauseStartTime - game_start_time) / 1000 : (ct - game_start_time) / 1000;

    scoreTextElem.textContent = `Score: Blue ${total_goals_robot1} - Green ${total_goals_robot2}`;
    totalTimeTextElem.textContent = `Total Playtime: ${Math.floor(total_playtime_sec)}s`;
    roundTimeTextElem.textContent = `Current Round: ${Math.floor(current_round_time_sec)}s`;
    
    let r1s = robot1.sprinting?'Active':(robot1.sprint_available?'Available':'Cooldown');
    blueSprintTextElem.textContent = `Blue Sprint: ${r1s}${isManualMode && robot1.hasBall ? ' (Dribbling)' : ''}`;
    
    let r2s = robot2.sprinting?'Active':(robot2.sprint_available?'Available':'Cooldown');
    greenSprintTextElem.textContent = `Green Sprint: ${r2s}${isManualMode && robot2.hasBall ? ' (Dribbling)' : ''}`;
}

// --- DRAWING FUNCTIONS FOR OVERLAYS ---
function drawPausedScreen() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "white";
    ctx.font = "48px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", WIDTH / 2, HEIGHT / 2);
    ctx.font = "20px Arial";
    ctx.fillText("Press P to Resume", WIDTH / 2, HEIGHT / 2 + 40);
}

function drawHelpMenu() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const boxPadding = 30;
    const boxWidth = Math.min(WIDTH * 0.8, 500);
    const boxX = (WIDTH - boxWidth) / 2;
    
    // Estimate height (simplified)
    const numLines = 15; // Approx number of lines for help
    const lineHeight = 22; 
    const boxHeight = Math.min(HEIGHT * 0.8, numLines * lineHeight + boxPadding * 2 + 40); // +40 for title/footer
    const boxY = (HEIGHT - boxHeight) / 2;

    ctx.fillStyle = "#333";
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2;
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.font = "bold 24px Arial";
    ctx.fillText("Game Controls", WIDTH / 2, boxY + boxPadding + 5);

    ctx.textAlign = "left";
    let currentY = boxY + boxPadding + 45;

    function drawHelpLine(text, isBold = false, indent = 0) {
        ctx.font = `${isBold ? 'bold ' : ''}15px Arial`;
        ctx.fillText(text, boxX + boxPadding + indent, currentY);
        currentY += 22;
    }
    
    drawHelpLine("Player 1 (Blue - Left):", true);
    drawHelpLine("Move: Arrow Keys", false, 15);
    drawHelpLine("Sprint: Period (.)", false, 15);
    drawHelpLine("Catch: Minus (-)", false, 15);
    currentY += 10;

    drawHelpLine("Player 2 (Green - Right):", true);
    drawHelpLine("Move: W, A, S, D", false, 15);
    drawHelpLine("Sprint: V", false, 15);
    drawHelpLine("Catch: B", false, 15);
    currentY += 10;

    drawHelpLine("General:", true);
    drawHelpLine("Pause: P", false, 15);
    drawHelpLine("Help: H (Toggle)", false, 15);
    currentY += 20;

    ctx.textAlign = "center";
    ctx.font = "bold 16px Arial";
    ctx.fillText("Press H to close Help", WIDTH / 2, Math.min(boxY + boxHeight - boxPadding + 5, currentY + 10));
}

function gameLoop() {
    if (!isPaused) {
        robot1.update_sprint_status();
        robot2.update_sprint_status();

        if (isManualMode) {
            handle_manual_input();
            robot1.update_position(ball);
            robot2.update_position(ball);
        } else {
            robot1.move_towards_ball(ball);
            robot2.move_towards_ball(ball);
        }

        if (!((robot1.isCatchingBall && robot1.hasBall) || (robot2.isCatchingBall && robot2.hasBall))) {
            ball.move();
        }
        
        robot1.kick_ball_towards_goal(ball);
        robot2.kick_ball_towards_goal(ball);
        
        robot1.check_robot_collision(robot2);
        
        if (!isManualMode || (!robot1.hasBall && !robot2.hasBall)) {
            robot1.attempt_ball_unstick(ball);
            robot2.attempt_ball_unstick(ball);
        }
        update_info_panel();
    } else {
        update_info_panel(); // Update to show frozen timers
    }

    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ball.draw();
    robot1.draw();
    robot2.draw();

    ctx.fillStyle = BLACK_COLOR;
    ctx.fillRect(0, (HEIGHT / 2) - (GOAL_WIDTH / 2), GOAL_POST_DEPTH, GOAL_WIDTH);
    ctx.fillRect(WIDTH - GOAL_POST_DEPTH, (HEIGHT / 2) - (GOAL_WIDTH / 2), GOAL_POST_DEPTH, GOAL_WIDTH);

    if (!showHelp) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.font = "14px Arial";
        ctx.textAlign = "right";
        ctx.fillText("H for Help", WIDTH - 10, HEIGHT - 10);
    }
    
    if (showHelp) {
        drawHelpMenu();
    } else if (isPaused) {
        drawPausedScreen();
    }

    requestAnimationFrame(gameLoop);
}

// Initialize and start
reset_game();
setupTouchControls();
gameLoop();
