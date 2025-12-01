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

// Now takes ONLY periodic tasks
function computeHyperperiod(periodicTasks) {
    const periods = periodicTasks.map(t => t.p);
    if (periods.length === 0) return 0;
    let L = periods[0];
    for (let i = 1; i < periods.length; i++) L = lcm(L, periods[i]);
    return L;
}

function parseTaskFile(fileText) {
    const lines = fileText.split(/\r?\n/);
    const periodic = [];
    const aperiodic = [];

    for (let rawLine of lines) {
        const line = rawLine.trim();
        if (line === "" || line.startsWith("#")) continue;

        const parts = line.split(/\s+/);
        const tag = parts[0];

        if (tag === "P") {
            if (parts.length === 5) {
                const [, ri, ei, pi, di] = parts;
                periodic.push(new Task(
                    "periodic",
                    parseFloat(ri),
                    parseFloat(ei),
                    parseFloat(pi),
                    parseFloat(di)
                ));
            } else if (parts.length === 4) {
                const [, ri, ei, pi] = parts;
                periodic.push(new Task(
                    "periodic",
                    parseFloat(ri),
                    parseFloat(ei),
                    parseFloat(pi),
                    parseFloat(pi)
                ));
            } else if (parts.length === 3) {
                const [, ei, pi] = parts;
                periodic.push(new Task(
                    "periodic",
                    0,
                    parseFloat(ei),
                    parseFloat(pi),
                    parseFloat(pi)
                ));
            }
        } else if (tag === "A") {
            const [, ri, ei] = parts;
            aperiodic.push(
                new Task("aperiodic", parseFloat(ri), parseFloat(ei), null, null)
            );
        }
    }

    return { periodic, aperiodic };
}

