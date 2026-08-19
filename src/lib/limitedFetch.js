export const createLimitedFetch = (baseFetch, maxConcurrent = 8) => {
  if (typeof baseFetch !== 'function') throw new TypeError('baseFetch must be a function');
  const limit = Math.max(1, Math.floor(Number(maxConcurrent) || 1));
  const pending = [];
  let active = 0;

  const drain = () => {
    while (active < limit && pending.length > 0) {
      const job = pending.shift();
      active += 1;
      Promise.resolve()
        .then(() => baseFetch(...job.args))
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  return (...args) => new Promise((resolve, reject) => {
    pending.push({ args, resolve, reject });
    drain();
  });
};
