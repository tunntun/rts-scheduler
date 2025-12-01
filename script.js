
class Task {
    constructor(type, r, e, p, d) {
        this.type = type;   // "periodic" or "aperiodic"
        this.r = r;         // release time
        this.e = e;         // execution time
        this.p = p;         // period (null for aperiodic)
        this.d = d;         // deadline
    }
}

class Job {
    constructor(task, releaseTime, jobId) {
        this.task = task;               // reference to Task object
        this.jobId = jobId;             // unique ID (e.g., "T1J3")

        this.releaseTime = releaseTime; // actual release time
        this.remaining = task.e;        // remaining execution time

        // absolute deadline = releaseTime + relative deadline (task.d)
        this.deadline = releaseTime + task.d;

        this.finished = false;          // true when remaining <= 0
        this.started = false;           // first time it runs
        this.startTime = null;          // when job starts executing
        this.finishTime = null;         // when job finishes

        // For LLF scheduling:
        this.laxity = Infinity;
    }

    updateLaxity(currentTime) {
        this.laxity = this.deadline - currentTime - this.remaining;
    }
}


document.getElementById("runBtn").addEventListener("click", () => {
    const scheduler = document.getElementById("schedulerSelect").value;
    const serverMode = document.getElementById("serverSelect").value;
    const consumptionRule = document.getElementById("consumptionSelect").value;
    const replRule = document.getElementById("replSelect").value;

    const fileInput = document.getElementById("fileInput").files[0];
    if (!fileInput) {
        alert("Please select a task file.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const fileText = e.target.result;
        const tasks = parseTaskFile(fileText);

        console.log("Parsed tasks:", tasks);
        console.log("Scheduler:", scheduler);
        console.log("Server:", serverMode);
        console.log("Consumption rule:", consumptionRule);
        console.log("Replenishment rule:", replRule);

        // simulation engine'i buraya ekleyeceksin untuma
        let currentTime = 0;
        let SIMULATION_END = 20;

        // Ready queue where RM/EDF/LLF pick jobs
        let readyQueue = [];
        let timeline = [];

        // A job counter per task (for jobId naming)
        let jobCounter = tasks.map(() => 1);

        for (currentTime = 0; currentTime <= SIMULATION_END; currentTime++) {
            // STEP 1 — Release periodic jobs
            releaseJobs(tasks, currentTime, jobCounter, readyQueue);

            // STEP 2 — Choose job to run
            const jobToRun = pickJob(scheduler, readyQueue, currentTime);

            console.log(`t=${currentTime} → running: ${jobToRun ? jobToRun.jobId : "IDLE"}`);

            // STEP 3 — Execute job for 1 tick
            runJobForOneTick(jobToRun, currentTime, readyQueue);
            timeline[currentTime] = jobToRun ? jobToRun.jobId : "IDLE";
        }
        drawGanttChart(timeline, tasks);


    };
    reader.readAsText(fileInput);
});

function parseTaskFile(fileText) {
    const lines = fileText.split(/\r?\n/);
    const tasks = [];

    for (let rawLine of lines) {
        const line = rawLine.trim();

        // Skip empty lines or comments
        if (line === "" || line.startsWith("#")) continue;

        const parts = line.split(/\s+/);
        const tag = parts[0];

        // Periodic tasks: P ...
        if (tag === "P") {
            if (parts.length === 5) {
                // P ri ei pi di
                const [, ri, ei, pi, di] = parts;
                tasks.push(new Task(
                    "periodic",
                    parseFloat(ri),
                    parseFloat(ei),
                    parseFloat(pi),
                    parseFloat(di)
                ));
            }
            else if (parts.length === 4) {
                // P ri ei pi   (deadline = period)
                const [, ri, ei, pi] = parts;
                const period = parseFloat(pi);

                tasks.push(new Task(
                    "periodic",
                    parseFloat(ri),
                    parseFloat(ei),
                    period,
                    period   // default deadline = period
                ));
            }
            else if (parts.length === 3) {
                // P ei pi      (release = 0, deadline = period)
                const [, ei, pi] = parts;
                const period = parseFloat(pi);

                tasks.push(new Task(
                    "periodic",
                    0, // default release time
                    parseFloat(ei),
                    period,
                    period // default deadline = period
                ));
            }
            else {
                console.error("Invalid P line:", line);
            }
        }

        // Deadline-monotonic variant: D ei pi di
        else if (tag === "D") {
            if (parts.length !== 4) {
                console.error("Invalid D line:", line);
                continue;
            }

            const [, ei, pi, di] = parts;

            tasks.push(new Task(
                "periodic",
                0, // D format does not use explicit release time
                parseFloat(ei),
                parseFloat(pi),
                parseFloat(di)
            ));
        }

        // Aperiodic tasks: A ri ei
        else if (tag === "A") {
            if (parts.length !== 3) {
                console.error("Invalid A line:", line);
                continue;
            }

            const [, ri, ei] = parts;

            tasks.push(new Task(
                "aperiodic",
                parseFloat(ri),
                parseFloat(ei),
                null, // no period
                null // no deadline
            ));
        }

        else {
            console.error("Unknown task type:", tag);
        }
    }

    return tasks;
}

function releaseJobs(tasks, currentTime, jobCounter, readyQueue) {
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];

        if (task.type === "aperiodic") continue;

        if ((currentTime - task.r) >= 0 && ((currentTime - task.r) % task.p === 0)) {
            const jobId = `T${i}J${jobCounter[i]}`;
            const job = new Job(task, currentTime, jobId);
            readyQueue.push(job);
            jobCounter[i]++;
        }
    }
}

