package com.example.venuebooking.api;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Map;

@RestController
public class InstanceController {

    private final String podName;

    public InstanceController(@Value("${POD_NAME:}") String podName) {
        this.podName = podName;
    }

    @GetMapping("/api/instance")
    public Map<String, String> get() {
        return Map.of("instance_id", podName.isBlank() ? hostName() : podName);
    }

    private static String hostName() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (UnknownHostException exception) {
            String fallback = System.getenv("HOSTNAME");
            return fallback == null || fallback.isBlank() ? "local-instance" : fallback;
        }
    }
}
