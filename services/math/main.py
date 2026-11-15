"""
Treo Math Verification Service
Exposes two endpoints:
  POST /verify  — check algebraic equivalence of a sequence of steps
  POST /check   — check whether two LaTeX expressions are equivalent
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import sympy
from sympy.parsing.latex import parse_latex
from sympy import simplify, Eq, solve
import logging

app = FastAPI(title="Treo Math Service", version="1.0.0")
logger = logging.getLogger("uvicorn")


class Step(BaseModel):
    index: int
    latex: str


class VerifyRequest(BaseModel):
    problem: str          # LaTeX of the original problem
    steps: list[Step]     # Transcribed steps in order


class VerifyResponse(BaseModel):
    steps: list[dict]     # [{index, latex, isCorrect, error}]
    firstErrorIndex: Optional[int]
    finalAnswerCorrect: bool


class CheckRequest(BaseModel):
    expr1: str
    expr2: str


class CheckResponse(BaseModel):
    equivalent: bool
    error: Optional[str] = None


def safe_parse(latex_str: str):
    """Parse a LaTeX expression, returning (expr, error_msg)."""
    try:
        # Handle equations (lhs = rhs)
        if "=" in latex_str:
            parts = latex_str.split("=", 1)
            lhs = parse_latex(parts[0].strip())
            rhs = parse_latex(parts[1].strip())
            return Eq(lhs, rhs), None
        expr = parse_latex(latex_str.strip())
        return expr, None
    except Exception as e:
        return None, str(e)


def exprs_equivalent(expr1, expr2) -> bool:
    """Check if two sympy expressions are algebraically equivalent."""
    try:
        if isinstance(expr1, Eq) and isinstance(expr2, Eq):
            # For equations: check if lhs-rhs are equivalent
            diff = simplify(
                (expr1.lhs - expr1.rhs) - (expr2.lhs - expr2.rhs)
            )
            return diff == 0
        diff = simplify(expr1 - expr2)
        return diff == 0
    except Exception:
        return False


@app.post("/verify", response_model=VerifyResponse)
async def verify_steps(req: VerifyRequest):
    """
    Verify each step in a student's algebra work.
    Returns the first step index where the math breaks down.
    """
    if not req.steps:
        raise HTTPException(status_code=400, detail="No steps provided")

    results = []
    first_error_index = None
    prev_expr = None

    # Parse the problem statement
    problem_expr, problem_err = safe_parse(req.problem)

    for step in sorted(req.steps, key=lambda s: s.index):
        expr, err = safe_parse(step.latex)
        if err or expr is None:
            results.append({
                "index": step.index,
                "latex": step.latex,
                "isCorrect": False,
                "error": f"Could not parse: {err}",
            })
            if first_error_index is None:
                first_error_index = step.index
            prev_expr = None
            continue

        if prev_expr is not None:
            # Check algebraic equivalence with previous step
            is_equiv = exprs_equivalent(prev_expr, expr)
            results.append({
                "index": step.index,
                "latex": step.latex,
                "isCorrect": is_equiv,
                "error": None if is_equiv else "Not equivalent to previous step",
            })
            if not is_equiv and first_error_index is None:
                first_error_index = step.index
        else:
            # First step: check against original problem if possible
            if problem_expr is not None:
                is_equiv = exprs_equivalent(problem_expr, expr)
            else:
                is_equiv = True  # can't verify, assume correct
            results.append({
                "index": step.index,
                "latex": step.latex,
                "isCorrect": is_equiv,
                "error": None,
            })
            if not is_equiv and first_error_index is None:
                first_error_index = step.index

        prev_expr = expr if (first_error_index is None or first_error_index == step.index) else prev_expr

    # Final answer correctness: last step must have no errors and be parseable
    final_correct = (
        bool(results)
        and results[-1].get("isCorrect", False) is True
        and first_error_index is None
    )

    return VerifyResponse(
        steps=results,
        firstErrorIndex=first_error_index,
        finalAnswerCorrect=final_correct,
    )


@app.post("/check", response_model=CheckResponse)
async def check_equivalence(req: CheckRequest):
    """Check if two LaTeX expressions are algebraically equivalent."""
    expr1, err1 = safe_parse(req.expr1)
    expr2, err2 = safe_parse(req.expr2)

    if err1:
        return CheckResponse(equivalent=False, error=f"expr1 parse error: {err1}")
    if err2:
        return CheckResponse(equivalent=False, error=f"expr2 parse error: {err2}")

    equiv = exprs_equivalent(expr1, expr2)
    return CheckResponse(equivalent=equiv)


@app.get("/health")
async def health():
    return {"status": "ok"}
