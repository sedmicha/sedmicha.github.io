const canvasParent = document.querySelector("#canvas");
const canvasBackFrame = document.querySelector("#canvasBackFrame");
const canvas = document.getElementById("paintingCanvas");
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
const minThicknessInput = document.getElementById("minThicknessInput");
const maxThicknessInput = document.getElementById("maxThicknessInput");
const speedThresholdInput = document.getElementById("speedThresholdInput");
const speedSampleTimeInput = document.getElementById("speedSampleTimeInput");
const resetDotParamBtn = document.getElementById("resetDotParamBtn");
const minRandomMultiplierInput = document.getElementById("minRandomMultiplierInput");
const maxRandomMultiplierInput = document.getElementById("maxRandomMultiplierInput");

let isMouseDown = false;

let minThickness;
let maxThickness;
let speedSampleTime;
let speedThreshold;
let brushLerpSpline;
let minRandomMultiplier;
let maxRandomMultiplier;

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

function lerpIntervals(value, as, bs) {
    for (let i = 1; i < as.length; i++) {
        if (value < as[i] || i == as.length - 1) {
            return lerp(value, [as[i - 1], as[i]], [bs[i - 1], bs[i]]);
        }
    }
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
        this.multiplier = rand(minRandomMultiplier, maxRandomMultiplier);
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
        let timeLimit = speedSampleTime;
        let distance = 0;
        let duration = 1;
        while (i >= 0 && now - this.times[i] < timeLimit) {
            duration = now - this.times[i];
            distance += dist_(this.stroke.points[i], this.stroke.points[i + 1]);
            i--;
        }
        let speed = distance / Math.max(1, duration);
        let size;
        size = lerpIntervals(speed, brushLerpSpline[0], brushLerpSpline[1]);
        //console.log('size=',size);
        //if (speed >= 0.0 && speed <= 1.0) size = lerp(speed, [0.0, 0.3], [20, 15]);
        //else size = lerp(speed, [0.7, 1.5], [15, 1]);

        size = clamp(size, minThickness, maxThickness);
        size *= this.multiplier;
        //console.log(`distance=${distance} speed=${speed} size=${size}`);

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
        minThickness: minThickness,
        maxThickness: maxThickness,
        speedThreshold: speedThreshold,
        speedSampleTime: speedSampleTime,
        brushLerpSpline: brushLerpSpline
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
    minThickness = state.minThickness ?? 1;
    minThicknessInput.value = minThickness;
    maxThickness = state.maxThickness ?? 20;
    maxThicknessInput.value = maxThickness;
    speedThreshold = state.speedThreshold ?? 1.5;
    speedThresholdInput.value = speedThreshold;
    speedSampleTime = state.speedSampleTime ?? 100;
    speedSampleTimeInput.value = speedSampleTime;
    brushLerpSpline = state.brushLerpSpline ?? [[0, 1, 1.5], [20, 10, 1]];
    minRandomMultiplier = state.minRandomMultiplier ?? 0.5;
    minRandomMultiplierInput.value = minRandomMultiplier;
    maxRandomMultiplier = state.maxRandomMultiplier ?? 1.5;
    maxRandomMultiplierInput.value = maxRandomMultiplier;

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

    brushControl.axisRangeY = [minThickness, maxThickness];
    brushControl.axisRangeX = [0, speedThreshold];
    brushControl.loadPoints(brushLerpSpline[0], brushLerpSpline[1]);
    brushControl.draw();
    brushControl.onChange();

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

minThicknessInput.onchange = () => {
    minThickness = minThicknessInput.value;
    brushControl.axisRangeY = [minThickness, maxThickness];
    brushControl.draw();
    brushControl.onChange();
    saveState();
};

maxThicknessInput.onchange = () => {
    maxThickness = maxThicknessInput.value;
    brushControl.axisRangeY = [minThickness, maxThickness];
    brushControl.draw();
    brushControl.onChange();

    saveState();
};

speedThresholdInput.onchange = () => {
    speedThreshold = speedThresholdInput.value;
    brushControl.axisRangeX = [0, speedThreshold];
    brushControl.draw();
    brushControl.onChange();
    saveState();
};

speedSampleTimeInput.onchange = () => {
    speedSampleTime = speedSampleTimeInput.value;
    saveState();
};

resetDotParamBtn.onclick = () => {
    minThickness = 1;
    minThicknessInput.value = minThickness
    maxThickness = 20;
    maxThicknessInput.value = maxThickness;
    speedThreshold = 1.5;
    speedThresholdInput.value = speedThreshold;
    speedSampleTime = 100;
    speedSampleTimeInput.value = speedSampleTime;
    brushControl.axisRangeY = [minThickness, maxThickness];
    brushControl.axisRangeX = [0, speedThreshold];
    brushControl.loadPoints([0, 1, 1.5], [20, 10, 1]);
    brushControl.draw();
    brushControl.onChange();
    minRandomMultiplier = 0.5;
    minRandomMultiplierInput.value = minRandomMultiplier;
    maxRandomMultiplier = 1.5;
    maxRandomMultiplierInput.value = maxRandomMultiplier;
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

minRandomMultiplierInput.onchange = () => {
    minRandomMultiplier = parseFloat(minRandomMultiplierInput.value);
    saveState();
};

maxRandomMultiplierInput.onchange = () => {
    maxRandomMultiplier = parseFloat(maxRandomMultiplierInput.value);
    saveState();
};


class BrushControl {
    canvas;
    ctx;
    areaX;
    areaY;
    areaW;
    areaH;
    axisRangeX = [0, 1];
    axisRangeY = [0, 1];
    points = [];
    dragging = false;
    dotSize = 5;

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext("2d");
        this.updateDimensions();
        this.points = [[0, this.areaH / 2], [this.areaW / 2, this.areaH / 2], [this.areaW - 1, this.areaH / 2]];
        this.draw();

        this.canvas.onmouseenter = (e) => {
            if (e.which == 1)
                this.mouseDown([e.offsetX, e.offsetY]);
        };

        this.canvas.onmousedown = (e) => {
            //console.log('mousedown', e);
            if (e.which == 1)
                this.mouseDown([e.offsetX, e.offsetY]);
            else if (e.which == 3)
                this.rightClick([e.offsetX, e.offsetY]);
        };

        this.canvas.onmouseup = (e) => {
            if (e.which == 1)
                this.mouseUp([e.offsetX, e.offsetY]);
        };

        this.canvas.onmouseleave = (e) => {
            if (e.which == 1)
                this.mouseUp([e.offsetX, e.offsetY]);
        };

        this.canvas.onmousemove = (e) => {
            if (e.which == 1)
                this.mouseMove([e.offsetX, e.offsetY]);
        };

        this.canvas.ondblclick = (e) => {
            if (e.which == 1)
                this.doubleClick([e.offsetX, e.offsetY]);
        };

        this.canvas.oncontextmenu = (e) => {
            e.preventDefault();
        };

    }

    loadPoints(xPoints, yPoints) {
        let points = [];
        for (let i = 0; i < xPoints.length; i++) {
            let [x, y] = [xPoints[i], yPoints[i]];
            x = lerp(x, this.axisRangeX, [0, this.areaW]);
            y = lerp(y, this.axisRangeY, [this.areaH, 0]);
            points.push([x, y]);
        }
        this.points = points;
    }

    updateDimensions() {
        this.areaX = 25;
        this.areaY = 10;
        this.areaW = this.canvas.width - 35;
        this.areaH = this.canvas.height - 35;
    }

    drawAxis() {
        this.ctx.strokeStyle = "#888";
        this.ctx.fillStyle = "#888";
        this.ctx.beginPath();
        this.ctx.moveTo(this.areaX, this.areaY);
        this.ctx.lineTo(this.areaX, this.areaY + this.areaH);
        this.ctx.lineTo(this.areaX + this.areaW, this.areaY + this.areaH);
        this.ctx.stroke();

        this.ctx.font = "12px sans-serif";
        this.ctx.textAlign = "right";
        this.ctx.fillText(this.axisRangeY[0], this.areaX - 10, this.areaY + this.areaH);
        this.ctx.fillText(this.axisRangeY[1], this.areaX - 10, this.areaY + 5);

        this.ctx.textAlign = "left";
        this.ctx.fillText(this.axisRangeX[0], this.areaX, this.areaY + this.areaH + 20);
        this.ctx.textAlign = "right";
        this.ctx.fillText(this.axisRangeX[1], this.areaX + this.areaW, this.areaY + this.areaH + 20);
    }

    areaRelToCanvas([x, y]) {
        return [this.areaX + x * this.areaW, this.areaY + y * this.areaH];
    }

    canvasToAreaRel([x, y]) {
        return [lerp(x, [this.areaX, this.areaX + this.areaW], [0, 1]), lerp(y, [this.areaY, this.areaY + this.areaH], [0, 1])];
    }

    areaToCanvas([x, y]) {
        return [this.areaX + x, this.areaY + y];
    }

    canvasToArea([x, y]) {
        return [x - this.areaX, y - this.areaY];
    }

    pointAtCanvasPos(p) {
        p = this.canvasToArea(p);
        for (let i = 0; i < this.points.length; i++) {
            if (dist_(this.points[i], p) <= this.dotSize)
                return i;
        }
        return -1;
    }

    drawPoints() {
        this.ctx.strokeStyle = "#666";
        this.ctx.lineWidth = 1;
        for (let i = 1; i < this.points.length; i++) {
            let [x0, y0] = this.areaToCanvas(this.points[i - 1]);
            let [x1, y1] = this.areaToCanvas(this.points[i]);
            this.ctx.beginPath();
            this.ctx.moveTo(x0, y0);
            this.ctx.lineTo(x1, y1);
            this.ctx.stroke();
        }

        this.ctx.fillStyle = "#666";
        for (let i = 0; i < this.points.length; i++) {
            let [x, y] = this.areaToCanvas(this.points[i]);
            this.ctx.beginPath();
            this.ctx.arc(x, y, this.dotSize, 0, Math.PI*2, true);
            this.ctx.closePath();
            this.ctx.fill();
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawAxis();
        this.drawPoints();
    }

    mouseDown(p) {
        this.activePtIdx = this.pointAtCanvasPos(p);
        this.dragging = true;
    }

    mouseMove(p) {
        if (!this.dragging)
            return;

        if (this.activePtIdx == -1)
            return;

        const [x, y] = this.canvasToArea(p);
        if (x < 0 || x > this.areaW || y < 0 || y > this.areaH)
            return;

        if (this.activePtIdx == 0 || this.activePtIdx == this.points.length - 1) {
            this.points[this.activePtIdx][1] = y;
        } else {
            if (this.points[this.activePtIdx - 1][0] <= x && this.points[this.activePtIdx + 1][0] >= x)
                this.points[this.activePtIdx] = [x, y];
            else
                this.points[this.activePtIdx][1] = y;
        }
        this.draw();

    }

    mouseUp(p) {
        this.dragging = false;
        this.onChange();
    }

    doubleClick(p) {
        if (this.activePtIdx != -1)
            return;

        const [x, y] = this.canvasToArea(p);
        if (x < 0 || x >= this.areaW || y < 0 || y >= this.areaH)
            return;

        this.points.push([x, y]);
        this.points.sort(([x0, y0], [x1, y1]) => x0 - x1);
        this.draw();
        this.onChange();
    }

    rightClick(p) {
        const i = this.pointAtCanvasPos(p);
        if (i != -1 && i != 0 && i != this.points.length - 1) {
            this.points.splice(i, 1);
            this.draw();
            this.onChange();
        }
    }

    getPoints() {
        let xs = [];
        let ys = [];
        for (let i = 0; i < this.points.length; i++) {
            let [x, y] = this.points[i];
            x = lerp(x, [0, this.areaW], this.axisRangeX);
            y = lerp(y, [this.areaH, 0], this.axisRangeY);
            xs.push(x);
            ys.push(y);
        }
        return [xs, ys];
    }

    onChange() {}
}

let brushControl = new BrushControl(document.getElementById("brushOptionsCanvas"));
brushControl.onChange = () => {
    brushLerpSpline = brushControl.getPoints();
    saveState();
};
brush = new Brush();
loadState();