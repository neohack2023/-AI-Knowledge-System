class Player {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius; 
        this.speed = 5;
        this.velocity = { x: 0, y: 0 };
        this.angle = 0; 
    }
    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Left Shoulder
        ctx.fillStyle = '#1e3d23'; 
        ctx.fillRect(-8, -16, 16, 10);
        
        // Right Shoulder
        ctx.fillStyle = '#1e3d23'; 
        ctx.fillRect(-8, 6, 16, 10);

        // Gun
        ctx.fillStyle = '#444'; 
        ctx.fillRect(0, 5, 25, 6); 
        ctx.fillStyle = '#222';
        ctx.fillRect(20, 4, 8, 8); 

        // Torso/Body
        ctx.fillStyle = '#2d5a36'; 
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();

        // Helmet
        ctx.fillStyle = '#3a7546'; 
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        // Visor
        ctx.fillStyle = '#77c9ff';
        ctx.beginPath();
        ctx.arc(2, 0, 6, -Math.PI / 2.5, Math.PI / 2.5);
        ctx.lineTo(4, 0); 
        ctx.fill();

        ctx.restore(); 
    }
    update() {
        if (this.x + this.radius > canvas.width) this.x = canvas.width - this.radius;
        if (this.x - this.radius < 0) this.x = this.radius;
        if (this.y + this.radius > canvas.height) this.y = canvas.height - this.radius;
        if (this.y - this.radius < 0) this.y = this.radius;

        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.draw();
    }
}
