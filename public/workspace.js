document.addEventListener('DOMContentLoaded', () => {
    const api = window.MiniSQL, storage = window.MiniSQLProjects;
    const status = document.getElementById('project-status');
    let restoring = false, timer;
    const message = text => { status.textContent = text; };
    function persist() {
        if (restoring) return;
        try {
            const project = storage.validate(api.getProject());
            localStorage.setItem(storage.KEY, JSON.stringify(project));
            message('Saved on this device · Export JSON for a backup.');
        } catch (error) { message('Not saved: ' + error.message); }
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(persist, 500); }
    try {
        const saved = localStorage.getItem(storage.KEY);
        if (saved) { restoring = true; api.loadProject(storage.validate(JSON.parse(saved))); message('Restored your saved project.'); }
    } catch (error) { message('Could not restore saved project: ' + error.message); }
    finally { restoring = false; }
    document.addEventListener('compiler:invalidated', schedule);
    document.addEventListener('compiler:compiled', schedule);
    document.addEventListener('mouseup', schedule);
    window.addEventListener('pagehide', persist);
    document.getElementById('save-project').addEventListener('click', persist);
    document.getElementById('export-project').addEventListener('click', () => {
        try {
            const project = storage.validate(api.getProject());
            const url = URL.createObjectURL(new Blob([JSON.stringify(project, null, 2)], {type: 'application/json'}));
            const link = document.createElement('a'); link.href = url; link.download = 'minisql-project.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000); message('Project exported: SQL, schema, relationships, layout and history.');
        } catch (error) { message(error.message); }
    });
    const input = document.getElementById('import-project-file');
    document.getElementById('import-project').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
        const file = input.files[0]; if (!file) return;
        try {
            if (file.size > 2000000) throw new Error('Project files must be smaller than 2 MB.');
            const project = storage.validate(JSON.parse(await file.text()));
            restoring = true; api.loadProject(project); restoring = false;
            persist(); message('Project imported. Compile to refresh results. Demo database is unchanged.');
        } catch (error) { message('Import rejected: ' + error.message); }
        finally { restoring = false; input.value = ''; }
    });

    const compare = document.getElementById('compare-results');
    const result = document.getElementById('comparison-result');
    let generation = 0;
    function clear() { generation++; result.replaceChildren(); result.textContent = 'Compile a SELECT, then compare both engines on the current demo data.'; }
    ['compiler:invalidated', 'compiler:compiled', 'database:changed'].forEach(name => document.addEventListener(name, clear));
    compare.addEventListener('click', async () => {
        const ticket = ++generation; compare.disabled = true; result.textContent = 'Running SQLite and MongoDB simulation…';
        try {
            const data = await api.inspect('compare'); if (ticket !== generation) return;
            result.replaceChildren();
            const verdict = document.createElement('p'); verdict.className = data.match ? 'comparison-match' : 'comparison-diff';
            verdict.textContent = `${data.match ? '✓ MATCH' : '⚠ DIFFERENCE'} · ${data.sql_rows.length} SQL rows / ${data.mongo_rows.length} MongoDB rows`;
            const note = document.createElement('p'); note.textContent = `${data.engines}. ${data.note}`;
            const columns = document.createElement('div'); columns.className = 'comparison-columns';
            [['SQLite', data.sql_rows], ['MongoDB simulation', data.mongo_rows]].forEach(([title, rows]) => {
                const side = document.createElement('section'), label = document.createElement('h3'); label.textContent = title;
                side.append(label, window.MiniSQLRenderTable(data.columns, rows)); columns.append(side);
            });
            result.append(verdict, note, columns);
            if (data.differences.length) { const pre = document.createElement('pre'); pre.textContent = JSON.stringify(data.differences, null, 2); result.append(pre); }
        } catch (error) { if (ticket === generation) result.textContent = error.message; }
        finally { compare.disabled = false; }
    });
});
window.MiniSQLRenderTable = (columns, rows) => {
    const wrap = document.createElement('div'); wrap.className = 'result-table-scroll';
    const table = document.createElement('table'), head = document.createElement('tr');
    columns.forEach(column => { const th = document.createElement('th'); th.textContent = column; head.append(th); });
    const thead = document.createElement('thead'); thead.append(head); table.append(thead);
    const body = document.createElement('tbody');
    rows.forEach(row => { const tr = document.createElement('tr'); row.forEach(value => { const td = document.createElement('td'); td.textContent = value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value); tr.append(td); }); body.append(tr); });
    table.append(body); wrap.append(table);
    if (!rows.length) { const empty = document.createElement('p'); empty.textContent = '0 rows'; wrap.append(empty); }
    return wrap;
};
