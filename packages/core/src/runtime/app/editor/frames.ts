// Block frames' "did it render anything?" checks: run after each render, and by the editor bridge when the
// page changes (an async block component resolving doesn't re-render its frame).
export const frameChecks = new Set<() => void>()
