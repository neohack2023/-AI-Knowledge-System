function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    joystickL.baseX = 100;
    joystickL.baseY = canvas.height - 100;
    joystickR.baseX = canvas.width - 100;
    joystickR.baseY = canvas.height - 100;
}
window.addEventListener('resize', resizeCanvas);

// Initialize Game State
resizeCanvas();
const player = new Player(canvas.width / 2, canvas.height / 2, 15);
const projectiles = [];
let lastShotTime = 0;

// Main Loop
function animate() {
    requestAnimationFrame(animate);
    
    ctx.fillStyle = 'rgba(26, 26, 26, 0.4)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Movement logic
    if (joystickL.active) {
        player.velocity.x = joystickL.dx * player.speed;
        player.velocity.y = joystickL.dy * player.speed;
        if (!joystickR.active) {
            player.angle = Math.atan2(joystickL.dy, joystickL.dx);
        }
    } else {
        player.velocity.x = 0;
        player.velocity.y = 0;
    }

    // Shooting logic
    if (joystickR.active) {
        player.angle = joystickR.angle; 

        const currentTime = Date.now();
        if (currentTime - lastShotTime > 120) { 
            const velocity = {
                x: Math.cos(joystickR.angle) * 12, 
                y: Math.sin(joystickR.angle) * 12
            };
            
            const spawnX = player.x + Math.cos(player.angle) * 25;
            const spawnY = player.y + Math.sin(player.angle) * 25 + (Math.sin(player.angle + Math.PI/2) * 8);

            projectiles.push(new Projectile(spawnX, spawnY, 4, '#ffdd00', velocity)); 
            lastShotTime = currentTime;
        }
    }

    player.update();

    // Update Projectiles
    projectiles.forEach((projectile, index) => {
        projectile.update();

        ctx.beginPath();
        ctx.arc(projectile.x - projectile.velocity.x, projectile.y - projectile.velocity.y, projectile.radius * 0.8, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255, 100, 0, 0.5)'; 
        ctx.fill();

        if (projectile.x < 0 || projectile.x > canvas.width || 
            projectile.y < 0 || projectile.y > canvas.height) {
            setTimeout(() => { projectiles.splice(index, 1); }, 0);
        }
    });

    drawJoystick(joystickL);
    drawJoystick(joystickR);
}

// Start the game!
animate();
