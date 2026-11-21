#!/usr/bin/env python3
"""Verify the final display data and its Kubernetes workloads in one namespace."""

import argparse
import json
import subprocess
import sys
import urllib.request


NAMES = ["羽毛球馆 A", "多功能教室 B", "会议室 C", "排练室 D", "小型会议室 E"]
MANUAL = [(2, 150), (1, 120), (0, 0), (2, 150), (0, 0)]
SCHEDULED = [(0, 0), (0, 0), (0, 0), (0, 0), (1, 60)]


def require(ok: bool, message: str) -> None:
    if not ok:
        raise RuntimeError(message)


def http_json(base_url: str, path: str):
    with urllib.request.urlopen(base_url.rstrip("/") + path, timeout=15) as response:
        return json.load(response)


def kubectl(context: str, namespace: str, *args: str):
    result = subprocess.run(["kubectl", "--context", context, "-n", namespace,
                             *args, "-o", "json"], text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def report(base_url: str, job_id: str, source: str, expected: list[tuple[int, int]],
           venues: list[dict]) -> dict:
    data = http_json(base_url, "/api/reports/" + job_id)
    require(data["job_id"] == job_id, f"{job_id}: 报告 ID 不一致")
    require(data["source"] == source and data["status"] == "SUCCEEDED",
            f"{job_id}: 来源或状态不一致")
    actual = [(item["reservation_count"], item["reserved_minutes"]) for item in data["items"]]
    require([item["venue_id"] for item in data["items"]] == [v["id"] for v in venues],
            f"{job_id}: 报告场地 ID 与页面场地不一致")
    require([item["venue_name"] for item in data["items"]] == NAMES,
            f"{job_id}: 报告名称含旧测试数据")
    require(actual == expected, f"{job_id}: 报告统计不一致：{actual}")
    require(data["start_date"] == data["end_date"], f"{job_id}: 日期范围不一致")
    return data


def require_completed_job(job: dict, job_id: str, cron_parent: bool) -> None:
    status = job.get("status", {})
    complete = any(condition.get("type") == "Complete" and condition.get("status") == "True"
                   for condition in status.get("conditions", []))
    require(job["spec"].get("completions", 1) == 1 and status.get("succeeded") == 1 and complete,
            f"{job_id}: Kubernetes Job 尚未 Complete")
    owners = job["metadata"].get("ownerReferences", [])
    has_cron_parent = any(owner.get("kind") == "CronJob"
                          and owner.get("name") == "venue-report-daily" for owner in owners)
    require(has_cron_parent == cron_parent,
            f"{job_id}: {'缺少' if cron_parent else '不应具有'} venue-report-daily 父资源")


def require_formal_cronjob(cron: dict) -> None:
    spec = cron["spec"]
    env = spec["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]["env"]
    mode = next((entry.get("value") for entry in env if entry["name"] == "REPORT_WINDOW_MODE"), None)
    require(spec["schedule"] == "10 0 * * *"
            and spec.get("timeZone") == "Asia/Shanghai"
            and spec.get("concurrencyPolicy") == "Forbid"
            and mode == "PREVIOUS_DAY", "CronJob 尚未恢复正式每日配置")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--context", default="kind-venue-lab2")
    parser.add_argument("--namespace", default="venue-booking-final")
    parser.add_argument("--manual-job", required=True)
    parser.add_argument("--scheduled-jobs", nargs=2, required=True, metavar=("JOB1", "JOB2"))
    args = parser.parse_args()
    require(len(set([args.manual_job, *args.scheduled_jobs])) == 3, "三个 Job ID 必须各不相同")

    pod_names = {pod["metadata"]["name"] for pod in
                 kubectl(args.context, args.namespace, "get", "pods", "-l",
                         "app.kubernetes.io/component=api")["items"]}
    instance = http_json(args.base_url, "/api/instance")["instance_id"]
    require(instance in pod_names, "前端端口转发未连接到指定命名空间的 API")
    venues = http_json(args.base_url, "/api/venues")
    reservations = http_json(args.base_url, "/api/reservations")
    require([v["name"] for v in venues] == NAMES, "场地列表包含缺失项或旧测试名称")
    require(len(reservations) == 7, "预约列表不是七条")
    active = [item for item in reservations if item["status"] == "ACTIVE"]
    cancelled = [item for item in reservations if item["status"] == "CANCELLED"]
    require(len(active) == 6 and len(cancelled) == 1, "预约状态分布不一致")
    manual_dates = {item["reservation_date"] for item in active
                    if item["venue_id"] != venues[4]["id"]}
    scheduled_dates = {item["reservation_date"] for item in active
                       if item["venue_id"] == venues[4]["id"]}
    require(len(manual_dates) == 1 and len(scheduled_dates) == 1,
            "展示预约的日期分布不一致")
    require(cancelled[0]["reservation_date"] in manual_dates,
            "取消预约不在一次性报告的统计日期")

    manual = report(args.base_url, args.manual_job, "MANUAL", MANUAL, venues)
    scheduled = [report(args.base_url, job, "SCHEDULED", SCHEDULED, venues)
                 for job in args.scheduled_jobs]
    require(manual["start_date"] in manual_dates,
            "一次性报告日期与实际预约日期不一致")
    require(scheduled[0]["start_date"] in scheduled_dates,
            "定时报告日期与实际预约日期不一致")
    require(all(item["start_date"] == scheduled[0]["start_date"] for item in scheduled),
            "两次定时报告不是同一天")
    require(manual["start_date"] != scheduled[0]["start_date"], "手动和定时样例日期混淆")
    require_completed_job(kubectl(args.context, args.namespace, "get", "job", args.manual_job),
                          args.manual_job, cron_parent=False)
    for job_id in args.scheduled_jobs:
        job = kubectl(args.context, args.namespace, "get", "job", job_id)
        require_completed_job(job, job_id, cron_parent=True)

    require_formal_cronjob(kubectl(args.context, args.namespace, "get", "cronjob", "venue-report-daily"))
    for workload in ("deployment/api", "deployment/frontend", "statefulset/database"):
        resource = kubectl(args.context, args.namespace, "get", workload)
        require(resource["status"].get("readyReplicas") == resource["spec"]["replicas"],
                f"{workload}: 副本未全部就绪")
        expected_image = {
            "deployment/api": "venue-booking-api:lab2-20261113",
            "deployment/frontend": "venue-booking-frontend:lab2-report-query-02",
            "statefulset/database": "postgres:16.15-bookworm",
        }[workload]
        actual_image = resource["spec"]["template"]["spec"]["containers"][0]["image"]
        require(actual_image == expected_image, f"{workload}: 镜像标签不匹配：{actual_image}")
    pvc = kubectl(args.context, args.namespace, "get", "pvc", "postgres-data-database-0")
    require(pvc["status"]["phase"] == "Bound", "数据库 PVC 未绑定")

    ds = kubectl(args.context, args.namespace, "get", "daemonset", "node-check")
    require(ds["status"]["desiredNumberScheduled"] == 2 and ds["status"]["numberReady"] == 2,
            "DaemonSet 未在两个 worker 上全部就绪")
    require(ds["spec"]["template"]["spec"]["containers"][0]["image"] ==
            "venue-booking-node-check:lab2-20261116-01", "DaemonSet 镜像标签不匹配")
    pods = kubectl(args.context, args.namespace, "get", "pods", "-l",
                   "app.kubernetes.io/component=node-check")["items"]
    require(len(pods) == 2 and len({pod["spec"]["nodeName"] for pod in pods}) == 2,
            "DaemonSet Pod 未分布在两个不同节点")
    for pod in pods:
        name = pod["metadata"]["name"]
        logs = subprocess.run(["kubectl", "--context", args.context, "-n", args.namespace,
                               "logs", "pod/" + name, "--tail=20"],
                              text=True, capture_output=True, check=True).stdout
        require("dns=ok target=kubernetes.default.svc.cluster.local" in logs,
                f"{name}: 日志中没有成功的集群 DNS 检查")

    print(json.dumps({"result": "PASS", "namespace": args.namespace,
                      "venues": len(venues), "reservations": len(reservations),
                      "manual_job": args.manual_job, "scheduled_jobs": args.scheduled_jobs,
                      "daemonset_ready": ds["status"]["numberReady"]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError, RuntimeError) as exc:
        print(f"最终展示核对失败：{exc}", file=sys.stderr)
        sys.exit(1)
