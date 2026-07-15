"""Capability value validation + reading-column mapping.

Rules come from docs/specs/capability-catalog.md: a value written to or reported
by a capability must match its data_type and per-capability config (min/max for
numerics, values list for enums, config.schema for composite json like
ac_control). Readings land in exactly one column: value_numeric for
float/int/bool (bool as 0/1), value_text for string/enum, value_json for json.
"""

from typing import Any


class CapabilityValueError(ValueError):
    """Value does not conform to the capability's data_type/config."""


def validate_value(data_type: str, config: dict[str, Any], value: Any) -> Any:
    """Validate and normalise a value for a capability. Raises CapabilityValueError."""
    match data_type:
        case "bool":
            if isinstance(value, bool):
                return value
            raise CapabilityValueError("expected a boolean")
        case "int":
            if isinstance(value, bool) or not isinstance(value, int):
                raise CapabilityValueError("expected an integer")
            _check_range(config, value)
            return value
        case "float":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise CapabilityValueError("expected a number")
            value = float(value)
            _check_range(config, value)
            return value
        case "string":
            if not isinstance(value, str):
                raise CapabilityValueError("expected a string")
            return value
        case "enum":
            allowed = config.get("values", [])
            if not isinstance(value, str) or value not in allowed:
                raise CapabilityValueError(f"expected one of {allowed}")
            return value
        case "json":
            if not isinstance(value, dict):
                raise CapabilityValueError("expected an object")
            schema = config.get("schema")
            if schema:
                _check_json_schema(schema, value)
            return value
        case _:
            raise CapabilityValueError(f"unknown data_type {data_type!r}")


def _check_range(config: dict[str, Any], value: float) -> None:
    minimum, maximum = config.get("min"), config.get("max")
    if minimum is not None and value < minimum:
        raise CapabilityValueError(f"below minimum {minimum}")
    if maximum is not None and value > maximum:
        raise CapabilityValueError(f"above maximum {maximum}")


def _check_json_schema(schema: dict[str, Any], value: dict[str, Any]) -> None:
    """Catalog-style composite schema: each key maps to an allowed-values list
    or a {min, max, step} range (see ac_control in capability-catalog.md)."""
    unknown = set(value) - set(schema)
    if unknown:
        raise CapabilityValueError(f"unknown fields {sorted(unknown)}")
    for key, rule in schema.items():
        if key not in value:
            continue
        field = value[key]
        if isinstance(rule, list):
            if field not in rule:
                raise CapabilityValueError(f"{key}: expected one of {rule}")
        elif isinstance(rule, dict):
            if isinstance(field, bool) or not isinstance(field, (int, float)):
                raise CapabilityValueError(f"{key}: expected a number")
            _check_range(rule, field)


def to_reading_columns(data_type: str, value: Any) -> dict[str, Any]:
    """Map a validated value onto the capability_readings value columns."""
    if data_type in ("float", "int"):
        return {"value_numeric": float(value), "value_text": None, "value_json": None}
    if data_type == "bool":
        return {"value_numeric": 1.0 if value else 0.0, "value_text": None, "value_json": None}
    if data_type in ("string", "enum"):
        return {"value_numeric": None, "value_text": value, "value_json": None}
    return {"value_numeric": None, "value_text": None, "value_json": value}


def from_reading_columns(
    data_type: str,
    value_numeric: float | None,
    value_text: str | None,
    value_json: Any,
) -> Any:
    """Inverse of to_reading_columns — typed value for API responses."""
    if data_type == "bool":
        return None if value_numeric is None else bool(value_numeric)
    if data_type == "int":
        return None if value_numeric is None else int(value_numeric)
    if data_type == "float":
        return value_numeric
    if data_type in ("string", "enum"):
        return value_text
    return value_json
