"""Host system metrics via psutil — real numbers, not an up/down ping."""

import time
from datetime import datetime, timezone
from typing import Any

import psutil


def system_metrics() -> dict[str, Any]:
    load_1, load_5, load_15 = psutil.getloadavg()
    memory = psutil.virtual_memory()

    temperature: float | None = None
    try:
        sensors = psutil.sensors_temperatures()
        for preferred in ("coretemp", "cpu_thermal", "k10temp"):
            if preferred in sensors and sensors[preferred]:
                temperature = sensors[preferred][0].current
                break
        else:
            for readings in sensors.values():
                if readings:
                    temperature = readings[0].current
                    break
    except (AttributeError, OSError):
        pass

    disks = []
    for partition in psutil.disk_partitions(all=False):
        # Inside a container, docker bind-mounts (/etc/resolv.conf, …) appear
        # as partitions — only real filesystem roots are meaningful here.
        if partition.mountpoint.startswith(("/etc", "/dev", "/proc", "/sys")):
            continue
        try:
            usage = psutil.disk_usage(partition.mountpoint)
        except (PermissionError, OSError):
            continue
        disks.append(
            {
                "mount": partition.mountpoint,
                "total_bytes": usage.total,
                "used_bytes": usage.used,
                "usage_percent": usage.percent,
            }
        )

    return {
        "cpu": {
            "usage_percent": psutil.cpu_percent(interval=0.2),
            "load_avg_1m": load_1,
            "load_avg_5m": load_5,
            "load_avg_15m": load_15,
            "temperature_c": temperature,
        },
        "memory": {
            "total_bytes": memory.total,
            "used_bytes": memory.used,
            "usage_percent": memory.percent,
        },
        "disk": disks,
        "uptime_seconds": int(time.time() - psutil.boot_time()),
        "collected_at": datetime.now(timezone.utc).isoformat(),
    }
