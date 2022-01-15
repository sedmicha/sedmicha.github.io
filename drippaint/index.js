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

let painter;

function clamp(value, minValue, maxValue) {
    return Math.min(Math.max(value, minValue), maxValue);
}

function lerp(value, [a0, a1], [b0, b1]) {
    return (value - a0) / (a1 - a0) * (b1 - b0) + b0;
}

function rand(min, max) {
    return lerp(Math.random(), [0, 1], [min, max]);
}

function dot_([x, y], size) {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI*2, true);
    ctx.closePath();
    ctx.fill();
}

function dist_([x0, y0], [x1, y1]) {
    return Math.sqrt(Math.pow(x0 - x1, 2) + Math.pow(y0 - y1, 2));
}

function line_([x0, y0], [x1, y1], thickness) {
    if (Math.abs(x0 - x1) <= 0.1 && Math.abs(y0 - y1) <= 0.1) {
        dot_([x0, y0], thickness);
        return;
    }

    if (Math.abs(x0 - x1) > Math.abs(y0 - y1)) {
        const dy = (y1 - y0) / (x1 - x0);
        const dx = x0 > x1 ? -1 : 1;
        let x = x0;
        let y = y0;
        while (Math.abs(x - x1) > Math.abs((x + dx) - x1)) {
            x += dx;
            y += dx * dy;
            dot_([x, y], thickness);
        }
    } else {
        const dx = (x1 - x0) / (y1 - y0);
        const dy = y0 > y1 ? -1 : 1;
        let x = x0;
        let y = y0;
        while (Math.abs(y - y1) > Math.abs((y + dy) - y1)) {
            x += dx * dy;
            y += dy;
            dot_([x, y], thickness);
        }
    }
}

function spline_(p0, p1, p2, p3, startThickness, endThickness, step) {
    const s = new CatmullRomSpline(p0, p1, p2, p3, 0.5, 0);
    for (let t = 0; t <= 1.0; t += step) {
        const thickness = (endThickness - startThickness) * t + startThickness;
        line_(s.getPoint(t), s.getPoint(t + step), thickness);
    }
}

class CatmullRomSpline {
    constructor(p0, p1, p2, p3, alpha, tension) {
        const t0 = 0.0;
        const t1 = t0 + Math.pow(dist_(p0, p1), alpha);
        const t2 = t1 + Math.pow(dist_(p1, p2), alpha);
        const t3 = t2 + Math.pow(dist_(p2, p3), alpha);

        const m1_ = (p0, p1, p2) => (1-tension) * (t2-t1) * ((p1-p0)/(t1-t0) - (p2-p0)/(t2-t0) + (p2-p1)/(t2-t1));
        const m2_ = (p1, p2, p3) => (1-tension) * (t2-t1) * ((p2-p1)/(t2-t1) - (p3-p1)/(t3-t1) + (p3-p2)/(t3-t2));

        const m1 = [m1_(p0[0], p1[0], p2[0]), m1_(p0[1], p1[1], p2[1])];
        const m2 = [m2_(p1[0], p2[0], p3[0]), m2_(p1[1], p2[1], p3[1])];

        const a = [
            2.0 * (p1[0] - p2[0]) + m1[0] + m2[0],
            2.0 * (p1[1] - p2[1]) + m1[1] + m2[1]
        ];
        const b = [
            -3.0 * (p1[0] - p2[0]) - m1[0] - m1[0] - m2[0],
            -3.0 * (p1[1] - p2[1]) - m1[1] - m1[1] - m2[1]
        ];
        this.segments = [a, b, m1, p1];
    }

    getPoint(t) {
        return [
            this.segments[0][0]*t*t*t + this.segments[1][0]*t*t + this.segments[2][0]*t + this.segments[3][0],
            this.segments[0][1]*t*t*t + this.segments[1][1]*t*t + this.segments[2][1]*t + this.segments[3][1]
        ];
    }
}

class Painter {
    points = []
    sizes = []
    times = []
    strokeActive = false;

