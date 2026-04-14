const fs = require('fs');

const filePath = `C:\\Users\\gynet\\OneDrive\\Bureau\\APPLI\\Asistant Bulletin\\Antigravity Access\\Bulletin-AI\\app\\src\\css\\modules\\seating-chart.css`;
let text = fs.readFileSync(filePath, 'utf8');

const startStr = `.sc-student-chip:hover {
    background: var(--surface-color);
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
    overflow: auto;
    min-width: 0;
    min-height: 0;
}`;

const correctStr = `.sc-student-chip:hover {
    background: var(--surface-color);
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
}

.sc-student-chip:active {
    cursor: grabbing;
    transform: scale(1.03) translateY(0);
    box-shadow: var(--shadow-md);
    z-index: 10;
}

.sc-student-chip.dragging { opacity: 0.4; }

.sc-student-chip .student-avatar { flex-shrink: 0; }

.sc-student-chip-name {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* ────────── GRID AREA ────────── */
.sc-grid-area {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 16px;
    padding: 0 var(--content-padding-x, 24px) 24px;
    overflow: auto;
    min-width: 0;
    min-height: 0;
}`;

if (text.includes(startStr)) {
    text = text.replace(startStr, correctStr);
    fs.writeFileSync(filePath, text, 'utf8');
    console.log("Fixed successfully");
} else {
    console.log("Could not find start str");
}
