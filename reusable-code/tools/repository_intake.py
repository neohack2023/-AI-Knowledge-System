#!/usr/bin/env python3
"""CODE-REUSE-02: bounded, read-only repository intake.

Binds intake to an exact local Git HEAD, inventories tracked files, resolves
license evidence, and emits registry-ready metadata. Repository source is never
executed. Python candidate extraction uses stdlib AST before any semantic layer.
"""

from __future__ import annotations

import argparse
import ast
import fnmatch
import hashlib
import json
import os
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

RECEIPT_SCHEMA = "repository-intake-receipt/v0.1"
CANDIDATE_SCHEMA = "code-candidate-record/v0.1"
DEFAULT_EXCLUDES = (
    ".git/**", "node_modules/**", "vendor/**", "dist/**", "build/**", "target/**",
    ".next/**", ".cache/**", "__pycache__/**", "*.min.js", "*.min.css", "*.pyc",
    "*.pyo", "*.sqlite*", ".env*", "**/.env*",
)
MANIFESTS = {
    "package.json", "package-lock.json", "pyproject.toml", "requirements.txt", "poetry.lock",
    "Pipfile", "Pipfile.lock", "Cargo.toml", "Cargo.lock", "go.mod", "go.sum", "Gemfile",
    "Gemfile.lock", "pom.xml", "build.gradle", "build.gradle.kts", "Package.swift",
}
LANGUAGE = {
    ".py": "Python", ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".jsx": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript", ".rs": "Rust",
    ".go": "Go", ".java": "Java", ".kt": "Kotlin", ".kts": "Kotlin", ".swift": "Swift",
    ".c": "C", ".h": "C", ".cc": "C++", ".cpp": "C++", ".cxx": "C++", ".hpp": "C++",
    ".cs": "C#", ".php": "PHP", ".rb": "Ruby", ".lua": "Lua", ".sh": "Shell",
    ".bash": "Shell", ".wgsl": "WGSL", ".glsl": "GLSL", ".vert": "GLSL", ".frag": "GLSL",
}
BINARY_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar",
    ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".wav", ".mp4", ".mov", ".wasm",
    ".bin", ".exe", ".dll", ".so", ".dylib",
}
KNOWN_LICENSE_IDS = {"MIT", "Apache-2.0", "AGPL-3.0", "GPL-3.0", "MPL-2.0"}
LICENSE_PATTERNS = (
    ("MIT", re.compile(r"permission is hereby granted, free of charge", re.I)),
    ("Apache-2.0", re.compile(r"apache license\s+version\s+2\.0", re.I)),
    ("AGPL-3.0", re.compile(r"gnu affero general public license.*version 3", re.I | re.S)),
    ("GPL-3.0", re.compile(r"gnu general public license.*version 3", re.I | re.S)),
    ("MPL-2.0", re.compile(r"mozilla public license.*version 2\.0", re.I | re.S)),
)
RISK_IMPORTS = {"subprocess": "HIGH", "socket": "HIGH", "ctypes": "HIGH", "paramiko": "HIGH",
                "requests": "MEDIUM", "httpx": "MEDIUM", "urllib": "MEDIUM", "multiprocessing": "MEDIUM"}
RISK_ORDER = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
MAX_SOURCE_BYTES = 512_000


class IntakeError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def git(root: Path, *args: str) -> str:
    try:
        run = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True,
                             check=False, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise IntakeError("SOURCE_UNRESOLVED", f"git unavailable: {exc}") from exc
    if run.returncode:
        raise IntakeError("SOURCE_UNRESOLVED", (run.stderr or run.stdout).strip() or "git failed")
    return run.stdout.strip()


def normalize_repo_url(value: str) -> str:
    value = value.strip().rstrip("/")
    if value.endswith(".git"):
        value = value[:-4]
    ssh_prefix = "git" + "@github.com:"
    if value.startswith(ssh_prefix):
        value = "https://github.com/" + value.split(":", 1)[1]
    return value


def repo_slug(url: str) -> str:
    parsed = urlparse(normalize_repo_url(url))
    return parsed.path.strip("/") if parsed.scheme and parsed.netloc else normalize_repo_url(url)


def tracked_files(root: Path) -> list[str]:
    output = git(root, "ls-files", "-z")
    return sorted(item for item in output.split("\x00") if item)


def excluded(path: str, patterns: tuple[str, ...]) -> bool:
    normalized = path.replace(os.sep, "/")
    return Path(path).suffix.lower() in BINARY_SUFFIXES or any(fnmatch.fnmatch(normalized, p) for p in patterns)


