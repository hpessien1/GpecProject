// Opening a large photo or PDF takes a lot of memory for a moment (a photo up to about 200 MB), so the
// API does one at a time, however many arrive together (audit M-04). Each waits for the one before it
// to finish, whether that one worked or not. signal: a job for a form that was abandoned or stopped
// while it waited is skipped, rather than opened for nobody (audit S3-M02).
let queue: Promise<unknown> = Promise.resolve()

export function oneAtATime<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const result = queue.then(() => {
    signal?.throwIfAborted()
    return task()
  })
  queue = result.catch(() => undefined)
  return result
}
