// Follow-up status shared by order enquiries and contact requests. Every request starts as "new";
// admins can move it to any status, including back from "closed". The frontend has the same list
// (frontend/src/types.ts, RequestStatus).
export const REQUEST_STATUSES = ['new', 'in_progress', 'closed'] as const
export type RequestStatus = typeof REQUEST_STATUSES[number]