def language_for(path: str) -> str | None:
    return LANGUAGE.get(Path(path).suffix.lower())


def safe_repo_file(root: Path, relative: str) -> Path | None:
    path = root / relative
    try:
        if path.is_symlink():
            return None
        resolved = path.resolve()
        resolved.relative_to(root.resolve())
        return resolved if resolved.is_file() else None
    except (OSError, ValueError):
        return None


def read_small(root: Path, relative: str, limit: int = 256_000) -> str | None:
    path = safe_repo_file(root, relative)
    if path is None:
        return None
    try:
        return None if path.stat().st_size > limit else path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def manifest_dependency_hints(root: Path, manifests: list[str]) -> list[dict[str, str]]:
    hints: list[dict[str, str]] = []
    for relative in manifests:
        name = Path(relative).name
        text = read_small(root, relative)
        if not text:
            continue
        if name == "package.json":
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                continue
            for field in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
                values = parsed.get(field)
                if isinstance(values, dict):
                    for dependency, constraint in sorted(values.items()):
                        if isinstance(constraint, str):
                            hints.append({"source": relative, "kind": field, "dependency": dependency, "constraint": constraint})
        elif name == "requirements.txt":
            for raw in text.splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or line.startswith(("-r", "--requirement", "-e", "--editable")):
                    continue
                dependency = re.split(r"[<>=!~ ;\[]", line, maxsplit=1)[0].strip()
                if dependency:
                    hints.append({"source": relative, "kind": "requirement", "dependency": dependency, "constraint": line})
    return hints


def detect_license(root: Path, paths: list[str], manifests: list[str]) -> dict[str, Any]:
    ids: list[str] = []
    evidence: list[str] = []
    for relative in paths:
        name = Path(relative).name.lower()
        if len(Path(relative).parts) > 2 or not (name.startswith("license") or name in {"copying", "notice"}):
            continue
        text = read_small(root, relative)
        if not text:
            continue
        evidence.append(relative)
        for spdx, pattern in LICENSE_PATTERNS:
            if pattern.search(text):
                ids.append(spdx)
                break
    for relative in manifests:
        if Path(relative).name != "package.json":
            continue
        text = read_small(root, relative)
        if not text:
            continue
        try:
            value = json.loads(text).get("license")
        except json.JSONDecodeError:
            value = None
        if isinstance(value, str) and value.strip():
            declared = value.strip()
            evidence.append(relative + "#license")
            if declared in KNOWN_LICENSE_IDS:
                ids.append(declared)
    unique = sorted(set(ids))
    state = "PASS" if len(unique) == 1 else "REVIEW" if unique else "BLOCKED"
    return {"state": state, "spdx": unique[0] if len(unique) == 1 else None,
            "evidence": sorted(set(evidence)), "attribution_required": state == "PASS"}


