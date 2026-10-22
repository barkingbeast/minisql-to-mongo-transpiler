/* OPTIONAL MODULE: remove this script tag to remove the entire visualizer. */
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.createElement('section'); panel.className = 'panel inspection-panel'; panel.id = 'pipeline-visualizer';
    panel.innerHTML = `<div class="panel-header"><h2>PIPELINE // WATCH THE DATA</h2><button class="retro-btn" id="pipeline-hide">Hide</button></div>
        <div class="inspection-body"><p>Optional · Inspect real intermediate documents in the MongoDB simulation. Shows up to 50 documents per stage.</p>
        <button class="retro-btn" id="pipeline-inspect">Inspect current SELECT</button>
        <div id="pipeline-content" aria-live="polite"></div></div>`;
    document.getElementById('comparison-panel').after(panel);
    const toggle = document.createElement('button'); toggle.className = 'retro-btn'; toggle.textContent = 'Show pipeline visualizer'; toggle.hidden = true;
    panel.after(toggle);
    let snapshots = [], index = 0, version = 0;
    const content = panel.querySelector('#pipeline-content');
    panel.querySelector('#pipeline-hide').onclick = () => { panel.hidden = true; toggle.hidden = false; };
    toggle.onclick = () => { panel.hidden = false; toggle.hidden = true; };
    function render() {
        content.replaceChildren();
        const nav = document.createElement('div'); nav.className = 'pipeline-nav';
        snapshots.forEach((snapshot, i) => {
            const button = document.createElement('button'); button.className = 'retro-btn'; button.textContent = `${i}. ${Object.keys(snapshot.stage)[0]} · ${snapshot.count} rows`;
            button.setAttribute('aria-pressed', String(i === index)); button.onclick = () => { index = i; render(); }; nav.append(button);
        });
        const current = snapshots[index], code = document.createElement('pre'); code.textContent = JSON.stringify(current.stage, null, 2);
        const rows = document.createElement('pre'); rows.textContent = JSON.stringify(current.rows, null, 2);
        const move = document.createElement('div'); move.className = 'pipeline-nav';
        [-1, 1].forEach(delta => { const button = document.createElement('button'); button.className = 'retro-btn'; button.textContent = delta < 0 ? '← Previous' : 'Next →'; button.disabled = index + delta < 0 || index + delta >= snapshots.length; button.onclick = () => { index += delta; render(); }; move.append(button); });
        const label = document.createElement('p'); label.textContent = `${current.count} documents${current.sampled ? ' · first 50 shown' : ''}. Click a stage to inspect its output.`;
        content.append(nav, code, label, move, rows);
    }
    panel.querySelector('#pipeline-inspect').onclick = async event => {
        const ticket = ++version; event.target.disabled = true; content.textContent = 'Inspecting pipeline…';
        try { const result = await window.MiniSQL.inspect('pipeline'); if (ticket !== version) return; snapshots = result.snapshots; index = 0; render(); }
        catch (error) { if (ticket === version) content.textContent = error.message; }
        finally { event.target.disabled = false; }
    };
    ['compiler:invalidated', 'compiler:compiled', 'database:changed'].forEach(name => document.addEventListener(name, () => { version++; snapshots = []; content.textContent = 'Data or query changed. Inspect again to refresh.'; }));
});
