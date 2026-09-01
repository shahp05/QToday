"""add states/cities tables, wire up countries.capital_city_id and customers city/state FKs

Revision ID: 6db6c8ec5b92
Revises: cb91a9b13bd0
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '6db6c8ec5b92'
down_revision: Union[str, None] = 'cb91a9b13bd0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'states',
        sa.Column('state_id', sa.Integer(), primary_key=True),
        sa.Column('country_id', sa.Integer(), sa.ForeignKey('countries.country_id'), nullable=False),
        sa.Column('state_name', sa.String(150), nullable=False),
        sa.Column('state_code', sa.String(10), nullable=True),
        sa.Column('date_created', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('date_modified', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('date_deleted', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )
    op.create_index('idx_states_country_id', 'states', ['country_id'])

    op.create_table(
        'cities',
        sa.Column('city_id', sa.Integer(), primary_key=True),
        sa.Column('state_id', sa.Integer(), sa.ForeignKey('states.state_id'), nullable=False),
        sa.Column('city_name', sa.String(150), nullable=False),
        # No external standard covers cities — generated at seed time
        # (services/geo_service.py), not sourced from CountriesNow.
        sa.Column('city_code', sa.String(3), nullable=False),
        sa.Column('date_created', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('date_modified', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('date_deleted', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )
    op.create_index('idx_cities_state_id', 'cities', ['state_id'])
    op.create_index('idx_cities_name', 'cities', ['city_name'])

    op.add_column('countries', sa.Column('capital_city_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_countries_capital_city_id', 'countries', 'cities',
        ['capital_city_id'], ['city_id'],
    )

    # Replace the old free-text city/state on customers — per explicit
    # instruction, existing free-text values are discarded, not migrated
    # (they wouldn't reliably match the new normalized tables anyway).
    op.drop_column('customers', 'customer_city')
    op.drop_column('customers', 'customer_state')
    op.add_column('customers', sa.Column('customer_city_id', sa.Integer(), nullable=True))
    op.add_column('customers', sa.Column('customer_state_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_customers_customer_city_id', 'customers', 'cities',
        ['customer_city_id'], ['city_id'],
    )
    op.create_foreign_key(
        'fk_customers_customer_state_id', 'customers', 'states',
        ['customer_state_id'], ['state_id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_customers_customer_state_id', 'customers', type_='foreignkey')
    op.drop_constraint('fk_customers_customer_city_id', 'customers', type_='foreignkey')
    op.drop_column('customers', 'customer_state_id')
    op.drop_column('customers', 'customer_city_id')
    op.add_column('customers', sa.Column('customer_city', sa.String(100), nullable=True))
    op.add_column('customers', sa.Column('customer_state', sa.String(100), nullable=True))

    op.drop_constraint('fk_countries_capital_city_id', 'countries', type_='foreignkey')
    op.drop_column('countries', 'capital_city_id')

    op.drop_index('idx_cities_name', table_name='cities')
    op.drop_index('idx_cities_state_id', table_name='cities')
    op.drop_table('cities')

    op.drop_index('idx_states_country_id', table_name='states')
    op.drop_table('states')
