from fastapi import APIRouter, BackgroundTasks, HTTPException
from models.sensitivity import (
    TornadoInput, TornadoResult,
    MonteCarloInput, MonteCarloResult,
)
from services.sensitivity.tornado import run_tornado
from services.sensitivity.monte_carlo import run_monte_carlo
from workers.task_runner import job_store, JobStatus

router = APIRouter()


@router.post("/tornado", response_model=TornadoResult)
def tornado_analysis(inp: TornadoInput):
    return run_tornado(inp)


@router.post("/montecarlo")
def start_monte_carlo(inp: MonteCarloInput, background_tasks: BackgroundTasks):
    """Start async Monte Carlo simulation."""
    if inp.n_iterations > 500:
        # Run async for large runs
        job_id = job_store.create()
        background_tasks.add_task(_run_mc_async, job_id, inp)
        return {"job_id": job_id, "status": "pending"}
    else:
        result = run_monte_carlo(inp)
        return result


@router.get("/montecarlo/{job_id}")
def get_mc_result(job_id: str):
    job = job_store.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job_store.to_dict(job)


def _run_mc_async(job_id: str, inp: MonteCarloInput):
    try:
        job_store.update(job_id, status=JobStatus.RUNNING, progress=10.0,
                         message=f"Running {inp.n_iterations} Monte Carlo iterations")
        result = run_monte_carlo(inp)
        job_store.update(job_id, status=JobStatus.COMPLETED, progress=100.0,
                         message="Complete", result=result.model_dump())
    except Exception as e:
        job_store.update(job_id, status=JobStatus.FAILED, error=str(e))
