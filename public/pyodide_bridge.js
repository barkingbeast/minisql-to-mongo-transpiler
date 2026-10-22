// Shared Python compiler and isolated mock execution for static hosting.
(function () {
    const SRC_FILES = ['ast_nodes.py', 'lexer.py', 'parser.py', 'semantic.py', 'codegen.py', 'compiler.py', 'executor.py', 'diagnostics.py', 'query_utils.py', 'inspection.py'];
    let enginePromise = null;
    let executionPromise = null;
    let queue = Promise.resolve();

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => { script.remove(); reject(new Error('Could not load the compiler engine. Check your connection and retry.')); };
            document.head.appendChild(script);
        });
    }

    async function initEngine() {
        if (!window.loadPyodide) {
            await loadScript('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
        }
        const engine = await window.loadPyodide();
        engine.FS.mkdirTree('/compiler');
        await Promise.all(SRC_FILES.map(async file => {
            const response = await fetch('src/' + file);
            if (!response.ok) throw new Error('Could not load compiler module: ' + file);
            engine.FS.writeFile('/compiler/' + file, await response.text());
        }));
        await engine.loadPackage('sqlite3');
        engine.runPython(`
import sys, json
sys.path.insert(0, '/compiler')
from compiler import transpile
from executor import execute_mql, seeded_database
from inspection import compare_results, inspect_pipeline

def browser_transpile(payload):
    args = json.loads(payload)
    return json.dumps(transpile(args['sql'], args.get('schema')))

def browser_execute(mql):
    try:
        return json.dumps(execute_mql(mql, demo_db))
    except Exception as error:
        return json.dumps({'success': False, 'error': str(error)})

def browser_inspect(payload):
    try:
        args = json.loads(payload)
        inspect = compare_results if args['tool'] == 'compare' else inspect_pipeline
        return json.dumps(inspect(args['sql'], args['schema'], demo_db))
    except Exception as error:
        return json.dumps({'success': False, 'error': str(error)})

def browser_reset():
    global demo_db
    demo_db = seeded_database()
`);
        return engine;
    }

    function getEngine() {
        if (!enginePromise) enginePromise = initEngine().catch(error => {
            enginePromise = null;
            throw error;
        });
        return enginePromise;
    }

    function serialized(task) {
        const result = queue.then(task);
        queue = result.catch(() => {});
        return result;
    }

    async function getExecutionEngine() {
        const engine = await getEngine();
        if (!executionPromise) {
            executionPromise = (async () => {
                await engine.loadPackage('micropip');
                await engine.runPythonAsync(`
import micropip
await micropip.install(['packaging==23.2', 'pytz==2024.1', 'sentinels==1.1.1', 'mongomock==4.3.0'])
browser_reset()
`);
            })().catch(error => { executionPromise = null; throw error; });
        }
        await executionPromise;
        return engine;
    }

    function call(engine, name, ...args) {
        const fn = engine.globals.get(name);
        try { return fn(...args); } finally { fn.destroy(); }
    }

    window.transpileInBrowser = (sql, schema) => serialized(async () => {
        const engine = await getEngine();
        return JSON.parse(call(engine, 'browser_transpile', JSON.stringify({ sql, schema })));
    });

    window.executeInBrowser = mql => serialized(async () => {
        const engine = await getExecutionEngine();
        return JSON.parse(call(engine, 'browser_execute', mql));
    });

    window.inspectInBrowser = payload => serialized(async () => {
        const engine = await getExecutionEngine();
        await engine.loadPackage('sqlite3');
        return JSON.parse(call(engine, 'browser_inspect', JSON.stringify(payload)));
    });

    window.resetBrowserDatabase = () => serialized(async () => {
        const engine = await getExecutionEngine();
        call(engine, 'browser_reset');
        return { success: true, result: 'Demo database reset' };
    });
})();
