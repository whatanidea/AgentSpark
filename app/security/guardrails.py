"""
Input guardrails for AgentSense.

An agent that advises enterprises on safe agentic adoption must itself be hardened.
Every user message entering the Diagnostic Agent is screened for:
  - prompt-injection / jailbreak attempts (instruction override, role hijack)
  - PII leakage (emails, phone numbers, card/SSN-like numbers)

Findings are surfaced in the agent trace and the validation report, so the
"audit trail" and "governance" claims are backed by real, observable behaviour.
This is intentionally lightweight and dependency-free (regex + heuristics) so it
runs in the request path with negligible latency.
"""
import re

from app.utils.models import GuardrailResult, GuardrailFlag

# Phrases that signal an attempt to override the system prompt or hijack the role.
_INJECTION_PATTERNS = [
    r"ignore (all|any|the|your)? ?(previous|prior|above) (instructions|prompts?|rules)",
    r"disregard (the|all|your)? ?(previous|above|system)",
    r"forget (everything|all|your) (instructions|context|rules)",
    r"you are now\b", r"\bact as\b", r"\bpretend to be\b", r"\bnew (instructions|persona)\b",
    r"system prompt", r"\bdeveloper mode\b", r"\bdo anything now\b|\bDAN\b",
    r"reveal (your|the) (system )?prompt", r"print (your|the) (system )?(prompt|instructions)",
    r"</?(system|assistant|user)>",  # fake role tags
    r"override (the|your) (safety|guardrails?|rules)",
]

_PII_PATTERNS = {
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
    "phone": r"\b(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)\d{3}[\s-]?\d{4}\b",
    "credit_card": r"\b(?:\d[ -]?){13,16}\b",
    "ssn_like": r"\b\d{3}-\d{2}-\d{4}\b",
}


def scan_input(text: str) -> GuardrailResult:
    text = text or ""
    flags = []

    for pat in _INJECTION_PATTERNS:
        if re.search(pat, text, flags=re.IGNORECASE):
            flags.append(GuardrailFlag(
                type="injection", severity="high",
                detail=f"Possible prompt-injection / instruction-override pattern detected.",
            ))
            break  # one high-severity injection flag is enough

    for label, pat in _PII_PATTERNS.items():
        if re.search(pat, text):
            flags.append(GuardrailFlag(
                type="pii", severity="medium",
                detail=f"Possible {label.replace('_', ' ')} in input — recommend redaction before storage.",
            ))

    safe = not any(f.severity == "high" for f in flags)
    if not flags:
        summary = "Clean — no injection or PII patterns detected."
    else:
        summary = ", ".join(f"{f.type}({f.severity})" for f in flags)

    return GuardrailResult(safe=safe, flags=flags, summary=summary)


def redact_pii(text: str) -> str:
    """Mask PII so it is never persisted or echoed back verbatim."""
    text = text or ""
    for label, pat in _PII_PATTERNS.items():
        text = re.sub(pat, f"[REDACTED-{label}]", text)
    return text
