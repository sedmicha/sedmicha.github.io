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

let isMouseDown = false;

let minDotSize;
let maxDotSize;
let dotSizeLenPts;
let dotSizeNumPts;

let speedPts = 10;

let fitToWindow;
let bgColor;
let brushColor;
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

class Stroke {
    points = [];
    sizes = [];

    constructor(points = [], sizes = []) {
        this.points = points;
        this.sizes = sizes;
    }

    drawSegment(i) {
        if (i == 1) {
            dot_(this.points[0], this.sizes[0]);
        } else if (i == 2) {
            line_(this.points[0], this.points[1], this.sizes[1]);
        } else if (i >= 4) {
            const d = dist_(this.points[i - 3], this.points[i - 2]);
            if (d < 1) {
                dot_(this.points[i - 2], this.sizes[i - 1]);
            } else if (d < 1) {
                line_(this.points[i - 3], this.points[i - 2], this.sizes[i - 1]);
            } else {
                spline_(this.points[i - 4], this.points[i - 3], this.points[i - 2], this.points[i - 1], this.sizes[i - 2], this.sizes[i - 1], 1 / d);
            }
        }
    }

    drawLastSegment() {
        this.drawSegment(this.points.length);
    }

    drawAllSegments() {
        for (let i = 0; i <= this.points.length; i++) {
            this.drawSegment(i);
        }
    }
}

class Brush {
    strokeActive = false;
    stroke = null;
    times = [];

    beginStroke() {
        this.stroke = new Stroke();
        this.times = [];
        this.multiplier = rand(0.5, 1.5);
        this.strokeActive = true;
    }

    strokeTo(p) {
        let nPts = this.stroke.points.length;
        if (nPts == 0 || dist_(this.stroke.points[nPts - 1], p) > 1) {
            this.stroke.points.push(p);
            this.times.push(Date.now());
            let size = this.calcSize();
            this.stroke.sizes.push(size);
            this.stroke.drawLastSegment();
            //this.randomSplash();
        }
    }

    calcSize() {
        let now = Date.now();
        let i = this.stroke.points.length - 2;
        let timeLimit = 100;
        let distance = 0;
        let duration = 1;
        while (i >= 0 && now - this.times[i] < timeLimit) {
            duration = now - this.times[i];
            distance += dist_(this.stroke.points[i], this.stroke.points[i + 1]);
            i--;
        }
        let speed = distance / Math.max(1, duration);
        let size;
        if (speed >= 0.0 && speed <= 1.0) size = lerp(speed, [0.0, 0.3], [20, 15]);
        else size = lerp(speed, [0.7, 1.5], [15, 1]);

        size = clamp(size, 1, 20) * this.multiplier;
        console.log(`distance=${distance} speed=${speed} size=${size}`);

        return size;
    }

    randomSplash() {
        let [pX, pY] = this.stroke.points[this.stroke.points.length - 1];
        let pos = [pX + rand(-10, 10), pY + rand(-10, 10)];
        let size = rand(1, 10);
        dot_(pos, size);
    }

    endStroke() {
        this.updateSize();
        this.strokeActive = false;
    }

    updateSize() {
        if (this.strokeActive && this.stroke.points.length > 0)
            this.stroke.sizes[this.stroke.points.length - 1] = Math.max(this.calcSize(), this.stroke.sizes[this.stroke.points.length - 1]);
    }

    update() {
        if (this.strokeActive && this.stroke.points.length > 0) {
            this.updateSize();
            this.stroke.drawLastSegment();
        }
    }
}

function redraw() {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < historyStep; i++) {
        const {color, pts, sizes} = lines[i];
        ctx.fillStyle = color;
        const stroke = new Stroke(pts, sizes);
        stroke.drawAllSegments();
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
    localStorage.setItem('statev2', JSON.stringify(state));
    if (saveLines)
        localStorage.setItem('linesv2', JSON.stringify(lines));
}

function loadState() {
    const state = JSON.parse(localStorage.getItem("statev2")) ?? {};
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

    lines = JSON.parse(localStorage.getItem('linesv2')) || [];
    updateHistoryBtns();

    redraw();
}

function updateHistoryBtns() {
    undoBtn.disabled = !(historyStep > 0);
    redoBtn.disabled = !(historyStep < lines.length);
}


function mouseDown(e) {
    isMouseDown = true;
    brush.beginStroke();
    addLinePoint([e.offsetX, e.offsetY]);
}

canvas.onmousedown = (e) => {
    mouseDown(e);
};

canvas.onmouseenter = (e) => {
    if (e.buttons == 0)
        return;
    mouseDown(e);
};

canvas.onmousemove = (e) => {
    if (isMouseDown)
        addLinePoint([e.offsetX, e.offsetY]);
};

function mouseUp(e) {
    if (!isMouseDown)
        return;

    addLinePoint([e.offsetX, e.offsetY]);

    isMouseDown = false;
    if (!brush.stroke.points)
        return;

    if (historyStep != lines.length) {
        lines.splice(historyStep);
    }
    brush.endStroke();
    lines.push({
        color: brushColor,
        pts: brush.stroke.points,
        sizes: brush.stroke.sizes
    });


    historyStep += 1;
    updateHistoryBtns();

    saveState(true);
}

canvas.onmouseleave = (e) => {
    mouseUp(e);
};

canvas.onmouseup = (e) => {
    mouseUp(e);
};

function addLinePoint(point) {
    brush.strokeTo(point);
}

setInterval(() => {
    if (!isMouseDown)
        return;
    brush.update();
    // addLinePoint(point);
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

brush = new Brush();
loadState();