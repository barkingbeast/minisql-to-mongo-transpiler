// An opt-in surprise for one successfully compiled CREATE TABLE statement.
document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('professor-celebration');
    const close = document.getElementById('close-celebration');
    const confetti = dialog.querySelector('.confetti');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer = null;
    let revealTimer = null;
    let previousFocus = null;

    function finish() {
        clearTimeout(timer);
        clearTimeout(revealTimer);
        timer = revealTimer = null;
        confetti.replaceChildren();
        dialog.classList.remove('is-celebrating');
        previousFocus?.focus({ preventScroll: true });
    }

    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', finish);
    document.addEventListener('compiler:compiled', event => {
        const result = event.detail;
        if (result.source !== 'execute' || !result.success || !result.ast.some(node =>
            node.type === 'CreateTableQuery' && node.table?.name.toUpperCase() === 'DR_BASKARAN_P')) return;
        if (dialog.open) return;
        previousFocus = document.getElementById('run-btn');
        if (!reducedMotion.matches) {
            for (let i = 0; i < 60; i++) {
                const piece = document.createElement('i');
                piece.style.setProperty('--x', Math.random() * 100 + '%');
                piece.style.setProperty('--delay', Math.random() * -5 + 's');
                piece.style.setProperty('--duration', (3 + Math.random() * 3) + 's');
                piece.style.setProperty('--color', ['#ffd166', '#39ff14', '#00f0ff', '#ff78ba'][i % 4]);
                confetti.appendChild(piece);
            }
        }
        dialog.showModal();
        close.focus({ preventScroll: true });
        revealTimer = setTimeout(() => dialog.classList.add('is-celebrating'), 450);
        timer = setTimeout(() => { if (dialog.open) dialog.close(); }, 8000);
    });
});
