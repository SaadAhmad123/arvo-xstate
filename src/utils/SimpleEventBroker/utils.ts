export const promiseTimeout = (timeout = 10) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, timeout);
  });
