import mongoose from 'mongoose'

// How long /api/health waits for MongoDB. Docker's health check gives up after 5 seconds.
const PING_TIMEOUT_MS = 2000

// True when MongoDB answers a ping in time. /api/health uses it, so the API reports itself unhealthy
// (and Docker marks the container so) when the database cannot be reached, not just when the process
// has stopped.
export async function databaseIsReachable(timeoutMs = PING_TIMEOUT_MS): Promise<boolean> {
  const db = mongoose.connection.db
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected || !db) return false
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs) })
  try {
    return await Promise.race([db.admin().ping().then(() => true), timeout])
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