    beginStroke() {
        this.points = [];
        this.sizes = [];
        this.times = [];
        this.strokeActive = true;
        this.multiplier = rand(0.5, 1.5);
    }

    strokeTo(p, size) {
        let nPts = this.points.length;
        if (nPts == 0 || dist_(this.points[nPts - 1], p) > 1) {
            this.points.push(p);
            this.times.push(Date.now());
            size = this.calcSize();
            this.sizes.push(size);
            this.drawStroke();
            this.randomSplash();
        }
    }

    calcSize() {
        let now = Date.now();
        let i = this.points.length - 2;
        let timeLimit = 100;
        let distance = 0;
        let duration = 1;
        while (i >= 0 && now - this.times[i] < timeLimit) {
            duration = now - this.times[i];
            distance += dist_(this.points[i], this.points[i + 1]);
            i--;
        }
        let speed = distance / Math.max(1, duration);
        //let size = lerp(distance, [1.0, 100], [15, 1]);
        let size;
        if (speed >= 0.0 && speed <= 1.0) size = lerp(speed, [0.0, 0.3], [20, 15]);
        else size = lerp(speed, [0.7, 1.5], [15, 1]);

        size = clamp(size, 1, 20) * this.multiplier;
        console.log(`distance=${distance} speed=${speed} size=${size}`);

        /*
        let num = Math.min(10, this.points.length);
        let distance = 0;
        for (let i = this.points.length - num; i < this.points.length - 1; i++) {
            distance += dist_(this.points[i], this.points[i + 1]);
        }
        let duration = Date.now() - this.times[this.times.length - num];
        let speed = distance / Math.max(1, duration);
        //let size = 1 / speed;
        let size = lerp(speed, [0.1, 1.5], [15, 1]);
        size = clamp(size, 1, 15);
        console.log(`speed=${speed} size=${size}`);
        */
        return size;
    }

    drawStroke() {
        let nPts = this.points.length;
        if (nPts == 1) {
            dot_(this.points[0], this.sizes[0]);
        } else if (nPts == 2) {
            line_(this.points[0], this.points[1], this.sizes[1]);
        } else if (nPts >= 4) {
            const d = dist_(this.points[nPts - 3], this.points[nPts - 2]);
            if (d < 1) {
                dot_(this.points[nPts - 2], this.sizes[nPts - 1]);
            } else if (d < 1) {
                line_(this.points[nPts - 3], this.points[nPts - 2], this.sizes[nPts - 1]);
            } else {
                spline_(this.points[nPts - 4], this.points[nPts - 3], this.points[nPts - 2], this.points[nPts - 1], this.sizes[nPts - 2], this.sizes[nPts - 1], 1 / d);
            }
        }
    }

    randomSplash() {
        let [pX, pY] = this.points[this.points.length - 1];
        let pos = [pX + rand(-10, 10), pY + rand(-10, 10)];
        let size = rand(1, 10);
        dot_(pos, size);
    }

    endStroke() {
        this.updateSize();
        this.strokeActive = false;
    }

    updateSize() {
        if (!this.strokeActive || this.points.length == 0)
            return;

        this.sizes[this.points.length - 1] = this.calcSize();
    }

    update() {
        if (!this.strokeActive || this.points.length == 0)
            return;

        this.updateSize();
        this.drawStroke();
    }
}

class Point {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

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
    painter.beginStroke();
    linePoint();
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
    if (mouseDown)
        linePoint();
};

function mouseUp(e) {
    if (!mouseDown)
        return;

    mousePos = new Point(e.offsetX, e.offsetY);
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
    painter.endStroke();

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

    // if (numLinePts > 1)
    //     line(linePts[numLinePts - 2], linePts[numLinePts - 1]);
    painter.strokeTo([mousePos.x, mousePos.y], size);
}

setInterval(() => {
    if (!mouseDown)
        return;
    painter.update();
    // linePoint();
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

painter = new Painter();
loadState();