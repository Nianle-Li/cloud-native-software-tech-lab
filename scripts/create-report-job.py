#!/usr/bin/env python3
"""Render and create one manual report Job without embedding credentials."""

import argparse
import datetime as dt
from pathlib import Path
import re
import secrets
import subprocess


JOB_ID = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
IMAGE = re.compile(r"^[a-zA-Z0-9_./:@-]+$")
TEMPLATE = Path(__file__).resolve().parents[1] / "k8s/jobs/venue-report-manual.yaml.tpl"


def date(value: str) -> str:
    try:
        parsed = dt.date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("日期必须为 YYYY-MM-DD") from exc
    if parsed.isoformat() != value:
        raise argparse.ArgumentTypeError("日期必须为 YYYY-MM-DD")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="创建一次性场地报告 Job")
    parser.add_argument("start_date", type=date)
    parser.add_argument("end_date", type=date)
    parser.add_argument("--image", required=True, help="与当前 API Deployment 相同的镜像标签或摘要")
    parser.add_argument("--namespace", default="venue-booking")
    parser.add_argument("--name", help="重试时可复用先前的 Job 名称")
    parser.add_argument("--dry-run", action="store_true", help="只输出生成的清单")
    args = parser.parse_args()

    if args.start_date > args.end_date:
        parser.error("start_date 不能晚于 end_date")
    name = args.name or ("venue-report-manual-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
                         + "-" + secrets.token_hex(3))
    if not JOB_ID.fullmatch(name):
        parser.error("Job 名称必须符合报告 job_id 格式")
    if not JOB_ID.fullmatch(args.namespace):
        parser.error("命名空间必须是小写 DNS 名称")
    if not IMAGE.fullmatch(args.image):
        parser.error("镜像名称包含不支持的字符")

    manifest = TEMPLATE.read_text(encoding="utf-8")
    for marker, value in {
        "__JOB_NAME__": name,
        "__NAMESPACE__": args.namespace,
        "__API_IMAGE__": args.image,
        "__START_DATE__": args.start_date,
        "__END_DATE__": args.end_date,
    }.items():
        manifest = manifest.replace(marker, value)

    if args.dry_run:
        print(manifest, end="")
    else:
        subprocess.run(["kubectl", "-n", args.namespace, "apply", "-f", "-"],
                       input=manifest, text=True, check=True)
        print("job_id=" + name)


if __name__ == "__main__":
    main()
