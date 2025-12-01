
class Task {
    constructor(type, r, e, p, d) {
        this.type = type;   // "periodic" or "aperiodic"
        this.r = r;         // release time
        this.e = e;         // execution time
        this.p = p;         // period (null for aperiodic)
        this.d = d;         // deadline
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