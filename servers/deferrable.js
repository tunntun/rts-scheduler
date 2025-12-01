export function canRun(pJob, apQueue, server, t) {
    if (pJob) return false;

    return apQueue.length > 0;
}

export function update(aJob, server, t) {
}