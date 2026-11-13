apiVersion: batch/v1
kind: Job
metadata:
  name: __JOB_NAME__
  namespace: __NAMESPACE__
  labels:
    app.kubernetes.io/name: venue-booking
    app.kubernetes.io/component: report
spec:
  parallelism: 1
  completions: 1
  backoffLimit: 1
  activeDeadlineSeconds: 1800
  template:
    metadata:
      labels:
        app.kubernetes.io/name: venue-booking
        app.kubernetes.io/component: report
    spec:
      automountServiceAccountToken: false
      restartPolicy: Never
      containers:
        - name: report
          image: __API_IMAGE__
          imagePullPolicy: IfNotPresent
          args:
            - --spring.main.web-application-type=none
            - --report.run=true
          env:
            - name: REPORT_JOB_ID
              valueFrom:
                fieldRef:
                  fieldPath: metadata.labels['batch.kubernetes.io/job-name']
            - name: REPORT_SOURCE
              value: MANUAL
            - name: REPORT_START_DATE
              value: "__START_DATE__"
            - name: REPORT_END_DATE
              value: "__END_DATE__"
            - name: SPRING_DATASOURCE_URL
              valueFrom:
                configMapKeyRef:
                  name: venue-config
                  key: SPRING_DATASOURCE_URL
            - name: SPRING_DATASOURCE_USERNAME
              valueFrom:
                secretKeyRef:
                  name: venue-db-credentials
                  key: POSTGRES_USER
            - name: SPRING_DATASOURCE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: venue-db-credentials
                  key: POSTGRES_PASSWORD
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
