"""add purchase invalidation and receipt

Revision ID: auto
Revises: 3967e02024f2
Create Date: 2026-04-14
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '3967e02024f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('purchases', sa.Column('invalidated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('purchases', sa.Column('invalidated_by', sa.UUID(), nullable=True))
    op.add_column('purchases', sa.Column('invalidation_reason', sqlmodel.sql.sqltypes.AutoString(), nullable=True))
    op.add_column('purchases', sa.Column('receipt_data', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('purchases', 'receipt_data')
    op.drop_column('purchases', 'invalidation_reason')
    op.drop_column('purchases', 'invalidated_by')
    op.drop_column('purchases', 'invalidated_at')
