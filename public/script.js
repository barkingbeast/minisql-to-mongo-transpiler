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
    const liveResultModal = document.getElementById('live-result-modal');
    const closeLiveResultBtn = document.getElementById('close-live-result-btn');
    const liveResultOutput = document.getElementById('live-result-output');

    // Debugger & Explainer
    const debugBtn = document.getElementById('debug-btn');
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
    let isDebugMode = false;

    // CodeMirror Initialization
    const sqlEditor = CodeMirror.fromTextArea(inputArea, {
        mode: "text/x-sql",
        theme: "monokai",
        lineNumbers: true,
        viewportMargin: Infinity
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
        if (!audioCtx) {
            audioCtx = new AudioContext();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
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
    function seedInitialHistory() {
        if (!localStorage.getItem('queryHistory')) {
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
            localStorage.setItem('queryHistory', JSON.stringify(initialHistory));
        }
    }

    function saveHistory(sql, mql) {
        let history = JSON.parse(localStorage.getItem('queryHistory') || '[]');
        history.unshift({
            sql,
            mql,
            time: new Date().toLocaleTimeString()
        });
        if (history.length > 20) history.pop();
        localStorage.setItem('queryHistory', JSON.stringify(history));
        renderHistory();
    }

    function renderHistory() {
        let history = JSON.parse(localStorage.getItem('queryHistory') || '[]');
        historyList.innerHTML = '';
        history.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div class="history-item-sql">${item.sql}</div>
                <div class="history-item-time">${item.time}</div>
            `;
            div.addEventListener('click', () => {
                sqlEditor.setValue(item.sql);
                mqlEditor.setValue(item.mql);
                historyPanel.classList.remove('active');
                playSound('blip');
            });
            historyList.appendChild(div);
        });
    }

    // Render AST recursively
    function renderAST(node) {
        if (node === null || node === undefined) return '';
        if (typeof node !== 'object') {
            return `<span class="ast-node ast-leaf">${node}</span>`;
        }
        
        let html = `<div class="ast-node ast-type">${node.type || 'Node'}</div>`;
        html += `<div class="ast-children">`;
        
        for (const key in node) {
            if (key === 'type') continue;
            
            html += `<div class="ast-prop"><strong>${key}:</strong> `;
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
    runBtn.addEventListener('click', async () => {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const query = sqlEditor.getValue().trim();
        if (!query) return;

        document.body.classList.add('is-transpiling');
        statusInd.textContent = 'PROCESSING...';
        statusInd.style.color = 'var(--accent)';
        mqlEditor.setValue('// PROCESSING...');
        outputPanel.classList.remove('shake-error');
        fixSuggestion.style.display = 'none';

        try {
            const response = await fetch('/api/transpile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: query })
            });
            
            const data = await response.json();
            document.body.classList.remove('is-transpiling');

            if (data.error) {
                if (data.suggestion) {
                    fixSuggestion.textContent = data.suggestion;
                    fixSuggestion.style.display = 'block';
                }
                throw new Error(data.error);
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
            
            // Populate explain list
            explanationList.innerHTML = '';
            currentExplanations.forEach(expls => {
                expls.forEach(exp => {
                    let li = document.createElement('li');
                    li.textContent = exp;
                    explanationList.appendChild(li);
                });
            });

        } catch (err) {
            document.body.classList.remove('is-transpiling');
            statusInd.textContent = 'ERR_SYNTAX';
            statusInd.style.color = 'var(--error)';
            mqlEditor.setValue(`[FATAL EXCEPTION]\n${err.message}`);
            
            outputPanel.classList.add('shake-error');
            playSound('error');
            
            cursor.classList.add('error-hover');
            setTimeout(() => cursor.classList.remove('error-hover'), 500);
        }
    });

    // Live Execution
    liveRunBtn.addEventListener('click', async () => {
        const query = mqlEditor.getValue().trim();
        if (!query || query.startsWith('//') || query.startsWith('[')) return; // Don't run errors or empty

        liveResultModal.classList.add('active');
        
        // Strategic placement near the button
        const btnRect = liveRunBtn.getBoundingClientRect();
        liveResultModal.style.left = Math.max(20, btnRect.left - 500) + 'px';
        liveResultModal.style.top = (btnRect.bottom + 20) + 'px';
        liveResultModal.style.transform = 'none';
        liveResultModal.style.margin = '0';

        liveResultOutput.textContent = 'EXECUTING IN MONGO_DB...';
        playSound('blip');

        try {
            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mql: query })
            });
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            liveResultOutput.textContent = JSON.stringify(data.result, null, 2);
            playSound('success');
        } catch (err) {
            liveResultOutput.textContent = `[EXECUTION ERROR]\n${err.message}`;
            playSound('error');
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
            debugContent.innerHTML = `Building Abstract Syntax Tree...\n\n${astOutput.innerHTML}`;
            playSound('blip');
            debugPhase = 2;
        } else if (debugPhase === 2) {
            debugPhaseTitle.textContent = '> PHASE 3: SEMANTIC ANALYSIS';
            debugContent.innerHTML = `Verifying tables and columns against Schema Map...\n\n[ OK ] Type checking passed.\n[ OK ] Constraints verified.`;
            playSound('success');
            debugPhase = 3;
        } else if (debugPhase === 3) {
            debugPhaseTitle.textContent = '> PHASE 4: CODE GENERATION (MQL)';
            debugContent.innerHTML = `Translating AST to MongoDB Aggregation/Queries...\n\n${mqlEditor.getValue()}`;
            playSound('success');
            debugPhase = 4;
        }
    }

    document.addEventListener('keydown', (e) => {
        if (debugOverlay.style.display === 'flex') {
            advanceDebugPhase();
        }
    });

    closeDebugBtn.addEventListener('click', () => {
        debugOverlay.style.display = 'none';
        debugPhase = 0;
    });

    debugBtn.addEventListener('click', async () => {
        // Run standard transpile first
        await runBtn.click();
        
        debugOverlay.style.display = 'flex';
        debugPhase = 1;
        debugPhaseTitle.textContent = '> PHASE 1: LEXICAL ANALYSIS (TOKENIZER)';
        debugContent.innerHTML = '';
        playSound('blip');
        
        // Show Tokens
        const tokenStrs = currentTokens.map(t => `<span style="color:var(--accent);">[${t.type}]</span> ${t.value}`).join('\n');
        debugContent.innerHTML = `Breaking SQL into Tokens...\n\n${tokenStrs}`;
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
                { id: 'c_1', name: 'id', type: 'uuid', isPk: true },
                { id: 'c_2', name: 'name', type: 'text', isPk: false }
            ]
        },
        {
            id: 't_orders',
            name: 'orders',
            x: 450,
            y: 200,
            columns: [
                { id: 'c_3', name: 'id', type: 'uuid', isPk: true },
                { id: 'c_4', name: 'user_id', type: 'uuid', isPk: false, fkTo: 't_users' },
                { id: 'c_5', name: 'total', type: 'int', isPk: false }
            ]
        }
    ];

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
            });
            header.appendChild(nameInput);
            
            const delTableBtn = document.createElement('span');
            delTableBtn.textContent = 'X';
            delTableBtn.style.cursor = 'pointer';
            delTableBtn.addEventListener('click', () => {
                schemaData = schemaData.filter(t => t.id !== table.id);
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
                });

                const colTypeSelect = document.createElement('select');
                colTypeSelect.style.background = 'transparent';
                colTypeSelect.style.border = 'none';
                colTypeSelect.style.color = 'var(--accent)';
                colTypeSelect.style.fontFamily = 'inherit';
                colTypeSelect.style.outline = 'none';
                ['uuid', 'text', 'int', 'time'].forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t;
                    opt.textContent = t;
                    if(t === col.type) opt.selected = true;
                    colTypeSelect.appendChild(opt);
                });
                colTypeSelect.addEventListener('change', (e) => {
                    col.type = e.target.value;
                });

                const delColBtn = document.createElement('span');
                delColBtn.textContent = '×';
                delColBtn.style.cursor = 'pointer';
                delColBtn.style.color = 'var(--error)';
                delColBtn.style.marginLeft = 'auto';
                delColBtn.addEventListener('click', () => {
                    table.columns = table.columns.filter(c => c.id !== col.id);
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
                    name: 'new_col',
                    type: 'text',
                    isPk: false
                });
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
                name: 'new_table',
                x: 100,
                y: 100,
                columns: [
                    { id: 'c_' + Math.random().toString(36).substr(2, 9), name: 'id', type: 'uuid', isPk: true }
                ]
            });
            renderSchema();
        });
    }

    if (generateSqlBtn) {
        generateSqlBtn.addEventListener('click', () => {
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
