export function canRun(pJob, apQueue, server, t) {
    // 1. Cannot run while a periodic job is executing
    if (pJob) return false;

    // 2. Need at least one aperiodic job
    if (apQueue.length === 0) return false;

    // 3. Need positive remaining budget
    if (server.remaining <= 0) return false;

    // 4. No restriction on "polling instant" like in Polling Server
    return true;
}

export function update(aJob, server, t) {
    // --- 1. Replenish at the start of each server period ---
    // When time hits the next replenishment instant, restore full budget
    if (Math.abs(t - server.nextRelease) < 1e-9) {
        server.remaining = server.budget;
        server.nextRelease += server.period;
    }

    // --- 2. Consume budget ONLY when an aperiodic job is running ---
    if (aJob) {
        // TIME_STEP is 0.1 in your main loop
        server.remaining = +(server.remaining - 0.1).toFixed(3);
        if (server.remaining < 0) server.remaining = 0;
    }

    // Note: Unused budget is *not* lost before the next period boundary.
}