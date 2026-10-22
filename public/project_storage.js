/* Versioned, bounded project files. No database writes occur during import. */
(function (root) {
    const KEY = 'minisql.project.v1';
    const validName = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const validId = /^[A-Za-z_][A-Za-z0-9_-]*$/;
    const types = new Set(['uuid', 'text', 'int', 'number', 'bool', 'time']);
    function validateSchema(tables) {
        if (!Array.isArray(tables) || tables.length > 40) throw new Error('Use at most 40 tables.');
        const ids = new Set(), names = new Set(), columnIds = new Set();
        for (const t of tables) {
            if (!t || !validId.test(t.id) || ids.has(t.id) || !validName.test(t.name) || t.name.startsWith('__minisql_') || names.has(t.name)) throw new Error('Tables need unique valid names and IDs.');
            ids.add(t.id); names.add(t.name);
            if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || Math.abs(t.x) > 10000 || Math.abs(t.y) > 10000) throw new Error('Invalid table position.');
            if (!Array.isArray(t.columns) || !t.columns.length || t.columns.length > 100) throw new Error('Each table needs 1–100 columns.');
            const columns = new Set();
            if (t.columns.filter(c => c.isPk).length > 1) throw new Error('This editor supports one primary-key column per table.');
            for (const c of t.columns) {
                if (!c || !validId.test(c.id) || columnIds.has(c.id) || !validName.test(c.name) || c.name.startsWith('__minisql_') || columns.has(c.name) || !types.has(c.type) || typeof c.isPk !== 'boolean') throw new Error('Columns need unique valid names/IDs and supported types.');
                columnIds.add(c.id); columns.add(c.name);
            }
        }
        for (const t of tables) for (const c of t.columns) if (c.fkTo) {
            const target = tables.find(item => item.id === c.fkTo);
            const pk = target?.columns.find(item => item.id === c.fkColumn);
            if (!pk?.isPk || pk.type !== c.type) throw new Error(`${t.name}.${c.name}: choose a primary key with the same type.`);
        }
        return tables;
    }
    function validate(project) {
        if (!project || project.format !== 'minisql-project' || project.version !== 1 || typeof project.sql !== 'string' || project.sql.length > 100000) throw new Error('Expected a MiniSQL project version 1.');
        validateSchema(project.tables);
        if (!Array.isArray(project.history) || project.history.length > 20 || project.history.some(h => !h || typeof h.sql !== 'string' || typeof h.mql !== 'string' || typeof h.time !== 'string')) throw new Error('Invalid query history.');
        return project;
    }
    root.MiniSQLProjects = {validate, validateSchema, KEY};
    if (typeof module !== 'undefined') module.exports = root.MiniSQLProjects;
})(typeof window === 'undefined' ? globalThis : window);
