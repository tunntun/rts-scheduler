function autoRun() {
    document.getElementById("runBtn").click();
}

window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("schedulerSelect").addEventListener("change", autoRun);
    document.getElementById("serverSelect").addEventListener("change", autoRun);
    document.getElementById("consumptionSelect").addEventListener("change", autoRun);
    document.getElementById("replSelect").addEventListener("change", autoRun);
});

const TIME_STEP = 0.1;

class Task {
    constructor(type, r, e, p, d) {
        this.type = type;
        this.r = r;
        this.e = e;
        this.p = p;
        this.d = d;
    }
}

class Job {
    constructor(task, releaseTime, jobId) {
        this.task = task;
        this.jobId = jobId;

        this.releaseTime = releaseTime;
        this.remaining = task.e;

        this.deadline = releaseTime + task.d;

        this.started = false;
        this.startTime = null;
        this.finishTime = null;

        this.laxity = Infinity;
    }

    updateLaxity(currentTime) {
        this.laxity = this.deadline - currentTime - this.remaining;
    }
}

function gcd(a, b) {
    while (b !== 0) {
        let t = b;
        b = a % b;
        a = t;
    }
    return a;
}
function lcm(a, b) {
    return (a * b) / gcd(a, b);
}
function computeHyperperiod(tasks) {
    const periods = tasks.filter(t => t.type === "periodic").map(t => t.p);
    let L = periods[0];
    for (let i = 1; i < periods.length; i++) L = lcm(L, periods[i]);
    return L;
}

function parseTaskFile(fileText) {
    const lines = fileText.split(/\r?\n/);
    const tasks = [];

    for (let rawLine of lines) {
        const line = rawLine.trim();
        if (line === "" || line.startsWith("#")) continue;

        const parts = line.split(/\s+/);
        const tag = parts[0];

        if (tag === "P") {
            if (parts.length === 5) {
                const [, ri, ei, pi, di] = parts;
                tasks.push(new Task("periodic", parseFloat(ri), parseFloat(ei), parseFloat(pi), parseFloat(di)));
            } else if (parts.length === 4) {
                const [, ri, ei, pi] = parts;
                tasks.push(new Task("periodic", parseFloat(ri), parseFloat(ei), parseFloat(pi), parseFloat(pi)));
            } else if (parts.length === 3) {
                const [, ei, pi] = parts;
                tasks.push(new Task("periodic", 0, parseFloat(ei), parseFloat(pi), parseFloat(pi)));
            }
        }

        else if (tag === "A") {
            const [, ri, ei] = parts;
            tasks.push(new Task("aperiodic", parseFloat(ri), parseFloat(ei), null, null));
        }
    }

    return tasks;
}

function releaseJobs(tasks, currentTime, jobCounter, readyQueue, arrivals) {
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];

        if (task.type === "aperiodic") continue;

        if ((currentTime - task.r) >= 0 &&
            ((currentTime - task.r) % task.p === 0)) {

            const jobId = `T${i}J${jobCounter[i]}`;
            const job = new Job(task, currentTime, jobId);

            readyQueue.push(job);
            jobCounter[i]++;

            arrivals.push({
                time: currentTime,
                taskIndex: i,
            });
        }
    }
}



function pickRM(readyQueue) {
    return readyQueue.sort((a, b) => a.task.p - b.task.p)[0] || null;
}
function pickEDF(readyQueue) {
    return readyQueue.sort((a, b) => a.deadline - b.deadline)[0] || null;
}
function pickLLF(readyQueue, t) {
    readyQueue.forEach(job => job.updateLaxity(t));
    return readyQueue.sort((a, b) => a.laxity - b.laxity)[0] || null;
}
function pickJob(name, readyQueue, t) {
    if (name === "RM") return pickRM(readyQueue);
    if (name === "EDF") return pickEDF(readyQueue);
    if (name === "LLF") return pickLLF(readyQueue, t);
    return null;
}

function runJobForOneTick(job, t, readyQueue) {
    if (!job) return;

    if (!job.started) {
        job.started = true;
        job.startTime = t;
    }

    job.remaining = parseFloat((job.remaining - TIME_STEP).toFixed(3));

    if (job.remaining <= 0) {
        job.finishTime = parseFloat((t + TIME_STEP).toFixed(3));
        readyQueue.splice(readyQueue.indexOf(job), 1);
    }
}

