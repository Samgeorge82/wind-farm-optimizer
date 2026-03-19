from __future__ import annotations
import threading
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Any


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Job:
    job_id: str
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0
    message: str = "Queued"
    result: Optional[Any] = None
    error: Optional[str] = None
    _cancel_flag: bool = field(default=False, repr=False)


class InMemoryJobStore:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self) -> str:
        job_id = str(uuid.uuid4())
        with self._lock:
            self._jobs[job_id] = Job(job_id=job_id)
        return job_id

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def update(self, job_id: str, **kwargs):
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                for k, v in kwargs.items():
                    setattr(job, k, v)

    def cancel(self, job_id: str):
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job._cancel_flag = True

    def is_cancelled(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            return job._cancel_flag if job else False

    def exists(self, job_id: str) -> bool:
        return job_id in self._jobs

    def to_dict(self, job: Job) -> dict:
        return {
            "job_id": job.job_id,
            "status": job.status.value,
            "progress": job.progress,
            "message": job.message,
            "result": job.result,
            "error": job.error,
        }


job_store = InMemoryJobStore()
