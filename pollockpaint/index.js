const canvasParent = document.querySelector("#canvas");
const canvasBackFrame = document.querySelector("#canvasBackFrame");
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const brushColorPicker = document.getElementById("brushColor");
const bgColorPicker = document.getElementById("bgColor");
const debugDiv = document.getElementById("debug");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const setSizeBtn = document.getElementById("setSizeBtn");
const clearBtn = document.getElementById("clearBtn");
const saveImgBtn = document.getElementById("saveImgBtn");
const fitToWindowChkbox = document.getElementById("fitToWindowChkbox");
const widthInput = document.getElementById("widthInput");
const heightInput = document.getElementById("heightInput");
const minDotSizeInput = document.getElementById("minDotSizeInput");
const maxDotSizeInput = document.getElementById("maxDotSizeInput");
const dotSizeNumPtsInput = document.getElementById("dotSizeNumPtsInput");
const dotSizeLenPtsInput = document.getElementById("dotSizeLenPtsInput");
const resetDotParamBtn = document.getElementById("resetDotParamBtn");

let mouseDown = false;
let mousePos;
let prevPt;
let dotSize;
let pts = [];
let ptSizes = [];

let numLinePts = 0;

let minDotSize;
let maxDotSize;
let dotSizeLenPts;
let dotSizeNumPts;

let speedPts = 10;

let fitToWindow ;
let bgColor;
let brushColor;
let linePts = [];
let lineSizes = [];
let lines;
let historyStep;

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

const rgba2hex = (rgba) => `#${rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.{0,1}\d*))?\)$/).slice(1).map((n, i) => (i === 3 ? Math.round(parseFloat(n) * 255) : parseFloat(n)).toString(16).padStart(2, '0').replace('NaN', '')).join('')}`

function dist(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function calcSpeed() {
    const len = Math.min(dotSizeNumPts, numLinePts);
    let total = 0;
    for (let i = pts.length - len + 1; i < pts.length; i++) {
        total += dist(pts[i], pts[i - 1]);
    }
    if (total == 0)
        return 0;
    return total / (len - 1);
}

function dot(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotSize, 0, Math.PI*2, true);
    ctx.closePath();
    ctx.fill();
}

function line(a, b) {
    if (Math.abs(a.x - b.x) <= 0.1 && Math.abs(a.y - b.y) <= 0.1) {
        dot(a);
        return;
    }

    if (Math.abs(a.x - b.x) > Math.abs(a.y - b.y)) {
        const dy = (b.y - a.y) / (b.x - a.x);
        const dx = a.x > b.x ? -1 : 1;
        let x = a.x;
        let y = a.y;
        while (Math.abs(x - b.x) > 0.1) {
            x += dx;
            y += dx * dy;
            dot(new Point(x, y));
        }
    } else {
        const dx = (b.x - a.x) / (b.y - a.y);
        const dy = a.y > b.y ? -1 : 1;
        let x = a.x;
        let y = a.y;
        while (Math.abs(y - b.y) > 0.1) {
            x += dx * dy;
            y += dy;
            dot(new Point(x, y));
        }
    }
}

function redraw() {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < historyStep; i++) {
        const {color, pts, sizes} = lines[i];
        ctx.fillStyle = color;
        for (let j = 1; j < pts.length; j++) {
            dotSize = sizes[j];
            line(pts[j], pts[j - 1]);
        }
    }
    ctx.fillStyle = brushColor;
}

brushColorPicker.onchange = () => {
    let color = brushColorPicker.value;
    brushColor = color;
    ctx.fillStyle = color;
    saveState();
};
bgColorPicker.onchange = () => {
    let color = bgColorPicker.value;
    bgColor = color;
    bgColorPicker.value = color;
    redraw();
    saveState();
};

function saveState(saveLines) {
    const state = {
        historyStep: historyStep,
        fitToWindow: fitToWindow,
        brushColor: brushColor,
        bgColor: bgColor,
        width: canvas.width,
        height: canvas.height,
        minDotSize: minDotSize,
        maxDotSize: maxDotSize,
        dotSizeNumPts: dotSizeNumPts,
        dotSizeLenPts: dotSizeLenPts
    };
    localStorage.setItem('state', JSON.stringify(state));
    if (saveLines)
        localStorage.setItem('lines', JSON.stringify(lines));
}

function loadState() {
    const state = JSON.parse(localStorage.getItem("state")) ?? {};
    historyStep = state.historyStep ?? 0;
    fitToWindow = state.fitToWindow ?? true;
    fitToWindowChkbox.checked = fitToWindow;
    brushColor = state.brushColor ?? "#000000";
    brushColorPicker.value = brushColor;
    bgColor = state.bgColor ?? "#ffffff";
    bgColorPicker.value = bgColor;
    minDotSize = state.minDotSize ?? 1;
    minDotSizeInput.value = minDotSize;
    maxDotSize = state.maxDotSize ?? 10;
    maxDotSizeInput.value = maxDotSize;
    dotSizeNumPts = state.dotSizeNumPts ?? 10;
    dotSizeNumPtsInput.value = dotSizeNumPts;
    dotSizeLenPts = state.dotSizeLenPts ?? 10;
    dotSizeLenPtsInput.value = dotSizeLenPts;

    let width, height;
    if (fitToWindow) {
        width = canvasParent.offsetWidth;
        height = canvasParent.offsetHeight;
    } else {
        width = state.width ?? canvasParent.offsetWidth;
        height = state.height ?? canvasParent.offsetHeight;
    }
    canvas.width = width;
    canvas.height = height;
    widthInput.value = width;
    heightInput.value = height;

    lines = JSON.parse(localStorage.getItem('lines')) || [];
    updateHistoryBtns();

    redraw();
}

