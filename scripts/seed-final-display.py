#!/usr/bin/env python3
"""Create a small, readable booking example in a fresh Lab 2 namespace."""

import argparse
import datetime as dt
import json
import subprocess
import sys
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo


EXPECTED_SEED = ["羽毛球馆 A", "多功能教室 B", "会议室 C"]
SHANGHAI = ZoneInfo("Asia/Shanghai")


def request(base_url: str, method: str, path: str, body: dict | None = None):
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json"} if body is not None else {}
    target = base_url.rstrip("/") + path
    req = urllib.request.Request(target, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path}: HTTP {exc.code}: {detail}") from exc


def booking(venue_id: int, booked_by: str, day: dt.date, start: str,
            end: str, attendees: int, purpose: str) -> dict:
    return {
        "venue_id": venue_id,
        "booked_by": booked_by,
        "reservation_date": day.isoformat(),
        "start_time": start,
        "end_time": end,
        "attendee_count": attendees,
        "purpose": purpose,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="为全新 Lab 2 展示环境创建五个可读场地及预约")
    parser.add_argument("--base-url", default="http://127.0.0.1:8080",
                        help="目标环境的前端端口转发地址")
    parser.add_argument("--context", default="kind-venue-lab2")
    parser.add_argument("--namespace", default="venue-booking-final")
    args = parser.parse_args()

    pod_result = subprocess.run(
        ["kubectl", "--context", args.context, "-n", args.namespace,
         "get", "pods", "-l", "app.kubernetes.io/component=api", "-o", "json"],
        text=True, capture_output=True, check=True)
    pod_names = {pod["metadata"]["name"] for pod in json.loads(pod_result.stdout)["items"]}
    instance = request(args.base_url, "GET", "/api/instance")["instance_id"]
    if instance not in pod_names:
        parser.error("前端端口转发未连接到指定命名空间的 API；拒绝写入")

    venues = request(args.base_url, "GET", "/api/venues")
    reservations = request(args.base_url, "GET", "/api/reservations")
    if not isinstance(venues, list) or [v.get("name") for v in venues] != EXPECTED_SEED:
        parser.error("目标环境不是只有三个初始场地的全新数据库；拒绝混入旧测试数据")
    if not isinstance(reservations, list) or reservations:
        parser.error("目标环境已有预约；拒绝重复写入展示数据")

    now = dt.datetime.now(SHANGHAI)
    manual_day = now.date() + dt.timedelta(days=2)
    scheduled_day = now.date() if now.hour < 16 else now.date() + dt.timedelta(days=1)
    ids = {v["name"]: v["id"] for v in venues}

    for name, location, capacity in (
        ("排练室 D", "艺术中心 2 层", 15),
        ("小型会议室 E", "图书馆 3 层", 12),
    ):
        venue = request(args.base_url, "POST", "/api/venues", {
            "name": name, "location": location, "capacity": capacity,
            "open_time": "09:00", "close_time": "18:00", "status": "OPEN",
        })
        ids[name] = venue["id"]

    samples = (
        booking(ids["羽毛球馆 A"], "羽毛球社", manual_day, "09:00", "10:30", 4, "社团训练"),
        booking(ids["羽毛球馆 A"], "学院教职工", manual_day, "18:00", "19:00", 4, "羽毛球活动"),
        booking(ids["多功能教室 B"], "软件工程班", manual_day, "14:00", "16:00", 24, "课程讨论"),
        booking(ids["排练室 D"], "舞蹈社", manual_day, "10:00", "11:00", 10, "节目排练"),
        booking(ids["排练室 D"], "学生会", manual_day, "15:00", "16:30", 8, "活动彩排"),
    )
    created = [request(args.base_url, "POST", "/api/reservations", sample) for sample in samples]
    cancelled = request(args.base_url, "POST", "/api/reservations",
                        booking(ids["羽毛球馆 A"], "羽毛球社", manual_day,
                                "12:00", "13:00", 4, "社团训练"))
    request(args.base_url, "POST", f"/api/reservations/{cancelled['id']}/cancel")
    scheduled = request(args.base_url, "POST", "/api/reservations",
                        booking(ids["小型会议室 E"], "图书馆读书会", scheduled_day,
                                "17:00", "18:00", 8, "读书交流"))

    final_venues = request(args.base_url, "GET", "/api/venues")
    final_reservations = request(args.base_url, "GET", "/api/reservations")
    if [v.get("name") for v in final_venues] != EXPECTED_SEED + ["排练室 D", "小型会议室 E"]:
        raise RuntimeError("写入后的场地列表与预期不一致")
    if len(final_reservations) != 7:
        raise RuntimeError("写入后的预约数量与预期不一致")
    print(json.dumps({
        "manual_report_date": manual_day.isoformat(),
        "scheduled_report_date": scheduled_day.isoformat(),
        "scheduled_demo_can_run_today": scheduled_day == now.date(),
        "venues": ids,
        "active_reservation_ids": [item["id"] for item in created] + [scheduled["id"]],
        "cancelled_reservation_id": cancelled["id"],
        "expected_manual_counts": {
            "羽毛球馆 A": [2, 150], "多功能教室 B": [1, 120],
            "会议室 C": [0, 0], "排练室 D": [2, 150], "小型会议室 E": [0, 0],
        },
        "expected_scheduled_counts": {
            "羽毛球馆 A": [0, 0], "多功能教室 B": [0, 0],
            "会议室 C": [0, 0], "排练室 D": [0, 0], "小型会议室 E": [1, 60],
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"展示数据写入失败：{exc}", file=sys.stderr)
        sys.exit(1)
