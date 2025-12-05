import * as background from "./servers/background.js";
import * as poller from "./servers/poller.js";
import * as deferrable from "./servers/deferrable.js";

const serverModules = {
    background,
    poller,
    deferrable
};

function autoRun() {
    document.getElementById("runBtn").click();
}

window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("schedulerSelect").addEventListener("change", autoRun);
    document.getElementById("serverSelect").addEventListener("change", autoRun);
    // document.getElementById("consumptionSelect").addEventListener("change", autoRun);
    // document.getElementById("replSelect").addEventListener("change", autoRun);
});

const TIME_STEP = 0.1;

class Task {
    constructor(type, r, e, p, d) {
        this.type = type;
        this.r = r;
        this.e = e;
        this.p = p;
        this.d = d;
        this.released = false;
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
}

function gcd(a, b) {
    while (b !== 0) { let t = b; b = a % b; a = t; }
    return a;
}

function lcm(a, b) {
    return (a * b) / gcd(a, b);
}

function computeHyperperiod(periodicTasks) {
    const periods = periodicTasks.map(t => t.p);
    let L = periods[0];
    for (let i = 1; i < periods.length; i++) L = lcm(L, periods[i]);
    return L;
}

function parseTaskFile(fileText) {
    const lines = fileText.split(/\r?\n/);

    const periodic = [];
    const aperiodic = [];

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith("#")) continue;

        const parts = line.split(/\s+/);
        const tag = parts[0];

        if (tag === "P") {
            if (parts.length === 5) {
                const [, r, e, p, d] = parts;
                periodic.push(new Task("periodic", +r, +e, +p, +d));
            }
            else if (parts.length === 4) {
                const [, r, e, p] = parts;
                periodic.push(new Task("periodic", +r, +e, +p, +p));
            }
            else if (parts.length === 3) {
                const [, e, p] = parts;
                periodic.push(new Task("periodic", 0, +e, +p, +p));
            }
        }

        else if (tag === "A") {
            const [, r, e] = parts;
            aperiodic.push(new Task("aperiodic", +r, +e, null, null));
        }
    }

    return { periodic, aperiodic };
}


function releaseJobs(periodicTasks, currentTime, jobCounter, readyQueue, arrivals) {
    for (let i = 0; i < periodicTasks.length; i++) {
        const t = periodicTasks[i];

        if (currentTime >= t.r &&
            ((currentTime - t.r) % t.p === 0)) {

            const jobId = `T${i}J${jobCounter[i]}`;
            readyQueue.push(new Job(t, currentTime, jobId));
            jobCounter[i]++;

            arrivals.push({ time: currentTime, taskIndex: i });
        }
    }
}


function pickRM(queue) {
    return queue.sort((a, b) => a.task.p - b.task.p)[0] || null;
}

function pickEDF(queue) {
    return queue.sort((a, b) => a.deadline - b.deadline)[0] || null;
}

function pickLLF(queue, now) {
    queue.forEach(j => j.laxity = j.deadline - now - j.remaining);
    return queue.sort((a, b) => a.laxity - b.laxity)[0] || null;
}

function pickJob(type, queue, now) {
    if (type === "RM") return pickRM(queue);
    if (type === "EDF") return pickEDF(queue);
    if (type === "LLF") return pickLLF(queue, now);
    return null;
}

// Background server: run A only if no periodic job ready
function canRunA(serverMode, periodicJob, apQueue) {
    if (serverMode !== "background") return false;
    if (periodicJob) return false;
    return apQueue.length > 0;
}

function runJobForOneTick(job, t, queue) {
    if (!job) return;

    if (!job.started) {
        job.started = true;
        job.startTime = t;
    }

    job.remaining = +(job.remaining - TIME_STEP).toFixed(3);

    if (job.remaining <= 0) {
        job.finishTime = +(t + TIME_STEP).toFixed(3);
        const i = queue.indexOf(job);
        if (i !== -1) queue.splice(i, 1);
    }
}


