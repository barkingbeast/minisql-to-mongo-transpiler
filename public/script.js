document.addEventListener('DOMContentLoaded', () => {
    const cursor = document.getElementById('cursor');
    const inputArea = document.getElementById('sql-input');
    const runBtn = document.getElementById('run-btn');
    const mqlOutput = document.getElementById('mql-output');
    const astOutput = document.getElementById('ast-output');
    const statusInd = document.getElementById('status-ind');
    const outputPanel = document.querySelector('.output-panel');
    const fixSuggestion = document.getElementById('fix-suggestion');

    // Schema Map Modal elements
    const minimapBtn = document.getElementById('minimap-btn');
    const schemaModal = document.getElementById('schema-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    
    // History Panel elements
    const historyBtn = document.getElementById('history-btn');
    const historyPanel = document.getElementById('history-panel');
    const closeHistoryBtn = document.getElementById('close-history-btn');
    const historyList = document.getElementById('history-list');

    // Live Execution elements
    const liveRunBtn = document.getElementById('live-run-btn');
    const resetDbBtn = document.getElementById('reset-db-btn');
    const liveResultModal = document.getElementById('live-result-modal');
    const closeLiveResultBtn = document.getElementById('close-live-result-btn');
    const liveResultOutput = document.getElementById('live-result-output');

    // Debugger & Explainer
    const debugBtn = document.getElementById('debug-btn');
    const walkthroughBtn = document.getElementById('walkthrough-btn');
    const explainBtn = document.getElementById('explain-btn');
    const explainModal = document.getElementById('explain-modal');
    const closeExplainBtn = document.getElementById('close-explain-btn');
    const explanationList = document.getElementById('explanation-list');
    
    const debugOverlay = document.getElementById('debug-overlay');
    const debugPhaseTitle = document.getElementById('debug-phase-title');
    const debugContent = document.getElementById('debug-content');
    const closeDebugBtn = document.getElementById('close-debug-btn');

    let currentExplanations = [];
    let currentTokens = [];
    let currentAST = [];
    let currentValidation = '';
    let executionEngine = null;
    let compiledSQL = null;
    let schemaRevision = 0;
    let busy = false;
    let executing = false;
    let currentCompilation = null;
    let diagnostic = null;
    let errorMark = null;
    let errorLine = null;
    const errorPanel = document.getElementById('query-error');
    liveRunBtn.disabled = true;
    resetDbBtn.disabled = true;
    explainBtn.disabled = true;
    walkthroughBtn.disabled = true;

    // CodeMirror Initialization
    const sqlEditor = CodeMirror.fromTextArea(inputArea, {
        mode: "text/x-sql",
        theme: "monokai",
        lineNumbers: true,
        gutters: ['CodeMirror-linenumbers', 'compiler-errors'],
        viewportMargin: Infinity
    });

    function clearDiagnostic() {
        if (errorMark) errorMark.clear();
        if (errorLine !== null) {
            sqlEditor.removeLineClass(errorLine, 'background', 'sql-error-line');
            sqlEditor.setGutterMarker(errorLine, 'compiler-errors', null);
        }
        errorMark = null;
        errorLine = null;
        diagnostic = null;
        errorPanel.hidden = true;
        sqlEditor.getInputField().removeAttribute('aria-invalid');
        sqlEditor.getInputField().removeAttribute('aria-describedby');
    }

    function showDiagnostic(info, fallback) {
        clearDiagnostic();
        diagnostic = info;
        document.getElementById('query-error-title').textContent = info ?
            `${info.phase.toUpperCase()} · Line ${info.line}, column ${info.column}` : 'COMPILATION ERROR';
        document.getElementById('query-error-message').textContent = info?.message || fallback;
        const jump = document.getElementById('jump-error-btn');
        jump.hidden = !info;
        errorPanel.hidden = false;
        sqlEditor.getInputField().setAttribute('aria-invalid', 'true');
        sqlEditor.getInputField().setAttribute('aria-describedby', 'query-error-message');
        if (info) {
            const clip = (line, column) => {
                const row = Math.max(0, Math.min(sqlEditor.lineCount() - 1, line - 1));
                return { line: row, ch: Math.max(0, Math.min(sqlEditor.getLine(row).length, column - 1)) };
            };
            const from = clip(info.line, info.column);
            const to = clip(info.end_line, info.end_column);
            errorLine = from.line;
            sqlEditor.addLineClass(errorLine, 'background', 'sql-error-line');
            const gutter = document.createElement('span');
            gutter.textContent = '!';
            gutter.title = info.message;
            gutter.className = 'sql-error-gutter';
            sqlEditor.setGutterMarker(errorLine, 'compiler-errors', gutter);
            if (from.line === to.line && from.ch === to.ch) {
                const caret = document.createElement('span');
                caret.className = 'sql-error-eof';
                caret.textContent = '▏';
                caret.title = info.message;
                errorMark = sqlEditor.setBookmark(from, { widget: caret });
            } else {
                errorMark = sqlEditor.markText(from, to, { className: 'sql-error-token', title: info.message });
            }
            sqlEditor.scrollIntoView(from, 60);
        }
        errorPanel.focus({ preventScroll: true });
    }

    document.getElementById('jump-error-btn').addEventListener('click', () => {
        if (!diagnostic) return;
        sqlEditor.focus();
        sqlEditor.setCursor({ line: diagnostic.line - 1, ch: diagnostic.column - 1 });
        sqlEditor.scrollIntoView(sqlEditor.getCursor(), 60);
    });
    
    const mqlEditor = CodeMirror.fromTextArea(mqlOutput, {
        mode: "javascript",
        theme: "monokai",
        lineNumbers: true,
        readOnly: true,
        viewportMargin: Infinity
    });

    // Web Audio API for sounds
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx;

    function playSound(type) {
        if (!AudioContext) return;
        try {
            if (!audioCtx) {
                audioCtx = new AudioContext();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
            }
        
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
        
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
        
            const now = audioCtx.currentTime;
        
            if (type === 'blip') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(880, now); // A5
                osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
                gainNode.gain.setValueAtTime(0.05, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
                gainNode.gain.setValueAtTime(0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            } else if (type === 'success') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.setValueAtTime(660, now + 0.1);
                gainNode.gain.setValueAtTime(0.05, now);
                gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
            }
        } catch (_) {
            // Audio is decorative; unavailable audio must not block compiler controls.
        }
    }

    // Custom Cursor tracking
    document.addEventListener('mousemove', (e) => {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
        
        let isResizing = false;
        let isDragging = false;

        document.querySelectorAll('.floating-modal').forEach(modal => {
            if (modal.classList.contains('active')) {
                const rect = modal.getBoundingClientRect();
                if (e.clientX >= rect.right - 25 && e.clientX <= rect.right + 5 &&
                    e.clientY >= rect.bottom - 25 && e.clientY <= rect.bottom + 5) {
                    isResizing = true;
                }
            }
        });

        if (e.target.closest('.drag-handle')) {
            isDragging = true;
        }

        if (isResizing) {
            cursor.classList.add('resize-hover');
        } else {
            cursor.classList.remove('resize-hover');
        }

        if (isDragging) {
            cursor.classList.add('drag-hover');
        } else {
            cursor.classList.remove('drag-hover');
        }
    });
    
    // Modal & Panel interactions
    minimapBtn.addEventListener('click', () => {
        schemaModal.classList.add('active');
        playSound('blip');
    });

    closeModalBtn.addEventListener('click', () => {
        schemaModal.classList.remove('active');
        playSound('blip');
    });

    historyBtn.addEventListener('click', () => {
        historyPanel.classList.add('active');
        playSound('blip');
    });

    closeHistoryBtn.addEventListener('click', () => {
        historyPanel.classList.remove('active');
        playSound('blip');
    });

    // History Functions
    function readHistory() {
        try {
            const items = JSON.parse(localStorage.getItem('demoQueryHistory') || '[]');
            return Array.isArray(items) ? items.filter(item => item && typeof item.sql === 'string' &&
                typeof item.mql === 'string' && typeof item.time === 'string').slice(0, 20) : [];
        } catch (_) { return []; }
    }

    function writeHistory(items) {
        try { localStorage.setItem('demoQueryHistory', JSON.stringify(items)); } catch (_) { /* Storage may be disabled. */ }
    }

    function seedInitialHistory() {
        if (!readHistory().length) {
            const initialHistory = [
                {
                    sql: "SELECT users.name, SUM(orders.total) \nFROM users \nJOIN orders ON users.id = orders.user_id \nWHERE users.age >= 18 \nGROUP BY users.name;",
                    mql: "// Pre-loaded complex query",
                    time: new Date().toLocaleTimeString()
                },
                {
                    sql: "SELECT name, age FROM users WHERE age >= 18;",
                    mql: "// Pre-loaded simple query",
                    time: new Date().toLocaleTimeString()
                }
            ];
            writeHistory(initialHistory);
        }
    }

    function saveHistory(sql, mql) {
        let history = readHistory();
        history.unshift({
            sql,
            mql,
            time: new Date().toLocaleTimeString()
        });
        if (history.length > 20) history.pop();
        writeHistory(history);
        renderHistory();
    }

    function renderHistory() {
        let history = readHistory();
        historyList.innerHTML = '';
        history.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            const sqlLabel = document.createElement('div');
            sqlLabel.className = 'history-item-sql';
            sqlLabel.textContent = item.sql;
            const timestamp = document.createElement('div');
            timestamp.className = 'history-item-time';
            timestamp.textContent = item.time;
            div.append(sqlLabel, timestamp);
            div.addEventListener('click', () => {
                sqlEditor.setValue(item.sql);
                mqlEditor.setValue('// Query restored. Compile it to refresh the output.');
                historyPanel.classList.remove('active');
                playSound('blip');
            });
            historyList.appendChild(div);
        });
    }

    // Render AST recursively
    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    function renderAST(node) {
        if (node === null || node === undefined) return '';
        if (Array.isArray(node)) return node.map(renderAST).join('');
        if (typeof node !== 'object') {
            return `<span class="ast-node ast-leaf">${escapeHTML(node)}</span>`;
        }
        
        let html = `<div class="ast-node ast-type">${escapeHTML(node.type || 'Node')}</div>`;
        html += `<div class="ast-children">`;
        
        for (const key in node) {
            if (key === 'type' || key === 'location' || key === 'type_location') continue;
            
            html += `<div class="ast-prop"><strong>${escapeHTML(key)}:</strong> `;
            if (Array.isArray(node[key])) {
                if (node[key].length === 0) {
                    html += `[ ]`;
                } else {
                    html += `<div class="ast-children">`;
                    node[key].forEach(child => {
                        html += renderAST(child);
                    });
                    html += `</div>`;
                }
            } else {
                html += renderAST(node[key]);
            }
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }

    // Execution
    function invalidateOutput() {
        clearDiagnostic();
        currentCompilation = null;
        walkthroughBtn.disabled = true;
        schemaRevision++;
        compiledSQL = null;
        currentTokens = [];
        currentAST = [];
        currentExplanations = [];
        liveRunBtn.disabled = true;
        explainBtn.disabled = true;
        astOutput.textContent = '// Compile the current query to refresh the AST.';
        statusInd.textContent = 'EDITED';
        statusInd.style.color = 'var(--accent)';
        fixSuggestion.style.display = 'none';
    }
    sqlEditor.on('change', invalidateOutput);

    async function transpileQuery(event) {
        if (busy || executing) return false;
        const source = event?.currentTarget === runBtn ? 'execute' : 'tool';
        
        const query = sqlEditor.getValue();
        if (!query.trim()) return false;
        const revision = schemaRevision;

        busy = true;
        clearDiagnostic();
        walkthroughBtn.disabled = true;
        currentCompilation = null;
        runBtn.disabled = true;
        debugBtn.disabled = true;
        liveRunBtn.disabled = true;
        resetDbBtn.disabled = true;
        explainBtn.disabled = true;
        currentTokens = [];
        currentAST = [];
        currentExplanations = [];
        compiledSQL = null;

        document.body.classList.add('is-transpiling');
        statusInd.textContent = 'PROCESSING...';
        statusInd.style.color = 'var(--accent)';
        mqlEditor.setValue('// PROCESSING...');
        outputPanel.classList.remove('shake-error');
        fixSuggestion.style.display = 'none';

        try {
            const schema = getSchema();
            let data;
            if (executionEngine !== 'browser') {
                let response;
                try {
                    response = await fetch('api/transpile', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sql: query, schema })
                    });
                } catch (error) {
                    if (executionEngine === 'server') throw new Error('The local server is unavailable. Restart it and retry.');
                }
                if (response && ![404, 405, 501].includes(response.status)) {
                    data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Compiler request failed');
                    executionEngine = 'server';
                } else if (executionEngine === 'server') {
                    throw new Error('The compiler endpoint is unavailable. Restart the local server.');
                }
            }
            if (!data) {
                // Static hosting: keep compilation and execution in the same tab engine.
                mqlEditor.setValue('// LOADING COMPILER ENGINE...');
                data = await window.transpileInBrowser(query, schema);
                executionEngine = 'browser';
            }
            document.body.classList.remove('is-transpiling');

            if (revision !== schemaRevision || query !== sqlEditor.getValue()) {
                invalidateOutput();
                mqlEditor.setValue('// Query changed during compilation. Compile again.');
                return false;
            }

            if (!data.success) {
                if (data.suggestion) {
                    fixSuggestion.textContent = data.suggestion;
                    fixSuggestion.style.display = 'block';
                }
                const failure = new Error(data.error || 'Compilation failed');
                failure.diagnostic = data.diagnostic;
                throw failure;
            }

            statusInd.textContent = 'SUCCESS';
            statusInd.style.color = 'var(--phosphor)';
            
            const formattedMQL = data.mongo_queries.join('\n\n');
            mqlEditor.setValue(formattedMQL);
            playSound('success');

            saveHistory(query, formattedMQL);

            astOutput.innerHTML = renderAST(data.ast);
            document.querySelectorAll('.ast-node').forEach(node => {
                node.addEventListener('mouseenter', () => playSound('blip'));
            });
            
            currentExplanations = data.explanations || [];
            currentTokens = data.tokens || [];
            currentAST = data.ast || [];
            currentValidation = data.validation || '';
            compiledSQL = query;
            currentCompilation = { ...data, sql: query };
            walkthroughBtn.disabled = false;
            liveRunBtn.disabled = false;
            explainBtn.disabled = false;
            syncSchema(data.schema);
            
            // Populate explain list
            explanationList.innerHTML = '';
            currentExplanations.forEach(expls => {
                expls.forEach(exp => {
                    let li = document.createElement('li');
                    li.textContent = exp;
                    explanationList.appendChild(li);
                });
            });

            document.dispatchEvent(new CustomEvent('compiler:compiled', { detail: { ...currentCompilation, source } }));

            return true;

        } catch (err) {
            showDiagnostic(err.diagnostic, err.message);
            astOutput.textContent = '// Compilation failed. Fix the query and retry.';
            document.body.classList.remove('is-transpiling');
            statusInd.textContent = err.diagnostic ? 'ERR_' + err.diagnostic.phase.toUpperCase() : 'ERROR';
            statusInd.style.color = 'var(--error)';
            mqlEditor.setValue(`[FATAL EXCEPTION]\n${err.message}`);
            
            outputPanel.classList.add('shake-error');
            playSound('error');
            
            cursor.classList.add('error-hover');
            setTimeout(() => cursor.classList.remove('error-hover'), 500);
            return false;
        } finally {
            busy = false;
            runBtn.disabled = false;
            debugBtn.disabled = false;
            resetDbBtn.disabled = !executionEngine;
        }
    }

    runBtn.addEventListener('click', transpileQuery);
    walkthroughBtn.addEventListener('click', () => {
        if (!currentCompilation || busy || executing) return;
        document.dispatchEvent(new CustomEvent('compiler:walkthrough', { detail: currentCompilation }));
    });

    // Live Execution
    liveRunBtn.addEventListener('click', async () => {
        if (busy || executing || compiledSQL !== sqlEditor.getValue()) return;
        const query = mqlEditor.getValue().trim();
        if (!query || query.startsWith('//') || query.startsWith('[')) return; // Don't run errors or empty

        liveResultModal.classList.add('active');
        
        // Strategic placement near the button
        const btnRect = liveRunBtn.getBoundingClientRect();
        liveResultModal.style.left = Math.max(20, btnRect.left - 500) + 'px';
        liveResultModal.style.top = (btnRect.bottom + 20) + 'px';
        liveResultModal.style.transform = 'none';
        liveResultModal.style.margin = '0';

        executing = true;
        liveRunBtn.disabled = true;
        resetDbBtn.disabled = true;
        runBtn.disabled = true;
        debugBtn.disabled = true;
        liveResultOutput.textContent = executionEngine === 'browser' ? 'LOADING LOCAL DEMO ENGINE...' : 'EXECUTING IN DEMO DATABASE...';
        playSound('blip');

        try {
            let data;
            if (executionEngine === 'browser') {
                data = await window.executeInBrowser(query);
            } else {
                const response = await fetch('api/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mql: query })
                });
                data = await response.json();
            }
            if (!data.success) throw new Error(data.error || 'Execution failed');
            
            liveResultOutput.textContent = JSON.stringify(data.result, null, 2);
            playSound('success');
        } catch (err) {
            liveResultOutput.textContent = `[EXECUTION ERROR]\n${err.message}`;
            playSound('error');
        } finally {
            executing = false;
            liveRunBtn.disabled = !compiledSQL || compiledSQL !== sqlEditor.getValue();
            resetDbBtn.disabled = false;
            runBtn.disabled = false;
            debugBtn.disabled = false;
        }
    });

    resetDbBtn.addEventListener('click', async () => {
        if (executing || busy) return;
        executing = true;
        resetDbBtn.disabled = true;
        liveRunBtn.disabled = true;
        runBtn.disabled = true;
        debugBtn.disabled = true;
        try {
            const data = executionEngine === 'browser' ? await window.resetBrowserDatabase() :
                await (await fetch('api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
            if (!data.success) throw new Error(data.error || 'Reset failed');
            liveResultOutput.textContent = data.result;
            liveResultModal.classList.add('active');
        } catch (error) {
            liveResultOutput.textContent = error.message;
            liveResultModal.classList.add('active');
        } finally {
            executing = false;
            resetDbBtn.disabled = false;
            liveRunBtn.disabled = !compiledSQL || compiledSQL !== sqlEditor.getValue();
            runBtn.disabled = false;
            debugBtn.disabled = false;
        }
    });

    closeLiveResultBtn.addEventListener('click', () => {
        liveResultModal.classList.remove('active');
        playSound('blip');
    });

    // Explain Button
    explainBtn.addEventListener('click', () => {
        explainModal.classList.add('active');
        
        // Strategic placement near the button
        const btnRect = explainBtn.getBoundingClientRect();
        explainModal.style.left = Math.max(20, btnRect.left - 500) + 'px';
        explainModal.style.top = (btnRect.bottom + 20) + 'px';
        explainModal.style.transform = 'none';
        explainModal.style.margin = '0';
        
        playSound('blip');
    });

    closeExplainBtn.addEventListener('click', () => {
        explainModal.classList.remove('active');
        playSound('blip');
    });
    
    // Debugger Mode
    let debugPhase = 0;

    function advanceDebugPhase() {
        if (debugPhase === 1) {
            debugPhaseTitle.textContent = '> PHASE 2: SYNTAX PARSING (AST)';
            debugContent.textContent = `Building Abstract Syntax Tree...\n\n${JSON.stringify(currentAST, null, 2)}`;
            playSound('blip');
            debugPhase = 2;
        } else if (debugPhase === 2) {
            debugPhaseTitle.textContent = '> PHASE 3: SEMANTIC ANALYSIS';
            debugContent.textContent = currentValidation;
            playSound('success');
            debugPhase = 3;
        } else if (debugPhase === 3) {
            debugPhaseTitle.textContent = '> PHASE 4: CODE GENERATION (MQL)';
            debugContent.textContent = `Translating AST to MongoDB Aggregation/Queries...\n\n${mqlEditor.getValue()}`;
            playSound('success');
            debugPhase = 4;
        }
    }

    document.addEventListener('keydown', (e) => {
        if (debugOverlay.style.display === 'flex') {
            if (e.key === 'Escape') {
                closeDebugBtn.click();
                return;
            }
            if (e.target.closest('button')) return;
            e.preventDefault();
            advanceDebugPhase();
        }
    });

    closeDebugBtn.addEventListener('click', () => {
        debugOverlay.style.display = 'none';
        debugPhase = 0;
    });

    debugBtn.addEventListener('click', async () => {
        // Run standard transpile first
        if (!await transpileQuery()) return;
        
        debugOverlay.style.display = 'flex';
        debugPhase = 1;
        debugPhaseTitle.textContent = '> PHASE 1: LEXICAL ANALYSIS (TOKENIZER)';
        debugContent.innerHTML = '';
        playSound('blip');
        
        // Show Tokens
        const tokenStrs = currentTokens.map(t => `[${t.type}] ${t.value} (${t.line}:${t.column})`).join('\n');
        debugContent.textContent = `Breaking SQL into Tokens...\n\n${tokenStrs}`;
    });

    // Hover to Translate (Syntax Mapping)
    sqlEditor.on('cursorActivity', () => {
        // When cursor moves or word is hovered, find corresponding MQL keyword
        const cursor = sqlEditor.getCursor();
        const token = sqlEditor.getTokenAt(cursor);
        
        if (token && token.string.trim().length > 0) {
            const word = token.string.toUpperCase();
            
            // Map SQL concepts to MQL concepts
            let mqlSearch = null;
            if (word === 'SELECT') mqlSearch = 'project';
            else if (word === 'WHERE') mqlSearch = 'match';
            else if (word === 'JOIN') mqlSearch = 'lookup';
            else if (word === 'GROUP') mqlSearch = 'group';
            else if (word === 'COUNT' || word === 'SUM') mqlSearch = 'sum';
            
            if (mqlSearch) {
                // Highlight in MQL editor
                const mqlContent = mqlEditor.getValue();
                const regex = new RegExp(`\\$${mqlSearch}`, "gi");
                let match;
                let firstMatchPos = null;
                
                // Clear old marks
                mqlEditor.getAllMarks().forEach(m => m.clear());
                
                while ((match = regex.exec(mqlContent)) !== null) {
                    const startPos = mqlEditor.posFromIndex(match.index);
                    const endPos = mqlEditor.posFromIndex(match.index + match[0].length);
                    mqlEditor.markText(startPos, endPos, { className: 'mql-highlight' });
                    
                    if (!firstMatchPos) {
                        firstMatchPos = startPos;
                    }
                }
                
                if (firstMatchPos) {
                    // Auto-scroll the MQL editor to show the highlighted text
                    mqlEditor.scrollIntoView(firstMatchPos, 50);
                }
            } else {
                mqlEditor.getAllMarks().forEach(m => m.clear());
            }
        }
    });

    // --- Dynamic Schema Builder ---
    const addTableBtn = document.getElementById('add-table-btn');
    const generateSqlBtn = document.getElementById('generate-sql-btn');
    const dynamicTablesContainer = document.getElementById('dynamic-tables-container');
    const connectionLines = document.getElementById('connection-lines');
    
    let schemaData = [
        {
            id: 't_users',
            name: 'users',
            x: 50,
            y: 50,
            columns: [
                { id: 'c_1', name: 'id', type: 'int', isPk: true },
                { id: 'c_2', name: 'name', type: 'text', isPk: false },
                { id: 'c_age', name: 'age', type: 'int', isPk: false }
            ]
        },
        {
            id: 't_orders',
            name: 'orders',
            x: 450,
            y: 200,
            columns: [
                { id: 'c_3', name: 'id', type: 'int', isPk: true },
                { id: 'c_4', name: 'user_id', type: 'int', isPk: false, fkTo: 't_users' },
                { id: 'c_5', name: 'total', type: 'int', isPk: false },
                { id: 'c_status', name: 'status', type: 'text', isPk: false }
            ]
        }
    ];

    function getSchema() {
        const schema = Object.create(null);
        const validName = /^[A-Za-z_][A-Za-z0-9_]*$/;
        schemaData.forEach(table => {
            if (!validName.test(table.name) || Object.hasOwn(schema, table.name)) {
                throw new Error('Schema tables need unique SQL names (letters, numbers, underscores).');
            }
            if (!table.columns.length) throw new Error('Every schema table needs at least one column.');
            const columns = Object.create(null);
            table.columns.forEach(column => {
                if (!validName.test(column.name) || Object.hasOwn(columns, column.name)) {
                    throw new Error('Schema columns need unique SQL names within each table.');
                }
                columns[column.name] = column.type;
            });
            schema[table.name] = columns;
        });
        return schema;
    }

    function syncSchema(schema) {
        if (!schema || typeof schema !== 'object') return;
        Object.entries(schema).forEach(([name, columns]) => {
            let table = schemaData.find(item => item.name === name);
            if (!table) {
                table = { id: 't_' + crypto.randomUUID(), name, x: 80, y: 80, columns: [] };
                schemaData.push(table);
            }
            table.columns = Object.entries(columns).map(([column, type]) => {
                const existing = table.columns.find(item => item.name === column);
                return { ...existing, id: existing?.id || 'c_' + crypto.randomUUID(), name: column, type };
            });
        });
        renderSchema();
    }

    function uniqueName(base, names) {
        let candidate = base;
        let index = 2;
        while (names.includes(candidate)) candidate = base + '_' + index++;
        return candidate;
    }

    let dragSource = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function renderConnections() {
        let svgHtml = '';
        schemaData.forEach(t1 => {
            t1.columns.forEach(col => {
                if (col.fkTo) {
                    const t2 = schemaData.find(t => t.id === col.fkTo);
                    if (t2) {
                        const x1 = t1.x + 100; // approximate center right
                        const y1 = t1.y + 50; 
                        const x2 = t2.x; 
                        const y2 = t2.y + 20;
                        svgHtml += `<path d="M ${x1} ${y1} C ${x1+50} ${y1}, ${x2-50} ${y2}, ${x2} ${y2}" stroke="var(--phosphor)" stroke-width="2" fill="none" stroke-dasharray="5,5"/>`;
                    }
                }
            });
        });
        connectionLines.innerHTML = svgHtml;
    }

    function renderSchema() {
        if (!dynamicTablesContainer) return;
        try { getSchema(); document.getElementById('schema-error').textContent = ''; }
        catch (error) { document.getElementById('schema-error').textContent = error.message; }
        dynamicTablesContainer.innerHTML = '';

        schemaData.forEach(table => {
            const tableDiv = document.createElement('div');
            tableDiv.className = 'schema-table';
            tableDiv.style.left = table.x + 'px';
            tableDiv.style.top = table.y + 'px';
            tableDiv.id = table.id;

            // Make draggable
            tableDiv.addEventListener('mousedown', (e) => {
                if(e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
                dragSource = table;
                dragOffsetX = e.clientX - table.x;
                dragOffsetY = e.clientY - table.y;
            });

            // Header
            const header = document.createElement('div');
            header.className = 'table-header';
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            
            const nameInput = document.createElement('input');
            nameInput.value = table.name;
            nameInput.style.background = 'transparent';
            nameInput.style.border = 'none';
            nameInput.style.color = 'var(--bg)';
            nameInput.style.fontFamily = 'inherit';
            nameInput.style.fontWeight = 'bold';
            nameInput.style.width = '100%';
            nameInput.style.outline = 'none';
            nameInput.addEventListener('change', (e) => {
                table.name = e.target.value;
                invalidateOutput();
            });
            header.appendChild(nameInput);
            
            const delTableBtn = document.createElement('span');
            delTableBtn.textContent = 'X';
            delTableBtn.style.cursor = 'pointer';
            delTableBtn.addEventListener('click', () => {
                schemaData = schemaData.filter(t => t.id !== table.id);
                schemaData.forEach(t => t.columns.forEach(c => {
                    if (c.fkTo === table.id) delete c.fkTo;
                }));
                invalidateOutput();
                renderSchema();
            });
            header.appendChild(delTableBtn);
            tableDiv.appendChild(header);

            // Columns
            table.columns.forEach(col => {
                const colDiv = document.createElement('div');
                colDiv.className = 'table-row';
                colDiv.id = col.id;
                colDiv.style.display = 'flex';
                colDiv.style.alignItems = 'center';
                colDiv.style.gap = '5px';
                
                let icon = document.createElement('span');
                icon.style.width = '16px';
                icon.innerHTML = col.isPk ? '🔑' : (col.fkTo ? '🔗' : '');
                
                const colNameInput = document.createElement('input');
                colNameInput.value = col.name;
                colNameInput.style.background = 'transparent';
                colNameInput.style.border = 'none';
                colNameInput.style.color = 'var(--phosphor)';
                colNameInput.style.fontFamily = 'inherit';
                colNameInput.style.width = '60px';
                colNameInput.style.outline = 'none';
                colNameInput.addEventListener('change', (e) => {
                    col.name = e.target.value;
                    invalidateOutput();
                });

                const colTypeSelect = document.createElement('select');
                colTypeSelect.style.background = 'transparent';
                colTypeSelect.style.border = 'none';
                colTypeSelect.style.color = 'var(--accent)';
                colTypeSelect.style.fontFamily = 'inherit';
                colTypeSelect.style.outline = 'none';
                ['uuid', 'text', 'int', 'number', 'bool', 'time'].forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t;
                    opt.textContent = t;
                    if(t === col.type) opt.selected = true;
                    colTypeSelect.appendChild(opt);
                });
                colTypeSelect.addEventListener('change', (e) => {
                    col.type = e.target.value;
                    invalidateOutput();
                });

                const delColBtn = document.createElement('span');
                delColBtn.textContent = '×';
                delColBtn.style.cursor = 'pointer';
                delColBtn.style.color = 'var(--error)';
                delColBtn.style.marginLeft = 'auto';
                delColBtn.addEventListener('click', () => {
                    table.columns = table.columns.filter(c => c.id !== col.id);
                    invalidateOutput();
                    renderSchema();
                });
                
                colDiv.appendChild(icon);
                colDiv.appendChild(colNameInput);
                colDiv.appendChild(colTypeSelect);
                colDiv.appendChild(delColBtn);
                tableDiv.appendChild(colDiv);
            });

            // Add col button
            const addColBtn = document.createElement('button');
            addColBtn.className = 'add-col-btn';
            addColBtn.textContent = '+ Col';
            addColBtn.addEventListener('click', () => {
                table.columns.push({
                    id: 'c_' + Math.random().toString(36).substr(2, 9),
                    name: uniqueName('new_col', table.columns.map(c => c.name)),
                    type: 'text',
                    isPk: false
                });
                invalidateOutput();
                renderSchema();
            });
            tableDiv.appendChild(addColBtn);

            dynamicTablesContainer.appendChild(tableDiv);
        });

        renderConnections();
    }

    document.addEventListener('mousemove', (e) => {
        if (activeModal) {
            activeModal.style.left = (e.clientX - modalOffsetX) + 'px';
            activeModal.style.top = (e.clientY - modalOffsetY) + 'px';
        }

        if (dragSource && schemaModal.classList.contains('active')) {
            dragSource.x = e.clientX - dragOffsetX;
            dragSource.y = e.clientY - dragOffsetY;
            
            // Only update DOM position, avoid full re-render
            const tableDiv = document.getElementById(dragSource.id);
            if (tableDiv) {
                tableDiv.style.left = dragSource.x + 'px';
                tableDiv.style.top = dragSource.y + 'px';
            }
            renderConnections();
        }
    });

    document.addEventListener('mouseup', () => {
        dragSource = null;
        activeModal = null;
    });

    // Floating Modal Drag Logic
    let activeModal = null;
    let modalOffsetX = 0;
    let modalOffsetY = 0;

    document.querySelectorAll('.floating-modal .drag-handle').forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            if(e.target.tagName === 'BUTTON') return;
            const modal = handle.closest('.floating-modal');
            activeModal = modal;
            const rect = modal.getBoundingClientRect();
            modalOffsetX = e.clientX - rect.left;
            modalOffsetY = e.clientY - rect.top;
            
            modal.style.transform = 'none';
            modal.style.left = rect.left + 'px';
            modal.style.top = rect.top + 'px';
            modal.style.margin = '0';
        });
    });

    if (addTableBtn) {
        addTableBtn.addEventListener('click', () => {
            schemaData.push({
                id: 't_' + Math.random().toString(36).substr(2, 9),
                name: uniqueName('new_table', schemaData.map(t => t.name)),
                x: 100,
                y: 100,
                columns: [
                    { id: 'c_' + Math.random().toString(36).substr(2, 9), name: 'id', type: 'uuid', isPk: true }
                ]
            });
            invalidateOutput();
            renderSchema();
        });
    }

    if (generateSqlBtn) {
        generateSqlBtn.addEventListener('click', () => {
            try { getSchema(); } catch (error) {
                document.getElementById('schema-error').textContent = error.message;
                return;
            }
            document.getElementById('schema-error').textContent = '';
            let sql = '';
            schemaData.forEach(table => {
                sql += `CREATE TABLE ${table.name} (\n`;
                const colDefs = table.columns.map(c => `    ${c.name} ${c.type}`);
                sql += colDefs.join(',\n');
                sql += `\n);\n\n`;
            });
            sqlEditor.setValue(sql);
            schemaModal.classList.remove('active');
            playSound('success');
        });
    }

    // Initial render
    seedInitialHistory();
    renderHistory();
    renderSchema();
});
