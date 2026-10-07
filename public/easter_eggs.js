document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. System Overload (Title Glitch Reboot) ---
    const mainTitle = document.querySelector('h1.glitch');
    if (mainTitle) {
        let titleClickCount = 0;
        let titleClickTimer = null;
        
        mainTitle.style.cursor = 'pointer';
        mainTitle.addEventListener('click', () => {
            titleClickCount++;
            clearTimeout(titleClickTimer);
            titleClickTimer = setTimeout(() => { titleClickCount = 0; }, 2000);
            
            if (titleClickCount >= 5) {
                titleClickCount = 0;
                triggerSystemOverload();
            }
        });
    }

    function triggerSystemOverload() {
        const terminal = document.querySelector('.terminal-container');
        const boot = document.getElementById('boot-sequence');
        terminal.style.display = 'none';
        boot.style.display = 'block';
        boot.innerHTML = '';
        
        const lines = [
            "BIOS DATE 10/07/26 23:16:10 VER 1.00",
            "CPU: QUANTUM PROCESSOR",
            "MEMORY: 640K OK",
            "LOADING KERNEL...",
            "MOUNTING FILESYSTEM...",
            "INITIALIZING TRANSPILER...",
            "SYSTEM RESTORED"
        ];
        
        let delay = 0;
        lines.forEach((line, i) => {
            setTimeout(() => {
                boot.innerHTML += line + "\n";
            }, delay);
            delay += 500 + Math.random() * 500;
        });
        
        setTimeout(() => {
            boot.style.display = 'none';
            terminal.style.display = 'flex';
        }, delay + 1000);
    }

    // --- 2. Konami Code (Matrix Effect) ---
    const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let konamiIndex = 0;
    
    document.addEventListener('keydown', (e) => {
        if (e.key === konamiCode[konamiIndex]) {
            konamiIndex++;
            if (konamiIndex === konamiCode.length) {
                konamiIndex = 0;
                triggerMatrixEffect();
            }
        } else {
            konamiIndex = 0;
        }
    });

    function triggerMatrixEffect() {
        const canvas = document.createElement('canvas');
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '9998';
        canvas.style.pointerEvents = 'none';
        document.body.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$+-*/=%""\'#&_(),.;:?!\\|{}<>[]^~';
        const fontSize = 16;
        const columns = canvas.width / fontSize;
        const drops = Array(Math.floor(columns)).fill(1);
        
        let interval = setInterval(() => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#0F0';
            ctx.font = fontSize + 'px Share Tech Mono';
            
            for (let i = 0; i < drops.length; i++) {
                const text = chars.charAt(Math.floor(Math.random() * chars.length));
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        }, 33);
        
        setTimeout(() => {
            clearInterval(interval);
            canvas.remove();
        }, 8000);
    }

    // --- 3. Pong Game (PING localhost;) ---
    const runBtn = document.getElementById('run-btn');
    if (runBtn) {
        runBtn.addEventListener('click', (e) => {
            const cmElement = document.querySelector('.CodeMirror');
            if (!cmElement || !cmElement.CodeMirror) return;
            
            const query = cmElement.CodeMirror.getValue().trim().toUpperCase();
            
            if (query === 'PING LOCALHOST;' || query === 'SELECT * FROM UNIVERSE;') {
                e.stopImmediatePropagation(); 
                openGame('PONG_SYS_AI', startPong);
            }
        }, true); // use capture phase to intercept
    }

    // --- Modals for Games ---
    const gameModal = document.getElementById('game-modal');
    const closeGameBtn = document.getElementById('close-game-btn');
    const gameTitle = document.getElementById('game-title');
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let currentGameLoop = null;

    if (closeGameBtn) {
        closeGameBtn.addEventListener('click', () => {
            gameModal.classList.remove('active');
            if (currentGameLoop) {
                cancelAnimationFrame(currentGameLoop);
                currentGameLoop = null;
            }
        });
    }

    function openGame(title, gameStarter) {
        if (!gameModal) return;
        gameTitle.textContent = title;
        gameModal.classList.add('active');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (currentGameLoop) cancelAnimationFrame(currentGameLoop);
        gameStarter();
    }

    // --- AST Click Handlers (Delegation) ---
    const astOutput = document.getElementById('ast-output');
    if (astOutput) {
        astOutput.addEventListener('click', (e) => {
            const node = e.target.closest('.ast-node');
            if (!node) return;
            
            const text = node.textContent.trim();
            if (text === 'CreateTableQuery') {
                openGame('SYS.GAME // SCHEMA_STACKER', startSchemaStacker);
            } else if (text === 'Identifier') {
                openGame('SYS.GAME // SYNTAX_INVADERS', startSyntaxInvaders);
            }
        });
    }
    
    // --- Breakout on AST Visualizer Header ---
    const astHeader = document.querySelector('.ast-panel .panel-header');
    if (astHeader) {
        astHeader.style.cursor = 'pointer';
        astHeader.addEventListener('click', () => {
            openGame('SYS.GAME // MEMORY_DUMP_BREAKOUT', startBreakout);
        });
    }

    // --- GAME IMPLEMENTATIONS ---

    // 1. PONG
    function startPong() {
        let paddleY = canvas.height/2 - 30;
        let aiY = canvas.height/2 - 30;
        let ball = { x: canvas.width/2, y: canvas.height/2, vx: 5, vy: 5, radius: 5 };
        
        const moveHandler = (e) => {
            const rect = canvas.getBoundingClientRect();
            // Scale mouse coordinates to canvas resolution
            const scaleY = canvas.height / rect.height;
            paddleY = (e.clientY - rect.top) * scaleY - 30;
            if (paddleY < 0) paddleY = 0;
            if (paddleY > canvas.height - 60) paddleY = canvas.height - 60;
        };
        canvas.addEventListener('mousemove', moveHandler);
        
        function loop() {
            if (!gameModal.classList.contains('active')) {
                canvas.removeEventListener('mousemove', moveHandler);
                return;
            }
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Move ball
            ball.x += ball.vx;
            ball.y += ball.vy;
            
            // Wall collision
            if (ball.y <= 0 || ball.y >= canvas.height) ball.vy *= -1;
            
            // AI Movement
            if (aiY + 30 < ball.y) aiY += 4;
            else if (aiY + 30 > ball.y) aiY -= 4;
            if (aiY < 0) aiY = 0;
            if (aiY > canvas.height - 60) aiY = canvas.height - 60;
            
            // Paddle collision
            if (ball.x <= 20 && ball.x >= 10 && ball.y > paddleY && ball.y < paddleY + 60) {
                ball.vx *= -1;
                ball.x = 20;
            }
            if (ball.x >= canvas.width - 20 && ball.x <= canvas.width - 10 && ball.y > aiY && ball.y < aiY + 60) {
                ball.vx *= -1;
                ball.x = canvas.width - 20;
            }
            
            // Score / Reset
            if (ball.x < 0 || ball.x > canvas.width) {
                ball.x = canvas.width/2;
                ball.y = canvas.height/2;
                ball.vx = (Math.random() > 0.5 ? 5 : -5);
                ball.vy = (Math.random() > 0.5 ? 5 : -5);
            }
            
            // Draw
            ctx.fillStyle = '#39ff14'; // phosphor
            ctx.fillRect(10, paddleY, 10, 60); // Player
            ctx.fillRect(canvas.width - 20, aiY, 10, 60); // AI
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI*2);
            ctx.fill();
            
            // Center line
            ctx.setLineDash([5, 15]);
            ctx.beginPath();
            ctx.moveTo(canvas.width/2, 0);
            ctx.lineTo(canvas.width/2, canvas.height);
            ctx.strokeStyle = '#1a7a08';
            ctx.stroke();
            
            currentGameLoop = requestAnimationFrame(loop);
        }
        currentGameLoop = requestAnimationFrame(loop);
    }
    
    // 2. SCHEMA STACKER (Mini Tetris)
    function startSchemaStacker() {
        const gridW = 10, gridH = 20;
        const blockSz = 20;
        const offsetX = (canvas.width - gridW*blockSz)/2;
        const grid = Array(gridH).fill().map(() => Array(gridW).fill(0));
        
        let pos = {x: 3, y: 0};
        let shape = [[1,1,1],[0,1,0]]; // T shape
        let tickCounter = 0;
        
        const keyHandler = (e) => {
            if (!gameModal.classList.contains('active')) return;
            if (e.key === 'ArrowLeft') { pos.x--; if(collides()) pos.x++; }
            if (e.key === 'ArrowRight') { pos.x++; if(collides()) pos.x--; }
            if (e.key === 'ArrowDown') { pos.y++; if(collides()) pos.y--; }
            if (e.key === 'ArrowUp') { 
                const old = shape;
                shape = shape[0].map((val, i) => shape.map(row => row[i]).reverse());
                if (collides()) shape = old;
            }
        };
        document.addEventListener('keydown', keyHandler);
        
        function collides() {
            for(let r=0; r<shape.length; r++) {
                for(let c=0; c<shape[r].length; c++) {
                    if (shape[r][c]) {
                        let nx = pos.x + c;
                        let ny = pos.y + r;
                        if (nx<0 || nx>=gridW || ny>=gridH) return true;
                        if (ny>=0 && grid[ny][nx]) return true;
                    }
                }
            }
            return false;
        }
        
        function merge() {
            for(let r=0; r<shape.length; r++) {
                for(let c=0; c<shape[r].length; c++) {
                    if (shape[r][c] && pos.y+r >= 0) grid[pos.y+r][pos.x+c] = 1;
                }
            }
            // Clear lines
            for(let r=gridH-1; r>=0; r--) {
                if (grid[r].every(v => v===1)) {
                    grid.splice(r, 1);
                    grid.unshift(Array(gridW).fill(0));
                    r++;
                }
            }
            pos = {x: 4, y: 0};
            const shapes = [ [[1,1,1,1]], [[1,1],[1,1]], [[1,1,1],[0,1,0]], [[1,1,1],[1,0,0]] ];
            shape = shapes[Math.floor(Math.random()*shapes.length)];
            if (collides()) {
                // Game Over - restart grid
                grid.forEach(row => row.fill(0));
            }
        }
        
        function loop() {
            if (!gameModal.classList.contains('active')) {
                document.removeEventListener('keydown', keyHandler);
                return;
            }
            
            tickCounter++;
            if (tickCounter > 30) {
                pos.y++;
                if (collides()) {
                    pos.y--;
                    merge();
                }
                tickCounter = 0;
            }
            
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.strokeStyle = '#1a7a08';
            ctx.strokeRect(offsetX, 0, gridW*blockSz, gridH*blockSz);
            
            ctx.fillStyle = '#39ff14';
            for(let r=0; r<gridH; r++) {
                for(let c=0; c<gridW; c++) {
                    if (grid[r][c]) ctx.fillRect(offsetX + c*blockSz, r*blockSz, blockSz-1, blockSz-1);
                }
            }
            for(let r=0; r<shape.length; r++) {
                for(let c=0; c<shape[r].length; c++) {
                    if (shape[r][c]) ctx.fillRect(offsetX + (pos.x+c)*blockSz, (pos.y+r)*blockSz, blockSz-1, blockSz-1);
                }
            }
            
            currentGameLoop = requestAnimationFrame(loop);
        }
        currentGameLoop = requestAnimationFrame(loop);
    }
    
    // 3. SYNTAX INVADERS (Typing Game)
    function startSyntaxInvaders() {
        const words = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WHERE', 'TABLE', 'DATABASE', 'JOIN', 'CREATE', 'INDEX'];
        let activeWords = [];
        let score = 0;
        let tick = 0;
        
        const keyHandler = (e) => {
            if (!gameModal.classList.contains('active')) return;
            const key = e.key.toUpperCase();
            if (key.length !== 1 || !/[A-Z]/.test(key)) return;
            
            for (let i = 0; i < activeWords.length; i++) {
                if (activeWords[i].text.startsWith(activeWords[i].typed + key)) {
                    activeWords[i].typed += key;
                    if (activeWords[i].typed === activeWords[i].text) {
                        activeWords.splice(i, 1);
                        score += 10;
                    }
                    break;
                }
            }
        };
        document.addEventListener('keydown', keyHandler);
        
        function loop() {
            if (!gameModal.classList.contains('active')) {
                document.removeEventListener('keydown', keyHandler);
                return;
            }
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            tick++;
            if (tick % 60 === 0) {
                activeWords.push({
                    text: words[Math.floor(Math.random()*words.length)],
                    typed: '',
                    x: Math.random() * (canvas.width - 150) + 20,
                    y: 0
                });
            }
            
            ctx.font = '24px Share Tech Mono, monospace';
            for (let i = activeWords.length - 1; i >= 0; i--) {
                let w = activeWords[i];
                w.y += 1.5;
                
                ctx.fillStyle = '#39ff14';
                ctx.fillText(w.text, w.x, w.y);
                
                if (w.typed.length > 0) {
                    ctx.fillStyle = '#00f0ff';
                    ctx.fillText(w.typed, w.x, w.y);
                }
                
                if (w.y > canvas.height) {
                    activeWords.splice(i, 1);
                    score -= 5;
                }
            }
            
            ctx.fillStyle = '#39ff14';
            ctx.fillText(`SCORE: ${score}`, 10, 30);
            
            currentGameLoop = requestAnimationFrame(loop);
        }
        currentGameLoop = requestAnimationFrame(loop);
    }

    // 4. BREAKOUT (MEMORY DUMP BREAKOUT)
    function startBreakout() {
        let paddleX = canvas.width / 2 - 40;
        const paddleW = 80, paddleH = 10;
        let ball = { x: canvas.width / 2, y: canvas.height - 30, vx: 4, vy: -4, radius: 5 };
        
        const bricks = [];
        const rows = 4, cols = 8, w = 60, h = 20, padding = 10, offTop = 30, offLeft = 25;
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                bricks.push({ x: c*(w+padding)+offLeft, y: r*(h+padding)+offTop, status: 1 });
            }
        }
        
        const moveHandler = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            paddleX = (e.clientX - rect.left) * scaleX - paddleW / 2;
            if (paddleX < 0) paddleX = 0;
            if (paddleX + paddleW > canvas.width) paddleX = canvas.width - paddleW;
        };
        canvas.addEventListener('mousemove', moveHandler);
        
        function loop() {
            if (!gameModal.classList.contains('active')) {
                canvas.removeEventListener('mousemove', moveHandler);
                return;
            }
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw bricks
            ctx.fillStyle = '#1a7a08';
            bricks.forEach(b => {
                if (b.status === 1) {
                    ctx.fillRect(b.x, b.y, w, h);
                    ctx.strokeStyle = '#39ff14';
                    ctx.strokeRect(b.x, b.y, w, h);
                }
            });
            
            // Move ball
            ball.x += ball.vx;
            ball.y += ball.vy;
            
            if (ball.x < 0 || ball.x > canvas.width) ball.vx *= -1;
            if (ball.y < 0) ball.vy *= -1;
            else if (ball.y > canvas.height) {
                // reset
                ball.x = canvas.width / 2;
                ball.y = canvas.height - 30;
                ball.vy = -4;
            }
            
            // Paddle collision
            if (ball.y + ball.radius > canvas.height - paddleH - 5 && ball.x > paddleX && ball.x < paddleX + paddleW) {
                ball.vy *= -1;
                // Add english
                ball.vx = 8 * ((ball.x - (paddleX + paddleW/2)) / paddleW);
            }
            
            // Brick collision
            bricks.forEach(b => {
                if (b.status === 1) {
                    if (ball.x > b.x && ball.x < b.x + w && ball.y > b.y && ball.y < b.y + h) {
                        ball.vy *= -1;
                        b.status = 0;
                    }
                }
            });
            
            // Draw Paddle & Ball
            ctx.fillStyle = '#39ff14';
            ctx.fillRect(paddleX, canvas.height - paddleH - 5, paddleW, paddleH);
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI*2);
            ctx.fill();
            
            currentGameLoop = requestAnimationFrame(loop);
        }
        currentGameLoop = requestAnimationFrame(loop);
    }
});