// Release ONLY periodic jobs
function releaseJobs(periodicTasks, currentTime, jobCounter, readyQueue, arrivals) {
    for (let i = 0; i < periodicTasks.length; i++) {
        const task = periodicTasks[i];

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

// ----- SCHEDULING -----
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

// Aperiodic server selector (extensible)
function selectAperiodicJob(serverMode, apJob, currentTime, periodicReady) {
    if (!apJob || apJob.remaining <= 0) return null;

    if (serverMode === "background") {
        // Background server: only runs when NO periodic job
        return periodicReady ? null : apJob;
    }

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
        const idx = readyQueue.indexOf(job);
        if (idx !== -1) {
            readyQueue.splice(idx, 1);
        }
    }
}

// ----- DRAWING -----
function drawGanttChart(timeline, tasks, arrivals) {
    const canvas = document.getElementById("ganttCanvas");
    const ctx = canvas.getContext("2d");

    const cellWidth = 40;  // width per 1 time unit
    const stepWidth = TIME_STEP * cellWidth;

    const cellHeight = 26;
    const topMargin = 30;
    const leftMargin = 80;

    const rows = tasks.length + 1; // tasks + IDLE row
    canvas.height = rows * (cellHeight + 10) + topMargin + 20;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (timeline.length === 0) return;

    // GRID
    ctx.strokeStyle = "#b0d8ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    const totalTimeUnits = Math.ceil(timeline[timeline.length - 1].t || 0);

    for (let t = 0; t <= totalTimeUnits; t++) {
        const x = leftMargin + t * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

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

    // ARRIVAL ARROWS (only for periodic)
    arrivals.forEach(entry => {
        const { time, taskIndex } = entry;

        const x = leftMargin + time * cellWidth;
        const jobY = topMargin + taskIndex * (cellHeight + 10);
        const arrowY = jobY + cellHeight + 4;

        ctx.fillStyle = "#ff0000";

        ctx.beginPath();
        ctx.moveTo(x + stepWidth / 2, arrowY);
        ctx.lineTo(x + stepWidth / 2 - 5, arrowY + 10);
        ctx.lineTo(x + stepWidth / 2 + 5, arrowY + 10);
        ctx.closePath();
        ctx.fill();
    });

    // ROW mapping:
    const periodicCount = tasks.filter(t => t.type === "periodic").length;
    const aperiodicRow = periodicCount; // first aperiodic row (we assume one A job)

    // JOBS
    timeline.forEach(({ t, job }) => {
        const x = leftMargin + t * cellWidth;

        let row = tasks.length; // idle row by default

        if (job === "IDLE") {
            row = tasks.length;
        } else if (job === "A") {
            // Aperiodic server row
            row = aperiodicRow;
        } else {
            const match = job.match(/T(\d+)/);
            if (match) {
                row = parseInt(match[1]);
            }
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

    const periodicTasks = tasks.filter(t => t.type === "periodic");
    const aperiodicTasks = tasks.filter(t => t.type === "aperiodic");

    // Periodic labels
    periodicTasks.forEach((_, i) => {
        ctx.fillText(`T${i}`, 20, topMargin + i * (cellHeight + 10) + 20);
    });

    // Aperiodic label (if exists)
    if (aperiodicTasks.length > 0) {
        ctx.fillText(
            "A",
            20,
            topMargin + aperiodicRow * (cellHeight + 10) + 20
        );
    }

    // Idle label
    ctx.fillText(
        "IDLE",
        20,
        topMargin + tasks.length * (cellHeight + 10) + 20
    );
}

function colorFromJobId(jobId) {
    if (jobId === "IDLE") return "#dddddd";
    if (jobId === "A") return "#ffe680"; // aperiodic: yellow-ish

    const match = jobId.match(/T(\d+)/);
    const idx = match ? parseInt(match[1]) : 0;
    const colors = ["#ff9999", "#99ff99", "#9999ff", "#ffcc99", "#cc99ff", "#99ffcc"];
    return colors[idx % colors.length];
}

function showTaskInfo(tasks, hyperperiod) {
    const div = document.getElementById("taskInfo");

    let html = `<b>Hyperperiod:</b> ${hyperperiod}<br><br>`;
    html += `<b>Task Set:</b><br><ul>`;

    let periodicIndex = 0;
    let aperiodicIndex = 0;

    tasks.forEach((t) => {
        if (t.type === "periodic") {
            html += `<li><b>T${periodicIndex}</b> → r=${t.r}, e=${t.e}, p=${t.p}, d=${t.d}</li>`;
            periodicIndex++;
        } else {
            html += `<li><b>A${aperiodicIndex}</b> → r=${t.r}, e=${t.e}</li>`;
            aperiodicIndex++;
        }
    });

    html += `</ul>`;

    div.innerHTML = html;
}

// ----- MAIN SIMULATION LOOP -----
document.getElementById("runBtn").addEventListener("click", () => {
    const scheduler = document.getElementById("schedulerSelect").value;
    const serverMode = document.getElementById("serverSelect").value;

    const fileInput = document.getElementById("fileInput").files[0];
    if (!fileInput) return alert("Select a task file!");

    const reader = new FileReader();
    reader.onload = e => {
        const { periodic, aperiodic } = parseTaskFile(e.target.result);

        if (periodic.length === 0) {
            alert("No periodic tasks found!");
            return;
        }

        const SIMULATION_END = computeHyperperiod(periodic);
        const allTasks = [...periodic, ...aperiodic];

        showTaskInfo(allTasks, SIMULATION_END);
        console.log("Hyperperiod =", SIMULATION_END);

        let readyQueue = [];
        let jobCounter = periodic.map(() => 1);
        let timeline = [];
        let arrivals = [];

        // Single aperiodic job (for now)
        let apJob = null;

        for (let currentTime = 0;
             currentTime <= SIMULATION_END;
             currentTime = parseFloat((currentTime + TIME_STEP).toFixed(3))) {

            // 1) Periodic releases
            releaseJobs(periodic, currentTime, jobCounter, readyQueue, arrivals);

            // 2) Aperiodic release (first A that becomes ready)
            if (!apJob) {
                for (let t of aperiodic) {
                    if (!t.released && currentTime >= t.r) {
                        t.released = true;
                        apJob = {
                            type: "aperiodic",
                            task: t,
                            jobId: "A",
                            remaining: t.e,
                            started: false,
                            startTime: null,
                            finishTime: null
                        };
                        break;
                    }
                }
            }

            // 3) Pick periodic job (RM / EDF / LLF)
            let periodicJob = pickJob(scheduler, readyQueue, currentTime);

            // 4) Decide if aperiodic server should run
            let aperiodicToRun = selectAperiodicJob(
                serverMode,
                apJob,
                currentTime,
                periodicJob
            );

            // 5) Execute
            let jobToRun = null;

            if (periodicJob) {
                jobToRun = periodicJob;
                runJobForOneTick(periodicJob, currentTime, readyQueue);

            } else if (aperiodicToRun) {
                jobToRun = aperiodicToRun;

                if (!aperiodicToRun.started) {
                    aperiodicToRun.started = true;
                    aperiodicToRun.startTime = currentTime;
                }

                aperiodicToRun.remaining = parseFloat(
                    (aperiodicToRun.remaining - TIME_STEP).toFixed(3)
                );

                if (aperiodicToRun.remaining <= 0 && !aperiodicToRun.finishTime) {
                    aperiodicToRun.finishTime = parseFloat(
                        (currentTime + TIME_STEP).toFixed(3)
                    );
                }

            } else {
                // IDLE
                jobToRun = { jobId: "IDLE" };
            }

            // 6) Log timeline
            timeline.push({
                t: currentTime,
                job: jobToRun.jobId
            });
        }

        drawGanttChart(timeline, allTasks, arrivals);
    };

    reader.readAsText(fileInput);
});
