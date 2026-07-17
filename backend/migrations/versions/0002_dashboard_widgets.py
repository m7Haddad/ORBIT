"""dashboard widget layout persistence

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-17

Adds the per-user dashboard layout table referenced by
docs/specs/widget-contract.md §2 ("exactly what the layout table persists") —
flagged as missing from the Phase A schema during Stage 4 planning and approved
as an addition. One row per widget instance; `source` is the WidgetSource
discriminated union as JSONB.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE dashboard_widgets (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            widget_type    TEXT NOT NULL,
            source         JSONB NOT NULL,
            size           TEXT NOT NULL,
            position       INT NOT NULL DEFAULT 0,
            title_override TEXT,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX idx_dashboard_widgets_user
            ON dashboard_widgets (user_id, position);
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dashboard_widgets;")
