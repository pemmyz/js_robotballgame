// Constants
const WIDTH = 800;
const HEIGHT = 600;
const BALL_RADIUS = 10;
const ROBOT_RADIUS = 20;
const GOAL_WIDTH = 100; // Height of the goal area

// Colors (using CSS color strings)
const WHITE = "white";
const GREEN_COLOR = "green"; // Renamed to avoid conflict with GREEN constant in Pygame
const RED_COLOR = "red";
const BLUE_COLOR = "blue";
const BLACK_COLOR = "black";

// Initialize canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = WIDTH;
canvas.height = HEIGHT;

// Font for displaying score, playtime, and sprint status (using canvas text API)
// We'll use DOM elements for text display as per HTML structure

// Game state variables
let total_goals_robot1 = 0;
let total_goals_robot2 = 0;
let start_time = performance.now();      // Tracks total playtime since simulation started
let game_start_time = performance.now();   // Tracks playtime for the current round
let last_touch_time = 0;
let last_toucher = null;

let ball, robot1, robot2;

// DOM Elements for info display
const scoreTextElem = document.getElementById('scoreText');
const totalTimeTextElem = document.getElementById('totalTimeText');
const roundTimeTextElem = document.getElementById('roundTimeText');
const blueSprintTextElem = document.getElementById('blueSprintText');
const greenSprintTextElem = document.getElementById('greenSprintText');


function reset_game() {
    ball = new Ball();
    robot1 = new Robot(100, HEIGHT / 2, BLUE_COLOR, WIDTH - 10); // Blue aims for right goal
    robot2 = new Robot(WIDTH - 100, HEIGHT / 2, GREEN_COLOR, 10); // Green aims for left goal
    game_start_time = performance.now();
    last_touch_time = 0;
    last_toucher = null;
}

class Ball {
    constructor() {
        this.x = WIDTH / 2;
        this.y = HEIGHT / 2;
        this.vx = (Math.random() * 4) - 2; // random.uniform(-2, 2)
        this.vy = (Math.random() * 4) - 2; // random.uniform(-2, 2)
        // this.last_toucher = null; // This was in Pygame Ball, but seems managed globally
    }

    move() {
        this.x += this.vx;
        this.y += this.vy;

        // Apply friction
        this.vx *= 0.98;
        this.vy *= 0.98;

        // Keep ball inside the field (wall bounce simple reversal)
        if (this.x - BALL_RADIUS < 0 || this.x + BALL_RADIUS > WIDTH) {
            this.vx *= -1; // Reverse horizontal velocity
            this.x = Math.max(BALL_RADIUS, Math.min(WIDTH - BALL_RADIUS, this.x));
        }
        if (this.y - BALL_RADIUS < 0 || this.y + BALL_RADIUS > HEIGHT) {
            this.vy *= -1; // Reverse vertical velocity
            this.y = Math.max(BALL_RADIUS, Math.min(HEIGHT - BALL_RADIUS, this.y));
        }


        // Check if ball enters goal
        // Left goal (for robot2 to score, robot1 defends)
        if (this.x - BALL_RADIUS < 10 && this.y > HEIGHT / 2 - GOAL_WIDTH / 2 && this.y < HEIGHT / 2 + GOAL_WIDTH / 2) {
            total_goals_robot2++;
            reset_game();
        }
        // Right goal (for robot1 to score, robot2 defends)
        else if (this.x + BALL_RADIUS > WIDTH - 10 && this.y > HEIGHT / 2 - GOAL_WIDTH / 2 && this.y < HEIGHT / 2 + GOAL_WIDTH / 2) {
            total_goals_robot1++;
            reset_game();
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = RED_COLOR;
        ctx.fill();
        ctx.closePath();
    }
}

class Robot {
    constructor(x, y, color, goal_x) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.speed = 2;
        this.color = color;
        this.goal_x = goal_x; // The x-coordinate of the goal this robot aims for
        this.stuck_counter = 0; // Not directly used in Pygame, but bounce_counter is
        this.bounce_counter = 0;

        // Sprint-related attributes
        this.sprinting = false;
        this.sprint_available = false;
        this.sprint_start_time = 0;
        this.rest_start_time = performance.now();
        this.sprint_multiplier = 2;
    }

    update_sprint_status() {
        const current = performance.now();
        // If sprinting, check if sprint time is over (2 seconds)
        if (this.sprinting) {
            if (current - this.sprint_start_time >= 2000) { // 2000 ms = 2s
                this.sprinting = false;
                this.sprint_available = false;
                this.rest_start_time = current;
            }
        }
        // If not sprinting and sprint is unavailable, check if cooldown is over (2 seconds)
        else if (!this.sprint_available) {
            if (current - this.rest_start_time >= 2000) {
                this.sprint_available = true;
            }
        }
    }

    move_towards_ball(ball) {
        let dx = ball.x - this.x;
        let dy = ball.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= 2 * ROBOT_RADIUS && this.sprint_available && !this.sprinting) {
            this.sprinting = true;
            this.sprint_start_time = performance.now();
        }

        let current_speed = this.speed * (this.sprinting ? this.sprint_multiplier : 1);

        if (dist > 0) { // Check dist > 0 to avoid division by zero if robot is on ball
            this.vx = (dx / dist) * current_speed;
            this.vy = (dy / dist) * current_speed;
        } else {
            this.vx = 0;
            this.vy = 0;
        }
        
        // Only move if not too close to avoid jittering on top of the ball
        if (dist > ROBOT_RADIUS + BALL_RADIUS - current_speed) { // Move if not already overlapping significantly
             this.x += this.vx;
             this.y += this.vy;
        }


