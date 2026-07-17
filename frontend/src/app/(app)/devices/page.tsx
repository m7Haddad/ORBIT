"use client";

/* Devices: list + manual registration (CLAUDE.md constraint #4 — deliberate,
 * form-driven, no discovery). Registration shows the one-time MQTT credentials
 * exactly once, with copy affordances. */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Cpu, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useDevicesDetailed, useRooms } from "@/lib/hooks";
import { useRealtime } from "@/lib/realtime";
import type { DeviceCreated } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Input, Select, formatRelative } from "@/components/ui/misc";

/* Capability presets from the Phase A catalog — a starting point; the form
 * allows removing/re-adding. Values mirror capability-catalog.md. */
const CATALOG = [
  { capability: "temperature", data_type: "float", unit: "°C", access: "read", label: "Temperature", config: { min: -40, max: 85, precision: 0.1 } },
  { capability: "humidity", data_type: "float", unit: "%", access: "read", label: "Humidity", config: { min: 0, max: 100, precision: 0.5 } },
  { capability: "power", data_type: "bool", unit: undefined, access: "read_write", label: "Power", config: {} },
  { capability: "motion", data_type: "bool", unit: undefined, access: "read", label: "Motion", config: { clear_after_s: 30 } },
  { capability: "contact", data_type: "bool", unit: undefined, access: "read", label: "Contact", config: { labels: { true: "Open", false: "Closed" } } },
  { capability: "energy_power", data_type: "float", unit: "W", access: "read", label: "Power Draw", config: { min: 0, precision: 0.1 } },
  { capability: "ir_command", data_type: "enum", unit: undefined, access: "write", label: "Remote", config: { values: ["power", "vol_up", "vol_down", "mute"] } },
  { capability: "ac_control", data_type: "json", unit: undefined, access: "read_write", label: "Climate", config: { schema: { mode: ["off", "cool", "heat", "fan", "dry"], setpoint_c: { min: 16, max: 30, step: 0.5 }, fan: ["auto", "low", "med", "high"] } } },
] as const;

export default function DevicesPage() {
  const { devices, loading } = useDevicesDetailed();
  const rooms = useRooms();
  const availability = useRealtime((state) => state.availability);
  const queryClient = useQueryClient();

  const [registering, setRegistering] = useState(false);
  const [created, setCreated] = useState<DeviceCreated | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function remove(deviceId: string) {
    await api.deleteDevice(deviceId);
    setConfirmDelete(null);
    void queryClient.invalidateQueries({ queryKey: ["devices"] });
    void queryClient.invalidateQueries({ queryKey: ["device", deviceId] });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-secondary">
          {devices.length} registered device{devices.length === 1 ? "" : "s"}
        </p>
        <Button variant="primary" size="sm" onClick={() => setRegistering(true)}>
          <Plus size={14} /> Register device
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="skeleton h-20 rounded-lg" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-subtle py-20 text-center">
          <Cpu size={26} className="mb-3 text-tertiary" />
          <p className="text-sm font-medium text-primary">No devices yet</p>
          <p className="mt-1 max-w-sm text-xs text-secondary">
            Registration is deliberate: create the device here, then flash the
            returned MQTT credentials onto the hardware.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => {
            const online = availability[device.id]?.online ?? device.is_online;
            const room = rooms.data?.data.find((entry) => entry.id === device.room_id);
            return (
              <div
                key={device.id}
                className="material rounded-lg border border-subtle p-4 shadow-tile"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-primary">
                        {device.name}
                      </h2>
                      <Badge tone={online ? "success" : "danger"}>
                        {online ? "online" : "offline"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-tertiary">
                      {device.type}
                      {room ? ` · ${room.name}` : " · unassigned"}
                      {` · seen ${formatRelative(availability[device.id]?.lastSeen ?? device.last_seen)}`}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {device.capabilities.map((capability) => (
                        <Badge key={capability.id} tone="neutral">
                          {capability.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    aria-label={`Delete ${device.name}`}
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirmDelete(device.id)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>

                {confirmDelete === device.id && (
                  <div className="mt-3 flex items-center justify-between rounded-md bg-danger-muted px-3 py-2">
                    <p className="text-xs text-danger">
                      Delete this device? Its broker credentials are revoked
                      immediately.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => void remove(device.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <RegisterDialog
        open={registering}
        onOpenChange={setRegistering}
        onCreated={(device) => {
          setCreated(device);
          void queryClient.invalidateQueries({ queryKey: ["devices"] });
        }}
      />
      {created && (
        <CredentialsDialog device={created} onClose={() => setCreated(null)} />
      )}
    </div>
  );
}

function RegisterDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (device: DeviceCreated) => void;
}) {
  const rooms = useRooms();
  const [name, setName] = useState("");
  const [type, setType] = useState("esp32-sensor");
  const [roomId, setRoomId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["temperature"]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const device = await api.registerDevice({
        name,
        type,
        room_id: roomId || null,
        capabilities: CATALOG.filter((entry) => selected.has(entry.capability)).map(
          (entry) => ({ ...entry, config: { ...entry.config } }),
        ),
      });
      onOpenChange(false);
      onCreated(device);
      setName("");
      setSelected(new Set(["temperature"]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Register device" wide>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">Name</label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Living Room Light"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary">Type</label>
              <Input
                value={type}
                onChange={(event) => setType(event.target.value)}
                placeholder="esp32-sensor"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary">Room</label>
            <Select value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              <option value="">Unassigned</option>
              {rooms.data?.data.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary">
              Capabilities
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATALOG.map((entry) => {
                const active = selected.has(entry.capability);
                return (
                  <button
                    key={entry.capability}
                    onClick={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (active) next.delete(entry.capability);
                        else next.add(entry.capability);
                        return next;
                      })
                    }
                    className={
                      active
                        ? "rounded-full bg-accent-muted px-3 py-1 text-xs font-medium text-accent"
                        : "rounded-full bg-surface-2 px-3 py-1 text-xs text-secondary hover:text-primary"
                    }
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </div>
          {error && (
            <p className="rounded-md bg-danger-muted px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            className="w-full"
            disabled={busy || !name.trim() || !type.trim() || selected.size === 0}
            onClick={() => void submit()}
          >
            {busy ? "Registering…" : "Register"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CredentialsDialog({
  device,
  onClose,
}: {
  device: DeviceCreated;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="MQTT credentials — shown once">
        <p className="mb-4 text-xs text-secondary">
          Flash these onto the device now. The password is stored only as a hash
          on the broker and cannot be shown again.
        </p>
        <div className="space-y-2.5">
          <CredentialRow label="Username / Client ID" value={device.mqtt_credentials.username} />
          <CredentialRow label="Password" value={device.mqtt_credentials.password} secret />
          <CredentialRow label="Topic prefix" value={device.mqtt_credentials.state_topic_prefix} />
          <CredentialRow label="Device ID" value={device.id} />
        </div>
        <Button variant="primary" className="mt-5 w-full" onClick={onClose}>
          I saved them
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function CredentialRow({
  label,
  value,
  secret,
}: {
  label: string;
  value: string;
  secret?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-subtle bg-surface-2 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-tertiary">
        {label}
      </p>
      <div className="mt-0.5 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-primary">
          {value}
        </code>
        <button
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-sm p-1 text-tertiary hover:bg-surface-1 hover:text-primary"
        >
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>
      </div>
      {secret && (
        <p className="mt-1 text-[10px] text-warning">
          Never committed to git — firmware config only.
        </p>
      )}
    </div>
  );
}