function updateHistoryBtns() {
    undoBtn.disabled = !(historyStep > 0);
    redoBtn.disabled = !(historyStep < lines.length);
}


function mouseDownFn(e) {
    mousePos = new Point(e.offsetX, e.offsetY);
    numLinePts = 0;
    linePts = [];
    lineSizes = [];
    mouseDown = true;
}

canvas.onmousedown = (e) => {
    mouseDownFn(e);
};

canvas.onmouseenter = (e) => {
    if (e.buttons == 0)
        return;
    mouseDownFn(e);
};

canvas.onmousemove = (e) => {
    mousePos = new Point(e.offsetX, e.offsetY);
};

function mouseUp(e) {
    if (!mouseDown)
        return;

    mousePos = new Point(e.offsetX, e.offsetY);
    console.log(mousePos);
    linePoint();

    mouseDown = false;
    prevPt = null;
    if (!linePts)
        return;

    if (historyStep != lines.length) {
        lines.splice(historyStep);
    }
    lines.push({
        color: brushColor,
        pts: linePts,
        sizes: lineSizes
    });

    numLinePts = 0;
    linePts = [];
    lineSizes = [];

    historyStep += 1;
    updateHistoryBtns();

    saveState(true);
}

canvas.onmouseleave = (e) => {
    console.log('leave');
    mouseUp(e);
};

canvas.onmouseup = (e) => {
    console.log('up');
    mouseUp(e);
};

function linePoint() {
    pts.push(mousePos);
    numLinePts += 1;

    let speed = calcSpeed();
    let size = (1.0 - speed / dotSizeLenPts) * maxDotSize;
    size = Math.max(size, minDotSize);
    size = Math.min(size, maxDotSize);
    dotSize = size;
    linePts.push(mousePos);
    lineSizes.push(size);

    if (prevPt != null)
        line(prevPt, mousePos);
    prevPt = mousePos;
}

setInterval(() => {
    if (!mouseDown)
        return;

    linePoint();
}, 10);


window.onresize = () => {
    if (!fitToWindow)
        return;
    let width = canvasParent.offsetWidth;
    let height = canvasParent.offsetHeight;
    canvas.width = width;
    canvas.height = height;
    widthInput.value = width;
    heightInput.value = height;
    redraw();
    saveState();
};


undoBtn.onclick = () => {
    if (historyStep > 0) {
        historyStep -= 1;
        updateHistoryBtns();
        redraw();
        saveState();
    }
};

redoBtn.onclick = () => {
    if (historyStep < lines.length) {
        historyStep += 1;
        updateHistoryBtns();
        redraw();
        saveState();
    }
};

fitToWindowChkbox.onchange = () => {
    if (fitToWindowChkbox.checked) {
        let width = canvasParent.offsetWidth;
        let height = canvasParent.offsetHeight;
        canvas.width = width;
        canvas.height = height;
        widthInput.value = width;
        heightInput.value = height;
        fitToWindow = true;
        redraw();
    } else {
        fitToWindow = false;
    }
    saveState();
};

setSizeBtn.onclick = () => {
    fitToWindow = false;
    fitToWindowChkbox.checked = false;
    canvas.width = widthInput.value;
    canvas.height = heightInput.value;
    redraw();
    saveState();
};

clearBtn.onclick = () => {
    if (lines.length > 0) {
        if (!confirm("Current painting will be lost! Are you sure?")) {
            return;
        }
    }
    lines = [];
    historyStep = 0;
    updateHistoryBtns();
    redraw();
    saveState();
};

saveImgBtn.onclick = () => {
    const link = document.createElement('a');
    const imageName = "Pollock No. " + new Date().getTime();
    link.style.display = 'none';
    document.body.appendChild(link)
    link.setAttribute('download', imageName + '.png');
    link.setAttribute('href', canvas.toDataURL().replace("image/png", "image/octet-stream"));
    link.click();
    document.body.removeChild(link);
};

minDotSizeInput.onchange = () => {
    minDotSize = minDotSizeInput.value;
    saveState();
};

maxDotSizeInput.onchange = () => {
    maxDotSize = maxDotSizeInput.value;
    saveState();
};

dotSizeNumPtsInput.onchange = () => {
    dotSizeNumPts = dotSizeNumPtsInput.value;
    saveState();
};

dotSizeLenPtsInput.onchange = () => {
    dotSizeLenPts = dotSizeLenPtsInput.value;
    saveState();
};

resetDotParamBtn.onclick = () => {
    minDotSize = 1;
    minDotSizeInput.value = minDotSize
    maxDotSize = 10;
    maxDotSizeInput.value = maxDotSize;
    dotSizeNumPts = 10;
    dotSizeNumPtsInput.value = dotSizeNumPts;
    dotSizeLenPts = 10;
    dotSizeLenPtsInput.value = dotSizeLenPts;
    saveState();
};

function colorChoiceBrush(color) {
    console.log('hello', color);
    brushColorPicker.value = color;
    brushColor = color;
    ctx.fillStyle = color;
    saveState();
}

function colorChoiceBackground(color) {
    bgColorPicker.value = color;
    bgColor = color;
    bgColorPicker.value = color;
    redraw();
    saveState();
}

document.querySelectorAll('.colorChoiceBrush').forEach(el => {

    const color = el.getAttribute("data-color");
    el.style.backgroundColor = color;
    el.onclick = () => colorChoiceBrush(color);
});
document.querySelectorAll('.colorChoiceBackground').forEach(el => {
    const color = el.getAttribute("data-color");
    el.style.backgroundColor = color;
    el.onclick = () => colorChoiceBackground(color);
});

loadState();