function colorFromJobId(jobId) {
    if (jobId === "IDLE") return "#dddddd";

    const periodicColors = ["#ff9999", "#99ff99", "#9999ff", "#ffcc99"];
    const aperiodicColors = ["#ffeb99", "#ffd966", "#ffbf00", "#ff9900"];

    if (jobId.startsWith("T")) {
        const idx = parseInt(jobId.substring(1));
        return periodicColors[idx % periodicColors.length];
    }

    if (jobId.startsWith("A")) {
        const idx = parseInt(jobId.substring(1));
        return aperiodicColors[idx % aperiodicColors.length];
    }

    return "#000000";
}

function drawGanttChart(timeline, tasks, arrivals) {
    const canvas = document.getElementById("ganttCanvas");
    const ctx = canvas.getContext("2d");

    const periodicTasks = tasks.filter(t => t.type === "periodic");
    const aperiodicTasks = tasks.filter(t => t.type === "aperiodic");

    const periodicCount = periodicTasks.length;

    const cellW = 40;
    const stepW = TIME_STEP * cellW;
    const cellH = 26;
    const top = 30;
    const left = 80;

    const totalRows = periodicTasks.length + aperiodicTasks.length + 1;

    canvas.height = totalRows * (cellH + 10) + top + 20;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const lastT = Math.ceil(timeline[timeline.length - 1].t);

    ctx.strokeStyle = "#c0d8f7";
    for (let t = 0; t <= lastT; t++) {
        const x = left + t * cellW;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let r = 0; r <= totalRows; r++) {
        const y = top + r * (cellH + 10) - 5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.font = "14px Arial";
    ctx.fillStyle = "#000";

    for (let t = 0; t <= lastT; t++) {
        ctx.fillText(t, left + t * cellW + 2, 20);
    }

    // arrivals (periodic only)
    arrivals.forEach(a => {
        const x = left + a.time * cellW;
        const y = top + a.taskIndex * (cellH + 10) + cellH + 4;

        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.moveTo(x + stepW / 2, y);
        ctx.lineTo(x + stepW / 2 - 5, y + 10);
        ctx.lineTo(x + stepW / 2 + 5, y + 10);
        ctx.fill();
    });

    // Find rows
    function getRow(jobId) {
        if (jobId === "IDLE")
            return periodicCount + aperiodicTasks.length;

        if (jobId.startsWith("T")) {
            const i = parseInt(jobId.substring(1));
            return i;
        }

        if (jobId.startsWith("A")) {
            const i = parseInt(jobId.substring(1));
            return periodicCount + i;
        }

        return periodicCount + aperiodicTasks.length;
    }

    // Draw timeline
    timeline.forEach(({ t, job }) => {
        const row = getRow(job);
        const x = left + t * cellW;
        const y = top + row * (cellH + 10);

        ctx.fillStyle = colorFromJobId(job);
        ctx.fillRect(x, y, stepW, cellH);

        if (stepW >= 20 && job !== "IDLE") {
            ctx.fillStyle = "#000";
            ctx.fillText(job, x + 3, y + 17);
        }
    });

    ctx.fillStyle = "#000000";
    periodicTasks.forEach((_, i) => {
        ctx.fillText(`T${i}`, 20, top + i * (cellH + 10) + 20);
    });

    aperiodicTasks.forEach((_, i) => {
        const row = periodicCount + i;
        ctx.fillText(`A${i}`, 20, top + row * (cellH + 10) + 20);
    });

    const idleRow = periodicCount + aperiodicTasks.length;
    ctx.fillText("IDLE", 20, top + idleRow * (cellH + 10) + 20);
}

// -------------------- INFO PANEL --------------------

function showTaskInfo(tasks, hyperperiod) {
    const div = document.getElementById("taskInfo");

    let html = `<b>Hyperperiod:</b> ${hyperperiod}<br><br><b>Task Set:</b><ul>`;

    let p = 0, a = 0;
    tasks.forEach(t => {
        if (t.type === "periodic") {
            html += `<li><b>T${p}</b> → r=${t.r}, e=${t.e}, p=${t.p}, d=${t.d}</li>`;
            p++;
        } else {
            html += `<li><b>A${a}</b> → r=${t.r}, e=${t.e}</li>`;
            a++;
        }
    });

    html += `</ul>`;
    div.innerHTML = html;
}

// -------------------- MAIN LOOP --------------------

document.getElementById("runBtn").addEventListener("click", () => {
    const scheduler = document.getElementById("schedulerSelect").value;
    const serverMode = document.getElementById("serverSelect").value;
    const file = document.getElementById("fileInput").files[0];

    const serverPeriod = parseFloat(document.getElementById("serverPeriod").value);
    const serverBudget = parseFloat(document.getElementById("serverBudget").value);
    console.log("SERVER MODE =", serverMode);
    console.log("SERVER PERIOD =", serverPeriod);
    console.log("SERVER BUDGET =", serverBudget);

    if (!file) return alert("Select a task file!");

    const reader = new FileReader();
    reader.onload = e => {
        const { periodic, aperiodic } = parseTaskFile(e.target.result);
        let HP = computeHyperperiod(periodic);

        if (serverMode === "poller" || serverMode === "deferrable") {
            HP = lcm(HP, serverPeriod);
        }

        showTaskInfo([...periodic, ...aperiodic], HP);

        let server = {
            period: serverPeriod,
            budget: serverBudget,
            remaining: serverMode === "poller" ? 0 : serverBudget,
            nextRelease: serverPeriod
        };

        const serverModule = serverModules[serverMode];

        let readyQueue = [];
        let apQueue = [];
        let jobCounter = periodic.map(() => 1);
        let arrivals = [];
        let timeline = [];

        for (let t = 0; t <= HP; t = +(t + TIME_STEP).toFixed(3)) {

            // ---- 1. Periodic job releases ----
            releaseJobs(periodic, t, jobCounter, readyQueue, arrivals);

            // ---- 2. Aperiodic job releases ----
            for (let A of aperiodic) {
                if (!A.released && t >= A.r) {
                    A.released = true;
                    apQueue.push({
                        jobId: `A${apQueue.length}`,
                        remaining: A.e,
                        started: false,
                        startTime: null,
                        finishTime: null
                    });
                }
            }

            // ---- 3. Pick periodic job (RM, EDF, LLF) ----
            let pJob = pickJob(scheduler, readyQueue, t);

            // ---- 4. Server decides whether A-task may run ----
            let aJob = null;
            if (serverModule.canRun(pJob, apQueue, server, t)) {
                aJob = apQueue[0];   // FIFO Aperiodic queue
            }
            // ---- 5. Execute (periodic > aperiodic > idle) ----
            let jobToRun;

            if (pJob) {
                jobToRun = pJob;
                runJobForOneTick(pJob, t, readyQueue);
            }
            else if (aJob) {
                jobToRun = aJob;

                // First time running?
                if (!aJob.started) {
                    aJob.started = true;
                    aJob.startTime = t;
                }
                // Execute the aperiodic job
                aJob.remaining = +(aJob.remaining - TIME_STEP).toFixed(3);

                // If finished, remove it
                if (aJob.remaining <= 0) {
                    aJob.finishTime = +(t + TIME_STEP).toFixed(3);
                    apQueue.shift();
                }
            }
            else {
                jobToRun = { jobId: "IDLE" };
            }

            // ---- 6. Update server internal state ----
            serverModule.update(aJob, server, t);

            // ---- 7. Log timeline ----
            timeline.push({ t, job: jobToRun.jobId });
        }

        // ---- 8. Draw chart ----
        drawGanttChart(timeline, [...periodic, ...aperiodic], arrivals);
    };

    reader.readAsText(file);
});