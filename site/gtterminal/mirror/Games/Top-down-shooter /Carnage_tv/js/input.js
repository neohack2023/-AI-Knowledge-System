const joystickL = { active: false, id: null, baseX: 0, baseY: 0, x: 0, y: 0, dx: 0, dy: 0 };
const joystickR = { active: false, id: null, baseX: 0, baseY: 0, x: 0, y: 0, dx: 0, dy: 0, angle: 0 };
const maxJoystickRadius = 50;

function drawJoystick(stick) {
    if (!stick.active) return;
    ctx.beginPath();
    ctx.arc(stick.baseX, stick.baseY, maxJoystickRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(stick.x, stick.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
}

function handleTouch(e) {
    e.preventDefault(); 
    
    joystickL.active = false;
    joystickR.active = false;

    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        
        if (touch.clientX < canvas.width / 2) {
            joystickL.active = true;
            joystickL.id = touch.identifier;
            
            let dx = touch.clientX - joystickL.baseX;
            let dy = touch.clientY - joystickL.baseY;
            let distance = Math.hypot(dx, dy);
            
            if (distance > maxJoystickRadius) {
                dx = (dx / distance) * maxJoystickRadius;
                dy = (dy / distance) * maxJoystickRadius;
            }
            
            joystickL.x = joystickL.baseX + dx;
            joystickL.y = joystickL.baseY + dy;
            joystickL.dx = dx / maxJoystickRadius;
            joystickL.dy = dy / maxJoystickRadius;
        } 
        else {
            joystickR.active = true;
            joystickR.id = touch.identifier;
            
            let dx = touch.clientX - joystickR.baseX;
            let dy = touch.clientY - joystickR.baseY;
            let distance = Math.hypot(dx, dy);
            
            if (distance > maxJoystickRadius) {
                dx = (dx / distance) * maxJoystickRadius;
                dy = (dy / distance) * maxJoystickRadius;
            }
            
            joystickR.x = joystickR.baseX + dx;
            joystickR.y = joystickR.baseY + dy;
            joystickR.angle = Math.atan2(dy, dx);
        }
    }
}

canvas.addEventListener('touchstart', handleTouch, {passive: false});
canvas.addEventListener('touchmove', handleTouch, {passive: false});
canvas.addEventListener('touchend', handleTouch);
canvas.addEventListener('touchcancel', handleTouch);
