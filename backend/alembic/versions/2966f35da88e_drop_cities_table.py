"""drop cities table — CountriesNow's city data is a raw locality gazetteer,
not an actual "cities" list, with no reliable way to filter it down; city
goes back to free text on customers, states stay FK-linked

Revision ID: 2966f35da88e
Revises: b0277f924f44
Create Date: 2026-09-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2966f35da88e'
down_revision: Union[str, None] = 'b0277f924f44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('fk_customers_customer_city_id', 'customers', type_='foreignkey')
    op.drop_column('customers', 'customer_city_id')
    op.add_column('customers', sa.Column('customer_city', sa.String(100), nullable=True))

    op.drop_constraint('fk_countries_capital_city_id', 'countries', type_='foreignkey')
    op.drop_column('countries', 'capital_city_id')

    op.drop_index('idx_cities_name', table_name='cities')
    op.drop_index('idx_cities_state_id', table_name='cities')
    op.drop_table('cities')


def downgrade() -> None:
    op.create_table(
        'cities',
        sa.Column('city_id', sa.Integer(), primary_key=True),
        sa.Column('state_id', sa.Integer(), sa.ForeignKey('states.state_id'), nullable=False),
        sa.Column('city_name', sa.String(150), nullable=False),
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

    op.drop_column('customers', 'customer_city')
    op.add_column('customers', sa.Column('customer_city_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_customers_customer_city_id', 'customers', 'cities',
        ['customer_city_id'], ['city_id'],
    )
