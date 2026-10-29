const chains = new Map();
const pending = new Map();
const SEND_INTERVAL_MS = 350;
const MAX_PENDING_PER_CHANNEL = 200;

function enqueue(channelId, task) {
  const queued = pending.get(channelId) || 0;
  if (queued >= MAX_PENDING_PER_CHANNEL) {
    console.warn(`Dropped a log entry for channel ${channelId}: the delivery queue is full.`);
    return Promise.resolve(null);
  }
  pending.set(channelId, queued + 1);

  const previous = chains.get(channelId) || Promise.resolve();
  const next = previous
    .then(async () => {
      await new Promise(resolve => setTimeout(resolve, SEND_INTERVAL_MS));
      return task();
    })
    .catch(error => {
      console.error(`Log delivery failed for channel ${channelId}:`, error);
      return null;
    })
    .finally(() => {
      const remaining = (pending.get(channelId) || 1) - 1;
      if (remaining > 0) pending.set(channelId, remaining);
      else pending.delete(channelId);
      if (chains.get(channelId) === next) chains.delete(channelId);
    });
  chains.set(channelId, next);
  return next;
}

module.exports = { enqueue, SEND_INTERVAL_MS, MAX_PENDING_PER_CHANNEL };
