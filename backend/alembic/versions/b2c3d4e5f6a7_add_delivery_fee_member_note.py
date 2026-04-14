"""add delivery fee and member note

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-14
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('events', sa.Column('delivery_fee_minor', sa.Integer(), nullable=True))
    op.add_column('purchases', sa.Column('delivery_fee_applied', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('memberships', sa.Column('note', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column('memberships', 'note')
    op.drop_column('purchases', 'delivery_fee_applied')
    op.drop_column('events', 'delivery_fee_minor')
