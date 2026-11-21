"""Validate report CronJob contracts and the demo manifest. Requires PyYAML."""

import copy
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]


def load_yaml(path: str) -> dict:
    return yaml.safe_load((ROOT / path).read_text(encoding="utf-8"))


def report_container(resource: dict) -> dict:
    return resource["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]


class ReportCronJobManifestTest(unittest.TestCase):
    def setUp(self) -> None:
        self.production = load_yaml("k8s/base/report-cronjob.yaml")

    def test_production_schedule_and_job_contract(self) -> None:
        resource = self.production
        self.assertEqual((resource["apiVersion"], resource["kind"]), ("batch/v1", "CronJob"))
        self.assertEqual(resource["metadata"]["name"], "venue-report-daily")
        self.assertEqual(resource["metadata"]["namespace"], "venue-booking")
        self.assertLessEqual(len(resource["metadata"]["name"]), 52)
        labels = {"app.kubernetes.io/name": "venue-booking", "app.kubernetes.io/component": "report"}
        self.assertEqual(resource["metadata"]["labels"], labels)
        spec = resource["spec"]
        for key, expected in {
            "schedule": "10 0 * * *", "timeZone": "Asia/Shanghai",
            "concurrencyPolicy": "Forbid", "startingDeadlineSeconds": 600,
            "successfulJobsHistoryLimit": 3, "failedJobsHistoryLimit": 2,
        }.items():
            self.assertEqual(spec[key], expected, key)

        job = spec["jobTemplate"]["spec"]
        self.assertEqual(spec["jobTemplate"]["metadata"]["labels"], labels)
        self.assertEqual(job["parallelism"], 1)
        self.assertEqual(job["completions"], 1)
        self.assertEqual(job["backoffLimit"], 1)
        self.assertEqual(job["activeDeadlineSeconds"], 1800)
        pod = job["template"]["spec"]
        self.assertEqual(job["template"]["metadata"]["labels"], labels)
        self.assertEqual(pod["restartPolicy"], "Never")
        self.assertIs(pod["automountServiceAccountToken"], False)
        env = {entry["name"]: entry for entry in report_container(resource)["env"]}
        self.assertEqual(env["REPORT_SOURCE"]["value"], "SCHEDULED")
        self.assertEqual(env["REPORT_WINDOW_MODE"]["value"], "PREVIOUS_DAY")
        self.assertNotIn("REPORT_START_DATE", env)
        self.assertNotIn("REPORT_END_DATE", env)
        self.assertEqual(
            env["REPORT_JOB_ID"]["valueFrom"]["fieldRef"]["fieldPath"],
            "metadata.labels['batch.kubernetes.io/job-name']",
        )

    def test_image_and_database_wiring_match_existing_job(self) -> None:
        cron = report_container(self.production)
        api = load_yaml("k8s/base/api-deployment.yaml")["spec"]["template"]["spec"]["containers"][0]
        manual = load_yaml("k8s/jobs/venue-report-manual.yaml.tpl")["spec"]["template"]["spec"]["containers"][0]
        self.assertEqual(cron["image"], api["image"])
        self.assertEqual(cron["imagePullPolicy"], manual["imagePullPolicy"])
        self.assertEqual(cron["args"], manual["args"])
        self.assertNotIn("command", cron)
        self.assertEqual(cron["resources"], manual["resources"])
        cron_env = {entry["name"]: entry for entry in cron["env"]}
        manual_env = {entry["name"]: entry for entry in manual["env"]}
        for name in ("REPORT_JOB_ID", "SPRING_DATASOURCE_URL", "SPRING_DATASOURCE_USERNAME", "SPRING_DATASOURCE_PASSWORD"):
            self.assertEqual(cron_env[name], manual_env[name], name)

    def test_demo_changes_only_schedule_and_window(self) -> None:
        demo = load_yaml("k8s/demo/report-cronjob.yaml")
        expected = copy.deepcopy(self.production)
        expected["spec"]["schedule"] = "*/2 * * * *"
        for entry in report_container(expected)["env"]:
            if entry["name"] == "REPORT_WINDOW_MODE":
                entry["value"] = "TODAY"
        self.assertEqual(demo, expected)


if __name__ == "__main__":
    unittest.main()
