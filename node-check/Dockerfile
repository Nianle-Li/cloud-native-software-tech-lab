FROM busybox:1.37.0

COPY check.sh /usr/local/bin/check.sh
USER 65534:65534
ENTRYPOINT ["sh", "/usr/local/bin/check.sh"]