        // Keep robot inside the field
        this.x = Math.max(ROBOT_RADIUS, Math.min(WIDTH - ROBOT_RADIUS, this.x));
        this.y = Math.max(ROBOT_RADIUS, Math.min(HEIGHT - ROBOT_RADIUS, this.y));
    }

    kick_ball_towards_goal(ball) {
        const current_time_sec = performance.now() / 1000;
        const last_touch_time_sec = last_touch_time / 1000;

        if (Math.sqrt(Math.pow(ball.x - this.x, 2) + Math.pow(ball.y - this.y, 2)) < ROBOT_RADIUS + BALL_RADIUS) {
            // Check for rapid succession trick maneuver
            if (last_toucher !== null && last_toucher !== this && (current_time_sec - last_touch_time_sec < 0.5)) {
                ball.vx = (this.goal_x > ball.x ? 2 : -2); // Push towards opponent's side
                ball.vy = (Math.random() < 0.5 ? -1 : 1) * 5; // Strong random vertical kick
                if (this.sprint_available && !this.sprinting) {
                    this.sprinting = true;
                    this.sprint_start_time = performance.now();
                }
            } else {
                // Normal kick: aim toward the center of the opponent's goal
                let goal_dx = this.goal_x - ball.x;
                let goal_dy = (HEIGHT / 2) - ball.y;
                let goal_dist = Math.sqrt(goal_dx * goal_dx + goal_dy * goal_dy);
                if (goal_dist > 0) {
                    ball.vx = (goal_dx / goal_dist) * 5;
                    ball.vy = (goal_dy / goal_dist) * 5;
                }
            }
            last_touch_time = performance.now();
            last_toucher = this;
        }
    }

    check_collision(other, ball) {
        let dx = other.x - this.x;
        let dy = other.y - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 2 * ROBOT_RADIUS && dist > 0) { // dist > 0 to avoid issues if perfectly overlapped
            let angle = Math.atan2(dy, dx);
            let overlap = (2 * ROBOT_RADIUS - dist) / 2;

            // Separate them
            this.x -= Math.cos(angle) * overlap;
            this.y -= Math.sin(angle) * overlap;
            other.x += Math.cos(angle) * overlap;
            other.y += Math.sin(angle) * overlap;
            
            // Simple bounce effect (could be more physically accurate)
            // Swap velocities can be tricky if they are moving based on ball.
            // For simplicity, just push them apart slightly more.
            let push_strength = 1;
            this.vx = -Math.cos(angle) * push_strength;
            this.vy = -Math.sin(angle) * push_strength;
            other.vx = Math.cos(angle) * push_strength;
            other.vy = Math.sin(angle) * push_strength;


            this.bounce_counter++;
            if (this.bounce_counter >= 5) {
                // Apply a nudge to 'other' to break potential deadlocks
                other.y += (Math.random() < 0.5 ? -1 : 1) * ROBOT_RADIUS * 2;
                this.bounce_counter = 0; // Reset counter for self
                // other.bounce_counter = 0; // Should also reset for other if it has one
            }
        }
        
        // If this robot was the last to touch the ball and is still very close to it for a while
        // (trying to unstick the ball)
        const current_time_sec = performance.now() / 1000;
        const last_touch_time_sec = last_touch_time / 1000;

        if (last_toucher === this && (current_time_sec - last_touch_time_sec < 3)) { // within 3 seconds
            if (Math.sqrt(Math.pow(ball.x - this.x, 2) + Math.pow(ball.y - this.y, 2)) < ROBOT_RADIUS + BALL_RADIUS + 5) { // If very close
                ball.vy += (Math.random() < 0.5 ? -1 : 1) * (1 + this.bounce_counter * 0.1); // Nudge ball vertically
            }
        }
    }


    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, ROBOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
}

function update_info_panel() {
    const current_time = performance.now();
    const total_playtime = (current_time - start_time) / 1000;
    const current_round_time = (current_time - game_start_time) / 1000;

    scoreTextElem.textContent = `Score: Blue ${total_goals_robot1} - Green ${total_goals_robot2}`;
    totalTimeTextElem.textContent = `Total Playtime: ${Math.floor(total_playtime)}s`;
    roundTimeTextElem.textContent = `Current Round: ${Math.floor(current_round_time)}s`;
    blueSprintTextElem.textContent = `Blue Sprint: ${robot1.sprinting ? 'Active' : (robot1.sprint_available ? 'Available' : 'Cooldown')}`;
    greenSprintTextElem.textContent = `Green Sprint: ${robot2.sprinting ? 'Active' : (robot2.sprint_available ? 'Available' : 'Cooldown')}`;
}

function gameLoop() {
    // Clear screen
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Update sprint status for each robot
    robot1.update_sprint_status();
    robot2.update_sprint_status();

    // Move objects
    ball.move();
    robot1.move_towards_ball(ball);
    robot2.move_towards_ball(ball);
    
    // Kick ball (check before collision so kick takes precedence)
    robot1.kick_ball_towards_goal(ball);
    robot2.kick_ball_towards_goal(ball);
    
    // Check robot collision
    // Call once as it handles both robots
    robot1.check_collision(robot2, ball);
    // robot2.check_collision(robot1, ball); // This would be redundant if the first call handles both

    // Draw objects
    ball.draw();
    robot1.draw();
    robot2.draw();

    // Draw goals
    ctx.fillStyle = BLACK_COLOR;
    ctx.fillRect(0, HEIGHT / 2 - GOAL_WIDTH / 2, 10, GOAL_WIDTH); // Left goal
    ctx.fillRect(WIDTH - 10, HEIGHT / 2 - GOAL_WIDTH / 2, 10, GOAL_WIDTH); // Right goal

    // Update info panel
    update_info_panel();

    requestAnimationFrame(gameLoop);
}

// Initialize game objects and start loop
reset_game();
gameLoop();