function pickRM(readyQueue) {
    if (readyQueue.length === 0) return null;
    readyQueue.sort((a, b) => a.task.p - b.task.p);
    return readyQueue[0];
}

function pickEDF(readyQueue) {
    if (readyQueue.length === 0) return null;
    readyQueue.sort((a, b) => a.deadline - b.deadline);
    return readyQueue[0];
}

function pickLLF(readyQueue, currentTime) {
    if (readyQueue.length === 0) return null;
    readyQueue.forEach(job => job.updateLaxity(currentTime));
    readyQueue.sort((a, b) => a.laxity - b.laxity);
    return readyQueue[0];
}

function pickJob(schedulerName, readyQueue, currentTime) {
    if (schedulerName === "RM") return pickRM(readyQueue);
    if (schedulerName === "EDF") return pickEDF(readyQueue);
    if (schedulerName === "LLF") return pickLLF(readyQueue, currentTime);
    return null;
}

function runJobForOneTick(job, currentTime, readyQueue) {
    if (!job) return;

    if (!job.started) {
        job.started = true;
        job.startTime = currentTime;
    }

    job.remaining -= 1;

    if (job.remaining <= 0) {
        job.finished = true;
        job.finishTime = currentTime + 1;

        const idx = readyQueue.indexOf(job);
        if (idx !== -1) readyQueue.splice(idx, 1);
    }
}
function drawGanttChart(timeline, tasks) {
    const canvas = document.getElementById("ganttCanvas");
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cellWidth = 40;
    const cellHeight = 25;
    const topMargin = 20;
    const leftMargin = 60;
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (let t = 0; t < timeline.length; t++) {
        const x = leftMargin + t * cellWidth;

        ctx.beginPath();
        ctx.moveTo(x, topMargin);
        ctx.lineTo(x, canvas.height - topMargin);
        ctx.stroke();
    }

    ctx.setLineDash([]); // reset dash

    //Determine how many rows we need:
    //one row per periodic task + one row for IDLE
    const rows = tasks.length + 1; // last row = IDLE

    canvas.height = rows * (cellHeight + 10) + topMargin * 2;

    // Draw time axis labels
    ctx.font = "12px Arial";
    ctx.fillStyle = "#000";

    for (let t = 0; t < timeline.length; t++) {
        ctx.fillText(t, leftMargin + t * cellWidth + 10, 15);
    }

    // Draw each row
    for (let t = 0; t < timeline.length; t++) {
        const jobId = timeline[t];

        let row = 0;
        if (jobId === "IDLE") {
            row = tasks.length; // last row
        } else {
            // Extract task index from jobId like T2J4 =< 2
            const match = jobId.match(/T(\d+)/);
            row = match ? parseInt(match[1]) : 0;
        }

        const x = leftMargin + t * cellWidth;
        const y = topMargin + row * (cellHeight + 10);

        ctx.fillStyle = colorFromJobId(jobId);
        ctx.fillRect(x, y, cellWidth, cellHeight);

        ctx.fillStyle = "#000";
        ctx.fillText(jobId, x + 5, y + 17);
    }

    // Draw task labels on the left
    ctx.font = "14px Arial";
    for (let i = 0; i < tasks.length; i++) {
        ctx.fillText(`T${i}`, 10, topMargin + i * (cellHeight + 10) + 17);
    }
    ctx.fillText("IDLE", 10, topMargin + tasks.length * (cellHeight + 10) + 17);
}


function colorFromJobId(jobId) {
    if (jobId === "IDLE") return "#dddddd";

    const match = jobId.match(/T(\d+)/);
    const taskIndex = match ? parseInt(match[1]) : 0;

    const colors = [
        "#ff9999", "#99ff99", "#9999ff",
        "#ffcc99", "#cc99ff", "#99ffcc"
    ];

    return colors[taskIndex % colors.length];
}
