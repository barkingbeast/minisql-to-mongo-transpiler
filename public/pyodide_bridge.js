// Runs the Python transpiler (src/*.py) directly in the browser via Pyodide,
// so the site works on static hosting (GitHub Pages) with no backend.
(function () {
    const SRC_FILES = ['ast_nodes.py', 'lexer.py', 'parser.py', 'semantic.py', 'codegen.py'];
    let pyodideReady = null;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(s);
        });
    }

    async function initPyodide() {
        if (!window.loadPyodide) {
            await loadScript('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
        }
        const pyodide = await window.loadPyodide();
        pyodide.FS.mkdirTree('/compiler');
        for (const f of SRC_FILES) {
            const res = await fetch('src/' + f);
            if (!res.ok) throw new Error('Could not load src/' + f);
            pyodide.FS.writeFile('/compiler/' + f, await res.text());
        }
        pyodide.runPython(`
import sys, json
sys.path.insert(0, '/compiler')
from lexer import tokenize
from parser import Parser
from semantic import SemanticAnalyzer
from codegen import CodeGenerator

def transpile(sql):
    response = {}
    try:
        if not sql.strip().endswith(';'):
            sql += ';'
        tokens = tokenize(sql)
        ast = Parser(tokens).parse()
        SemanticAnalyzer().analyze(ast)
        mongo_queries, explanations = CodeGenerator().generate(ast)
        response['success'] = True
        response['ast'] = [n.to_dict() for n in ast]
        response['mongo_queries'] = mongo_queries
        response['explanations'] = explanations
        response['tokens'] = [{'type': t.type, 'value': t.value} for t in tokens]
    except Exception as e:
        err = str(e)
        response['success'] = False
        response['error'] = err
        if "Type mismatch" in err:
            response['suggestion'] = "Hint: Check if you are comparing the correct data types (e.g., numbers without quotes, strings with quotes)."
        elif "Syntax" in err or "Unexpected token" in err:
            response['suggestion'] = "Tip: There might be a missing keyword, comma, or a mismatched quote."
        elif "Table" in err and "does not exist" in err:
            response['suggestion'] = "Tip: Make sure the table name matches one you've defined in the Schema Map."
        elif "Column count" in err:
            response['suggestion'] = "Hint: The number of values doesn't seem to match the number of columns provided."
        else:
            response['suggestion'] = "Tip: Double check the SQL syntax."
    return json.dumps(response)
`);
        return pyodide;
    }

    window.transpileInBrowser = async function (sql) {
        if (!pyodideReady) pyodideReady = initPyodide();
        const pyodide = await pyodideReady;
        const fn = pyodide.globals.get('transpile');
        return JSON.parse(fn(sql));
    };
})();