function drawGanttChart(timeline, tasks, arrivals) {
    const canvas = document.getElementById("ganttCanvas");
    const ctx = canvas.getContext("2d");

    const cellWidth = 40;  // width per 1 time unit (integer)
    const stepWidth = TIME_STEP * cellWidth;

    const cellHeight = 26;
    const topMargin = 30;
    const leftMargin = 80;

    const rows = tasks.length + 1;
    canvas.height = rows * (cellHeight + 10) + topMargin + 20;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // GRID
    ctx.strokeStyle = "#b0d8ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    const totalTimeUnits = Math.ceil(timeline[timeline.length - 1].t);

    for (let t = 0; t <= totalTimeUnits; t++) {
        const x = leftMargin + t * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // HORIZONTAL grid
    for (let r = 0; r <= rows; r++) {
        const y = topMargin + r * (cellHeight + 10) - 5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    // Time labels
    ctx.font = "14px Arial";
    ctx.fillStyle = "#000";

    for (let t = 0; t <= totalTimeUnits; t++) {
        const x = leftMargin + t * cellWidth;
        ctx.fillText(t, x + 2, 20);
    }

    // ARRIVAL ARROWS
    arrivals.forEach(entry => {
    const { time, taskIndex } = entry;

    const x = leftMargin + time * cellWidth;

    const row = taskIndex;
    const jobY = topMargin + row * (cellHeight + 10);

    const arrowY = jobY + cellHeight + 4;

    ctx.fillStyle = "#ff0000";

    ctx.beginPath();
    ctx.moveTo(x + stepWidth / 2, arrowY);          // top of arrow
    ctx.lineTo(x + stepWidth / 2 - 5, arrowY + 10); // left bottom
    ctx.lineTo(x + stepWidth / 2 + 5, arrowY + 10); // right bottom
    ctx.closePath();
    ctx.fill();
});

    // JOBS
    timeline.forEach(({ t, job }) => {
        const x = leftMargin + t * cellWidth;

        let row = tasks.length; // idle by default
        if (job !== "IDLE") {
            const match = job.match(/T(\d+)/);
            row = match ? parseInt(match[1]) : 0;
        }

        const y = topMargin + row * (cellHeight + 10);

        ctx.fillStyle = colorFromJobId(job);
        ctx.fillRect(x, y, stepWidth, cellHeight);

        if (stepWidth >= 25) {
            ctx.fillStyle = "#000";
            ctx.fillText(job, x + 3, y + 17);
        }
    });

    // Labels
    ctx.font = "16px Arial";
    ctx.fillStyle = "#000";

    tasks.forEach((_, i) => {
        ctx.fillText(`T${i}`, 20, topMargin + i * (cellHeight + 10) + 20);
    });
    ctx.fillText("IDLE", 20, topMargin + tasks.length * (cellHeight + 10) + 20);
}



function colorFromJobId(jobId) {
    if (jobId === "IDLE") return "#dddddd";
    const idx = parseInt(jobId.match(/T(\d+)/)[1]);
    const colors = ["#ff9999", "#99ff99", "#9999ff", "#ffcc99", "#cc99ff", "#99ffcc"];
    return colors[idx % colors.length];
}

function showTaskInfo(tasks, hyperperiod) {
    const div = document.getElementById("taskInfo");

    let html = `<b>Hyperperiod:</b> ${hyperperiod}<br><br>`;
    html += `<b>Task Set:</b><br><ul>`;

    tasks.forEach((t, i) => {
        if (t.type === "periodic") {
            html += `<li><b>T${i}</b> → release r=${t.r}, exec e=${t.e}, period p=${t.p}, deadline d=${t.d}</li>`;
        } else {
            html += `<li><b>Aperiodic</b> A${i} → release r=${t.r}, exec e=${t.e}</li>`;
        }
    });

    html += `</ul>`;

    div.innerHTML = html;
}



// MAIN SIMULATION LOOP
document.getElementById("runBtn").addEventListener("click", () => {
    const scheduler = document.getElementById("schedulerSelect").value;

    const fileInput = document.getElementById("fileInput").files[0];
    if (!fileInput) return alert("Select a task file!");

    const reader = new FileReader();
    reader.onload = e => {
        const tasks = parseTaskFile(e.target.result);

        const SIMULATION_END = computeHyperperiod(tasks);
        showTaskInfo(tasks, SIMULATION_END);

        console.log("Hyperperiod =", SIMULATION_END);

        let readyQueue = [];
        let jobCounter = tasks.map(() => 1);
        let timeline = [];

        let arrivals = [];

        for (currentTime = 0; currentTime <= SIMULATION_END;
            currentTime = parseFloat((currentTime + TIME_STEP).toFixed(3))) {

            releaseJobs(tasks, currentTime, jobCounter, readyQueue, arrivals);

            const jobToRun = pickJob(scheduler, readyQueue, currentTime);

            runJobForOneTick(jobToRun, currentTime, readyQueue);

            timeline.push({ t: currentTime, job: jobToRun ? jobToRun.jobId : "IDLE" });
        }

        drawGanttChart(timeline, tasks, arrivals);
    };

    reader.readAsText(fileInput);
});
