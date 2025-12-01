export function canRun(pJob, apQueue, server, t) {
    // Cannot run during periodic execution
    if (pJob) return false;

    // Must have aperiodic jobs ready
    if (apQueue.length === 0) return false;

    // Must have remaining budget
    if (server.remaining <= 0) return false;

    // Must have reached the current polling instant
    const lastPolling = server.nextRelease - server.period;
    if (t < lastPolling - 1e-9) return false;

    return true;
}

export function update(aJob, server, t) {

    // --- 1. POLLING INSTANT CHECK ---
    if (Math.abs(t - server.nextRelease) < 1e-9) {
        server.remaining = server.budget;         // replenish C_s
        server.nextRelease += server.period;      // next polling time
    }

    // --- 2. Budget consumption occurs ONLY when a periodic job is running ---
    if (aJob) {
        server.remaining = +(server.remaining - 0.1).toFixed(3);
        if (server.remaining < 0) server.remaining = 0;
    }
}
