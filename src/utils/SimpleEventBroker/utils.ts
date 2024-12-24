export const promiseTimeout = (timeout: number = 10) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, timeout);
  });
