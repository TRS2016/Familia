alter table kakebo_categories
  add column if not exists monthly_budget numeric check (monthly_budget > 0);