def python_imports(tree: ast.AST) -> list[str]:
    values: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            values.update(alias.name.split(".", 1)[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            values.add(node.module.split(".", 1)[0])
    return sorted(values)


def risk_for(imports: list[str]) -> str:
    result = "LOW"
    for name in imports:
        proposed = RISK_IMPORTS.get(name)
        if proposed and RISK_ORDER[proposed] > RISK_ORDER[result]:
            result = proposed
    return result


def public_api(node: ast.AST) -> str:
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        prefix = "async " if isinstance(node, ast.AsyncFunctionDef) else ""
        try:
            args = ast.unparse(node.args)
        except Exception:
            args = "..."
        return f"{prefix}{node.name}({args})"
    if isinstance(node, ast.ClassDef):
        bases = []
        for base in node.bases:
            try:
                bases.append(ast.unparse(base))
            except Exception:
                pass
        return f"class {node.name}" + (f"({', '.join(bases)})" if bases else "")
    return "UNKNOWN"


def portability(chunk_type: str, imports: list[str], risk: str, problem: str) -> int:
    score = 4 + (2 if chunk_type in {"function", "class"} else 0)
    score += 2 if len(imports) <= 2 else -1 if len(imports) >= 6 else 0
    score += 1 if risk == "LOW" else -2 if risk == "HIGH" else 0
    score += 1 if problem != "UNRESOLVED" else 0
    return max(0, min(10, score))


def python_candidates(root: Path, relative: str, repository_url: str, revision: str, scope_id: str,
                      license_info: dict[str, Any], retrieved_at: str) -> tuple[list[dict[str, Any]], list[str]]:
    path = safe_repo_file(root, relative)
    if path is None:
        return [], [f"PARSE_PARTIAL:{relative}:UNSAFE_PATH"]
    try:
        if path.stat().st_size > MAX_SOURCE_BYTES:
            return [], [f"PARSE_PARTIAL:{relative}:SOURCE_FILE_TOO_LARGE"]
        text = path.read_text(encoding="utf-8")
        tree = ast.parse(text, filename=relative)
    except (OSError, UnicodeError, SyntaxError) as exc:
        return [], [f"PARSE_PARTIAL:{relative}:{type(exc).__name__}"]
    imports = python_imports(tree)
    risk = risk_for(imports)
    records = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) or node.name.startswith("_"):
            continue
        start = int(getattr(node, "lineno", 1) or 1)
        end = int(getattr(node, "end_lineno", start) or start)
        chunk_type = "class" if isinstance(node, ast.ClassDef) else "function"
        material = f"{revision}\0{relative}\0{node.name}\0{start}\0{end}"
        problem = (ast.get_docstring(node, clean=True) or "UNRESOLVED").splitlines()[0][:240]
        base = normalize_repo_url(repository_url)
        records.append({
            "schema_version": CANDIDATE_SCHEMA,
            "chunk_id": "INTAKE-" + hashlib.sha256(material.encode()).hexdigest()[:16].upper(),
            "candidate_digest": None,
            "title": node.name,
            "status": "CANDIDATE",
            "source_type": "repository",
            "source_url": f"{base}/blob/{revision}/{relative}#L{start}-L{end}",
            "source_repo_project": repo_slug(repository_url),
            "source_revision": revision,
            "language": "Python",
            "runtime": "Python >=3.10",
            "framework": "None",
            "chunk_type": chunk_type,
            "use_domain": "repository-intake",
            "problem_solved": problem,
            "public_api": public_api(node),
            "dependencies": imports,
            "license_spdx": license_info.get("spdx"),
            "attribution_required": bool(license_info.get("attribution_required")),
            "license_gate": license_info["state"],
            "security_risk": risk,
            "portability_score": portability(chunk_type, imports, risk, problem),
            "validation_status": "UNVALIDATED",
            "validation_receipt_ref": None,
            "cross_project_reuse": "NO",
            "freshness": "CURRENT",
            "project_scope": scope_id,
            "tags": ["repository-intake", "python", chunk_type, "generalized-parser"],
            "known_limits_suppress_when": ["Python AST top-level boundary only in v0.1.",
                                            "No transitive dependency resolution is performed."],
            "source_evidence": {"path": relative, "symbol": node.name, "start_line": start,
                                "end_line": end, "extractor_class": "GENERALIZED_PARSER"},
            "code_store_pointer": None,
            "last_reviewed": retrieved_at,
            "notes": ["Metadata only; source bytes are not copied into the registry record.",
                      "CODE-REUSE-02 cannot emit VERIFIED or REUSABLE."],
        })
    return records, []


def failure(repository_url: str, revision: str, retrieved_at: str, code: str, message: str) -> dict[str, Any]:
    digest = hashlib.sha256(f"{repository_url}\0{revision}\0{code}".encode()).hexdigest()[:12].upper()
    return {"receipt": {"schema_version": RECEIPT_SCHEMA, "run_id": "CRI-INTAKE-FAILED-" + digest,
                        "repository_url": normalize_repo_url(repository_url), "resolved_revision": None,
                        "retrieved_at": retrieved_at, "license_state": "BLOCKED", "license_spdx": None,
                        "license_evidence": [], "repository_languages": [], "manifest_files": [],
                        "candidate_count": 0, "excluded_count": 0, "warnings": [f"{code}:{message}"],
                        "failure_state": code, "status": "FAILED", "write_authorization": "NONE"},
            "candidates": []}


def intake(*, root: Path, repository_url: str, revision: str, branch: str | None, scope_id: str,
           max_files: int, max_candidates: int, allowlist: set[str] | None,
           excludes: tuple[str, ...], retrieved_at: str) -> dict[str, Any]:
    root = root.resolve()
    if not root.is_dir():
        raise IntakeError("SOURCE_UNRESOLVED", f"repo root does not exist: {root}")
    claimed_url = normalize_repo_url(repository_url)
    origin_url = normalize_repo_url(git(root, "config", "--get", "remote.origin.url"))
    if origin_url != claimed_url:
        raise IntakeError("SOURCE_UNRESOLVED", f"claimed repository {claimed_url} does not match origin {origin_url}")
    actual = git(root, "rev-parse", "HEAD")
    if actual != revision:
        raise IntakeError("REVISION_UNRESOLVED", f"requested {revision} but local HEAD is {actual}")
    tracked_drift = git(root, "status", "--porcelain", "--untracked-files=no")
    if tracked_drift:
        raise IntakeError("SOURCE_DRIFT", "tracked working-tree state differs from the pinned HEAD")
    paths = tracked_files(root)
    if len(paths) > max_files:
        raise IntakeError("SOURCE_TOO_LARGE", f"{len(paths)} tracked files exceeds max_files={max_files}")

    manifests = sorted(path for path in paths if Path(path).name in MANIFESTS)
    license_info = detect_license(root, paths, manifests)
    dependency_hints = manifest_dependency_hints(root, manifests)
    counts: Counter[str] = Counter()
    candidates: list[dict[str, Any]] = []
    warnings: list[str] = []
    unsupported: set[str] = set()
    excluded_count = 0

    for relative in paths:
        lang = language_for(relative)
        if lang:
            counts[lang] += 1
        if excluded(relative, excludes):
            excluded_count += 1
            continue
        if not lang or (allowlist and lang.lower() not in allowlist):
            continue
        if lang == "Python":
            found, local = python_candidates(root, relative, repository_url, actual, scope_id, license_info, retrieved_at)
            candidates.extend(found)
            warnings.extend(local)
        else:
            unsupported.add(lang)
        if len(candidates) >= max_candidates:
            candidates = candidates[:max_candidates]
            warnings.append(f"CANDIDATE_LIMIT_REACHED:{max_candidates}")
            break
    warnings.extend(f"STRUCTURAL_EXTRACTOR_UNAVAILABLE:{lang}" for lang in sorted(unsupported))

    logical = {"repository_url": normalize_repo_url(repository_url), "resolved_revision": actual,
               "branch": branch, "scope_id": scope_id, "license_state": license_info["state"],
               "license_spdx": license_info.get("spdx"), "manifest_files": manifests,
               "candidate_ids": [item["chunk_id"] for item in candidates]}
    run_digest = hashlib.sha256(json.dumps(logical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    receipt = {
        "schema_version": RECEIPT_SCHEMA,
        "run_id": "CRI-INTAKE-" + run_digest[:16].upper(),
        "repository_url": normalize_repo_url(repository_url),
        "resolved_revision": actual,
        "branch": branch,
        "retrieved_at": retrieved_at,
        "license_state": license_info["state"],
        "license_spdx": license_info.get("spdx"),
        "license_evidence": license_info["evidence"],
        "repository_languages": [{"language": lang, "file_count": count} for lang, count in sorted(counts.items())],
        "manifest_files": manifests,
        "dependency_hints": dependency_hints,
        "candidate_count": len(candidates),
        "excluded_count": excluded_count,
        "warnings": sorted(set(warnings)),
        "failure_state": None,
        "status": "PARTIAL" if warnings else "COMPLETE",
        "extractor_counts": dict(Counter(item["source_evidence"]["extractor_class"] for item in candidates)),
        "write_authorization": "NONE",
    }
    return {"receipt": receipt, "candidates": candidates}


def parse_allowlist(values: list[str]) -> set[str] | None:
    items = {item.strip().lower() for value in values for item in value.split(",") if item.strip()}
    return items or None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--repository-url", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--branch")
    parser.add_argument("--scope-id", default="global-working-memory")
    parser.add_argument("--max-files", type=int, default=500)
    parser.add_argument("--max-candidates", type=int, default=100)
    parser.add_argument("--language-allowlist", action="append", default=[])
    parser.add_argument("--exclude-path", action="append", default=[])
    parser.add_argument("--retrieved-at")
    parser.add_argument("--out")
    args = parser.parse_args()
    retrieved_at = args.retrieved_at or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    try:
        if args.max_files <= 0 or args.max_candidates <= 0:
            raise IntakeError("POLICY_BLOCKED", "max_files and max_candidates must be positive")
        payload = intake(root=Path(args.repo_root), repository_url=args.repository_url, revision=args.revision,
                         branch=args.branch, scope_id=args.scope_id, max_files=args.max_files,
                         max_candidates=args.max_candidates, allowlist=parse_allowlist(args.language_allowlist),
                         excludes=tuple(DEFAULT_EXCLUDES) + tuple(args.exclude_path), retrieved_at=retrieved_at)
        code = 0
    except IntakeError as exc:
        payload = failure(args.repository_url, args.revision, retrieved_at, exc.code, str(exc))
        code = 2
    rendered = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    if args.out:
        Path(args.out).write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
