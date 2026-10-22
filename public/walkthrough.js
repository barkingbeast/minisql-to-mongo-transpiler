// An animated, navigable presentation of the actual compiler response.
document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('walkthrough-dialog');
    const stage = document.getElementById('walkthrough-stage');
    const steps = [...dialog.querySelectorAll('[data-phase]')];
    const play = document.getElementById('walkthrough-play');
    const previous = document.getElementById('walkthrough-prev');
    const next = document.getElementById('walkthrough-next');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const phases = [
        ['Lexical analysis', 'The scanner turns the exact SQL you entered into positioned tokens. Select a token to inspect it.'],
        ['Syntax analysis', 'The parser builds this Abstract Syntax Tree. Expand the branches to inspect expressions and clauses.'],
        ['Semantic analysis', 'The analyzer resolves columns and checks types against the current schema before generating code.'],
        ['MongoDB generation', 'The validated AST becomes the MongoDB commands below. These are the same commands used by Run Demo.'],
    ];
    let data = null;
    let phase = 0;
    let timer = null;

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function pause() {
        clearInterval(timer);
        timer = null;
        play.textContent = phase === 3 ? 'Replay' : 'Play';
        play.setAttribute('aria-pressed', 'false');
        dialog.classList.remove('is-playing');
    }

    function tree(value, name, depth = 0) {
        if (value === null || typeof value !== 'object') {
            return element('div', 'walkthrough-leaf', (name ? name + ': ' : '') + String(value));
        }
        const details = element('details', 'walkthrough-tree');
        details.open = depth < 2;
        const label = Array.isArray(value) ? name + ' [' + value.length + ']' : (name ? name + ': ' : '') + (value.type || 'Object');
        details.appendChild(element('summary', '', label));
        Object.entries(value).forEach(([key, item]) => {
            if (key === 'type' || key === 'location' || key === 'type_location' || key === 'resolved_name') return;
            details.appendChild(tree(item, Array.isArray(value) ? '#' + (Number(key) + 1) : key, depth + 1));
        });
        return details;
    }

    function render() {
        stage.replaceChildren();
        // Restart only the stage entrance; the dialog and reading position remain stable.
        stage.classList.remove('stage-enter');
        void stage.offsetWidth;
        stage.classList.add('stage-enter');
        stage.scrollTop = 0;
        steps.forEach((button, index) => {
            button.classList.toggle('is-active', index === phase);
            button.classList.toggle('is-complete', index < phase);
            if (index === phase) button.setAttribute('aria-current', 'step');
            else button.removeAttribute('aria-current');
        });
        document.getElementById('walkthrough-stage-title').textContent = phases[phase][0];
        document.getElementById('walkthrough-stage-description').textContent = phases[phase][1];
        document.getElementById('walkthrough-counter').textContent = 'Phase ' + (phase + 1) + ' of 4';
        document.getElementById('walkthrough-progress-fill').style.transform = 'scaleX(' + ((phase + 1) / 4) + ')';
        previous.disabled = phase === 0;
        next.disabled = phase === 3;
        if (phase === 0) {
            const tokens = element('div', 'walkthrough-tokens');
            const inspection = element('p', 'walkthrough-inspection', data.tokens.length + ' tokens · click any token to inspect its source location');
            data.tokens.slice(0, 120).forEach((token, index) => {
                const chip = element('button', 'walkthrough-token');
                chip.type = 'button';
                chip.style.setProperty('--i', Math.min(index, 20));
                chip.append(element('small', '', token.type), element('span', '', String(token.value)));
                chip.addEventListener('click', () => {
                    pause();
                    inspection.textContent = token.type + ' · line ' + token.line + ', column ' + token.column +
                        ' → ' + token.end_line + ':' + token.end_column + ' · ' + token.value;
                    tokens.querySelectorAll('.is-selected').forEach(node => node.classList.remove('is-selected'));
                    chip.classList.add('is-selected');
                });
                tokens.appendChild(chip);
            });
            stage.append(inspection, tokens);
            if (data.tokens.length > 120) stage.appendChild(element('p', '', 'Showing the first 120 tokens; Debug contains the full token list.'));
        } else if (phase === 1) {
            stage.appendChild(tree(data.ast, 'Statements'));
        } else if (phase === 2) {
            stage.appendChild(element('p', 'validation-success', '✓ ' + data.validation));
            Object.entries(data.schema || {}).forEach(([name, columns]) => {
                const table = element('section', 'walkthrough-schema');
                table.appendChild(element('h4', '', name));
                const fields = element('div', 'walkthrough-fields');
                Object.entries(columns).forEach(([column, type]) => fields.appendChild(element('span', '', column + ': ' + type)));
                table.appendChild(fields);
                stage.appendChild(table);
            });
        } else {
            data.mongo_queries.forEach((query, index) => {
                const plan = element('ol', 'walkthrough-plan');
                (data.explanations[index] || []).forEach(line => plan.appendChild(element('li', '', line)));
                stage.append(element('h4', '', 'Statement ' + (index + 1)), plan, element('pre', 'walkthrough-code', query));
            });
        }
        if (phase === 3) pause();
        else if (!timer) play.textContent = 'Play';
    }

    function start() {
        pause();
        if (phase === 3) { phase = 0; render(); }
        timer = setInterval(() => { if (phase < 3) { phase++; render(); } }, 4500);
        play.textContent = 'Pause';
        play.setAttribute('aria-pressed', 'true');
        dialog.classList.add('is-playing');
    }

    steps.forEach(button => button.addEventListener('click', () => { pause(); phase = Number(button.dataset.phase); render(); }));
    previous.addEventListener('click', () => { pause(); phase = Math.max(0, phase - 1); render(); });
    next.addEventListener('click', () => { pause(); phase = Math.min(3, phase + 1); render(); });
    play.addEventListener('click', () => { if (timer) pause(); else start(); });
    stage.addEventListener('focusin', pause);
    stage.addEventListener('pointerdown', pause);
    document.getElementById('close-walkthrough').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { pause(); document.getElementById('walkthrough-btn').focus({ preventScroll: true }); });
    dialog.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            pause();
            phase = Math.max(0, Math.min(3, phase + (event.key === 'ArrowRight' ? 1 : -1)));
            render();
        }
    });
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) pause(); });
    document.addEventListener('compiler:walkthrough', event => {
        if (dialog.open) return;
        data = event.detail;
        phase = 0;
        document.getElementById('walkthrough-source').textContent = data.sql;
        dialog.showModal();
        render();
        if (!reducedMotion.matches) start();
        else pause();
    });
});
