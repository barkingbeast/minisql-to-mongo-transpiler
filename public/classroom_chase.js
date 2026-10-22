/* Self-contained cartoon game. All email is fictional and stays inside the game. */
document.addEventListener('DOMContentLoaded', () => {
    const rules = window.ChaseRules, reduced = matchMedia('(prefers-reduced-motion: reduce)');
    // Animate the supplied portrait with CSS; preserve the original photo file.
    const dhawalSprite = `<span class="dhawal-sprite"><span class="dhawal-flipper"><span class="dhawal-head"><img src="assets/dhawal.jpeg" alt="Dhawal" width="64" height="72"></span><span class="dhawal-body" aria-hidden="true">👕</span><span class="dhawal-legs" aria-hidden="true">👟👟</span></span></span>`;
    const dialog = document.createElement('dialog'); dialog.className = 'chase-dialog'; dialog.setAttribute('aria-label', 'Sir vs Dhawal: The Great Compiler Escape');
    dialog.innerHTML = `<div class="chase-shell">
        <header class="chase-header"><span>DAY 01 • SIR vs DHAWAL</span><button class="chase-close" aria-label="Close game">✕</button></header>
        <div class="chase-scoreboard"><span id="chase-lives">♥ ♥ ♥</span><strong id="chase-score">0 / ${rules.TARGET}</strong><button id="chase-pause">Pause</button><span id="chase-best">Best: 0</span></div>
        <div class="chase-status"><strong id="chase-phase">01 • THE GREAT ESCAPE</strong><span id="chase-combo">Combo ×1</span><span id="chase-wave">Wave 0</span></div>
        <div class="chase-progress" role="progressbar" aria-label="Progress to catching Dhawal" aria-valuemin="0" aria-valuemax="${rules.TARGET}" aria-valuenow="0"><div></div></div>
        <div class="chase-stage">
            <div class="classroom-board">COMPILER DESIGN<br><small>Attendance is not an optional parameter.</small></div>
            <div class="chase-door">EXIT<br>🚪</div>
            <div class="chase-student">${dhawalSprite}<b>DHAWAL: sir just 2 min!!</b></div>
            <div class="chase-lanes"><i></i><i></i><i></i></div>
            <div class="chase-professor"><img src="assets/dr-baskaran-p.png" alt="Professor Baskaran"><span class="prof-body">👔</span><span class="prof-legs">🦵🦵</span><b>SIR</b></div>
            <div class="chase-attacks"></div><div class="chase-feedback" aria-hidden="true"></div>
            <p class="chase-commentary" aria-live="polite"></p>
            <div class="chase-story"><span class="chase-sticker">DHAWAL HAS ENTERED HIS VILLAIN ARC</span><div class="chase-intro-cast"><img src="assets/dr-baskaran-p.png" alt="Sir in class"><span aria-hidden="true">➜</span>${dhawalSprite}<span aria-hidden="true">🚪</span></div><h2>SIR vs DHAWAL<br>THE EXCUSE APOCALYPSE</h2><p>First class. Dhawal executes <code>return;</code><br>Sir executes <code>while (dhawalEscapes) chase();</code></p><p><strong>3 lives · ${rules.TARGET} points to catch Dhawal</strong><br>Three phases. Targeted shots. Two-lane barrages.<br>Red lanes warn you. Move before the excuses hit.</p><p>← → / A D / touch to move.<br><strong>SPACE or OBJECTION! = 0.65-second shield</strong> (5-second cooldown).<br>Chain dodges for ×2/×3. Last-second dodges earn +5.<br>Catch ☕ to recharge your shield faster.</p><button class="chase-start">DHAWAL. COME BACK HERE. →</button><small>*A very unserious cartoon. All mail stays in this game.</small></div>
            <div class="chase-ending" hidden></div>
        </div>
        <footer class="chase-controls"><button data-move="-1" aria-label="Move sir left">← LEFT</button><button id="chase-shield" aria-label="Activate objection shield">OBJECTION! [SPACE]</button><button data-move="1" aria-label="Move sir right">RIGHT →</button></footer>
    </div>`;
    document.body.append(dialog);
    const $ = selector => dialog.querySelector(selector);
    const professor = $('.chase-professor'), attacks = $('.chase-attacks'), commentary = $('.chase-commentary');
    const stage = $('.chase-stage'), ending = $('.chase-ending'), feedback = $('.chase-feedback');
    const lanes = Array.from(dialog.querySelectorAll('.chase-lanes i'));
    const phases = ['01 • THE GREAT ESCAPE', '02 • VIVA PANIC', '03 • REPLY-ALL APOCALYPSE'];
    const excuses = [
        ['SIR, WIFI ATE MY AST 📶', 'The router has been called as a witness.'],
        ['MY ATTENDANCE IS NULL 🫥', 'IS NULL does not mean IS PRESENT.'],
        ['SIR, CAT ATE MY TOKENS 🐈', 'That cat is now a lexical analyzer.'],
        ['CAN WE SKIP THE PARSER? 🥺', 'Can we skip your marks?'],
        ['MY BRAIN IS LEFT RECURSIVE 🔁', 'Eliminate recursion. Then eliminate excuses.'],
        ['SIR, WRONG CLASS 🚪', 'A classic scope resolution error.'],
        ['CHATGPT SAID NO CLASS 🤖', 'Hallucination detected. Attendance rejected.'],
        ['SEMICOLON WAS OPTIONAL ;', 'Dhawal’s escape has a syntax error.'],
        ['SIR, ONE SMALL DOUBT 🙋', 'The doubt has seven subqueries.'],
        ['PRESENT IN SPIRIT 👻', 'Spirit is not a recognized datatype.'],
        ['I SUBMITTED IN MY DREAM 😴', 'Dream branch was never merged.'],
        ['SIR, MY DOG FORKED IT 🐕', 'Bad commit. Good dog.']
    ];
    let state = rules.initial(), lane = 1, wave = null, elapsed = 0, gap = 0, previousSafe = -1;
    let running = false, paused = false, raf = 0, last = 0, previousFocus, round = 0, lastPhase = 0;
    let shield = 0, cooldown = 0, nearMiss = false, warningEnded = false, best = 0;
    try { best = Number(localStorage.getItem('minisql.chase.best.v2')) || 0; } catch (_) {}
    function hud() {
        $('#chase-lives').textContent = '♥ '.repeat(state.lives) + '♡ '.repeat(3 - state.lives);
        $('#chase-score').textContent = `${state.score} / ${rules.TARGET}`;
        $('#chase-best').textContent = `Best: ${best}`;
        $('#chase-combo').textContent = `${state.streak} streak · Combo ×${Math.min(3, 1 + Math.floor(state.streak / 4))}`;
        $('#chase-wave').textContent = `Wave ${round}`;
        $('.chase-progress').setAttribute('aria-valuenow', String(Math.min(state.score, rules.TARGET)));
        $('.chase-progress div').style.transform = `scaleX(${Math.min(1, state.score / rules.TARGET)})`;
    }
    function pop(text, kind='good') {
        feedback.getAnimations().forEach(animation => animation.cancel());
        feedback.textContent = text; feedback.className = 'chase-feedback ' + kind;
        if (!reduced.matches) feedback.animate([{opacity:1,transform:'translate(-50%,0) scale(.9)'},{opacity:1,transform:'translate(-50%,-15px) scale(1.12)'},{opacity:0,transform:'translate(-50%,-50px) scale(1)'}], {duration:850,fill:'forwards'});
    }
    function move(delta) {
        if (!running || paused) return;
        const next = Math.max(0, Math.min(2, lane + delta));
        if (next !== lane && wave && elapsed >= wave.warning && wave.warning + wave.travel - elapsed <= .23 && wave.lanes.includes(lane) && !wave.lanes.includes(next)) nearMiss = true;
        lane = next; professor.style.left = (17 + lane * 33) + '%';
    }
    function objection() {
        if (!running || paused || cooldown > 0) return;
        shield = rules.SHIELD_SECONDS; cooldown = rules.SHIELD_COOLDOWN;
        professor.classList.add('prof-shield'); pop('OBJECTION! 🛡️', 'shield');
        commentary.textContent = 'Sir invokes the Faculty Override Protocol. Timing matters.';
    }
    function spawn() {
        professor.classList.remove('prof-hit'); round++;
        wave = rules.wave(state.score, lane, round, previousSafe); previousSafe = wave.safe;
        elapsed = 0; nearMiss = false; warningEnded = false;
        wave.coffee = round % 5 === 0;
        attacks.replaceChildren();
        wave.lanes.forEach((target, index) => {
            const card = document.createElement('div'); card.className = 'chase-projectile incoming';
            card.textContent = index === 0 ? excuses[(round - 1) % excuses.length][0] : wave.level === 3 ? 'CC: ENTIRE DEPARTMENT 📧' : 'ALSO, 7 SUBQUESTIONS 📚';
            card.style.left = (17 + target * 33) + '%'; attacks.append(card);
        });
        if (wave.coffee) {
            const coffee = document.createElement('div'); coffee.className = 'chase-projectile coffee incoming'; coffee.textContent = '☕ STAFFROOM BUFF'; coffee.style.left = (17 + wave.safe * 33) + '%'; attacks.append(coffee);
        }
        lanes.forEach((element, i) => { element.classList.toggle('danger', wave.lanes.includes(i)); element.classList.toggle('coffee-lane', wave.coffee && i === wave.safe); });
        $('.chase-student').style.left = (17 + wave.safe * 33) + '%';
        $('.chase-student b').textContent = ['DHAWAL: sir just 2 min!!', 'DHAWAL: new excuse unlocked!', 'DHAWAL: I HAVE CC’D EVERYONE!'][wave.level - 1];
        $('#chase-phase').textContent = phases[wave.level - 1];
        dialog.dataset.phase = String(wave.level);
        if (lastPhase !== wave.level) { lastPhase = wave.level; pop(phases[wave.level - 1], 'phase'); }
        commentary.textContent = `${wave.kind} · Dhawal is weaponizing his excuses. Watch the red lanes!`;
        hud();
    }
    function finish() {
        running = false; cancelAnimationFrame(raf); attacks.replaceChildren(); professor.classList.remove('prof-shield');
        lanes.forEach(element => element.classList.remove('danger','coffee-lane'));
        $('#chase-pause').disabled = true; $('#chase-shield').disabled = true;
        best = Math.max(best, state.score); try { localStorage.setItem('minisql.chase.best.v2', String(best)); } catch (_) {} hud();
        ending.hidden = false; ending.replaceChildren();
        const title = document.createElement('h2'), text = document.createElement('p'), replay = document.createElement('button'); replay.textContent = 'REMATCH DHAWAL ↻'; replay.onclick = start;
        const stats = document.createElement('p'); stats.textContent = `${state.score} points · ${state.dodges} ${state.dodges === 1 ? 'dodge' : 'dodges'} · best streak ${state.bestStreak}`;
        if (state.status === 'won') {
            dialog.classList.add('chase-won'); title.textContent = 'DHAWAL.EXE HAS STOPPED ESCAPING 📬';
            text.textContent = 'Sir opens his laptop. Somewhere, Dhawal’s phone vibrates ominously.';
            const mail = document.createElement('div'); mail.className = 'chase-mail';
            const mailText = document.createElement('p'); mailText.textContent = 'To: Dhawal\nSubject: Your return; statement has been rejected\n\nDear Dhawal,\nYour excuses have failed semantic analysis.\nKindly report to class. Bring your AST.\nCC: Your future self\n\nRegards, Sir\nSent from my Semantic Analyzer.';
            const plane = document.createElement('span'); plane.className = 'chase-mail-plane'; plane.textContent = '✉️';
            const sent = document.createElement('strong'); sent.textContent = '✓ SENT • Fictional game animation'; mail.append(mailText, sent, plane);
            const laptop = document.createElement('div'); laptop.className = 'chase-laptop'; laptop.innerHTML = '<img src="assets/dr-baskaran-p.png" alt="Sir"> 💻';
            ending.append(title, text, laptop, mail, stats, replay); commentary.textContent = 'Achievement unlocked: Reply All Energy.';
        } else {
            dialog.classList.add('chase-lost'); title.textContent = 'DHAWAL HAS LEFT THE SCOPE 💥';
            text.textContent = 'Sir takes a tea break. Dhawal has already enrolled in “Advanced Excuse Engineering”.';
            const scene = document.createElement('div'); scene.className = 'chase-loss-scene'; scene.innerHTML = `<span aria-hidden="true">🪑 ☕ …</span>${dhawalSprite}`;
            ending.append(title, text, scene, stats, replay); commentary.textContent = 'Compilation terminated. Dhawal wins this round.';
        }
        replay.focus();
    }
    function impact() {
        const hit = wave.lanes.includes(lane), blocked = hit && shield > 0;
        const before = state.score;
        state = rules.resolve(state, blocked ? 'blocked' : hit ? 'hit' : 'dodge', !hit && nearMiss);
        if (blocked) { shield = 0; professor.classList.remove('prof-shield'); pop('EXCUSE OVERRULED! 🛡️','shield'); }
        else if (hit) {
            professor.classList.add('prof-hit'); pop('−1 PATIENCE 💥','bad');
            if (!reduced.matches) stage.animate([{transform:'translateX(-7px)'},{transform:'translateX(7px)'},{transform:'translateX(-4px)'},{transform:'translateX(0)'}],{duration:240});
        } else {
            const coffee = wave.coffee && lane === wave.safe;
            if (coffee) cooldown = Math.max(0,cooldown - 2);
            pop(`${nearMiss ? 'CLOSE CALL! ' : ''}+${state.score - before}${coffee ? ' ☕ SHIELD RECHARGED' : state.streak >= 4 ? ' COMBO!' : ''}`);
        }
        commentary.textContent = hit ? blocked ? 'Shield saved a life. Your combo was sacrificed to the syllabus.' : 'BONK! Dhawal’s excuse damaged Sir’s patience. Combo lost.' : excuses[(round - 1) % excuses.length][1];
        attacks.replaceChildren(); lanes.forEach(element => element.classList.remove('danger','coffee-lane'));
        gap = wave.gap; wave = null; hud();
        if (state.status !== 'playing') finish();
    }
    function tick(time) {
        if (!running || !dialog.open) return;
        const dt = Math.min((time - last) / 1000, .25); last = time;
        if (!paused) {
            cooldown = Math.max(0, cooldown - dt); shield = Math.max(0, shield - dt);
            professor.classList.toggle('prof-shield', shield > 0);
            $('#chase-shield').disabled = cooldown > 0;
            const label = shield > 0 ? 'SHIELD ACTIVE 🛡️' : cooldown > 0 ? `RECHARGE ${cooldown.toFixed(1)}s` : 'OBJECTION! [SPACE]';
            if ($('#chase-shield').textContent !== label) $('#chase-shield').textContent = label;
            if (!wave) { gap -= dt; if (gap <= 0) spawn(); }
            else {
                elapsed += dt;
                const progress = Math.max(0, Math.min(1, (elapsed - wave.warning) / wave.travel));
                if (elapsed >= wave.warning && !warningEnded) {
                    warningEnded = true; lanes.forEach(element => element.classList.remove('danger'));
                    attacks.querySelectorAll('.incoming').forEach(element => element.classList.remove('incoming'));
                }
                attacks.querySelectorAll('.chase-projectile').forEach(element => {
                    element.style.top = `${28 + progress * 52}%`;
                    element.style.setProperty('--wobble', `${Math.sin(time / 80) * 5}deg`);
                });
                if (progress >= 1) impact();
            }
        }
        if (running) raf = requestAnimationFrame(tick);
    }
    function pause(value) {
        paused = value; $('#chase-pause').textContent = paused ? 'Resume' : 'Pause';
        $('#chase-shield').disabled = paused || cooldown > 0;
        dialog.classList.toggle('chase-paused', paused);
        feedback.getAnimations().forEach(animation => paused ? animation.pause() : animation.play());
    }
    function start() {
        cancelAnimationFrame(raf); state = rules.initial(); lane = 1; round = 0; previousSafe = -1; lastPhase = 0;
        running = true; shield = cooldown = gap = 0; wave = null; pause(false);
        dialog.classList.remove('chase-won','chase-lost'); $('.chase-story').hidden = true; ending.hidden = true;
        professor.style.left = '50%'; professor.classList.remove('prof-hit','prof-shield'); spawn();
        $('#chase-pause').disabled = false; $('#chase-shield').disabled = false;
        last = performance.now(); raf = requestAnimationFrame(tick); $('#chase-pause').focus();
    }
    function open() {
        if (dialog.open) return;
        previousFocus = document.activeElement; cancelAnimationFrame(raf); running = false; paused = false;
        state = rules.initial(); round = 0; hud(); dialog.dataset.phase = '1';
        $('#chase-phase').textContent = phases[0];
        dialog.classList.remove('chase-won','chase-lost','chase-paused');
        $('.chase-story').hidden = false; ending.hidden = true; attacks.replaceChildren(); commentary.textContent = '';
        professor.style.left = '50%'; professor.classList.remove('prof-hit','prof-shield');
        lanes.forEach(element => element.classList.remove('danger','coffee-lane'));
        $('#chase-pause').disabled = true; $('#chase-shield').disabled = true;
        dialog.showModal(); $('.chase-start').focus();
    }
    $('.chase-start').onclick = start; $('.chase-close').onclick = () => dialog.close();
    $('#chase-pause').onclick = () => pause(!paused); $('#chase-shield').onclick = objection;
    dialog.addEventListener('close', () => { running = false; cancelAnimationFrame(raf); feedback.getAnimations().forEach(animation => animation.cancel()); previousFocus?.focus(); });
    dialog.querySelectorAll('[data-move]').forEach(button => button.onclick = () => move(Number(button.dataset.move)));
    dialog.addEventListener('keydown', event => {
        if (['ArrowLeft','ArrowRight','a','A','d','D'].includes(event.key)) { event.preventDefault(); move(['ArrowLeft','a','A'].includes(event.key) ? -1 : 1); }
        if (event.code === 'Space' && running) { event.preventDefault(); if (!event.repeat) objection(); }
        if (event.key.toLowerCase() === 'p' && running && !event.repeat) { event.preventDefault(); pause(!paused); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && running) pause(true); });
    document.getElementById('run-btn').addEventListener('click', event => {
        const command = document.querySelector('.CodeMirror')?.CodeMirror?.getValue().trim().toUpperCase();
        if (command === 'RUN FROM CLASS;' || command === 'SELECT * FROM ATTENDANCE;') { event.stopImmediatePropagation(); open(); }
    }, true);
});
