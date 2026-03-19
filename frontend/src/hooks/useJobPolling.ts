import { useEffect, useRef, useCallback } from 'react'
import { getJob } from '../api'
import type { Job } from '../types'

const POLL_INTERVAL = 1500

export function useJobPolling(
  jobId: string | null,
  onComplete: (job: Job) => void,
  onError?: (msg: string) => void,
  onProgress?: (progress: number, message: string) => void,
) {
  // Use refs so the effect doesn't re-run when callbacks change
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)
  const onProgressRef = useRef(onProgress)
  onCompleteRef.current = onComplete
  onErrorRef.current = onError
  onProgressRef.current = onProgress

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!jobId) {
      stop()
      return
    }

    // Poll immediately once, then at interval
    const poll = async () => {
      try {
        const job = await getJob(jobId)

        // Report progress
        onProgressRef.current?.(job.progress ?? 0, job.message ?? '')

        if (job.status === 'completed') {
          stop()
          onCompleteRef.current(job)
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          stop()
          onErrorRef.current?.(job.error || 'Job failed')
        }
      } catch (e: any) {
        stop()
        onErrorRef.current?.(e.message)
      }
    }

    // Immediate first poll
    poll()

    // Then poll at interval
    intervalRef.current = setInterval(poll, POLL_INTERVAL)

    return stop
  }, [jobId, stop]) // Only re-run when jobId changes

  return stop
}
