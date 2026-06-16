"""
Generates backend/errors/error_codes.py and frontend/src/errors/errorCodes.ts
from the single source of truth: error_codes.json (project root).

Run this whenever error_codes.json changes:
    python scripts/generate_error_codes.py

Both generated files start with an AUTO-GENERATED warning — edit the JSON,
never the generated files directly, or backend/frontend will drift apart
again, defeating the entire point of this script.
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
SOURCE = ROOT / "error_codes.json"
PYTHON_OUT = ROOT / "backend" / "errors" / "error_codes.py"
TS_OUT = ROOT / "frontend" / "src" / "errors" / "errorCodes.ts"

WARNING = "AUTO-GENERATED from error_codes.json by scripts/generate_error_codes.py — do not edit directly."


def generate_python(codes: dict) -> str:
    lines = [
        f"# {WARNING}",
        "from enum import Enum",
        "",
        "",
        "class ErrorCode(str, Enum):",
    ]
    for code in codes:
        lines.append(f'    {code} = "{code}"')
    lines += ["", "", "ERROR_DEFAULTS = {"]
    for code, meta in codes.items():
        message = meta["message"].replace('"', '\\"')
        lines.append(f'    ErrorCode.{code}: {{"message": "{message}", "http_status": {meta["http_status"]}}},')
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def generate_typescript(codes: dict) -> str:
    lines = [
        f"// {WARNING}",
        "",
        "export const ErrorCode = {",
    ]
    for code in codes:
        lines.append(f'  {code}: "{code}",')
    lines += ["} as const;", "", "export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];", ""]
    lines += [
        "export interface ErrorDefault {",
        "  message: string;",
        "  httpStatus: number;",
        "}",
        "",
        "export const ERROR_DEFAULTS: Record<ErrorCodeValue, ErrorDefault> = {",
    ]
    for code, meta in codes.items():
        message = meta["message"].replace('"', '\\"')
        lines.append(f'  {code}: {{ message: "{message}", httpStatus: {meta["http_status"]} }},')
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main():
    codes = json.loads(SOURCE.read_text())

    PYTHON_OUT.parent.mkdir(parents=True, exist_ok=True)
    TS_OUT.parent.mkdir(parents=True, exist_ok=True)

    PYTHON_OUT.write_text(generate_python(codes), encoding="utf-8")
    TS_OUT.write_text(generate_typescript(codes), encoding="utf-8")

    print(f"Generated {PYTHON_OUT.relative_to(ROOT)} ({len(codes)} codes)")
    print(f"Generated {TS_OUT.relative_to(ROOT)} ({len(codes)} codes)")


if __name__ == "__main__":
    main()
