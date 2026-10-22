/* A self-contained cartoon Easter egg. All email is fictional, inside the game. */
document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.createElement('dialog'); dialog.className = 'chase-dialog'; dialog.setAttribute('aria-label', 'The Great Compiler Escape');
    dialog.innerHTML = `<div class="chase-shell">
        <header class="chase-header"><span>DAY 01 • COMPILER DESIGN</span><button class="chase-close" aria-label="Close game">✕</button></header>
        <div class="chase-scoreboard"><span id="chase-lives">♥ ♥ ♥</span><strong id="chase-score">0 / 50</strong><button id="chase-pause">Pause</button><span id="chase-best">Best: 0</span></div>
        <div class="chase-stage">
            <div class="classroom-board">COMPILER DESIGN<br><small>Attendance is not an optional parameter.</small></div>
            <div class="chase-door">EXIT<br>🚪</div>
            <div class="chase-student"><span>🏃</span><b>sir just 2 min!!</b></div>
            <div class="chase-lanes"><i></i><i></i><i></i></div>
            <div class="chase-professor"><img src="assets/dr-baskaran-p.png" alt="Professor Baskaran"><span class="prof-body">👔</span><span class="prof-legs">🦵🦵</span><b>SIR</b></div>
            <div class="chase-projectile" hidden></div>
            <p class="chase-commentary" aria-live="polite"></p>
            <div class="chase-story"><span class="chase-sticker">BASED ON CLASSROOM LORE*</span><div class="chase-intro-cast"><img src="assets/dr-baskaran-p.png" alt="Sir in class"><span>👨‍🏫 ➜ 🏃💨 🚪</span></div><h2>THE GREAT<br>COMPILER ESCAPE</h2><p>First day. First class.<br>One student has already executed <code>return;</code></p><p>You are Sir. Chase the escape artist and dodge flying excuses and suspicious questions.</p><p><strong>3 lives · +10 per dodge · 50 to win</strong><br>← → or A / D to switch lanes. Touch buttons work too.</p><button class="chase-start">TAKE ATTENDANCE. PERSONALLY. →</button><small>*A very unserious cartoon. All mail stays in this game.</small></div>
            <div class="chase-ending" hidden></div>
        </div>
        <footer class="chase-controls"><button data-move="-1" aria-label="Move sir left">← LEFT</button><span>DODGE THE EXCUSES</span><button data-move="1" aria-label="Move sir right">RIGHT →</button></footer>
    </div>`;
    document.body.append(dialog);
    const $ = selector => dialog.querySelector(selector);
    const professor = $('.chase-professor'), projectile = $('.chase-projectile'), commentary = $('.chase-commentary');
    const stage = $('.chase-stage'), ending = $('.chase-ending');
    const excuses = [
        ['SIR, WIFI ATE MY AST 📶', 'The router has been called as a witness.'],
        ['MY ATTENDANCE IS NULL 🫥', 'IS NULL does not mean IS PRESENT.'],
        ['SIR, CAT ATE MY TOKENS 🐈', 'That cat is now a lexical analyzer.'],
        ['CAN WE SKIP THE PARSER? 🥺', 'Can we skip your marks?'],
        ['MY BRAIN IS LEFT RECURSIVE 🔁', 'Eliminate recursion. Then eliminate excuses.'],
        ['SIR, I WAS IN THE OTHER CLASS 🚪', 'A classic scope resolution error.'],
        ['CHATGPT SAID NO CLASS 🤖', 'Hallucination detected. Attendance rejected.'],
        ['SEMICOLON WAS OPTIONAL, SIR ;', 'Your escape has a syntax error.'],
        ['SIR, JUST ONE SMALL DOUBT 🙋', 'The doubt has three subqueries.'],
        ['I AM PRESENT IN SPIRIT 👻', 'Spirit is not a recognized datatype.']
    ];
    let state = ChaseRules.initial(), lane = 1, obstacleLane = 0, progress = 0, delay = 0, running = false, paused = false, raf = 0, last = 0, previousFocus, round = 0;
    let best = 0; try { best = Number(localStorage.getItem('minisql.chase.best')) || 0; } catch (_) {}
    function hud() { $('#chase-lives').textContent = '♥ '.repeat(state.lives) + '♡ '.repeat(3 - state.lives); $('#chase-score').textContent = `${state.score} / 50`; $('#chase-best').textContent = `Best: ${best}`; }
    function move(delta) {
        if (!running || paused) return;
        lane = Math.max(0, Math.min(2, lane + delta));
        professor.style.left = (17 + lane * 33) + '%';
    }
    function spawn() {
        professor.classList.remove('prof-hit');
        obstacleLane = Math.floor(Math.random() * 3); progress = 0; round++;
        projectile.textContent = excuses[(round - 1) % excuses.length][0]; projectile.style.left = (17 + obstacleLane * 33) + '%';
        projectile.hidden = false; projectile.style.top = '25%';
        projectile.classList.remove('bonk');
        commentary.textContent = round % 2 ? 'STUDENT USED: EMOTIONAL DAMAGE' : 'Sir has entered strict evaluation mode.';
    }
    function finish() {
        running = false; cancelAnimationFrame(raf); projectile.hidden = true; $('#chase-pause').disabled = true;
        best = Math.max(best, state.score); try { localStorage.setItem('minisql.chase.best', String(best)); } catch (_) {} hud();
        ending.hidden = false; ending.replaceChildren();
        const title = document.createElement('h2'), text = document.createElement('p'), replay = document.createElement('button'); replay.textContent = 'ONE MORE PERIOD ↻'; replay.onclick = start;
        if (state.status === 'won') {
            dialog.classList.add('chase-won');
            title.textContent = 'EXCUSES: REJECTED. MAIL: SENT. 📬';
            text.textContent = 'Sir calmly opens his laptop. The student feels a disturbance in the inbox.';
            const mail = document.createElement('div'); mail.className = 'chase-mail';
            const mailText = document.createElement('p'); mailText.textContent = 'To: The Great Escape Artist\nSubject: Regarding your return; statement\n\nDear Student,\nYour exit was fast. My compiler is faster.\nKindly report to class. Bring your AST.\n\nRegards,\nSir\nSent from my Semantic Analyzer.';
            const plane = document.createElement('span'); plane.className = 'chase-mail-plane'; plane.textContent = '✉️';
            const sent = document.createElement('strong'); sent.textContent = '✓ SENT • Fictional game animation'; mail.append(mailText, sent, plane);
            const laptop = document.createElement('div'); laptop.className = 'chase-laptop'; laptop.innerHTML = '<img src="assets/dr-baskaran-p.png" alt="Sir"> 💻';
            ending.append(title, text, laptop, mail, replay);
            commentary.textContent = 'Achievement unlocked: Reply All Energy.';
        } else {
            dialog.classList.add('chase-lost'); title.textContent = 'EXCUSE BUFFER OVERFLOW 💥';
            text.textContent = 'Sir sits down for one second. The student has already switched departments.';
            const scene = document.createElement('div'); scene.className = 'chase-loss-scene'; scene.textContent = '🪑 ☕ … 🏃💨';
            ending.append(title, text, scene, replay); commentary.textContent = 'Compilation terminated. Tea break required.';
        }
        replay.focus();
    }
    function tick(time) {
        if (!running || !dialog.open) return;
        const dt = Math.min((time - last) / 1000, .25); last = time;
        if (!paused) {
            if (delay > 0) { delay -= dt; if (delay <= 0) spawn(); }
            else {
                progress += dt / Math.max(1.8, 3.2 - state.score / 60);
                projectile.style.top = `${25 + Math.min(progress, 1) * 55}%`;
                projectile.style.setProperty('--wobble', `${Math.sin(time / 100) * 7}deg`);
                if (progress >= 1) {
                    const hit = lane === obstacleLane;
                    state = ChaseRules.resolve(state, hit); hud();
                    professor.classList.toggle('prof-hit', hit);
                    commentary.textContent = hit ? 'BONK! Sir lost one unit of patience.' : excuses[(round - 1) % excuses.length][1] + ' +10';
                    projectile.hidden = true; delay = 1.1;
                    if (state.status !== 'playing') { finish(); return; }
                }
            }
        }
        raf = requestAnimationFrame(tick);
    }
    function pause(value) { paused = value; $('#chase-pause').textContent = paused ? 'Resume' : 'Pause'; dialog.classList.toggle('chase-paused', paused); }
    function start() {
        cancelAnimationFrame(raf); state = ChaseRules.initial(); lane = 1; round = 0; running = true; pause(false);
        dialog.classList.remove('chase-won', 'chase-lost'); $('.chase-story').hidden = true; ending.hidden = true;
        professor.style.left = '50%'; professor.classList.remove('prof-hit'); projectile.hidden = true; delay = 0; spawn(); hud();
        $('#chase-pause').disabled = false; commentary.textContent = 'Student: “Sir, I thought this was an elective.”';
        last = performance.now(); raf = requestAnimationFrame(tick); $('#chase-pause').focus();
    }
    function open() {
        if (dialog.open) return;
        previousFocus = document.activeElement; cancelAnimationFrame(raf); running = false; paused = false;
        state = ChaseRules.initial(); hud(); dialog.classList.remove('chase-won', 'chase-lost', 'chase-paused');
        $('.chase-story').hidden = false; ending.hidden = true; projectile.hidden = true; commentary.textContent = '';
        professor.style.left = '50%'; $('#chase-pause').disabled = true; dialog.showModal(); $('.chase-start').focus();
    }
    $('.chase-start').onclick = start;
    $('.chase-close').onclick = () => dialog.close();
    $('#chase-pause').onclick = () => pause(!paused);
    dialog.addEventListener('close', () => { running = false; cancelAnimationFrame(raf); previousFocus?.focus(); });
    dialog.querySelectorAll('[data-move]').forEach(button => button.onclick = () => move(Number(button.dataset.move)));
    dialog.addEventListener('keydown', event => {
        if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(event.key)) { event.preventDefault(); move(['ArrowLeft', 'a', 'A'].includes(event.key) ? -1 : 1); }
        if (event.key === 'p' && running) { event.preventDefault(); pause(!paused); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && running) pause(true); });
    document.getElementById('run-btn').addEventListener('click', event => {
        const editor = document.querySelector('.CodeMirror')?.CodeMirror;
        const command = editor?.getValue().trim().toUpperCase();
        if (command === 'RUN FROM CLASS;' || command === 'SELECT * FROM ATTENDANCE;') { event.stopImmediatePropagation(); open(); }
    }, true);
});
